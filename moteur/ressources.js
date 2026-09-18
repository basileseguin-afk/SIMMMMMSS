/* ==========================================================================
 *  Ressources — postes, tampons et niveaux
 *  --------------------------------------------------------------------------
 *  Conception transposée de SimPy (Copyright (c) 2013 Ontje Lünsdorf and
 *  Stefan Scherfke, licence MIT), fichiers `resources/base.py`,
 *  `resources/resource.py`, `resources/store.py`, `resources/container.py`.
 *  Aucune ligne n'est recopiée : SimPy est en Python, ceci est un script
 *  classique sans étape de construction.
 *
 *  C'EST CETTE ÉTAPE QUI FAIT APPARAÎTRE LES VRAIS GOULOTS.
 *
 *  `sim.js` répartit un budget d'homme-minutes : personne n'est jamais occupé,
 *  aucun tampon n'existe, donc un poste aval saturé ne fait jamais remonter la
 *  file. Ici, trois objets suffisent à retrouver ce comportement :
 *
 *    Ressource — un nombre entier de places. On la demande, on l'occupe, on la
 *                libère. Tant qu'on ne libère pas, la place n'est à personne
 *                d'autre. Une file d'attente, triée par priorité.
 *
 *    Tampon    — une contenance finie d'articles. `deposer` BLOQUE quand c'est
 *                plein : c'est là, et seulement là, que naît le blocage amont.
 *                `prendre` accepte un filtre, pour piocher le bon article.
 *
 *    Niveau    — une quantité continue : un stock, un encours en volume.
 *
 *  La gamme d'un produit s'écrit alors :
 *
 *      const place = poste.demander({ priorite: dossier.echeance });
 *      yield place;
 *      try {
 *        const article = yield tamponEntree.prendre();
 *        yield env.delai(dureeOperation);
 *        yield tamponSuivant.deposer(article);   // BLOQUE si l'aval est plein
 *      } finally {
 *        poste.liberer(place);                   // après le dépôt, jamais avant
 *      }
 *
 *  L'ordre des deux dernières lignes est tout le sujet : le poste reste occupé
 *  tant que l'aval n'a pas de place. Le blocage amont sort de cet ordre, pas
 *  d'une règle qu'on aurait écrite pour lui.
 *
 *  Écart assumé par rapport à SimPy : `liberer` agit immédiatement au lieu de
 *  produire un événement à attendre. On n'a jamais besoin d'attendre une
 *  libération, et un `yield` de plus serait un oubli de plus. La réservation,
 *  le dépôt et la prise restent des événements, eux.
 *
 *  Non traité volontairement : la préemption. Aucun besoin identifié, et elle
 *  coûterait cher en complexité.
 * ==========================================================================*/
(function (root, fabrique) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = fabrique(require('./noyau.js'), require('./mesure.js'));
  } else {
    if (!root.MoteurNoyau || !root.MoteurMesure) {
      throw new Error('moteur/ressources.js doit être chargé après moteur/noyau.js et moteur/mesure.js.');
    }
    root.MoteurRessources = fabrique(root.MoteurNoyau, root.MoteurMesure);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (noyau, mesure) {
  'use strict';

  const Evenement = noyau.Evenement;
  const Moniteur = mesure.Moniteur;

  /* ========================================================================
   *  1. OUTILS COMMUNS
   * ======================================================================*/

  function verifierCapacite(valeur, nom, entiere) {
    if (valeur === Infinity) {
      if (entiere) throw new RangeError(nom + ' doit être un entier fini.');
      return valeur;
    }
    if (typeof valeur !== 'number' || Number.isNaN(valeur) || valeur <= 0) {
      throw new RangeError(nom + ' doit être strictement positive (reçu : ' + String(valeur) + ').');
    }
    if (entiere && !Number.isInteger(valeur)) {
      throw new RangeError(nom + ' doit être un entier (reçu : ' + valeur + ').');
    }
    return valeur;
  }

  /** Retire les demandes abandonnées en tête de file avant tout traitement. */
  function purger(file) {
    let i = 0;
    while (i < file.length) {
      if (file[i].annule) file.splice(i, 1);
      else i++;
    }
  }

  /* ========================================================================
   *  2. RESSOURCE — un nombre entier de places
   * ======================================================================*/

  /** Demande de place. C'est un événement : il se résout quand la place est accordée. */
  class Demande extends Evenement {
    constructor(ressource, priorite, nom) {
      super(ressource.env, nom || ('demande ' + ressource.nom));
      this.ressource = ressource;
      this.priorite = priorite;
      this.instantDemande = ressource.env.maintenant;
      this.accordee = false;
    }
    /** Durée d'attente avant l'obtention de la place, ou null si non accordée. */
    get attente() { return this.accordee ? this.instantAccord - this.instantDemande : null; }
  }

  class Ressource {
    /**
     * @param env
     * @param capacite  nombre entier de places (postes, opérateurs, tunnels…)
     * @param options.nom
     */
    constructor(env, capacite, options) {
      const o = options || {};
      if (!env || typeof env.maintenant !== 'number') throw new TypeError('Ressource attend un environnement.');
      this.env = env;
      this.nom = o.nom || 'ressource';
      this.capacite = verifierCapacite(capacite === undefined ? 1 : capacite, 'La capacité d\'une ressource', true);

      this._occupees = [];   // demandes accordées
      this._file = [];       // demandes en attente, triées
      this._seq = 0;

      this.occupation = new Moniteur(env, { nom: this.nom + ' · places occupées', niveau: true, valeurInitiale: 0 });
      this.longueurFile = new Moniteur(env, { nom: this.nom + ' · file', niveau: true, valeurInitiale: 0 });
      this.attente = new Moniteur(env, { nom: this.nom + ' · attente', niveau: false });
    }

    /** Nombre de places actuellement occupées. */
    get occupees() { return this._occupees.length; }
    /** Nombre de places libres. */
    get libres() { return this.capacite - this._occupees.length; }
    /** Nombre de demandes en attente. */
    get enAttente() { return this._file.length; }

    /**
     * Demande une place. Le résultat est un événement à attendre.
     * `priorite` : plus petit passe d'abord. Passer l'échéance d'un dossier
     * donne naturellement la priorité au vol le plus urgent. À priorité égale,
     * l'ordre d'arrivée décide.
     */
    demander(options) {
      const o = options || {};
      const priorite = o.priorite === undefined ? 0 : o.priorite;
      if (typeof priorite !== 'number' || Number.isNaN(priorite)) {
        throw new TypeError('La priorité d\'une demande doit être un nombre.');
      }
      const d = new Demande(this, priorite, o.nom);
      d._seq = this._seq++;
      this._inserer(d);
      this.longueurFile.noter(this._file.length);
      this._traiterFile();
      return d;
    }

    /** Insertion triée : (priorité, instant de la demande, rang de création). */
    _inserer(d) {
      let i = this._file.length;
      while (i > 0) {
        const p = this._file[i - 1];
        const apres = p.priorite < d.priorite ||
          (p.priorite === d.priorite && p.instantDemande < d.instantDemande) ||
          (p.priorite === d.priorite && p.instantDemande === d.instantDemande && p._seq < d._seq);
        if (apres) break;
        i--;
      }
      this._file.splice(i, 0, d);
    }

    _traiterFile() {
      purger(this._file);
      let bouge = false;
      while (this._file.length > 0 && this._occupees.length < this.capacite) {
        const d = this._file.shift();
        d.accordee = true;
        d.instantAccord = this.env.maintenant;
        this._occupees.push(d);
        this.attente.noter(d.instantAccord - d.instantDemande);
        d.reussir(this);
        bouge = true;
      }
      if (bouge) {
        this.occupation.noter(this._occupees.length);
        this.longueurFile.noter(this._file.length);
      }
    }

    /**
     * Libère une place, ou retire une demande restée en attente.
     *
     * Le second cas est l'abandon : le processus n'attend plus cette demande
     * (il attendait `unDe([demande, autreChose])` et autre chose est arrivé).
     * Ne jamais abandonner une demande qu'un processus attend encore : il ne
     * serait jamais réveillé.
     *
     * @returns true si une place a été libérée, false si c'était un abandon.
     */
    liberer(demande) {
      if (!(demande instanceof Demande) || demande.ressource !== this) {
        throw new TypeError('liberer attend une demande émise par cette ressource (' + this.nom + ').');
      }
      const i = this._occupees.indexOf(demande);
      if (i !== -1) {
        this._occupees.splice(i, 1);
        demande.accordee = false;
        this.occupation.noter(this._occupees.length);
        this._traiterFile();
        return true;
      }
      const j = this._file.indexOf(demande);
      if (j !== -1) {
        this._file.splice(j, 1);
        if (!demande.declenche) demande.annuler();
        this.longueurFile.noter(this._file.length);
        return false;
      }
      return false;   // déjà libérée : sans effet, pour rendre `finally` sûr
    }

    /**
     * Taux d'occupation MESURÉ : intégrale des places occupées divisée par la
     * durée et par la capacité. Pas un lissage, pas de plancher.
     */
    tauxOccupation() {
      const m = this.occupation.moyenne();
      return m === null ? null : m / this.capacite;
    }

    resume() {
      return {
        nom: this.nom, capacite: this.capacite,
        occupees: this.occupees, enAttente: this.enAttente,
        tauxOccupation: this.tauxOccupation(),
        fileMoyenne: this.longueurFile.moyenne(),
        attenteMoyenne: this.attente.moyenne(),
        attenteP90: this.attente.percentile(90)
      };
    }
  }

  /* ========================================================================
   *  3. TAMPON — une contenance finie d'articles
   * ======================================================================*/

  class Depot extends Evenement {
    constructor(tampon, article) {
      super(tampon.env, 'dépôt ' + tampon.nom);
      this.tampon = tampon;
      this.article = article;
      this.instantDemande = tampon.env.maintenant;
    }
  }

  class Prise extends Evenement {
    constructor(tampon, filtre) {
      super(tampon.env, 'prise ' + tampon.nom);
      this.tampon = tampon;
      this.filtre = filtre || null;
      this.instantDemande = tampon.env.maintenant;
    }
  }

  class Tampon {
    /**
     * @param options.capacite  contenance (défaut : illimitée)
     * @param options.articles  contenu initial
     */
    constructor(env, options) {
      const o = options || {};
      if (!env || typeof env.maintenant !== 'number') throw new TypeError('Tampon attend un environnement.');
      this.env = env;
      this.nom = o.nom || 'tampon';
      this.capacite = verifierCapacite(o.capacite === undefined ? Infinity : o.capacite, 'La capacité d\'un tampon', false);

      this._articles = o.articles ? Array.from(o.articles) : [];
      if (this._articles.length > this.capacite) {
        throw new RangeError('Contenu initial supérieur à la capacité du tampon ' + this.nom + '.');
      }
      this._fileDepot = [];
      this._filePrise = [];

      this.remplissage = new Moniteur(env, { nom: this.nom + ' · remplissage', niveau: true, valeurInitiale: this._articles.length });
      this.blocage = new Moniteur(env, { nom: this.nom + ' · blocage amont', niveau: true, valeurInitiale: 0 });
      this.attenteDepot = new Moniteur(env, { nom: this.nom + ' · attente de dépôt', niveau: false });
      this.attentePrise = new Moniteur(env, { nom: this.nom + ' · attente de prise', niveau: false });
    }

    /** Copie du contenu. Le tableau interne n'est jamais exposé. */
    get articles() { return this._articles.slice(); }
    get remplissageCourant() { return this._articles.length; }
    get place() { return this.capacite - this._articles.length; }
    get plein() { return this._articles.length >= this.capacite; }
    get vide() { return this._articles.length === 0; }
    /** Vrai quand au moins un dépôt attend : l'amont est en train d'être bloqué. */
    get bloque() { return this._fileDepot.length > 0; }
    get depotsEnAttente() { return this._fileDepot.length; }
    get prisesEnAttente() { return this._filePrise.length; }

    /**
     * Dépose un article. L'événement rendu ne se résout QUE lorsque l'article
     * a trouvé sa place : c'est ici que l'amont se bloque.
     */
    deposer(article) {
      if (article === undefined) throw new TypeError('deposer attend un article (undefined refusé).');
      const d = new Depot(this, article);
      this._fileDepot.push(d);
      // Le traitement des prises est déclenché par la RÉSOLUTION du dépôt,
      // pas par son enregistrement : on évite ainsi toute réentrance entre les
      // deux files. Même mécanisme que SimPy.
      d.surResolution(() => this._traiterFilePrise());
      this._traiterFileDepot();
      return d;
    }

    /**
     * Prend un article, éventuellement le premier qui satisfait `filtre`.
     * La valeur de l'événement est l'article.
     */
    prendre(filtre) {
      if (filtre !== undefined && filtre !== null && typeof filtre !== 'function') {
        throw new TypeError('Le filtre de prendre doit être une fonction.');
      }
      const p = new Prise(this, filtre);
      this._filePrise.push(p);
      p.surResolution(() => this._traiterFileDepot());
      this._traiterFilePrise();
      return p;
    }

    _noterBlocage() { this.blocage.noter(this._fileDepot.length > 0 ? 1 : 0); }

    _traiterFileDepot() {
      purger(this._fileDepot);
      let bouge = false;
      while (this._fileDepot.length > 0) {
        if (this._articles.length >= this.capacite) break;   // plein : blocage amont
        const d = this._fileDepot.shift();
        this._articles.push(d.article);
        this.attenteDepot.noter(this.env.maintenant - d.instantDemande);
        d.reussir(this);
        bouge = true;
      }
      if (bouge) this.remplissage.noter(this._articles.length);
      this._noterBlocage();
    }

    _traiterFilePrise() {
      purger(this._filePrise);
      let bouge = false, i = 0;
      while (i < this._filePrise.length) {
        if (this._articles.length === 0) break;
        const p = this._filePrise[i];
        const idx = p.filtre ? this._articles.findIndex(p.filtre) : 0;
        if (idx === -1) {
          // Aucun article ne convient à CETTE demande, mais la suivante a un
          // autre filtre : on continue de parcourir la file au lieu de la
          // bloquer. C'est ce qui distingue un tampon filtré d'une simple file.
          i++;
          continue;
        }
        const article = this._articles.splice(idx, 1)[0];
        this._filePrise.splice(i, 1);
        this.attentePrise.noter(this.env.maintenant - p.instantDemande);
        p.reussir(article);
        bouge = true;
      }
      if (bouge) this.remplissage.noter(this._articles.length);
      this._noterBlocage();
    }

    /** Retire un dépôt ou une prise resté en attente. Voir Ressource.liberer. */
    abandonner(evenement) {
      for (const file of [this._fileDepot, this._filePrise]) {
        const i = file.indexOf(evenement);
        if (i !== -1) {
          file.splice(i, 1);
          if (!evenement.declenche) evenement.annuler();
          this._noterBlocage();
          return true;
        }
      }
      return false;
    }

    /** Part du temps pendant laquelle ce tampon a bloqué son amont, entre 0 et 1. */
    partBloquante() { return this.blocage.moyenne(); }

    resume() {
      return {
        nom: this.nom, capacite: this.capacite,
        remplissage: this._articles.length,
        remplissageMoyen: this.remplissage.moyenne(),
        depotsEnAttente: this._fileDepot.length,
        prisesEnAttente: this._filePrise.length,
        partBloquante: this.partBloquante(),
        attenteDepotMoyenne: this.attenteDepot.moyenne(),
        attentePriseMoyenne: this.attentePrise.moyenne()
      };
    }
  }

  /* ========================================================================
   *  4. NIVEAU — une quantité continue
   * ======================================================================*/

  class Mouvement extends Evenement {
    constructor(niveau, quantite, sens) {
      super(niveau.env, sens + ' ' + niveau.nom);
      this.reservoir = niveau;
      this.quantite = quantite;
      this.instantDemande = niveau.env.maintenant;
    }
  }

  class Niveau {
    /**
     * @param options.capacite  plafond (défaut : illimité)
     * @param options.initial   niveau de départ
     */
    constructor(env, options) {
      const o = options || {};
      if (!env || typeof env.maintenant !== 'number') throw new TypeError('Niveau attend un environnement.');
      this.env = env;
      this.nom = o.nom || 'niveau';
      this.capacite = verifierCapacite(o.capacite === undefined ? Infinity : o.capacite, 'La capacité d\'un niveau', false);
      const initial = o.initial === undefined ? 0 : o.initial;
      if (typeof initial !== 'number' || Number.isNaN(initial) || initial < 0 || initial > this.capacite) {
        throw new RangeError('Niveau initial hors des bornes pour ' + this.nom + '.');
      }
      this._niveau = initial;
      this._fileAjout = [];
      this._fileRetrait = [];

      this.mesure = new Moniteur(env, { nom: this.nom, niveau: true, valeurInitiale: initial });
      this.rupture = new Moniteur(env, { nom: this.nom + ' · rupture', niveau: true, valeurInitiale: 0 });
    }

    get niveau() { return this._niveau; }
    get place() { return this.capacite - this._niveau; }

    _verifier(q) {
      if (typeof q !== 'number' || Number.isNaN(q) || q <= 0) {
        throw new RangeError('La quantité doit être strictement positive (reçu : ' + String(q) + ').');
      }
      if (q > this.capacite) {
        throw new RangeError('Quantité (' + q + ') supérieure à la capacité de ' + this.nom + ' : elle ne pourra jamais être satisfaite.');
      }
      return q;
    }

    ajouter(quantite) {
      const m = new Mouvement(this, this._verifier(quantite), 'ajout');
      this._fileAjout.push(m);
      m.surResolution(() => this._traiterRetraits());
      this._traiterAjouts();
      return m;
    }

    retirer(quantite) {
      const m = new Mouvement(this, this._verifier(quantite), 'retrait');
      this._fileRetrait.push(m);
      m.surResolution(() => this._traiterAjouts());
      this._traiterRetraits();
      return m;
    }

    _noter() {
      this.mesure.noter(this._niveau);
      this.rupture.noter(this._fileRetrait.length > 0 ? 1 : 0);
    }

    _traiterAjouts() {
      purger(this._fileAjout);
      while (this._fileAjout.length > 0) {
        const m = this._fileAjout[0];
        if (this._niveau + m.quantite > this.capacite) break;   // plafond atteint
        this._fileAjout.shift();
        this._niveau += m.quantite;
        m.reussir(this);
      }
      this._noter();
    }

    _traiterRetraits() {
      purger(this._fileRetrait);
      while (this._fileRetrait.length > 0) {
        const m = this._fileRetrait[0];
        if (m.quantite > this._niveau) break;                   // stock insuffisant
        this._fileRetrait.shift();
        this._niveau -= m.quantite;
        m.reussir(this);
      }
      this._noter();
    }

    /** Retire un mouvement resté en attente. Voir Ressource.liberer. */
    abandonner(evenement) {
      for (const file of [this._fileAjout, this._fileRetrait]) {
        const i = file.indexOf(evenement);
        if (i !== -1) {
          file.splice(i, 1);
          if (!evenement.declenche) evenement.annuler();
          this._noter();
          return true;
        }
      }
      return false;
    }

    /** Part du temps pendant laquelle un retrait a attendu, entre 0 et 1. */
    partEnRupture() { return this.rupture.moyenne(); }

    resume() {
      return {
        nom: this.nom, capacite: this.capacite, niveau: this._niveau,
        niveauMoyen: this.mesure.moyenne(),
        minimum: this.mesure.minimum, maximum: this.mesure.maximum,
        partEnRupture: this.partEnRupture(),
        retraitsEnAttente: this._fileRetrait.length,
        ajoutsEnAttente: this._fileAjout.length
      };
    }
  }

  return { Ressource, Demande, Tampon, Depot, Prise, Niveau, Mouvement };
});

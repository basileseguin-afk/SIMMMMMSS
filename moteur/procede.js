/* ==========================================================================
 *  Procédé — la gamme décrite en données, plus son chargeur
 *  --------------------------------------------------------------------------
 *  Forme du fichier d'entrée inspirée de ProdSim (Copyright (c) 2021 Tom Fuchs,
 *  licence MIT) : des postes, des produits, et pour chaque produit des LISTES
 *  ALIGNÉES décrivant sa gamme, une case par étape.
 *
 *      poste      : ["decontamination", "prepa"]
 *      operation  : [["n", 0.6, 0.1], ["f", 1.2]]     durées, en minutes
 *      quantite   : [1, 6]                            taille du lot
 *      composants : [[], [{ produit: "plat", quantite: 1 }]]
 *
 *  L'invariant « même longueur » se vérifie au chargement : c'est un contrôle
 *  de cohérence gratuit, et c'est lui qui rend la gamme lisible.
 *
 *  Deux écarts assumés par rapport à ProdSim :
 *
 *    - ProdSim surcharge un unique champ `demand`, tantôt taille de lot,
 *      tantôt quantités de composants. Ici les deux sont séparés : `quantite`
 *      est la taille du lot, `composants` la nomenclature. Une liste nommée
 *      vaut mieux qu'une position à deviner.
 *    - La validation rassemble TOUTES les erreurs avant de refuser le fichier,
 *      comme l'import CSV de l'interface. Corriger un procédé une erreur à la
 *      fois est une perte de temps.
 *
 *  CONFIDENTIALITÉ. `moteur/procede-exemple.json` est FICTIF et publiable.
 *  Le procédé réel de l'unité se travaille dans `prive/`, que `.gitignore`
 *  bloque, comme le plan et les exports de vols.
 * ==========================================================================*/
(function (root, fabrique) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = fabrique(require('./noyau.js'), require('./mesure.js'), require('./ressources.js'));
  } else {
    if (!root.MoteurNoyau || !root.MoteurMesure || !root.MoteurRessources) {
      throw new Error('moteur/procede.js doit être chargé après noyau.js, mesure.js et ressources.js.');
    }
    root.MoteurProcede = fabrique(root.MoteurNoyau, root.MoteurMesure, root.MoteurRessources);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (noyau, mesure, ressources) {
  'use strict';

  const Environnement = noyau.Environnement;
  const Moniteur = mesure.Moniteur;
  const Ressource = ressources.Ressource;
  const Tampon = ressources.Tampon;

  /* ========================================================================
   *  1. TIRAGES REPRODUCTIBLES
   * ======================================================================*/

  const LOIS = {
    f: { arite: 1, nom: 'valeur fixe' },
    u: { arite: 2, nom: 'loi uniforme' },
    n: { arite: 2, nom: 'loi normale' },
    e: { arite: 1, nom: 'loi exponentielle' }
  };

  /**
   * Générateur pseudo-aléatoire à graine (mulberry32). Une même graine donne
   * exactement la même simulation : sans cela, comparer deux scénarios ne
   * voudrait rien dire, l'écart pouvant venir du hasard.
   */
  class Aleas {
    constructor(graine) {
      this.graine = (graine === undefined ? 1 : graine) >>> 0;
      this._etat = this.graine;
    }
    reinitialiser() { this._etat = this.graine; return this; }
    uniforme() {
      this._etat = (this._etat + 0x6D2B79F5) >>> 0;
      let t = Math.imul(this._etat ^ (this._etat >>> 15), 1 | this._etat);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    /**
     * Tire une valeur selon une loi écrite `["f", x]`, `["u", min, max]`,
     * `["n", moyenne, ecart]` ou `["e", moyenne]`.
     *
     * Les durées ne peuvent pas être négatives : un tirage normal négatif est
     * rejoué jusqu'à vingt fois, puis ramené à zéro. Cela biaise légèrement la
     * moyenne quand l'écart-type approche la moyenne — un avertissement de
     * validation le signale plutôt que de le laisser passer sous silence.
     */
    tirer(loi) {
      const code = loi[0];
      switch (code) {
        case 'f': return loi[1];
        case 'u': return loi[1] + (loi[2] - loi[1]) * this.uniforme();
        case 'e': return -loi[1] * Math.log(1 - this.uniforme());
        case 'n': {
          for (let i = 0; i < 20; i++) {
            const u1 = Math.max(this.uniforme(), 1e-12), u2 = this.uniforme();
            const v = loi[1] + loi[2] * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
            if (v >= 0) return v;
          }
          return 0;
        }
        default: throw new Error('Loi inconnue : ' + String(code));
      }
    }
  }

  /* ========================================================================
   *  2. VALIDATION
   * ======================================================================*/

  function estObjet(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  function verifierLoi(loi, ou, erreurs, avertissements) {
    if (!Array.isArray(loi) || loi.length === 0) {
      erreurs.push(ou + ' : loi attendue sous la forme ["f", x] ou ["n", moyenne, ecart].');
      return;
    }
    const def = LOIS[loi[0]];
    if (!def) {
      erreurs.push(ou + ' : loi « ' + String(loi[0]) + ' » inconnue (attendu f, u, n ou e).');
      return;
    }
    if (loi.length !== def.arite + 1) {
      erreurs.push(ou + ' : ' + def.nom + ' attend ' + def.arite + ' paramètre(s), ' + (loi.length - 1) + ' reçu(s).');
      return;
    }
    for (let i = 1; i < loi.length; i++) {
      if (typeof loi[i] !== 'number' || !isFinite(loi[i])) {
        erreurs.push(ou + ' : paramètre ' + i + ' non numérique.');
        return;
      }
    }
    if (loi[0] === 'f' && loi[1] < 0) erreurs.push(ou + ' : durée négative.');
    if (loi[0] === 'u' && loi[1] > loi[2]) erreurs.push(ou + ' : borne minimale supérieure à la borne maximale.');
    if (loi[0] === 'u' && loi[1] < 0) erreurs.push(ou + ' : borne minimale négative.');
    if (loi[0] === 'e' && loi[1] <= 0) erreurs.push(ou + ' : moyenne devant être strictement positive.');
    if (loi[0] === 'n') {
      if (loi[1] < 0) erreurs.push(ou + ' : moyenne négative.');
      if (loi[2] < 0) erreurs.push(ou + ' : écart-type négatif.');
      else if (loi[2] > loi[1] / 2) {
        avertissements.push(ou + ' : écart-type (' + loi[2] + ') supérieur à la moitié de la moyenne (' +
          loi[1] + '). Les tirages négatifs seront ramenés à zéro, ce qui relève légèrement la moyenne réelle.');
      }
    }
  }

  /**
   * Contrôle le fichier de procédé et rassemble TOUTES les anomalies.
   * @returns { erreurs: string[], avertissements: string[] }
   */
  function validerProcede(donnees) {
    const erreurs = [], avertissements = [];
    if (!estObjet(donnees)) return { erreurs: ['Le procédé doit être un objet JSON.'], avertissements };
    if (!Array.isArray(donnees.postes) || donnees.postes.length === 0) erreurs.push('`postes` doit être une liste non vide.');
    if (!Array.isArray(donnees.produits) || donnees.produits.length === 0) erreurs.push('`produits` doit être une liste non vide.');
    if (erreurs.length) return { erreurs, avertissements };

    /* ---- postes ---- */
    const postes = new Map();
    donnees.postes.forEach((p, i) => {
      const ou = 'Poste ' + (p && p.nom ? '« ' + p.nom + ' »' : '#' + (i + 1));
      if (!estObjet(p) || typeof p.nom !== 'string' || !p.nom) { erreurs.push(ou + ' : `nom` obligatoire.'); return; }
      if (postes.has(p.nom)) { erreurs.push(ou + ' : nom en double.'); return; }
      const cap = p.capacite === undefined ? 1 : p.capacite;
      if (!Number.isInteger(cap) || cap < 1) erreurs.push(ou + ' : `capacite` doit être un entier ≥ 1.');
      const tampon = p.tampon === undefined ? Infinity : p.tampon;
      if (tampon !== Infinity && (!Number.isInteger(tampon) || tampon < 1)) {
        erreurs.push(ou + ' : `tampon` doit être un entier ≥ 1, ou absent pour une contenance illimitée.');
      }
      postes.set(p.nom, { nom: p.nom, capacite: cap, tampon: tampon });
    });

    /* ---- produits ---- */
    const produits = new Map();
    donnees.produits.forEach((pr, i) => {
      const ou = 'Produit ' + (pr && pr.nom ? '« ' + pr.nom + ' »' : '#' + (i + 1));
      if (!estObjet(pr) || typeof pr.nom !== 'string' || !pr.nom) { erreurs.push(ou + ' : `nom` obligatoire.'); return; }
      if (produits.has(pr.nom)) { erreurs.push(ou + ' : nom en double.'); return; }
      produits.set(pr.nom, pr);
    });
    // On ne s'arrête QUE si plus rien n'est exploitable. Une anomalie sur un
    // poste ne doit pas masquer celles des gammes : le fichier se corrige en
    // une fois, pas en autant de passes qu'il contient de fautes.
    if (postes.size === 0 || produits.size === 0) {
      if (postes.size === 0) erreurs.push('Aucun poste exploitable : impossible de contrôler les gammes.');
      if (produits.size === 0) erreurs.push('Aucun produit exploitable.');
      return { erreurs, avertissements };
    }

    const consommes = new Set();

    produits.forEach((pr, nom) => {
      const ou = 'Produit « ' + nom + ' »';
      const gamme = Array.isArray(pr.poste) ? pr.poste : [];
      const n = gamme.length;

      /* listes alignées : l'invariant qui rend la gamme lisible */
      for (const champ of ['operation', 'quantite', 'composants']) {
        const v = pr[champ];
        if (v === undefined) {
          if (champ === 'operation' && n > 0) erreurs.push(ou + ' : `operation` obligatoire dès qu\'il y a une gamme.');
          continue;
        }
        if (!Array.isArray(v)) { erreurs.push(ou + ' : `' + champ + '` doit être une liste.'); continue; }
        if (v.length !== n) {
          erreurs.push(ou + ' : `' + champ + '` a ' + v.length + ' case(s) pour ' + n +
            ' étape(s). Les listes de la gamme doivent avoir la même longueur.');
        }
      }

      gamme.forEach((nomPoste, k) => {
        const oue = ou + ', étape ' + (k + 1);
        // Un poste inconnu est signalé, mais ne dispense pas de contrôler le
        // reste de l'étape : même raison qu'au-dessus.
        if (!postes.has(nomPoste)) erreurs.push(oue + ' : poste « ' + String(nomPoste) + ' » inconnu.');
        const poste = postes.get(nomPoste);

        if (Array.isArray(pr.operation) && pr.operation[k] !== undefined) {
          verifierLoi(pr.operation[k], oue + ' (durée)', erreurs, avertissements);
        }

        const lot = Array.isArray(pr.quantite) && pr.quantite[k] !== undefined ? pr.quantite[k] : 1;
        if (!Number.isInteger(lot) || lot < 1) {
          erreurs.push(oue + ' : `quantite` doit être un entier ≥ 1.');
        } else if (poste && lot > poste.tampon) {
          // Un lot ne peut pas se constituer dans un tampon plus petit que lui :
          // les unités s'y accumuleraient sans jamais atteindre le compte.
          erreurs.push(oue + ' : lot de ' + lot + ' impossible, le tampon du poste « ' + nomPoste +
            ' » ne contient que ' + poste.tampon + ' unité(s). Blocage garanti.');
        }

        const comps = Array.isArray(pr.composants) && pr.composants[k] !== undefined ? pr.composants[k] : [];
        if (!Array.isArray(comps)) { erreurs.push(oue + ' : `composants` doit être une liste.'); return; }
        comps.forEach(c => {
          if (!estObjet(c) || typeof c.produit !== 'string') {
            erreurs.push(oue + ' : chaque composant s\'écrit { "produit": "...", "quantite": n }.');
            return;
          }
          if (!produits.has(c.produit)) { erreurs.push(oue + ' : composant « ' + c.produit + ' » inconnu.'); return; }
          if (c.produit === nom) { erreurs.push(oue + ' : un produit ne peut pas se consommer lui-même.'); return; }
          const q = c.quantite === undefined ? 1 : c.quantite;
          if (!Number.isInteger(q) || q < 1) erreurs.push(oue + ' : quantité de « ' + c.produit + ' » doit être un entier ≥ 1.');
          consommes.add(c.produit);
        });
      });

      /* source */
      if (pr.source !== undefined) {
        if (!estObjet(pr.source)) erreurs.push(ou + ' : `source` doit être un objet.');
        else if (pr.source.calendrier !== undefined) {
          if (!Array.isArray(pr.source.calendrier) || pr.source.calendrier.length === 0) {
            erreurs.push(ou + ' : `source.calendrier` doit être une liste non vide.');
          } else {
            pr.source.calendrier.forEach((e, j) => {
              if (!estObjet(e) || typeof e.instant !== 'number' || !isFinite(e.instant) || e.instant < 0) {
                erreurs.push(ou + ' : calendrier #' + (j + 1) + ' : `instant` doit être un nombre ≥ 0.');
              }
              const q = e && e.quantite === undefined ? 1 : (e || {}).quantite;
              if (!Number.isInteger(q) || q < 1) erreurs.push(ou + ' : calendrier #' + (j + 1) + ' : `quantite` doit être un entier ≥ 1.');
            });
          }
        } else if (pr.source.loi !== undefined) {
          verifierLoi(pr.source.loi, ou + ' (intervalle entre arrivées)', erreurs, avertissements);
          for (const champ of ['debut', 'fin']) {
            if (pr.source[champ] !== undefined && (typeof pr.source[champ] !== 'number' || !isFinite(pr.source[champ]))) {
              erreurs.push(ou + ' : `source.' + champ + '` doit être un nombre.');
            }
          }
          if (pr.source.max !== undefined && (!Number.isInteger(pr.source.max) || pr.source.max < 1)) {
            erreurs.push(ou + ' : `source.max` doit être un entier ≥ 1.');
          }
        } else {
          erreurs.push(ou + ' : `source` doit porter `loi` (arrivées régulières) ou `calendrier` (instants explicites).');
        }
      }

      if (pr.stock !== undefined && pr.stock !== null) {
        if (!Number.isInteger(pr.stock) || pr.stock < 1) erreurs.push(ou + ' : `stock` doit être un entier ≥ 1.');
      }
      if (pr.priorite !== undefined && (typeof pr.priorite !== 'number' || Number.isNaN(pr.priorite))) {
        erreurs.push(ou + ' : `priorite` doit être un nombre.');
      }
      if (n === 0 && pr.source === undefined) {
        erreurs.push(ou + ' : sans gamme ni source, ce produit ne peut ni être créé ni être fabriqué.');
      }
    });

    /* Un composant doit pouvoir exister : source, ou gamme qui le produit. */
    consommes.forEach(nom => {
      const pr = produits.get(nom);
      if (!pr) return;
      const aGamme = Array.isArray(pr.poste) && pr.poste.length > 0;
      if (!aGamme && pr.source === undefined) {
        erreurs.push('Produit « ' + nom + ' » : consommé comme composant mais ni source ni gamme ne le produit.');
      }
    });

    if (donnees.horizon !== undefined && (typeof donnees.horizon !== 'number' || !(donnees.horizon > 0))) {
      erreurs.push('`horizon` doit être un nombre strictement positif.');
    }
    return { erreurs, avertissements };
  }

  /* ========================================================================
   *  3. PROCÉDÉ
   * ======================================================================*/

  class Procede {
    /** @throws Error listant toutes les anomalies si le procédé est invalide. */
    constructor(donnees) {
      const { erreurs, avertissements } = validerProcede(donnees);
      if (erreurs.length) {
        throw new Error('Procédé refusé, ' + erreurs.length + ' anomalie(s) :\n  · ' + erreurs.join('\n  · '));
      }
      this.donnees = donnees;
      this.nom = donnees.nom || 'procédé sans nom';
      this.avertissements = avertissements;

      this.postes = new Map();
      donnees.postes.forEach(p => this.postes.set(p.nom, {
        nom: p.nom,
        capacite: p.capacite === undefined ? 1 : p.capacite,
        tampon: p.tampon === undefined ? Infinity : p.tampon
      }));

      this.produits = new Map();
      const consommes = new Set();
      donnees.produits.forEach(pr => {
        const gamme = Array.isArray(pr.poste) ? pr.poste.slice() : [];
        const comps = gamme.map((_, k) => {
          const l = (Array.isArray(pr.composants) && pr.composants[k]) || [];
          return l.map(c => ({ produit: c.produit, quantite: c.quantite === undefined ? 1 : c.quantite }));
        });
        comps.forEach(l => l.forEach(c => consommes.add(c.produit)));
        this.produits.set(pr.nom, {
          nom: pr.nom,
          priorite: pr.priorite === undefined ? 0 : pr.priorite,
          stock: pr.stock === undefined ? Infinity : pr.stock,
          source: pr.source || null,
          poste: gamme,
          operation: gamme.map((_, k) => pr.operation[k]),
          quantite: gamme.map((_, k) => (Array.isArray(pr.quantite) && pr.quantite[k] !== undefined) ? pr.quantite[k] : 1),
          composants: comps
        });
      });
      // Un produit que personne ne consomme est un produit fini : il quitte le
      // système au bout de sa gamme au lieu de remplir un stock pour rien.
      this.produits.forEach(pr => { pr.fini = !consommes.has(pr.nom) && pr.poste.length > 0; });
    }

    /** Liste des produits finis, dans l'ordre de déclaration. */
    get produitsFinis() { return Array.from(this.produits.values()).filter(p => p.fini).map(p => p.nom); }

    /**
     * Construit et exécute la simulation.
     * @param options.horizon  durée simulée (défaut : `horizon` du fichier, sinon 480)
     * @param options.graine   graine des tirages (défaut : celle du fichier, sinon 1)
     * @returns les résultats mesurés, voir `resultats()`.
     */
    simuler(options) {
      const o = options || {};
      const horizon = o.horizon === undefined ? (this.donnees.horizon === undefined ? 480 : this.donnees.horizon) : o.horizon;
      if (!(horizon > 0)) throw new RangeError('Horizon invalide : ' + String(horizon));
      const graine = o.graine === undefined ? (this.donnees.graine === undefined ? 1 : this.donnees.graine) : o.graine;

      const env = new Environnement(0);
      const aleas = new Aleas(graine);
      const postes = new Map();
      this.postes.forEach(p => postes.set(p.nom, {
        def: p,
        ressource: new Ressource(env, p.capacite, { nom: p.nom }),
        tampon: new Tampon(env, { nom: p.nom + ' · entrée', capacite: p.tampon })
      }));
      const stocks = new Map();
      this.produits.forEach(pr => stocks.set(pr.nom, new Tampon(env, { nom: pr.nom + ' · stock', capacite: pr.stock })));

      const compteurs = new Map();   // (produit, étape) -> unités en attente de lot
      const suivi = new Map();       // (produit) -> { crees, finis, traversee }
      this.produits.forEach(pr => {
        compteurs.set(pr.nom, pr.poste.map(() => 0));
        suivi.set(pr.nom, {
          crees: 0, finis: 0,
          traversee: new Moniteur(env, { nom: pr.nom + ' · traversée' })
        });
      });

      let numero = 0;
      const creer = pr => ({ id: ++numero, produit: pr.nom, naissance: env.maintenant, composants: [] });

      /**
       * Une unité est disponible à l'entrée de l'étape k. On ne lance le
       * travail que lorsque le lot est complet : sans ce compteur, autant de
       * processus que d'unités réclameraient chacun un lot entier et se
       * bloqueraient mutuellement. Même mécanisme que ProdSim.
       */
      const annoncer = (pr, k) => {
        const c = compteurs.get(pr.nom);
        c[k] += 1;
        if (c[k] >= pr.quantite[k]) { c[k] -= pr.quantite[k]; env.processus(etape(pr, k), pr.nom + ' étape ' + (k + 1)); }
      };

      const etape = (pr, k) => function* (e) {
        const poste = postes.get(pr.poste[k]);
        // La place est prise AVANT les unités : un opérateur occupe son poste
        // pendant qu'il rassemble son lot. C'est l'ordre de ProdSim, et c'est
        // celui qui décrit la réalité d'un poste tenu.
        const place = poste.ressource.demander({ priorite: pr.priorite });
        yield place;
        try {
          const lot = [];
          for (let i = 0; i < pr.quantite[k]; i++) {
            lot.push(yield poste.tampon.prendre(a => a.produit === pr.nom));
          }
          for (const c of pr.composants[k]) {
            for (let i = 0; i < c.quantite; i++) lot[0].composants.push(yield stocks.get(c.produit).prendre());
          }

          yield e.delai(aleas.tirer(pr.operation[k]));

          const dernier = k + 1 >= pr.poste.length;
          if (dernier && pr.fini) {
            const s = suivi.get(pr.nom);
            for (const u of lot) { s.finis += 1; s.traversee.noter(e.maintenant - u.naissance); }
          } else {
            const destination = dernier ? stocks.get(pr.nom) : postes.get(pr.poste[k + 1]).tampon;
            for (const u of lot) {
              yield destination.deposer(u);          // BLOQUE si l'aval est plein
              if (!dernier) annoncer(pr, k + 1);
            }
            if (dernier) { const s = suivi.get(pr.nom); s.finis += lot.length; }
          }
        } finally {
          poste.ressource.liberer(place);             // après le dépôt, jamais avant
        }
      };

      /** Dépose une unité neuve là où sa vie commence. */
      const emettre = pr => {
        const u = creer(pr);
        suivi.get(pr.nom).crees += 1;
        if (pr.poste.length > 0) {
          const d = postes.get(pr.poste[0]).tampon.deposer(u);
          d.surResolution(() => annoncer(pr, 0));
        } else {
          stocks.get(pr.nom).deposer(u);
        }
      };

      this.produits.forEach(pr => {
        if (!pr.source) return;
        const src = pr.source;
        if (src.calendrier) {
          env.processus(function* (e) {
            const plan = src.calendrier.slice().sort((a, b) => a.instant - b.instant);
            let t = 0;
            for (const rdv of plan) {
              if (rdv.instant > t) { yield e.delai(rdv.instant - t); t = rdv.instant; }
              for (let i = 0; i < (rdv.quantite === undefined ? 1 : rdv.quantite); i++) emettre(pr);
            }
          }, pr.nom + ' · calendrier');
        } else {
          env.processus(function* (e) {
            const debut = src.debut === undefined ? 0 : src.debut;
            const fin = src.fin === undefined ? Infinity : src.fin;
            const max = src.max === undefined ? Infinity : src.max;
            const parTour = src.quantite === undefined ? 1 : src.quantite;
            if (debut > 0) yield e.delai(debut);
            let emis = 0;
            while (e.maintenant <= fin && emis < max) {
              for (let i = 0; i < parTour && emis < max; i++) { emettre(pr); emis++; }
              const attente = aleas.tirer(src.loi);
              if (!(attente > 0)) throw new Error('Source de « ' + pr.nom + ' » : intervalle nul, la simulation ne pourrait pas avancer.');
              yield e.delai(attente);
            }
          }, pr.nom + ' · source');
        }
      });

      env.avancerA(horizon);
      return this._resultats(env, horizon, graine, postes, stocks, suivi);
    }

    _resultats(env, horizon, graine, postes, stocks, suivi) {
      const listePostes = [];
      postes.forEach(p => {
        listePostes.push(Object.assign(p.ressource.resume(), {
          tampon: p.tampon.resume()
        }));
      });
      const listeProduits = [];
      this.produits.forEach(pr => {
        const s = suivi.get(pr.nom);
        listeProduits.push({
          // Sans gamme, un produit est disponible dès sa création : « terminé »
          // n'a pas de sens pour lui, et vaut mieux que zéro, qui se lirait
          // comme un échec.
          nom: pr.nom, fini: pr.fini, crees: s.crees,
          termines: pr.poste.length > 0 ? s.finis : null,
          enStock: stocks.get(pr.nom).remplissageCourant,
          traverseeMoyenne: s.traversee.moyenne(),
          traverseeP90: s.traversee.percentile(90)
        });
      });

      // Le goulot est DÉSIGNÉ PAR LA MESURE : le poste le plus occupé, ou le
      // tampon qui bloque le plus son amont. Aucune heuristique, aucun seuil
      // choisi à la main.
      let goulot = null;
      for (const p of listePostes) {
        const parBlocage = p.tampon.partBloquante || 0;
        const severite = Math.max(p.tauxOccupation || 0, parBlocage);
        const cause = parBlocage > (p.tauxOccupation || 0) ? 'tampon saturé' : 'places occupées';
        if (!goulot || severite > goulot.severite) {
          goulot = { poste: p.nom, severite, cause, tauxOccupation: p.tauxOccupation, partBloquante: parBlocage };
        }
      }

      return {
        procede: this.nom, horizon, graine,
        avertissements: this.avertissements.slice(),
        instantFinal: env.maintenant,
        evenementsRestants: env.enAttente,
        postes: listePostes,
        produits: listeProduits,
        goulot
      };
    }
  }

  /** Charge un procédé depuis une chaîne JSON, avec un message d'erreur utile. */
  function chargerProcede(texte) {
    let donnees;
    try { donnees = JSON.parse(texte); }
    catch (e) { throw new Error('JSON illisible : ' + e.message); }
    return new Procede(donnees);
  }

  return { Procede, chargerProcede, validerProcede, Aleas, LOIS };
});

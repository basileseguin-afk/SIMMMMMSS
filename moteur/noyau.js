/* ==========================================================================
 *  Noyau de simulation à événements discrets
 *  --------------------------------------------------------------------------
 *  Conception inspirée de SimPy (Copyright (c) 2013 Ontje Lünsdorf and Stefan
 *  Scherfke, licence MIT) et de son portage uia-simjs (Copyright (c) Kyle K.
 *  Lin, licence Apache-2.0). Aucune ligne n'est recopiée : les deux projets
 *  sont en Python et en modules ES, ce fichier est un script classique sans
 *  étape de construction, utilisable depuis `file://` comme depuis Node.
 *
 *  Écarts assumés par rapport à uia-simjs, et leurs raisons :
 *    - l'arrêt de `executer()` n'est PAS une exception rattrapée ; une erreur
 *      de modèle doit remonter à l'appelant, pas être avalée puis affichée ;
 *    - aucune sortie console dans le chemin critique ;
 *    - aucune dépendance externe : la file de priorité fait trente lignes ;
 *    - l'ordre des événements simultanés est totalement déterminé
 *      (instant, priorité, rang de création), donc reproductible.
 *
 *  Ce fichier ne contient ni ressource, ni tampon, ni mesure : c'est l'étape 1
 *  de docs/ETUDE_OPEN_SOURCE.md. Voir `moteur/ressources.js` pour la suite.
 * ==========================================================================*/
(function (root) {
  'use strict';

  /* ========================================================================
   *  1. CONSTANTES
   * ======================================================================*/

  /** Départage les événements programmés pour le même instant. */
  const PRIORITE = { URGENTE: -1, NORMALE: 0, BASSE: 1 };

  /** Valeur d'un événement non encore déclenché. Distincte de `undefined`. */
  const ATTENTE = Symbol('en attente');

  /* ========================================================================
   *  2. FILE DE PRIORITÉ (tas binaire)
   * ======================================================================*/

  /**
   * Ordre total sur les entrées de la file : instant croissant, puis priorité
   * croissante, puis rang de création. Le troisième critère est ce qui rend
   * deux exécutions identiques : sans lui, deux événements de même instant et
   * de même priorité sortiraient dans un ordre dépendant du tas.
   */
  function avant(a, b) {
    if (a.temps !== b.temps) return a.temps < b.temps;
    if (a.priorite !== b.priorite) return a.priorite < b.priorite;
    return a.seq < b.seq;
  }

  class FilePriorite {
    constructor() { this._tas = []; }

    get taille() { return this._tas.length; }

    /** Entrée de plus petit rang, sans la retirer. */
    tete() { return this._tas[0]; }

    pousser(entree) {
      const t = this._tas;
      t.push(entree);
      let i = t.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (!avant(t[i], t[p])) break;
        const tmp = t[i]; t[i] = t[p]; t[p] = tmp;
        i = p;
      }
    }

    retirer() {
      const t = this._tas;
      if (t.length === 0) return undefined;
      const tete = t[0];
      const dernier = t.pop();
      if (t.length > 0) {
        t[0] = dernier;
        let i = 0;
        for (;;) {
          const g = 2 * i + 1, d = g + 1;
          let m = i;
          if (g < t.length && avant(t[g], t[m])) m = g;
          if (d < t.length && avant(t[d], t[m])) m = d;
          if (m === i) break;
          const tmp = t[i]; t[i] = t[m]; t[m] = tmp;
          i = m;
        }
      }
      return tete;
    }
  }

  /* ========================================================================
   *  3. ERREURS
   * ======================================================================*/

  /** Levée dans un processus par `processus.interrompre(cause)`. */
  class Interruption extends Error {
    constructor(cause) {
      super('Processus interrompu' + (cause === undefined ? '' : ' : ' + String(cause)));
      this.name = 'Interruption';
      this.cause = cause;
    }
  }

  /** Une valeur d'échec quelconque devient une Error, sans perdre l'originale. */
  function enErreur(valeur) {
    if (valeur instanceof Error) return valeur;
    const e = new Error(String(valeur));
    e.valeur = valeur;
    return e;
  }

  /* ========================================================================
   *  4. ÉVÉNEMENT
   * ======================================================================*/

  /**
   * Un événement passe par trois états :
   *   en attente  -> `declenche` faux  : il n'a ni valeur ni instant
   *   programmé   -> `declenche` vrai  : il attend son tour dans la file
   *   traité      -> `traite` vrai     : ses rappels ont été exécutés
   *
   * Un événement en échec (`ok` faux) qui atteint l'état traité sans avoir été
   * neutralisé fait remonter son erreur hors de `pas()`. C'est volontaire : un
   * échec que personne n'attend est un défaut du modèle, pas un événement.
   */
  class Evenement {
    constructor(env, nom) {
      this.env = env;
      this.nom = nom || 'evenement';
      this._rappels = [];          // null une fois l'événement traité
      this._valeur = ATTENTE;
      this._neutralise = false;
      this._annule = false;
      this.ok = undefined;
    }

    get declenche() { return this._valeur !== ATTENTE; }
    get traite() { return this._rappels === null; }
    get annule() { return this._annule; }

    /** Valeur portée par l'événement, ou `undefined` tant qu'il est en attente. */
    get valeur() { return this._valeur === ATTENTE ? undefined : this._valeur; }

    surResolution(fn) {
      if (typeof fn !== 'function') throw new TypeError('surResolution attend une fonction.');
      if (this._rappels === null) throw new Error('Événement déjà traité : ' + this.nom);
      this._rappels.push(fn);
      return this;
    }

    retirerResolution(fn) {
      if (this._rappels === null) return this;
      const i = this._rappels.indexOf(fn);
      if (i !== -1) this._rappels.splice(i, 1);
      return this;
    }

    /** Déclenche l'événement en succès et le programme à l'instant courant. */
    reussir(valeur) {
      if (this.declenche) throw new Error('Événement déjà déclenché : ' + this.nom);
      this.ok = true;
      this._valeur = valeur === undefined ? null : valeur;
      this.env.programmer(this);
      return this;
    }

    /** Déclenche l'événement en échec. Voir la remarque de classe. */
    echouer(erreur) {
      if (this.declenche) throw new Error('Événement déjà déclenché : ' + this.nom);
      this.ok = false;
      this._valeur = enErreur(erreur);
      this.env.programmer(this);
      return this;
    }

    /** Marque un échec comme pris en charge : il ne remontera pas. */
    neutraliser() { this._neutralise = true; return this; }

    /**
     * Annule l'événement : ses rappels ne seront jamais exécutés, même s'il
     * est déjà dans la file. Nécessaire pour retirer une demande de poste
     * restée en attente (étape 2).
     */
    annuler() {
      if (this.traite) throw new Error('Événement déjà traité : ' + this.nom);
      this._annule = true;
      this._rappels = [];
      return this;
    }
  }

  /* ========================================================================
   *  5. DÉLAI
   * ======================================================================*/

  /** Événement qui se résout tout seul après une durée. Déclenché à sa création. */
  class Delai extends Evenement {
    constructor(env, duree, valeur, nom) {
      super(env, nom || 'delai');
      const d = duree === undefined ? 0 : duree;
      if (typeof d !== 'number' || !isFinite(d) || d < 0) {
        throw new RangeError('Durée de délai invalide : ' + String(duree));
      }
      this.duree = d;
      this.ok = true;
      this._valeur = valeur === undefined ? null : valeur;
      env.programmer(this, d);
    }
  }

  /* ========================================================================
   *  6. CONDITIONS (tousDe / unDe)
   * ======================================================================*/

  /**
   * Se résout quand `evaluer(nbFaits, total)` devient vrai, avec pour valeur
   * la liste des événements achevés, dans leur ordre d'achèvement.
   * L'échec d'un sous-événement fait échouer la condition ; ce sous-événement
   * est alors neutralisé, sinon il remonterait deux fois.
   */
  class Condition extends Evenement {
    constructor(env, evaluer, evenements, nom) {
      super(env, nom || 'condition');
      this._evaluer = evaluer;
      this._sous = Array.from(evenements);
      this._faits = [];

      for (const ev of this._sous) {
        if (!(ev instanceof Evenement)) throw new TypeError('Condition attend des événements.');
        if (ev.env !== env) throw new Error('Événement d\'un autre environnement.');
      }
      // Cas limite : la condition est déjà satisfaite sans aucun sous-événement.
      if (this._sous.length === 0) {
        if (evaluer(0, 0)) this.reussir([]);
        return;
      }
      for (const ev of this._sous) {
        if (ev.traite) this._surFait(ev);
        else ev.surResolution(e => this._surFait(e));
        if (this.declenche) break;
      }
    }

    _surFait(ev) {
      if (this.declenche) return;
      this._faits.push(ev);
      if (ev.ok === false) {
        ev.neutraliser();
        this.echouer(ev._valeur);
        return;
      }
      if (this._evaluer(this._faits.length, this._sous.length)) this.reussir(this._faits.slice());
    }
  }

  /* ========================================================================
   *  7. PROCESSUS
   * ======================================================================*/

  /**
   * Un processus est une fonction génératrice : chaque `yield` rend un
   * événement, et la résolution de cet événement relance le générateur avec sa
   * valeur. Le processus est lui-même un événement : on peut l'attendre.
   *
   * C'est le mécanisme de SimPy ; les générateurs JavaScript en sont
   * l'équivalent exact, ce n'est pas une imitation.
   */
  class Processus extends Evenement {
    constructor(env, generateur, nom) {
      super(env, nom || 'processus');
      const gen = typeof generateur === 'function' ? generateur(env) : generateur;
      if (!gen || typeof gen.next !== 'function' || typeof gen.throw !== 'function') {
        throw new TypeError('Processus attend un générateur ou une fonction génératrice.');
      }
      this._gen = gen;
      this._cible = null;
      this._demarre = false;
      this._reprendre = this._reprendre.bind(this);

      // Amorce : un événement déjà résolu, programmé en urgence, dont le seul
      // rôle est d'entrer une première fois dans le générateur.
      const amorce = new Evenement(env, 'amorce');
      amorce.ok = true;
      amorce._valeur = null;
      amorce.surResolution(this._reprendre);
      env.programmer(amorce, 0, PRIORITE.URGENTE);
    }

    /** Événement actuellement attendu par le processus, ou null. */
    get cible() { return this._cible; }

    /** Vrai tant que le processus n'est pas terminé. */
    get vivant() { return !this.declenche; }

    /**
     * Fait lever une Interruption au point d'attente du processus.
     * Retourne faux si le processus est déjà terminé.
     *
     * L'événement que le processus attendait reste programmé : on ne peut pas
     * le retirer du tas à coût constant, et il peut être partagé. Il se
     * résoudra dans le vide, mais il fera avancer l'horloge jusqu'à son
     * instant si plus rien d'autre n'est en file. C'est sans effet sur le
     * modèle, et c'est aussi le comportement de SimPy.
     */
    interrompre(cause) {
      if (this.declenche) return false;
      if (!this._demarre) {
        throw new Error('Processus non démarré : ' + this.nom +
          '. Il ne peut être interrompu qu\'une fois son générateur entamé.');
      }
      if (this.env.processusActif === this) {
        throw new Error('Un processus ne peut pas s\'interrompre lui-même.');
      }
      const it = new Evenement(this.env, 'interruption');
      it.ok = false;
      it._valeur = new Interruption(cause);
      it.neutraliser();
      it.surResolution(ev => {
        // Le processus n'attend plus sa cible : on retire sa reprise, sinon il
        // repartirait une seconde fois quand cette cible se résoudra.
        if (this._cible && !this._cible.traite) this._cible.retirerResolution(this._reprendre);
        this._cible = null;
        this._reprendre(ev);
      });
      this.env.programmer(it, 0, PRIORITE.URGENTE);
      return true;
    }

    _reprendre(evenement) {
      // Garde-fou : un processus déjà achevé ne doit pas être relancé. Le cas
      // se produit si on l'interrompt avant que son amorce n'ait été traitée :
      // l'amorce arrive ensuite sur un générateur terminé.
      if (this.declenche) return;
      const env = this.env;
      this._demarre = true;
      env._actif = this;
      try {
        for (;;) {
          let r;
          if (evenement.ok === false) {
            evenement.neutraliser();
            r = this._gen.throw(enErreur(evenement._valeur));
          } else {
            r = this._gen.next(evenement.valeur);
          }

          if (r.done) {
            this._cible = null;
            env._actif = null;
            this.reussir(r.value);
            return;
          }

          const suivant = r.value;
          if (!(suivant instanceof Evenement)) {
            throw new TypeError('Un processus ne peut rendre que des événements (reçu : ' +
              Object.prototype.toString.call(suivant) + ').');
          }
          if (suivant.env !== env) throw new Error('Événement d\'un autre environnement.');
          if (suivant.annule) throw new Error('Événement annulé rendu par un processus.');

          this._cible = suivant;
          if (!suivant.traite) {
            suivant.surResolution(this._reprendre);
            break;
          }
          // Déjà traité : on reprend sans repasser par la file.
          evenement = suivant;
        }
      } catch (err) {
        this._cible = null;
        env._actif = null;
        // L'échec devient celui du processus : il est transmis à qui l'attend,
        // et remonte hors de `pas()` si personne ne l'attend.
        this.echouer(err);
        return;
      }
      env._actif = null;
    }
  }

  /* ========================================================================
   *  8. ENVIRONNEMENT
   * ======================================================================*/

  class Environnement {
    constructor(instantInitial) {
      const t0 = instantInitial === undefined ? 0 : instantInitial;
      if (typeof t0 !== 'number' || !isFinite(t0)) throw new RangeError('Instant initial invalide.');
      this._file = new FilePriorite();
      this._maintenant = t0;
      this._seq = 0;
      this._actif = null;
    }

    /** Instant courant de la simulation. */
    get maintenant() { return this._maintenant; }

    /** Processus en cours d'exécution, ou null. */
    get processusActif() { return this._actif; }

    /** Instant du prochain événement, ou Infinity si la file est vide. */
    get prochainInstant() {
      const t = this._file.tete();
      return t === undefined ? Infinity : t.temps;
    }

    get enAttente() { return this._file.taille; }

    programmer(evenement, delai, priorite) {
      const d = delai === undefined ? 0 : delai;
      if (typeof d !== 'number' || !isFinite(d) || d < 0) {
        throw new RangeError('Délai de programmation invalide : ' + String(delai));
      }
      this._file.pousser({
        temps: this._maintenant + d,
        priorite: priorite === undefined ? PRIORITE.NORMALE : priorite,
        seq: this._seq++,
        evenement: evenement
      });
      return evenement;
    }

    /**
     * Traite le prochain événement. Retourne faux si la file est vide.
     * Fait remonter l'erreur d'un événement en échec non neutralisé.
     */
    pas() {
      const entree = this._file.retirer();
      if (entree === undefined) return false;

      this._maintenant = entree.temps;
      const ev = entree.evenement;
      if (ev._annule) return true;

      const rappels = ev._rappels;
      ev._rappels = null;                       // traité avant l'appel des rappels
      if (rappels) for (let i = 0; i < rappels.length; i++) rappels[i](ev);

      if (ev.ok === false && !ev._neutralise) {
        const err = enErreur(ev._valeur);
        err.evenement = ev;
        throw err;
      }
      return true;
    }

    /**
     * Avance la simulation.
     *   `jusqua`  : dernier instant traité, inclus. Sans lui, la file est vidée.
     *   `maxPas`  : garde-fou contre une boucle de délais nuls (défaut 10^7).
     *
     * Convention : tous les événements d'instant INFÉRIEUR OU ÉGAL à `jusqua`
     * sont traités, puis l'horloge est calée sur `jusqua`. Deux appels
     * successifs avancent donc sans jamais rejouer ni sauter un événement,
     * ce dont le rendu a besoin pour appeler `avancerA(now + dt)` par image.
     */
    executer(options) {
      const o = options || {};
      const jusqua = o.jusqua === undefined || o.jusqua === null ? Infinity : o.jusqua;
      const maxPas = o.maxPas === undefined ? 1e7 : o.maxPas;
      if (typeof jusqua !== 'number' || Number.isNaN(jusqua)) throw new RangeError('`jusqua` invalide.');
      if (jusqua < this._maintenant) {
        throw new RangeError('`jusqua` (' + jusqua + ') est antérieur à l\'instant courant (' + this._maintenant + ').');
      }
      let n = 0;
      while (this._file.taille > 0 && this.prochainInstant <= jusqua) {
        if (++n > maxPas) {
          throw new Error('Plus de ' + maxPas + ' événements à l\'instant ' + this._maintenant +
            ' : boucle de délais nuls probable.');
        }
        this.pas();
      }
      if (jusqua !== Infinity && this._maintenant < jusqua) this._maintenant = jusqua;
      return this._maintenant;
    }

    /** Sucre : `executer({ jusqua: instant })`. */
    avancerA(instant, options) {
      return this.executer(Object.assign({}, options, { jusqua: instant }));
    }

    /* ---- fabriques ---------------------------------------------------- */

    evenement(nom) { return new Evenement(this, nom); }
    delai(duree, valeur, nom) { return new Delai(this, duree, valeur, nom); }
    processus(generateur, nom) { return new Processus(this, generateur, nom); }

    /** Se résout quand TOUS les événements sont achevés. */
    tousDe(evenements, nom) {
      return new Condition(this, (faits, total) => faits >= total, evenements, nom || 'tousDe');
    }

    /** Se résout dès qu'UN des événements est achevé. */
    unDe(evenements, nom) {
      return new Condition(this, faits => faits > 0, evenements, nom || 'unDe');
    }
  }

  /* ========================================================================
   *  9. EXPORT
   * ======================================================================*/

  const api = {
    Environnement, Evenement, Delai, Processus, Condition, Interruption,
    FilePriorite, PRIORITE
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MoteurNoyau = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==========================================================================
 *  Modèle Orly — les flux de l'unité sur le moteur à événements discrets
 *  --------------------------------------------------------------------------
 *  Ce fichier remplace le « modèle à débit » de sim.js, qui répartissait un
 *  budget d'homme-minutes par pas de 30 secondes. Ici :
 *
 *    - un atelier est une Ressource : un nombre entier de PERSONNES, chacune
 *      occupée par un lot de travail à la fois ;
 *    - le travail d'un ordre de fabrication (OF) est découpé en lots de
 *      LOT homme-minutes ; plusieurs personnes traitent le même OF en
 *      parallèle, comme au montage ;
 *    - le robot de dressage est une Ressource d'une place, à cadence fixe :
 *      il ne dresse qu'un vol à la fois, dans l'ordre des échéances ;
 *    - la plonge est une Ressource dont les places sont les tunnels ;
 *    - chaque atelier a un Tampon : le nombre d'OF qu'il peut contenir
 *      (en attente, en cours, ou finis mais pas encore partis). Illimité par
 *      défaut — la contenance est une donnée de l'exploitant. Finie, elle
 *      crée le blocage amont : l'OF fini reste dans l'atelier tant que le
 *      suivant n'a pas de place, et l'atelier n'accepte plus rien.
 *
 *  Le barème d'homme-minutes (chargeVol) est repris tel quel du démonstrateur.
 *  Il N'EST PAS calibré : les résultats restent une démonstration.
 *
 *  Le modèle est sans aléa et sans dépendance au rendu : la même journée
 *  rejouée donne exactement le même résultat, dans un navigateur ou sous Node.
 * ==========================================================================*/
(function (root, fabrique) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = fabrique(require('./noyau.js'), require('./mesure.js'), require('./ressources.js'));
  } else {
    if (!root.MoteurNoyau || !root.MoteurMesure || !root.MoteurRessources) {
      throw new Error('moteur/orly.js doit être chargé après noyau.js, mesure.js et ressources.js.');
    }
    root.MoteurOrly = fabrique(root.MoteurNoyau, root.MoteurMesure, root.MoteurRessources);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (noyau, mesure, ressources) {
  'use strict';

  const Environnement = noyau.Environnement;
  const Ressource = ressources.Ressource;
  const Tampon = ressources.Tampon;
  const Niveau = ressources.Niveau;

  /* ========================================================================
   *  1. PARAMÈTRES ET DONNÉES DE DÉMONSTRATION
   * ======================================================================*/

  const CFG_DEFAUT = {
    jour: { debut: 5 * 60, fin: 23 * 60 },   // fenêtre simulée (minutes depuis 00:00)
    dispo: 0.85,                             // disponibilité effective d'une personne
    robotCadence: 320,                       // plateaux YC / heure
    tunnels: 3, tunnelDouble: true,          // plonge
    tunnelDebit: 4,                          // unités / min par tunnel simple (double = ×2)
    loadDelay: 45,                           // min avant heure_std pour être « à l'heure »
    shift: 0,                                // décalage horaire global (min)
    staff: { magasin:3, appros:6, decontam:3, cuisine:10, prepa:18, dotation:6, armement:5, bobduty:2 },
    tampons: {},                             // contenance en OF par atelier ; absent = illimitée
    // Règle de la feuille de route : le robot sert l'économie de FBU, TX/FWI et
    // CRL uniquement. Les autres YC sont dressés à la main. Les prestations
    // exactes et les cas SPML restent à préciser.
    robotCompagnies: ['FBU', 'TX', 'FWI', 'CRL'],
    ycManuel: 0.35,                          // homme-minutes par plateau YC dressé à la main — NON CALIBRÉ
    // Relève d'équipe : `staff` est l'équipe du matin ; `soir[id]`, s'il est
    // renseigné, remplace l'effectif de l'atelier à partir de `bascule`.
    equipes: { bascule: 14 * 60, soir: {} },
    // Boucle du matériel propre : les retours lavés à la plonge réalimentent un
    // stock que la dotation consomme pour les départs. Un stock insuffisant
    // arrête la dotation, même avec tout le personnel du monde.
    materiel: {
      actif: true,
      initial: 2600,     // unités propres disponibles à l'ouverture
      capacite: 8000,    // plafond du stock
      parPax: 1          // unités par passager — unité de compte, NON CALIBRÉE
    }
  };

  /* Vols fictifs : vague du matin et vague du soir. Les codes TX, FWI, CRL et
   * FBU y figurent pour que la règle du robot s'exerce sur la démonstration. */
  const JEU_DEMO = [
    { id:'AF1080', cie:'AF', avion:'A320', sens:'DEP', std:6*60+40, bc:12, pc:0,  yc:150, spml:6 },
    { id:'TX305',  cie:'TX', avion:'A320', sens:'DEP', std:7*60+5,  bc:16, pc:0,  yc:120, spml:4 },
    { id:'AF1180', cie:'AF', avion:'A350', sens:'DEP', std:7*60+30, bc:32, pc:48, yc:210, spml:12 },
    { id:'DL84',   cie:'DL', avion:'B777', sens:'DEP', std:8*60+0,  bc:38, pc:40, yc:230, spml:14 },
    { id:'FWI40',  cie:'FWI', avion:'A350', sens:'DEP', std:8*60+20, bc:30, pc:44, yc:200, spml:10 },
    { id:'CRL76',  cie:'CRL', avion:'A380', sens:'DEP', std:8*60+50, bc:14, pc:76, yc:340, spml:18 },
    { id:'AF1290', cie:'AF', avion:'A320', sens:'DEP', std:9*60+10, bc:12, pc:0,  yc:140, spml:5 },
    { id:'AF1081', cie:'AF', avion:'A320', sens:'RET', sta:6*60+10, bc:12, pc:0,  yc:150 },
    { id:'DL85',   cie:'DL', avion:'B777', sens:'RET', sta:7*60+40, bc:38, pc:40, yc:230 },
    { id:'AF1680', cie:'AF', avion:'A350', sens:'DEP', std:17*60+20,bc:32, pc:48, yc:205, spml:11 },
    { id:'TX315',  cie:'TX', avion:'A320', sens:'DEP', std:17*60+50,bc:16, pc:0,  yc:130, spml:5 },
    { id:'QR42',   cie:'QR', avion:'A350', sens:'DEP', std:18*60+30,bc:30, pc:44, yc:210, spml:10 },
    { id:'FBU78',  cie:'FBU', avion:'A380', sens:'DEP', std:19*60+0, bc:14, pc:76, yc:350, spml:20 },
    { id:'DL88',   cie:'DL', avion:'B777', sens:'DEP', std:19*60+40,bc:38, pc:40, yc:235, spml:15 },
    { id:'EK77',   cie:'EK', avion:'A380', sens:'RET', sta:16*60+30,bc:14, pc:76, yc:340 },
    { id:'QR41',   cie:'QR', avion:'A350', sens:'RET', sta:17*60+10,bc:30, pc:44, yc:200 },
    { id:'AF1681', cie:'AF', avion:'A350', sens:'RET', sta:18*60+0, bc:32, pc:48, yc:205 },
    { id:'DL89',   cie:'DL', avion:'B777', sens:'RET', sta:18*60+50,bc:38, pc:40, yc:235 }
  ];

  /** Le robot dresse-t-il les YC de ce vol ? Selon la liste des compagnies servies. */
  function robotServi(f, cfg) {
    const liste = (cfg && cfg.robotCompagnies) || CFG_DEFAUT.robotCompagnies;
    const cie = String(f.cie || '').trim().toUpperCase();
    return liste.some(c => String(c).trim().toUpperCase() === cie);
  }

  /* Barème d'homme-minutes par passager, par classe et par atelier. NON CALIBRÉ.
   * Les YC vont au robot si la compagnie est servie, sinon au dressage manuel. */
  function chargeVol(f, cfg) {
    const c = cfg || CFG_DEFAUT;
    const bc = f.bc || 0, pc = f.pc || 0, yc = f.yc || 0, pax = bc + pc + yc;
    const servi = robotServi(f, c);
    const ycManuel = servi ? 0 : yc * (c.ycManuel === undefined ? CFG_DEFAUT.ycManuel : c.ycManuel);
    return {
      robotServi: servi,
      food: { appros: bc*0.6 + pc*0.35 + yc*0.12, decontam: pax*0.05,
              cuisine: bc*1.4 + pc*0.7 + yc*0.28, prepa: bc*2.2 + pc*1.1 + pax*0.06 + ycManuel,
              robot: servi ? yc : 0 },
      dotation: bc*0.5 + pc*0.3 + yc*0.12,
      armement: pax*0.08 + 15,
      plonge:   pax*0.9
    };
  }

  const ROUTES = { food:['appros','decontam','cuisine','prepa'], dot:['dotation'], arm:['armement'], plonge:['plonge'] };
  const COULEURS = { food:'#0c74ad', dot:'#12813f', arm:'#c47a08', plonge:'#7b3fd4' };
  const ATELIERS = ['appros','decontam','cuisine','prepa','dotation','armement','plonge'];

  /** Taille d'un lot de travail, en homme-minutes : ce qu'une personne prend d'un coup. */
  const LOT = 5;
  /** Fenêtre glissante de l'occupation affichée, en minutes simulées. */
  const FENETRE = 15;

  /** Tunnels équivalents : le tunnel double compte pour deux tunnels simples. */
  function capacitePlonge(cfg) { return Math.max(0, (cfg.tunnels | 0) + (cfg.tunnelDouble ? 1 : 0)); }

  function decouper(travail) {
    const lots = [];
    let reste = travail;
    while (reste > 1e-9) { const l = Math.min(LOT, reste); lots.push(l); reste -= l; }
    return lots;
  }

  /* ========================================================================
   *  2. MESURE GLISSANTE
   *     L'occupation affichée est la moyenne des 15 dernières minutes
   *     simulées, pondérée par la durée de chaque pas. Pas de lissage
   *     exponentiel, pas de plancher : une moyenne sur une fenêtre.
   * ======================================================================*/
  class Glissante {
    constructor(fenetre) { this.fenetre = fenetre; this._pts = []; this._somme = 0; this._duree = 0; }
    noter(valeur, dt) {
      if (!(dt > 0)) return;
      this._pts.push({ v: valeur, dt });
      this._somme += valeur * dt; this._duree += dt;
      while (this._duree - this._pts[0].dt >= this.fenetre) {
        const p = this._pts.shift();
        this._somme -= p.v * p.dt; this._duree -= p.dt;
      }
    }
    get valeur() { return this._duree > 0 ? this._somme / this._duree : 0; }
  }

  /* ========================================================================
   *  3. CONSTRUCTION DU MODÈLE
   * ======================================================================*/

  /**
   * @param donnees  vols (même forme que le CSV importé ou JEU_DEMO)
   * @param cfg      paramètres (forme de CFG_DEFAUT)
   * @param options.surToken(edgeId, couleur)  animation, facultatif
   */
  function construireModele(donnees, cfg, options) {
    const o = options || {};
    const surToken = typeof o.surToken === 'function' ? o.surToken : function () {};
    const t0 = cfg.jour.debut;
    const env = new Environnement(t0);

    /* ---- ateliers ---- */
    const stations = {};
    const equipes = cfg.equipes || CFG_DEFAUT.equipes;
    ATELIERS.forEach(id => {
      const capacite = id === 'plonge' ? capacitePlonge(cfg) : Math.max(0, (cfg.staff[id] | 0));
      const contenance = cfg.tampons && cfg.tampons[id] > 0 ? cfg.tampons[id] : Infinity;
      stations[id] = {
        id, capacite,
        ressource: new Ressource(env, capacite, { nom: id }),
        tampon: new Tampon(env, { nom: id, capacite: contenance }),
        glissante: new Glissante(FENETRE),
        // vue lue par l'interface
        util: 0, qlen: 0, enAttente: 0, bloque: false, tauxJour: 0,
        robotUtil: 0, robotAttente: 0, robotTauxJour: 0   // renseignés sur le montage seulement
      };
    });
    const robot = new Ressource(env, 1, { nom: 'robot' });

    /* Matériel propre : un seul compte, en unités par passager. Il est
     * consommé par la dotation (assiettes et couverts propres) et réalimenté
     * par les retours lavés à la plonge. L'armement récupère ses trolleys
     * directement des quais (flux de retour du plan) : il n'est pas concerné.
     * Simplification assumée — un seul compte pour tout le matériel. */
    const mat = Object.assign({}, CFG_DEFAUT.materiel, cfg.materiel || {});
    const stock = mat.actif
      ? new Niveau(env, { nom: 'matériel propre', initial: Math.max(0, mat.initial),
                          capacite: Math.max(Math.max(0, mat.initial), mat.capacite) })
      : null;
    const robotGlissante = new Glissante(FENETRE);
    const cadenceRobot = () => Math.max(1e-9, (cfg.robotCadence || 0) / 60);   // plateaux / min

    /** Durée, pour une personne ou un tunnel, d'un lot de `l` unités à l'atelier `id`. */
    const dureeLot = (id, l) => id === 'plonge' ? l / Math.max(1e-9, cfg.tunnelDebit || 0) : l / Math.max(1e-9, cfg.dispo || 0);

    /* ---- vols et ordres de fabrication ---- */
    const flights = donnees.map(f => Object.assign({}, f));
    const jobs = [];
    const mkJob = (f, kind, route, work, robotPl, releaseT) => ({
      flight: f, kind, route, work, robot: robotPl || 0, releaseT,
      dueT: f.due != null ? f.due : releaseT + 30,
      released: false, done: false, stationId: null, color: COULEURS[kind],
      // Trace de l'OF, pour expliquer un retard : une entrée par atelier traversé.
      etapes: [], finT: null,
      _entreeAttendue: false, _avalAttendu: false, _lotsEnCours: 0, _lotsRestants: 0, _robotAttend: false,
      _materielAttendu: false, _avalVers: null, besoinMateriel: 0, apportMateriel: 0
    });
    let plateauxRobot = 0, plateauxManuel = 0;
    flights.forEach(f => {
      const c = chargeVol(f, cfg);
      if (f.sens === 'DEP') {
        const std = (f.std || 0) + cfg.shift;
        f.due = std - cfg.loadDelay; f.readyTime = null; f.retard = 0;
        f.robot = c.robotServi;
        if (c.robotServi) plateauxRobot += f.yc || 0; else plateauxManuel += f.yc || 0;
        f.foodDone = f.dotDone = f.armDone = false;
        jobs.push(mkJob(f, 'food', ROUTES.food, c.food, c.food.robot, std - 200));
        jobs.push(mkJob(f, 'dot', ROUTES.dot, { dotation: c.dotation }, 0, std - 175));
        jobs.push(mkJob(f, 'arm', ROUTES.arm, { armement: c.armement }, 0, std - 175));
      } else {
        jobs.push(mkJob(f, 'plonge', ROUTES.plonge, { plonge: c.plonge }, 0, (f.sta || 0) + cfg.shift));
      }
    });
    if (stock) {
      const pax = f => (f.bc || 0) + (f.pc || 0) + (f.yc || 0);
      jobs.forEach(j => {
        const q = Math.round(pax(j.flight) * mat.parPax);
        if (q <= 0) return;
        if (j.kind === 'dot') j.besoinMateriel = Math.min(q, stock.capacite);
        else if (j.kind === 'plonge') j.apportMateriel = Math.min(q, stock.capacite);
      });
    }

    /* Relève d'équipe : à `bascule`, chaque atelier dont l'effectif du soir est
     * renseigné change de capacité. Personne n'est interrompu : les places en
     * trop se ferment au fil des libérations, les renforts servent aussitôt. */
    if (equipes && equipes.soir) {
      Object.keys(equipes.soir).forEach(id => {
        const st = stations[id];
        const soir = equipes.soir[id];
        if (!st || id === 'plonge' || !Number.isInteger(soir) || soir < 0 || soir === st.capacite) return;
        const bascule = equipes.bascule === undefined ? CFG_DEFAUT.equipes.bascule : equipes.bascule;
        if (bascule <= t0) { st.ressource.modifierCapacite(soir); st.capacite = soir; return; }
        env.processus(function* (e) { yield e.delai(bascule - t0); st.ressource.modifierCapacite(soir); }, id + ' relève');
      });
    }

    function spawnEntree(j) {
      if (j.kind === 'food') surToken('appros_decontam', j.color);
      else if (j.kind === 'plonge') surToken('quais_plonge', j.color);
      else if (j.kind === 'arm') surToken('quais_armement', j.color);
    }
    function finaliser(j) {
      const f = j.flight;
      if (j.kind === 'food') { surToken('prepa_handling', j.color); surToken('handling_quais', j.color); f.foodDone = true; }
      else if (j.kind === 'dot') { surToken('dotation_quais', j.color); f.dotDone = true; }
      else if (j.kind === 'arm') { surToken('armement_quais', j.color); f.armDone = true; }
      else if (j.kind === 'plonge') { surToken('plonge_prepa', j.color); surToken('plonge_dotation', j.color); }
      if (f.sens === 'DEP' && f.foodDone && f.dotDone && f.armDone && f.readyTime == null) {
        f.readyTime = env.maintenant; f.retard = Math.max(0, env.maintenant - f.due);
      }
    }

    /** Un lot : une personne (ou un tunnel) pendant sa durée. */
    const lot = (st, j, l, etape) => env.processus(function* (e) {
      j._lotsRestants++;
      const place = st.ressource.demander({ priorite: j.dueT });
      yield place;
      j._lotsRestants--; j._lotsEnCours++;
      if (etape.debut == null) etape.debut = e.maintenant;        // première personne sur l'OF
      try { yield e.delai(dureeLot(st.id, l)); }
      finally { j._lotsEnCours--; st.ressource.liberer(place); }
    }, st.id + ' lot');

    /** Le robot dresse les plateaux YC d'un vol, un vol à la fois. */
    const dressageRobot = (j, etape) => env.processus(function* (e) {
      etape.robotDemande = e.maintenant; j._robotAttend = true;
      const place = robot.demander({ priorite: j.dueT });
      yield place;
      j._robotAttend = false; etape.robotDebut = e.maintenant;
      if (etape.debut == null) etape.debut = e.maintenant;
      try { yield e.delai(j.robot / cadenceRobot()); }
      finally { etape.robotFin = e.maintenant; robot.liberer(place); }
    }, 'robot');

    /**
     * La vie d'un OF. L'OF entre dans l'atelier (place dans le tampon), y fait
     * son travail par lots, puis demande une place dans l'atelier SUIVANT
     * avant de quitter celui-ci : tant que l'aval est plein, il reste ici et
     * occupe une place du tampon. C'est le blocage amont.
     */
    jobs.forEach(j => env.processus(function* (e) {
      const attente = j.releaseT - t0;
      if (attente > 0) yield e.delai(attente);
      j.released = true; j.stationId = j.route[0]; j.liberationT = e.maintenant;
      spawnEntree(j);
      j._entreeAttendue = true;
      yield stations[j.route[0]].tampon.deposer(j);
      j._entreeAttendue = false;
      j.attenteEntree = e.maintenant - j.liberationT;         // premier atelier plein

      for (let k = 0; k < j.route.length; k++) {
        const id = j.route[k], st = stations[id];
        j.stationId = id;
        const etape = { atelier: id, entree: e.maintenant, debut: null, fin: null, sortie: null,
                        robotDemande: null, robotDebut: null, robotFin: null, attenteMateriel: 0 };
        j.etapes.push(etape);

        // Le matériel propre se prend AVANT d'occuper quelqu'un : on ne mobilise
        // pas un opérateur devant un stock vide. L'OF attend dans l'atelier,
        // visible dans sa file, sans consommer de capacité.
        if (stock && j.besoinMateriel > 0 && k === 0) {
          const t0m = e.maintenant;
          j._materielAttendu = true;
          yield stock.retirer(j.besoinMateriel);
          j._materielAttendu = false;
          etape.attenteMateriel = e.maintenant - t0m;
        }

        const travail = j.work[id] || 0;
        const taches = [];
        // Un atelier à zéro place fait simplement attendre : si une relève
        // l'ouvre plus tard, le travail repart ; sinon l'OF ne finit jamais.
        if (travail > 0) decouper(travail).forEach(l => taches.push(lot(st, j, l, etape)));
        if (id === 'prepa' && j.robot > 0) taches.push(dressageRobot(j, etape));
        if (taches.length) yield e.tousDe(taches);
        etape.fin = e.maintenant;
        if (etape.debut == null) etape.debut = etape.fin;        // rien à faire ici

        if (k + 1 < j.route.length) {
          const suivant = j.route[k + 1];
          j._avalAttendu = true; j._avalVers = suivant;
          yield stations[suivant].tampon.deposer(j);      // BLOQUE si l'aval est plein
          j._avalAttendu = false; j._avalVers = null;
          etape.sortie = e.maintenant;
          yield st.tampon.prendre(x => x === j);
          surToken(id + '_' + suivant, j.color);
        } else {
          etape.sortie = e.maintenant;
          yield st.tampon.prendre(x => x === j);
        }
      }
      // Les retours lavés reviennent au stock de matériel propre.
      if (stock && j.apportMateriel > 0) yield stock.ajouter(j.apportMateriel);
      j.finT = e.maintenant;
      finaliser(j);
      j.done = true;
    }, j.flight.id + ' ' + j.kind));

    /* ---- vue pour l'interface ---- */
    function rafraichir(dt) {
      ATELIERS.forEach(id => {
        const st = stations[id], r = st.ressource;
        st.capacite = r.capacite;                                  // suit les relèves
        const occ = r.capacite > 0 ? Math.min(1, r.occupees / r.capacite) : 0;
        if (dt > 0) st.glissante.noter(occ, dt);
        st.util = st.glissante.valeur;
        st.qlen = st.tampon.remplissageCourant + st.tampon.depotsEnAttente;
        st.enAttente = r.enAttente;
        st.bloque = st.tampon.bloque;
        st.tauxJour = r.tauxOccupation() || 0;
      });
      if (dt > 0) robotGlissante.noter(robot.occupees, dt);
      const prepa = stations.prepa;
      prepa.robotUtil = robotGlissante.valeur;
      prepa.robotAttente = robot.enAttente;
      prepa.robotTauxJour = robot.tauxOccupation() || 0;
    }

    /** Avance jusqu'à `t`, puis met la vue à jour. Retourne l'instant courant. */
    function avancerA(t) {
      const avant = env.maintenant;
      env.avancerA(t);
      rafraichir(env.maintenant - avant);
      return env.maintenant;
    }

    /** Débit du robot sur la fenêtre glissante, en plateaux / min. */
    function debitRobot() { return robotGlissante.valeur * cadenceRobot(); }

    /**
     * Le goulot est le poste où l'on ATTEND : celui qui a le plus de lots en
     * attente d'une personne, ou dont le tampon bloque l'amont. Pas de seuil.
     */
    /**
     * Le goulot est le poste où l'on attend, **compté en ordres de fabrication**.
     *
     * Un lot de travail, un vol en file du robot et un dossier sans matériel ne
     * sont pas la même chose : les compter ensemble reviendrait à additionner
     * des unités différentes. On compte donc, pour chaque poste, combien d'OF
     * sont actuellement arrêtés à cause de lui — une seule unité, comparable.
     *
     * Un OF bloqué faute de place en aval est imputé à l'atelier AVAL, celui
     * qui est plein, pas à celui où il patiente.
     */
    function goulot() {
      const parPoste = new Map();
      const ajouter = (id, cause) => {
        if (!id || !stations[id]) return;
        const e = parPoste.get(id) || { id, attente: 0, causes: new Map() };
        e.attente += 1;
        e.causes.set(cause, (e.causes.get(cause) || 0) + 1);
        parPoste.set(id, e);
      };

      jobs.forEach(j => {
        if (!j.released || j.done) return;
        switch (etatOF(j)) {
          case 'attente_personne':
            ajouter(j.stationId, stations[j.stationId] && stations[j.stationId].capacite > 0 ? 'personnes occupées' : 'aucune personne');
            break;
          case 'attente_robot': ajouter('prepa', 'robot occupé'); break;
          case 'attente_materiel': ajouter('dotation', 'matériel propre en rupture'); break;
          case 'attente_aval': ajouter(j._avalVers, 'tampon saturé'); break;
          case 'attente_entree': ajouter(j.route[0], 'tampon saturé'); break;
          default: break;
        }
      });

      let best = null;
      parPoste.forEach(e => {
        const st = stations[e.id];
        const sev = Math.min(1, e.id === 'prepa' && e.causes.has('robot occupé') ? Math.max(st.util, st.robotUtil) : st.util);
        // Cause dominante, et son détail quand il éclaire l'action.
        let cause = null, n = 0;
        e.causes.forEach((c, nom) => { if (c > n) { n = c; cause = nom; } });
        if (cause === 'robot occupé') cause += ' (' + n + ' vol(s) en file)';
        else if (cause === 'matériel propre en rupture') cause += ' (' + Math.round(stock ? stock.niveau : 0) + ' unités)';
        const cand = { id: e.id, sev, qlen: st.qlen, attente: e.attente, cause };
        if (!best || cand.attente > best.attente || (cand.attente === best.attente && cand.sev > best.sev)) best = cand;
      });
      return best;
    }

    /* ---- lecture d'un OF et d'un vol ---------------------------------- */

    const ETATS = {
      a_liberer: 'à libérer', attente_entree: 'attend une place dans l’atelier', attente_personne: 'attend une personne',
      travail: 'en cours', attente_robot: 'attend le robot', attente_materiel: 'attend du matériel propre',
      attente_aval: 'fini, attend une place en aval', fini: 'terminé'
    };

    /** État courant d'un OF, dérivé de ce qu'il attend. */
    function etatOF(j) {
      if (j.done) return 'fini';
      if (!j.released) return 'a_liberer';
      if (j._entreeAttendue) return 'attente_entree';
      if (j._materielAttendu) return 'attente_materiel';
      if (j._avalAttendu) return 'attente_aval';
      if (j._lotsEnCours > 0) return 'travail';
      if (j._robotAttend) return 'attente_robot';
      if (j._lotsRestants > 0) return 'attente_personne';
      return 'travail';   // robot en cours, ou transfert
    }

    /** Décomposition d'un OF terminé : où il a attendu, combien il a travaillé. */
    function decomposer(j) {
      const d = { attenteEntree: j.attenteEntree || 0, attentePersonnes: 0, attenteRobot: 0, attenteMateriel: 0, attenteAval: 0, travail: 0, parAtelier: [] };
      j.etapes.forEach(et => {
        const fin = et.fin == null ? env.maintenant : et.fin;
        const debut = et.debut == null ? fin : et.debut;
        const sortie = et.sortie == null ? fin : et.sortie;
        // L'attente de matériel précède l'attente de personnes : on la retire de
        // celle-ci pour ne pas compter deux fois le même délai.
        const am = et.attenteMateriel || (j._materielAttendu && et.fin == null ? env.maintenant - et.entree : 0);
        const ap = Math.max(0, debut - et.entree - am), tr = Math.max(0, fin - debut), aa = Math.max(0, sortie - fin);
        const ar = et.robotDemande != null ? Math.max(0, (et.robotDebut == null ? env.maintenant : et.robotDebut) - et.robotDemande) : 0;
        d.attentePersonnes += ap; d.travail += tr; d.attenteAval += aa; d.attenteRobot += ar; d.attenteMateriel += am;
        d.parAtelier.push({ atelier: et.atelier, attentePersonnes: ap, attenteRobot: ar, attenteMateriel: am, travail: tr, attenteAval: aa });
      });
      return d;
    }

    /**
     * Pourquoi ce vol est-il prêt quand il l'est ? On regarde l'OF qui a fini
     * en dernier — c'est lui qui fixe l'heure — et on dit où il a attendu.
     * Les attentes du robot et des personnes au montage peuvent se recouvrir :
     * ce sont des mesures séparées, pas des parts d'un total.
     */
    function expliquer(f) {
      const ofs = jobs.filter(j => j.flight === f && j.kind !== 'plonge');
      if (!ofs.length) return null;
      const finis = ofs.filter(j => j.done);
      const critique = finis.length === ofs.length
        ? finis.reduce((a, b) => (b.finT > a.finT ? b : a))
        : ofs.filter(j => !j.done).sort((a, b) => a.releaseT - b.releaseT)[0];
      const d = decomposer(critique);
      const r = Math.round;
      const morceaux = [];
      if (d.attenteMateriel > 0.5) morceaux.push('attente de matériel propre ' + r(d.attenteMateriel) + ' min');
      if (d.attenteRobot > 0.5) morceaux.push('attente du robot ' + r(d.attenteRobot) + ' min');
      if (d.attentePersonnes > 0.5) morceaux.push('attente de personnes ' + r(d.attentePersonnes) + ' min' +
        (d.parAtelier.length > 1 ? ' (' + d.parAtelier.filter(x => x.attentePersonnes > 0.5).map(x => x.atelier + ' ' + r(x.attentePersonnes)).join(', ') + ')' : ''));
      if (d.attenteAval > 0.5) morceaux.push('bloqué par l’aval ' + r(d.attenteAval) + ' min');
      if (d.attenteEntree > 0.5) morceaux.push('atelier plein à l’entrée ' + r(d.attenteEntree) + ' min');
      morceaux.push('travail ' + r(d.travail) + ' min');
      const etat = etatOF(critique);
      const tete = critique.done
        ? 'OF ' + critique.kind + ' (le dernier fini)'
        : 'OF ' + critique.kind + ' ' + ETATS[etat] + (critique.stationId ? ' — ' + critique.stationId : '');
      return Object.assign({ of: critique.kind, etat, atelier: critique.stationId, phrase: tete + ' : ' + morceaux.join(' · ') }, d);
    }

    /** Journal des OF : une ligne par étape traversée, pour l'export. */
    function journal() {
      const lignes = [];
      jobs.forEach(j => {
        if (!j.released) return;
        j.etapes.forEach(et => lignes.push({
          vol: j.flight.id, of: j.kind, atelier: et.atelier,
          entree: et.entree, debut: et.debut, fin: et.fin, sortie: et.sortie,
          robotDemande: et.robotDemande, robotDebut: et.robotDebut, robotFin: et.robotFin
        }));
      });
      lignes.sort((a, b) => a.entree - b.entree);
      return lignes;
    }

    /** Résumé mesuré de la journée, pour l'export et la comparaison A/B. */
    function bilan() {
      const ateliers = {};
      ATELIERS.forEach(id => {
        const st = stations[id], r = st.ressource;
        ateliers[id] = {
          personnes: r.capaciteMesuree.moyenne(),          // moyenne sur la journée si relève
          occupationJour: r.tauxOccupation(),
          attenteMoyenne: r.attente.moyenne(),
          attenteP90: r.attente.percentile(90),
          ofMoyens: st.tampon.remplissage.moyenne(),
          partBloquante: st.tampon.partBloquante()
        };
      });
      return {
        ateliers,
        robot: { cadence: cfg.robotCadence, compagnies: (cfg.robotCompagnies || []).slice(), plateauxRobot, plateauxManuel,
                 occupationJour: robot.tauxOccupation(), attenteMoyenne: robot.attente.moyenne(), attenteP90: robot.attente.percentile(90) },
        materiel: stock ? {
          initial: mat.initial, parPax: mat.parPax,
          consomme: jobs.reduce((n, j) => n + (j.besoinMateriel && j.done ? j.besoinMateriel : 0), 0),
          lave: jobs.reduce((n, j) => n + (j.apportMateriel && j.done ? j.apportMateriel : 0), 0),
          niveau: stock.niveau, niveauMin: stock.mesure.minimum, niveauMoyen: stock.mesure.moyenne(),
          partEnRupture: stock.partEnRupture(), dossiersEnAttente: jobs.filter(j => j._materielAttendu).length
        } : null
      };
    }

    rafraichir(0);
    return { env, flights, jobs, stations, robot, stock, ATELIERS, ETATS, avancerA, debitRobot, goulot, bilan,
             etatOF, decomposer, expliquer, journal,
             get maintenant() { return env.maintenant; } };
  }

  /**
   * Rejoue une journée entière sans interface et rend ses indicateurs finaux.
   * Sert à la comparaison A/B : deux configurations, deux journées complètes,
   * mêmes vols, aucun aléa — la différence ne peut venir que des réglages.
   */
  function simulerJournee(donnees, cfg, kpis) {
    const m = construireModele(donnees, cfg);
    m.avancerA(cfg.jour.fin);
    return { modele: m, kpis: kpis ? kpis(m.flights, cfg.jour.fin) : null, bilan: m.bilan() };
  }

  return { CFG_DEFAUT, JEU_DEMO, ROUTES, ATELIERS, LOT, FENETRE, chargeVol, robotServi, capacitePlonge, construireModele, simulerJournee };
});

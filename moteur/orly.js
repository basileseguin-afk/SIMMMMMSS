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
    tampons: {}                              // contenance en OF par atelier ; absent = illimitée
  };

  /* Vols fictifs : vague du matin et vague du soir. */
  const JEU_DEMO = [
    { id:'AF1080', cie:'AF', avion:'A320', sens:'DEP', std:6*60+40, bc:12, pc:0,  yc:150, spml:6 },
    { id:'BA305',  cie:'BA', avion:'A320', sens:'DEP', std:7*60+5,  bc:16, pc:0,  yc:120, spml:4 },
    { id:'AF1180', cie:'AF', avion:'A350', sens:'DEP', std:7*60+30, bc:32, pc:48, yc:210, spml:12 },
    { id:'DL84',   cie:'DL', avion:'B777', sens:'DEP', std:8*60+0,  bc:38, pc:40, yc:230, spml:14 },
    { id:'QR40',   cie:'QR', avion:'A350', sens:'DEP', std:8*60+20, bc:30, pc:44, yc:200, spml:10 },
    { id:'EK76',   cie:'EK', avion:'A380', sens:'DEP', std:8*60+50, bc:14, pc:76, yc:340, spml:18 },
    { id:'AF1290', cie:'AF', avion:'A320', sens:'DEP', std:9*60+10, bc:12, pc:0,  yc:140, spml:5 },
    { id:'AF1081', cie:'AF', avion:'A320', sens:'RET', sta:6*60+10, bc:12, pc:0,  yc:150 },
    { id:'DL85',   cie:'DL', avion:'B777', sens:'RET', sta:7*60+40, bc:38, pc:40, yc:230 },
    { id:'AF1680', cie:'AF', avion:'A350', sens:'DEP', std:17*60+20,bc:32, pc:48, yc:205, spml:11 },
    { id:'BA315',  cie:'BA', avion:'A320', sens:'DEP', std:17*60+50,bc:16, pc:0,  yc:130, spml:5 },
    { id:'QR42',   cie:'QR', avion:'A350', sens:'DEP', std:18*60+30,bc:30, pc:44, yc:210, spml:10 },
    { id:'EK78',   cie:'EK', avion:'A380', sens:'DEP', std:19*60+0, bc:14, pc:76, yc:350, spml:20 },
    { id:'DL88',   cie:'DL', avion:'B777', sens:'DEP', std:19*60+40,bc:38, pc:40, yc:235, spml:15 },
    { id:'EK77',   cie:'EK', avion:'A380', sens:'RET', sta:16*60+30,bc:14, pc:76, yc:340 },
    { id:'QR41',   cie:'QR', avion:'A350', sens:'RET', sta:17*60+10,bc:30, pc:44, yc:200 },
    { id:'AF1681', cie:'AF', avion:'A350', sens:'RET', sta:18*60+0, bc:32, pc:48, yc:205 },
    { id:'DL89',   cie:'DL', avion:'B777', sens:'RET', sta:18*60+50,bc:38, pc:40, yc:235 }
  ];

  /* Barème d'homme-minutes par passager, par classe et par atelier. NON CALIBRÉ. */
  function chargeVol(f) {
    const bc = f.bc || 0, pc = f.pc || 0, yc = f.yc || 0, pax = bc + pc + yc;
    return {
      food: { appros: bc*0.6 + pc*0.35 + yc*0.12, decontam: pax*0.05,
              cuisine: bc*1.4 + pc*0.7 + yc*0.28, prepa: bc*2.2 + pc*1.1 + pax*0.06, robot: yc },
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
    ATELIERS.forEach(id => {
      const capacite = id === 'plonge' ? capacitePlonge(cfg) : Math.max(0, (cfg.staff[id] | 0));
      const contenance = cfg.tampons && cfg.tampons[id] > 0 ? cfg.tampons[id] : Infinity;
      stations[id] = {
        id, capacite,
        ressource: capacite > 0 ? new Ressource(env, capacite, { nom: id }) : null,
        tampon: new Tampon(env, { nom: id, capacite: contenance }),
        glissante: new Glissante(FENETRE),
        // vue lue par l'interface
        util: 0, qlen: 0, enAttente: 0, bloque: false, tauxJour: 0,
        robotUtil: 0, robotAttente: 0, robotTauxJour: 0   // renseignés sur le montage seulement
      };
    });
    const robot = new Ressource(env, 1, { nom: 'robot' });
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
      released: false, done: false, stationId: null, color: COULEURS[kind]
    });
    flights.forEach(f => {
      const c = chargeVol(f);
      if (f.sens === 'DEP') {
        const std = (f.std || 0) + cfg.shift;
        f.due = std - cfg.loadDelay; f.readyTime = null; f.retard = 0;
        f.foodDone = f.dotDone = f.armDone = false;
        jobs.push(mkJob(f, 'food', ROUTES.food, c.food, c.food.robot, std - 200));
        jobs.push(mkJob(f, 'dot', ROUTES.dot, { dotation: c.dotation }, 0, std - 175));
        jobs.push(mkJob(f, 'arm', ROUTES.arm, { armement: c.armement }, 0, std - 175));
      } else {
        jobs.push(mkJob(f, 'plonge', ROUTES.plonge, { plonge: c.plonge }, 0, (f.sta || 0) + cfg.shift));
      }
    });

    /** Un événement qui ne se résout jamais : un atelier sans personne ne finit rien. */
    const jamais = env.evenement('capacité nulle');

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
    const lot = (st, j, l) => env.processus(function* (e) {
      const place = st.ressource.demander({ priorite: j.dueT });
      yield place;
      try { yield e.delai(dureeLot(st.id, l)); }
      finally { st.ressource.liberer(place); }
    }, st.id + ' lot');

    /** Le robot dresse les plateaux YC d'un vol, un vol à la fois. */
    const dressageRobot = j => env.processus(function* (e) {
      const place = robot.demander({ priorite: j.dueT });
      yield place;
      try { yield e.delai(j.robot / cadenceRobot()); }
      finally { robot.liberer(place); }
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
      j.released = true; j.stationId = j.route[0];
      spawnEntree(j);
      yield stations[j.route[0]].tampon.deposer(j);

      for (let k = 0; k < j.route.length; k++) {
        const id = j.route[k], st = stations[id];
        j.stationId = id;
        const travail = j.work[id] || 0;
        const taches = [];
        if (travail > 0) {
          if (st.ressource) decouper(travail).forEach(l => taches.push(lot(st, j, l)));
          else taches.push(jamais);
        }
        if (id === 'prepa' && j.robot > 0) taches.push(dressageRobot(j));
        if (taches.length) yield e.tousDe(taches);

        if (k + 1 < j.route.length) {
          const suivant = j.route[k + 1];
          yield stations[suivant].tampon.deposer(j);      // BLOQUE si l'aval est plein
          yield st.tampon.prendre(x => x === j);
          surToken(id + '_' + suivant, j.color);
        } else {
          yield st.tampon.prendre(x => x === j);
        }
      }
      finaliser(j);
      j.done = true;
    }, j.flight.id + ' ' + j.kind));

    /* ---- vue pour l'interface ---- */
    function rafraichir(dt) {
      ATELIERS.forEach(id => {
        const st = stations[id], r = st.ressource;
        const occ = r ? r.occupees / r.capacite : 0;
        if (dt > 0) st.glissante.noter(occ, dt);
        st.util = st.glissante.valeur;
        st.qlen = st.tampon.remplissageCourant + st.tampon.depotsEnAttente;
        st.enAttente = r ? r.enAttente : (st.qlen > 0 ? st.qlen : 0);
        st.bloque = st.tampon.bloque;
        st.tauxJour = r ? (r.tauxOccupation() || 0) : 0;
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
    function goulot() {
      let best = null;
      const retenir = cand => {
        if (!best || cand.attente > best.attente || (cand.attente === best.attente && cand.sev > best.sev)) best = cand;
      };
      ATELIERS.forEach(id => {
        const st = stations[id];
        const attente = st.enAttente + (st.bloque ? st.tampon.depotsEnAttente : 0);
        if (attente <= 0 && !st.bloque) return;
        retenir({ id, sev: Math.min(1, st.util), qlen: st.qlen, attente,
                  cause: st.bloque ? 'tampon saturé' : (st.ressource ? 'personnes occupées' : 'aucune personne') });
      });
      // Le robot n'est pas un atelier mais c'est une place unique : des vols
      // qui l'attendent au montage sont un goulot au même titre.
      if (robot.enAttente > 0) {
        retenir({ id: 'prepa', sev: Math.min(1, robotGlissante.valeur), qlen: stations.prepa.qlen,
                  attente: robot.enAttente, cause: 'robot occupé (' + robot.enAttente + ' vol(s) en file)' });
      }
      return best;
    }

    /** Résumé mesuré de la journée, pour l'export et la comparaison A/B. */
    function bilan() {
      const ateliers = {};
      ATELIERS.forEach(id => {
        const st = stations[id], r = st.ressource;
        ateliers[id] = {
          personnes: st.capacite,
          occupationJour: r ? r.tauxOccupation() : null,
          attenteMoyenne: r ? r.attente.moyenne() : null,
          attenteP90: r ? r.attente.percentile(90) : null,
          ofMoyens: st.tampon.remplissage.moyenne(),
          partBloquante: st.tampon.partBloquante()
        };
      });
      return {
        ateliers,
        robot: { cadence: cfg.robotCadence, occupationJour: robot.tauxOccupation(), attenteMoyenne: robot.attente.moyenne(), attenteP90: robot.attente.percentile(90) }
      };
    }

    rafraichir(0);
    return { env, flights, jobs, stations, robot, ATELIERS, avancerA, debitRobot, goulot, bilan,
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

  return { CFG_DEFAUT, JEU_DEMO, ROUTES, ATELIERS, LOT, FENETRE, chargeVol, capacitePlonge, construireModele, simulerJournee };
});

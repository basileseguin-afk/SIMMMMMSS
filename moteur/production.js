/* ==========================================================================
 *  PRODUCTION PAR ATELIERS DE TRAVAIL — cœur du modèle
 *  ------------------------------------------------------------------------
 *  Ce module remplace l'ancien modèle par postes et files d'attente. Il repose
 *  sur trois objets, et trois seulement.
 *
 *  1. La COMPAGNIE × CLASSE. Déduite du programme de vols : CRL/BC, AF/YC…
 *     C'est l'unité de fabrication. Elle porte un nombre de passagers, les vols
 *     qui la composent et l'échéance la plus serrée d'entre eux.
 *
 *  2. L'ATELIER DE TRAVAIL. Une équipe dans un service : une heure de début,
 *     un effectif, et une liste ORDONNÉE de lots à fabriquer. Le premier lot
 *     commence à l'heure de début ; chacun des suivants quand le précédent est
 *     fini. L'atelier n'occupe aucune place dans l'espace : ce qu'il faut
 *     savoir de lui, c'est ce qu'il fait, quand, et à combien.
 *
 *  3. LE PARCOURS. Une compagnie × classe n'est pas une ligne mais un
 *     assemblage : sa part food vient des appros, son matériel du magasin et
 *     des retours de dotation, son armement de l'armement — et tout cela
 *     converge. Ce parcours n'est PAS inventé ici : il se lit dans le graphe
 *     des liaisons que l'utilisateur entretient dans le Centre des flux. Un
 *     service ne peut travailler un lot que lorsque TOUS ses fournisseurs dans
 *     ce graphe ont livré les classes de ce lot.
 *
 *  Ce que le modèle NE fait pas, et c'est délibéré : il ne choisit pas les
 *  heures de début, il ne répartit pas le travail, il n'invente pas de file
 *  d'attente. L'utilisateur décide ; le modèle calcule les conséquences et
 *  nomme ce qui ne tient pas.
 *
 *  BARÈME : les minutes par passager ci-dessous sont des valeurs d'attente,
 *  NON CALIBRÉES, en place pour que le modèle tourne. Elles sont isolées dans
 *  une table unique afin d'être remplacées en bloc par l'étude à venir.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const Noyau = (typeof module !== 'undefined' && module.exports)
    ? require('./noyau.js') : root.MoteurNoyau;

  const { Environnement } = Noyau;

  /* ======================================================================
   *  1. TEMPS
   * ====================================================================*/

  const MINUTES_PAR_JOUR = 1440;

  /** « 06:30 » → 390. Accepte déjà un nombre de minutes. */
  function minutes(valeur) {
    if (typeof valeur === 'number' && Number.isFinite(valeur)) return valeur;
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(valeur || '').trim());
    if (!m) throw new Error('Heure attendue au format HH:MM, reçu : ' + valeur);
    const h = +m[1], mn = +m[2];
    if (h > 47 || mn > 59) throw new Error('Heure hors limites : ' + valeur);
    return h * 60 + mn;
  }

  /** 390 → « 06:30 ». Les heures au-delà de 24:00 restent lisibles. */
  function hhmm(t) {
    if (t == null || !Number.isFinite(t)) return '—';
    const j = Math.floor(t / MINUTES_PAR_JOUR), reste = t - j * MINUTES_PAR_JOUR;
    const h = String(Math.floor(reste / 60)).padStart(2, '0');
    const m = String(Math.round(reste % 60)).padStart(2, '0');
    return (j ? (j > 0 ? 'J+' + j + ' ' : 'J' + j + ' ') : '') + h + ':' + m;
  }

  /* ======================================================================
   *  2. COMPAGNIES × CLASSES
   * ====================================================================*/

  const CABINES = ['BC', 'PC', 'YC'];
  const CHAMP_PAX = { BC: 'bc', PC: 'pc', YC: 'yc' };

  const idClasse = (cie, cabine) => String(cie).trim().toUpperCase() + '/' + cabine;

  /**
   * Les compagnies × classes présentes dans un programme de vols.
   * Seuls les départs fabriquent : un retour ne crée pas de classe à produire.
   * `delaiChargement` recule l'échéance par rapport à l'heure de départ.
   */
  function classesDeVols(vols, options) {
    const o = options || {};
    const delai = o.delaiChargement === undefined ? 45 : o.delaiChargement;
    const parId = new Map();
    for (const v of vols || []) {
      if (v.sens && v.sens !== 'DEP') continue;
      const depart = v.std === undefined ? v.heure : v.std;
      if (!Number.isFinite(depart)) continue;
      for (const cabine of CABINES) {
        const pax = v[CHAMP_PAX[cabine]] || 0;
        if (pax <= 0) continue;
        const id = idClasse(v.cie, cabine);
        let c = parId.get(id);
        if (!c) {
          c = { id, cie: String(v.cie).trim().toUpperCase(), cabine, pax: 0, vols: [], echeance: Infinity };
          parId.set(id, c);
        }
        c.pax += pax;
        c.vols.push({ id: v.id, pax, depart, echeance: depart - delai });
        c.echeance = Math.min(c.echeance, depart - delai);
      }
    }
    return [...parId.values()].sort((a, b) => a.echeance - b.echeance || a.id.localeCompare(b.id));
  }

  /* ======================================================================
   *  3. BARÈME — table unique, remplaçable en bloc
   * ====================================================================*/

  /* Minutes de travail humain par passager, et minutes fixes par vol (mise en
   * route, trolley, contrôle). Par service et par cabine. VALEURS D'ATTENTE. */
  const BAREME_DEMO = {
    appros:   { BC: { parPax: 0.60, parVol: 0 }, PC: { parPax: 0.35, parVol: 0 }, YC: { parPax: 0.12, parVol: 0 } },
    decontam: { BC: { parPax: 0.05, parVol: 0 }, PC: { parPax: 0.05, parVol: 0 }, YC: { parPax: 0.05, parVol: 0 } },
    cuisine:  { BC: { parPax: 1.40, parVol: 0 }, PC: { parPax: 0.70, parVol: 0 }, YC: { parPax: 0.28, parVol: 0 } },
    prepa:    { BC: { parPax: 2.20, parVol: 5 }, PC: { parPax: 1.10, parVol: 5 }, YC: { parPax: 0.35, parVol: 5 } },
    dotation: { BC: { parPax: 0.50, parVol: 0 }, PC: { parPax: 0.30, parVol: 0 }, YC: { parPax: 0.12, parVol: 0 } },
    armement: { BC: { parPax: 0.08, parVol: 5 }, PC: { parPax: 0.08, parVol: 5 }, YC: { parPax: 0.08, parVol: 5 } },
    magasin:  { BC: { parPax: 0.10, parVol: 0 }, PC: { parPax: 0.08, parVol: 0 }, YC: { parPax: 0.04, parVol: 0 } },
    plonge:   { BC: { parPax: 0.90, parVol: 0 }, PC: { parPax: 0.90, parVol: 0 }, YC: { parPax: 0.90, parVol: 0 } }
  };

  /** Rendement : part du temps de présence réellement produite. 1 = idéal. */
  const RENDEMENT_DEMO = 1;

  /** Homme-minutes d'une classe dans un service, d'après le barème. */
  function travailClasse(service, classe, bareme) {
    const table = (bareme || BAREME_DEMO)[service];
    if (!table) return 0;
    const b = table[classe.cabine];
    if (!b) return 0;
    const parPax = b.parPax || 0, parVol = b.parVol || 0;
    return classe.pax * parPax + classe.vols.length * parVol;
  }

  /* ======================================================================
   *  4. PARCOURS — lu dans le graphe des liaisons
   * ====================================================================*/

  /**
   * Fournisseurs directs de chaque service, d'après les liaisons.
   * `liaisons` : [{from, to}] entre identifiants de service. Les liaisons de
   * retour (quais → plonge) font partie du graphe : c'est à l'appelant de ne
   * transmettre que ce qui alimente la fabrication.
   */
  function fournisseurs(liaisons) {
    const par = {};
    for (const l of liaisons || []) {
      if (!l || !l.from || !l.to || l.from === l.to) continue;
      (par[l.to] || (par[l.to] = [])).push(l.from);
    }
    for (const k of Object.keys(par)) par[k] = [...new Set(par[k])];
    return par;
  }

  /**
   * Un cycle dans le graphe bloquerait la fabrication sans jamais rien dire.
   * On le détecte une fois pour toutes, en ne gardant que les services qui
   * portent réellement du travail.
   */
  function cycles(fourn, services) {
    const vus = new Map(), chemin = [], trouves = [];
    const visiter = s => {
      if (vus.get(s) === 'fini') return;
      if (vus.get(s) === 'encours') {
        trouves.push(chemin.slice(chemin.indexOf(s)).concat(s));
        return;
      }
      vus.set(s, 'encours'); chemin.push(s);
      for (const p of (fourn[s] || [])) if (services.has(p)) visiter(p);
      chemin.pop(); vus.set(s, 'fini');
    };
    for (const s of services) visiter(s);
    return trouves;
  }

  /* ======================================================================
   *  5. ATELIERS — validation
   * ====================================================================*/

  const TYPES = ['manuel', 'robot'];

  /**
   * Relit une liste d'ateliers et rassemble TOUTES les anomalies, plutôt que
   * de s'arrêter à la première : on veut pouvoir tout corriger d'un coup.
   */
  function validerAteliers(ateliers, contexte) {
    const c = contexte || {};
    const services = new Set(c.services || []);
    const classes = new Set((c.classes || []).map(x => (typeof x === 'string' ? x : x.id)));
    const anomalies = [], ids = new Set();

    if (!Array.isArray(ateliers)) return [{ code: 'liste', message: 'Liste d’ateliers attendue.' }];

    for (const a of ateliers) {
      const ou = (a && a.nom) || (a && a.id) || 'atelier sans nom';
      const dire = (code, message) => anomalies.push({ code, atelier: a && a.id, message: ou + ' : ' + message });

      if (!a || typeof a !== 'object') { anomalies.push({ code: 'atelier', message: 'Atelier invalide.' }); continue; }
      if (typeof a.id !== 'string' || !a.id) dire('id', 'identifiant manquant.');
      else if (ids.has(a.id)) dire('id', 'identifiant en double.'); else ids.add(a.id);
      if (typeof a.nom !== 'string' || !a.nom.trim()) dire('nom', 'nommez-le : c’est ce qui le rend lisible.');
      if (services.size && !services.has(a.service)) dire('service', 'service inconnu « ' + a.service + ' ».');
      if (a.type !== undefined && !TYPES.includes(a.type)) dire('type', 'type inconnu « ' + a.type + ' ».');

      try { minutes(a.debut); } catch (e) { dire('debut', e.message); }

      const robot = a.type === 'robot';
      const gens = a.personnes;
      if (!Number.isInteger(gens) || gens < 0) dire('personnes', 'nombre de personnes entier attendu.');
      else if (!robot && gens === 0) dire('personnes', 'sans personne, rien n’est fabriqué.');

      if (robot) {
        if (!(a.debit > 0)) dire('debit', 'débit attendu, en plateaux par heure.');
        const mini = a.personnesMin === undefined ? 1 : a.personnesMin;
        if (!Number.isInteger(mini) || mini < 0) dire('personnesMin', 'effectif minimum entier attendu.');
        else if (Number.isInteger(gens) && gens < mini)
          dire('personnesMin', gens + ' personne(s) pour un minimum de ' + mini + ' : le robot ne tourne pas.');
      }

      for (const p of (a.pauses || [])) {
        try {
          if (minutes(p.de) >= minutes(p.a)) dire('pause', 'une pause doit finir après avoir commencé.');
        } catch (e) { dire('pause', e.message); }
      }

      if (!Array.isArray(a.lots) || !a.lots.length) dire('lots', 'aucun lot à fabriquer.');
      else for (const lot of a.lots) {
        const liste = Array.isArray(lot) ? lot : (lot && lot.classes);
        if (!Array.isArray(liste) || !liste.length) { dire('lot', 'un lot doit porter au moins une compagnie × classe.'); continue; }
        for (const id of liste) if (classes.size && !classes.has(id)) dire('lot', 'compagnie × classe absente du programme : ' + id + '.');
      }
    }

    // Une même classe fabriquée deux fois dans le même service : sans règle de
    // répartition, le modèle ne peut pas trancher. On le dit plutôt que de choisir.
    const vu = new Map();
    for (const a of ateliers) {
      if (!a || !a.service) continue;
      for (const lot of (a.lots || [])) {
        for (const id of (Array.isArray(lot) ? lot : (lot && lot.classes) || [])) {
          const cle = a.service + '|' + id, premier = vu.get(cle);
          if (premier && premier !== a.id) {
            anomalies.push({ code: 'doublon', atelier: a.id,
              message: id + ' est fabriqué deux fois dans « ' + a.service + ' ». Un service, une classe, un atelier.' });
          } else vu.set(cle, a.id);
        }
      }
    }
    return anomalies;
  }

  /* ======================================================================
   *  6. TRAVAIL DANS LE TEMPS — pauses
   * ====================================================================*/

  /** Pauses triées et fusionnées, en minutes absolues du jour de l'atelier. */
  function pausesDe(atelier) {
    const j = (atelier.jour || 0) * MINUTES_PAR_JOUR;
    const brutes = (atelier.pauses || [])
      .map(p => ({ de: minutes(p.de) + j, a: minutes(p.a) + j }))
      .filter(p => p.a > p.de)
      .sort((x, y) => x.de - y.de);
    const out = [];
    for (const p of brutes) {
      const dernier = out[out.length - 1];
      if (dernier && p.de <= dernier.a) dernier.a = Math.max(dernier.a, p.a);
      else out.push({ ...p });
    }
    return out;
  }

  /**
   * Instant d'achèvement d'une tâche de `duree` minutes de travail effectif
   * commencée à `depart`, en sautant les pauses. Retourne aussi le temps passé
   * à l'arrêt : c'est ce qui explique un écart entre durée et temps écoulé.
   */
  function finAvecPauses(depart, duree, pauses) {
    let t = depart, reste = duree, arret = 0;
    if (reste <= 0) return { fin: t, arret: 0 };
    for (let garde = 0; garde < 1000; garde++) {
      const p = pauses.find(p => t >= p.de && t < p.a);
      if (p) { arret += p.a - t; t = p.a; continue; }
      const suivante = pauses.find(p => p.de > t);
      const dispo = suivante ? suivante.de - t : Infinity;
      if (reste <= dispo) return { fin: t + reste, arret };
      reste -= dispo; t = suivante.a; arret += suivante.a - suivante.de;
    }
    throw new Error('Trop de pauses pour achever une tâche.');
  }

  /* ======================================================================
   *  7. SIMULATION
   * ====================================================================*/

  const classesDuLot = lot => (Array.isArray(lot) ? lot : (lot && lot.classes) || []);

  /**
   * Joue la journée.
   *
   * @param {object} p
   *   vols      — programme de vols
   *   ateliers  — ateliers de travail
   *   liaisons  — [{from,to}] entre services, lues du Centre des flux
   *   bareme    — table des minutes (défaut : BAREME_DEMO)
   *   rendement — part du temps réellement produite (défaut : 1)
   *   delaiChargement — minutes entre échéance et départ (défaut : 45)
   */
  function simuler(p) {
    const opts = p || {};
    const bareme = opts.bareme || BAREME_DEMO;
    const rendement = opts.rendement === undefined ? RENDEMENT_DEMO : opts.rendement;
    if (!(rendement > 0)) throw new Error('Le rendement doit être strictement positif.');

    const classes = classesDeVols(opts.vols, { delaiChargement: opts.delaiChargement });
    const parClasse = new Map(classes.map(c => [c.id, c]));
    const ateliers = (opts.ateliers || []).map(a => ({ ...a, type: a.type || 'manuel' }));

    const services = new Set(ateliers.map(a => a.service));
    const anomalies = validerAteliers(ateliers, { services: opts.services || [...services], classes });
    const fourn = fournisseurs(opts.liaisons);
    for (const c of cycles(fourn, services)) {
      anomalies.push({ code: 'cycle', message: 'Les liaisons bouclent : ' + c.join(' → ') + '. La fabrication ne pourrait jamais commencer.' });
    }
    const bloquant = anomalies.some(a => a.code !== 'doublon');
    if (bloquant) return { ok: false, anomalies, classes, lots: [], ateliers: [] };

    const debuts = ateliers.map(a => minutes(a.debut) + (a.jour || 0) * MINUTES_PAR_JOUR);
    const env = new Environnement(debuts.length ? Math.min(...debuts) : 0);

    // Livraisons : un événement par (service, classe), créé à la demande.
    const livraisons = new Map();
    const cle = (service, classe) => service + '|' + classe;
    const livraison = (service, classe) => {
      const k = cle(service, classe);
      let ev = livraisons.get(k);
      if (!ev) { ev = env.evenement('livre ' + k); livraisons.set(k, ev); }
      return ev;
    };

    // Un service ne produit une classe que si un atelier la lui a confiée :
    // sinon il ne fait pas partie du parcours de cette classe et n'est pas
    // attendu. C'est ce qui permet à un parcours d'être différent par classe.
    const produit = new Set();
    for (const a of ateliers) for (const lot of a.lots) for (const id of classesDuLot(lot)) produit.add(cle(a.service, id));

    const journal = [];   // une ligne par lot : ce que l'on affichera
    const suivi = ateliers.map(a => ({ id: a.id, nom: a.nom, service: a.service, type: a.type,
      debut: minutes(a.debut) + (a.jour || 0) * MINUTES_PAR_JOUR, personnes: a.personnes,
      fin: null, travail: 0, attente: 0, arret: 0, lots: [] }));
    const parId = new Map(suivi.map(s => [s.id, s]));

    for (const a of ateliers) {
      const vue = parId.get(a.id);
      const pauses = pausesDe(a);
      const depart = vue.debut;

      env.processus(function* () {
        if (env.maintenant < depart) yield env.delai(depart - env.maintenant);
        let horloge = depart;

        for (const lot of a.lots) {
          const ids = classesDuLot(lot);
          const nom = ids.join(' + ');

          // Attendre que TOUS les fournisseurs aient livré TOUTES les classes
          // du lot. C'est ici que les branches food, matériel et armement se
          // rejoignent : on ne choisit pas laquelle, on les attend toutes.
          const attendus = [];
          for (const id of ids) {
            for (const amont of (fourn[a.service] || [])) {
              if (produit.has(cle(amont, id))) attendus.push(livraison(amont, id));
            }
          }
          const debutAttente = env.maintenant;
          if (attendus.length) yield env.tousDe(attendus);
          const attente = env.maintenant - debutAttente;
          horloge = Math.max(horloge, env.maintenant);
          if (env.maintenant < horloge) yield env.delai(horloge - env.maintenant);

          // Contenu de travail du lot.
          const lots = ids.map(id => parClasse.get(id)).filter(Boolean);
          let duree, detail;
          if (a.type === 'robot') {
            const plateaux = lots.reduce((n, c) => n + c.pax, 0);
            const mini = a.personnesMin === undefined ? 1 : a.personnesMin;
            duree = a.personnes >= mini ? (plateaux / a.debit) * 60 : Infinity;
            detail = { plateaux, debit: a.debit };
          } else {
            const hommeMinutes = lots.reduce((n, c) => n + travailClasse(a.service, c, bareme), 0);
            duree = hommeMinutes / a.personnes / rendement;
            detail = { hommeMinutes };
          }
          if (!Number.isFinite(duree)) {
            journal.push({ atelier: a.id, service: a.service, nom, classes: ids, debut: env.maintenant,
              fin: null, duree: null, attente, arret: 0, impossible: true, ...detail });
            vue.lots.push(journal[journal.length - 1]);
            return;   // rien ne sortira de cet atelier : inutile d'enchaîner
          }

          const { fin, arret } = finAvecPauses(env.maintenant, duree, pauses);
          const debutLot = env.maintenant;
          yield env.delai(fin - env.maintenant);

          // Si deux ateliers du même service fabriquent la même classe — une
          // anomalie déjà signalée — c'est la première livraison qui fait foi.
          // Le modèle ne se bloque pas sur une saisie que l'utilisateur corrigera.
          for (const id of ids) {
            const ev = livraison(a.service, id);
            if (!ev.declenche) ev.reussir(env.maintenant);
          }

          const ligne = { atelier: a.id, service: a.service, nom, classes: ids,
            debut: debutLot, fin: env.maintenant, duree, attente, arret, impossible: false, ...detail };
          journal.push(ligne); vue.lots.push(ligne);
          vue.travail += duree; vue.attente += attente; vue.arret += arret;
          vue.fin = env.maintenant;
          horloge = env.maintenant;
        }
      }, a.nom);
    }

    env.executer();

    /* ---- ce qu'il faut en retenir ------------------------------------ */

    const finDe = (service, id) => {
      const l = journal.find(x => x.service === service && x.classes.includes(id));
      return l ? l.fin : null;
    };
    const derniers = {};   // dernier service du parcours de chaque classe
    for (const c of classes) {
      const etapes = journal.filter(l => l.classes.includes(c.id));
      const fin = etapes.length && etapes.every(l => l.fin != null)
        ? Math.max(...etapes.map(l => l.fin)) : null;
      derniers[c.id] = {
        id: c.id, cie: c.cie, cabine: c.cabine, pax: c.pax, vols: c.vols.length,
        echeance: c.echeance, fin,
        services: etapes.map(l => l.service),
        retard: fin == null ? null : Math.max(0, fin - c.echeance),
        aHeure: fin != null && fin <= c.echeance,
        absente: !etapes.length
      };
    }

    const suivies = Object.values(derniers).filter(c => !c.absente);
    const aHeure = suivies.filter(c => c.aHeure).length;
    const retards = suivies.filter(c => c.retard != null).map(c => c.retard);

    return {
      ok: true,
      anomalies,
      classes,
      ateliers: suivi,
      lots: journal.sort((a, b) => a.debut - b.debut),
      parClasse: derniers,
      indicateurs: {
        classesSuivies: suivies.length,
        classesAbsentes: Object.values(derniers).filter(c => c.absente).length,
        aHeure,
        partAHeure: suivies.length ? Math.round(aHeure / suivies.length * 100) : null,
        retardMoyen: retards.length ? retards.reduce((a, b) => a + b, 0) / retards.length : null,
        retardMax: retards.length ? Math.max(...retards) : null,
        finDerniere: journal.length ? Math.max(...journal.map(l => l.fin == null ? -Infinity : l.fin)) : null,
        attenteTotale: journal.reduce((n, l) => n + l.attente, 0),
        hommeHeures: journal.reduce((n, l) => n + (l.hommeMinutes || 0), 0) / 60
      },
      finDe
    };
  }

  /* ======================================================================
   *  8. EXPORT
   * ====================================================================*/

  const api = {
    MINUTES_PAR_JOUR, CABINES, TYPES,
    minutes, hhmm, idClasse,
    classesDeVols, BAREME_DEMO, RENDEMENT_DEMO, travailClasse,
    fournisseurs, cycles, validerAteliers,
    pausesDe, finAvecPauses,
    simuler
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MoteurProduction = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

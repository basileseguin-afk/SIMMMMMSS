/* ==========================================================================
 *  CE QUE LA VUE EN DIRECT LIT DE LA JOURNÉE (évolution 16, v1)
 *  ------------------------------------------------------------------------
 *  La vue en direct ne calcule rien : elle LIT le résultat de la journée
 *  (moteur/production.js), ses indicateurs de charge (moteur/indicateurs.js)
 *  et ses réponses (moteur/reponses.js), à l'heure rejouée. Ce module, sans
 *  navigateur, range ce qu'elle y lit :
 *    — les personnes de chaque équipe, par état, en nombres entiers : celles
 *      des créneaux de 15 minutes des indicateurs (au travail, en pause, sans
 *      travail, en appui) ;
 *    — les lots qui attendent devant chaque service : les séjours en stock du
 *      résultat (de, vers, entrée, sortie).
 *  Aucune règle, aucun seuil n'est ajouté ici.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const PAS = 15, JOUR = 1440;
  /** Les états d'une personne, dans l'ordre où ils se partagent les présents. */
  const ETATS = ['auTravail', 'enPause', 'sansTravail', 'enAppui'];

  /** La valeur d'une série de créneaux ({ debut, valeurs }) à la minute `t` de son horloge ; 0 hors de la série. */
  function valeurA(serie, t) {
    if (!serie || !Array.isArray(serie.valeurs)) return 0;
    const i = Math.floor((t - serie.debut) / PAS);
    return i >= 0 && i < serie.valeurs.length ? serie.valeurs[i] || 0 : 0;
  }

  /**
   * `total` personnes entières réparties selon des parts (des nombres ≥ 0) : chacune reçoit sa part entière, et les
   * personnes qui restent vont aux plus grands restes (à égalité, la première). La somme rendue est toujours `total`.
   */
  function repartir(total, parts) {
    const n = Math.max(0, Math.round(total)), somme = parts.reduce((s, x) => s + Math.max(0, x || 0), 0);
    if (!n) return parts.map(() => 0);
    if (!(somme > 0)) return parts.map((_, i) => (i === 0 ? n : 0));
    const voulu = parts.map(x => Math.max(0, x || 0) * n / somme), out = voulu.map(Math.floor);
    const restes = voulu.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((p, q) => q.r - p.r || p.i - q.i);
    for (let k = 0, reste = n - out.reduce((s, x) => s + x, 0); k < reste; k++) out[restes[k % restes.length].i]++;
    return out;
  }

  /**
   * Les personnes d'une équipe à l'heure `t` (minutes du jour J, l'horloge du rejeu), par état, en nombres entiers :
   * { presents, auTravail, enPause, sansTravail, enAppui }. `equipe` : une équipe des indicateurs (ses créneaux sont sur
   * l'horloge de son jour de travail). Les présents sont ceux du créneau, arrondis ; ils se partagent entre les états
   * selon le créneau. Une équipe sans mesure d'occupation (un appui, une mise à disposition, un handling) est « en appui ».
   */
  function personnesDe(equipe, t) {
    const c = (equipe && equipe.creneaux) || {}, local = t - ((equipe && equipe.jour) || 0) * JOUR;
    const presents = Math.round(valeurA(c.presents, local));
    const vide = { presents, auTravail: 0, enPause: 0, sansTravail: 0, enAppui: 0 };
    if (!presents) return vide;
    if (!c.auTravail) return { ...vide, enAppui: presents };
    const auTravail = valeurA(c.auTravail, local), enPause = valeurA(c.enPause, local);
    const sans = Math.max(0, valeurA(c.presents, local) - auTravail - enPause);
    const [a, p, s] = repartir(presents, [auTravail, enPause, sans]);
    // Rien de mesuré dans ce créneau (une présence sans travail ni pause) : sans travail.
    return auTravail + enPause + sans > 0 ? { ...vide, auTravail: a, enPause: p, sansTravail: s } : { ...vide, sansTravail: presents };
  }

  /**
   * Les lots qui attendent devant chaque service à `t` : { service: { lots, repas } }, d'après les séjours en stock du
   * résultat. Une commande compte une fois, même livrée par deux services ; `chargement` : ce qui est prêt avant d'être chargé.
   */
  function lotsEnAttente(resultat, t) {
    const out = {}, vus = new Map();
    for (const s of ((resultat && resultat.stocks && resultat.stocks.sejours) || [])) {
      if (!(t >= s.entree && t < s.sortie)) continue;
      const k = s.vers + '|' + s.classe + '|' + (s.vol ?? '');
      if (vus.has(k)) continue;
      vus.set(k, s);
      const o = out[s.vers] || (out[s.vers] = { lots: 0, repas: 0 });
      o.lots++; o.repas += s.repas || 0;
    }
    return out;
  }

  /**
   * La journée à l'heure `t` : { t, equipes: { id: personnes }, services: { id: personnes + lots + repas } }.
   * `journee` : { r, k } — le résultat et ses indicateurs.
   */
  function etatA(journee, t) {
    const k = journee && journee.k, r = journee && journee.r, equipes = {}, services = {};
    const service = id => services[id] || (services[id] = { presents: 0, auTravail: 0, enPause: 0, sansTravail: 0, enAppui: 0, lots: 0, repas: 0 });
    for (const e of (k && k.equipes) || []) {
      const p = personnesDe(e, t), s = service(e.service);
      equipes[e.id] = p;
      for (const m of ['presents', ...ETATS]) s[m] += p[m];
    }
    for (const [id, x] of Object.entries(lotsEnAttente(r, t))) { const s = service(id); s.lots = x.lots; s.repas = x.repas; }
    return { t, equipes, services };
  }

  /* ---- ce qui circule (évolution 16 d) -------------------------------------------------------------------------
   *  Les lots deviennent des chariots ; les tournées du handling, des véhicules ; les vols, des avions ; les retours
   *  sales rejoignent la plonge. Tout est lu dans le résultat de la journée : son journal des lots (début et fin de
   *  chaque lot), ses séjours en stock (de, vers, entrée, sortie), ses vols, ses tournées (trajet.depart, trajet.retour).
   * ---------------------------------------------------------------------------------------------------------------- */

  /** Le temps d'un trajet d'un chariot d'une zone à l'autre, en minutes rejouées ; avant son départ, un avion est là 3 h ; son décollage dure 3 min. */
  const MARCHE = 2, AVANT_DEPART = 180, DECOLLAGE = 3;
  /** Un chariot par tranche de repas : 50 d'ordinaire ; le double, autant de fois qu'il faut, pour ne pas dépasser 500 chariots en stock. */
  const TRANCHE = 50, CHARIOTS_MAX = 500;

  /** La tranche d'une journée : « un chariot = N repas » (ou N unités à laver). La même pour toute la journée. */
  function tranche(resultat) {
    const series = Object.values((resultat && resultat.stocks && resultat.stocks.parService) || {});
    const pics = series.map(serie => Math.max(0, ...serie.map(p => p[1] || 0)));
    let n = TRANCHE;
    while (pics.reduce((s, x) => s + Math.ceil(x / n), 0) > CHARIOTS_MAX) n *= 2;
    return n;
  }
  /** Les chariots d'un lot : un par tranche, un au moins. */
  const chariotsPour = (quantite, n) => Math.max(1, Math.ceil(Math.max(0, quantite || 0) / n));

  /** La nature d'une commande : de l'équipement (armement, dotation, roulés couverts — une catégorie d'équipement) ou des repas. */
  function natureDe(resultat, classe) {
    const c = ((resultat && resultat.classes) || []).find(x => x.id === classe);
    return (c && c.categorie) || /\/@/.test(String(classe)) ? 'equipement' : 'repas';
  }

  /**
   * Les lots en stock devant chaque service à `t` : { service: [{ de, vers, classe, vol, repas, chariots, nature, entree,
   * sortie, arrive }] }, les plus anciens d'abord. Une commande compte une fois, même livrée par deux services (sa
   * première livraison). `arrive` : de 0 à 1 pendant les deux minutes où le lot roule vers la file, 1 ensuite.
   * `chargement` : ce qui est prêt avant d'être chargé, sans handling.
   */
  function filesA(resultat, t, n) {
    const tr = n || tranche(resultat), vus = new Map();
    for (const s of ((resultat && resultat.stocks && resultat.stocks.sejours) || [])) {
      if (!(t >= s.entree && t < s.sortie)) continue;
      const k = s.vers + '|' + s.classe + '|' + (s.vol ?? ''), x = vus.get(k);
      if (!x || s.entree < x.entree) vus.set(k, s);
    }
    const out = {};
    for (const s of vus.values()) {
      (out[s.vers] || (out[s.vers] = [])).push({ de: s.de, vers: s.vers, classe: s.classe, vol: s.vol ?? null, repas: s.repas || 0, chariots: chariotsPour(s.repas, tr),
        nature: natureDe(resultat, s.classe), entree: s.entree, sortie: s.sortie, arrive: Math.min(1, (t - s.entree) / MARCHE) });
    }
    for (const l of Object.values(out)) l.sort((p, q) => p.entree - q.entree || String(p.classe).localeCompare(String(q.classe)) || String(p.vol).localeCompare(String(q.vol)));
    return out;
  }

  /** Les lots en cours à `t`, dans leur atelier (début et fin au planning) : [{ atelier, service, nom, classes, repas, chariots, nature, debut, fin, debit }]. */
  function lotsEnCours(resultat, t, n) {
    const tr = n || tranche(resultat), pax = new Map(((resultat && resultat.classes) || []).map(c => [c.id, +c.pax || 0])), out = [];
    for (const l of (resultat && resultat.lots) || []) {
      if (l.dispo || l.handling || l.retourVol) continue;
      // Une commande du robot en relais (évolution 21) est en cours pendant chaque part, dans l'atelier de l'équipe qui
      // la tient alors, avec les plateaux de cette part : la ligne tourne avec l'équipe qui avance, et ses plateaux
      // sortent à la fin de sa part.
      if (Array.isArray(l.parts)) {
        for (const p of l.parts) {
          if (!(p.travail > 0) || !(t >= p.debut && t < p.fin)) continue;
          out.push({ atelier: p.atelier, service: l.service, nom: l.nom, classes: l.classes || [], repas: p.plateaux || 0, chariots: chariotsPour(p.plateaux, tr), nature: natureDe(resultat, (l.classes || [])[0]),
            debut: p.debut, fin: p.fin, ...(Number.isFinite(l.debit) ? { debit: l.debit } : {}) });
        }
        continue;
      }
      if (!Number.isFinite(l.debut) || !Number.isFinite(l.fin) || !(t >= l.debut && t < l.fin)) continue;
      const repas = (l.classes || []).reduce((s, c) => s + (pax.get(c) || 0), 0);
      out.push({ atelier: l.atelier, service: l.service, nom: l.nom, classes: l.classes || [], repas, chariots: chariotsPour(repas, tr), nature: natureDe(resultat, (l.classes || [])[0]),
        debut: l.debut, fin: l.fin, ...(Number.isFinite(l.debit) ? { debit: l.debit } : {}) });
    }
    return out;
  }

  /**
   * Les tournées du handling en route à `t` : un véhicule par tournée (trajet.depart, trajet.retour), camion ou VL.
   * [{ cle, camion, vehicule, vols, phase, avance }] — `avance` de 0 (au quai) à 1 (aux avions) : l'aller, le chargement
   * au bord de la scène, le retour. Hors de son trajet, un véhicule n'est pas là.
   */
  function vehiculesA(resultat, t) {
    const vus = new Map();
    for (const l of (resultat && resultat.lots) || []) {
      const tr = l.trajet; if (!tr || !Number.isFinite(tr.depart) || !Number.isFinite(tr.retour) || !(t >= tr.depart && t <= tr.retour)) continue;
      const cle = (l.camion != null ? l.camion : l.tournee) + '|' + tr.depart;
      if (vus.has(cle)) continue;
      const aller = Math.max(0, +tr.aller || 0), retour = Math.max(0, +tr.dureeRetour || 0), arrive = tr.depart + aller, repart = tr.retour - retour;
      const phase = t < arrive ? 'aller' : t < repart ? 'charge' : 'retour';
      const avance = phase === 'aller' ? (aller ? (t - tr.depart) / aller : 1) : phase === 'charge' ? 1 : (retour ? (tr.retour - t) / retour : 0);
      vus.set(cle, { cle, camion: l.camion ?? null, vehicule: l.vehicule === 'vl' ? 'vl' : 'camion', service: l.service, vols: (tr.vols || [l.vol]).filter(Boolean), phase, avance: Math.max(0, Math.min(1, avance)), depart: tr.depart, retour: tr.retour });
    }
    return [...vus.values()].sort((a, b) => a.depart - b.depart || String(a.cle).localeCompare(String(b.cle)));
  }

  /**
   * Les vols de la journée : ceux que le handling charge (resultat.vols : départ, heure de chargement, retard), et ceux
   * des commandes qu'aucun handling ne charge (le départ seul : le résultat ne dit pas quand ils sont chargés). Un vol
   * compte une fois. [{ id, cie, depart, fin, retard, etat, charge }] — `charge` : le résultat dit son chargement.
   */
  function volsDe(resultat) {
    const vus = new Map();
    for (const v of (resultat && resultat.vols) || []) if (v && v.id != null && Number.isFinite(v.depart) && !vus.has(v.id)) vus.set(v.id, { id: v.id, cie: v.cie, depart: v.depart, fin: v.fin, retard: v.retard, etat: v.etat, charge: true });
    for (const c of (resultat && resultat.classes) || []) for (const v of (Array.isArray(c.vols) ? c.vols : [])) {
      if (v && v.id != null && Number.isFinite(v.depart) && !vus.has(v.id)) vus.set(v.id, { id: v.id, cie: c.cie, depart: v.depart, fin: null, retard: null, etat: null, charge: false });
    }
    return [...vus.values()];
  }

  /** Quand un vol décolle : à son départ ; chargé en retard, quand il est chargé ; jamais chargé par son handling, il reste. */
  const decollageDe = v => (v.charge === false ? v.depart : Number.isFinite(v.fin) ? Math.max(v.depart, v.fin) : Number.isFinite(v.retard) || v.etat === 'retard' || v.etat === 'impossible' ? Infinity : v.depart);

  /**
   * Les places des avions au bord de la scène : chaque vol garde la sienne de son arrivée (3 h avant son départ) à son
   * décollage ; une place libérée est reprise. Rend { places: Map(vol → n°), nombre } pour la journée entière.
   */
  function placesDesVols(resultat) {
    const vols = volsDe(resultat).map(v => ({ id: v.id, de: v.depart - AVANT_DEPART, a: decollageDe(v) + DECOLLAGE }))
      .sort((p, q) => p.de - q.de || String(p.id).localeCompare(String(q.id)));
    const libres = [], places = new Map();
    for (const v of vols) {
      let i = libres.findIndex(fin => fin <= v.de + 1e-9);
      if (i < 0) { i = libres.length; libres.push(0); }
      libres[i] = v.a; places.set(v.id, i);
    }
    return { places, nombre: libres.length };
  }

  /**
   * Les avions là à `t` : [{ id, cie, depart, charge, retard, enRetard, decolle, place }]. Un vol est là 3 h avant son
   * départ ; il décolle à son départ (`decolle` de 0 à 1 pendant le décollage). Chargé en retard, il attend : passé son
   * heure, `enRetard` est vrai et `retard` dit de combien (les minutes du résultat). Un vol qu'aucun handling ne charge
   * décolle à son départ : le résultat ne dit rien de son chargement, la scène non plus.
   */
  function volsA(resultat, t, places) {
    const p = places || placesDesVols(resultat), out = [];
    for (const v of volsDe(resultat)) {
      const part = decollageDe(v);
      if (!(t >= v.depart - AVANT_DEPART && t < part + DECOLLAGE)) continue;
      const tard = v.charge && ((Number.isFinite(v.retard) && v.retard > 0) || !Number.isFinite(v.fin));
      out.push({ id: v.id, cie: v.cie, depart: v.depart, charge: Number.isFinite(v.fin) ? v.fin : null, retard: Number.isFinite(v.retard) ? v.retard : null,
        enRetard: tard && t >= v.depart, decolle: t >= part ? Math.min(1, (t - part) / DECOLLAGE) : 0, place: p.places.get(v.id) ?? 0 });
    }
    return out.sort((a, b) => a.place - b.place);
  }

  /** Les parts d'un lavage : qui a lavé, de quand à quand, dans quel tunnel ; un lavage sans relais n'en a qu'une. */
  const partsDe = l => (Array.isArray(l.parts) && l.parts.length ? l.parts : Number.isFinite(l.debut) && Number.isFinite(l.fin) ? [{ atelier: l.atelier, debut: l.debut, fin: l.fin, nomTunnel: l.nomTunnel, tunnel: l.tunnel }] : []);

  /**
   * Les retours sales à `t` : [{ vol, cie, unites, chariots, etat, tunnel, atelier, arrive }], dans l'ordre de leur arrivée.
   * `etat` : « arrive » (il roule vers la plonge, `arrive` de 0 à 1), « file » (il attend devant la plonge), « lave »
   * (dans son tunnel — passé en relais, il y reste : seule l'équipe change), « arrete » (arrêté à une fin de présence,
   * devant son tunnel, jusqu'à sa reprise ; sans reprise, jusqu'au soir). Lavé, il n'est plus là.
   */
  function lavagesA(resultat, t, n) {
    const tr = n || tranche(resultat), out = [];
    for (const l of (resultat && resultat.lots) || []) {
      if (!l.retourVol || !Number.isFinite(l.arrivee) || t < l.arrivee - MARCHE) continue;
      const parts = partsDe(l).filter(x => Number.isFinite(x.debut) && Number.isFinite(x.fin)), base = { vol: l.vol, cie: l.cie, unites: l.unites || 0, chariots: chariotsPour(l.unites, tr) };
      if (t < l.arrivee) { out.push({ ...base, etat: 'arrive', arrive: (t - (l.arrivee - MARCHE)) / MARCHE, tunnel: null, atelier: null, quand: l.arrivee }); continue; }
      if (Number.isFinite(l.fin) && t >= l.fin) continue;
      const en = parts.find(x => t >= x.debut && t < x.fin), avant = parts.filter(x => x.fin <= t).pop();
      if (en) out.push({ ...base, etat: 'lave', tunnel: en.nomTunnel ?? null, atelier: en.atelier, quand: l.arrivee });
      else if (avant) out.push({ ...base, etat: 'arrete', tunnel: avant.nomTunnel ?? null, atelier: avant.atelier, depuis: avant.fin, quand: l.arrivee });
      else out.push({ ...base, etat: 'file', tunnel: null, atelier: null, quand: l.arrivee });
    }
    return out.sort((a, b) => a.quand - b.quand || String(a.vol).localeCompare(String(b.vol)));
  }

  /** Les tunnels qui lavent à `t` : leurs noms. Chaque tunnel s'anime quand il lave, et seulement lui. */
  const tunnelsQuiLavent = (resultat, t, n) => [...new Set(lavagesA(resultat, t, n).filter(x => x.etat === 'lave' && x.tunnel != null).map(x => x.tunnel))];

  /** Les ateliers robot au travail à `t`, avec leur cadence : [{ atelier, debit, lot }] (les plateaux par heure du lot en cours). */
  function robotsA(resultat, t) {
    const robots = new Set(((resultat && resultat.ateliers) || []).filter(a => a.type === 'robot').map(a => a.id));
    return lotsEnCours(resultat, t, 1).filter(l => robots.has(l.atelier)).map(l => ({ atelier: l.atelier, debit: l.debit ?? null, lot: l.nom }));
  }

  const api = { PAS, ETATS, valeurA, repartir, personnesDe, lotsEnAttente, etatA,
    MARCHE, AVANT_DEPART, DECOLLAGE, TRANCHE, tranche, chariotsPour, natureDe, filesA, lotsEnCours, vehiculesA, volsDe, decollageDe, placesDesVols, volsA, lavagesA, tunnelsQuiLavent, robotsA };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyDirectEtat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

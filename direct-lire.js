/* ==========================================================================
 *  LIRE LA VUE EN DIRECT (évolution 16 e, v1)
 *  ------------------------------------------------------------------------
 *  Ce que la scène dit de la journée à l'heure rejouée, sans navigateur :
 *    — la teinte du sol de chaque zone : neutre ; avertissement quand un
 *      arrivage y attend au-delà du seuil d'attente, ou que des personnes y
 *      travaillent après leur horaire ; critique quand le service est un
 *      goulot du jour et que l'heure est dans le moment où il coince ;
 *    — le goulot du moment, avec la phrase de la Synthèse ;
 *    — les moments à regarder (« Point suivant ») et l'heure d'ouverture ;
 *    — la barre du temps : les personnes au travail, les arrivages en
 *      attente, les départs des vols, les jours ;
 *    — le détail d'un service, et le vol suivi.
 *
 *  Rien n'est calculé ici : tout est LU dans le résultat de la journée
 *  (moteur/production.js), ses indicateurs de charge (moteur/indicateurs.js)
 *  et le module des réponses (moteur/reponses.js : `reponses` et `quand`).
 *  Aucune règle, aucun seuil nouveau : le seuil d'attente est celui des
 *  réglages (« Attente d'un arrivage ») ; un goulot est un goulot des
 *  réponses ; les mots sont ceux de la Synthèse (synthese-vue.js).
 *
 *  `journee` : { r, args, k, reponses } — le résultat, ses arguments, ses
 *  indicateurs, ses réponses. Les heures sont en minutes du jour J.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const E = () => (enNode ? require('./direct-etat.js') : root.OrlyDirectEtat);
  const REP = () => (enNode ? require('./moteur/reponses.js') : root.OrlyReponses);
  const SY = () => (enNode ? require('./synthese-vue.js') : root.OrlySyntheseVue);
  const P = () => (enNode ? require('./moteur/production.js') : root.MoteurProduction);

  const JOUR = 1440, EPS = 1e-9;
  const fini = x => Number.isFinite(x);
  const cleDe = x => x.service + '|' + (x.jour || 0);

  /** Des fenêtres [{ de, a }] réunies : celles qui se touchent n'en font qu'une ; dans l'ordre du temps. */
  function reunir(fenetres) {
    const l = fenetres.filter(f => fini(f.de) && fini(f.a) && f.a >= f.de).sort((p, q) => p.de - q.de || p.a - q.a), out = [];
    for (const f of l) {
      const d = out[out.length - 1];
      if (d && f.de <= d.a + EPS) d.a = Math.max(d.a, f.a); else out.push({ de: f.de, a: f.a });
    }
    return out;
  }
  const dansUne = (fenetres, t) => fenetres.some(f => t >= f.de - EPS && t < f.a - EPS);

  /** La phrase d'un goulot, celle de la Synthèse : « Montage : l'équipe … finit à hh:mm pour hh:mm », ou ce qu'il fait partir en retard. */
  function phraseDuGoulot(g, lignes) {
    const mot = REP().motDeLaLigne({ service: g.service, jour: g.jour || 0 }, lignes || []), sy = SY();
    const quoi = g.equipe ? sy.motsDeLEquipe(g.equipe) : sy.consequences(g, '', false);
    return g.nom + (mot ? ' (' + mot + ')' : '') + ' : ' + quoi;
  }

  /**
   * Ce qu'on lit une fois par journée : { seuil, fin, goulots, arrivages, horaires, points, ouverture }.
   *  - `goulots` : ceux des réponses, dans leur ordre, chacun avec les moments où il coince (`fenetres`) — après la fin
   *    d'horaire de l'équipe qui dépasse, jusqu'à sa fin ; autour de chaque lot par lequel une commande ou un vol part en
   *    retard, de son début à sa fin ; pour une plonge qui laisse plus que le matin ne peut laver, de la fin de son dernier
   *    lot à la fin de la journée —, son `debut` (le premier de ces moments) et sa `phrase` ;
   *  - `arrivages` : ceux qui attendent (moteur/reponses.js, `quand`), avec l'instant où leur attente passe le seuil ;
   *  - `horaires` : la fin d'horaire de chaque équipe (les réponses, question 3) ;
   *  - `points` : les moments à regarder, dans l'ordre — le début de chaque goulot, chaque chargement en retard —,
   *    ceux de la journée rejouée seulement (entre ses bornes) ;
   *  - `ouverture` : le moment où le premier goulot du jour commence à coincer — le premier, dans l'ordre des réponses,
   *    qui a un moment ; null s'il n'y en a pas.
   * `bornes` : { de, a } — la journée rejouée (sinon, celle des lots du résultat).
   */
  function lire(journee, bornes) {
    const vide = { seuil: null, de: 0, fin: JOUR, goulots: [], arrivages: [], horaires: new Map(), points: [], ouverture: null };
    const r = journee && journee.r, rep = journee && journee.reponses;
    if (!r || !rep) return vide;
    const heures = (r.lots || []).flatMap(l => [l.debut, l.fin, l.arrivee]).filter(fini);
    const de = bornes && fini(bornes.de) ? bornes.de : heures.length ? Math.min(...heures) : 0, fin = bornes && fini(bornes.a) ? bornes.a : heures.length ? Math.max(JOUR, ...heures) : JOUR;
    const q = REP().quand(r, journee.args, { k: journee.k, seuils: rep.seuils }) || { arrivages: [], enRetard: [] };
    const seuil = rep.seuils.attenteLot, lignes = rep.coince.services || [], finDe = new Map(((rep.fins && rep.fins.services) || []).map(f => [cleDe(f), f]));
    const goulots = (rep.coince.goulots || []).map((g, rang) => {
      const f = [];
      if (g.equipe && fini(g.equipe.finHoraire) && fini(g.equipe.fin)) f.push({ de: g.equipe.finHoraire, a: g.equipe.fin });
      for (const l of q.enRetard) if (l.service === g.service && (l.jour || 0) === (g.jour || 0) && fini(l.debut)) f.push({ de: l.debut, a: fini(l.fin) ? Math.max(l.fin, l.debut) : fin });
      if (g.lendemain && !f.length) { const x = finDe.get(cleDe(g)); if (x && fini(x.fin)) f.push({ de: x.fin, a: Math.max(fin, x.fin) }); }
      // Un lot sans durée (son début est sa fin) compte pour l'instant où il se fait : une minute, pour se voir.
      const fenetres = reunir(f.map(x => (x.a - x.de < 1 ? { de: x.de, a: x.de + 1 } : x)));
      return { service: g.service, nom: g.nom, jour: g.jour || 0, rang, cause: g.cause, enRetard: g.enRetard, depasse: g.depasse, equipe: g.equipe || null, fenetres,
        debut: fenetres.length ? fenetres[0].de : null, phrase: phraseDuGoulot(g, lignes) };
    });
    const arrivages = q.arrivages.map(a => ({ ...a, auDela: fini(seuil) && a.minutes > seuil + EPS ? a.de + seuil : null }));
    const horaires = new Map();
    for (const s of (rep.fins && rep.fins.services) || []) for (const e of s.equipes || []) if (fini(e.finHoraire)) horaires.set(e.id, e.finHoraire);
    // Les moments à regarder : le début de chaque goulot ; chaque chargement en retard (le début du chargement du vol).
    const points = [];
    for (const g of goulots) if (fini(g.debut)) points.push({ t: g.debut, quoi: 'goulot', service: g.service, jour: g.jour, texte: g.phrase });
    const charges = new Map((r.lots || []).filter(l => l.handling && l.vol != null).map(l => [l.vol, l]));
    for (const x of rep.exceptions || []) {
      if (x.type !== 'vol-en-retard' && x.type !== 'vol-pas-charge') continue;
      const l = charges.get(x.id), t = x.type === 'vol-en-retard' && l && fini(l.debut) ? l.debut : x.depart, m = SY().motsDeLException(x);
      if (fini(t)) points.push({ t, quoi: 'chargement', vol: x.id, texte: m.nom + ' ' + m.quoi });
    }
    points.sort((p, o) => p.t - o.t || (p.quoi === 'goulot' ? 0 : 1) - (o.quoi === 'goulot' ? 0 : 1) || String(p.service || p.vol).localeCompare(String(o.service || o.vol)));
    const premier = goulots.find(g => fini(g.debut));
    return { seuil, de, fin, goulots, arrivages, horaires, points: points.filter(p => p.t >= de - EPS && p.t <= fin + EPS), ouverture: premier ? premier.debut : null };
  }

  /** Le goulot du moment : le premier, dans l'ordre des réponses, dont un moment contient `t` ; sinon null. */
  const goulotA = (L, t) => (L && fini(t) ? L.goulots.find(g => dansUne(g.fenetres, t)) || null : null);
  /** Les goulots qui coincent à `t`. */
  const goulotsA = (L, t) => (L && fini(t) ? L.goulots.filter(g => dansUne(g.fenetres, t)) : []);

  /** Le prochain moment à regarder après `t` (au moins une demi-minute plus tard) ; null s'il n'y en a plus. */
  function pointSuivant(L, t) {
    if (!L) return null;
    const p = L.points.find(x => x.t > (fini(t) ? t : -Infinity) + 0.5);
    return p ? { ...p, avec: L.points.filter(x => Math.abs(x.t - p.t) <= 0.5 && x !== p) } : null;
  }

  /**
   * La teinte de chaque service à `t` : { service: { ton, pourquoi } } — `ton` : « critique » (un goulot du jour, dans un
   * moment où il coince), « avertissement » (un arrivage y attend au-delà du seuil d'attente ; ou des personnes y
   * travaillent après leur horaire), sinon « neutre ». `pourquoi` : la raison, en mots.
   */
  function tonsA(L, journee, t) {
    const out = {}, k = journee && journee.k;
    if (!L || !k || !fini(t)) return out;
    // Le plus grave l'emporte : critique, puis avertissement ; à gravité égale, la première raison reste.
    const GRAVITE = { neutre: 0, avertissement: 1, critique: 2 };
    const poser = (service, ton, pourquoi) => { const x = out[service]; if (!x || GRAVITE[ton] > GRAVITE[x.ton]) out[service] = { ton, pourquoi }; };
    for (const e of k.equipes || []) if (!out[e.service]) out[e.service] = { ton: 'neutre', pourquoi: null };
    // Des personnes au travail après leur horaire (les indicateurs disent qui travaille ; les réponses, la fin de l'horaire).
    for (const e of k.equipes || []) {
      const h = L.horaires.get(e.id);
      if (fini(h) && t >= h - EPS && E().personnesDe(e, t).auTravail > 0) poser(e.service, 'avertissement', (e.nom || e.id) + ' travaille après son horaire (' + SY().heure(h) + ')');
    }
    // Un arrivage qui attend au-delà du seuil d'attente.
    for (const a of L.arrivages) if (a.auDela !== null && t >= a.auDela - EPS && t < a.a - EPS) poser(a.service, 'avertissement', 'un arrivage attend depuis ' + SY().duree(t - a.de));
    for (const g of goulotsA(L, t)) poser(g.service, 'critique', g.phrase);
    return out;
  }

  /** La teinte d'une zone : la plus grave de ses services. */
  function tonDeZone(tons, zone) {
    let pire = { ton: 'neutre', pourquoi: null };
    for (const s of (zone && zone.services) || []) { const x = tons[s]; if (x && (x.ton === 'critique' || (x.ton === 'avertissement' && pire.ton === 'neutre'))) pire = pire.ton === 'critique' ? pire : x; }
    return pire;
  }

  /**
   * La barre du temps, de `de` à `a` : { de, a, pas, auTravail, enAttente, maxTravail, maxAttente, vols, jours }.
   *  - `auTravail[i]` : les personnes au travail dans toute l'unité au créneau i (la somme des équipes, aux indicateurs) ;
   *  - `enAttente[i]` : les arrivages qui attendent au milieu du créneau i ;
   *  - `vols` : un repère par départ de vol, [{ id, t, enRetard }] (en retard : chargé après son heure, ou pas chargé) ;
   *  - `jours` : les jours de la journée rejouée, [{ jour, de, a, mot }] (« J−2 » … « J+1 »).
   */
  function frise(journee, L, de, a) {
    const pas = E().PAS, k = journee && journee.k, r = journee && journee.r, d = Math.floor(de / pas) * pas, n = Math.max(1, Math.ceil((a - d) / pas));
    const auTravail = new Array(n).fill(0), enAttente = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      const t = d + i * pas;
      for (const e of (k && k.equipes) || []) { const c = e.creneaux; if (c) auTravail[i] += E().valeurA(c.auTravail, t - (e.jour || 0) * JOUR) || 0; }
      for (const x of (L && L.arrivages) || []) if (t + pas / 2 >= x.de && t + pas / 2 < x.a) enAttente[i]++;
    }
    const vols = E().volsDe(r).filter(v => v.depart >= de - EPS && v.depart <= a + EPS).map(v => ({ id: v.id, t: v.depart, enRetard: !!v.charge && ((fini(v.retard) && v.retard > 0) || !fini(v.fin)) }))
      .sort((p, q) => p.t - q.t || String(p.id).localeCompare(String(q.id)));
    const jours = [];
    for (let j = Math.floor(de / JOUR); j * JOUR < a; j++) jours.push({ jour: j, de: Math.max(de, j * JOUR), a: Math.min(a, (j + 1) * JOUR), mot: j === 0 ? 'J' : 'J' + (j > 0 ? '+' : '−') + Math.abs(j) });
    return { de: d, a: d + n * pas, pas, auTravail, enAttente, maxTravail: Math.max(0, ...auTravail), maxAttente: Math.max(0, ...enAttente), vols, jours };
  }

  /**
   * Le détail d'un service à `t` : ses équipes (leur horaire, leurs personnes par état), ses personnes par état, ses lots
   * à faire (ce qui attend devant lui : les séjours en stock du résultat), ses arrivages en attente avec leur attente,
   * ses personnes sans travail et ce qu'elles attendent (les réponses), sa courbe de charge (les créneaux des indicateurs),
   * sa teinte et sa raison. Rend null si le service n'a pas d'équipe.
   */
  function detail(L, journee, service, t) {
    const k = journee && journee.k, r = journee && journee.r, rep = journee && journee.reponses;
    if (!k || !r || !fini(t)) return null;
    const equipes = (k.equipes || []).filter(e => e.service === service);
    if (!equipes.length) return null;
    const ETATS = ['presents', ...E().ETATS], zero = () => Object.fromEntries(ETATS.map(m => [m, 0])), total = zero(), parId = new Map((r.ateliers || []).map(v => [v.id, v]));
    const lesEquipes = equipes.map(e => {
      const p = E().personnesDe(e, t), v = parId.get(e.id) || {};
      for (const m of ETATS) total[m] += p[m];
      return { id: e.id, nom: e.nom || v.nom || e.id, jour: e.jour || 0, debut: fini(v.debutPoste) ? v.debutPoste : null, finHoraire: L.horaires.has(e.id) ? L.horaires.get(e.id) : null,
        fin: fini(v.fin) ? v.fin : null, personnes: p, apresHoraire: L.horaires.has(e.id) && t >= L.horaires.get(e.id) - EPS && p.auTravail > 0 };
    });
    const lots = ((E().filesA(r, t)[service]) || []).map(l => ({ classe: l.classe, libelle: P().libelleClasse ? P().libelleClasse(l.classe) : String(l.classe), vol: l.vol, repas: l.repas, chariots: l.chariots, depuis: l.entree, attente: t - l.entree }));
    const arrivages = L.arrivages.filter(a => a.service === service && t >= a.de - EPS && t < a.a - EPS)
      .map(a => ({ lot: a.lot, lots: a.lots, equipe: a.equipe, depuis: a.de, attente: t - a.de, jusqua: a.a, auDela: a.auDela !== null && t >= a.auDela - EPS }));
    // Ce qu'attendent ses personnes sans travail : ce que disent les réponses, pour les lignes de ce service.
    const attendait = [];
    for (const s of ((rep && rep.sansTravail && rep.sansTravail.services) || [])) if (s.service === service) for (const x of s.attendait || []) { const mot = SY().motsDeLAttendu(x); if (!attendait.includes(mot)) attendait.push(mot); }
    // Sa courbe de charge : au travail et présents, créneau par créneau, sur toute la journée rejouée.
    const pas = E().PAS, d = Math.floor(L.de / pas) * pas, n = Math.max(1, Math.ceil((L.fin - d) / pas)), courbe = { de: d, pas, auTravail: new Array(n).fill(0), presents: new Array(n).fill(0) };
    for (const e of equipes) { const c = e.creneaux; if (!c) continue; for (let i = 0; i < n; i++) { const h = d + i * pas - (e.jour || 0) * JOUR; courbe.auTravail[i] += E().valeurA(c.auTravail, h) || 0; courbe.presents[i] += E().valeurA(c.presents, h) || 0; } }
    const tons = tonsA(L, journee, t), ton = tons[service] || { ton: 'neutre', pourquoi: null };
    const nom = ((journee.args && journee.args.noms) || {})[service] || service;
    return { service, nom, t, ton: ton.ton, pourquoi: ton.pourquoi, equipes: lesEquipes, personnes: total, lots, repas: lots.reduce((s, l) => s + l.repas, 0), arrivages,
      sansTravail: { personnes: total.sansTravail, attendait }, goulots: L.goulots.filter(g => g.service === service).map(g => ({ jour: g.jour, phrase: g.phrase, fenetres: g.fenetres, maintenant: dansUne(g.fenetres, t) })), courbe };
  }

  /**
   * Le vol suivi : { vol, depart, classes, enRetard, phrase } — ses commandes (celles dont il est l'un des vols), et la
   * phrase qui explique son retard : celle de la Synthèse (les exceptions des réponses) ; à l'heure, elle le dit.
   */
  function suivi(journee, vol) {
    const r = journee && journee.r, rep = journee && journee.reponses;
    if (!r || vol == null) return null;
    const v = E().volsDe(r).find(x => x.id === vol);
    if (!v) return null;
    const classes = new Set((r.classes || []).filter(c => (c.vols || []).some(x => x.id === vol)).map(c => c.id));
    for (const x of r.vols || []) if (x.id === vol) for (const c of x.classes || []) classes.add(c);
    const x = ((rep && rep.exceptions) || []).find(e => e.id === vol && e.type !== 'commande-en-retard');
    const m = x ? SY().motsDeLException(x) : null, heure = SY().heure(v.depart);
    const phrase = m ? m.nom + ' (' + heure + ') ' + m.quoi + (m.mot ? ' — ' + m.mot : '') + '.' + (m.phrase ? ' ' + m.phrase : '')
      : 'Vol ' + vol + ' (' + heure + ') : ' + (v.charge ? 'chargé à l’heure.' : 'rien ne le retarde.');
    return { vol, depart: v.depart, classes, enRetard: !!x, phrase };
  }

  /** Un objet de la scène est-il du vol suivi ? Un chariot (son vol, ou sa commande), un véhicule (sa tournée), un avion. */
  function estDuVol(s, o) {
    if (!s || !o) return false;
    if (o.quoi === 'avion') return o.id === s.vol;
    if (o.quoi === 'vehicule') return (o.vols || []).includes(s.vol);
    if (o.quoi !== 'chariot' || o.ton === 'sale') return false;
    if (o.vol != null) return o.vol === s.vol;
    if (o.classes) return o.classes.some(c => s.classes.has(c));
    return o.classe != null && s.classes.has(o.classe);
  }

  /** Le vol d'un objet cliqué : celui d'un avion ; celui d'un chariot (son vol, sinon le premier vol de sa commande) ; sinon null. */
  function volDe(journee, o) {
    if (!o) return null;
    if (o.quoi === 'avion') return o.id;
    if (o.quoi === 'vehicule') return (o.vols || [])[0] ?? null;
    if (o.quoi !== 'chariot' || o.ton === 'sale') return null;
    if (o.vol != null) return o.vol;
    const r = journee && journee.r, ids = o.classes || (o.classe != null ? [o.classe] : []);
    const vols = ((r && r.classes) || []).filter(c => ids.includes(c.id)).flatMap(c => c.vols || []).filter(v => v && v.id != null).sort((p, q) => (p.depart || 0) - (q.depart || 0) || String(p.id).localeCompare(String(q.id)));
    return vols.length ? vols[0].id : null;
  }

  const api = { reunir, phraseDuGoulot, lire, goulotA, goulotsA, pointSuivant, tonsA, tonDeZone, frise, detail, suivi, estDuVol, volDe };
  if (enNode) module.exports = api;
  else root.OrlyDirectLire = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

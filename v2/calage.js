/* ==========================================================================
 *  VERSION 2 — LE CALAGE SUR UN MOIS RÉEL
 *
 *  L'idée (retour d'usage du 01/10) : donner au site un mois réel — les vols
 *  de chaque jour, le planning des équipes, les pointages, le labor cost —,
 *  rejouer chaque journée, comparer avec ce qui s'est passé, et ajuster le
 *  modèle jusqu'à ce qu'il colle.
 *
 *  Ce qui s'observe : les pointages disent quand les gens sont arrivés et
 *  partis. Une équipe payée sa vacation part à la fin de sa vacation même si
 *  le travail était fini plus tôt : seules les HEURES SUP (pointées au-delà
 *  du planning) disent que le travail a débordé. Le calage cherche donc,
 *  service par service, la vitesse de travail qui fait déborder la
 *  simulation comme le réel a débordé, jour après jour.
 *
 *  Ce qui s'ajuste : un facteur par service sur ses minutes de travail
 *  (barème et minutes propres des cases). « Montage ×1,18 » : le Montage
 *  prend 18 % de temps de plus que le barème. Lisible, discutable, validable
 *  par les chefs de service — pas une boîte noire.
 *
 *  Méthode : les premiers jours servent à apprendre (75 %), les derniers à
 *  vérifier ; un modèle qui ne prédit que les jours qu'il a vus a appris par
 *  cœur. Recherche sur une grille de facteurs, puis affinage.
 *
 *  ⚠ Les données réelles ne quittent pas le navigateur ; ce fichier ne
 *  contient aucune donnée.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const COLS_VOLS = ['vol_id', 'compagnie', 'type_avion', 'sens', 'heure_std', 'heure_sta', 'nb_BC', 'nb_PC', 'nb_YC', 'nb_CREW', 'nb_SPML'];
  const GRILLE = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5, 1.75, 2];
  const AFFINAGE = [0.92, 0.96, 1, 1.04, 1.08];

  /* ---- lecture ---------------------------------------------------------- */

  /** Une date lue dans un tableur : numéro Excel, « 2026-09-14 » ou « 14/09/2026 » → « 2026-09-14 ». */
  function dateDe(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      return d.toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
    if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    throw new Error('date illisible : « ' + v + ' » (attendu AAAA-MM-JJ ou JJ/MM/AAAA)');
  }

  /** Durée d'un poste : une fin avant le début passe minuit. */
  const dureeDe = (debut, fin) => { let d = fin - debut; if (d <= 0) d += 1440; return d; };

  /**
   * Le classeur de calage : quatre feuilles, une ligne par jour et par élément.
   *   Vols      : date + les colonnes de l'import des vols
   *   Planning  : date, service, equipe, debut, fin, personnes [, jour]
   *   Pointages : date, service, arrivee, depart [, personne, equipe]
   *   Labor cost: [date,] service, montant
   * @param o { T: OrlyTableur, parseVols(lignes), service(texte) → id|null }
   * @returns { jours:[{date, vols, planning, pointages}], cout:[{date, service, montant}], avertissements }
   */
  function lireClasseur(feuilles, o) {
    const T = o.T, av = [], jours = new Map();
    const jour = d => { if (!jours.has(d)) jours.set(d, { date: d, volsLignes: [], planning: [], pointages: [] }); return jours.get(d); };
    const lire = (noms, fn) => {
      const f = T.feuille(feuilles, ...noms); if (!f) return false;
      const { objets } = T.enObjets(f.lignes);
      for (const x of objets) {
        try { fn(x); } catch (e) { av.push(f.nom + ', ligne ' + x._ligne + ' : ' + e.message); }
      }
      return true;
    };
    const service = (v, ou) => {
      const id = o.service(v);
      if (!id) throw new Error(ou + ' : service inconnu « ' + v + ' »');
      return id;
    };
    if (!lire(['Vols', 'Programme'], x => {
      const d = dateDe(x.date); if (!d) throw new Error('date manquante');
      const l = COLS_VOLS.map(c => x[T.cleEntete(c)] ?? null); l.ligne = x._ligne;
      jour(d).volsLignes.push(l);
    })) throw new Error('Feuille « Vols » introuvable.');
    lire(['Planning', 'Prevu'], x => {
      const d = dateDe(x.date); if (!d) throw new Error('date manquante');
      const debut = T.heureDe(x.debut), fin = T.heureDe(x.fin);
      if (debut == null || fin == null) throw new Error('debut et fin obligatoires');
      jour(d).planning.push({ service: service(x.service, 'planning'), equipe: String(x.equipe ?? '').trim(), debut, fin,
        duree: dureeDe(debut, fin), personnes: Math.max(0, Math.round(T.nombreDe(x.personnes, 1))), jour: Math.round(T.nombreDe(x.jour, 0)) });
    });
    lire(['Pointages', 'Pointage', 'Badgeuse'], x => {
      const d = dateDe(x.date); if (!d) throw new Error('date manquante');
      const arrivee = T.heureDe(x.arrivee), depart = T.heureDe(x.depart);
      if (arrivee == null || depart == null) throw new Error('arrivee et depart obligatoires');
      jour(d).pointages.push({ service: service(x.service, 'pointages'), personne: x.personne ?? null, equipe: x.equipe ?? null,
        arrivee, depart, duree: dureeDe(arrivee, depart) });
    });
    const cout = [];
    lire(['Labor cost', 'Labor_cost', 'Cout', 'Couts'], x => {
      cout.push({ date: x.date ? dateDe(x.date) : null, service: service(x.service, 'labor cost'), montant: T.nombreDe(x.montant, 0) });
    });
    const liste = [...jours.values()].sort((a, b) => a.date.localeCompare(b.date));
    for (const j of liste) {
      if (!j.volsLignes.length) { av.push(j.date + ' : aucun vol, journée ignorée.'); continue; }
      try { j.vols = o.parseVols([COLS_VOLS].concat(j.volsLignes)); }
      catch (e) { av.push(j.date + ' : vols illisibles — ' + e.message); }
      delete j.volsLignes;
    }
    return { jours: liste.filter(j => j.vols && j.vols.length), cout, avertissements: av };
  }

  /* ---- une journée ------------------------------------------------------ */

  const cle = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const hhmm = t => { const x = ((t % 1440) + 1440) % 1440; return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); };

  /**
   * Les équipes d'un jour : celles de l'unité, avec l'heure, l'effectif et la
   * durée de poste du planning. Une équipe se reconnaît à son nom, dans son
   * service. Un service absent du planning garde ses équipes telles quelles ;
   * une équipe absente du planning de son service ne travaille pas ce jour-là.
   * `presentes` (facultatif) : les commandes qui volent ce jour-là — une équipe
   * ne garde que celles-là (sinon le calcul refuse une commande inconnue).
   */
  function ateliersDuJour(ateliers, planning, presentes) {
    const parService = new Map();
    for (const p of planning || []) { if (!parService.has(p.service)) parService.set(p.service, []); parService.get(p.service).push(p); }
    const utilisees = new Set();
    const garder = a => (presentes && Array.isArray(a.lots)
      ? { ...a, lots: a.lots.map(l => l.filter(c => presentes.has(c))).filter(l => l.length) } : a);
    const out = (ateliers || []).map(garder).map(a => {
      const lignes = parService.get(a.service);
      if (!lignes || a.type === 'dispo') return a;
      const p = lignes.find(x => cle(x.equipe) === cle(a.nom));
      if (!p) return { ...a, personnes: 0 };
      utilisees.add(p);
      return { ...a, debut: hhmm(p.debut), jour: p.jour || a.jour || 0, personnes: p.personnes,
        regime: { ...(a.regime && a.regime.actif !== false ? a.regime : {}), actif: true, presence: p.duree } };
    });
    const inconnues = (planning || []).filter(p => !utilisees.has(p) && (ateliers || []).some(a => a.service === p.service))
      .map(p => ({ service: p.service, equipe: p.equipe }));
    return { ateliers: out, inconnues };
  }

  /** Le réel d'un jour, par service : heures prévues, pointées, et ce qui a débordé (minutes). */
  function reelParService(jour) {
    const m = new Map(), get = s => { if (!m.has(s)) m.set(s, { prevues: 0, pointees: 0, sup: 0, personnes: 0 }); return m.get(s); };
    for (const p of jour.planning || []) { const x = get(p.service); x.prevues += p.personnes * p.duree; x.personnes += p.personnes; }
    for (const p of jour.pointages || []) get(p.service).pointees += p.duree;
    for (const x of m.values()) x.sup = x.prevues && x.pointees ? Math.max(0, x.pointees - x.prevues) : 0;
    return m;
  }

  /** Les minutes de travail d'un service multipliées par son facteur (barème et minutes propres des cases). */
  function appliquerFacteurs(args, facteurs) {
    const f = s => (facteurs && Number.isFinite(facteurs[s]) ? facteurs[s] : 1);
    const bareme = {};
    for (const [s, t] of Object.entries(args.bareme || {})) {
      const k = f(s); bareme[s] = {};
      for (const [c, v] of Object.entries(t || {})) bareme[s][c] = typeof v === 'number' ? v * k : v;
    }
    const ateliers = (args.ateliers || []).map(a => {
      const k = f(a.service); if (k === 1 || !a.minutes) return a;
      return { ...a, minutes: Object.fromEntries(Object.entries(a.minutes).map(([c, v]) => [c, v * k])) };
    });
    return { ...args, bareme, ateliers };
  }

  /**
   * Rejoue une journée.
   * @param args les données du calcul de l'unité (sans vols ni classes)
   * @returns { parService: Map s → { sup, payees }, resultat }
   */
  function simulerJour(P, args, jour, facteurs) {
    const presentes = new Set(P.classesDeVols(jour.vols, { delaiChargement: args.delaiChargement }).map(c => c.id));
    const { ateliers } = ateliersDuJour(args.ateliers, jour.planning, presentes);
    const a = appliquerFacteurs({ ...args, ateliers }, facteurs);
    const r = P.simuler({ ...a, vols: jour.vols, classes: undefined });
    const m = new Map();
    for (const v of (r && r.ateliers) || []) {
      const x = m.get(v.service) || { sup: 0, payees: 0 };
      const n = +v.personnes || 0;
      x.sup += n * (v.heuresSup || 0);
      x.payees += n * ((v.presence || 0) + (v.heuresSup || 0));
      m.set(v.service, x);
    }
    return { parService: m, resultat: r };
  }

  /* ---- l'ajustement ----------------------------------------------------- */

  const moyenne = l => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);

  /**
   * Cherche, service par service, le facteur qui fait déborder la simulation
   * comme le réel. Asynchrone : rend la main entre deux journées.
   * @param o { grille, part (apprentissage), heuresSup (plafond pendant le calage, min), progres(fait, total), pause() }
   */
  async function ajuster(P, args, jours, o = {}) {
    const grille = o.grille || GRILLE, part = o.part ?? 0.75, pause = o.pause || (() => null);
    const base = { ...args, heuresSup: { actif: true, plafond: o.heuresSup ?? 720 } };
    const reels = jours.map(reelParService);
    // Les services qu'on peut caler : une équipe dans l'unité et des pointages.
    const services = [...new Set(reels.flatMap(r => [...r.keys()]))]
      .filter(s => (args.ateliers || []).some(a => a.service === s && (a.type === 'manuel' || a.type === 'robot' || !a.type)))
      .filter(s => reels.some(r => (r.get(s) || {}).pointees > 0));
    const nA = Math.max(1, Math.min(jours.length, Math.ceil(jours.length * part)));
    const apprendre = jours.map((j, i) => i).slice(0, nA), verifier = jours.map((j, i) => i).slice(nA);
    const total = (grille.length + AFFINAGE.length) * apprendre.length + 2 * jours.length;
    let fait = 0;
    const tour = async () => { fait++; if (o.progres) o.progres(fait, total); await pause(); };

    // Simule les jours demandés avec ces facteurs : sup simulées par jour et par service.
    const jouer = async (indices, facteurs) => {
      const out = new Map();
      for (const i of indices) { out.set(i, simulerJour(P, base, jours[i], facteurs).parService); await tour(); }
      return out;
    };
    const ecart = (sim, i, s) => Math.abs(((sim.get(i).get(s) || {}).sup || 0) - ((reels[i].get(s) || {}).sup || 0));
    // Départage vers 1 : à erreur égale, on garde le barème.
    const cout = (sims, k, s) => apprendre.reduce((n, i) => n + ecart(sims, i, s), 0) + Math.abs(Math.log(k)) * apprendre.length;

    // 1. La grille : tous les services au même facteur, chacun lit sa propre erreur.
    const parK = [];
    for (const k of grille) parK.push({ k, sims: await jouer(apprendre, Object.fromEntries(services.map(s => [s, k]))) });
    const facteurs = {};
    for (const s of services) facteurs[s] = parK.reduce((m, x) => (cout(x.sims, x.k, s) < cout(m.sims, m.k, s) ? x : m)).k;
    // 2. L'affinage autour du meilleur, chacun à son facteur.
    const essais = [];
    for (const r of AFFINAGE) {
      const f = Object.fromEntries(services.map(s => [s, facteurs[s] * r]));
      essais.push({ f, sims: await jouer(apprendre, f) });
    }
    for (const s of services) {
      const m = essais.reduce((best, x) => (cout(x.sims, x.f[s], s) < cout(best.sims, best.f[s], s) ? x : best));
      facteurs[s] = Math.round(m.f[s] * 100) / 100;
    }

    // 3. Avant / après, sur tous les jours.
    const tous = jours.map((j, i) => i);
    const avant = await jouer(tous, {}), apres = await jouer(tous, facteurs);
    const mesure = (sims, indices, s) => {
      const e = indices.map(i => ecart(sims, i, s));
      const b = indices.map(i => ((sims.get(i).get(s) || {}).sup || 0) - ((reels[i].get(s) || {}).sup || 0));
      return { erreur: moyenne(e), biais: moyenne(b) };
    };
    const lignes = services.map(s => ({
      service: s, facteur: facteurs[s],
      joursAvecSup: tous.filter(i => (reels[i].get(s) || {}).sup > 0).length,
      supReelleMoyenne: moyenne(tous.map(i => (reels[i].get(s) || {}).sup || 0)),
      avant: { apprendre: mesure(avant, apprendre, s), verifier: verifier.length ? mesure(avant, verifier, s) : null },
      apres: { apprendre: mesure(apres, apprendre, s), verifier: verifier.length ? mesure(apres, verifier, s) : null }
    }));
    const global = (sims, idx) => (idx.length ? moyenne(services.flatMap(s => idx.map(i => ecart(sims, i, s)))) : null);
    const detail = tous.map(i => ({ date: jours[i].date, apprentissage: i < nA,
      services: Object.fromEntries(services.map(s => [s, { reel: (reels[i].get(s) || {}).sup || 0,
        avant: (avant.get(i).get(s) || {}).sup || 0, apres: (apres.get(i).get(s) || {}).sup || 0 }])) }));
    return { facteurs, services: lignes, detail, jours: { apprendre: apprendre.length, verifier: verifier.length },
      global: { avant: { apprendre: global(avant, apprendre), verifier: global(avant, verifier) },
        apres: { apprendre: global(apres, apprendre), verifier: global(apres, verifier) } } };
  }

  /** Un classeur de calage d'exemple, FICTIF : la forme attendue, deux jours, deux services. */
  function classeurModele() {
    const v = (d, id, cie, av, sens, std, sta, bc, pc, yc, crew, spml) => [d, id, cie, av, sens, std, sta, bc, pc, yc, crew, spml];
    const guide = [
      ['Feuille', 'Colonne', 'Obligatoire', 'Format', 'Exemple', 'Ce qu’on y met'],
      ['Vols', 'date', 'oui', 'AAAA-MM-JJ ou JJ/MM/AAAA', '2026-09-01', 'Le jour du vol (départ ou retour).'],
      ['Vols', 'vol_id', 'oui', 'texte', 'XX101', 'Le numéro de vol.'],
      ['Vols', 'compagnie', 'oui', 'texte', 'XX', 'Le code de la compagnie, comme dans le programme des vols (ex. AF).'],
      ['Vols', 'type_avion', 'non', 'texte', 'A320', 'Le type d’avion (sert au taux de remplissage).'],
      ['Vols', 'sens', 'oui', 'DEP ou RET', 'DEP', 'DEP : un départ (on prépare ses repas) ; RET : un retour (la plonge).'],
      ['Vols', 'heure_std', 'pour un DEP', 'HH:MM', '07:00', 'L’heure de départ prévue.'],
      ['Vols', 'heure_sta', 'pour un RET', 'HH:MM', '15:40', 'L’heure d’arrivée prévue.'],
      ['Vols', 'nb_BC, nb_PC, nb_YC', 'oui', 'nombre entier', '12, 0, 150', 'Les repas (passagers) par classe : Business, Premium, Économie.'],
      ['Vols', 'nb_CREW, nb_SPML', 'non', 'nombre entier', '5, 3', 'Les repas équipage et les repas spéciaux.'],
      ['Planning', 'date', 'oui', 'AAAA-MM-JJ', '2026-09-01', 'Le jour des vols que l’équipe prépare.'],
      ['Planning', 'service', 'oui', 'texte', 'Montage', 'Le service, avec le même nom que dans Équipes.'],
      ['Planning', 'equipe', 'oui', 'texte', 'Montage matin', 'L’équipe, avec le même nom que dans Équipes (c’est ce qui relie le planning à ce qu’elle prépare).'],
      ['Planning', 'debut, fin', 'oui', 'HH:MM', '04:00, 12:15', 'L’horaire prévu de l’équipe (sa vacation). Une fin avant le début passe minuit.'],
      ['Planning', 'personnes', 'oui', 'nombre entier', '4', 'Le nombre de personnes prévues dans l’équipe ce jour-là.'],
      ['Planning', 'jour', 'non', '0, -1 ou -2', '-1', 'Vide ou 0 : le jour même ; -1 : la veille (ex. la cuisine).'],
      ['Pointages', 'date', 'oui', 'AAAA-MM-JJ', '2026-09-01', 'Le même jour que la ligne de planning de l’équipe (la veille compte pour le jour des vols).'],
      ['Pointages', 'service', 'oui', 'texte', 'Montage', 'Le service où la personne a travaillé.'],
      ['Pointages', 'personne', 'non', 'texte', 'A', 'Un matricule ou des initiales (facultatif ; jamais de nom complet nécessaire).'],
      ['Pointages', 'arrivee, depart', 'oui', 'HH:MM', '04:02, 13:30', 'Les heures réelles de badge. Un départ avant l’arrivée passe minuit.'],
      ['Labor cost', 'date', 'non', 'AAAA-MM-JJ', '2026-09-01', 'Le jour ; vide : le montant vaut pour le mois.'],
      ['Labor cost', 'service', 'oui', 'texte', 'Montage', 'Le service.'],
      ['Labor cost', 'montant', 'oui', 'nombre (euros)', '610', 'Le coût réel de la main-d’œuvre.'],
      [],
      ['Règles'],
      ['Une ligne par vol, par équipe et par jour, par personne et par jour. Un mois entier dans un seul classeur.'],
      ['Les noms de service et d’équipe doivent être ceux de Équipes (majuscules et accents indifférents).'],
      ['Les heures sup ne se saisissent pas : le site les déduit (heures pointées au-delà du planning).'],
      ['Les lignes de ce classeur sont un EXEMPLE FICTIF : remplacez-les par les vôtres.'],
      ['Confidentialité : ce classeur reste dans votre navigateur (ou est traité dans la session) ; il ne va jamais dans le dépôt public.']
    ];
    return [
      { nom: 'Lisez-moi', lignes: guide },
      { nom: 'Vols', lignes: [['date'].concat(COLS_VOLS),
        v('2026-09-01', 'XX101', 'XX', 'A320', 'DEP', '07:00', '', 12, 0, 150, 5, 3),
        v('2026-09-01', 'YY205', 'YY', 'A350', 'DEP', '12:30', '', 30, 40, 220, 8, 10),
        v('2026-09-01', 'XX102', 'XX', 'A320', 'RET', '', '15:40', 12, 0, 150, 0, 0),
        v('2026-09-02', 'XX101', 'XX', 'A320', 'DEP', '07:00', '', 14, 0, 170, 5, 4),
        v('2026-09-02', 'YY205', 'YY', 'A350', 'DEP', '12:30', '', 32, 44, 240, 8, 11)] },
      { nom: 'Planning', lignes: [['date', 'service', 'equipe', 'debut', 'fin', 'personnes', 'jour'],
        ['2026-09-01', 'Cuisine', 'Cuisine veille', '14:00', '21:00', 3, -1],
        ['2026-09-01', 'Montage', 'Montage matin', '04:00', '12:15', 2, 0],
        ['2026-09-02', 'Cuisine', 'Cuisine veille', '14:00', '21:00', 3, -1],
        ['2026-09-02', 'Montage', 'Montage matin', '04:00', '12:15', 2, 0]] },
      { nom: 'Pointages', lignes: [['date', 'service', 'personne', 'arrivee', 'depart'],
        ['2026-09-01', 'Cuisine', 'C1', '14:00', '21:00'], ['2026-09-01', 'Cuisine', 'C2', '14:00', '21:00'], ['2026-09-01', 'Cuisine', 'C3', '14:05', '21:30'],
        ['2026-09-01', 'Montage', 'M1', '04:00', '12:15'], ['2026-09-01', 'Montage', 'M2', '04:00', '13:30'],
        ['2026-09-02', 'Cuisine', 'C1', '14:00', '21:00'], ['2026-09-02', 'Cuisine', 'C2', '14:00', '21:00'], ['2026-09-02', 'Cuisine', 'C3', '14:00', '21:00'],
        ['2026-09-02', 'Montage', 'M1', '04:00', '12:15'], ['2026-09-02', 'Montage', 'M2', '04:02', '12:20']] },
      { nom: 'Labor cost', lignes: [['date', 'service', 'montant'],
        ['2026-09-01', 'Cuisine', 520], ['2026-09-01', 'Montage', 610], ['2026-09-02', 'Cuisine', 505], ['2026-09-02', 'Montage', 590]] }
    ];
  }

  /* ======================================================================
   *  LA PAGE : Simulation › Calage sur le réel
   * ====================================================================*/

  /** Un pictogramme de icones.js (exporter, importer), au lieu d'un caractère. */
  const pic = nom => (root.OrlyIcones ? root.OrlyIcones.ico(nom) : '');
  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const h = m => (m == null || !Number.isFinite(m) ? '—' : (Math.round(m / 6) / 10).toString().replace('.', ',') + ' h');
  const pctFacteur = k => (k === 1 ? 'comme le barème' : (k > 1 ? '+' : '−') + Math.round(Math.abs(k - 1) * 100) + ' % de temps');

  class Calage {
    /** a : { at() (le centre des équipes), rg() (les réglages), services(), notify() } */
    constructor(a) {
      this.a = a;
      this.mois = null;      // le classeur lu : en mémoire seulement, jamais enregistré
      this.resultat = null;
      this.enCours = null;
      this.construire();
      this.lier();
    }

    construire() {
      const v = root.document.getElementById('view-ateliers'); if (!v || root.document.getElementById('rg-calage')) return;
      const s = root.document.createElement('section');
      s.id = 'rg-calage'; s.className = 'ca'; s.dataset.sous = 'rg-calage'; s.setAttribute('aria-label', 'Le calage sur un mois réel');
      v.appendChild(s);
    }

    nom(id) { return (this.a.services().find(s => s.id === id) || {}).nom || id; }

    rendre() {
      const box = root.document.getElementById('rg-calage'); if (!box) return;
      const etapes = `<ol class="ca-etapes">
          <li><b>Le classeur du mois</b> : une feuille Vols, une Planning, une Pointages (et le Labor cost si vous l’avez), une ligne par jour.
            <button type="button" class="btn btn-sm" data-ca="modele">${pic('telecharger')}Le modèle du classeur</button></li>
          <li><b>Importez-le</b> : <label class="btn btn-sm btn-play">${pic('importer')}Importer le mois<input type="file" accept=".xlsx,.csv" data-ca="fichier" hidden></label>
            <span class="mini-note">il reste dans ce navigateur, le temps de la page ; rien n’est envoyé.</span></li>
          <li><b>Lancez le calage</b> : chaque jour est rejoué ; les trois premières semaines apprennent, la dernière vérifie.</li>
          <li><b>Appliquez</b> les facteurs trouvés au barème, si les chefs de service les valident.</li></ol>`;
      const intro = `<p class="ca-intro">Les pointages disent quand l’équipe est partie : au-delà de sa vacation, le travail a débordé. Le calage cherche, service par service,
        la vitesse de travail qui fait déborder la simulation comme la réalité a débordé, jour après jour. <b>Les jours avec heures sup sont ceux qui apprennent le plus.</b></p>`;
      let corps = '';
      if (this.mois) {
        const m = this.mois, j = m.jours;
        const pointages = j.reduce((n, x) => n + x.pointages.length, 0), planning = j.reduce((n, x) => n + x.planning.length, 0);
        const inconnues = new Map();
        for (const x of j) for (const i of ateliersDuJour(this.a.at().state.ateliers, x.planning).inconnues) inconnues.set(i.service + '|' + i.equipe, i);
        corps += `<div class="ca-carte"><h3>Le mois importé</h3>
          <p>${j.length} jour(s)${j.length ? ' — du ' + esc(j[0].date) + ' au ' + esc(j[j.length - 1].date) : ''} · ${j.reduce((n, x) => n + x.vols.length, 0)} vols ·
            ${planning} lignes de planning · ${pointages} pointages · ${m.cout.length} lignes de labor cost.</p>
          ${inconnues.size ? `<p class="ca-alerte">Équipes du planning absentes de Équipes (ignorées) : ${[...inconnues.values()].slice(0, 8).map(i => esc(this.nom(i.service) + ' › ' + (i.equipe || '?'))).join(', ')}${inconnues.size > 8 ? '…' : ''}.
            Donnez-leur le même nom dans Équipes.</p>` : ''}
          ${m.avertissements.length ? `<details class="ca-alerte"><summary>${m.avertissements.length} ligne(s) non lue(s)</summary><ul>${m.avertissements.slice(0, 40).map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
          <div class="row-btns">${this.enCours ? '' : `<button type="button" class="btn btn-play" data-ca="lancer"${j.length < 2 ? ' disabled' : ''}>Lancer le calage</button>`}
            <button type="button" class="lien-discret" data-ca="oublier">Oublier ce mois</button></div>
          ${this.enCours ? `<div class="ca-progres"><span style="width:${(this.enCours.fait / this.enCours.total * 100).toFixed(1)}%"></span></div>
            <p class="mini-note">${this.enCours.fait} / ${this.enCours.total} journées rejouées…</p>` : ''}</div>`;
      }
      if (this.resultat) corps += this.resultatHTML(this.resultat);
      box.innerHTML = intro + etapes + corps;
    }

    resultatHTML(r) {
      const g = r.global;
      const ligne = x => `<tr><th scope="row">${esc(this.nom(x.service))}</th>
        <td><b>×${String(x.facteur).replace('.', ',')}</b><small>${pctFacteur(x.facteur)}</small></td>
        <td>${x.joursAvecSup}<small>moy. ${h(x.supReelleMoyenne)} / jour</small></td>
        <td>${h(x.avant.apprendre.erreur)} → <b>${h(x.apres.apprendre.erreur)}</b></td>
        <td>${x.avant.verifier ? h(x.avant.verifier.erreur) + ' → <b>' + h(x.apres.verifier.erreur) + '</b>' : '—'}</td>
        <td>${!x.apres.verifier ? '—' : Math.abs(x.apres.verifier.biais) < 3 ? 'juste' : (x.apres.verifier.biais > 0 ? 'surestime de ' : 'sous-estime de ') + h(Math.abs(x.apres.verifier.biais))}</td></tr>`;
      const jours = r.detail.map(d => `<tr class="${d.apprentissage ? '' : 'ca-verif'}"><th scope="row">${esc(d.date)}${d.apprentissage ? '' : ' <small>vérification</small>'}</th>
        ${r.services.map(x => { const v = d.services[x.service]; return `<td>${h(v.reel)}<small>${h(v.apres)} simulé</small></td>`; }).join('')}</tr>`).join('');
      return `<div class="ca-carte"><h3>Le résultat</h3>
        <p class="ca-global">Erreur moyenne sur les heures sup, par service et par jour :
          <b>${h(g.avant.apprendre)} au barème → ${h(g.apres.apprendre)} calé</b> sur les ${r.jours.apprendre} jours d’apprentissage
          ${r.jours.verifier ? `; <b>${h(g.avant.verifier)} → ${h(g.apres.verifier)}</b> sur les ${r.jours.verifier} jours de vérification, que le calage n’a pas vus` : ''}.</p>
        <table class="ca-table"><thead><tr><th>Service</th><th>Facteur trouvé</th><th>Jours avec heures sup</th><th>Erreur (apprentissage)</th><th>Erreur (vérification)</th><th>Tendance</th></tr></thead>
          <tbody>${r.services.map(ligne).join('')}</tbody></table>
        <p class="mini-note">Un facteur ×1,18 : ce service prend 18 % de temps de plus que son barème. Peu de jours avec heures sup : le facteur est moins sûr.
          Si l’erreur de vérification reste grande, la vitesse seule n’explique pas l’écart : un autre élément manque au modèle (pauses, polyvalence, renforts…).</p>
        <details class="ca-jours"><summary>Jour par jour : heures sup réelles, et simulées après calage</summary>
          <div class="ca-defile"><table class="ca-table"><thead><tr><th>Jour</th>${r.services.map(x => `<th>${esc(this.nom(x.service))}</th>`).join('')}</tr></thead><tbody>${jours}</tbody></table></div></details>
        <div class="row-btns"><button type="button" class="btn btn-play" data-ca="appliquer">Appliquer ces facteurs au barème</button>
          <span class="mini-note">Les heures de travail de chaque service sont multipliées par son facteur. « Annuler » revient en arrière.</span></div></div>`;
    }

    async importer(f) {
      const T = root.OrlyTableur, UI = root.OrlyUI;
      try {
        const feuilles = await T.lireFichier(f, 30 * 1024 * 1024);
        this.mois = lireClasseur(feuilles, { T, parseVols: UI.parseFlightRows, service: T.correspondance(this.a.services()) });
        this.resultat = null;
        this.a.notify(this.mois.jours.length + ' jour(s) importé(s).');
      } catch (e) { this.a.notify('Import refusé : ' + e.message); }
      this.rendre();
    }

    async lancer() {
      if (!this.mois || this.enCours) return;
      const P = root.MoteurProduction, at = this.a.at();
      const args = at.argsMoteur(at.state.ateliers);
      delete args.vols; delete args.classes;
      // Le calage rejoue les journées avec les personnes du planning réel : on ne
      // les recalcule pas d'après les homme-minutes, c'est ce qu'on cherche à caler.
      delete args.effectifCalcule; delete args.effectifImpose;
      this.enCours = { fait: 0, total: 1 }; this.rendre();
      let dernier = 0;
      try {
        this.resultat = await ajuster(P, args, this.mois.jours, {
          progres: (fait, total) => { this.enCours = { fait, total }; const t = Date.now(); if (t - dernier > 150) { dernier = t; this.rendre(); } },
          pause: () => new Promise(r => setTimeout(r, 0))
        });
      } catch (e) { this.a.notify('Calage interrompu : ' + e.message); }
      this.enCours = null; this.rendre();
    }

    appliquer() {
      const r = this.resultat; if (!r) return;
      const rg = this.a.rg(), at = this.a.at();
      // Tout de suite : la notification porte « Annuler », qui défait le barème et les cases ensemble (08/10).
      const k = r.facteurs;
      if (rg) rg.changer(() => {
        const b = rg.baremeComplet();
        for (const [s, t] of Object.entries(b)) if (k[s] && k[s] !== 1) for (const c of Object.keys(t)) t[c] = Math.round(t[c] * k[s] * 10) / 10;
        rg.etat.bareme = b;
      }, 'Barème calé sur le mois réel.');
      at.changer(() => {
        for (const a of at.state.ateliers) if (a.minutes && k[a.service] && k[a.service] !== 1)
          for (const c of Object.keys(a.minutes)) a.minutes[c] = Math.round(a.minutes[c] * k[a.service] * 10) / 10;
      }, 'Minutes calées sur le mois réel.');
      this.a.notify('Facteurs appliqués aux heures de travail de ' + r.services.length + (r.services.length > 1 ? ' services' : ' service') + '. Relancez le calage : ils doivent maintenant être proches de ×1.');
      this.resultat = null; this.rendre();
    }

    lier() {
      const d = root.document;
      d.addEventListener('click', e => {
        const b = e.target.closest && e.target.closest('#rg-calage [data-ca]'); if (!b || b.tagName === 'INPUT') return;
        const quoi = b.dataset.ca;
        if (quoi === 'modele') { const T = root.OrlyTableur; return T.telecharger('calage-modele.xlsx', T.ecrireClasseur(classeurModele())); }
        if (quoi === 'lancer') return this.lancer();
        if (quoi === 'oublier') { this.mois = null; this.resultat = null; return this.rendre(); }
        if (quoi === 'appliquer') return this.appliquer();
      });
      d.addEventListener('change', e => {
        const el = e.target; if (!el.closest || !el.closest('#rg-calage') || el.dataset.ca !== 'fichier') return;
        const f = el.files && el.files[0]; el.value = '';
        if (f) this.importer(f);
      });
    }
  }

  const api = { COLS_VOLS, GRILLE, AFFINAGE, dateDe, dureeDe, lireClasseur, ateliersDuJour, reelParService, appliquerFacteurs, simulerJour, ajuster, classeurModele, Calage };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyCalage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

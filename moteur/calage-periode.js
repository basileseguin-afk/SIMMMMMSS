/* ==========================================================================
 *  LE CALAGE SUR LE RÉEL — un modèle par ligne de la correspondance, validé
 *  hors échantillon (banc d'essai de la version 1, évolution 11 c —
 *  docs/BANC_ESSAI.md § 10)
 *  ------------------------------------------------------------------------
 *  Pour chaque ligne de la comparaison (moteur/reel.js) qui a au moins 20
 *  jours utilisables, on cherche comment passer du simulé au réel :
 *    — deux références : « moteur » (réel = simulé) et « constante » (la
 *      moyenne des jours appris) ;
 *    — trois candidats, pour une ligne simulée dont le simulé varie :
 *      « × a », « b + a × », « × a × jour ».
 *  Un candidat n'est retenu que s'il bat les deux références sur des jours
 *  qu'il n'a pas appris (une semaine ISO laissée de côté, et un mois quand il
 *  y en a deux de 14 jours au moins), s'il est stable d'une semaine à
 *  l'autre, si ses paramètres restent dans leurs bornes, si un test de
 *  Wilcoxon apparié le dit meilleur que la meilleure référence, et s'il perd
 *  son avance quand on mélange le simulé (placebo). Déterministe, sans
 *  navigateur : la page et l'outil appellent ce module.
 *  ------------------------------------------------------------------------
 *  Évolution 17 (a) : un catalogue de formes (moteur/calage-formes.js) ajoute
 *  quatre candidats — « puissance », « logarithme », « plancher »,
 *  « plafond ». Les garde-fous valent pour tous, et deux s'ajoutent : le
 *  seuil du test de Wilcoxon se divise par le nombre de candidats essayés sur
 *  la ligne ; une forme plus riche n'est retenue que si elle bat le plus
 *  simple des candidats acceptés de plus de 0,1 ETP. Les temps par vol du
 *  barème ne changent pas : ils restent des entrées.
 *  Évolution 17 (b) : chaque ligne calée reçoit un statut — « à la limite »,
 *  « en sur-effectif », « indéterminé » (moteur/calage-statut.js). Hors « à
 *  la limite », la formule retenue est l'effectif mis, et le besoin se borne
 *  (« au plus ») ; la politique garde le statut et le rythme des jours chargés.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  /** Le catalogue de formes : chargé avant ce module dans la page. */
  const F = enNode ? require('./calage-formes.js') : root.OrlyCalageFormes;
  /** Le statut d'une ligne calée et la borne de son besoin (évolution 17 b) : chargé avant ce module, lui aussi. */
  const ST = enNode ? require('./calage-statut.js') : root.OrlyCalageStatut;

  const JOURS_MIN = 20, JOURS_MOIS_MIN = 14;
  const A_MIN = F.A_MIN, A_MAX = F.A_MAX, STABILITE = 0.15, SEUIL_P = 0.05, PLACEBOS = 20, GRAINE = 20261102, PART_PLACEBO = 0.25;
  const ECART_SIMPLE = 0.1, Z_P10_P90 = 1.2816;
  /** Les jours repères de la stabilité d'une forme du catalogue : un jour calme, le jour médian, un jour chargé (les quantiles du simulé). */
  const REPERES = [0.1, 0.5, 0.9];
  /** Les candidats, du plus simple au plus riche ; les références. */
  const CANDIDATS = ['x-a', 'b-x-a', 'x-a-jour', ...F.ORDRE], REFERENCES = ['moteur', 'constante'];
  const NOMS = { 'moteur': 'moteur', 'constante': 'constante', 'x-a': '× a', 'b-x-a': 'b + a ×', 'x-a-jour': '× a × jour',
    ...Object.fromEntries(F.ORDRE.map(n => [n, F.FORMES[n].nom])) };
  /** La fiche d'une forme du catalogue (par son nom), ou une fiche donnée telle quelle (`o.formes`) ; rien pour les modèles de l'évolution 11 c. */
  const fiche = m => (typeof m === 'string' ? F.FORMES[m] : m) || null;
  const moyenne = l => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
  const somme = l => l.reduce((a, b) => a + b, 0);
  const borne = a => Math.min(A_MAX, Math.max(A_MIN, a));
  const pct = x => Math.round(x * 100) + ' %';
  /** Un nombre à la française, arrondi à `d` décimales : « 0,8 », « -1,25 ». */
  const fr = (x, d = 2) => String(Math.round(x * 10 ** d) / 10 ** d + 0).replace('.', ',');

  /* ----------------------------------------------------------------------
   *  Le calendrier : jour de la semaine, semaine ISO, mois
   * --------------------------------------------------------------------*/

  const utc = d => new Date(d + 'T12:00:00Z');
  /** Le jour de la semaine d'un jour calé (calculé une fois, `_k`). */
  const jourDe = j => (j._k === undefined ? jourSemaine(j.date) : j._k);
  /** 0 = lundi … 6 = dimanche. */
  const jourSemaine = d => (utc(d).getUTCDay() + 6) % 7;
  /** « 2026-W45 » : la semaine ISO (du lundi au dimanche ; l'année du jeudi). */
  function semaineIso(d) {
    const t = utc(d);
    t.setUTCDate(t.getUTCDate() + 3 - jourSemaine(d));
    const an = t.getUTCFullYear(), premier = new Date(Date.UTC(an, 0, 4, 12));
    const n = 1 + Math.round((t - premier) / 86400000 / 7 - (3 - (premier.getUTCDay() + 6) % 7) / 7);
    return an + '-W' + String(n).padStart(2, '0');
  }

  /* ----------------------------------------------------------------------
   *  Les modèles : apprendre sur des jours, prédire un jour
   * --------------------------------------------------------------------*/

  /** Les paramètres d'un modèle appris sur `jours` ({ date, reel, simule }) ; null s'il ne s'applique pas. */
  function apprendre(modele, jours) {
    const f = fiche(modele);
    if (f) return f.apprendre(jours);
    const r = jours.map(j => j.reel), s = jours.map(j => j.simule);
    if (modele === 'moteur') return {};
    if (modele === 'constante') return { c: moyenne(r) };
    const ss = somme(s.map(x => x * x));
    if (!(ss > 0)) return null;
    const brut = somme(s.map((x, i) => x * r[i])) / ss, xa = { a: borne(brut), aBrut: brut };
    if (modele === 'x-a') return xa;
    if (modele === 'b-x-a') {
      const ms = moyenne(s), mr = moyenne(r), v = somme(s.map(x => (x - ms) ** 2));
      if (!(v > 1e-12)) return { ...xa, confondu: true };
      const a = somme(s.map((x, i) => (x - ms) * (r[i] - mr))) / v, b = mr - a * ms;
      return a >= A_MIN && a <= A_MAX && b >= 0 ? { a, b, aBrut: a } : { ...xa, confondu: true, aLibre: a, bLibre: b };
    }
    return { ...xa, jours: facteursDuJour(jours, xa.a) };
  }

  /** Un facteur par jour de la semaine : réel ÷ (a × simulé) en moyenne ce jour-là, ramené à une moyenne de 1, puis à mi-chemin de 1. */
  function facteursDuJour(jours, a) {
    const brut = [];
    for (let k = 0; k < 7; k++) {
      const l = jours.filter(j => jourDe(j) === k && a * j.simule > 0).map(j => j.reel / (a * j.simule));
      brut.push(l.length ? moyenne(l) : null);
    }
    const presents = brut.filter(x => x !== null), m = moyenne(presents);
    return brut.map(x => (x === null || !(m > 0) ? 1 : 1 + (x / m - 1) / 2));
  }

  /** La prédiction d'un modèle pour un jour. */
  function predire(modele, p, j) {
    const f = fiche(modele);
    if (f) return f.predire(p, j);
    if (modele === 'moteur') return j.simule;
    if (modele === 'constante') return p.c;
    if (modele === 'x-a-jour') return p.a * p.jours[jourDe(j)] * j.simule;
    return (p.b || 0) + p.a * j.simule;
  }

  /* ----------------------------------------------------------------------
   *  La validation : jamais sur des jours appris
   * --------------------------------------------------------------------*/

  /**
   * Les découpages : une semaine ISO laissée de côté ; un mois, s'il y a au
   * moins deux mois de 14 jours. Sinon (`unSeulMois`), les semaines seulement.
   */
  function decoupages(jours) {
    const semaines = [...new Set(jours.map(j => j._s || semaineIso(j.date)))].sort();
    const mois = [...new Set(jours.map(j => j.date.slice(0, 7)))].sort();
    const grands = mois.filter(m => jours.filter(j => j.date.startsWith(m)).length >= JOURS_MOIS_MIN);
    return { semaines: semaines.length > 1 ? semaines : [], mois: grands.length >= 2 ? grands : [], unSeulMois: grands.length < 2 };
  }

  /** Un modèle validé sur un découpage : ses paramètres et ses erreurs par part laissée de côté, ses erreurs de chaque jour. */
  function valider(modele, jours, parts, quelle) {
    const splits = [], erreurs = new Map();
    for (const part of parts) {
      const test = jours.filter(j => quelle(j) === part), appris = jours.filter(j => quelle(j) !== part);
      const p = apprendre(modele, appris);
      if (!p || !test.length || !appris.length) continue;
      const e = test.map(j => j.reel - predire(modele, p, j));
      e.forEach((x, i) => erreurs.set(test[i].date, x));
      splits.push({ part, parametres: p, erreur: moyenne(e.map(Math.abs)) });
    }
    return { splits, erreur: splits.length ? moyenne(splits.map(s => s.erreur)) : null, erreurs };
  }

  /* ----------------------------------------------------------------------
   *  Le test de Wilcoxon apparié (approximation normale, correction des ex aequo)
   * --------------------------------------------------------------------*/

  /** La fonction de répartition de la loi normale (Abramowitz et Stegun 7.1.26). */
  function phi(z) {
    const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
    return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  }

  /**
   * Le test des rangs signés de Wilcoxon sur des paires (x, y) : les écarts
   * nuls sortent, les ex aequo prennent leur rang moyen. Rend W+ (la somme des
   * rangs des x > y), z et p bilatéral.
   */
  function wilcoxon(x, y) {
    const d = x.map((v, i) => v - y[i]).filter(v => Math.abs(v) > 1e-12);
    const n = d.length;
    if (!n) return { n: 0, wPlus: 0, z: 0, p: 1 };
    const tri = d.map((v, i) => ({ a: Math.abs(v), i })).sort((u, v) => u.a - v.a), rang = new Array(n);
    let liens = 0;
    for (let k = 0; k < n;) {
      let m = k;
      while (m + 1 < n && Math.abs(tri[m + 1].a - tri[k].a) < 1e-12) m++;
      const t = m - k + 1;
      for (let q = k; q <= m; q++) rang[tri[q].i] = (k + m) / 2 + 1;
      liens += t ** 3 - t; k = m + 1;
    }
    const wPlus = somme(d.map((v, i) => (v > 0 ? rang[i] : 0)));
    const variance = n * (n + 1) * (2 * n + 1) / 24 - liens / 48;
    const z = variance > 0 ? (wPlus - n * (n + 1) / 4) / Math.sqrt(variance) : 0;
    return { n, wPlus, z, p: Math.min(1, 2 * (1 - phi(Math.abs(z)))) };
  }

  /* ----------------------------------------------------------------------
   *  Le placebo : le simulé mélangé ne doit plus rien apprendre
   * --------------------------------------------------------------------*/

  /** Un générateur pseudo-aléatoire à graine fixe (mulberry32). */
  function hasard(graine) {
    let a = graine >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function melanger(l, h) {
    const out = l.slice();
    for (let i = out.length - 1; i > 0; i--) { const k = Math.floor(h() * (i + 1)); [out[i], out[k]] = [out[k], out[i]]; }
    return out;
  }

  /**
   * Le gain moyen d'un candidat sur la constante, le simulé mélangé entre les jours (20 mélanges, graine fixe).
   * Une forme du catalogue qui lit d'autres variables les voit mélangées avec lui, du même jour.
   */
  function gainPlacebo(modele, jours, parts, quelle, erreurConstante) {
    const h = hasard(GRAINE), gains = [], f = fiche(modele), autres = ((f && f.variables) || []).filter(c => c !== 'simule');
    for (let k = 0; k < PLACEBOS; k++) {
      const d = melanger(jours, h), faux = jours.map((j, i) => { const x = { ...j, simule: d[i].simule }; for (const c of autres) x[c] = d[i][c]; return x; });
      const v = valider(modele, faux, parts, quelle);
      if (v.erreur !== null) gains.push(erreurConstante - v.erreur);
    }
    return moyenne(gains);
  }

  /* ----------------------------------------------------------------------
   *  Les règles, le choix, le rapport
   * --------------------------------------------------------------------*/

  /** Les paramètres qui doivent rester stables, et leur écart relatif le plus grand d'un découpage à l'autre. */
  function instabilite(modele, tous, splits, jours) {
    const f = fiche(modele);
    if (f) return instabiliteDeLaCourbe(f, tous, splits, jours);
    const niveau = p => p.b + p.a * moyenne(jours.map(j => j.simule));
    const valeurs = p => [p.a].concat(modele === 'b-x-a' && !p.confondu ? [niveau(p)] : []).concat(modele === 'x-a-jour' ? p.jours : []);
    const ref = valeurs(tous);
    let max = 0;
    for (const s of splits) valeurs(s.parametres).forEach((v, i) => { if (ref[i] > 0) max = Math.max(max, Math.abs(v / ref[i] - 1)); });
    return max;
  }

  /**
   * Une forme du catalogue est stable si sa courbe l'est : sa prédiction de trois jours repères (un jour calme, le
   * jour médian, un jour chargé : les quantiles 10 %, 50 % et 90 % du simulé) ne bouge pas de plus de 15 % d'une
   * semaine laissée de côté à l'autre. Ses paramètres, eux, se compensent (a et p d'une puissance).
   */
  function instabiliteDeLaCourbe(f, tous, splits, jours) {
    const tri = jours.slice().sort((x, y) => x.simule - y.simule || x.date.localeCompare(y.date));
    const reperes = REPERES.map(q => tri[Math.round(q * (tri.length - 1))]), ref = reperes.map(j => f.predire(tous, j));
    let max = 0;
    for (const s of splits) reperes.forEach((j, i) => { if (ref[i] > 0) max = Math.max(max, Math.abs(f.predire(s.parametres, j) / ref[i] - 1)); });
    return max;
  }

  /**
   * Les cinq règles d'un candidat, chacune avec son verdict et sa raison. Le seuil du test de Wilcoxon se divise
   * par le nombre de candidats essayés sur la ligne (`v.essayes`) : plus on en essaie, plus le hasard en fait gagner un.
   */
  function regles(c, refs, v) {
    const ok = (oui, raison) => ({ ok: !!oui, raison });
    // Un candidat qui ne s'apprend pas sur une part (aucun simulé sur les jours appris) n'est pas comparé sur moins de jours que les références.
    const manque = v.semaines.length - c.semaines.splits.length + v.mois.length - c.mois.splits.length;
    const r1 = !manque && c.semaines.erreur !== null && c.semaines.erreur < Math.min(refs.moteur.semaines.erreur, refs.constante.semaines.erreur)
      && (!v.mois.length || c.mois.splits.every(s => s.erreur < Math.min(...REFERENCES.map(n => refs[n].mois.splits.find(x => x.part === s.part).erreur))));
    const instable = instabilite(c._f || c.modele, c.parametres, c.semaines.splits, v.jours);
    const p = c.parametres, bornes = p.aBrut >= A_MIN && p.aBrut <= A_MAX && !(p.b < 0);
    // Une forme du catalogue juge ses bornes elle-même (un paramètre en butée l'écarte) ; une fiche sans bornes les tient.
    const sesBornes = !c._f ? null : c._f.verdict ? c._f.verdict(p, { moyenne: moyenne(v.jours.map(j => j.simule)) }) : { ok: true, raison: 'accepté : pas de borne' };
    const essayes = v.essayes || 1, seuil = SEUIL_P / essayes, gagne = w => w.p < seuil && w.wPlus > w.n * (w.n + 1) / 4;
    const meilleure = refs.moteur[v.cle].erreur <= refs.constante[v.cle].erreur ? 'moteur' : 'constante';
    const dates = [...c[v.cle].erreurs.keys()].filter(d => refs[meilleure][v.cle].erreurs.has(d));
    const w = wilcoxon(dates.map(d => Math.abs(refs[meilleure][v.cle].erreurs.get(d))), dates.map(d => Math.abs(c[v.cle].erreurs.get(d))));
    const gain = refs.constante.semaines.erreur - c.semaines.erreur, faux = c.placebo;
    return {
      battreReferences: ok(r1, manque ? 'refusé : non appris sur ' + manque + ' part' + (manque > 1 ? 's' : '') + ' (aucun simulé sur les jours appris)'
        : r1 ? 'accepté : plus juste que le moteur et la constante' + (v.mois.length ? ', chaque mois' : '')
          : 'refusé : pas plus juste que le moteur et la constante' + (v.mois.length ? ' sur chaque mois' : '')),
      stabilite: ok(instable <= STABILITE, (instable <= STABILITE ? 'accepté : stable, ±' : 'refusé : instable, ±') + pct(instable)),
      bornes: sesBornes ? ok(sesBornes.ok, sesBornes.raison) : ok(bornes, bornes ? 'accepté : a et b dans leurs bornes' : 'refusé : hors bornes (a = ' + fr(p.aBrut)
        + (p.b !== undefined ? ' ; b = ' + fr(p.b) : '') + ')'),
      wilcoxon: ok(gagne(w), (gagne(w) ? 'accepté' : 'refusé')
        + ' : Wilcoxon contre « ' + NOMS[meilleure] + ' », ' + (w.p < 0.001 ? 'p < 0,001' : 'p = ' + fr(w.p, essayes > 1 ? 4 : 3)) + ' (' + (v.cle === 'mois' ? 'par mois' : 'par semaine')
        + (essayes > 1 ? ' ; seuil ' + fr(SEUIL_P) + ' ÷ ' + essayes + ' = ' + fr(seuil, 4) : '') + ')'),
      placebo: ok(gain > 0 && faux !== null && faux <= PART_PLACEBO * gain, (gain > 0 && faux !== null && faux <= PART_PLACEBO * gain ? 'accepté' : 'refusé')
        + ' : simulé mélangé, gain ' + (faux === null ? '—' : fr(faux)) + ' ETP contre ' + fr(gain) + ' ETP')
    };
  }

  /** Un modèle évalué : ses paramètres sur tous les jours, sa validation par semaine et par mois. */
  function evaluer(modele, jours, v) {
    const p = apprendre(modele, jours);
    if (!p) return null;
    const semaines = valider(modele, jours, v.semaines, j => j._s);
    const mois = valider(modele, jours, v.mois, j => j._m);
    const f = fiche(modele);
    return f ? { modele: f.id, nom: f.nom || f.id, parametres: p, semaines, mois, _f: f } : { modele, nom: NOMS[modele], parametres: p, semaines, mois };
  }

  /** Les paramètres d'une forme du catalogue que la politique garde (une fiche sans `garder` : ses nombres). */
  const gardes = (f, p) => (f.garder ? f.garder(p) : Object.fromEntries(Object.entries(p).filter(([, x]) => typeof x === 'number')));

  /** Les paramètres d'un modèle sur tous les jours, et leur plage (min–max) sur tous les découpages, semaines et mois. */
  function plages(e) {
    const splits = e.semaines.splits.concat(e.mois.splits);
    const plage = (tous, l) => ({ tous, min: l.length ? Math.min(...l) : null, max: l.length ? Math.max(...l) : null });
    const cles = e._f ? Object.keys(gardes(e._f, e.parametres))
      : Object.keys(e.parametres).filter(k => typeof e.parametres[k] === 'number' && k !== 'aBrut' && k !== 'aLibre' && k !== 'bLibre');
    const out = Object.fromEntries(cles.map(k => [k, plage(e.parametres[k], splits.map(s => s.parametres[k]).filter(Number.isFinite))]));
    if (e.parametres.jours) out.jours = e.parametres.jours.map((f, k) => plage(f, splits.map(s => s.parametres.jours[k])));
    return out;
  }

  /** L'écart quadratique moyen des erreurs hors échantillon : la bande P10–P90 est la prédiction ± 1,2816 σ (`bande`). */
  const sigma = erreurs => (erreurs.size ? Math.sqrt(moyenne([...erreurs.values()].map(e => e * e))) : null);

  /** La formule d'un modèle en clair, avec ses paramètres gardés ({ modele, parametres }) : « heures réelles ≈ 3,2 × (travail au barème) puissance 0,6 ». */
  const formule = m => F.formule(m.modele, m.parametres);
  /** La formule d'un modèle évalué (une fiche donnée à la main dit la sienne, ou n'en a pas). */
  const formuleDe = e => (e._f && !F.FORMES[e.modele] ? (e._f.formule ? 'heures réelles ≈ ' + e._f.formule(gardes(e._f, e.parametres)) : '') : F.formule(e.modele, parametresRetenus(e)));

  /** Le rapport d'un modèle, sans ses erreurs jour par jour. */
  const resume = e => e && ({ modele: e.modele, nom: e.nom, formule: formuleDe(e), parametres: plages(e),
    erreurs: { semaines: e.semaines.erreur, parSemaine: e.semaines.splits.map(s => ({ semaine: s.part, erreur: s.erreur })),
      mois: e.mois.splits.length ? e.mois.erreur : null, parMois: e.mois.splits.map(s => ({ mois: s.part, erreur: s.erreur })) } });

  /**
   * Cale une ligne : `jours` = [{ date, reel, simule }] (ses jours utilisables),
   * `hors` : une ligne hors simulation (la constante). `formes` : les candidats
   * à essayer, du plus simple au plus riche — par défaut tout le catalogue ;
   * une fiche donnée telle quelle (moteur/calage-formes.js) s'essaie comme les
   * autres, et ses variables se lisent dans le jour.
   */
  function calerLigne(jours, o = {}) {
    const formes = o.formes || CANDIDATS;
    const variables = [...new Set(formes.flatMap(x => (fiche(x) && fiche(x).variables) || []))].filter(c => c !== 'simule');
    // La semaine, le mois et le jour de la semaine de chaque jour, une fois pour toutes.
    // Avec la colonne des heures supp, ses heures et ses heures supp du jour (moteur/reel.js) : le statut les lit.
    const l = (jours || []).map(j => ({ date: j.date, reel: j.reel, simule: j.simule, ...Object.fromEntries(variables.map(c => [c, j[c]])),
      ...(j.heuresSupp !== undefined ? { heures: j.heures, heuresSupp: j.heuresSupp } : {}),
      _s: semaineIso(j.date), _m: j.date.slice(0, 7), _k: jourSemaine(j.date) }))
      .sort((x, y) => x.date.localeCompare(y.date));
    if (l.length < JOURS_MIN) return { cale: false, raison: 'moins de ' + JOURS_MIN + ' jours utilisables (' + l.length + ')', jours: l.length };
    const d = decoupages(l), v = { ...d, jours: l, cle: d.mois.length ? 'mois' : 'semaines' };
    const refs = Object.fromEntries(REFERENCES.map(n => [n, evaluer(n, l, v)]));
    const s = l.map(j => j.simule), varie = Math.max(...s) - Math.min(...s) > 1e-9;
    // « b + a × » hors de ses bornes se confond avec « × a » : il n'est pas candidat, le rapport le dit.
    const evalues = o.hors || !varie ? [] : formes.map(n => evaluer(n, l, v)).filter(Boolean);
    const confondu = c => c.modele === 'b-x-a' && c.parametres.confondu, candidats = evalues.filter(c => !confondu(c));
    // Tous les candidats essayés comptent pour le seuil du test : « b + a × » confondu, et celui qui ne s'apprend pas, compris.
    const essayes = o.hors || !varie ? 0 : formes.length;
    v.essayes = essayes;
    for (const c of candidats) {
      c.placebo = gainPlacebo(c._f || c.modele, l, v.semaines, j => j._s, refs.constante.semaines.erreur);
      c.regles = regles(c, refs, v);
      c.accepte = Object.values(c.regles).every(r => r.ok);
    }
    const retenu = choisir(candidats, refs, o.hors), sg = sigma(retenu[v.cle].erreurs);
    // Le statut (évolution 17 b) : seulement si la ligne a un travail au barème qui varie. Hors « à la limite », le rythme des jours chargés borne le besoin.
    const statut = o.hors || !varie ? null : ST.statutDe(l, { joursMin: JOURS_MIN }), lecture = statut ? ST.lectureDe(statut.code) : null;
    const rythmeCharge = lecture === 'effectif mis' ? ST.rythmeDesJoursCharges(l) : null;
    return { cale: true, jours: l.length, unSeulMois: d.unSeulMois, validation: d.mois.length ? 'semaines et mois' : 'semaines',
      ...(essayes ? { essayes, seuil: SEUIL_P / essayes } : {}),
      references: Object.fromEntries(REFERENCES.map(n => [n, resume(refs[n])])),
      candidats: candidats.map(c => ({ ...resume(c), regles: c.regles, accepte: c.accepte, placebo: c.placebo, ...(c.choix ? { choix: c.choix } : {}) })),
      confondus: evalues.filter(confondu).map(c => ({ modele: c.modele, nom: c.nom, avec: 'x-a', a: c.parametres.aLibre, b: c.parametres.bLibre,
        raison: 'se confond avec « × a »' + (Number.isFinite(c.parametres.aLibre) ? ' : moindres carrés hors bornes (a = ' + fr(c.parametres.aLibre)
          + ' ; b = ' + fr(c.parametres.bLibre) + ')' : '') })),
      ...(o.hors ? { raison: 'hors simulation : la constante' } : !varie ? { raison: 'le simulé ne varie pas : pas de candidat' } : {}),
      retenu: { modele: retenu.modele, nom: retenu.nom, formule: formuleDe(retenu), parametres: parametresRetenus(retenu), sigma: sg, bande: sg === null ? null : Z_P10_P90 * sg },
      statut, ...(lecture ? { lecture } : {}), rythmeCharge,
      _retenu: retenu, _cle: v.cle };
  }

  /**
   * Le choix, parmi les candidats acceptés (rangés du plus simple au plus riche). Le plus simple sert de base : une
   * forme plus riche n'entre en lice que si elle le bat de plus de 0,1 ETP (évolution 17 a). Parmi celles-là, la plus
   * juste ; à 0,1 ETP près, la plus simple. Sans candidat accepté, la meilleure référence (la constante hors
   * simulation). Chaque candidat accepté reçoit son `choix` : « retenu », ou pourquoi il ne l'est pas.
   */
  function choisir(candidats, refs, hors) {
    const acceptes = candidats.filter(c => c.accepte), e = c => c.semaines.erreur, dit = c => '« ' + (c.nom || c.modele) + ' »', ecart = fr(ECART_SIMPLE) + ' ETP';
    if (acceptes.length) {
      const simple = acceptes[0], riches = acceptes.slice(1).filter(c => e(c) < e(simple) - ECART_SIMPLE);
      const min = riches.length ? Math.min(...riches.map(e)) : null, retenu = riches.length ? riches.find(c => e(c) <= min + ECART_SIMPLE) : simple;
      const rang = c => acceptes.indexOf(c);
      for (const c of acceptes) {
        c.choix = c === retenu ? 'retenu'
          : c === simple ? 'accepté, pas retenu : ' + dit(retenu) + ' le bat de plus de ' + ecart
            : !riches.includes(c) ? 'accepté, pas retenu : ne bat pas ' + dit(simple) + ', plus simple, de plus de ' + ecart
              : e(retenu) < e(c) - ECART_SIMPLE ? 'accepté, pas retenu : ' + dit(retenu) + ' est plus juste de plus de ' + ecart
                : rang(c) > rang(retenu) ? 'accepté, pas retenu : ' + dit(retenu) + ', plus simple, est à ' + ecart + ' près'
                  // Plus simple que le retenu, mais loin du plus juste, que le retenu vaut à 0,1 ETP près.
                  : 'accepté, pas retenu : ' + dit(riches.find(x => e(x) === min)) + ' est plus juste de plus de ' + ecart + ', et ' + dit(retenu) + ' le vaut à ' + ecart + ' près';
      }
      return retenu;
    }
    if (hors) return refs.constante;
    return refs.moteur.semaines.erreur <= refs.constante.semaines.erreur ? refs.moteur : refs.constante;
  }

  /** Les paramètres que la politique d'effectif garde. */
  function parametresRetenus(e) {
    const p = e.parametres;
    if (e._f) return gardes(e._f, p);
    if (e.modele === 'constante') return { c: p.c };
    if (e.modele === 'moteur') return {};
    return { a: p.a, ...(e.modele === 'b-x-a' ? { b: p.b } : {}), ...(e.modele === 'x-a-jour' ? { jours: p.jours.slice() } : {}) };
  }

  /**
   * Cale toutes les lignes d'une comparaison (moteur/reel.js, comparer). Rend
   * le rapport par ligne, et pour toute l'unité l'erreur et le biais du total
   * de chaque jour, avant (le moteur) et après (les modèles retenus), hors
   * échantillon.
   */
  function caler(comparaison) {
    const lignes = (comparaison.lignes || []).map(l => ({ nom: l.nom, couvre: l.couvre, ...calerLigne(l.jours, { hors: !!l.hors }) }));
    const unite = uniteAvantApres(comparaison, lignes);
    return { schema: 'ory-calage-rapport', version: 1, lignes: lignes.map(({ _retenu, _cle, ...x }) => x), unite };
  }

  /**
   * Le total de l'unité chaque jour : réel, moteur (le simulé), et la prédiction hors échantillon des modèles
   * retenus — chaque ligne validée par mois quand elle en a deux, sinon par semaine. Quand une ligne au moins
   * l'est par mois, le total se donne aussi en validation par semaines pour toutes (`semaines`) : avec deux
   * mois, la validation par mois mêle l'effet du mois et celui du volume (correction 12).
   */
  function uniteAvantApres(comparaison, lignes) {
    const dates = ((comparaison.unite && comparaison.unite.jours) || []).map(j => j.date), avant = [], apres = [], apresSemaines = [];
    for (const d of dates) {
      let reel = 0, moteur = 0, cale = 0, caleSemaines = 0, ok = true;
      (comparaison.lignes || []).forEach((l, i) => {
        const j = l.jours.find(x => x.date === d), c = lignes[i];
        if (!j) { ok = false; return; }
        reel += j.reel; moteur += j.simule;
        const e = c._retenu ? c._retenu[c._cle].erreurs.get(d) : undefined, es = c._retenu ? c._retenu.semaines.erreurs.get(d) : undefined;
        cale += e === undefined ? j.simule : j.reel - e;
        caleSemaines += es === undefined ? j.simule : j.reel - es;
      });
      if (ok) { avant.push(moteur - reel); apres.push(cale - reel); apresSemaines.push(caleSemaines - reel); }
    }
    const m = e => ({ jours: e.length, mae: e.length ? moyenne(e.map(Math.abs)) : null, biais: moyenne(e) });
    // Après : σ du total mesuré directement, la racine de la moyenne des carrés de ses erreurs hors échantillon (correction 16).
    // Un décalage commun à toutes les lignes s'y voit ; √Σσ² des lignes le suppose absent.
    const mApres = e => ({ ...m(e), sigma: e.length ? Math.sqrt(moyenne(e.map(x => x * x))) : null });
    const parMois = lignes.some(c => c._retenu && c._cle === 'mois');
    return { avant: m(avant), apres: mApres(apres), ...(parMois ? { validation: 'mois', semaines: { avant: m(avant), apres: mApres(apresSemaines) } } : {}) };
  }

  /* ----------------------------------------------------------------------
   *  Se servir d'un modèle : le prévu calé, sa bande P10–P90
   * --------------------------------------------------------------------*/

  /**
   * Le prévu calé d'un jour ({ date, simule }) par un modèle gardé ({ modele,
   * parametres, sigma }). Un jour sans date (une journée hors période) n'a pas
   * de jour de la semaine : « × a × jour » y prend le facteur moyen, 1 (`sansJour`).
   */
  function prevuCale(m, j) {
    const sansJour = m.modele === 'x-a-jour' && !/^\d{4}-\d{2}-\d{2}$/.test(String(j.date || ''));
    const p = predire(sansJour ? 'x-a' : m.modele, { b: 0, ...m.parametres }, j), s = Number.isFinite(m.sigma) ? m.sigma : 0;
    return { prevu: p, p10: p - Z_P10_P90 * s, p90: p + Z_P10_P90 * s, ...(sansJour ? { sansJour: true } : {}) };
  }

  /* ----------------------------------------------------------------------
   *  La politique d'effectif : les modèles gardés, sans aucune heure réelle
   *  (banc d'essai, évolution 11 d)
   * --------------------------------------------------------------------*/

  const MODELES = ['moteur', 'constante', 'x-a', 'b-x-a', 'x-a-jour', ...F.ORDRE];
  const objet = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const fini = x => typeof x === 'number' && Number.isFinite(x);

  /**
   * La politique d'effectif d'un calage : par ligne calée, son modèle, ses
   * paramètres et σ, et les services qu'elle couvrait (`o.correspondance`) ;
   * la date du calage, la période apprise, et la signature de ce qu'il suppose
   * (barème, équipes, correspondance) ; σ du total de l'unité, mesuré hors
   * échantillon (`sigmaUnite`, correction 16). Aucune heure réelle.
   */
  function politiqueDe(rapport, o = {}) {
    const parNom = new Map((((o.correspondance && o.correspondance.lignes) || [])).map(l => [l.nom, l]));
    const su = rapport.unite && rapport.unite.apres ? rapport.unite.apres.sigma : null;
    return { date: o.date || null, periode: o.periode ? { debut: o.periode.debut, fin: o.periode.fin } : null, signature: o.signature || null,
      lignes: (rapport.lignes || []).filter(l => l.cale).map(l => {
        const c = parNom.get(l.nom);
        return { nom: l.nom, modele: l.retenu.modele, parametres: l.retenu.parametres, sigma: l.retenu.sigma, ...(c && c.services ? { services: c.services.slice() } : {}),
          // Le statut et le rythme des jours chargés (évolution 17 b) : deux résumés, aucune heure réelle.
          ...(l.statut ? { statut: l.statut.code } : {}), ...(l.rythmeCharge && ST.rythmeValide(l.rythmeCharge.rythme) ? { rythmeCharge: l.rythmeCharge.rythme } : {}) };
      }), ...(fini(su) ? { sigmaUnite: su } : {}) };
  }

  /**
   * La ligne d'une politique une fois son « × a » appliqué au barème : a = 1 jusqu'au prochain calage (le prévu ne
   * compte pas le facteur deux fois). Son travail au barème est maintenant multiplié par a : le rythme des jours
   * chargés (réel ÷ travail au barème) se divise par a, pour que le besoin « au plus » reste le même (évolution 17 b).
   */
  function ligneAppliquee(m) {
    // Un rythme qui sortirait de ce qu'une politique garde ne se garde pas : la ligne n'a alors plus de borne.
    const { rythmeCharge, ...ligne } = m, r = rythmeCharge / m.parametres.a;
    return { ...ligne, parametres: { a: 1 }, applique: true, ...(ST.rythmeValide(r) ? { rythmeCharge: r } : {}) };
  }

  /** Les bornes d'un modèle gardé : celles du calage (a ∈ [0,5 ; 2], b ≥ 0), une constante et des facteurs du jour positifs, σ fini. */
  const BORNES = { a: [A_MIN, A_MAX], b: [0, 1e6], c: [0, 1e6] }, FACTEUR_MAX = 10, SIGMA_MAX = 1e6;

  /** La politique relue (la sauvegarde) : refusée entière si elle est mal formée. */
  function validerPolitique(p) {
    if (p === undefined || p === null) return null;
    if (!objet(p) || !Array.isArray(p.lignes) || p.lignes.length > 200) throw new Error('politique d’effectif : { date, periode, lignes } est attendu.');
    const date = p.date === null || p.date === undefined ? null : String(p.date);
    if (date !== null && !/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(date)) throw new Error('politique d’effectif : une date ISO est attendue.');
    const jour = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
    if (p.periode !== null && p.periode !== undefined && !(objet(p.periode) && jour(p.periode.debut) && jour(p.periode.fin)))
      throw new Error('politique d’effectif : la période apprise est { debut, fin }.');
    const noms = new Set();
    const lignes = p.lignes.map((l, i) => {
      const ou = 'politique d’effectif, ligne ' + (i + 1);
      if (!objet(l) || typeof l.nom !== 'string' || !l.nom.trim() || l.nom.length > 160) throw new Error(ou + ' : un nom est attendu.');
      if (noms.has(l.nom.trim())) throw new Error(ou + ' : deux lignes s’appellent « ' + l.nom.trim() + ' ».');
      noms.add(l.nom.trim());
      if (!MODELES.includes(l.modele)) throw new Error(ou + ' : modèle inconnu « ' + l.modele + ' ».');
      const q = objet(l.parametres) ? l.parametres : {};
      // Une forme du catalogue relit ses paramètres elle-même, dans ses bornes (évolution 17 a).
      const f = F.FORMES[l.modele], out = f ? f.relire(q, ou) : {};
      for (const k of f ? [] : ['a', 'b', 'c']) if (q[k] !== undefined) {
        if (!fini(q[k]) || q[k] < BORNES[k][0] || q[k] > BORNES[k][1]) throw new Error(ou + ' : ' + k + ' hors de ses bornes (' + BORNES[k].map(x => fr(x)).join(' à ') + ').');
        out[k] = q[k];
      }
      if (!f && q.jours !== undefined) {
        if (!Array.isArray(q.jours) || q.jours.length !== 7 || !q.jours.every(x => fini(x) && x > 0 && x <= FACTEUR_MAX)) throw new Error(ou + ' : sept facteurs du jour, positifs.');
        out.jours = q.jours.slice();
      }
      if ((l.modele === 'x-a' || l.modele === 'b-x-a' || l.modele === 'x-a-jour') && !fini(out.a)) throw new Error(ou + ' : a manque.');
      if (l.modele === 'b-x-a' && !fini(out.b)) throw new Error(ou + ' : b manque.');
      if (l.modele === 'x-a-jour' && !out.jours) throw new Error(ou + ' : les facteurs du jour manquent.');
      if (l.modele === 'constante' && !fini(out.c)) throw new Error(ou + ' : la constante manque.');
      if (l.sigma !== null && l.sigma !== undefined && !(fini(l.sigma) && l.sigma >= 0 && l.sigma <= SIGMA_MAX)) throw new Error(ou + ' : σ est un nombre positif.');
      const services = l.services === undefined ? null : l.services;
      if (services !== null && !(Array.isArray(services) && services.length <= 100 && services.every(x => typeof x === 'string' && x && x.length <= 160)))
        throw new Error(ou + ' : les services sont une liste de noms.');
      return { nom: l.nom.trim(), modele: l.modele, parametres: out, sigma: fini(l.sigma) ? l.sigma : null,
        ...(services ? { services: services.slice() } : {}), ...(l.applique === true ? { applique: true } : {}), ...ST.relire(l, ou) };
    });
    // σ du total (correction 16) : borné comme le σ d'une ligne ; absent, la politique d'avant (√Σσ²).
    const su = p.sigmaUnite;
    if (su !== null && su !== undefined && !(fini(su) && su >= 0 && su <= SIGMA_MAX)) throw new Error('politique d’effectif : σ du total est un nombre positif ou nul.');
    return { date, periode: p.periode ? { debut: p.periode.debut, fin: p.periode.fin } : null,
      signature: typeof p.signature === 'string' && p.signature.length <= 64 ? p.signature : null, lignes, ...(fini(su) ? { sigmaUnite: su } : {}) };
  }

  /** Un jour décalé de `k` jours (« 2026-11-02 » + 1) ; ce qui n'est pas une date reste tel quel. */
  function jourDecale(d, k) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) || !k) return d;
    const t = utc(d); t.setUTCDate(t.getUTCDate() + k);
    return t.toISOString().slice(0, 10);
  }

  /**
   * Le jour de travail d'une ligne, pour son facteur du jour : la date du jour ;
   * pour une journée seule (`w.decalages`), le jour des vols + le décalage de
   * ses équipes, s'il est le même pour toutes ; sinon, aucun (le facteur moyen).
   */
  function jourDeTravail(l, w) {
    if (!w.decalages || !l.services) return w.date;
    const ks = [...new Set(l.services.flatMap(s => w.decalages[s] || []))];
    return ks.length > 1 ? null : jourDecale(w.date, ks[0] || 0);
  }

  /**
   * Le prévu calé : chaque ligne de la correspondance, par son modèle gardé,
   * appliquée au simulé de chaque jour (`jours` : [{ date, services, total }]
   * — un jour de travail du bilan, ou une journée), avec sa bande P10–P90 ;
   * une ligne sans modèle gardé (pas calée, ou ajoutée depuis) compte son
   * simulé (« moteur », σ nul). Le total de l'unité : toutes les lignes, sa
   * bande à σ du total mesuré par le calage (`sigmaUnite`, correction 16) ;
   * une politique d'avant ne l'a pas : σ = √Σσ² (des écarts supposés
   * indépendants d'une ligne à l'autre). `sigmaUniteSource` dit lequel.
   * `simuleDe(ligne, jour)` : le simulé d'une ligne de la correspondance (moteur/reel.js).
   */
  function prevuDesJours(politique, correspondance, jours, simuleDe) {
    if (!politique) return null;
    const modeles = new Map(politique.lignes.map(m => [m.nom, m]));
    // Une politique gardée depuis l'évolution 17 (une ligne au moins a son statut) dit aussi la formule de chaque ligne ;
    // une politique d'avant rend le prévu d'avant, champ par champ.
    const avecFormule = politique.lignes.some(m => ST.connu(m.statut));
    const lignes = (((correspondance && correspondance.lignes) || [])).map(l => {
      const m = modeles.get(l.nom) || { modele: 'moteur', parametres: {}, sigma: 0, nonCalee: true };
      return { nom: l.nom, modele: m.modele, nomModele: NOMS[m.modele], ...(avecFormule ? { formule: formule(m) } : {}), sigma: m.sigma || 0, ...(m.applique ? { applique: true } : {}), ...(m.nonCalee ? { nonCalee: true } : {}),
        ...(ST.connu(m.statut) ? { statut: m.statut, nomStatut: ST.NOMS[m.statut], lecture: ST.lectureDe(m.statut) } : {}),
        jours: jours.map(w => {
          const simule = simuleDe(l, w), p = prevuCale(m, { date: jourDeTravail(l, w), simule }), auPlus = ST.besoinAuPlus(m, simule, p.prevu);
          return { date: w.date, simule, ...p, ...(auPlus === null ? {} : { besoinAuPlus: auPlus }) };
        }) };
    });
    // Le besoin « au plus » de l'unité, dès qu'une ligne a le sien : chaque ligne à sa borne, sinon à son prévu.
    const borne = lignes.some(l => l.jours.some(j => j.besoinAuPlus !== undefined));
    const mesure = fini(politique.sigmaUnite), s = mesure ? politique.sigmaUnite : Math.sqrt(lignes.reduce((n, l) => n + l.sigma ** 2, 0));
    const unite = jours.map((w, i) => {
      const prevu = lignes.reduce((n, l) => n + l.jours[i].prevu, 0), simule = lignes.reduce((n, l) => n + l.jours[i].simule, 0);
      return { date: w.date, simule, prevu, p10: prevu - Z_P10_P90 * s, p90: prevu + Z_P10_P90 * s,
        ...(borne ? { besoinAuPlus: lignes.reduce((n, l) => n + (l.jours[i].besoinAuPlus !== undefined ? l.jours[i].besoinAuPlus : l.jours[i].prevu), 0) } : {}) };
    });
    return { calage: { date: politique.date, periode: politique.periode }, lignes, unite, sigmaUnite: s, sigmaUniteSource: mesure ? 'mesuré' : 'lignes indépendantes' };
  }

  /** La ligne qui dit, sous la bande du total, d'où vient son σ (correction 16) : la page et les classeurs. */
  function texteSigmaUnite(x) {
    if (!x || !fini(x.sigmaUnite)) return '';
    return 'Bande du total : σ = ' + fr(x.sigmaUnite) + ' ETP, ' + (x.sigmaUniteSource === 'mesuré'
      ? 'mesuré par le calage sur le total de l’unité, hors échantillon.'
      : '√Σσ² des lignes, supposées indépendantes (un calage plus ancien ne l’a pas mesuré : le refaire le mesure).');
  }

  /**
   * Une journée en jour de travail, pour le prévu calé d'une journée seule :
   * la charge et les heures sup de chaque service (ses équipes, quel que soit
   * leur jour), l'encadrement saisi, les chauffeurs du handling ; et le
   * décalage (`jour`) des équipes de chaque service, pour le jour de la semaine.
   */
  function jourDeLaJournee(extrait, encadrement) {
    const services = {}, total = { chauffeursCamion: 0, chauffeursVL: 0, heuresSupChauffeurs: 0 }, decalages = {};
    const service = id => (services[id] = services[id] || { charge: 0, heuresSup: 0, chargeEncadrement: 0 });
    for (const e of extrait.equipes || []) {
      const s = service(e.service);
      s.charge += e.charge || 0; s.heuresSup += e.heuresSup || 0;
      const d = decalages[e.service] = decalages[e.service] || [];
      if (!d.includes(e.jour || 0)) d.push(e.jour || 0);
      if (e.chauffeurs) { total.chauffeursCamion += e.chauffeurs.camion || 0; total.chauffeursVL += e.chauffeurs.vl || 0; }
      total.heuresSupChauffeurs += e.heuresSupChauffeurs || 0;
    }
    for (const [id, n] of Object.entries(encadrement || {})) service(id).chargeEncadrement = +n || 0;
    return { date: extrait.date, services, total, decalages };
  }

  /* ----------------------------------------------------------------------
   *  Appliquer un facteur au barème — et l'annuler, exactement
   * --------------------------------------------------------------------*/

  const copie = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  /**
   * Des minutes × k, arrondies comme la page les garde : `pas` = 100 (le
   * barème, au centième de minute), 10 (les cases et l'armement, au dixième),
   * 0 (les minutes par vol d'une équipe d'appui, sans arrondi, 24 h au plus).
   */
  const multiplier = (t, k, pas) => Object.fromEntries(Object.entries(t || {}).map(([c, v]) => [c,
    typeof v !== 'number' ? v : pas ? Math.round(v * k * pas) / pas : Math.min(1440, v * k)]));
  const valeurs = t => Object.values(t || {}).filter(v => typeof v === 'number' && v > 0).length;
  /** Une équipe dont le travail suit le barème : calculée d'après lui. Hors de la page, à la main ou d'appui, sans effectif fixe. */
  const suitLeBaremeParDefaut = a => (a.type === 'manuel' || a.type === 'appui') && a.effectif !== 'fixe';

  /**
   * Multiplie par `k` le travail des services : leurs minutes au barème
   * (toutes les compagnies × classes ; un barème repris devient le leur), les
   * minutes propres des équipes qui y travaillent, les minutes par vol de
   * leurs équipes d'appui, et les minutes par compagnie de leurs catégories
   * (l'armement). Une annexe qui reprenait le barème d'un de ces services
   * garde celui d'avant. Rend les nouveaux états, ce qu'il faut pour revenir
   * exactement en arrière, et `refus` quand le facteur ne corrigerait pas tout
   * le travail de la ligne (rien à multiplier, ou des équipes dont le travail
   * ne suit pas le barème : effectif saisi, lavage, handling).
   * @param x { bareme (le barème propre, ory-modele-v1), complet (avec les barèmes repris), ateliers, categories }
   * @param o { parents: { annexe: service }, suitLeBareme(équipe) }
   */
  function appliquerFacteur(x, services, k, o = {}) {
    const avant = { bareme: {}, minutes: {}, minutesVol: {}, categories: {} }, bareme = copie(x.bareme || {}), categories = copie(x.categories || {});
    const propre = s => x.bareme && x.bareme[s] !== undefined, suit = o.suitLeBareme || suitLeBaremeParDefaut;
    let n = 0;
    for (const s of services) {
      avant.bareme[s] = propre(s) ? copie(x.bareme[s]) : null;
      const t = propre(s) ? x.bareme[s] : x.complet && x.complet[s];
      if (t) { bareme[s] = multiplier(t, k, 100); n += valeurs(t); }
      if (categories[s]) {
        avant.categories[s] = copie(x.categories[s]);
        categories[s] = categories[s].map(c => { n += valeurs(c.minutes); return { ...c, minutes: multiplier(c.minutes, k, 10) }; });
      }
    }
    // Une annexe qui reprend le barème d'un de ces services garde celui d'avant : le facteur ne vaut que pour la ligne.
    for (const [annexe, pere] of Object.entries(o.parents || {}))
      if (services.includes(pere) && !services.includes(annexe) && !propre(annexe) && x.complet && x.complet[annexe]) {
        avant.bareme[annexe] = null; bareme[annexe] = copie(x.complet[annexe]);
      }
    const horsBareme = [];
    const ateliers = (x.ateliers || []).map(a => {
      if (!services.includes(a.service)) return a;
      if (a.type !== 'dispo' && (a.personnes || 0) > 0 && !suit(a)) horsBareme.push(a.nom || a.id);
      let b = a;
      if (a.minutes) { avant.minutes[a.id] = copie(a.minutes); b = { ...b, minutes: multiplier(a.minutes, k, 10) }; n += valeurs(a.minutes); }
      if (a.type === 'appui' && a.minutesVol) { avant.minutesVol[a.id] = copie(a.minutesVol); b = { ...b, minutesVol: multiplier(a.minutesVol, k, 0) }; n += valeurs(a.minutesVol); }
      return b;
    });
    const refus = !n ? 'aucune minute à multiplier : le travail de ' + (services.length > 1 ? 'ces services' : 'ce service') + ' ne vient pas du barème'
      : horsBareme.length ? 'le travail de ' + horsBareme.map(x => '« ' + x + ' »').join(', ') + ' ne suit pas le barème (effectif saisi, lavage, handling) : le facteur n’en corrigerait qu’une part'
        : null;
    return { bareme, ateliers, categories, avant, valeurs: n, horsBareme, refus };
  }

  /** Revient exactement à l'état d'avant une application (`avant`, rendu par appliquerFacteur). */
  function annulerFacteur(x, avant) {
    const bareme = copie(x.bareme || {}), categories = copie(x.categories || {});
    for (const [s, t] of Object.entries(avant.bareme || {})) { if (t === null) delete bareme[s]; else bareme[s] = copie(t); }
    for (const [s, l] of Object.entries(avant.categories || {})) categories[s] = copie(l);
    const m = avant.minutes || {}, mv = avant.minutesVol || {};
    const ateliers = (x.ateliers || []).map(a => {
      let b = a;
      if (m[a.id] !== undefined) b = { ...b, minutes: copie(m[a.id]) };
      if (mv[a.id] !== undefined) b = { ...b, minutesVol: copie(mv[a.id]) };
      return b;
    });
    return { bareme, ateliers, categories };
  }

  /** Une application s'annule si aucune plus récente ne touche un de ses services (sinon l'ordre compte : la plus récente d'abord). */
  function annulable(applications, i) {
    const x = applications[i];
    return !!x && !applications.slice(i + 1).some(y => y.services.some(s => x.services.includes(s)));
  }

  /** Les lignes dont l'erreur a monté de plus de 0,3 ETP depuis une application (la ligne appliquée exceptée). */
  function lignesDegradees(application, comparaison, seuil = 0.3) {
    const out = [];
    for (const l of (comparaison && comparaison.lignes) || []) {
      if (l.nom === application.ligne) continue;
      const avant = (application.erreursAvant || {})[l.nom];
      if (Number.isFinite(avant) && Number.isFinite(l.periode.mae) && l.periode.mae - avant > seuil) out.push({ nom: l.nom, avant, apres: l.periode.mae });
    }
    return out;
  }

  /** Une empreinte courte d'un texte (FNV-1a, 32 bits) : ce que suppose un calage, pour savoir s'il est à refaire. */
  function empreinte(texte) {
    let h = 0x811c9dc5;
    for (let i = 0; i < texte.length; i++) { h ^= texte.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }

  const api = { JOURS_MIN, CANDIDATS, NOMS, SEUIL_P, ECART_SIMPLE, semaineIso, jourSemaine, apprendre, predire, facteursDuJour, decoupages, wilcoxon, phi,
    calerLigne, caler, choisir, formule, ligneAppliquee, prevuCale, Z_P10_P90, politiqueDe, validerPolitique, prevuDesJours, texteSigmaUnite, jourDeLaJournee, jourDecale, appliquerFacteur, annulerFacteur,
    annulable, lignesDegradees, empreinte };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyCalagePeriode = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

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
 * ==========================================================================*/
(function (root) {
  'use strict';

  const JOURS_MIN = 20, JOURS_MOIS_MIN = 14;
  const A_MIN = 0.5, A_MAX = 2, STABILITE = 0.15, SEUIL_P = 0.05, PLACEBOS = 20, GRAINE = 20261102, PART_PLACEBO = 0.25;
  const ECART_SIMPLE = 0.1, Z_P10_P90 = 1.2816;
  /** Les candidats, du plus simple au plus riche ; les références. */
  const CANDIDATS = ['x-a', 'b-x-a', 'x-a-jour'], REFERENCES = ['moteur', 'constante'];
  const NOMS = { 'moteur': 'moteur', 'constante': 'constante', 'x-a': '× a', 'b-x-a': 'b + a ×', 'x-a-jour': '× a × jour' };
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

  /** Le gain moyen d'un candidat sur la constante, le simulé mélangé entre les jours (20 mélanges, graine fixe). */
  function gainPlacebo(modele, jours, parts, quelle, erreurConstante) {
    const h = hasard(GRAINE), gains = [];
    for (let k = 0; k < PLACEBOS; k++) {
      const s = melanger(jours.map(j => j.simule), h), faux = jours.map((j, i) => ({ ...j, simule: s[i] }));
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
    const niveau = p => p.b + p.a * moyenne(jours.map(j => j.simule));
    const valeurs = p => [p.a].concat(modele === 'b-x-a' && !p.confondu ? [niveau(p)] : []).concat(modele === 'x-a-jour' ? p.jours : []);
    const ref = valeurs(tous);
    let max = 0;
    for (const s of splits) valeurs(s.parametres).forEach((v, i) => { if (ref[i] > 0) max = Math.max(max, Math.abs(v / ref[i] - 1)); });
    return max;
  }

  /** Les cinq règles d'un candidat, chacune avec son verdict et sa raison. */
  function regles(c, refs, v) {
    const ok = (oui, raison) => ({ ok: !!oui, raison });
    // Un candidat qui ne s'apprend pas sur une part (aucun simulé sur les jours appris) n'est pas comparé sur moins de jours que les références.
    const manque = v.semaines.length - c.semaines.splits.length + v.mois.length - c.mois.splits.length;
    const r1 = !manque && c.semaines.erreur !== null && c.semaines.erreur < Math.min(refs.moteur.semaines.erreur, refs.constante.semaines.erreur)
      && (!v.mois.length || c.mois.splits.every(s => s.erreur < Math.min(...REFERENCES.map(n => refs[n].mois.splits.find(x => x.part === s.part).erreur))));
    const instable = instabilite(c.modele, c.parametres, c.semaines.splits, v.jours);
    const p = c.parametres, bornes = p.aBrut >= A_MIN && p.aBrut <= A_MAX && !(p.b < 0);
    const meilleure = refs.moteur[v.cle].erreur <= refs.constante[v.cle].erreur ? 'moteur' : 'constante';
    const dates = [...c[v.cle].erreurs.keys()].filter(d => refs[meilleure][v.cle].erreurs.has(d));
    const w = wilcoxon(dates.map(d => Math.abs(refs[meilleure][v.cle].erreurs.get(d))), dates.map(d => Math.abs(c[v.cle].erreurs.get(d))));
    const gain = refs.constante.semaines.erreur - c.semaines.erreur, faux = c.placebo;
    return {
      battreReferences: ok(r1, manque ? 'refusé : non appris sur ' + manque + ' part' + (manque > 1 ? 's' : '') + ' (aucun simulé sur les jours appris)'
        : r1 ? 'accepté : plus juste que le moteur et la constante' + (v.mois.length ? ', chaque mois' : '')
          : 'refusé : pas plus juste que le moteur et la constante' + (v.mois.length ? ' sur chaque mois' : '')),
      stabilite: ok(instable <= STABILITE, (instable <= STABILITE ? 'accepté : stable, ±' : 'refusé : instable, ±') + pct(instable)),
      bornes: ok(bornes, bornes ? 'accepté : a et b dans leurs bornes' : 'refusé : hors bornes (a = ' + fr(p.aBrut)
        + (p.b !== undefined ? ' ; b = ' + fr(p.b) : '') + ')'),
      wilcoxon: ok(w.p < SEUIL_P && w.wPlus > w.n * (w.n + 1) / 4, (w.p < SEUIL_P && w.wPlus > w.n * (w.n + 1) / 4 ? 'accepté' : 'refusé')
        + ' : Wilcoxon contre « ' + NOMS[meilleure] + ' », ' + (w.p < 0.001 ? 'p < 0,001' : 'p = ' + fr(w.p, 3)) + ' (' + (v.cle === 'mois' ? 'par mois' : 'par semaine') + ')'),
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
    return { modele, nom: NOMS[modele], parametres: p, semaines, mois };
  }

  /** Les paramètres d'un modèle sur tous les jours, et leur plage (min–max) sur tous les découpages, semaines et mois. */
  function plages(e) {
    const splits = e.semaines.splits.concat(e.mois.splits);
    const plage = (tous, l) => ({ tous, min: l.length ? Math.min(...l) : null, max: l.length ? Math.max(...l) : null });
    const cles = Object.keys(e.parametres).filter(k => typeof e.parametres[k] === 'number' && k !== 'aBrut' && k !== 'aLibre' && k !== 'bLibre');
    const out = Object.fromEntries(cles.map(k => [k, plage(e.parametres[k], splits.map(s => s.parametres[k]).filter(Number.isFinite))]));
    if (e.parametres.jours) out.jours = e.parametres.jours.map((f, k) => plage(f, splits.map(s => s.parametres.jours[k])));
    return out;
  }

  /** L'écart quadratique moyen des erreurs hors échantillon : la bande P10–P90 est la prédiction ± 1,2816 σ (`bande`). */
  const sigma = erreurs => (erreurs.size ? Math.sqrt(moyenne([...erreurs.values()].map(e => e * e))) : null);

  /** Le rapport d'un modèle, sans ses erreurs jour par jour. */
  const resume = e => e && ({ modele: e.modele, nom: e.nom, parametres: plages(e),
    erreurs: { semaines: e.semaines.erreur, parSemaine: e.semaines.splits.map(s => ({ semaine: s.part, erreur: s.erreur })),
      mois: e.mois.splits.length ? e.mois.erreur : null, parMois: e.mois.splits.map(s => ({ mois: s.part, erreur: s.erreur })) } });

  /**
   * Cale une ligne : `jours` = [{ date, reel, simule }] (ses jours utilisables),
   * `hors` : une ligne hors simulation (la constante).
   */
  function calerLigne(jours, o = {}) {
    // La semaine, le mois et le jour de la semaine de chaque jour, une fois pour toutes.
    const l = (jours || []).map(j => ({ date: j.date, reel: j.reel, simule: j.simule, _s: semaineIso(j.date), _m: j.date.slice(0, 7), _k: jourSemaine(j.date) }))
      .sort((x, y) => x.date.localeCompare(y.date));
    if (l.length < JOURS_MIN) return { cale: false, raison: 'moins de ' + JOURS_MIN + ' jours utilisables (' + l.length + ')', jours: l.length };
    const d = decoupages(l), v = { ...d, jours: l, cle: d.mois.length ? 'mois' : 'semaines' };
    const refs = Object.fromEntries(REFERENCES.map(n => [n, evaluer(n, l, v)]));
    const s = l.map(j => j.simule), varie = Math.max(...s) - Math.min(...s) > 1e-9;
    // « b + a × » hors de ses bornes se confond avec « × a » : il n'est pas candidat, le rapport le dit.
    const evalues = o.hors || !varie ? [] : CANDIDATS.map(n => evaluer(n, l, v)).filter(Boolean);
    const confondu = c => c.modele === 'b-x-a' && c.parametres.confondu, candidats = evalues.filter(c => !confondu(c));
    for (const c of candidats) {
      c.placebo = gainPlacebo(c.modele, l, v.semaines, j => j._s, refs.constante.semaines.erreur);
      c.regles = regles(c, refs, v);
      c.accepte = Object.values(c.regles).every(r => r.ok);
    }
    const retenu = choisir(candidats, refs, o.hors), sg = sigma(retenu[v.cle].erreurs);
    return { cale: true, jours: l.length, unSeulMois: d.unSeulMois, validation: d.mois.length ? 'semaines et mois' : 'semaines',
      references: Object.fromEntries(REFERENCES.map(n => [n, resume(refs[n])])),
      candidats: candidats.map(c => ({ ...resume(c), regles: c.regles, accepte: c.accepte, placebo: c.placebo })),
      confondus: evalues.filter(confondu).map(c => ({ modele: c.modele, nom: c.nom, avec: 'x-a', a: c.parametres.aLibre, b: c.parametres.bLibre,
        raison: 'se confond avec « × a »' + (Number.isFinite(c.parametres.aLibre) ? ' : moindres carrés hors bornes (a = ' + fr(c.parametres.aLibre)
          + ' ; b = ' + fr(c.parametres.bLibre) + ')' : '') })),
      ...(o.hors ? { raison: 'hors simulation : la constante' } : !varie ? { raison: 'le simulé ne varie pas : pas de candidat' } : {}),
      retenu: { modele: retenu.modele, nom: retenu.nom, parametres: parametresRetenus(retenu), sigma: sg, bande: sg === null ? null : Z_P10_P90 * sg },
      _retenu: retenu, _cle: v.cle };
  }

  /** Le plus juste des candidats acceptés ; à 0,1 ETP près, le plus simple ; sans candidat, la meilleure référence (la constante hors simulation). */
  function choisir(candidats, refs, hors) {
    const acceptes = candidats.filter(c => c.accepte);
    if (acceptes.length) {
      const min = Math.min(...acceptes.map(c => c.semaines.erreur));
      return acceptes.filter(c => c.semaines.erreur <= min + ECART_SIMPLE).sort((x, y) => CANDIDATS.indexOf(x.modele) - CANDIDATS.indexOf(y.modele))[0];
    }
    if (hors) return refs.constante;
    return refs.moteur.semaines.erreur <= refs.constante.semaines.erreur ? refs.moteur : refs.constante;
  }

  /** Les paramètres que la politique d'effectif garde. */
  function parametresRetenus(e) {
    const p = e.parametres;
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

  /** Le total de l'unité chaque jour : réel, moteur (le simulé), et la prédiction hors échantillon des modèles retenus. */
  function uniteAvantApres(comparaison, lignes) {
    const dates = ((comparaison.unite && comparaison.unite.jours) || []).map(j => j.date), avant = [], apres = [];
    for (const d of dates) {
      let reel = 0, moteur = 0, cale = 0, ok = true;
      (comparaison.lignes || []).forEach((l, i) => {
        const j = l.jours.find(x => x.date === d), c = lignes[i];
        if (!j) { ok = false; return; }
        reel += j.reel; moteur += j.simule;
        const e = c._retenu ? c._retenu[c._cle].erreurs.get(d) : undefined;
        cale += e === undefined ? j.simule : j.reel - e;
      });
      if (ok) { avant.push(moteur - reel); apres.push(cale - reel); }
    }
    const m = e => ({ jours: e.length, mae: e.length ? moyenne(e.map(Math.abs)) : null, biais: moyenne(e) });
    return { avant: m(avant), apres: m(apres) };
  }

  /* ----------------------------------------------------------------------
   *  Se servir d'un modèle : le prévu calé, sa bande P10–P90
   * --------------------------------------------------------------------*/

  /** Le prévu calé d'un jour ({ date, simule }) par un modèle gardé ({ modele, parametres, sigma }). */
  function prevuCale(m, j) {
    const p = predire(m.modele, { b: 0, ...m.parametres }, j), s = Number.isFinite(m.sigma) ? m.sigma : 0;
    return { prevu: p, p10: p - Z_P10_P90 * s, p90: p + Z_P10_P90 * s };
  }

  const api = { JOURS_MIN, CANDIDATS, NOMS, semaineIso, jourSemaine, apprendre, predire, facteursDuJour, decoupages, wilcoxon, phi,
    calerLigne, caler, prevuCale, Z_P10_P90 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyCalagePeriode = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

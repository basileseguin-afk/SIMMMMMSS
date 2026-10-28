/* Banc d'essai, évolution 11 (c) — le calage sur le réel (moteur/calage-periode.js) :
 * par ligne de la correspondance, deux références (moteur, constante), trois
 * candidats (× a, b + a ×, × a × jour), validés hors échantillon (une semaine
 * ISO laissée de côté ; un mois, s'il y en a deux de 14 jours), cinq règles
 * (plus juste que les références, stable, dans ses bornes, Wilcoxon, placebo),
 * le choix, σ et la bande P10–P90 (docs/BANC_ESSAI.md § 10). Des jours
 * fabriqués dont on connaît la vérité ; aucune donnée réelle. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../moteur/calage-periode.js');

/** Un hasard reproductible pour fabriquer les jours (le même à chaque passage). */
function hasard(graine) {
  let a = graine >>> 0;
  return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
}
const bruit = (h, s) => (h() + h() + h() - 1.5) * s * 2;      // à peu près normal, centré
/** `n` jours à partir de `debut` : le simulé varie avec le volume, le réel = vrai(simulé, jour, date). */
function jours(n, vrai, { debut = '2026-09-01', graine = 7, simule } = {}) {
  const h = hasard(graine), t0 = Date.parse(debut + 'T12:00:00Z');
  return Array.from({ length: n }, (_, i) => {
    const date = new Date(t0 + i * 86400000).toISOString().slice(0, 10);
    const s = simule ? simule(h, i) : 12 + 8 * h();
    return { date, simule: s, reel: vrai(s, C.jourSemaine(date), date, h) };
  });
}
const accepte = (r, m) => r.candidats.some(c => c.modele === m && c.accepte);

test('réel = 0,8 × simulé, peu de bruit : « × a », a = 0,80 à 2 % près', () => {
  const r = C.calerLigne(jours(61, (s, k, d, h) => 0.8 * s + bruit(h, 0.15)));
  assert.equal(r.cale, true);
  assert.equal(r.retenu.modele, 'x-a');
  assert.ok(Math.abs(r.retenu.parametres.a / 0.8 - 1) < 0.02, 'a = ' + r.retenu.parametres.a);
  assert.equal(r.validation, 'semaines et mois');
  const c = r.candidats.find(x => x.modele === 'x-a');
  for (const regle of Object.values(c.regles)) assert.equal(regle.ok, true, regle.raison);
  assert.match(c.regles.stabilite.raison, /^accepté : stable, ±\d+ %$/);
  assert.ok(r.retenu.sigma > 0 && r.retenu.sigma < 0.5, 'σ ' + r.retenu.sigma);
  // Les paramètres sur tous les jours, et leur plage sur les découpages.
  assert.ok(c.parametres.a.min <= c.parametres.a.tous && c.parametres.a.tous <= c.parametres.a.max);
  assert.ok(c.erreurs.parSemaine.length >= 8 && c.erreurs.parMois.length === 2);
  // Le placebo : le gain du simulé mélangé tombe au quart, au plus, du vrai gain sur la constante.
  const gain = r.references.constante.erreurs.semaines - c.erreurs.semaines;
  assert.ok(gain > 0 && c.placebo <= 0.25 * gain, 'placebo ' + c.placebo + ', gain ' + gain);
  // Wilcoxon contre la meilleure référence (la constante : le moteur se trompe de 20 %), par mois : p tout petit, écrit « p < 0,001 ».
  assert.match(c.regles.wilcoxon.raison, /^accepté : Wilcoxon contre « constante », p < 0,001 \(par mois\)$/);
  assert.equal(r.retenu.bande, C.Z_P10_P90 * r.retenu.sigma);
});

test('un a qui dérive d’une semaine à l’autre : refusé, instable', () => {
  // Trois semaines ISO entières (du lundi 07/09 au dimanche 27/09) : a = 0,5, puis 0,8, puis 1,3.
  const r = C.calerLigne(jours(21, (s, k, d) => (d < '2026-09-14' ? 0.5 : d < '2026-09-21' ? 0.8 : 1.3) * s, { debut: '2026-09-07' }));
  const c = r.candidats.find(x => x.modele === 'x-a');
  assert.equal(c.regles.stabilite.ok, false);
  assert.match(c.regles.stabilite.raison, /^refusé : instable, ±\d+ %$/);
  assert.ok(+c.regles.stabilite.raison.match(/±(\d+)/)[1] > 15);
  assert.equal(c.accepte, false);
});

test('un candidat qui ne s’apprend pas sur une part est refusé : il n’est pas comparé sur moins de jours', () => {
  // Le simulé est nul deux semaines sur trois : sans la troisième, « × a » n'a rien à apprendre.
  const r = C.calerLigne(jours(21, (s, k, d, h) => 0.8 * s + bruit(h, 0.05) + 0.2, { debut: '2026-09-07', simule: (h, i) => (i < 14 ? 0 : 10 + 5 * h()) }));
  const c = r.candidats.find(x => x.modele === 'x-a');
  assert.equal(c.erreurs.parSemaine.length, 2);
  assert.equal(c.regles.battreReferences.ok, false);
  assert.match(c.regles.battreReferences.raison, /^refusé : non appris sur 1 part /);
});

test('un réel constant autour de 15 : la constante', () => {
  const r = C.calerLigne(jours(45, (s, k, d, h) => 15 + bruit(h, 0.5)));
  assert.equal(r.retenu.modele, 'constante');
  assert.ok(Math.abs(r.retenu.parametres.c - 15) < 0.3);
  assert.ok(!r.candidats.some(c => c.accepte));
});

test('un bruit sans lien avec le volume : le placebo refuse', () => {
  const r = C.calerLigne(jours(45, (s, k, d, h) => 16 + bruit(h, 1), { simule: h => 20 + bruit(h, 0.3) }));
  const c = r.candidats.find(x => x.modele === 'x-a');
  assert.equal(c.regles.placebo.ok, false, c.regles.placebo.raison);
  assert.match(c.regles.placebo.raison, /^refusé : simulé mélangé/);
  assert.ok(['moteur', 'constante'].includes(r.retenu.modele));
});

test('un fort effet du jour de la semaine, le même deux mois : « × a × jour » ; un effet qui s’inverse d’un mois à l’autre : refusé', () => {
  const effet = [1.35, 1, 1, 1, 1, 0.7, 0.7];
  const r = C.calerLigne(jours(61, (s, k, d, h) => 0.8 * s * effet[k] + bruit(h, 0.1)));
  assert.equal(r.retenu.modele, 'x-a-jour', JSON.stringify(r.candidats.map(c => [c.modele, c.accepte, c.erreurs.semaines])));
  assert.ok(r.retenu.parametres.jours[0] > 1.1 && r.retenu.parametres.jours[5] < 0.95, 'le lundi au-dessus, le samedi en dessous');
  const inverse = C.calerLigne(jours(61, (s, k, d, h) => 0.8 * s * (d < '2026-10-01' ? effet[k] : 2 - effet[k]) + bruit(h, 0.1)));
  const c = inverse.candidats.find(x => x.modele === 'x-a-jour');
  assert.equal(c.accepte, false, JSON.stringify(c.regles));
  assert.notEqual(inverse.retenu.modele, 'x-a-jour');
});

test('un vrai a = 3 : refusé, hors bornes', () => {
  const r = C.calerLigne(jours(45, (s, k, d, h) => 3 * s + bruit(h, 0.1)));
  const c = r.candidats.find(x => x.modele === 'x-a');
  assert.equal(c.regles.bornes.ok, false);
  assert.match(c.regles.bornes.raison, /^refusé : hors bornes \(a = 3/);
  assert.ok(!r.candidats.some(x => x.accepte));
  assert.ok(!r.candidats.some(x => x.modele === 'b-x-a'), '« b + a × » hors bornes se confond avec « × a »');
  assert.deepEqual(r.confondus.map(x => [x.modele, x.avec]), [['b-x-a', 'x-a']]);
  assert.match(r.confondus[0].raison, /^se confond avec « × a » : moindres carrés hors bornes \(a = 3/);
  assert.ok(['moteur', 'constante'].includes(r.retenu.modele));
});

test('un seul mois : des semaines seulement, et la ligne le dit ; moins de 20 jours : pas de calage', () => {
  const r = C.calerLigne(jours(28, (s, k, d, h) => 0.8 * s + bruit(h, 0.15), { debut: '2026-11-01' }));
  assert.deepEqual([r.unSeulMois, r.validation], [true, 'semaines']);
  assert.ok(r.candidats.every(c => c.erreurs.parMois.length === 0));
  // Deux mois, mais un seul de 14 jours (11 jours en septembre, 19 en octobre) : pas de validation par mois non plus.
  const court1 = C.calerLigne(jours(30, (s, k, d, h) => 0.8 * s + bruit(h, 0.15), { debut: '2026-09-20' }));
  assert.deepEqual([court1.unSeulMois, court1.validation], [true, 'semaines']);
  assert.equal(C.calerLigne(jours(61, (s, k, d, h) => 0.8 * s + bruit(h, 0.15))).unSeulMois, false);
  const court = C.calerLigne(jours(19, s => s));
  assert.deepEqual([court.cale, court.raison], [false, 'moins de 20 jours utilisables (19)']);
  // Hors simulation : la constante, sans candidat.
  const hors = C.calerLigne(jours(30, (s, k, d, h) => 4 + bruit(h, 0.2)), { hors: true });
  assert.deepEqual([hors.retenu.modele, hors.candidats.length], ['constante', 0]);
});

test('Wilcoxon apparié sur un petit exemple calculé à la main', () => {
  // d = x − y : 0,952 ; −0,147 ; 1,022 ; 0,43 ; 0,62 ; 0,59 ; 0,49 ; −0,08 ; 0,01 — rangs des négatifs 3 et 2 : W+ = 45 − 5 = 40.
  const x = [1.83, 0.50, 1.62, 2.48, 1.68, 1.88, 1.55, 3.06, 1.30], y = [0.878, 0.647, 0.598, 2.05, 1.06, 1.29, 1.06, 3.14, 1.29];
  const w = C.wilcoxon(x, y);
  assert.deepEqual([w.n, w.wPlus], [9, 40]);
  // Moyenne 22,5, variance 9 × 10 × 19 ÷ 24 = 71,25 : z = 17,5 ÷ √71,25.
  assert.ok(Math.abs(w.z - 17.5 / Math.sqrt(71.25)) < 1e-12);
  assert.ok(Math.abs(w.p - 0.03815) < 2e-4, 'p ' + w.p);
  // Des ex aequo : quatre écarts de 2, rang moyen 2,5 ; variance 7,5 − (4³ − 4) ÷ 48 = 6,25 ; z = 5 ÷ 2,5 = 2.
  const t = C.wilcoxon([3, 4, 5, 6, 7], [1, 2, 3, 4, 7]);
  assert.deepEqual([t.n, t.wPlus, t.z], [4, 10, 2]);
  assert.ok(Math.abs(t.p - 0.0455) < 2e-4);
  // La loi normale : Φ(0) = 0,5 ; Φ(1,96) ≈ 0,975 ; Φ(−1) ≈ 0,1587.
  assert.ok(Math.abs(C.phi(0) - 0.5) < 1e-9);
  assert.ok(Math.abs(C.phi(1.96) - 0.975) < 1e-4);
  assert.ok(Math.abs(C.phi(-1) - 0.158655) < 1e-4);
});

test('déterministe : deux passages, le même rapport ; 60 jours et 20 lignes en moins de 2 secondes', () => {
  const comparaison = { lignes: Array.from({ length: 20 }, (_, i) => ({ nom: 'L' + i, couvre: 'fictif',
    jours: jours(60, (s, k, d, h) => (0.6 + i * 0.05) * s + bruit(h, 0.2), { graine: i + 1 }) })) };
  comparaison.unite = { jours: comparaison.lignes[0].jours.map(j => ({ date: j.date })) };
  const t0 = Date.now(), un = C.caler(comparaison), duree = Date.now() - t0;
  assert.deepEqual(C.caler(comparaison), un);
  assert.ok(duree < 2000, duree + ' ms');
  assert.equal(un.lignes.length, 20);
  // Toute l'unité : le total de chaque jour, avant (le moteur) et après (les modèles retenus), hors échantillon.
  assert.ok(un.unite.apres.mae < un.unite.avant.mae, JSON.stringify(un.unite));
  assert.equal(un.unite.avant.jours, 60);
  // Avant : le total simulé moins le total réel, chaque jour, comme la comparaison.
  const ecarts = comparaison.unite.jours.map(({ date }) => comparaison.lignes.reduce((t, l) => {
    const j = l.jours.find(x => x.date === date); return t + j.simule - j.reel;
  }, 0));
  assert.ok(Math.abs(un.unite.avant.mae - ecarts.reduce((t, e) => t + Math.abs(e), 0) / 60) < 1e-9);
  assert.ok(Math.abs(un.unite.avant.biais - ecarts.reduce((t, e) => t + e, 0) / 60) < 1e-9);
});

test('le prévu calé et sa bande P10–P90 : la prédiction ± 1,2816 σ', () => {
  const p = C.prevuCale({ modele: 'x-a', parametres: { a: 0.8 }, sigma: 1 }, { date: '2026-11-02', simule: 10 });
  assert.deepEqual([p.prevu, p.p10, p.p90], [8, 8 - 1.2816, 8 + 1.2816]);
  assert.equal(C.prevuCale({ modele: 'constante', parametres: { c: 15 }, sigma: 0 }, { date: '2026-11-02', simule: 3 }).prevu, 15);
  assert.equal(C.semaineIso('2026-01-01'), '2026-W01');
  assert.equal(C.semaineIso('2027-01-01'), '2026-W53');
  assert.equal(C.semaineIso('2026-11-02'), '2026-W45');
});

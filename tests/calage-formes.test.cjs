/* Banc d'essai, évolution 17 (a) — le catalogue de formes du calage
 * (moteur/calage-formes.js, moteur/calage-periode.js ; docs/BANC_ESSAI.md § 10).
 * Aux trois candidats de l'évolution 11 c s'ajoutent « puissance »,
 * « logarithme », « plancher » et « plafond », ajustés par moindres carrés
 * (une grille pour p et pour le seuil), chacun dans ses bornes : un paramètre
 * en butée écarte le candidat. Les cinq règles valent pour tous ; le seuil du
 * test de Wilcoxon se divise par le nombre de candidats essayés ; une forme
 * plus riche n'est retenue que si elle bat le plus simple des acceptés de plus
 * de 0,1 ETP. Le rapport écrit la formule retenue en clair. Des jours
 * fabriqués avec une graine, dont on connaît la vérité ; aucune donnée réelle. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../moteur/calage-periode.js');
const F = require('../moteur/calage-formes.js');

/** Un hasard reproductible pour fabriquer les jours (le même à chaque passage). */
function hasard(graine) {
  let a = graine >>> 0;
  return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
}
const bruit = (h, s) => (h() + h() + h() - 1.5) * s * 2;      // à peu près normal, centré
const moyenne = l => l.reduce((a, b) => a + b, 0) / l.length;
/** Trois mois (91 jours du 1er septembre au 30 novembre 2026) : le travail au barème va de 2 à 40 ETP, le réel = vrai(simulé, hasard). */
function jours(vrai, { graine = 7, n = 91, simule } = {}) {
  const h = hasard(graine), t0 = Date.parse('2026-09-01T12:00:00Z');
  return Array.from({ length: n }, (_, i) => {
    const s = simule ? simule(h, i) : 2 + 38 * h();
    return { date: new Date(t0 + i * 86400000).toISOString().slice(0, 10), simule: s, reel: vrai(s, h) };
  });
}
const pres = (x, vrai, part = 0.1) => Math.abs(x / vrai - 1) <= part;
const candidat = (r, m) => r.candidats.find(c => c.modele === m);
const GRAINES = [7, 8, 9];

test('le catalogue : sept candidats du plus simple au plus riche, la grille de p, les bornes en mots', () => {
  assert.deepEqual(C.CANDIDATS, ['x-a', 'b-x-a', 'x-a-jour', 'puissance', 'logarithme', 'plancher', 'plafond']);
  assert.deepEqual(F.ORDRE.map(n => C.NOMS[n]), ['puissance', 'logarithme', 'plancher', 'plafond']);
  assert.deepEqual(F.GRILLE_P, [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1]);
  assert.deepEqual([F.A_MIN, F.A_MAX, F.SEUILS, C.SEUIL_P, C.ECART_SIMPLE], [0.5, 2, 41, 0.05, 0.1]);
  for (const n of F.ORDRE) {
    const f = F.FORMES[n];
    assert.deepEqual([f.id, f.variables], [n, ['simule']], 'une seule variable aujourd’hui : le simulé');
    assert.ok(f.bornes.length > 40, n + ' : ses bornes sont écrites');
  }
  assert.match(F.FORMES.puissance.bornes, /^p sur la grille 0,20 ; 0,25 ; … ; 1, hors de ses deux bouts/);
  assert.match(F.FORMES.plancher.bornes, /^a entre 0,5 et 2 ; c = a × s, le seuil s sur une grille de 41 valeurs/);
});

test('des heures en puissance, 3,2 × x^0,6, plus un bruit : « puissance », a et p à 10 % près, la formule en clair', () => {
  for (const graine of GRAINES) {
    const r = C.calerLigne(jours((s, h) => 3.2 * Math.pow(s, 0.6) + bruit(h, 0.3), { graine }));
    assert.equal(r.retenu.modele, 'puissance', 'graine ' + graine);
    assert.deepEqual(Object.keys(r.retenu.parametres), ['a', 'p']);
    assert.ok(pres(r.retenu.parametres.a, 3.2) && pres(r.retenu.parametres.p, 0.6), JSON.stringify(r.retenu.parametres));
    assert.match(r.retenu.formule, /^heures réelles ≈ 3,(1\d?|2\d?) × \(travail au barème\) puissance 0,6$/);
    for (const regle of Object.values(candidat(r, 'puissance').regles)) assert.equal(regle.ok, true, regle.raison);
    assert.equal(candidat(r, 'puissance').choix, 'retenu');
  }
});

test('le rapport d’une ligne : tous les candidats, leur erreur par semaine et par mois, leur formule, le seuil corrigé', () => {
  const r = C.calerLigne(jours((s, h) => 3.2 * Math.pow(s, 0.6) + bruit(h, 0.3)));
  assert.deepEqual([r.essayes, r.seuil, r.validation], [7, 0.05 / 7, 'semaines et mois']);
  assert.deepEqual(r.candidats.map(c => c.modele), C.CANDIDATS, 'les sept, dans l’ordre');
  for (const c of r.candidats) {
    assert.ok(Number.isFinite(c.erreurs.semaines) && Number.isFinite(c.erreurs.mois), c.modele);
    assert.ok(c.erreurs.parSemaine.length >= 13 && c.erreurs.parMois.length === 3, c.modele + ' : chaque semaine, chaque mois');
    assert.match(c.formule, /^heures réelles ≈ /, c.modele);
    assert.match(c.regles.wilcoxon.raison, / ; seuil 0,05 ÷ 7 = 0,0071\)$/, c.modele);
  }
  // Les paramètres sur tous les jours, et leur plage sur les découpages.
  const p = candidat(r, 'puissance').parametres;
  assert.deepEqual(Object.keys(p), ['a', 'p']);
  assert.ok(p.a.min <= p.a.tous && p.a.tous <= p.a.max && p.p.min <= p.p.tous && p.p.tous <= p.p.max);
  // « b + a × » suit de loin (une droite sous une courbe) : accepté, mais « puissance » est plus juste de plus de 0,1 ETP.
  const droite = candidat(r, 'b-x-a');
  assert.equal(droite.accepte, true);
  assert.equal(droite.choix, 'accepté, pas retenu : « puissance » le bat de plus de 0,1 ETP');
  assert.ok(droite.erreurs.semaines - candidat(r, 'puissance').erreurs.semaines > 0.1);
  // Les références aussi disent leur formule.
  assert.equal(r.references.moteur.formule, 'heures réelles ≈ le travail au barème');
  assert.match(r.references.constante.formule, /^heures réelles ≈ \d+(,\d+)?, quel que soit le travail au barème$/);
});

test('des heures en logarithme, 8 + 4 × ln(1 + x), plus un bruit : « logarithme », a et b à 10 % près', () => {
  for (const graine of GRAINES) {
    const r = C.calerLigne(jours((s, h) => 8 + 4 * Math.log(1 + s) + bruit(h, 0.3), { graine }));
    assert.equal(r.retenu.modele, 'logarithme', 'graine ' + graine);
    assert.ok(pres(r.retenu.parametres.a, 4) && pres(r.retenu.parametres.b, 8), JSON.stringify(r.retenu.parametres));
    assert.match(r.retenu.formule, /^heures réelles ≈ [78],\d+ \+ [34],\d+ × ln\(1 \+ travail au barème\)$/);
    // La puissance s'en approche, mais son exposant bute sur 0,2 : écartée.
    assert.match(candidat(r, 'puissance').regles.bornes.raison, /^refusé : p en butée \(0,2\)$/);
  }
});

test('des heures avec un plancher, le plus grand de 12 et 0,8 × x, plus un bruit : « plancher », a et c à 10 % près', () => {
  for (const graine of GRAINES) {
    const r = C.calerLigne(jours((s, h) => Math.max(12, 0.8 * s) + bruit(h, 0.3), { graine }));
    assert.equal(r.retenu.modele, 'plancher', 'graine ' + graine);
    assert.deepEqual(Object.keys(r.retenu.parametres), ['a', 'c']);
    assert.ok(pres(r.retenu.parametres.a, 0.8) && pres(r.retenu.parametres.c, 12), JSON.stringify(r.retenu.parametres));
    assert.match(r.retenu.formule, /^heures réelles ≈ le plus grand de 1[12](,\d+)? et 0,(79|8|81) × \(travail au barème\)$/);
    assert.match(candidat(r, 'plancher').regles.bornes.raison, /^accepté : a et c dans leurs bornes \(le plancher joue sous 1[45](,\d+)? ETP au barème\)$/);
  }
});

test('des heures avec un plafond, le plus petit de 18 et 0,9 × x, plus un bruit : « plafond », a et c à 10 % près', () => {
  for (const graine of GRAINES) {
    const r = C.calerLigne(jours((s, h) => Math.min(18, 0.9 * s) + bruit(h, 0.3), { graine }));
    assert.equal(r.retenu.modele, 'plafond', 'graine ' + graine);
    assert.ok(pres(r.retenu.parametres.a, 0.9) && pres(r.retenu.parametres.c, 18), JSON.stringify(r.retenu.parametres));
    assert.match(r.retenu.formule, /^heures réelles ≈ le plus petit de 1[78](,\d+)? et 0,(89|9|91) × \(travail au barème\)$/);
    assert.match(candidat(r, 'plafond').regles.bornes.raison, /^accepté : a et c dans leurs bornes \(le plafond joue au-dessus de (19|20)(,\d+)? ETP au barème\)$/);
  }
});

test('des heures constantes plus un bruit : « constante », aucun candidat accepté ; les formes qui l’imitent sont en butée', () => {
  for (const graine of GRAINES) {
    const r = C.calerLigne(jours((s, h) => 15 + bruit(h, 0.5), { graine }));
    assert.equal(r.retenu.modele, 'constante', 'graine ' + graine);
    assert.ok(pres(r.retenu.parametres.c, 15, 0.02));
    assert.ok(!r.candidats.some(c => c.accepte), JSON.stringify(r.candidats.filter(c => c.accepte).map(c => c.modele)));
    assert.match(candidat(r, 'puissance').regles.bornes.raison, /^refusé : p en butée \(0,2\)$/);
    // Le plancher et le plafond jouent tous les jours (en butée), ou presque : a sort alors de ses bornes.
    for (const n of ['plancher', 'plafond'])
      assert.match(candidat(r, n).regles.bornes.raison, new RegExp('^refusé : (c en butée \\(le ' + n + ' joue tous les jours : c’est « constante »\\)|hors bornes \\(a = \\d+(,\\d+)?\\))$'), n);
  }
  // Sans bruit du tout, la butée est exacte.
  const exact = C.calerLigne(jours(() => 15));
  assert.equal(candidat(exact, 'plancher').regles.bornes.raison, 'refusé : c en butée (le plancher joue tous les jours : c’est « constante »)');
  assert.equal(candidat(exact, 'plafond').regles.bornes.raison, 'refusé : c en butée (le plafond joue tous les jours : c’est « constante »)');
});

test('des heures qui suivent le barème en ligne droite : « × a » ; p bute sur 1, le plancher et le plafond ne jouent aucun jour', () => {
  // Sans bruit : la puissance trouve p = 1, les seuils le bout de leur grille — ce sont « × a ».
  const exact = C.calerLigne(jours(s => 0.8 * s));
  assert.equal(exact.retenu.modele, 'x-a');
  assert.equal(candidat(exact, 'puissance').regles.bornes.raison, 'refusé : p en butée (1 : c’est « × a »)');
  assert.equal(candidat(exact, 'plancher').regles.bornes.raison, 'refusé : c en butée (le plancher ne joue aucun jour : c’est « × a »)');
  assert.equal(candidat(exact, 'plafond').regles.bornes.raison, 'refusé : c en butée (le plafond ne joue aucun jour : c’est « × a »)');
  // Avec un bruit : une forme plus riche peut être acceptée, à la même erreur ; elle ne bat pas « × a » de plus de 0,1 ETP.
  for (const graine of [7, 8, 9, 10, 11]) {
    const r = C.calerLigne(jours((s, h) => 0.8 * s + bruit(h, 0.3), { graine }));
    assert.equal(r.retenu.modele, 'x-a', 'graine ' + graine);
    assert.equal(r.retenu.formule, 'heures réelles ≈ 0,8 × (travail au barème)');
    for (const c of r.candidats.filter(x => x.accepte && x.modele !== 'x-a'))
      assert.equal(c.choix, 'accepté, pas retenu : ne bat pas « × a », plus simple, de plus de 0,1 ETP', c.modele);
  }
});

test('les bornes : le logarithme en butée (b négatif), un niveau hors de 0,5 à 2', () => {
  // Sous une puissance, la droite en logarithme coupe l'axe sous zéro : b est mis à 0, le candidat est écarté.
  const r = C.calerLigne(jours((s, h) => 3.2 * Math.pow(s, 0.6) + bruit(h, 0.3)));
  assert.match(candidat(r, 'logarithme').regles.bornes.raison, /^refusé : b en butée \(moindres carrés libres : a = \d+(,\d+)? ; b = -\d+(,\d+)?\)$/);
  assert.equal(candidat(r, 'logarithme').accepte, false);
  // Trois fois plus d'heures que le barème n'en compte : la forme est la bonne, pas son niveau (comme a = 3 pour « × a »).
  const haut = C.calerLigne(jours((s, h) => 3 * 3.2 * Math.pow(s, 0.6) + bruit(h, 0.3)));
  assert.match(candidat(haut, 'puissance').regles.bornes.raison, /^refusé : hors bornes \(niveau = [23](,\d+)?\)$/);
  assert.equal(candidat(haut, 'puissance').accepte, false);
  assert.notEqual(haut.retenu.modele, 'puissance');
  assert.match(candidat(r, 'puissance').regles.bornes.raison, /^accepté : p = 0,6 et le niveau \((0,9\d?|1(,0\d?)?)\) dans leurs bornes$/);
});

test('un placebo ne retient rien : un bruit sans lien avec le travail au barème', () => {
  for (const graine of GRAINES) {
    const r = C.calerLigne(jours((s, h) => 16 + bruit(h, 1), { graine, simule: h => 20 + bruit(h, 0.3) }));
    assert.ok(['moteur', 'constante'].includes(r.retenu.modele), 'graine ' + graine + ' : ' + r.retenu.modele);
    assert.ok(!r.candidats.some(c => c.accepte));
  }
});

/** Une forme qui lit une autre variable du jour, `z` + k : réel ≈ b + a × z (moindres carrés). */
const colonne = k => ({ id: 'z' + k, nom: 'colonne ' + k, variables: ['z' + k],
  apprendre(l) {
    const z = l.map(j => j['z' + k]), y = l.map(j => j.reel), mz = moyenne(z), my = moyenne(y), v = z.reduce((n, x) => n + (x - mz) ** 2, 0);
    if (!(v > 1e-12)) return null;
    const a = z.reduce((n, x, i) => n + (x - mz) * (y[i] - my), 0) / v;
    return { a, b: my - a * mz };
  },
  predire: (q, j) => q.b + q.a * j['z' + k] });
const VINGT = Array.from({ length: 20 }, (_, k) => colonne(k + 1));
/** Du bruit pur : le réel ne suit rien ; vingt colonnes tirées au hasard, sans lien avec lui. */
function bruitPur(graine) {
  const h = hasard(graine);
  return jours(() => 16 + bruit(h, 1), { graine: graine + 1000, simule: () => 12 + 8 * h() }).map(j => {
    for (let k = 1; k <= 20; k++) j['z' + k] = 10 * h();
    return j;
  });
}

test('vingt candidats sur du bruit pur : aucun n’est retenu ; essayé seul, le hasard en ferait gagner un', () => {
  const gagnantsSeuls = [];
  for (let graine = 1; graine <= 40; graine++) {
    const l = bruitPur(graine), r = C.calerLigne(l, { formes: VINGT });
    assert.deepEqual([r.essayes, r.seuil], [20, 0.05 / 20]);
    assert.ok(!r.candidats.some(c => c.accepte), 'graine ' + graine + ' : ' + r.candidats.filter(c => c.accepte).map(c => c.modele));
    assert.ok(['moteur', 'constante'].includes(r.retenu.modele));
    // Celui que seul le test de Wilcoxon arrête, essayé seul (seuil 0,05) : le hasard le fait parfois gagner.
    for (const c of r.candidats.filter(x => Object.entries(x.regles).every(([k, regle]) => k === 'wilcoxon' || regle.ok))) {
      const seul = C.calerLigne(l, { formes: [VINGT[+c.modele.slice(1) - 1]] });
      assert.deepEqual([seul.essayes, seul.seuil], [1, 0.05]);
      if (seul.candidats[0].accepte) gagnantsSeuls.push({ graine, modele: c.modele, seul: seul.candidats[0].regles.wilcoxon.raison, parmiVingt: c.regles.wilcoxon.raison });
    }
  }
  assert.ok(gagnantsSeuls.length >= 1, 'sur 40 tirages × 20 colonnes, le hasard en fait gagner au moins une au seuil de 0,05');
  for (const g of gagnantsSeuls) {
    assert.match(g.seul, /^accepté : Wilcoxon contre « (moteur|constante) », p = 0,0\d+ \(par mois\)$/, JSON.stringify(g));
    assert.match(g.parmiVingt, /^refusé : Wilcoxon contre « (moteur|constante) », p = 0,0\d+ \(par mois ; seuil 0,05 ÷ 20 = 0,0025\)$/, JSON.stringify(g));
  }
});

test('une seconde variable s’ajoute par une fiche : elle est lue dans le jour, et le placebo la mélange avec le simulé', () => {
  // Le réel suit la colonne 3 du jour, pas le travail au barème.
  const h = hasard(21);
  const l = jours(() => 0, { simule: () => 12 + 8 * h() }).map(j => ({ ...j, z3: 10 * h() })).map(j => ({ ...j, reel: 5 + 1.2 * j.z3 + bruit(h, 0.3) }));
  const r = C.calerLigne(l, { formes: ['x-a', colonne(3)] });
  assert.deepEqual(r.candidats.map(c => [c.modele, c.nom]), [['x-a', '× a'], ['z3', 'colonne 3']]);
  assert.equal(r.retenu.modele, 'z3');
  assert.ok(pres(r.retenu.parametres.a, 1.2) && pres(r.retenu.parametres.b, 5), JSON.stringify(r.retenu.parametres));
  const c = candidat(r, 'z3');
  assert.equal(c.regles.placebo.ok, true, c.regles.placebo.raison);
  assert.equal(c.regles.bornes.raison, 'accepté : pas de borne');
  assert.equal(r.essayes, 2);
  // Sans la colonne dans les jours, la fiche ne s'apprend pas : elle n'est pas retenue, rien ne casse ; essayée, elle compte pour le seuil.
  const sans = C.calerLigne(l.map(({ z3, ...j }) => j), { formes: ['x-a', colonne(3)] });
  assert.notEqual(sans.retenu.modele, 'z3');
  assert.deepEqual([sans.candidats.map(c => c.modele), sans.essayes, sans.seuil], [['x-a'], 2, 0.025]);
});

test('le choix : une forme plus riche n’est retenue que si elle bat le plus simple des acceptés de plus de 0,1 ETP', () => {
  const cas = erreurs => erreurs.map((e, i) => ({ modele: 'f' + i, nom: 'ABCD'[i], accepte: e !== null, semaines: { erreur: e === null ? 9 : e } }));
  const refs = { moteur: { modele: 'moteur', semaines: { erreur: 2 } }, constante: { modele: 'constante', semaines: { erreur: 3 } } };
  const choix = erreurs => { const l = cas(erreurs), r = C.choisir(l, refs, false); return [r.modele, ...l.map(c => c.choix)]; };
  // B ne bat A que de 0,07 : hors lice ; C le bat de 0,14 : retenu.
  assert.deepEqual(choix([1, 0.93, 0.86]), ['f2', 'accepté, pas retenu : « C » le bat de plus de 0,1 ETP',
    'accepté, pas retenu : ne bat pas « A », plus simple, de plus de 0,1 ETP', 'retenu']);
  // Personne ne bat A de plus de 0,1 : A.
  assert.deepEqual(choix([1, 0.95, 0.93]).slice(0, 2), ['f0', 'retenu']);
  // B et C battent A ; C est le plus juste, B est à 0,1 près et plus simple : B.
  assert.deepEqual(choix([1, 0.85, 0.78]), ['f1', 'accepté, pas retenu : « B » le bat de plus de 0,1 ETP', 'retenu',
    'accepté, pas retenu : « B », plus simple, est à 0,1 ETP près']);
  // C est plus juste que B de plus de 0,1 : C.
  assert.deepEqual(choix([1, 0.89, 0.7]), ['f2', 'accepté, pas retenu : « C » le bat de plus de 0,1 ETP',
    'accepté, pas retenu : « C » est plus juste de plus de 0,1 ETP', 'retenu']);
  // D est le plus juste, C le vaut à 0,1 près et est plus simple : C. B, battu par C de plus de 0,1, le dit de C (le retenu), pas de D.
  assert.deepEqual(choix([1, 0.85, 0.74, 0.7]), ['f2', 'accepté, pas retenu : « C » le bat de plus de 0,1 ETP',
    'accepté, pas retenu : « C » est plus juste de plus de 0,1 ETP', 'retenu', 'accepté, pas retenu : « C », plus simple, est à 0,1 ETP près']);
  // B n'est pas battu par C de plus de 0,1, mais par D ; C, que D ne bat pas de plus de 0,1, est retenu.
  assert.deepEqual(choix([1, 0.82, 0.74, 0.7])[2], 'accepté, pas retenu : « D » est plus juste de plus de 0,1 ETP, et « C » le vaut à 0,1 ETP près');
  // Les trois candidats de l'évolution 11 c, 1,00 ; 0,95 ; 0,88 : avant, « b + a × » (le plus simple à 0,1 ETP du plus juste) ;
  // maintenant « × a × jour », le seul à battre « × a » de plus de 0,1 ETP. La règle ajoutée change ce cas, c'est voulu.
  assert.equal(choix([1, 0.95, 0.88])[0], 'f2');
  // Le plus simple des acceptés sert de base, pas le premier du catalogue : A refusé, B de base.
  assert.deepEqual(choix([null, 0.9, 0.85]), ['f1', undefined, 'retenu', 'accepté, pas retenu : ne bat pas « B », plus simple, de plus de 0,1 ETP']);
  // Aucun accepté : la meilleure référence ; hors simulation, la constante.
  assert.equal(C.choisir(cas([null, null]), refs, false).modele, 'moteur');
  assert.equal(C.choisir([], refs, true).modele, 'constante');
});

test('la formule en clair de chaque modèle, avec ses paramètres', () => {
  const f = (modele, parametres) => C.formule({ modele, parametres });
  assert.equal(f('puissance', { a: 3.2, p: 0.6 }), 'heures réelles ≈ 3,2 × (travail au barème) puissance 0,6');
  assert.equal(f('logarithme', { a: 4.04, b: 7.9 }), 'heures réelles ≈ 7,9 + 4,04 × ln(1 + travail au barème)');
  assert.equal(f('plancher', { a: 0.8, c: 12.17 }), 'heures réelles ≈ le plus grand de 12,17 et 0,8 × (travail au barème)');
  assert.equal(f('plafond', { a: 0.9, c: 18 }), 'heures réelles ≈ le plus petit de 18 et 0,9 × (travail au barème)');
  assert.equal(f('x-a', { a: 0.812 }), 'heures réelles ≈ 0,81 × (travail au barème)');
  assert.equal(f('b-x-a', { a: 0.9, b: 1.5 }), 'heures réelles ≈ 1,5 + 0,9 × (travail au barème)');
  assert.equal(f('x-a-jour', { a: 0.8, jours: [1.1, 1, 1, 1, 1, 0.9, 1] }),
    'heures réelles ≈ 0,8 × (travail au barème) × le facteur du jour (lun. 1,1 ; mar. 1 ; mer. 1 ; jeu. 1 ; ven. 1 ; sam. 0,9 ; dim. 1)');
  assert.equal(f('constante', { c: 15.04 }), 'heures réelles ≈ 15,04, quel que soit le travail au barème');
  assert.equal(f('moteur', {}), 'heures réelles ≈ le travail au barème');
  assert.equal(f('inconnu', {}), '');
});

test('le prévu calé des nouvelles formes, calculé à la main', () => {
  const prevu = (modele, parametres, simule) => C.prevuCale({ modele, parametres, sigma: 0 }, { date: '2026-11-02', simule }).prevu;
  assert.equal(prevu('puissance', { a: 3, p: 0.5 }, 16), 12);                        // 3 × √16
  assert.ok(Math.abs(prevu('logarithme', { a: 5, b: 2 }, Math.E - 1) - 7) < 1e-12);  // 2 + 5 × ln(e)
  assert.deepEqual([prevu('plancher', { a: 0.8, c: 10 }, 5), prevu('plancher', { a: 0.8, c: 10 }, 20)], [10, 16]);
  assert.deepEqual([prevu('plafond', { a: 0.9, c: 16 }, 30), prevu('plafond', { a: 0.9, c: 16 }, 10)], [16, 9]);
  // La bande : la prédiction ± 1,2816 σ, comme pour les autres.
  const p = C.prevuCale({ modele: 'puissance', parametres: { a: 3, p: 0.5 }, sigma: 1 }, { date: '2026-11-02', simule: 16 });
  assert.deepEqual([p.prevu, p.p10, p.p90], [12, 12 - 1.2816, 12 + 1.2816]);
});

/** Une politique d'effectif gardée avant l'évolution 17 : une ligne par modèle d'alors, σ du total mesuré. */
const ANCIENNE = { date: '2026-11-10', periode: { debut: '2026-08-01', fin: '2026-10-31' }, signature: '0a1b2c3d', sigmaUnite: 1.5, lignes: [
  { nom: 'Cuisine', modele: 'x-a', parametres: { a: 0.8 }, sigma: 0.5, services: ['cuisine'] },
  { nom: 'Montage', modele: 'b-x-a', parametres: { a: 0.9, b: 1.5 }, sigma: 0.4, services: ['montage'] },
  { nom: 'Plonge', modele: 'x-a-jour', parametres: { a: 0.8, jours: [1.1, 1, 1, 1, 1, 0.9, 1] }, sigma: 0.3, services: ['plonge'], applique: true },
  { nom: 'Bureau', modele: 'constante', parametres: { c: 4.2 }, sigma: 0.2 },
  { nom: 'Quais', modele: 'moteur', parametres: {}, sigma: 0.6, services: ['quais'] }] };
const CORRESPONDANCE = { lignes: ANCIENNE.lignes.map(l => ({ nom: l.nom, roles: [l.nom], ...(l.services ? { services: l.services } : { hors: true }) })) };

test('une politique d’effectif gardée avant l’évolution se relit telle quelle et donne le même prévu', () => {
  const relue = C.validerPolitique(JSON.parse(JSON.stringify(ANCIENNE)));
  assert.deepEqual(relue, ANCIENNE, 'champ par champ');
  // Un lundi (2 novembre 2026), 10 ETP au barème sur chaque ligne : le prévu d'avant, calculé à la main.
  const prevu = C.prevuDesJours(relue, CORRESPONDANCE, [{ date: '2026-11-02' }], () => 10);
  assert.deepEqual(prevu.lignes.map(l => [l.nom, l.modele, l.jours[0].prevu]),
    [['Cuisine', 'x-a', 8], ['Montage', 'b-x-a', 10.5], ['Plonge', 'x-a-jour', 0.8 * 1.1 * 10], ['Bureau', 'constante', 4.2], ['Quais', 'moteur', 10]]);
  const cuisine = prevu.lignes[0].jours[0];
  assert.deepEqual([cuisine.p10, cuisine.p90], [8 - 1.2816 * 0.5, 8 + 1.2816 * 0.5]);
  const total = 8 + 10.5 + 0.8 * 1.1 * 10 + 4.2 + 10;
  assert.deepEqual(prevu.unite, [{ date: '2026-11-02', simule: 50, prevu: total, p10: total - 1.2816 * 1.5, p90: total + 1.2816 * 1.5 }]);
  assert.deepEqual([prevu.sigmaUnite, prevu.sigmaUniteSource], [1.5, 'mesuré']);
});

test('une politique garde les nouvelles formes, relues dans leurs bornes ; hors bornes, elle est refusée entière', () => {
  const nouvelle = { date: null, periode: null, signature: null, lignes: [
    { nom: 'Lavage', modele: 'puissance', parametres: { a: 3.2, p: 0.6 }, sigma: 0.5 },
    { nom: 'Montage', modele: 'logarithme', parametres: { a: 4, b: 8 }, sigma: 0.4 },
    { nom: 'Plonge', modele: 'plancher', parametres: { a: 0.8, c: 12 }, sigma: 0.3 },
    { nom: 'Quais', modele: 'plafond', parametres: { a: 0.9, c: 18 }, sigma: 0.6 }] };
  assert.deepEqual(C.validerPolitique(JSON.parse(JSON.stringify(nouvelle))), nouvelle);
  // Les paramètres en trop ne sont pas gardés.
  const propre = C.validerPolitique({ lignes: [{ nom: 'Lavage', modele: 'puissance', parametres: { a: 3.2, p: 0.6, b: 7, jours: [1, 1, 1, 1, 1, 1, 1] }, sigma: 0.5 }] });
  assert.deepEqual(propre.lignes[0].parametres, { a: 3.2, p: 0.6 });
  const refuse = (modele, parametres, motif) => assert.throws(() => C.validerPolitique({ lignes: [{ nom: 'L', modele, parametres, sigma: 0 }] }), motif, modele + ' ' + JSON.stringify(parametres));
  refuse('puissance', { a: 3.2, p: 1.5 }, /politique d’effectif, ligne 1 : p hors de ses bornes \(0,2 à 1\)\./);
  refuse('puissance', { a: 3.2 }, /ligne 1 : p hors de ses bornes/);
  refuse('puissance', { a: 0, p: 0.6 }, /ligne 1 : a hors de ses bornes \(plus de 0 à 1000000\)\./);
  refuse('logarithme', { a: 4, b: -1 }, /ligne 1 : b hors de ses bornes \(0 à 1000000\)\./);
  refuse('plancher', { a: 3, c: 12 }, /ligne 1 : a hors de ses bornes \(0,5 à 2\)\./);
  refuse('plafond', { a: 0.9, c: 'x' }, /ligne 1 : c hors de ses bornes/);
  refuse('cubique', { a: 1 }, /modèle inconnu « cubique »/);
  // La politique d'un calage garde le modèle retenu et ses paramètres, sans aucune heure réelle.
  const comparaison = { lignes: [{ nom: 'Lavage', couvre: 'fictif', jours: jours((s, h) => 3.2 * Math.pow(s, 0.6) + bruit(h, 0.3)) }] };
  comparaison.unite = { jours: comparaison.lignes[0].jours.map(j => ({ date: j.date })) };
  const rapport = C.caler(comparaison), politique = C.politiqueDe(rapport, { date: '2026-12-01' });
  assert.deepEqual(Object.keys(politique.lignes[0]), ['nom', 'modele', 'parametres', 'sigma', 'statut'], 'et son statut (évolution 17 b)');
  assert.deepEqual([politique.lignes[0].modele, Object.keys(politique.lignes[0].parametres)], ['puissance', ['a', 'p']]);
  assert.deepEqual(C.validerPolitique(JSON.parse(JSON.stringify(politique))).lignes, politique.lignes);
  // Le prévu d'un jour : la formule gardée, appliquée au travail au barème du jour.
  const { a, p } = politique.lignes[0].parametres;
  const prevu = C.prevuDesJours(politique, { lignes: [{ nom: 'Lavage', roles: ['Laveur'], services: ['lavage'] }] }, [{ date: '2026-12-07' }], () => 25);
  assert.equal(prevu.lignes[0].jours[0].prevu, a * Math.pow(25, p));
});

test('déterministe : deux passages, le même rapport ; trois mois et 20 lignes en moins de 3 secondes', () => {
  const formes = [(s, h) => 3.2 * Math.pow(s, 0.6) + bruit(h, 0.3), (s, h) => 8 + 4 * Math.log(1 + s) + bruit(h, 0.3),
    (s, h) => Math.max(12, 0.8 * s) + bruit(h, 0.3), (s, h) => Math.min(18, 0.9 * s) + bruit(h, 0.3), (s, h) => 0.8 * s + bruit(h, 0.3)];
  const comparaison = { lignes: Array.from({ length: 20 }, (_, i) => ({ nom: 'L' + i, couvre: 'fictif', jours: jours(formes[i % 5], { graine: i + 1 }) })) };
  comparaison.unite = { jours: comparaison.lignes[0].jours.map(j => ({ date: j.date })) };
  const t0 = Date.now(), un = C.caler(comparaison), duree = Date.now() - t0;
  assert.deepEqual(C.caler(comparaison), un);
  assert.ok(duree < 3000, duree + ' ms');
  assert.deepEqual([...new Set(un.lignes.map(l => l.retenu.modele))].sort(), ['logarithme', 'plafond', 'plancher', 'puissance', 'x-a']);
  assert.ok(un.unite.apres.mae < un.unite.avant.mae);
  // Le rapport se sérialise tel quel : rien d'interne n'y reste.
  assert.ok(!JSON.stringify(un).includes('"_'));
});

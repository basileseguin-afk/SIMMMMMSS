/* Banc d'essai, correction 16 (a) — la bande du total de l'unité
 * (moteur/calage-periode.js ; docs/BANC_ESSAI.md § 10). Le calage mesure σ
 * du total directement, hors échantillon, dans la même validation que le
 * total (rapport.unite.apres.sigma ; rapport.unite.semaines.apres.sigma) ;
 * la politique le garde (`sigmaUnite`) ; le prévu le prend pour la bande du
 * total, sinon √Σσ² comme avant, et dit lequel (`sigmaUniteSource`). Rien
 * d'autre ne change : tests/sigma-unite.attendu.json est le rapport, la
 * politique et le prévu d'avant la correction, pour les mêmes données
 * fictives (tests/sigma-unite-fictif.cjs). */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../moteur/calage-periode.js');
const R = require('../moteur/reel.js');
const F = require('./sigma-unite-fictif.cjs');
const AVANT = require('./sigma-unite.attendu.json');
const { sansEvolution17, politiqueSansEvolution17, prevuSansEvolution17 } = require('./calage-avant-17.cjs');

const json = x => JSON.parse(JSON.stringify(x));
const proche = (x, y, m) => assert.ok(Math.abs(x - y) < 1e-9, (m ? m + ' : ' : '') + x + ' attendu ' + y);
const sigmaLignes = r => Math.sqrt(r.lignes.reduce((n, l) => n + l.retenu.sigma ** 2, 0));

/**
 * Sans les nouveaux champs : σ du total dans le rapport et la politique, la source dans le prévu ; et ce que
 * l'évolution 17 ajoute (des candidats, la formule en clair, le seuil corrigé ; le statut de chaque ligne et le
 * besoin « au plus », dans le rapport, la politique et le prévu : tests/calage-avant-17.cjs).
 */
function sansNouveaux(x) {
  const y = json(x);
  if (y.rapport) { y.rapport = sansEvolution17(y.rapport); delete y.rapport.unite.apres.sigma; if (y.rapport.unite.semaines) delete y.rapport.unite.semaines.apres.sigma; }
  if (y.politique) { y.politique = politiqueSansEvolution17(y.politique); delete y.politique.sigmaUnite; }
  if (y.prevu) { y.prevu = prevuSansEvolution17(y.prevu); delete y.prevu.sigmaUniteSource; }
  return y;
}

function jouer(f, sansSigma) {
  const rapport = C.caler(f()), politique = C.politiqueDe(rapport, { date: '2026-11-10', correspondance: F.CORRESPONDANCE });
  if (sansSigma) delete politique.sigmaUnite;
  return { rapport, politique, prevu: C.prevuDesJours(politique, F.CORRESPONDANCE, F.JOURS, R.simuleDe) };
}

test('trois lignes décalées ensemble chaque mois : σ mesuré du total > √Σσ², la bande le prend', () => {
  const { rapport, politique, prevu } = jouer(F.ensemble);
  const u = rapport.unite;
  assert.equal(u.validation, 'mois');
  assert.ok(Number.isFinite(u.apres.sigma) && Number.isFinite(u.semaines.apres.sigma));
  assert.ok(u.apres.sigma > sigmaLignes(rapport) * 1.3, 'mesuré ' + u.apres.sigma + ', lignes indépendantes ' + sigmaLignes(rapport));
  // σ mesuré ≥ l'erreur moyenne du total (la racine de la moyenne des carrés).
  assert.ok(u.apres.sigma >= u.apres.mae && u.semaines.apres.sigma >= u.semaines.apres.mae);
  assert.equal(politique.sigmaUnite, u.apres.sigma);
  assert.equal(prevu.sigmaUnite, u.apres.sigma);
  assert.equal(prevu.sigmaUniteSource, 'mesuré');
  for (const j of prevu.unite) { proche(j.p90 - j.prevu, C.Z_P10_P90 * u.apres.sigma); proche(j.prevu - j.p10, C.Z_P10_P90 * u.apres.sigma); }
});

test('trois lignes aux écarts opposés : σ mesuré du total < √Σσ²', () => {
  const { rapport, prevu } = jouer(F.opposes);
  assert.ok(rapport.unite.apres.sigma < sigmaLignes(rapport) / 2, 'mesuré ' + rapport.unite.apres.sigma + ', lignes ' + sigmaLignes(rapport));
  assert.equal(prevu.sigmaUnite, rapport.unite.apres.sigma);
  assert.equal(prevu.sigmaUniteSource, 'mesuré');
});

test('le rapport, la politique et le prévu identiques à ceux d’avant, en dehors des nouveaux champs', () => {
  for (const [n, f] of [['ensemble', F.ensemble], ['opposes', F.opposes]]) {
    const x = jouer(f);
    assert.deepEqual(sansNouveaux({ rapport: x.rapport, politique: x.politique }), { rapport: sansEvolution17(AVANT[n].rapport), politique: json(AVANT[n].politique) }, n);
    // Les lignes du prévu, leur σ et leur bande : les mêmes ; le total aussi, hors de sa bande.
    const prevu = prevuSansEvolution17(x.prevu);
    assert.deepEqual(prevu.lignes, AVANT[n].prevu.lignes, n + ' : les lignes du prévu');
    const sansBande = u => u.map(({ p10, p90, ...y }) => y);
    assert.deepEqual(sansBande(prevu.unite), sansBande(AVANT[n].prevu.unite), n + ' : le total du prévu, hors de sa bande');
    assert.deepEqual(Object.keys(x.rapport.unite.apres), ['jours', 'mae', 'biais', 'sigma']);
    assert.ok(!('sigma' in x.rapport.unite.avant), 'avant : pas de σ');
  }
});

test('une politique sans sigmaUnite (enregistrée avant) : le prévu d’avant, champ par champ ; la source le dit', () => {
  for (const n of ['ensemble', 'opposes']) {
    const prevu = C.prevuDesJours(AVANT[n].politique, F.CORRESPONDANCE, F.JOURS, R.simuleDe);
    assert.equal(prevu.sigmaUniteSource, 'lignes indépendantes');
    assert.deepEqual(sansNouveaux({ prevu }).prevu, AVANT[n].prevu, n);
    // Relue par validerPolitique (la sauvegarde), elle reste lisible, sans le champ.
    const relue = C.validerPolitique(json(AVANT[n].politique));
    assert.ok(!('sigmaUnite' in relue));
    assert.deepEqual(json(C.prevuDesJours(relue, F.CORRESPONDANCE, F.JOURS, R.simuleDe)), json(prevu));
  }
});

test('validerPolitique : sigmaUnite fini, positif ou nul, borné comme le σ d’une ligne ; refusé sinon', () => {
  const p = json(jouer(F.ensemble).politique);
  for (const ok of [0, 1.5, 1e6]) assert.equal(C.validerPolitique({ ...p, sigmaUnite: ok }).sigmaUnite, ok);
  for (const vide of [null, undefined]) assert.ok(!('sigmaUnite' in C.validerPolitique({ ...p, sigmaUnite: vide })));
  for (const faux of [-1, -0.001, Infinity, NaN, '2', 1e6 + 1, {}])
    assert.throws(() => C.validerPolitique({ ...p, sigmaUnite: faux }), /σ du total/, String(faux));
  // Avec, la politique relue donne le même prévu que celle du calage.
  assert.deepEqual(json(C.prevuDesJours(C.validerPolitique(p), F.CORRESPONDANCE, F.JOURS, R.simuleDe)),
    json(C.prevuDesJours(jouer(F.ensemble).politique, F.CORRESPONDANCE, F.JOURS, R.simuleDe)));
});

test('σ mesuré : la racine de la moyenne des carrés des erreurs du total « après », recalculée ligne par ligne', () => {
  // Chaque ligne calée seule : ses erreurs hors échantillon, jour par jour (par mois, et par semaine).
  for (const f of [F.ensemble, F.opposes]) {
    const comparaison = f(), r = C.caler(comparaison), seules = comparaison.lignes.map(l => C.calerLigne(l.jours));
    const total = cle => Math.sqrt(F.DATES.reduce((n, d) => n + seules.reduce((t, x) => t + x._retenu[cle === 'semaines' ? 'semaines' : x._cle].erreurs.get(d), 0) ** 2, 0) / F.DATES.length);
    // Le total « après » d'un jour = Σ (réel − erreur de la ligne) : son écart au réel est − Σ erreurs.
    proche(r.unite.apres.sigma, total('validation'), 'validation du total');
    proche(r.unite.semaines.apres.sigma, total('semaines'), 'par semaines');
  }
  // Une seule ligne : le total, c'est elle ; σ du total = σ de sa ligne (la même validation, par mois).
  const une = C.caler(F.comparaison([{ '2026-09': 1, '2026-10': -1 }]));
  proche(une.unite.apres.sigma, une.lignes[0].retenu.sigma, 'une ligne');
});

test('aucune ligne calée (trop peu de jours) : le total « après » est le moteur, σ mesuré est son erreur', () => {
  const c = F.comparaison([{}, {}, {}]), court = { lignes: c.lignes.map(l => ({ ...l, jours: l.jours.slice(0, 15) })), unite: { jours: c.unite.jours.slice(0, 15) } };
  const r = C.caler(court), p = C.politiqueDe(r, { date: '2026-11-10', correspondance: F.CORRESPONDANCE });
  assert.ok(r.lignes.every(l => !l.cale));
  assert.deepEqual(p.lignes, []);
  const ecarts = court.unite.jours.map(({ date }) => court.lignes.reduce((n, l) => { const j = l.jours.find(x => x.date === date); return n + j.simule - j.reel; }, 0));
  proche(p.sigmaUnite, Math.sqrt(ecarts.reduce((n, e) => n + e * e, 0) / ecarts.length));
  const x = C.prevuDesJours(p, F.CORRESPONDANCE, F.JOURS, R.simuleDe);
  assert.ok(x.lignes.every(l => l.nonCalee && l.sigma === 0));
  assert.equal(x.sigmaUniteSource, 'mesuré');
  proche(x.unite[0].p90 - x.unite[0].prevu, C.Z_P10_P90 * p.sigmaUnite, 'la bande du total : l’erreur du moteur, mesurée');
});

test('la ligne sous la bande du total : la page et les classeurs la disent', () => {
  const EC = require('../echanges-calage.js');
  const { rapport, prevu } = jouer(F.ensemble);
  assert.match(C.texteSigmaUnite(prevu), /^Bande du total : σ = \d+,\d+ ETP, mesuré par le calage sur le total de l’unité, hors échantillon\.$/);
  const avant = C.prevuDesJours(AVANT.ensemble.politique, F.CORRESPONDANCE, F.JOURS, R.simuleDe);
  assert.match(C.texteSigmaUnite(avant), /^Bande du total : σ = \d+,\d+ ETP, √Σσ² des lignes, supposées indépendantes/);
  // Le classeur de la période : la ligne, juste sous celle de la bande du total ; les autres feuilles inchangées.
  const lisez = { nom: 'Lisez-moi', lignes: [['Titre'], ['   … sa bande à σ = √Σσ².'], ['PROTOTYPE']] }, autre = { nom: 'Période', lignes: [['x']] };
  const c = EC.avecSigmaUnite([lisez, autre], prevu);
  assert.deepEqual(c[0].lignes.map(l => l[0]), ['Titre', '   … sa bande à σ = √Σσ².', '   ' + C.texteSigmaUnite(prevu), 'PROTOTYPE']);
  assert.equal(c[1], autre);
  assert.deepEqual(EC.avecSigmaUnite([lisez, autre], null), [lisez, autre], 'sans prévu calé : le classeur d’avant');
  // Le classeur du calage : σ et la bande du total après, sur la ligne « Toute l’unité ».
  // Une comparaison vide suffit ici : seule la feuille Calage, qui lit le rapport, compte.
  const vide = { lignes: [], unite: { jours: [], mois: [], periode: { jours: 0, mae: null, biais: null } }, anomalies: {} };
  const x = EC.calageVersClasseur({ comparaison: vide, rapport }, {});
  const f = x.find(y => y.nom === 'Calage'), t = f.lignes[0], apres = f.lignes.find(l => l[0] === 'Toute l’unité' && /^après \(modèles retenus\)$/.test(l[2]));
  assert.equal(apres[t.indexOf('σ (ETP)')], Math.round(rapport.unite.apres.sigma * 1000) / 1000);
  assert.equal(apres[t.indexOf('Bande P10–P90 (± ETP)')], Math.round(C.Z_P10_P90 * rapport.unite.apres.sigma * 1000) / 1000);
  assert.equal(f.lignes.find(l => l[0] === 'Toute l’unité' && /^avant/.test(l[2]))[t.indexOf('σ (ETP)')], null, 'avant : pas de σ');
});

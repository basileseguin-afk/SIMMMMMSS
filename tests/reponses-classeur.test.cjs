/* Évolution 15 (e) — la feuille « Réponses » du classeur de la journée
 * (echanges-reponses.js) : les cinq réponses, dans l'ordre du contrat, celles
 * du module (moteur/reponses.js), à la fin du classeur ; les autres feuilles ne
 * changent pas, ni dans la page ni dans l'outil (simuler-journee --xlsx).
 * Unité, vols et compagnies fictifs (tests/plan-rejoue-fictif.cjs). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const ER = require('../echanges-reponses.js');
const EC = require('../echanges-charge.js');
const REP = require('../moteur/reponses.js');
const T = require('../tableur.js');
const F = require('./plan-rejoue-fictif.cjs');
const P = require('../moteur/production.js');
const OUTIL = require('../outils/simuler-journee.cjs');

const DATE = '2026-11-02', LE = new Date(2026, 10, 2, 10, 0);
const sv = F.sauvegardeFictive(), p = F.heureDuPicAttendue(sv, F.volsCsv()), q = F.heureDuPicAttendue(sv, F.volsSansRetardCsv());
const A = REP.reponses(p.resultat, p.args), B = REP.reponses(q.resultat, q.args);
const QUESTIONS = ['1. Combien de personnes faut-il, par service ?', '2. Où et quand ça coince ?', '3. À quelle heure chaque service finit-il, et avec combien d’heures sup ?',
  '4. Qu’est-ce qui part en retard ?', '5. Que change mon scénario ?'];
/** Les lignes d'une question : { mesure: [valeur, sujet, au-delà, détail] }. */
const lignes = (f, i) => f.lignes.slice(1).filter(l => l[0] === QUESTIONS[i]);
const col = nom => ER.TETE.indexOf(nom);
const r2 = x => Math.round(x * 100) / 100;

test('le classeur de la journée gagne la feuille « Réponses », à la fin ; les autres ne changent pas', () => {
  const avant = EC.journeeVersClasseur({ resultat: p.resultat, args: p.args }, { date: DATE, calculeLe: LE });
  const copie = JSON.parse(JSON.stringify(avant));
  const apres = ER.avecReponses(avant, A, { date: DATE });
  assert.deepEqual(apres.map(f => f.nom), [...avant.map(f => f.nom), 'Réponses']);
  assert.deepEqual(apres.slice(0, -1), avant, 'les autres feuilles, telles quelles');
  assert.deepEqual(JSON.parse(JSON.stringify(avant)), copie, 'le classeur d’avant n’est pas touché');
});

test('les cinq réponses, dans l’ordre du contrat, celles du module', () => {
  const f = ER.feuilleDesReponses(A, { date: DATE });
  assert.equal(f.nom, 'Réponses');
  assert.deepEqual(f.lignes[0], ER.TETE);
  assert.deepEqual([...new Set(f.lignes.slice(1).map(l => l[0]))], QUESTIONS);
  // 1. Par service : il faut, présentes, l'écart et son seuil.
  for (const s of A.personnes.services) {
    const d = lignes(f, 0).filter(l => l[col('Sujet')] === s.nom), v = m => (d.find(l => l[col('Mesure')] === m) || [])[col('Valeur')];
    assert.equal(v('Il faut'), s.besoin, s.nom);
    assert.equal(v('Présentes (ETP)'), r2(s.presents), s.nom);
    assert.equal(v('Écart (présentes − il faut)'), r2(s.ecart), s.nom);
    assert.equal(d.find(l => l[col('Mesure')] === 'Écart (présentes − il faut)')[col('Au-delà du seuil')], s.signale ? 'oui' : 'non');
  }
  const unite = lignes(f, 0).filter(l => l[col('Sujet')] === 'Toute l’unité');
  assert.equal(unite.find(l => l[col('Mesure')] === 'Il faut')[col('Valeur')], A.personnes.total.besoin);
  // 2. Le goulot.
  const g = lignes(f, 1).find(l => l[col('Mesure')] === 'Goulot');
  assert.equal(g[col('Sujet')], A.coince.goulot.nom);
  assert.equal(g[col('Valeur')], Math.round(A.coince.goulot.cumul), 'son cumul d’attente');
  // 3. Les heures sup de chaque service.
  for (const s of A.fins.services) {
    const h = lignes(f, 2).find(l => l[col('Sujet')] === s.nom && l[col('Mesure')] === 'Heures sup');
    assert.equal(h[col('Valeur')], Math.round(s.heuresSup.total), s.nom);
  }
  // Les heures du détail : arrondies à la minute, comme la cellule et comme la page (P.hhmm).
  for (const s of A.fins.services.filter(x => x.fin != null && x.fin >= 0 && x.fin < 1440)) {
    const l = lignes(f, 2).find(x => x[col('Sujet')] === s.nom && x[col('Mesure')] === 'Fin du dernier lot');
    assert.equal(l[col('Détail')], P.hhmm(s.fin), s.nom);
  }
  // La cause d'une file : un texte, dans « Détail » ; « Valeur » ne porte que des nombres, des heures, ou rien.
  for (const l of f.lignes.slice(1)) assert.ok(l[col('Valeur')] == null || typeof l[col('Valeur')] === 'number' || typeof l[col('Valeur')] === 'object', l.join(' | '));
  assert.ok(!f.lignes.some(l => /à —/.test(l[col('Détail')] || '')), 'pas d’heure inconnue écrite « à — »');
  // 4. Une ligne par exception, son retard en minutes et sa cause ; chacune au-delà de son seuil.
  const ex = lignes(f, 3);
  assert.equal(ex.length, A.exceptions.length);
  assert.ok(A.exceptions.length > 2);
  ex.forEach((l, i) => {
    assert.equal(l[col('Sujet')], A.exceptions[i].id);
    assert.equal(l[col('Valeur')], Math.round(A.exceptions[i].retard));
    assert.equal(l[col('Détail')], A.exceptions[i].cause.phrase);
    assert.equal(l[col('Au-delà du seuil')], 'oui');
  });
  // 5. Sans second essai : une ligne qui dit comment en avoir un.
  assert.equal(lignes(f, 4).length, 1);
  assert.match(lignes(f, 4)[0][col('Détail')], /Comparer deux essais/);
});

test('sans exception, une ligne le dit ; avec deux essais, ce que change le scénario', () => {
  const f = ER.feuilleDesReponses(B, { date: DATE });
  assert.equal(B.exceptions.length, 0);
  assert.deepEqual(lignes(f, 3).map(l => l[col('Mesure')]), ['Aucune exception']);
  const d = REP.comparer(A, B), g = ER.feuilleDesReponses(B, { date: DATE, comparaison: d });
  const v = m => (lignes(g, 4).find(l => l[col('Mesure')] === m) || [])[col('Valeur')];
  assert.equal(v('Il faut, toute l’unité (B − A)'), d.personnes.total.besoin.d);
  assert.equal(v('Exceptions (B − A)'), d.exceptions.nombre.d);
  assert.equal(v('Exceptions réglées dans B'), d.exceptions.reglees.length);
  assert.equal(v('Exceptions nouvelles dans B'), d.exceptions.nouvelles.length);
  // Un service qui n'existe que dans B : il compte, « absent → 3 ».
  const e = JSON.parse(JSON.stringify(d));
  e.personnes.services.push({ service: 'zz', nom: 'Service fictif', besoin: { a: null, b: 3, d: null }, presents: { a: null, b: 3, d: null } });
  e.fins.services.push({ service: 'zz', nom: 'Service fictif', fin: { a: null, b: 600, d: null }, heuresSup: { a: null, b: 0, d: null } });
  const h = lignes(ER.feuilleDesReponses(B, { date: DATE, comparaison: e }), 4).filter(l => l[col('Sujet')] === 'Service fictif');
  assert.deepEqual(h.map(l => l[col('Mesure')]), ['Il faut / présentes (B − A)', 'Fin (B − A)']);
  assert.match(h[0][col('Détail')], /^il faut absent → 3 ; présentes absent → 3$/);
  assert.match(h[1][col('Détail')], /^fin absent → 10:00/);
});

test('relue par le tableur : de vraies heures, des nombres, aucune donnée hors du module', async () => {
  const f = ER.feuilleDesReponses(A, { date: DATE }), relu = await T.lireClasseur(T.ecrireClasseur([f]));
  assert.equal(relu[0].nom, 'Réponses');
  assert.equal(relu[0].lignes.length, f.lignes.length);
  const fin = f.lignes.find(l => l[0] === QUESTIONS[2] && l[col('Mesure')] === 'Fin du dernier lot' && l[col('Valeur')] != null);
  assert.ok(fin && typeof fin[col('Valeur')] === 'object', 'une heure : une vraie date Excel');
});

test('l’outil (simuler-journee --xlsx) : la même feuille, aux seuils de la sauvegarde ; les autres feuilles d’avant', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ory-reponses-classeur-'));
  try {
    const sauvegarde = path.join(dir, 'unite-fictive.json'), vols = path.join(dir, 'vols-fictifs.csv');
    fs.writeFileSync(sauvegarde, JSON.stringify(sv)); fs.writeFileSync(vols, F.volsCsv());
    const sortie = await OUTIL.simulerJournee(sauvegarde, vols);
    assert.equal('reponses' in sortie, false, 'le JSON de l’outil, sans --reponses, ne change pas');
    const classeur = await T.lireClasseur(OUTIL.classeurDeLaJournee(sortie, LE));
    const avant = await T.lireClasseur(T.ecrireClasseur(EC.journeeVersClasseur({ indicateurs: sortie.indicateursCharge }, {
      date: sortie.journee.date, sauvegarde: sortie.journee.sauvegarde, vols: sortie.journee.vols, calculeLe: LE, nomService: id => (sortie.args.noms || {})[id] || id })));
    assert.deepEqual(classeur.map(x => x.nom), [...avant.map(x => x.nom), 'Réponses']);
    assert.deepEqual(classeur.slice(0, -1), avant);
    const rep = REP.reponses(sortie.resultat, sortie.args, { seuils: REP.seuilsDeLaSauvegarde(sv), k: sortie.indicateursCharge });
    const attendu = await T.lireClasseur(T.ecrireClasseur([ER.feuilleDesReponses(rep, { date: sortie.journee.date || null, calculeLe: LE })]));
    assert.deepEqual(classeur[classeur.length - 1], attendu[0], 'la feuille de l’outil, celle du module');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

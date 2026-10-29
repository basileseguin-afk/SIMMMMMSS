/* Banc d'essai, évolution 11 — l'outil outils/caler-periode.cjs : la période que
 * simuler-periode a jouée (avec ou sans --sans-detail), le réel par jour et par
 * rôle (CSV ou classeur), la correspondance (JSON) ; le JSON de la comparaison,
 * et --xlsx le classeur, celui de la page (echanges-calage.js). Le calcul est
 * celui de moteur/reel.js. Données fictives : l'unité de la référence de
 * non-régression, des rôles et des heures inventés. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const T = require('../tableur.js');
const R = require('../moteur/reel.js');
const EC = require('../echanges-calage.js');
const C = require('../moteur/calage-periode.js');
const REF = require('./non-regression.attendu.json');

const S = REF.scenarios.find(s => s.nom === 'unite-vol');
const PERIODE = path.join(__dirname, '..', 'outils', 'simuler-periode.cjs');
const OUTIL = path.join(__dirname, '..', 'outils', 'caler-periode.cjs');
const hh = t => (t == null ? '' : String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'));
const JOURS = ['2026-11-02', '2026-11-03', '2026-11-04'];
const VOLS = 'date,vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_CREW,nb_SPML\n'
  + JOURS.flatMap(d => S.args.vols.map(v => [d, v.id, v.cie, v.avion, v.sens, v.sens === 'DEP' ? hh(v.std) : '', v.sens === 'RET' ? hh(v.sta) : '',
    v.bc, v.pc, v.yc, v.crew, v.spml].join(','))).join('\n') + '\n';
const REEL = 'date;role;heures_titulaires;heures_interim;heures_supp\n' + JOURS.flatMap((d, i) => [d + ';Cuisinier;' + (14 + 7 * i) + ';7;1',
  d + ';Agent de bureau;7;0;0', d + ';Plongeur;14;0;0']).join('\n') + '\n2026-11-03;Cuisinier;7;0;0\n';
const CORR = { bases: { defaut: { titulaires: 7, interim: 7 } }, lignes: [{ nom: 'Cuisine', roles: ['Cuisinier'], services: ['cuisine'] },
  { nom: 'Bureau', roles: ['Agent de bureau'], hors: true }], decisions: { ecartes: { jours: [], cellules: [] }, reintegres: [] } };

let dossier;
const f = nom => path.join(dossier, nom);
const lancer = (outil, ...args) => spawnSync(process.execPath, [outil, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
test.before(() => {
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ory-calage-'));
  fs.writeFileSync(f('sauvegarde.json'), JSON.stringify(S.sauvegarde));
  fs.writeFileSync(f('vols-dates.csv'), VOLS);
  fs.writeFileSync(f('options.json'), JSON.stringify(S.options));
  fs.writeFileSync(f('reel.csv'), REEL);
  fs.writeFileSync(f('correspondance.json'), JSON.stringify(CORR));
  for (const [nom, drapeaux] of [['periode.json', []], ['periode-leger.json', ['--sans-detail']]]) {
    const r = lancer(PERIODE, f('sauvegarde.json'), f('vols-dates.csv'), f('options.json'), ...drapeaux);
    assert.equal(r.status, 0, r.stderr);
    fs.writeFileSync(f(nom), r.stdout);
  }
});
test.after(() => fs.rmSync(dossier, { recursive: true, force: true }));

test('le JSON : la comparaison, la même qu’avec le module, avec ou sans --sans-detail', () => {
  const r = lancer(OUTIL, f('periode.json'), f('reel.csv'), f('correspondance.json'));
  assert.equal(r.status, 0, r.stderr);
  const sortie = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(sortie), ['calage', 'comparaison', 'rapport']);
  // Le calage (évolution 11 c) : celui du module, sur la même comparaison ; trois jours, aucune ligne ne se cale.
  assert.deepEqual(sortie.rapport, JSON.parse(JSON.stringify(C.caler(sortie.comparaison))));
  assert.ok(sortie.rapport.lignes.every(l => !l.cale && /moins de 20 jours/.test(l.raison)));
  // Toute l'unité, avant : le total simulé moins le total réel de chaque jour, l'erreur et le biais de la comparaison.
  const u = sortie.comparaison.unite.periode;
  assert.equal(sortie.rapport.unite.avant.jours, sortie.comparaison.unite.jours.length);
  assert.ok(Math.abs(sortie.rapport.unite.avant.mae - u.mae) < 1e-9 && Math.abs(sortie.rapport.unite.avant.biais - u.biais) < 1e-9);
  assert.deepEqual([sortie.calage.schema, sortie.calage.reel, sortie.calage.correspondance], ['ory-calage', 'reel.csv', 'correspondance.json']);
  const bilan = JSON.parse(fs.readFileSync(f('periode.json'), 'utf8')).bilan;
  const attendu = R.comparer(bilan, R.controler(R.lireReel([{ nom: 'reel.csv', lignes: T.lireCsv(REEL) }])), CORR);
  assert.deepEqual(sortie.comparaison, JSON.parse(JSON.stringify(attendu)));
  // Le cuisinier du 03/11 est en double : écarté, et ce jour-là la ligne Cuisine ne compte pas.
  assert.ok(sortie.comparaison.anomalies.ecartees.some(a => a.code === 'double' && a.date === '2026-11-03'));
  const cuisine = sortie.comparaison.lignes.find(l => l.nom === 'Cuisine');
  assert.deepEqual(cuisine.joursSansReel.map(j => j.date), ['2026-11-03']);
  assert.match(cuisine.joursSansReel[0].raison, /^cellule écartée \(Cuisinier\) : en double/);
  assert.ok(!cuisine.jours.some(j => j.date === '2026-11-03'));
  // Ce jour-là, la ligne Cuisine manque : il sort du total de l'unité, listé (correction 12).
  assert.deepEqual(sortie.comparaison.unite.joursRetires, [{ date: '2026-11-03', lignes: ['Cuisine'] }]);
  assert.deepEqual(sortie.comparaison.rolesSansLigne, ['Plongeur']);
  assert.match(r.stderr, /Rôles sans ligne \(non comptés\) : Plongeur/);
  assert.match(r.stderr, /Écartée : 2026-11-03, Cuisinier — en double/);
  assert.match(r.stderr, /Sans réel, Cuisine : 1 jour \(cellule écartée \(Cuisinier\) : en double/);
  assert.match(r.stderr, /Retirés du total de l’unité : 1 jour \(2026-11-03 : Cuisine\)/);
  const leger = lancer(OUTIL, f('periode-leger.json'), f('reel.csv'), f('correspondance.json'));
  assert.equal(leger.status, 0, leger.stderr);
  assert.deepEqual(JSON.parse(leger.stdout).comparaison, sortie.comparaison);
});

test('les décisions de la correspondance s’appliquent : un jour écarté, une cellule réintégrée', () => {
  fs.writeFileSync(f('corr-decisions.json'), JSON.stringify({ ...CORR, decisions: { ecartes: { jours: ['2026-11-02'], cellules: [] }, reintegres: ['2026-11-03|Cuisinier'] } }));
  const r = lancer(OUTIL, f('periode.json'), f('reel.csv'), f('corr-decisions.json'));
  assert.equal(r.status, 0, r.stderr);
  const c = JSON.parse(r.stdout).comparaison, cuisine = c.lignes.find(l => l.nom === 'Cuisine');
  assert.deepEqual(c.anomalies.joursEcartes, ['2026-11-02']);
  assert.ok(!c.jours.includes('2026-11-02'));
  assert.equal(cuisine.jours.find(j => j.date === '2026-11-03').reel, (21 + 7 + 7) / 7, 'réintégrée : ses deux lignes s’additionnent');
});

test('--xlsx : le classeur du calage, celui de la page ; un classeur pour le réel aussi', async () => {
  const r = lancer(OUTIL, f('periode.json'), f('reel.csv'), f('correspondance.json'), '--xlsx', f('calage.xlsx'));
  assert.equal(r.status, 0, r.stderr);
  const feuilles = await T.lireClasseur(new Uint8Array(fs.readFileSync(f('calage.xlsx'))));
  assert.deepEqual(feuilles.map(x => x.nom), ['Lisez-moi', 'Réel', 'Comparaison', 'Calage']);
  const calage = feuilles.find(x => x.nom === 'Calage').lignes;
  assert.deepEqual(calage[0], ['Ligne', 'Couvre', 'Rang', 'Modèle', 'Accepté', 'a', 'a min', 'a max', 'b', 'b min', 'b max', 'Constante', 'Constante min',
    'Constante max', 'Facteurs du jour (lun. → dim.)', 'Erreur par semaine (ETP)', 'Erreur par mois (ETP)', 'Plus juste que les références', 'Stable', 'Bornes',
    'Wilcoxon', 'Placebo', 'σ (ETP)', 'Bande P10–P90 (± ETP)', 'Jours', 'Validation', 'Laissé de côté']);
  assert.ok(calage.every(l => l.length <= calage[0].length));
  assert.ok(calage.some(l => l[0] === 'Cuisine' && l[2] === 'pas de calage'));
  const reel = feuilles.find(x => x.nom === 'Réel').lignes;
  assert.deepEqual(reel[0], ['Date', 'Rôle', 'Heures titulaires', 'Heures intérim', 'Heures supp', 'Base titulaires', 'Base intérim', 'ETP', 'Ligne', 'État']);
  assert.ok(reel.some(l => l[1] === 'Plongeur' && l[9] === 'sans ligne'));
  assert.ok(reel.some(l => l[1] === 'Cuisinier' && /^écartée : en double/.test(l[9])));
  const comp = feuilles.find(x => x.nom === 'Comparaison').lignes;
  // Le cuisinier du 03/11 en double : ce jour-là, sa ligne n'a pas de réel ; une colonne « Raison » le dit (correction 12).
  assert.deepEqual(comp[0], ['Ligne', 'Couvre', 'Niveau', 'Jour', 'Mois', 'Unité', 'Réel', 'Simulé', 'Écart', 'Jours', 'Erreur', 'Biais', 'Corrélation', 'Raison']);
  const sans = comp.find(l => l[0] === 'Cuisine' && l[2] === 'jour sans réel'), retire = comp.find(l => l[2] === 'jour retiré du total');
  assert.match(sans[13], /^cellule écartée \(Cuisinier\) : en double/);
  assert.deepEqual([retire[0], retire[13]], ['Toute l’unité', 'sans réel : Cuisine']);
  assert.match(feuilles.find(x => x.nom === 'Lisez-moi').lignes.map(l => l[0]).join('\n'), /Jours retirés du total de l’unité \(une ligne sans réel\) : 1\./);
  assert.ok(comp.some(l => l[0] === 'Toute l’unité' && l[2] === 'période'));
  assert.ok(comp.some(l => l[0] === 'Cuisine' && l[2] === 'heures supp du mois' && l[5] === 'h'));
  // Le réel en classeur (feuille « Réel ») : la même comparaison.
  fs.writeFileSync(f('reel.xlsx'), T.ecrireClasseur([{ nom: 'Lisez-moi', lignes: [['réel fictif']] }, { nom: 'Réel', lignes: T.lireCsv(REEL) }]));
  const x = lancer(OUTIL, f('periode.json'), f('reel.xlsx'), f('correspondance.json'));
  assert.equal(x.status, 0, x.stderr);
  assert.deepEqual(JSON.parse(x.stdout).comparaison.lignes.map(l => l.periode), JSON.parse(lancer(OUTIL, f('periode.json'), f('reel.csv'), f('correspondance.json')).stdout).comparaison.lignes.map(l => l.periode));
  assert.ok(Array.isArray(EC.calageVersClasseur({ comparaison: JSON.parse(x.stdout).comparaison, reel: null })));
});

test('les erreurs : un appel mal formé (code 2), un réel mal formé refusé en nommant la ligne, une période qui n’en est pas une (code 1)', () => {
  assert.equal(lancer(OUTIL, f('periode.json'), f('reel.csv')).status, 2);
  assert.equal(lancer(OUTIL, f('periode.json'), f('reel.csv'), f('correspondance.json'), '--inconnu').status, 2);
  fs.writeFileSync(f('reel-faux.csv'), 'date;role;heures_titulaires;heures_interim\n2026-11-02;Cuisinier;7;0\n2026-11-31;Cuisinier;7;0\n');
  const faux = lancer(OUTIL, f('periode.json'), f('reel-faux.csv'), f('correspondance.json'));
  assert.equal(faux.status, 1);
  assert.match(faux.stderr, /réel : ligne 3 : date illisible/);
  const pas = lancer(OUTIL, f('correspondance.json'), f('reel.csv'), f('correspondance.json'));
  assert.equal(pas.status, 1);
  assert.match(pas.stderr, /le JSON de node outils\/simuler-periode\.cjs est attendu/);
  fs.writeFileSync(f('corr-fausse.json'), JSON.stringify({ lignes: [{ nom: 'A', roles: ['Cuisinier'], services: ['montagne'] }] }));
  assert.match(lancer(OUTIL, f('periode.json'), f('reel.csv'), f('corr-fausse.json')).stderr, /service inconnu « montagne »/);
});

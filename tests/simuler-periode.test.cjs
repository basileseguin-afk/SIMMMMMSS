/* Banc d'essai, évolution 10 (c et e) — l'outil outils/simuler-periode.cjs : une
 * sauvegarde et un programme daté (CSV ou classeur), les options de l'outil
 * d'une journée ; le JSON de la période (la période, le bilan, chaque
 * journée), `--sans-detail`. Chaque journée se rejoue seule par
 * outils/simuler-journee.cjs avec ses `options`, au champ près. Données
 * fictives : l'unité de la référence de non-régression. `--xlsx` écrit le
 * classeur de la période, celui de la page. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const T = require('../tableur.js');
const E = require('../echanges.js');
const UI = require('../ui-model.js');
const PE = require('../moteur/periode.js');
const REF = require('./non-regression.attendu.json');

const S = REF.scenarios.find(s => s.nom === 'unite-vol');
const OUTIL = path.join(__dirname, '..', 'outils', 'simuler-periode.cjs');
const JOURNEE = path.join(__dirname, '..', 'outils', 'simuler-journee.cjs');
const hh = t => (t == null ? '' : String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'));
/** Un programme fictif de 3 jours en CSV : les vols de l'unité fictive, sans NO101 le deuxième jour. */
const CSV = 'date,vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_CREW,nb_SPML\n'
  + ['2026-11-02', '2026-11-03', '2026-11-04'].flatMap(d => S.args.vols.filter(v => !(d === '2026-11-03' && v.id === 'NO101'))
    .map(v => [d, v.id, v.cie, v.avion, v.sens, v.sens === 'DEP' ? hh(v.std) : '', v.sens === 'RET' ? hh(v.sta) : '', v.bc, v.pc, v.yc, v.crew, v.spml].join(','))).join('\n') + '\n';

let dossier;
test.before(() => {
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ory-periode-'));
  fs.writeFileSync(path.join(dossier, 'sauvegarde.json'), JSON.stringify(S.sauvegarde));
  fs.writeFileSync(path.join(dossier, 'vols-dates.csv'), CSV);
  fs.writeFileSync(path.join(dossier, 'options.json'), JSON.stringify(S.options));
});
test.after(() => fs.rmSync(dossier, { recursive: true, force: true }));
const f = nom => path.join(dossier, nom);
const lancer = (...args) => spawnSync(process.execPath, [OUTIL, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });

test('le JSON : la période, le bilan, et chaque journée avec son résultat complet', () => {
  const r = lancer(f('sauvegarde.json'), f('vols-dates.csv'), f('options.json'));
  assert.equal(r.status, 0, r.stderr);
  const p = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(p), ['periode', 'bilan', 'journees']);
  assert.deepEqual([p.periode.schema, p.periode.debut, p.periode.fin, p.periode.jours, p.periode.joursIncomplets, p.periode.options],
    ['ory-periode', '2026-11-02', '2026-11-04', 3, ['2026-11-01', '2026-11-04'], S.options]);
  assert.deepEqual([p.periode.sauvegarde, p.periode.vols], ['sauvegarde.json', 'vols-dates.csv']);
  assert.match(r.stderr, /Période jouée : 3 journées de vols, du 02\/11\/2026 au 04\/11\/2026 \(2 jours de travail incomplets\)/);
  // Le bilan : celui du moteur, pour la même sauvegarde et les mêmes vols.
  const vols = UI.parseFlights(CSV, { eta: true, spmlParCabine: true, date: true });
  assert.deepEqual(p.bilan, JSON.parse(JSON.stringify(PE.depuisSauvegarde(S.sauvegarde, vols, S.options).bilan)));
  assert.deepEqual(p.journees.map(j => [j.date, j.departs, j.retours]), [['2026-11-02', 16, 6], ['2026-11-03', 15, 6], ['2026-11-04', 16, 6]]);
  // Chaque journée se rejoue seule par l'outil d'une journée, avec ses options : le même résultat.
  for (const j of p.journees) {
    const jour = f('jour-' + j.date + '.csv'), opt = f('options-' + j.date + '.json');
    fs.writeFileSync(jour, CSV.split('\n').filter((l, i) => !i || l.startsWith(j.date)).join('\n') + '\n');
    fs.writeFileSync(opt, JSON.stringify(j.options));
    const s = spawnSync(process.execPath, [JOURNEE, f('sauvegarde.json'), jour, opt], { encoding: 'utf8', maxBuffer: 1 << 28 });
    assert.equal(s.status, 0, s.stderr);
    assert.deepEqual(JSON.parse(s.stdout).resultat, j.resultat, j.date);
  }
  assert.deepEqual(Object.keys(p.journees[1].options).sort(), ['ateliers', 'delaiChargement', 'saleInitial', 'volsVeille']);
});

test('--sans-detail : un fichier léger, la même période et le même bilan', () => {
  const plein = JSON.parse(lancer(f('sauvegarde.json'), f('vols-dates.csv')).stdout);
  const leger = lancer(f('sauvegarde.json'), f('vols-dates.csv'), '--sans-detail');
  assert.equal(leger.status, 0, leger.stderr);
  const p = JSON.parse(leger.stdout);
  assert.deepEqual(Object.keys(p), ['periode', 'bilan']);
  assert.deepEqual(p, { periode: plein.periode, bilan: plein.bilan });
  assert.ok(leger.stdout.length * 3 < JSON.stringify(plein).length);
});

test('un classeur daté (Départs / Retours) donne la même période que le CSV ; deux lancers, le même fichier', async () => {
  const vols = UI.parseFlights(CSV, { eta: true, spmlParCabine: true, date: true });
  fs.writeFileSync(f('vols-dates.xlsx'), T.ecrireClasseur(E.volsVersClasseur(vols)));
  const csv = lancer(f('sauvegarde.json'), f('vols-dates.csv'), '--sans-detail'), xlsx = lancer(f('sauvegarde.json'), f('vols-dates.xlsx'), '--sans-detail');
  assert.equal(xlsx.status, 0, xlsx.stderr);
  assert.deepEqual(JSON.parse(xlsx.stdout).bilan, JSON.parse(csv.stdout).bilan);
  assert.equal(lancer(f('sauvegarde.json'), f('vols-dates.csv')).stdout, lancer(f('sauvegarde.json'), f('vols-dates.csv')).stdout, 'déterministe');
});

test('--xlsx : le classeur de la période, celui de la page (echanges.js), et le même JSON', async () => {
  const sortie = f('periode.xlsx');
  const r = lancer(f('sauvegarde.json'), f('vols-dates.csv'), f('options.json'), '--xlsx', sortie, '--sans-detail');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /Classeur de la période : .*periode\.xlsx\./);
  assert.deepEqual(JSON.parse(r.stdout), JSON.parse(lancer(f('sauvegarde.json'), f('vols-dates.csv'), f('options.json'), '--sans-detail').stdout), 'le même JSON');
  // Le classeur que la page écrit pour la même période (seule la date du calcul diffère).
  const vols = UI.parseFlights(CSV, { eta: true, spmlParCabine: true, date: true });
  const p = PE.depuisSauvegarde(S.sauvegarde, vols, S.options);
  const attendu = await T.lireClasseur(T.ecrireClasseur(E.periodeVersClasseur(p, { sauvegarde: 'sauvegarde.json', vols: 'vols-dates.csv',
    reglages: { delaiChargement: 45, decalage: 0 }, calculeLe: new Date() })));
  const lu = await T.lireClasseur(fs.readFileSync(sortie));
  const sansDate = c => c.map(x => ({ nom: x.nom, lignes: x.lignes.filter(l => !/^Calculée le /.test(String(l[0] || ''))) }));
  assert.deepEqual(sansDate(lu), sansDate(attendu));
  assert.deepEqual(lu.map(x => x.nom), ['Lisez-moi', 'Période', 'Équipes', 'Compagnies', 'Lots', 'Vols', 'Plonge', 'Jours']);
  assert.ok(lu[0].lignes.some(l => /^Calculée le \d\d\/\d\d\/\d{4} à \d\d:\d\d\.$/.test(l[0])));
  // Sans chemin, ou un autre format : l'usage.
  assert.equal(lancer(f('sauvegarde.json'), f('vols-dates.csv'), '--xlsx').status, 2);
  assert.equal(lancer(f('sauvegarde.json'), f('vols-dates.csv'), '--xlsx', f('periode.csv')).status, 2);
});

test('les refus : programme sans date, jour sans vol signalé, options et drapeaux inconnus', () => {
  fs.writeFileSync(f('sans-date.csv'), CSV.split('\n').filter((l, i) => !i || l.startsWith('2026-11-02')).map(l => l.split(',').slice(1).join(',')).join('\n'));
  const sans = lancer(f('sauvegarde.json'), f('sans-date.csv'));
  assert.equal(sans.status, 1);
  assert.match(sans.stderr, /Période non jouée : vols : le programme n’est pas daté.*simuler-journee/);
  // Un jour sans vol au milieu : joué, et signalé sur la sortie d'erreur.
  fs.writeFileSync(f('trou.csv'), CSV.split('\n').filter(l => !l.startsWith('2026-11-03')).join('\n'));
  const trou = lancer(f('sauvegarde.json'), f('trou.csv'), '--sans-detail');
  assert.equal(trou.status, 0, trou.stderr);
  assert.match(trou.stderr, /Aucun vol le 03\/11\/2026 : jour sans vol ou oubli \?/);
  assert.deepEqual(JSON.parse(trou.stdout).periode.joursSansVol, ['2026-11-03']);
  fs.writeFileSync(f('mauvaises.json'), JSON.stringify({ plafond: 3 }));
  assert.match(lancer(f('sauvegarde.json'), f('vols-dates.csv'), f('mauvaises.json')).stderr, /option inconnue : « plafond »/);
  fs.writeFileSync(f('veille.json'), JSON.stringify({ volsVeille: [] }));
  assert.match(lancer(f('sauvegarde.json'), f('vols-dates.csv'), f('veille.json')).stderr, /volsVeille/);
  const usage = lancer(f('sauvegarde.json'), f('vols-dates.csv'), '--tout');
  assert.equal(usage.status, 2);
  assert.match(usage.stderr, /Usage : node outils\/simuler-periode\.cjs/);
});

/* Banc d'essai, évolution 13 (d) — l'outil outils/importer-flights.cjs : un
 * export Winrest fictif (les départs de l'unité fictive des tests, en
 * livraisons et lignes de prestations, une colonne de prix) donne le CSV daté
 * que simuler-periode lit tel quel ; les règles viennent de la sauvegarde si
 * on la donne, sinon des défauts ; --rapport et --xlsx ; les refus. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const T = require('../tableur.js');
const Z = require('../classeur-compresse.js');
const UI = require('../ui-model.js');
const W = require('../moteur/import-flights.js');
const REF = require('./non-regression.attendu.json');

const S = REF.scenarios.find(s => s.nom === 'unite-vol');
const OUTIL = path.join(__dirname, '..', 'outils', 'importer-flights.cjs');
const PERIODE = path.join(__dirname, '..', 'outils', 'simuler-periode.cjs');
const K = 'ory-import-winrest-v1';
const TETE = ['Date', 'Delivery No', 'Flight No', 'ICAO', 'ETD', 'Statut', 'Guest type', 'Guest qty', 'Article', 'Unit price', 'Amount'];
/** Les ICAO de l'export, et les compagnies de l'unité fictive qu'ils donnent par la table des codes compagnie. */
const ICAO = { NORD: 'NRX', SUD: 'SUX', EST: 'ESX', OUEST: 'OUX' };
const hh = t => String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
const DEPARTS = S.args.vols.filter(v => v.sens === 'DEP');
/** L'export : chaque départ de l'unité fictive, deux jours, une ligne par Guest type et deux prestations ; un vol annulé de plus. */
function lignesExport() {
  const lignes = [TETE];
  ['2026-11-02', '2026-11-03'].forEach((d, j) => {
    const date = T.celluleDate(d);
    DEPARTS.forEach((v, i) => {
      const no = 'W' + j + '-' + i;
      for (const [type, q] of [['BUSINESS', v.bc], ['PREMIUM', v.pc], ['ECONOMY', v.yc], ['CREW', v.crew], ['ECO SPML', v.spml]])
        if (q) for (const article of ['Plateau', 'Pain']) lignes.push([date, no, v.id, ICAO[v.cie], hh(v.std), 'Delivered', type, q, article, 987.65, 4321.09]);
    });
    lignes.push([date, 'X' + j, 'ZZ999', 'ZZX', '12:00', 'Cancelled', 'ECONOMY', 99, 'Plateau', 987.65, 4321.09]);
  });
  return lignes;
}
const REGLES = { compagnies: Object.fromEntries(Object.entries(ICAO).map(([c, i]) => [i, c])) };

let dossier;
test.before(async () => {
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ory-import-flights-'));
  fs.writeFileSync(path.join(dossier, 'export.xlsx'), await Z.compresser(T.ecrireClasseur([{ nom: 'Flights', lignes: lignesExport() }])));
  fs.writeFileSync(path.join(dossier, 'sauvegarde.json'), JSON.stringify({ ...S.sauvegarde, contenu: { ...S.sauvegarde.contenu, [K]: W.enveloppe(REGLES) } }));
  fs.writeFileSync(path.join(dossier, 'sauvegarde-avant.json'), JSON.stringify(S.sauvegarde));
});
test.after(() => fs.rmSync(dossier, { recursive: true, force: true }));
const f = nom => path.join(dossier, nom);
const lancer = (outil, ...args) => spawnSync(process.execPath, [outil, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });

test('l’export et la sauvegarde → le CSV daté, celui du module avec les règles de la sauvegarde', () => {
  const r = lancer(OUTIL, f('export.xlsx'), f('sauvegarde.json'));
  assert.equal(r.status, 0, r.stderr);
  const attendu = W.convertir(lignesExport().map(l => l.map(c => (c && c.excel !== undefined ? c.excel : c))), REGLES, { fichier: 'export.xlsx' });
  assert.equal(r.stdout, W.versCsv(attendu.vols));
  const vols = UI.parseFlights(r.stdout, { eta: true, spmlParCabine: true, date: true });
  assert.equal(vols.length, 2 * DEPARTS.length);
  assert.deepEqual([...new Set(vols.map(v => v.cie))].sort(), ['EST', 'NORD', 'OUEST', 'SUD']);
  // Les repas de chaque départ, comptés une fois malgré les deux prestations.
  const v0 = vols.find(v => v.date === '2026-11-02' && v.id === DEPARTS[0].id);
  assert.deepEqual([v0.bc, v0.pc, v0.yc, v0.crew, v0.spml, v0.std], [DEPARTS[0].bc, DEPARTS[0].pc, DEPARTS[0].yc, DEPARTS[0].crew, DEPARTS[0].spml, DEPARTS[0].std]);
  assert.match(r.stderr, /Vols gardés \(acceptés\) : 32/);
  assert.match(r.stderr, /statut « Cancelled » : 2/);
  assert.ok(!/987|4321/.test(r.stdout + r.stderr), 'aucun prix');
});

test('simuler-periode lit le programme tel quel', () => {
  const r = lancer(OUTIL, f('export.xlsx'), f('sauvegarde.json'));
  fs.writeFileSync(f('programme.csv'), r.stdout);
  const p = lancer(PERIODE, f('sauvegarde.json'), f('programme.csv'), '--sans-detail');
  assert.equal(p.status, 0, p.stderr);
  const periode = JSON.parse(p.stdout).periode;
  assert.deepEqual([periode.debut, periode.fin, periode.jours], ['2026-11-02', '2026-11-03', 2]);
});

test('sans sauvegarde, ou une sauvegarde d’avant sans la clé : les règles par défaut', () => {
  const sans = lancer(OUTIL, f('export.xlsx')), avant = lancer(OUTIL, f('export.xlsx'), f('sauvegarde-avant.json'));
  assert.equal(sans.status, 0, sans.stderr);
  assert.equal(avant.stdout, sans.stdout);
  // Les ICAO tels quels, sans table des codes compagnie.
  assert.deepEqual([...new Set(UI.parseFlights(sans.stdout, { date: true }).map(v => v.cie))].sort(), ['ESX', 'NRX', 'OUX', 'SUX']);
});

test('--rapport écrit le rapport (JSON), --xlsx le classeur compressé de la page', async () => {
  const r = lancer(OUTIL, f('export.xlsx'), f('sauvegarde.json'), '--rapport', f('rapport.json'), '--xlsx', f('rapport.xlsx'));
  assert.equal(r.status, 0, r.stderr);
  const rapport = JSON.parse(fs.readFileSync(f('rapport.json'), 'utf8'));
  assert.deepEqual([rapport.fichier, rapport.periode, rapport.vols, rapport.parMotif], ['export.xlsx', { debut: '2026-11-02', fin: '2026-11-03', jours: 2 }, 32, { 'statut « Cancelled »': 2 }]);
  const octets = new Uint8Array(fs.readFileSync(f('rapport.xlsx')));
  assert.ok(Z.entrees(octets).some(e => e.methode === 8), 'compressé');
  const feuilles = await T.lireClasseur(octets);
  assert.deepEqual(feuilles.map(x => x.nom), ['Lisez-moi', 'Par jour', 'Écartées', 'À vérifier', 'Types ignorés', 'Réserves fondues', 'vol_id suffixés', 'Vols fictifs']);
  assert.equal(feuilles.find(x => x.nom === 'Par jour').lignes.length, 1 + 2 * 4);
  assert.ok(!/987|4321/.test(fs.readFileSync(f('rapport.json'), 'utf8') + JSON.stringify(feuilles)), 'aucun prix');
});

test('les refus : l’appel, une colonne manquante, une règle invalide dans la sauvegarde, un fichier trop gros', () => {
  for (const args of [[], [f('export.xlsx'), f('sauvegarde.json'), f('autre.json')], [f('export.xlsx'), '--xlsx'], [f('export.xlsx'), '--xlsx', f('r.json')], [f('export.xlsx'), '--inconnu']]) {
    const r = lancer(OUTIL, ...args);
    assert.equal(r.status, 2, JSON.stringify(args));
    assert.match(r.stderr, /Usage : node outils\/importer-flights\.cjs/);
  }
  // Une valeur d'option qui est une autre option, une option répétée : l'appel est mal formé.
  for (const args of [[f('export.xlsx'), '--rapport', '--xlsx', f('x.xlsx')], [f('export.xlsx'), '--rapport', f('a.json'), '--rapport', f('b.json')]]) {
    const r = lancer(OUTIL, ...args);
    assert.equal(r.status, 2, JSON.stringify(args));
    assert.match(r.stderr, /Usage/);
  }
  // Une sortie qui écraserait l'export, la sauvegarde ou l'autre sortie : refusée avant toute écriture.
  const avantExport = fs.readFileSync(f('export.xlsx')), avantSauvegarde = fs.readFileSync(f('sauvegarde.json'));
  for (const args of [[f('export.xlsx'), '--xlsx', f('export.xlsx')], [f('export.xlsx'), f('sauvegarde.json'), '--rapport', f('sauvegarde.json')],
    [f('export.xlsx'), '--rapport', path.join(dossier, '.', 'export.xlsx')], [f('export.xlsx'), '--rapport', f('meme.xlsx'), '--xlsx', f('meme.xlsx')]]) {
    const r = lancer(OUTIL, ...args);
    assert.deepEqual([r.status, r.stdout], [2, ''], JSON.stringify(args));
    assert.match(r.stderr, /écraserait/);
  }
  assert.ok(fs.readFileSync(f('export.xlsx')).equals(avantExport) && fs.readFileSync(f('sauvegarde.json')).equals(avantSauvegarde), 'rien n’est écrasé');
  assert.equal(fs.existsSync(f('meme.xlsx')), false);
  fs.writeFileSync(f('sans-etd.csv'), 'Date;Delivery No;Flight No;ICAO;Statut;Guest type;Guest qty\n02/11/2026;L1;NO101;NRX;Delivered;ECONOMY;3\n');
  const c = lancer(OUTIL, f('sans-etd.csv'));
  assert.deepEqual([c.status, c.stdout], [1, '']);
  assert.match(c.stderr, /Import non fait : colonne « ETD » absente de l’onglet Flights/);
  const forgee = { ...S.sauvegarde, contenu: { ...S.sauvegarde.contenu, [K]: { ...W.enveloppe(REGLES), regles: { ...W.enveloppe(REGLES).regles, motReserve: '' } } } };
  fs.writeFileSync(f('forgee.json'), JSON.stringify(forgee));
  const g = lancer(OUTIL, f('export.xlsx'), f('forgee.json'));
  assert.deepEqual([g.status, g.stdout], [1, '']);
  assert.match(g.stderr, /Import non fait : règles d’import Winrest, mot des réserves/);
  fs.writeFileSync(f('pas-une-sauvegarde.json'), '{"schema":"autre"}');
  assert.match(lancer(OUTIL, f('export.xlsx'), f('pas-une-sauvegarde.json')).stderr, /ce n’est pas une sauvegarde complète/);
  fs.writeFileSync(f('gros.csv'), Buffer.alloc(31 * 1024 * 1024, 32));
  assert.match(lancer(OUTIL, f('gros.csv')).stderr, /30 Mo maximum/);
  // Un export où rien n'est gardé : pas de programme, le rapport quand même.
  fs.writeFileSync(f('annule.csv'), 'Date;Delivery No;Flight No;ICAO;ETD;Statut;Guest type;Guest qty\n02/11/2026;L1;NO101;NRX;07:00;Cancelled;ECONOMY;3\n');
  const a = lancer(OUTIL, f('annule.csv'), '--rapport', f('annule.json'));
  assert.deepEqual([a.status, a.stdout], [1, '']);
  assert.match(a.stderr, /aucun vol gardé/);
  assert.equal(JSON.parse(fs.readFileSync(f('annule.json'), 'utf8')).ecartees.length, 1);
});

test('reglesDeLaSauvegarde : la clé de la sauvegarde, validée ; sans elle, les défauts', () => {
  assert.deepEqual(W.reglesDeLaSauvegarde({ ...S.sauvegarde, contenu: { ...S.sauvegarde.contenu, [K]: W.enveloppe(REGLES) } }), W.reglesCompletes(REGLES));
  assert.deepEqual(W.reglesDeLaSauvegarde(S.sauvegarde), W.reglesCompletes());
  assert.throws(() => W.reglesDeLaSauvegarde({ schema: 'autre' }), /ce n’est pas une sauvegarde complète/);
  assert.throws(() => W.reglesDeLaSauvegarde({ ...S.sauvegarde, contenu: { [K]: { schema: 'ory-import-winrest', version: 2, regles: {} } } }), /version 2 inconnue/);
});

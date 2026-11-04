/* Banc d'essai, correction 16 (c) — le classeur compressé (classeur-compresse.js ;
 * docs/FORMATS_EXCEL.md, règles communes). tableur.js écrit des entrées
 * « stockées » ; le module les compresse (deflate) : zlib sous Node,
 * CompressionStream("deflate-raw") dans le navigateur, sinon tel quel. Le
 * contenu ne change pas ; un classeur d'avant, non compressé, se relit
 * toujours. Unité et vols fictifs (la référence de non-régression), sur 60 jours. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const PE = require('../moteur/periode.js');
const T = require('../tableur.js');
const E = require('../echanges.js');
const EC = require('../echanges-charge.js');
const Z = require('../classeur-compresse.js');

const S = require('./non-regression.attendu.json').scenarios.find(s => s.nom === 'unite-vol');
const VOLS = PE.joursEntre('2026-09-01', '2026-10-30').flatMap(d => S.args.vols.map(v => ({ ...v, date: d })));
let BRUT;
test.before(() => {
  const p = PE.depuisSauvegarde(S.sauvegarde, VOLS, S.options, { detail: true }), x = { periode: p.periode, bilan: p.bilan, journees: p.journees };
  BRUT = T.ecrireClasseur(EC.avecCharge(E.periodeVersClasseur(x, { calculeLe: new Date(2026, 10, 4, 9, 0) }), x));
});
const methodes = o => [...new Set(Z.entrees(o).map(e => e.methode))].sort();

test('60 journées fictives : le classeur se relit identique, feuille par feuille, et pèse au moins trois fois moins', async () => {
  assert.deepEqual(methodes(BRUT), [0], 'tableur.js : des entrées stockées');
  const z = Z.compresserSync(BRUT);
  assert.ok(z.length * 3 <= BRUT.length, BRUT.length + ' octets → ' + z.length);
  assert.ok(methodes(z).includes(8), 'des entrées deflate');
  const avant = await T.lireClasseur(BRUT), apres = await T.lireClasseur(z);
  assert.deepEqual(apres.map(f => f.nom), avant.map(f => f.nom));
  for (const f of avant) assert.deepEqual(apres.find(x => x.nom === f.nom).lignes, f.lignes, f.nom);
  // Les mêmes données, le même fichier.
  assert.deepEqual(Z.compresserSync(BRUT), z);
  // Chaque entrée garde son nom, son CRC et sa taille.
  assert.deepEqual(Z.entrees(z).map(e => [Buffer.from(e.nom).toString(), e.crc, e.taille]), Z.entrees(BRUT).map(e => [Buffer.from(e.nom).toString(), e.crc, e.taille]));
});

test('le chemin du navigateur (CompressionStream « deflate-raw ») : le même contenu ; sans lui, le classeur tel quel', async () => {
  const f = await Z.compresserFlux(BRUT);
  assert.ok(f.length * 3 <= BRUT.length && methodes(f).includes(8));
  const avant = await T.lireClasseur(BRUT), apres = await T.lireClasseur(f);
  for (const x of avant) assert.deepEqual(apres.find(y => y.nom === x.nom).lignes, x.lignes, x.nom);
  // Un navigateur sans CompressionStream : le classeur d'avant, non compressé, octet pour octet.
  const garde = globalThis.CompressionStream;
  try { delete globalThis.CompressionStream; assert.deepEqual(await Z.compresserFlux(BRUT), BRUT); }
  finally { globalThis.CompressionStream = garde; }
  // Ni un CompressionStream qui ne connaît pas « deflate-raw ».
  try { globalThis.CompressionStream = class { constructor(f) { if (f === 'deflate-raw') throw new TypeError('format inconnu'); } }; assert.deepEqual(await Z.compresserFlux(BRUT), BRUT); }
  finally { globalThis.CompressionStream = garde; }
});

test('un classeur d’avant, non compressé, se relit toujours ; une entrée que la compression grossirait reste stockée', async () => {
  const petit = T.ecrireClasseur([{ nom: 'A', lignes: [['x']] }]), z = Z.compresserSync(petit);
  assert.deepEqual((await T.lireClasseur(petit)).map(f => f.lignes), (await T.lireClasseur(z)).map(f => f.lignes));
  for (const [a, b] of Z.entrees(z).map((e, i) => [e, Z.entrees(petit)[i]])) assert.ok(a.donnees.length <= b.donnees.length, 'jamais plus gros');
  assert.throws(() => Z.entrees(new Uint8Array([1, 2, 3])), /pas une archive zip/);
  // compresser : sous Node, le chemin de zlib ; une archive qu'il ne sait pas lire revient telle quelle.
  assert.deepEqual(await Z.compresser(petit), z);
  assert.deepEqual(await Z.compresser(new Uint8Array([1, 2, 3])), new Uint8Array([1, 2, 3]));
});

test('les outils écrivent leurs classeurs compressés : la période, la charge de la journée', () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ory-compresse-'));
  try {
    const sv = path.join(dossier, 'sauvegarde.json'), opt = path.join(dossier, 'options.json'), vols = path.join(dossier, 'vols.xlsx'), datees = path.join(dossier, 'vols-dates.xlsx');
    fs.writeFileSync(sv, JSON.stringify(S.sauvegarde)); fs.writeFileSync(opt, JSON.stringify(S.options));
    fs.writeFileSync(vols, T.ecrireClasseur(E.volsVersClasseur(S.args.vols)));
    fs.writeFileSync(datees, T.ecrireClasseur(E.volsVersClasseur(VOLS.filter(v => v.date <= '2026-09-03'))));
    const xp = path.join(dossier, 'periode.xlsx'), xj = path.join(dossier, 'charge.xlsx');
    execFileSync(process.execPath, [path.join(__dirname, '..', 'outils', 'simuler-periode.cjs'), '--sans-detail', '--xlsx', xp, sv, datees, opt], { stdio: 'ignore' });
    execFileSync(process.execPath, [path.join(__dirname, '..', 'outils', 'simuler-journee.cjs'), '--xlsx', xj, sv, vols, opt], { stdio: 'ignore' });
    for (const f of [xp, xj]) assert.ok(methodes(fs.readFileSync(f)).includes(8), path.basename(f) + ' : compressé');
  } finally { fs.rmSync(dossier, { recursive: true, force: true }); }
});

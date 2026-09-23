/* Le tableur : lire et écrire des classeurs Excel sans bibliothèque. */
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../tableur.js');

/* Un classeur enregistré par un autre logiciel (openpyxl), donc COMPRESSÉ,
 * avec chaînes partagées, heures au format Excel et nombres décimaux.
 * Données fictives. Il est embarqué ici : .gitignore refuse les .xlsx. */
const CLASSEUR_TIERS = Buffer.from('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', 'base64');

test('un classeur écrit se relit à l’identique', async () => {
  const octets = T.ecrireClasseur([
    { nom: 'Vols', lignes: [['vol_id', 'nb', 'note', 'ok'], ['AF1', 12, 'é & <x> "q"', true], ['TX2', 3.5, null, false]] },
    { nom: 'Deux', lignes: [['seul']] }
  ]);
  const f = await T.lireClasseur(octets);
  assert.deepEqual(f.map(x => x.nom), ['Vols', 'Deux']);
  assert.deepEqual(f[0].lignes, [['vol_id', 'nb', 'note', 'ok'], ['AF1', 12, 'é & <x> "q"', true], ['TX2', 3.5, null, false]]);
});

test('un nom de feuille interdit par Excel est corrigé, pas refusé', async () => {
  const f = await T.lireClasseur(T.ecrireClasseur([{ nom: 'A/B:C', lignes: [['x']] }, { nom: 'a/b:c', lignes: [['y']] }]));
  assert.equal(f[0].nom, 'A B C');
  assert.notEqual(f[1].nom.toLowerCase(), f[0].nom.toLowerCase(), 'deux onglets ne portent jamais le même nom');
});

test('un classeur compressé d’un autre logiciel se lit', async () => {
  const f = await T.lireClasseur(CLASSEUR_TIERS);
  const b = T.feuille(f, 'bareme');
  assert.ok(b, 'la feuille « Barème » se trouve sans accent');
  const { objets } = T.enObjets(b.lignes);
  assert.equal(objets[0].service, 'CUISINE');
  assert.equal(objets[0].minutes_par_vol, 35.5);
  assert.equal(objets[1].compagnie, 'AF');
  assert.equal(T.heureDe(objets[0].debut), 390, 'une heure Excel est une fraction de jour');
  assert.equal(T.heureDe(objets[1].debut), 23 * 60 + 59);
  assert.equal(objets[0]._ligne, 2, 'le numéro de ligne est celui du tableur');
});

test('le CSV : séparateur deviné, guillemets, décimales à virgule', () => {
  const l = T.lireCsv('﻿a;b;c\r\n1;"x;y";2,5\r\n\r\n');
  assert.deepEqual(l, [['a', 'b', 'c'], ['1', 'x;y', '2,5'], [null]]);
  assert.equal(T.nombreDe('2,5'), 2.5);
  assert.deepEqual(T.lireCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
  const csv = T.ecrireCsv([['a', 'b'], [1.5, 'x;y']]);
  assert.ok(csv.startsWith('﻿'), 'Excel reconnaît l’UTF-8 grâce au BOM');
  assert.deepEqual(T.lireCsv(csv), [['a', 'b'], ['1,5', 'x;y']]);
});

test('en-têtes : casse, accents et espaces ne comptent pas', () => {
  const { objets } = T.enObjets([[null], ['Début', 'Minutes par vol', 'Compagnie × classe'], [null, null], ['06:00', '4', 'AF/BC']]);
  assert.deepEqual(Object.keys(objets[0]).sort(), ['_ligne', 'compagnie_classe', 'debut', 'minutes_par_vol']);
  assert.equal(objets.length, 1, 'une ligne vide est ignorée');
  assert.equal(objets[0]._ligne, 4);
});

test('heures, nombres et oui/non refusent ce qui est illisible', () => {
  assert.equal(T.heureDe('6h30'), 390);
  assert.equal(T.heureDe(null), null);
  assert.throws(() => T.heureDe('25:99'), /HH:MM/);
  assert.throws(() => T.nombreDe('douze'), /nombre attendu/);
  assert.equal(T.ouiNon('Oui', false), true);
  assert.equal(T.ouiNon('x', false), true);
  assert.equal(T.ouiNon(null, true), true);
  assert.throws(() => T.ouiNon('peut-être'), /oui ou non/);
});

test('une archive quelconque n’est pas prise pour un classeur', async () => {
  const zip = T.zipper([{ nom: 'a.txt', contenu: 'bonjour' }]);
  await assert.rejects(T.lireClasseur(zip), /pas un classeur/);
  await assert.rejects(T.lireClasseur(new Uint8Array([1, 2, 3])), /pas un fichier Excel/);
});

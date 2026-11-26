/* Correction 24 (h) — une valeur inhabituelle se dit : `inhabituel.js` sans navigateur. Les deux seuils (un temps par vol
 * de plus de 24 heures pour une personne, une équipe de plus de 200 personnes) sont écrits en un seul endroit ; au seuil
 * et en dessous, rien ne se dit ; au-dessus, la notification ajoute « valeur inhabituelle, à vérifier ». */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const I = require('../inhabituel.js');

test('les deux seuils sont ceux de la demande, et ne se changent pas en route', () => {
  assert.deepEqual({ ...I.SEUILS }, { heuresParVol: 24, personnes: 200 });
  assert.ok(Object.isFrozen(I.SEUILS));
  assert.equal(I.MOT, 'valeur inhabituelle, à vérifier');
});

test('les seuils ne sont écrits qu’à un endroit : aucun autre script de la page ne les répète', () => {
  const source = fs.readFileSync(path.join(__dirname, '../inhabituel.js'), 'utf8');
  assert.equal((source.match(/heuresParVol: 24/g) || []).length, 1);
  assert.equal((source.match(/personnes: 200/g) || []).length, 1);
  // Hors de `SEUILS`, le module ne compare qu'à ses seuils, jamais à un nombre écrit.
  const horsSeuils = source.replace(/const SEUILS[^\n]*\n/, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(horsSeuils, /[<>]=?\s*(24|200)\b/);
});

test('un temps par vol : inhabituel au-dessus de 24 heures pour une personne, pas à 24 ni en dessous', () => {
  assert.equal(I.inhabituelle('temps', 24.01), true);
  assert.equal(I.inhabituelle('temps', '25'), true);
  assert.equal(I.inhabituelle('temps', '24,5'), true, 'la virgule vaut le point');
  assert.equal(I.inhabituelle('temps', 24), false);
  assert.equal(I.inhabituelle('temps', '23.99'), false);
  assert.equal(I.inhabituelle('temps', 0), false);
});

test('une équipe : inhabituelle au-dessus de 200 personnes, pas à 200 ni en dessous', () => {
  assert.equal(I.inhabituelle('personnes', 201), true);
  assert.equal(I.inhabituelle('personnes', '999'), true);
  assert.equal(I.inhabituelle('personnes', 200), false);
  assert.equal(I.inhabituelle('personnes', '12'), false);
});

test('sans valeur lisible, ou pour un autre genre de champ, rien n’est inhabituel', () => {
  for (const v of ['', '   ', null, undefined, 'abc', NaN, Infinity]) {
    assert.equal(I.inhabituelle('temps', v), false, String(v));
    assert.equal(I.inhabituelle('personnes', v), false, String(v));
  }
  assert.equal(I.inhabituelle('debit', 100000), false);
  assert.equal(I.nombre(' 1,5 '), 1.5);
  assert.equal(I.nombre(''), null);
});

test('la notification propre : ce qui a été saisi, puis l’avis', () => {
  assert.equal(I.phrase('temps', '30'), '30 h par vol pour une personne : valeur inhabituelle, à vérifier.');
  assert.equal(I.phrase('temps', '24,5'), '24,5 h par vol pour une personne : valeur inhabituelle, à vérifier.');
  assert.equal(I.phrase('personnes', 250), '250 personnes dans une équipe : valeur inhabituelle, à vérifier.');
});

test('la notification de la saisie est complétée, sans rien perdre de ce qu’elle disait', () => {
  assert.equal(I.ajouter('Montage : 250 personnes.'), 'Montage : 250 personnes — valeur inhabituelle, à vérifier.');
  assert.equal(I.ajouter('Temps par vol changé'), 'Temps par vol changé — valeur inhabituelle, à vérifier.');
  assert.equal(I.ajouter(''), '');
  const deja = '250 personnes dans une équipe : valeur inhabituelle, à vérifier.';
  assert.equal(I.ajouter(deja), deja, 'l’avis ne se répète pas');
});

test('les champs lus : les temps par vol saisis en heures, et l’effectif d’une équipe', () => {
  assert.deepEqual(I.CHAMPS.map(c => c.genre), ['temps', 'personnes']);
  assert.match(I.CHAMPS[0].ou, /data-rg-champ="heures"/);
  assert.match(I.CHAMPS[0].ou, /data-rg-champ="recap"/);
  assert.match(I.CHAMPS[1].ou, /data-at-champ="personnes"/);
});

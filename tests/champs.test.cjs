/* Les champs (refonte du 08/10, étape 7) : l'heure en 24 h, et les flèches.
 * Ce qu'on tape devient « HH:MM », comme l'enregistrait le champ natif : les
 * données ne changent pas. Une heure impossible est refusée (null), jamais
 * devinée. v1 et v2 portent le même fichier. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../champs.js');

test('v1 et v2 portent le même champs.js', () => {
  assert.equal(fs.readFileSync(path.join(__dirname, '../v2/champs.js'), 'utf8'), fs.readFileSync(path.join(__dirname, '../champs.js'), 'utf8'));
});

test('l’heure tapée s’écrit HH:MM, en 24 h', () => {
  const cas = {
    '0430': '04:30', '430': '04:30', '4:30': '04:30', '4h30': '04:30', '4H30': '04:30', '4.30': '04:30',
    '4': '04:00', '04': '04:00', '14': '14:00', '4h': '04:00', '4:': '04:00', '1430': '14:30',
    '14:30': '14:30', ' 14 h 30 ': '14:30', '0': '00:00', '0000': '00:00', '2359': '23:59', '9:5': '09:05',
  };
  for (const [tape, attendu] of Object.entries(cas)) assert.equal(C.heure(tape), attendu, tape);
});

test('une heure impossible est refusée, jamais devinée', () => {
  for (const tape of ['24', '2400', '25:00', '1260', '12:60', '4:300', '04:30:00', 'midi', '4 am', '12345', '-1', '1:2:3'])
    assert.equal(C.heure(tape), null, tape);
  assert.equal(C.heure(''), '');
  assert.equal(C.heure('   '), '');
  assert.equal(C.heure(null), '');
});

test('↑↓ : au quart d’heure ; Maj : à l’heure ; le cadran tourne', () => {
  assert.equal(C.decaler('04:00', 15), '04:15');
  assert.equal(C.decaler('04:07', 15), '04:15', 'au quart suivant');
  assert.equal(C.decaler('04:07', -15), '04:00', 'au quart précédent');
  assert.equal(C.decaler('04:00', -15), '03:45');
  assert.equal(C.decaler('23:50', 15), '00:00', 'après minuit, le lendemain s’écrit 00:00');
  assert.equal(C.decaler('00:00', -15), '23:45');
  assert.equal(C.decaler('04:07', 60), '05:07', 'Maj : une heure, minutes gardées');
  assert.equal(C.decaler('23:30', 60), '00:30');
  assert.equal(C.decaler('', 15), '00:15', 'un champ vide part de minuit');
});

test('les nombres : dix pas avec Maj, dans les bornes, sans poussière de virgule', () => {
  assert.equal(C.avancer('3', 10), '13');
  assert.equal(C.avancer('3', -10, { min: 0 }), '0');
  assert.equal(C.avancer('995', 10, { max: 999 }), '999');
  assert.equal(C.avancer('1.5', 10, { pas: 0.5 }), '6.5');
  assert.equal(C.avancer('0.1', 10, { pas: 0.1 }), '1.1');
  assert.equal(C.avancer('2,5', 10), '12.5', 'la virgule se lit');
  assert.equal(C.avancer('', 10), '10', 'vide : depuis zéro');
});

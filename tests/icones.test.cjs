/* Les pictogrammes : un par idée, et chaque service reconnaît le sien. */
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../icones.js');

test('chaque service du plan a son pictogramme', () => {
  const attendu = { cuisine: 'marmite', plonge: 'gouttes', decontam: 'carotte', prepa: 'plateau',
    dotation: 'couverts', magasin: 'etagere', armement: 'trolley', bobduty: 'sac',
    quais: 'camion', handling: 'depart', appros: 'boite' };
  for (const [id, ico] of Object.entries(attendu)) assert.equal(I.icoService(id), ico, id);
  assert.equal(I.icoService('z-annexe-1', 'Armement 2'), 'trolley', 'une annexe se reconnaît à son nom');
  assert.equal(I.icoService('inconnu', 'Autre'), 'service');
});

test('un pictogramme est un SVG muet, sauf s’il porte un titre', () => {
  assert.match(I.ico('avion'), /^<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">/);
  assert.match(I.ico('avion', 'x', 'Départ'), /role="img" aria-label="Départ"/);
  for (const e of Object.values(I.ETAPES)) assert.ok(I.TRAITS[e.ico], e.ico);
});

test('un nom de service en capitales s’affiche comme une phrase, sans toucher aux sigles', () => {
  assert.equal(I.nomLisible('RÉCEPTION / APPROS'), 'Réception / Appros');
  assert.equal(I.nomLisible('CF DÉPART FOOD'), 'CF départ food');
  assert.equal(I.nomLisible('QUAIS · RÉCEPTION'), 'Quais · Réception');
  assert.equal(I.nomLisible('MONTAGE'), 'Montage');
  assert.equal(I.nomLisible('Armement 2'), 'Armement 2', 'un nom déjà écrit en minuscules reste tel quel');
  assert.equal(I.nomLisible(''), '');
});

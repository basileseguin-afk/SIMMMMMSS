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

/* « Fichiers » (version 1, évolution 22) — le tableau des classeurs Excel, sans navigateur : une ligne par classeur, une
 * colonne par sens, « sans objet » pour un sens qui n'existe pas. */
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../fichiers-page.js');

const lignes = html => [...html.matchAll(/<tr data-classeur="([^"]+)"><th scope="row">([^<]*)(?:<small>[^<]*<\/small>)?<\/th>(.*?)<\/tr>/gs)]
  .map(m => [m[1], m[2], [...m[3].matchAll(/<td data-fi-sens="([^"]+)">(.*?)<\/td>/gs)].map(c => [c[1], c[2].replace(/<[^>]+>/g, '')])]);

test('les classeurs des pages reprises par « Services et équipes » : les équipes et leurs horaires, les temps par vol', () => {
  assert.deepEqual(F.SENS.map(s => s.nom), ['Importer', 'Exporter']);
  assert.deepEqual(F.CLASSEURS.map(c => [c.id, c.nom, c.importer, c.exporter]), [
    ['equipes', 'Équipes et horaires', ['rc-import-btn', 'rc-import'], ['rc-export']],
    ['temps', 'Temps par vol, vue d’ensemble', ['rg-recap-import-btn', 'rg-recap-import'], ['rg-recap-export']],
    ['etude', 'Temps par vol, service par service', ['rg-import-btn', 'rg-import'], ['rg-export']]]);
  for (const c of F.CLASSEURS) assert.ok(c.note && c.note.length > 20, c.id + ' : une phrase dit ce qu’il contient');
});

test('le tableau : une ligne par classeur, une colonne par sens ; un sens qui n’existe pas dit « sans objet »', () => {
  const html = F.tableau();
  assert.match(html, /<th scope="col">Classeur<\/th><th scope="col">Importer<\/th><th scope="col">Exporter<\/th>/);
  // Les cellules attendent les boutons de la page : vides ici.
  assert.deepEqual(lignes(html), [
    ['equipes', 'Équipes et horaires', [['importer', ''], ['exporter', '']]],
    ['temps', 'Temps par vol, vue d’ensemble', [['importer', ''], ['exporter', '']]],
    ['etude', 'Temps par vol, service par service', [['importer', ''], ['exporter', '']]]]);
  const autres = F.tableau([{ id: 'resultats', nom: 'Résultats <b>', exporter: ['x'] }, { id: 'modele', nom: 'Modèle', importer: [] }]);
  assert.deepEqual(lignes(autres), [
    ['resultats', 'Résultats &lt;b&gt;', [['importer', 'sans objet'], ['exporter', '']]],
    ['modele', 'Modèle', [['importer', 'sans objet'], ['exporter', 'sans objet']]]]);
  assert.equal(lignes(F.tableau([])).length, 0);
});

test('poser : sans page, rien ne casse', () => {
  assert.doesNotThrow(() => F.poser(null, null));
});

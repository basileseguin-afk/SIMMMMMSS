/* « Fichiers » (version 1, évolution 22) — le tableau des classeurs Excel, sans navigateur : une ligne par classeur, une
 * colonne par sens (« Importer », « Exporter », « Classeur vide à remplir »), « sans objet » pour un sens qui n'existe
 * pas ; la date de la dernière sauvegarde. */
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../fichiers-page.js');

const lignes = html => [...html.matchAll(/<tr data-classeur="([^"]+)"><th scope="row">([^<]*)(?:<small>[^<]*<\/small>)?<\/th>(.*?)<\/tr>/gs)]
  .map(m => [m[1], m[2], [...m[3].matchAll(/<td data-fi-sens="([^"]+)">(.*?)<\/td>/gs)].map(c => [c[1], c[2].replace(/<[^>]+>/g, '')])]);
/** Ce qui remplit une cellule, en bref : un identifiant (l'élément rangé là), « clic:… » (un bouton qui clique un élément resté à sa place), « geste:… ». */
const bref = l => (l || []).map(x => (typeof x === 'string' ? x : x.declenche ? 'clic:' + x.declenche : x.geste ? 'geste:' + x.geste : x.id));

test('trois sens, dans l’ordre des colonnes : importer, exporter, classeur vide à remplir', () => {
  assert.deepEqual(F.SENS.map(s => [s.id, s.nom]), [['importer', 'Importer'], ['exporter', 'Exporter'], ['vide', 'Classeur vide à remplir']]);
});

test('tous les classeurs, une ligne chacun (évolution 22 e) : ce qui s’importe, ce qui s’exporte, ce qui a un classeur vide', () => {
  assert.deepEqual(F.CLASSEURS.map(c => [c.id, c.nom, bref(c.importer), bref(c.exporter), bref(c.vide)]), [
    // L'import des vols reste aussi sur « Programme » : ici, un bouton qui clique le même champ.
    ['vols', 'Programme des vols', ['clic:#imp-vols'], ['exp-vols'], ['csv-template', 'csv-template-date']],
    ['retours', 'Retours', ['geste:planche-importer'], ['geste:planche-exporter'], ['geste:planche-vide']],
    ['equipes-chemins', 'Équipes et chemins', ['at-import-btn', 'at-import'], ['at-export'], []],
    // Le même champ relit le classeur des équipes et celui des horaires.
    ['horaires', 'Horaires des équipes', ['clic:#at-import'], ['at-export-horaires'], []],
    // Les classeurs des pages que « Services et équipes » a reprises (évolution 22 b).
    ['equipes', 'Équipes et horaires', ['rc-import-btn', 'rc-import'], ['rc-export'], []],
    ['temps', 'Temps par vol, vue d’ensemble', ['rg-recap-import-btn', 'rg-recap-import'], ['rg-recap-export'], []],
    ['etude', 'Temps par vol, service par service', ['rg-import-btn', 'rg-import'], ['rg-export'], []],
    // Les résultats ne s'importent pas.
    ['journee', 'Résultats de la journée', [], ['geste:journee-classeur', 'geste:journee-json'], []],
    ['periode', 'Résultats de la période', [], ['geste:periode'], []],
    ['liens', 'Liens entre services', ['fc-import-button', 'fc-import'], ['fc-export'], []]]);
  for (const c of F.CLASSEURS) assert.ok(c.note && c.note.length > 20, c.id + ' : une phrase dit ce qu’il contient');
  // Un bouton neuf a son identifiant, unique.
  const neufs = F.CLASSEURS.flatMap(c => ['importer', 'exporter', 'vide'].flatMap(s => (c[s] || []).filter(x => typeof x === 'object' && (x.declenche || x.geste)).map(x => x.id)));
  assert.equal(neufs.every(Boolean), true);
  assert.equal(new Set(neufs).size, neufs.length);
});

test('le tableau : une ligne par classeur, une colonne par sens ; un sens qui n’existe pas dit « sans objet »', () => {
  const html = F.tableau();
  assert.match(html, /<th scope="col">Classeur<\/th><th scope="col">Importer<\/th><th scope="col">Exporter<\/th><th scope="col">Classeur vide à remplir<\/th>/);
  // Les cellules attendent les boutons de la page : vides ici ; un sens qu'un classeur n'a pas dit « sans objet ».
  const l = lignes(html);
  assert.deepEqual(l.map(x => x[0]), F.CLASSEURS.map(c => c.id));
  assert.deepEqual(l.find(x => x[0] === 'vols')[2], [['importer', ''], ['exporter', ''], ['vide', '']]);
  assert.deepEqual(l.find(x => x[0] === 'equipes')[2], [['importer', ''], ['exporter', ''], ['vide', 'sans objet']]);
  assert.deepEqual(l.find(x => x[0] === 'journee')[2], [['importer', 'sans objet'], ['exporter', ''], ['vide', 'sans objet']]);
  assert.deepEqual(l.find(x => x[0] === 'periode')[2], [['importer', 'sans objet'], ['exporter', ''], ['vide', 'sans objet']]);
  const autres = F.tableau([{ id: 'resultats', nom: 'Résultats <b>', exporter: ['x'] }, { id: 'modele', nom: 'Modèle', importer: [], vide: [{ geste: 'g' }] }]);
  assert.deepEqual(lignes(autres), [
    ['resultats', 'Résultats &lt;b&gt;', [['importer', 'sans objet'], ['exporter', ''], ['vide', 'sans objet']]],
    ['modele', 'Modèle', [['importer', 'sans objet'], ['exporter', 'sans objet'], ['vide', '']]]]);
  assert.equal(lignes(F.tableau([])).length, 0);
});

test('la date de la dernière sauvegarde, dite en clair ; sans sauvegarde, la page le dit', () => {
  const quand = new Date(2031, 2, 4, 9, 5);
  assert.equal(F.direSauvegarde(quand.toISOString()), 'Dernière sauvegarde faite depuis ce navigateur : le 04/03/2031 à 09:05.');
  assert.equal(F.direSauvegarde(null), 'Aucune sauvegarde faite depuis ce navigateur.');
  assert.equal(F.direSauvegarde('pas une date'), 'Aucune sauvegarde faite depuis ce navigateur.');
});

test('poser, maj : sans page, rien ne casse', () => {
  assert.doesNotThrow(() => F.poser(null, null));
  assert.doesNotThrow(() => F.maj(null));
});

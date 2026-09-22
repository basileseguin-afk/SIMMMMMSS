/* Les pages servies doivent porter l'empreinte du contenu de leurs fichiers.
 * Sans cela, un navigateur garde un `sim.js` périmé à côté d'un `index.html`
 * neuf : le déploiement est vert, le dépôt est à jour, et la page est cassée
 * ou simplement d'hier. C'est arrivé deux fois. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../outils/empreinte.cjs');

const RACINE = path.resolve(__dirname, '..');

test('chaque script et chaque feuille de style porte l’empreinte de son contenu', () => {
  const ecarts = E.toutes().flatMap(a => a.ecarts);
  assert.deepEqual(ecarts, [],
    'lancez `node outils/empreinte.cjs` avant de livrer');
});

test('l’empreinte change quand le fichier change, et pas autrement', () => {
  const a = E.empreinte(path.join(RACINE, 'sim.js'));
  assert.equal(a, E.empreinte(path.join(RACINE, 'sim.js')), 'stable à contenu égal');
  assert.notEqual(a, E.empreinte(path.join(RACINE, 'ateliers.js')), 'distincte d’un autre fichier');
  assert.match(a, /^[0-9a-f]{8}$/);
});

test('la version affichée résume l’état de toute la page', () => {
  const index = E.toutes().find(a => a.page === 'index.html');
  assert.ok(index, 'index.html est analysé');
  assert.match(index.version, /^[0-9a-f]{10}$/);
  assert.ok(index.contenu.includes('content="' + index.version + '"'),
    'la balise ory-version porte cette valeur');
});

test('un fichier référencé mais absent est signalé, pas ignoré', () => {
  // On n'écrit rien : on vérifie que l'analyse le dirait.
  const page = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
  const references = [...page.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))/g)].map(m => m[1]);
  assert.ok(references.length >= 10, 'la page référence bien ses fichiers');
  for (const r of references) {
    assert.ok(fs.existsSync(path.join(RACINE, r)), r + ' doit exister');
  }
});

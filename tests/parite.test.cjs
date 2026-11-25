/* v1 et v2 partagent l'interface (refonte du 08/10 au 12/10) : les fichiers
 * communs sont identiques, copiés de l'un à l'autre. Une retouche faite d'un
 * seul côté se voit ici, avant de se voir à l'écran. Les fichiers propres à
 * chaque version (le moteur de la v2, ses pages Budget et Calage, son menu,
 * ses pictogrammes en plus) n'y sont pas. Voir docs/DESIGN_SYSTEM.md, § 9. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const COMMUNS = [
  // Le design system et ses composants scriptés.
  'ds.css', 'ds.js', 'palette.js', 'champs.js', 'notifications.js', 'problemes.js', 'rendu.js',
  // Les vues.
  'unite.js', 'unite.css', 'ateliers.css', 'histoire.css', 'reglages.js', 'reglages.css',
  'simulation.js', 'comparaison.js', 'replay.js', 'temps.js', 'temps.css', 'graphe.js', 'graphe.css',
  'parcours.js', 'echanges.js', 'tableur.js', 'flow-center.js', 'flow-center.css', 'plan-editor.js', 'ui-model.js',
  'demarrage.css', 'interface.css', 'editor.css', 'aide.css', 'usability.css',
  // Le noyau du moteur (le modèle de production, lui, a ses ajouts en v2).
  'moteur/noyau.js'
];

for (const f of COMMUNS) {
  test('v1 et v2 portent le même ' + f, () => {
    const v1 = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    const v2 = fs.readFileSync(path.join(__dirname, '..', 'v2', f), 'utf8');
    assert.ok(v1 === v2, f + ' diffère entre v1 et v2 : copier la retouche de l’autre côté');
  });
}

/* Évolution 25 (a) — la version 2 est gelée et garde son visuel : celui de la version 1 vient d'une feuille neuve
 * (visuel.css) et de modules neufs, chargés par elle seule, jamais d'une retouche à une feuille commune. */
test('chaque feuille commune est identique à sa jumelle de v2/ : aucune n’échappe à la liste', () => {
  const racine = path.join(__dirname, '..');
  // Toute feuille de v2/ qui porte le nom d'une feuille de la racine est une feuille commune (budget.css n'existe qu'en v2).
  const jumelles = fs.readdirSync(path.join(racine, 'v2')).filter(f => f.endsWith('.css') && fs.existsSync(path.join(racine, f))).sort();
  assert.deepEqual(jumelles, COMMUNS.filter(f => f.endsWith('.css')).sort(), 'les feuilles communes sont celles de la liste');
  assert.equal(jumelles.length, 13);
  for (const f of jumelles) assert.ok(fs.readFileSync(path.join(racine, f)).equals(fs.readFileSync(path.join(racine, 'v2', f))),
    f + ' diffère de v2/' + f + ' : une feuille commune ne se modifie pas (le visuel de la version 1 va dans visuel.css)');
});

test('la feuille du nouveau visuel n’est chargée que par la version 1, juste avant lisible.css', () => {
  const lire = page => fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
  const liens = page => [...lire(page).matchAll(/<link href="([^"?]+\.css)(?:\?v=[0-9a-f]+)?" rel="stylesheet"\/>/g)].map(m => m[1]);
  const index = liens('index.html');
  assert.equal(index.filter(f => f === 'visuel.css').length, 1, 'index.html la charge une fois');
  assert.ok(index.indexOf('ds.css') >= 0 && index.indexOf('ds.css') < index.indexOf('visuel.css'), 'après ds.css');
  assert.deepEqual(index.slice(-2), ['visuel.css', 'lisible.css'], 'après les feuilles des vues, juste avant lisible.css, qui reste la dernière');
  assert.deepEqual(liens('accueil.html'), ['ds.css', 'visuel.css'], 'accueil.html : ds.css, puis la feuille neuve');
  for (const page of ['v2/index.html', 'v2/secours.html', 'secours.html']) assert.equal(lire(page).includes('visuel.css'), false, page + ' ne la charge pas');
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'v2', 'visuel.css')), false, 'la feuille n’a pas de jumelle en v2');
});

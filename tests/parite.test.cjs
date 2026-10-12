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

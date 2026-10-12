/* La palette (refonte du 08/10, étape 10) : ce qu'elle trouve, et dans quel
 * ordre. Le reste (la fenêtre, les touches) se vérifie dans le navigateur :
 * tests/palette-browser.cjs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../palette.js');

const ELEMENTS = [
  { groupe: 'Gestes', nom: 'Rejouer la journée', indice: 'Le plan rejoué', mots: 'lire lecture' },
  { groupe: 'Pages', nom: 'Accueil' },
  { groupe: 'Pages', nom: 'Services et équipes', indice: 'Équipes' },
  { groupe: 'Pages', nom: 'Horaires des équipes', indice: 'Équipes' },
  { groupe: 'Pages', nom: 'Vols prêts au départ', indice: 'Résultats' },
  { groupe: 'Services', nom: 'Montage', indice: 'Service' },
  { groupe: 'Équipes', nom: 'Montage AF', indice: 'Montage' },
  { groupe: 'Équipes', nom: 'Cuisine chaud', indice: 'Cuisine' },
  { groupe: 'Commandes', nom: 'AF · Économie', indice: 'AF/YC' },
  { groupe: 'Commandes', nom: 'TX · Business', indice: 'TX/BC' }
];
const ORDRE = { groupes: ['Gestes', 'Pages', 'Services', 'Équipes', 'Commandes'], sansTexte: ['Gestes', 'Pages'] };
const noms = r => r.map(g => g.groupe + ' : ' + g.elements.map(e => e.nom).join(', '));

test('v1 et v2 portent la même palette.js', () => {
  assert.equal(fs.readFileSync(path.join(__dirname, '../v2/palette.js'), 'utf8'), fs.readFileSync(path.join(__dirname, '../palette.js'), 'utf8'));
});

test('sans texte : les gestes et les pages, dans l’ordre', () => {
  assert.deepEqual(noms(P.chercher(ELEMENTS, '', ORDRE)), [
    'Gestes : Rejouer la journée',
    'Pages : Accueil, Services et équipes, Horaires des équipes, Vols prêts au départ']);
  assert.deepEqual(P.chercher(ELEMENTS, '   ', ORDRE).length, 2, 'des espaces ne sont pas un texte');
});

test('sans accents ni majuscules, et le début du nom d’abord', () => {
  // « equipe » : les deux pages dont le nom le contient, avant rien d'autre.
  assert.deepEqual(noms(P.chercher(ELEMENTS, 'EQUIPE', ORDRE)), ['Pages : Services et équipes, Horaires des équipes']);
  // « mont » : le service (début du nom) et l'équipe ; le groupe du meilleur en tête.
  assert.deepEqual(noms(P.chercher(ELEMENTS, 'mont', ORDRE)), ['Services : Montage', 'Équipes : Montage AF']);
  // Le début d'un mot vaut mieux que le milieu : « af » trouve « Montage AF » avant « AF · Économie »… qui commence par lui.
  assert.equal(P.chercher(ELEMENTS, 'af', ORDRE)[0].elements[0].nom, 'AF · Économie');
});

test('tous les mots doivent répondre, dans le nom ou ce qui l’accompagne', () => {
  assert.deepEqual(noms(P.chercher(ELEMENTS, 'af eco', ORDRE)), ['Commandes : AF · Économie']);
  assert.deepEqual(noms(P.chercher(ELEMENTS, 'tx/bc', ORDRE)), ['Commandes : TX · Business'], 'le code de la commande');
  assert.deepEqual(noms(P.chercher(ELEMENTS, 'lecture', ORDRE)), ['Gestes : Rejouer la journée'], 'un mot qui l’accompagne');
  assert.deepEqual(P.chercher(ELEMENTS, 'montage zzz', ORDRE), [], 'un mot qui ne répond pas : rien');
});

test('au plus `max` par groupe, les meilleurs', () => {
  const beaucoup = Array.from({ length: 20 }, (_, i) => ({ groupe: 'Équipes', nom: 'Équipe ' + i }));
  const r = P.chercher(beaucoup, 'equipe', { max: 5 });
  assert.equal(r[0].elements.length, 5);
  assert.deepEqual(r[0].elements.map(e => e.nom), ['Équipe 0', 'Équipe 1', 'Équipe 2', 'Équipe 3', 'Équipe 4'], 'à valeur égale, l’ordre donné');
});

test('surligner : ce qui répond, échappé', () => {
  assert.equal(P.surligner('Montage AF', 'af'), 'Montage <mark>AF</mark>', 'le début d’un mot d’abord');
  assert.equal(P.surligner('Services et équipes', 'equi'), 'Services et <mark>équi</mark>pes', 'sans accents');
  assert.equal(P.surligner('AF · Économie', 'af eco'), '<mark>AF</mark> · <mark>Éco</mark>nomie');
  assert.equal(P.surligner('<b>&', 'b'), '&lt;<mark>b</mark>&gt;&amp;', 'jamais de HTML venu du nom');
  assert.equal(P.surligner('Montage', ''), 'Montage');
});

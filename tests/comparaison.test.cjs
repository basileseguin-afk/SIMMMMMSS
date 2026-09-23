/* Comparer deux scénarios du modèle par ateliers. La journée est déjà
 * calculée : capturer ne relance rien, cela fige réglages et résultats. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../comparaison.js');
const P = require('../moteur/production.js');
const { VOLS } = require('../vols-demo.js');

const atelier = personnes => ({ id: 'cu', nom: 'Cuisine', service: 'cuisine', type: 'manuel',
  debut: '04:00', jour: 0, personnes, lots: [['AF/BC'], ['AF/YC']] });
const scenario = (personnes, source) => {
  const ateliers = [atelier(personnes)];
  const reglages = { rendement: 1, delaiChargement: 45 };
  const r = P.simuler({ vols: VOLS, ateliers, liaisons: [], ...reglages });
  return C.capturer(r, { source: source || 'démo', ateliers, reglages, liaisons: [] });
};

test('une capture fige les réglages et ce qu’ils ont donné', () => {
  const a = scenario(4);
  assert.equal(a.ateliers, 1);
  assert.equal(a.personnes, 4);
  assert.equal(a.rendement, 100);
  assert.equal(a.delai, 45);
  assert.ok(a.suivies > 0, 'des classes sont suivies');
  assert.ok(a.absentes > 0, 'le programme porte des classes que personne ne fabrique');
});

test('mêmes réglages, mêmes chiffres : la note le dit', () => {
  const a = scenario(4), b = scenario(4);
  assert.deepEqual(a, b, 'aucun aléa');
  assert.match(C.note(a, b), /identiques/);
  assert.ok(C.lignes(a, b).every(l => !l.diff));
});

test('plus de monde en cuisine : B fait mieux, et le tableau le dit en mots', () => {
  const a = scenario(1), b = scenario(12);
  assert.match(C.note(a, b), /seul ce que vous avez changé/);
  const par = Object.fromEntries(C.lignes(a, b).map(l => [l.lib, l]));
  assert.equal(par['Personnes au travail'].diff, true);
  assert.equal(par['Personnes au travail'].verdict, '', 'un réglage n’est ni mieux ni moins bien');
  assert.equal(par['Dernière commande prête'].verdict, 'mieux', 'on finit plus tôt');
  assert.equal(par['Commandes sans équipe'].diff, false);
});

test('deux programmes de vols différents sont signalés', () => {
  assert.match(C.note(scenario(4, 'a.csv'), scenario(4, 'b.csv')), /pas sur les mêmes vols/);
});

test('une seule capture ne se compare à rien', () => {
  const l = C.lignes(scenario(4), null);
  assert.ok(l.every(x => x.b === '—' && !x.diff && !x.verdict));
  assert.match(C.note(scenario(4), null), /retenez l’essai B/);
  assert.match(C.note(null, null), /essai A/);
});

test('le jeu de démonstration a le format de l’import', () => {
  assert.ok(VOLS.length >= 12);
  for (const v of VOLS) {
    assert.ok(v.id && v.cie && ['DEP', 'RET'].includes(v.sens));
    assert.ok(Number.isFinite(v.sens === 'DEP' ? v.std : v.sta));
  }
  assert.ok(VOLS.some(v => v.crew > 0 && v.spml > 0), 'équipage et repas spéciaux présents');
  assert.ok(Object.isFrozen(VOLS) && Object.isFrozen(VOLS[0]), 'on ne modifie pas la démo par mégarde');
});

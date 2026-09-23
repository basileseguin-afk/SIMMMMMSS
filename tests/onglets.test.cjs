/* Les sous-onglets : chaque vue se découpe en quelques pages courtes. Ce qui
 * compte ici, c'est la carte des onglets et la règle qui masque les autres. */
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../onglets.js');

test('chaque vue a entre deux et cinq onglets, le premier par défaut', () => {
  for (const vue of ['vols', 'ateliers', 'reglages', 'plan', 'flux']) {
    const l = O.ONGLETS[vue];
    assert.ok(l && l.length >= 2 && l.length <= 5, vue + ' : ' + (l || []).length + ' onglets');
    assert.equal(O.defaut(vue), l[0].id);
    for (const o of l) assert.ok(o.nom && o.ico, o.id + ' a un nom et un pictogramme');
  }
  assert.equal(O.defaut('inconnue'), null);
});

test('les identifiants sont uniques et désignent leur vue', () => {
  const ids = Object.values(O.ONGLETS).flat().map(o => o.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(O.vueDe('at-equipes'), 'ateliers');
  assert.equal(O.vueDe('j-comparer'), 'plan');
  assert.equal(O.vueDe('u-sauvegarde'), 'flux');
  assert.equal(O.vueDe('rien'), null);
});

test('la règle masque, dans un onglet, ce qui appartient aux autres', () => {
  const r = O.regles();
  for (const o of Object.values(O.ONGLETS).flat())
    assert.ok(r.includes(`body[data-sous="${o.id}"] [data-sous]:not([data-sous~="${o.id}"]){display:none!important}`), o.id);
});

test('les pictogrammes des onglets existent', () => {
  const I = require('../icones.js');
  for (const o of Object.values(O.ONGLETS).flat()) assert.ok(I.TRAITS[o.ico], o.id + ' : ' + o.ico);
});

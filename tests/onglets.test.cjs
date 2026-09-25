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

/* Le menu : quatre parties par nature, et chaque page dans une seule. */
test('chaque page est dans une seule partie, et toutes les pages ont une partie', () => {
  const pages = O.PARTIES.flatMap(p => p.pages.map(x => x.id));
  assert.equal(new Set(pages).size, pages.length, 'aucune page en double');
  assert.deepEqual([...pages].sort(), Object.values(O.ONGLETS).flat().map(o => o.id).sort(), 'aucune page oubliée');
  assert.deepEqual(O.PARTIES.filter(p => !p.cache).map(p => p.nom), ['Données', 'Organisation', 'Réglages', 'Résultats']);
  for (const p of O.PARTIES) for (const x of O.pagesDe(p.id)) {
    assert.ok(x.nom && x.ico && x.vue, x.id);
    assert.ok(x.intro && x.intro.length > 20, x.id + ' : une phrase');
  }
});

test('une page se range selon sa nature, pas selon l’écran qui la porte', () => {
  const partie = id => O.partieDe(id).id;
  // Ce qu'on importe.
  assert.equal(partie('v-programme'), 'donnees');
  assert.equal(partie('rg-minutes'), 'donnees');
  // Ce qu'on décrit.
  for (const id of ['at-chemins', 'at-equipes', 'at-grille', 'u-services', 'u-liens', 'u-lecture']) assert.equal(partie(id), 'organisation', id);
  // Ce qu'on essaie.
  assert.equal(partie('v-horaires'), 'reglages');
  assert.equal(partie('rg-rythme'), 'reglages');
  // Ce qu'on observe : même quand l'écran vit dans la vue des vols ou des équipes.
  for (const id of ['j-chiffres', 'j-plan', 'at-planning', 'at-repas', 'v-departs', 'j-stocks', 'j-comparer'])
    assert.equal(partie(id), 'resultats', id);
  assert.equal(O.pagesDe('resultats')[0].id, 'j-chiffres', 'les résultats commencent par la synthèse');
  assert.equal(O.defaut('plan'), 'j-plan', 'arriver « sur le plan », c’est arriver sur la carte');
  assert.equal(O.partieDe('rien'), null);
  assert.equal(O.page('rien'), null);
});

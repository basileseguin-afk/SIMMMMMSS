/* Les sous-onglets : chaque vue se découpe en quelques pages courtes. Ce qui
 * compte ici, c'est la carte des onglets et la règle qui masque les autres. */
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../onglets.js');

test('chaque vue a au moins deux onglets, le premier par défaut ; une partie du menu, huit pages au plus', () => {
  // Ce qu'on voit, ce sont les pages d'une PARTIE du menu, pas les onglets d'une
  // vue : c'est sur elles que porte la limite.
  for (const p of O.PARTIES.filter(x => !x.cache)) assert.ok(p.pages.length <= 8, p.id + ' : ' + p.pages.length + ' pages');
  for (const vue of ['vols', 'ateliers', 'reglages', 'plan', 'flux']) {
    const l = O.ONGLETS[vue];
    assert.ok(l && l.length >= 2, vue + ' : ' + (l || []).length + ' onglets');
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

/* Le menu : cinq parties, un sujet chacune, et chaque page dans une seule (05/10). */
test('chaque page est dans une seule partie, et toutes les pages ont une partie', () => {
  const pages = O.PARTIES.flatMap(p => p.pages.map(x => x.id));
  assert.equal(new Set(pages).size, pages.length, 'aucune page en double');
  assert.deepEqual([...pages].sort(), Object.values(O.ONGLETS).flat().map(o => o.id).sort(), 'aucune page oubliée');
  assert.deepEqual(O.PARTIES.filter(p => !p.cache).map(p => p.nom), ['Vols', 'Chemins', 'Équipes', 'Simulation', 'Résultats']);
  for (const p of O.PARTIES) for (const x of O.pagesDe(p.id)) {
    assert.ok(x.nom && x.ico && x.vue, x.id);
    assert.ok(x.intro && x.intro.length > 20, x.id + ' : une phrase');
  }
});

test('une page se range selon sa nature, pas selon l’écran qui la porte', () => {
  const partie = id => O.partieDe(id).id;
  // Ce qu'on importe.
  assert.equal(partie('v-programme'), 'donnees');
  assert.equal(partie('v-planche'), 'donnees');
  // Par où passe chaque commande : les chemins (05/10).
  for (const id of ['mu-flux', 'at-chemins', 'u-liens']) assert.equal(partie(id), 'chemins', id);
  assert.equal(O.pagesDe('chemins')[0].id, 'mu-flux', 'les chemins commencent par les flux');
  // Qui prépare quoi, quand, en combien de temps : les équipes.
  for (const id of ['mu-services', 'at-recap', 'rg-recap', 'u-services', 'at-equipes', 'rg-minutes']) assert.equal(partie(id), 'organisation', id);
  assert.equal(O.pagesDe('organisation')[0].id, 'mu-services', 'les équipes commencent par les services');
  // Plus de partie cachée « Outils avancés » : les outils fins suivent leur sujet, après « Plus ».
  assert.equal(O.PARTIES.find(p => p.id === 'avance'), undefined);
  for (const id of ['u-liens', 'u-services', 'at-equipes', 'rg-minutes', 'u-lecture']) assert.equal(O.page(id).plus, true, id);
  for (const p of O.PARTIES) {
    const l = p.pages.map(x => !!x.plus);
    assert.deepEqual(l, [...l].sort(), p.id + ' : les pages « Plus » viennent après les principales');
    assert.ok(!l[0], p.id + ' : une partie commence par une page principale');
  }
  // Suivre une commande étape par étape est un résultat : il est dans le menu.
  assert.equal(partie('at-grille'), 'resultats');
  // Vérifier, régler, lancer : la simulation, qui commence par « Prêt à simuler ? ».
  for (const id of ['mu-pas', 'rg-simulation', 'u-lecture']) assert.equal(partie(id), 'reglages', id);
  assert.equal(O.pagesDe('reglages')[0].id, 'mu-pas');
  // Ce qu'on essaie.
  assert.equal(partie('rg-simulation'), 'reglages');
  // Ce qu'on observe : même quand l'écran vit dans la vue des vols ou des équipes.
  for (const id of ['j-chiffres', 'j-plan', 'at-planning', 'at-repas', 'at-grille', 'v-departs', 'j-stocks', 'j-comparer'])
    assert.equal(partie(id), 'resultats', id);
  assert.equal(O.pagesDe('resultats')[0].id, 'j-chiffres', 'les résultats commencent par la synthèse');
  assert.equal(O.defaut('plan'), 'j-plan', 'arriver « sur le plan », c’est arriver sur la carte');
  assert.equal(O.partieDe('rien'), null);
  assert.equal(O.page('rien'), null);
});

/* La version 2 suit la même organisation, avec le calage et le budget en plus. */
test('v2 : la même organisation, chaque page dans une seule partie', () => {
  delete require.cache[require.resolve('../v2/onglets.js')];
  const V = require('../v2/onglets.js');
  const pages = V.PARTIES.flatMap(p => p.pages.map(x => x.id));
  assert.equal(new Set(pages).size, pages.length, 'aucune page en double');
  assert.deepEqual([...pages].sort(), Object.values(V.ONGLETS).flat().map(o => o.id).sort(), 'aucune page oubliée');
  assert.deepEqual(V.PARTIES.filter(p => !p.cache).map(p => p.nom), ['Vols', 'Chemins', 'Équipes', 'Simulation', 'Résultats', 'Budget']);
  for (const id of ['mu-pas', 'rg-simulation', 'rg-calage', 'u-lecture']) assert.equal(V.partieDe(id).id, 'reglages', id);
  for (const id of ['mu-flux', 'at-chemins', 'u-liens']) assert.equal(V.partieDe(id).id, 'chemins', id);
  for (const p of O.PARTIES) {
    const w = V.PARTIES.find(x => x.id === p.id);
    for (const x of p.pages) assert.equal(!!(w.pages.find(y => y.id === x.id) || {}).plus, !!x.plus, x.id + ' : rangé pareil en v1 et v2');
  }
});

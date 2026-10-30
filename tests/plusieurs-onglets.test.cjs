/* Banc d'essai, correction 14 (a) — plusieurs onglets ne s'écrasent plus
 * (stockage.js ; docs/BANC_ESSAI.md § 11). Les données du site portent un
 * numéro de révision, augmenté à chaque écriture ; un onglet n'écrit que si
 * la révision enregistrée est celle qu'il a lue, sinon il n'écrit rien et le
 * dit. Ici, le garde seul, sur un stockage simulé : deux gardes sur le même
 * stockage sont deux onglets, sans événement `storage` (le test navigateur
 * plusieurs-onglets-browser.cjs fait le reste). Clés et valeurs fictives. */
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../stockage.js');

/** Un `localStorage` en mémoire : les cinq gestes et `length`. */
function stockage(depart = {}) {
  const m = new Map(Object.entries(depart));
  const s = {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (s.plein) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    key: i => [...m.keys()][i] ?? null,
    clear: () => m.clear(),
    contenu: () => Object.fromEntries(m)
  };
  Object.defineProperty(s, 'length', { get: () => m.size });
  return s;
}
const onglet = vrai => { const vu = []; const g = G.creerGarde(vrai, { surRetard: () => vu.push(1) }); g.vu = vu; return g; };

test('les données du site : les clés « ory-… » et « orly-… », hors préférences d’affichage, hors révision, hors version 2', () => {
  for (const k of ['ory-ateliers-v1', 'orly-plan-v3', 'orly-plan-v3-backup', 'orly-flows-v1', 'ory-modele-v1', 'ory-graphes-v1', 'ory-calage-v1', 'ory-ateliers-v1-avant-fonte'])
    assert.equal(G.estDonnee(k), true, k);
  for (const k of ['ory-ui-theme', 'ory-ui-en-ce-moment', 'ory-menu-pages', 'ory-menu-pages-vues', 'ory-graphes-sens', 'ory-service-ouvert',
    'ory-demarrage-en-cours', G.REVISION, 'ory-v2:ory-ateliers-v1', 'ory-v2:__copie-de-la-v1', 'autre-site', null])
    assert.equal(G.estDonnee(k), false, String(k));
  // L'événement `storage` d'un autre onglet : une donnée, la révision, ou tout effacé (clé nulle).
  assert.deepEqual([G.concerne('ory-ateliers-v1'), G.concerne(G.REVISION), G.concerne(null), G.concerne('ory-ui-theme'), G.concerne('ory-v2:orly-plan-v3')],
    [true, true, true, false, false]);
});

test('un seul onglet : les mêmes données qu’en écrivant directement, champ par champ, plus le numéro de révision', () => {
  const gestes = s => {
    s.setItem('ory-ateliers-v1', '{"a":1}'); s.setItem('orly-plan-v3', '{"p":1}'); s.setItem('ory-ui-theme', 'sombre');
    s.setItem('orly-plan-v3-backup', '{"p":1}'); s.setItem('orly-plan-v3', '{"p":2}'); s.removeItem('ory-ui-theme');
    s.setItem('ory-modele-v1', 12); s.removeItem('ory-ateliers-v1'); s.setItem('autre-site', 'x');
  };
  const direct = stockage({ 'ory-graphes-v1': '{}' }), vrai = stockage({ 'ory-graphes-v1': '{}' }), g = onglet(vrai);
  gestes(direct); gestes(g.stockage);
  const { [G.REVISION]: revision, ...donnees } = vrai.contenu();
  assert.deepEqual(donnees, direct.contenu());
  assert.equal(revision, '6', 'six écritures de données (un effacement en est une) : la révision part de rien et compte chacune');
  assert.equal(g.revision(), '6');
  assert.deepEqual([g.enRetard(), g.vu.length], [false, 0]);
  // Le garde se lit comme le stockage : getItem, key, length.
  assert.deepEqual([g.stockage.getItem('ory-modele-v1'), g.stockage.length, g.stockage.key(0)], ['12', vrai.length, vrai.key(0)]);
});

test('réécrire la même valeur n’est pas une écriture : la révision ne bouge pas, les autres onglets ne sont pas dérangés', () => {
  const vrai = stockage(), a = onglet(vrai);
  a.stockage.setItem('ory-ateliers-v1', '{"a":1}');
  const b = onglet(vrai);
  a.stockage.setItem('ory-ateliers-v1', '{"a":1}'); a.stockage.removeItem('ory-modele-v1');
  assert.equal(vrai.getItem(G.REVISION), '1');
  b.stockage.setItem('ory-ateliers-v1', '{"a":2}');
  assert.deepEqual([b.enRetard(), vrai.getItem('ory-ateliers-v1')], [false, '{"a":2}']);
});

test('deux onglets : A écrit, puis B resté sur l’ancien état n’écrit rien et le dit, même sans événement', () => {
  const vrai = stockage({ 'ory-ateliers-v1': '{"v":0}' }), a = onglet(vrai), b = onglet(vrai);
  a.stockage.setItem('ory-ateliers-v1', '{"v":"A"}');
  b.stockage.setItem('ory-ateliers-v1', '{"v":"B"}');
  assert.equal(vrai.getItem('ory-ateliers-v1'), '{"v":"A"}', 'la modification de A reste');
  assert.deepEqual([b.enRetard(), b.vu.length > 0], [true, true]);
  // Plus rien de B ne passe, même sur une autre clé, ni un effacement.
  b.stockage.setItem('orly-flows-v1', '{"f":1}'); b.stockage.removeItem('ory-ateliers-v1'); b.stockage.clear();
  assert.deepEqual(vrai.contenu(), { 'ory-ateliers-v1': '{"v":"A"}', [G.REVISION]: '1' });
  // Ses préférences d'affichage, elles, s'enregistrent toujours.
  b.stockage.setItem('ory-ui-theme', 'sombre');
  assert.equal(vrai.getItem('ory-ui-theme'), 'sombre');
  // A, lui, continue : il a lu la révision qu'il a écrite.
  a.stockage.setItem('ory-ateliers-v1', '{"v":"A2"}');
  assert.deepEqual([a.enRetard(), vrai.getItem('ory-ateliers-v1'), vrai.getItem(G.REVISION)], [false, '{"v":"A2"}', '2']);
  // Un onglet ouvert ensuite (B rechargé) lit la dernière révision, et écrit.
  const b2 = onglet(vrai);
  b2.stockage.setItem('ory-ateliers-v1', '{"v":"B2"}');
  assert.deepEqual([b2.enRetard(), vrai.getItem('ory-ateliers-v1')], [false, '{"v":"B2"}']);
});

test('sans événement, le retard se lit aussi à la révision enregistrée : avant d’écrire, ou en le demandant', () => {
  const vrai = stockage(), a = onglet(vrai), b = onglet(vrai);
  a.stockage.setItem('ory-ateliers-v1', '{"v":"A"}');
  assert.deepEqual([b.vu.length, b.enRetard(), b.vu.length > 0], [0, true, true], 'demandé, B se sait en retard et le dit');
});

test('tout effacer ne fait pas revenir un numéro déjà lu : un onglet qui l’avait lu reste en retard', () => {
  const vrai = stockage(), x = onglet(vrai);
  x.stockage.setItem('ory-ateliers-v1', '{}');
  const y = onglet(vrai);
  y.stockage.clear(); y.stockage.setItem('ory-modele-v1', '{}');
  assert.equal(vrai.getItem(G.REVISION), '2', 'au-dessus de la dernière lue (1), pas 1 à nouveau');
  assert.equal(x.enRetard(), true);
});

test('l’événement d’un autre onglet : le retard est su tout de suite, avant toute modification', () => {
  const vrai = stockage(), b = onglet(vrai);
  b.signaler();
  assert.deepEqual([b.enRetard(), b.vu.length], [true, 1]);
  b.stockage.setItem('ory-modele-v1', '{}');
  assert.equal(vrai.getItem('ory-modele-v1'), null);
});

test('un stockage plein : l’erreur remonte comme avant, rien n’est écrit, la révision ne bouge pas', () => {
  const vrai = stockage({ 'ory-ateliers-v1': '{"v":0}' }), a = onglet(vrai);
  vrai.plein = true;
  assert.throws(() => a.stockage.setItem('ory-ateliers-v1', '{"v":1}'), /Quota/);
  assert.deepEqual([vrai.getItem('ory-ateliers-v1'), vrai.getItem(G.REVISION), a.revision(), a.enRetard()], ['{"v":0}', null, null, false]);
  vrai.plein = false;
  a.stockage.setItem('ory-ateliers-v1', '{"v":1}');
  assert.equal(vrai.getItem(G.REVISION), '1');
});

test('tout effacer (un seul onglet) : comme avant, le stockage est vide ; l’onglet continue d’écrire', () => {
  const vrai = stockage({ 'ory-ateliers-v1': '{}', 'ory-ui-theme': 'sombre' }), a = onglet(vrai);
  a.stockage.setItem('ory-modele-v1', '{}');
  a.stockage.clear();
  assert.deepEqual(vrai.contenu(), {});
  a.stockage.setItem('ory-modele-v1', '{}');
  assert.deepEqual([vrai.getItem(G.REVISION), a.enRetard()], ['2', false]);
});

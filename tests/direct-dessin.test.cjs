/* Évolution 16 (g) — le dessin d'une étiquette de la vue en direct (v1), sans
 * navigateur : son trait et son cartouche se dessinent en deux passes, pour que
 * la scène trace tous les traits d'abord, puis tous les cartouches — aucun trait
 * ne passe alors sur une étiquette (un défaut que les captures de contrôle ont
 * montré). Rien que du dessin : aucune donnée. */
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../direct-dessin.js');

/** Un contexte de canvas qui note ce qu'on lui demande, dans l'ordre. */
function contexte() {
  const appels = [];
  const noter = nom => (...a) => { appels.push([nom, ...a]); };
  const ctx = { appels, measureText: t => ({ width: String(t).length * 6 }) };
  for (const nom of ['beginPath', 'moveTo', 'lineTo', 'stroke', 'fill', 'roundRect', 'rect', 'fillText']) ctx[nom] = noter(nom);
  return ctx;
}
const STYLE = { fond: '#fff', bordure: '#888', titre: '#111', texte: '#333', epaisseur: 1 };
const MESURES = { titre: 12, ligne: 11, marge: 6, interligne: 15 };
/** Une étiquette posée loin de son ancre : elle a un trait. */
const LOIN = { x: 100, y: 40, w: 120, h: 44, ax: 300, ay: 200, titre: 'Service fictif', lignes: ['2 au travail / 3 présents'] };
/** Une étiquette posée sur son ancre : pas de trait. */
const SUR = { ...LOIN, ax: 160, ay: 84 };
const noms = ctx => ctx.appels.map(a => a[0]);

test('par défaut, une étiquette dessine son trait puis son cartouche, comme avant', () => {
  const ctx = contexte();
  G.etiquette(ctx, LOIN, STYLE, MESURES);
  const n = noms(ctx);
  assert.deepEqual(ctx.appels.find(a => a[0] === 'moveTo'), ['moveTo', 160, 84], 'le trait part du bas du cartouche, en son milieu');
  assert.deepEqual(ctx.appels.find(a => a[0] === 'lineTo'), ['lineTo', 300, 200], 'jusqu’à son ancre');
  assert.ok(n.indexOf('lineTo') < n.indexOf('roundRect'), 'le trait avant le cartouche');
  assert.deepEqual(ctx.appels.filter(a => a[0] === 'fillText').map(a => a[1]), ['Service fictif', '2 au travail / 3 présents']);
});

test('la passe « trait » ne dessine que le trait ; la passe « cartouche », que le cartouche', () => {
  const trait = contexte(), cartouche = contexte();
  G.etiquette(trait, LOIN, STYLE, MESURES, 'trait');
  assert.deepEqual(noms(trait), ['beginPath', 'moveTo', 'lineTo', 'stroke']);
  G.etiquette(cartouche, LOIN, STYLE, MESURES, 'cartouche');
  assert.ok(!noms(cartouche).includes('moveTo') && !noms(cartouche).includes('lineTo'), 'pas de trait');
  assert.ok(noms(cartouche).includes('roundRect') && noms(cartouche).includes('fill'));
  assert.equal(cartouche.appels.filter(a => a[0] === 'fillText').length, 2);
  // Les deux passes ensemble : les mêmes appels que le dessin d'un coup.
  const ensemble = contexte();
  G.etiquette(ensemble, LOIN, STYLE, MESURES);
  assert.deepEqual([...trait.appels, ...cartouche.appels], ensemble.appels);
});

test('une étiquette posée sur son ancre n’a pas de trait, à aucune passe', () => {
  const trait = contexte(), tout = contexte();
  G.etiquette(trait, SUR, STYLE, MESURES, 'trait');
  assert.deepEqual(trait.appels, []);
  G.etiquette(tout, SUR, STYLE, MESURES);
  assert.ok(!noms(tout).includes('lineTo') && noms(tout).includes('roundRect'));
});

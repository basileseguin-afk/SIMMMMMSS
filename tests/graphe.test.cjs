/* Le diagramme de nœuds : sa disposition automatique et ce qu'il retient. */
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../graphe.js');

const N = ids => ids.map(id => ({ id }));
const Lk = paires => paires.map(([de, vers]) => ({ de, vers }));

test('les nœuds se rangent en colonnes, dans le sens du flux', () => {
  const p = G.disposer(N(['a', 'b', 'c', 'x']), Lk([['a', 'b'], ['b', 'c'], ['x', 'c']]));
  assert.ok(p.a.x < p.b.x && p.b.x < p.c.x, 'a, puis b, puis c');
  assert.equal(p.x.x, p.a.x, 'un nœud sans amont est dans la première colonne');
  // Deux nœuds d'une même colonne ne se chevauchent pas.
  assert.ok(Math.abs(p.a.y - p.x.y) >= G.H);
});

test('un nœud qui reçoit plusieurs liens se met au milieu de ses amonts', () => {
  const p = G.disposer(N(['h', 'm', 'b', 'j']), Lk([['h', 'j'], ['m', 'j'], ['b', 'j']]));
  assert.equal(p.j.y, p.m.y);
});

test('un long lien réserve un couloir : les nœuds ne se posent pas dessus', () => {
  const p = G.disposer(N(['a', 'b', 'c', 'd', 'z']), Lk([['a', 'b'], ['b', 'c'], ['c', 'z'], ['d', 'z']]));
  const couloir = p.via['d>z'];
  assert.equal(couloir.length, 2, 'd saute deux colonnes');
  for (const q of couloir) for (const id of ['b', 'c']) {
    if (p[id].x !== q.x) continue;
    assert.ok(Math.abs(p[id].y - q.y) >= 38, id + ' s’écarte du couloir');
  }
  assert.deepEqual(Object.keys(p), ['a', 'b', 'c', 'd', 'z'], 'les couloirs ne sont pas des nœuds');
});

test('une boucle (un retour) ne fait pas déborder la disposition', () => {
  const ids = ['quais', 'plonge', 'dotation', 'prepa'];
  const p = G.disposer(N(ids), Lk([['quais', 'plonge'], ['plonge', 'dotation'], ['dotation', 'prepa'], ['prepa', 'quais']]));
  const colonnes = new Set(ids.map(id => p[id].x));
  assert.equal(colonnes.size, 4, 'quatre colonnes, pas plus');
});

test('un lien est une courbe de la droite de A à la gauche de B, par ses couloirs', () => {
  const k = G.courbe({ x: 0, y: 0 }, { x: 500, y: 100 });
  assert.match(k.d, /^M200,26 C/);
  const v = G.courbe({ x: 0, y: 0 }, { x: 520, y: 0 }, [{ x: 260, y: 38 }]);
  assert.match(v.d, / L460,64 /, 'un trait droit à travers la colonne sautée');
});

test('les dispositions retenues se relisent, le reste est écarté', () => {
  assert.deepEqual(G.validerPositions({ 'chemin:x': { a: { x: 10.4, y: '20' }, b: { x: 'n' }, c: null } }),
    { 'chemin:x': { a: { x: 10, y: 20 } } });
  assert.throws(() => G.validerPositions([]), /invalides/);
});

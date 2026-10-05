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

/* En étapes (05/10) : de haut en bas, une branche se range juste au-dessus de
 * celui qu'elle livre, un service relié à rien se met à part. */
test('en étapes : de haut en bas, une étape par profondeur', () => {
  const p = G.disposer(N(['a', 'b', 'c', 'x']), Lk([['a', 'b'], ['b', 'c'], ['x', 'c']]), { sens: 'bas' });
  assert.ok(p.a.y < p.b.y && p.b.y < p.c.y, 'a, puis b, puis c, vers le bas');
  assert.deepEqual([p.etape.a, p.etape.b, p.etape.c], [0, 1, 2]);
  // x ne livre que c : il descend à l'étape juste avant c, à côté de b, sans le chevaucher.
  assert.equal(p.etape.x, 1);
  assert.equal(p.x.y, p.b.y);
  assert.ok(Math.abs(p.x.x - p.b.x) >= G.L, 'côte à côte');
});

test('en étapes : une branche longue descend jusqu’à son arrivée', () => {
  // appros → légumerie → cuisine → préparation → montage ; plonge → dotation → montage
  const ids = ['appros', 'decontam', 'cuisine', 'preparation', 'prepa', 'plonge', 'dotation'];
  const p = G.disposer(N(ids), Lk([['appros', 'decontam'], ['decontam', 'cuisine'], ['cuisine', 'preparation'], ['preparation', 'prepa'],
    ['plonge', 'dotation'], ['dotation', 'prepa']]), { sens: 'bas' });
  assert.equal(p.etape.dotation, p.etape.preparation, 'la dotation, à l’étape d’avant le montage');
  assert.equal(p.etape.plonge, p.etape.cuisine, 'la plonge, juste au-dessus');
  assert.equal(Object.keys(p.via).length, 0, 'aucun trait ne saute d’étape');
});

test('en étapes : un service relié à rien se range à part, tout en bas', () => {
  const p = G.disposer(N(['a', 'b', 'seul']), Lk([['a', 'b']]), { sens: 'bas' });
  assert.deepEqual(p.isoles, ['seul']);
  assert.ok(p.seul.y > p.b.y);
  // Sans aucun lien, il n'y a pas de « à part » : tout est au même rang.
  assert.deepEqual(G.disposer(N(['u', 'v']), [], { sens: 'bas' }).isoles, []);
});

test('en étapes : un lien va du bas de A au haut de B, à angle droit', () => {
  // Tout droit quand B est juste en dessous.
  assert.equal(G.courbe({ x: 0, y: 0 }, { x: 0, y: 224 }, null, true).d, 'M' + G.L / 2 + ',' + G.H + ' V218');
  // Sinon : on descend, on tourne entre les deux étapes, on redescend — sans diagonale.
  const k = G.courbe({ x: 0, y: 0 }, { x: 300, y: 112 }, null, true);
  assert.match(k.d, /^M100,52 V\d+ Q100,\d+ 110,\d+ H390 Q400,\d+ 400,\d+ V106$/);
  assert.doesNotMatch(k.d, / C/, 'pas de courbe en biais');
  // Chaque trait arrive à sa place sur le bord du service.
  assert.match(G.courbe({ x: 0, y: 0 }, { x: 0, y: 224 }, null, true, { d0: -20, d1: 20 }).d, /^M80,52 .* 120,\d+ V218$/);
});

test('en étapes : la plus longue chaîne descend tout droit', () => {
  // appros → légumerie → cuisine → montage → départ ; magasin et dotation livrent le montage.
  const ids = ['appros', 'decontam', 'cuisine', 'prepa', 'handling', 'magasin', 'dotation'];
  const p = G.disposer(N(ids), Lk([['appros', 'decontam'], ['decontam', 'cuisine'], ['cuisine', 'prepa'], ['prepa', 'handling'],
    ['magasin', 'prepa'], ['dotation', 'prepa']]), { sens: 'bas' });
  assert.deepEqual(p.dos, ['appros', 'decontam', 'cuisine', 'prepa', 'handling']);
  assert.equal(new Set(p.dos.map(id => p[id].x)).size, 1, 'une seule colonne pour toute la chaîne');
  // Les branches, de part et d'autre, sur l'étape d'avant le montage, sans se chevaucher.
  for (const id of ['magasin', 'dotation']) {
    assert.equal(p[id].y, p.cuisine.y);
    assert.ok(Math.abs(p[id].x - p.cuisine.x) >= G.L, id);
  }
});

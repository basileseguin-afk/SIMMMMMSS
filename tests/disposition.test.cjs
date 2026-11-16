/* Évolution 20 (b) — la disposition du site : l'utilisateur dit où va chaque
 * zone (moteur/disposition.js, v1). Des colonnes, de gauche à droite, chacune
 * avec ses zones de haut en bas ; puis des rangées du bas, chacune avec une
 * zone et les colonnes qu'elle longe. Les tailles viennent des surfaces : le
 * site reste un rectangle sans trou, chaque zone a exactement sa surface.
 * Sans navigateur : le module ne lit qu'un réglage et des surfaces.
 * Les rectangles attendus sont calculés à la main. Zones fictives. */
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../moteur/disposition.js');

const proche = (a, b, mot) => assert.ok(Math.abs(a - b) < 1e-6, (mot || '') + ' : ' + a + ' ≠ ' + b);
const rect = (z, attendu, mot) => { for (const k of ['x', 'y', 'w', 'h']) proche(z[k], attendu[k], mot + '.' + k); };
const aire = r => r.w * r.h;
const disjoints = l => l.every((a, i) => l.every((b, j) => j <= i || a.x + a.w <= b.x + 1e-6 || b.x + b.w <= a.x + 1e-6 || a.y + a.h <= b.y + 1e-6 || b.y + b.h <= a.y + 1e-6));
/** Le tracé est un rectangle sans trou ni chevauchement : les zones et les allées le remplissent exactement. */
function sansTrou(t, mot) {
  const tout = [...t.zones.values(), ...t.allees];
  assert.ok(disjoints(tout), mot + ' : ni zone ni allée ne se chevauchent');
  assert.ok(tout.every(r => r.x >= -1e-6 && r.y >= -1e-6 && r.x + r.w <= t.largeur + 1e-6 && r.y + r.h <= t.profondeur + 1e-6 && r.w > 0 && r.h > 0), mot + ' : tout est dans le site');
  proche(tout.reduce((s, r) => s + aire(r), 0), t.largeur * t.profondeur, mot + ' : pas de trou');
}

// Quatre colonnes et deux rangées du bas, dont une (la plonge) ne longe que les deux premières colonnes.
const QUATRE = { colonnes: [['cuisine', 'patisserie'], ['food'], ['armement', 'dotation'], ['magasin']], rangees: [{ zone: 'plonge', de: 1, a: 2 }, { zone: 'quai', de: 1, a: 4 }] };
const SURFACES = new Map(Object.entries({ cuisine: 202.5, patisserie: 150, food: 387.75, plonge: 172.5, armement: 216, dotation: 144, magasin: 315, quai: 360 }));

test('quatre colonnes et deux rangées du bas, dont une ne longe que deux colonnes : les rectangles calculés à la main', () => {
  /* À la main, pour un site de 60 m de large et des allées de 1,5 m :
   *  - en haut, l'allée de l'entrée : 60 × 1,5 ;
   *  - tout en bas, le quai longe les quatre colonnes : 360 m² sur 60 m, donc 6 m de haut, sous son allée de 1,5 m ;
   *  - au-dessus, trois blocs côte à côte, de la même hauteur H : [colonnes 1 et 2 sur la plonge], colonne 3, colonne 4.
   *    Une colonne de surface A prend 1,5 m d'allée et A / H de large : la colonne 3 (216 + 144 = 360) et la colonne 4 (315) ;
   *    le bloc de gauche, de largeur w : la plonge y fait 172,5 / w de haut sous 1,5 m d'allée, et ses deux colonnes
   *    (202,5 + 150 = 352,5 et 387,75) se partagent w sur la hauteur qui reste.
   *    Avec H = 30 : colonne 3 = 1,5 + 12, colonne 4 = 1,5 + 10,5, il reste w = 60 − 13,5 − 12 = 34,5 ; la plonge fait
   *    172,5 / 34,5 = 5 m de haut, les deux colonnes ont 30 − 5 − 1,5 = 23,5 m : 1,5 + 352,5 / 23,5 = 16,5 et
   *    1,5 + 387,75 / 23,5 = 18, soit 34,5 : le compte y est.
   *  - le site fait donc 1,5 + 30 + 1,5 + 6 = 39 m de profondeur. */
  const t = D.tracer(QUATRE, SURFACES, 60);
  proche(t.largeur, 60, 'largeur'); proche(t.profondeur, 39, 'profondeur');
  assert.deepEqual(t.notes, []);
  const attendus = {
    cuisine: { x: 1.5, y: 1.5, w: 15, h: 13.5 }, patisserie: { x: 1.5, y: 15, w: 15, h: 10 }, food: { x: 18, y: 1.5, w: 16.5, h: 23.5 },
    plonge: { x: 0, y: 26.5, w: 34.5, h: 5 }, armement: { x: 36, y: 1.5, w: 12, h: 18 }, dotation: { x: 36, y: 19.5, w: 12, h: 12 },
    magasin: { x: 49.5, y: 1.5, w: 10.5, h: 30 }, quai: { x: 0, y: 33, w: 60, h: 6 } };
  assert.deepEqual([...t.zones.keys()].sort(), Object.keys(attendus).sort());
  for (const [id, r] of Object.entries(attendus)) rect(t.zones.get(id), r, id);
  // Les allées : celle de l'entrée, une à gauche de chaque colonne, une au-dessus de chaque rangée du bas.
  const allees = [{ x: 0, y: 0, w: 60, h: 1.5 }, { x: 0, y: 1.5, w: 1.5, h: 23.5 }, { x: 16.5, y: 1.5, w: 1.5, h: 23.5 }, { x: 0, y: 25, w: 34.5, h: 1.5 },
    { x: 34.5, y: 1.5, w: 1.5, h: 30 }, { x: 48, y: 1.5, w: 1.5, h: 30 }, { x: 0, y: 31.5, w: 60, h: 1.5 }];
  assert.equal(t.allees.length, allees.length);
  allees.forEach((r, i) => rect(t.allees[i], r, 'allée ' + i));
  assert.deepEqual(t.allees.map(a => a.sens), ['h', 'v', 'v', 'h', 'v', 'v', 'h']);
  // Pas de trou, pas de chevauchement ; la somme des surfaces des zones égale celle qu'on a donnée ; chaque zone a la sienne.
  sansTrou(t, 'quatre colonnes');
  proche([...t.zones.values()].reduce((s, z) => s + aire(z), 0), 1947.75, 'la somme des surfaces');
  for (const [id, z] of t.zones) proche(aire(z), SURFACES.get(id), 'la surface de ' + id);
  // Chaque zone ouvre sur une allée : une zone d'une colonne à sa gauche, une rangée du bas au-dessus d'elle.
  assert.deepEqual([t.zones.get('cuisine').ouvert, t.zones.get('quai').ouvert], ['gauche', 'haut']);
  proche(t.zones.get('cuisine').porte.x, 1.5, 'la porte de la cuisine, x'); proche(t.zones.get('cuisine').porte.y, 8.25, 'la porte de la cuisine, y');
  proche(t.zones.get('quai').porte.x, 30, 'la porte du quai, x'); proche(t.zones.get('quai').porte.y, 33, 'la porte du quai, y');
  assert.deepEqual([t.zones.get('food').colonne, t.zones.get('plonge').rangee, 'colonne' in t.zones.get('plonge')], [1, true, false]);
  // Une colonne qu'aucune rangée ne longerait descend jusqu'en bas du site : sans le quai, les colonnes 3 et 4 vont au bord.
  const sansQuai = D.tracer({ colonnes: QUATRE.colonnes, rangees: [QUATRE.rangees[0]] }, SURFACES, 60);
  proche(sansQuai.zones.get('magasin').y + sansQuai.zones.get('magasin').h, sansQuai.profondeur, 'la colonne 4 jusqu’en bas');
  proche(sansQuai.zones.get('plonge').y + sansQuai.zones.get('plonge').h, sansQuai.profondeur, 'la plonge aussi');
  sansTrou(sansQuai, 'sans le quai');
  // Deux tracés des mêmes réglages sont identiques ; les réglages ne sont pas touchés.
  const avant = JSON.stringify(QUATRE);
  assert.deepEqual(D.tracer(JSON.parse(avant), SURFACES, 60), t);
  assert.equal(JSON.stringify(QUATRE), avant);
});

test('les tailles suivent les surfaces : des colonnes seules, une rangée sur toute la largeur, une autre largeur', () => {
  // Trois colonnes, sans rangée : chaque colonne a 1,5 m d'allée, et sa largeur suit la somme des surfaces de ses zones.
  const S = new Map(Object.entries({ a: 100, b: 300, c: 200, d: 200 })), t = D.tracer({ colonnes: [['a', 'b'], ['c'], ['d']], rangees: [] }, S, 44.5);
  // 44,5 − 3 × 1,5 = 40 m de zones pour 800 m² : 20 m de haut ; les colonnes font 20, 10 et 10 m.
  proche(t.profondeur, 21.5, 'profondeur');
  rect(t.zones.get('a'), { x: 1.5, y: 1.5, w: 20, h: 5 }, 'a'); rect(t.zones.get('b'), { x: 1.5, y: 6.5, w: 20, h: 15 }, 'b');
  rect(t.zones.get('c'), { x: 23, y: 1.5, w: 10, h: 20 }, 'c'); rect(t.zones.get('d'), { x: 34.5, y: 1.5, w: 10, h: 20 }, 'd');
  sansTrou(t, 'trois colonnes');
  // La même, avec une rangée du bas sur toute la largeur : elle prend sa surface sur 44,5 m ; les colonnes ne changent pas de largeur.
  const r = D.tracer({ colonnes: [['a', 'b'], ['c'], ['d']], rangees: [{ zone: 'q', de: 1, a: 3 }] }, new Map([...S, ['q', 89]]), 44.5);
  rect(r.zones.get('q'), { x: 0, y: 23, w: 44.5, h: 2 }, 'q');
  rect(r.zones.get('c'), { x: 23, y: 1.5, w: 10, h: 20 }, 'c');
  proche(r.profondeur, 25, 'profondeur');
  sansTrou(r, 'avec une rangée');
  // Plus large, le site est moins profond : les surfaces ne changent pas.
  const large = D.tracer(QUATRE, SURFACES, 80);
  assert.ok(large.profondeur < 39);
  for (const [id, z] of large.zones) proche(aire(z), SURFACES.get(id), 'à 80 m, la surface de ' + id);
  sansTrou(large, 'à 80 m');
  // Une autre largeur d'allée.
  const fines = D.tracer(QUATRE, SURFACES, 60, 1);
  for (const [id, z] of fines.zones) proche(aire(z), SURFACES.get(id), 'allées de 1 m, la surface de ' + id);
  assert.ok(fines.allees.every(a => Math.abs((a.sens === 'v' ? a.w : a.h) - 1) < 1e-9));
  sansTrou(fines, 'allées de 1 m');
});

test('une zone oubliée, une zone en double, une zone qui n’existe plus : la disposition s’accorde au site, en le disant', () => {
  const zones = ['cuisine', 'patisserie', 'food', 'plonge', 'armement', 'dotation', 'magasin', 'quai'];
  // Rien à dire : la disposition cite chaque zone une fois.
  assert.deepEqual(D.accorder(QUATRE, zones), { ...QUATRE, notes: [] });
  // Une zone oubliée (un service ajouté après) : à la fin de la dernière colonne, et c'est dit.
  const oubliee = D.accorder(QUATRE, [...zones, 'controle']);
  assert.deepEqual(oubliee.colonnes[3], ['magasin', 'controle']);
  assert.deepEqual(oubliee.notes, [{ code: 'absente', zone: 'controle' }]);
  // Une zone citée deux fois : sa première place est gardée, l'autre ignorée, et c'est dit. Une zone qui n'existe plus : ignorée, et c'est dit.
  const double = D.accorder({ colonnes: [['cuisine', 'food'], ['food', 'cuisine', 'disparue'], ['magasin']], rangees: [{ zone: 'quai', de: 1, a: 3 }, { zone: 'magasin', de: 1, a: 2 }, { zone: 'fantome', de: 1, a: 1 }] }, ['cuisine', 'food', 'magasin', 'quai']);
  assert.deepEqual(double.colonnes, [['cuisine', 'food'], [], ['magasin']]);
  assert.deepEqual(double.rangees, [{ zone: 'quai', de: 1, a: 3 }]);
  assert.deepEqual(double.notes, [{ code: 'double', zone: 'food' }, { code: 'double', zone: 'cuisine' }, { code: 'inconnue', zone: 'disparue' }, { code: 'double', zone: 'magasin' }, { code: 'inconnue', zone: 'fantome' }]);
  // Sans colonne du tout, une zone oubliée en fait une.
  assert.deepEqual(D.accorder({ colonnes: [], rangees: [{ zone: 'quai', de: 1, a: 1 }] }, ['quai', 'cuisine']).colonnes, [['cuisine']]);
  // Le tracé d'une disposition accordée a toutes les zones du site, et elles seules.
  const t = D.tracer(oubliee, new Map([...SURFACES, ['controle', 80]]), 60);
  assert.deepEqual([...t.zones.keys()].sort(), [...zones, 'controle'].sort());
  sansTrou(t, 'une zone oubliée');
});

test('sans disposition : vide, c’est la disposition automatique ; une disposition lue est remise en forme', () => {
  for (const rien of [null, undefined, {}, { colonnes: [], rangees: [] }, { colonnes: [[], []], rangees: [] }, 'x', 7, [], { colonnes: 'a', rangees: 3 }]) {
    assert.equal(D.vide(D.lire(rien)), true, JSON.stringify(rien));
    assert.equal(D.lire(rien), null, JSON.stringify(rien));
  }
  assert.equal(D.vide(QUATRE), false);
  // Des valeurs illisibles sont retirées ; les rangs d'une rangée sont bornés aux colonnes, `de` avant `a`.
  const lue = D.lire({ colonnes: [['a', 7, null, '', 'b'], 'x', ['c']], rangees: [{ zone: 'q', de: 0, a: 9 }, { zone: 'r', de: 3, a: 1 }, { zone: 's' }, { de: 1, a: 2 }, null, { zone: 't', de: 'x', a: '2' }], autre: 1 });
  assert.deepEqual(lue, { colonnes: [['a', 'b'], [], ['c']], rangees: [{ zone: 'q', de: 1, a: 3 }, { zone: 'r', de: 3, a: 3 }, { zone: 's', de: 1, a: 3 }, { zone: 't', de: 1, a: 2 }] });
  // Les colonnes vides sont gardées (on vient d'en ajouter une) ; une disposition relue est la même.
  assert.deepEqual(D.lire(JSON.parse(JSON.stringify(lue))), lue);
  // Des noms de clés d'objet : des zones comme les autres.
  assert.deepEqual(D.lire(JSON.parse('{"colonnes":[["__proto__","constructor"]],"rangees":[]}')).colonnes, [['__proto__', 'constructor']]);
  assert.equal(D.lire({ colonnes: Array.from({ length: 60 }, (_, i) => ['z' + i]), rangees: [] }).colonnes.length, D.MAX.colonnes);
});

test('les rangées du bas : la plus large est la plus basse ; deux rangées qui se chevauchent sans se contenir, la seconde est réduite, et c’est dit', () => {
  const S = new Map(Object.entries({ a: 100, b: 100, c: 100, d: 100, p: 60, q: 120, r: 60 }));
  const cols = [['a'], ['b'], ['c'], ['d']];
  // La liste se lit de haut en bas ; une rangée large listée au-dessus d'une étroite passe quand même dessous.
  const bon = D.tracer({ colonnes: cols, rangees: [{ zone: 'p', de: 1, a: 2 }, { zone: 'q', de: 1, a: 4 }] }, S, 50), inverse = D.tracer({ colonnes: cols, rangees: [{ zone: 'q', de: 1, a: 4 }, { zone: 'p', de: 1, a: 2 }] }, S, 50);
  assert.deepEqual(inverse.notes, []);
  for (const id of S.keys()) if (bon.zones.has(id)) rect(inverse.zones.get(id), bon.zones.get(id), id);
  assert.ok(bon.zones.get('q').y > bon.zones.get('p').y, 'la plus large est la plus basse');
  sansTrou(bon, 'large sous étroite');
  // `ranger` remet la liste dans l'ordre où le site la trace.
  assert.deepEqual(D.ranger({ colonnes: cols, rangees: [{ zone: 'q', de: 1, a: 4 }, { zone: 'p', de: 1, a: 2 }] }).rangees.map(x => x.zone), ['p', 'q']);
  // Deux rangées de même largeur l'une sur l'autre : dans l'ordre de la liste.
  const meme = D.tracer({ colonnes: cols, rangees: [{ zone: 'p', de: 1, a: 4 }, { zone: 'q', de: 1, a: 4 }] }, S, 50);
  assert.ok(meme.zones.get('p').y < meme.zones.get('q').y);
  sansTrou(meme, 'deux rangées de même largeur');
  // Deux rangées côte à côte (colonnes 1–2 et 3–4) : toutes deux au bord du bas.
  const cote = D.tracer({ colonnes: cols, rangees: [{ zone: 'p', de: 1, a: 2 }, { zone: 'r', de: 3, a: 4 }] }, S, 50);
  proche(cote.zones.get('p').y + cote.zones.get('p').h, cote.profondeur, 'p au bord'); proche(cote.zones.get('r').y + cote.zones.get('r').h, cote.profondeur, 'r au bord');
  sansTrou(cote, 'deux rangées côte à côte');
  // Trois niveaux : 1–2 sur 1–3 sur 1–4.
  const trois = D.tracer({ colonnes: cols, rangees: [{ zone: 'p', de: 1, a: 2 }, { zone: 'r', de: 1, a: 3 }, { zone: 'q', de: 1, a: 4 }] }, S, 50);
  assert.ok(trois.zones.get('p').y < trois.zones.get('r').y && trois.zones.get('r').y < trois.zones.get('q').y);
  for (const [id, z] of trois.zones) proche(aire(z), S.get(id), 'trois niveaux, la surface de ' + id);
  sansTrou(trois, 'trois niveaux');
  // Un chevauchement sans inclusion (1–3 et 2–4) ne peut pas faire deux rectangles : la dernière de la liste (2–4) est la plus
  // basse ; l'autre est réduite aux colonnes où elle repose à plat — ici 2 et 3, sur l'autre —, et la disposition le dit.
  const croise = { colonnes: cols, rangees: [{ zone: 'p', de: 1, a: 3 }, { zone: 'q', de: 2, a: 4 }] }, t = D.tracer(croise, S, 50);
  assert.deepEqual(t.notes, [{ code: 'reduite', zone: 'p', de: 2, a: 3 }]);
  rect({ x: t.zones.get('p').x, w: t.zones.get('p').w, y: 0, h: 0 }, { x: t.zones.get('b').x - 1.5, w: t.zones.get('b').w + t.zones.get('c').w + 3, y: 0, h: 0 }, 'p sous les colonnes 2 et 3');
  for (const [id, z] of t.zones) proche(aire(z), S.get(id), 'croisées, la surface de ' + id);
  sansTrou(t, 'deux rangées croisées');
  assert.deepEqual(D.ranger(croise).rangees, [{ zone: 'p', de: 2, a: 3 }, { zone: 'q', de: 2, a: 4 }]);
  assert.deepEqual(D.tracer(D.ranger(croise), S, 50).notes, [], 'rangée, elle n’a plus rien à dire');
});

test('des cas limites : une seule colonne, des rangées seules, des colonnes vides, une surface nulle', () => {
  const S = new Map(Object.entries({ a: 120, b: 80, q: 50 }));
  const une = D.tracer({ colonnes: [['a', 'b']], rangees: [] }, S, 21.5);
  rect(une.zones.get('a'), { x: 1.5, y: 1.5, w: 20, h: 6 }, 'a'); rect(une.zones.get('b'), { x: 1.5, y: 7.5, w: 20, h: 4 }, 'b');
  sansTrou(une, 'une colonne');
  // Des rangées seules : des bandes sur toute la largeur, sous l'allée de l'entrée, chacune sous son allée.
  const seules = D.tracer({ colonnes: [], rangees: [{ zone: 'a', de: 1, a: 1 }, { zone: 'b', de: 1, a: 1 }] }, S, 20);
  rect(seules.zones.get('a'), { x: 0, y: 3, w: 20, h: 6 }, 'a'); rect(seules.zones.get('b'), { x: 0, y: 10.5, w: 20, h: 4 }, 'b');
  proche(seules.profondeur, 14.5, 'profondeur');
  sansTrou(seules, 'des rangées seules');
  // Une colonne vide ne prend ni place ni allée ; une rangée qui ne longe que des colonnes vides longe tout.
  const vides = D.tracer({ colonnes: [[], ['a'], [], ['b'], []], rangees: [{ zone: 'q', de: 1, a: 1 }] }, S, 23);
  assert.equal(vides.allees.filter(a => a.sens === 'v').length, 2);
  rect(vides.zones.get('q'), { x: 0, w: 23, y: vides.zones.get('q').y, h: 50 / 23 }, 'q');
  sansTrou(vides, 'des colonnes vides');
  // Une rangée qui longe les colonnes 3 à 5 (dont une seule, la 4, a une zone) : sous la colonne 4.
  const partielle = D.tracer({ colonnes: [[], ['a'], [], ['b'], []], rangees: [{ zone: 'q', de: 3, a: 5 }] }, S, 23);
  proche(partielle.zones.get('q').x, partielle.zones.get('b').x - 1.5, 'q sous la colonne 4');
  proche(partielle.zones.get('a').y + partielle.zones.get('a').h, partielle.profondeur, 'la colonne 2 jusqu’en bas');
  sansTrou(partielle, 'une rangée sous une colonne');
  // Rien du tout : la seule allée de l'entrée.
  const rien = D.tracer({ colonnes: [], rangees: [] }, S, 20);
  assert.deepEqual([rien.zones.size, rien.allees.length, rien.profondeur], [0, 1, 1.5]);
});

test('sur 300 dispositions tirées d’une graine fixe : un rectangle sans trou, chaque zone à sa surface', () => {
  let graine = 20261118;
  const alea = () => { graine = (graine * 1664525 + 1013904223) >>> 0; return graine / 4294967296; }, entier = (a, b) => a + Math.floor(alea() * (b - a + 1));
  for (let i = 0; i < 300; i++) {
    const n = entier(1, 6), zones = Array.from({ length: entier(1, 14) }, (_, k) => 'z' + k), S = new Map(zones.map(z => [z, entier(20, 400)]));
    const d = { colonnes: Array.from({ length: n }, () => []), rangees: [] };
    for (const z of zones) { if (alea() < 0.25) { const de = entier(1, n); d.rangees.push({ zone: z, de, a: entier(de, n) }); } else d.colonnes[entier(0, n - 1)].push(z); }
    const largeur = entier(40, 90), t = D.tracer(d, S, largeur), mot = 'disposition ' + i;
    assert.deepEqual([...t.zones.keys()].sort(), zones.slice().sort(), mot + ' : toutes les zones');
    sansTrou(t, mot);
    for (const [id, z] of t.zones) proche(aire(z), S.get(id), mot + ' : la surface de ' + id);
    // Chaque porte est au bord d'une allée.
    for (const z of t.zones.values()) assert.ok(t.allees.some(a => z.porte.x >= a.x - 1e-6 && z.porte.x <= a.x + a.w + 1e-6 && z.porte.y >= a.y - 1e-6 && z.porte.y <= a.y + a.h + 1e-6), mot + ' : une porte sur une allée');
    // Rangée, la disposition donne le même tracé, sans rien à dire.
    const rangee = D.tracer(D.ranger(d), S, largeur);
    assert.deepEqual(rangee.notes, [], mot + ' : rangée, rien à dire');
    for (const [id, z] of t.zones) rect(rangee.zones.get(id), z, mot + ' : ' + id);
    assert.deepEqual(D.tracer(JSON.parse(JSON.stringify(d)), S, largeur), t, mot + ' : deux tracés identiques');
  }
});

test('les gestes du panneau : déplacer une zone, la mettre en rangée du bas, ajouter et retirer une colonne', () => {
  const d0 = { colonnes: [['a', 'b'], ['c'], ['d']], rangees: [] }, avant = JSON.stringify(d0);
  assert.deepEqual([D.placeDe(d0, 'b'), D.placeDe(d0, 'd'), D.placeDe(d0, 'x')], [{ colonne: 0, rang: 1 }, { colonne: 2, rang: 0 }, null]);
  // Monter, descendre : dans la colonne ; au bout, rien ne change.
  assert.deepEqual(D.decaler(d0, 'b', -1).colonnes, [['b', 'a'], ['c'], ['d']]);
  assert.deepEqual(D.decaler(d0, 'a', +1).colonnes, [['b', 'a'], ['c'], ['d']]);
  assert.deepEqual(D.decaler(d0, 'a', -1), d0);
  assert.deepEqual(D.decaler(d0, 'b', +1), d0);
  // Colonne précédente, colonne suivante : à la fin de la colonne voisine ; au bord, rien ne change.
  assert.deepEqual(D.changerDeColonne(d0, 'a', +1).colonnes, [['b'], ['c', 'a'], ['d']]);
  assert.deepEqual(D.changerDeColonne(d0, 'd', -1).colonnes, [['a', 'b'], ['c', 'd'], []]);
  assert.deepEqual(D.changerDeColonne(d0, 'a', -1), d0);
  assert.deepEqual(D.changerDeColonne(d0, 'd', +1), d0);
  // Poser à un rang donné (un glisser-déposer) : dans une autre colonne, ou plus bas dans la sienne.
  assert.deepEqual(D.mettre(d0, 'd', 0, 1).colonnes, [['a', 'd', 'b'], ['c'], []]);
  assert.deepEqual(D.mettre(d0, 'a', 0, 2).colonnes, [['b', 'a'], ['c'], ['d']]);
  assert.deepEqual(D.mettre(d0, 'b', 0, 0).colonnes, [['b', 'a'], ['c'], ['d']]);
  assert.deepEqual(D.mettre(d0, 'c', 9).colonnes, [['a', 'b'], [], ['d', 'c']]);
  // En rangée du bas : elle quitte sa colonne, longe toutes les colonnes ; on règle de quelle colonne à quelle colonne.
  const r1 = D.enRangee(d0, 'd');
  assert.deepEqual(r1, { colonnes: [['a', 'b'], ['c'], []], rangees: [{ zone: 'd', de: 1, a: 3 }] });
  assert.deepEqual(D.placeDe(r1, 'd'), { rangee: 0 });
  assert.deepEqual(D.longer(r1, 'd', 2, 2).rangees, [{ zone: 'd', de: 2, a: 2 }]);
  assert.deepEqual(D.longer(r1, 'd', 3, 1).rangees, [{ zone: 'd', de: 1, a: 3 }], 'à l’envers : remis dans l’ordre');
  assert.deepEqual(D.longer(r1, 'd', 0, 9).rangees, [{ zone: 'd', de: 1, a: 3 }], 'borné aux colonnes');
  // Une seconde rangée, plus étroite, ajoutée sous l'autre : elle passe au-dessus (la plus large est la plus basse ; la
  // liste se lit de haut en bas) ; la descendre n'y change rien.
  const trois = { colonnes: [['a'], ['b'], ['e']], rangees: [{ zone: 'd', de: 1, a: 3 }] }, r2 = D.enRangee(trois, 'c', 1, 2);
  assert.deepEqual(r2.rangees, [{ zone: 'c', de: 1, a: 2 }, { zone: 'd', de: 1, a: 3 }]);
  assert.deepEqual(D.decaler(r2, 'c', +1), r2, 'une rangée étroite ne passe pas sous une large');
  // Deux rangées de même largeur s'échangent.
  const r3 = D.longer(r2, 'c', 1, 3);
  assert.deepEqual(r3.rangees.map(x => x.zone), ['c', 'd']);
  assert.deepEqual(D.decaler(r3, 'c', +1).rangees.map(x => x.zone), ['d', 'c']);
  assert.deepEqual(D.decaler(r3, 'd', -1).rangees.map(x => x.zone), ['d', 'c']);
  // Une rangée qui ne longe que des colonnes vides longe tout : sa largeur est celle des colonnes qui ont une zone.
  assert.deepEqual(D.enRangee(r1, 'c', 1, 2).rangees, [{ zone: 'd', de: 1, a: 3 }, { zone: 'c', de: 1, a: 2 }]);
  // Une rangée revient dans une colonne.
  assert.deepEqual(D.mettre(r1, 'd', 2), d0);
  // Ajouter une colonne, à droite ; retirer une colonne vide — une colonne qui a une zone ne se retire pas.
  const plus = D.ajouterColonne(d0);
  assert.deepEqual(plus.colonnes, [['a', 'b'], ['c'], ['d'], []]);
  assert.deepEqual(D.retirerColonne(plus, 3), d0);
  assert.deepEqual(D.retirerColonne(plus, 0), plus);
  assert.deepEqual(D.retirerColonne(plus, 9), plus);
  // Retirer une colonne vide au milieu : les rangées suivent les colonnes qui restent.
  const milieu = { colonnes: [['a'], [], ['c'], ['d']], rangees: [{ zone: 'q', de: 3, a: 4 }, { zone: 'r', de: 1, a: 2 }] };
  assert.deepEqual(D.retirerColonne(milieu, 1), { colonnes: [['a'], ['c'], ['d']], rangees: [{ zone: 'r', de: 1, a: 1 }, { zone: 'q', de: 2, a: 3 }] });
  // Aucun geste ne touche la disposition qu'on lui donne.
  assert.equal(JSON.stringify(d0), avant);
});

test('le point de départ : la disposition qui ressemble aux deux bandes du site automatique', () => {
  // Première bande : m, c, q de gauche à droite ; seconde bande : a sous m et c (plus sous c), p sous q.
  const site = { zones: [{ id: 'q', bande: 0, x: 30, w: 10 }, { id: 'm', bande: 0, x: 0, w: 10 }, { id: 'c', bande: 0, x: 10, w: 20 }, { id: 'p', bande: 1, x: 24, w: 16 }, { id: 'a', bande: 1, x: 0, w: 24 }] };
  assert.deepEqual(D.depuisLeSite(site), { colonnes: [['m'], ['c', 'a'], ['q', 'p']], rangees: [] });
  // Une seule bande : une colonne par zone. Sans zone : rien.
  assert.deepEqual(D.depuisLeSite({ zones: [{ id: 'b', bande: 0, x: 5, w: 5 }, { id: 'a', bande: 0, x: 0, w: 5 }] }), { colonnes: [['a'], ['b']], rangees: [] });
  assert.deepEqual(D.depuisLeSite({ zones: [] }), { colonnes: [], rangees: [] });
  assert.deepEqual(D.depuisLeSite(null), { colonnes: [], rangees: [] });
});

test('au plus quatre niveaux de rangées emboîtées : une rangée de trop redevient une zone de colonne, et c’est dit ; le tracé reste rapide', () => {
  // Six colonnes, six rangées en escalier (1–6, 1–5, 1–4, 1–3, 1–2, 1–1) : six niveaux. Les deux plus hautes sont de trop.
  const cols = [['a'], ['b'], ['c'], ['d'], ['e'], ['f']], S = new Map('abcdefghijkl'.split('').map(z => [z, 100]));
  const d = { colonnes: cols, rangees: ['g', 'h', 'i', 'j', 'k', 'l'].map((zone, n) => ({ zone, de: 1, a: 1 + n })) };   // de haut en bas : g (1–1) … l (1–6)
  assert.deepEqual(D.arbreDe(d).posees.map(r => [r.zone, r.niveau]), [['l', 1], ['k', 2], ['j', 3], ['i', 4], ['h', 5], ['g', 6]]);
  const b = D.borner(d);
  assert.deepEqual(b.notes, [{ code: 'niveaux', zone: 'h' }, { code: 'niveaux', zone: 'g' }]);
  assert.deepEqual([b.disposition.colonnes[5], b.disposition.rangees.map(r => r.zone)], [['f', 'h', 'g'], ['i', 'j', 'k', 'l']]);
  assert.equal(D.NIVEAUX, 4);
  // Le tracé le dit aussi, garde toutes les zones à leur surface, sans trou ; rangée, la disposition n'a plus rien à dire.
  const t = D.tracer(d, S, 80);
  assert.deepEqual(t.notes, b.notes);
  assert.equal(t.zones.size, 12);
  for (const [id, z] of t.zones) proche(aire(z), 100, 'la surface de ' + id);
  sansTrou(t, 'quatre niveaux');
  assert.deepEqual(D.tracer(D.ranger(d), S, 80).notes, []);
  assert.deepEqual(D.ranger(D.ranger(d)), D.ranger(d));
  // Des rangées de même largeur l'une sur l'autre ne font qu'un niveau : dix rangées sur toute la largeur restent des rangées.
  const pile = { colonnes: [['a'], ['b']], rangees: 'cdefghijkl'.split('').map(zone => ({ zone, de: 1, a: 2 })) };
  assert.deepEqual([D.borner(pile).notes, new Set(D.arbreDe(pile).posees.map(r => r.niveau)).size], [[], 1]);
  // Rapide, même au pire : trente colonnes, des rangées en escalier — quelques dizaines de millisecondes, pas des secondes.
  const larges = Array.from({ length: 30 }, (_, i) => ['c' + i]), escalier = Array.from({ length: 12 }, (_, n) => ({ zone: 'r' + n, de: 1, a: 30 - 2 * n }));
  const surfaces = new Map([...larges.flat(), ...escalier.map(r => r.zone)].map(z => [z, 150]));
  const debut = process.hrtime.bigint(), gros = D.tracer({ colonnes: larges, rangees: escalier }, surfaces, 180);
  const ms = Number(process.hrtime.bigint() - debut) / 1e6;
  assert.ok(ms < 2000, 'le tracé de trente colonnes et douze rangées en escalier prend ' + ms.toFixed(0) + ' ms');
  assert.equal(gros.notes.filter(n => n.code === 'niveaux').length, 8);
  sansTrou(gros, 'trente colonnes');
});

test('une largeur trop petite pour les allées, une surface nulle : le tracé reste un rectangle fini', () => {
  // Trente colonnes dans 20 m : la largeur ne descend pas sous la place des allées et d'un mètre de zone par colonne.
  const cols = Array.from({ length: 30 }, (_, i) => ['c' + i]), S = new Map(cols.flat().map(z => [z, 50]));
  const t = D.tracer({ colonnes: cols, rangees: [] }, S, 20);
  assert.equal(t.largeur, 30 * (D.ALLEE + 1));
  assert.ok(Number.isFinite(t.profondeur) && t.profondeur < 200, 'une profondeur raisonnable : ' + t.profondeur);
  sansTrou(t, 'trente colonnes dans 20 m');
  for (const largeur of [0, -5, NaN, undefined]) assert.ok(Number.isFinite(D.tracer({ colonnes: [['a']], rangees: [] }, new Map([['a', 40]]), largeur).profondeur), String(largeur));
  // Une zone sans surface (ou absente des surfaces) garde un rectangle ; les autres gardent la leur.
  const nulle = D.tracer({ colonnes: [['a', 'z'], ['b']], rangees: [{ zone: 'q', de: 1, a: 2 }, { zone: 'vide', de: 1, a: 1 }] }, new Map([['a', 100], ['b', 80], ['q', 50], ['z', 0]]), 40);
  for (const z of nulle.zones.values()) assert.ok([z.x, z.y, z.w, z.h].every(Number.isFinite) && z.w > 0 && z.h > 0);
  for (const id of ['a', 'b', 'q']) proche(aire(nulle.zones.get(id)), { a: 100, b: 80, q: 50 }[id], 'la surface de ' + id);
  sansTrou(nulle, 'une surface nulle');
});

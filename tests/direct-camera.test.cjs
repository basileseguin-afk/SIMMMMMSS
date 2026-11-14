/* Évolution 16 (b) — la caméra de la vue en direct (v1), sans navigateur.
 * Une projection orthogonale (sans fuite de perspective), une caméra qui tourne
 * autour du site, s'incline de 25° à 80°, se déplace et zoome ; « Tout voir »
 * fait tenir la scène entière dans la zone visible, à 24 px de ses bords, à
 * tout angle ; les objets se rangent du fond vers l'avant ; les murs dessinés
 * sont ceux du fond ; les étiquettes ne se recouvrent pas. Scènes fictives. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../direct-camera.js');

const proche = (a, b, mot, t = 1e-6) => assert.ok(Math.abs(a - b) < t, (mot || '') + ' : ' + a + ' ≠ ' + b);
const ECRANS = [{ w: 1280, h: 620 }, { w: 1920, h: 900 }, { w: 1280, h: 620, haut: 48, bas: 56 }];
// Une scène fictive : un site de 43 m sur 21, des étiquettes à 2,8 m.
const SCENE = { x0: -7, y0: 0, x1: 36, y1: 21, h: 2.8 };

test('à l’angle de la maquette, la projection est celle de la maquette : isométrique, de trois quarts', () => {
  const cam = C.camera({ zoom: 10 }), e = { w: 1000, h: 600 };
  assert.deepEqual([cam.cap, Math.round(cam.site * 1000) / 1000], [45, 35.264]);
  // La maquette : X = (x − y) × 0,866 × s ; Y = (x + y) × 0,5 × s − z × s. Ici s = zoom × cos 35,264°.
  const s = 10 * Math.cos(cam.site * Math.PI / 180), P = (x, y, z) => [500 + (x - y) * 0.8660254 * s, 300 + (x + y) * 0.5 * s - z * s];
  for (const [x, y, z] of [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [12, -3, 2.5], [-7, 20, 0.5]]) {
    const [X, Y] = C.projeter(cam, e, x, y, z), [mx, my] = P(x, y, z);
    proche(X, mx, 'X de ' + [x, y, z]); proche(Y, my, 'Y de ' + [x, y, z]);
  }
});

test('la projection à plusieurs angles : les axes tournent, la hauteur monte, le sol se retrouve', () => {
  const e = { w: 800, h: 600 }, vers = (cap, site, p) => C.projeter(C.camera({ cap, site, zoom: 10 }), e, ...p).map(v => Math.round(v * 1000) / 1000);
  const s80 = Math.sin(80 * Math.PI / 180), c80 = Math.cos(80 * Math.PI / 180);
  // Cap 0, presque à la verticale (80°) : x va vers la droite, y vers le bas de l'écran, la hauteur compte peu.
  assert.deepEqual(vers(0, 80, [1, 0, 0]), [410, 300]);
  assert.deepEqual(vers(0, 80, [0, 1, 0]), [400, Math.round((300 + 10 * s80) * 1000) / 1000]);
  assert.deepEqual(vers(0, 80, [0, 0, 1]), [400, Math.round((300 - 10 * c80) * 1000) / 1000]);
  // Cap 90 : x vient vers l'œil (le bas de l'écran), y part vers la gauche. Cap 180 : tout est retourné.
  assert.deepEqual(vers(90, 80, [1, 0, 0]), [400, Math.round((300 + 10 * s80) * 1000) / 1000]);
  assert.deepEqual(vers(90, 80, [0, 1, 0]), [390, 300]);
  assert.deepEqual(vers(180, 80, [1, 0, 0]), [390, 300]);
  // À 25° au-dessus de l'horizon, le sol s'écrase (sin 25°) et les hauteurs se voient (cos 25°).
  const bas = C.camera({ cap: 0, site: 25, zoom: 10 });
  proche(C.projeter(bas, e, 0, 1, 0)[1] - 300, 10 * Math.sin(25 * Math.PI / 180)); proche(300 - C.projeter(bas, e, 0, 0, 1)[1], 10 * Math.cos(25 * Math.PI / 180));
  // Le point du sol sous un pixel : l'inverse de la projection, à tout angle.
  for (const cap of [0, 45, 133, 270, 359]) for (const site of [25, 35, 60, 80]) {
    const cam = C.camera({ cap, site, zoom: 7.5, cx: 12, cy: -4 }), [X, Y] = C.projeter(cam, e, 31.5, 8.25, 0), p = C.auSol(cam, e, X, Y);
    proche(p.x, 31.5, 'x à ' + cap + '°/' + site + '°'); proche(p.y, 8.25, 'y à ' + cap + '°/' + site + '°');
  }
});

test('sans fuite de perspective : un objet a la même taille à l’écran partout dans la scène', () => {
  for (const cap of [0, 45, 200]) {
    const cam = C.camera({ cap, zoom: 12 }), e = { w: 1280, h: 620 };
    const taille = (x, y) => { const a = C.projeter(cam, e, x, y, 0), b = C.projeter(cam, e, x + 1, y + 0.5, 1.7); return [b[0] - a[0], b[1] - a[1]]; };
    const ici = taille(0, 0), loin = taille(140, -60);
    proche(ici[0], loin[0], 'largeur'); proche(ici[1], loin[1], 'hauteur');
  }
});

test('la caméra reste dans ses bornes : 360° de cap, de 25° à 80° de site', () => {
  assert.equal(C.tourner(C.camera({ cap: 350 }), 15).cap, 5);
  assert.equal(C.tourner(C.camera({ cap: 10 }), -15).cap, 355);
  assert.equal(C.incliner(C.camera({ site: 75 }), 10).site, 80);
  assert.equal(C.incliner(C.camera({ site: 30 }), -10).site, 25);
  assert.deepEqual([C.camera({ site: 5 }).site, C.camera({ site: 89 }).site, C.camera({ cap: -90 }).cap, C.camera({ cap: 725 }).cap], [25, 80, 270, 5]);
  // Une caméra illisible : celle de la maquette.
  assert.deepEqual(C.camera({ cap: 'x', site: NaN, zoom: -3 }), C.camera());
});

test('glisser déplace le sol sous le pointeur ; la molette zoome autour du pointeur', () => {
  const e = { w: 1280, h: 620 };
  for (const cap of [45, 120, 300]) {
    const cam = C.camera({ cap, site: 40, zoom: 9, cx: 15, cy: 8 });
    // Le point du sol saisi en (400, 300) est en (460, 345) après un glissement de (60, 45).
    const saisi = C.auSol(cam, e, 400, 300), apres = C.deplacer(cam, e, 60, 45), ou = C.projeter(apres, e, saisi.x, saisi.y, 0);
    proche(ou[0], 460, 'X'); proche(ou[1], 345, 'Y');
    // Le zoom garde le point sous le pointeur ; il change d'un facteur, dans ses bornes.
    const z = C.zoomer(cam, e, 1.25, 900, 200), sous = C.auSol(cam, e, 900, 200), ici = C.projeter(z, e, sous.x, sous.y, 0);
    proche(z.zoom, 9 * 1.25); proche(ici[0], 900, 'X du pointeur'); proche(ici[1], 200, 'Y du pointeur');
    assert.equal(C.zoomer(cam, e, 1e6).zoom, C.ZOOM_MAX); assert.equal(C.zoomer(cam, e, 1e-6).zoom, C.ZOOM_MIN);
    // Tourner garde le point du centre de l'écran.
    const t = C.tourner(cam, 90), centre = C.projeter(t, e, cam.cx, cam.cy, 0);
    proche(centre[0], 640); proche(centre[1], 310);
  }
});

test('« Tout voir » : la scène tient entière, à 24 px des bords, à l’angle de la maquette et à tout autre angle', () => {
  for (const e of ECRANS) {
    const v = C.visible(e);
    for (const cap of [45, 0, 90, 135, 200, 315]) for (const site of [25, C.SITE_MAQUETTE, 60, 80]) {
      const cam = C.cadrer(C.camera({ cap, site }), e, SCENE), b = C.emprise(cam, e, SCENE), mot = e.w + ' px, cap ' + cap + '°, site ' + Math.round(site) + '°';
      assert.ok(C.tient(cam, e, SCENE), mot + ' : la scène tient');
      // Au plus grand : elle touche la marge sur un côté au moins, et elle est centrée.
      const jeux = [b.x0 - v.x0 - C.MARGE, v.x1 - C.MARGE - b.x1, b.y0 - v.y0 - C.MARGE, v.y1 - C.MARGE - b.y1];
      assert.ok(jeux.every(j => j > -1e-6), mot + ' : dans la marge'); assert.ok(Math.min(...jeux) < 1e-6, mot + ' : au plus grand');
      proche(jeux[0], jeux[1], mot + ' : centrée en largeur'); proche(jeux[2], jeux[3], mot + ' : centrée en hauteur');
      // L'angle n'a pas changé.
      assert.deepEqual([cam.cap, cam.site], [cap, site]);
    }
  }
  // Une scène qui ne tenait pas ne tient qu'après le cadrage ; sans scène ou sans écran, la caméra ne bouge pas.
  const e = ECRANS[0], avant = C.camera({ zoom: 60 });
  assert.equal(C.tient(avant, e, SCENE), false);
  assert.deepEqual(C.cadrer(avant, e, null), avant); assert.deepEqual(C.cadrer(avant, { w: 0, h: 0 }, SCENE), avant);
});

test('les objets se dessinent du fond vers l’avant, pour l’angle courant', () => {
  const objets = [{ id: 'a', x: 0, y: 0, couche: 1 }, { id: 'b', x: 10, y: 0, couche: 1 }, { id: 'c', x: 0, y: 10, couche: 1 }, { id: 'd', x: 10, y: 10, couche: 1 }, { id: 'sol', x: 50, y: 50, couche: 0 }];
  const ids = cap => C.ordre(C.camera({ cap }), objets).map(o => o.id).join(' ');
  // À l'angle de la maquette, l'œil est du côté des grands x et des grands y : (0, 0) est au fond, (10, 10) devant.
  assert.equal(ids(45), 'sol a b c d');
  // Un demi-tour : (10, 10) est au fond, (0, 0) devant ; à égalité de profondeur, l'ordre donné. Le sol reste dessiné
  // d'abord, où qu'il soit.
  assert.equal(ids(225), 'sol d b c a');
  // Cap 0 : l'œil est du côté des grands y ; à égalité de profondeur, l'ordre donné.
  assert.equal(ids(0), 'sol a b c d');
  assert.equal(ids(90), 'sol a c b d');
  assert.equal(ids(180), 'sol c d a b');
  // Ce qui est dessiné après est plus bas à l'écran (plus près de l'œil) : l'ordre suit la projection.
  for (const cap of [10, 77, 140, 260, 333]) {
    const cam = C.camera({ cap, zoom: 10 }), e = { w: 800, h: 600 }, l = C.ordre(cam, objets.filter(o => o.couche));
    for (let i = 1; i < l.length; i++) assert.ok(C.projeter(cam, e, l[i].x, l[i].y, 0)[1] >= C.projeter(cam, e, l[i - 1].x, l[i - 1].y, 0)[1] - 1e-9, 'cap ' + cap);
  }
  // La liste donnée n'est pas touchée.
  assert.equal(objets[0].id, 'a');
});

test('une boîte longue se range par tronçons', () => {
  const t = C.decouper({ x: 2, y: 5, w: 9, d: 1 }, 2);
  assert.equal(t.length, 5);
  proche(t.reduce((s, x) => s + x.w * x.d, 0), 9, 'la surface');
  assert.deepEqual([t[0].x, t[0].y, t[4].x + t[4].w, t[4].d], [2, 5, 11, 1]);
  assert.equal(C.decouper({ x: 0, y: 0, w: 1.5, d: 0.5 }, 2).length, 1);
  assert.equal(C.decouper({ x: 0, y: 0, w: 4.1, d: 4.1 }, 2).length, 9);
});

test('les murs dessinés sont toujours ceux du fond, quel que soit l’angle', () => {
  const zone = { x0: 10, y0: 5, x1: 30, y1: 17 }, milieu = { x0: [10, 11], x1: [30, 11], y0: [20, 5], y1: [20, 17] }, e = { w: 1280, h: 620 };
  for (let cap = 0; cap < 360; cap += 7.5) {
    const cam = C.camera({ cap, zoom: 10, cx: 20, cy: 11 }), p = C.projecteur(cam, e), murs = C.mursDuFond(cam), centre = p.profondeur(20, 11);
    for (const cote of ['x0', 'x1', 'y0', 'y1']) {
      const loin = p.profondeur(...milieu[cote]) < centre - 1e-6;
      assert.equal(murs[cote], loin, 'cap ' + cap + '°, côté ' + cote + ' : dessiné si et seulement s’il est au fond');
      // Un mur du fond est plus haut à l'écran que le centre de la zone : il ne cache rien de ce qu'elle contient.
      if (murs[cote]) assert.ok(p.y(...milieu[cote], 0) < p.y(20, 11, 0), 'cap ' + cap + '°, côté ' + cote + ' : derrière');
    }
    // Jamais deux côtés opposés ; deux murs en général, un seul quand la caméra est dans l'axe.
    assert.equal(murs.x0 && murs.x1, false); assert.equal(murs.y0 && murs.y1, false);
    assert.equal(Object.values(murs).filter(Boolean).length, cap % 90 === 0 ? 1 : 2, 'cap ' + cap);
    // Les faces d'une boîte tournées vers l'œil sont les autres.
    const f = C.facesDevant(cam);
    for (const cote of ['x0', 'x1', 'y0', 'y1']) assert.equal(f[cote] && murs[cote], false);
  }
  assert.deepEqual(C.mursDuFond(C.camera()), { x0: true, x1: false, y0: true, y1: false });
});

test('d’un angle à l’autre : par le plus court chemin', () => {
  const a = C.camera({ cap: 350, site: 30, zoom: 10, cx: 0, cy: 0 }), b = C.camera({ cap: 20, site: 50, zoom: 40, cx: 8, cy: 4 });
  const m = C.entre(a, b, 0.5);
  assert.deepEqual([m.cap, m.site, m.zoom, m.cx, m.cy], [5, 40, 20, 4, 2]);
  assert.deepEqual(C.entre(a, b, 0), a); assert.deepEqual(C.entre(a, b, 1), b);
  assert.equal(C.entre(C.camera({ cap: 10 }), C.camera({ cap: 300 }), 0.5).cap, 335);
});

test('les étiquettes gardent leur taille et ne se recouvrent pas ; sans gêne, elles restent sur leur ancre', () => {
  const e = { w: 1280, h: 620 };
  // Trois ancres presque au même endroit, une quatrième à l'écart.
  const serrees = [{ id: 'a', ax: 300, ay: 200, w: 150, h: 40 }, { id: 'b', ax: 310, ay: 204, w: 170, h: 54 }, { id: 'c', ax: 305, ay: 198, w: 120, h: 40 }, { id: 'd', ax: 900, ay: 400, w: 140, h: 40 }];
  const p = C.placerEtiquettes(serrees, e);
  assert.deepEqual(C.recouvrements(p), []);
  assert.deepEqual(p.map(x => [x.id, x.w, x.h]), serrees.map(x => [x.id, x.w, x.h]), 'dans l’ordre donné, à leur taille');
  assert.deepEqual(p.find(x => x.id === 'd'), { id: 'd', x: 830, y: 360, w: 140, h: 40, ax: 900, ay: 400, decalee: false });
  assert.equal(p.filter(x => x.decalee).length, 2, 'deux des trois se décalent');
  for (const x of p) assert.ok(x.x >= 0 && x.y >= 0 && x.x + x.w <= e.w && x.y + x.h <= e.h, x.id + ' dans l’écran');
  // Le même résultat à chaque fois, quel que soit l'ordre donné.
  assert.deepEqual(C.placerEtiquettes(serrees, e), p);
  assert.deepEqual(C.placerEtiquettes(serrees.slice().reverse(), e).slice().reverse(), p);
  // Une ancre au bord : l'étiquette reste dans la zone visible, sous les commandes du haut.
  const bord = C.placerEtiquettes([{ id: 'x', ax: 10, ay: 20, w: 120, h: 40 }], { ...e, haut: 48 })[0];
  assert.deepEqual([bord.x, bord.y, bord.decalee], [0, 48, true]);
  // Vingt étiquettes sur une grille serrée : aucune n'en recouvre une autre.
  const grille = Array.from({ length: 20 }, (_, i) => ({ id: 'z' + i, ax: 200 + (i % 5) * 90, ay: 200 + Math.floor(i / 5) * 30, w: 150, h: 54 }));
  assert.deepEqual(C.recouvrements(C.placerEtiquettes(grille, e)), []);
  // Deux étiquettes qui se touchent sont dites.
  assert.deepEqual(C.recouvrements([{ id: 'p', x: 0, y: 0, w: 10, h: 10 }, { id: 'q', x: 5, y: 5, w: 10, h: 10 }, { id: 'r', x: 40, y: 0, w: 5, h: 5 }]), [['p', 'q']]);
});

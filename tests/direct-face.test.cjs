/* Correction 21 (b) — quand l'utilisateur a disposé les zones, la scène s'ouvre
 * comme il les a rangées. Dans « Disposer les zones », les colonnes vont « de
 * gauche à droite » ; la vue d'ouverture d'un site disposé le regarde donc de
 * face : les colonnes de gauche à droite, les rangées du bas en bas de l'écran,
 * de trois quarts haut (on voit encore les personnes et les chariots). Sans
 * disposition réglée, l'angle de la maquette, comme avant.
 * Sans navigateur. Unité fictive. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../direct-camera.js');
const D = require('../direct-scene.js');
const S = require('../moteur/site.js');
const { REGIME, NOMS, CHEMIN, UNITE } = require('./site-unites.cjs');

const ECRAN = { w: 1134, h: 560 };
const DISPOSITION = { colonnes: [['magasin'], ['cuisine'], ['food'], ['armement']], rangees: [{ zone: 'plonge', de: 1, a: 2 }, { zone: 'quais', de: 1, a: 4 }] };
const generer = plus => S.generer({ ateliers: UNITE(), noms: NOMS, parcours: CHEMIN, regime: REGIME, ...plus });
const zone = (site, id) => site.zones.find(z => z.id === id);
/** La caméra d'ouverture d'un site : son angle, la scène cadrée. */
const ouverte = site => C.cadrer(C.camera(C.ouverture(!!site.disposition)), ECRAN, D.boite(site, null));
const ecran = (cam, x, y, z = 0) => C.projeter(cam, ECRAN, x, y, z);
const centre = (cam, z) => ecran(cam, z.x + z.w / 2, z.y + z.h / 2);

test('l’angle d’ouverture : de face pour un site disposé, celui de la maquette sinon', () => {
  assert.deepEqual(C.ouverture(false), { cap: C.CAP_MAQUETTE, site: C.SITE_MAQUETTE });
  assert.deepEqual(C.ouverture(), { cap: 45, site: C.SITE_MAQUETTE }, 'sans rien dire : la maquette');
  assert.deepEqual(C.ouverture(true), { cap: C.CAP_DE_FACE, site: C.SITE_DE_FACE });
  assert.equal(C.CAP_DE_FACE, 0);
  // De trois quarts haut : plus haut que la maquette, dans les bornes de l'inclinaison, à deux pas du bouton « plus haut ».
  assert.ok(Math.abs(C.SITE_DE_FACE - (C.SITE_MAQUETTE + 2 * C.PAS_SITE)) < 1e-9 && C.SITE_DE_FACE > 50 && C.SITE_DE_FACE < 65 && C.SITE_DE_FACE < C.SITE_MAX);
  // Le site dit s'il est disposé : `disposition`.
  assert.equal('disposition' in generer(), false);
  assert.equal('disposition' in generer({ disposition: DISPOSITION }), true);
});

test('un site disposé, à l’ouverture : la première colonne à gauche de la dernière, les rangées du bas en bas de l’écran', () => {
  const site = generer({ disposition: DISPOSITION }), cam = ouverte(site);
  assert.deepEqual([cam.cap, Math.round(cam.site * 100) / 100], [0, 55.26]);
  // Les colonnes vont de gauche à droite, dans l'ordre où on les a rangées.
  const X = DISPOSITION.colonnes.map(c => centre(cam, zone(site, c[0]))[0]);
  for (let i = 1; i < X.length; i++) assert.ok(X[i] > X[i - 1] + 20, 'la colonne ' + (i + 1) + ' est à droite de la colonne ' + i + ' (' + X.map(Math.round).join(', ') + ')');
  // Une colonne est une bande verticale de l'écran : son bord gauche a la même abscisse en haut et en bas.
  for (const c of DISPOSITION.colonnes) { const z = zone(site, c[0]); assert.ok(Math.abs(ecran(cam, z.x, z.y)[0] - ecran(cam, z.x, z.y + z.h)[0]) < 1e-6, c[0] + ' : un bord vertical'); }
  // Une rangée du bas est sous les colonnes qu'elle longe ; la plus large, tout en bas.
  const bas = id => ecran(cam, 0, zone(site, id).y + zone(site, id).h)[1], haut = id => ecran(cam, 0, zone(site, id).y)[1];
  for (const id of ['magasin', 'cuisine']) assert.ok(haut('plonge') > bas(id), 'la plonge est sous ' + id);
  for (const id of ['magasin', 'cuisine', 'food', 'armement', 'plonge']) assert.ok(haut('quais') > bas(id) - 1e-6, 'le quai est sous ' + id);
  // Le haut du site (l'allée de l'entrée) est en haut de l'écran, sa gauche à gauche.
  assert.ok(ecran(cam, 0, 0)[1] < ecran(cam, 0, site.profondeur)[1] && ecran(cam, 0, 0)[0] < ecran(cam, site.largeur, 0)[0]);
  // La scène tient entière ; on voit encore les personnes et les chariots : un mètre de hauteur fait plus d'un demi-mètre au sol.
  assert.ok(C.tient(cam, ECRAN, D.boite(site, null)));
  const p = C.projecteur(cam, ECRAN);
  assert.ok(p.haut / p.sol > 0.5 && p.haut / p.sol < 0.7, 'trois quarts haut : ' + (p.haut / p.sol).toFixed(2));
  // Les murs du fond : celui du haut du site seulement — rien ne cache les zones.
  assert.deepEqual(C.mursDuFond(cam), { x0: false, x1: false, y0: true, y1: false });
});

test('sans disposition réglée : l’angle d’aujourd’hui, les zones en diagonale', () => {
  const site = generer(), cam = ouverte(site);
  assert.deepEqual([cam.cap, Math.round(cam.site * 100) / 100], [45, 35.26]);
  assert.deepEqual(cam, C.cadrer(C.camera({ cap: C.CAP_MAQUETTE, site: C.SITE_MAQUETTE }), ECRAN, D.boite(site, null)), 'la caméra d’avant, champ par champ');
  // (À cet angle, un bord de zone n'est pas vertical : c'est la vue de trois quarts de la maquette.)
  const z = zone(site, 'magasin');
  assert.ok(Math.abs(ecran(cam, z.x, z.y)[0] - ecran(cam, z.x, z.y + z.h)[0]) > 5);
});

test('la caméra reste libre : tourner et incliner partent de l’angle d’ouverture ; « Cadrer » garde l’angle', () => {
  const site = generer({ disposition: DISPOSITION }), cam = ouverte(site);
  // Deux pas à droite, un pas plus bas (les boutons de la scène).
  const tournee = C.incliner(C.tourner(C.tourner(cam, C.PAS_CAP), C.PAS_CAP), -C.PAS_SITE);
  assert.deepEqual([tournee.cap, Math.round(tournee.site * 100) / 100], [2 * C.PAS_CAP, 45.26]);
  // « Cadrer » une zone : à l'angle où l'on est.
  const cadree = C.cadrer(tournee, ECRAN, D.boiteDeZone(zone(site, 'cuisine')));
  assert.deepEqual([cadree.cap, cadree.site], [tournee.cap, tournee.site]);
  assert.ok(cadree.zoom > tournee.zoom, 'de plus près');
});

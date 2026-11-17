/* Correction 21 (b), évolution 21 (f) — quand l'utilisateur a disposé les zones,
 * la scène s'ouvre comme il les a rangées. Dans « Disposer les zones », les
 * colonnes vont « de gauche à droite » ; la vue d'ouverture d'un site disposé
 * garde donc ses colonnes de gauche à droite et ses rangées du bas devant, en
 * bas de l'écran. D'abord de face (cap 0, correction 21 b) : la scène se lisait
 * comme un plan vu du dessus. Depuis l'évolution 21 (f) : l'inclinaison de la
 * maquette et un cap à peine tourné (25°, du côté de la maquette) — les
 * volumes montrent une face latérale. Sans disposition réglée, l'angle de la
 * maquette, comme avant.
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

test('l’angle d’ouverture : l’inclinaison de la maquette et un cap à peine tourné pour un site disposé, celui de la maquette sinon', () => {
  assert.deepEqual(C.ouverture(false), { cap: C.CAP_MAQUETTE, site: C.SITE_MAQUETTE });
  assert.deepEqual(C.ouverture(), { cap: 45, site: C.SITE_MAQUETTE }, 'sans rien dire : la maquette');
  assert.deepEqual(C.ouverture(true), { cap: C.CAP_DISPOSE, site: C.SITE_DISPOSE });
  // Le cap : environ 25°, entre 20° et 30° — un peu plus de la moitié de celui de la maquette, du même côté.
  assert.equal(C.CAP_DISPOSE, 25);
  assert.ok(C.CAP_DISPOSE > 20 && C.CAP_DISPOSE < 30 && C.CAP_DISPOSE > C.CAP_MAQUETTE / 2 && C.CAP_DISPOSE < C.CAP_MAQUETTE);
  // L'inclinaison : celle de la maquette (la vue sans disposition).
  assert.equal(C.SITE_DISPOSE, C.SITE_MAQUETTE);
  // Le site dit s'il est disposé : `disposition`.
  assert.equal('disposition' in generer(), false);
  assert.equal('disposition' in generer({ disposition: DISPOSITION }), true);
});

test('un site disposé, à l’ouverture : la première colonne à gauche de la dernière, les rangées du bas en bas de l’écran, une face latérale', () => {
  const site = generer({ disposition: DISPOSITION }), cam = ouverte(site);
  assert.deepEqual([cam.cap, Math.round(cam.site * 100) / 100], [25, 35.26]);
  // Les colonnes vont de gauche à droite, dans l'ordre où on les a rangées.
  const X = DISPOSITION.colonnes.map(c => centre(cam, zone(site, c[0]))[0]);
  for (let i = 1; i < X.length; i++) assert.ok(X[i] > X[i - 1] + 20, 'la colonne ' + (i + 1) + ' est à droite de la colonne ' + i + ' (' + X.map(Math.round).join(', ') + ')');
  assert.ok(X[0] < X[X.length - 1], 'la première colonne est à gauche de la dernière');
  // Une rangée du bas est sous les colonnes qu'elle longe ; la plus large, sous toutes : son milieu est plus bas à l'écran.
  const Y = id => centre(cam, zone(site, id))[1];
  for (const id of ['magasin', 'cuisine']) assert.ok(Y('plonge') > Y(id) + 10, 'la plonge est sous ' + id);
  for (const id of ['magasin', 'cuisine', 'food', 'armement', 'plonge']) assert.ok(Y('quais') > Y(id) + 10, 'le quai est sous ' + id);
  // À la verticale de l'écran, une rangée du bas est toujours sous une colonne : descendre l'écran, c'est avancer dans la
  // profondeur du site (et glisser un peu vers la droite).
  const bas = ecran(cam, 10, 5), plusBas = ecran(cam, 10 + Math.tan(25 * Math.PI / 180) * 4, 9);
  assert.ok(Math.abs(bas[0] - plusBas[0]) < 1e-6 && plusBas[1] > bas[1]);
  // Le haut du site (l'allée de l'entrée) est en haut de l'écran, sa gauche à gauche.
  assert.ok(ecran(cam, 0, 0)[1] < ecran(cam, 0, site.profondeur)[1] && ecran(cam, 0, 0)[0] < ecran(cam, site.largeur, 0)[0]);
  // La scène tient entière ; à l'inclinaison de la maquette, un mètre de hauteur fait plus de trois quarts de mètre au sol.
  assert.ok(C.tient(cam, ECRAN, D.boite(site, null)));
  const p = C.projecteur(cam, ECRAN);
  assert.ok(Math.abs(p.haut / p.sol - Math.cos(C.SITE_MAQUETTE * Math.PI / 180)) < 1e-9 && p.haut / p.sol > 0.8, 'le relief de la maquette : ' + (p.haut / p.sol).toFixed(2));
  // Les volumes montrent une face latérale : celle de droite, avec celle de devant. Les murs du fond : le haut et la
  // gauche du site — rien ne cache les zones. (De face, au cap 0, aucune face latérale ne se voyait.)
  assert.deepEqual(C.facesDevant(cam), { x0: false, x1: true, y0: false, y1: true });
  assert.deepEqual(C.mursDuFond(cam), { x0: true, x1: false, y0: true, y1: false });
  assert.deepEqual(C.facesDevant({ ...cam, cap: 0 }), { x0: false, x1: false, y0: false, y1: true });
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
  assert.deepEqual([tournee.cap, Math.round(tournee.site * 100) / 100], [25 + 2 * C.PAS_CAP, 25.26]);
  // « Cadrer » une zone : à l'angle où l'on est.
  const cadree = C.cadrer(tournee, ECRAN, D.boiteDeZone(zone(site, 'cuisine')));
  assert.deepEqual([cadree.cap, cadree.site], [tournee.cap, tournee.site]);
  assert.ok(cadree.zoom > tournee.zoom, 'de plus près');
});

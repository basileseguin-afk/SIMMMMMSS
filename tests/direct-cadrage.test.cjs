/* Évolution 21 (f) — le cadrage d'un site disposé : au centre de la partie
 * libre de la toile, c'est-à-dire hors de la barre de la caméra et hors de la
 * légende quand elle est dépliée. La barre est en bas ; la légende, dans un
 * coin du bas : la partie libre est à côté d'elle, ou au-dessus d'elle — celle
 * où le site est le plus grand. Changer de partie libre ne déplace rien à
 * l'écran tant qu'on ne recadre pas. Sans rien qui recouvre la toile, le
 * cadrage d'avant, champ par champ.
 * Sans navigateur. Unité fictive. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../direct-camera.js');
const D = require('../direct-scene.js');
const S = require('../moteur/site.js');
const { REGIME, NOMS, CHEMIN, UNITE } = require('./site-unites.cjs');

const DISPOSITION = { colonnes: [['magasin'], ['cuisine'], ['food'], ['armement']], rangees: [{ zone: 'plonge', de: 1, a: 2 }, { zone: 'quais', de: 1, a: 4 }] };
const site = S.generer({ ateliers: UNITE(), noms: NOMS, parcours: CHEMIN, regime: REGIME, disposition: DISPOSITION });
const BOITE = D.boite(site, null), ANGLE = C.camera(C.ouverture(true));
const SANS = { haut: 0, bas: 0, gauche: 0, droite: 0 };
/** Une toile, sa barre de la caméra en bas à droite, sa légende dépliée en bas à gauche (les tailles de la page). */
const toile = (w, h) => ({ w, h });
const barre = (w, h) => ({ x0: w - 588, y0: h - 44, x1: w - 12, y1: h - 12 });
const legende = (w, h, lw = 340, lh = 222) => ({ x0: 12, y0: h - 12 - lh, x1: 12 + lw, y1: h - 12 });
const recoupe = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

test('les parties libres : sous la barre rien ; à côté de la légende dépliée, ou au-dessus d’elle', () => {
  const t = toile(1308, 875), b = barre(1308, 875), l = legende(1308, 875);
  assert.deepEqual(C.partiesLibres(t, {}), [SANS], 'rien ne recouvre : toute la toile');
  assert.deepEqual(C.partiesLibres(t), [SANS]);
  assert.deepEqual(C.partiesLibres(t, { barre: b }), [{ ...SANS, bas: 44 }], 'la barre : tout ce qui est sous son bord haut');
  assert.deepEqual(C.partiesLibres(t, { barre: b, legende: l }), [{ ...SANS, bas: 44, gauche: 352 }, { ...SANS, bas: 234 }], 'à côté de la légende, ou au-dessus');
  assert.deepEqual(C.partiesLibres(t, { legende: l }), [{ ...SANS, gauche: 352 }, { ...SANS, bas: 234 }], 'sans barre');
  // Une légende dans le coin de droite : la partie libre est à sa gauche.
  assert.deepEqual(C.partiesLibres(t, { barre: b, legende: { x0: 956, y0: 641, x1: 1296, y1: 863 } })[0], { ...SANS, bas: 44, droite: 352 });
  // Un rectangle vide, hors de la toile ou mal formé ne compte pas.
  for (const r of [null, undefined, { x0: 10, y0: 10, x1: 10, y1: 40 }, { x0: 1400, y0: 10, x1: 1500, y1: 40 }, { x0: 0, y0: NaN, x1: 5, y1: 9 }, {}])
    assert.deepEqual(C.partiesLibres(t, { barre: r, legende: r }), [SANS]);
});

test('un site disposé se cadre au centre de la partie libre : ni sous la légende dépliée, ni sous la barre ; ses marges haute et basse sont égales', () => {
  for (const [w, h] of [[784, 568], [1308, 875]]) {
    const t = toile(w, h), couvert = { barre: barre(w, h), legende: legende(w, h) };
    const { cam, bandes } = C.cadrerLibre(ANGLE, t, BOITE, couvert), ecran = { ...t, ...bandes }, e = C.emprise(cam, ecran, BOITE), v = C.visible(ecran);
    const m = w + ' × ' + h + ' : ';
    assert.deepEqual([cam.cap, cam.site], [ANGLE.cap, ANGLE.site], m + 'l’angle est gardé');
    assert.ok(!recoupe(e, couvert.legende) && !recoupe(e, couvert.barre), m + 'l’emprise du site ne recoupe ni la légende ni la barre : ' + JSON.stringify(e));
    assert.ok(C.tient(cam, ecran, BOITE), m + 'le site tient dans la partie libre, à la marge du cadrage');
    assert.ok(Math.abs((e.y0 - v.y0) - (v.y1 - e.y1)) < 1e-6, m + 'les marges haute et basse dans la partie libre sont égales');
    assert.ok(Math.abs((e.x0 - v.x0) - (v.x1 - e.x1)) < 1e-6, m + 'les marges gauche et droite aussi');
    // La partie libre choisie est celle où le site est le plus grand.
    const zooms = C.partiesLibres(t, couvert).map(b => C.cadrer(ANGLE, { ...t, ...b }, BOITE).zoom);
    assert.equal(cam.zoom, Math.max(...zooms), m + 'le plus grand des deux cadrages : ' + zooms.map(z => z.toFixed(2)).join(', '));
    // Jamais plus grand que sur toute la toile ; sur une petite toile, plus petit : la légende dépliée y prend de la place.
    const entier = C.cadrer(ANGLE, { ...t, ...SANS }, BOITE).zoom;
    assert.ok(cam.zoom <= entier + 1e-9 && (w > 1000 || cam.zoom < entier), m + 'au plus la taille de toute la toile : ' + cam.zoom.toFixed(2) + ' ≤ ' + entier.toFixed(2));
  }
});

test('la légende repliée : seule la barre compte ; sans rien qui recouvre, le cadrage d’avant, champ par champ', () => {
  const t = toile(784, 568), b = barre(784, 568);
  const replie = C.cadrerLibre(ANGLE, t, BOITE, { barre: b, legende: null });
  assert.deepEqual(replie.bandes, { ...SANS, bas: 44 });
  assert.ok(!recoupe(C.emprise(replie.cam, { ...t, ...replie.bandes }, BOITE), b), 'le site ne passe pas sous la barre');
  assert.deepEqual(replie.cam, C.cadrer(ANGLE, { ...t, ...SANS, bas: 44 }, BOITE));
  const sans = C.cadrerLibre(ANGLE, t, BOITE, {});
  assert.deepEqual(sans, { cam: C.cadrer(ANGLE, { ...t, ...SANS }, BOITE), bandes: SANS });
});

test('une toile trop petite pour ses commandes : toute la toile, quitte à passer dessous', () => {
  const t = toile(300, 190), couvert = { barre: { x0: 12, y0: 110, x1: 288, y1: 178 }, legende: { x0: 12, y0: 20, x1: 200, y1: 100 } };
  // À côté de la légende : 100 px de large ; au-dessus : 20 px de haut — aucune des deux ne garde 160 px.
  assert.equal(C.LIBRE_MIN, 160);
  assert.deepEqual(C.cadrerLibre(ANGLE, t, BOITE, couvert), { cam: C.cadrer(ANGLE, { ...t, ...SANS }, BOITE), bandes: SANS });
});

test('changer de bandes ne déplace rien à l’écran : chaque point de la scène reste sous le même pixel', () => {
  const avant = { w: 1308, h: 875, ...SANS }, bandes = { ...SANS, bas: 44, gauche: 352 };
  const cam = C.cadrer(C.camera({ cap: 70, site: 40 }), avant, BOITE), apres = C.sousAutresBandes(cam, avant, bandes), ecran = { w: 1308, h: 875, ...bandes };
  assert.deepEqual([apres.cap, apres.site, apres.zoom], [cam.cap, cam.site, cam.zoom]);
  for (const [x, y, z] of [[0, 0, 0], [site.largeur, 0, 2], [12.5, site.profondeur, 0], [30, 7, 1.4]]) {
    const p = C.projeter(cam, avant, x, y, z), q = C.projeter(apres, ecran, x, y, z);
    assert.ok(Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6, 'le point (' + [x, y, z] + ') : ' + p.map(Math.round) + ' → ' + q.map(Math.round));
  }
  // Les mêmes bandes : la même caméra.
  assert.deepEqual(C.sousAutresBandes(cam, avant, SANS), cam);
});

/* ==========================================================================
 *  LA CAMÉRA DE LA VUE EN DIRECT (évolution 16 b, v1)
 *  ------------------------------------------------------------------------
 *  La vue en relief se regarde par une projection orthogonale : sans fuite de
 *  perspective, le dessin reste schématique et les tailles comparables. La
 *  caméra tourne autour du site (son cap, sur 360°), s'incline (son site, de
 *  25° à 80° au-dessus de l'horizon), se déplace et zoome.
 *
 *  Le repère de la scène : x le long du site (les avions du côté des grands
 *  x), y dans sa profondeur, z vers le haut, en mètres. Une caméra :
 *  { cap, site, zoom, cx, cy } — les angles en degrés, le zoom en pixels par
 *  mètre, (cx, cy) le point du sol au centre de la zone visible.
 *
 *  L'écran : { w, h } en pixels, avec au besoin les bandes que des commandes
 *  recouvrent ({ haut, bas, gauche, droite }) : la zone visible est le reste.
 *
 *  Tout est ici sans navigateur, et se teste : la projection et son inverse,
 *  le cadrage (« Tout voir », « Cadrer »), l'ordre de dessin du fond vers
 *  l'avant, les murs du fond, la place des étiquettes.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const RAD = Math.PI / 180;
  /** L'angle de la maquette : une vue isométrique, de trois quarts. */
  const CAP_MAQUETTE = 45, SITE_MAQUETTE = Math.asin(1 / Math.sqrt(3)) / RAD;
  const SITE_MIN = 25, SITE_MAX = 80, ZOOM_MIN = 0.5, ZOOM_MAX = 160;
  /** La marge autour de la scène cadrée, en pixels d'écran. */
  const MARGE = 24;
  /** Un pas de rotation et d'inclinaison (les boutons, les touches), en degrés ; un pas de zoom. */
  const PAS_CAP = 15, PAS_SITE = 10, PAS_ZOOM = 1.25;

  const fini = x => Number.isFinite(x);
  const borne = (x, a, b) => Math.max(a, Math.min(b, x));
  const tour = a => ((a % 360) + 360) % 360;

  /** Une caméra complète et dans ses bornes ; sans rien : l'angle de la maquette. */
  function camera(c) {
    const p = c || {};
    return { cap: tour(fini(p.cap) ? p.cap : CAP_MAQUETTE), site: borne(fini(p.site) ? p.site : SITE_MAQUETTE, SITE_MIN, SITE_MAX),
      zoom: borne(fini(p.zoom) && p.zoom > 0 ? p.zoom : 10, ZOOM_MIN, ZOOM_MAX), cx: fini(p.cx) ? p.cx : 0, cy: fini(p.cy) ? p.cy : 0 };
  }

  /** La zone visible de l'écran : { x0, y0, x1, y1 }, et son centre. */
  function visible(ecran) {
    const e = ecran || {}, x0 = e.gauche || 0, y0 = e.haut || 0, x1 = (e.w || 0) - (e.droite || 0), y1 = (e.h || 0) - (e.bas || 0);
    return { x0, y0, x1: Math.max(x0, x1), y1: Math.max(y0, y1), cx: (x0 + Math.max(x0, x1)) / 2, cy: (y0 + Math.max(y0, y1)) / 2 };
  }

  /**
   * Le projecteur d'une caméra sur un écran : { x(x, y), y(x, y, z), profondeur(x, y), sol, haut }. `x` et `y` rendent les
   * pixels d'un point de la scène ; `profondeur` grandit vers l'avant (ce qui est plus près de l'œil se dessine après) ;
   * `sol` et `haut` : les pixels d'un mètre au sol (le long de l'écran) et d'un mètre de hauteur.
   */
  function projecteur(cam, ecran) {
    const a = cam.cap * RAD, e = cam.site * RAD, ca = Math.cos(a), sa = Math.sin(a), se = Math.sin(e), ce = Math.cos(e), s = cam.zoom, v = visible(ecran);
    const ax = s * ca, bx = -s * sa, ox = v.cx - cam.cx * ax - cam.cy * bx;
    const ay = s * sa * se, by = s * ca * se, cz = -s * ce, oy = v.cy - cam.cx * ay - cam.cy * by;
    return { x: (x, y) => ox + ax * x + bx * y, y: (x, y, z) => oy + ay * x + by * y + cz * (z || 0),
      profondeur: (x, y) => sa * x + ca * y, sol: s, haut: s * ce, aplat: se };
  }

  /** Les pixels [X, Y] d'un point (x, y, z) de la scène. */
  function projeter(cam, ecran, x, y, z) { const p = projecteur(cam, ecran); return [p.x(x, y), p.y(x, y, z)]; }

  /** Le point du sol (z = 0) sous le pixel (X, Y). */
  function auSol(cam, ecran, X, Y) {
    const a = cam.cap * RAD, ca = Math.cos(a), sa = Math.sin(a), se = Math.sin(cam.site * RAD), v = visible(ecran);
    const u = (X - v.cx) / cam.zoom, w = (Y - v.cy) / (cam.zoom * se);
    return { x: cam.cx + u * ca + w * sa, y: cam.cy - u * sa + w * ca };
  }

  /** Glisser de (dX, dY) pixels : le sol suit le pointeur. */
  function deplacer(cam, ecran, dX, dY) {
    const a = auSol(cam, ecran, 0, 0), b = auSol(cam, ecran, dX, dY);
    return { ...cam, cx: cam.cx - (b.x - a.x), cy: cam.cy - (b.y - a.y) };
  }

  /** Zoomer d'un facteur en gardant sous le pixel (X, Y) le même point du sol (sans pixel : le centre). */
  function zoomer(cam, ecran, facteur, X, Y) {
    const v = visible(ecran), px = fini(X) ? X : v.cx, py = fini(Y) ? Y : v.cy;
    const avant = auSol(cam, ecran, px, py), c = { ...cam, zoom: borne(cam.zoom * facteur, ZOOM_MIN, ZOOM_MAX) }, apres = auSol(c, ecran, px, py);
    return { ...c, cx: c.cx + avant.x - apres.x, cy: c.cy + avant.y - apres.y };
  }

  /** Tourner de `d` degrés autour du point au centre de l'écran ; incliner de `d` degrés, entre 25° et 80°. */
  const tourner = (cam, d) => ({ ...cam, cap: tour(cam.cap + d) });
  const incliner = (cam, d) => ({ ...cam, site: borne(cam.site + d, SITE_MIN, SITE_MAX) });

  /** Les huit coins d'une boîte { x0, y0, x1, y1, h } (du sol à la hauteur h). */
  const coins = b => [0, b.h || 0].flatMap(z => [[b.x0, b.y0, z], [b.x1, b.y0, z], [b.x1, b.y1, z], [b.x0, b.y1, z]]);

  /** Le rectangle d'écran qui contient une boîte de la scène : { x0, y0, x1, y1 } en pixels. */
  function emprise(cam, ecran, boite) {
    const p = projecteur(cam, ecran), pts = coins(boite).map(([x, y, z]) => [p.x(x, y), p.y(x, y, z)]);
    return { x0: Math.min(...pts.map(q => q[0])), y0: Math.min(...pts.map(q => q[1])), x1: Math.max(...pts.map(q => q[0])), y1: Math.max(...pts.map(q => q[1])) };
  }

  /**
   * La caméra, à son angle, qui fait tenir la boîte entière dans la zone visible, à `marge` pixels de ses bords : le plus
   * grand zoom qui la contient, la boîte au centre. Sans boîte ou sans écran : la caméra telle quelle.
   */
  function cadrer(cam, ecran, boite, marge = MARGE) {
    const v = visible(ecran), lw = v.x1 - v.x0 - 2 * marge, lh = v.y1 - v.y0 - 2 * marge;
    if (!boite || !(lw > 0) || !(lh > 0)) return cam;
    // À un pixel par mètre, la boîte projetée : sa taille donne le zoom, son milieu le centre.
    const un = { ...cam, zoom: 1, cx: 0, cy: 0 }, e = emprise(un, ecran, boite), bw = e.x1 - e.x0, bh = e.y1 - e.y0;
    const zoom = borne(Math.min(bw > 0 ? lw / bw : ZOOM_MAX, bh > 0 ? lh / bh : ZOOM_MAX), ZOOM_MIN, ZOOM_MAX);
    const milieu = auSol(un, ecran, (e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2);
    return { ...cam, zoom, cx: milieu.x, cy: milieu.y };
  }

  /** La boîte tient entière dans la zone visible, à `marge` pixels de ses bords. */
  function tient(cam, ecran, boite, marge = MARGE) {
    const v = visible(ecran), e = emprise(cam, ecran, boite), t = 0.5;
    return e.x0 >= v.x0 + marge - t && e.y0 >= v.y0 + marge - t && e.x1 <= v.x1 - marge + t && e.y1 <= v.y1 - marge + t;
  }

  /**
   * Les côtés du fond, pour l'angle de la caméra : { x0, x1, y0, y1 } — vrai pour un côté dont le dehors s'éloigne de
   * l'œil. Un mur ne se dessine que là : il est derrière ce qu'il borde, rien n'est caché. Un côté vu par la tranche (la
   * caméra pile dans son axe) n'en est pas.
   */
  function mursDuFond(cam) {
    const a = cam.cap * RAD, sx = Math.sin(a), sy = Math.cos(a), t = 1e-9;
    return { x0: sx > t, x1: sx < -t, y0: sy > t, y1: sy < -t };
  }
  /** Les faces d'une boîte tournées vers l'œil : les côtés opposés à ceux du fond. */
  function facesDevant(cam) { const m = mursDuFond(cam); return { x0: m.x1, x1: m.x0, y0: m.y1, y1: m.y0 }; }

  /**
   * L'ordre de dessin, du fond vers l'avant, pour l'angle courant : d'abord par couche (`couche` : le sol 0, ce qui est
   * posé dessus 1…), puis par profondeur du point d'appui ({ x, y } : le milieu de l'emprise au sol), les plus loin
   * d'abord ; à égalité, l'ordre donné. Rend une liste neuve.
   */
  function ordre(cam, objets) {
    const a = cam.cap * RAD, sa = Math.sin(a), ca = Math.cos(a);
    return objets.map((o, i) => ({ o, i, c: o.couche || 0, p: sa * o.x + ca * o.y }))
      .sort((p, q) => p.c - q.c || (Math.abs(p.p - q.p) > 1e-9 ? p.p - q.p : 0) || p.i - q.i).map(x => x.o);
  }

  /**
   * Une boîte longue, coupée en tronçons d'au plus `pas` mètres le long de ses deux côtés : chacun se range à sa propre
   * profondeur, et une personne devant un long rayonnage reste devant. Rend [{ x, y, w, d }] (coin, largeur, profondeur).
   */
  function decouper(b, pas) {
    const nx = Math.max(1, Math.ceil(b.w / pas - 1e-9)), ny = Math.max(1, Math.ceil(b.d / pas - 1e-9)), out = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) out.push({ x: b.x + i * b.w / nx, y: b.y + j * b.d / ny, w: b.w / nx, d: b.d / ny });
    return out;
  }

  /** Entre deux caméras (k de 0 à 1) : le cap par le plus court chemin, le zoom en proportion. */
  function entre(a, b, k) {
    const t = borne(k, 0, 1), d = ((b.cap - a.cap + 540) % 360) - 180;
    return { cap: tour(a.cap + d * t), site: a.site + (b.site - a.site) * t, zoom: a.zoom * Math.pow(b.zoom / a.zoom, t),
      cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t };
  }

  /* ---- les étiquettes ---------------------------------------------------------- */

  const seTouchent = (p, q, jeu) => p.x < q.x + q.w + jeu && q.x < p.x + p.w + jeu && p.y < q.y + q.h + jeu && q.y < p.y + p.h + jeu;

  /**
   * La place des étiquettes : chacune ({ id, ax, ay, w, h } — son point d'ancrage à l'écran, sa taille en pixels) se pose
   * centrée au-dessus de son ancre ; si elle en recouvrirait une autre ou sortirait de la zone visible, elle se décale au
   * plus près (d'abord en hauteur). Les étiquettes gardent leur taille : seule leur place change. Rend, dans l'ordre
   * donné, [{ id, x, y, w, h, ax, ay, decalee }] (le coin en haut à gauche). `jeu` : l'écart gardé entre deux étiquettes.
   */
  function placerEtiquettes(etiquettes, ecran, options) {
    const o = options || {}, jeu = o.jeu ?? 4, pas = o.pas ?? 6, v = visible(ecran), poses = [], out = new Map();
    const dedans = r => r.x >= v.x0 && r.y >= v.y0 && r.x + r.w <= v.x1 && r.y + r.h <= v.y1;
    const libre = r => poses.every(p => !seTouchent(r, p, jeu));
    // Celles qui passent avant les autres (`avant` : le goulot du moment) prennent leur place d'abord ; puis les plus hautes
    // à l'écran (puis de gauche à droite, puis l'ordre donné) : toujours le même résultat.
    const rang = etiquettes.map((e, i) => ({ e, i })).sort((p, q) => (q.e.avant || 0) - (p.e.avant || 0) || p.e.ay - q.e.ay || p.e.ax - q.e.ax || p.i - q.i);
    for (const { e } of rang) {
      const base = { x: borne(e.ax - e.w / 2, v.x0, Math.max(v.x0, v.x1 - e.w)), y: borne(e.ay - e.h, v.y0, Math.max(v.y0, v.y1 - e.h)), w: e.w, h: e.h };
      let pose = null;
      // Des places de plus en plus loin : en hauteur d'abord, puis de côté.
      const cotes = [0]; for (let k = 1; k <= 6; k++) cotes.push(k * (e.w / 2 + jeu), -k * (e.w / 2 + jeu));
      const nMax = Math.ceil((v.y1 - v.y0) / pas) + 1;
      recherche:
      for (const dx of cotes) for (let n = 0; n <= nMax; n++) for (const dy of n ? [-n * pas, n * pas] : [0]) {
        const r = { x: base.x + dx, y: base.y + dy, w: e.w, h: e.h };
        if (dedans(r) && libre(r)) { pose = r; break recherche; }
      }
      // Aucune place libre (un écran minuscule) : sa place de base, quitte à recouvrir.
      const r = pose || base;
      poses.push(r);
      out.set(e, { id: e.id, x: r.x, y: r.y, w: e.w, h: e.h, ax: e.ax, ay: e.ay, decalee: Math.abs(r.x - (e.ax - e.w / 2)) > 0.5 || Math.abs(r.y - (e.ay - e.h)) > 0.5 });
    }
    return etiquettes.map(e => out.get(e));
  }

  /** Deux étiquettes posées se recouvrent-elles ? (pour les tests et le contrôle) */
  function recouvrements(poses) {
    const l = [];
    poses.forEach((p, i) => poses.forEach((q, j) => { if (j > i && seTouchent(p, q, 0)) l.push([p.id, q.id]); }));
    return l;
  }

  const api = { CAP_MAQUETTE, SITE_MAQUETTE, SITE_MIN, SITE_MAX, ZOOM_MIN, ZOOM_MAX, MARGE, PAS_CAP, PAS_SITE, PAS_ZOOM,
    camera, visible, projecteur, projeter, auSol, deplacer, zoomer, tourner, incliner, emprise, cadrer, tient, mursDuFond, facesDevant,
    ordre, decouper, entre, placerEtiquettes, recouvrements };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyDirectCamera = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

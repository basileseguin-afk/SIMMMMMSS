/* ==========================================================================
 *  LE DESSIN DE LA VUE EN DIRECT (évolution 16 b, v1)
 *  ------------------------------------------------------------------------
 *  La scène se dessine dans un canvas 2D, sans bibliothèque : des sols, des
 *  boîtes à trois faces, des personnages, des chariots, des étiquettes — des
 *  volumes simples, des couleurs à plat, aucune texture. Chaque fonction
 *  reçoit le contexte du canvas et le projecteur de la caméra
 *  (direct-camera.js) : elle dessine pour l'angle courant.
 *
 *  Les couleurs viennent des jetons de direct.css, eux-mêmes tirés de ceux
 *  de ds.css : elles suivent le thème, clair ou sombre.
 * ==========================================================================*/
(function (root) {
  'use strict';

  /** Les jetons de couleur de la scène (`--dv-<nom>`, direct.css). */
  const JETONS = ['fond', 'sol', 'couloir', 'zone', 'pause', 'mur', 'machine', 'bras', 'rayonnage', 'table', 'peau', 'travail', 'attente', 'neutre',
    'critique', 'ok', 'repas', 'equipement', 'sale', 'texte', 'texte2', 'etiquette', 'bordure', 'choisi', 'vehicule', 'avion'];
  /** L'ombre de chaque face d'une boîte, selon le côté qu'elle regarde : la lumière ne tourne pas avec la caméra. */
  const OMBRES = { x1: 0.30, y1: 0.16, x0: 0.22, y0: 0.36 };

  /** Une couleur calculée par le navigateur (« rgb(1, 2, 3) », « color(srgb 0.1 0.2 0.3) », « #abc ») en [r, v, b]. */
  function rvb(texte) {
    const t = String(texte || '').trim();
    let m = /^#([0-9a-f]{3,8})$/i.exec(t);
    if (m) { const h = m[1].length < 6 ? [...m[1].slice(0, 3)].map(c => c + c).join('') : m[1].slice(0, 6); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
    m = /^rgba?\(([^)]+)\)$/i.exec(t);
    if (m) return m[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(x => Math.round(parseFloat(x)));
    m = /^color\(\s*srgb\s+([^)]+)\)$/i.exec(t);
    if (m) return m[1].split(/[\s/]+/).filter(Boolean).slice(0, 3).map(x => Math.round(Math.max(0, Math.min(1, parseFloat(x))) * 255));
    return [128, 128, 128];
  }
  const css = c => 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  const melange = (a, b, f) => a.map((v, i) => Math.round(v + (b[i] - v) * f));

  /**
   * La palette de la scène, lue dans la page : chaque jeton `--dv-<nom>` de l'hôte, calculé par le navigateur pour le
   * thème courant. `pal.c(nom)` : la couleur ; `pal.ton(nom, f)` : assombrie (f > 0) ou éclaircie (f < 0) ;
   * `pal.boite(nom)` : les tons des faces d'une boîte ; `pal.voile(nom, a)` : la couleur, transparente.
   */
  function palette(hote) {
    const base = {}, tons = new Map(), boites = new Map();
    const sonde = hote.ownerDocument.createElement('span');
    sonde.style.display = 'none'; hote.appendChild(sonde);
    for (const nom of JETONS) { sonde.style.color = 'var(--dv-' + nom + ')'; base[nom] = rvb(root.getComputedStyle(sonde).color); }
    sonde.remove();
    const NOIR = [0, 0, 0], BLANC = [255, 255, 255];
    const brut = (nom, f) => (f ? melange(base[nom] || NOIR, f > 0 ? NOIR : BLANC, Math.abs(f)) : base[nom] || NOIR);
    const pal = {
      base,
      c: nom => pal.ton(nom, 0),
      ton(nom, f) { const k = nom + '|' + f; let v = tons.get(k); if (!v) { v = css(brut(nom, f)); tons.set(k, v); } return v; },
      boite(nom) {
        let v = boites.get(nom);
        if (!v) { v = { dessus: pal.ton(nom, 0), x0: pal.ton(nom, OMBRES.x0), x1: pal.ton(nom, OMBRES.x1), y0: pal.ton(nom, OMBRES.y0), y1: pal.ton(nom, OMBRES.y1) }; boites.set(nom, v); }
        return v;
      },
      voile: (nom, a) => { const c = base[nom] || NOIR; return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; },
      melange: (a, b, f) => css(melange(base[a] || NOIR, base[b] || NOIR, f))
    };
    return pal;
  }

  /** Un polygone, rempli et au besoin cerné. */
  function poly(ctx, pts, fond, trait, epaisseur) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    if (fond) { ctx.fillStyle = fond; ctx.fill(); }
    if (trait) { ctx.strokeStyle = trait; ctx.lineWidth = epaisseur || 1; ctx.stroke(); }
  }

  /** Un rectangle posé au sol (à la hauteur z). */
  function sol(ctx, p, x, y, w, d, fond, trait, epaisseur, z) {
    poly(ctx, [p.x(x, y), p.y(x, y, z), p.x(x + w, y), p.y(x + w, y, z), p.x(x + w, y + d), p.y(x + w, y + d, z), p.x(x, y + d), p.y(x, y + d, z)], fond, trait, epaisseur);
  }

  /**
   * Une boîte : ses deux faces tournées vers l'œil (`devant` : { x0, x1, y0, y1 }, direct-camera.js), puis son dessus.
   * `tons` : { dessus, x0, x1, y0, y1 } (pal.boite).
   */
  function boite(ctx, p, devant, x, y, z, w, d, h, tons) {
    const xa = p.x(x, y), ya = p.y(x, y, z), xb = p.x(x + w, y), yb = p.y(x + w, y, z), xc = p.x(x + w, y + d), yc = p.y(x + w, y + d, z), xd = p.x(x, y + d), yd = p.y(x, y + d, z), dh = h * p.haut;
    if (devant.x0) poly(ctx, [xa, ya, xd, yd, xd, yd - dh, xa, ya - dh], tons.x0);
    if (devant.x1) poly(ctx, [xb, yb, xc, yc, xc, yc - dh, xb, yb - dh], tons.x1);
    if (devant.y0) poly(ctx, [xa, ya, xb, yb, xb, yb - dh, xa, ya - dh], tons.y0);
    if (devant.y1) poly(ctx, [xd, yd, xc, yc, xc, yc - dh, xd, yd - dh], tons.y1);
    poly(ctx, [xa, ya - dh, xb, yb - dh, xc, yc - dh, xd, yd - dh], tons.dessus);
  }

  /**
   * Un personnage debout en (x, y) : son ombre, ses jambes, son corps de la couleur de son état, sa tête. `bob` : un léger
   * mouvement vertical, en pixels (au travail). De loin (moins de 5 px par mètre), un simple pion.
   */
  function personne(ctx, p, x, y, corps, jambes, peau, ombre, bob) {
    const sx = p.x(x, y), sy = p.y(x, y, 0), s = p.sol, hh = p.haut, b = bob || 0;
    if (s < 5) { ctx.fillStyle = corps; ctx.fillRect(sx - 1.5, sy - 1.2 * hh, 3, Math.max(2, 1.2 * hh)); return; }
    ctx.fillStyle = ombre; ctx.beginPath(); ctx.ellipse(sx, sy, 0.3 * s, 0.3 * s * p.aplat * 0.8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = jambes; ctx.fillRect(sx - 0.13 * s, sy - 0.42 * hh, 0.26 * s, 0.42 * hh);
    ctx.fillStyle = corps; ctx.beginPath();
    const haut = 0.72 * hh, r = Math.min(0.16 * s, haut / 2);
    if (ctx.roundRect) ctx.roundRect(sx - 0.2 * s, sy - 1.1 * hh - b, 0.4 * s, haut, r); else ctx.rect(sx - 0.2 * s, sy - 1.1 * hh - b, 0.4 * s, haut);
    ctx.fill();
    ctx.fillStyle = peau; ctx.beginPath(); ctx.arc(sx, sy - 1.1 * hh - b - 0.12 * s, 0.17 * s, 0, 7); ctx.fill();
  }

  /** Un chariot en (x, y) : une boîte de 0,6 m sur 0,48, haute de 0,85. */
  function chariot(ctx, p, devant, x, y, tons) { boite(ctx, p, devant, x - 0.3, y - 0.24, 0.1, 0.6, 0.48, 0.85, tons); }

  /** La police d'un texte de la scène. */
  const police = (taille, gras) => (gras ? '600 ' : '500 ') + taille + 'px Inter, "Inter Variable", system-ui, sans-serif';

  /**
   * Une étiquette posée ({ x, y, w, h, ax, ay, titre, lignes }) : un cartouche droit, de taille fixe, relié à son ancre
   * par un trait fin. `style` : { fond, bordure, titre, texte, epaisseur }, `mesures` : { titre, ligne, marge, interligne }.
   */
  function etiquette(ctx, e, style, mesures) {
    const cx = e.x + e.w / 2, bas = e.y + e.h;
    if (Math.abs(e.ay - bas) > 2 || Math.abs(e.ax - cx) > 2) {
      ctx.strokeStyle = style.bordure; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, bas); ctx.lineTo(e.ax, e.ay); ctx.stroke();
    }
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(e.x + 0.5, e.y + 0.5, e.w - 1, e.h - 1, 6); else ctx.rect(e.x + 0.5, e.y + 0.5, e.w - 1, e.h - 1);
    ctx.fillStyle = style.fond; ctx.fill(); ctx.strokeStyle = style.bordure; ctx.lineWidth = style.epaisseur || 1; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let y = e.y + mesures.marge - 1.5 + mesures.interligne / 2;
    ctx.fillStyle = style.titre; ctx.font = police(mesures.titre, true); ctx.fillText(e.titre, cx, y);
    ctx.fillStyle = style.texte; ctx.font = police(mesures.ligne, false);
    for (const l of e.lignes) { y += mesures.interligne; ctx.fillText(l, cx, y); }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  const api = { JETONS, OMBRES, rvb, css, melange, palette, poly, sol, boite, personne, chariot, police, etiquette };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyDirectDessin = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

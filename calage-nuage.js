/* ==========================================================================
 *  LE NUAGE DE POINTS D'UNE LIGNE CALÉE (banc d'essai de la version 1,
 *  évolution 17 c — docs/BANC_ESSAI.md § 10)
 *  ------------------------------------------------------------------------
 *  Par ligne du rapport du calage : ses jours appris, le travail au barème en
 *  abscisse et les heures réelles en ordonnée (en ETP l'un et l'autre), la
 *  courbe retenue et celle de « × a ». Une part de la validation se laisse de
 *  côté (un mois, une semaine ISO) : ses jours sont marqués d'un cercle vide,
 *  et les deux courbes sont alors apprises sans eux — comme la validation
 *  apprend sans la part qu'elle juge. Les paramètres viennent du module du calage (un seul chemin de
 *  calcul) ; ici, des données à dessiner, le dessin, et les mots de qui ne le
 *  voit pas. Sans navigateur pour les données et le SVG.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const C = () => (enNode ? require('./moteur/calage-periode.js') : root.OrlyCalagePeriode);

  /** Le cadre du dessin (un viewBox : le SVG prend la largeur de sa boîte). */
  const L = 640, H = 300, GAUCHE = 46, DROITE = 14, HAUT = 22, BAS = 36;
  /** Une courbe se trace en 120 segments (une puissance tourne vite près de zéro) ; un point se saisit à 24 px au plus. */
  const SEGMENTS = 120, PORTEE = 24;
  const AUCUNE = 'aucune';

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** Un nombre à la française, une décimale au plus. */
  const nombre = (x, d = 1) => String(Math.round(x * 10 ** d) / 10 ** d + 0).replace('.', ',');
  const dateFr = d => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  /** Les parts qu'on peut laisser de côté : les mois (s'il y en a deux de 14 jours), puis les semaines ISO — celles de la validation. */
  function parts(jours) {
    const d = C().decoupages(jours);
    return d.mois.map(m => ({ id: 'mois:' + m, nom: 'le mois de ' + MOIS[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4), dans: j => j.date.startsWith(m) }))
      .concat(d.semaines.map(s => ({ id: 'semaine:' + s, nom: 'la semaine ' + s, dans: j => C().semaineIso(j.date) === s })));
  }

  /** Un maximum d'axe rond, et son pas : 1, 2 ou 5 × 10^k, six graduations au plus. */
  function echelle(max) {
    const brut = (max > 0 ? max : 1) / 5, k = 10 ** Math.floor(Math.log10(brut)), pas = [1, 2, 5, 10].map(m => m * k).find(p => p >= brut - 1e-12);
    return { pas, max: Math.ceil((max > 0 ? max : 1) / pas - 1e-9) * pas };
  }

  /** Une courbe : la prédiction d'un modèle ({ modele, parametres }) de 0 au bout de l'axe. */
  const courbe = (m, xMax) => Array.from({ length: SEGMENTS + 1 }, (_, i) => { const x = xMax * i / SEGMENTS; return [x, C().prevuCale({ ...m, sigma: 0 }, { simule: x }).prevu]; });

  /**
   * Ce que montre le nuage d'une ligne. `jours` : ses jours appris ({ date, reel, simule }, la comparaison) ;
   * `retenu` : le modèle retenu du rapport ({ modele, nom, parametres }) ; `partId` : la part laissée de côté
   * (« aucune », ou l'une de `parts` ; par défaut la première). Avec une part, les deux courbes sont apprises sans
   * ses jours (C.apprendre, comme la validation) ; sans, sur tous les jours.
   */
  function donnees(jours, retenu, partId) {
    const toutes = parts(jours), part = partId === AUCUNE ? null : toutes.find(p => p.id === partId) || toutes[0] || null;
    const appris = part ? jours.filter(j => !part.dans(j)) : jours;
    const modele = n => { const p = n === retenu.modele && !part ? retenu.parametres : C().apprendre(n, appris); return p ? { modele: n, parametres: p } : null; };
    const xs = jours.map(j => j.simule), ys = jours.map(j => j.reel), ex = echelle(Math.max(...xs));
    const m = modele(retenu.modele), xa = retenu.modele === 'x-a' ? null : modele('x-a');
    const courbes = [m && { id: 'retenue', nom: retenu.nom, points: courbe(m, ex.max) }, xa && { id: 'x-a', nom: C().NOMS['x-a'], points: courbe(xa, ex.max) }].filter(Boolean);
    const prevoit = (c, x) => (c ? C().prevuCale({ ...c, sigma: 0 }, { simule: x }).prevu : null);
    const points = jours.map(j => ({ date: j.date, x: j.simule, y: j.reel, cote: !!part && part.dans(j), retenue: prevoit(m, j.simule), xa: prevoit(xa, j.simule) }));
    // L'ordonnée couvre les jours et la courbe retenue ; « × a », qui peut filer bien plus haut, est coupée au cadre.
    const retenue = courbes.find(c => c.id === 'retenue');
    const ey = echelle(Math.max(...ys, ...(retenue ? retenue.points.map(p => p[1]).filter(Number.isFinite) : [])));
    return { points, courbes, x: ex, y: ey, etendue: { x: [Math.min(...xs), Math.max(...xs)], y: [Math.min(...ys), Math.max(...ys)] },
      part: part ? { id: part.id, nom: part.nom, jours: points.filter(p => p.cote).length } : null, parts: toutes.map(p => ({ id: p.id, nom: p.nom })), modele: retenu.nom };
  }

  const px = (d, x) => GAUCHE + (L - GAUCHE - DROITE) * x / d.x.max, py = (d, y) => H - BAS - (H - HAUT - BAS) * y / d.y.max;

  /** La phrase qui décrit le nuage, pour qui ne le voit pas. */
  function decrire(d) {
    const n = d.points.length, autre = d.courbes.some(c => c.id === 'x-a');
    return n + ' jours appris : le travail au barème va de ' + nombre(d.etendue.x[0]) + ' à ' + nombre(d.etendue.x[1]) + ' ETP, les heures réelles de '
      + nombre(d.etendue.y[0]) + ' à ' + nombre(d.etendue.y[1]) + ' ETP. La courbe retenue (« ' + d.modele + ' »)' + (autre ? ' et celle de « × a »' : '')
      + (d.part ? ', apprise' + (autre ? 's' : '') + ' sans ' + d.part.nom + ' : ses ' + d.part.jours + ' jours, laissés de côté, sont marqués d’un cercle vide.'
        : ', apprise' + (autre ? 's' : '') + ' sur tous les jours.');
  }

  /** Ce que dit un point : son jour, son travail au barème, ses heures réelles, ce qu'en prévoient les deux courbes ; s'il est laissé de côté. */
  function bulle(d, i) {
    const p = d.points[i];
    return dateFr(p.date) + ' : ' + nombre(p.x) + ' ETP au barème, ' + nombre(p.y) + ' ETP réels'
      + (p.retenue === null ? '' : ' ; la formule retenue en prévoit ' + nombre(p.retenue)) + (p.xa === null ? '' : ', « × a » ' + nombre(p.xa))
      + (p.cote ? ' — laissé de côté (' + d.part.nom + ') : les courbes sont apprises sans lui' : '') + '.';
  }

  /** Le point le plus proche d'un endroit du dessin (en unités du viewBox), à 24 px au plus ; -1 sinon. */
  function plusProche(d, x, y) {
    let mieux = -1, dist = PORTEE * PORTEE;
    d.points.forEach((p, i) => { const e = (px(d, p.x) - x) ** 2 + (py(d, p.y) - y) ** 2; if (e <= dist) { dist = e; mieux = i; } });
    return mieux;
  }

  /** Le tracé d'une courbe, coupé au cadre : un segment qui sort de l'ordonnée s'arrête au bord, celui qui y rentre en repart. */
  function trace(d, points) {
    const dedans = y => Number.isFinite(y) && y >= 0 && y <= d.y.max, pos = (x, y) => px(d, x).toFixed(1) + ' ' + py(d, y).toFixed(1);
    // Le point où le segment [p, q] coupe le bord (le haut ou le bas du cadre) que franchit son bout hors cadre.
    const bord = (p, q) => { const y = (dedans(p[1]) ? q[1] : p[1]) > d.y.max ? d.y.max : 0, t = (y - p[1]) / (q[1] - p[1]); return [p[0] + t * (q[0] - p[0]), y]; };
    let s = '';
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1], q = points[i], a = dedans(p[1]), b = dedans(q[1]);
      if (![p[1], q[1]].every(Number.isFinite) || (!a && !b)) continue;
      const de = a ? p : bord(p, q), vers = b ? q : bord(p, q);
      s += (a && s ? 'L' : 'M' + pos(de[0], de[1]) + 'L') + pos(vers[0], vers[1]);
    }
    return s;
  }

  /** Le dessin : la grille et ses graduations, les deux courbes, les jours (un cercle vide : laissé de côté), le curseur. */
  function svg(d) {
    const gy = [], gx = [];
    for (let v = 0; v <= d.y.max + 1e-9; v += d.y.pas) gy.push(v);
    for (let v = 0; v <= d.x.max + 1e-9; v += d.x.pas) gx.push(v);
    const classe = { 'retenue': 'pcn-retenue', 'x-a': 'pcn-xa' };
    return '<svg class="pcn-svg" viewBox="0 0 ' + L + ' ' + H + '" role="img" aria-label="' + esc(decrire(d)) + '">'
      + gy.map(v => '<line class="pcn-grille" x1="' + GAUCHE + '" x2="' + (L - DROITE) + '" y1="' + py(d, v).toFixed(1) + '" y2="' + py(d, v).toFixed(1) + '"/>'
        + '<text class="pcn-echelle" x="' + (GAUCHE - 6) + '" y="' + (py(d, v) + 4).toFixed(1) + '">' + esc(nombre(v)) + '</text>').join('')
      + gx.map(v => '<text class="pcn-abscisse" x="' + px(d, v).toFixed(1) + '" y="' + (H - BAS + 16) + '">' + esc(nombre(v)) + '</text>').join('')
      + '<text class="pcn-titre-axe" x="' + GAUCHE + '" y="12">heures réelles (ETP)</text>'
      + '<text class="pcn-titre-axe pcn-titre-x" x="' + (L - DROITE) + '" y="' + (H - 4) + '">travail au barème (ETP)</text>'
      // « × a » d'abord, la courbe retenue par-dessus ; puis les jours, ceux laissés de côté au premier plan.
      + d.courbes.slice().reverse().map(c => '<path class="' + classe[c.id] + '" d="' + trace(d, c.points) + '"/>').join('')
      + d.points.map((p, i) => ({ p, i })).sort((a, b) => a.p.cote - b.p.cote)
        .map(({ p, i }) => '<circle class="pcn-point' + (p.cote ? ' pcn-cote' : '') + '" data-i="' + i + '" cx="' + px(d, p.x).toFixed(1) + '" cy="' + py(d, p.y).toFixed(1) + '" r="' + (p.cote ? 4.5 : 4) + '"/>').join('')
      + '<circle class="pcn-curseur" r="8" cx="0" cy="0" hidden/></svg>';
  }

  /** La légende : toujours là, les mêmes signes que le dessin. */
  function legende(d) {
    return '<div class="pcn-legende" aria-hidden="true"><span class="pcn-l-point">jour appris</span>'
      + (d.part ? '<span class="pcn-l-cote">jour laissé de côté (' + d.part.jours + ')</span>' : '')
      + '<span class="pcn-l-retenue">la courbe retenue (' + esc(d.modele) + ')</span>' + (d.courbes.some(c => c.id === 'x-a') ? '<span class="pcn-l-xa">« × a »</span>' : '') + '</div>';
  }

  const api = { AUCUNE, L, H, parts, echelle, donnees, decrire, bulle, plusProche, svg, legende, px, py };
  if (enNode) module.exports = api;
  else root.OrlyCalageNuage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

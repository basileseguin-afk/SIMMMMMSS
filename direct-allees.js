/* ==========================================================================
 *  LES ALLÉES DU SITE — par où passent les personnes et les chariots (évolution 20 b, v1)
 *  ------------------------------------------------------------------------
 *  Quand l'utilisateur a disposé les zones (moteur/disposition.js), le site a
 *  des allées fines : une en haut, une à gauche de chaque colonne, une
 *  au-dessus de chaque rangée du bas. Les personnes et les chariots les
 *  suivent : ce module donne le chemin d'un point à un autre, par le milieu
 *  des allées, au plus court.
 *
 *  Il ne lit que le site généré. Il ne touche à rien. Les mêmes points donnent
 *  toujours le même chemin. Sans navigateur : il se teste.
 * ==========================================================================*/
(function (root) {
  'use strict';

  /** Le milieu d'une allée : un segment { sens, x0, y0, x1, y1 }, prolongé d'une demi-largeur à ses bouts pour rejoindre celles qu'elle touche. */
  function milieuDe(a, site) {
    const borner = (v, max) => Math.min(Math.max(v, 0), max);
    return a.sens === 'v'
      ? { sens: 'v', x0: a.x + a.w / 2, x1: a.x + a.w / 2, y0: borner(a.y - a.w / 2, site.profondeur), y1: borner(a.y + a.h + a.w / 2, site.profondeur) }
      : { sens: 'h', x0: borner(a.x - a.h / 2, site.largeur), x1: borner(a.x + a.w + a.h / 2, site.largeur), y0: a.y + a.h / 2, y1: a.y + a.h / 2 };
  }

  const reseaux = new WeakMap();
  /** Le réseau des allées d'un site : leurs milieux, et leurs croisements. Gardé avec le site : il ne change pas. */
  function reseauDe(site) {
    let r = reseaux.get(site);
    if (r) return r;
    const lignes = (site.allees || []).map(a => milieuDe(a, site)), noeuds = [];
    // Les croisements : un milieu vertical et un milieu horizontal qui se coupent.
    lignes.forEach((v, i) => {
      if (v.sens !== 'v') return;
      lignes.forEach((h, j) => {
        if (h.sens !== 'h') return;
        if (v.x0 >= h.x0 - 1e-9 && v.x0 <= h.x1 + 1e-9 && h.y0 >= v.y0 - 1e-9 && h.y0 <= v.y1 + 1e-9) noeuds.push({ x: v.x0, y: h.y0, lignes: [i, j] });
      });
    });
    r = { lignes, noeuds, chemins: new Map() };
    reseaux.set(site, r);
    return r;
  }

  /** Le point d'une ligne le plus proche de `p`, et sa distance. */
  function sur(l, p) {
    const x = Math.min(Math.max(p.x, l.x0), l.x1), y = Math.min(Math.max(p.y, l.y0), l.y1);
    return { x, y, d: Math.abs(p.x - x) + Math.abs(p.y - y) };
  }

  /**
   * Le chemin de `de` à `vers` par les allées du site : les points par où passer, entre les deux (sans eux). Chacun rejoint
   * d'abord le milieu de l'allée la plus proche ; puis le plus court chemin de croisement en croisement. Sans allées (le
   * site automatique) : aucun point — le chemin est direct, comme avant.
   */
  function chemin(site, de, vers) {
    if (!site || !(site.allees || []).length) return [];
    const { lignes, noeuds, chemins } = reseauDe(site);
    // Un chemin déjà cherché (de porte à porte, la scène redemande les mêmes à chaque image) est gardé avec le site.
    const cle = de.x + ',' + de.y + '>' + vers.x + ',' + vers.y, connu = chemins.get(cle);
    if (connu) return connu.map(p => ({ x: p.x, y: p.y }));
    const garder = points => { if (chemins.size > 4000) chemins.clear(); chemins.set(cle, points); return points.map(p => ({ x: p.x, y: p.y })); };
    const entree = p => { let m = null; lignes.forEach((l, i) => { const q = sur(l, p); if (!m || q.d < m.d - 1e-9) m = { ...q, ligne: i }; }); return m; };
    const a = entree(de), b = entree(vers);
    // Les nœuds : le départ, l'arrivée, les croisements. Deux nœuds d'une même ligne sont reliés, de la distance qui les sépare.
    const tous = [{ x: a.x, y: a.y, lignes: [a.ligne] }, { x: b.x, y: b.y, lignes: [b.ligne] }, ...noeuds], n = tous.length;
    const dist = Array(n).fill(Infinity), avant = Array(n).fill(-1), fait = Array(n).fill(false);
    dist[0] = 0;
    for (;;) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!fait[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u] - 1e-9)) u = i;
      if (u < 0 || u === 1) break;
      fait[u] = true;
      for (let v = 0; v < n; v++) {
        if (fait[v] || !tous[u].lignes.some(l => tous[v].lignes.includes(l))) continue;
        const d = dist[u] + Math.abs(tous[u].x - tous[v].x) + Math.abs(tous[u].y - tous[v].y);
        if (d < dist[v] - 1e-9) { dist[v] = d; avant[v] = u; }
      }
    }
    if (dist[1] === Infinity) return garder([{ x: a.x, y: a.y }, { x: b.x, y: b.y }]);
    const points = [];
    for (let i = 1; i >= 0; i = avant[i]) points.unshift({ x: tous[i].x, y: tous[i].y });
    // Sans deux points de suite au même endroit.
    return garder(points.filter((p, i) => i === 0 || Math.abs(p.x - points[i - 1].x) + Math.abs(p.y - points[i - 1].y) > 1e-9));
  }

  /** Un point est-il dans une allée du site (à `jeu` près) ? */
  const dansUneAllee = (site, p, jeu = 1e-6) => (site.allees || []).some(a => p.x >= a.x - jeu && p.x <= a.x + a.w + jeu && p.y >= a.y - jeu && p.y <= a.y + a.h + jeu);

  const api = { chemin, dansUneAllee, reseauDe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyDirectAllees = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

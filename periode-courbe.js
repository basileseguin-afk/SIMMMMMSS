/* ==========================================================================
 *  LA COURBE DE LA PÉRIODE (version 1, évolution 15 d)
 *  ------------------------------------------------------------------------
 *  Au-dessus du tableau de la page Période : la colonne « Unité » jour par
 *  jour (la mesure choisie, le total des services), et le réel s'il est
 *  importé (« Réel et calage »), pour une mesure qui se compare à des ETP par
 *  jour (personnes, besoin, charge, personnes du service). Un rond plein
 *  par jour complet, un rond creux par jour incomplet (hors des totaux) ; le
 *  trait ne relie que les jours complets qui se suivent. Le réel : un trait
 *  en tirets et des carrés, d'une encre neutre (jamais la couleur seule).
 *  La bulle suit la souris ou les flèches. Couleurs, textes et espacements :
 *  les jetons de ds.css (periode.css).
 * ==========================================================================*/
(function (root) {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const HAUT = 150, MARGE_G = 56, MARGE_D = 16, AXE = 22, LARGEUR_MIN = 480, ETIQUETTE_MIN = 44;
  const jourCourt = d => d.slice(8, 10) + '/' + d.slice(5, 7);
  const etiquette = d => JOURS[new Date(d + 'T12:00:00Z').getUTCDay()] + ' ' + jourCourt(d);
  const nombre = (x, k = 1) => (Math.round(x * 10 ** k) / 10 ** k + 0).toLocaleString('fr-FR', { maximumFractionDigits: k });

  /** Les points : un par jour de travail du bilan, la valeur de l'unité (`valeur(w)`), et le réel du jour s'il y en a ({ date, reel }). */
  function points(bilan, valeur, reel) {
    const r = new Map((reel || []).map(x => [x.date, x.reel]));
    return (bilan.joursTravail || []).map(w => ({ date: w.date, complet: !!w.complet, v: valeur(w), reel: r.has(w.date) ? r.get(w.date) : null }));
  }

  /** La bulle d'un jour : sa date, la valeur de l'unité, le réel ; un jour incomplet le dit. `o` : { ecrire }. */
  function bulle(p, o) {
    return etiquette(p.date) + ' : Unité ' + (p.v == null ? '—' : o.ecrire(p.v)) + (p.reel != null ? ' · réel ' + nombre(p.reel) + ' ETP' : '')
      + (p.complet ? '' : ' (jour incomplet, hors des totaux)');
  }

  /** La phrase qui décrit la courbe, pour qui ne la voit pas. `o` : { ecrire, nom }. */
  function decrire(pts, o) {
    const v = pts.filter(p => p.complet && p.v != null).map(p => p.v), r = pts.filter(p => p.reel != null);
    if (!pts.length) return 'Aucun jour.';
    return o.nom + ' de l’unité, jour par jour, du ' + jourCourt(pts[0].date) + ' au ' + jourCourt(pts[pts.length - 1].date)
      + (v.length ? ' : de ' + o.ecrire(Math.min(...v)) + ' à ' + o.ecrire(Math.max(...v)) + ' sur les jours complets' : '')
      + (r.length ? ' ; le réel sur ' + r.length + (r.length > 1 ? ' jours' : ' jour') : '') + '.';
  }

  /** Un trait par suite de points qui se suivent (`garde(p)` vrai) : « M … L … », coupé ailleurs. */
  function trait(pts, garde, x, y, cle) {
    let d = '', ouvert = false;
    pts.forEach((p, i) => {
      if (!garde(p)) { ouvert = false; return; }
      d += (ouvert ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p[cle]).toFixed(1);
      ouvert = true;
    });
    return d;
  }

  /** La légende : l'unité, et le réel s'il est tracé. */
  function legende(pts, o) {
    return '<div class="pvc-legende" aria-hidden="true"><span class="pvc-l-unite">' + esc(o.nom) + ' de l’unité</span>'
      + (pts.some(p => p.v != null && !p.complet) ? '<span class="pvc-l-incomplet">jour incomplet</span>' : '')
      + (pts.some(p => p.reel != null) ? '<span class="pvc-l-reel">réel (ETP, d’après la correspondance)</span>' : '') + '</div>';
  }

  /** La courbe en SVG, `o.largeur` pixels. `o` : { largeur, ecrire, nom }. */
  function courbe(pts, o) {
    if (!pts.length) return '<p class="mini-note">Aucun jour de travail : pas de courbe.</p>';
    const L = Math.max(LARGEUR_MIN, Math.round(o.largeur || 0)), n = pts.length, bande = (L - MARGE_G - MARGE_D) / n;
    const x = i => MARGE_G + bande * (i + 0.5);
    const max = Math.max(1e-9, ...pts.flatMap(p => [p.v, p.reel]).filter(v => v != null && Number.isFinite(v)));
    const y = v => 8 + (HAUT - 8) * (1 - v / max), H = HAUT + AXE;
    const pas = Math.max(1, Math.ceil(ETIQUETTE_MIN / bande));
    // Trois traits, et leurs étiquettes une seule fois chacune (de petites valeurs entières s'écriraient deux fois « 1 »).
    const vus = new Set(), graduations = (max > 1e-9 ? [0, max / 2, max] : [0]).filter(v => !vus.has(o.ecrire(v)) && vus.add(o.ecrire(v)));
    const grille = graduations.map(v => '<line class="pvc-grille" x1="' + MARGE_G + '" x2="' + (L - MARGE_D) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '"/>'
      + '<text class="pvc-echelle" x="' + (MARGE_G - 6) + '" y="' + (y(v) + 4).toFixed(1) + '">' + esc(o.ecrire(v)) + '</text>').join('');
    const ronds = pts.map((p, i) => (p.v == null ? '' : '<circle class="pvc-point' + (p.complet ? '' : ' pvc-incomplet') + '" cx="' + x(i).toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="4"/>')).join('');
    const avecReel = pts.some(p => p.reel != null);
    const reel = !avecReel ? '' : '<path class="pvc-reel" d="' + trait(pts, p => p.reel != null, x, y, 'reel') + '"/>'
      + pts.map((p, i) => (p.reel == null ? '' : '<rect class="pvc-reel-point" x="' + (x(i) - 3.5).toFixed(1) + '" y="' + (y(p.reel) - 3.5).toFixed(1) + '" width="7" height="7"/>')).join('');
    const jours = pts.map((p, i) => (i % pas ? '' : '<text class="pvc-jour" x="' + x(i).toFixed(1) + '" y="' + (H - 6) + '">' + esc(jourCourt(p.date)) + '</text>')).join('');
    return '<svg class="ds-graphique pvc-svg" width="' + L + '" height="' + H + '" viewBox="0 0 ' + L + ' ' + H + '" role="img" aria-label="' + esc(decrire(pts, o)) + '"'
      + ' data-n="' + n + '" data-gauche="' + MARGE_G + '" data-droite="' + MARGE_D + '">' + grille
      + '<path class="pvc-unite" d="' + trait(pts, p => p.complet && p.v != null, x, y, 'v') + '"/>' + reel + ronds + jours
      + '<line class="pvc-curseur" x1="0" x2="0" y1="4" y2="' + HAUT + '" hidden/></svg>';
  }

  /**
   * Peindre la courbe dans `trace` (à sa largeur), et la bulle dans `bulleEl`, qui suit la souris et les flèches. Les écouteurs
   * se posent une fois ; un nouveau dessin remplace les points qu'ils lisent. Rien ne change si rien n'a changé.
   */
  function peindre(trace, bulleEl, pts, o) {
    if (!trace) return;
    const L = trace.clientWidth || 960, cle = JSON.stringify([L, o.nom, pts]);
    trace.__courbe = { pts, o };
    if (trace.__cle !== cle) {
      trace.innerHTML = legende(pts, o) + courbe(pts, { ...o, largeur: L }); trace.__cle = cle; trace.__ici = null;
      // Un nouveau dessin (un autre réel, une autre largeur) : la bulle d'avant ne vaut plus.
      if (bulleEl) bulleEl.textContent = '';
    }
    if (trace.__suivi) return;
    trace.__suivi = true;
    const montrer = i => {
      const svg = trace.querySelector('svg'), c = trace.__courbe; if (!svg || !c || !c.pts.length) return;
      const n = c.pts.length, g = +svg.dataset.gauche, l = +svg.getAttribute('width') - g - +svg.dataset.droite;
      const j = Math.max(0, Math.min(n - 1, i)), xj = (g + l / n * (j + 0.5)).toFixed(1), curseur = svg.querySelector('.pvc-curseur');
      trace.__ici = j; curseur.setAttribute('x1', xj); curseur.setAttribute('x2', xj); curseur.removeAttribute('hidden');
      // La bulle est lue à voix haute : réécrite seulement quand elle change.
      const texte = bulle(c.pts[j], c.o);
      if (bulleEl && bulleEl.textContent !== texte) bulleEl.textContent = texte;
    };
    trace.addEventListener('mousemove', e => {
      const svg = trace.querySelector('svg'), c = trace.__courbe; if (!svg || !c) return;
      const r = svg.getBoundingClientRect(), g = +svg.dataset.gauche, l = r.width - g - +svg.dataset.droite;
      montrer(Math.floor((e.clientX - r.left - g) / l * c.pts.length));
    });
    trace.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault(); montrer((trace.__ici ?? -1) + (e.key === 'ArrowRight' ? 1 : -1));
    });
    if (root.ResizeObserver) {
      let l = trace.clientWidth;
      new root.ResizeObserver(() => { if (trace.clientWidth && trace.clientWidth !== l) { l = trace.clientWidth; const c = trace.__courbe; peindre(trace, bulleEl, c.pts, c.o); } }).observe(trace);
    }
  }

  const api = { points, bulle, decrire, legende, courbe, peindre, etiquette };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyPeriodeCourbe = api;
})(typeof window !== 'undefined' ? window : globalThis);

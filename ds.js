/* ==========================================================================
 *  LES COMPOSANTS QUI ONT BESOIN D'UN PEU DE SCRIPT (refonte du 08/10, étape 9)
 *
 *  • L'infobulle des graphiques. Survoler une barre du planning, un avion de
 *    la frise ou un stock ouvre tout de suite une bulle qui dit ce qu'il
 *    porte (son `data-info`, sur plusieurs lignes si besoin). Le <title> des
 *    SVG mettait une seconde à venir, et ne se mettait pas en forme. Seuls
 *    les graphiques qui la demandent (classe `ds-graphique`) en ont une.
 *  • Le trait « maintenant » : l'heure où en est le rejeu, sur chaque
 *    graphique qui a un axe du temps. Le graphique le déclare :
 *        data-axe="t0 t1 x0 x1 y0 y1"   (minutes, puis unités du dessin)
 *        data-axe-etiquette="bas"       (l'heure sous le trait ; « aucune » :
 *                                        le trait seul ; par défaut, en haut)
 *    Le trait n'apparaît qu'une fois le rejeu lancé ou déplacé.
 *  Rien n'est calculé ici : on dessine ce que les vues donnent.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const hhmm = t => (root.MoteurProduction ? root.MoteurProduction.hhmm(t) : String(Math.round(t)));

  /* ---- l'infobulle ---------------------------------------------------- */

  let bulle = null, porteurActuel = null;

  function laBulle() {
    if (!bulle) {
      bulle = document.createElement('div');
      bulle.className = 'ds-infobulle';
      bulle.setAttribute('role', 'tooltip');
      bulle.hidden = true;
      document.body.appendChild(bulle);
    }
    return bulle;
  }

  /** L'élément survolé qui a quelque chose à dire, dans un graphique qui le veut. */
  function porteur(n) {
    if (!n || n.nodeType !== 1) return null;
    const p = n.closest('[data-info]');
    return p && p.closest('.ds-graphique') ? p : null;
  }

  /** La bulle suit le pointeur, en bas à droite ; elle se retourne au bord de la fenêtre. */
  function placer(x, y) {
    const b = laBulle(), w = b.offsetWidth, h = b.offsetHeight;
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    let gauche = x + 14, haut = y + 18;
    if (gauche + w > vw - 8) gauche = Math.max(8, x - 14 - w);
    if (haut + h > vh - 8) haut = Math.max(8, y - 12 - h);
    b.style.left = Math.round(gauche) + 'px';
    b.style.top = Math.round(haut) + 'px';
  }

  function montrer(p, x, y) {
    const b = laBulle();
    porteurActuel = p;
    b.textContent = p.getAttribute('data-info');
    b.hidden = false;
    placer(x, y);
  }

  function cacher() {
    porteurActuel = null;
    if (bulle) bulle.hidden = true;
  }

  function brancherInfobulle() {
    document.addEventListener('pointerover', e => {
      const p = porteur(e.target);
      if (p === porteurActuel) return;
      if (p && p.getAttribute('data-info')) montrer(p, e.clientX, e.clientY); else cacher();
    });
    document.addEventListener('pointermove', e => {
      if (!porteurActuel) return;
      // Le graphique a été redessiné sous le pointeur : la bulle n'a plus d'objet.
      if (!porteurActuel.isConnected) { cacher(); return; }
      placer(e.clientX, e.clientY);
    }, { passive: true });
    document.addEventListener('pointerout', e => { if (!e.relatedTarget) cacher(); });
    // La page défile, ou l'on clique : la bulle se ferme plutôt que de flotter ailleurs.
    document.addEventListener('scroll', cacher, true);
    document.addEventListener('pointerdown', cacher, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') cacher(); });
  }

  /* ---- le trait « maintenant » ---------------------------------------- */

  let heure = null;

  /** Largeur d'un texte de 11 px, à peu près : de quoi savoir s'il tient. */
  function largeurTexte(s, taille = 11) {
    let n = 0;
    for (const c of String(s)) n += /[il.,:;'’·!|/ ()-]/.test(c) ? 0.34 : /[A-Z0-9]/.test(c) ? 0.68 : /[mw]/.test(c) ? 0.86 : 0.57;
    return n * taille;
  }

  /**
   * Les repères de l'axe (classe `ds-axe-heure`) que l'heure du trait chevauche
   * s'effacent : « 0 08:10 » ne se lirait pas. Sans trait, tous reviennent.
   */
  function degager(svg, de, a) {
    for (const tx of svg.querySelectorAll('.ds-axe-heure')) {
      const cx = +tx.getAttribute('x'), lw = largeurTexte(tx.textContent, 12), ancre = tx.getAttribute('text-anchor') || 'middle';
      const g = ancre === 'end' ? cx - lw : ancre === 'start' ? cx : cx - lw / 2;
      tx.classList.toggle('ds-sous-maintenant', de != null && g < a && g + lw > de);
    }
  }

  function poserTrait(svg) {
    const axe = (svg.getAttribute('data-axe') || '').split(' ').map(Number);
    const [t0, t1, x0, x1, y0, y1] = axe;
    let g = svg.querySelector(':scope > .ds-maintenant');
    const t = heure;
    if (t == null || axe.length < 6 || axe.some(v => !Number.isFinite(v)) || !(t1 > t0) || t < t0 || t > t1) {
      if (g) { g.remove(); degager(svg, null, null); }
      return;
    }
    if (!g) {
      g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'ds-maintenant');
      g.setAttribute('aria-hidden', 'true');
      g.innerHTML = '<line/><rect rx="4"/><text/>';
    }
    // Toujours au-dessus de ce que le graphique a dessiné.
    if (g !== svg.lastElementChild) svg.appendChild(g);
    const x = x0 + (t - t0) / (t1 - t0) * (x1 - x0);
    const [ligne, fond, texte] = g.children;
    ligne.setAttribute('x1', x); ligne.setAttribute('x2', x);
    ligne.setAttribute('y1', y0); ligne.setAttribute('y2', y1);
    const ou = svg.getAttribute('data-axe-etiquette');
    if (ou === 'aucune') { fond.setAttribute('width', 0); texte.textContent = ''; return; }
    const mot = hhmm(t), w = largeurTexte(mot) + 12, h = 15;
    const vb = svg.viewBox && svg.viewBox.baseVal, large = vb && vb.width ? vb.x + vb.width : x1;
    const gauche = Math.max(vb ? vb.x : 0, Math.min(large - w, x - w / 2));
    const haut = ou === 'bas' ? y1 + 1 : Math.max(0, y0 - h - 1);
    fond.setAttribute('x', gauche); fond.setAttribute('y', haut);
    fond.setAttribute('width', w); fond.setAttribute('height', h);
    texte.setAttribute('x', gauche + w / 2); texte.setAttribute('y', haut + 11);
    texte.textContent = mot;
    degager(svg, gauche - 3, gauche + w + 3);
  }

  /**
   * L'heure rejouée, sur tous les graphiques qui ont un axe du temps.
   * `t` : l'heure en minutes, ou null quand le rejeu n'a pas commencé.
   * Sans argument : on repose le trait (un graphique vient d'être redessiné).
   */
  function maintenant(t) {
    if (arguments.length) heure = t != null && Number.isFinite(+t) ? +t : null;
    if (typeof document === 'undefined') return;
    for (const svg of document.querySelectorAll('svg[data-axe]')) poserTrait(svg);
  }

  const api = { maintenant, largeurTexte, cacherInfobulle: cacher, get heure() { return heure; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.OrlyDS = api;
    if (typeof document !== 'undefined') brancherInfobulle();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==========================================================================
 *  LA BARRE DU TEMPS DE LA VUE EN DIRECT (évolution 16 e, v1)
 *  ------------------------------------------------------------------------
 *  Sous la scène, la journée rejouée d'un coup d'œil, sur un seul axe du
 *  temps :
 *    — les personnes au travail dans l'unité (une aire) ;
 *    — dessous, sur sa propre échelle, les arrivages en attente (une ligne en
 *      marches) : deux petites courbes l'une sous l'autre, jamais deux
 *      échelles sur le même tracé ;
 *    — un repère par départ de vol (plus haut et critique s'il est en retard) ;
 *    — les jours marqués (« J−1 », « J », « J+1 ») ;
 *    — l'heure rejouée : un trait qu'on déplace à la souris, au doigt, ou aux
 *      flèches du clavier (15 min ; Maj : 1 h ; Début, Fin).
 *  Ce module ne calcule rien : la page lui donne la frise lue dans la journée
 *  (direct-lire.js) et l'heure rejouée ; il dessine et rend l'heure choisie.
 *  Couleurs : les jetons de ds.css (direct.css).
 * ==========================================================================*/
(function (root) {
  'use strict';

  /** La barre : sa marge à gauche (les légendes), ses bandes de haut en bas (px). */
  const MARGE = { gauche: 118, droite: 12 }, BANDES = { vols: { y: 2, h: 9 }, travail: { y: 13, h: 26 }, attente: { y: 42, h: 11 }, jours: { y: 55, h: 10 } }, HAUTEUR = 66;
  /** Un pas au clavier (min) ; avec Maj. */
  const PAS_CLAVIER = 15, GRAND_PAS = 60;
  const fini = x => Number.isFinite(x);
  const net = x => Math.round(x * 10) / 10;
  const esc = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hhmm = t => { const m = ((Math.round(t) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  /** « J 09:20 », « J−1 22:00 » : l'heure, avec son jour. */
  const quand = t => { const j = Math.floor(Math.round(t) / 1440); return (j === 0 ? 'J' : 'J' + (j > 0 ? '+' : '−') + Math.abs(j)) + ' ' + hhmm(t); };

  /**
   * La géométrie de la barre pour une largeur (sans navigateur) : l'échelle du temps (`x(t)`, `tDe(x)`), le tracé de
   * l'aire des personnes au travail, la ligne en marches des arrivages en attente, les repères des vols, les jours.
   * `frise` : direct-lire.js. Rend null si la barre n'a pas de place.
   */
  function geometrie(frise, largeur) {
    const x0 = MARGE.gauche, x1 = largeur - MARGE.droite;
    if (!frise || !(x1 - x0 > 20) || !(frise.a > frise.de)) return null;
    const x = t => x0 + (t - frise.de) / (frise.a - frise.de) * (x1 - x0), tDe = X => frise.de + (Math.max(x0, Math.min(x1, X)) - x0) / (x1 - x0) * (frise.a - frise.de);
    const B = BANDES, n = frise.auTravail.length, pas = frise.pas;
    // L'aire : une marche par créneau, sa hauteur proportionnelle aux personnes au travail (le plus haut créneau remplit la bande).
    const hT = v => (frise.maxTravail > 0 ? v / frise.maxTravail * B.travail.h : 0), bas = B.travail.y + B.travail.h;
    let aire = 'M' + net(x(frise.de)) + ' ' + bas;
    for (let i = 0; i < n; i++) { const y = net(bas - hT(frise.auTravail[i])); aire += ' L' + net(x(frise.de + i * pas)) + ' ' + y + ' L' + net(x(frise.de + (i + 1) * pas)) + ' ' + y; }
    aire += ' L' + net(x(frise.a)) + ' ' + bas + ' Z';
    // La ligne des arrivages en attente : en marches, sur sa propre bande.
    const hA = v => (frise.maxAttente > 0 ? v / frise.maxAttente * (B.attente.h - 2) : 0), basA = B.attente.y + B.attente.h - 1;
    let ligne = '';
    for (let i = 0; i < n; i++) { const y = net(basA - hA(frise.enAttente[i])); ligne += (i ? ' L' : 'M') + net(x(frise.de + i * pas)) + ' ' + y + ' L' + net(x(frise.de + (i + 1) * pas)) + ' ' + y; }
    return { x0, x1, x, tDe, largeur, hauteur: HAUTEUR, aire, ligne, bas, basA,
      vols: frise.vols.map(v => ({ id: v.id, t: v.t, x: net(x(v.t)), enRetard: v.enRetard })),
      jours: frise.jours.map(j => ({ jour: j.jour, mot: j.mot, x0: net(x(Math.max(j.de, frise.de))), x1: net(x(Math.min(j.a, frise.a))) })) };
  }

  /** Ce que dit la barre à une heure : les personnes au travail et les arrivages en attente de son créneau. */
  function valeursA(frise, t) {
    if (!frise || !fini(t)) return null;
    const i = Math.max(0, Math.min(frise.auTravail.length - 1, Math.floor((t - frise.de) / frise.pas)));
    return { auTravail: Math.round(frise.auTravail[i]), enAttente: frise.enAttente[i] };
  }
  const pluriel = (n, un, plusieurs) => n + ' ' + (n >= 2 ? plusieurs : un);
  /** « J 09:20 — 12 personnes au travail, 1 arrivage en attente » : l'heure rejouée, en clair. */
  function enClair(frise, t) {
    const v = valeursA(frise, t);
    return v ? quand(t) + ' — ' + pluriel(v.auTravail, 'personne au travail', 'personnes au travail') + ', ' + pluriel(v.enAttente, 'arrivage en attente', 'arrivages en attente') : '';
  }

  /** Le dessin de la barre, en SVG (sans navigateur) : les jours, l'aire, la ligne, les repères des vols, les légendes. */
  function svg(frise, g) {
    const B = BANDES, l = [];
    l.push('<svg class="dt-svg" width="' + g.largeur + '" height="' + g.hauteur + '" viewBox="0 0 ' + g.largeur + ' ' + g.hauteur + '" aria-hidden="true" focusable="false">');
    // Les jours : une bande sur deux, et leur nom.
    for (const [i, j] of g.jours.entries()) {
      if (i % 2 === 1) l.push('<rect class="dt-jour-fond" x="' + j.x0 + '" y="0" width="' + net(j.x1 - j.x0) + '" height="' + g.hauteur + '"/>');
      if (i) l.push('<line class="dt-jour-trait" x1="' + j.x0 + '" y1="0" x2="' + j.x0 + '" y2="' + g.hauteur + '"/>');
      if (j.x1 - j.x0 > 26) l.push('<text class="dt-jour" x="' + net(j.x0 + 4) + '" y="' + (B.jours.y + 8) + '">' + esc(j.mot) + '</text>');
    }
    l.push('<line class="dt-base" x1="' + g.x0 + '" y1="' + g.bas + '" x2="' + g.x1 + '" y2="' + g.bas + '"/>');
    l.push('<path class="dt-aire" d="' + g.aire + '"/>');
    l.push('<line class="dt-base" x1="' + g.x0 + '" y1="' + (g.basA + 0.5) + '" x2="' + g.x1 + '" y2="' + (g.basA + 0.5) + '"/>');
    if (g.ligne) l.push('<path class="dt-ligne" d="' + g.ligne + '"/>');
    // Un repère par départ de vol : un trait ; en retard, plus haut, plus épais, critique — pas seulement une couleur.
    for (const v of g.vols) l.push('<line class="dt-vol' + (v.enRetard ? ' dt-vol-retard' : '') + '" data-vol="' + esc(v.id) + '" x1="' + v.x + '" y1="' + (v.enRetard ? B.vols.y : B.vols.y + 4) + '" x2="' + v.x + '" y2="' + (B.vols.y + B.vols.h) + '"/>');
    // Les légendes, à gauche : ce que montre chaque bande, et son plus haut.
    l.push('<text class="dt-legende" x="6" y="' + (B.vols.y + 9) + '">départs des vols</text>');
    l.push('<text class="dt-legende" x="6" y="' + (B.travail.y + 12) + '">au travail</text><text class="dt-max" x="6" y="' + (B.travail.y + 24) + '">' + esc(Math.round(frise.maxTravail) + ' au plus') + '</text>');
    l.push('<text class="dt-legende" x="6" y="' + (B.attente.y + 10) + '">arrivages en attente</text>');
    l.push('</svg>');
    return l.join('');
  }

  /**
   * Crée la barre dans `hote`. `a` : { lire, allerA } — `lire()` rend { frise, t } ; `allerA(t)` déplace l'heure rejouée.
   * Rend { rendre(), etat() }.
   */
  function creer(hote, a) {
    const piste = hote.querySelector('.dt-piste') || hote, curseur = hote.querySelector('.dt-curseur'), bulle = hote.querySelector('.dt-bulle');
    const b = { frise: null, t: null, g: null, largeur: 0 };
    let glisse = false;

    function dessiner() {
      const largeur = Math.round(piste.clientWidth);
      b.g = geometrie(b.frise, largeur); b.largeur = largeur;
      const ancien = piste.querySelector('.dt-svg'); if (ancien) ancien.remove();
      if (b.g) piste.insertAdjacentHTML('afterbegin', svg(b.frise, b.g));
      placer();
    }
    /** Le trait de l'heure rejouée, et ce que la barre annonce (pour un lecteur d'écran). */
    function placer() {
      if (!curseur) return;
      const ok = b.g && fini(b.t);
      curseur.hidden = !ok;
      if (ok) curseur.style.transform = 'translateX(' + net(b.g.x(Math.max(b.frise.de, Math.min(b.frise.a, b.t)))) + 'px)';
      hote.setAttribute('aria-valuemin', b.frise ? String(Math.round(b.frise.de)) : '0');
      hote.setAttribute('aria-valuemax', b.frise ? String(Math.round(b.frise.a)) : '0');
      hote.setAttribute('aria-valuenow', fini(b.t) ? String(Math.round(b.t)) : '0');
      hote.setAttribute('aria-valuetext', ok ? enClair(b.frise, b.t) : 'aucune journée à rejouer');
    }
    function rendre() {
      if (hote.offsetParent === null) return;
      const x = a.lire() || {};
      const change = x.frise !== b.frise || Math.round(piste.clientWidth) !== b.largeur;
      b.frise = x.frise || null; b.t = x.t;
      if (change) dessiner(); else placer();
    }

    const tSous = e => (b.g ? b.g.tDe(e.clientX - piste.getBoundingClientRect().left) : null);
    piste.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const t = tSous(e); if (t === null) return;
      glisse = true; try { piste.setPointerCapture(e.pointerId); } catch (x) { /* un pointeur déjà relâché */ }
      hote.focus({ preventScroll: true }); a.allerA(t);
    });
    piste.addEventListener('pointermove', e => {
      const t = tSous(e); if (t === null) return;
      if (glisse) a.allerA(t);
      if (bulle) { bulle.textContent = enClair(b.frise, t); bulle.hidden = false; bulle.style.transform = 'translateX(' + net(Math.max(b.g.x0, Math.min(b.g.x1 - 200, e.clientX - piste.getBoundingClientRect().left + 8))) + 'px)'; }
    });
    const fin = () => { glisse = false; };
    piste.addEventListener('pointerup', fin); piste.addEventListener('pointercancel', fin);
    piste.addEventListener('pointerleave', () => { if (bulle) bulle.hidden = true; });
    /* Au clavier : les flèches déplacent l'heure (15 min ; avec Maj, une heure) ; Début et Fin vont aux bouts. */
    hote.addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey || !b.frise || !fini(b.t)) return;
      const pas = e.shiftKey ? GRAND_PAS : PAS_CLAVIER;
      const t = { ArrowLeft: b.t - pas, ArrowDown: b.t - pas, ArrowRight: b.t + pas, ArrowUp: b.t + pas, PageDown: b.t - GRAND_PAS, PageUp: b.t + GRAND_PAS, Home: b.frise.de, End: b.frise.a }[e.key];
      if (t === undefined) return;
      e.preventDefault(); e.stopPropagation(); a.allerA(t);
    });
    if (typeof root.ResizeObserver === 'function') new root.ResizeObserver(() => rendre()).observe(piste);

    const etat = () => ({ t: b.t, largeur: b.largeur, de: b.frise ? b.frise.de : null, a: b.frise ? b.frise.a : null, x: b.g && fini(b.t) ? b.g.x(b.t) : null, x0: b.g ? b.g.x0 : null, x1: b.g ? b.g.x1 : null,
      vols: b.g ? b.g.vols.map(v => ({ ...v })) : [], jours: b.g ? b.g.jours.map(j => j.mot) : [], maxTravail: b.frise ? b.frise.maxTravail : null, maxAttente: b.frise ? b.frise.maxAttente : null,
      texte: hote.getAttribute('aria-valuetext') });
    return { rendre, etat };
  }

  const api = { MARGE, BANDES, HAUTEUR, PAS_CLAVIER, GRAND_PAS, geometrie, valeursA, enClair, quand, svg, creer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyDirectTemps = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

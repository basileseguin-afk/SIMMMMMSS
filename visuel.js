/* ==========================================================================
 *  LE VISUEL DE LA VERSION 1 (évolution 25) : ce que la feuille ne sait pas
 *  dire seule. Chargé par la version 1 seule, comme visuel.css ; il ne lit ni
 *  n'écrit aucune donnée, et ne change aucun texte de la page.
 *
 *  (b) L'ombre de la barre du haut n'apparaît que quand un contenu défile
 *      dessous : `data-defile-sous-la-barre` sur <body>, que la feuille lit.
 * ==========================================================================*/
(function (root) {
  'use strict';
  const NODE = typeof module !== 'undefined' && module.exports && typeof window === 'undefined';

  /**
   * Un contenu défile-t-il sous la barre du haut ? Oui quand une zone qui a défilé commence au bord bas de la barre :
   * ce qu'elle a fait défiler est passé dessous. Une zone plus bas dans la page (une liste, une fiche, un tableau sous
   * le titre de la page) défile sous ce qui la précède, pas sous la barre.
   * @param {{bas:number}} barre  le bord bas de la barre du haut
   * @param {{haut:number, defile:number}[]} zones  les zones qui défilent : leur bord haut, de combien elles ont défilé
   */
  function defileSousLaBarre(barre, zones) {
    return zones.some(z => z.defile > 0 && Math.abs(z.haut - barre.bas) <= 1);
  }

  const api = { defileSousLaBarre };
  if (NODE) { module.exports = api; return; }
  root.OrlyVisuel = api;

  const d = root.document;
  /** Les zones qui ont défilé, relevées à l'instant : peu nombreuses (la page ne défile pas, ses zones si). */
  const defilees = new Set();
  function dire() {
    const barre = d.querySelector('body>.haut'); if (!barre) return;
    const bas = barre.getBoundingClientRect().bottom, zones = [];
    for (const z of defilees) {
      if (!z.isConnected || z.scrollTop <= 0) { defilees.delete(z); continue; }
      zones.push({ haut: z.getBoundingClientRect().top, defile: z.scrollTop });
    }
    const oui = defileSousLaBarre({ bas }, zones);
    if (oui !== d.body.hasAttribute('data-defile-sous-la-barre')) d.body.toggleAttribute('data-defile-sous-la-barre', oui);
  }
  // « scroll » ne remonte pas : on l'écoute à la descente, pour toute zone de la page.
  d.addEventListener('scroll', e => { const z = e.target; if (z && z.nodeType === 1) { defilees.add(z); dire(); } }, { capture: true, passive: true });
  // Une autre page s'ouvre, la fenêtre change de taille : la zone qui avait défilé n'est peut-être plus là.
  root.addEventListener('resize', dire);
  d.addEventListener('click', () => root.requestAnimationFrame(dire), true);
})(typeof window !== 'undefined' ? window : globalThis);

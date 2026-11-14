/* ==========================================================================
 *  LA VUE EN DIRECT, EN RELIEF (évolution 16 b, v1)
 *  ------------------------------------------------------------------------
 *  La scène générée (moteur/site.js, direct-scene.js) se dessine dans un
 *  canvas 2D (direct-dessin.js), vue par une caméra qu'on déplace
 *  (direct-camera.js) :
 *    — glisser déplace ; Maj + glisser, ou le bouton droit, tourne et
 *      incline ; la molette zoome ; au doigt, un doigt déplace, deux doigts
 *      zooment et tournent ;
 *    — au clavier : les flèches ou ZQSD déplacent, A et E tournent, + et −
 *      zooment, 0 montre tout ;
 *    — à l'écran : tourner à gauche, à droite, incliner, −, +, « Cadrer » (le
 *      service choisi), « Tout voir ».
 *  À l'ouverture et sur « Tout voir », la caméra revient à l'angle de la
 *  maquette et la scène entière tient dans la zone visible, à 24 px de ses
 *  bords ; tant qu'on n'a ni déplacé ni zoomé, elle y tient encore à tout
 *  angle. Avec « réduire les animations », la caméra change d'angle d'un coup.
 *
 *  Ce module ne calcule rien de la journée : la page lui donne le site, la
 *  journée lue et l'heure rejouée (`lire`), il dessine.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const C = () => root.OrlyDirectCamera, D = () => root.OrlyDirectScene, G = () => root.OrlyDirectDessin, E = () => root.OrlyDirectEtat;

  /** Les bandes de la toile gardées libres : en haut pour les étiquettes du fond, en bas pour les commandes. */
  const BANDES = { haut: 44, bas: 48, gauche: 0, droite: 0 };
  /** La durée d'un changement d'angle animé (ms) ; un pas de déplacement au clavier (px) ; les degrés par pixel glissé. */
  const DUREE = 240, PAS_PX = 48, CAP_PAR_PX = 0.4, SITE_PAR_PX = 0.3;
  /** Le sol : le ton de chaque sorte de sol. */
  const TON_SOL = { site: 'sol', couloir: 'couloir', pause: 'pause', zone: 'zone' };

  /**
   * Crée la vue dans `hote` (qui contient le canvas et les boutons). `a` : { lire, choisir } —
   * `lire()` rend { site, journee, t, selection } ; `choisir(service)` choisit un service (un clic sur sa zone).
   */
  function creer(hote, a) {
    const toile = hote.querySelector('canvas'), ctx = toile.getContext('2d');
    const v = { cam: C().camera(), ajustee: true, site: null, decor: null, journee: null, etat: null, t: null, selection: null, pal: null, poses: [], extras: null,
      stats: { images: 0, ms: 0, dernier: 0 } };
    let ecran = { w: 0, h: 0, ...BANDES }, image = 0, anim = null, boites = null, cleBoites = '', perime = true;
    const largeurs = new Map(), pointeurs = new Map();
    let geste = null;

    const immobile = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const visible = () => hote.offsetParent !== null && toile.clientWidth > 0 && toile.clientHeight > 0;
    const boite = () => D().boite(v.site);
    const demander = () => { if (!image) image = root.requestAnimationFrame(dessiner); };

    /** La largeur d'un texte d'étiquette, mesurée une fois. */
    const mesure = (texte, gras) => {
      const k = (gras ? 'g' : 'n') + texte; let w = largeurs.get(k);
      if (w == null) { if (largeurs.size > 4000) largeurs.clear(); ctx.font = G().police(gras ? D().ETIQUETTE.titre : D().ETIQUETTE.ligne, gras); w = ctx.measureText(texte).width; largeurs.set(k, w); }
      return w;
    };

    /** La toile à la taille de sa place, nette sur un écran dense ; la scène cadrée s'y recadre. */
    function taille() {
      const r = root.devicePixelRatio || 1, w = toile.clientWidth, h = toile.clientHeight;
      if (toile.width !== Math.round(w * r) || toile.height !== Math.round(h * r)) { toile.width = Math.round(w * r); toile.height = Math.round(h * r); }
      if (w !== ecran.w || h !== ecran.h) {
        ecran = { w, h, ...BANDES };
        if (v.ajustee && v.site) { v.cam = C().cadrer(anim ? anim.a : v.cam, ecran, boite()); anim = null; }
      }
    }

    /* ---- la caméra ---------------------------------------------------------- */

    const but = () => (anim ? anim.a : v.cam);
    /** Va à une caméra : d'un coup, ou en glissant (sauf avec « réduire les animations »). */
    function allerA(cible, anime) {
      if (anime && !immobile() && visible()) anim = { de: v.cam, a: cible, t0: root.performance.now() };
      else { anim = null; v.cam = cible; }
      demander();
    }
    const recadree = c => (v.ajustee && v.site ? C().cadrer(c, ecran, boite()) : c);
    const tourner = (d, anime) => allerA(recadree(C().tourner(but(), d)), anime);
    const incliner = (d, anime) => allerA(recadree(C().incliner(but(), d)), anime);
    function zoomer(f, X, Y, anime) { v.ajustee = false; allerA(C().zoomer(but(), ecran, f, X, Y), anime); }
    function deplacer(dX, dY, anime) { v.ajustee = false; allerA(C().deplacer(but(), ecran, dX, dY), anime); }
    /** « Tout voir » : l'angle de la maquette, la scène entière à 24 px des bords. */
    function toutVoir(anime) {
      v.ajustee = true;
      if (!v.site) { demander(); return; }
      allerA(C().cadrer(C().camera({ cap: C().CAP_MAQUETTE, site: C().SITE_MAQUETTE }), ecran, boite()), anime);
    }
    /** « Cadrer » : la zone du service choisi, à l'angle courant ; sans service choisi, tout. */
    function cadrer(anime) {
      const z = v.selection && v.site && D().zoneDuService(v.site, v.selection);
      if (!z) return toutVoir(anime);
      v.ajustee = false;
      allerA(C().cadrer(but(), ecran, D().boiteDeZone(z)), anime);
    }

    /* ---- les données ---------------------------------------------------------- */

    /** Relit ce que la page donne et dessine. Cachée, la vue ne lit rien : elle relira en redevenant visible. */
    function rendre() {
      if (!visible()) { perime = true; return; }
      relire(); demander();
    }
    /** Ce que la page donne : le site (un site nouveau se cadre en entier), la journée lue, l'heure rejouée, le service choisi. */
    function relire() {
      perime = false;
      const x = a.lire() || {};
      if (x.site !== v.site) {
        v.site = x.site || null; v.decor = v.site ? D().decor(v.site) : null; boites = null;
        v.ajustee = true; anim = null;
        if (v.site && ecran.w) v.cam = C().cadrer(C().camera({ cap: C().CAP_MAQUETTE, site: C().SITE_MAQUETTE }), ecran, boite());
      }
      if (x.journee !== v.journee || x.t !== v.t) { v.journee = x.journee || null; v.t = x.t; v.etat = v.journee && Number.isFinite(x.t) ? E().etatA(v.journee, x.t) : null; }
      v.selection = x.selection || null;
    }

    /* ---- le dessin ------------------------------------------------------------ */

    function objet(o, p, devant, pal) {
      if (o.quoi === 'personne') G().personne(ctx, p, o.x, o.y, pal.c(o.ton), pal.ton(o.ton, 0.35), pal.c('peau'), pal.voile('texte', 0.16), o.bob);
      else if (o.quoi === 'chariot') G().chariot(ctx, p, devant, o.x, o.y, pal.boite(o.ton));
      else G().boite(ctx, p, devant, o.bx, o.by, o.z, o.w, o.d, o.h, pal.boite(o.ton));
    }

    function dessiner(ts) {
      image = 0;
      if (!visible()) return;
      if (!v.pal) v.pal = G().palette(hote);
      taille();
      if (perime) relire();
      if (anim) {
        const k = Math.min(1, (ts - anim.t0) / DUREE);
        if (k >= 1 || !(k >= 0)) { v.cam = anim.a; anim = null; } else { v.cam = C().entre(anim.de, anim.a, 1 - Math.pow(1 - k, 3)); demander(); }
      }
      const t0 = root.performance.now(), r = root.devicePixelRatio || 1, pal = v.pal;
      ctx.setTransform(r, 0, 0, r, 0, 0);
      ctx.fillStyle = pal.c('fond'); ctx.fillRect(0, 0, ecran.w, ecran.h);
      v.poses = [];
      if (!v.site || !v.site.zones.length) {
        ctx.fillStyle = pal.c('texte2'); ctx.font = G().police(13, false); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('Aucun atelier à montrer : décrivez votre unité dans « Équipes ».', ecran.w / 2, ecran.h / 2);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        return;
      }
      const p = C().projecteur(v.cam, ecran), devant = C().facesDevant(v.cam), fond = C().mursDuFond(v.cam);
      for (const s of v.decor.sols) G().sol(ctx, p, s.x, s.y, s.w, s.d, pal.c(TON_SOL[s.ton]), s.ton === 'zone' || s.ton === 'pause' ? pal.c('bordure') : null, 1);
      const choisie = v.selection ? D().zoneDuService(v.site, v.selection) : null;
      if (choisie) G().sol(ctx, p, choisie.x, choisie.y, choisie.w, choisie.h, pal.voile('choisi', 0.12), pal.c('choisi'), 2);
      const cle = [fond.x0, fond.x1, fond.y0, fond.y1].map(Number).join('');
      if (!boites || cle !== cleBoites) { boites = D().boitesDe(v.decor, fond, C().decouper); cleBoites = cle; }
      const extras = v.extras ? v.extras(v) : null;
      for (const o of C().ordre(v.cam, extras && extras.length ? boites.concat(extras) : boites)) objet(o, p, devant, pal);
      v.poses = D().poserEtiquettes(D().etiquettes(v.site, v.etat), v.cam, ecran, mesure);
      const style = { fond: pal.c('etiquette'), bordure: pal.c('bordure'), titre: pal.c('texte'), texte: pal.c('texte2'), epaisseur: 1 };
      const styleChoisi = { ...style, bordure: pal.c('choisi'), epaisseur: 2 };
      for (const e of v.poses) G().etiquette(ctx, e, choisie && e.id === choisie.id ? styleChoisi : style, D().ETIQUETTE);
      const ms = root.performance.now() - t0, s = v.stats;
      s.images++; s.ms = s.ms ? s.ms * 0.9 + ms * 0.1 : ms; s.dernier = ms;
    }

    /* ---- les gestes ------------------------------------------------------------ */

    const ou = e => { const b = toile.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
    toile.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
      try { toile.setPointerCapture(e.pointerId); } catch (x) { /* un pointeur déjà relâché */ }
      const q = ou(e); pointeurs.set(e.pointerId, q);
      if (pointeurs.size === 1) geste = { mode: e.shiftKey || e.button === 2 ? 'tourner' : 'deplacer', x: q.x, y: q.y, bouge: 0, souris: e.pointerType === 'mouse' };
      else if (pointeurs.size === 2) {
        const [p1, p2] = [...pointeurs.values()];
        geste = { mode: 'pince', d: Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1, a: Math.atan2(p2.y - p1.y, p2.x - p1.x), bouge: 99 };
      }
      toile.classList.add('saisie');
    });
    toile.addEventListener('pointermove', e => {
      if (!geste || !pointeurs.has(e.pointerId)) return;
      const q = ou(e), avant = pointeurs.get(e.pointerId); pointeurs.set(e.pointerId, q);
      if (geste.mode === 'pince') {
        if (pointeurs.size < 2) return;
        const [p1, p2] = [...pointeurs.values()], d = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1, ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        v.ajustee = false; anim = null;
        v.cam = C().tourner(C().zoomer(v.cam, ecran, d / geste.d, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2), (ang - geste.a) * 180 / Math.PI);
        geste.d = d; geste.a = ang; demander();
        return;
      }
      const dx = q.x - avant.x, dy = q.y - avant.y;
      geste.bouge += Math.abs(dx) + Math.abs(dy);
      if (geste.bouge < 4) return;
      anim = null;
      if (geste.mode === 'tourner') v.cam = recadree(C().incliner(C().tourner(v.cam, dx * CAP_PAR_PX), dy * SITE_PAR_PX));
      else { v.ajustee = false; v.cam = C().deplacer(v.cam, ecran, dx, dy); }
      demander();
    });
    const lacher = e => {
      const q = pointeurs.get(e.pointerId); pointeurs.delete(e.pointerId);
      if (!pointeurs.size) toile.classList.remove('saisie');
      if (!geste) return;
      const clic = e.type === 'pointerup' && geste.mode !== 'pince' && geste.bouge < 4 && q && !(geste.souris && e.button !== 0);
      if (!pointeurs.size) geste = null; else if (geste.mode === 'pince') { const r = [...pointeurs.values()][0]; geste = { mode: 'deplacer', x: r.x, y: r.y, bouge: 99 }; }
      // Un clic sans glisser sur une zone choisit son service.
      if (clic && v.site && a.choisir) { const z = D().zoneSous(v.site, C().auSol(v.cam, ecran, q.x, q.y)); if (z) a.choisir(z.services.includes(v.selection) ? v.selection : z.services[0] || z.id); }
    };
    toile.addEventListener('pointerup', lacher);
    toile.addEventListener('pointercancel', lacher);
    toile.addEventListener('contextmenu', e => e.preventDefault());
    toile.addEventListener('wheel', e => { e.preventDefault(); const q = ou(e); zoomer(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), q.x, q.y, false); }, { passive: false });

    /* Au clavier : les flèches ou ZQSD déplacent, A et E tournent, + et − zooment, 0 montre tout. */
    const TOUCHES = {
      ArrowLeft: () => deplacer(PAS_PX, 0, true), ArrowRight: () => deplacer(-PAS_PX, 0, true), ArrowUp: () => deplacer(0, PAS_PX, true), ArrowDown: () => deplacer(0, -PAS_PX, true),
      q: () => deplacer(PAS_PX, 0, true), d: () => deplacer(-PAS_PX, 0, true), z: () => deplacer(0, PAS_PX, true), s: () => deplacer(0, -PAS_PX, true),
      a: () => tourner(-C().PAS_CAP, true), e: () => tourner(C().PAS_CAP, true),
      '+': () => zoomer(C().PAS_ZOOM, undefined, undefined, true), '=': () => zoomer(C().PAS_ZOOM, undefined, undefined, true),
      '-': () => zoomer(1 / C().PAS_ZOOM, undefined, undefined, true), _: () => zoomer(1 / C().PAS_ZOOM, undefined, undefined, true),
      PageUp: () => incliner(C().PAS_SITE, true), PageDown: () => incliner(-C().PAS_SITE, true),
      0: () => toutVoir(true), Home: () => toutVoir(true)
    };
    toile.addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const f = TOUCHES[e.key] || TOUCHES[String(e.key).toLowerCase()];
      if (!f) return;
      e.preventDefault(); e.stopPropagation(); f();
    });

    /* Les boutons : [data-direct-cmd]. */
    const BOUTONS = { gauche: () => tourner(-C().PAS_CAP, true), droite: () => tourner(C().PAS_CAP, true), haut: () => incliner(C().PAS_SITE, true), bas: () => incliner(-C().PAS_SITE, true),
      moins: () => zoomer(1 / C().PAS_ZOOM, undefined, undefined, true), plus: () => zoomer(C().PAS_ZOOM, undefined, undefined, true), cadrer: () => cadrer(true), tout: () => toutVoir(true) };
    hote.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-direct-cmd]'); if (b && BOUTONS[b.dataset.directCmd]) BOUTONS[b.dataset.directCmd](); });

    /* La place change, le thème change : on redessine. */
    if (typeof root.ResizeObserver === 'function') new root.ResizeObserver(() => demander()).observe(toile);
    if (typeof root.MutationObserver === 'function') new root.MutationObserver(() => { v.pal = null; demander(); }).observe(root.document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    /** Ce que la vue montre, pour le contrôle : la caméra, la scène à l'écran, les étiquettes posées, les murs dessinés. */
    function etat() {
      const b = v.site ? boite() : null;
      return { camera: { ...v.cam }, ecran: { ...ecran }, ajustee: v.ajustee, enMouvement: !!anim, zones: v.site ? v.site.zones.map(z => z.id) : [], selection: v.selection, t: v.t,
        emprise: b ? C().emprise(v.cam, ecran, b) : null, tient: b ? C().tient(v.cam, ecran, b) : false, murs: C().mursDuFond(v.cam),
        etiquettes: v.poses.map(e => ({ id: e.id, x: e.x, y: e.y, w: e.w, h: e.h, titre: e.titre, lignes: e.lignes.slice() })),
        recouvrements: C().recouvrements(v.poses), images: v.stats.images, msDessin: v.stats.ms, couleurs: v.pal ? { fond: G().css(v.pal.base.fond), zone: G().css(v.pal.base.zone), texte: G().css(v.pal.base.texte) } : null };
    }
    /** Où est un point de la scène à l'écran (pour le contrôle) : [X, Y] en pixels de la toile. */
    const ecranDe = (x, y, z) => C().projeter(v.cam, ecran, x, y, z || 0);

    Object.assign(v, { rendre, demander, tourner, incliner, zoomer, deplacer, toutVoir, cadrer, etatVue: etat, ecranDe, toile });
    return v;
  }

  const api = { BANDES, DUREE, creer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyDirectVue = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

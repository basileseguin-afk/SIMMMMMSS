/* ==========================================================================
 *  LA SCÈNE DE LA VUE EN DIRECT (évolution 16, v1)
 *  ------------------------------------------------------------------------
 *  Le site généré (moteur/site.js) devient ici une scène : des sols, des murs
 *  bas, des machines, des étiquettes — des volumes simples, posés en mètres
 *  dans le repère de la caméra (direct-camera.js). Rien n'est décoratif :
 *  chaque objet vient d'un réglage (une zone par service, une ligne par
 *  atelier robot présent en même temps, un tunnel par tunnel tenu, les
 *  rayonnages du magasin) ou d'une quantité de la journée (direct-etat.js).
 *
 *  Sans navigateur : ce module ne dessine pas, il dit quoi dessiner et où.
 *  Les mêmes réglages donnent la même scène.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const CAM = () => (enNode ? require('./direct-camera.js') : root.OrlyDirectCamera);

  /** Les hauteurs, en mètres : les murs sont bas, pour que rien ne soit caché. */
  const H = { mur: 0.5, convoyeur: 0.85, bras: 1.9, tunnel: 1.45, rayonnage: 2.1, etiquette: 2.8 };
  /** L'épaisseur d'un mur, et la longueur au-delà de laquelle une boîte longue se range par tronçons. */
  const MUR = 0.16, TRONCON = 2;

  /** La boîte de la scène, à cadrer : l'emprise du site, jusqu'à la hauteur des étiquettes. */
  function boite(site) {
    const e = (site && site.emprise) || { x0: 0, y0: 0, x1: 1, y1: 1 };
    return { x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1, h: H.etiquette };
  }
  /** La boîte d'une zone, pour « Cadrer » le service choisi. */
  const boiteDeZone = z => ({ x0: z.x, y0: z.y, x1: z.x + z.w, y1: z.y + z.h, h: H.etiquette });

  /** La zone d'un service (la production réunit la préparation et le montage) ; la zone sous un point du sol. */
  const zoneDuService = (site, service) => ((site && site.zones) || []).find(z => z.services.includes(service) || z.id === service) || null;
  const zoneSous = (site, p) => ((site && site.zones) || []).find(z => p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h) || null;

  /** Les murs d'un rectangle, sur les côtés donnés : un par côté, en dedans du bord. */
  function mursDe(r, cotes, zone) {
    const m = { x0: { x: r.x, y: r.y, w: MUR, d: r.h }, x1: { x: r.x + r.w - MUR, y: r.y, w: MUR, d: r.h },
      y0: { x: r.x, y: r.y, w: r.w, d: MUR }, y1: { x: r.x, y: r.y + r.h - MUR, w: r.w, d: MUR } };
    return cotes.map(c => ({ zone, cote: c, ...m[c], h: H.mur }));
  }

  /**
   * Le décor d'un site : ce qui ne change pas avec l'heure.
   *  - `sols` : le sol du site, le couloir, l'aire de pause, les zones ({ id, ton, x, y, w, d, zone }), dans l'ordre du dessin ;
   *  - `murs` : les murs bas ({ zone, cote, x, y, w, d, h }) — la vue ne dessine que ceux du fond ; une zone s'ouvre sur le couloir ;
   *  - `objets` : les machines, en boîtes ({ quoi, ton, x, y, z, w, d, h, zone, ref }) : les lignes robotisées et leur bras,
   *    les tunnels de lavage, les rayonnages du magasin.
   */
  function decor(site) {
    const sols = [], murs = [], objets = [];
    if (!site || !site.zones.length) return { boite: boite(site), sols, murs, objets };
    const e = site.emprise;
    sols.push({ id: 'site', ton: 'site', x: e.x0 - 1, y: e.y0 - 1, w: e.x1 - e.x0 + 2, d: e.y1 - e.y0 + 2 });
    sols.push({ id: 'couloir', ton: 'couloir', x: site.couloir.x, y: site.couloir.y, w: site.couloir.w, d: site.couloir.h });
    sols.push({ id: 'pause', ton: 'pause', x: site.pause.x, y: site.pause.y, w: site.pause.w, d: site.pause.h });
    // L'aire de pause s'ouvre du côté de l'entrée.
    murs.push(...mursDe(site.pause, ['x0', 'x1', site.pause.y >= site.couloir.y ? 'y1' : 'y0'], 'pause'));
    for (const z of site.zones) {
      sols.push({ id: z.id, ton: 'zone', x: z.x, y: z.y, w: z.w, d: z.h, zone: z.id });
      // Une zone s'ouvre sur le couloir : pas de mur de ce côté.
      murs.push(...mursDe(z, ['x0', 'x1', z.bande === 0 ? 'y0' : 'y1'], z.id));
      for (const [i, l] of (z.lignes || []).entries()) {
        objets.push({ quoi: 'ligne', ton: 'machine', x: l.x, y: l.y, z: 0, w: l.w, d: l.h, h: H.convoyeur, zone: z.id, ref: i, ateliers: l.ateliers });
        const c = Math.min(0.5, l.h * 0.4);
        objets.push({ quoi: 'bras', ton: 'bras', x: l.x + l.w / 2 - c / 2, y: l.y + l.h / 2 - c / 2, z: H.convoyeur, w: c, d: c, h: H.bras - H.convoyeur, zone: z.id, ref: i, ateliers: l.ateliers });
      }
      for (const [i, t] of (z.tunnels || []).entries()) objets.push({ quoi: 'tunnel', ton: 'machine', x: t.x, y: t.y, z: 0, w: t.w, d: t.h, h: H.tunnel, zone: z.id, ref: i, nom: t.nom });
      for (const [i, r] of (z.rayonnages || []).entries()) objets.push({ quoi: 'rayonnage', ton: 'rayonnage', x: r.x, y: r.y, z: 0, w: r.w, d: r.h, h: H.rayonnage, zone: z.id, ref: i });
    }
    return { boite: boite(site), sols, murs, objets };
  }

  /**
   * Les boîtes à dessiner pour un décor et un angle : les murs du fond seulement (`fond` : { x0, x1, y0, y1 }, ceux de
   * direct-camera.js), les machines ; les boîtes longues en tronçons, chacun avec son point d'appui ({ x, y } : le milieu
   * de son emprise au sol). Rend [{ quoi, ton, bx, by, z, w, d, h, x, y, couche: 1, … }] — à ranger avec le reste.
   */
  function boitesDe(d, fond, decouper) {
    const out = [];
    const poser = (o, quoi, ton) => {
      for (const t of decouper({ x: o.x, y: o.y, w: o.w, d: o.d }, TRONCON)) out.push({ ...o, quoi, ton, bx: t.x, by: t.y, w: t.w, d: t.d, z: o.z || 0, x: t.x + t.w / 2, y: t.y + t.d / 2, couche: 1 });
    };
    for (const m of d.murs) if (fond[m.cote]) poser(m, 'mur', 'mur');
    for (const o of d.objets) poser(o, o.quoi, o.ton);
    return out;
  }

  /** « 1 présent », « 3 présents » ; « 1 lot à faire », « 4 lots à faire ». */
  const pluriel = (n, un, des) => n + ' ' + (n > 1 ? des : un);

  /**
   * Les étiquettes des services : une par zone, au-dessus d'elle ({ id, x, y, z, titre, lignes }). Le nom ; « n au travail /
   * n présents » ; « n lots à faire » s'il y en a (ce qui attend devant le service). `etat` : la journée à l'heure rejouée
   * (direct-etat.js) ; sans elle, le nom seul.
   */
  function etiquettes(site, etat) {
    return ((site && site.zones) || []).map(z => {
      const lignes = [];
      if (etat) {
        const n = { auTravail: 0, presents: 0, lots: 0 };
        for (const s of z.services) { const x = etat.services[s]; if (x) { n.auTravail += x.auTravail; n.presents += x.presents; n.lots += x.lots; } }
        lignes.push(n.auTravail + ' au travail / ' + pluriel(n.presents, 'présent', 'présents'));
        if (n.lots > 0) lignes.push(pluriel(n.lots, 'lot à faire', 'lots à faire'));
      }
      return { id: z.id, x: z.x + z.w / 2, y: z.y + z.h / 2, z: H.etiquette, titre: z.nom, lignes };
    });
  }

  /** Le texte d'une étiquette, en pixels : toujours les mêmes, à tout zoom et à tout angle. */
  const ETIQUETTE = { titre: 12.5, ligne: 11.5, marge: 7, interligne: 15 };
  /** Sans navigateur, la largeur d'un texte s'estime (pour les tests) ; dans la page, la vue donne la vraie (`mesure`). */
  const estimer = (texte, gras) => String(texte).length * (gras ? 7.3 : 6.3);
  /** La taille d'une étiquette à l'écran : son titre, ses lignes, sa marge. */
  function tailleEtiquette(e, mesure) {
    const m = mesure || estimer, w = Math.max(m(e.titre, true), ...e.lignes.map(l => m(l, false)));
    return { w: Math.ceil(w + 2 * ETIQUETTE.marge), h: Math.ceil(2 * ETIQUETTE.marge - 3 + ETIQUETTE.interligne * (1 + e.lignes.length)) };
  }

  /**
   * Les étiquettes posées à l'écran pour une caméra : chacune droite, à sa taille, au-dessus de son ancre, sans en
   * recouvrir une autre (direct-camera.js). Une étiquette dont l'ancre est hors de l'écran (sa zone n'y est pas) ne se
   * pose pas. Rend [{ id, x, y, w, h, ax, ay, decalee, titre, lignes }].
   */
  function poserEtiquettes(liste, cam, ecran, mesure) {
    const p = CAM().projecteur(cam, ecran);
    const vues = liste.map(e => ({ e, ax: p.x(e.x, e.y), ay: p.y(e.x, e.y, e.z) })).filter(a => a.ax >= 0 && a.ax <= ecran.w && a.ay >= 0 && a.ay <= ecran.h);
    const ancres = vues.map(a => ({ id: a.e.id, ax: a.ax, ay: a.ay, ...tailleEtiquette(a.e, mesure) }));
    return CAM().placerEtiquettes(ancres, ecran).map((r, i) => ({ ...r, titre: vues[i].e.titre, lignes: vues[i].e.lignes }));
  }

  const api = { H, MUR, TRONCON, ETIQUETTE, boite, boiteDeZone, zoneDuService, zoneSous, decor, boitesDe, etiquettes, tailleEtiquette, poserEtiquettes, pluriel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyDirectScene = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

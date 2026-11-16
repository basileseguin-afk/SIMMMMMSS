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
  const ETAT = () => (enNode ? require('./direct-etat.js') : root.OrlyDirectEtat);
  const ALLEES = () => (enNode ? require('./direct-allees.js') : root.OrlyDirectAllees);
  /** Par où passer, d'un point à un autre : par les allées d'un site disposé (évolution 20 b) ; sans allées, tout droit, comme avant. */
  const parAllees = (site, de, vers) => (site && site.allees ? ALLEES().chemin(site, de, vers) : []);

  /** Les hauteurs, en mètres : les murs sont bas, pour que rien ne soit caché. */
  const H = { mur: 0.5, convoyeur: 0.85, bras: 1.9, tunnel: 1.45, rayonnage: 2.1, etiquette: 2.8, avion: 2.6 };
  /** L'épaisseur d'un mur, et la longueur au-delà de laquelle une boîte longue se range par tronçons. */
  const MUR = 0.16, TRONCON = 2;

  /** La boîte de la scène, à cadrer : l'emprise du site — et l'aire des avions, s'il y en a une —, jusqu'à la hauteur des étiquettes. */
  function boite(site, aire) {
    const e = (site && site.emprise) || { x0: 0, y0: 0, x1: 1, y1: 1 };
    if (!aire) return { x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1, h: H.etiquette };
    return { x0: Math.min(e.x0, aire.x), y0: Math.min(e.y0, aire.y), x1: Math.max(e.x1, aire.x + aire.w), y1: Math.max(e.y1, aire.y + aire.h), h: H.etiquette };
  }
  /**
   * La boîte à cadrer à l'ouverture et sur « Tout voir » : le bâtiment et les avions présents — pas l'aire vide (évolution 19,
   * retouche). `presents` : les places des avions qui sont là ([{ x, y }], le milieu de chacune) ; sans avion, le bâtiment seul.
   */
  function boiteCadree(site, presents) {
    const b = boite(site, null);
    for (const p of presents || []) {
      b.x0 = Math.min(b.x0, p.x - AVION.w / 2); b.x1 = Math.max(b.x1, p.x + AVION.w / 2);
      b.y0 = Math.min(b.y0, p.y - AVION.h / 2); b.y1 = Math.max(b.y1, p.y + AVION.h / 2);
    }
    return b;
  }
  /** La boîte d'une zone, pour « Cadrer » le service choisi. */
  const boiteDeZone = z => ({ x0: z.x, y0: z.y, x1: z.x + z.w, y1: z.y + z.h, h: H.etiquette });

  /** La zone d'un service (la production réunit la préparation et le montage) ; la zone sous un point du sol. */
  const zoneDuService = (site, service) => ((site && site.zones) || []).find(z => z.services.includes(service) || z.id === service) || null;
  const zoneSous = (site, p) => ((site && site.zones) || []).find(z => p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h) || null;

  /** Les murs d'une zone d'un site disposé, d'après le côté où elle ouvre : à gauche (une colonne), en haut (une rangée du bas). */
  const OUVERT = { gauche: ['x1', 'y0', 'y1'], haut: ['x0', 'x1', 'y1'] };
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
   *    les tunnels de lavage, les rayonnages du magasin ; avec `ilots` (ceux des ateliers), leurs tables et leurs rangs.
   *    Une rangée de l'entrepôt qui recouvrirait l'îlot d'un atelier du magasin réglé sur un autre poste s'efface.
   */
  function decor(site, ilots, aire) {
    const sols = [], murs = [], objets = [];
    const posés = (ilots || []).filter(i => i.poste !== 'rayonnages' || i.rangs.length), touche = (r, i) => r.x < i.x + i.w && i.x < r.x + r.w && r.y < i.y + i.h && i.y < r.y + r.h;
    const cache = (z, r) => posés.some(i => i.zone === z.id && !i.machines && (i.tables.length || i.rangs.length || i.trolleys.length || i.poste === 'aucun') && touche(r, i));
    if (!site || !site.zones.length) return { boite: boite(site, aire), sols, murs, objets };
    const e = site.emprise;
    sols.push({ id: 'site', ton: 'site', x: e.x0 - 1, y: e.y0 - 1, w: e.x1 - e.x0 + 2, d: e.y1 - e.y0 + 2 });
    // Du côté des avions : la route où roulent les véhicules du handling, et l'aire où se tiennent les avions.
    if (aire) { sols.push({ id: 'route', ton: 'route', x: aire.route.x, y: aire.route.y, w: aire.route.w, d: aire.route.h }); sols.push({ id: 'aire', ton: 'aire', x: aire.x, y: aire.y, w: aire.w, d: aire.h }); }
    // Le couloir ; dans un site disposé, ses allées : celle de l'entrée (le couloir), puis les autres.
    if (site.allees) site.allees.forEach((a, i) => sols.push({ id: i ? 'allee-' + i : 'couloir', ton: 'couloir', x: a.x, y: a.y, w: a.w, d: a.h }));
    else sols.push({ id: 'couloir', ton: 'couloir', x: site.couloir.x, y: site.couloir.y, w: site.couloir.w, d: site.couloir.h });
    sols.push({ id: 'pause', ton: 'pause', x: site.pause.x, y: site.pause.y, w: site.pause.w, d: site.pause.h });
    // L'aire de pause s'ouvre du côté de l'entrée.
    murs.push(...mursDe(site.pause, site.allees ? ['x0', 'y0', 'y1'] : ['x0', 'x1', site.pause.y >= site.couloir.y ? 'y1' : 'y0'], 'pause'));
    for (const z of site.zones) {
      sols.push({ id: z.id, ton: 'zone', x: z.x, y: z.y, w: z.w, d: z.h, zone: z.id });
      // Une zone s'ouvre sur le couloir — ou, dans un site disposé, sur son allée (`ouvert`) : pas de mur de ce côté.
      murs.push(...mursDe(z, z.ouvert ? OUVERT[z.ouvert] : ['x0', 'x1', z.bande === 0 ? 'y0' : 'y1'], z.id));
      for (const [i, l] of (z.lignes || []).entries()) {
        objets.push({ quoi: 'ligne', ton: 'machine', x: l.x, y: l.y, z: 0, w: l.w, d: l.h, h: H.convoyeur, zone: z.id, ref: i, ateliers: l.ateliers });
        const c = Math.min(0.5, l.h * 0.4);
        objets.push({ quoi: 'bras', ton: 'bras', x: l.x + l.w / 2 - c / 2, y: l.y + l.h / 2 - c / 2, z: H.convoyeur, w: c, d: c, h: H.bras - H.convoyeur, zone: z.id, ref: i, ateliers: l.ateliers });
      }
      for (const [i, t] of (z.tunnels || []).entries()) objets.push({ quoi: 'tunnel', ton: 'machine', x: t.x, y: t.y, z: 0, w: t.w, d: t.h, h: H.tunnel, zone: z.id, ref: i, nom: t.nom, enLong: t.h > t.w });
      for (const [i, r] of (z.rayonnages || []).entries()) if (!cache(z, r)) objets.push({ quoi: 'rayonnage', ton: 'rayonnage', x: r.x, y: r.y, z: 0, w: r.w, d: r.h, h: H.rayonnage, zone: z.id, ref: i });
    }
    if (ilots) objets.push(...meublesDe(ilots));
    return { boite: boite(site, aire), sols, murs, objets };
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

  /* ---- les ateliers : un îlot par atelier réglé (évolution 16 c) ---------------------------------- */

  /** Les postes de travail d'un atelier : ce sur quoi il travaille. */
  const POSTES = ['tables', 'trolleys', 'machine', 'rayonnages', 'aucun'];
  /**
   * Le poste de travail par défaut : une machine pour un atelier de type robot ou lavage ; des trolleys pour les services
   * armement et dotation ; des rayonnages pour le magasin ; des tables pour tous les autres (dont la cuisine et la préparation).
   */
  function posteParDefaut(a) {
    if (a.type === 'robot' || a.type === 'lavage') return 'machine';
    if (a.service === 'armement' || a.service === 'dotation') return 'trolleys';
    return a.service === 'magasin' ? 'rayonnages' : 'tables';
  }
  /** Le poste de travail d'un atelier : son réglage (`poste`), sinon le défaut. */
  const posteDe = a => (POSTES.includes(a.poste) ? a.poste : posteParDefaut(a));

  /** Les mesures d'un îlot, en mètres : une table pour deux personnes ; la place d'une personne ; la bande gardée devant
   *  une zone pour ce qui attend (la file) ; l'écart entre deux îlots. */
  const TABLE = { w: 1.4, d: 0.7, h: 0.8, pasX: 2.0, pasY: 2.4 }, DEBOUT = 0.42, PAS_TROLLEY = { x: 1.5, y: 1.3 }, PAS_SEUL = 0.9;
  const RANG = { d: 0.6, h: 1.6, pas: 2.0 }, FILE = 2.2, ECART_ILOTS = 0.9, BORD = 0.8, PAS_MACHINE = 0.85;

  /** Les tables d'un atelier : une pour deux personnes, une au moins. */
  const tablesPour = n => Math.max(1, Math.ceil(Math.max(0, n) / 2));

  /**
   * La forme d'un îlot posé à l'origine, pour `n` personnes : { w, h, tables, rangs, places, trolleys } — ses tables ou
   * ses rangs de rayonnages (des rectangles { x, y, w, d }), une place par personne ({ x, y }), et, pour des trolleys, la
   * place de chaque trolley. `profondeur` : la profondeur dont il dispose — il s'étale en largeur plutôt que de la dépasser.
   */
  function formeIlot(poste, n, profondeur) {
    const p = Math.max(0, Math.round(n)), places = [], tables = [], rangs = [], trolleys = [];
    // Des colonnes : presque un carré, mais pas plus de rangées que la profondeur n'en permet.
    const colonnes = (q, pasY) => { const max = Number.isFinite(profondeur) ? Math.max(1, Math.floor(profondeur / pasY)) : Infinity; return Math.min(q, Math.max(Math.ceil(Math.sqrt(q * 1.3)), Math.ceil(q / max))); };
    if (poste === 'tables') {
      const t = tablesPour(p), cols = colonnes(t, TABLE.pasY), lignes = Math.ceil(t / cols);
      for (let i = 0; i < t; i++) {
        const x = (i % cols) * TABLE.pasX + (TABLE.pasX - TABLE.w) / 2, y = Math.floor(i / cols) * TABLE.pasY + (TABLE.pasY - TABLE.d) / 2;
        tables.push({ x, y, w: TABLE.w, d: TABLE.d });
        // Deux personnes par table, debout de part et d'autre.
        places.push({ x: x + TABLE.w / 2, y: y - DEBOUT }, { x: x + TABLE.w / 2, y: y + TABLE.d + DEBOUT });
      }
      return { w: cols * TABLE.pasX, h: lignes * TABLE.pasY, tables, rangs, places: places.slice(0, Math.max(p, 1)), trolleys };
    }
    if (poste === 'rayonnages') {
      // Deux rangs, les personnes dans l'allée.
      const l = Math.max(2.4, Math.ceil(p / 2) * 1.2 + 0.6);
      rangs.push({ x: 0.3, y: 0.3, w: l, d: RANG.d }, { x: 0.3, y: 0.3 + RANG.pas, w: l, d: RANG.d });
      for (let i = 0; i < Math.max(p, 1); i++) places.push({ x: 0.9 + Math.floor(i / 2) * 1.2, y: 0.3 + RANG.d + (i % 2 ? 0.95 : 0.45) });
      return { w: l + 0.6, h: RANG.pas + RANG.d + 0.6, tables, rangs, places, trolleys };
    }
    const pas = poste === 'trolleys' ? PAS_TROLLEY : { x: PAS_SEUL, y: PAS_SEUL }, q = Math.max(p, 1), cols = colonnes(q, pas.y), lignes = Math.ceil(q / cols);
    for (let i = 0; i < q; i++) {
      const x = (i % cols + 0.5) * pas.x, y = (Math.floor(i / cols) + 0.5) * pas.y;
      if (poste === 'trolleys') { places.push({ x: x - 0.3, y }); trolleys.push({ x: x + 0.32, y }); } else places.push({ x, y });
    }
    return { w: cols * pas.x, h: lignes * pas.y, tables, rangs, places, trolleys };
  }

  /** Les places autour d'une machine (un rectangle { x, y, w, h }) : le long de ses deux grands côtés, en alternance. */
  function placesAutour(m, n) {
    const enLong = m.h > m.w, longueur = enLong ? m.h : m.w, parCote = Math.max(1, Math.floor(longueur / PAS_MACHINE)), out = [];
    for (let i = 0; i < n; i++) {
      const cote = i % 2, k = Math.floor(i / 2), rang = Math.floor(k / parCote), u = ((k % parCote) + 0.5) * longueur / parCote, d = 0.5 + rang * 0.7;
      out.push(enLong ? { x: cote ? m.x + m.w + d : m.x - d, y: m.y + u } : { x: m.x + u, y: cote ? m.y + m.h + d : m.y - d });
    }
    return out;
  }

  /** L'emprise des machines d'une zone depuis son fond, en mètres de profondeur. */
  function profondeurMachines(z) {
    const l = [...(z.lignes || []), ...(z.tunnels || []), ...(z.rayonnages || [])];
    if (!l.length) return 0;
    return z.bande === 0 ? Math.max(...l.map(m => m.y + m.h)) - z.y : z.y + z.h - Math.min(...l.map(m => m.y));
  }

  /** Un point ramené dans un rectangle { x, y, w, h }, à `marge` de ses bords. */
  const dedans = (p, r, marge) => ({ x: Math.min(Math.max(p.x, r.x + Math.min(marge, r.w / 2)), r.x + r.w - Math.min(marge, r.w / 2)),
    y: Math.min(Math.max(p.y, r.y + Math.min(marge, r.h / 2)), r.y + r.h - Math.min(marge, r.h / 2)) });

  /**
   * Les îlots du site : un par atelier réglé, ni plus ni moins, dans la zone de son service (un atelier robot : à sa
   * ligne, dans la zone qui la porte). `ateliers` : ceux des réglages ; `personnes(id)` : les personnes de chacun (saisies ou
   * calculées) — sans elle, celles du réglage. Chaque îlot : { atelier, nom, service, zone, poste, x, y, w, h, echelle,
   * tables, rangs, places, trolleys, ancre } — son emprise, ses tables (ou ses rangs de rayonnages), une place par
   * personne. Si les îlots d'une zone n'y tiennent pas, ils se resserrent (`echelle` < 1) : aucun n'est supprimé, aucun
   * ne sort de sa zone. Les mêmes réglages donnent les mêmes îlots.
   */
  function ilots(site, ateliers, personnes) {
    const zones = (site && site.zones) || [], out = [], nb = a => Math.max(0, Math.round(personnes ? personnes(a.id) ?? a.personnes : a.personnes) || 0);
    const zoneDe = a => {
      // Un atelier robot travaille à sa ligne, dans la zone qui la porte ; les autres dans la zone de leur service.
      const saLigne = zones.find(z => (z.lignes || []).some(l => l.ateliers.includes(a.id)));
      return (posteDe(a) === 'machine' && saLigne) || zones.find(z => z.services.includes(a.service)) || null;
    };
    const parZone = new Map(zones.map(z => [z.id, []]));
    for (const a of ateliers || []) { const z = zoneDe(a); if (z) parZone.get(z.id).push(a); }
    for (const z of zones) {
      const siens = parZone.get(z.id), libres = [];
      let allee = 0;
      for (const a of siens) {
        const poste = posteDe(a), n = nb(a), base = { atelier: a.id, nom: a.nom || a.id, service: a.service, zone: z.id, poste, personnes: n, echelle: 1, tables: [], rangs: [], trolleys: [] };
        // À une machine : sa ligne robotisée, ses tunnels (ceux de son nom), à défaut les machines de sa zone.
        let machines = [];
        if (poste === 'machine') {
          const ligne = (z.lignes || []).find(l => l.ateliers.includes(a.id)), noms = new Set((Array.isArray(a.tunnels) ? a.tunnels : []).map(t => t && t.nom));
          const tunnels = (z.tunnels || []).filter(t => noms.has(t.nom));
          machines = ligne ? [ligne] : tunnels.length ? tunnels : [...(z.tunnels || []), ...(z.lignes || [])];
        }
        if (machines.length) {
          const places = [], q = Math.max(n, 1);
          machines.forEach((m, k) => places.push(...placesAutour(m, Math.ceil((q - k) / machines.length))));
          const x0 = Math.min(...machines.map(m => m.x)), y0 = Math.min(...machines.map(m => m.y)), x1 = Math.max(...machines.map(m => m.x + m.w)), y1 = Math.max(...machines.map(m => m.y + m.h));
          out.push({ ...base, x: x0, y: y0, w: x1 - x0, h: y1 - y0, places: places.slice(0, q).map(p => dedans(p, z, 0.3)), machines: machines.length, ancre: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 } });
        } else if (poste === 'rayonnages' && (z.rayonnages || []).length) {
          // Dans l'entrepôt : entre ses rangées, à la suite des autres ateliers du magasin.
          const r = z.rayonnages, places = [], q = Math.max(n, 1), enLong = r[0].h > r[0].w;
          const allees = r.length > 1 ? r.slice(1).map((b, i) => (enLong ? { x: (r[i].x + r[i].w + b.x) / 2, y0: b.y, l: b.h } : { y: (r[i].y + r[i].h + b.y) / 2, x0: b.x, l: b.w })) : [enLong ? { x: r[0].x + r[0].w + 0.6, y0: r[0].y, l: r[0].h } : { y: r[0].y + (z.bande === 0 ? r[0].h + 0.6 : -0.6), x0: r[0].x, l: r[0].w }];
          for (let i = 0; i < q; i++, allee++) {
            const al = allees[allee % allees.length], parAllee = Math.max(1, Math.floor(al.l / 1.2)), u = ((Math.floor(allee / allees.length) % parAllee) + 0.5) * al.l / parAllee;
            places.push(dedans(enLong ? { x: al.x, y: al.y0 + u } : { x: al.x0 + u, y: al.y }, z, 0.3));
          }
          const x0 = Math.min(...r.map(m => m.x)), y0 = Math.min(...r.map(m => m.y)), x1 = Math.max(...r.map(m => m.x + m.w)), y1 = Math.max(...r.map(m => m.y + m.h));
          out.push({ ...base, x: x0, y: y0, w: x1 - x0, h: y1 - y0, places, allee: enLong ? 'y' : 'x', ancre: { x: places[0].x, y: places[0].y } });
        } else libres.push({ base, poste: poste === 'machine' ? 'aucun' : poste, n });
      }
      if (!libres.length) continue;
      // La place libre de la zone : devant ses machines, derrière la bande de la file. Trop peu profonde : la moitié avant.
      const prof = profondeurMachines(z), reste = z.h - (prof ? prof + 0.6 : BORD) - FILE;
      const hl = reste >= 1.2 ? reste : Math.max(0.3, z.h * 0.45), wl = Math.max(0.3, z.w - 2 * Math.min(BORD, z.w * 0.2));
      for (const l of libres) l.forme = formeIlot(l.poste, l.n, hl);
      const xl = z.x + (z.w - wl) / 2, yl = z.bande === 0 ? z.y + z.h - (reste >= 1.2 ? FILE : 0.1 * z.h) - hl : z.y + (reste >= 1.2 ? FILE : 0.1 * z.h);
      // Les îlots en rangées, dans l'ordre des réglages ; s'ils ne tiennent pas, ils se resserrent tous ensemble.
      let k = 1, rangees = null;
      for (let essai = 0; essai < 80; essai++, k *= 0.93) {
        const e = ECART_ILOTS * k; rangees = [[]];
        let x = 0, large = true;
        for (const l of libres) {
          const w = l.forme.w * k;
          if (w > wl + 1e-9) large = false;
          if (x > 0 && x + w > wl + 1e-9) { rangees.push([]); x = 0; }
          rangees[rangees.length - 1].push(l); x += w + e;
        }
        const haut = rangees.reduce((s, r) => s + Math.max(...r.map(l => l.forme.h * k)), 0) + (rangees.length - 1) * e;
        if (large && haut <= hl + 1e-9) break;
      }
      const e = ECART_ILOTS * k, haut = rangees.reduce((s, r) => s + Math.max(...r.map(l => l.forme.h * k)), 0) + (rangees.length - 1) * e;
      let y = yl + Math.max(0, (hl - haut) / 2);
      for (const r of rangees) {
        const largeur = r.reduce((s, l) => s + l.forme.w * k, 0) + (r.length - 1) * e, hr = Math.max(...r.map(l => l.forme.h * k));
        let x = xl + Math.max(0, (wl - largeur) / 2);
        for (const l of r) {
          const f = l.forme, w = f.w * k, h = f.h * k, zone = { x: z.x, y: z.y, w: z.w, h: z.h }, pt = p => dedans({ x: x + p.x * k, y: y + p.y * k }, zone, 0.25);
          const rect = t => ({ x: x + t.x * k, y: y + t.y * k, w: t.w * k, d: t.d * k });
          out.push({ ...l.base, x, y, w, h, echelle: k, tables: f.tables.map(rect), rangs: f.rangs.map(rect), places: f.places.map(pt), trolleys: f.trolleys.map(pt),
            ...(f.rangs.length ? { allee: 'x' } : {}), ancre: { x: x + w / 2, y: y + h / 2 } });
          x += w + e;
        }
        y += hr + e;
      }
    }
    // Dans l'ordre des réglages.
    const rang = new Map((ateliers || []).map((a, i) => [a.id, i]));
    return out.sort((p, q) => rang.get(p.atelier) - rang.get(q.atelier));
  }

  /** La place de la personne n° `i` d'un îlot : une de ses places ; au-delà (des renforts), autour de lui. */
  function placeDe(ilot, i) {
    if (i < ilot.places.length) return ilot.places[i];
    const k = i - ilot.places.length, par = Math.max(1, Math.floor((ilot.w + 1) / 0.8)), rang = Math.floor(k / par);
    return { x: ilot.x - 0.2 + (k % par) * 0.8, y: ilot.y + ilot.h + 0.5 + rang * 0.7 };
  }

  /** Les tables et les rangs de rayonnages des îlots, en boîtes à dessiner ({ quoi, ton, x, y, z, w, d, h, zone, atelier }). */
  function meublesDe(liste) {
    const out = [];
    for (const i of liste) {
      for (const t of i.tables) out.push({ quoi: 'table', ton: 'table', x: t.x, y: t.y, z: 0, w: t.w, d: t.d, h: TABLE.h, zone: i.zone, atelier: i.atelier });
      for (const r of i.rangs) out.push({ quoi: 'rayonnage', ton: 'rayonnage', x: r.x, y: r.y, z: 0, w: r.w, d: r.d, h: RANG.h, zone: i.zone, atelier: i.atelier });
    }
    return out;
  }

  /* ---- les personnes : celles des indicateurs, à leur poste (évolution 16 c) ------------------- */

  /** Le temps d'un déplacement, en minutes rejouées ; la durée d'un créneau des indicateurs. */
  const MARCHE = 2, CRENEAU = 15;
  /** La couleur de chaque état : au travail (accent), sans travail (avertissement), en pause, en appui ou en chemin (neutre). */
  const TON_ETAT = { auTravail: 'travail', sansTravail: 'attente', enAppui: 'neutre', enPause: 'neutre', enChemin: 'neutre' };
  /** L'ordre dans lequel les personnes d'une équipe prennent leurs états : celles au travail d'abord, celles en pause en dernier. */
  const ORDRE_ETATS = ['auTravail', 'sansTravail', 'enAppui', 'enPause'];

  /** L'état de la personne n° `i` d'une équipe dont les présents se comptent par état (`p`) ; null si elle n'est pas là. */
  function etatDe(p, i) {
    let n = 0;
    for (const e of ORDRE_ETATS) { n += p[e]; if (i < n) return e; }
    return null;
  }

  /** Un point sur une ligne brisée, à la fraction `k` (0 à 1) de sa longueur. */
  function surChemin(points, k) {
    const l = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y)), total = l.reduce((s, x) => s + x, 0);
    if (!(total > 0)) return { x: points[0].x, y: points[0].y };
    let d = Math.max(0, Math.min(1, k)) * total;
    for (let i = 0; i < l.length; i++) { if (d <= l[i] || i === l.length - 1) { const u = l[i] ? Math.min(1, d / l[i]) : 0; return { x: points[i].x + (points[i + 1].x - points[i].x) * u, y: points[i].y + (points[i + 1].y - points[i].y) * u }; } d -= l[i]; }
    return points[points.length - 1];
  }

  /** Les places de l'aire de pause : en rangs, à 80 cm. */
  function placePause(site, n) {
    const p = site.pause, cols = Math.max(1, Math.floor((p.w - 0.8) / 0.8)), rangs = Math.max(1, Math.floor((p.h - 0.8) / 0.8)), k = n % (cols * rangs);
    return { x: p.x + 0.6 + (k % cols) * 0.8, y: p.y + 0.6 + Math.floor(k / cols) * 0.8 };
  }

  /**
   * Les personnes de la scène à l'heure `t` : exactement celles des indicateurs — pour chaque atelier, ses présents du
   * créneau, répartis par état (direct-etat.js). Chacune : { quoi: 'personne', atelier, service, zone, i, etat, ton, x, y }.
   * Une personne au travail, sans travail ou en appui est à son poste ; en pause, dans l'aire de pause.
   *
   * Ses déplacements sont une mise en scène, en deux minutes rejouées : elle rejoint son poste juste avant le créneau où
   * elle y est (du bord de sa zone si elle arrive, de l'aire de pause si elle en revient) et le quitte juste après le
   * dernier créneau où elle y était (vers le bord de sa zone, ou vers la pause). Une personne qui arrive ou qui part
   * n'est pas, à cet instant, comptée présente par les indicateurs : elle porte `hors: true`.
   * `scene` : { site, ilots } ; `journee` : { r, k } (le résultat et ses indicateurs).
   */
  function personnages(scene, journee, t) {
    const E = ETAT(), site = scene.site, out = [], k = journee && journee.k;
    if (!site || !k || !Number.isFinite(t)) return out;
    const parAtelier = new Map(scene.ilots.map(i => [i.atelier, i])), zones = new Map(site.zones.map(z => [z.id, z]));
    const debut = Math.floor(t / CRENEAU) * CRENEAU, fin = debut + CRENEAU;
    // Juste après le début du créneau : ceux qui partent, ceux qui vont en pause. Juste avant sa fin : ceux qui arrivent, ceux qui en reviennent.
    const apresDebut = t - debut < MARCHE ? (t - debut) / MARCHE : null, avantFin = fin - t <= MARCHE ? (t - (fin - MARCHE)) / MARCHE : null;
    let pauses = 0;
    for (const e of k.equipes) {
      const ilot = parAtelier.get(e.id); if (!ilot) continue;
      const porte = zones.get(ilot.zone).porte, ici = E.personnesDe(e, t);
      const avant = apresDebut !== null ? E.personnesDe(e, debut - 1) : null, apres = avantFin !== null ? E.personnesDe(e, fin) : null;
      const n = Math.max(ici.presents, avant ? avant.presents : 0, apres ? apres.presents : 0);
      // Vers la pause : par le couloir ; dans un site disposé, par ses allées, jusqu'à l'entrée.
      const versPause = [porte, ...(site.allees ? parAllees(site, porte, site.entree) : [{ x: porte.x, y: site.entree.y }]), { x: site.pause.x + site.pause.w, y: site.entree.y }];
      const base = (i, etat) => ({ quoi: 'personne', atelier: e.id, service: e.service, zone: ilot.zone, i, etat, couche: 1 });
      for (let i = 0; i < n; i++) {
        const etat = etatDe(ici, i), poste = placeDe(ilot, i);
        if (etat === null) {
          // Elle n'est pas présente à cet instant : elle arrive pour le créneau suivant, ou vient de finir le précédent.
          if (apres && etatDe(apres, i) !== null) out.push({ ...base(i, 'arrive'), ...surChemin([porte, poste], avantFin), ton: TON_ETAT.enChemin, enChemin: true, hors: true });
          else if (avant && etatDe(avant, i) !== null) out.push({ ...base(i, 'part'), ...surChemin([poste, porte], apresDebut), ton: TON_ETAT.enChemin, enChemin: true, hors: true });
          continue;
        }
        if (etat !== 'enPause') {
          // Au travail entre des rayonnages : elle va et vient dans son allée (une demi-largeur de rayon, selon l'heure rejouée).
          const va = etat === 'auTravail' && ilot.allee ? Math.sin(t / 3 + i * 2.1) * 0.5 : 0;
          out.push({ ...base(i, etat), x: poste.x + (ilot.allee === 'x' ? va : 0), y: poste.y + (ilot.allee === 'y' ? va : 0), ton: TON_ETAT[etat] });
          continue;
        }
        const pause = placePause(site, pauses++);
        // En pause : elle y va au début du créneau si elle était à son poste, elle en revient à sa fin si elle y retourne.
        if (avant && etatDe(avant, i) !== null && etatDe(avant, i) !== 'enPause') out.push({ ...base(i, etat), ...surChemin([poste, ...versPause, pause], apresDebut), ton: TON_ETAT.enChemin, enChemin: true });
        else if (apres && etatDe(apres, i) !== null && etatDe(apres, i) !== 'enPause') out.push({ ...base(i, etat), ...surChemin([pause, ...versPause.slice().reverse(), poste], avantFin), ton: TON_ETAT.enChemin, enChemin: true });
        else out.push({ ...base(i, etat), x: pause.x, y: pause.y, ton: TON_ETAT.enPause });
      }
    }
    return out;
  }

  /**
   * Où écrire le nom d'un îlot pour une caméra : au milieu de son côté le plus proche de l'œil ({ x, y } au sol).
   * `profondeur(x, y)` : celle du projecteur.
   */
  function ancreDuNom(ilot, profondeur) {
    const c = [{ x: ilot.x + ilot.w / 2, y: ilot.y }, { x: ilot.x + ilot.w / 2, y: ilot.y + ilot.h }, { x: ilot.x, y: ilot.y + ilot.h / 2 }, { x: ilot.x + ilot.w, y: ilot.y + ilot.h / 2 }];
    return c.reduce((m, p) => (profondeur(p.x, p.y) > profondeur(m.x, m.y) + 1e-9 ? p : m));
  }

  /* ---- ce qui circule : chariots, véhicules, avions (évolution 16 d) -------------------------------------------- */

  /** La route des véhicules (5 m), la place d'un avion (6,4 m sur 4,8), le pas des chariots d'une file. */
  const ROUTE = 5, AVION = { w: 6.4, h: 4.8, long: 4.6 }, PAS_FILE = { x: 0.85, y: 0.7 };

  /**
   * L'aire des avions, au bord de la scène du côté des avions : la route, puis des places en colonnes ({ x, y } : le
   * milieu de chacune). `nombre` : le plus grand nombre d'avions là en même temps (direct-etat.js) ; sans avion, pas d'aire.
   */
  function aireDe(site, nombre) {
    if (!site || !site.zones.length || !(nombre > 0)) return null;
    if (site.avions === 'bas') {
      // Sous le site (le quai a son bord extérieur en bas, évolution 20 b) : la route le long du bord, puis des places en rangs.
      const parRang = Math.max(1, Math.floor(site.largeur / AVION.w)), rangs = Math.ceil(nombre / parRang), cols = Math.min(nombre, parRang);
      const x0 = (site.largeur - cols * AVION.w) / 2, xb = Math.min(0, x0), wb = Math.max(site.largeur, cols * AVION.w), yb = site.profondeur + ROUTE;
      const enBas = Array.from({ length: nombre }, (_, i) => ({ x: x0 + ((i % parRang) + 0.5) * AVION.w, y: yb + (Math.floor(i / parRang) + 0.5) * AVION.h }));
      return { x: xb, y: yb, w: wb, h: rangs * AVION.h, route: { x: xb, y: site.profondeur, w: wb, h: ROUTE }, places: enBas };
    }
    const parColonne = Math.max(1, Math.floor(site.profondeur / AVION.h)), colonnes = Math.ceil(nombre / parColonne), rangs = Math.min(nombre, parColonne);
    const x = site.largeur + ROUTE, y = Math.min(0, (site.profondeur - rangs * AVION.h) / 2), h = Math.max(site.profondeur, rangs * AVION.h);
    const places = Array.from({ length: nombre }, (_, i) => ({ x: x + (Math.floor(i / parColonne) + 0.5) * AVION.w, y: (site.profondeur - rangs * AVION.h) / 2 + ((i % parColonne) + 0.5) * AVION.h }));
    return { x, y, w: colonnes * AVION.w, h, route: { x: site.largeur, y, w: ROUTE, h }, places };
  }

  /**
   * La bande de la file d'une zone : devant elle, le long du couloir ({ x, y, w, h, sens }) ; `sens` : vers où s'empilent
   * les rangs. Sa profondeur : la bande gardée libre devant les îlots (2,2 m) ; avec `ilots`, tout ce que les îlots et
   * les machines de la zone laissent libre devant eux — une longue file s'y étale.
   */
  function bandeDeFile(z, ilots) {
    const marge = Math.min(0.6, z.w * 0.15), base = Math.min(FILE, z.h * 0.4);
    const pris = (ilots || []).filter(i => i.zone === z.id).map(i => (z.bande === 0 ? i.y + i.h - z.y : z.y + z.h - i.y));
    const libre = ilots ? z.h - Math.max(profondeurMachines(z), 0, ...pris) - 0.3 : base, h = Math.min(z.h, Math.max(base, libre));
    return { x: z.x + marge, w: Math.max(0.3, z.w - 2 * marge), h, y: z.bande === 0 ? z.y + z.h - h : z.y, sens: z.bande === 0 ? -1 : 1 };
  }
  /** Une file a trois rangs de profondeur d'ordinaire. */
  const RANGS_FILE = 3;
  /**
   * Les `n` places d'une file, en rangs depuis le couloir : trois de profondeur ; une file plus longue que sa bande
   * n'est large prend d'autres rangs, tant qu'il y a de la place devant les îlots ; au-delà, les colonnes se serrent — la
   * file s'entasse, elle ne déborde pas de sa zone.
   */
  function placesDeFile(bande, n) {
    const rangsMax = Math.max(1, Math.floor(bande.h / PAS_FILE.y)), colonnesMax = Math.max(1, Math.floor(bande.w / PAS_FILE.x));
    const rangs = Math.max(1, Math.min(rangsMax, Math.max(RANGS_FILE, Math.ceil(n / colonnesMax)))), colonnes = Math.max(1, Math.ceil(n / rangs)), pas = Math.min(PAS_FILE.x, bande.w / colonnes);
    const y0 = bande.sens < 0 ? bande.y + bande.h - PAS_FILE.y / 2 : bande.y + PAS_FILE.y / 2;
    return Array.from({ length: n }, (_, i) => ({ x: bande.x + (Math.floor(i / rangs) + 0.5) * pas, y: y0 + bande.sens * (i % rangs) * PAS_FILE.y }));
  }

  /**
   * Les places des chariots d'un lot en cours, dans l'îlot de son atelier : ses trolleys (c'est le trolley sur lequel on
   * travaille), ou le bout de ses tables, d'un côté puis de l'autre ; au-delà, en rangs serrés le long de son bord, du
   * côté du couloir (`sens` : 1 si le couloir est du côté des y croissants). Toujours dans l'îlot. `deja` : les chariots
   * déjà posés là par un autre lot en cours.
   */
  function placesDansIlot(ilot, n, deja, sens) {
    const e = ilot.echelle || 1, bout = cote => ilot.tables.map(t => ({ x: cote > 0 ? t.x + t.w + 0.3 * e : t.x - 0.3 * e, y: t.y + t.d / 2 }));
    const propres = ilot.trolleys.length ? ilot.trolleys : [...bout(1), ...bout(-1)], out = [];
    const par = Math.max(1, Math.floor(ilot.w / 0.7)), pas = ilot.w / par, bas = !(sens < 0);
    for (let i = deja || 0; i < (deja || 0) + n; i++) {
      if (i < propres.length) { out.push(dedans(propres[i], ilot, 0)); continue; }
      const k = i - propres.length, rang = Math.floor(k / par) % 3;
      out.push(dedans({ x: ilot.x + ((k % par) + 0.5) * pas, y: bas ? ilot.y + ilot.h - 0.25 - rang * 0.55 : ilot.y + 0.25 + rang * 0.55 }, ilot, 0));
    }
    return out;
  }

  /** Un convoi de `n` chariots sur un chemin : l'avance (0 à 1) du chariot n° `i` quand le lot en est à `k` ; ils partent l'un après l'autre et arrivent tous à 1. */
  const CONVOI = 0.05;
  const avanceDuConvoi = (k, i, n) => Math.max(0, Math.min(1, k * (1 + CONVOI * (n - 1)) - CONVOI * i));
  /** Le personnage qui pousse un convoi : derrière son dernier chariot. Il n'est compté nulle part : c'est la mise en scène du trajet. */
  const pousseur = (chemin, k, n) => { const q = surChemin(chemin, Math.max(0, avanceDuConvoi(k, n - 1, n) - 0.04)); return { quoi: 'personne', ton: TON_ETAT.enChemin, couche: 1, etat: 'pousse', hors: true, enChemin: true, x: q.x, y: q.y, i: 0 }; };

  /**
   * Ce qui circule à l'heure `t`, posé dans la scène. `scene` : { site, ilots, aire, places, tranche } (`places` : celles
   * des vols, `tranche` : celle de la journée, direct-etat.js — calculées ici si elles manquent) ; `journee` : { r, k }. Rend :
   *  - `chariots` : un par tranche de repas de chaque lot ({ quoi: 'chariot', ton, x, y, etat, service, classe, vol }) —
   *    en file devant le service qui va le prendre (`etat: 'file'`), dans l'îlot de son atelier (`en cours`), sale devant
   *    la plonge ou dans son tunnel ; un lot qui change de zone roule deux minutes, poussé par un personnage (`pousseurs`) ;
   *  - `vehicules` : un par tournée du handling en route, du quai aux avions et retour ;
   *  - `avions` : un par vol présent, à sa place, avec son étiquette (critique s'il est en retard) ;
   *  - `tunnels` : les noms de ceux qui lavent ; `lignes` : les lignes robotisées au travail, avec leur cadence ;
   *  - `marques` : les mots posés dans la scène (« arrêté », la cadence du robot) ;
   *  - `tranche` : « un chariot = N repas ».
   * Rien n'est inventé : sans lot en stock, en cours ou à laver, sans tournée ni vol, tout est vide.
   */
  function circulation(scene, journee, t) {
    const E = ETAT(), r = journee && journee.r, site = scene.site, vide = { chariots: [], pousseurs: [], vehicules: [], avions: [], tunnels: [], lignes: [], marques: [], tranche: E.TRANCHE };
    if (!site || !r || !Number.isFinite(t)) return vide;
    const N = scene.tranche || E.tranche(r), out = { ...vide, tranche: N }, zones = site.zones;
    const zoneDe = service => zones.find(z => z.services.includes(service)) || null, ilotDe = new Map(scene.ilots.map(i => [i.atelier, i]));
    const quai = zones.find(z => z.role === 'quai') || null, plonge = zones.find(z => (z.tunnels || []).length) || zones.find(z => z.role === 'plonge') || null;
    // Ce qui est prêt avant le chargement attend au quai du handling ; sans quai, au bout du couloir, du côté des avions.
    const sortie = { x: site.largeur - 4, y: site.couloir.y + 0.4, w: 3.4, h: site.couloir.h - 0.8, sens: 1 };
    // D'où partent les véhicules, où reviennent les retours : le milieu du bord du quai, du côté des avions (à droite, ou en
    // bas dans un site disposé) ; sans quai, le bout du couloir.
    // Dans un site disposé, un quai qui n'est pas au bord du côté des avions : les véhicules partent du bout de l'allée du haut.
    const quaiAuBord = !!quai && (!site.allees || Math.abs(site.avions === 'bas' ? quai.y + quai.h - site.profondeur : quai.x + quai.w - site.largeur) < 1e-6);
    const versAvions = site.avions === 'bas' ? { x: quaiAuBord ? quai.x + quai.w / 2 : site.largeur / 2, y: site.profondeur }
      : quaiAuBord ? { x: site.largeur, y: quai.y + quai.h / 2 } : { x: site.largeur, y: site.couloir.y + site.couloir.h / 2 };
    const bande = service => { const z = service === 'chargement' ? quai : zoneDe(service); return z ? bandeDeFile(z, scene.ilots) : sortie; };
    const porte = service => { const z = service === 'chargement' ? quai : zoneDe(service); return z ? z.porte : { x: sortie.x, y: site.couloir.y + site.couloir.h / 2 }; };
    // D'où part un lot : l'îlot de l'atelier qui vient de le finir dans le service d'amont ; à défaut, la porte de sa zone.
    const source = s => {
      const l = (r.lots || []).find(x => x.service === s.de && !x.dispo && (x.classes || []).includes(s.classe) && Number.isFinite(x.fin) && Math.abs(x.fin - s.entree) < 1e-6), i = l && ilotDe.get(l.atelier);
      return i ? { x: i.x + i.w / 2, y: i.y + i.h / 2 } : s.de ? porte(s.de) : porte(s.vers);
    };
    // Les files : devant chaque service, ses lots dans l'ordre de leur arrivée ; chacun, ses chariots à la suite.
    for (const [service, lots] of Object.entries(E.filesA(r, t, N))) {
      const places = placesDeFile(bande(service), lots.reduce((n, l) => n + l.chariots, 0));
      let k = 0;
      for (const l of lots) {
        const base = { quoi: 'chariot', ton: l.nature, couche: 1, etat: 'file', service, classe: l.classe, vol: l.vol };
        // Un lot qui vient d'entrer en stock roule deux minutes de son atelier à la file, en convoi, poussé par un personnage.
        const depuis = l.arrive < 1 ? source(l) : null, sort = depuis && porte(l.de || service), entre = depuis && porte(service);
        const chemin = depuis ? [depuis, sort, ...parAllees(site, sort, entre), entre] : null;
        if (depuis) out.pousseurs.push(pousseur([...chemin, places[k + l.chariots - 1]], l.arrive, l.chariots));
        for (let i = 0; i < l.chariots; i++, k++) {
          const p = depuis ? surChemin([...chemin, places[k]], avanceDuConvoi(l.arrive, i, l.chariots)) : places[k];
          out.chariots.push({ ...base, x: p.x, y: p.y, ...(depuis ? { enChemin: true } : {}) });
        }
      }
    }
    // Les lots en cours : dans l'îlot de leur atelier.
    const deja = new Map();
    for (const l of E.lotsEnCours(r, t, N)) {
      const ilot = ilotDe.get(l.atelier); if (!ilot) continue;
      const n0 = deja.get(l.atelier) || 0; deja.set(l.atelier, n0 + l.chariots);
      const z = zones.find(x => x.id === ilot.zone);
      for (const p of placesDansIlot(ilot, l.chariots, n0, z && z.bande === 0 ? 1 : -1)) out.chariots.push({ quoi: 'chariot', ton: l.nature, couche: 1, etat: 'en cours', service: l.service, atelier: l.atelier, classe: l.classes[0] ?? null, classes: l.classes, vol: null, x: p.x, y: p.y });
    }
    // Les retours sales : ils arrivent du quai des retours, attendent devant la plonge, passent dans leur tunnel.
    if (plonge) {
      const tunnels = plonge.tunnels || [], tunnelDe = nom => tunnels.find(x => x.nom === nom) || tunnels[0] || null, b = bandeDeFile(plonge, scene.ilots), retours = { x: site.largeur, y: site.couloir.y + site.couloir.h / 2 };
      // Dans un site disposé : du bord du quai (côté avions), par sa porte et les allées, jusqu'à la porte de la plonge.
      const parSaPorte = quaiAuBord && quai !== plonge;
      const parLeQuai = site.allees ? [versAvions, ...(parSaPorte ? [quai.porte] : []), ...(quaiAuBord && quai === plonge ? [] : parAllees(site, parSaPorte ? quai.porte : versAvions, plonge.porte)), plonge.porte] : null;
      const lavages = E.lavagesA(r, t, N), enFile = lavages.filter(x => x.etat === 'file' || x.etat === 'arrive'), places = placesDeFile(b, enFile.reduce((n, x) => n + x.chariots, 0));
      let k = 0;
      for (const x of enFile) {
        // Un retour qui arrive roule deux minutes depuis la route, du côté des avions, par le couloir, jusqu'à la file.
        const roule = x.etat === 'arrive', chemin = parLeQuai || [retours, { x: plonge.porte.x, y: retours.y }, plonge.porte];
        if (roule) out.pousseurs.push(pousseur([...chemin, places[k + x.chariots - 1]], x.arrive, x.chariots));
        for (let i = 0; i < x.chariots; i++, k++) {
          const p = roule ? surChemin([...chemin, places[k]], avanceDuConvoi(x.arrive, i, x.chariots)) : places[k];
          out.chariots.push({ quoi: 'chariot', ton: 'sale', couche: 1, etat: roule ? 'arrive' : 'file', service: plonge.services[0] || plonge.id, vol: x.vol, x: p.x, y: p.y, ...(roule ? { enChemin: true } : {}) });
        }
      }
      const devant = new Map();
      for (const x of lavages) {
        if (x.etat !== 'lave' && x.etat !== 'arrete') continue;
        const m = tunnelDe(x.tunnel); if (!m) continue;
        // Dans son tunnel : à son entrée. Arrêté : devant lui, du côté de la file, marqué « arrêté ».
        const enLong = m.h > m.w, rang = devant.get(m) || 0, cote = plonge.bande === 0 ? 1 : -1;
        if (x.etat === 'lave') out.chariots.push({ quoi: 'chariot', ton: 'sale', couche: 1, etat: 'lave', service: plonge.services[0] || plonge.id, vol: x.vol, tunnel: m.nom, x: enLong ? m.x + m.w / 2 : m.x - 0.45, y: enLong ? (cote > 0 ? m.y + m.h + 0.4 : m.y - 0.4) : m.y + m.h / 2 });
        else {
          devant.set(m, rang + x.chariots);
          for (let i = 0; i < x.chariots; i++) {
            const d = 0.6 + (rang + i) * 0.7, p = enLong ? { x: m.x + m.w + d, y: cote > 0 ? m.y + m.h - 0.4 : m.y + 0.4 } : { x: m.x + 0.4 + (rang + i) * 0.7, y: cote > 0 ? m.y + m.h + 0.55 : m.y - 0.55 };
            const q = dedans(p, plonge, 0.3);
            out.chariots.push({ quoi: 'chariot', ton: 'sale', couche: 1, etat: 'arrete', service: plonge.services[0] || plonge.id, vol: x.vol, tunnel: m.nom, x: q.x, y: q.y });
            if (i === 0) out.marques.push({ x: q.x, y: q.y, z: 1.3, texte: 'arrêté', ton: 'attente', vol: x.vol });
          }
        }
      }
      out.tunnels = [...new Set(lavages.filter(x => x.etat === 'lave').map(x => (tunnelDe(x.tunnel) || {}).nom).filter(n => n != null))];
    }
    // Les lignes robotisées : au travail quand une de leurs équipes a un lot en cours, avec sa cadence en clair. Chaque zone a
    // les siennes (évolution 20 a) ; deux équipes du même robot au travail en même temps : une seule ligne, leurs cadences s'ajoutent.
    const auTravail = new Map();
    for (const x of E.robotsA(r, t)) {
      const z = zones.find(q => (q.lignes || []).some(l => l.ateliers.includes(x.atelier))); if (!z) continue;
      const i = z.lignes.findIndex(l => l.ateliers.includes(x.atelier)), cle = z.id + ':' + i, deja = auTravail.get(cle);
      if (deja) deja.debit = deja.debit != null && x.debit != null ? deja.debit + x.debit : deja.debit ?? x.debit;
      else auTravail.set(cle, { ligne: i, atelier: x.atelier, debit: x.debit, lot: x.lot, zone: z.id });
    }
    for (const x of auTravail.values()) {
      const l = zones.find(q => q.id === x.zone).lignes[x.ligne], texte = x.debit ? Math.round(x.debit) + ' plateaux par heure' : 'au travail';
      out.lignes.push(x);
      out.marques.push({ x: l.x + l.w / 2, y: l.y + l.h / 2, z: H.bras + 0.3, texte, ton: 'travail', ligne: x.ligne, zone: x.zone });
    }
    // Les avions : chacun à sa place ; il décolle à son départ. Les véhicules : du quai aux avions, et retour.
    const aire = scene.aire, places = scene.places || E.placesDesVols(r);
    if (aire) {
      for (const v of E.volsA(r, t, places)) {
        const p = aire.places[v.place % aire.places.length];
        out.avions.push({ quoi: 'avion', couche: 1, id: v.id, cie: v.cie, depart: v.depart, charge: v.charge, retard: v.retard, enRetard: v.enRetard, decolle: v.decolle, x: p.x + v.decolle * 9, y: p.y, dz: v.decolle * 6, alpha: 1 - v.decolle });
      }
      const depart = versAvions, enBas = site.avions === 'bas', route = enBas ? aire.route.y + aire.route.h / 2 : aire.route.x + aire.route.w / 2;
      for (const c of E.vehiculesA(r, t)) {
        const p = aire.places[(places.places.get(c.vols[0]) ?? 0) % aire.places.length], but = { x: p.x - AVION.long / 2 - 0.2, y: p.y + 1.5 };
        // Par la route : le long du bord du site, jusqu'à la hauteur de l'avion.
        const q = surChemin(enBas ? [depart, { x: depart.x, y: route }, { x: but.x, y: route }, but] : [depart, { x: route, y: depart.y }, { x: route, y: but.y }, but], c.avance);
        out.vehicules.push({ quoi: 'vehicule', couche: 1, cle: c.cle, type: c.vehicule, camion: c.camion, phase: c.phase, vols: c.vols, avance: c.avance, x: q.x, y: q.y });
      }
    }
    return out;
  }

  /** « 1 présent », « 3 présents » ; « 1 lot à faire », « 4 lots à faire ». */
  const pluriel = (n, un, des) => n + ' ' + (n > 1 ? des : un);

  /**
   * Les étiquettes des services : une par zone, au-dessus d'elle ({ id, x, y, z, titre, lignes, compacte }). Par défaut, le
   * nom seul, en petit (une étiquette compacte) : les étiquettes ne cachent pas la scène. Les zones de `chiffres` (leurs
   * identifiants : celle qu'on survole, celle du service choisi, celle du goulot du moment) disent aussi « n au travail /
   * n présents » et, s'il y en a, « n lots à faire » (ce qui attend devant le service). `etat` : la journée à l'heure
   * rejouée (direct-etat.js) ; sans elle, le nom seul. `fond` : les côtés du fond pour l'angle de la caméra
   * (direct-camera.js) — l'étiquette se tient alors au-dessus du fond de sa zone, pour ne pas cacher ses ateliers ; sans
   * lui, au-dessus de son centre.
   */
  function etiquettes(site, etat, fond, chiffres) {
    const dx = fond ? (fond.x0 ? -1 : fond.x1 ? 1 : 0) : 0, dy = fond ? (fond.y0 ? -1 : fond.y1 ? 1 : 0) : 0, avec = new Set(chiffres || []);
    return ((site && site.zones) || []).map(z => {
      const lignes = [];
      if (etat && avec.has(z.id)) {
        const n = { auTravail: 0, presents: 0, lots: 0 };
        for (const s of z.services) { const x = etat.services[s]; if (x) { n.auTravail += x.auTravail; n.presents += x.presents; n.lots += x.lots; } }
        lignes.push(n.auTravail + ' au travail / ' + pluriel(n.presents, 'présent', 'présents'));
        if (n.lots > 0) lignes.push(pluriel(n.lots, 'lot à faire', 'lots à faire'));
      }
      return { id: z.id, x: z.x + z.w * (0.5 + 0.3 * dx), y: z.y + z.h * (0.5 + 0.3 * dy), z: H.etiquette, titre: z.nom, lignes, ...(lignes.length ? {} : { compacte: true }) };
    });
  }

  /** Un vol porte son étiquette s'il part dans l'heure ; six vols au plus la portent en même temps. */
  const HEURE_DES_VOLS = 60, VOLS_ETIQUETES = 6;
  /**
   * Les vols qui portent leur étiquette à `t` (leurs identifiants) : ceux qu'on charge — une tournée du handling est en
   * route vers eux ou les charge (`vehicules`, direct-etat.js) —, puis ceux dont l'heure de départ tombe dans l'heure qui
   * vient, les plus proches d'abord ; `max` au plus. Les autres la portent au survol : un vol qui a passé son heure sans
   * être chargé garde sa dérive critique, et dit son retard quand on le survole ou qu'on vient le charger.
   */
  function volsEtiquetes(avions, vehicules, t, max = VOLS_ETIQUETES) {
    const enCharge = new Set();
    for (const v of vehicules || []) if (v.phase !== 'retour') for (const id of v.vols || []) enCharge.add(id);
    return (avions || []).filter(a => !(a.decolle > 0) && (enCharge.has(a.id) || (a.depart >= t && a.depart - t <= HEURE_DES_VOLS)))
      .sort((a, b) => (enCharge.has(b.id) - enCharge.has(a.id)) || a.depart - b.depart || String(a.id).localeCompare(String(b.id)))
      .slice(0, Math.max(0, max)).map(a => a.id);
  }

  /** « 20 min », « 1 h 05 » : un retard en clair. */
  const dureeEnClair = m => { const n = Math.max(1, Math.round(m)); return n < 60 ? n + ' min' : Math.floor(n / 60) + ' h ' + String(n % 60).padStart(2, '0'); };
  const heureEnClair = t => { const m = ((Math.round(t) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };

  /**
   * Les étiquettes des avions : une par vol présent ({ id: 'vol:…', vol, x, y, z, titre, lignes: [], compacte, ton }) — son
   * numéro et son heure, sur une ligne ; chargé en retard, passé son heure, elle prend la couleur critique (`ton`) et dit
   * le retard (celui du résultat ; « pas chargé » s'il ne l'est jamais). Compactes : elles tiennent au-dessus de leurs avions.
   */
  function etiquettesDesVols(avions) {
    return (avions || []).filter(a => !(a.decolle > 0)).map(a => ({ id: 'vol:' + a.id, vol: a.id, x: a.x, y: a.y, z: H.avion, compacte: true, lignes: [],
      titre: a.id + ' · ' + heureEnClair(a.depart) + (a.enRetard ? ' · ' + (a.retard > 0 ? 'retard ' + dureeEnClair(a.retard) : 'pas chargé') : ''), ...(a.enRetard ? { ton: 'critique' } : {}) }));
  }

  /** Le texte d'une étiquette, en pixels : toujours les mêmes, à tout zoom et à tout angle. */
  const ETIQUETTE = { titre: 12.5, ligne: 11.5, marge: 7, interligne: 15 };
  /** Une étiquette compacte (un avion) : une ligne de 11 px, dans une pastille de 18 px. */
  const COMPACTE = { titre: 11, ligne: 11, marge: 5, interligne: 11, h: 18 };
  /** Une phrase repliée en lignes d'au plus `n` caractères, coupée aux espaces : l'étiquette du goulot reste étroite. */
  function replier(texte, n) {
    const lignes = [];
    for (const mot of String(texte).split(' ')) { const d = lignes[lignes.length - 1]; if (d !== undefined && (d + ' ' + mot).length <= n) lignes[lignes.length - 1] = d + ' ' + mot; else lignes.push(mot); }
    return lignes;
  }
  /** Sans navigateur, la largeur d'un texte s'estime (pour les tests) ; dans la page, la vue donne la vraie (`mesure`). */
  const estimer = (texte, gras) => String(texte).length * (gras ? 7.3 : 6.3);
  /** La taille d'une étiquette à l'écran : son titre, ses lignes, sa marge. */
  function tailleEtiquette(e, mesure) {
    const m = mesure || estimer, w = Math.max(m(e.titre, true), ...e.lignes.map(l => m(l, false)));
    if (e.compacte) return { w: Math.ceil(m(e.titre, true) * COMPACTE.titre / ETIQUETTE.titre + 2 * COMPACTE.marge + 2), h: COMPACTE.h };
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
    const ancres = vues.map(a => ({ id: a.e.id, ax: a.ax, ay: a.ay, ...tailleEtiquette(a.e, mesure), ...(a.e.avant ? { avant: a.e.avant } : {}) }));
    return CAM().placerEtiquettes(ancres, ecran).map((r, i) => ({ ...r, titre: vues[i].e.titre, lignes: vues[i].e.lignes, ...(vues[i].e.ton ? { ton: vues[i].e.ton } : {}), ...(vues[i].e.vol != null ? { vol: vues[i].e.vol } : {}), ...(vues[i].e.compacte ? { compacte: true } : {}), ...(vues[i].e.marque ? { marque: true } : {}) }));
  }

  const api = { H, MUR, TRONCON, ETIQUETTE, COMPACTE, replier, POSTES, TABLE, RANG, FILE, boite, boiteCadree, boiteDeZone, zoneDuService, zoneSous, decor, boitesDe, etiquettes, HEURE_DES_VOLS, VOLS_ETIQUETES, volsEtiquetes, tailleEtiquette, poserEtiquettes, pluriel,
    ROUTE, AVION, PAS_FILE, aireDe, bandeDeFile, placesDeFile, placesDansIlot, circulation, etiquettesDesVols, avanceDuConvoi,
    posteParDefaut, posteDe, tablesPour, formeIlot, ilots, placeDe, meublesDe, ancreDuNom, MARCHE, TON_ETAT, ORDRE_ETATS, etatDe, surChemin, placePause, personnages };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyDirectScene = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

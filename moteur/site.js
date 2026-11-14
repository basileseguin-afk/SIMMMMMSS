/* ==========================================================================
 *  LE SITE DE LA VUE EN DIRECT — généré par des règles (évolution 16 a, v1)
 *  ------------------------------------------------------------------------
 *  La vue en relief ne recopie pas le plan dessiné : elle montre un site
 *  schématique, construit ici à partir des réglages de la simulation — les
 *  ateliers, les chemins, la part de surface de chaque service. Les mêmes
 *  réglages donnent toujours le même site. Rien n'est décoratif : une zone
 *  par service qui a un atelier, une ligne robotisée par atelier robot présent
 *  en même temps, un tunnel par tunnel tenu en même temps.
 *
 *  Ce module ne lit que des réglages et ne calcule rien de la journée. Il ne
 *  touche à rien : il rend un objet neuf. Sans navigateur : il se teste.
 *
 *  Les règles :
 *   - le site est un rectangle : deux bandes de zones, de part et d'autre d'un
 *     couloir central ; l'entrée est au bout gauche du couloir, l'aire de
 *     pause la jouxte ; les avions sont du côté droit ;
 *   - une zone par service qui a au moins un atelier ; la préparation et le
 *     montage partagent une seule zone, « FOOD » ;
 *   - chaque service a une part de surface (un réglage, en %). Par défaut : le
 *     magasin 1/5, la production (FOOD) 1/5, l'armement 1/5, et les autres
 *     services se partagent 2/5 au prorata de leurs personnes, chacun gardant
 *     au moins la place de ses ateliers. Les parts se ramènent à un total de 1 ;
 *   - les zones se rangent dans l'ordre du chemin, de l'amont vers l'aval : le
 *     magasin d'abord (côté arrivées), le quai du handling au bout (côté
 *     avions), la plonge au bout de l'autre bande (près du quai des retours).
 * ==========================================================================*/
(function (root) {
  'use strict';
  const enNode = typeof module !== 'undefined' && module.exports;
  const P = () => (enNode ? require('./production.js') : root.MoteurProduction);
  const ORDRE = () => (enNode ? require('./ordre-services.js') : root.OrlyOrdreServices);

  /** Les services de la production : la préparation et le montage, dans une seule zone. */
  const FOOD = ['preparation', 'prepa'];
  /** Les parts par défaut : trois grandes zones à 1/5, et 2/5 pour tous les autres services. */
  const PARTS = { magasin: 0.2, food: 0.2, armement: 0.2, autres: 0.4 };
  /** Les dimensions fixes du dessin, en mètres de la scène. */
  const COULOIR = 3, PAUSE = { w: 7, h: 8 }, SURFACE_MIN = 600, ALLONGEMENT = 2.2, LARGEUR_MIN = 4;
  /** Une machine : sa largeur, sa profondeur, le pas entre deux rangs, l'écart entre deux colonnes, et la place qu'elle prend. */
  const ECART = 0.8;
  const LIGNE = { w: 9, h: 1.6, pas: 2.8, place: (9 + ECART) * 2.8 }, TUNNEL = { w: 6.5, h: 1.3, pas: 2.6, place: (6.5 + ECART) * 2.6 }, RAYON = { h: 1, pas: 2.2, place: 20 };
  /** La place d'un atelier : un socle, plus de quoi tenir debout autour de ses postes ; avec une marge pour circuler. */
  const MARGE = 1.3;
  const placeAtelier = a => 6 + 2.6 * Math.max(0, +a.personnes || 0);

  const somme = (l, f) => l.reduce((n, x) => n + f(x), 0);
  const personnesDe = l => somme(l, a => Math.max(0, +a.personnes || 0));

  /** La présence d'un atelier dans la journée : de son début à la fin de sa présence (sans règle de poste : 24 h). */
  function presenceDe(a, regime) {
    // Une heure illisible est refusée à la saisie (ateliers.js) ; ici, elle vaut minuit plutôt que d'empêcher le dessin.
    let minute = 0;
    try { minute = P().minutes(a.debut); } catch (e) { minute = 0; }
    const debut = minute + (+a.jour || 0) * P().MINUTES_PAR_JOUR, reg = P().normaliserRegime(a.regime, regime);
    return { debut, fin: debut + (reg.actif && reg.presence > 0 ? reg.presence : P().MINUTES_PAR_JOUR) };
  }

  /**
   * Les lignes robotisées : autant que d'ateliers robot présents en même temps. Deux équipes qui se succèdent partagent
   * la même ligne ; chaque atelier prend la première ligne libre à son arrivée. Rend [[ids des ateliers de la ligne]].
   */
  function lignesRobot(robots, regime) {
    const lignes = [];
    for (const x of robots.map(a => ({ id: a.id, ...presenceDe(a, regime) })).sort((p, q) => p.debut - q.debut)) {
      const l = lignes.find(y => y.fin <= x.debut + 1e-9);
      if (l) { l.ateliers.push(x.id); l.fin = x.fin; } else lignes.push({ ateliers: [x.id], fin: x.fin });
    }
    return lignes.map(l => l.ateliers);
  }

  /** Les tunnels qui tournent d'une équipe de plonge : ceux de sa liste que quelqu'un tient ; sans liste, un seul. */
  const tournentDe = a => (Array.isArray(a.tunnels) && a.tunnels.length ? P().tunnelsQuiTournent(a).tournent : (+a.personnes > 0 ? [{ nom: 'Tunnel' }] : []));
  /**
   * Les tunnels d'une plonge : le plus grand nombre de machines tenues en même temps. Deux équipes présentes ensemble avec
   * un tunnel du même nom tiennent la même machine ; des équipes qui se succèdent partagent les mêmes tunnels. Rend leurs
   * noms, ceux du premier moment où ils sont le plus nombreux.
   */
  function tunnelsDe(plonges, regime) {
    const eqs = plonges.map(a => { const t = tournentDe(a), cles = P().machinesDesTunnels(a, t); return { ...presenceDe(a, regime), machines: t.map((x, i) => [cles[i], (x && x.nom) || 'Tunnel ' + (i + 1)]) }; });
    let mieux = [];
    for (const t of [...new Set(eqs.map(e => e.debut))].sort((x, y) => x - y)) {
      const tenues = new Map();
      for (const e of eqs) if (e.debut <= t + 1e-9 && e.fin > t + 1e-9) for (const [cle, nom] of e.machines) if (!tenues.has(cle)) tenues.set(cle, nom);
      if (tenues.size > mieux.length) mieux = [...tenues.values()];
    }
    return mieux;
  }

  /**
   * Les zones du site, dans l'ordre du chemin : une par service qui a un atelier ; la préparation et le montage dans la
   * seule zone « FOOD », qui existe aussi dès qu'il y a un atelier robot (pour sa ligne). Chacune : son rôle, ses services,
   * ses ateliers (dans l'ordre des réglages), ses personnes.
   */
  function zonesDe(ateliers, parcours, noms) {
    const ids = [...new Set(ateliers.map(a => a.service))];
    const ordre = ORDRE().avecCases(parcours) ? ORDRE().ordreDesServices(parcours, ids) : ids;
    const types = s => new Set(ateliers.filter(a => a.service === s).map(a => a.type));
    const roleDe = s => (s === 'magasin' ? 'magasin' : s === 'armement' ? 'armement' : types(s).has('handling') ? 'quai' : types(s).has('lavage') ? 'plonge' : 'autre');
    const zones = [];
    for (const s of ordre) {
      if (FOOD.includes(s)) { let z = zones.find(x => x.id === 'food'); if (!z) zones.push(z = { id: 'food', nom: 'FOOD', role: 'food', services: [] }); z.services.push(s); }
      else zones.push({ id: s, nom: (noms && noms[s]) || s, role: roleDe(s), services: [s] });
    }
    if (ateliers.some(a => a.type === 'robot') && !zones.some(z => z.id === 'food')) zones.push({ id: 'food', nom: 'FOOD', role: 'food', services: [] });
    for (const z of zones) {
      // Les services d'une zone dans l'ordre de la production (la préparation avant le montage), ses ateliers dans celui des réglages.
      if (z.id === 'food') z.services.sort((p, q) => FOOD.indexOf(p) - FOOD.indexOf(q));
      const siens = ateliers.filter(a => z.services.includes(a.service));
      z.ateliers = siens.map(a => a.id); z.personnes = personnesDe(siens);
    }
    return zones;
  }

  /**
   * Les parts de surface, ramenées à un total de 1. Une part réglée (en %) remplace le défaut de son service. Par défaut :
   * le magasin, la production et l'armement 1/5 chacun (la production, entre ses services au prorata de leurs personnes) ;
   * les autres services se partagent 2/5 au prorata de leurs personnes. Aucune part, réglée ou par défaut, ne descend sous
   * `plancher(zone)` — la place de ses ateliers, en part du site : une part réglée trop petite n'agrandit pas tout le site.
   * Rend une Map zone → part.
   */
  function partsDe(zones, ateliers, surfaces, plancher) {
    const reglee = s => { const p = +((surfaces || {})[s]); return Number.isFinite(p) && p > 0 ? p / 100 : null; };
    const pers = s => personnesDe(ateliers.filter(a => a.service === s));
    const brut = new Map();
    // Les autres services : au prorata de leurs personnes (à parts égales si personne), sans descendre sous leur plancher.
    const autres = zones.filter(z => z.role !== 'magasin' && z.role !== 'armement' && z.role !== 'food' && reglee(z.services[0]) === null);
    const partage = new Map(autres.map(z => [z.id, 0]));
    let libres = autres.slice(), reste = PARTS.autres;
    for (;;) {
      const total = somme(libres, z => z.personnes);
      const voulu = z => (total > 0 ? reste * z.personnes / total : reste / libres.length);
      const sous = libres.filter(z => voulu(z) < plancher(z) - 1e-12);
      if (!sous.length) { for (const z of libres) partage.set(z.id, voulu(z)); break; }
      for (const z of sous) { partage.set(z.id, plancher(z)); reste -= plancher(z); }
      libres = libres.filter(z => !sous.includes(z));
      if (!libres.length) break;
      if (reste <= 0) { for (const z of libres) partage.set(z.id, plancher(z)); break; }
    }
    for (const z of zones) {
      if (z.role === 'food') {
        // La production : 1/5, entre ses services au prorata de leurs personnes ; une part réglée remplace celle de son service.
        const total = somme(z.services, pers);
        brut.set(z.id, z.services.length ? somme(z.services, s => reglee(s) ?? PARTS.food * (total > 0 ? pers(s) / total : 1 / z.services.length)) : PARTS.food);
      } else {
        const r = reglee(z.services[0]);
        brut.set(z.id, r !== null ? r : z.role === 'magasin' ? PARTS.magasin : z.role === 'armement' ? PARTS.armement : partage.get(z.id));
      }
      brut.set(z.id, Math.max(brut.get(z.id), plancher(z)));
    }
    const total = somme([...brut.values()], x => x);
    return new Map([...brut].map(([id, x]) => [id, total > 0 ? x / total : 0]));
  }

  /** Les bandes : le magasin en tête de la première, le quai au bout ; la plonge au bout de la seconde ; les autres zones,
   *  dans l'ordre du chemin, dans la bande la moins remplie. */
  function bandesDe(zones, parts) {
    const tete = zones.filter(z => z.role === 'magasin'), quais = zones.filter(z => z.role === 'quai'), plonges = zones.filter(z => z.role === 'plonge');
    const milieu = [[], []], poids = [somme(tete.concat(quais), z => parts.get(z.id)), somme(plonges, z => parts.get(z.id))];
    for (const z of zones.filter(x => !tete.includes(x) && !quais.includes(x) && !plonges.includes(x))) {
      const k = poids[1] < poids[0] - 1e-12 ? 1 : 0;
      milieu[k].push(z); poids[k] += parts.get(z.id);
    }
    const bandes = [tete.concat(milieu[0], quais), milieu[1].concat(plonges)];
    // Une seule bande occupée : c'est la première.
    return bandes[0].length ? bandes : [bandes[1], []];
  }

  /**
   * `n` machines rangées depuis le fond d'une zone (le côté opposé au couloir), dans ses murs : en rangs, sur une colonne
   * tant qu'elles tiennent, sur plusieurs sinon ; dans une zone étroite et profonde, elles se posent dans le sens de la
   * profondeur ; si la zone reste trop petite pour leur taille, elles rétrécissent ensemble. Jamais l'une sur l'autre,
   * jamais hors de la zone. Sans largeur (`forme.w`) : toute la largeur, en rangs. Rend [{ x, y, w, h }].
   */
  function empiler(z, n, forme) {
    if (!(n > 0)) return [];
    const mx = Math.min(1, 0.2 * z.w), my = Math.min(0.6, 0.15 * z.h), W = z.w - 2 * mx, H = z.h - 2 * my, allee = forme.pas - forme.h;
    // Les deux sens : en travers (la machine le long du fond), ou en long ; `a` × `b` : sa taille le long de x et de y.
    const sens = forme.w ? [{ a: forme.w, b: forme.h, ex: ECART, ey: allee }, { a: forme.h, b: forme.w, ex: allee, ey: ECART }] : [{ a: W, b: forme.h, ex: ECART, ey: allee }];
    let mieux = null;
    for (const o of sens) for (let cols = 1; cols <= n; cols++) {
      const rangs = Math.ceil(n / cols), k = Math.min(1, W / (cols * o.a + (cols - 1) * o.ex), H / (rangs * o.b + (rangs - 1) * o.ey));
      if (!mieux || k > mieux.k + 1e-9) mieux = { ...o, cols, rangs, k };
    }
    const { cols, rangs, k } = mieux, w = mieux.a * k, h = mieux.b * k, ex = mieux.ex * k, ey = mieux.ey * k;
    const x0 = z.x + (z.w - (cols * w + (cols - 1) * ex)) / 2;
    return Array.from({ length: n }, (_, i) => {
      const d = my + (i % rangs) * (h + ey);
      return { x: x0 + Math.floor(i / rangs) * (w + ex), y: z.bande === 0 ? z.y + d : z.y + z.h - d - h, w, h };
    });
  }

  /**
   * Le site généré à partir des réglages : { ateliers, parcours, noms, surfaces, regime }.
   * Rend { largeur, profondeur, surface, couloir, entree, pause, emprise, avions, zones } ; chaque zone :
   * { id, nom, role, services, ateliers, personnes, part, surface, minimum, bande, x, y, w, h, porte } — plus `lignes` (la
   * zone FOOD : les lignes robotisées, chacune avec ses ateliers), `tunnels` (une zone qui lave) ou `rayonnages` (le magasin).
   */
  function generer(reglages) {
    const r = reglages || {}, ateliers = (Array.isArray(r.ateliers) ? r.ateliers : []).filter(a => a && a.id != null && a.service != null);
    const zones = zonesDe(ateliers, r.parcours, r.noms || {});
    const vide = { largeur: 0, profondeur: COULOIR, surface: 0, couloir: { x: 0, y: 0, w: 0, h: COULOIR }, entree: { x: 0, y: COULOIR / 2 },
      pause: { x: -PAUSE.w, y: 0, w: PAUSE.w, h: COULOIR }, emprise: { x0: -PAUSE.w, y0: 0, x1: 0, y1: COULOIR }, avions: 'droite', zones: [] };
    if (!zones.length) return vide;
    const parId = new Map(ateliers.map(a => [a.id, a]));
    const lignes = lignesRobot(ateliers.filter(a => a.type === 'robot'), r.regime);
    for (const z of zones) {
      // Les tunnels : dans la zone de la plonge, et dans toute zone dont un atelier lave (un quai qui a sa propre équipe de
      // lavage) — sauf la production et le magasin, qui ont leurs propres machines.
      const laveurs = z.role === 'food' || z.role === 'magasin' ? [] : z.ateliers.map(id => parId.get(id)).filter(a => a.type === 'lavage');
      if (z.role === 'plonge' || laveurs.length) z.tunnels = tunnelsDe(laveurs, r.regime);
      // La place qu'il faut à la zone : ses ateliers, ses machines, ses rayonnages.
      z.minimum = MARGE * somme(z.ateliers, id => placeAtelier(parId.get(id))) + (z.role === 'food' ? lignes.length * LIGNE.place : 0)
        + (z.tunnels ? z.tunnels.length * TUNNEL.place : 0) + (z.role === 'magasin' ? RAYON.place : 0);
    }
    // Le site : assez grand pour tous, sans descendre sous un minimum ; puis, les parts fixées, pour que chaque zone tienne.
    const base = Math.max(SURFACE_MIN, 1.6 * somme(zones, z => z.minimum));
    // Une zone garde aussi une largeur où ses îlots tiennent : un minimum de surface, d'après la profondeur d'une bande.
    const etroit = LARGEUR_MIN * Math.sqrt(base / ALLONGEMENT) / 2;
    for (const z of zones) z.minimum = Math.max(z.minimum, etroit);
    const parts = partsDe(zones, ateliers, r.surfaces, z => z.minimum / base);
    const surface = Math.max(base, ...zones.map(z => (parts.get(z.id) > 0 ? z.minimum / parts.get(z.id) : 0)));
    const largeur = Math.sqrt(ALLONGEMENT * surface), bandes = bandesDe(zones, parts);
    const fond = bandes.map(b => surface * somme(b, z => parts.get(z.id)) / largeur);
    const y = [0, fond[0] + COULOIR], sortie = [];
    bandes.forEach((b, k) => {
      let x = 0;
      for (const z of b) {
        const s = parts.get(z.id) * surface, w = s / fond[k];
        const pose = { id: z.id, nom: z.nom, role: z.role, services: z.services, ateliers: z.ateliers, personnes: z.personnes, part: parts.get(z.id), surface: s, minimum: z.minimum,
          bande: k, x, y: y[k], w, h: fond[k], porte: { x: x + w / 2, y: k === 0 ? fond[0] : fond[0] + COULOIR } };
        if (z.role === 'food') pose.lignes = empiler(pose, lignes.length, LIGNE).map((p, i) => ({ ...p, ateliers: lignes[i] }));
        if (z.tunnels) pose.tunnels = empiler(pose, z.tunnels.length, TUNNEL).map((p, i) => ({ nom: z.tunnels[i], ...p }));
        if (z.role === 'magasin') pose.rayonnages = empiler(pose, Math.max(1, Math.floor((pose.h - 1.2 - RAYON.h) / RAYON.pas) + 1), RAYON);
        sortie.push(pose); x += w;
      }
    });
    const profondeur = fond[0] + COULOIR + fond[1];
    // L'aire de pause : à gauche de l'entrée, le long de la seconde bande (ou de la première, s'il n'y en a qu'une).
    const hp = Math.min(PAUSE.h, Math.max(COULOIR, fond[1] || fond[0]));
    const pause = { x: -PAUSE.w, y: fond[1] > 0 ? fond[0] + COULOIR : Math.max(0, fond[0] - hp), w: PAUSE.w, h: hp };
    // Les zones dans l'ordre du chemin, comme elles ont été données.
    const rang = new Map(zones.map((z, i) => [z.id, i]));
    return { largeur, profondeur, surface, couloir: { x: 0, y: fond[0], w: largeur, h: COULOIR }, entree: { x: 0, y: fond[0] + COULOIR / 2 }, pause,
      emprise: { x0: pause.x, y0: 0, x1: largeur, y1: profondeur }, avions: 'droite', zones: sortie.sort((p, q) => rang.get(p.id) - rang.get(q.id)) };
  }

  const api = { generer, FOOD, PARTS, lignesRobot, tunnelsDe };
  if (enNode) module.exports = api;
  else root.OrlySite = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

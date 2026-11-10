/* ==========================================================================
 *  LE PLAN REJOUÉ : CE QUI SE PASSE À L'HEURE REJOUÉE (version 1, évolution
 *  14 b — README, « Le plan rejoué »)
 *  ------------------------------------------------------------------------
 *  — « Ce qui circule » : un trait par paire de services qui ont des repas en
 *    stock entre eux à l'heure rejouée. Ces stocks sont les séjours que le
 *    moteur rend déjà (resultat.stocks.sejours : de, vers, entree, sortie,
 *    repas), ceux de la page « Stocks et retours ». L'épaisseur va de 1 à
 *    8 px, proportionnelle à la racine de la quantité (la plus grosse paire
 *    de la journée fait 8 px) ; au plus 8 traits, les plus petits se replient
 *    dans « + n liens » ; les trois plus épais portent leur quantité ;
 *  — le tracé va d'un bord de zone à l'autre, au point le plus proche, en
 *    courbe douce, et contourne les zones quand il le peut ; une pointe, à
 *    l'arrivée ;
 *  — pendant la lecture, des points avancent le long des traits, un par
 *    tranche de repas (la tranche se dit dans la légende) ; avec
 *    prefers-reduced-motion, pas de points ;
 *  — au centre de chaque service, « au travail / présents » (les créneaux de
 *    15 min des indicateurs de charge) et, s'il y en a, « n en file » ;
 *  — le handling : pendant chaque trajet, un camion (ou un VL) va du quai vers
 *    le bord du plan, du côté des avions, puis revient.
 *  Rien n'est calculé ici qui ne le soit déjà par le moteur. Les fonctions
 *  sans navigateur se testent sous Node ; sim.js dessine.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const enNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';

  /** Les épaisseurs, en pixels d'écran. */
  const EPAISSEUR_MIN = 1, EPAISSEUR_MAX = 8;
  /** Au plus tant de traits ; au-delà, « + n liens ». Les plus épais portent une étiquette. */
  const TRAITS_MAX = 8, ETIQUETTES = 3;
  /** Une traversée d'un trait par un point, en minutes simulées : les points avancent au rythme de la lecture. */
  const PERIODE = 30;
  /** Au plus tant de points sur le plus gros trait : la tranche de repas en découle. */
  const POINTS_MAX = 6;
  const TRANCHES = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];

  /* ---- ce qui circule ----------------------------------------------------------- */

  /**
   * Les paires de services qui ont des repas en stock entre eux à `t` : { de, vers, repas }, les plus grosses
   * d'abord. Seuls les services dessinés comptent (`connus`, un Set d'identifiants) ; un séjour d'un service vers
   * lui-même n'est pas un trait.
   */
  function circulation(sejours, t, connus) {
    const par = new Map();
    for (const s of sejours || []) {
      if (!(t >= s.entree && t < s.sortie) || !(s.repas > 0) || s.de === s.vers) continue;
      if (connus && (!connus.has(s.de) || !connus.has(s.vers))) continue;
      const k = s.de + '\u0000' + s.vers;
      par.set(k, (par.get(k) || 0) + s.repas);
    }
    return [...par.entries()].map(([k, repas]) => { const [de, vers] = k.split('\u0000'); return { de, vers, repas }; })
      .sort((a, b) => b.repas - a.repas || (a.de < b.de ? -1 : a.de > b.de ? 1 : 0) || (a.vers < b.vers ? -1 : a.vers > b.vers ? 1 : 0));
  }

  /** La plus grosse quantité qu'une paire porte à un instant de la journée : la référence des épaisseurs (8 px). */
  function reference(sejours, connus) {
    const evts = new Map();
    for (const s of sejours || []) {
      if (!(s.repas > 0) || s.de === s.vers || !(s.sortie > s.entree)) continue;
      if (connus && (!connus.has(s.de) || !connus.has(s.vers))) continue;
      const k = s.de + '\u0000' + s.vers;
      if (!evts.has(k)) evts.set(k, []);
      evts.get(k).push([s.entree, s.repas], [s.sortie, -s.repas]);
    }
    let max = 0;
    for (const e of evts.values()) {
      e.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      let q = 0;
      for (const [, d] of e) { q += d; if (q > max) max = q; }
    }
    return max;
  }

  /** L'épaisseur d'un trait : proportionnelle à la racine de la quantité, de 1 à 8 px. */
  function epaisseur(q, ref) {
    if (!(q > 0) || !(ref > 0)) return 0;
    return Math.max(EPAISSEUR_MIN, Math.min(EPAISSEUR_MAX, EPAISSEUR_MAX * Math.sqrt(q / ref)));
  }

  /** Les traits dessinés (au plus 8), les plus épais étiquetés, et combien de paires se replient. */
  function traits(paires, ref) {
    const vus = paires.slice(0, TRAITS_MAX).map((p, i) => ({ ...p, epaisseur: epaisseur(p.repas, ref), etiquette: i < ETIQUETTES }));
    return { traits: vus, autres: Math.max(0, paires.length - TRAITS_MAX) };
  }

  /** La tranche de repas d'un point : un nombre rond, tel que le plus gros trait de la journée ait au plus 6 points. */
  function tranche(ref) {
    if (!(ref > 0)) return null;
    return TRANCHES.find(x => ref / x <= POINTS_MAX) || TRANCHES[TRANCHES.length - 1];
  }

  /** Les points d'un trait à `t` : un par tranche (au moins un), répartis, avançant d'une traversée toutes les 30 min. */
  function points(q, tr, t) {
    if (!(q > 0) || !(tr > 0)) return [];
    const n = Math.max(1, Math.ceil(q / tr)), phase = ((t / PERIODE) % 1 + 1) % 1;
    return Array.from({ length: n }, (_, i) => (phase + i / n) % 1);
  }

  /* ---- le tracé ----------------------------------------------------------------- */

  const centreDe = b => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

  /**
   * Les points les plus proches des bords de deux zones : en face l'un de l'autre quand elles se chevauchent d'un côté.
   * En diagonale, les coins qui se font face, un peu rentrés le long des bords ; `sens` force le départ par un côté
   * ('h', à gauche ou à droite) ou par le haut ou le bas ('v') — sinon, le côté du plus grand écart.
   */
  function bords(a, b, sens) {
    const ox = Math.max(a.x, b.x), fx = Math.min(a.x + a.w, b.x + b.w), oy = Math.max(a.y, b.y), fy = Math.min(a.y + a.h, b.y + b.h);
    if (fx > ox) {                          // l'une au-dessus de l'autre
      const x = (ox + fx) / 2, dessus = a.y + a.h <= b.y + b.h / 2;
      return [{ x, y: dessus ? a.y + a.h : a.y }, { x, y: dessus ? b.y : b.y + b.h }];
    }
    if (fy > oy) {                          // l'une à côté de l'autre
      const y = (oy + fy) / 2, gauche = a.x + a.w <= b.x + b.w / 2;
      return [{ x: gauche ? a.x + a.w : a.x, y }, { x: gauche ? b.x : b.x + b.w, y }];
    }
    const ca = centreDe(a), cb = centreDe(b), sx = cb.x > ca.x ? 1 : -1, sy = cb.y > ca.y ? 1 : -1;
    const coin = (z, sxx, syy) => ({ x: sxx > 0 ? z.x + z.w : z.x, y: syy > 0 ? z.y + z.h : z.y });
    const pa = coin(a, sx, sy), pb = coin(b, -sx, -sy);
    // Le départ se fait au milieu d'un bord, pas d'un coin : un départ franc.
    if ((sens || (Math.abs(cb.x - ca.x) >= Math.abs(cb.y - ca.y) ? 'h' : 'v')) === 'h') { pa.y = ca.y + sy * a.h * 0.3; pb.y = cb.y - sy * b.h * 0.3; }
    else { pa.x = ca.x + sx * a.w * 0.3; pb.x = cb.x - sx * b.w * 0.3; }
    return [pa, pb];
  }
  const enDiagonale = (a, b) => !(Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x)) && !(Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y));

  /** Un point d'une courbe de Bézier quadratique. */
  const sur = (p0, c, p1, s) => ({ x: (1 - s) * (1 - s) * p0.x + 2 * (1 - s) * s * c.x + s * s * p1.x, y: (1 - s) * (1 - s) * p0.y + 2 * (1 - s) * s * c.y + s * s * p1.y });
  const dedans = (p, z, m) => p.x > z.x - m && p.x < z.x + z.w + m && p.y > z.y - m && p.y < z.y + z.h + m;
  /** Les courbures essayées, de la plus douce à la plus franche (fraction de la longueur). */
  const COURBURES = [0.12, -0.12, 0.3, -0.3, 0.5, -0.5, 0.75, -0.75, 1, -1];
  const ECHANTILLONS = 24;

  /** Une courbure : combien d'autres zones elle traverse, et sur quelle longueur (en échantillons). */
  function essai(p0, p1, f, autres) {
    const dx = p1.x - p0.x, dy = p1.y - p0.y, L = Math.hypot(dx, dy) || 1;
    const c = { x: (p0.x + p1.x) / 2 - dy / L * f * L, y: (p0.y + p1.y) / 2 + dx / L * f * L };
    let croise = 0, dans = 0;
    for (const z of autres) {
      const marge = Math.min(z.w, z.h) * 0.02;
      let n = 0;
      for (let i = 1; i < ECHANTILLONS; i++) if (dedans(sur(p0, c, p1, i / ECHANTILLONS), z, marge)) n++;
      if (n) { croise++; dans += n; }
    }
    return { p0, c, p1, croise, dans, f: Math.abs(f) };
  }

  /**
   * Le tracé d'un trait, de la zone `a` à la zone `b` (boîtes, unités du plan), en courbe douce : la plus douce qui ne
   * traverse aucune autre zone (`obstacles`) ; en diagonale, en partant d'abord par le côté du plus grand écart, puis
   * par l'autre ; sinon, celle qui en traverse le moins long (elle rase un coin plutôt que de couper une zone).
   * { p0, c, p1, croise }.
   */
  function trace(a, b, obstacles) {
    const autres = (obstacles || []).filter(z => z !== a && z !== b);
    const departs = [bords(a, b)];
    if (enDiagonale(a, b)) {
      const ca = centreDe(a), cb = centreDe(b), h = Math.abs(cb.x - ca.x) >= Math.abs(cb.y - ca.y);
      departs.push(bords(a, b, h ? 'v' : 'h'));
    }
    let mieux = null;
    for (const [p0, p1] of departs) {
      for (const f of COURBURES) {
        const e = essai(p0, p1, f, autres);
        if (!e.croise) return { p0: e.p0, c: e.c, p1: e.p1, croise: 0 };
        if (!mieux || e.dans < mieux.dans || (e.dans === mieux.dans && e.f < mieux.f)) mieux = e;
      }
    }
    return { p0: mieux.p0, c: mieux.c, p1: mieux.p1, croise: mieux.croise };
  }

  /**
   * Le chemin SVG d'un tracé, et la pointe à l'arrivée (longueur `l`, unités du plan), le long de la tangente. Le trait
   * s'arrête à la base de la pointe : son bout épais ne dépasse pas d'elle.
   */
  function chemin(tr, l) {
    const { p0, c, p1 } = tr, a = Math.atan2(p1.y - c.y, p1.x - c.x), o = 0.45;
    const f = n => n.toFixed(1), base = { x: p1.x - l * Math.cos(o) * Math.cos(a), y: p1.y - l * Math.cos(o) * Math.sin(a) };
    return {
      d: 'M' + f(p0.x) + ' ' + f(p0.y) + ' Q' + f(c.x) + ' ' + f(c.y) + ' ' + f(base.x) + ' ' + f(base.y),
      pointe: 'M' + f(p1.x - l * Math.cos(a - o)) + ' ' + f(p1.y - l * Math.sin(a - o)) + ' L' + f(p1.x) + ' ' + f(p1.y)
        + ' L' + f(p1.x - l * Math.cos(a + o)) + ' ' + f(p1.y - l * Math.sin(a + o)) + ' Z',
      milieu: sur(p0, c, p1, 0.5)
    };
  }

  /* ---- au travail / présents -------------------------------------------------------- */

  /** La valeur d'une série de créneaux à `t` (null hors de la série). */
  function valeurA(serie, t, pas) {
    if (!serie) return null;
    const i = Math.floor((t - serie.debut) / pas);
    return i >= 0 && i < serie.valeurs.length ? serie.valeurs[i] : null;
  }

  /** « au travail / présents » d'un service à `t`, et ce qui est en file : des entiers, ceux des créneaux de 15 min. */
  function chargeA(c, t, pas) {
    const v = m => { const x = valeurA(c && c[m], t, pas); return x == null ? 0 : Math.round(x); };
    return { auTravail: v('auTravail'), presents: v('presents'), enFile: v('enFile') };
  }

  /* ---- le handling ------------------------------------------------------------------------- */

  /**
   * Les véhicules du handling en route à `t` : un par tournée (un camion, un départ), de 0 (au quai) à 1 (au bord du
   * plan, du côté des avions) : l'aller, l'attente au bord le temps du chargement, le retour.
   */
  function vehiculesA(lots, t) {
    const vus = new Map();
    for (const l of lots || []) {
      const tr = l.trajet; if (!tr || !Number.isFinite(tr.depart) || !Number.isFinite(tr.retour)) continue;
      if (!(t >= tr.depart && t <= tr.retour)) continue;
      const k = (l.camion != null ? l.camion : l.tournee) + '|' + tr.depart;
      if (vus.has(k)) continue;
      const aller = Math.max(0, +tr.aller || 0), retour = Math.max(0, +tr.dureeRetour || 0), arrive = tr.depart + aller, repart = tr.retour - retour;
      const avance = t < arrive ? (aller ? (t - tr.depart) / aller : 1) : t < repart ? 1 : (retour ? (tr.retour - t) / retour : 0);
      vus.set(k, { cle: k, camion: l.camion, vehicule: l.vehicule === 'vl' ? 'vl' : 'camion', avance: Math.max(0, Math.min(1, avance)), service: l.service });
    }
    return [...vus.values()].sort((a, b) => (a.camion || 0) - (b.camion || 0));
  }

  /**
   * Le trajet d'un véhicule sur le plan : du quai au bord du plan le plus proche de son centre, du côté des avions
   * ({ cote, depart, arrivee }). Il part du bord du quai ; quand ce bord est presque celui du plan (moins de `min`
   * unités), du centre du quai, pour que le trajet se voie.
   */
  function versLesAvions(quai, plan, min = 0) {
    const c = centreDe(quai), d = [['gauche', c.x - plan.x], ['droite', plan.x + plan.w - c.x], ['haut', c.y - plan.y], ['bas', plan.y + plan.h - c.y]]
      .sort((p, q) => p[1] - q[1])[0][0];
    const bord = d === 'gauche' ? { x: quai.x, y: c.y } : d === 'droite' ? { x: quai.x + quai.w, y: c.y } : d === 'haut' ? { x: c.x, y: quai.y } : { x: c.x, y: quai.y + quai.h };
    const arrivee = d === 'gauche' ? { x: plan.x, y: c.y } : d === 'droite' ? { x: plan.x + plan.w, y: c.y } : d === 'haut' ? { x: c.x, y: plan.y } : { x: c.x, y: plan.y + plan.h };
    const depart = Math.hypot(arrivee.x - bord.x, arrivee.y - bord.y) < min ? c : bord;
    return { cote: d, depart, arrivee };
  }

  /** Les pictogrammes des véhicules (traits, sur 24 × 24) : le camion, et un VL plus bas. */
  const VEHICULES = {
    camion: '<path d="M2.5 6.5h11v10h-11zM13.5 10h4l3 3.2v3.3h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    vl: '<path d="M3 16.5v-3l2.2-4.5h10.6l3.2 4.5v3zM5.5 13h13"/><circle cx="7.5" cy="17" r="1.8"/><circle cx="16" cy="17" r="1.8"/>'
  };

  const api = { VEHICULES, EPAISSEUR_MIN, EPAISSEUR_MAX, TRAITS_MAX, ETIQUETTES, PERIODE, circulation, reference, epaisseur, traits, tranche, points, bords, trace, chemin, sur,
    valeurA, chargeA, vehiculesA, versLesAvions };
  if (enNode) module.exports = api;
  else root.OrlyPlanFlux = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

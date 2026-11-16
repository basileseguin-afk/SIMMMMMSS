/* ==========================================================================
 *  LA DISPOSITION DU SITE — l'utilisateur dit où va chaque zone (évolution 20 b, v1)
 *  ------------------------------------------------------------------------
 *  La vue en direct génère un site (moteur/site.js). Sans disposition, ses
 *  zones se rangent en deux bandes, dans l'ordre du chemin. Avec : des
 *  colonnes, de gauche à droite, chacune avec ses zones de haut en bas ; puis
 *  des rangées du bas, de haut en bas, chacune avec une zone et les colonnes
 *  qu'elle longe (de la colonne i à la colonne j). Une colonne qu'aucune
 *  rangée ne longe descend jusqu'en bas du site.
 *
 *  La disposition est un réglage de l'utilisateur, jamais une valeur du code :
 *  { colonnes: [[zone, …], …], rangees: [{ zone, de, a }] } — `de` et `a` : des
 *  rangs de colonnes, à partir de 1.
 *
 *  Ce module ne lit que ce réglage et les surfaces des zones. Il ne touche à
 *  rien : il rend des objets neufs. Sans navigateur : il se teste.
 *
 *  Les règles du tracé :
 *   - les tailles viennent des surfaces (les parts de surface) : chaque zone a
 *     exactement la sienne. La largeur d'une colonne suit la somme des
 *     surfaces de ses zones ; dans une colonne, la hauteur d'une zone suit la
 *     sienne ; une rangée du bas prend la sienne sur toute la largeur des
 *     colonnes qu'elle longe. Les colonnes qu'une rangée longe sont moins
 *     hautes que les autres : elles sont plus larges d'autant, pour garder
 *     leur surface ;
 *   - le site est un rectangle sans trou : des allées fines le complètent —
 *     une en haut, sur toute la largeur (l'entrée est à son bout gauche) ; une
 *     à gauche de chaque colonne, sur sa hauteur ; une au-dessus de chaque
 *     rangée du bas, sur sa largeur. Chaque zone ouvre sur une allée : une
 *     zone d'une colonne à sa gauche, une rangée du bas au-dessus d'elle ;
 *   - une rangée du bas repose sur celles qu'elle recouvre : la plus large est
 *     la plus basse. Deux rangées qui se chevauchent sans que l'une contienne
 *     l'autre ne peuvent pas être deux rectangles : celle du haut est réduite
 *     aux colonnes où elle repose à plat, et la disposition le dit.
 * ==========================================================================*/
(function (root) {
  'use strict';

  /** La largeur d'une allée, en mètres de la scène. */
  const ALLEE = 1.5;
  /** Les bornes d'un réglage : au plus 40 colonnes, 400 zones, des identifiants de 160 caractères. */
  const MAX = { colonnes: 40, zones: 400, texte: 160 };
  /** Au plus quatre niveaux de rangées du bas emboîtées (des rangées de largeurs différentes, l'une sur l'autre) : au-delà, le tracé ne se calculerait plus en un instant. */
  const NIVEAUX = 4;
  /** La plus petite surface d'une zone, pour le tracé : une zone sans surface garde un rectangle. */
  const SURFACE_MIN = 0.01;

  const texte = x => (typeof x === 'string' && x !== '' && x.length <= MAX.texte ? x : null);
  const entier = x => (Number.isFinite(+x) && x !== null && x !== '' && typeof x !== 'boolean' ? Math.round(+x) : null);
  const copie = d => ({ colonnes: d.colonnes.map(c => c.slice()), rangees: d.rangees.map(r => ({ ...r })) });

  /**
   * Une disposition lue (une sauvegarde, un état) remise en forme, sans rien savoir des zones : des colonnes de textes,
   * des rangées { zone, de, a } bornées aux colonnes. Rend null si elle est vide ou illisible : la disposition automatique.
   */
  function lire(brut) {
    if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return null;
    const colonnes = (Array.isArray(brut.colonnes) ? brut.colonnes : []).slice(0, MAX.colonnes).map(c => (Array.isArray(c) ? c : []).map(texte).filter(x => x !== null).slice(0, MAX.zones));
    const n = colonnes.length;
    const rangees = (Array.isArray(brut.rangees) ? brut.rangees : []).slice(0, MAX.zones).map(r => {
      const zone = r && typeof r === 'object' ? texte(r.zone) : null; if (zone === null) return null;
      const de = Math.min(Math.max(entier(r.de) ?? 1, 1), Math.max(n, 1)), a = Math.min(Math.max(entier(r.a) ?? Math.max(n, 1), de), Math.max(n, 1));
      return { zone, de, a };
    }).filter(x => x !== null);
    return colonnes.some(c => c.length) || rangees.length ? { colonnes, rangees } : null;
  }

  /** La disposition est-elle vide (la disposition automatique) ? */
  const vide = d => !d || !((d.colonnes || []).some(c => c.length) || (d.rangees || []).length);

  /**
   * La disposition accordée aux zones du site (`zones` : leurs identifiants, dans l'ordre du chemin). Une zone citée deux
   * fois n'est gardée qu'à sa première place ; une zone qui n'existe plus est retirée ; une zone du site absente de la
   * disposition (un service ajouté après) se range à la fin de la dernière colonne. Chaque cas est dit.
   * Rend { colonnes, rangees, notes: [{ code: 'double' | 'inconnue' | 'absente', zone }] }.
   */
  function accorder(disposition, zones) {
    const d = lire(disposition) || { colonnes: [], rangees: [] }, connues = new Set(zones), vues = new Set(), notes = [];
    const garder = zone => {
      if (!connues.has(zone)) { notes.push({ code: 'inconnue', zone }); return false; }
      if (vues.has(zone)) { notes.push({ code: 'double', zone }); return false; }
      vues.add(zone); return true;
    };
    const colonnes = d.colonnes.map(c => c.filter(garder)), rangees = d.rangees.filter(r => garder(r.zone));
    const absentes = zones.filter(z => !vues.has(z));
    if (absentes.length) {
      if (!colonnes.length) colonnes.push([]);
      for (const z of absentes) { colonnes[colonnes.length - 1].push(z); notes.push({ code: 'absente', zone: z }); }
    }
    return { colonnes, rangees, notes };
  }

  /**
   * L'arbre du tracé. Les colonnes qui ont une zone, dans l'ordre ; les rangées du bas posées de la plus basse à la plus
   * haute : la plus large d'abord, puis, à largeur égale, la dernière de la liste (la liste se lit de haut en bas). Une
   * rangée repose à plat si, sous elle, toutes ses colonnes portent les mêmes rangées ; sinon elle est réduite à la plus
   * longue suite de ses colonnes où c'est le cas (la plus à gauche, à longueur égale), reprend son tour d'après sa
   * nouvelle largeur, et c'est dit.
   * Un nœud : { colonne: i } ; { suite: [nœuds] } (côte à côte) ; { rangees: [zones], dessus: nœud } — des rangées de même
   * largeur, de haut en bas, et ce qu'elles portent : une colonne, ou une suite.
   * Rend { arbre, colonnes: [[zones]], posees: [{ zone, de, a, reduite, niveau }] (de la plus basse à la plus haute ; `de`,
   * `a` : les rangs des colonnes qu'elle longe ; `niveau` : 1 pour une rangée posée au bord du bas, un de plus chaque fois
   * qu'elle repose sur une rangée plus large), notes: [{ code: 'reduite', zone, de, a }] }.
   */
  function arbreDe(d) {
    const pleines = d.colonnes.map((c, i) => ({ zones: c, rang: i + 1 })).filter(c => c.zones.length), n = pleines.length, notes = [];
    // L'emprise d'une rangée sur les colonnes pleines : de la première à la dernière de celles qu'elle longe ; aucune : toutes.
    const emprise = r => {
      const dedans = pleines.map((c, k) => (c.rang >= r.de && c.rang <= r.a ? k : -1)).filter(k => k >= 0);
      return dedans.length ? { i: dedans[0], j: dedans[dedans.length - 1] } : { i: 0, j: Math.max(0, n - 1) };
    };
    const posees = [], sous = Array.from({ length: Math.max(n, 1) }, () => []);
    let reste = d.rangees.map((r, k) => ({ zone: r.zone, k, de: r.de, a: r.a, ...emprise(r) }));
    while (reste.length) {
      // La prochaine à poser : la plus large de celles qui restent ; à largeur égale, la dernière de la liste.
      const r = reste.reduce((m, x) => ((x.j - x.i) - (m.j - m.i) || x.k - m.k) > 0 ? x : m);
      // La plus longue suite de colonnes de son emprise qui portent les mêmes rangées sous elle.
      let mieux = null;
      for (let i = r.i; i <= r.j;) {
        let j = i;
        while (j < r.j && sous[j + 1].join('\n') === sous[i].join('\n')) j++;
        if (!mieux || j - i > mieux.j - mieux.i) mieux = { i, j };
        i = j + 1;
      }
      if (mieux.i !== r.i || mieux.j !== r.j) { r.i = mieux.i; r.j = mieux.j; r.reduite = true; r.de = n ? pleines[mieux.i].rang : 1; r.a = n ? pleines[mieux.j].rang : 1; continue; }
      reste = reste.filter(x => x !== r);
      // Son niveau : un de plus que le nombre de largeurs différentes de la sienne, parmi les rangées qui la portent.
      r.niveau = 1 + new Set(sous[r.i].map(z => posees.find(x => x.zone === z)).filter(x => x.i !== r.i || x.j !== r.j).map(x => x.i + '-' + x.j)).size;
      posees.push(r);
      for (let c = r.i; c <= r.j; c++) sous[c].push(r.zone);
    }
    for (const r of posees) if (r.reduite) notes.push({ code: 'reduite', zone: r.zone, de: r.de, a: r.a });
    // `posees` : de la plus basse à la plus haute. L'arbre d'une suite de colonnes [i..j] et des rangées qui y tiennent.
    const construire = (i, j, rangees) => {
      const pile = rangees.filter(r => r.i === i && r.j === j);
      if (pile.length) return { rangees: pile.map(r => r.zone).reverse(), dessus: construire(i, j, rangees.filter(r => !(r.i === i && r.j === j))) };
      const suite = [];
      for (let c = i; c <= j;) {
        // La plus large des rangées qui longent la colonne c : elle porte un bloc ; sinon, la colonne seule.
        const m = rangees.filter(r => r.i <= c && r.j >= c).sort((p, q) => (q.j - q.i) - (p.j - p.i))[0];
        if (m) { suite.push(construire(m.i, m.j, rangees.filter(r => r.i >= m.i && r.j <= m.j))); c = m.j + 1; }
        else { suite.push({ colonne: c }); c++; }
      }
      return suite.length === 1 ? suite[0] : { suite };
    };
    const arbre = n ? construire(0, n - 1, posees) : posees.length ? { rangees: posees.map(r => r.zone).reverse(), dessus: { suite: [] } } : { suite: [] };
    return { arbre, colonnes: pleines.map(c => c.zones), posees: posees.map(r => ({ zone: r.zone, de: r.de, a: r.a, reduite: !!r.reduite, niveau: r.niveau })), notes };
  }

  /**
   * La disposition bornée à quatre niveaux de rangées emboîtées : une rangée du bas qui en ferait un cinquième redevient
   * une zone de colonne — à la fin de la dernière colonne —, et c'est dit. La plus basse des rangées en trop d'abord ; les
   * autres se recomptent. Rend { disposition, notes: [{ code: 'niveaux', zone }] }.
   */
  function borner(d) {
    let courante = copie(d);
    const notes = [];
    for (;;) {
      const trop = arbreDe(courante).posees.find(r => r.niveau > NIVEAUX);
      if (!trop) return { disposition: courante, notes };
      courante = { colonnes: courante.colonnes.map(c => c.slice()), rangees: courante.rangees.filter(r => r.zone !== trop.zone) };
      if (!courante.colonnes.length) courante.colonnes.push([]);
      courante.colonnes[courante.colonnes.length - 1].push(trop.zone);
      notes.push({ code: 'niveaux', zone: trop.zone });
    }
  }

  /**
   * Cherche x tel que f(x) = 0, pour f décroissante, à partir de `bas` (où f est positive). La borne haute se trouve en
   * doublant ; puis la fausse position, qui garde la racine entre ses deux bornes (méthode « Illinois »), jusqu'à les
   * resserrer à `fin` près (en proportion). Les mêmes entrées donnent toujours le même résultat.
   */
  function racine(f, bas, fin) {
    let a = bas, fa = f(a);
    if (!(fa > 0)) return a;
    let b = a * 2 + 1, fb = f(b);
    for (let i = 0; i < 80 && fb > 0; i++) { a = b; fa = fb; b = b * 2 + 1; fb = f(b); }
    for (let i = 0; i < 60 && b - a > fin * Math.max(1, Math.abs(b)); i++) {
      let m = (a * fb - b * fa) / (fb - fa);
      if (!(m > a && m < b)) m = (a + b) / 2;
      const fm = f(m);
      if (fm === 0) return m;
      if (fm > 0) { a = m; fa = fm; fb /= 2; } else { b = m; fb = fm; fa /= 2; }
    }
    return (a + b) / 2;
  }

  /**
   * Le tracé d'une disposition accordée : le rectangle de chaque zone, les allées, la taille du site.
   * `surfaces` : Map zone → sa surface ; `largeurDemandee` : celle du site, allées comprises (elle ne descend pas sous la
   * place des allées) ; `allee` : la largeur d'une allée. Chaque zone a exactement sa surface. Rend { largeur, profondeur,
   * zones: Map zone → { x, y, w, h, colonne | rangee, porte: { x, y }, ouvert: 'gauche' | 'haut' },
   * allees: [{ x, y, w, h, sens: 'h' | 'v' }], notes } — les notes : une rangée réduite, une rangée de trop (`niveaux`).
   *
   * Le calcul. La largeur qu'il faut à un nœud haut de h : une colonne de surface A, son allée plus A / h ; une suite, la
   * somme de ses nœuds ; des rangées (k rangées, de surface R en tout) sur un nœud, la largeur w où ce nœud, haut de
   * h − k allées − R / w, fait lui-même w de large — une équation du second degré quand il n'a que des colonnes, une
   * recherche sinon. La hauteur qu'il faut à un nœud large de w : des rangées, leur hauteur plus celle de ce qu'elles
   * portent ; une colonne, A / (w − allée) ; une suite, la hauteur où elle fait w de large.
   */
  function tracer(disposition, surfaces, largeurDemandee, allee) {
    const a = allee ?? ALLEE, bornee = borner(disposition), { arbre, colonnes, notes: reduites } = arbreDe(bornee.disposition), notes = [...bornee.notes, ...reduites];
    // Une zone sans surface garde un rectangle ; le site est assez large pour les allées de ses colonnes et un mètre de zone par colonne.
    const S = z => Math.max(SURFACE_MIN, +surfaces.get(z) || 0), largeur = Math.max(+largeurDemandee || 0, colonnes.length * (a + 1), a + 1);
    const aire = colonnes.map(c => c.reduce((s, z) => s + S(z), 0));
    // D'un nœud : la surface de ses zones (son rectangle ne peut pas être plus petit) ; le nombre de niveaux de rangées
    // qu'il emboîte (une recherche emboîtée dans une autre est plus fine qu'elle) ; pour des colonnes seules, leur nombre et leur surface.
    const total = n => ('colonne' in n ? aire[n.colonne] : 'suite' in n ? n.suite.reduce((s, x) => s + total(x), 0) : total(n.dessus) + n.rangees.reduce((s, z) => s + S(z), 0));
    const niveaux = n => ('colonne' in n ? 0 : 'suite' in n ? Math.max(0, ...n.suite.map(niveaux)) : 1 + niveaux(n.dessus));
    const fin = n => Math.min(1e-9, 1e-14 * 10 ** niveaux(n));
    const colonnesSeules = n => ('colonne' in n ? [n] : 'suite' in n && n.suite.every(x => 'colonne' in x) ? n.suite : null);
    /** La largeur qu'il faut à un nœud de hauteur `h` pour que chaque zone ait sa surface ; sans hauteur pour ses allées : infinie. */
    const largeurDe = (n, h) => {
      if (!(h > 0)) return Infinity;
      if ('colonne' in n) return a + aire[n.colonne] / h;
      if ('suite' in n) return n.suite.reduce((s, x) => s + largeurDe(x, h), 0);
      const H = h - n.rangees.length * a, R = n.rangees.reduce((s, z) => s + S(z), 0), seules = colonnesSeules(n.dessus);
      if (!(H > 0)) return Infinity;
      if (seules) {
        // Des colonnes seules (n colonnes, de surface A) : w = n·allée + A / (H − R / w), soit H·w² − (R + n·allée·H + A)·w + n·allée·R = 0.
        const na = seules.length * a, A = seules.reduce((s, x) => s + aire[x.colonne], 0), b = R + na * H + A;
        return (b + Math.sqrt(Math.max(0, b * b - 4 * H * na * R))) / (2 * H);
      }
      return racine(w => largeurDe(n.dessus, H - R / w) - w, Math.max(R / H, total(n) / h), fin(n));
    };
    /** La hauteur qu'il faut à un nœud de largeur `w`. */
    const hauteurDe = (n, w) => {
      if ('colonne' in n) return aire[n.colonne] / (w - a);
      if ('suite' in n) return n.suite.length ? racine(h => largeurDe(n, h) - w, total(n) / w, fin(n) * 10) : 0;
      return hauteurDe(n.dessus, w) + n.rangees.length * a + n.rangees.reduce((s, z) => s + S(z), 0) / w;
    };
    const zones = new Map(), allees = [];
    /** Pose un nœud dans son rectangle. */
    const poser = (n, x, y, w, h) => {
      if ('colonne' in n) {
        allees.push({ x, y, w: a, h, sens: 'v' });
        let yz = y;
        for (const z of colonnes[n.colonne]) { const hz = aire[n.colonne] > 0 ? h * S(z) / aire[n.colonne] : h / colonnes[n.colonne].length; zones.set(z, { x: x + a, y: yz, w: w - a, h: hz, colonne: n.colonne, porte: { x: x + a, y: yz + hz / 2 }, ouvert: 'gauche' }); yz += hz; }
      } else if ('suite' in n) {
        let xn = x;
        n.suite.forEach((e, i) => { const we = i === n.suite.length - 1 ? x + w - xn : largeurDe(e, h); poser(e, xn, y, we, h); xn += we; });
      } else {
        // Ce qu'elles portent, puis les rangées, de haut en bas, chacune sous son allée.
        let yr = y + h - n.rangees.reduce((s, z) => s + a + S(z) / w, 0);
        if (yr - y > 1e-12) poser(n.dessus, x, y, w, yr - y);
        for (const z of n.rangees) {
          const hr = S(z) / w;
          allees.push({ x, y: yr, w, h: a, sens: 'h' });
          zones.set(z, { x, y: yr + a, w, h: hr, rangee: true, porte: { x: x + w / 2, y: yr + a }, ouvert: 'haut' });
          yr += a + hr;
        }
      }
    };
    // La hauteur du site sous l'allée de l'entrée : celle où l'arbre fait la largeur demandée. Sans zone : rien.
    const rien = total(arbre) <= 0, corps = rien ? 0 : hauteurDe(arbre, largeur);
    allees.push({ x: 0, y: 0, w: largeur, h: a, sens: 'h' });
    if (!rien) poser(arbre, 0, a, largeur, corps);
    return { largeur, profondeur: a + corps, zones, allees, notes };
  }

  /* ---- les gestes du panneau « Disposer les zones » : chacun rend une disposition neuve, rangée -------------------- */

  /** Où est une zone : { colonne (à partir de 0), rang } dans une colonne, { rangee (à partir de 0) } dans les rangées du bas ; null : nulle part. */
  function placeDe(d, zone) {
    for (let c = 0; c < d.colonnes.length; c++) { const k = d.colonnes[c].indexOf(zone); if (k >= 0) return { colonne: c, rang: k }; }
    const r = d.rangees.findIndex(x => x.zone === zone);
    return r >= 0 ? { rangee: r } : null;
  }

  /**
   * La disposition telle que le site la trace : bornée à quatre niveaux, les rangées du bas dans l'ordre où elles sont
   * posées, de haut en bas, et réduites aux colonnes qu'elles longent vraiment. Ce que le panneau liste est ainsi ce que la
   * scène montre ; rangée une seconde fois, elle ne change plus.
   */
  function ranger(d) {
    const b = borner(d).disposition;
    return { colonnes: b.colonnes.map(c => c.slice()), rangees: arbreDe(b).posees.map(r => ({ zone: r.zone, de: r.de, a: r.a })).reverse() };
  }

  /** La disposition sans la zone (ses colonnes restent, même vides). */
  const sans = (d, zone) => ({ colonnes: d.colonnes.map(c => c.filter(z => z !== zone)), rangees: d.rangees.filter(r => r.zone !== zone).map(r => ({ ...r })) });

  /** Met la zone dans la colonne `colonne` (à partir de 0), au rang `rang` (sans rang : à la fin) ; elle quitte sa place d'avant. */
  function mettre(d, zone, colonne, rang) {
    const avant = placeDe(d, zone), n = sans(d, zone), c = Math.min(Math.max(entier(colonne) ?? 0, 0), Math.max(n.colonnes.length - 1, 0));
    if (!n.colonnes.length) n.colonnes.push([]);
    // Dans sa propre colonne, plus bas : le rang visé compte encore la zone elle-même.
    let k = entier(rang) ?? n.colonnes[c].length;
    if (avant && avant.colonne === c && avant.rang < k) k--;
    n.colonnes[c].splice(Math.min(Math.max(k, 0), n.colonnes[c].length), 0, zone);
    return ranger(n);
  }

  /** Monte (`pas` = −1) ou descend (+1) la zone d'un rang : dans sa colonne, ou parmi les rangées du bas. Au bout : rien ne change. */
  function decaler(d, zone, pas) {
    const p = placeDe(d, zone), n = copie(d);
    if (!p) return ranger(n);
    const liste = 'colonne' in p ? n.colonnes[p.colonne] : n.rangees, i = 'colonne' in p ? p.rang : p.rangee, j = i + (pas < 0 ? -1 : 1);
    if (j >= 0 && j < liste.length) [liste[i], liste[j]] = [liste[j], liste[i]];
    return ranger(n);
  }

  /** Passe la zone dans la colonne précédente (`pas` = −1) ou suivante (+1), à la fin. Au bord, ou depuis une rangée : rien ne change. */
  function changerDeColonne(d, zone, pas) {
    const p = placeDe(d, zone), c = p && 'colonne' in p ? p.colonne + (pas < 0 ? -1 : 1) : -1;
    return c >= 0 && c < d.colonnes.length ? mettre(d, zone, c) : ranger(copie(d));
  }

  /** Fait de la zone une rangée du bas, sous les autres ; elle longe les colonnes `de` à `a` (sans elles : toutes). */
  function enRangee(d, zone, de, a) {
    const n = sans(d, zone), nb = Math.max(n.colonnes.length, 1), i = Math.min(Math.max(entier(de) ?? 1, 1), nb), j = Math.min(Math.max(entier(a) ?? nb, i), nb);
    n.rangees.push({ zone, de: i, a: j });
    return ranger(n);
  }

  /** Règle les colonnes que longe une rangée du bas : de la colonne `de` à la colonne `a` (à partir de 1). */
  function longer(d, zone, de, a) {
    const n = copie(d), r = n.rangees.find(x => x.zone === zone);
    if (!r) return ranger(n);
    const nb = Math.max(n.colonnes.length, 1), i = Math.min(Math.max(entier(de) ?? r.de, 1), nb), j = Math.min(Math.max(entier(a) ?? r.a, 1), nb);
    r.de = Math.min(i, j); r.a = Math.max(i, j);
    return ranger(n);
  }

  /** Ajoute une colonne vide, à droite. */
  const ajouterColonne = d => (d.colonnes.length < MAX.colonnes ? ranger({ colonnes: [...d.colonnes.map(c => c.slice()), []], rangees: d.rangees.map(r => ({ ...r })) }) : ranger(copie(d)));

  /** Retire la colonne `colonne` (à partir de 0) si elle est vide ; les rangées du bas suivent les colonnes qui restent. */
  function retirerColonne(d, colonne) {
    const c = entier(colonne);
    if (c === null || c < 0 || c >= d.colonnes.length || d.colonnes[c].length) return ranger(copie(d));
    const colonnes = d.colonnes.filter((_, i) => i !== c).map(x => x.slice()), nb = Math.max(colonnes.length, 1);
    // Une rangée qui longeait la colonne retirée longe une colonne de moins ; à sa droite, tout glisse d'un rang.
    const rangees = d.rangees.map(r => { const de = r.de > c + 1 ? r.de - 1 : r.de, a = r.a >= c + 1 ? r.a - 1 : r.a; return { zone: r.zone, de: Math.min(Math.max(de, 1), nb), a: Math.min(Math.max(a, Math.min(Math.max(de, 1), nb)), nb) }; });
    return ranger({ colonnes, rangees });
  }

  /**
   * La disposition qui ressemble le plus au site automatique (ses deux bandes) : le point de départ du premier geste. Une
   * colonne par zone de la première bande, de gauche à droite ; chaque zone de la seconde bande sous celle de la première
   * qu'elle recouvre le plus. `site` : le site généré sans disposition.
   */
  function depuisLeSite(site) {
    const zones = ((site && site.zones) || []).slice().sort((p, q) => p.x - q.x), hautes = zones.filter(z => z.bande === 0), basses = zones.filter(z => z.bande !== 0);
    if (!hautes.length) return { colonnes: basses.map(z => [z.id]), rangees: [] };
    const colonnes = hautes.map(z => [z.id]), commun = (p, q) => Math.max(0, Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x));
    for (const z of basses) {
      let mieux = 0;
      hautes.forEach((h, i) => { if (commun(z, h) > commun(z, hautes[mieux]) + 1e-9) mieux = i; });
      colonnes[mieux].push(z.id);
    }
    return { colonnes, rangees: [] };
  }

  const api = { ALLEE, MAX, NIVEAUX, lire, vide, accorder, arbreDe, borner, tracer, copie, placeDe, ranger, mettre, decaler, changerDeColonne, enRangee, longer, ajouterColonne, retirerColonne, depuisLeSite };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyDisposition = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

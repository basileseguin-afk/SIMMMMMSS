/* ==========================================================================
 *  DIAGRAMME DE NŒUDS — relier des services en tirant un trait
 *
 *  Les chemins des repas et les liens de l'unité sont des graphes : des
 *  nœuds (les services) et des liens orientés (« A livre B »). Plutôt que de
 *  les écrire dans des listes, on les dessine :
 *
 *    • tirer le rond ● à droite d'un service jusqu'à un autre crée le lien ;
 *    • cliquer un service le sélectionne (ce qu'on peut en faire s'affiche) ;
 *      « Relier à… » puis un clic sur un autre service fait la même chose
 *      qu'un trait tiré, au doigt ou au clavier ;
 *    • cliquer un lien le sélectionne ; « × » ou la touche Suppr le retire ;
 *    • glisser un service le déplace ; la disposition est retenue.
 *
 *  Le composant ne connaît pas le métier : il demande ses nœuds et ses liens
 *  à son adaptateur, et lui confie chaque geste (relier, retirer, choisir).
 *  Sans disposition enregistrée, les nœuds se rangent dans le sens du flux (la
 *  « profondeur » de chaque nœud est le plus long chemin qui y mène).
 *
 *  Deux sens (05/10 : « dès qu'on a beaucoup de services, cela devient
 *  incompréhensible ») :
 *    • « en étapes » (par défaut) : de haut en bas, une bande par étape. La
 *      chaîne la plus longue — la colonne vertébrale du flux — descend tout
 *      droit ; les branches se rangent de part et d'autre, juste au-dessus du
 *      service qu'elles livrent. Les traits vont à angle droit, comme un plan
 *      de métro, et arrivent chacun à sa place sur le bord du service (pas
 *      tous au même point). Le diagramme tient dans la largeur de l'écran ;
 *    • « en ligne » : de gauche à droite, comme avant.
 *  Survoler (ou choisir) un service éclaire sa chaîne — ce qui y mène et ce
 *  qui en part — et pâlit le reste.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const L = 200, H = 52, PAS_X = 260, PAS_Y = 76, MARGE = 28;
  // En étapes : d'une étape à l'autre, et d'un service au suivant dans une étape.
  const PAS_BAS = 112, LIG_BAS = L + 40, MARGE_ETAPE = 70;
  const CLE = 'ory-graphes-v1', CLE_SENS = 'ory-graphes-sens';
  /** Le sens choisi, retenu d'une visite à l'autre : 'bas' (en étapes) ou 'ligne'. */
  function lireSens() { try { return localStorage.getItem(CLE_SENS) === 'ligne' ? 'ligne' : 'bas'; } catch (e) { return 'bas'; } }
  function ecrireSens(v) { try { localStorage.setItem(CLE_SENS, v === 'ligne' ? 'ligne' : 'bas'); } catch (e) { /* stockage indisponible */ } }
  // Les diagrammes de la page : changer de sens les redessine tous.
  const DIAGRAMMES = new Set();
  let numero = 0;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const court = (s, n) => (s = String(s || ''), s.length > n ? s.slice(0, n - 1) + '…' : s);

  /**
   * Une disposition en colonnes : colonne = plus long chemin depuis un nœud
   * sans amont ; dans une colonne, les nœuds suivent la hauteur moyenne de
   * leurs amonts (moins de croisements). Une boucle ne fait pas tourner le calcul.
   * `o.sens === 'bas'` : les colonnes deviennent des étapes, de haut en bas, et
   * chaque service descend jusqu'à l'étape qui précède celui qu'il livre.
   * @returns { id: {x, y} } (et, non énumérables, `via` et `etape`)
   */
  function disposer(noeuds, liens, o) {
    const bas = !!(o && o.sens === 'bas');
    const ids = noeuds.map(n => n.id), connu = new Set(ids);
    const tous = liens.filter(l => connu.has(l.de) && connu.has(l.vers) && l.de !== l.vers);
    // Un lien qui revient en arrière (un retour : quais → plonge → … → quais)
    // ne doit pas étirer la disposition : on le repère par un parcours en
    // profondeur depuis les nœuds sans amont, et on le dessine sans le compter.
    const retours = new Set(), etat = new Map();
    const visiter = id => {
      etat.set(id, 1);
      for (const l of tous) if (l.de === id) {
        const e = etat.get(l.vers);
        if (e === 1) retours.add(l); else if (!e) visiter(l.vers);
      }
      etat.set(id, 2);
    };
    for (const id of ids) if (!tous.some(l => l.vers === id)) visiter(id);
    for (const id of ids) if (!etat.get(id)) visiter(id);
    // En étapes, les retours se choisissent mieux (Eades) : on range les
    // services du début à la fin du flux, et seuls les liens qui reviennent
    // en arrière sont des retours — le moins possible. Dans la boucle du
    // matériel (quais → plonge → dotation → montage → départ → quais), c'est
    // « quais → plonge » qui revient, pas « dotation → montage ».
    let arcs = tous.filter(l => !retours.has(l));
    if (bas) {
      // À égalité, on coupe la boucle au plus tôt dans le flux (profondeur
      // d'un premier rangement) : la plonge passe avant la dotation.
      const prof = new Map(ids.map(id => [id, 0]));
      for (let tour = 0; tour < ids.length; tour++) {
        let bouge = false;
        for (const a of arcs) if (prof.get(a.vers) < prof.get(a.de) + 1 && prof.get(a.de) + 1 < ids.length) { prof.set(a.vers, prof.get(a.de) + 1); bouge = true; }
        if (!bouge) break;
      }
      arcs = sansRetours(ids, tous, prof);
    }
    const col = new Map(ids.map(id => [id, 0]));
    for (let tour = 0; tour < ids.length; tour++) {
      let bouge = false;
      for (const a of arcs) if (col.get(a.vers) < col.get(a.de) + 1 && col.get(a.de) + 1 < ids.length) {
        col.set(a.vers, col.get(a.de) + 1); bouge = true;
      }
      if (!bouge) break;
    }
    // En étapes : un service descend jusqu'à l'étape qui précède le premier
    // qu'il livre. Une branche (plonge → dotation → prépa) se range alors à
    // côté de son arrivée, et ses traits restent courts.
    if (bas) for (let tour = 0; tour < ids.length; tour++) {
      let bouge = false;
      for (const id of ids) {
        const suite = arcs.filter(a => a.de === id).map(a => col.get(a.vers));
        if (!suite.length) continue;
        const c = Math.min(...suite) - 1;
        if (c > col.get(id)) { col.set(id, c); bouge = true; }
      }
      if (!bouge) break;
    }
    // En étapes, un service relié à rien n'est à aucune étape : il se range
    // à part, tout en bas (« Sans lien »), au lieu de faire croire au début du flux.
    const isoles = bas ? ids.filter(id => !tous.some(l => l.de === id || l.vers === id)) : [];
    if (isoles.length && isoles.length < ids.length) {
      const der = Math.max(...ids.filter(id => !isoles.includes(id)).map(id => col.get(id)));
      for (const id of isoles) col.set(id, der + 1);
    }
    if (bas) return etapes(ids, arcs, col, isoles.length < ids.length ? isoles : [], tous.filter(l => !arcs.includes(l)));
    // Un lien qui saute des colonnes y réserve un couloir : un point de
    // passage par colonne traversée. Les nœuds s'en écartent, et le lien ne
    // passe plus sous un service qu'il ne concerne pas.
    const passages = [], via = {};
    for (const a of arcs) {
      const c0 = col.get(a.de), c1 = col.get(a.vers);
      let prec = a.de;
      for (let c = c0 + 1; c < c1; c++) {
        const id = '~' + a.de + '>' + a.vers + '~' + c;
        col.set(id, c); passages.push({ de: prec, vers: id }); prec = id;
        (via[a.de + '>' + a.vers] = via[a.de + '>' + a.vers] || []).push(id);
      }
      passages.push({ de: prec, vers: a.vers });
    }
    const pos = {}, colonnes = new Map();
    for (const id of col.keys()) { const c = col.get(id); if (!colonnes.has(c)) colonnes.set(c, []); colonnes.get(c).push(id); }
    const fictif = id => id[0] === '~';
    for (const c of [...colonnes.keys()].sort((a, b) => a - b)) {
      const liste = colonnes.get(c);
      const hauteur = id => {
        const ys = passages.filter(a => a.vers === id && pos[a.de]).map(a => pos[a.de].y);
        return ys.length ? ys.reduce((s, y) => s + y, 0) / ys.length : Infinity;
      };
      const rang = id => (fictif(id) ? ids.length : ids.indexOf(id));
      liste.sort((a, b) => hauteur(a) - hauteur(b) || rang(a) - rang(b));
      // Un nœud se pose à la hauteur moyenne de ses amonts : un service qui
      // en reçoit trois se met au milieu. Deux nœuds d'une colonne ne se
      // chevauchent jamais ; un couloir demande moitié moins de place.
      let avant = -Infinity, prec = null;
      for (const id of liste) {
        const h = hauteur(id);
        const ecart = fictif(id) || (prec && fictif(prec)) ? PAS_Y / 2 : PAS_Y;
        const voulu = Number.isFinite(h) ? Math.round(h / (PAS_Y / 2)) * (PAS_Y / 2) : (Number.isFinite(avant) ? avant + ecart : 0);
        const y = Math.max(voulu, avant + ecart);
        pos[id] = { x: c * PAS_X, y }; avant = y; prec = id;
      }
    }
    const out = {};
    for (const id of ids) out[id] = pos[id];
    Object.defineProperty(out, 'via', { value: Object.fromEntries(Object.entries(via).map(([k, l]) => [k, l.map(id => pos[id])])) });
    Object.defineProperty(out, 'etape', { value: Object.fromEntries(ids.map(id => [id, col.get(id)])) });
    Object.defineProperty(out, 'isoles', { value: [] });
    return out;
  }

  /**
   * La disposition en étapes : une ligne par étape, de haut en bas.
   *  - la plus longue chaîne de services — la colonne vertébrale du flux —
   *    descend tout droit, au milieu ; les branches se rangent de part et
   *    d'autre ;
   *  - dans une étape, l'ordre suit la place moyenne des voisins (moins de
   *    croisements), affinée en descendant puis en remontant ;
   *  - un service se pose au-dessus (ou au-dessous) de ceux qu'il touche ;
   *  - un lien qui saute des étapes passe par un couloir sur le côté, tout
   *    droit, au lieu de serpenter entre les services.
   */
  /** Les liens qui vont dans le sens du flux, d'après un ordre des services
   *  qui en laisse le moins possible à l'envers (Eades, Lin et Smyth). */
  function sansRetours(ids, tous, prof) {
    const reste = new Set(ids), debut = [], fin = [];
    const deg = (id, sortant) => tous.filter(l => reste.has(l.de) && reste.has(l.vers) && (sortant ? l.de : l.vers) === id).length;
    while (reste.size) {
      let bouge = true;
      while (bouge) {
        bouge = false;
        for (const id of ids) if (reste.has(id) && !deg(id, true)) { fin.unshift(id); reste.delete(id); bouge = true; }
        for (const id of ids) if (reste.has(id) && !deg(id, false)) { debut.push(id); reste.delete(id); bouge = true; }
      }
      if (!reste.size) break;
      let mieux = null, m = -Infinity;
      for (const id of ids) if (reste.has(id)) {
        const v = deg(id, true) - deg(id, false);
        if (v > m || (v === m && prof && prof.get(id) < prof.get(mieux))) { m = v; mieux = id; }
      }
      debut.push(mieux); reste.delete(mieux);
    }
    const rang = new Map([...debut, ...fin].map((id, i) => [id, i]));
    return tous.filter(l => rang.get(l.de) < rang.get(l.vers));
  }

  function etapes(ids, arcs, col, isoles, retours) {
    const rangs = [...new Set(ids.map(id => col.get(id)))].sort((a, b) => a - b);
    const niv = new Map(ids.map(id => [id, rangs.indexOf(col.get(id))]));
    const segs = arcs, via = {};
    const lignes = Array.from({ length: Math.max(0, ...niv.values()) + 1 }, () => []);
    for (const [id, c] of niv) lignes[c].push(id);
    const amont = id => segs.filter(x => x.vers === id).map(x => x.de);
    const aval = id => segs.filter(x => x.de === id).map(x => x.vers);
    const moyenne = xs => (xs.length ? xs.reduce((t, v) => t + v, 0) / xs.length : null);

    // La colonne vertébrale : la plus longue chaîne, de la source au bout.
    const long = new Map(), prev = new Map();
    const parNiveau = ids.slice().sort((a, b) => niv.get(a) - niv.get(b));
    for (const id of parNiveau) {
      let n = 0, p = null;
      for (const a of arcs) if (a.vers === id && (long.get(a.de) || 0) > n) { n = long.get(a.de); p = a.de; }
      long.set(id, n + 1); prev.set(id, p);
    }
    let bout = null;
    for (const id of parNiveau) if (!isoles.includes(id) && (!bout || long.get(id) > long.get(bout))) bout = id;
    const dos = new Set();
    for (let x = bout; x; x = prev.get(x)) dos.add(x);

    // L'ordre dans chaque étape : la place moyenne des voisins, en descendant
    // puis en remontant ; la colonne vertébrale garde le milieu.
    const ordre = new Map(), init = id => ids.indexOf(id);
    for (const l of lignes) { l.sort((a, b) => init(a) - init(b)); l.forEach((id, i) => ordre.set(id, i)); }
    for (let tour = 0; tour < 4; tour++) {
      const desc = tour % 2 === 0;
      for (const l of desc ? lignes.slice(1) : lignes.slice(0, -1).reverse()) {
        const cle = new Map(l.map(id => [id, moyenne((desc ? amont(id) : aval(id)).map(v => ordre.get(v)))]));
        const k = id => (cle.get(id) === null ? ordre.get(id) : cle.get(id));
        l.sort((a, b) => k(a) - k(b) || ordre.get(a) - ordre.get(b));
        l.forEach((id, i) => ordre.set(id, i));
      }
    }

    // Les places : la colonne vertébrale à 0, les autres au plus près de leurs
    // voisins, sans se chevaucher.
    const ecart = () => LIG_BAS;
    const cx = new Map();
    for (const l of lignes) {
      let x = 0;
      l.forEach((id, i) => { if (i) x += ecart(l[i - 1], id); cx.set(id, x); });
      const s = l.find(id => dos.has(id)), decal = s ? cx.get(s) : x / 2;
      for (const id of l) cx.set(id, cx.get(id) - decal);
    }
    const placer = (l, voulu) => {
      const s = l.findIndex(id => dos.has(id));
      if (s >= 0) {
        cx.set(l[s], 0);
        for (let i = s + 1; i < l.length; i++) cx.set(l[i], Math.max(voulu(l[i]), cx.get(l[i - 1]) + ecart(l[i - 1], l[i])));
        for (let i = s - 1; i >= 0; i--) cx.set(l[i], Math.min(voulu(l[i]), cx.get(l[i + 1]) - ecart(l[i], l[i + 1])));
        return;
      }
      l.forEach((id, i) => cx.set(id, i ? Math.max(voulu(id), cx.get(l[i - 1]) + ecart(l[i - 1], id)) : voulu(id)));
      const d = moyenne(l.map(id => voulu(id) - cx.get(id))) || 0;
      for (const id of l) cx.set(id, cx.get(id) + d);
    };
    for (let tour = 0; tour < 3; tour++) {
      const desc = tour % 2 === 0;
      for (const l of desc ? lignes : lignes.slice().reverse()) placer(l, id => {
        const v = (desc ? amont(id) : aval(id)).map(x => cx.get(x)), w = v.length ? v : (desc ? aval(id) : amont(id)).map(x => cx.get(x));
        return w.length ? moyenne(w) : cx.get(id);
      });
    }

    // Un lien qui saute des étapes : un couloir sur le côté le plus proche,
    // au-delà des services des étapes qu'il traverse ; plusieurs couloirs
    // d'un même côté se rangent l'un à côté de l'autre.
    const couloirs = { g: [], d: [] };
    const longs = arcs.filter(a => niv.get(a.vers) - niv.get(a.de) > 1)
      .sort((a, b) => (niv.get(a.vers) - niv.get(a.de)) - (niv.get(b.vers) - niv.get(b.de)));
    for (const a of longs) {
      const c0 = niv.get(a.de), c1 = niv.get(a.vers), dedans = [];
      for (let c = c0 + 1; c < c1; c++) dedans.push(...lignes[c]);
      const gauche = Math.min(...dedans.map(id => cx.get(id))) - L / 2, droite = Math.max(...dedans.map(id => cx.get(id))) + L / 2;
      const milieu = (cx.get(a.de) + cx.get(a.vers)) / 2;
      const cote = Math.abs(milieu - gauche) < Math.abs(droite - milieu) ? 'g' : 'd';
      const deja = couloirs[cote].filter(k => k.c0 < c1 && k.c1 > c0).length;
      const x = cote === 'g' ? gauche - 28 - deja * 16 : droite + 28 + deja * 16;
      couloirs[cote].push({ c0, c1 });
      via[a.de + '>' + a.vers] = [];
      for (let c = c0 + 1; c < c1; c++) via[a.de + '>' + a.vers].push({ x: x - L / 2, y: c * PAS_BAS });
    }
    // Un retour (vers le haut) contourne tout, par la droite.
    const loin = Math.max(...[...cx.values()].map(x => x + L / 2), ...Object.values(via).flatMap(l => l.map(p => p.x + L / 2)));
    (retours || []).forEach((a, i) => { via[a.de + '>' + a.vers] = [{ x: loin + 30 + i * 16 - L / 2, y: -1 }]; });
    const xs = [...cx.values()].map(x => x - L / 2).concat(...Object.values(via).map(l => l.map(p => p.x + L / 2 - 10)));
    const min = Math.min(...xs);
    const pos = {};
    for (const [id, x] of cx) pos[id] = { x: Math.round(x - L / 2 - min), y: niv.get(id) * PAS_BAS };
    for (const l of Object.values(via)) for (const p of l) p.x = Math.round(p.x - min);
    const out = {};
    for (const id of ids) out[id] = pos[id];
    Object.defineProperty(out, 'via', { value: via });
    Object.defineProperty(out, 'etape', { value: Object.fromEntries(ids.map(id => [id, niv.get(id)])) });
    Object.defineProperty(out, 'isoles', { value: isoles });
    Object.defineProperty(out, 'dos', { value: ids.filter(id => dos.has(id)) });
    return out;
  }

  /* ---- dispositions retenues, une par diagramme ---------------------- */
  function validerPositions(brut) {
    if (!brut || typeof brut !== 'object' || Array.isArray(brut)) throw new Error('Dispositions invalides.');
    const out = {};
    for (const [d, m] of Object.entries(brut).slice(0, 200)) {
      if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
      out[String(d).slice(0, 120)] = {};
      for (const [id, p] of Object.entries(m).slice(0, 300)) {
        if (p && Number.isFinite(+p.x) && Number.isFinite(+p.y))
          out[d][String(id).slice(0, 160)] = { x: Math.round(+p.x), y: Math.round(+p.y) };
      }
    }
    return out;
  }
  function lirePositions() {
    try { return validerPositions(JSON.parse(localStorage.getItem(CLE) || '{}')); } catch (e) { return {}; }
  }
  function ecrirePositions(diagramme, positions) {
    const tout = lirePositions();
    if (positions) tout[diagramme] = positions; else delete tout[diagramme];
    try { localStorage.setItem(CLE, JSON.stringify(tout)); } catch (e) { /* stockage indisponible */ }
  }

  /** La courbe d'un lien : de la droite de A à la gauche de B, par ses
   *  couloirs s'il en a (un trait droit à travers chaque colonne sautée).
   *  En étapes (`bas`) : du bas de A au haut de B, à angle droit (comme un
   *  plan de métro) : on descend, on tourne dans l'espace entre deux étapes,
   *  on redescend. `o` : où le trait quitte A (`d0`) et arrive sur B (`d1`),
   *  par rapport au milieu, et à quelle hauteur il tourne (`canal`). */
  function courbe(a, b, via, bas, o) {
    if (bas) {
      o = o || {};
      const x0 = a.x + L / 2 + (o.d0 || 0), y0 = a.y + H, x1 = b.x + L / 2 + (o.d1 || 0), y1 = b.y - 6;
      // Un retour (vers le haut) : il contourne par le côté.
      if (y1 < y0 + 16) {
        const cote = via && via.length ? via[0].x + L / 2 : Math.max(a.x, b.x) + L + 26 + Math.abs(o.canal || 0);
        const d = `M${x0},${y0} V${y0 + 14} H${cote} V${b.y - 18} H${x1} V${y1}`;
        return { d, mx: cote, my: (y0 + b.y) / 2 };
      }
      const xs = [x0, ...(via || []).map(p => p.x + L / 2), x1];
      const jeu = (PAS_BAS - H) / 2, canal = o.canal || 0;
      const yms = via && via.length ? [a.y, ...via.map(p => p.y)].map(t => t + H + jeu + canal) : [(y0 + y1) / 2 + canal];
      let d = `M${x0},${y0}`, haut = y0;
      for (let i = 0; i < yms.length; i++) {
        const xa = xs[i], xb = xs[i + 1];
        if (Math.abs(xb - xa) < 1) continue;                       // tout droit
        const ym = Math.min(Math.max(yms[i], haut + 6), y1 - 6);
        const sgn = Math.sign(xb - xa), k = Math.min(10, Math.abs(xb - xa) / 2, ym - haut, y1 - ym);
        d += ` V${ym - k} Q${xa},${ym} ${xa + sgn * k},${ym} H${xb - sgn * k} Q${xb},${ym} ${xb},${ym + k}`;
        haut = ym + k;
      }
      d += ` V${y1}`;
      return { d, mx: x1, my: (haut + y1) / 2 };
    }
    const pts = [[a.x + L, a.y + H / 2]];
    for (const p of via || []) pts.push([p.x, p.y + H / 2], [p.x + L, p.y + H / 2]);
    pts.push([b.x - 6, b.y + H / 2]);
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      if (i % 2 === 0) { d += ` L${x1},${y1}`; continue; }      // à travers une colonne
      const k = Math.max(46, Math.abs(x1 - x0) / 2);
      d += ` C${x0 + k},${y0} ${x1 - k},${y1} ${x1},${y1}`;
    }
    const m = Math.floor((pts.length - 1) / 2);
    return { d, mx: (pts[m][0] + pts[m + 1][0]) / 2, my: (pts[m][1] + pts[m + 1][1]) / 2 };
  }

  class Diagramme {
    /* a = {
     *   hote()                 — l'élément où dessiner
     *   cle                    — le nom de la disposition retenue
     *   titre                  — ce que le diagramme montre (lecteurs d'écran)
     *   noeuds()               — [{ id, nom, ico, sous, ton }]
     *   liens()                — [{ id, de, vers, couleur, pointille, titre, etiquette }]
     *   relier(de, vers)       — crée le lien ; renvoie un message d'erreur, ou rien
     *   retirerLien(id)        — retire le lien
     *   choisir(selection)     — { type:'noeud'|'lien', id } ou null
     *   message(texte)         — facultatif : dire ce qui se passe
     *   relierDebut(id)        — facultatif : « relier à… » commence
     *   groupes()              — facultatif : [{ id, ids:[noeud], etiquette, titre }]
     *                            des services qui ne font qu'un (deux étapes
     *                            faites à la chaîne par la même équipe) : un
     *                            cadre les entoure, le lien entre eux s'épaissit
     *   fige()                 — facultatif : ni prise pour relier, ni croix pour retirer
     * }
     * Le sens (en étapes ou en ligne) est un choix de la personne, commun à
     * tous les diagrammes ; chaque sens retient sa propre disposition. */
    constructor(a) {
      this.a = a;
      this.selection = null;
      this.depuis = null;          // « Relier à… » : le nœud de départ
      this.geste = null;           // un glisser en cours
      this.pos = {};
      DIAGRAMMES.add(this);
      // Ses pointes de flèche à lui : deux diagrammes d'un même flux (Flux de
      // production, chemin d'une commande) ne se prêtent pas les leurs — celles
      // d'une page cachée ne s'affichent pas.
      this.numero = ++numero;
    }

    /** 'bas' (en étapes, de haut en bas) ou 'ligne' (de gauche à droite). */
    sens() { return lireSens(); }
    bas() { return this.sens() === 'bas'; }
    /** La disposition retenue, propre au sens : changer de sens ne la perd pas. */
    cleDispo() { return this.a.cle + (this.bas() ? '|bas' : ''); }

    /* ---- dessin ------------------------------------------------------ */

    /** Les groupes dont les nœuds sont dessinés, avec la place de chacun. */
    cadresGroupes() {
      const gs = this.a.groupes ? this.a.groupes() || [] : [];
      return gs.map(g => {
        const ids = (g.ids || []).filter(id => this.pos[id]);
        if (ids.length < 2) return null;
        return { ...g, ids, x: Math.min(...ids.map(id => this.pos[id].x)) - 7, y: Math.min(...ids.map(id => this.pos[id].y)) - 22 };
      }).filter(Boolean);
    }

    /* Un groupe se lit où que soient ses nœuds : un halo autour de chacun, un
     * trait épais de l'un à l'autre, et au-dessus de chacun ce qu'il fait avec
     * l'autre (« + Prépa à la chaîne »), précédé de deux maillons. Un grand
     * cadre couvrirait aussi les services d'entre les deux. */
    groupesSVG(groupes) {
      const maillons = root.OrlyIcones ? root.OrlyIcones.TRAITS.chaine : '';
      return groupes.map(g => {
        const traits = g.ids.slice(1).map((id, i) => `<path class="gr-groupe-trait" d="${courbe(this.pos[g.ids[i]], this.pos[id], null, this.bas()).d}"/>`).join('');
        const halos = g.ids.map((id, i) => {
          const p = this.pos[id], t = (g.etiquettes || {})[id] || (i === 0 ? g.etiquette : '') || '';
          return `<rect class="gr-groupe-halo" x="${p.x - 7}" y="${p.y - 7}" width="${L + 14}" height="${H + 14}" rx="16"/>
            ${t && maillons ? `<svg class="gr-groupe-ico" x="${p.x + 1}" y="${p.y - 22}" width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">${maillons}</svg>` : ''}
            ${t ? `<text class="gr-groupe-etiq" x="${p.x + (maillons ? 18 : 2)}" y="${p.y - 11}">${esc(court(t, 36))}</text>` : ''}`;
        }).join('');
        return `<g class="gr-groupe" data-groupe="${esc(g.id)}"><title>${esc(g.titre || g.etiquette || '')}</title>${traits}${halos}</g>`;
      }).join('');
    }

    positions() {
      const noeuds = this.a.noeuds(), liens = this.a.liens();
      const bas = this.bas(), auto = disposer(noeuds, liens, { sens: this.sens() }), gardees = lirePositions()[this.cleDispo()] || {};
      // Les étapes se dessinent tant que personne n'a déplacé de service.
      this.etapes = !Object.keys(gardees).length && bas ? auto.etape : null;
      this.isoles = new Set(auto.isoles || []);
      // Les couloirs ne valent que tant que les deux bouts sont à leur place d'origine.
      this.via = {};
      for (const [k, v] of Object.entries(auto.via || {})) {
        const [de, vers] = k.split('>');
        const enPlace = id => !gardees[id] || (auto[id] && gardees[id].x === auto[id].x && gardees[id].y === auto[id].y);
        if (enPlace(de) && enPlace(vers)) this.via[k] = v;
      }
      // Un nœud nouveau se range sous les autres de sa colonne, sans les chevaucher.
      const pos = {};
      for (const n of noeuds) pos[n.id] = gardees[n.id] ? { ...gardees[n.id] } : null;
      for (const n of noeuds) if (!pos[n.id]) {
        const p = { ...auto[n.id] };
        while (Object.values(pos).some(q => q && Math.abs(q.x - p.x) < L && Math.abs(q.y - p.y) < H + 8)) { if (bas) p.x += LIG_BAS; else p.y += PAS_Y; }
        pos[n.id] = p;
      }
      return pos;
    }

    rendre() {
      const hote = this.a.hote(); if (!hote) return;
      const noeuds = this.a.noeuds(), liens = this.a.liens();
      this.pos = this.positions();
      if (this.selection && !(this.selection.type === 'noeud' ? noeuds : liens).some(x => x.id === this.selection.id)) this.selection = null;
      if (this.depuis && !noeuds.some(n => n.id === this.depuis)) this.depuis = null;
      if (!hote.querySelector('.gr-svg')) this.installer(hote);
      const svg = hote.querySelector('.gr-svg');
      const xs = Object.values(this.pos), cadres = this.cadresGroupes();
      // Les membres d'un groupe, et les liens qui les unissent.
      const membre = new Map();
      for (const g of cadres) for (const id of g.ids) membre.set(id, g.id);
      const uni = l => membre.has(l.de) && membre.get(l.de) === membre.get(l.vers);
      const bas = this.bas(), etapes = this.etapes;
      const x0 = Math.min(0, ...xs.map(p => p.x), ...cadres.map(g => g.x)) - MARGE - (etapes ? MARGE_ETAPE : 0), y0 = Math.min(0, ...xs.map(p => p.y), ...cadres.map(g => g.y)) - MARGE;
      const x1 = Math.max(L, ...xs.map(p => p.x + L)) + MARGE + 30, y1 = Math.max(H, ...xs.map(p => p.y + H)) + MARGE;
      this.cadre = { x0, y0, w: x1 - x0, h: y1 - y0 };
      svg.setAttribute('viewBox', `${x0} ${y0} ${x1 - x0} ${y1 - y0}`);
      svg.setAttribute('width', x1 - x0); svg.setAttribute('height', y1 - y0);
      // Un diagramme plus large que son cadre : on le montre (ombre au bord
      // droit, invitation à faire défiler), sinon la fin du chemin passe inaperçue.
      const cadreEl = hote.querySelector('.gr-cadre');
      if (cadreEl) cadreEl.classList.toggle('bas', bas);
      // En étapes, le diagramme prend sa hauteur : c'est la page qui défile.
      hote.classList.toggle('gr-hote-bas', bas);
      const bouton = hote.querySelector('[data-gr-sens]');
      if (bouton) {
        const I = root.OrlyIcones;
        bouton.innerHTML = (I ? I.ico(bas ? 'fleche' : 'flecheBas') : '') + (bas ? 'En ligne' : 'En étapes');
        bouton.title = bas ? 'Disposer les services de gauche à droite, sur une ligne' : 'Disposer les services de haut en bas, une bande par étape : plus lisible quand il y en a beaucoup';
      }
      if (cadreEl) root.requestAnimationFrame(() => {
        const deborde = cadreEl.scrollWidth > cadreEl.clientWidth + 4;
        cadreEl.classList.toggle('gr-deborde', deborde && cadreEl.scrollLeft + cadreEl.clientWidth < cadreEl.scrollWidth - 4);
        let suite = hote.querySelector('.gr-suite');
        if (deborde && !suite) { suite = root.document.createElement('p'); suite.className = 'gr-suite mini-note'; hote.appendChild(suite); }
        if (suite) { suite.hidden = !deborde; suite.textContent = 'Le chemin est plus large que l’écran : faites défiler vers la droite pour voir la suite →'; }
      });
      const couleurs = [...new Set(liens.map(l => l.couleur || ''))];
      const marque = c => 'gr-f' + this.numero + '-' + couleurs.indexOf(c || '');
      // Figé (un flux partagé vu depuis une commande) : ni prise pour relier, ni croix pour retirer.
      const I = root.OrlyIcones, fige = !!(this.a.fige && this.a.fige());
      this.derniersLiens = liens;
      const places = bas ? this.places(liens) : new Map();
      // Les étapes : une bande par profondeur, numérotée, derrière les services.
      const rangs = etapes ? [...new Set(noeuds.map(n => etapes[n.id]).filter(Number.isFinite))].sort((a, b) => a - b) : [];
      const bandes = rangs.map((r, i) => {
        const ici = noeuds.filter(n => etapes[n.id] === r), y = Math.min(...ici.map(n => this.pos[n.id].y));
        const seuls = ici.every(n => this.isoles.has(n.id));
        return `<g class="gr-etape${i % 2 ? ' impaire' : ''}${seuls ? ' sans-lien' : ''}" data-etape="${seuls ? 'sans-lien' : i + 1}"><rect x="${x0 + 6}" y="${y - 14}" width="${x1 - x0 - 12}" height="${H + 28}" rx="12"/>
          <text x="${x0 + 18}" y="${y + H / 2 + 4}">${seuls ? 'Sans lien' : 'Étape ' + (i + 1)}</text></g>`;
      }).join('');
      svg.innerHTML = `<defs>${couleurs.map(c => `<marker id="${marque(c)}" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="16" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="gr-pointe"${c ? ` style="fill:${esc(c)}"` : ''}/></marker>`).join('')}</defs>
        <g class="gr-etapes">${bandes}</g>
        <g class="gr-groupes">${this.groupesSVG(cadres)}</g>
        <g class="gr-liens">${liens.slice().sort((x, y) => this.estChoisi(x) - this.estChoisi(y)).map(l => {
          const a = this.pos[l.de], b = this.pos[l.vers]; if (!a || !b) return '';
          const k = courbe(a, b, this.via[l.de + '>' + l.vers], bas, places.get(l)), sel = this.selection && this.selection.type === 'lien' && this.selection.id === l.id;
          return `<g class="gr-lien${sel ? ' sel' : ''}${l.pointille ? ' pointille' : ''}${uni(l) ? ' en-chaine' : ''}" data-lien="${esc(l.id)}" tabindex="0" role="button"
              aria-label="${esc(l.titre || '')}. Entrée pour le choisir, Suppr pour le retirer.">
            <title>${esc(l.titre || '')}</title>
            <path class="gr-prise" d="${k.d}"/><path class="gr-trait" d="${k.d}" marker-end="url(#${marque(l.couleur)})"${l.couleur ? ` style="stroke:${esc(l.couleur)}"` : ''}/>
            ${l.etiquette ? `<text class="gr-etiq" x="${k.mx}" y="${k.my - (sel ? 16 : 7)}" text-anchor="middle">${esc(l.etiquette)}</text>` : ''}
            ${sel && !fige ? `<g class="gr-retirer" data-retirer="${esc(l.id)}" transform="translate(${k.mx},${k.my})"><circle r="11"/><path d="M-4,-4 L4,4 M4,-4 L-4,4"/><title>Retirer ce lien</title></g>` : ''}
          </g>`;
        }).join('')}</g>
        <path class="gr-brouillon" d="" hidden/>
        <g class="gr-noeuds">${noeuds.map(n => {
          const p = this.pos[n.id], sel = this.selection && this.selection.type === 'noeud' && this.selection.id === n.id;
          const cible = this.depuis && this.depuis !== n.id;
          return `<g class="gr-noeud ton-${esc(n.ton || 'neutre')}${membre.has(n.id) ? ' en-chaine' : ''}${sel ? ' sel' : ''}${this.depuis === n.id ? ' depuis' : ''}${cible ? ' cible' : ''}"
              data-noeud="${esc(n.id)}" transform="translate(${p.x},${p.y})" tabindex="0" role="button"
              aria-label="${esc(n.nom + (n.sous ? ', ' + n.sous : ''))}${cible ? '. Entrée pour y relier.' : ''}">
            <title>${esc(n.nom)}${n.sous ? ' — ' + esc(n.sous) : ''}</title>
            <rect class="gr-fond" width="${L}" height="${H}" rx="12"/>
            <rect class="gr-bord" width="5" height="${H - 16}" x="0" y="8" rx="2"/>
            ${I ? `<g class="gr-ico" transform="translate(12,${(H - 22) / 2}) scale(.92)">${I.TRAITS[n.ico] || I.TRAITS.service}</g>` : ''}
            <text class="gr-nom" x="44" y="${n.sous ? 22 : 31}">${esc(court(n.nom, 19))}</text>
            ${n.sous ? `<text class="gr-sous" x="44" y="39">${esc(court(n.sous, 26))}</text>` : ''}
            ${fige ? '' : `<g class="gr-port" data-port="${esc(n.id)}" transform="translate(${bas ? L / 2 : L},${bas ? H : H / 2})"><circle r="9"/><path d="M-4,0 H4 M0,-4 V4"/>
              <title>Tirer vers un autre service, ou cliquer ici puis sur lui, pour les relier</title></g>`}
          </g>`;
        }).join('')}</g>`;
      if (this.focus) {
        const f = svg.querySelector(this.focus);
        if (f) f.focus({ preventScroll: true });
        this.focus = null;
      }
      this.eclairer(this.choisi());
    }

    /** En étapes : chaque trait part et arrive à sa place sur le bord d'un
     *  service (rangés dans le sens de l'autre bout : ils ne se croisent pas
     *  en arrivant), et tourne à sa hauteur entre deux étapes. */
    places(liens) {
      const out = new Map(), pos = this.pos, centre = id => pos[id].x + L / 2;
      const vers = l => { const v = this.via[l.de + '>' + l.vers]; return v && v.length ? v[0].x + L / 2 : centre(l.vers); };
      const depuis = l => { const v = this.via[l.de + '>' + l.vers]; return v && v.length ? v[v.length - 1].x + L / 2 : centre(l.de); };
      const ok = liens.filter(l => pos[l.de] && pos[l.vers]);
      // Un trait qui descend tout droit garde le milieu ; les autres
      // s'écartent du côté où ils vont.
      const repartir = (liste, cle, ici, champ) => {
        liste.sort((p, q) => cle(p) - cle(q));
        const droit = liste.filter(l => Math.abs(cle(l) - ici) < 1);
        const g = liste.filter(l => cle(l) < ici - 1), d = liste.filter(l => cle(l) > ici + 1);
        // Tous dans la largeur du service, même nombreux.
        const n = liste.length, cote = droit.length ? Math.max(g.length, d.length) + (droit.length - 1) / 2 : (n - 1) / 2;
        const pas = n > 1 ? Math.min(24, (L / 2 - 24) / Math.max(1, cote)) : 0;
        const pose = (l, v) => { const o = out.get(l) || {}; o[champ] = v; out.set(l, o); };
        if (!droit.length) { liste.forEach((l, i) => pose(l, (i - (n - 1) / 2) * pas)); return; }
        droit.forEach((l, i) => pose(l, (i - (droit.length - 1) / 2) * pas));
        const bord = (droit.length - 1) / 2 * pas;
        g.reverse().forEach((l, i) => pose(l, -bord - (i + 1) * pas));
        d.forEach((l, i) => pose(l, bord + (i + 1) * pas));
      };
      const par = f => { const m = new Map(); for (const l of ok) { const k = f(l); if (!m.has(k)) m.set(k, []); m.get(k).push(l); } return m; };
      for (const [id, liste] of par(l => l.de)) repartir(liste, vers, centre(id), 'd0');
      for (const [id, liste] of par(l => l.vers)) repartir(liste, depuis, centre(id), 'd1');
      // Deux traits qui tournent entre les mêmes étapes : chacun à sa hauteur.
      for (const liste of par(l => pos[l.de].y).values()) {
        const tournent = liste.filter(l => Math.abs(vers(l) - centre(l.de) - (out.get(l).d0 || 0)) > 1);
        tournent.sort((p, q) => (centre(p.de) + (out.get(p).d0 || 0)) - (centre(q.de) + (out.get(q).d0 || 0)));
        const n = tournent.length, pas = n > 1 ? Math.min(7, 26 / (n - 1)) : 0;
        tournent.forEach((l, i) => { out.get(l).canal = (i - (n - 1) / 2) * pas; });
      }
      return out;
    }

    /** Le service choisi, s'il y en a un. */
    choisi() { return this.selection && this.selection.type === 'noeud' ? this.selection.id : null; }

    /** Ce qui mène à un service et ce qui en part : sa chaîne, dans les deux sens. */
    chaine(id, liens) {
      const suivre = (depart, de, vers) => {
        const vus = new Set(), file = [depart];
        while (file.length) { const x = file.pop(); for (const l of liens) if (l[de] === x && !vus.has(l[vers]) && l[vers] !== depart) { vus.add(l[vers]); file.push(l[vers]); } }
        return vus;
      };
      return { amont: suivre(id, 'vers', 'de'), aval: suivre(id, 'de', 'vers') };
    }

    /** Éclairer la chaîne d'un service (survolé ou choisi) ; le reste pâlit. */
    eclairer(id) {
      const hote = this.a.hote(), svg = hote && hote.querySelector('.gr-svg'); if (!svg) return;
      svg.querySelectorAll('.lie').forEach(x => x.classList.remove('lie'));
      const liens = this.derniersLiens || [];
      const n = id && svg.querySelector(`[data-noeud="${CSS.escape(id)}"]`);
      svg.classList.toggle('gr-focus', !!n);
      if (!n) return;
      const { amont, aval } = this.chaine(id, liens);
      const haut = new Set([id, ...amont]), bas = new Set([id, ...aval]);
      for (const x of new Set([...haut, ...bas])) { const e = svg.querySelector(`[data-noeud="${CSS.escape(x)}"]`); if (e) e.classList.add('lie'); }
      for (const l of liens) if ((haut.has(l.de) && (haut.has(l.vers) || bas.has(l.vers))) || (bas.has(l.de) && bas.has(l.vers))) {
        const e = svg.querySelector(`[data-lien="${CSS.escape(l.id)}"]`); if (e) e.classList.add('lie');
      }
    }

    /** Le lien choisi se dessine en dernier : sa croix passe au-dessus des autres traits. */
    estChoisi(l) { return this.selection && this.selection.type === 'lien' && this.selection.id === l.id ? 1 : 0; }

    /* ---- gestes ------------------------------------------------------ */

    installer(hote) {
      hote.innerHTML = `<div class="gr-boite"><button type="button" class="gr-sens" data-gr-sens></button>
        <div class="gr-cadre"><svg class="gr-svg" role="group" aria-label="${esc(this.a.titre || 'Diagramme')}"></svg></div></div>`;
      const cadre = hote.querySelector('.gr-cadre');
      hote.querySelector('[data-gr-sens]').addEventListener('click', () => {
        ecrireSens(this.bas() ? 'ligne' : 'bas');
        for (const d of DIAGRAMMES) { const h = d.a.hote(); if (h && h.querySelector('.gr-svg')) d.rendre(); }
      });
      cadre.addEventListener('scroll', () => cadre.classList.toggle('gr-deborde', cadre.scrollLeft + cadre.clientWidth < cadre.scrollWidth - 4));
      const svg = hote.querySelector('.gr-svg');
      svg.addEventListener('pointerdown', e => this.appui(e));
      svg.addEventListener('pointermove', e => this.glisser(e));
      svg.addEventListener('pointerup', e => this.lacher(e));
      svg.addEventListener('pointercancel', () => this.annulerGeste());
      svg.addEventListener('keydown', e => this.clavier(e));
      // Survoler un service éclaire sa chaîne ; en sortir revient au service choisi.
      svg.addEventListener('pointerover', e => { if (this.geste) return; const n = e.target.closest('[data-noeud]'); this.eclairer(n ? n.dataset.noeud : this.choisi()); });
      svg.addEventListener('pointerleave', () => { if (!this.geste) this.eclairer(this.choisi()); });
      svg.addEventListener('focusin', e => { const n = e.target.closest('[data-noeud]'); if (n) this.eclairer(n.dataset.noeud); });
    }

    point(e) {
      const svg = this.a.hote().querySelector('.gr-svg');
      const m = svg.getScreenCTM();
      if (!m) return { x: 0, y: 0 };
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      return { x: p.x, y: p.y };
    }

    appui(e) {
      if (e.button !== undefined && e.button !== 0) return;
      const retirer = e.target.closest('[data-retirer]');
      if (retirer) { e.preventDefault(); return this.retirer(retirer.dataset.retirer); }
      const port = e.target.closest('[data-port]');
      const noeud = e.target.closest('[data-noeud]');
      const lien = e.target.closest('[data-lien]');
      const svg = this.a.hote().querySelector('.gr-svg');
      // En mode « relier », cliquer le + d'un autre service vaut le choisir comme destination.
      if (port && this.depuis && port.dataset.port !== this.depuis) {
        e.preventDefault(); return this.relier(this.depuis, port.dataset.port);
      }
      if (port) {
        e.preventDefault();
        this.geste = { type: 'relier', de: port.dataset.port, id: e.pointerId, cx: e.clientX, cy: e.clientY, tire: false };
        svg.setPointerCapture(e.pointerId);
        return;
      }
      if (noeud) {
        const p = this.point(e), id = noeud.dataset.noeud, q = this.pos[id];
        this.geste = { type: 'noeud', id, dx: p.x - q.x, dy: p.y - q.y, x0: p.x, y0: p.y, bouge: false };
        svg.setPointerCapture(e.pointerId);
        return;
      }
      if (lien) { this.choisir({ type: 'lien', id: lien.dataset.lien }); return; }
      if (this.depuis) { this.depuis = null; this.dire(''); }
      this.choisir(null);
    }

    glisser(e) {
      const g = this.geste; if (!g) return;
      const p = this.point(e), svg = this.a.hote().querySelector('.gr-svg');
      if (g.type === 'relier') {
        const a = this.pos[g.de], b = svg.querySelector('.gr-brouillon');
        if (!g.tire && Math.hypot(e.clientX - g.cx, e.clientY - g.cy) < 6) return;   // pas encore un trait
        g.tire = true;
        b.hidden = false;
        // Près du bord du cadre, il défile : on atteint un service hors de vue.
        const cadre = this.a.hote().querySelector('.gr-cadre'), r = cadre.getBoundingClientRect();
        if (e.clientX > r.right - 40) cadre.scrollLeft += 16; else if (e.clientX < r.left + 40) cadre.scrollLeft -= 16;
        if (e.clientY > r.bottom - 40) cadre.scrollTop += 16; else if (e.clientY < r.top + 40) cadre.scrollTop -= 16;
        b.setAttribute('d', (this.bas() ? courbe(a, { x: p.x - L / 2, y: p.y + 6 }, null, true) : courbe(a, { x: p.x + 6, y: p.y - H / 2 })).d);
        const sous = this.noeudSous(e);
        svg.querySelectorAll('.gr-noeud.survol').forEach(n => n.classList.remove('survol'));
        if (sous && sous.dataset.noeud !== g.de) sous.classList.add('survol');
        return;
      }
      if (!g.bouge && Math.hypot(p.x - g.x0, p.y - g.y0) < 5) return;
      g.bouge = true;
      const q = this.pos[g.id]; q.x = Math.round(p.x - g.dx); q.y = Math.round(p.y - g.dy);
      const n = svg.querySelector(`[data-noeud="${CSS.escape(g.id)}"]`);
      if (n) n.setAttribute('transform', `translate(${q.x},${q.y})`);
      // Le cadre de son groupe le suit aussi.
      const gg = svg.querySelector('.gr-groupes'); if (gg && this.a.groupes) gg.innerHTML = this.groupesSVG(this.cadresGroupes());
      // Les liens suivent le nœud qu'on déplace.
      for (const l of this.a.liens()) {
        if (l.de !== g.id && l.vers !== g.id) continue;
        const el = svg.querySelector(`[data-lien="${CSS.escape(l.id)}"]`);
        if (!el) continue;
        const d = courbe(this.pos[l.de], this.pos[l.vers], null, this.bas()).d;
        el.querySelectorAll('path.gr-prise,path.gr-trait').forEach(x => x.setAttribute('d', d));
      }
    }

    lacher(e) {
      const g = this.geste; this.geste = null; if (!g) return;
      if (g.type === 'relier') {
        const sous = this.noeudSous(e);
        this.a.hote().querySelector('.gr-brouillon').hidden = true;
        if (sous && sous.dataset.noeud !== g.de) return this.relier(g.de, sous.dataset.noeud);
        // Un clic sur le + sans tirer : on passe en « relier à… », le prochain
        // service cliqué reçoit le lien. Un second clic sur le même + annule.
        if (!g.tire) {
          if (this.depuis === g.de) { this.depuis = null; this.dire('Relier : annulé.'); return this.rendre(); }
          return this.relierDepuis(g.de);
        }
        return this.rendre();
      }
      if (g.bouge) {
        const garde = {}; for (const [id, p] of Object.entries(this.pos)) garde[id] = { x: p.x, y: p.y };
        ecrirePositions(this.cleDispo(), garde);
        return this.rendre();
      }
      // Un simple clic : relier (si l'on a demandé « Relier à… ») ou choisir.
      if (this.depuis && this.depuis !== g.id) return this.relier(this.depuis, g.id);
      this.choisir({ type: 'noeud', id: g.id });
    }

    annulerGeste() {
      this.geste = null;
      const b = this.a.hote() && this.a.hote().querySelector('.gr-brouillon'); if (b) b.hidden = true;
    }

    noeudSous(e) {
      const el = root.document.elementFromPoint(e.clientX, e.clientY);
      return el && el.closest ? el.closest('[data-noeud]') : null;
    }

    clavier(e) {
      const n = e.target.closest('[data-noeud]'), l = e.target.closest('[data-lien]');
      if (e.key === 'Escape' && this.depuis) { this.depuis = null; this.dire('Relier : annulé.'); this.rendre(); return; }
      if (n && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        const id = n.dataset.noeud;
        this.focus = `[data-noeud="${CSS.escape(id)}"]`;
        if (this.depuis && this.depuis !== id) return this.relier(this.depuis, id);
        return this.choisir({ type: 'noeud', id });
      }
      // Les flèches déplacent le service choisi, comme la souris.
      const pas = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[e.key];
      if (n && pas && e.altKey) {
        e.preventDefault();
        const q = this.pos[n.dataset.noeud]; q.x += pas[0]; q.y += pas[1];
        const garde = {}; for (const [id, p] of Object.entries(this.pos)) garde[id] = { x: p.x, y: p.y };
        ecrirePositions(this.cleDispo(), garde);
        this.focus = `[data-noeud="${CSS.escape(n.dataset.noeud)}"]`;
        return this.rendre();
      }
      if (l && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); return this.retirer(l.dataset.lien); }
      if (l && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        this.focus = `[data-lien="${CSS.escape(l.dataset.lien)}"]`;
        return this.choisir({ type: 'lien', id: l.dataset.lien });
      }
    }

    /* ---- ce que le diagramme demande à son adaptateur ---------------- */

    choisir(sel) {
      this.selection = sel;
      this.rendre();
      if (this.a.choisir) this.a.choisir(sel);
    }

    /** « Relier à… » : le prochain service cliqué (ou validé au clavier) reçoit le lien. */
    relierDepuis(id) {
      this.depuis = id;
      if (this.a.relierDebut) this.a.relierDebut(id);
      const n = this.a.noeuds().find(x => x.id === id);
      this.dire('Relier ' + (n ? n.nom : id) + ' à… : cliquez le service qui le reçoit (Échap ou un clic dans le vide pour annuler).', { consigne: true });
      this.rendre();
      const autre = this.a.hote().querySelector('.gr-noeud.cible');
      if (autre) autre.focus({ preventScroll: true });
    }

    relier(de, vers) {
      this.depuis = null;
      const erreur = this.a.relier(de, vers);
      if (erreur) this.dire(erreur);
      else this.selection = { type: 'lien', id: this.idLien(de, vers) };
      this.rendre();
      if (!erreur && this.a.choisir) this.a.choisir(this.selection);
    }

    idLien(de, vers) {
      const l = this.a.liens().find(x => x.de === de && x.vers === vers);
      return l ? l.id : de + '>' + vers;
    }

    retirer(id) {
      this.selection = null;
      this.a.retirerLien(id);
      this.rendre();
      if (this.a.choisir) this.a.choisir(null);
    }

    /** Faire venir un nœud dans le cadre, sans faire défiler la page. */
    montrer(id) {
      const hote = this.a.hote(), cadre = hote && hote.querySelector('.gr-cadre');
      const n = cadre && cadre.querySelector(`[data-noeud="${CSS.escape(id)}"]`);
      if (!n) return;
      const c = cadre.getBoundingClientRect(), r = n.getBoundingClientRect();
      if (r.left < c.left) cadre.scrollLeft -= c.left - r.left + 24;
      else if (r.right > c.right) cadre.scrollLeft += r.right - c.right + 24;
      if (r.top < c.top) cadre.scrollTop -= c.top - r.top + 24;
      else if (r.bottom > c.bottom) cadre.scrollTop += r.bottom - c.bottom + 24;
    }

    /** Oublier la disposition retenue : les nœuds se rangent à nouveau d'eux-mêmes. */
    reorganiser() { ecrirePositions(this.cleDispo(), null); this.rendre(); }

    /** Ce que le diagramme a à dire : une consigne (tant que dure le geste), un refus, un abandon. */
    dire(texte, o) { if (this.a.message) this.a.message(texte, o); }
  }

  const api = { L, H, CLE, CLE_SENS, disposer, courbe, validerPositions, lirePositions, ecrirePositions, lireSens, ecrireSens, Diagramme };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyGraphe = api;
})(typeof window !== 'undefined' ? window : globalThis);

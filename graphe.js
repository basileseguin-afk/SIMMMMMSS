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
 *  Sans disposition enregistrée, les nœuds se rangent en colonnes, de gauche
 *  à droite dans le sens du flux (la « profondeur » de chaque nœud est le plus
 *  long chemin qui y mène).
 * ==========================================================================*/
(function (root) {
  'use strict';

  const L = 200, H = 52, PAS_X = 260, PAS_Y = 76, MARGE = 28;
  const CLE = 'ory-graphes-v1';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const court = (s, n) => (s = String(s || ''), s.length > n ? s.slice(0, n - 1) + '…' : s);

  /**
   * Une disposition en colonnes : colonne = plus long chemin depuis un nœud
   * sans amont ; dans une colonne, les nœuds suivent la hauteur moyenne de
   * leurs amonts (moins de croisements). Une boucle ne fait pas tourner le calcul.
   * @returns { id: {x, y} }
   */
  function disposer(noeuds, liens) {
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
    const arcs = tous.filter(l => !retours.has(l));
    const col = new Map(ids.map(id => [id, 0]));
    for (let tour = 0; tour < ids.length; tour++) {
      let bouge = false;
      for (const a of arcs) if (col.get(a.vers) < col.get(a.de) + 1 && col.get(a.de) + 1 < ids.length) {
        col.set(a.vers, col.get(a.de) + 1); bouge = true;
      }
      if (!bouge) break;
    }
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
   *  couloirs s'il en a (un trait droit à travers chaque colonne sautée). */
  function courbe(a, b, via) {
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
     *   liens()                — [{ id, de, vers, couleur, pointille, titre }]
     *   relier(de, vers)       — crée le lien ; renvoie un message d'erreur, ou rien
     *   retirerLien(id)        — retire le lien
     *   choisir(selection)     — { type:'noeud'|'lien', id } ou null
     *   message(texte)         — facultatif : dire ce qui se passe
     *   relierDebut(id)        — facultatif : « relier à… » commence
     * } */
    constructor(a) {
      this.a = a;
      this.selection = null;
      this.depuis = null;          // « Relier à… » : le nœud de départ
      this.geste = null;           // un glisser en cours
      this.pos = {};
    }

    /* ---- dessin ------------------------------------------------------ */

    positions() {
      const noeuds = this.a.noeuds(), liens = this.a.liens();
      const auto = disposer(noeuds, liens), gardees = lirePositions()[this.a.cle] || {};
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
        while (Object.values(pos).some(q => q && Math.abs(q.x - p.x) < L && Math.abs(q.y - p.y) < H + 8)) p.y += PAS_Y;
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
      const xs = Object.values(this.pos);
      const x0 = Math.min(0, ...xs.map(p => p.x)) - MARGE, y0 = Math.min(0, ...xs.map(p => p.y)) - MARGE;
      const x1 = Math.max(L, ...xs.map(p => p.x + L)) + MARGE + 30, y1 = Math.max(H, ...xs.map(p => p.y + H)) + MARGE;
      this.cadre = { x0, y0, w: x1 - x0, h: y1 - y0 };
      svg.setAttribute('viewBox', `${x0} ${y0} ${x1 - x0} ${y1 - y0}`);
      svg.setAttribute('width', x1 - x0); svg.setAttribute('height', y1 - y0);
      const couleurs = [...new Set(liens.map(l => l.couleur || ''))];
      const marque = c => 'gr-f-' + this.a.cle.replace(/[^a-z0-9]/gi, '') + '-' + couleurs.indexOf(c || '');
      const I = root.OrlyIcones;
      svg.innerHTML = `<defs>${couleurs.map(c => `<marker id="${marque(c)}" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="gr-pointe"${c ? ` style="fill:${esc(c)}"` : ''}/></marker>`).join('')}</defs>
        <g class="gr-liens">${liens.slice().sort((x, y) => this.estChoisi(x) - this.estChoisi(y)).map(l => {
          const a = this.pos[l.de], b = this.pos[l.vers]; if (!a || !b) return '';
          const k = courbe(a, b, this.via[l.de + '>' + l.vers]), sel = this.selection && this.selection.type === 'lien' && this.selection.id === l.id;
          return `<g class="gr-lien${sel ? ' sel' : ''}${l.pointille ? ' pointille' : ''}" data-lien="${esc(l.id)}" tabindex="0" role="button"
              aria-label="${esc(l.titre || '')}. Entrée pour le choisir, Suppr pour le retirer.">
            <title>${esc(l.titre || '')}</title>
            <path class="gr-prise" d="${k.d}"/><path class="gr-trait" d="${k.d}" marker-end="url(#${marque(l.couleur)})"${l.couleur ? ` style="stroke:${esc(l.couleur)}"` : ''}/>
            ${sel ? `<g class="gr-retirer" data-retirer="${esc(l.id)}" transform="translate(${k.mx},${k.my})"><circle r="11"/><path d="M-4,-4 L4,4 M4,-4 L-4,4"/><title>Retirer ce lien</title></g>` : ''}
          </g>`;
        }).join('')}</g>
        <path class="gr-brouillon" d="" hidden/>
        <g class="gr-noeuds">${noeuds.map(n => {
          const p = this.pos[n.id], sel = this.selection && this.selection.type === 'noeud' && this.selection.id === n.id;
          const cible = this.depuis && this.depuis !== n.id;
          return `<g class="gr-noeud ton-${esc(n.ton || 'neutre')}${sel ? ' sel' : ''}${this.depuis === n.id ? ' depuis' : ''}${cible ? ' cible' : ''}"
              data-noeud="${esc(n.id)}" transform="translate(${p.x},${p.y})" tabindex="0" role="button"
              aria-label="${esc(n.nom + (n.sous ? ', ' + n.sous : ''))}${cible ? '. Entrée pour y relier.' : ''}">
            <title>${esc(n.nom)}${n.sous ? ' — ' + esc(n.sous) : ''}</title>
            <rect class="gr-fond" width="${L}" height="${H}" rx="12"/>
            <rect class="gr-bord" width="5" height="${H - 16}" x="0" y="8" rx="2"/>
            ${I ? `<g class="gr-ico" transform="translate(12,${(H - 22) / 2}) scale(.92)">${I.TRAITS[n.ico] || I.TRAITS.service}</g>` : ''}
            <text class="gr-nom" x="44" y="${n.sous ? 22 : 31}">${esc(court(n.nom, 19))}</text>
            ${n.sous ? `<text class="gr-sous" x="44" y="39">${esc(court(n.sous, 26))}</text>` : ''}
            <g class="gr-port" data-port="${esc(n.id)}" transform="translate(${L},${H / 2})"><circle r="9"/><path d="M-4,0 H4 M0,-4 V4"/>
              <title>Tirer vers un autre service, ou cliquer ici puis sur lui, pour les relier</title></g>
          </g>`;
        }).join('')}</g>`;
      if (this.focus) {
        const f = svg.querySelector(this.focus);
        if (f) f.focus({ preventScroll: true });
        this.focus = null;
      }
    }

    /** Le lien choisi se dessine en dernier : sa croix passe au-dessus des autres traits. */
    estChoisi(l) { return this.selection && this.selection.type === 'lien' && this.selection.id === l.id ? 1 : 0; }

    /* ---- gestes ------------------------------------------------------ */

    installer(hote) {
      hote.innerHTML = `<div class="gr-cadre"><svg class="gr-svg" role="group" aria-label="${esc(this.a.titre || 'Diagramme')}"></svg></div>`;
      const svg = hote.querySelector('.gr-svg');
      svg.addEventListener('pointerdown', e => this.appui(e));
      svg.addEventListener('pointermove', e => this.glisser(e));
      svg.addEventListener('pointerup', e => this.lacher(e));
      svg.addEventListener('pointercancel', () => this.annulerGeste());
      svg.addEventListener('keydown', e => this.clavier(e));
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
        b.setAttribute('d', courbe(a, { x: p.x + 6, y: p.y - H / 2 }).d);
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
      // Les liens suivent le nœud qu'on déplace.
      for (const l of this.a.liens()) {
        if (l.de !== g.id && l.vers !== g.id) continue;
        const el = svg.querySelector(`[data-lien="${CSS.escape(l.id)}"]`);
        if (!el) continue;
        const d = courbe(this.pos[l.de], this.pos[l.vers]).d;
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
        ecrirePositions(this.a.cle, garde);
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
        ecrirePositions(this.a.cle, garde);
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
      this.dire('Relier ' + (n ? n.nom : id) + ' à… : cliquez le service qui le reçoit (Échap ou un clic dans le vide pour annuler).');
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
    reorganiser() { ecrirePositions(this.a.cle, null); this.rendre(); }

    dire(texte) { if (this.a.message) this.a.message(texte); }
  }

  const api = { L, H, CLE, disposer, courbe, validerPositions, lirePositions, ecrirePositions, Diagramme };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrlyGraphe = api;
})(typeof window !== 'undefined' ? window : globalThis);

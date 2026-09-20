/* ============================================================================
 *  ORY — Éditeur de postes de travail
 *  Trame : 1 carreau = 50 × 50 cm.
 *
 *  Deux natures de géométrie coexistent :
 *   - « carreaux » (table, chaîne, ligne robot) : ensemble de cases de la
 *     trame, donc formes libres en L, U, îlots ;
 *   - « centimètres » (desserte roulante, trolley) : rectangle libre posé
 *     par-dessus la trame. Une desserte de 70 cm ne tombe pas sur un carreau
 *     de 50 : la forcer fausserait l'encombrement.
 *
 *  Un assemblage compose plusieurs modèles avec position et orientation.
 * ==========================================================================*/
(function () {
'use strict';

const CELL_CM = 50, CELL_M = 0.5, CLE = 'ory-postes-v2';
const COTES = { N:[0,-1], S:[0,1], E:[1,0], O:[-1,0] };
const ROT_COTE = { N:'E', E:'S', S:'O', O:'N' };      // rotation horaire
const PAS = 0.5;                                       // pas de pose : 25 cm

const FAMILLES = {
  table:    { nom:'Table',            ico:'🪵', geo:'cells', postes:true  },
  tapis:    { nom:'Chaîne',           ico:'🏭', geo:'cells', postes:true  },
  robot:    { nom:'Ligne robot',      ico:'🤖', geo:'cells', postes:true  },
  desserte: { nom:'Desserte roulante',ico:'🛒', geo:'cm',    postes:true  },
  trolley:  { nom:'Trolley',          ico:'🧳', geo:'cm',    postes:false }
};

/* ==========================================================================
 *  1. DONNÉES
 * ==========================================================================*/
let modeles = [], assemblages = [];
let mode = 'modeles';                 // modeles | assemblages
let selModele = null, selAssemblage = null, selElement = null;
let outil = 'postes', zoom = 34;

const uid = p => p + '_' + Date.now().toString(36) + '_' + Math.floor(Math.random()*1e4).toString(36);
const cle = (x, y) => x + ',' + y;
const decle = k => k.split(',').map(Number);
const estCells = m => FAMILLES[m.type].geo === 'cells';

function rectCells(l, h) {
  const c = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) c.push(cle(x, y));
  return c;
}
function compte(type) { return modeles.filter(m => m.type === type).length + 1; }

function nouveauModele(type) {
  const base = { id:uid(type), type, nom:FAMILLES[type].nom + ' ' + compte(type), postes:[], hauteurCm:90 };
  if (type === 'table')    return Object.assign(base, { cells:rectCells(4,2),
    postes:[{x:0,y:0,cote:'N'},{x:3,y:1,cote:'S'}] });
  if (type === 'tapis')    return Object.assign(base, { cells:rectCells(10,2), sens:'E', debit:300,
    postes:[{x:1,y:0,cote:'N'},{x:4,y:1,cote:'S'},{x:7,y:0,cote:'N'}] });
  if (type === 'robot')    return Object.assign(base, { sens:'E', largeur:2,
    modules:[ {nom:'M1', long:4, debit:520}, {nom:'M2', long:4, debit:420}, {nom:'M3', long:4, debit:520} ],
    cells:[], postes:[{x:1,y:0,cote:'N'},{x:10,y:1,cote:'S'}] });
  if (type === 'desserte') return Object.assign(base, { dimCm:{ l:70, p:50 }, capacite:6, roulettes:true,
    postes:[{cote:'S'}] });
  return Object.assign(base, { dimCm:{ l:80, p:45 }, capacite:24, roulettes:true, postes:[] });
}

/* Une ligne robot est droite : ses carreaux découlent de ses modules. */
function majCellsRobot(m) {
  const long = m.modules.reduce((s, mo) => s + Math.max(1, mo.long|0), 0);
  const lg = Math.max(1, m.largeur|0);
  const horizontal = (m.sens === 'E' || m.sens === 'O');
  m.cells = horizontal ? rectCells(long, lg) : rectCells(lg, long);
  const libres = bordsLibres(m);
  m.postes = m.postes.filter(p => libres.some(b => b.x===p.x && b.y===p.y && b.cote===p.cote));
}
/* Séparations entre modules, en carreaux le long du sens. */
function coupesRobot(m) {
  const c = []; let acc = 0;
  m.modules.forEach((mo, i) => { if (i) c.push(acc); acc += Math.max(1, mo.long|0); });
  return c;
}
const debitLigne = m => m.modules.length ? Math.min.apply(null, m.modules.map(x => +x.debit || 0)) : 0;

/* --- géométrie carreaux --------------------------------------------------- */
function bornes(m) {
  if (!estCells(m)) { const d = dim(m); return { x0:0, y0:0, l:d.l, h:d.h }; }
  const pts = m.cells.map(decle);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
  return { x0, y0, l:Math.max.apply(null, xs) - x0 + 1, h:Math.max.apply(null, ys) - y0 + 1 };
}
/* Encombrement en carreaux (fractionnaire pour les objets en centimètres). */
function dim(m, rot) {
  if (estCells(m)) { const b = bornes(m); return tourneDim(b.l, b.h, rot); }
  return tourneDim(m.dimCm.l / CELL_CM, m.dimCm.p / CELL_CM, rot);
}
const tourneDim = (l, h, rot) => (((rot || 0) / 90) % 2 ? { l:h, h:l } : { l, h });

const occupe = (m, x, y) => m.cells.indexOf(cle(x, y)) >= 0;
function bordsLibres(m) {
  const out = [];
  if (!estCells(m)) return out;
  m.cells.forEach(k => {
    const [x, y] = decle(k);
    Object.keys(COTES).forEach(c => {
      const [dx, dy] = COTES[c];
      if (!occupe(m, x + dx, y + dy)) out.push({ x, y, cote:c });
    });
  });
  return out;
}
const aPoste = (m, x, y, c) => m.postes.some(p => p.x === x && p.y === y && p.cote === c);

/* Applique une rotation horaire à un modèle : renvoie cells et postes. */
function tourne(m, rot) {
  const n = ((((rot || 0) / 90) % 4) + 4) % 4;
  let pts = m.cells.map(decle);
  let ps = m.postes.map(p => ({ x:p.x, y:p.y, cote:p.cote }));
  for (let i = 0; i < n; i++) {
    pts = pts.map(p => [-p[1], p[0]]);
    ps = ps.map(p => ({ x:-p.y, y:p.x, cote:ROT_COTE[p.cote] }));
  }
  const mx = Math.min.apply(null, pts.map(p => p[0]));
  const my = Math.min.apply(null, pts.map(p => p[1]));
  return { cells: pts.map(p => cle(p[0]-mx, p[1]-my)),
           postes: ps.map(p => ({ x:p.x-mx, y:p.y-my, cote:p.cote })) };
}

function redimensionner(m, l, h) {
  m.cells = rectCells(Math.max(1, Math.min(60, l|0)), Math.max(1, Math.min(60, h|0)));
  const libres = bordsLibres(m);
  m.postes = m.postes.filter(p => libres.some(b => b.x===p.x && b.y===p.y && b.cote===p.cote));
}

const modele = () => modeles.find(m => m.id === selModele) || null;
const assemblage = () => assemblages.find(a => a.id === selAssemblage) || null;
const modeleDe = id => modeles.find(m => m.id === id) || null;

/* ==========================================================================
 *  2. PERSISTANCE
 * ==========================================================================*/
function valide(m) {
  if (!m || typeof m.id !== 'string' || !FAMILLES[m.type] || !Array.isArray(m.postes)) return false;
  if (FAMILLES[m.type].geo === 'cells') return Array.isArray(m.cells) && m.cells.length > 0;
  return m.dimCm && +m.dimCm.l > 0 && +m.dimCm.p > 0;
}
const valideAssemblage = a => a && typeof a.id === 'string' && Array.isArray(a.elements);

function sauver() {
  try { localStorage.setItem(CLE, JSON.stringify({ modeles, assemblages })); } catch (e) { /* indisponible */ }
}
function charger() {
  try {
    const d = JSON.parse(localStorage.getItem(CLE) || 'null');
    if (!d || !Array.isArray(d.modeles) || !d.modeles.length) return false;
    modeles = d.modeles.filter(valide);
    assemblages = Array.isArray(d.assemblages) ? d.assemblages.filter(valideAssemblage) : [];
    modeles.forEach(m => { if (m.type === 'robot') majCellsRobot(m); });
    return modeles.length > 0;
  } catch (e) { return false; }
}

/* ==========================================================================
 *  3. RENDU
 * ==========================================================================*/
const NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('plan');
function el(t, a) { const n = document.createElementNS(NS, t); for (const k in (a||{})) n.setAttribute(k, a[k]); return n; }
const MARGE = 3;

function dessiner() { mode === 'modeles' ? dessinerModele() : dessinerAssemblage(); }

function cadre(Lc, Hc) {
  const W = Lc * zoom, H = Hc * zoom;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const g = el('g');
  for (let i = 0; i <= Lc; i++) g.appendChild(el('line', { class:'trame-' + (i%4?'min':'maj'), x1:i*zoom, y1:0, x2:i*zoom, y2:H }));
  for (let j = 0; j <= Hc; j++) g.appendChild(el('line', { class:'trame-' + (j%4?'min':'maj'), x1:0, y1:j*zoom, x2:W, y2:j*zoom }));
  svg.appendChild(g);
  const gr = el('g');
  for (let i = 0; i <= Lc; i += 4) { const t = el('text', { class:'regle-txt', x:i*zoom+3, y:12 }); t.textContent = (i*CELL_M).toFixed(0)+' m'; gr.appendChild(t); }
  for (let j = 4; j <= Hc; j += 4) { const t = el('text', { class:'regle-txt', x:3, y:j*zoom-4 }); t.textContent = (j*CELL_M).toFixed(0)+' m'; gr.appendChild(t); }
  svg.appendChild(gr);
  return { W, H };
}

/* Dessine un modèle à l'emplacement (ox, oy) exprimé en carreaux. */
function dessinerMeuble(parent, m, ox, oy, rot, avecPostes) {
  const g = el('g');
  const f = 'f-' + m.type, c = 'contour c-' + m.type;

  if (estCells(m)) {
    const t = tourne(m, rot);
    const faux = { cells:t.cells, postes:t.postes, type:m.type, dimCm:m.dimCm };
    t.cells.forEach(k => {
      const p = decle(k);
      g.appendChild(el('rect', { class:f, x:(ox+p[0])*zoom, y:(oy+p[1])*zoom, width:zoom, height:zoom }));
    });
    // chevrons de sens
    if (m.type === 'tapis' || m.type === 'robot') {
      const s = tourneSens(m.sens, rot), d = COTES[s] || COTES.E;
      t.cells.forEach(k => {
        const p = decle(k), cx = (ox+p[0])*zoom + zoom/2, cy = (oy+p[1])*zoom + zoom/2, r = zoom*0.22;
        g.appendChild(el('path', { class:'chevron', d:'M ' + (cx-d[1]*r-d[0]*r) + ' ' + (cy+d[0]*r-d[1]*r) +
          ' L ' + (cx+d[0]*r) + ' ' + (cy+d[1]*r) + ' L ' + (cx+d[1]*r-d[0]*r) + ' ' + (cy-d[0]*r-d[1]*r) }));
      });
    }
    // contour : uniquement les bords libres
    bordsLibres(faux).forEach(b => {
      const X = (ox+b.x)*zoom, Y = (oy+b.y)*zoom;
      const s = { N:[X,Y,X+zoom,Y], S:[X,Y+zoom,X+zoom,Y+zoom], O:[X,Y,X,Y+zoom], E:[X+zoom,Y,X+zoom,Y+zoom] }[b.cote];
      g.appendChild(el('line', { class:c, x1:s[0], y1:s[1], x2:s[2], y2:s[3] }));
    });
    // séparations de modules
    if (m.type === 'robot') dessinerCoupes(g, m, ox, oy, rot);
    if (avecPostes) dessinerPostesCells(g, faux, ox, oy);
    else t.postes.forEach(p => g.appendChild(personne((ox+p.x)*zoom, (oy+p.y)*zoom, p.cote)));
  } else {
    const d = dim(m, rot);
    const X = ox*zoom, Y = oy*zoom, W = d.l*zoom, H = d.h*zoom;
    g.appendChild(el('rect', { class:f, x:X, y:Y, width:W, height:H, rx:zoom*0.12 }));
    g.appendChild(el('rect', { class:c, x:X, y:Y, width:W, height:H, rx:zoom*0.12 }));
    if (m.roulettes) {
      const r = Math.max(3, zoom*0.09), m2 = zoom*0.18;
      [[X+m2,Y+m2],[X+W-m2,Y+m2],[X+m2,Y+H-m2],[X+W-m2,Y+H-m2]].forEach(p =>
        g.appendChild(el('circle', { class:'roulette', cx:p[0], cy:p[1], r })));
    }
    if (m.type === 'trolley') {
      const n = 4;
      for (let i = 1; i < n; i++) {
        const yy = Y + H*i/n;
        g.appendChild(el('line', { class:c, x1:X+2, y1:yy, x2:X+W-2, y2:yy, 'stroke-width':1.2 }));
      }
    }
    if (avecPostes) {          // cote affichée seulement en édition de modèle
      const t = el('text', { class:'etiq-nom', x:X+6, y:Y+H+14 });
      t.textContent = m.dimCm.l + ' × ' + m.dimCm.p + ' cm'; g.appendChild(t);
    }
    if (avecPostes) dessinerPostesCm(g, m, ox, oy, d);
    else m.postes.forEach(p => {
      const pt = ancreCm(X, Y, W, H, tourneCote(p.cote, rot));
      g.appendChild(personneXY(pt.x, pt.y, tourneCote(p.cote, rot)));
    });
  }
  parent.appendChild(g);
  return g;
}
const tourneSens = (s, rot) => { let c = s || 'E'; for (let i = 0; i < ((((rot||0)/90)%4)+4)%4; i++) c = ROT_COTE[c]; return c; };
const tourneCote = tourneSens;

function dessinerCoupes(g, m, ox, oy, rot) {
  const horizontal = (tourneSens(m.sens, rot) === 'E' || tourneSens(m.sens, rot) === 'O');
  const d = dim(m, rot);
  let coupes = coupesRobot(m);
  if (tourneSens(m.sens, rot) === 'O' || tourneSens(m.sens, rot) === 'N')
    coupes = coupes.map(c => (horizontal ? d.l : d.h) - c);
  coupes.forEach(c => {
    if (horizontal) g.appendChild(el('line', { class:'sep-module', x1:(ox+c)*zoom, y1:oy*zoom, x2:(ox+c)*zoom, y2:(oy+d.h)*zoom }));
    else g.appendChild(el('line', { class:'sep-module', x1:ox*zoom, y1:(oy+c)*zoom, x2:(ox+d.l)*zoom, y2:(oy+c)*zoom }));
  });
  let acc = 0;
  m.modules.forEach(mo => {
    const milieu = acc + Math.max(1, mo.long|0)/2; acc += Math.max(1, mo.long|0);
    const t = el('text', { class:'etiq-module', 'text-anchor':'middle',
      x: horizontal ? (ox+milieu)*zoom : (ox+d.l/2)*zoom,
      y: horizontal ? (oy+d.h)*zoom - 6 : (oy+milieu)*zoom });
    t.textContent = mo.nom; g.appendChild(t);
  });
}

function dessinerPostesCells(g, m, ox, oy) {
  bordsLibres(m).forEach(b => {
    const X = (ox+b.x)*zoom, Y = (oy+b.y)*zoom, e = zoom*0.34;
    const z = { N:[X,Y-e,zoom,e], S:[X,Y+zoom,zoom,e], O:[X-e,Y,e,zoom], E:[X+zoom,Y,e,zoom] }[b.cote];
    g.appendChild(el('rect', { class:'poste-slot', x:z[0], y:z[1], width:z[2], height:z[3],
      'data-x':b.x, 'data-y':b.y, 'data-cote':b.cote }));
    if (aPoste(m, b.x, b.y, b.cote)) g.appendChild(personne(X, Y, b.cote));
  });
}
function ancreCm(X, Y, W, H, cote) {
  const d = Math.min(W, H) * 0.42;
  return { x:X + W/2 + (cote==='E'?W/2+d:cote==='O'?-W/2-d:0),
           y:Y + H/2 + (cote==='S'?H/2+d:cote==='N'?-H/2-d:0) };
}
function dessinerPostesCm(g, m, ox, oy, d) {
  const X = ox*zoom, Y = oy*zoom, W = d.l*zoom, H = d.h*zoom;
  Object.keys(COTES).forEach(cote => {
    const p = ancreCm(X, Y, W, H, cote), e = zoom*0.34;
    g.appendChild(el('rect', { class:'poste-slot', x:p.x-e/2, y:p.y-e/2, width:e, height:e, 'data-cote':cote }));
    if (m.postes.some(q => q.cote === cote)) g.appendChild(personneXY(p.x, p.y, cote));
  });
}
function personne(X, Y, cote) {
  const d = zoom*0.46;
  return personneXY(X + zoom/2 + (cote==='E'?d:cote==='O'?-d:0),
                    Y + zoom/2 + (cote==='S'?d:cote==='N'?-d:0), cote);
}
function personneXY(cx, cy, cote) {
  const h = (cote === 'N' || cote === 'S'), g = el('g');
  g.appendChild(el('ellipse', { class:'poste-corps', cx, cy, rx:zoom*(h?0.30:0.19), ry:zoom*(h?0.19:0.30) }));
  g.appendChild(el('circle', { class:'poste-tete', cx, cy, r:zoom*0.135 }));
  return g;
}

function dessinerModele() {
  const m = modele();
  if (!m) { while (svg.firstChild) svg.removeChild(svg.firstChild); svg.removeAttribute('viewBox'); return; }
  const b = bornes(m), d = dim(m);
  cadre(Math.ceil(d.l) + MARGE*2, Math.ceil(d.h) + MARGE*2);
  const g = el('g'); svg.appendChild(g);
  dessinerMeuble(g, estCells(m) ? normalise(m) : m, MARGE, MARGE, 0, true);
}
/* Ramène les carreaux en coordonnées positives pour l'affichage. */
function normalise(m) {
  const b = bornes(m);
  if (!b.x0 && !b.y0) return m;
  const copie = Object.assign({}, m);
  copie.cells = m.cells.map(k => { const p = decle(k); return cle(p[0]-b.x0, p[1]-b.y0); });
  copie.postes = m.postes.map(p => ({ x:p.x-b.x0, y:p.y-b.y0, cote:p.cote }));
  return copie;
}

function dessinerAssemblage() {
  const a = assemblage();
  if (!a) { while (svg.firstChild) svg.removeChild(svg.firstChild); svg.removeAttribute('viewBox'); return; }
  let Lc = 16, Hc = 10;
  a.elements.forEach(e => {
    const m = modeleDe(e.refId); if (!m) return;
    const d = dim(m, e.rot);
    Lc = Math.max(Lc, Math.ceil(e.x + d.l) + 2); Hc = Math.max(Hc, Math.ceil(e.y + d.h) + 2);
  });
  cadre(Lc, Hc);
  const g = el('g'); svg.appendChild(g);
  a.elements.forEach(e => {
    const m = modeleDe(e.refId); if (!m) return;
    const ge = dessinerMeuble(g, m, e.x, e.y, e.rot, false);
    ge.setAttribute('class', 'elem' + (e.id === selElement ? ' sel' : ''));
    ge.setAttribute('data-elem', e.id);
    const t = el('text', { class:'elem-etiq', x:e.x*zoom + 5, y:e.y*zoom - 5 });
    t.textContent = m.nom; ge.appendChild(t);
  });
}

/* ==========================================================================
 *  4. PANNEAUX
 * ==========================================================================*/
const ligne = (k, v) => '<div class="mesure"><span>' + k + '</span><b>' + v + '</b></div>';
function texte(node, s) { node.textContent = s; }

function majCatalogue() {
  const box = document.getElementById('catalogue'); box.innerHTML = '';
  if (!modeles.length) { box.innerHTML = '<div class="vide">Bibliothèque vide.</div>'; return; }
  modeles.forEach(m => {
    const d = dim(m), fam = FAMILLES[m.type];
    const item = document.createElement('div');
    item.className = 'cat-item' + (m.id === selModele && mode === 'modeles' ? ' on' : '');
    item.innerHTML = '<span class="cat-ico">' + fam.ico + '</span><span class="cat-txt">' +
      '<span class="cat-nom"></span><span class="cat-meta"></span></span>';
    texte(item.querySelector('.cat-nom'), m.nom);
    texte(item.querySelector('.cat-meta'), mesureCourte(m, d));
    item.addEventListener('click', () => { selModele = m.id; tout(); });
    box.appendChild(item);
  });
}
function mesureCourte(m, d) {
  const taille = estCells(m) ? (d.l*CELL_M).toFixed(1) + ' × ' + (d.h*CELL_M).toFixed(1) + ' m'
                             : m.dimCm.l + ' × ' + m.dimCm.p + ' cm';
  let s = taille + ' · ' + m.postes.length + ' pers.';
  if (m.type === 'tapis') s += ' · ' + m.debit + ' u/h';
  if (m.type === 'robot') s += ' · ' + m.modules.length + ' mod. · ' + debitLigne(m) + ' u/h';
  if (!estCells(m) && m.capacite) s += ' · cap. ' + m.capacite;
  return s;
}

function majListeAssemblages() {
  const box = document.getElementById('liste-assemblages'); box.innerHTML = '';
  if (!assemblages.length) { box.innerHTML = '<div class="vide">Aucun assemblage.</div>'; return; }
  assemblages.forEach(a => {
    const item = document.createElement('div');
    item.className = 'cat-item' + (a.id === selAssemblage ? ' on' : '');
    item.innerHTML = '<span class="cat-ico">🧩</span><span class="cat-txt">' +
      '<span class="cat-nom"></span><span class="cat-meta"></span></span>';
    texte(item.querySelector('.cat-nom'), a.nom);
    texte(item.querySelector('.cat-meta'), a.elements.length + ' élément(s) · ' + personnesAssemblage(a) + ' pers.');
    item.addEventListener('click', () => { selAssemblage = a.id; selElement = null; tout(); });
    box.appendChild(item);
  });
}
const personnesAssemblage = a => a.elements.reduce((s, e) => {
  const m = modeleDe(e.refId); return s + (m ? m.postes.length : 0); }, 0);

function majPalette() {
  const box = document.getElementById('palette'); box.innerHTML = '';
  if (!modeles.length) { box.innerHTML = '<div class="vide">Créez d\'abord un modèle.</div>'; return; }
  modeles.forEach(m => {
    const b = document.createElement('button');
    b.className = 'btn btn-sm'; b.style.marginBottom = '5px'; b.style.width = '100%';
    b.style.textAlign = 'left'; b.textContent = FAMILLES[m.type].ico + ' ' + m.nom;
    b.addEventListener('click', () => {
      const a = assemblage(); if (!a) { alert('Créez d\'abord un assemblage.'); return; }
      const pos = placeLibre(a);
      const e = { id:uid('el'), refId:m.id, x:pos.x, y:pos.y, rot:0 };
      a.elements.push(e); selElement = e.id; apres();
    });
    box.appendChild(b);
  });
}

/* Pose un nouvel élément à droite des précédents, pour éviter les
 * superpositions au même point. */
function placeLibre(a) {
  let x = 1;
  a.elements.forEach(e => {
    const m = modeleDe(e.refId); if (!m) return;
    x = Math.max(x, e.x + dim(m, e.rot).l + 1);
  });
  return { x:Math.round(x / PAS) * PAS, y:1 };
}

function majTotaux() {
  const pers = modeles.reduce((s, m) => s + m.postes.length, 0);
  const surf = modeles.reduce((s, m) => s + surfaceM2(m), 0);
  document.getElementById('totaux').innerHTML =
    ligne('Modèles', modeles.length) + ligne('Assemblages', assemblages.length) +
    ligne('Personnes (modèles)', pers) + ligne('Surface cumulée', surf.toFixed(2) + ' m²');
}
function surfaceM2(m) {
  return estCells(m) ? m.cells.length * CELL_M * CELL_M : (m.dimCm.l * m.dimCm.p) / 10000;
}

/* --- propriétés ----------------------------------------------------------- */
function majProps() {
  const box = document.getElementById('props');
  if (mode === 'assemblages') return majPropsAssemblage(box);
  const m = modele();
  if (!m) { box.innerHTML = '<div class="vide">Sélectionnez ou créez un modèle.</div>'; return; }
  const b = bornes(m);
  let html = '<div class="champ"><span>Nom</span><input id="p-nom"></div>';

  if (m.type === 'robot') {
    html += '<div class="duo">' +
      champNum('Largeur (carreaux)', 'p-larg', m.largeur, 1, 20) + champSens('p-sens', m.sens) + '</div>' +
      '<div class="champ"><span>Modules</span></div><div id="modules"></div>' +
      '<button class="btn btn-sm" id="p-addmod" style="margin-bottom:9px">+ Module</button>';
  } else if (estCells(m)) {
    html += '<div class="duo">' + champNum('Longueur (carreaux)', 'p-l', b.l, 1, 60) +
            champNum('Largeur (carreaux)', 'p-h', b.h, 1, 60) + '</div>';
    if (m.type === 'tapis') html += '<div class="duo">' + champSens('p-sens', m.sens) +
            champNum('Débit (u/h)', 'p-debit', m.debit, 0, 100000) + '</div>';
  } else {
    html += '<div class="duo">' + champNum('Longueur (cm)', 'p-dl', m.dimCm.l, 10, 400) +
            champNum('Profondeur (cm)', 'p-dp', m.dimCm.p, 10, 400) + '</div>' +
            '<div class="duo">' + champNum('Capacité (unités)', 'p-cap', m.capacite, 0, 999) +
            '<div class="champ"><span>Roulettes</span><select id="p-roul">' +
            '<option value="1"' + (m.roulettes?' selected':'') + '>Oui</option>' +
            '<option value="0"' + (!m.roulettes?' selected':'') + '>Non</option></select></div></div>';
  }
  html += champNum('Hauteur du plan (cm)', 'p-haut', m.hauteurCm, 30, 200) +
    '<div class="row-btns"><button class="btn btn-sm" id="p-dupli">⧉ Dupliquer</button>' +
    '<button class="btn btn-sm btn-danger" id="p-suppr">🗑 Supprimer</button></div>';
  box.innerHTML = html;
  document.getElementById('p-nom').value = m.nom;

  const on = (id, ev, fn) => { const n = document.getElementById(id); if (n) n.addEventListener(ev, fn); };
  on('p-nom', 'input', e => { m.nom = e.target.value; sauver(); majCatalogue(); majPalette(); });
  on('p-haut', 'input', e => { m.hauteurCm = +e.target.value || 90; sauver(); });
  on('p-l', 'input', e => { redimensionner(m, +e.target.value, bornes(m).h); apres(); });
  on('p-h', 'input', e => { redimensionner(m, bornes(m).l, +e.target.value); apres(); });
  on('p-debit', 'input', e => { m.debit = Math.max(0, +e.target.value || 0); apres(); });
  on('p-sens', 'change', e => { m.sens = e.target.value; if (m.type==='robot') majCellsRobot(m); apres(); });
  on('p-larg', 'input', e => { m.largeur = Math.max(1, +e.target.value || 1); majCellsRobot(m); apres(); });
  on('p-dl', 'input', e => { m.dimCm.l = Math.max(10, +e.target.value || 10); apres(); });
  on('p-dp', 'input', e => { m.dimCm.p = Math.max(10, +e.target.value || 10); apres(); });
  on('p-cap', 'input', e => { m.capacite = Math.max(0, +e.target.value || 0); sauver(); majCatalogue(); majMesures(); });
  on('p-roul', 'change', e => { m.roulettes = e.target.value === '1'; apres(); });
  on('p-addmod', 'click', () => {
    m.modules.push({ nom:'M' + (m.modules.length+1), long:4, debit:420 }); majCellsRobot(m); apres();
  });
  on('p-dupli', 'click', () => {
    const c = JSON.parse(JSON.stringify(m)); c.id = uid(m.type); c.nom = m.nom + ' (copie)';
    modeles.splice(modeles.indexOf(m)+1, 0, c); selModele = c.id; sauver(); tout();
  });
  on('p-suppr', 'click', () => {
    if (!confirm('Supprimer « ' + m.nom + ' » ? Il sera retiré des assemblages.')) return;
    modeles = modeles.filter(x => x.id !== m.id);
    assemblages.forEach(a => { a.elements = a.elements.filter(e => e.refId !== m.id); });
    selModele = modeles.length ? modeles[0].id : null; sauver(); tout();
  });
  if (m.type === 'robot') majModules(m);
}
const champNum = (lab, id, v, min, max) =>
  '<div class="champ"><span>' + lab + '</span><input id="' + id + '" type="number" min="' + min + '" max="' + max + '" value="' + v + '"></div>';
const champSens = (id, v) => '<div class="champ"><span>Sens</span><select id="' + id + '">' +
  [['E','→ droite'],['O','← gauche'],['N','↑ haut'],['S','↓ bas']].map(c =>
    '<option value="' + c[0] + '"' + (v===c[0]?' selected':'') + '>' + c[1] + '</option>').join('') + '</select></div>';

function majModules(m) {
  const box = document.getElementById('modules'); if (!box) return;
  box.innerHTML = '';
  m.modules.forEach((mo, i) => {
    const d = document.createElement('div'); d.className = 'module';
    d.innerHTML = '<input type="text" value="" title="Nom"><input type="number" min="1" max="40" value="' + mo.long +
      '" title="Longueur en carreaux"><input type="number" min="0" step="10" value="' + mo.debit +
      '" title="Débit u/h"><button class="sup" title="Retirer">✕</button>';
    const [inNom, inLong, inDeb] = d.querySelectorAll('input');
    inNom.value = mo.nom;
    inNom.addEventListener('input', e => { mo.nom = e.target.value; sauver(); dessiner(); });
    inLong.addEventListener('input', e => { mo.long = Math.max(1, +e.target.value || 1); majCellsRobot(m); apres(); });
    inDeb.addEventListener('input', e => { mo.debit = Math.max(0, +e.target.value || 0); sauver(); majCatalogue(); majMesures(); });
    d.querySelector('.sup').addEventListener('click', () => {
      if (m.modules.length <= 1) { alert('Une ligne garde au moins un module.'); return; }
      m.modules.splice(i, 1); majCellsRobot(m); apres();
    });
    box.appendChild(d);
  });
}

function majPropsAssemblage(box) {
  const a = assemblage();
  if (!a) { box.innerHTML = '<div class="vide">Créez ou sélectionnez un assemblage.</div>'; return; }
  const e = a.elements.find(x => x.id === selElement);
  let html = '<div class="champ"><span>Nom de l\'assemblage</span><input id="a-nom"></div>';
  if (e) {
    const m = modeleDe(e.refId);
    html += '<div class="champ"><span>Élément sélectionné</span><input id="a-elem" readonly></div>' +
      '<div class="duo">' + champNum('X (carreaux)', 'a-x', e.x, -99, 99) + champNum('Y (carreaux)', 'a-y', e.y, -99, 99) + '</div>' +
      '<div class="champ"><span>Orientation</span><select id="a-rot">' +
      [0,90,180,270].map(r => '<option value="' + r + '"' + (e.rot===r?' selected':'') + '>' + r + '°</option>').join('') +
      '</select></div>' +
      '<div class="row-btns"><button class="btn btn-sm" id="a-rot-btn">⟳ Pivoter 90°</button>' +
      '<button class="btn btn-sm btn-danger" id="a-del">🗑 Retirer</button></div>';
  } else {
    html += '<div class="mini-note">Cliquez un élément du plan pour le déplacer ou l\'orienter, ' +
            'ou ajoutez un modèle depuis la palette.</div>';
  }
  html += '<div class="row-btns" style="margin-top:10px">' +
    '<button class="btn btn-sm" id="a-dupli">⧉ Dupliquer</button>' +
    '<button class="btn btn-sm btn-danger" id="a-suppr">🗑 Supprimer l\'assemblage</button></div>';
  box.innerHTML = html;
  document.getElementById('a-nom').value = a.nom;
  if (e) document.getElementById('a-elem').value = (modeleDe(e.refId) || {}).nom || '(modèle supprimé)';

  const on = (id, ev, fn) => { const n = document.getElementById(id); if (n) n.addEventListener(ev, fn); };
  on('a-nom', 'input', ev => { a.nom = ev.target.value; sauver(); majListeAssemblages(); });
  on('a-x', 'input', ev => { e.x = +ev.target.value || 0; apres(); });
  on('a-y', 'input', ev => { e.y = +ev.target.value || 0; apres(); });
  on('a-rot', 'change', ev => { e.rot = +ev.target.value; apres(); });
  on('a-rot-btn', 'click', () => { e.rot = (e.rot + 90) % 360; apres(); });
  on('a-del', 'click', () => { a.elements = a.elements.filter(x => x.id !== e.id); selElement = null; apres(); });
  on('a-dupli', 'click', () => {
    const c = JSON.parse(JSON.stringify(a)); c.id = uid('asm'); c.nom = a.nom + ' (copie)';
    c.elements.forEach(x => x.id = uid('el'));
    assemblages.splice(assemblages.indexOf(a)+1, 0, c); selAssemblage = c.id; selElement = null; sauver(); tout();
  });
  on('a-suppr', 'click', () => {
    if (!confirm('Supprimer « ' + a.nom + ' » ?')) return;
    assemblages = assemblages.filter(x => x.id !== a.id);
    selAssemblage = assemblages.length ? assemblages[0].id : null; selElement = null; sauver(); tout();
  });
}

function majMesures() {
  const box = document.getElementById('mesures');
  if (mode === 'assemblages') {
    const a = assemblage();
    if (!a) { box.innerHTML = '<div class="vide">—</div>'; return; }
    const surf = a.elements.reduce((s, e) => { const m = modeleDe(e.refId); return s + (m ? surfaceM2(m) : 0); }, 0);
    const deb = a.elements.reduce((s, e) => { const m = modeleDe(e.refId); if (!m) return s;
      return s + (m.type === 'tapis' ? (+m.debit||0) : m.type === 'robot' ? debitLigne(m) : 0); }, 0);
    let h = ligne('Éléments', a.elements.length) + ligne('Personnes', personnesAssemblage(a)) +
            ligne('Surface mobilier', surf.toFixed(2) + ' m²');
    if (deb) h += ligne('Débit cumulé', deb + ' u/h');
    box.innerHTML = h; return;
  }
  const m = modele();
  if (!m) { box.innerHTML = '<div class="vide">—</div>'; return; }
  const d = dim(m), n = m.postes.length, surf = surfaceM2(m);
  let h = estCells(m)
    ? ligne('Encombrement', (d.l*CELL_M).toFixed(2) + ' × ' + (d.h*CELL_M).toFixed(2) + ' m') +
      ligne('Carreaux occupés', m.cells.length + ' / ' + (d.l*d.h))
    : ligne('Dimensions', m.dimCm.l + ' × ' + m.dimCm.p + ' cm') +
      ligne('Emprise sur trame', (d.l).toFixed(2) + ' × ' + (d.h).toFixed(2) + ' carreaux');
  h += ligne('Surface', surf.toFixed(2) + ' m²') + ligne('Personnes', n);
  if (n) h += ligne('Surface / personne', (surf/n).toFixed(2) + ' m²');
  if (m.type === 'tapis') {
    h += ligne('Débit', m.debit + ' u/h');
    if (n) h += ligne('Débit / personne', Math.round(m.debit/n) + ' u/h');
  }
  if (m.type === 'robot') {
    h += ligne('Modules', m.modules.length) +
         ligne('Débit de ligne', debitLigne(m) + ' u/h') +
         ligne('Module limitant', (m.modules.reduce((a2,b2) => (+b2.debit||0) < (+a2.debit||0) ? b2 : a2, m.modules[0])||{}).nom || '—');
    if (n) h += ligne('Débit / personne', Math.round(debitLigne(m)/n) + ' u/h');
  }
  if (!estCells(m)) h += ligne('Capacité', m.capacite + ' unités');
  box.innerHTML = h;
}

/* ==========================================================================
 *  5. INTERACTIONS
 * ==========================================================================*/
function ptPlan(ev) {
  const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
  if (!vb || !vb.width) return { x:0, y:0 };
  return { x:(ev.clientX - r.left) * (vb.width / r.width) / zoom,
           y:(ev.clientY - r.top) * (vb.height / r.height) / zoom };
}

svg.addEventListener('click', ev => {
  if (mode === 'assemblages') {
    const g = ev.target.closest && ev.target.closest('.elem');
    selElement = g ? g.dataset.elem : null;
    dessiner(); majProps(); return;
  }
  const m = modele(); if (!m) return;
  const slot = ev.target.closest && ev.target.closest('.poste-slot');

  if (outil === 'postes') {
    if (!slot) return;
    if (estCells(m)) {
      const b = bornes(m);
      const x = +slot.dataset.x + b.x0, y = +slot.dataset.y + b.y0, c = slot.dataset.cote;
      if (aPoste(m, x, y, c)) m.postes = m.postes.filter(p => !(p.x===x && p.y===y && p.cote===c));
      else m.postes.push({ x, y, cote:c });
    } else {
      const c = slot.dataset.cote;
      if (m.postes.some(p => p.cote === c)) m.postes = m.postes.filter(p => p.cote !== c);
      else m.postes.push({ cote:c });
    }
    apres(); return;
  }
  if (!estCells(m) || m.type === 'robot') return;      // géométrie non modifiable au carreau
  const b = bornes(m), p = ptPlan(ev);
  const x = Math.floor(p.x) - MARGE + b.x0, y = Math.floor(p.y) - MARGE + b.y0;
  if (outil === 'ajouter' && !occupe(m, x, y)) { m.cells.push(cle(x, y)); apres(); }
  else if (outil === 'retirer' && occupe(m, x, y) && m.cells.length > 1) {
    m.cells = m.cells.filter(k => k !== cle(x, y));
    const libres = bordsLibres(m);
    m.postes = m.postes.filter(p2 => libres.some(b2 => b2.x===p2.x && b2.y===p2.y && b2.cote===p2.cote));
    apres();
  }
});

/* glisser un élément d'assemblage */
let drag = null;
svg.addEventListener('pointerdown', ev => {
  if (mode !== 'assemblages') return;
  const g = ev.target.closest && ev.target.closest('.elem'); if (!g) return;
  const a = assemblage(); if (!a) return;
  const e = a.elements.find(x => x.id === g.dataset.elem); if (!e) return;
  selElement = e.id;
  drag = { e, p0:ptPlan(ev), x0:e.x, y0:e.y };
  svg.setPointerCapture(ev.pointerId);
});
svg.addEventListener('pointermove', ev => {
  if (!drag) return;
  const p = ptPlan(ev);
  drag.e.x = Math.round((drag.x0 + p.x - drag.p0.x) / PAS) * PAS;
  drag.e.y = Math.round((drag.y0 + p.y - drag.p0.y) / PAS) * PAS;
  dessiner();
});
const finDrag = () => { if (drag) { drag = null; apres(); } };
svg.addEventListener('pointerup', finDrag);
svg.addEventListener('pointercancel', finDrag);

window.addEventListener('keydown', ev => {
  if (mode !== 'assemblages' || !selElement) return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test((ev.target.tagName || ''))) return;
  const a = assemblage(); if (!a) return;
  const e = a.elements.find(x => x.id === selElement); if (!e) return;
  if (ev.key === 'r' || ev.key === 'R') { e.rot = (e.rot + 90) % 360; apres(); }
  if (ev.key === 'Delete' || ev.key === 'Backspace') {
    ev.preventDefault(); a.elements = a.elements.filter(x => x.id !== e.id); selElement = null; apres();
  }
});

/* ==========================================================================
 *  6. BARRES ET MODES
 * ==========================================================================*/
const AIDES = {
  postes:  'Cliquez un bord libre pour placer ou retirer une personne.',
  ajouter: 'Cliquez une case pour agrandir le meuble (formes en L, U, îlots).',
  retirer: 'Cliquez un carreau du meuble pour le retirer.'
};
document.querySelectorAll('.outil[data-outil]').forEach(b => b.addEventListener('click', () => {
  outil = b.dataset.outil;
  document.querySelectorAll('.outil[data-outil]').forEach(x => x.classList.toggle('on', x === b));
  document.getElementById('aide-outil').textContent = AIDES[outil];
}));

function setMode(m) {
  mode = m;
  document.querySelectorAll('.onglet').forEach(o => o.classList.toggle('on', o.dataset.mode === m));
  document.getElementById('bloc-modeles').hidden = (m !== 'modeles');
  document.getElementById('bloc-assemblages').hidden = (m !== 'assemblages');
  document.getElementById('outils').hidden = (m !== 'modeles');
  document.getElementById('outils-assemblage').hidden = (m !== 'assemblages');
  document.getElementById('aide-outil').textContent = (m === 'modeles') ? AIDES[outil]
    : 'Glissez un élément pour le déplacer · touche R pour pivoter · Suppr pour retirer.';
  document.getElementById('legende').innerHTML = (m === 'modeles')
    ? '1 carreau = <b>50 × 50 cm</b> · trait fort tous les <b>2 m</b>'
    : '1 carreau = <b>50 × 50 cm</b> · pose au <b>quart de mètre</b> · les stockages gardent leurs dimensions réelles';
  tout();
}
document.querySelectorAll('.onglet').forEach(o => o.addEventListener('click', () => setMode(o.dataset.mode)));

document.querySelectorAll('[data-neuf]').forEach(b => b.addEventListener('click', () => {
  const m = nouveauModele(b.dataset.neuf);
  if (m.type === 'robot') majCellsRobot(m);
  modeles.push(m); selModele = m.id; sauver(); setMode('modeles');
}));
document.getElementById('new-assemblage').addEventListener('click', () => {
  const a = { id:uid('asm'), nom:'Assemblage ' + (assemblages.length + 1), elements:[] };
  assemblages.push(a); selAssemblage = a.id; selElement = null; sauver(); tout();
});
document.getElementById('btn-rot').addEventListener('click', () => {
  const a = assemblage(); if (!a || !selElement) return;
  const e = a.elements.find(x => x.id === selElement); if (e) { e.rot = (e.rot + 90) % 360; apres(); }
});
document.getElementById('btn-suppr-elem').addEventListener('click', () => {
  const a = assemblage(); if (!a || !selElement) return;
  a.elements = a.elements.filter(x => x.id !== selElement); selElement = null; apres();
});
document.getElementById('zoom-in').addEventListener('click', () => { zoom = Math.min(90, zoom+6); dessiner(); });
document.getElementById('zoom-out').addEventListener('click', () => { zoom = Math.max(12, zoom-6); dessiner(); });
document.getElementById('zoom-fit').addEventListener('click', () => { zoom = 34; dessiner(); });

/* ==========================================================================
 *  7. IMPORT / EXPORT
 * ==========================================================================*/
const donneesExport = () => ({ format:'ory-postes', version:2, carreauCm:CELL_CM,
  avertissement:'Géométrie et affectations. Débits et dimensions des stockages sont des hypothèses, pas des mesures du site.',
  modeles, assemblages });

async function exporter() {
  const texte = JSON.stringify(donneesExport(), null, 2);
  let dl = null;
  try { dl = (window.claude && window.claude.use) ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
  if (dl) {
    try { await dl.save({ filename:'ory-postes.json', data:texte }); }
    catch (e) {
      if (e && e.code === 'declined') return;
      alert('Enregistrement impossible (' + ((e && e.code) || 'erreur') + '). Utilisez « Copier le JSON ».');
    }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texte], { type:'application/json' }));
  a.download = 'ory-postes.json'; a.click();
}
document.getElementById('btn-export').addEventListener('click', exporter);

document.getElementById('btn-copier').addEventListener('click', async () => {
  const texte = JSON.stringify(donneesExport(), null, 2), btn = document.getElementById('btn-copier');
  const dire = s => { btn.textContent = s; setTimeout(() => { btn.textContent = '📋 Copier le JSON'; }, 1600); };
  try { await navigator.clipboard.writeText(texte); dire('✓ Copié'); }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = texte; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); dire('✓ Copié'); } catch (e2) { dire('Copie impossible'); }
    ta.remove();
  }
});

document.getElementById('btn-import').addEventListener('click', e => e.stopPropagation());
document.getElementById('btn-import').addEventListener('change', ev => {
  const f = ev.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onerror = () => { alert('Lecture impossible. Bibliothèque inchangée.'); ev.target.value = ''; };
  rd.onload = () => {
    try {
      const d = JSON.parse(rd.result);
      const liste = Array.isArray(d) ? d : (d && d.modeles);
      if (!Array.isArray(liste) || !liste.length) throw new Error('aucun modèle');
      const bons = liste.filter(valide);
      if (!bons.length) throw new Error('modèles invalides');
      if (d && d.carreauCm && d.carreauCm !== CELL_CM)
        alert('Attention : fichier en carreaux de ' + d.carreauCm + ' cm, l\'éditeur utilise ' + CELL_CM + ' cm.');
      modeles = bons;
      modeles.forEach(m => { if (m.type === 'robot') majCellsRobot(m); });
      const asm = (d && Array.isArray(d.assemblages)) ? d.assemblages.filter(valideAssemblage) : [];
      const ids = modeles.map(m => m.id);
      asm.forEach(a => { a.elements = a.elements.filter(e => ids.indexOf(e.refId) >= 0); });
      assemblages = asm;
      selModele = modeles[0].id; selAssemblage = assemblages.length ? assemblages[0].id : null; selElement = null;
      tout();
      alert(bons.length + ' modèle(s) et ' + assemblages.length + ' assemblage(s) importés' +
        (bons.length < liste.length ? ', ' + (liste.length - bons.length) + ' ignoré(s).' : '.'));
    } catch (err) { alert('Fichier illisible : ' + err.message + '. Bibliothèque inchangée.'); }
    ev.target.value = '';
  };
  rd.readAsText(f);
});

/* ==========================================================================
 *  8. DÉMARRAGE
 * ==========================================================================*/
function apres() { sauver(); dessiner(); majCatalogue(); majListeAssemblages(); majMesures(); majTotaux(); majProps(); }
function tout() {
  dessiner(); majCatalogue(); majListeAssemblages(); majPalette(); majProps(); majMesures(); majTotaux();
}

if (!charger()) {
  modeles = [nouveauModele('table'), nouveauModele('tapis'), nouveauModele('robot'),
             nouveauModele('desserte'), nouveauModele('trolley')];
  modeles.forEach(m => { if (m.type === 'robot') majCellsRobot(m); });
  assemblages = [];
}
selModele = modeles[0].id;
selAssemblage = assemblages.length ? assemblages[0].id : null;
document.getElementById('aide-outil').textContent = AIDES.postes;
tout();

window.__postes = { get modeles(){return modeles;}, get assemblages(){return assemblages;},
  tourne, dim, bordsLibres, valide, debitLigne, CELL_CM };

// Mode intégré : réutiliser une copie du modèle/assemblage, sans modifier la bibliothèque.
if(new URLSearchParams(location.search).get('integrated')==='1'&&window.parent!==window){
  const button=document.createElement('button');button.id='btn-place-service';button.className='btn btn-primaire';button.textContent='Placer dans le service';
  button.addEventListener('click',()=>{
    let payload;
    if(mode==='assemblages'){
      const a=assemblage();if(!a||!a.elements.length){alert('Sélectionnez un assemblage non vide.');return;}
      payload=a.elements.map(e=>({model:modeleDe(e.refId),x:e.x,y:e.y,rot:e.rot||0}));
    }else{const m=modele();if(!m)return;payload=[{model:m,x:0,y:0,rot:0}];}
    window.parent.postMessage({type:'ory-place-selection',payload},location.protocol==='file:'||location.origin==='null'?'*':location.origin);
  });
  document.querySelector('.entete-droite').prepend(button);
}

})();

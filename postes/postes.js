/* ============================================================================
 *  ORY — Éditeur de postes de travail
 *  Trame : 1 carreau = 50 × 50 cm. Toute géométrie est exprimée en carreaux,
 *  ce qui permettra plus tard de composer le plan de l'unité avec ces modèles.
 *
 *  Un modèle = un ensemble de carreaux occupés (forme libre, pas seulement un
 *  rectangle) + des postes de travail posés sur les bords libres.
 *  Deux familles : 'table' (établi) et 'tapis' (chaîne, avec sens et débit).
 * ==========================================================================*/
(function () {
'use strict';

const CELL_CM = 50;                 // côté d'un carreau, en centimètres
const CELL_M  = CELL_CM / 100;
const CLE = 'ory-postes-v1';
const COTES = { N:[0,-1], S:[0,1], E:[1,0], O:[-1,0] };

/* ==========================================================================
 *  1. MODÈLE DE DONNÉES
 * ==========================================================================*/
let biblio = [];      // liste de modèles
let selId = null;     // modèle sélectionné
let outil = 'postes'; // postes | ajouter | retirer
let zoom = 34;        // pixels par carreau

const uid = p => p + '_' + Date.now().toString(36) + '_' + Math.floor(Math.random()*1e4).toString(36);
const cle = (x, y) => x + ',' + y;
const decle = k => k.split(',').map(Number);

/* Crée un rectangle de carreaux. */
function rectCells(l, h) {
  const c = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) c.push(cle(x, y));
  return c;
}

function nouveauModele(type) {
  const estTapis = type === 'tapis';
  const l = estTapis ? 10 : 4, h = estTapis ? 2 : 2;
  const m = {
    id: uid(type),
    type,
    nom: estTapis ? 'Chaîne ' + (compte('tapis') + 1) : 'Table ' + (compte('table') + 1),
    cells: rectCells(l, h),
    postes: [],                       // { x, y, cote }
    hauteurCm: estTapis ? 90 : 90,    // hauteur du plan de travail
    sens: 'E',                        // chaînes : sens d'avancement
    debit: estTapis ? 300 : 0,        // unités/heure (hypothèse)
    note: ''
  };
  // postes par défaut : de part et d'autre
  if (estTapis) {
    for (let x = 1; x < l; x += 3) { m.postes.push({ x, y:0, cote:'N' }); m.postes.push({ x:x+1, y:h-1, cote:'S' }); }
  } else {
    m.postes.push({ x:0, y:0, cote:'N' }, { x:l-1, y:h-1, cote:'S' });
  }
  return m;
}
function compte(type) { return biblio.filter(m => m.type === type).length; }
function modele() { return biblio.find(m => m.id === selId) || null; }

/* --- géométrie ------------------------------------------------------------ */
function bornes(m) {
  const pts = m.cells.map(decle);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
  return { x0, y0, l: Math.max.apply(null, xs) - x0 + 1, h: Math.max.apply(null, ys) - y0 + 1 };
}
function occupe(m, x, y) { return m.cells.includes(cle(x, y)); }
/* Bords libres : un côté de carreau sans voisin occupé. */
function bordsLibres(m) {
  const out = [];
  m.cells.forEach(k => {
    const [x, y] = decle(k);
    Object.keys(COTES).forEach(c => {
      const [dx, dy] = COTES[c];
      if (!occupe(m, x + dx, y + dy)) out.push({ x, y, cote:c });
    });
  });
  return out;
}
function aPoste(m, x, y, cote) { return m.postes.some(p => p.x === x && p.y === y && p.cote === cote); }

/* Remet la forme à zéro en rectangle (utilisé par les champs largeur/longueur). */
function redimensionner(m, l, h) {
  l = Math.max(1, Math.min(60, l | 0)); h = Math.max(1, Math.min(60, h | 0));
  m.cells = rectCells(l, h);
  m.postes = m.postes.filter(p => p.x < l && p.y < h && bordsLibres(m).some(b => b.x===p.x && b.y===p.y && b.cote===p.cote));
}

/* ==========================================================================
 *  2. PERSISTANCE
 * ==========================================================================*/
function sauver() { try { localStorage.setItem(CLE, JSON.stringify(biblio)); } catch (e) { /* indisponible */ } }
function charger() {
  try {
    const b = JSON.parse(localStorage.getItem(CLE) || 'null');
    if (Array.isArray(b) && b.length) { biblio = b.filter(valide); return true; }
  } catch (e) { /* illisible */ }
  return false;
}
function valide(m) {
  return m && typeof m.id === 'string' && (m.type === 'table' || m.type === 'tapis')
    && Array.isArray(m.cells) && m.cells.length && Array.isArray(m.postes);
}

/* ==========================================================================
 *  3. RENDU
 * ==========================================================================*/
const NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('plan');
function el(t, a, kids) {
  const n = document.createElementNS(NS, t);
  for (const k in (a || {})) n.setAttribute(k, a[k]);
  (kids || []).forEach(c => n.appendChild(c));
  return n;
}
const MARGE = 3;   // carreaux de marge autour du meuble

function dessiner() {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const m = modele();
  if (!m) { svg.removeAttribute('viewBox'); return; }

  const b = bornes(m);
  const L = b.l + MARGE * 2, H = b.h + MARGE * 2;      // aire de travail, en carreaux
  const W = L * zoom, Ht = H * zoom;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + Ht);
  svg.setAttribute('width', W); svg.setAttribute('height', Ht);
  // coordonnées : carreau (x,y) du modèle -> pixels
  const PX = x => (x - b.x0 + MARGE) * zoom;
  const PY = y => (y - b.y0 + MARGE) * zoom;

  // --- trame ---
  const g = el('g');
  for (let i = 0; i <= L; i++) {
    const fort = i % 4 === 0;                            // 4 carreaux = 2 m
    g.appendChild(el('line', { class:'trame-' + (fort?'maj':'min'), x1:i*zoom, y1:0, x2:i*zoom, y2:Ht }));
  }
  for (let j = 0; j <= H; j++) {
    const fort = j % 4 === 0;
    g.appendChild(el('line', { class:'trame-' + (fort?'maj':'min'), x1:0, y1:j*zoom, x2:W, y2:j*zoom }));
  }
  svg.appendChild(g);

  // --- règles en mètres ---
  const gr = el('g');
  for (let i = 0; i <= L; i += 4) {
    const t = el('text', { class:'regle-txt', x:i*zoom + 3, y:12 }); t.textContent = (i*CELL_M).toFixed(0) + ' m'; gr.appendChild(t);
  }
  for (let j = 4; j <= H; j += 4) {
    const t = el('text', { class:'regle-txt', x:3, y:j*zoom - 4 }); t.textContent = (j*CELL_M).toFixed(0) + ' m'; gr.appendChild(t);
  }
  svg.appendChild(gr);

  // --- carreaux du meuble ---
  const gm = el('g');
  const classeFond = m.type === 'tapis' ? 'meuble-tapis' : 'meuble-table';
  m.cells.forEach(k => {
    const [x, y] = decle(k);
    gm.appendChild(el('rect', { class:classeFond, x:PX(x), y:PY(y), width:zoom, height:zoom }));
  });
  svg.appendChild(gm);

  // --- chevrons de sens (chaînes) ---
  if (m.type === 'tapis') {
    const gc = el('g');
    const [dx, dy] = COTES[m.sens] || COTES.E;
    m.cells.forEach(k => {
      const [x, y] = decle(k);
      const cx = PX(x) + zoom/2, cy = PY(y) + zoom/2, r = zoom * 0.22;
      // chevron orienté selon le sens
      const p1 = [cx - dy*r - dx*r, cy + dx*r - dy*r];
      const p2 = [cx + dx*r, cy + dy*r];
      const p3 = [cx + dy*r - dx*r, cy - dx*r - dy*r];
      gc.appendChild(el('path', { class:'chevron',
        d:'M ' + p1[0] + ' ' + p1[1] + ' L ' + p2[0] + ' ' + p2[1] + ' L ' + p3[0] + ' ' + p3[1] }));
    });
    svg.appendChild(gc);
  }

  // --- contour (union des carreaux : on ne trace que les bords libres) ---
  const gco = el('g');
  bordsLibres(m).forEach(({ x, y, cote }) => {
    const X = PX(x), Y = PY(y);
    const seg = { N:[X,Y,X+zoom,Y], S:[X,Y+zoom,X+zoom,Y+zoom], O:[X,Y,X,Y+zoom], E:[X+zoom,Y,X+zoom,Y+zoom] }[cote];
    gco.appendChild(el('line', { class:'contour' + (m.type==='tapis'?' contour-tapis':''),
      x1:seg[0], y1:seg[1], x2:seg[2], y2:seg[3] }));
  });
  svg.appendChild(gco);

  // --- zones cliquables + personnes ---
  const gp = el('g');
  bordsLibres(m).forEach(({ x, y, cote }) => {
    const X = PX(x), Y = PY(y), e = zoom * 0.34;
    // rectangle de saisie, à l'extérieur du carreau
    const zone = { N:[X, Y-e, zoom, e], S:[X, Y+zoom, zoom, e], O:[X-e, Y, e, zoom], E:[X+zoom, Y, e, zoom] }[cote];
    const slot = el('rect', { class:'poste-slot', x:zone[0], y:zone[1], width:zone[2], height:zone[3],
      'data-x':x, 'data-y':y, 'data-cote':cote });
    slot.appendChild(el('title', {}, [])).textContent = aPoste(m,x,y,cote) ? 'Retirer la personne' : 'Ajouter une personne';
    gp.appendChild(slot);
    if (aPoste(m, x, y, cote)) gp.appendChild(personne(X, Y, cote, zoom));
  });
  svg.appendChild(gp);
}

/* Silhouette vue de dessus : épaules (ellipse large en travers) + tête,
 * tournée vers le meuble. */
function personne(X, Y, cote, z) {
  const d = z * 0.46;                       // recul par rapport au bord
  const cx = X + z/2 + (cote==='E' ? d : cote==='O' ? -d : 0);
  const cy = Y + z/2 + (cote==='S' ? d : cote==='N' ? -d : 0);
  const horizontal = (cote === 'N' || cote === 'S');
  const g = el('g');
  g.appendChild(el('ellipse', { class:'poste-corps', cx, cy,
    rx: z * (horizontal ? 0.30 : 0.19), ry: z * (horizontal ? 0.19 : 0.30) }));
  g.appendChild(el('circle', { class:'poste-tete', cx, cy, r:z*0.135 }));
  return g;
}

/* ==========================================================================
 *  4. PANNEAUX
 * ==========================================================================*/
function majCatalogue() {
  const box = document.getElementById('catalogue');
  box.innerHTML = '';
  if (!biblio.length) { box.innerHTML = '<div class="mini-note">Bibliothèque vide. Créez une table ou une chaîne.</div>'; return; }
  biblio.forEach(m => {
    const b = bornes(m);
    const d = document.createElement('div');
    d.className = 'cat-item' + (m.id === selId ? ' on' : '');
    d.innerHTML = '<span class="cat-ico">' + (m.type === 'tapis' ? '🏭' : '🪵') + '</span>' +
      '<span class="cat-txt"><span class="cat-nom"></span>' +
      '<span class="cat-meta">' + (b.l*CELL_M).toFixed(1) + ' × ' + (b.h*CELL_M).toFixed(1) + ' m · ' +
      m.postes.length + ' pers.' + (m.type === 'tapis' ? ' · ' + m.debit + ' u/h' : '') + '</span></span>';
    d.querySelector('.cat-nom').textContent = m.nom;   // pas d'injection HTML
    d.addEventListener('click', () => { selId = m.id; tout(); });
    box.appendChild(d);
  });
}

function majTotaux() {
  const nb = biblio.length;
  const pers = biblio.reduce((s, m) => s + m.postes.length, 0);
  const surf = biblio.reduce((s, m) => s + m.cells.length * CELL_M * CELL_M, 0);
  document.getElementById('totaux').innerHTML =
    ligne('Modèles', nb) + ligne('Personnes', pers) + ligne('Surface cumulée', surf.toFixed(2) + ' m²');
}
const ligne = (k, v) => '<div class="mesure"><span>' + k + '</span><b>' + v + '</b></div>';

function majProps() {
  const box = document.getElementById('props'), m = modele();
  if (!m) { box.innerHTML = '<div class="mini-note">Sélectionnez ou créez un modèle.</div>'; return; }
  const b = bornes(m);
  box.innerHTML =
    '<div class="champ"><span>Nom</span><input id="p-nom"></div>' +
    '<div class="duo">' +
      '<div class="champ"><span>Longueur (carreaux)</span><input id="p-l" type="number" min="1" max="60" value="' + b.l + '"></div>' +
      '<div class="champ"><span>Largeur (carreaux)</span><input id="p-h" type="number" min="1" max="60" value="' + b.h + '"></div>' +
    '</div>' +
    '<div class="champ"><span>Hauteur du plan (cm)</span><input id="p-haut" type="number" min="40" max="160" value="' + m.hauteurCm + '"></div>' +
    (m.type === 'tapis'
      ? '<div class="duo">' +
          '<div class="champ"><span>Sens</span><select id="p-sens">' +
            ['E','O','N','S'].map(c => '<option value="' + c + '"' + (m.sens===c?' selected':'') + '>' +
              ({E:'→ vers la droite',O:'← vers la gauche',N:'↑ vers le haut',S:'↓ vers le bas'})[c] + '</option>').join('') +
          '</select></div>' +
          '<div class="champ"><span>Débit (u/h)</span><input id="p-debit" type="number" min="0" step="10" value="' + m.debit + '"></div>' +
        '</div>'
      : '') +
    '<div class="row-btns" style="margin-top:4px">' +
      '<button class="btn btn-sm" id="p-dupli">⧉ Dupliquer</button>' +
      '<button class="btn btn-sm btn-danger" id="p-suppr">🗑 Supprimer</button>' +
    '</div>';
  document.getElementById('p-nom').value = m.nom;

  const maj = (id, fn) => { const n = document.getElementById(id); if (n) n.addEventListener('input', fn); };
  maj('p-nom',   e => { m.nom = e.target.value; sauver(); majCatalogue(); });
  maj('p-haut',  e => { m.hauteurCm = +e.target.value || 90; sauver(); });
  maj('p-l',     e => { redimensionner(m, +e.target.value, bornes(m).h); apres(); });
  maj('p-h',     e => { redimensionner(m, bornes(m).l, +e.target.value); apres(); });
  maj('p-debit', e => { m.debit = Math.max(0, +e.target.value || 0); sauver(); majCatalogue(); majMesures(); });
  const s = document.getElementById('p-sens');
  if (s) s.addEventListener('change', e => { m.sens = e.target.value; sauver(); dessiner(); });

  document.getElementById('p-dupli').addEventListener('click', () => {
    const copie = JSON.parse(JSON.stringify(m));
    copie.id = uid(m.type); copie.nom = m.nom + ' (copie)';
    biblio.splice(biblio.indexOf(m) + 1, 0, copie); selId = copie.id; tout();
  });
  document.getElementById('p-suppr').addEventListener('click', () => {
    if (!confirm('Supprimer « ' + m.nom + ' » ?')) return;
    biblio = biblio.filter(x => x.id !== m.id);
    selId = biblio.length ? biblio[0].id : null; tout();
  });
}

function majMesures() {
  const box = document.getElementById('mesures'), m = modele();
  if (!m) { box.innerHTML = '<div class="mini-note">—</div>'; return; }
  const b = bornes(m);
  const surface = m.cells.length * CELL_M * CELL_M;
  const emprise = b.l * b.h * CELL_M * CELL_M;
  const n = m.postes.length;
  let html =
    ligne('Encombrement', (b.l*CELL_M).toFixed(2) + ' × ' + (b.h*CELL_M).toFixed(2) + ' m') +
    ligne('Carreaux occupés', m.cells.length + ' / ' + (b.l*b.h)) +
    ligne('Surface de travail', surface.toFixed(2) + ' m²') +
    ligne('Emprise au sol', emprise.toFixed(2) + ' m²') +
    ligne('Personnes', n);
  if (n) html += ligne('Surface / personne', (surface / n).toFixed(2) + ' m²');
  if (m.type === 'tapis') {
    html += ligne('Débit', m.debit + ' u/h');
    if (n) html += ligne('Débit / personne', Math.round(m.debit / n) + ' u/h');
    html += ligne('Longueur de chaîne', (b.l*CELL_M).toFixed(2) + ' m');
  }
  box.innerHTML = html;
}

function apres() { sauver(); dessiner(); majCatalogue(); majMesures(); majTotaux(); }
function tout() { dessiner(); majCatalogue(); majProps(); majMesures(); majTotaux(); }

/* ==========================================================================
 *  5. INTERACTIONS SUR LE PLAN
 * ==========================================================================*/
function cellDepuisEvenement(e) {
  const m = modele(); if (!m) return null;
  const b = bornes(m), r = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  const sx = vb.width / r.width, sy = vb.height / r.height;
  const px = (e.clientX - r.left) * sx, py = (e.clientY - r.top) * sy;
  return { x: Math.floor(px / zoom) + b.x0 - MARGE, y: Math.floor(py / zoom) + b.y0 - MARGE };
}

svg.addEventListener('click', e => {
  const m = modele(); if (!m) return;

  // outil « personnes » : clic sur un bord libre
  const slot = e.target.closest && e.target.closest('.poste-slot');
  if (outil === 'postes') {
    if (!slot) return;
    const x = +slot.dataset.x, y = +slot.dataset.y, c = slot.dataset.cote;
    if (aPoste(m, x, y, c)) m.postes = m.postes.filter(p => !(p.x===x && p.y===y && p.cote===c));
    else m.postes.push({ x, y, cote:c });
    apres(); return;
  }

  // outils « carreaux »
  const c = cellDepuisEvenement(e); if (!c) return;
  if (outil === 'ajouter') {
    if (!occupe(m, c.x, c.y)) { m.cells.push(cle(c.x, c.y)); apres(); }
  } else if (outil === 'retirer') {
    if (occupe(m, c.x, c.y) && m.cells.length > 1) {
      m.cells = m.cells.filter(k => k !== cle(c.x, c.y));
      // les postes orphelins disparaissent
      const libres = bordsLibres(m);
      m.postes = m.postes.filter(p => libres.some(b => b.x===p.x && b.y===p.y && b.cote===p.cote));
      apres();
    }
  }
});

/* ==========================================================================
 *  6. BARRE D'OUTILS, THÈME, IMPORT / EXPORT
 * ==========================================================================*/
const AIDES = {
  postes: 'Cliquez un bord libre du meuble pour y placer ou retirer une personne.',
  ajouter: 'Cliquez une case de la trame pour agrandir le meuble (formes en L, U, îlots…).',
  retirer: 'Cliquez un carreau du meuble pour le retirer.'
};
document.querySelectorAll('.outil').forEach(b => b.addEventListener('click', () => {
  outil = b.dataset.outil;
  document.querySelectorAll('.outil').forEach(x => x.classList.toggle('on', x === b));
  document.getElementById('aide-outil').textContent = AIDES[outil];
  svg.style.cursor = outil === 'postes' ? 'pointer' : 'crosshair';
}));
document.getElementById('aide-outil').textContent = AIDES.postes;

document.getElementById('zoom-in').addEventListener('click', () => { zoom = Math.min(90, zoom + 6); dessiner(); });
document.getElementById('zoom-out').addEventListener('click', () => { zoom = Math.max(14, zoom - 6); dessiner(); });
document.getElementById('zoom-fit').addEventListener('click', () => { zoom = 34; dessiner(); });

document.getElementById('new-table').addEventListener('click', () => { const m = nouveauModele('table'); biblio.push(m); selId = m.id; tout(); });
document.getElementById('new-tapis').addEventListener('click', () => { const m = nouveauModele('tapis'); biblio.push(m); selId = m.id; tout(); });

function appliquerTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  document.getElementById('btn-theme').textContent = t === 'dark' ? '☀️' : '🌙';
  try { localStorage.setItem('orly-theme', t); } catch (e) { /* indisponible */ }
}
document.getElementById('btn-theme').addEventListener('click', () => {
  appliquerTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});
let themeInitial = 'light';
try { themeInitial = localStorage.getItem('orly-theme') || 'light'; } catch (e) { /* indisponible */ }
appliquerTheme(themeInitial);

document.getElementById('btn-export').addEventListener('click', () => {
  const data = { format:'ory-postes', version:1, carreauCm:CELL_CM,
    avertissement:'Géométrie et affectations. Les débits sont des hypothèses, pas des mesures du site.',
    modeles:biblio };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'ory-postes.json'; a.click();
});

document.getElementById('btn-import').addEventListener('click', e => e.stopPropagation());
document.getElementById('btn-import').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onerror = () => { alert('Lecture impossible. Bibliothèque inchangée.'); e.target.value = ''; };
  rd.onload = () => {
    try {
      const d = JSON.parse(rd.result);
      const liste = Array.isArray(d) ? d : (d && d.modeles);
      if (!Array.isArray(liste) || !liste.length) throw new Error('aucun modèle');
      const bons = liste.filter(valide);
      if (!bons.length) throw new Error('modèles invalides');
      if (d && d.carreauCm && d.carreauCm !== CELL_CM)
        alert('Attention : fichier en carreaux de ' + d.carreauCm + ' cm, l\'éditeur utilise ' + CELL_CM + ' cm.');
      biblio = bons; selId = biblio[0].id; tout();
      alert(bons.length + ' modèle(s) importé(s)' + (bons.length < liste.length ? ', ' + (liste.length - bons.length) + ' ignoré(s).' : '.'));
    } catch (err) { alert('Fichier illisible : ' + err.message + '. Bibliothèque inchangée.'); }
    e.target.value = '';
  };
  rd.readAsText(f);
});

/* ==========================================================================
 *  7. DÉMARRAGE
 * ==========================================================================*/
if (!charger()) {
  biblio = [nouveauModele('table'), nouveauModele('tapis')];
}
selId = biblio[0].id;
tout();

// exposé pour les tests
window.__postes = { get biblio() { return biblio; }, bornes, bordsLibres, valide, CELL_CM };

})();

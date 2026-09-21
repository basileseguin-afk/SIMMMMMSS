/* ============================================================================
 *  Newrest Orly — Simulation des flux de production (interface + rendu)
 *  Les positions et libellés des zones proviennent du plan réel de l'unité.
 *  Le plan lui-même est CONFIDENTIEL et n'est pas dans ce dépôt public :
 *  déposez ses tuiles dans `plan-prive/` en local (dossier non suivi par Git).
 *
 *  Le calcul est fait par `moteur/orly.js` sur le moteur à événements
 *  discrets (`moteur/noyau.js`, `mesure.js`, `ressources.js`) : personnes
 *  occupées par des lots, robot à une place, tampons par atelier. Ce fichier
 *  ne contient plus que l'interface, le plan et l'animation.
 *  ==========================================================================*/
(function () {
'use strict';
const {escapeHTML, serviceMetrics, flightStatus, parseFlights} = window.OrlyUI;
const Orly = window.MoteurOrly;
const NON_MODELISES = new Set(['magasin','bobduty','handling','quais']);
const CFG_ETP = Orly.HEURES_PAR_ETP;   // 1 ETP = 7 h, convention de la feuille de route
let activePanel = 'suivi', activeView = 'plan', dataSource = 'Jeu de démonstration';
let frameId = null, pendingTime = 0, runConfig = null;

/* ==========================================================================
 *  1. PARAMÈTRES — valeurs par défaut portées par le modèle
 * ==========================================================================*/
const CFG = JSON.parse(JSON.stringify(Orly.CFG_DEFAUT));

/* ==========================================================================
 *  2. PLAN RÉEL D'ORLY
 *     Le fond est le plan d'architecte, découpé en 12 tuiles, chargé depuis
 *     `plan-prive/` — absent du dépôt. Sans lui, l'application fonctionne :
 *     seules les zones sont dessinées.
 *     Les coordonnées ci-dessous sont en pixels du plan d'origine :
 *     elles proviennent des ancrages du fichier (colonne = 82 px,
 *     ligne = 14,4 pt = 19,2 px), donc zones et fond sont alignés par
 *     construction.
 * ==========================================================================*/
// Le plan est confidentiel : il n'est pas versionné. Déposez ses tuiles ici.
const DOSSIER_PLAN = 'plan-prive';

const TILES = [
  { n: 1, x:    0.0, y:   14.7, w:1833.9, h:792.6 }, { n: 2, x:1826.7, y:   0.0, w:1625.9, h:821.5 },
  { n: 3, x: 3437.2, y:   21.9, w:1884.1, h:794.5 }, { n: 4, x:  24.0, y: 799.2, w:1606.0, h:741.4 },
  { n: 5, x: 1630.0, y:  803.2, w:1843.3, h:757.2 }, { n: 6, x:3470.7, y: 793.2, w:1607.3, h:763.1 },
  { n: 7, x:   12.0, y: 1548.0, w:1613.5, h:765.1 }, { n: 8, x:1578.0, y:1545.6, w:1848.0, h:762.5 },
  { n: 9, x: 3434.0, y: 1557.2, w:1882.0, h:754.9 }, { n:10, x:   0.0, y:2310.0, w:1622.0, h:763.1 },
  { n:11, x: 1570.0, y: 2302.8, w:1866.0, h:769.3 }, { n:12, x:3426.0, y:2304.0, w:1894.0, h:750.9 }
];
// Cadrage sur le bâtiment
const VUE = { x:300, y:320, w:4340, h:2140 };

/* Ateliers = stations de simulation (clé = id moteur).
 * `reel:true` => boîte reprise telle quelle des annotations du plan.
 * `approx:true` => emplacement estimé, à confirmer (zone non annotée). */
const ZONES = {
  quais:    { nom:'QUAIS · RÉCEPTION', x:700, y:330, w:1960, h:180, sink:true, approx:true,
              sous:['camions : départ trolleys / retour vols sales'] },
  handling: { nom:'CF DÉPART FOOD', x:1528, y:673.1, w:808.6, h:230.3, buffer:true, reel:true,
              sous:['trolleys prêts → camion'] },
  appros:   { nom:'RÉCEPTION / APPROS', x:2680, y:560, w:640, h:250, staff:'appros', approx:true,
              sous:['réceptions & commandes'] },
  armement: { nom:'ARMEMENT', x:3065.8, y:755.1, w:317.9, h:296, staff:'armement', reel:true,
              sous:['trolleys non-food'] },
  prepa:    { nom:'MONTAGE', x:2180, y:900, w:400, h:350, staff:'prepa', robot:true, reel:true,
              sous:['dressage plateaux','montage trolleys'] },
  magasin:  { nom:'MAGASIN', x:4009.3, y:1052.8, w:486.7, h:140, staff:'magasin', reel:true,
              sous:['produit compagnie'] },
  dotation: { nom:'DOTATION', x:1156, y:1387.9, w:348, h:629.9, staff:'dotation', reel:true,
              sous:['couverts + serviettes','assiettes propres'] },
  decontam: { nom:'LÉGUMERIE', x:2555.1, y:1446.3, w:165.7, h:115.2, staff:'decontam', reel:true,
              sous:['lavage / décontamination'] },
  bobduty:  { nom:'DUTY FREE', x:787.3, y:1519.5, w:348, h:492, staff:'bobduty', reel:true,
              sous:['buy-on-board'] },
  cuisine:  { nom:'CUISINE', x:1900, y:1560, w:280, h:520, staff:'cuisine', approx:true,
              sous:['tranche · froid · chaud'] },
  plonge:   { nom:'PLONGE', x:1180, y:2090, w:420, h:330, tunnels:true, approx:true,
              sous:['3 tunnels de lavage'] }
};

/* Stockages, chambres froides et locaux : repris tels quels du plan. */
const STORAGES = [
  { l:'CF départ armement',        x:850,    y:680.6,  w:289.8, h:593.3, cat:'cf' },
  { l:'Congélateur (KSO + cuisine chaude)', x:2355.8, y:692.9, w:204.5, h:227.4, cat:'gel' },
  { l:'SAS plaquage produit congelé', x:2793.9, y:750.8, w:217, h:184.6, cat:'gel' },
  { l:'Montage KSO',               x:2216.7, y:914.1,  w:142.1, h:131.6, cat:'sub' },
  { l:'Sortie KSO',                x:2368.6, y:926.9,  w:186.5, h:152.5, cat:'sub' },
  { l:'Congélateur',               x:2845.3, y:936.8,  w:128,   h:581.3, cat:'gel' },
  { l:'CF + BOF',                  x:2637.4, y:978.4,  w:148.8, h:184.3, cat:'cf' },
  { l:'Réserve local Montage (mise à dispo montage + pain)', x:2270.3, y:1085.3, w:282.8, h:166, cat:'sub' },
  { l:'CF charcuterie',            x:2636.7, y:1177.4, w:146,   h:99.2,  cat:'cf' },
  { l:'CF Fruits & Légumes',       x:2267.8, y:1257.8, w:289.6, h:111.5, cat:'cf' },
  { l:'CF sortie cuisine',         x:2638.7, y:1292.3, w:148.1, h:80.2,  cat:'cf' },
  { l:'CF sortie matière pour prépa montage', x:2272.6, y:1377.7, w:220.2, h:137.9, cat:'cf' },
  { l:'Stockage compagnie',        x:383.1,  y:1533.8, w:380.3, h:492.9, cat:'aire' },
  { l:'Aire de stockage',          x:3033.3, y:1540,   w:390,   h:453.6, cat:'aire' },
  { l:'Aire de stockage',          x:4132,   y:1544,   w:408.7, h:313.9, cat:'aire' },
  { l:'CF Jour (tranché et décontaminé)', x:2420.1, y:1565.3, w:120.1, h:259.5, cat:'cf' },
  { l:'CF intermédiaire (prépa montage + produit fini)', x:2244.9, y:1620.2, w:165.7, h:204.9, cat:'cf' },
  { l:'Refroidissement et sous-vide', x:2194.4, y:1840.6, w:133.6, h:111.2, cat:'cf' },
  { l:'CF sous-vide',              x:2338.4, y:1842.1, w:200.9, h:117.8, cat:'cf' },
  { l:'CF 4e et 5e gamme',         x:2789.2, y:1915.3, w:228,   h:176.8, cat:'cf' },
  { l:'CF PEQ tranche cuisine',    x:2624.3, y:1965.2, w:111.8, h:139.2, cat:'cf' },
  { l:'Aire de stockage',          x:3890,   y:2039.2, w:658.7, h:381.3, cat:'aire' },
  { l:'Local produit chimique',    x:2793.8, y:2095,   w:218.2, h:70.7,  cat:'loc' },
  { l:'Bureau maintenance',        x:2397.3, y:2174.3, w:108.6, h:238,   cat:'loc' },
  { l:'Local QHSE (produit hygiène)', x:2522.3, y:2172.2, w:108, h:241.2, cat:'loc' },
  { l:'Réserve sèche',             x:2651.5, y:2175.9, w:302.2, h:241.8, cat:'sec' },
  { l:'Armement — zone retour',    x:915.2,  y:2182.3, w:208,   h:242.7, cat:'sub' }
];

/* Flux fonctionnels (graphe de précédences §3), entre ateliers. */
const FLUX = [
  ['magasin','prepa'], ['appros','cuisine'], ['appros','prepa'], ['appros','decontam'],
  ['decontam','cuisine'], ['cuisine','prepa'], ['plonge','prepa'], ['plonge','dotation'],
  ['dotation','quais'], ['dotation','prepa'], ['prepa','handling'], ['handling','quais'],
  ['armement','quais'], ['bobduty','quais']
];
const FLUX_RETOUR = [ ['quais','plonge'], ['quais','armement'] ];

/* Les coordonnées sont déjà en pixels du plan : pas de transformation.
 * Une zone est soit un rectangle (x,y,w,h), soit un polygone libre (pts).
 * Dans les deux cas, boite() renvoie la boîte englobante, qui sert au
 * placement des libellés, des jauges et des arêtes de flux. */
function estPoly(z) { return !!(z.pts && z.pts.length >= 3); }
function boite(z) {
  if (estPoly(z)) {
    const xs = z.pts.map(p => p[0]), ys = z.pts.map(p => p[1]);
    const x = Math.min.apply(null, xs), y = Math.min.apply(null, ys);
    return { x, y, w:Math.max.apply(null, xs) - x, h:Math.max.apply(null, ys) - y };
  }
  return { x:z.x, y:z.y, w:z.w, h:z.h };
}
/* Maintient x/y/w/h en phase avec les points d'un polygone. */
function syncBoite(z) { const b = boite(z); z.x = b.x; z.y = b.y; z.w = b.w; z.h = b.h; }
/* Déplace la zone entière. */
function deplacerZone(z, dx, dy) {
  if (estPoly(z)) { z.pts = z.pts.map(pt => [pt[0] + dx, pt[1] + dy]); syncBoite(z); }
  else { z.x += dx; z.y += dy; }
}
/* Applique une nouvelle boîte englobante (un polygone est mis à l'échelle). */
function appliquerBoite(z, nb) {
  const b = boite(z);
  if (estPoly(z)) {
    const sx = b.w ? nb.w / b.w : 1, sy = b.h ? nb.h / b.h : 1;
    z.pts = z.pts.map(pt => [nb.x + (pt[0] - b.x) * sx, nb.y + (pt[1] - b.y) * sy]);
  }
  z.x = nb.x; z.y = nb.y; z.w = nb.w; z.h = nb.h;
}
/* Tracé SVG de la zone. */
function dZone(z) {
  if (estPoly(z)) return 'M ' + z.pts.map(pt => pt[0] + ' ' + pt[1]).join(' L ') + ' Z';
  const b = boite(z);
  return 'M ' + b.x + ' ' + b.y + ' L ' + (b.x+b.w) + ' ' + b.y +
         ' L ' + (b.x+b.w) + ' ' + (b.y+b.h) + ' L ' + b.x + ' ' + (b.y+b.h) + ' Z';
}
function centre(id) { const b = boite(ZONES[id]); return { x:b.x + b.w/2, y:b.y + b.h/2 }; }
// Point sur le bord de la boîte englobante en direction d'une cible
function bord(id, cible) {
  const b = boite(ZONES[id]), cx = b.x + b.w/2, cy = b.y + b.h/2;
  const dx = cible.x - cx, dy = cible.y - cy;
  if (dx === 0 && dy === 0) return { x:cx, y:cy };
  const sx = dx !== 0 ? (b.w/2) / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? (b.h/2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x:cx + dx*s, y:cy + dy*s };
}

/* ==========================================================================
 *  3. JEU DE DONNÉES D'EXEMPLE — porté par le modèle (moteur/orly.js)
 * ==========================================================================*/
const SAMPLE = Orly.JEU_DEMO;

/* ==========================================================================
 *  4. ÉTAT DE LA SIMULATION
 *     `modele` est construit par moteur/orly.js. `stations` et `jobs` sont
 *     les vues que le rendu lit ; elles sont rafraîchies par le modèle à
 *     chaque avancée. Les ateliers non modélisés ont une vue neutre.
 * ==========================================================================*/
let modele = null, flights = [], jobs = [], stations = {};
let now = CFG.jour.debut, enMarche = false, vitesse = 30, historique = [];
/* Bornes de la simulation, lues sur le modèle. Sans calendrier multijour elles
 * valent la fenêtre quotidienne ; avec, elles couvrent toutes les journées. */
const DEBUT = () => modele ? modele.debut : CFG.jour.debut;
const FIN = () => modele ? modele.horizon : CFG.jour.fin;
const MULTIJOUR = () => !!(modele && modele.joursProduction > 1);
const VUE_NEUTRE = { util:0, qlen:0, enAttente:0, bloque:false, tauxJour:0 };

function build(data) {
  modele = Orly.construireModele(data, CFG, { surToken: spawnToken });
  flights = modele.flights; jobs = modele.jobs;
  stations = {};
  Object.keys(ZONES).forEach(id => { stations[id] = modele.stations[id] || VUE_NEUTRE; });
  now = modele.maintenant;
  Sim.robotRate = 0;
  if (document.getElementById('source-count')) updateSource();
  const legende = document.querySelector('.jour');
  if (legende) legende.textContent = MULTIJOUR()
    ? 'Heure simulée · ' + modele.joursDeparts + ' journées de départs, production dès J−' + modele.decalage
    : 'Heure simulée · démo 05:00–23:00';
}

/* ==========================================================================
 *  5. PAS DE SIMULATION — délégué au moteur à événements discrets
 * ==========================================================================*/
function step(dt) {
  now = modele.avancerA(now + dt);
  Sim.robotRate = modele.debitRobot();
}

/* ==========================================================================
 *  6. KPI
 * ==========================================================================*/
function kpis() {
  return Object.assign(serviceMetrics(flights, now), {
    wip:jobs.filter(j => j.released && !j.done).length,
    debit:Math.round((Sim.robotRate || 0) * 60), goulot:goulotCourant()
  });
}
/* Le goulot est mesuré par le modèle : le poste où l'on attend. */
function goulotCourant() {
  const g = modele ? modele.goulot() : null;
  return g ? { id:g.id, nom:ZONES[g.id].nom, sev:g.sev, qlen:g.qlen, attente:g.attente, cause:g.cause } : null;
}
function couleurCharge(u) { return u < 0.55 ? 'var(--vert)' : u < 0.85 ? 'var(--orange)' : 'var(--rouge)'; }

/* ==========================================================================
 *  7. RENDU DU PLAN
 * ==========================================================================*/
const SVGNS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('plan');
let tokens = [];
const zoneEls = {};
let edgeEls = {}, gPoign = null;
let editMode = false, tracage = false, tracagePoly = false;
// Géométrie d'origine (pour « réinitialiser »)
const ZONES_DEFAUT = JSON.parse(JSON.stringify(
  Object.keys(ZONES).reduce((o, id) => {
    const z = ZONES[id]; o[id] = { x:z.x, y:z.y, w:z.w, h:z.h, approx:!!z.approx }; return o;
  }, {})
));
function svgEl(t, a) { const e = document.createElementNS(SVGNS, t); for (const k in a) e.setAttribute(k, a[k]); return e; }

function construirePlan() {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  svg.setAttribute('viewBox', VUE.x + ' ' + VUE.y + ' ' + VUE.w + ' ' + VUE.h);

  // Conteneur zoomable/déplaçable
  const gVue = svgEl('g', { id:'viewport' }); svg.appendChild(gVue); Sim._gVue = gVue;

  // Fond : le plan d'architecte réel (12 tuiles)
  const gFond = svgEl('g', { id:'plan-fond' }); gVue.appendChild(gFond);
  TILES.forEach(t => {
    gFond.appendChild(svgEl('image', { href:DOSSIER_PLAN + '/tuile' + t.n + '.png',
      x:t.x, y:t.y, width:t.w, height:t.h, preserveAspectRatio:'none' }));
  });
  verifierPlan();

  // Arêtes de flux (recalculées à chaque modification de géométrie)
  const gEdges = svgEl('g', {id:'flow-edges'}); gVue.appendChild(gEdges);
  edgeEls = {};
  FLUX.concat(FLUX_RETOUR.map(e => e.concat('R'))).forEach(fl => {
    const [a, b] = fl, retour = fl[2] === 'R', id = a + '_' + b;
    const path = svgEl('path', { id:'edge-' + id, class:'edge' + (retour ? ' retour' : '') });
    const fleche = svgEl('path', { class:'edge fleche' + (retour ? ' retour' : '') });
    gEdges.appendChild(path); gEdges.appendChild(fleche);
    edgeEls[id] = { path, fleche, a, b };
  });
  redessinerEdges();

  // Stockages / chambres froides (repris du plan, sous les ateliers)
  const gSto = svgEl('g', {id:'plan-storages'}); gVue.appendChild(gSto);
  STORAGES.forEach(s => {
    const g = svgEl('g', { class:'sto sto-' + s.cat });
    g.appendChild(svgEl('rect', { x:s.x, y:s.y, width:s.w, height:s.h, rx:8 }));
    const ti = svgEl('title', {}); ti.textContent = s.l; g.appendChild(ti);
    // libellé affiché seulement en zoom (sinon le plan devient illisible)
    const lbl = svgEl('text', { class:'sto-txt', x:s.x + s.w/2, y:s.y + s.h/2 + 10, 'text-anchor':'middle' });
    lbl.textContent = s.l; g.appendChild(lbl);
    gSto.appendChild(g);
  });

  // Ateliers (au-dessus)
  const gZones = svgEl('g', {}); gVue.appendChild(gZones);
  Object.keys(ZONES).forEach(id => {
    const z = ZONES[id];
    const g = svgEl('g', { class:'zone', 'data-id':id });
    const rect = svgEl('path', { class:'fond' }); g.appendChild(rect);
    const ti = svgEl('title', {}); g.appendChild(ti);
    const titre = svgEl('text', { class:'titre' }); titre.textContent = z.nom; g.appendChild(titre);
    const sous = (z.sous || []).map(s => {
      const st = svgEl('text', { class:'sous' }); st.textContent = s; g.appendChild(st); return st;
    });
    let barreFond = null, jauge = null;
    if (!z.sink && !z.buffer) {
      barreFond = svgEl('rect', { class:'barre-fond', height:16, rx:8 }); g.appendChild(barreFond);
      jauge = svgEl('rect', { class:'barre-jauge', width:0, height:16, rx:8, fill:'var(--vert)' }); g.appendChild(jauge);
    }
    let res = null;
    if (z.robot) res = ajoutRessource(g, 'ROBOT', 'robot');
    if (z.tunnels) res = ajoutRessource(g, 'TUNNELS', 'tunnels');
    const badge = svgEl('text', { class:'goulot-badge', 'text-anchor':'end' }); g.appendChild(badge);
    zoneEls[id] = { g, rect, titre, sous, barreFond, jauge, res, badge, tip:ti, b:boite(z) };
    g.setAttribute('role','button'); g.setAttribute('tabindex','0'); g.setAttribute('aria-label',z.nom);
    g.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){e.preventDefault();selectionner(id);} });
    g.addEventListener('click', e => { e.stopPropagation(); selectionner(id); });
    gZones.appendChild(g);
    positionnerZone(id);
  });

  const gTok = svgEl('g', { id:'tokens' }); gVue.appendChild(gTok); Sim._gTok = gTok;
  gPoign = svgEl('g', { id:'poignees' }); gVue.appendChild(gPoign);
  initInteractions();
}

/* Place tous les éléments d'une zone d'après sa géométrie courante. */
function positionnerZone(id) {
  const z = ZONES[id], e = zoneEls[id]; if (!e) return;
  const b = boite(z); e.b = b;
  const s = (el, a) => { for (const k in a) el.setAttribute(k, a[k]); };
  e.rect.setAttribute('d', dZone(z));
  e.g.classList.toggle('approx', !!z.approx);
  e.tip.textContent = z.nom + (z.approx ? ' (emplacement à confirmer)' : '');
  s(e.titre, { x:b.x + 14, y:b.y + 56 });
  e.sous.forEach((st, i) => s(st, { x:b.x + 14, y:b.y + 96 + i*38 }));
  if (e.barreFond) s(e.barreFond, { x:b.x + 14, y:b.y + b.h - 30, width:Math.max(0, b.w - 28) });
  if (e.jauge) s(e.jauge, { x:b.x + 14, y:b.y + b.h - 30 });
  if (e.res) {
    const rx = z.robot ? b.x + b.w - 210 : b.x + 14, ry = b.y + b.h - 130;
    s(e.res.box, { x:rx, y:ry });
    s(e.res.txt, { x:rx + 16, y:ry + 36 });
    s(e.res.val, { x:rx + 16, y:ry + 78 });
  }
  s(e.badge, { x:b.x + b.w - 14, y:b.y + 56 });
}

/* Recalcule le tracé de toutes les arêtes. */
function redessinerEdges() {
  if(Sim.flows){dessinerFluxConfigures();return;}
  Object.keys(edgeEls).forEach(id => {
    const e = edgeEls[id];
    const pa = bord(e.a, centre(e.b)), pb = bord(e.b, centre(e.a));
    const mx = (pa.x + pb.x)/2, my = (pa.y + pb.y)/2;
    const dx = pb.x - pa.x, dy = pb.y - pa.y, len = Math.hypot(dx, dy) || 1;
    const cx = mx - dy/len * 130, cy = my + dx/len * 130;
    e.path.setAttribute('d', `M ${pa.x} ${pa.y} Q ${cx} ${cy} ${pb.x} ${pb.y}`);
    const ang = Math.atan2(pb.y - cy, pb.x - cx), F = 42;
    e.fleche.setAttribute('d',
      `M ${pb.x} ${pb.y} L ${pb.x-F*Math.cos(ang-0.4)} ${pb.y-F*Math.sin(ang-0.4)} M ${pb.x} ${pb.y} L ${pb.x-F*Math.cos(ang+0.4)} ${pb.y-F*Math.sin(ang+0.4)}`);
  });
}

function dessinerFluxConfigures(){
  const group=document.getElementById('flow-edges');group.replaceChildren();
  const points=Sim.flows.points,pairs=new Map();
  document.getElementById('fc-map-scope').textContent=Sim.flows.mapOwner?' · '+(ZONES[Sim.flows.mapOwner]?.nom||'Service absent'):'';
  for(const flow of Sim.flows.mapFlows()){
    const a=points.find(p=>p.id===flow.from),b=points.find(p=>p.id===flow.to);
    if(a.owner===b.owner)continue; // les échanges internes se lisent dans la liste
    const key=JSON.stringify([a.owner,b.owner]);const offset=pairs.get(key)||0;pairs.set(key,offset+1);
    const pa=bord(a.owner,centre(b.owner)),pb=bord(b.owner,centre(a.owner));
    const dx=pb.x-pa.x,dy=pb.y-pa.y,len=Math.hypot(dx,dy)||1;
    const cx=(pa.x+pb.x)/2-dy/len*(130+offset*65),cy=(pa.y+pb.y)/2+dx/len*(130+offset*65);
    const path=svgEl('path',{d:`M ${pa.x} ${pa.y} Q ${cx} ${cy} ${pb.x} ${pb.y}`,class:'edge','data-flow-id':flow.id});
    path.style.stroke=OrlyFlows.TYPES[flow.type].color;if(flow.type==='unclassified')path.style.strokeDasharray='20 14';
    const title=svgEl('title',{});title.textContent=OrlyFlows.TYPES[flow.type].label+' : '+a.label+' → '+b.label;path.appendChild(title);group.appendChild(path);
    const ang=Math.atan2(pb.y-cy,pb.x-cx),F=42;
    const arrow=svgEl('path',{d:`M ${pb.x-F*Math.cos(ang-.4)} ${pb.y-F*Math.sin(ang-.4)} L ${pb.x} ${pb.y} L ${pb.x-F*Math.cos(ang+.4)} ${pb.y-F*Math.sin(ang+.4)}`,class:'edge'});arrow.style.stroke=OrlyFlows.TYPES[flow.type].color;group.appendChild(arrow);
  }
}
function zoomService(z){const b=boite(z);return Math.max(.5,Math.min(VUE.w/(b.w+80),VUE.h/(b.h+80))*.93);}
/* ==========================================================================
 *  CENTRE DES ATELIERS DE TRAVAIL
 *  L'onglet « Ateliers » ne sert plus à dessiner des tables : il décrit QUI
 *  fabrique QUOI, QUAND et À COMBIEN. Le calcul est dans moteur/production.js.
 * ==========================================================================*/
function servicesDisponibles(){
  const liste=Object.keys(ZONES).map(id=>({id,nom:ZONES[id].nom}));
  for(const a of annexes()) liste.push({id:a.id,nom:a.nom});
  return liste;
}
/* Le parcours des compagnies × classes se lit dans le graphe du Centre des
 * flux : on n'en retient que les couples de services, en ignorant le détail
 * des stockages et les liaisons désactivées. */
function liaisonsServices(){
  const f=Sim.flows; if(!f) return FLUX.map(([from,to])=>({from,to}));
  const service=point=>{try{return JSON.parse(point)[0];}catch(e){return null;}};
  const out=[];
  for(const l of f.state.flows){
    if(!l.enabled) continue;
    const from=service(l.from),to=service(l.to);
    if(from&&to&&from!==to) out.push({from,to});
  }
  // Une annexe est une seconde salle de son atelier : elle en hérite les
  // fournisseurs et les clients. Sans cela, un atelier posé dans « Armement 2 »
  // n'attendrait personne et ne serait attendu de personne.
  const liens=out.slice();
  for(const a of annexes()){
    for(const l of liens){
      if(l.to===a.parent) out.push({from:l.from,to:a.id});
      if(l.from===a.parent) out.push({from:a.id,to:l.to});
    }
  }
  return out;
}
function initAteliers(){
  Sim.ateliers=new OrlyAteliers.CentreAteliers({
    hote:()=>document.getElementById('view-ateliers'),
    services:servicesDisponibles,
    vols:()=>flights,
    classes:()=>MoteurProduction.classesDeVols(flights,{delaiChargement:CFG.loadDelay}),
    liaisons:liaisonsServices,
    reglages:()=>({delaiChargement:CFG.loadDelay}),
    // Le plan dit « aménagé » d'après les ateliers : il doit suivre leur saisie.
    change:()=>majEtatPlan(),
    notify:toast
  });
}
function initFlux(){
  Sim.flows=new OrlyFlows.FlowCenter({zones:()=>Sim.editor.state.zones,legacy:FLUX.concat(FLUX_RETOUR),changed:()=>{if(Sim.flows)redessinerEdges();},showMap:()=>showView('plan'),notify:toast});
  redessinerEdges();
}

/* Le fond de plan est facultatif : s'il n'est pas présent en local, on le
 * signale et on désactive la case, au lieu d'afficher un cadre vide. */
let planVerifie = false;
function verifierPlan() {
  if (planVerifie) return; planVerifie = true;
  const img = new Image();
  img.onerror = function () {
    svg.classList.add('sans-fond');
    const c = document.getElementById('fond-plan');
    if (c) {
      c.checked = false; c.disabled = true;
      const l = c.closest('label');
      if (l) {
        l.title = 'Plan confidentiel, absent de ce dépôt public. Placez ses tuiles ' +
                  'dans le dossier ' + DOSSIER_PLAN + '/ en local pour l\'afficher.';
        const n = l.querySelector('.sans-plan') || document.createElement('span');
        n.className = 'sans-plan'; n.textContent = ' (absent)';
        n.style.color = 'var(--txt3)';
        if (!l.querySelector('.sans-plan')) l.appendChild(n);
      }
    }
  };
  img.src = DOSSIER_PLAN + '/tuile1.png';
}

/* --- Zoom / déplacement --------------------------------------------------- */
let vk = 1, vtx = 0, vty = 0;
const ZOOM_MIN = 0.5, ZOOM_MAX = 16;
/* Le centre de l'écran reste toujours à portée du plan. Sans cela on peut
 * dériver jusqu'à l'écran vide, et le seul recours est « vue d'ensemble ». */
function brider() {
  const m = 0.35;
  const cx = (VUE.x + VUE.w/2 - vtx) / vk, cy = (VUE.y + VUE.h/2 - vty) / vk;
  const bx = Math.min(Math.max(cx, VUE.x - VUE.w*m), VUE.x + VUE.w*(1+m));
  const by = Math.min(Math.max(cy, VUE.y - VUE.h*m), VUE.y + VUE.h*(1+m));
  vtx = VUE.x + VUE.w/2 - bx*vk; vty = VUE.y + VUE.h/2 - by*vk;
}
/* Cadre une zone au centre. Le facteur de cadrage n'est plus un plafond :
 * on peut toujours s'approcher davantage pour tracer au carreau. */
function cadrerZone(z) {
  const b = boite(z);
  vk = Math.min(ZOOM_MAX, zoomService(z)); 
  vtx = VUE.x + VUE.w/2 - (b.x + b.w/2)*vk; vty = VUE.y + VUE.h/2 - (b.y + b.h/2)*vk;
  appliquerVue();
}
function vueEnsemble() { vk = 1; vtx = 0; vty = 0; appliquerVue(); }
function appliquerVue() {
  brider();
  Sim._gVue.setAttribute('transform', 'translate(' + vtx + ' ' + vty + ') scale(' + vk + ')');
  svg.classList.toggle('zoomed', vk >= 1.7);
  const z = document.getElementById('zoom-val'); if (z) z.textContent = Math.round(vk*100) + '%';
  majPoignees();
  if(Sim.editor)Sim.editor.renderCanvas();
}
function ptSvg(e) {
  const m = svg.getScreenCTM(); if (!m) return { x:0, y:0 };
  const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
  return p.matrixTransform(m.inverse());
}
function zoomer(f, p) {
  // Le cadrage du service servait de plafond en vue Ateliers : on ne pouvait
  // pas s'approcher d'un carreau de 50 cm pour le tracer. Même borne partout.
  const nk = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, vk * f));
  if (!p) p = { x:VUE.x + VUE.w/2, y:VUE.y + VUE.h/2 };
  const wx = (p.x - vtx) / vk, wy = (p.y - vty) / vk;
  vk = nk; vtx = p.x - wx*vk; vty = p.y - wy*vk;
  appliquerVue();
}
/* Convertit un point du repère SVG vers le repère du plan. */
function versPlan(p) { return { x:(p.x - vtx) / vk, y:(p.y - vty) / vk }; }

function initInteractions() {
  // Un cran fixe saute trop sur un pavé tactile, qui envoie beaucoup de petits
  // événements ; le pincement arrive en molette avec ctrlKey. D'où un facteur
  // proportionnel à la distance parcourue plutôt qu'un pas constant.
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomer(Math.exp(-d * (e.ctrlKey ? 0.012 : 0.0035)), ptSvg(e));
  }, { passive:false });

  // Double-clic : cadrer l'atelier visé, ou revenir à l'ensemble ailleurs.
  svg.addEventListener('dblclick', e => {
    if (editMode) return;
    const gz = e.target.closest && e.target.closest('.zone');
    if (gz && ZONES[gz.dataset.id]) { selectionner(gz.dataset.id); cadrerZone(ZONES[gz.dataset.id]); }
    else vueEnsemble();
  });

  // Clavier : le plan est focalisable, il doit se piloter sans souris.
  svg.addEventListener('keydown', e => {
    const pas = 90;
    const gestes = {
      '+':()=>zoomer(1.25), '=':()=>zoomer(1.25), '-':()=>zoomer(1/1.25), '_':()=>zoomer(1/1.25),
      '0':()=>vueEnsemble(),
      ArrowLeft:()=>{vtx += pas; appliquerVue();}, ArrowRight:()=>{vtx -= pas; appliquerVue();},
      ArrowUp:()=>{vty += pas; appliquerVue();},   ArrowDown:()=>{vty -= pas; appliquerVue();}
    };
    const g = gestes[e.key]; if (g) { e.preventDefault(); g(); }
  });

  let act = null;   // action en cours : pan | move | resize | trace

  svg.addEventListener('pointerdown', e => {
    const p = ptSvg(e), m = versPlan(p);
    if(editMode)svg.setPointerCapture(e.pointerId);

    // tracé d'un polygone : chaque clic ajoute un point
    if (tracagePoly && selection) {
      if (!tracePts) tracePts = [];
      // e.detail >= 2 = second clic d'un double-clic (il sert à fermer, pas à ajouter)
      const dernier = tracePts[tracePts.length - 1];
      const doublon = dernier && Math.hypot(m.x - dernier[0], m.y - dernier[1]) < 12 / vk;
      if (e.detail < 2 && !doublon) {
        tracePts.push([Math.round(m.x), Math.round(m.y)]);
        dessinerTracePoly(tracePts);
      }
      act = { t:'poly' };
      return;
    }
    if (tracage && selection) { act = { t:'trace', m0:m }; return; }

    // ajout d'un point au milieu d'un segment
    const ha = e.target.closest && e.target.closest('.poignee-ajout');
    if (editMode && ha && selection) {
      const z = ZONES[selection], i = +ha.dataset.add;
      const nx = z.pts[(i + 1) % z.pts.length];
      z.pts.splice(i + 1, 0, [(z.pts[i][0] + nx[0]) / 2, (z.pts[i][1] + nx[1]) / 2]);
      syncBoite(z); majApresEdition();
      act = { t:'vertex', i:i + 1 };
      return;
    }
    const hp = e.target.closest && e.target.closest('.poignee');
    if (editMode && hp && selection) {
      const z = ZONES[selection];
      if (estPoly(z)) {
        const i = +hp.dataset.i;
        if (e.altKey) {          // Alt+clic : supprimer le sommet
          if (z.pts.length > 3) { z.pts.splice(i, 1); syncBoite(z); majApresEdition(); toast('Point supprimé'); }
          else toast('Un polygone garde au moins 3 points');
          return;
        }
        act = { t:'vertex', i:i };
        return;
      }
      act = { t:'resize', coin:hp.dataset.h, m0:m, z0:{ x:z.x, y:z.y, w:z.w, h:z.h } };
      return;
    }
    const gz = e.target.closest && e.target.closest('.zone');
    if (editMode && gz) {
      const id = gz.dataset.id;
      if (id !== selection) selectionner(id);
      const b0 = boite(ZONES[id]);
      act = { t:'move', m0:m, z0:{ x:b0.x, y:b0.y } };
      return;
    }
    act = { t:'pan', p0:p, cx:e.clientX, cy:e.clientY, tx:vtx, ty:vty }; svg.style.cursor = 'grabbing';
  });

  svg.addEventListener('pointermove', e => {
    if (!act) return;
    const p = ptSvg(e), m = versPlan(p);

    if (act.t === 'pan') {
      if(!act.bouge&&Math.hypot(e.clientX-act.cx,e.clientY-act.cy)<4)return;
      act.bouge=true;svg.setPointerCapture(e.pointerId);
      vtx = act.tx + (p.x - act.p0.x); vty = act.ty + (p.y - act.p0.y); appliquerVue(); return;
    }
    if (act.t === 'trace') {
      const r = rectDe(act.m0, m); dessinerTrace(r); return;
    }
    if (act.t === 'poly') { dessinerTracePoly(tracePts, [m.x, m.y]); return; }
    const z = ZONES[selection]; if (!z) return;
    act.bouge = true;

    if (act.t === 'vertex') {
      z.pts[act.i] = [Math.round(m.x), Math.round(m.y)];
      syncBoite(z);
    } else if (act.t === 'move') {
      const dx = Math.round(act.z0.x + (m.x - act.m0.x)) - boite(z).x;
      const dy = Math.round(act.z0.y + (m.y - act.m0.y)) - boite(z).y;
      deplacerZone(z, dx, dy);
    } else if (act.t === 'resize') {
      const d = { x:m.x - act.m0.x, y:m.y - act.m0.y }, o = act.z0, MIN = 60;
      let x = o.x, y = o.y, w = o.w, h = o.h;
      if (act.coin.includes('w')) { x = o.x + d.x; w = o.w - d.x; }
      if (act.coin.includes('e')) { w = o.w + d.x; }
      if (act.coin.includes('n')) { y = o.y + d.y; h = o.h - d.y; }
      if (act.coin.includes('s')) { h = o.h + d.y; }
      if (w < MIN) { if (act.coin.includes('w')) x = o.x + o.w - MIN; w = MIN; }
      if (h < MIN) { if (act.coin.includes('n')) y = o.y + o.h - MIN; h = MIN; }
      appliquerBoite(z, { x:Math.round(x), y:Math.round(y), w:Math.round(w), h:Math.round(h) });
    }
    majApresEdition();
  });

  const fin = e => {
    if (act && act.t === 'trace') {
      const r = rectDe(act.m0, versPlan(ptSvg(e)));
      if (r.w > 40 && r.h > 40) {
        const z = ZONES[selection];
        z.x = Math.round(r.x); z.y = Math.round(r.y); z.w = Math.round(r.w); z.h = Math.round(r.h);
        majApresEdition();
      }
      dessinerTrace(null); tracage = false; svg.classList.remove('tracage');
    }
    if (act && act.t === 'poly') { act = null; return; }   // le tracé continue
    if (act && (act.t === 'move' || act.t === 'resize' || act.t === 'vertex') && act.bouge && selection) {
      majApresEdition();
    }
    act = null; svg.style.cursor = '';
  };
  svg.addEventListener('pointerup', fin);
  svg.addEventListener('pointercancel', () => { act = null; svg.style.cursor = ''; });

  svg.addEventListener('dblclick', e => { if (tracagePoly) { e.preventDefault(); finirTracePoly(); } });
  window.addEventListener('keydown', e => {
    if(editMode&&Sim.editor)return;
    if (e.key === 'Escape' && tracagePoly) { tracePts = null; dessinerTracePoly(null); tracagePoly = false; svg.classList.remove('tracage'); majChampsEdition(); }
    if (e.key === 'Enter' && tracagePoly) finirTracePoly();
  });

  appliquerVue();
}

function rectDe(a, b) {
  return { x:Math.min(a.x, b.x), y:Math.min(a.y, b.y), w:Math.abs(b.x - a.x), h:Math.abs(b.y - a.y) };
}
let traceEl = null;
function dessinerTrace(r) {
  if (!r) { if (traceEl) { traceEl.remove(); traceEl = null; } return; }
  if (!traceEl) { traceEl = svgEl('rect', { class:'trace-rect', rx:10 }); gPoign.appendChild(traceEl); }
  traceEl.setAttribute('x', r.x); traceEl.setAttribute('y', r.y);
  traceEl.setAttribute('width', r.w); traceEl.setAttribute('height', r.h);
}

/* Après toute modification de géométrie : replace, recalcule, sauvegarde. */
function majApresEdition() {
  positionnerZone(selection);
  redessinerEdges();
  majPoignees();
  majChampsEdition();
  sauvegarderZones();
}

/* Poignées de redimensionnement de la zone sélectionnée. */
function majPoignees() {
  if (!gPoign) return;
  [...gPoign.querySelectorAll('.poignee, .poignee-ajout')].forEach(n => n.remove());
  if (!editMode || !selection || !ZONES[selection]) return;   // une annexe se retouche dans l'éditeur du plan
  const z = ZONES[selection], r = 15 / vk, sw = 3 / vk;

  if (estPoly(z)) {
    // un point par sommet + un bouton « + » au milieu de chaque segment
    z.pts.forEach((pt, i) => {
      const c = svgEl('circle', { class:'poignee sommet', cx:pt[0], cy:pt[1], r:r, 'data-i':i });
      c.setAttribute('stroke-width', sw);
      const t = svgEl('title', {}); t.textContent = 'Glisser pour déplacer · Alt+clic pour supprimer';
      c.appendChild(t);
      gPoign.appendChild(c);
    });
    z.pts.forEach((pt, i) => {
      const nx = z.pts[(i + 1) % z.pts.length];
      const c = svgEl('circle', { class:'poignee-ajout', cx:(pt[0]+nx[0])/2, cy:(pt[1]+nx[1])/2,
                                  r:r * 0.72, 'data-add':i });
      c.setAttribute('stroke-width', sw);
      const t = svgEl('title', {}); t.textContent = 'Ajouter un point ici'; c.appendChild(t);
      gPoign.appendChild(c);
    });
  } else {
    [['nw', z.x, z.y], ['ne', z.x + z.w, z.y], ['se', z.x + z.w, z.y + z.h], ['sw', z.x, z.y + z.h]]
      .forEach(([k, x, y]) => {
        const c = svgEl('circle', { class:'poignee ' + k, cx:x, cy:y, r:r, 'data-h':k });
        c.setAttribute('stroke-width', sw);
        gPoign.appendChild(c);
      });
  }
}

/* --- Conversions et tracé de polygone ------------------------------------- */
function versPolygone(z) {
  if (estPoly(z)) return;
  const b = boite(z);
  z.pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
  syncBoite(z);
}
function versRectangle(z) {
  if (!estPoly(z)) return;
  const b = boite(z);
  delete z.pts;
  z.x = b.x; z.y = b.y; z.w = b.w; z.h = b.h;
}
let tracePts = null, tracePolyEl = null;
function dessinerTracePoly(pts, curseur) {
  if (!pts) { if (tracePolyEl) { tracePolyEl.remove(); tracePolyEl = null; } return; }
  if (!tracePolyEl) { tracePolyEl = svgEl('path', { class:'trace-poly' }); gPoign.appendChild(tracePolyEl); }
  const tous = curseur ? pts.concat([curseur]) : pts;
  if (!tous.length) return;
  tracePolyEl.setAttribute('d', 'M ' + tous.map(pt => pt[0] + ' ' + pt[1]).join(' L ') + (tous.length > 2 ? ' Z' : ''));
}
function finirTracePoly() {
  if (tracePts && tracePts.length >= 3 && selection) {
    const z = ZONES[selection];
    z.pts = tracePts.slice(); syncBoite(z); /* Geometry changes do not establish operational validation. */
    majApresEdition(); toast(tracePts.length + ' points');
  }
  tracePts = null; dessinerTracePoly(null);
  tracagePoly = false; svg.classList.remove('tracage');
  majChampsEdition();
}

function ajoutRessource(g, label, type) {
  const box = svgEl('rect', { class:'ressource-box', width:196, height:96, rx:10 }); g.appendChild(box);
  const txt = svgEl('text', { class:'ressource-txt' }); txt.textContent = label; g.appendChild(txt);
  const val = svgEl('text', { class:'ressource-val', id:'res-' + type }); val.textContent = '—'; g.appendChild(val);
  return { box, txt, val };
}

let selection = null;
function selectionner(id) {
  selection = (!editMode && activeView!=='ateliers' && selection === id) ? null : id;
  Object.keys(zoneEls).forEach(k => zoneEls[k].g.classList.toggle('selection', k === selection));
  Object.keys(zoneEls).forEach(k => zoneEls[k].g.setAttribute('aria-pressed',String(k===selection)));
  document.getElementById('zone-picker').value = selection || '';
  if(Sim.editor)Sim.editor.showService(selection);
  document.querySelectorAll('#stats-ateliers button').forEach(b=>{const active=b.dataset.station===selection;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  majGoulotInfo(); majPoignees(); majChampsEdition();
  if(!editMode) showPanel('suivi');
}

/* ==========================================================================
 *  7 bis. MODE ÉDITION DES ZONES
 *  L'utilisateur place lui-même les zones sur le plan ; la géométrie est
 *  sauvegardée dans le navigateur et exportable en JSON.
 * ==========================================================================*/
function geomZones() {
  const o = {};
  Object.keys(ZONES).forEach(id => {
    const z = ZONES[id];
    o[id] = { nom:z.nom, x:Math.round(z.x), y:Math.round(z.y), w:Math.round(z.w), h:Math.round(z.h), approx:!!z.approx };
    if (estPoly(z)) o[id].pts = z.pts.map(pt => [Math.round(pt[0]), Math.round(pt[1])]);
  });
  return o;
}
function sauvegarderZones() {
  try { localStorage.setItem('orly-zones', JSON.stringify(geomZones())); } catch (e) { /* indisponible */ }
}
function chargerZones() {
  let o = null;
  try { o = JSON.parse(localStorage.getItem('orly-zones') || 'null'); } catch (e) { return; }
  if (o) {try{appliquerGeom(o, true);}catch(e){toast('Zones enregistrées invalides : positions par défaut chargées');}}
}
function appliquerGeom(o, silencieux) {
  if(!o || typeof o!=='object' || Array.isArray(o))throw new Error('Objet de zones attendu.');
  const ids=Object.keys(o).filter(id=>Object.hasOwn(ZONES,id));
  if(!ids.length)throw new Error('Aucune zone reconnue.');
  // Validate every entry before changing any geometry.
  ids.forEach(id=>{
    const v=o[id];
    if(!v || !['x','y','w','h'].every(k=>typeof v[k]==='number' && Number.isFinite(v[k])) || v.w<=0 || v.h<=0)throw new Error('Géométrie invalide : '+id);
    if(v.pts!==undefined && (!Array.isArray(v.pts) || v.pts.length<3 || !v.pts.every(pt=>Array.isArray(pt)&&pt.length===2&&pt.every(n=>typeof n==='number'&&Number.isFinite(n)))))throw new Error('Polygone invalide : '+id);
    if(v.pts){const xs=v.pts.map(p=>p[0]),ys=v.pts.map(p=>p[1]);if(Math.max(...xs)<=Math.min(...xs)||Math.max(...ys)<=Math.min(...ys))throw new Error('Polygone sans surface : '+id);}
  });
  ids.forEach(id=>{
    const z=ZONES[id],v=o[id];['x','y','w','h'].forEach(k=>z[k]=v[k]);
    if(v.pts){z.pts=v.pts.map(pt=>pt.slice());syncBoite(z);}else delete z.pts;
    if(typeof v.approx==='boolean')z.approx=v.approx;
  });
  if(zoneEls[Object.keys(ZONES)[0]]){Object.keys(ZONES).forEach(positionnerZone);redessinerEdges();majPoignees();majChampsEdition();}
  if(!silencieux)toast(ids.length+' zones appliquées');
  return ids.length;
}

function basculerEdition() {
  editMode=!editMode;
  if(editMode){pause();showView('plan');}
  svg.classList.toggle('edition',editMode);
  document.body.classList.toggle('editing',editMode);
  document.getElementById('btn-edit').setAttribute('aria-pressed',String(editMode));
  document.getElementById('btn-edit').textContent=editMode?'Terminer l’édition':'Éditer les zones';
  document.getElementById('btn-play').disabled=editMode;
  Sim.editor.setActive(editMode);updateRunState();
}

function majListeEdition() {
  const box = document.getElementById('edit-liste'); if (!box) return;
  box.innerHTML = '';
  Object.keys(ZONES).forEach(id => {
    const z = ZONES[id];
    const b = document.createElement('button');
    b.className = 'edit-puce' + (id === selection ? ' on' : '') + (z.approx ? ' approx' : '');
    b.textContent = z.nom;
    b.addEventListener('click', () => { selectionner(id); majListeEdition(); });
    box.appendChild(b);
  });
}

function majChampsEdition() {
  const bloc = document.getElementById('edit-sel'); if (!bloc) return;
  if (!editMode || !selection || !ZONES[selection]) { bloc.hidden = true; return; }
  bloc.hidden = false;
  const z = ZONES[selection];
  document.getElementById('edit-nom').textContent = z.nom + (z.approx ? '  (à confirmer)' : '');
  const b = boite(z);
  [['ez-x','x'],['ez-y','y'],['ez-w','w'],['ez-h','h']].forEach(([el,k]) => {
    const n = document.getElementById(el); if (n && document.activeElement !== n) n.value = Math.round(b[k]);
  });
  const f = document.getElementById('ez-forme');
  if (f) f.innerHTML = estPoly(z)
    ? '⬠ <b>Forme libre</b> — ' + z.pts.length + ' points. Glissez un point, « + » pour en ajouter, <b>Alt+clic</b> pour en supprimer.'
    : '▱ <b>Rectangle</b>. Utilisez « Convertir » pour passer en forme libre.';
  const tb = document.getElementById('ez-toshape');
  if (tb) tb.textContent = estPoly(z) ? '▱ Revenir au rectangle' : '⬠ Convertir en forme';
  majListeEdition();
}

function initEdition() {
  Sim.editor=new window.OrlyPlan.PlanEditor({
    svg,viewport:Sim._gVue,zones:ZONES,storages:STORAGES,notify:toast,
    update(id,visible){
      positionnerZone(id);
      const e=zoneEls[id];if(!e)return;
      e.titre.textContent=ZONES[id].nom;e.g.setAttribute('aria-label',ZONES[id].nom);
      e.g.style.display=visible?'':'none';
      // Couleur choisie dans l'éditeur : elle tient le fond, l'état de
      // paramétrage passe dans le contour. Rien de choisi, rien ne change.
      const c=ZONES[id].couleur;
      e.g.classList.toggle('couleur-perso',!!c);
      if(c)e.g.style.setProperty('--zone-perso',c);else e.g.style.removeProperty('--zone-perso');
    },
    refresh(){if(Sim.flows)Sim.flows.refresh();redessinerEdges();majPicker();if(Sim.ateliers)Sim.ateliers.rendre();},
    pick(id){selectionner(id);},
    getView(){return {vk,vtx,vty};},
    pan(v,dx,dy){const m=svg.getScreenCTM();vtx=v.vtx+dx/m.a;vty=v.vty+dy/m.d;vk=v.vk;appliquerVue();},
    focus(b){vk=Math.min(8,Math.max(.5,Math.min(VUE.w/(b.w+150),VUE.h/(b.h+150))*.8));vtx=VUE.x+VUE.w/2-(b.x+b.w/2)*vk;vty=VUE.y+VUE.h/2-(b.y+b.h/2)*vk;appliquerVue();}
  });
  document.getElementById('plan-storages').style.display='none';
  document.getElementById('btn-edit').addEventListener('click',basculerEdition);
  majPicker();   // le plan enregistré peut contenir des annexes
}

function spawnToken(edgeId, color) {
  if (!edgeId || tokens.length > 90) return;
  const path = document.getElementById('edge-' + edgeId); if (!path) return;
  const c = svgEl('circle', { class:'token', r:17, fill:color }); Sim._gTok.appendChild(c);
  tokens.push({ el:c, path, len:path.getTotalLength(), t:0, v:0.012 + Math.random()*0.006 });
}
function animerTokens() {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tk = tokens[i]; tk.t += tk.v;
    if (tk.t >= 1) { tk.el.remove(); tokens.splice(i, 1); continue; }
    const pt = tk.path.getPointAtLength(tk.t * tk.len);
    tk.el.setAttribute('cx', pt.x); tk.el.setAttribute('cy', pt.y);
  }
}

function majPlan() {
  Object.keys(ZONES).forEach(id => {
    const z = ZONES[id], st = stations[id], els = zoneEls[id];
    if (!els || z.sink) return;
    const u = Math.min(1, st.util), col = couleurCharge(u);
    if (els.jauge) { els.jauge.setAttribute('width', (els.b.w-16) * u); els.jauge.setAttribute('fill', col); }
    // la couleur de fond/bordure est pilotée par le thème via une classe
    els.g.classList.remove('c-ok', 'c-warn', 'c-bad');
    if(now>DEBUT() && !NON_MODELISES.has(id)) els.g.classList.add(u < 0.55 ? 'c-ok' : u < 0.85 ? 'c-warn' : 'c-bad');
    if (els.badge) els.badge.textContent = st.qlen > 0 ? st.qlen + ' OF' : '';
  });
  const r = document.getElementById('res-robot'); if (r) r.textContent = Math.round((Sim.robotRate||0)*60) + '/' + CFG.robotCadence;
  const t = document.getElementById('res-tunnels'); if (t) t.textContent = CFG.tunnels + (CFG.tunnelDouble ? ' (1×2)' : '');
  majEtatPlan();
}

/* ==========================================================================
 *  7 bis. ÉTAT DE PARAMÉTRAGE — ce que le plan dit AVANT de lancer
 *  Tant que la simulation n'a pas démarré, les couleurs d'occupation ne
 *  veulent rien dire : tout serait à zéro. On se sert donc du plan pour
 *  répondre à l'autre question, celle que l'on se pose en traçant l'unité :
 *  qu'est-ce qui reste à renseigner ? Deux langages de couleur distincts,
 *  jamais affichés en même temps : progression avant le lancement, charge
 *  pendant la simulation.
 * ==========================================================================*/
const ETATS_PARAM = {
  vide:    { lib:'Personne',  aide:'Atelier simulé sans effectif : il ne produira rien.' },
  partiel: { lib:'Au curseur', aide:'Effectif réglé dans les Réglages, aucun équipement tracé.' },
  pret:    { lib:'Aménagé',  aide:'Effectif et au moins un équipement tracé dans « Création des ateliers ».' }
};

/* ==========================================================================
 *  ZONES ANNEXES — une seconde salle pour un atelier du moteur
 *  Armement 2 fait le même travail qu'Armement : même file, même procédé.
 *  Ce qu'elle apporte, c'est un espace à aménager et des gens à y affecter.
 *  Un atelier qui aurait sa propre file d'attente serait un autre modèle : il
 *  faudrait une règle de répartition des ordres, qui n'existe pas encore.
 * ==========================================================================*/
function annexes() {
  const e = Sim.editor; if (!e) return [];
  return e.state.zones.filter(z => z.kind === 'annexe' && z.visible !== false);
}
/* L'atelier du moteur derrière un identifiant de zone : lui-même, ou le parent
 * quand c'est une annexe. */
function serviceMoteur(id) {
  const a = annexes().find(z => z.id === id);
  return a ? a.parent : id;
}
/* La liste des services suit le plan : les annexes y figurent sous leur parent. */
function majPicker() {
  const picker = document.getElementById('zone-picker'); if (!picker) return;
  const garde = picker.value;
  picker.innerHTML = '<option value="">Vue d\u2019ensemble</option>';
  const ajoute = (id, nom, decale) => {
    const o = document.createElement('option');
    o.value = id; o.textContent = (decale ? '\u2514 ' : '') + nom; picker.appendChild(o);
  };
  Object.keys(ZONES).forEach(id => {
    ajoute(id, ZONES[id].nom, false);
    annexes().filter(a => a.parent === id).forEach(a => ajoute(a.id, a.nom, true));
  });
  // Une annexe dont l'atelier a disparu resterait invisible : on la remonte.
  annexes().filter(a => !ZONES[a.parent]).forEach(a => ajoute(a.id, a.nom, false));
  picker.value = garde;
  if (picker.value !== garde) picker.value = '';
}

/* Ce qui est décrit dans « Ateliers de travail », service par service.
 * Un service est « aménagé » dès qu'un atelier y fabrique quelque chose. */
function amenagementParService() {
  const c = Sim.ateliers, par = {};
  if (!c) return par;
  for (const a of c.state.ateliers) {
    const e = par[a.service] || (par[a.service] = { ateliers: 0, lots: 0, personnes: 0 });
    e.ateliers++; e.lots += a.lots.filter(l => l.length).length; e.personnes += a.personnes;
  }
  return par;
}

/* 'hors' = pas dans le calcul ; sinon progression du paramétrage. */
function etatParametrage(id, amenagement) {
  if (!Orly.ATELIERS.includes(id)) return 'hors';
  const gens = id === 'plonge' ? CFG.tunnels : (CFG.staff[id] || 0);
  if (!gens) return 'vide';
  return (amenagement[id] && amenagement[id].lots) ? 'pret' : 'partiel';
}

let _legendeCle = null;
function majEtatPlan() {
  const avant = now === DEBUT();
  document.body.classList.toggle('avant-lancement', avant);
  const compte = { vide:0, partiel:0, pret:0 };
  if (avant) {
    const amenagement = amenagementParService();
    Object.keys(ZONES).forEach(id => {
      const els = zoneEls[id]; if (!els) return;
      const etat = etatParametrage(id, amenagement);
      els.g.classList.remove('p-vide', 'p-partiel', 'p-pret', 'p-hors');
      els.g.classList.add('p-' + etat);
      if (etat !== 'hors') compte[etat]++;
    });
  }
  majLegende(avant, compte);
}

/* La légende change de sens avec le plan : on la réécrit plutôt que d'en
 * afficher deux, pour qu'il n'y ait jamais deux grilles de lecture à l'écran. */
function majLegende(avant, compte) {
  const box = document.getElementById('legende-plan'), etat = document.getElementById('plan-etat');
  if (!box) return;
  const cle = avant ? 'param:' + compte.vide + '/' + compte.partiel + '/' + compte.pret : 'charge';
  if (cle === _legendeCle) return;
  _legendeCle = cle;
  const puce = (coul, texte, titre) => '<span title="' + escapeHTML(titre) + '"><span class="pastille" style="background:' + coul + '"></span>' + escapeHTML(texte) + '</span>';
  if (avant) {
    box.setAttribute('aria-label', 'État de paramétrage des ateliers');
    box.innerHTML = puce('var(--bad-stroke)', ETATS_PARAM.vide.lib, ETATS_PARAM.vide.aide)
      + puce('var(--bordure2)', ETATS_PARAM.partiel.lib, ETATS_PARAM.partiel.aide)
      + puce('var(--accent)', ETATS_PARAM.pret.lib, ETATS_PARAM.pret.aide)
      + puce('transparent', 'Hors calcul', 'Service présent sur le plan mais sans charge calculée.');
    if (etat) {
      const n = compte.vide + compte.partiel;
      etat.textContent = n
        ? n + ' atelier(s) restent à aménager — onglet « Ateliers »'
        : 'Tous les ateliers simulés sont aménagés.';
      etat.className = 'plan-etat' + (n ? '' : ' complet');
    }
  } else {
    box.setAttribute('aria-label', 'Occupation mesurée');
    box.innerHTML = puce('var(--ok-stroke)', 'Faible', 'Moins de 55 % des personnes occupées sur 15 min.')
      + puce('var(--warn-stroke)', 'Soutenue', 'De 55 à 85 %.')
      + puce('var(--bad-stroke)', 'Forte', 'Plus de 85 %.')
      + puce('transparent', 'Hors calcul', 'Service présent sur le plan mais sans charge calculée.');
    if (etat) { etat.textContent = 'Couleurs d’occupation : le paramétrage reparaîtra après « Recommencer ».'; etat.className = 'plan-etat'; }
  }
}

/* ==========================================================================
 *  8. DASHBOARD
 * ==========================================================================*/
function majDashboard() {
  const k=kpis(), put=(id,v)=>document.getElementById(id).textContent=v;
  put('kpi-ontime',k.ontime==null?'—':k.ontime+' %');
  document.getElementById('kpi-ontime').className='val '+(k.ontime==null?'':k.ontime>=90?'bon':k.ontime>=70?'moyen':'mauvais');
  put('kpi-denom',k.exigibles?k.aHeure+' / '+k.exigibles+' départs à échéance atteinte':'Aucun départ exigible');
  put('kpi-overdue',k.overdue);document.getElementById('kpi-overdue').className='val '+(k.overdue?'mauvais':'');
  put('kpi-ready',k.prets+' / '+k.total+' dossiers terminés');
  put('kpi-retard',k.retardMoy==null?'—':k.retardMoy+' min');
  put('kpi-retard-exigibles',k.retardExigibles==null?'—':k.retardExigibles+' min');
  document.getElementById('kpi-debit').innerHTML=k.debit+' <small>plateaux/h</small>';
  document.getElementById('kpi-wip').innerHTML=k.wip+' <small>OF</small>';
  const box=document.getElementById('stats-ateliers');
  if(!box.children.length) ['appros','decontam','cuisine','prepa','dotation','plonge','armement','magasin','bobduty'].forEach(id=>{
    const b=document.createElement('button');b.className='stat-atelier';b.dataset.station=id;
    b.innerHTML='<div class="haut"><span>'+escapeHTML(ZONES[id].nom)+'<span class="badge-q"></span></span><b></b></div><div class="barre"><i></i></div>';
    b.addEventListener('click',()=>selectionner(id));box.appendChild(b);
  });
  box.querySelectorAll('[data-station]').forEach(b=>{
    const id=b.dataset.station,st=stations[id],u=Math.min(1,st.util),unmodeled=NON_MODELISES.has(id);
    b.querySelector('.haut>span').firstChild.textContent=ZONES[id].nom;
    b.classList.toggle('active',id===selection);b.setAttribute('aria-pressed',String(id===selection));
    b.querySelector('b').textContent=unmodeled?'Non simulé':now===DEBUT()?'—':Math.round(u*100)+' %'+(id==='prepa'?' · robot '+Math.round(Math.min(1,st.robotUtil)*100)+' %':'');
    b.querySelector('.badge-q').textContent=st.qlen?' · '+st.qlen+' OF':'';
    b.querySelector('.barre').hidden=unmodeled;
    b.querySelector('i').style.cssText='width:'+u*100+'%;background:'+couleurCharge(u);
  });
  majGoulotInfo(k.goulot);renderFlights();updateRunState();
}

function majGoulotInfo(goulot) {
  if(goulot===undefined)goulot=goulotCourant();
  const el=document.getElementById('goulot-info');let html='';
  if(!el.querySelector('[data-detail-body]'))el.innerHTML='<div class="detail-title"><strong></strong><button class="btn" data-clear-selection>Fermer</button></div><div data-detail-body></div>';
  el.querySelector('.detail-title').hidden=!selection;
  const annexe=selection&&!ZONES[selection]?annexes().find(a=>a.id===selection):null;
  el.querySelector('strong').textContent=annexe?annexe.nom:selection?ZONES[selection].nom:'';
  if(annexe){
    const pere=ZONES[annexe.parent];
    el.querySelector('[data-detail-body]').innerHTML='<p>Annexe de <strong>'+escapeHTML(pere?pere.nom:annexe.parent)+'</strong>\u00a0: ce qui y est trac\u00e9 et les personnes qu\u2019on y affecte comptent dans cet atelier. Elle ne forme pas une file d\u2019attente \u00e0 part.</p>';
    return;
  }
  if(selection){
    const id=selection,z=ZONES[id],st=stations[id];

    html+='<p>'+(z.approx?'Emplacement à confirmer.':'Emplacement enregistré ; validation terrain distincte.')+'</p>';
    if(NON_MODELISES.has(id))html+='<p>Charge non calculée dans cette version.</p>';
    else {
      html+='<p>'+st.qlen+' OF présents'+(id==='plonge'?' · '+CFG.tunnels+' tunnels':' · '+st.capacite+' personne(s) présentes')+(now>DEBUT()?' · occupation '+Math.round(Math.min(1,st.util)*100)+' % sur 15 min, '+Math.round(st.tauxJour*100)+' % depuis 05:00':'')+(st.pretes?' · <strong>'+st.pretes+' prêtée(s) par le vivier</strong>':'')+(st.enAttente?' · <strong>'+st.enAttente+' lot(s) attendent une personne</strong>':'')+(id==='prepa'&&now>DEBUT()?' · robot '+Math.round(Math.min(1,st.robotUtil)*100)+' % sur 15 min'+(st.robotAttente?', <strong>'+st.robotAttente+' vol(s) attendent le robot</strong>':''):'')
        +(id==='dotation'&&modele.stock?' · matériel propre '+Math.round(modele.stock.niveau)+' u'+(modele.stock.resume().retraitsEnAttente?', <strong>'+modele.stock.resume().retraitsEnAttente+' dossier(s) en attente</strong>':''):'')+(st.bloque?' · <strong>tampon plein : l’amont est bloqué</strong>':'')+'.</p>';
      const current=jobs.filter(j=>j.released&&!j.done&&j.stationId===id);
      const bil=modele.bilan().ateliers[id];
      if(bil)html+='<p class="mini-note">'+bil.heuresDemandees.toFixed(1)+' h demandées · '+bil.heuresRealisees.toFixed(1)+' h faites'
        +(bil.resteAFaire>1?' · <strong>'+(bil.resteAFaire/60).toFixed(1)+' h restant à faire</strong>':'')
        +' · '+bil.heuresPresence.toFixed(1)+' h de présence'
        +(bil.etpRealise!=null?' · '+bil.etpRealise.toFixed(2)+' ETP (heures ÷ '+CFG_ETP+')':' · heures de tunnel, pas d’ETP')+'</p>';
      html+=current.length?'<ul class="detail-jobs">'+current.slice(0,8).map(j=>'<li>'+escapeHTML(j.flight.id)+' · '+escapeHTML(j.kind)+' · échéance '+heureJour(j.dueT)+' · '+escapeHTML(modele.ETATS[modele.etatOF(j)])+'</li>').join('')+'</ul>':'<p>Aucun ordre de fabrication actif ici.</p>';
      if(current.length>8)html+='<p>Et '+(current.length-8)+' autre(s) OF.</p>';
    }
  } else if(now===DEBUT())html='Lancez la démonstration, puis sélectionnez un atelier ou ouvrez le suivi des vols.';
  else if(!goulot)html='Personne n’attend à cet instant : aucun poste ne contraint le flux.';
  else html='<strong>'+escapeHTML(goulot.nom)+'</strong><p>'+goulot.attente+' lot(s) en attente · '+escapeHTML(goulot.cause)+' · '+goulot.qlen+' OF présents. Mesuré, pas estimé : le goulot est le poste où l’on attend.</p>';
  if(el._detailHTML!==html){el.querySelector('[data-detail-body]').innerHTML=html;el._detailHTML=html;}
}

const chart = document.getElementById('chart');

function dessinerChart() {
  const ctx = chart.getContext('2d');
  const w = chart.width = chart.clientWidth, h = chart.height = 110;
  ctx.clearRect(0, 0, w, h);
  document.getElementById('chart-legend').textContent = historique.length<2 ? 'Les courbes apparaîtront après 20 minutes simulées.' : 'Bleu : débit robot (0–'+Math.max(560,...historique.map(p=>p.debit))+' plateaux/h). Violet : encours (0–'+Math.max(10,...historique.map(p=>p.wip))+' OF). Échelles distinctes.';
  if (historique.length < 2) return;
  const t0 = DEBUT(), t1 = FIN();
  const maxDebit = Math.max(560, ...historique.map(p => p.debit));
  const maxWip = Math.max(10, ...historique.map(p => p.wip));
  const X = t => (t - t0) / (t1 - t0) * w;
  // couleurs reprises du thème courant
  const cs = getComputedStyle(document.documentElement);
  const cv = n => cs.getPropertyValue(n).trim();
  ctx.strokeStyle = cv('--chart-grid'); ctx.fillStyle = cv('--txt3'); ctx.font = '600 10px sans-serif';
  for (let hh = 6; hh <= 22; hh += 4) { const x = X(hh*60); ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h-12); ctx.stroke(); ctx.fillText(hh+'h', x+2, h-2); }
  ctx.beginPath(); ctx.moveTo(X(historique[0].t), h-12);
  historique.forEach(p => ctx.lineTo(X(p.t), (h-12) - (p.wip/maxWip)*(h-20)));
  ctx.lineTo(X(historique[historique.length-1].t), h-12); ctx.closePath();
  ctx.fillStyle = cv('--chart-aire'); ctx.fill();
  ctx.beginPath(); ctx.strokeStyle = cv('--chart-line'); ctx.lineWidth = 2.2;
  historique.forEach((p,i) => { const x=X(p.t), y=(h-12)-(p.debit/maxDebit)*(h-20); i?ctx.lineTo(x,y):ctx.moveTo(x,y); });
  ctx.stroke();
  ctx.strokeStyle = cv('--chart-now'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(X(now),0); ctx.lineTo(X(now),h-12); ctx.stroke();
}

/* ==========================================================================
 *  9. BOUCLE TEMPS RÉEL
 * ==========================================================================*/
let dernierReel = 0, accHist = 0;
function boucle(ts) {
  if (!enMarche) return;
  const dtReel = Math.min(0.1, (ts - dernierReel) / 1000); dernierReel = ts;
  pendingTime += dtReel * vitesse;
  while (pendingTime >= 0.5 && now < FIN()) {
    const p = Math.min(0.5,FIN()-now); step(p); pendingTime -= p; accHist += p;
    if (accHist >= 10) { accHist = 0; historique.push({ t:now, debit:Math.round((Sim.robotRate||0)*60), wip:jobs.filter(j=>j.released&&!j.done).length }); }
  }
  animerTokens(); majHorloge(); majPlan(); majDashboard(); dessinerChart();
  if (now >= FIN()) { pause(); toast(MULTIJOUR()?'Journées simulées terminées':'Journée simulée terminée'); return; }
  frameId=requestAnimationFrame(boucle);
}
function majHorloge() {
  const minutes = ((Math.floor(now) % 1440) + 1440) % 1440;
  const heure = String(Math.floor(minutes/60)).padStart(2,'0') + ':' + String(minutes%60).padStart(2,'0');
  document.getElementById('horloge').textContent = MULTIJOUR() ? modele.etiquetteJour(now) + ' ' + heure : heure;
}

/* ==========================================================================
 *  10. CONTRÔLES
 * ==========================================================================*/
function lancer() {
  if (enMarche || editMode) return; if (now >= FIN()) reset();
  // Les réglages sont lus à la construction du modèle : on le reconstruit au
  // départ, pour que les curseurs touchés avant « Lancer » soient pris en compte.
  if (now === DEBUT()) build(Sim.dataCourante || SAMPLE);
  if(!runConfig)runConfig=JSON.parse(JSON.stringify(CFG));
  enMarche = true; dernierReel = performance.now();
  const b = document.getElementById('btn-play'); b.textContent = '⏸ Pause'; b.className = 'btn btn-pause';
  updateRunState();frameId=requestAnimationFrame(boucle);
}
function pause() {
  enMarche = false;
  if(frameId!==null){cancelAnimationFrame(frameId);frameId=null;}
  const b = document.getElementById('btn-play'); b.textContent = now>=FIN()?'▶ Relancer':now===DEBUT()?'▶ Lancer':'▶ Reprendre'; b.className = 'btn btn-play';
  updateRunState();
}
function basculer() { enMarche ? pause() : lancer(); }
function reset(data) {
  pause(); historique = [];pendingTime=0;accHist=0;runConfig=null; tokens.forEach(t=>t.el.remove()); tokens = [];
  build(data || Sim.dataCourante || SAMPLE);
  const b = document.getElementById('btn-play'); b.textContent = '▶ Lancer'; b.className = 'btn btn-play';
  majHorloge(); majPlan(); majDashboard(); dessinerChart();
}
function toast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(()=>t.classList.remove('on'), 1800);
}

function initControles() {
  const box = document.getElementById('sliders-staff');
  Object.keys(CFG.staff).forEach(id => {
    const d = document.createElement('div'); d.className = 'slider-ligne';
    d.innerHTML = '<label for="staff-' + id + '">' + ZONES[id].nom + ' <b id="s-' + id + '">' + CFG.staff[id] + '</b></label><input id="staff-' + id + '" type="range" min="0" max="40" value="' + CFG.staff[id] + '" data-id="' + id + '">';
    box.appendChild(d);
    d.querySelector('input').addEventListener('input', e => { CFG.staff[id] = +e.target.value; majSoirLibelle(id); majPlan(); majDashboard(); });
  });
  // Relève d'équipe : effectif du soir par atelier, « comme le matin » tant qu'on n'y touche pas.
  const det = document.createElement('details'); det.className = 'equipe-soir'; det.id = 'equipe-soir';
  det.innerHTML = '<summary>Équipe du soir <b id="bascule-lab">à partir de 14:00</b></summary>' +
    '<div class="champ"><span>Heure de relève</span><input id="bascule" type="time" value="14:00" step="300" aria-label="Heure de relève des équipes"></div>' +
    '<p class="mini-note">Les curseurs ci-dessus sont l’équipe du matin. Un curseur du soir non touché suit le matin. Personne n’est interrompu à la relève : les places en trop se ferment au fil des libérations.</p>';
  box.appendChild(det);
  const majSoirLibelle = id => { const b = document.getElementById('so-' + id); if (!b) return; const v = CFG.equipes.soir[id]; b.textContent = v === undefined ? CFG.staff[id] + ' (comme le matin)' : v; const r = document.getElementById('soir-' + id); if (r && v === undefined) r.value = CFG.staff[id]; };
  Object.keys(CFG.staff).forEach(id => {
    if (NON_MODELISES.has(id)) return;
    const d = document.createElement('div'); d.className = 'slider-ligne';
    d.innerHTML = '<label for="soir-' + id + '">' + ZONES[id].nom + ' <b id="so-' + id + '"></b></label><input id="soir-' + id + '" type="range" min="0" max="40" value="' + CFG.staff[id] + '" data-id="' + id + '" data-soir="1">';
    det.appendChild(d);
    d.querySelector('input').addEventListener('input', e => { CFG.equipes.soir[id] = +e.target.value; majSoirLibelle(id); });
    majSoirLibelle(id);
  });
  det.querySelector('#bascule').addEventListener('change', e => {
    const m = /^(\d{2}):(\d{2})$/.exec(e.target.value); if (!m) { e.target.value = formatTime(CFG.equipes.bascule); return; }
    CFG.equipes.bascule = (+m[1]) * 60 + (+m[2]); document.getElementById('bascule-lab').textContent = 'à partir de ' + e.target.value;
  });
  const bind = (id, fn) => document.getElementById(id).addEventListener('input', fn);
  bind('vitesse', e => { vitesse = +e.target.value; document.getElementById('vitesse-val').textContent = vitesse + '×'; });
  bind('robot', e => { CFG.robotCadence = +e.target.value; document.getElementById('robot-val').textContent = e.target.value + ' pl/h'; majPlan(); });
  bind('yc-manuel', e => { CFG.ycManuel = +e.target.value; document.getElementById('yc-manuel-val').textContent = (+e.target.value).toFixed(2).replace('.', ',') + ' min/plateau'; });
  document.getElementById('robot-cies').addEventListener('change', e => {
    CFG.robotCompagnies = e.target.value.split(/[\s,;]+/).map(v => v.trim().toUpperCase()).filter(Boolean);
    e.target.value = CFG.robotCompagnies.join(', ');
    if (now === DEBUT()) { build(Sim.dataCourante || SAMPLE); majDashboard(); }
  });
  // Contenance des ateliers : une case par atelier modélisé, vide = illimitée.
  const tb = document.getElementById('tampons');
  Orly.ATELIERS.forEach(id => {
    const d = document.createElement('div'); d.className = 'champ';
    d.innerHTML = '<span>' + escapeHTML(ZONES[id].nom) + '</span><input id="tampon-' + id + '" type="number" min="1" step="1" placeholder="illimitée" aria-label="Contenance de l\'atelier ' + escapeHTML(ZONES[id].nom) + ' en ordres de fabrication">';
    tb.appendChild(d);
    d.querySelector('input').addEventListener('change', e => {
      const v = parseInt(e.target.value, 10);
      if (v > 0) CFG.tampons[id] = v; else { delete CFG.tampons[id]; e.target.value = ''; }
    });
  });
  bind('tunnels', e => { CFG.tunnels = +e.target.value; document.getElementById('tunnels-val').textContent = e.target.value; majPlan(); });
  bind('robot-lignes', e => {
    CFG.robotLignes = +e.target.value;
    document.getElementById('robot-lignes-val').textContent = e.target.value;
    if (now === DEBUT()) { build(Sim.dataCourante || SAMPLE); majPlan(); majDashboard(); }
  });
  document.getElementById('double').addEventListener('change', e => { CFG.tunnelDouble = e.target.checked; majPlan(); });
  bind('materiel', e => { CFG.materiel.initial = +e.target.value; document.getElementById('materiel-val').textContent = e.target.value + ' u'; });
  /* Effectifs déduits de l'aménagement : somme des personnes affectées aux
   * équipements de chaque service. La grille ne pilote QUE les services où
   * elle est renseignée ; partout ailleurs le curseur reste la référence.
   * C'est ce qui évite d'avoir à choisir entre les deux : un service non
   * aménagé ne tombe pas à zéro parce qu'un autre l'a été. */
  // La grille d'équipements a été abandonnée : personnes, tunnels et lignes
  // robot se décrivent désormais atelier par atelier, dans « Ateliers de
  // travail ». Les curseurs ci-dessous ne pilotent plus que l'ancien calcul
  // de la vue Simulation.
  // Vivier polyvalent : un effectif et les ateliers qu'il peut servir.
  const AT_VIVIER = Orly.ATELIERS.filter(id => id !== 'plonge');
  const boiteVivier = document.getElementById('vivier-ateliers');
  AT_VIVIER.forEach(id => {
    const l = document.createElement('label'); l.className = 'chk chk-mini';
    l.innerHTML = '<input type="checkbox" data-vivier="' + id + '"> ' + escapeHTML(ZONES[id].nom);
    boiteVivier.appendChild(l);
  });
  const majVivier = () => {
    const effectif = +document.getElementById('vivier').value;
    const ateliers = [...boiteVivier.querySelectorAll('[data-vivier]:checked')].map(c => c.dataset.vivier);
    CFG.viviers = effectif > 0 && ateliers.length ? [{ nom:'Polyvalents', effectif, ateliers }] : [];
    document.getElementById('vivier-val').textContent = effectif + (effectif && !ateliers.length ? ' — cochez un atelier' : '');
    if (now === DEBUT()) { build(Sim.dataCourante || SAMPLE); majPlan(); majDashboard(); }
  };
  bind('vivier', majVivier);
  boiteVivier.addEventListener('change', majVivier);
  const majCal = () => {
    document.getElementById('cal-detail').hidden = !CFG.calendrier.actif;
    if (now === DEBUT()) { build(Sim.dataCourante || SAMPLE); majHorloge(); majPlan(); majDashboard(); dessinerChart(); }
  };
  document.getElementById('calendrier').addEventListener('change', e => { CFG.calendrier.actif = e.target.checked; majCal(); });
  bind('cal-jours', e => { CFG.calendrier.jours = +e.target.value; document.getElementById('cal-jours-val').textContent = e.target.value + ' j'; majCal(); });
  bind('shift', e => { CFG.shift = +e.target.value; document.getElementById('shift-val').textContent = (e.target.value>0?'+':'') + e.target.value + ' min'; reset(); });
  document.getElementById('loadDelay').addEventListener('change',e=>{if(!e.target.checkValidity() || !e.target.value){e.target.value=CFG.loadDelay;toast('Délai attendu : 10 à 120 minutes');return;}CFG.loadDelay=+e.target.value;reset();});
  document.getElementById('btn-play').addEventListener('click', basculer);
  document.getElementById('btn-reset').addEventListener('click', () => { if(now>DEBUT() && !confirm('Recommencer à 05:00 ? La progression actuelle sera effacée ; les instantanés A/B seront conservés.'))return;reset(); toast('Simulation réinitialisée ; réglages disponibles'); });
  document.getElementById('btn-export').addEventListener('click', exporter);
  document.getElementById('snap-a').addEventListener('click', () => capturer('A'));
  document.getElementById('snap-b').addEventListener('click', () => capturer('B'));
  document.getElementById('snap-clear').addEventListener('click', () => { snaps = {}; majCompare(); });
  document.getElementById('imp-vols').addEventListener('change', importVols);
  document.getElementById('sauvegarde-export').addEventListener('click', sauvegardeComplete);
  document.getElementById('sauvegarde-import-btn').addEventListener('click', () => document.getElementById('sauvegarde-import').click());
  document.getElementById('sauvegarde-import').addEventListener('change', restaurerSauvegarde);
  window.addEventListener('resize', dessinerChart);
  // zoom / fond de plan
  document.getElementById('zoom-in').addEventListener('click', () => zoomer(1.25));
  document.getElementById('zoom-out').addEventListener('click', () => zoomer(1/1.25));
  document.getElementById('zoom-reset').addEventListener('click', vueEnsemble);
  document.getElementById('zoom-fit').addEventListener('click', () => {
    const id = selection;
    if (id && ZONES[id]) cadrerZone(ZONES[id]); else toast('Choisissez d’abord un service.');
  });
  document.getElementById('fond-plan').addEventListener('change', e => {
    svg.classList.toggle('sans-fond', !e.target.checked);
  });
  initTheme();
}

/* --- Thème clair / sombre ------------------------------------------------- */
function appliquerTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const b = document.getElementById('btn-theme');
  b.textContent = t === 'dark' ? 'Clair' : 'Sombre';
  b.title = t === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre';b.setAttribute('aria-label',b.title);
  try { localStorage.setItem('orly-theme', t); } catch (e) { /* stockage indisponible */ }
  dessinerChart();
}
function initTheme() {
  let t = 'light';
  try { t = localStorage.getItem('orly-theme') || 'light'; } catch (e) { /* stockage indisponible */ }
  appliquerTheme(t);
  document.getElementById('btn-theme').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    appliquerTheme(cur === 'dark' ? 'light' : 'dark');
  });
}

/* --- Scénarios A / B : deux journées complètes rejouées à l'identique ------
 *  Une capture enregistre les réglages et les vols du moment, puis REJOUE LA
 *  JOURNÉE ENTIÈRE sans interface (quelques dizaines de millisecondes). Deux
 *  captures se comparent donc à conditions égales : mêmes vols, aucun aléa,
 *  seuls les réglages diffèrent. Ce n'est plus une photographie à un instant.
 * ------------------------------------------------------------------------- */
let snaps = {};
function capturer(slot) {
  const config=JSON.parse(JSON.stringify(runConfig||CFG));
  const data=JSON.parse(JSON.stringify(Sim.dataCourante));
  const r=Orly.simulerJournee(data,config,serviceMetrics);
  const b=r.bilan;
  snaps[slot]={time:instantDu(r.modele,r.modele.horizon),source:dataSource,config,data,kpis:r.kpis,bilan:b,
    ontime:r.kpis.ontime,retard:r.kpis.retardMoy,overdue:r.kpis.overdue,
    robot:config.robotCadence,robotCies:(config.robotCompagnies||[]).join(', ')||'aucune',ycManuel:config.ycManuel,
    tampons:Object.keys(config.tampons||{}).map(k=>ZONES[k].nom+' '+config.tampons[k]).join(', ')||'illimitées',
    materiel:config.materiel&&config.materiel.actif?config.materiel.initial+' u':'non modélisé',
    vivier:(config.viviers||[]).length?config.viviers[0].effectif+' pers. · '+config.viviers[0].ateliers.map(k=>ZONES[k].nom).join(', '):'aucun',
    vivierPretes:b.viviers&&b.viviers.length?Math.round(b.viviers[0].minutesPretees):null,
    heuresDemandees:b.charge?b.charge.heuresDemandees.toFixed(1):null,
    heuresFaites:b.charge?b.charge.heuresRealisees.toFixed(1):null,
    etpRealise:b.charge?b.charge.etpRealise.toFixed(2):null,
    resteAFaire:b.charge?b.charge.heuresResteAFaire.toFixed(1):null,
    calendrier:config.calendrier&&config.calendrier.actif?config.calendrier.jours+' journées de départs, cuisine J−2 et prépa J−1':'journée unique',
    materielMin:b.materiel?Math.round(b.materiel.niveauMin):null,
    materielRupture:b.materiel?Math.round(b.materiel.partEnRupture*100):null,
    prepa:config.staff.prepa,tunnels:config.tunnels+(config.tunnelDouble?' (1×2)':''),
    soir:Object.keys((config.equipes||{}).soir||{}).filter(k=>config.equipes.soir[k]!==config.staff[k]).map(k=>ZONES[k].nom+' '+config.equipes.soir[k]).join(', ')||'comme le matin',
    robotJour:Math.round((b.robot.occupationJour||0)*100),robotP90:b.robot.attenteP90==null?null:Math.round(b.robot.attenteP90),
    prepaJour:Math.round((b.ateliers.prepa.occupationJour||0)*100),cuisineJour:Math.round((b.ateliers.cuisine.occupationJour||0)*100),
    plongeJour:Math.round((b.ateliers.plonge.occupationJour||0)*100)};
  majCompare();toast('Scénario '+slot+' : '+(r.modele.joursProduction>1?r.modele.joursProduction+' journées rejouées':'journée rejouée jusqu’à '+formatTime(config.jour.fin)));
}
function majCompare() {
  const lignes = [
    ['Journée simulée jusqu’à','time'],
    ['Robot pl/h','robot'],['Compagnies servies par le robot','robotCies'],['YC manuel, min/plateau','ycManuel'],['Contenances','tampons'],['Matériel propre à l’ouverture','materiel'],['Vivier polyvalent','vivier'],['Calendrier','calendrier'],['Personnes au montage (matin)','prepa'],['Équipe du soir','soir'],['Tunnels de plonge','tunnels'],
    ['Prêts à l’échéance','ontime','%'],['Échéances dépassées en fin de journée','overdue'],['Retard moyen des dossiers','retard','min'],
    ['Heures demandées (hors plonge)','heuresDemandees','h'],['Heures faites','heuresFaites','h'],
    ['Reste à faire','resteAFaire','h'],['Équivalent ETP','etpRealise'],
    ['Robot occupé sur la journée','robotJour','%'],['Attente du robot, p90','robotP90','min'],
    ['Montage occupé sur la journée','prepaJour','%'],['Cuisine occupée sur la journée','cuisineJour','%'],['Plonge occupée sur la journée','plongeJour','%'],
    ['Minutes prêtées par le vivier','vivierPretes','min'],['Matériel propre, plus bas niveau','materielMin','u'],['Part du temps en rupture de matériel','materielRupture','%']
  ];
  // `l[2]` est une UNITÉ à suffixer, rien d'autre. L'instant de fin est déjà
  // formaté à la capture, chaque instantané portant son propre libellé de jour.
  const cell=(sn,l)=>{ if(!sn)return '—'; const v=sn[l[1]]; if(v==null)return '—'; return v+(l[2]?' '+l[2]:''); };
  let html = '<thead><tr><th>Indicateur</th><th>A</th><th>B</th></tr></thead><tbody>';
  lignes.forEach(l => {
    const a=cell(snaps.A,l), b=cell(snaps.B,l);
    const diff=snaps.A&&snaps.B&&a!==b&&l[1]!=='time';
    html += '<tr'+(diff?' class="diff"':'')+'><td>' + l[0] + '</td><td>' + a + '</td><td>' + b + '</td></tr>';
  });
  document.getElementById('compare').innerHTML = html+'</tbody>';
  let note='Chaque capture rejoue la journée entière avec les réglages du moment : mêmes vols, aucun aléa, seuls les réglages diffèrent.';
  if(snaps.A&&snaps.B&&snaps.A.source!==snaps.B.source)note='Les deux scénarios n’utilisent pas les mêmes vols ('+snaps.A.source+' / '+snaps.B.source+') : la comparaison porte sur des journées différentes.';
  else if(snaps.A&&snaps.B&&JSON.stringify(snaps.A.config)===JSON.stringify(snaps.B.config))note='Réglages identiques : les deux journées sont exactement les mêmes, au chiffre près.';
  document.getElementById('compare-note').textContent=note+' Barème non calibré : comparer des scénarios entre eux, pas à la réalité.';
}

/* ==========================================================================
 *  SAUVEGARDE COMPLÈTE
 *  Le tracé de l'unité vit dans le navigateur, réparti sur quatre clés et
 *  quatre boutons d'export. Quatre fichiers à ne pas perdre, c'est trois de
 *  trop. Un seul fichier les réunit, et il se relit en entier ou pas du tout.
 *
 *  ⚠ Ce fichier CONTIENT LE PLAN RÉEL de l'unité : il ne doit jamais être
 *  commité. `.gitignore` refuse `ory-sauvegarde*.json`.
 * ==========================================================================*/
const PARTIES = [
  { cle:'orly-plan-v3',     nom:'plan et zones',           valider:r => window.OrlyPlan.validatePlan(r, Sim.editor.originals) },
  { cle:'ory-ateliers-v1',  nom:'ateliers de travail',     valider:r => window.OrlyAteliers.valider(r) },
  { cle:'orly-flows-v1',    nom:'centre des flux',         valider:r => window.OrlyFlows.validate(r) },
  { cle:'ory-postes-v2',    nom:'bibliothèque de modèles',
    valider:r => { if(!r || !Array.isArray(r.modeles)) throw new Error('bibliothèque illisible'); return r; } }
];

function sauvegardeComplete() {
  const contenu = {}; let parties = 0;
  PARTIES.forEach(p => {
    let brut = null;
    try { brut = localStorage.getItem(p.cle); } catch (e) { /* stockage indisponible */ }
    if (!brut) return;
    try { contenu[p.cle] = JSON.parse(brut); parties++; } catch (e) { /* clé illisible : ignorée */ }
  });
  if (!parties) { toast('Rien à sauvegarder pour l’instant.'); return; }
  const jour = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify({ schema:'ory-sauvegarde', version:1, date:new Date().toISOString(), contenu }, null, 2)],
    { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'ory-sauvegarde-' + jour + '.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  const r = document.getElementById('sauvegarde-etat');
  r.classList.remove('error');
  r.textContent = parties + ' partie(s) enregistrée(s). Ce fichier contient le plan réel : gardez-le hors du dépôt.';
  toast('Sauvegarde complète téléchargée');
}

async function restaurerSauvegarde(e) {
  const file = e.target.files[0]; if (!file) return;
  const r = document.getElementById('sauvegarde-etat');
  const refuser = m => { r.classList.add('error'); r.textContent = 'Restauration refusée : ' + m + ' Rien n’a été remplacé.'; };
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error('fichier trop volumineux (maximum 20 Mo).');
    const brut = JSON.parse(await file.text());
    if (!brut || brut.schema !== 'ory-sauvegarde' || brut.version !== 1 || !brut.contenu || typeof brut.contenu !== 'object') {
      throw new Error('ce n’est pas une sauvegarde complète.');
    }
    // TOUT valider avant d'écrire QUOI QUE CE SOIT : une sauvegarde à moitié
    // restaurée serait pire qu'un refus.
    const aEcrire = [];
    for (const p of PARTIES) {
      const part = brut.contenu[p.cle];
      if (part === undefined) continue;
      try { p.valider(JSON.parse(JSON.stringify(part))); }
      catch (err) { throw new Error(p.nom + ' — ' + err.message); }
      aEcrire.push([p.cle, JSON.stringify(part)]);
    }
    if (!aEcrire.length) throw new Error('la sauvegarde ne contient aucune partie connue.');
    if (!confirm('Remplacer le plan, les ateliers et les flux enregistrés dans ce navigateur par cette sauvegarde (' +
      aEcrire.length + ' partie(s)) ? La page sera rechargée.')) { e.target.value = ''; return; }
    aEcrire.forEach(([cle, valeur]) => localStorage.setItem(cle, valeur));
    location.reload();
  } catch (err) { refuser(err.message); }
  finally { e.target.value = ''; }
}

function importVols(e) {
  const file=e.target.files[0];if(!file)return;
  const report=document.getElementById('import-report');
  const fail=message=>{report.classList.add('error');report.textContent=message;};
  if(file.size>2*1024*1024){fail('Fichier trop volumineux (maximum 2 Mo). Aucune donnée remplacée.');e.target.value='';return;}
  const rd=new FileReader();
  // BUG-005 : vider le champ aussi en cas d'échec de lecture, sinon resélectionner
  // le même fichier ne déclenche plus `change` et l'application semble muette.
  rd.onerror=()=>{fail('Lecture du fichier impossible. Aucune donnée remplacée.');e.target.value='';};
  rd.onload=()=>{
    try {
      const data=parseVols(rd.result);
      if(now>DEBUT() && !confirm('Importer ce fichier et recommencer à 05:00 ? La progression et les instantanés seront effacés.'))return;
      Sim.dataCourante=data;dataSource=file.name;snaps={};majCompare();reset(data);updateSource();
      report.classList.remove('error');report.textContent=data.length+' lignes importées. '+data.filter(f=>f.sens==='DEP').length+' départs et '+data.filter(f=>f.sens==='RET').length+' retours. Calcul de démonstration uniquement.';
      if(data.some(f=>f.sens==='DEP'&&(f.std+CFG.shift-CFG.loadDelay<CFG.jour.debut || f.std+CFG.shift-CFG.loadDelay>CFG.jour.fin)))report.textContent+=' Certaines échéances sont hors de la fenêtre 05:00–23:00.';
    } catch(err){fail(err.message);}
    finally{e.target.value='';}
  };
  rd.readAsText(file);
}
function parseVols(txt) { return parseFlights(txt); }
function exporter() {
  const k = kpis();
  const data = { avertissement:'DÉMONSTRATION — paramètres non calibrés, résultats non exploitables pour décider.',schemaVersion:'0.4',modelStatus:'demonstration_non_calibree',source:dataSource,
    limites:['Calendrier J−1/J−2 non intégré','Barème d’homme-minutes non calibré','Contenances des tampons à renseigner (illimitées par défaut)','Stocks et compétences non modélisés'],
    horaire:document.getElementById('horloge').textContent,termine:now>=FIN(),config:runConfig||CFG,entrees:Sim.dataCourante,instantanes:snaps,kpis:k,
    vols:flights.map(f => { const x=f.sens==='DEP'&&modele?modele.expliquer(f):null; return { id:f.id, sens:f.sens, robot:!!f.robot, due:f.due, readyTime:f.readyTime, retard:f.sens==='DEP'&&f.readyTime!=null?f.retard:null, statut:f.sens==='DEP'?flightStatus(f,now).key:'retour',
      explication:x?{ of:x.of, phrase:x.phrase, attenteEntree:x.attenteEntree, attentePersonnes:x.attentePersonnes, attenteRobot:x.attenteRobot, attenteAval:x.attenteAval, travail:x.travail, parAtelier:x.parAtelier }:null }; }),
    journal:modele?modele.journal():[],
    ateliers:Object.keys(ZONES).reduce((o,id)=>{ o[id]={occupation15min:NON_MODELISES.has(id)?null:Math.round(stations[id].util*100),occupationJour:NON_MODELISES.has(id)?null:Math.round(stations[id].tauxJour*100),ordresActifs:NON_MODELISES.has(id)?null:stations[id].qlen}; return o; }, {}),
    mesures:modele?modele.bilan():null };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'newrest-orly-resultats.json'; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Résultat de démonstration exporté');
}

/* Workbench navigation and operational reading of the demonstrator. */
/* Instant lisible. En multijour, l'étiquette est celle du CALENDRIER (J−2, J,
 * J+1), pas le numéro de journée de calcul : un vol du premier jour de départs
 * part « J », même si la production a commencé deux jours plus tôt. */
function instantDu(m, t) {
  if (t == null || !Number.isFinite(t)) return '—';
  if (!m || m.joursProduction <= 1) return formatTime(t);
  const minutes = ((Math.floor(t) % 1440) + 1440) % 1440;
  return m.etiquetteJour(t) + ' ' + String(Math.floor(minutes/60)).padStart(2,'0') + ':' + String(minutes%60).padStart(2,'0');
}
function heureJour(t) { return instantDu(modele, t); }
function formatTime(t) {
  if(t==null || !Number.isFinite(t))return '—';
  const day=Math.floor(t/1440),minutes=((Math.floor(t)%1440)+1440)%1440;
  return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0')+(day?' (J'+(day>0?'+':'')+day+')':'');
}
function showPanel(name) {
  // Réglages et Données décrivent l'essai : tous deux vivent dans l'onglet large.
  if(name==='reglages'||name==='donnees'){showView('reglages');return;}
  // La colonne de droite est masquée dans le Centre des réglages : demander le
  // suivi depuis là doit ramener à une vue où il est visible.
  if(activeView==='reglages')showView('plan');
  activePanel=name;
  document.getElementById('panel-suivi').hidden=name!=='suivi';
  if(name==='suivi')dessinerChart();
}
/* Les réglages sortent du panneau étroit de droite pour occuper toute la
 * largeur, comme le Centre des flux. On DÉPLACE le nœud existant : toutes les
 * liaisons se font par identifiant, elles continuent de fonctionner telles quelles. */
function installerCentreReglages() {
  const hote=document.getElementById('view-reglages'),bloc=document.getElementById('panel-reglages'),
        donnees=document.getElementById('panel-donnees');
  if(!hote||!bloc)return;
  bloc.hidden=false;bloc.classList.remove('panel-content');bloc.classList.add('reglages-grille');
  const titre=document.createElement('div');titre.className='reglages-entete';
  // Pas de second titre : l'en-tête de vue dit déjà « Centre des réglages ».
  titre.innerHTML='<p class="mini-note">Tout ce qui décrit l’unité et l’essai à lancer. Les réglages se verrouillent une fois la simulation commencée : <strong>Recommencer</strong> les libère.</p>';
  hote.appendChild(titre);hote.appendChild(bloc);
  // Le programme de vols, la sauvegarde et le périmètre décrivent l'essai eux
  // aussi : les laisser dans la colonne étroite obligeait à changer de vue pour
  // préparer une seule et même chose. La colonne ne garde que le suivi vivant.
  if(donnees){
    donnees.hidden=false;donnees.classList.remove('panel-content');donnees.classList.add('reglages-grille');
    const sous=document.createElement('h2');sous.className='reglages-titre';
    sous.textContent='Données, sauvegarde et périmètre';
    hote.appendChild(sous);hote.appendChild(donnees);
  }
}
function showView(name) {
  if(editMode && name!=='plan')return;
  activeView=name;
  document.body.dataset.vue=name;
  document.getElementById('view-title').textContent=({plan:'Simulation',ateliers:'Ateliers de travail',flux:'Centre des flux',reglages:'Centre des réglages',vols:'Suivi des vols'})[name];
  if(name==='ateliers'){pause();if(Sim.ateliers)Sim.ateliers.rendre();}
  document.body.classList.toggle('ateliers-open',name==='ateliers');
  document.getElementById('view-ateliers').hidden=name!=='ateliers';
  document.getElementById('btn-play').disabled=name==='ateliers'||editMode;
  document.body.classList.toggle('flows-open',name==='flux');
  document.getElementById('view-flux').hidden=name!=='flux';
  document.getElementById('view-reglages').hidden=name!=='reglages';
  if(name==='flux'&&Sim.flows)Sim.flows.refresh();
  document.body.classList.toggle('reglages-open',name==='reglages');
  document.getElementById('view-plan').hidden=name!=='plan';
  document.getElementById('view-vols').hidden=name!=='vols';
  document.querySelector('.plan-tete').hidden=name!=='plan';
  document.querySelector('.map-footer').hidden=name!=='plan';
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===name);b.setAttribute('aria-pressed',String(b.dataset.view===name));});
  if(name==='vols')renderFlights();
}
function updateSource() {
  document.getElementById('source-label').textContent=dataSource;
  document.getElementById('source-count').textContent=flights.filter(f=>f.sens==='DEP').length+' départs · '+flights.filter(f=>f.sens==='RET').length+' retours';
  document.getElementById('flight-count').textContent=flights.filter(f=>f.sens==='DEP').length;
}
function updateRunState() {
  const started=enMarche||now>DEBUT();
  document.getElementById('run-state').textContent=editMode?'Édition du plan':now>=FIN()?'Terminé':enMarche?'En cours':started?'En pause':'Prêt à lancer';
  document.querySelectorAll('#sliders-staff input,#robot,#robot-lignes,#robot-cies,#yc-manuel,#tampons input,#tunnels,#double,#materiel,#vivier,#vivier-ateliers input,#calendrier,#cal-jours,#shift,#loadDelay').forEach(input=>{
    const parGrille=false;   // plus aucun réglage n'est repris d'ailleurs
    input.disabled=started||NON_MODELISES.has(input.dataset.id)||parGrille;
    input.title=NON_MODELISES.has(input.dataset.id)?'Service non relié au calcul actuel':parGrille?'Repris de « Création des ateliers ». Décochez pour régler ici.':started?'Recommencez la simulation pour modifier les réglages':'';
  });
  document.querySelectorAll('[data-view]').forEach(b=>b.disabled=editMode&&b.dataset.view!=='plan');
}
function renderFlights() {
  if(activeView!=='vols')return;
  const search=document.getElementById('flight-search').value.trim().toLowerCase();
  const filter=document.getElementById('flight-filter').value;
  const rows=flights.filter(f=>f.sens==='DEP').filter(f=>{
    const st=flightStatus(f,now).key;
    return (!search||(f.id+' '+f.cie).toLowerCase().includes(search)) && (filter==='all'||filter==='ready'&&f.readyTime!=null||filter==='pending'&&f.readyTime==null||filter==='overdue'&&st==='overdue');
  }).sort((a,b)=>a.due-b.due);
  const html=rows.map(f=>{
    const status=flightStatus(f,now),pending=jobs.filter(j=>j.flight===f&&!j.done);
    // En cours : chaque OF dit où il est et ce qu'il attend. Terminé : l'OF qui
    // a fixé l'heure explique où il a attendu (mesures séparées, pas un total).
    let operations;
    if(pending.length)operations=pending.map(j=>{const et=modele.etatOF(j);return j.kind+(j.released&&j.stationId?' · '+ZONES[j.stationId].nom:'')+' · '+modele.ETATS[et];}).join(' — ');
    else {const x=modele.expliquer(f);operations=x?x.phrase:'Toutes terminées';}
    return '<tr><td><strong>'+escapeHTML(f.id)+'</strong><small>'+escapeHTML(f.cie)+(f.robot?' · robot':' · manuel')+'</small></td><td>'+heureJour(f.stdAbs!=null?f.stdAbs:f.std+CFG.shift)+'</td><td>'+heureJour(f.due)+'</td><td><span class="status '+status.key+'">'+status.label+'</span>'+(f.readyTime!=null?'<small>Prêt à '+heureJour(f.readyTime)+'</small>':'')+'</td><td>'+escapeHTML(operations)+'</td></tr>';
  }).join('') || '<tr><td colspan="5" class="empty-state">Aucun départ ne correspond à ces filtres.</td></tr>';
  const body=document.getElementById('flight-rows');if(body.innerHTML!==html)body.innerHTML=html;
}
function initWorkbench() {
  document.querySelectorAll('[data-panel]').forEach(b=>b.addEventListener('click',()=>showPanel(b.dataset.panel)));
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
  document.getElementById('btn-limits').addEventListener('click',()=>{
    if(editMode)basculerEdition();showPanel('donnees');document.getElementById('model-limits').scrollIntoView({block:'nearest'});
  });
  document.getElementById('edit-done').addEventListener('click',()=>{if(editMode)basculerEdition();document.getElementById('btn-edit').focus();});
  const picker=document.getElementById('zone-picker');
  majPicker();
  picker.addEventListener('change',()=>{const id=picker.value;selection=null;selectionner(id||null);});
  document.getElementById('goulot-info').addEventListener('click',e=>{if(e.target.closest('[data-clear-selection]'))selectionner(selection);});
  document.getElementById('flight-search').addEventListener('input',renderFlights);
  document.getElementById('flight-filter').addEventListener('change',renderFlights);
  document.getElementById('csv-template').addEventListener('click',()=>{
    const content='vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC\nDEMO001,DEMO,A320,DEP,12:00,,0,0,100\nDEMO-RET001,DEMO,A320,RET,,08:00,0,0,100\n';
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));a.download='modele-vols-demo.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  });
  document.getElementById('restore-demo').addEventListener('click',()=>{
    if((now>DEBUT()||dataSource!=='Jeu de démonstration')&&!confirm('Recharger la démo ? Les données importées, la progression et les instantanés seront remplacés.'))return;
    dataSource='Jeu de démonstration';Sim.dataCourante=SAMPLE;snaps={};majCompare();reset(SAMPLE);updateSource();
    const report=document.getElementById('import-report');report.classList.remove('error');report.textContent='Jeu de démonstration rechargé.';
  });
  installerCentreReglages();
  updateSource();updateRunState();majCompare();
}

/* ==========================================================================
 *  11. DÉMARRAGE
 * ==========================================================================*/
const Sim = { robotRate:0, dataCourante:SAMPLE, _gTok:null };
// Réglages et état courant, publiés pour l'inspection et les parcours de test
// au même titre que Sim.editor et Sim.ateliers : lecture seule côté appelant.
Sim.cfg = CFG;
Sim.etat = () => ({ now, debut:DEBUT(), fin:FIN(), enMarche, modele });
window.Sim = Sim;
chargerZones();
construirePlan(); build(SAMPLE); initControles(); initEdition(); initFlux(); initAteliers(); initWorkbench();
majHorloge(); majPlan(); majDashboard(); dessinerChart();

})();

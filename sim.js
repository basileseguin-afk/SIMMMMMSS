/* ============================================================================
 *  Newrest Orly — Simulation des flux de production (moteur + rendu)
 *  Plan reconstruit fidèlement à partir de la carte réelle de l'unité
 *  (fichier MAP_ORY.xlsx) : positions et libellés des zones sont ceux du plan.
 *  Modèle de flux à stations : chaque atelier consomme des man-minutes ;
 *  une file se forme quand la demande dépasse la capacité => goulot.
 *  ==========================================================================*/
(function () {
'use strict';

/* ==========================================================================
 *  1. PARAMÈTRES (regroupés en tête, cf. cahier des charges §9)
 * ==========================================================================*/
const CFG = {
  jour: { debut: 5 * 60, fin: 23 * 60 },   // fenêtre simulée (minutes depuis 00:00)
  dispo: 0.85,                             // disponibilité effective du staff
  robotCadence: 320,                       // plateaux YC / heure (actuel)
  tunnels: 3, tunnelDouble: true,          // plonge
  tunnelDebit: 4,                          // trays/min par tunnel simple (double = ×2)
  loadDelay: 45,                           // min avant heure_std pour être "à l'heure"
  shift: 0,                                // décalage horaire global (min)
  staff: { magasin:3, appros:6, decontam:3, cuisine:10, prepa:18, dotation:6, armement:5, bobduty:2 }
};

/* ==========================================================================
 *  2. PLAN RÉEL D'ORLY
 *     Le fond est le plan d'architecte lui-même (MAP_ORY.xlsx), découpé en 12
 *     tuiles. Les coordonnées ci-dessous sont en pixels du plan d'origine :
 *     elles proviennent des ancrages du fichier (colonne = 82 px,
 *     ligne = 14,4 pt = 19,2 px), donc zones et fond sont alignés par
 *     construction.
 * ==========================================================================*/
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

/* Les coordonnées sont déjà en pixels du plan : pas de transformation. */
function boite(z) { return { x:z.x, y:z.y, w:z.w, h:z.h }; }
function centre(id) { const b = ZONES[id]; return { x:b.x + b.w/2, y:b.y + b.h/2 }; }
// Point sur le bord d'une boîte en direction d'une cible
function bord(id, cible) {
  const b = ZONES[id], cx = b.x + b.w/2, cy = b.y + b.h/2;
  const dx = cible.x - cx, dy = cible.y - cy;
  if (dx === 0 && dy === 0) return { x:cx, y:cy };
  const sx = dx !== 0 ? (b.w/2) / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? (b.h/2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x:cx + dx*s, y:cy + dy*s };
}

/* ==========================================================================
 *  3. JEU DE DONNÉES D'EXEMPLE (vague matin + vague soir)
 * ==========================================================================*/
const SAMPLE = [
  { id:'AF1080', cie:'AF', avion:'A320', sens:'DEP', std:6*60+40, bc:12, pc:0,  yc:150, spml:6 },
  { id:'BA305',  cie:'BA', avion:'A320', sens:'DEP', std:7*60+5,  bc:16, pc:0,  yc:120, spml:4 },
  { id:'AF1180', cie:'AF', avion:'A350', sens:'DEP', std:7*60+30, bc:32, pc:48, yc:210, spml:12 },
  { id:'DL84',   cie:'DL', avion:'B777', sens:'DEP', std:8*60+0,  bc:38, pc:40, yc:230, spml:14 },
  { id:'QR40',   cie:'QR', avion:'A350', sens:'DEP', std:8*60+20, bc:30, pc:44, yc:200, spml:10 },
  { id:'EK76',   cie:'EK', avion:'A380', sens:'DEP', std:8*60+50, bc:14, pc:76, yc:340, spml:18 },
  { id:'AF1290', cie:'AF', avion:'A320', sens:'DEP', std:9*60+10, bc:12, pc:0,  yc:140, spml:5 },
  { id:'AF1081', cie:'AF', avion:'A320', sens:'RET', sta:6*60+10, bc:12, pc:0,  yc:150 },
  { id:'DL85',   cie:'DL', avion:'B777', sens:'RET', sta:7*60+40, bc:38, pc:40, yc:230 },
  { id:'AF1680', cie:'AF', avion:'A350', sens:'DEP', std:17*60+20,bc:32, pc:48, yc:205, spml:11 },
  { id:'BA315',  cie:'BA', avion:'A320', sens:'DEP', std:17*60+50,bc:16, pc:0,  yc:130, spml:5 },
  { id:'QR42',   cie:'QR', avion:'A350', sens:'DEP', std:18*60+30,bc:30, pc:44, yc:210, spml:10 },
  { id:'EK78',   cie:'EK', avion:'A380', sens:'DEP', std:19*60+0, bc:14, pc:76, yc:350, spml:20 },
  { id:'DL88',   cie:'DL', avion:'B777', sens:'DEP', std:19*60+40,bc:38, pc:40, yc:235, spml:15 },
  { id:'EK77',   cie:'EK', avion:'A380', sens:'RET', sta:16*60+30,bc:14, pc:76, yc:340 },
  { id:'QR41',   cie:'QR', avion:'A350', sens:'RET', sta:17*60+10,bc:30, pc:44, yc:200 },
  { id:'AF1681', cie:'AF', avion:'A350', sens:'RET', sta:18*60+0, bc:32, pc:48, yc:205 },
  { id:'DL89',   cie:'DL', avion:'B777', sens:'RET', sta:18*60+50,bc:38, pc:40, yc:235 }
];

/* Barème de man-minutes : minutes par passager, par classe et par atelier. */
function chargeVol(f) {
  const bc=f.bc||0, pc=f.pc||0, yc=f.yc||0, pax=bc+pc+yc;
  return {
    food: { appros: bc*0.6 + pc*0.35 + yc*0.12, decontam: pax*0.05,
            cuisine: bc*1.4 + pc*0.7 + yc*0.28, prepa: bc*2.2 + pc*1.1 + pax*0.06, robot: yc },
    dotation: bc*0.5 + pc*0.3 + yc*0.12,
    armement: pax*0.08 + 15,
    plonge:   pax*0.9
  };
}

/* ==========================================================================
 *  4. ÉTAT DU MOTEUR
 * ==========================================================================*/
let flights = [], jobs = [], stations = {};
let now = CFG.jour.debut, enMarche = false, vitesse = 30, historique = [];
const ordreTraitement = ['magasin','appros','decontam','cuisine','dotation','armement','bobduty','plonge','prepa','handling'];

function robotCap() { return CFG.robotCadence / 60; }
function plongeCap() {
  const simples = CFG.tunnelDouble ? CFG.tunnels - 1 : CFG.tunnels;
  return simples * CFG.tunnelDebit + (CFG.tunnelDouble ? CFG.tunnelDebit * 2 : 0);
}
function staffCap(id) { return (CFG.staff[id] || 0) * CFG.dispo; }

function build(data) {
  flights = data.map(f => Object.assign({}, f));
  jobs = [];
  flights.forEach(f => {
    const c = chargeVol(f);
    if (f.sens === 'DEP') {
      const std = (f.std || 0) + CFG.shift;
      f.due = std - CFG.loadDelay; f.readyTime = null; f.retard = 0;
      f.foodDone = f.dotDone = f.armDone = false;
      jobs.push(mkJob(f, 'food', ['appros','decontam','cuisine','prepa'], c.food, c.food.robot, std - 200));
      jobs.push(mkJob(f, 'dot', ['dotation'], { dotation:c.dotation }, 0, std - 175));
      jobs.push(mkJob(f, 'arm', ['armement'], { armement:c.armement }, 0, std - 175));
    } else {
      jobs.push(mkJob(f, 'plonge', ['plonge'], { plonge:c.plonge }, 0, (f.sta||0) + CFG.shift));
    }
  });
}
function mkJob(f, kind, route, work, robot, releaseT) {
  // couleurs des tokens : assez saturées pour rester lisibles en clair comme en sombre
  const couleurs = { food:'#0c74ad', dot:'#12813f', arm:'#c47a08', plonge:'#7b3fd4' };
  return { flight:f, kind, route, work, robot:robot||0, releaseT,
           dueT:(f.due!=null?f.due:releaseT+30), released:false, done:false,
           stationId:null, idx:0, rem:0, remRobot:0, color:couleurs[kind] };
}
function initStations() {
  stations = {};
  Object.keys(ZONES).forEach(id => stations[id] = { util:0, qlen:0, usedRate:0, _used:0 });
}

/* ==========================================================================
 *  5. PAS DE SIMULATION
 * ==========================================================================*/
function step(dt) {
  now += dt;
  jobs.forEach(j => {
    if (!j.released && now >= j.releaseT) {
      j.released = true; j.idx = 0; j.stationId = j.route[0];
      j.rem = j.work[j.route[0]] || 0; j.remRobot = (j.route[0] === 'prepa') ? j.robot : 0;
      spawnEntree(j);
    }
  });
  ordreTraitement.forEach(id => { stations[id]._used = 0; });
  let robotUsed = 0;

  ordreTraitement.forEach(id => {
    const st = stations[id];
    let capLeft = (id === 'plonge' ? plongeCap() : staffCap(id)) * dt;
    let robotLeft = (id === 'prepa') ? robotCap() * dt : 0;
    const ici = jobs.filter(j => j.released && !j.done && j.stationId === id);
    ici.sort((a, b) => a.dueT - b.dueT);
    st.qlen = ici.length;
    for (const j of ici) {
      if (id === 'prepa' && j.remRobot > 0) { const r = Math.min(robotLeft, j.remRobot); j.remRobot -= r; robotLeft -= r; robotUsed += r; }
      if (capLeft > 0 && j.rem > 0) { const w = Math.min(capLeft, j.rem); j.rem -= w; capLeft -= w; st._used += w; }
      if (j.rem <= 1e-6 && j.remRobot <= 1e-6) avancer(j);
      if (capLeft <= 1e-6 && robotLeft <= 1e-6) break;
    }
    const cap = (id === 'plonge' ? plongeCap() : staffCap(id)) * dt;
    let u = cap > 0 ? st._used / cap : 0;
    if (id === 'prepa') { const rc = robotCap() * dt; if (rc > 0) u = Math.max(u, robotUsed / rc); }
    if (ici.some(j => j.rem > 1e-6 || j.remRobot > 1e-6)) u = Math.max(u, 0.97);
    st.util = st.util * 0.82 + u * 0.18;
    st.usedRate = st._used / dt;
  });

  stations.magasin.util = 0.15 + 0.4 * stations.prepa.util;
  stations.bobduty.util = Math.max(stations.bobduty.util, 0.2);
  stations.handling.util = 0.1 + 0.3 * stations.prepa.util;
  Sim.robotRate = robotUsed / dt;
}

function avancer(j) {
  const cour = j.stationId; j.idx++;
  if (j.idx < j.route.length) {
    const ns = j.route[j.idx];
    spawnToken(cour + '_' + ns, j.color);
    j.stationId = ns; j.rem = j.work[ns] || 0; j.remRobot = (ns === 'prepa') ? j.robot : 0;
  } else { finaliser(j, cour); j.done = true; }
}
function finaliser(j) {
  const f = j.flight;
  if (j.kind === 'food') { spawnToken('prepa_handling', j.color); setTimeout(()=>spawnToken('handling_quais', j.color), 400); f.foodDone = true; }
  else if (j.kind === 'dot') { spawnToken('dotation_quais', j.color); f.dotDone = true; }
  else if (j.kind === 'arm') { spawnToken('armement_quais', j.color); f.armDone = true; }
  else if (j.kind === 'plonge') { spawnToken('plonge_prepa', j.color); spawnToken('plonge_dotation', j.color); }
  if (f.sens === 'DEP' && f.foodDone && f.dotDone && f.armDone && f.readyTime == null) {
    f.readyTime = now; f.retard = Math.max(0, now - f.due);
  }
}
function spawnEntree(j) {
  if (j.kind === 'food') spawnToken('appros_decontam', j.color);
  else if (j.kind === 'plonge') spawnToken('quais_plonge', j.color);
  else if (j.kind === 'arm') spawnToken('quais_armement', j.color);
}

/* ==========================================================================
 *  6. KPI
 * ==========================================================================*/
function kpis() {
  const dep = flights.filter(f => f.sens === 'DEP');
  const prets = dep.filter(f => f.readyTime != null);
  const aHeure = prets.filter(f => f.retard <= 0).length;
  const ontime = prets.length ? Math.round(100 * aHeure / prets.length) : 100;
  const retardMoy = prets.length ? Math.round(prets.reduce((s,f)=>s+f.retard,0) / prets.length) : 0;
  const wip = jobs.filter(j => j.released && !j.done).length;
  const debit = Math.round((Sim.robotRate || 0) * 60);
  return { ontime, retardMoy, wip, debit, goulot:goulotCourant(), prets:prets.length, total:dep.length };
}
function goulotCourant() {
  let best = null, bu = 0.55;
  Object.keys(ZONES).forEach(id => {
    if (ZONES[id].sink || ZONES[id].buffer) return;
    const st = stations[id];
    const sev = Math.max(st.util, Math.min(1, st.qlen / 4));
    if (sev > bu) { bu = sev; best = id; }
  });
  return best ? { id:best, nom:ZONES[best].nom, sev:bu, qlen:stations[best].qlen } : null;
}
function couleurCharge(u) { return u < 0.55 ? 'var(--vert)' : u < 0.85 ? 'var(--orange)' : 'var(--rouge)'; }

/* ==========================================================================
 *  7. RENDU DU PLAN
 * ==========================================================================*/
const SVGNS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('plan');
let tokens = [];
const zoneEls = {};
function svgEl(t, a) { const e = document.createElementNS(SVGNS, t); for (const k in a) e.setAttribute(k, a[k]); return e; }

function construirePlan() {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  svg.setAttribute('viewBox', VUE.x + ' ' + VUE.y + ' ' + VUE.w + ' ' + VUE.h);

  // Conteneur zoomable/déplaçable
  const gVue = svgEl('g', { id:'viewport' }); svg.appendChild(gVue); Sim._gVue = gVue;

  // Fond : le plan d'architecte réel (12 tuiles)
  const gFond = svgEl('g', { id:'plan-fond' }); gVue.appendChild(gFond);
  TILES.forEach(t => {
    gFond.appendChild(svgEl('image', { href:'assets/plan/tuile' + t.n + '.png',
      x:t.x, y:t.y, width:t.w, height:t.h, preserveAspectRatio:'none' }));
  });

  // Arêtes de flux
  const gEdges = svgEl('g', {}); gVue.appendChild(gEdges);
  Sim._edges = {};
  FLUX.concat(FLUX_RETOUR.map(e => e.concat('R'))).forEach(fl => {
    const [a, b] = fl, retour = fl[2] === 'R', id = a + '_' + b;
    const pa = bord(a, centre(b)), pb = bord(b, centre(a));
    const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
    const dx = pb.x - pa.x, dy = pb.y - pa.y, len = Math.hypot(dx, dy) || 1;
    const cx = mx - dy / len * 130, cy = my + dx / len * 130; // courbure
    const path = svgEl('path', { id:'edge-' + id, class:'edge' + (retour ? ' retour' : ''), d:`M ${pa.x} ${pa.y} Q ${cx} ${cy} ${pb.x} ${pb.y}` });
    gEdges.appendChild(path);
    // flèche
    const ang = Math.atan2(pb.y - cy, pb.x - cx), F = 42;
    gEdges.appendChild(svgEl('path', { class:'edge fleche' + (retour ? ' retour' : ''),
      d:`M ${pb.x} ${pb.y} L ${pb.x-F*Math.cos(ang-0.4)} ${pb.y-F*Math.sin(ang-0.4)} M ${pb.x} ${pb.y} L ${pb.x-F*Math.cos(ang+0.4)} ${pb.y-F*Math.sin(ang+0.4)}` }));
  });

  // Stockages / chambres froides (repris du plan, sous les ateliers)
  const gSto = svgEl('g', {}); gVue.appendChild(gSto);
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
    const z = ZONES[id], b = boite(z);
    const g = svgEl('g', { class:'zone' + (z.approx ? ' approx' : ''), 'data-id':id });
    g.appendChild(svgEl('rect', { class:'fond', x:b.x, y:b.y, width:b.w, height:b.h, rx:10 }));
    const ti = svgEl('title', {}); ti.textContent = z.nom + (z.approx ? ' (emplacement à confirmer)' : ''); g.appendChild(ti);
    const t = svgEl('text', { class:'titre', x:b.x+14, y:b.y+56 }); t.textContent = z.nom; g.appendChild(t);
    (z.sous||[]).forEach((s,i) => {
      const st = svgEl('text', { class:'sous', x:b.x+14, y:b.y+96+i*38 }); st.textContent = s; g.appendChild(st);
    });
    if (!z.sink && !z.buffer) {
      g.appendChild(svgEl('rect', { class:'barre-fond', x:b.x+14, y:b.y+b.h-30, width:b.w-28, height:16, rx:8 }));
      const jauge = svgEl('rect', { class:'barre-jauge', x:b.x+14, y:b.y+b.h-30, width:0, height:16, rx:8, fill:'var(--vert)' });
      g.appendChild(jauge); zoneEls[id] = { g, jauge, rect:g.querySelector('rect.fond'), b };
    } else zoneEls[id] = { g, rect:g.querySelector('rect.fond'), b };
    if (z.robot) ajoutRessource(g, b.x+b.w-210, b.y+b.h-130, 'ROBOT', 'robot');
    if (z.tunnels) ajoutRessource(g, b.x+14, b.y+b.h-130, 'TUNNELS', 'tunnels');
    const badge = svgEl('text', { class:'goulot-badge', x:b.x+b.w-14, y:b.y+56, 'text-anchor':'end' }); g.appendChild(badge); zoneEls[id].badge = badge;
    g.addEventListener('click', () => selectionner(id));
    gZones.appendChild(g);
  });

  const gTok = svgEl('g', { id:'tokens' }); gVue.appendChild(gTok); Sim._gTok = gTok;
  initZoom();
}

/* --- Zoom / déplacement --------------------------------------------------- */
let vk = 1, vtx = 0, vty = 0;
function appliquerVue() {
  Sim._gVue.setAttribute('transform', 'translate(' + vtx + ' ' + vty + ') scale(' + vk + ')');
  svg.classList.toggle('zoomed', vk >= 1.7);
  const z = document.getElementById('zoom-val'); if (z) z.textContent = Math.round(vk*100) + '%';
}
function ptSvg(e) {
  const m = svg.getScreenCTM(); if (!m) return { x:0, y:0 };
  const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
  return p.matrixTransform(m.inverse());
}
function zoomer(f, p) {
  const nk = Math.min(8, Math.max(0.5, vk * f));
  if (!p) p = { x:VUE.x + VUE.w/2, y:VUE.y + VUE.h/2 };
  const wx = (p.x - vtx) / vk, wy = (p.y - vty) / vk;
  vk = nk; vtx = p.x - wx*vk; vty = p.y - wy*vk;
  appliquerVue();
}
function initZoom() {
  svg.addEventListener('wheel', e => { e.preventDefault(); zoomer(e.deltaY < 0 ? 1.18 : 1/1.18, ptSvg(e)); }, { passive:false });
  let drag = null;
  svg.addEventListener('pointerdown', e => { drag = { p:ptSvg(e), tx:vtx, ty:vty }; svg.setPointerCapture(e.pointerId); svg.style.cursor = 'grabbing'; });
  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    const p = ptSvg(e); vtx = drag.tx + (p.x - drag.p.x); vty = drag.ty + (p.y - drag.p.y); appliquerVue();
  });
  const fin = e => { drag = null; svg.style.cursor = ''; };
  svg.addEventListener('pointerup', fin); svg.addEventListener('pointercancel', fin);
  appliquerVue();
}

function ajoutRessource(g, x, y, label, type) {
  g.appendChild(svgEl('rect', { class:'ressource-box', x, y, width:196, height:96, rx:10 }));
  const l = svgEl('text', { class:'ressource-txt', x:x+16, y:y+36 }); l.textContent = label; g.appendChild(l);
  const v = svgEl('text', { class:'ressource-val', x:x+16, y:y+78, id:'res-' + type }); v.textContent = '—'; g.appendChild(v);
}

let selection = null;
function selectionner(id) {
  selection = (selection === id) ? null : id;
  Object.keys(zoneEls).forEach(k => zoneEls[k].g.classList.toggle('selection', k === selection));
  majGoulotInfo();
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
    els.g.classList.add(u < 0.55 ? 'c-ok' : u < 0.85 ? 'c-warn' : 'c-bad');
    if (els.badge) els.badge.textContent = st.qlen > 0 ? st.qlen + ' OF' : '';
  });
  const r = document.getElementById('res-robot'); if (r) r.textContent = Math.round((Sim.robotRate||0)*60) + '/' + CFG.robotCadence;
  const t = document.getElementById('res-tunnels'); if (t) t.textContent = CFG.tunnels + (CFG.tunnelDouble ? ' (1×2)' : '');
}

/* ==========================================================================
 *  8. DASHBOARD
 * ==========================================================================*/
function majDashboard() {
  const k = kpis();
  const set = (id, v) => { const n = document.getElementById(id); if (n) n.innerHTML = v; };
  const ontEl = document.getElementById('kpi-ontime');
  ontEl.textContent = k.ontime + '%';
  ontEl.className = 'val ' + (k.ontime >= 90 ? 'bon' : k.ontime >= 70 ? 'moyen' : 'mauvais');
  set('kpi-retard', k.retardMoy + ' <small>min</small>');
  document.getElementById('kpi-retard').className = 'val ' + (k.retardMoy <= 0 ? 'bon' : k.retardMoy < 15 ? 'moyen' : 'mauvais');
  set('kpi-debit', k.debit + ' <small>/h</small>');
  set('kpi-wip', k.wip + ' <small>OF</small>');

  const box = document.getElementById('stats-ateliers'); box.innerHTML = '';
  ['appros','decontam','cuisine','prepa','dotation','plonge','armement','magasin','bobduty'].forEach(id => {
    const st = stations[id], u = Math.min(1, st.util);
    const d = document.createElement('div'); d.className = 'stat-atelier';
    d.innerHTML = '<div class="haut"><span>' + ZONES[id].nom + '<span class="badge-q">' + (st.qlen?('· '+st.qlen+' OF'):'') + '</span></span><b>' + Math.round(u*100) + '%</b></div>' +
      '<div class="barre"><i style="width:' + (u*100) + '%;background:' + couleurCharge(u) + '"></i></div>';
    box.appendChild(d);
  });
  majGoulotInfo(k.goulot);
}
function majGoulotInfo(goulot) {
  if (goulot === undefined) goulot = goulotCourant();
  const el = document.getElementById('goulot-info');
  if (selection) {
    const st = stations[selection];
    el.innerHTML = '<b style="color:var(--accent2)">' + ZONES[selection].nom + '</b><br>Charge : <b>' + Math.round(st.util*100) + '%</b> · File : <b>' + st.qlen + ' OF</b>' +
      (CFG.staff[selection] != null ? '<br>Effectif : <b>' + CFG.staff[selection] + '</b> pers.' : (selection==='plonge' ? '<br>Tunnels : <b>' + CFG.tunnels + '</b>' : ''));
    return;
  }
  if (!enMarche && now <= CFG.jour.debut + 1) { el.textContent = 'Simulation à l\'arrêt. Cliquez sur « Lancer ».'; return; }
  if (!goulot) { el.innerHTML = '<span style="color:var(--vert)">✔ Aucun goulot — flux fluide.</span>'; return; }
  el.innerHTML = '<b style="color:var(--rouge)">🔴 ' + goulot.nom + '</b><br>Charge ' + Math.round(goulot.sev*100) + '% · file ' + goulot.qlen + ' OF.<br>' +
    '<span class="mini-note">Ajustez l\'effectif' + (goulot.id==='prepa'?' ou la cadence robot':goulot.id==='plonge'?' ou les tunnels':'') + '.</span>';
}

const chart = document.getElementById('chart');
function dessinerChart() {
  const ctx = chart.getContext('2d');
  const w = chart.width = chart.clientWidth, h = chart.height = 110;
  ctx.clearRect(0, 0, w, h);
  if (historique.length < 2) return;
  const t0 = CFG.jour.debut, t1 = CFG.jour.fin;
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
  let dtSim = dtReel * vitesse;
  while (dtSim > 0 && now < CFG.jour.fin) {
    const p = Math.min(0.5, dtSim); step(p); dtSim -= p; accHist += p;
    if (accHist >= 10) { accHist = 0; historique.push({ t:now, debit:Math.round((Sim.robotRate||0)*60), wip:jobs.filter(j=>j.released&&!j.done).length }); }
  }
  animerTokens(); majHorloge(); majPlan(); majDashboard(); dessinerChart();
  if (now >= CFG.jour.fin) { pause(); toast('Journée simulée terminée'); return; }
  requestAnimationFrame(boucle);
}
function majHorloge() {
  const hh = Math.floor(now/60), mm = Math.floor(now%60);
  document.getElementById('horloge').textContent = String(hh).padStart(2,'0') + ':' + String(mm).padStart(2,'0');
}

/* ==========================================================================
 *  10. CONTRÔLES
 * ==========================================================================*/
function lancer() {
  if (enMarche) return; if (now >= CFG.jour.fin) reset();
  enMarche = true; dernierReel = performance.now();
  const b = document.getElementById('btn-play'); b.textContent = '⏸ Pause'; b.className = 'btn btn-pause';
  requestAnimationFrame(boucle);
}
function pause() {
  enMarche = false;
  const b = document.getElementById('btn-play'); b.textContent = '▶ Reprendre'; b.className = 'btn btn-play';
}
function basculer() { enMarche ? pause() : lancer(); }
function reset(data) {
  pause(); now = CFG.jour.debut; historique = []; tokens.forEach(t=>t.el.remove()); tokens = [];
  build(data || Sim.dataCourante || SAMPLE); initStations();
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
    d.innerHTML = '<label>' + ZONES[id].nom + ' <b id="s-' + id + '">' + CFG.staff[id] + '</b></label><input type="range" min="0" max="40" value="' + CFG.staff[id] + '" data-id="' + id + '">';
    box.appendChild(d);
    d.querySelector('input').addEventListener('input', e => { CFG.staff[id] = +e.target.value; document.getElementById('s-' + id).textContent = e.target.value; majPlan(); majDashboard(); });
  });
  const bind = (id, fn) => document.getElementById(id).addEventListener('input', fn);
  bind('vitesse', e => { vitesse = +e.target.value; document.getElementById('vitesse-val').textContent = vitesse + '×'; });
  bind('robot', e => { CFG.robotCadence = +e.target.value; document.getElementById('robot-val').textContent = e.target.value + ' pl/h'; document.getElementById('robot-note').textContent = e.target.value; majPlan(); });
  bind('tunnels', e => { CFG.tunnels = +e.target.value; document.getElementById('tunnels-val').textContent = e.target.value; majPlan(); });
  document.getElementById('double').addEventListener('change', e => { CFG.tunnelDouble = e.target.checked; majPlan(); });
  bind('shift', e => { CFG.shift = +e.target.value; document.getElementById('shift-val').textContent = (e.target.value>0?'+':'') + e.target.value + ' min'; reset(); });
  bind('loadDelay', e => { CFG.loadDelay = +e.target.value || 45; reset(); });
  document.getElementById('btn-play').addEventListener('click', basculer);
  document.getElementById('btn-reset').addEventListener('click', () => { reset(); toast('Journée réinitialisée'); });
  document.getElementById('btn-export').addEventListener('click', exporter);
  document.getElementById('snap-a').addEventListener('click', () => capturer('A'));
  document.getElementById('snap-b').addEventListener('click', () => capturer('B'));
  document.getElementById('snap-clear').addEventListener('click', () => { snaps = {}; majCompare(); });
  document.getElementById('imp-vols').addEventListener('change', importVols);
  window.addEventListener('resize', dessinerChart);
  // zoom / fond de plan
  document.getElementById('zoom-in').addEventListener('click', () => zoomer(1.35));
  document.getElementById('zoom-out').addEventListener('click', () => zoomer(1/1.35));
  document.getElementById('zoom-reset').addEventListener('click', () => { vk = 1; vtx = 0; vty = 0; appliquerVue(); });
  document.getElementById('fond-plan').addEventListener('change', e => {
    svg.classList.toggle('sans-fond', !e.target.checked);
  });
  initTheme();
}

/* --- Thème clair / sombre ------------------------------------------------- */
function appliquerTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const b = document.getElementById('btn-theme');
  b.textContent = t === 'dark' ? '☀️' : '🌙';
  b.title = t === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre';
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

let snaps = {};
function capturer(slot) {
  const k = kpis();
  snaps[slot] = { ontime:k.ontime, retard:k.retardMoy, debit:k.debit, wip:k.wip, robot:CFG.robotCadence, prepa:CFG.staff.prepa, tunnels:CFG.tunnels };
  majCompare(); toast('Scénario ' + slot + ' capturé');
}
function majCompare() {
  const lignes = [['Robot pl/h','robot'],['Staff Montage','prepa'],['Tunnels','tunnels'],['Vols à l\'heure %','ontime'],['Retard moy.','retard'],['Débit /h','debit'],['WIP','wip']];
  let html = '<thead><tr><th>KPI</th><th>A</th><th>B</th></tr></thead>';
  lignes.forEach(l => { const a = snaps.A ? snaps.A[l[1]] : '—', b = snaps.B ? snaps.B[l[1]] : '—'; html += '<tr><td>' + l[0] + '</td><td>' + a + '</td><td>' + b + '</td></tr>'; });
  document.getElementById('compare').innerHTML = html;
}

function importVols(e) {
  const file = e.target.files[0]; if (!file) return;
  const rd = new FileReader();
  rd.onload = () => { try { const data = parseVols(rd.result); if (!data.length) { toast('CSV vide ou illisible'); return; } Sim.dataCourante = data; reset(data); toast(data.length + ' vols importés'); } catch (err) { toast('Erreur CSV'); console.error(err); } };
  rd.readAsText(file);
}
function parseVols(txt) {
  const lignes = txt.split(/\r?\n/).filter(l => l.trim()); if (!lignes.length) return [];
  const head = lignes[0].split(/[,;]/).map(s => s.trim().toLowerCase());
  const idx = n => head.findIndex(h => h.includes(n));
  const c = { id:idx('vol'), cie:idx('compagnie'), av:idx('type'), sens:idx('sens'), std:idx('std'), sta:idx('sta'), bc:idx('bc'), pc:idx('pc'), yc:idx('yc') };
  const toMin = v => { if (!v) return 0; if (v.includes(':')) { const [h,m]=v.split(':'); return (+h)*60+(+m||0); } return +v||0; };
  return lignes.slice(1).map((l,i) => {
    const p = l.split(/[,;]/).map(s => s.trim());
    const sens = (c.sens>=0 ? (p[c.sens]||'DEP') : 'DEP').toUpperCase().includes('RET') ? 'RET' : 'DEP';
    return { id:c.id>=0?p[c.id]:'V'+i, cie:c.cie>=0?p[c.cie]:'—', avion:c.av>=0?p[c.av]:'—', sens,
             std:c.std>=0?toMin(p[c.std]):7*60, sta:c.sta>=0?toMin(p[c.sta]):7*60, bc:+(p[c.bc]||0), pc:+(p[c.pc]||0), yc:+(p[c.yc]||0) };
  }).filter(f => f.bc||f.pc||f.yc);
}
function exporter() {
  const k = kpis();
  const data = { horaire:document.getElementById('horloge').textContent, config:CFG, kpis:k,
    vols:flights.map(f => ({ id:f.id, sens:f.sens, readyTime:f.readyTime, retard:f.retard })),
    ateliers:Object.keys(ZONES).reduce((o,id)=>{ o[id]={util:Math.round(stations[id].util*100),file:stations[id].qlen}; return o; }, {}) };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'newrest-orly-resultats.json'; a.click();
  toast('Résultats exportés');
}

/* ==========================================================================
 *  11. DÉMARRAGE
 * ==========================================================================*/
const Sim = { robotRate:0, dataCourante:SAMPLE, _gTok:null };
window.Sim = Sim;
construirePlan(); initStations(); build(SAMPLE); initControles();
majHorloge(); majPlan(); majDashboard(); dessinerChart();

})();

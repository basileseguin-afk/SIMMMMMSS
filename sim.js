/* ============================================================================
 *  Newrest Orly — Simulation des flux de production (moteur + rendu)
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
  // effectifs par défaut
  staff: { magasin:3, appros:6, decontam:3, cuisine:10, prepa:18, dotation:6, armement:5, bobduty:2 }
};

/* ==========================================================================
 *  2. PLAN — zones orientées Sud (bas) -> Nord (haut)
 *     Repère SVG 1000×1000 : y=0 en haut (Nord), y=1000 en bas (Sud).
 * ==========================================================================*/
const ZONES = {
  piste:    { nom:'PISTE / VOLS', x:340,y:25,w:330,h:45, sous:['chargement camions → avion'], sink:true },
  armement: { nom:'ARMEMENT', x:300,y:95,w:470,h:175, staff:'armement',
              sous:['trolleys non-food : bar, eau, kits bébé'], stores:[['zone retour',315,225,140,32],['zone départ',465,225,140,32]] },
  bobduty:  { nom:'BOB DUTY', x:600,y:118,w:150,h:100, staff:'bobduty', sous:['buy-on-board'] },
  dotation: { nom:'DOTATION', x:55,y:300,w:200,h:180, staff:'dotation',
              sous:['couverts + serviettes','assiettes propres → avion'] },
  handling: { nom:'FRIGO HANDLING', x:590,y:320,w:180,h:85, buffer:true, sous:['trolleys prêts au départ'] },
  prepa:    { nom:'PRÉPA', x:300,y:430,w:470,h:210, staff:'prepa', robot:true,
              sous:['montage plateaux & trolleys'],
              stores:[['mise à dispo Magasin',315,560,150,30],['mise à dispo Appros',475,560,150,30],['stock assiettes',635,560,120,30]] },
  plonge:   { nom:'PLONGE', x:55,y:515,w:200,h:195, tunnels:true, sous:['3 tunnels de lavage'] },
  cuisine:  { nom:'CUISINE', x:360,y:690,w:380,h:120, staff:'cuisine',
              sous:['froid / tranche','chaud'], stores:[['frigo',375,745,90,28],['frigo froid',475,745,110,28]] },
  decontam: { nom:'DÉCONTAM.', x:770,y:690,w:170,h:120, staff:'decontam', sous:['lavage légumes/fruits'] },
  magasin:  { nom:'MAGASIN', x:60,y:845,w:410,h:130, staff:'magasin',
              sous:['consommables, vaisselle, produits secs'] },
  appros:   { nom:'APPROS', x:520,y:845,w:420,h:130, staff:'appros', sous:['réceptions & commandes'],
              stores:[['congélateurs',535,915,120,32],['stock sec',665,915,90,32],['3 frigos frais',765,915,110,32]] }
};

/* Arêtes du graphe de flux : id, point départ, point arrivée, courbure, retour ? */
const EDGES = {
  e_mag_prepa: { p:[[265,845],[300,740],[420,640]] },
  e_app_cuis:  { p:[[600,880],[680,835],[740,748]] },
  e_app_dec:   { p:[[855,845],[855,828],[855,810]] },
  e_dec_cuis:  { p:[[770,750],[752,748],[740,748]] },
  e_app_prepa: { p:[[730,845],[770,745],[710,640]] },
  e_cuis_prepa:{ p:[[550,690],[550,665],[550,640]] },
  e_plon_prepa:{ p:[[255,600],[285,575],[300,560]] },
  e_plon_dot:  { p:[[155,515],[155,497],[155,480]] },
  e_dot_piste: { p:[[155,300],[175,150],[360,68]] },
  e_dot_prepa: { p:[[255,390],[285,445],[300,500]] },
  e_prepa_hand:{ p:[[770,540],[760,470],[680,405]] },
  e_hand_piste:{ p:[[680,320],[705,180],[625,70]] },
  e_arm_piste: { p:[[500,95],[500,82],[500,70]] },
  e_bob_piste: { p:[[675,118],[660,92],[605,70]] },
  e_ret_plon:  { p:[[400,70],[140,260],[155,515]], retour:true },
  e_ret_arm:   { p:[[560,70],[560,82],[560,95]], retour:true }
};

/* ==========================================================================
 *  3. JEU DE DONNÉES D'EXEMPLE (vague matin + vague soir)
 *     heures en minutes depuis 00:00. Départs (DEP) et retours (RET).
 * ==========================================================================*/
const SAMPLE = [
  // --- Vague matin (départs) ---
  { id:'AF1080', cie:'AF', avion:'A320', sens:'DEP', std:6*60+40, bc:12, pc:0,  yc:150, spml:6 },
  { id:'BA305',  cie:'BA', avion:'A320', sens:'DEP', std:7*60+5,  bc:16, pc:0,  yc:120, spml:4 },
  { id:'AF1180', cie:'AF', avion:'A350', sens:'DEP', std:7*60+30, bc:32, pc:48, yc:210, spml:12 },
  { id:'DL84',   cie:'DL', avion:'B777', sens:'DEP', std:8*60+0,  bc:38, pc:40, yc:230, spml:14 },
  { id:'QR40',   cie:'QR', avion:'A350', sens:'DEP', std:8*60+20, bc:30, pc:44, yc:200, spml:10 },
  { id:'EK76',   cie:'EK', avion:'A380', sens:'DEP', std:8*60+50, bc:14, pc:76, yc:340, spml:18 },
  { id:'AF1290', cie:'AF', avion:'A320', sens:'DEP', std:9*60+10, bc:12, pc:0,  yc:140, spml:5 },
  // --- Retours matin (arrivées sales) ---
  { id:'AF1081', cie:'AF', avion:'A320', sens:'RET', sta:6*60+10, bc:12, pc:0,  yc:150 },
  { id:'DL85',   cie:'DL', avion:'B777', sens:'RET', sta:7*60+40, bc:38, pc:40, yc:230 },
  // --- Vague soir (départs) ---
  { id:'AF1680', cie:'AF', avion:'A350', sens:'DEP', std:17*60+20,bc:32, pc:48, yc:205, spml:11 },
  { id:'BA315',  cie:'BA', avion:'A320', sens:'DEP', std:17*60+50,bc:16, pc:0,  yc:130, spml:5 },
  { id:'QR42',   cie:'QR', avion:'A350', sens:'DEP', std:18*60+30,bc:30, pc:44, yc:210, spml:10 },
  { id:'EK78',   cie:'EK', avion:'A380', sens:'DEP', std:19*60+0, bc:14, pc:76, yc:350, spml:20 },
  { id:'DL88',   cie:'DL', avion:'B777', sens:'DEP', std:19*60+40,bc:38, pc:40, yc:235, spml:15 },
  // --- Retours soir ---
  { id:'EK77',   cie:'EK', avion:'A380', sens:'RET', sta:16*60+30,bc:14, pc:76, yc:340 },
  { id:'QR41',   cie:'QR', avion:'A350', sens:'RET', sta:17*60+10,bc:30, pc:44, yc:200 },
  { id:'AF1681', cie:'AF', avion:'A350', sens:'RET', sta:18*60+0, bc:32, pc:48, yc:205 },
  { id:'DL89',   cie:'DL', avion:'B777', sens:'RET', sta:18*60+50,bc:38, pc:40, yc:235 }
];

/* Barème de man-minutes : minutes par passager, par classe et par atelier. */
function chargeVol(f) {
  const bc=f.bc||0, pc=f.pc||0, yc=f.yc||0, pax=bc+pc+yc;
  return {
    food: {
      appros:   bc*0.6 + pc*0.35 + yc*0.12,
      decontam: pax*0.05,
      cuisine:  bc*1.4 + pc*0.7 + yc*0.28,
      prepa:    bc*2.2 + pc*1.1 + pax*0.06,   // manuel (hors YC)
      robot:    yc                            // plateaux YC (ressource robot)
    },
    dotation: bc*0.5 + pc*0.3 + yc*0.12,
    armement: pax*0.08 + 15,
    plonge:   pax*0.9
  };
}

/* ==========================================================================
 *  4. ÉTAT DU MOTEUR
 * ==========================================================================*/
let flights = [];     // vols (copie de travail)
let jobs = [];        // ordres de fabrication
let stations = {};    // état runtime par atelier
let now = CFG.jour.debut;
let enMarche = false;
let vitesse = 30;     // minutes simulées par seconde réelle
let historique = [];  // pour la courbe
const ordreTraitement = ['magasin','appros','decontam','cuisine','dotation','armement','bobduty','plonge','prepa','handling'];

function robotCap() { return CFG.robotCadence / 60; }               // trays/min
function plongeCap() {
  const simples = CFG.tunnelDouble ? CFG.tunnels - 1 : CFG.tunnels;
  const debitDouble = CFG.tunnelDouble ? CFG.tunnelDebit * 2 : 0;
  return simples * CFG.tunnelDebit + debitDouble;                    // trays/min
}
function staffCap(id) { return (CFG.staff[id] || 0) * CFG.dispo; }   // man-min/min

/* Construit vols + OF à partir des données (exemple ou import). */
function build(data) {
  flights = data.map(f => Object.assign({}, f));
  jobs = [];
  flights.forEach(f => {
    const c = chargeVol(f);
    if (f.sens === 'DEP') {
      const std = (f.std || 0) + CFG.shift;
      f.due = std - CFG.loadDelay;
      f.readyTime = null; f.retard = 0; f.foodDone = f.dotDone = f.armDone = false;
      jobs.push(mkJob(f, 'food', ['appros','decontam','cuisine','prepa'], c.food, c.food.robot, std - 200));
      jobs.push(mkJob(f, 'dot', ['dotation'], { dotation: c.dotation }, 0, std - 175));
      jobs.push(mkJob(f, 'arm', ['armement'], { armement: c.armement }, 0, std - 175));
    } else { // RET
      const sta = (f.sta || 0) + CFG.shift;
      jobs.push(mkJob(f, 'plonge', ['plonge'], { plonge: c.plonge }, 0, sta));
    }
  });
}

function mkJob(f, kind, route, work, robot, releaseT) {
  const couleurs = { food:'#38bdf8', dot:'#3fb96b', arm:'#e8c84a', plonge:'#a874e8' };
  return { flight:f, kind, route, work, robot:robot||0, releaseT,
           dueT:(f.due!=null?f.due:releaseT+30), released:false, done:false,
           stationId:null, idx:0, rem:0, remRobot:0, color:couleurs[kind] };
}

/* Réinitialise l'état runtime des stations. */
function initStations() {
  stations = {};
  Object.keys(ZONES).forEach(id => {
    stations[id] = { util:0, qlen:0, usedRate:0, _used:0 };
  });
}

/* ==========================================================================
 *  5. PAS DE SIMULATION
 * ==========================================================================*/
function step(dt) {
  now += dt;

  // Libération des OF arrivés à échéance
  jobs.forEach(j => {
    if (!j.released && now >= j.releaseT) {
      j.released = true; j.idx = 0; j.stationId = j.route[0];
      j.rem = j.work[j.route[0]] || 0;
      j.remRobot = (j.route[0] === 'prepa') ? j.robot : 0;
      spawnEntree(j);
    }
  });

  ordreTraitement.forEach(id => { stations[id]._used = 0; });
  let robotUsed = 0;

  ordreTraitement.forEach(id => {
    const st = stations[id];
    let capLeft = staffCap(id) * dt;
    let robotLeft = (id === 'prepa') ? robotCap() * dt : 0;

    const ici = jobs.filter(j => j.released && !j.done && j.stationId === id);
    ici.sort((a, b) => a.dueT - b.dueT);
    st.qlen = ici.length;

    for (const j of ici) {
      if (id === 'prepa' && j.remRobot > 0) {
        const r = Math.min(robotLeft, j.remRobot);
        j.remRobot -= r; robotLeft -= r; robotUsed += r;
      }
      if (capLeft > 0 && j.rem > 0) {
        const w = Math.min(capLeft, j.rem);
        j.rem -= w; capLeft -= w; st._used += w;
      }
      if (j.rem <= 1e-6 && j.remRobot <= 1e-6) avancer(j);
      if (capLeft <= 1e-6 && robotLeft <= 1e-6) break;
    }

    const cap = staffCap(id) * dt;
    let u = cap > 0 ? st._used / cap : 0;
    if (id === 'prepa') { // le robot compte aussi dans la charge Prépa
      const rc = robotCap() * dt; if (rc > 0) u = Math.max(u, robotUsed / rc);
    }
    const backlog = ici.some(j => j.rem > 1e-6 || j.remRobot > 1e-6);
    if (backlog) u = Math.max(u, 0.97);
    st.util = st.util * 0.82 + u * 0.18;
    st.usedRate = st._used / dt;
  });

  // Ateliers "tampons" (charge indicative)
  stations.magasin.util = 0.15 + 0.4 * stations.prepa.util;
  stations.bobduty.util = 0.2 + 0.3 * Math.max(stations.armement.util, 0);
  stations.handling.util = 0.1 + 0.3 * stations.prepa.util;
  stations.piste = stations.piste || { util:0 };

  Sim.robotRate = robotUsed / dt;             // trays/min instantané
}

/* Fait progresser un OF vers la station suivante (et anime un token). */
function avancer(j) {
  const cour = j.stationId;
  j.idx++;
  if (j.idx < j.route.length) {
    const ns = j.route[j.idx];
    spawnToken(edgePour(j.kind, cour, ns), j.color);
    j.stationId = ns;
    j.rem = j.work[ns] || 0;
    j.remRobot = (ns === 'prepa') ? j.robot : 0;
  } else {
    // Fin de chaîne
    finaliser(j, cour);
    j.done = true;
  }
}

function finaliser(j, cour) {
  const f = j.flight;
  if (j.kind === 'food') { spawnToken('e_prepa_hand', j.color); setTimeout(()=>spawnToken('e_hand_piste', j.color), 400); f.foodDone = true; }
  else if (j.kind === 'dot') { spawnToken('e_dot_piste', j.color); f.dotDone = true; }
  else if (j.kind === 'arm') { spawnToken('e_arm_piste', j.color); f.armDone = true; }
  else if (j.kind === 'plonge') { spawnToken('e_plon_prepa', j.color); spawnToken('e_plon_dot', j.color); }

  if (f.sens === 'DEP' && f.foodDone && f.dotDone && f.armDone && f.readyTime == null) {
    f.readyTime = now;
    f.retard = Math.max(0, now - f.due);
  }
}

/* Token d'entrée (depuis une source) vers la première station. */
function spawnEntree(j) {
  if (j.kind === 'food') spawnToken('e_app_dec', j.color);
  else if (j.kind === 'plonge') spawnToken('e_ret_plon', j.color);
  else if (j.kind === 'arm') spawnToken('e_ret_arm', j.color);
}

function edgePour(kind, from, to) {
  const map = {
    'appros>decontam':'e_app_dec', 'decontam>cuisine':'e_dec_cuis', 'cuisine>prepa':'e_cuis_prepa'
  };
  return map[from + '>' + to] || null;
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
  const goulot = goulotCourant();
  return { ontime, retardMoy, wip, debit, goulot, prets:prets.length, total:dep.length };
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

function couleurCharge(u) {
  if (u < 0.55) return 'var(--vert)';
  if (u < 0.85) return 'var(--orange)';
  return 'var(--rouge)';
}

/* ==========================================================================
 *  7. RENDU DU PLAN (SVG construit une fois, mis à jour ensuite)
 * ==========================================================================*/
const SVGNS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('plan');
let tokens = [];
const zoneEls = {};

function svgEl(t, a) { const e = document.createElementNS(SVGNS, t); for (const k in a) e.setAttribute(k, a[k]); return e; }

function construirePlan() {
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  // Arêtes
  const gEdges = svgEl('g', {});
  Object.keys(EDGES).forEach(id => {
    const e = EDGES[id];
    const p = e.p;
    const path = svgEl('path', { id:'edge-' + id, class:'edge' + (e.retour ? ' retour' : ''),
      d:`M ${p[0][0]} ${p[0][1]} Q ${p[1][0]} ${p[1][1]} ${p[2][0]} ${p[2][1]}` });
    gEdges.appendChild(path);
    // flèche
    const ang = Math.atan2(p[2][1]-p[1][1], p[2][0]-p[1][0]);
    const [ax,ay] = [p[2][0], p[2][1]];
    const fl = svgEl('path', { class:'edge' + (e.retour?' retour':''),
      d:`M ${ax} ${ay} L ${ax-9*Math.cos(ang-0.4)} ${ay-9*Math.sin(ang-0.4)} M ${ax} ${ay} L ${ax-9*Math.cos(ang+0.4)} ${ay-9*Math.sin(ang+0.4)}` });
    gEdges.appendChild(fl);
  });
  svg.appendChild(gEdges);

  // Zones
  Object.keys(ZONES).forEach(id => {
    const z = ZONES[id];
    const g = svgEl('g', { class:'zone', 'data-id':id });
    g.appendChild(svgEl('rect', { class:'fond', x:z.x, y:z.y, width:z.w, height:z.h, rx:9 }));
    const t = svgEl('text', { class:'titre', x:z.x+12, y:z.y+22 }); t.textContent = z.nom; g.appendChild(t);
    (z.sous||[]).forEach((s,i) => { const st = svgEl('text', { class:'sous', x:z.x+12, y:z.y+38+i*13 }); st.textContent = s; g.appendChild(st); });
    // stockages internes
    (z.stores||[]).forEach(s => {
      g.appendChild(svgEl('rect', { class:'storage', x:s[1], y:s[2], width:s[3], height:s[4], rx:4 }));
      const tt = svgEl('text', { class:'storage-txt', x:s[1]+5, y:s[2]+s[4]/2+3 }); tt.textContent = s[0]; g.appendChild(tt);
    });
    // jauge de charge
    if (!z.sink) {
      g.appendChild(svgEl('rect', { class:'barre-fond', x:z.x+12, y:z.y+z.h-14, width:z.w-24, height:7, rx:3.5 }));
      const jauge = svgEl('rect', { class:'barre-jauge', x:z.x+12, y:z.y+z.h-14, width:0, height:7, rx:3.5, fill:'var(--vert)' });
      g.appendChild(jauge);
      zoneEls[id] = { g, jauge, rect:g.querySelector('rect.fond') };
    } else {
      zoneEls[id] = { g, rect:g.querySelector('rect.fond') };
    }
    // ressources spéciales
    if (z.robot) ajoutRessource(g, z.x+z.w-118, z.y+34, 'ROBOT', 'robot');
    if (z.tunnels) ajoutRessource(g, z.x+14, z.y+z.h-64, 'TUNNELS', 'tunnels');
    // badge goulot (caché par défaut)
    const badge = svgEl('text', { class:'goulot-badge', x:z.x+z.w-14, y:z.y+18, 'text-anchor':'end' });
    badge.textContent = ''; g.appendChild(badge); zoneEls[id].badge = badge;

    g.addEventListener('click', () => selectionner(id));
    svg.appendChild(g);
  });

  // couche des tokens (au-dessus)
  const gTok = svgEl('g', { id:'tokens' }); svg.appendChild(gTok);
  Sim._gTok = gTok;
}

function ajoutRessource(g, x, y, label, type) {
  g.appendChild(svgEl('rect', { class:'ressource-box', x, y, width:104, height:38, rx:5 }));
  const l = svgEl('text', { class:'ressource-txt', x:x+8, y:y+14 }); l.textContent = label; g.appendChild(l);
  const v = svgEl('text', { class:'ressource-val', x:x+8, y:y+30, id:'res-' + type }); v.textContent = '—'; g.appendChild(v);
}

let selection = null;
function selectionner(id) {
  selection = (selection === id) ? null : id;
  Object.keys(zoneEls).forEach(k => zoneEls[k].g.classList.toggle('selection', k === selection));
  majGoulotInfo();
}

/* --- Tokens animés -------------------------------------------------------- */
function spawnToken(edgeId, color) {
  if (!edgeId || tokens.length > 90) return;
  const path = document.getElementById('edge-' + edgeId);
  if (!path) return;
  const c = svgEl('circle', { r:4.5, fill:color, opacity:0.95 });
  Sim._gTok.appendChild(c);
  tokens.push({ el:c, path, len:path.getTotalLength(), t:0, v:0.010 + Math.random()*0.006 });
}
function animerTokens() {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tk = tokens[i];
    tk.t += tk.v;
    if (tk.t >= 1) { tk.el.remove(); tokens.splice(i, 1); continue; }
    const pt = tk.path.getPointAtLength(tk.t * tk.len);
    tk.el.setAttribute('cx', pt.x); tk.el.setAttribute('cy', pt.y);
  }
}

/* --- Mise à jour visuelle des zones -------------------------------------- */
function majPlan() {
  Object.keys(ZONES).forEach(id => {
    const z = ZONES[id]; const st = stations[id]; const els = zoneEls[id];
    if (!els || z.sink) return;
    const u = Math.min(1, st.util);
    const col = couleurCharge(u);
    if (els.jauge) { els.jauge.setAttribute('width', (z.w-24) * u); els.jauge.setAttribute('fill', col); }
    els.rect.setAttribute('fill', melange(u));
    els.rect.setAttribute('stroke', u >= 0.85 ? 'var(--rouge)' : (u >= 0.55 ? 'var(--orange)' : 'var(--bordure2)'));
    els.g.classList.toggle('saturee', u >= 0.85);
    if (els.badge) els.badge.textContent = (st.qlen > 0 ? st.qlen + ' OF' : '');
  });
  // ressources
  const r = document.getElementById('res-robot');
  if (r) r.textContent = Math.round((Sim.robotRate||0)*60) + '/' + CFG.robotCadence;
  const t = document.getElementById('res-tunnels');
  if (t) t.textContent = CFG.tunnels + (CFG.tunnelDouble ? ' (1×2)' : '');
}
function melange(u) {
  // fond de zone légèrement teinté selon la charge
  if (u < 0.55) return '#16202c';
  if (u < 0.85) return '#2a2416';
  return '#2c1a18';
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

  // charge par atelier
  const box = document.getElementById('stats-ateliers');
  box.innerHTML = '';
  ['appros','decontam','cuisine','prepa','dotation','plonge','armement'].forEach(id => {
    const st = stations[id]; const u = Math.min(1, st.util);
    const d = document.createElement('div'); d.className = 'stat-atelier';
    d.innerHTML =
      '<div class="haut"><span>' + ZONES[id].nom + '<span class="badge-q">' + (st.qlen?('· '+st.qlen+' OF'):'') + '</span></span>' +
      '<b>' + Math.round(u*100) + '%</b></div>' +
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
    el.innerHTML = '<b style="color:var(--accent2)">' + ZONES[selection].nom + '</b> sélectionné<br>' +
      'Charge : <b>' + Math.round(st.util*100) + '%</b> · File : <b>' + st.qlen + ' OF</b>' +
      (CFG.staff[selection] != null ? '<br>Effectif : <b>' + CFG.staff[selection] + '</b> pers.' : '');
    return;
  }
  if (!enMarche && now <= CFG.jour.debut + 1) { el.textContent = 'Simulation à l\'arrêt. Cliquez sur « Lancer ».'; return; }
  if (!goulot) { el.innerHTML = '<span style="color:var(--vert)">✔ Aucun goulot — flux fluide.</span>'; return; }
  el.innerHTML = '<b style="color:var(--rouge)">🔴 ' + goulot.nom + '</b><br>Charge ' +
    Math.round(goulot.sev*100) + '% · file ' + goulot.qlen + ' OF.<br>' +
    '<span class="mini-note">Ajustez l\'effectif' + (goulot.id==='prepa'?' ou la cadence robot':goulot.id==='plonge'?' ou les tunnels':'') + '.</span>';
}

/* --- Courbe débit / WIP --------------------------------------------------- */
const chart = document.getElementById('chart');
function dessinerChart() {
  const ctx = chart.getContext('2d');
  const w = chart.width = chart.clientWidth; const h = chart.height = 110;
  ctx.clearRect(0, 0, w, h);
  if (historique.length < 2) return;
  const t0 = CFG.jour.debut, t1 = CFG.jour.fin;
  const maxDebit = Math.max(560, ...historique.map(p => p.debit));
  const maxWip = Math.max(10, ...historique.map(p => p.wip));
  const X = t => (t - t0) / (t1 - t0) * w;
  // grille verticale (heures)
  ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.fillStyle = '#5f7086'; ctx.font = '9px sans-serif';
  for (let hh = 6; hh <= 22; hh += 4) { const x = X(hh*60); ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h-12); ctx.stroke(); ctx.fillText(hh+'h', x+2, h-2); }
  // WIP (aire)
  ctx.beginPath(); ctx.moveTo(X(historique[0].t), h-12);
  historique.forEach(p => ctx.lineTo(X(p.t), (h-12) - (p.wip/maxWip)*(h-20)));
  ctx.lineTo(X(historique[historique.length-1].t), h-12); ctx.closePath();
  ctx.fillStyle = 'rgba(168,116,232,.18)'; ctx.fill();
  // débit (ligne)
  ctx.beginPath(); ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2;
  historique.forEach((p,i) => { const x=X(p.t), y=(h-12)-(p.debit/maxDebit)*(h-20); i?ctx.lineTo(x,y):ctx.moveTo(x,y); });
  ctx.stroke();
  // curseur temps courant
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.moveTo(X(now),0); ctx.lineTo(X(now),h-12); ctx.stroke();
}

/* ==========================================================================
 *  9. BOUCLE TEMPS RÉEL
 * ==========================================================================*/
let dernierReel = 0, accHist = 0;
function boucle(ts) {
  if (!enMarche) return;
  const dtReel = Math.min(0.1, (ts - dernierReel) / 1000);
  dernierReel = ts;
  let dtSim = dtReel * vitesse;

  // avance par petits pas pour la stabilité
  const pas = 0.5;
  while (dtSim > 0 && now < CFG.jour.fin) {
    const p = Math.min(pas, dtSim);
    step(p); dtSim -= p;
    accHist += p;
    if (accHist >= 10) { accHist = 0; historique.push({ t:now, debit:Math.round((Sim.robotRate||0)*60), wip:jobs.filter(j=>j.released&&!j.done).length }); }
  }

  animerTokens();
  majHorloge(); majPlan(); majDashboard(); dessinerChart();

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
  if (enMarche) return;
  if (now >= CFG.jour.fin) reset();
  enMarche = true; dernierReel = performance.now();
  document.getElementById('btn-play').textContent = '⏸ Pause';
  document.getElementById('btn-play').className = 'btn btn-pause';
  requestAnimationFrame(boucle);
}
function pause() {
  enMarche = false;
  document.getElementById('btn-play').textContent = '▶ Reprendre';
  document.getElementById('btn-play').className = 'btn btn-play';
}
function basculer() { enMarche ? pause() : lancer(); }

function reset(data) {
  pause();
  now = CFG.jour.debut; historique = []; tokens.forEach(t=>t.el.remove()); tokens = [];
  build(data || Sim.dataCourante || SAMPLE);
  initStations();
  document.getElementById('btn-play').textContent = '▶ Lancer';
  document.getElementById('btn-play').className = 'btn btn-play';
  majHorloge(); majPlan(); majDashboard(); dessinerChart();
}

function toast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(()=>t.classList.remove('on'), 1800);
}

/* --- Câblage des sliders / boutons --------------------------------------- */
function initControles() {
  // effectifs
  const box = document.getElementById('sliders-staff');
  Object.keys(CFG.staff).forEach(id => {
    const d = document.createElement('div'); d.className = 'slider-ligne';
    d.innerHTML = '<label>' + ZONES[id].nom + ' <b id="s-' + id + '">' + CFG.staff[id] + '</b></label>' +
      '<input type="range" min="0" max="40" value="' + CFG.staff[id] + '" data-id="' + id + '">';
    box.appendChild(d);
    d.querySelector('input').addEventListener('input', e => {
      CFG.staff[id] = +e.target.value; document.getElementById('s-' + id).textContent = e.target.value;
      majPlan(); majDashboard();
    });
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

  // scénarios A/B
  document.getElementById('snap-a').addEventListener('click', () => capturer('A'));
  document.getElementById('snap-b').addEventListener('click', () => capturer('B'));
  document.getElementById('snap-clear').addEventListener('click', () => { snaps = {}; majCompare(); });

  // import CSV
  document.getElementById('imp-vols').addEventListener('change', importVols);

  window.addEventListener('resize', dessinerChart);
}

/* --- Scénarios A / B ------------------------------------------------------ */
let snaps = {};
function capturer(slot) {
  const k = kpis();
  snaps[slot] = { ontime:k.ontime, retard:k.retardMoy, debit:k.debit, wip:k.wip,
                  robot:CFG.robotCadence, prepa:CFG.staff.prepa, tunnels:CFG.tunnels };
  majCompare(); toast('Scénario ' + slot + ' capturé');
}
function majCompare() {
  const tb = document.querySelector('#compare tbody');
  const lignes = [['Robot pl/h','robot'],['Staff Prépa','prepa'],['Tunnels','tunnels'],
                  ['Vols à l\'heure %','ontime'],['Retard moy.','retard'],['Débit /h','debit'],['WIP','wip']];
  let html = '<thead><tr><th>KPI</th><th>A</th><th>B</th></tr></thead>';
  lignes.forEach(l => {
    const a = snaps.A ? snaps.A[l[1]] : '—', b = snaps.B ? snaps.B[l[1]] : '—';
    html += '<tr><td>' + l[0] + '</td><td>' + a + '</td><td>' + b + '</td></tr>';
  });
  tb.parentElement.innerHTML = html;
}

/* --- Import / export ------------------------------------------------------ */
function importVols(e) {
  const file = e.target.files[0]; if (!file) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const data = parseVols(rd.result);
      if (!data.length) { toast('CSV vide ou illisible'); return; }
      Sim.dataCourante = data; reset(data); toast(data.length + ' vols importés');
    } catch (err) { toast('Erreur de lecture CSV'); console.error(err); }
  };
  rd.readAsText(file);
}
function parseVols(txt) {
  const lignes = txt.split(/\r?\n/).filter(l => l.trim());
  if (!lignes.length) return [];
  const head = lignes[0].split(/[,;]/).map(s => s.trim().toLowerCase());
  const idx = n => head.findIndex(h => h.includes(n));
  const c = { id:idx('vol'), cie:idx('compagnie'), av:idx('type'), sens:idx('sens'),
              std:idx('std'), sta:idx('sta'), bc:idx('bc'), pc:idx('pc'), yc:idx('yc') };
  const toMin = v => { if (!v) return 0; if (v.includes(':')) { const [h,m]=v.split(':'); return (+h)*60+(+m||0); } return +v||0; };
  return lignes.slice(1).map((l,i) => {
    const p = l.split(/[,;]/).map(s => s.trim());
    const sens = (c.sens>=0 ? (p[c.sens]||'DEP') : 'DEP').toUpperCase().includes('RET') ? 'RET' : 'DEP';
    return { id: c.id>=0?p[c.id]:'V'+i, cie:c.cie>=0?p[c.cie]:'—', avion:c.av>=0?p[c.av]:'—', sens,
             std: c.std>=0?toMin(p[c.std]):7*60, sta:c.sta>=0?toMin(p[c.sta]):7*60,
             bc:+(p[c.bc]||0), pc:+(p[c.pc]||0), yc:+(p[c.yc]||0) };
  }).filter(f => f.bc||f.pc||f.yc);
}
function exporter() {
  const k = kpis();
  const data = { horaire:document.getElementById('horloge').textContent, config:CFG, kpis:k,
    vols: flights.map(f => ({ id:f.id, sens:f.sens, readyTime:f.readyTime, retard:f.retard })),
    ateliers: Object.keys(ZONES).reduce((o,id)=>{ o[id]={util:Math.round(stations[id].util*100),file:stations[id].qlen}; return o; }, {}) };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'newrest-orly-resultats.json'; a.click();
  toast('Résultats exportés');
}

/* ==========================================================================
 *  11. DÉMARRAGE
 * ==========================================================================*/
const Sim = { robotRate:0, dataCourante:SAMPLE, _gTok:null };
window.Sim = Sim;

construirePlan();
initStations();
build(SAMPLE);
initControles();
majHorloge(); majPlan(); majDashboard(); dessinerChart();

})();

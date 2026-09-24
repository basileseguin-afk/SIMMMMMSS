/* ============================================================================
 *  Newrest Orly — Simulation des flux de production (interface + rendu)
 *  Les positions et libellés des zones proviennent du plan réel de l'unité.
 *  Le plan lui-même est CONFIDENTIEL et n'est pas dans ce dépôt public :
 *  déposez ses tuiles dans `plan-prive/` en local (dossier non suivi par Git).
 *
 *  Le calcul est fait par `moteur/production.js` (modèle par ateliers de
 *  travail, sur le noyau à événements discrets `moteur/noyau.js`) ; la vue
 *  Simulation le relit avec `replay.js` et `simulation.js`. Ce fichier tient
 *  l'interface, le plan et la glue entre les centres.
 *  ==========================================================================*/
(function () {
'use strict';
const {escapeHTML, parseFlights} = window.OrlyUI;
let activeView = 'plan', dataSource = 'Jeu de démonstration';

/* ==========================================================================
 *  1. PARAMÈTRES DES HORAIRES — les seuls qui ne vivent pas dans un centre
 *  `loadDelay` : minutes entre l'échéance de production et le départ.
 *  `shift` : décalage appliqué à tous les départs, pour éprouver un programme
 *  avancé ou retardé sans réimporter.
 * ==========================================================================*/
const CFG = { loadDelay: 45, shift: 0 };

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

/* Les services du plan de base (clé = identifiant du service).
 * `approx:true` => emplacement estimé, à confirmer. `sous` : sous-titres. */
const ZONES = {
  quais:    { nom:'QUAIS · RÉCEPTION', x:700, y:330, w:1960, h:180, approx:true,
              sous:['camions : départ trolleys / retour vols sales'] },
  handling: { nom:'CF DÉPART FOOD', x:1528, y:673.1, w:808.6, h:230.3,
              sous:['trolleys prêts → camion'] },
  appros:   { nom:'RÉCEPTION / APPROS', x:2680, y:560, w:640, h:250, approx:true,
              sous:['réceptions & commandes'] },
  armement: { nom:'ARMEMENT', x:3065.8, y:755.1, w:317.9, h:296,
              sous:['trolleys non-food'] },
  prepa:    { nom:'MONTAGE', x:2180, y:900, w:400, h:350,
              sous:['dressage plateaux','montage trolleys'] },
  // La prépa précède le montage : elle prépare ce que le montage dresse.
  // Emplacement à confirmer sur le plan (« Modifier le plan »).
  preparation: { nom:'PRÉPA', x:2180, y:1262, w:400, h:110, approx:true,
              sous:['préparation avant montage'] },
  magasin:  { nom:'MAGASIN', x:4009.3, y:1052.8, w:486.7, h:140,
              sous:['produit compagnie'] },
  dotation: { nom:'DOTATION', x:1156, y:1387.9, w:348, h:629.9,
              sous:['couverts + serviettes','assiettes propres'] },
  decontam: { nom:'LÉGUMERIE', x:2555.1, y:1446.3, w:165.7, h:115.2,
              sous:['lavage / décontamination'] },
  bobduty:  { nom:'DUTY FREE', x:787.3, y:1519.5, w:348, h:492,
              sous:['buy-on-board'] },
  cuisine:  { nom:'CUISINE', x:1900, y:1560, w:280, h:520, approx:true,
              sous:['tranche · froid · chaud'] },
  plonge:   { nom:'PLONGE', x:1180, y:2090, w:420, h:330, approx:true,
              sous:['lavage des retours'] }
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
/* Tracé SVG de la zone. */
function dZone(z) {
  if (estPoly(z)) return 'M ' + z.pts.map(pt => pt[0] + ' ' + pt[1]).join(' L ') + ' Z';
  const b = boite(z);
  return 'M ' + b.x + ' ' + b.y + ' L ' + (b.x+b.w) + ' ' + b.y +
         ' L ' + (b.x+b.w) + ' ' + (b.y+b.h) + ' L ' + b.x + ' ' + (b.y+b.h) + ' Z';
}
/* La géométrie derrière un identifiant : un atelier du moteur, ou une zone
 * tracée dans l'éditeur — une annexe comme « Armement 2 ». Sans cela une
 * liaison vers une annexe ne saurait où aller. */
function zoneParId(id) {
  if (ZONES[id]) return ZONES[id];
  const e = Sim.editor;
  return (e && e.state.zones.find(z => z.id === id)) || null;
}
function centre(id) { const b = boite(zoneParId(id)); return { x:b.x + b.w/2, y:b.y + b.h/2 }; }
// Point sur le bord de la boîte englobante en direction d'une cible
function bord(id, cible) {
  const b = boite(zoneParId(id)), cx = b.x + b.w/2, cy = b.y + b.h/2;
  const dx = cible.x - cx, dy = cible.y - cy;
  if (dx === 0 && dy === 0) return { x:cx, y:cy };
  const sx = dx !== 0 ? (b.w/2) / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? (b.h/2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x:cx + dx*s, y:cy + dy*s };
}

/* ==========================================================================
 *  3. PROGRAMME DE VOLS
 *  Le jeu de démonstration (`vols-demo.js`) tant que l'unité n'a pas importé
 *  le sien. Le décalage global s'applique ici, une fois pour toutes : le
 *  modèle par ateliers reçoit des horaires déjà décalés.
 * ==========================================================================*/
const SAMPLE = window.OrlyDemo.VOLS;
let flights = [];

function chargerVols(data) {
  flights = (data || []).map(f => Object.assign({}, f, {
    std: f.std == null ? f.std : f.std + CFG.shift,
    sta: f.sta == null ? f.sta : f.sta + CFG.shift
  }));
  if (document.getElementById('source-count')) updateSource();
}

/* ==========================================================================
 *  7. RENDU DU PLAN
 * ==========================================================================*/
const SVGNS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('plan');
const zoneEls = {};
let editMode = false;
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

  // Arêtes de flux : celles du Centre des flux, redessinées à chaque changement.
  gVue.appendChild(svgEl('g', { id:'flow-edges' }));

  // Ateliers (au-dessus)
  const gZones = svgEl('g', {}); gVue.appendChild(gZones);
  Object.keys(ZONES).forEach(id => {
    const z = ZONES[id];
    const g = svgEl('g', { class:'zone', 'data-id':id });
    const rect = svgEl('path', { class:'fond' }); g.appendChild(rect);
    const ti = svgEl('title', {}); g.appendChild(ti);
    const titre = svgEl('text', { class:'titre' }); titre.textContent = nomLisible(z.nom); g.appendChild(titre);
    const sous = (z.sous || []).map(s => {
      const st = svgEl('text', { class:'sous' }); st.textContent = s; g.appendChild(st); return st;
    });
    // Le pictogramme du service, au centre : on reconnaît la cuisine sans lire.
    let ico = null;
    if (window.OrlyIcones) {
      ico = svgEl('g', { class:'zone-ico', 'aria-hidden':'true' });
      ico.innerHTML = '<circle cx="12" cy="12" r="13.5"/><g class="zone-ico-trait">'
        + OrlyIcones.TRAITS[OrlyIcones.icoService(id, z.nom)] + '</g>';
      g.insertBefore(ico, titre);
    }
    // Ce qui attend devant le service à l'heure rejouée : repas en stock, ou sale à laver.
    const stockG = svgEl('g', { class:'zone-stock', 'aria-hidden':'true' });
    const stockR = svgEl('rect', { rx:22 }), stockT = svgEl('text', {});
    stockG.appendChild(stockR); stockG.appendChild(stockT); stockG.style.display='none'; g.appendChild(stockG);
    zoneEls[id] = { g, rect, titre, sous, ico, tip:ti, b:boite(z), stock:{ g:stockG, r:stockR, t:stockT } };
    g.setAttribute('role','button'); g.setAttribute('tabindex','0'); g.setAttribute('aria-label',nomLisible(z.nom));
    g.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){e.preventDefault();selectionner(id);} });
    g.addEventListener('click', e => { e.stopPropagation(); selectionner(id); });
    gZones.appendChild(g);
    positionnerZone(id);
  });

  initInteractions();
}

/* Place tous les éléments d'une zone d'après sa géométrie courante. */
function positionnerZone(id) {
  const z = ZONES[id], e = zoneEls[id]; if (!e) return;
  const b = boite(z); e.b = b;
  const s = (el, a) => { for (const k in a) el.setAttribute(k, a[k]); };
  e.rect.setAttribute('d', dZone(z));
  e.g.classList.toggle('approx', !!z.approx);
  e.tip.textContent = nomLisible(z.nom) + (z.approx ? ' (emplacement à confirmer)' : '');
  s(e.titre, { x:b.x + 14, y:b.y + 56 });
  e.sous.forEach((st, i) => s(st, { x:b.x + 14, y:b.y + 96 + i*38 }));
  if (e.ico) {
    const taille = Math.max(56, Math.min(150, Math.min(b.w, b.h) * 0.5));
    const k = taille / 27, cx = b.x + b.w / 2, cy = b.y + b.h / 2 + (b.h > 200 ? 24 : 0);
    e.ico.setAttribute('transform', 'translate(' + (cx - 12 * k) + ',' + (cy - 12 * k) + ') scale(' + k + ')');
  }
}

/* Redessine les arêtes : celles du Centre des flux, dès qu'il existe. */
function redessinerEdges() { if (Sim.flows) dessinerFluxConfigures(); }

function dessinerFluxConfigures(){
  const group=document.getElementById('flow-edges');group.replaceChildren();
  const points=Sim.flows.points,pairs=new Map();
  document.getElementById('fc-map-scope').textContent=Sim.flows.mapOwner?' · '+nomLisible(zoneParId(Sim.flows.mapOwner)?.nom||'Service absent'):'';
  for(const flow of Sim.flows.mapFlows()){
    const a=points.find(p=>p.id===flow.from),b=points.find(p=>p.id===flow.to);
    // Une zone supprimée depuis la saisie du flux n'a plus de géométrie : on
    // ne dessine pas plutôt que de faire tomber tout le tracé.
    if(!a||!b||!zoneParId(a.owner)||!zoneParId(b.owner))continue;
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
/* Le nom d'un service tel qu'on l'affiche : lisible, même s'il est enregistré en capitales. */
const nomLisible=n=>window.OrlyIcones?OrlyIcones.nomLisible(n):n;
/* Stocks et retours : ce qui attend entre deux ateliers, et devant la plonge. */
function majStocks(){
  if(!window.OrlyTemps)return;
  const noms=Object.fromEntries(servicesDisponibles().map(s=>[s.id,s.nom]));
  OrlyTemps.rendre(document.getElementById('journee-stocks'),Sim.ateliers&&Sim.ateliers.resultat,id=>noms[id]);
}
function servicesDisponibles(){
  const liste=Object.keys(ZONES).map(id=>({id,nom:nomLisible(ZONES[id].nom)}));
  for(const a of annexes()) liste.push({id:a.id,nom:nomLisible(a.nom)});
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
    // … sauf si on l'a câblée soi-même dans le Centre des flux : la saisie
    // explicite l'emporte sur l'héritage, sinon on ne pourrait jamais donner
    // à une annexe un parcours qui lui soit propre.
    if(liens.some(l=>l.from===a.id||l.to===a.id))continue;
    for(const l of liens){
      if(l.to===a.parent) out.push({from:l.from,to:a.id});
      if(l.from===a.parent) out.push({from:a.id,to:l.to});
    }
  }
  return out;
}
/* ==========================================================================
 *  CE QUE LE MODÈLE LIT DU CENTRE DES FLUX
 *  Depuis les ateliers de travail, ce graphe n'est plus décoratif : il donne
 *  le parcours des compagnies × classes. Un service ne travaille une classe
 *  que lorsque TOUS ses fournisseurs la lui ont livrée. Cette lecture rend
 *  visible ce que le moteur en retient — et ce qui, dans le graphe, ne
 *  produira rien.
 * ==========================================================================*/
function lectureDuGraphe(){
  const liens=liaisonsServices();
  const noms=new Map(servicesDisponibles().map(s=>[s.id,s.nom]));
  const nom=id=>noms.get(id)||id;
  const ateliers=(Sim.ateliers&&Sim.ateliers.state.ateliers)||[];

  const equipes=new Map();
  for(const a of ateliers){
    const e=equipes.get(a.service)||{n:0,dispo:false,fabrique:false};
    e.n++; if(a.type==='dispo')e.dispo=true; if((a.lots||[]).some(l=>l.length))e.fabrique=true;
    equipes.set(a.service,e);
  }
  // Un service ne compte dans le parcours que s'il porte une équipe : c'est
  // l'atelier qui met un service sur le chemin d'une classe, pas la liaison.
  const concernes=new Set([...equipes.keys()]);
  for(const l of liens){ if(concernes.has(l.to))concernes.add(l.from); }

  const lignes=[...concernes].map(id=>{
    const e=equipes.get(id)||{n:0,dispo:false,fabrique:false};
    return { id, nom:nom(id), equipes:e.n, dispo:e.dispo, produit:e.dispo||e.fabrique,
      amonts:[...new Set(liens.filter(l=>l.to===id).map(l=>l.from))],
      avals:[...new Set(liens.filter(l=>l.from===id).map(l=>l.to))] };
  }).sort((a,b)=>a.amonts.length-b.amonts.length||a.nom.localeCompare(b.nom));

  // Une alerte par NATURE de problème, pas par service : cinq fois la même
  // phrase ne se lit plus, et ce qu'il y a à faire est le même pour tous.
  const alertes=[];
  const grouper=(liste,grave,texte)=>{ if(liste.length) alertes.push({grave,texte:texte(liste.map(l=>nom(l.id)))}); };
  grouper(lignes.filter(l=>!l.equipes), true, noms2=>
    noms2.join(', ')+(noms2.length>1?' fournissent':' fournit')+' sans avoir d’équipe : '
    +'rien n’en sort, et personne ne '+(noms2.length>1?'les':'l’')+' attend. '
    +'Donnez-'+(noms2.length>1?'leur':'lui')+' une équipe — une « mise à disposition » '
    +'suffit pour un magasin, des appros ou tout ce qui ne fait que sortir du matériel.');
  grouper(lignes.filter(l=>l.equipes&&!l.produit), true, noms2=>
    noms2.join(', ')+' : une équipe est décrite mais ne prépare rien. Dites ce qu’elle prépare.');
  grouper(lignes.filter(l=>l.produit&&!l.amonts.length&&!l.avals.length), false, noms2=>
    noms2.join(', ')+' n’est relié à personne : ce qui y est préparé ne sert à aucun autre service.');
  grouper(lignes.filter(l=>l.produit&&l.avals.length===0&&l.amonts.length), false, noms2=>
    noms2.join(', ')+' ne livre à personne. Normal en bout de chaîne.');
  // Un cycle bloquerait la fabrication sans jamais rien dire.
  const fourn=MoteurProduction.fournisseurs(liens);
  for(const c of MoteurProduction.cycles(fourn,new Set(lignes.filter(l=>l.produit).map(l=>l.id))))
    alertes.push({ service:c[0], grave:true,
      texte:'Boucle sans fin : '+c.map(nom).join(' → ')+'. Le modèle refusera de tourner.' });

  return { lignes, alertes, liens, noms:Object.fromEntries(noms) };
}
function initAteliers(){
  Sim.ateliers=new OrlyAteliers.CentreAteliers({
    hote:()=>document.getElementById('view-ateliers'),
    services:servicesDisponibles,
    vols:()=>flights,
    classes:()=>MoteurProduction.classesDeVols(flights,{delaiChargement:CFG.loadDelay}),
    liaisons:liaisonsServices,
    reglages:()=>(Sim.reglages?Sim.reglages.pourMoteur():{delaiChargement:CFG.loadDelay}),
    // Le plan dit « aménagé » d'après les ateliers : il doit suivre leur saisie.
    // La liste du barème marque les services qui portent une équipe : elle doit
    // donc se redessiner quand les ateliers bougent.
    change:()=>{majEtatPlan();majDemarrage();if(Sim.reglages)Sim.reglages.rendre();if(Sim.vue)Sim.vue.recalculer();majStocks();},
    // Une case se règle dans le chemin d'une commande : l'ouvrir d'ailleurs y mène.
    onglet:id=>{if(Sim.onglets)Sim.onglets.choisir(id);},
    notify:toast
  });
}
/* ==========================================================================
 *  PAR OÙ COMMENCER
 *  Ce que le fil de mise en route relit. Rien n'est calculé ici : chaque
 *  chiffre vient de celui qui le tient déjà. L'état de départ le plus utile
 *  est celui qu'on n'a pas eu à saisir deux fois.
 * ==========================================================================*/
function etatDemarrage(){
  const zones=(Sim.editor&&Sim.editor.state.zones)||[];
  const lu=Sim.flows?lectureDuGraphe():{lignes:[],alertes:[]};
  const r=(Sim.ateliers&&Sim.ateliers.resultat)||{};
  const ats=(Sim.ateliers&&Sim.ateliers.state.ateliers)||[];
  const fabriquent=ats.filter(a=>a.type==='dispo'||a.type==='lavage'||(a.lots||[]).some(l=>l.length)).length;
  // « Calibré » ne veut pas dire « juste » : seulement que ce ne sont plus les
  // valeurs de démonstration. C'est tout ce qu'on peut honnêtement constater.
  let calibre=false;
  try{ calibre=Sim.reglages
    ? JSON.stringify(Sim.reglages.etat.bareme)!==JSON.stringify(MoteurProduction.BAREME_DEMO)
    : false; }catch(e){ calibre=false; }
  return {
    vols:{ total:flights.length, departs:flights.filter(f=>f.sens==='DEP').length,
           source:dataSource==='Jeu de démonstration'?'demo':'importe' },
    plan:{ services:Object.keys(ZONES).length+annexes().length,
           approx:zones.filter(z=>z.approx&&z.visible!==false).length },
    flux:{ liaisons:Sim.flows?Sim.flows.state.flows.filter(f=>f.enabled).length:0,
           alertes:lu.alertes.filter(a=>a.grave).length },
    ateliers:{ total:ats.length, fabriquent,
               absentes:(r.indicateurs||{}).classesAbsentes||0 },
    bareme:{ calibre },
    journee:{ calculee:!!(r.lots&&r.lots.length), suivies:(r.indicateurs||{}).classesSuivies||0,
              aHeure:(r.indicateurs||{}).aHeure||0,
              fin:Number.isFinite((r.indicateurs||{}).finDerniere)?MoteurProduction.hhmm(r.indicateurs.finDerniere):null }
  };
}
function majDemarrage(){ if(Sim.demarrage)Sim.demarrage.rendre(); if(Sim.onglets)Sim.onglets.rendre(); }
/* Un nombre sur un onglet dit qu'il y a quelque chose à y faire, sans l'ouvrir. */
function badgeOnglet(id){
  const r=(Sim.ateliers&&Sim.ateliers.resultat)||{};
  // Les commandes qui n'ont pas encore leur chemin : ce qui reste à dessiner.
  if(id==='at-chemins'&&window.OrlyParcours&&Sim.ateliers){
    const n=Sim.ateliers.classes.filter(c=>!OrlyParcours.cheminDe(Sim.ateliers.state,c.id)).length;
    return n?{n,ton:'neutre',titre:n+(n>1?' commandes sans chemin':' commande sans chemin')}:null;
  }
  if(id==='at-repas'){
    const n=(r.indicateurs||{}).classesAbsentes||0;
    return n?{n,ton:'neutre',titre:n+(n>1?' commandes':' commande')+' sans équipe'}:null;
  }
  if(id==='u-lecture'&&Sim.flows){
    const n=lectureDuGraphe().alertes.filter(a=>a.grave).length;
    return n?{n,ton:'attente',titre:n+(n>1?' points':' point')+' à corriger'}:null;
  }
  return null;
}
function initOnglets(){
  if(!window.OrlyOnglets)return;
  Sim.onglets=new OrlyOnglets.SousOnglets({
    hote:()=>document.getElementById('sous-onglets'),
    vue:()=>activeView,
    badge:badgeOnglet,
    change:(vue,id)=>{
      if(vue!==activeView)showView(vue);
      if(id==='v-departs')renderFlights();
      if(id==='u-lecture'&&Sim.flows)Sim.flows.refresh();
      // La fenêtre d'une case se cale sous la barre des onglets, mesurée une fois visible.
      if(id==='at-chemins'&&Sim.ateliers)Sim.ateliers.parcours.placeTiroir();
    }
  });
  // Les outils d'une vue (annuler, Excel, importer) montent sur la barre des
  // onglets : ils valent pour toute la vue, ils n'ont pas à prendre une ligne.
  const outils=document.getElementById('so-outils');
  // Ceux des liens ne valent que pour les liens : ils ne suivent pas dans la sauvegarde.
  for(const [vue,sel,onglet] of [['ateliers','#view-ateliers .at-actions'],['reglages','#rg-bareme-panneau .rg-actions'],
                                 ['flux','#view-flux .fc-actions','u-liens']]){
    const e=document.querySelector(sel);if(!e||!outils)continue;
    e.dataset.vueOutils=vue;if(onglet)e.dataset.sous=onglet;outils.appendChild(e);
  }
  Sim.onglets.rendre();
}
function initDemarrage(){
  // Les pictogrammes posés dans la page : un par indicateur, un par panneau.
  if(window.OrlyIcones)document.querySelectorAll('[data-ico]').forEach(e=>{if(!e.firstChild)e.innerHTML=OrlyIcones.ico(e.dataset.ico);});
  if(!window.OrlyDemarrage)return;
  Sim.demarrage=new OrlyDemarrage.Demarrage({
    hote:()=>document.getElementById('etapes'),
    comment:()=>document.getElementById('comment'),
    etat:etatDemarrage, vue:()=>activeView, aller:onglet=>showView(onglet)
  });
  document.getElementById('btn-comment').addEventListener('click',()=>Sim.demarrage.basculer());
  // On arrive sur l'étape à faire ensuite, pas sur une journée vide.
  const s=OrlyDemarrage.suite(OrlyDemarrage.etapes(etatDemarrage()));
  if(s.etape&&s.etape.onglet!==activeView)showView(s.etape.onglet);
  afficherTitre(activeView);
}
/* Le titre de la vue et la phrase qui dit, en mots simples, ce qu'on y voit. */
function afficherTitre(name){
  const v=(window.OrlyDemarrage&&OrlyDemarrage.VUES[name])||{titre:name,intro:''};
  document.getElementById('view-title').textContent=v.titre;
  const e=window.OrlyIcones&&OrlyIcones.ETAPES[name], tuile=document.getElementById('view-ico');
  if(e&&tuile){tuile.innerHTML=OrlyIcones.ico(e.ico);tuile.style.setProperty('--c',e.couleur);}
  const intro=document.getElementById('view-intro');if(intro)intro.textContent=v.intro;
}
function initFlux(){
  Sim.flows=new OrlyFlows.FlowCenter({zones:()=>Sim.editor.state.zones.map(z=>({...z,nom:nomLisible(z.nom)})),legacy:FLUX.concat(FLUX_RETOUR),
    lecture:lectureDuGraphe,
    changed:()=>{if(Sim.flows)redessinerEdges();if(Sim.ateliers)Sim.ateliers.rendre();majDemarrage();},
    showMap:()=>showView('plan'),notify:toast});
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

  // Glisser déplace la vue. Toute retouche de géométrie passe par l'éditeur
  // du plan (plan-editor.js), qui a sa propre couche au-dessus des zones.
  let act = null;
  svg.addEventListener('pointerdown', e => {
    const p = ptSvg(e);
    act = { p0:p, cx:e.clientX, cy:e.clientY, tx:vtx, ty:vty }; svg.style.cursor = 'grabbing';
  });
  svg.addEventListener('pointermove', e => {
    if (!act) return;
    if (!act.bouge && Math.hypot(e.clientX - act.cx, e.clientY - act.cy) < 4) return;
    act.bouge = true; svg.setPointerCapture(e.pointerId);
    const p = ptSvg(e);
    vtx = act.tx + (p.x - act.p0.x); vty = act.ty + (p.y - act.p0.y); appliquerVue();
  });
  const fin = () => { act = null; svg.style.cursor = ''; };
  svg.addEventListener('pointerup', fin);
  svg.addEventListener('pointercancel', fin);

  appliquerVue();
}

let selection = null;
function selectionner(id) {
  selection = (!editMode && activeView!=='ateliers' && selection === id) ? null : id;
  Object.keys(zoneEls).forEach(k => zoneEls[k].g.classList.toggle('selection', k === selection));
  Object.keys(zoneEls).forEach(k => zoneEls[k].g.setAttribute('aria-pressed',String(k===selection)));
  document.getElementById('zone-picker').value = selection || '';
  if(Sim.editor)Sim.editor.showService(selection);
  document.querySelectorAll('#stats-ateliers button').forEach(b=>{const active=b.dataset.station===selection;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  majGoulotInfo();
}

/* ==========================================================================
 *  7 bis. MODE ÉDITION DES ZONES
 *  L'édition elle-même est dans plan-editor.js, qui enregistre le plan
 *  (`orly-plan-v3`). Il ne reste ici que la relecture des positions
 *  enregistrées par les toutes premières versions (`orly-zones`).
 * ==========================================================================*/
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
  if(zoneEls[Object.keys(ZONES)[0]]){Object.keys(ZONES).forEach(positionnerZone);redessinerEdges();}
  if(!silencieux)toast(ids.length+' zones appliquées');
  return ids.length;
}

function basculerEdition() {
  editMode=!editMode;
  if(editMode){pause();showView('plan');if(Sim.onglets)Sim.onglets.choisir('j-plan');}
  svg.classList.toggle('edition',editMode);
  document.body.classList.toggle('editing',editMode);
  document.getElementById('btn-edit').setAttribute('aria-pressed',String(editMode));
  document.getElementById('btn-edit').textContent=editMode?'Terminer l’édition':'Éditer les zones';
  // Le bouton de lecture appartient à la vue ; l'édition le masque déjà.
  Sim.editor.setActive(editMode);updateRunState();
}

function initEdition() {
  Sim.editor=new window.OrlyPlan.PlanEditor({
    svg,viewport:Sim._gVue,zones:ZONES,storages:STORAGES,notify:toast,
    update(id,visible){
      positionnerZone(id);
      const e=zoneEls[id];if(!e)return;
      e.titre.textContent=nomLisible(ZONES[id].nom);e.g.setAttribute('aria-label',nomLisible(ZONES[id].nom));
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
  document.getElementById('btn-edit').addEventListener('click',basculerEdition);
  majPicker();   // le plan enregistré peut contenir des annexes
}

function majPlan() {
  if (Sim.vue) Sim.vue.rendre(); else majEtatPlan();
}

/* ==========================================================================
 *  ÉTAT DE PARAMÉTRAGE — ce que le plan dit AVANT de relire
 *  Deux langages de couleur, jamais affichés en même temps : la progression
 *  de la saisie tant qu'on n'a pas commencé à relire, l'activité ensuite.
 * ==========================================================================*/
const ETATS_PARAM = {
  vide:    { lib:'Aucune équipe',  aide:'Personne ne travaille dans ce service : il ne préparera rien.' },
  partiel: { lib:'Équipe sans travail',    aide:'Une équipe existe, mais aucune commande ne lui est confiée.' },
  pret:    { lib:'Équipe au travail',  aide:'Une équipe y prépare au moins une commande.' }
};

function annexes() {
  const e = Sim.editor; if (!e) return [];
  return e.state.zones.filter(z => z.kind === 'annexe' && z.visible !== false);
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
    ajoute(id, nomLisible(ZONES[id].nom), false);
    annexes().filter(a => a.parent === id).forEach(a => ajoute(a.id, nomLisible(a.nom), true));
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
    // Une plonge et une mise à disposition ne portent pas de lots, et pourtant
    // elles produisent : les compter comme « rien à fabriquer » serait faux.
    if (a.type === 'lavage' || a.type === 'dispo') e.sansLots = true;
  }
  return par;
}

/* L'état d'un service avant de relire la journée. Il se lit désormais dans les
 * ateliers de travail, et plus dans les curseurs : c'est là qu'on décrit
 * l'unité, et le plan doit dire ce qu'il reste à y décrire.
 *
 * Il n'y a plus de service « hors calcul » : tout service peut porter une
 * équipe, une mise à disposition ou une plonge. Un service vide n'est pas hors
 * du modèle, il est juste vide — et c'est une information, pas une exclusion.
 */
function etatParametrage(id, amenagement) {
  const e = amenagement[id];
  if (!e || !e.ateliers) return 'vide';
  return e.lots || e.sansLots ? 'pret' : 'partiel';
}

let _legendeCle = null;
function majEtatPlan() {
  // « Avant » ne veut plus dire « avant d'avoir lancé » : il n'y a plus rien à
  // lancer. C'est « avant d'avoir commencé à relire » — tant qu'on est au début
  // de la journée, le plan répond à l'autre question : que reste-t-il à décrire ?
  const avant = !Sim.vue || Sim.vue.t <= Sim.vue.debut;
  document.body.classList.toggle('avant-lancement', avant);
  const compte = { vide:0, partiel:0, pret:0 };
  if (avant) {
    const amenagement = amenagementParService();
    Object.keys(ZONES).forEach(id => {
      const els = zoneEls[id]; if (!els) return;
      const etat = etatParametrage(id, amenagement);
      els.g.classList.remove('p-vide', 'p-partiel', 'p-pret', 'p-hors');
      els.g.classList.add('p-' + etat);
      compte[etat]++;
    });
  }
  majLegende(avant, compte);
}

/* La légende change de sens avec le plan : on la réécrit plutôt que d'en
 * afficher deux, pour qu'il n'y ait jamais deux grilles de lecture à l'écran. */
function majLegende(avant, compte) {
  const box = document.getElementById('legende-plan'), etat = document.getElementById('plan-etat');
  if (!box) return;
  const cle = avant ? 'param:' + compte.vide + '/' + compte.partiel + '/' + compte.pret : 'lecture';
  if (cle === _legendeCle) return;
  _legendeCle = cle;
  const puce = (coul, texte, titre) => '<span title="' + escapeHTML(titre) + '"><span class="pastille" style="background:' + coul + '"></span>' + escapeHTML(texte) + '</span>';
  if (avant) {
    box.setAttribute('aria-label', 'Ce que dit la couleur des services');
    box.innerHTML = puce('var(--txt3)', ETATS_PARAM.vide.lib, ETATS_PARAM.vide.aide)
      + puce('var(--bordure2)', ETATS_PARAM.partiel.lib, ETATS_PARAM.partiel.aide)
      + puce('var(--accent)', ETATS_PARAM.pret.lib, ETATS_PARAM.pret.aide);
    if (etat) {
      const n = compte.vide + compte.partiel;
      etat.textContent = n
        ? n + (n > 1 ? ' services' : ' service') + ' sans travail — voir l’étape 2, « Qui prépare quoi »'
        : 'Chaque service a une équipe au travail.';
      etat.className = 'plan-etat' + (n ? '' : ' complet');
    }
  } else {
    // Pendant la relecture : les quatre états de `replay.js`, et eux seuls.
    // L'attente est aussi en pointillé, pour ne pas dépendre de la couleur.
    box.setAttribute('aria-label', 'État des services à cet instant');
    box.innerHTML = puce('var(--accent)', 'Au travail', 'Une équipe prépare des commandes à cette heure.')
      + puce('var(--orange)', 'Attend le service d’avant', 'L’équipe est là, mais ce qu’elle doit recevoir n’est pas encore arrivé.')
      + puce('var(--vert)', 'A fini', 'Tout ce que ce service avait à faire est prêt.')
      + puce('var(--bordure2)', 'Pas commencé', 'Le service n’a pas encore ouvert.');
    if (etat) { etat.textContent = ''; etat.className = 'plan-etat'; }
  }
}

/* ==========================================================================
 *  8. DASHBOARD
 * ==========================================================================*/
/* Les quatre chiffres et la liste des services sont tenus par la vue ; il
 * reste à rafraîchir ce qui dépend de la sélection et des vols. */
function majDashboard() {
  if (Sim.vue) Sim.vue.rendre();
  majGoulotInfo(); renderFlights(); updateRunState();
}

/* Le point d'attention se lit dans la journée relue : pour un service choisi,
 * ce qu'il fait et ce qu'il a à faire ; sinon, le poste qui attend depuis le
 * plus longtemps. Rien n'y est estimé : tout vient du journal des lots. */
function majGoulotInfo() {
  const el=document.getElementById('goulot-info');
  if(!el.querySelector('[data-detail-body]'))el.innerHTML='<div class="detail-title"><strong></strong><button class="btn" data-clear-selection>Fermer</button></div><div data-detail-body></div>';
  el.querySelector('.detail-title').hidden=!selection;
  const noms=Object.fromEntries(servicesDisponibles().map(s=>[s.id,s.nom]));
  el.querySelector('strong').textContent=selection?(noms[selection]||selection):'';
  const r=(Sim.ateliers&&Sim.ateliers.resultat)||{lots:[]};
  const lots=r.lots||[];
  const t=Sim.vue?Sim.vue.t:0, hh=MoteurProduction.hhmm;
  const services=OrlyReplay.servicesA(r,t);
  let html='';
  if(selection){
    const id=selection,z=ZONES[id];
    if(z&&z.approx)html+='<p>Emplacement sur le plan à confirmer.</p>';
    const annexe=!z?annexes().find(a=>a.id===id):null;
    if(annexe){const pere=ZONES[annexe.parent];html+='<p>Annexe de <strong>'+escapeHTML(pere?nomLisible(pere.nom):annexe.parent)+'</strong>.</p>';}
    const equipes=((Sim.ateliers&&Sim.ateliers.state.ateliers)||[]).filter(a=>a.service===id);
    if(!equipes.length)html+='<p>Aucune équipe ici — étape 2, « Qui prépare quoi ».</p>';
    else html+='<p>'+equipes.map(a=>'<strong>'+escapeHTML(a.nom)+'</strong>'
      +(a.type==='dispo'?' · mise à disposition':a.type==='lavage'?' · plonge':' · '+a.personnes+' pers.')).join('<br>')+'</p>';
    const e=services[id];
    if(e&&!Sim.vue.vide)html+='<p>À '+hh(t)+' : <strong>'+escapeHTML(OrlySimulation.LIBELLE[e.etat])+'</strong>'
      +(e.etat!=='avenir'&&e.nom?' — '+escapeHTML(MoteurProduction.enClair(e.nom)):'')+'.</p>';
    const ici=lots.filter(l=>l.service===id);
    if(ici.length){
      html+='<ul class="detail-jobs">'+ici.slice(0,8).map(l=>{
        const encours=t>=l.debut&&(l.fin==null||t<l.fin);
        return '<li'+(encours?' class="en-cours"':'')+'>'+hh(l.debut)+(l.dispo?'':'–'+(l.fin==null?'?':hh(l.fin)))
          +' · '+escapeHTML(MoteurProduction.enClair(l.nom||''))+(l.attente>=1?' · attend '+Math.round(l.attente)+' min':'')
          +(l.impossible?' · <strong>ne tient pas dans le poste</strong>':'')+'</li>';
      }).join('')+'</ul>';
      if(ici.length>8)html+='<p>Et '+(ici.length-8)+(ici.length-8>1?' autres préparations':' autre préparation')+'.</p>';
    }
  } else if(!lots.length){
    html='<div class="vide-carte">'+(window.OrlyIcones?OrlyIcones.ico('equipe'):'')
      +'<b>Pas encore de journée à rejouer</b><p>Donnez une équipe aux commandes : la journée se calcule toute seule.</p>'
      +'<button class="btn btn-play" data-aller="ateliers">Étape 2 : Qui prépare quoi →</button></div>';
  } else {
    // Qui attend depuis le plus longtemps, à cet instant ?
    let pire=null;
    for(const [id,e] of Object.entries(services)){
      if(e.etat!=='attente'||!e.lot)continue;
      const depuis=t-(e.lot.debut-(e.lot.attente||0));
      if(!pire||depuis>pire.depuis)pire={id,depuis,lot:e.lot};
    }
    const I=window.OrlyIcones;
    if(pire)html='<div class="goulot-tete attente">'+(I?I.ico('sablier'):'')+'<strong>'+escapeHTML(noms[pire.id]||pire.id)+'</strong></div><p>attend le service d’avant'
      +(pire.depuis>=1?' depuis '+Math.round(pire.depuis)+' min':'')+' pour « '+escapeHTML(MoteurProduction.enClair(pire.lot.nom||''))+' » ; il se met au travail à '+hh(pire.lot.debut)+'.</p>';
    else html=Sim.vue&&t<=Sim.vue.debut
      ?'Rejouez la journée, ou cliquez un service sur le plan pour voir ce qu’il prépare.'
      :'<div class="goulot-tete ok">'+(I?I.ico('check'):'')+'<span>Personne n’attend à cet instant.</span></div>';
    // Et sur toute la journée : le service qui a le plus attendu.
    const cumul={};for(const l of lots)if(l.attente>=1)cumul[l.service]=(cumul[l.service]||0)+l.attente;
    const top=Object.entries(cumul).sort((x,y)=>y[1]-x[1])[0];
    if(top)html+='<p class="mini-note">Sur toute la journée, c’est <strong>'+escapeHTML(noms[top[0]]||top[0])+'</strong> qui attend le plus : '
      +Math.round(top[1])+' min en tout.</p>';
  }
  // Ce qui attend à cette heure : les repas en stock, le sale à laver.
  if(window.OrlyTemps&&lots.length&&Sim.vue&&t>Sim.vue.debut){
    const ids=selection?[selection]:Object.keys(noms);
    const bouts=ids.map(id=>{
      const sale=r.plonge&&r.plonge.services.includes(id)?OrlyTemps.saleA(r,t):0, n=OrlyTemps.enStockA(r,id,t);
      return sale>=1?'<strong>'+escapeHTML(noms[id]||id)+'</strong> '+Math.round(sale)+' u à laver'
        :n>=1?'<strong>'+escapeHTML(noms[id]||id)+'</strong> '+Math.round(n)+' repas en stock':'';
    }).filter(Boolean);
    const avion=((r.stocks&&r.stocks.sejours)||[]).filter(x=>x.vers==='chargement'&&x.entree<=t&&t<x.sortie).reduce((n,x)=>n+x.repas,0);
    if(avion)bouts.push('<strong>prêts pour l’avion</strong> '+avion+' repas');
    if(bouts.length)html+='<p class="stock-instant">'+(window.OrlyIcones?OrlyIcones.ico('boite'):'')+'<span>À '+hh(t)+', en attente : '+bouts.join(' · ')+'.</span></p>';
  }
  if(el._detailHTML!==html){el.querySelector('[data-detail-body]').innerHTML=html;el._detailHTML=html;}
  document.body.classList.toggle('journee-vide',!lots.length);
}

/* ==========================================================================
 *  9. LECTURE DE LA JOURNÉE
 *  Il n'y a plus de boucle de simulation : `moteur/production.js` a déjà
 *  calculé la journée. Ces fonctions ne sont plus que des relais vers
 *  `simulation.js`, qui la relit. Les appelants d'hier restent valides.
 * ==========================================================================*/
function majHorloge() { if (Sim.vue) Sim.vue.rendreHorloge(); }
function pause()      { if (Sim.vue) Sim.vue.pause(); }
/* Un nouveau programme de vols (import, jeu de démonstration) ou un nouveau
 * délai de chargement change les classes à fabriquer : on relit les vols, on
 * recalcule la journée des ateliers, et la relecture repart de là. */
function reset(data) {
  chargerVols(data || Sim.dataCourante || SAMPLE);
  if (Sim.ateliers) Sim.ateliers.rendre();
  if (Sim.vue) Sim.vue.recalculer();
  majDemarrage(); renderFlights();
}

/* Colorer le plan à l'instant relu. Quatre états, jamais mélangés avec les
 * couleurs de paramétrage : celles-ci disent ce qui reste à renseigner AVANT
 * de lire, celles-là ce qui se passe PENDANT. */
/* La pastille de stock d'une zone : cachée à zéro, sinon « 120 repas en stock ». */
function peindreStock(id, texte, sale) {
  const e = zoneEls[id]; if (!e || !e.stock) return;
  const st = e.stock;
  if (!texte) { st.g.style.display = 'none'; return; }
  st.g.style.display = ''; st.g.classList.toggle('sale', !!sale);
  st.t.textContent = texte;
  // Au-dessus de la zone, calée à droite : elle ne cache ni le nom ni le pictogramme.
  const w = texte.length * 25 + 48, b = e.b, y = b.y - 82;
  st.r.setAttribute('x', b.x + b.w - w); st.r.setAttribute('y', y);
  st.r.setAttribute('width', w); st.r.setAttribute('height', 70);
  st.t.setAttribute('x', b.x + b.w - w + 24); st.t.setAttribute('y', y + 49);
}
function peindreInstant(i) {
  document.body.classList.toggle('en-lecture', Sim.vue ? Sim.vue.t > Sim.vue.debut : false);
  const r = Sim.ateliers && Sim.ateliers.resultat;
  if (window.OrlyTemps && r) for (const s of servicesDisponibles()) {
    const n = OrlyTemps.enStockA(r, s.id, i.t);
    const sale = r.plonge && r.plonge.services.includes(s.id) ? OrlyTemps.saleA(r, i.t) : 0;
    peindreStock(s.id, sale >= 1 ? Math.round(sale) + ' u à laver' : n >= 1 ? Math.round(n) + ' repas en stock' : '', sale >= 1);
  }
  for (const s of servicesDisponibles()) {
    const els = zoneEls[s.id]; if (!els) continue;
    const e = i.services[s.id];
    els.g.classList.remove('s-travail', 's-attente', 's-fini', 's-avenir');
    if (e) els.g.classList.add('s-' + e.etat);
    // Ce que fait le service se lit dans la liste de droite et dans l'infobulle.
    if (els.tip) els.tip.textContent = s.nom + (e ? ' — ' + OrlySimulation.LIBELLE[e.etat] + (e.etat !== 'avenir' && e.nom ? ' : ' + e.nom : '') : '');
  }
  majEtatPlan();
  majGoulotInfo();
}

function initVueSimulation() {
  if (!window.OrlySimulation) return;
  Sim.vue = new OrlySimulation.VueSimulation({
    resultat: () => (Sim.ateliers && Sim.ateliers.resultat) || null,
    services: servicesDisponibles,
    selection: () => selection,
    selectionner: id => selectionner(id),
    surInstant: peindreInstant
  });
}

function toast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(()=>t.classList.remove('on'), 1800);
}

function initControles() {
  const bind = (id, fn) => document.getElementById(id).addEventListener('input', fn);
  bind('shift', e => { CFG.shift = +e.target.value; document.getElementById('shift-val').textContent = (e.target.value>0?'+':'') + e.target.value + ' min'; reset(); });
  document.getElementById('loadDelay').addEventListener('change',e=>{if(!e.target.checkValidity() || !e.target.value){e.target.value=CFG.loadDelay;toast('Délai attendu : 10 à 120 minutes');return;}CFG.loadDelay=+e.target.value;reset();});
  document.getElementById('btn-export').addEventListener('click', exporter);
  document.getElementById('snap-a').addEventListener('click', () => capturer('A'));
  document.getElementById('snap-b').addEventListener('click', () => capturer('B'));
  document.getElementById('snap-clear').addEventListener('click', () => { snaps = {}; majCompare(); });
  document.getElementById('imp-vols').addEventListener('change', importVols);
  document.getElementById('exp-vols').addEventListener('click', exporterVols);
  document.getElementById('sauvegarde-export').addEventListener('click', sauvegardeComplete);
  document.getElementById('sauvegarde-import-btn').addEventListener('click', () => document.getElementById('sauvegarde-import').click());
  document.getElementById('sauvegarde-import').addEventListener('change', restaurerSauvegarde);
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
}

/* --- Scénarios A / B ----------------------------------------------------
 *  La journée des ateliers est recalculée à chaque frappe : capturer ne
 *  relance rien, cela fige ce qu'on a sous les yeux (`comparaison.js`).
 * ------------------------------------------------------------------------- */
let snaps = {};
function capturer(slot) {
  const r = Sim.ateliers && Sim.ateliers.resultat;
  if (!r) { toast('Aucune journée à photographier.'); return; }
  snaps[slot] = OrlyComparaison.capturer(r, {
    source: dataSource,
    ateliers: JSON.parse(JSON.stringify(Sim.ateliers.state.ateliers)),
    etat: (({parcours,parcoursCabine,parcoursClasse,materiel,exclues,ajoutees})=>JSON.parse(JSON.stringify({parcours,parcoursCabine,parcoursClasse,materiel,exclues,ajoutees})))(Sim.ateliers.state),
    vols: JSON.parse(JSON.stringify(flights)),
    reglages: Sim.reglages ? Sim.reglages.pourMoteur() : { delaiChargement: CFG.loadDelay },
    liaisons: liaisonsServices(),
    decalage: CFG.shift
  });
  majCompare();
  toast('Scénario ' + slot + ' capturé');
}
function majCompare() {
  const lignes = OrlyComparaison.lignes(snaps.A, snaps.B);
  let groupe = '', html = '<thead><tr><th scope="col">Indicateur</th><th scope="col">A</th><th scope="col">B</th></tr></thead><tbody>';
  for (const l of lignes) {
    if (l.groupe !== groupe) { groupe = l.groupe; html += '<tr class="compare-groupe"><th colspan="3" scope="colgroup">' + escapeHTML(groupe) + '</th></tr>'; }
    const cls = [l.diff ? 'diff' : '', l.verdict === 'mieux' ? 'mieux' : l.verdict ? 'moins-bien' : ''].filter(Boolean).join(' ');
    html += '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + escapeHTML(l.lib) + '</td><td>' + escapeHTML(l.a)
      + '</td><td>' + escapeHTML(l.b) + (l.verdict ? ' <small>' + escapeHTML(l.verdict) + '</small>' : '') + '</td></tr>';
  }
  document.getElementById('compare').innerHTML = html + '</tbody>';
  document.getElementById('compare-note').textContent = OrlyComparaison.note(snaps.A, snaps.B);
  // Tant que rien n'est retenu, un tableau de tirets ne dit rien : un seul bouton suffit.
  const rien=!snaps.A&&!snaps.B;
  document.getElementById('compare').hidden=rien;
  document.getElementById('snap-clear').hidden=rien;
  document.getElementById('snap-b').hidden=!snaps.A;
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
  // Le barème est une étude à part entière : une sauvegarde qui l'oublierait
  // ramènerait les valeurs de démonstration sans le dire.
  { cle:'ory-modele-v1',    nom:'barème et règles de poste', valider:r => window.OrlyReglages.valider(r) },
  // Où l'on a posé les services dans les diagrammes : une préférence, mais un
  // tracé soigné qu'on ne veut pas refaire.
  { cle:'ory-graphes-v1',   nom:'disposition des diagrammes', valider:r => window.OrlyGraphe.validerPositions(r) }
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
  r.textContent = parties + (parties > 1 ? ' parties enregistrées' : ' partie enregistrée') + '. Ce fichier contient le plan réel : gardez-le hors du dépôt.';
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
      aEcrire.length + (aEcrire.length > 1 ? ' parties' : ' partie') + ') ? La page sera rechargée.')) { e.target.value = ''; return; }
    aEcrire.forEach(([cle, valeur]) => localStorage.setItem(cle, valeur));
    location.reload();
  } catch (err) { refuser(err.message); }
  finally { e.target.value = ''; }
}

/* Le programme de vols s'importe en Excel (feuilles « Départs » et
 * « Retours ») ou en CSV (une table, colonne « sens »). */
async function importVols(e) {
  const file=e.target.files[0];if(!file)return;
  const report=document.getElementById('import-report');
  const fail=message=>{report.classList.add('error');report.textContent=message;};
  try {
    if(file.size>4*1024*1024)throw new Error('Fichier trop volumineux (maximum 4 Mo). Aucune donnée remplacée.');
    let data;
    if(/\.(csv|txt)$/i.test(file.name)){
      // BUG-005 : un échec de lecture doit vider le champ, sinon resélectionner
      // le même fichier ne déclenche plus `change`.
      const texte=await new Promise((ok,ko)=>{const rd=new FileReader();rd.onload=()=>ok(rd.result);
        rd.onerror=()=>ko(new Error('Lecture du fichier impossible. Aucune donnée remplacée.'));rd.readAsText(file);});
      data=parseVols(texte);
    } else data=OrlyEchanges.classeurVersVols(await OrlyTableur.lireFichier(file,4*1024*1024));
    Sim.dataCourante=data;dataSource=file.name;snaps={};majCompare();reset(data);updateSource();
    report.classList.remove('error');report.textContent=data.length+' lignes importées. '+data.filter(f=>f.sens==='DEP').length+' départs et '+data.filter(f=>f.sens==='RET').length+' retours.';
  } catch(err){fail(err.message);}
  finally{e.target.value='';}
}
function exporterVols() {
  const octets=OrlyTableur.ecrireClasseur(OrlyEchanges.volsVersClasseur(Sim.dataCourante||SAMPLE));
  const nom=dataSource.replace(/\.[a-z]+$/i,'').replace(/[^\w.-]+/g,'-').slice(0,40)||'vols';
  OrlyTableur.telecharger('ory-vols-'+nom+'.xlsx',octets);
  toast('Programme de vols exporté');
}
function parseVols(txt) { return parseFlights(txt); }
/* L'export suit ce qu'on regarde : la journée du modèle par ateliers, telle
 * qu'elle est calculée. Il se fait en local, par téléchargement — rien ne part
 * ailleurs. On y met les départs, les classes et le journal des lots : de quoi
 * refaire les comptes dans un tableur sans relancer le site. */
function exporter() {
  const r = (Sim.ateliers && Sim.ateliers.resultat) || null;
  const hh = t => t == null || !Number.isFinite(t) ? null : MoteurProduction.hhmm(t);
  const noms = {};
  for (const a of ((Sim.ateliers && Sim.ateliers.state.ateliers) || [])) noms[a.id] = a.nom;
  const data = {
    avertissement: 'PROTOTYPE — barème non calibré : résultats à lire comme un ordre de grandeur.',
    schemaVersion: '0.5', modele: 'ateliers', source: dataSource,
    instant: Sim.vue && !Sim.vue.vide ? hh(Sim.vue.t) : null,
    indicateurs: r && r.indicateurs ? r.indicateurs : null,
    anomalies: r ? r.anomalies || [] : [],
    departs: departsSuivis().map(d => ({
      id: d.id, compagnie: d.cie, depart: hh(d.depart), echeance: hh(d.echeance),
      fin: hh(d.fin), retard: d.retard,
      classes: d.classes.map(c => ({ id: c.id, pax: c.pax, fin: hh(c.etat.fin), absente: !!c.etat.absente }))
    })),
    classes: r ? Object.entries(r.parClasse || {}).map(([id, c]) => ({
      id, fin: hh(c.fin), echeance: hh(c.echeance), retard: c.retard ?? null, absente: !!c.absente })) : [],
    journal: r ? (r.lots || []).map(l => ({
      service: l.service, atelier: noms[l.atelier] || l.atelier || '', lot: l.nom || '', classes: l.classes || [],
      attente: Math.round(l.attente || 0), debut: hh(l.debut), fin: hh(l.fin),
      hommeMinutes: l.hommeMinutes == null ? null : Math.round(l.hommeMinutes),
      dispo: !!l.dispo })) : [],
    materiel: r ? r.materiel || null : null
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'newrest-orly-journee.json'; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Journée exportée');
}


/* Les réglages sortent du panneau étroit de droite pour occuper toute la
 * largeur, comme le Centre des flux. On DÉPLACE le nœud existant : toutes les
 * liaisons se font par identifiant, elles continuent de fonctionner telles quelles. */
function installerCentreReglages() {
  const hote=document.getElementById('view-reglages'),bloc=document.getElementById('panel-reglages'),
        donnees=document.getElementById('panel-donnees');
  if(!hote||!bloc)return;
  bloc.hidden=false;bloc.classList.remove('panel-content');bloc.classList.add('reglages-grille');
  Sim.reglages=new OrlyReglages.CentreReglages({
    hote:()=>hote,
    services:servicesDisponibles,
    parent:id=>{const a=annexes().find(z=>z.id===id);return a?a.parent:null;},
    // Les services qui portent une équipe : ce sont leurs lignes de barème qui
    // comptent d'abord, et il faut pouvoir les repérer dans la liste.
    occupes:()=>[...new Set(((Sim.ateliers&&Sim.ateliers.state.ateliers)||[]).map(a=>a.service))],
    // Les compagnies × classes du moment, et le parcours de chacune : c'est ce
    // que le classeur du barème propose de renseigner, service par service.
    classes:()=>Sim.ateliers?Sim.ateliers.classes:[],
    routes:cls=>MoteurProduction.routesDesClasses(cls,Sim.ateliers?Sim.ateliers.state:{}),
    routesSignature:()=>{const e=(Sim.ateliers&&Sim.ateliers.state)||{};return JSON.stringify([e.parcours,e.parcoursCabine,e.parcoursClasse]);},
    // Un service dont toutes les équipes sont des plonges, des mises à
    // disposition ou des robots ne lit pas le barème : inutile de le proposer.
    sansBareme:()=>{
      const par=new Map();
      for(const a of ((Sim.ateliers&&Sim.ateliers.state.ateliers)||[]))
        par.set(a.service,(par.get(a.service)||false)||a.type==='manuel');
      return [...par].filter(([,manuel])=>!manuel).map(([s])=>s);
    },
    delaiChargement:()=>CFG.loadDelay,
    change:()=>{if(Sim.ateliers)Sim.ateliers.rendre();majDemarrage();if(Sim.vue)Sim.vue.recalculer();},
    notify:toast
  });
  // Les vols, leur import et leurs horaires vivent à l'étape 1 : c'est là
  // qu'on les cherche. Le délai de chargement dit quand un repas doit être prêt.
  const volsDonnees=document.getElementById('vols-donnees');
  const horaires=document.getElementById('panneau-horaires');

  // Comparer deux essais : c'est un regard sur la journée, il en est un onglet.
  const comparer=document.getElementById('view-comparer');
  if(comparer)comparer.appendChild(bloc);
  // Le programme de vols rejoint l'étape 1 ; la sauvegarde et les limites du
  // calcul, qui valent pour tout le travail, un onglet de « L'unité ».
  if(donnees){
    donnees.hidden=false;donnees.classList.remove('panel-content');donnees.classList.add('reglages-grille');
    const programme=donnees.querySelector('.panneau');
    if(volsDonnees&&programme)volsDonnees.appendChild(programme);
    donnees.dataset.sous='u-sauvegarde';
    const unite=document.getElementById('view-flux');
    if(unite)unite.appendChild(donnees);
  }
  if(volsDonnees&&horaires)volsDonnees.appendChild(horaires);
  // La version servie aide à diagnostiquer un cache périmé : elle n'a rien à
  // faire au milieu des réglages, elle rejoint les limites du calcul.
  const version=document.getElementById('rg-version'),limites=document.getElementById('model-limits');
  if(version&&limites){delete version.dataset.sous;limites.appendChild(version);}
}
function showView(name) {
  if(editMode && name!=='plan')return;
  activeView=name;
  document.body.dataset.vue=name;
  afficherTitre(name);
  if(name==='ateliers'){pause();if(Sim.ateliers)Sim.ateliers.rendre();}
  document.body.classList.toggle('ateliers-open',name==='ateliers');
  document.getElementById('view-ateliers').hidden=name!=='ateliers';
  document.body.classList.toggle('flows-open',name==='flux');
  document.getElementById('view-flux').hidden=name!=='flux';
  document.getElementById('view-reglages').hidden=name!=='reglages';
  if(name==='flux'&&Sim.flows)Sim.flows.refresh();
  document.body.classList.toggle('reglages-open',name==='reglages');
  document.getElementById('view-plan').hidden=name!=='plan';
  document.getElementById('view-vols').hidden=name!=='vols';
  document.querySelector('.plan-tete').hidden=name!=='plan';
  document.querySelector('.map-footer').hidden=name!=='plan';
  majDemarrage();
  if(name==='vols')renderFlights();
  // La vue est affichée : la fenêtre d'une case peut mesurer où se caler.
  if(name==='ateliers'&&Sim.ateliers)Sim.ateliers.parcours.placeTiroir();
}
function updateSource() {
  majDemarrage();
  document.getElementById('source-label').textContent=dataSource;
  document.getElementById('source-count').textContent=flights.filter(f=>f.sens==='DEP').length+' départs · '+flights.filter(f=>f.sens==='RET').length+' retours';
}
/* L'état de lecture appartient désormais à la vue. Il ne reste ici que ce qui
 * concerne l'édition du plan : pendant qu'on déplace des zones, on ne change
 * pas d'onglet. Les réglages, eux, ne se verrouillent plus — la journée est
 * recalculée à chaque frappe, il n'y a plus d'« essai en cours » à protéger. */
function updateRunState() {
  if (editMode) {
    const e = document.getElementById('run-state');
    if (e) e.textContent = 'Édition du plan';
  } else if (Sim.vue) Sim.vue.rendreTransport();
  document.querySelectorAll('[data-view]').forEach(b => b.disabled = editMode && b.dataset.view !== 'plan');
}

/* ==========================================================================
 *  SUIVI DES DÉPARTS
 *  Le modèle par ateliers ne fabrique pas des vols, il fabrique des
 *  **compagnies × classes** — un vol en emporte plusieurs, et une classe sert
 *  plusieurs vols. Un départ est donc prêt quand **toutes** ses classes sont
 *  sorties, et c'est la dernière qui fixe son heure. C'est elle qu'on nomme :
 *  à elle seule, elle explique le retard.
 * ==========================================================================*/
function departsSuivis() {
  const r = (Sim.ateliers && Sim.ateliers.resultat) || null;
  if (!r || !r.classes) return [];
  const par = r.parClasse || {};
  const out = new Map();
  for (const c of r.classes) {
    for (const v of (c.vols || [])) {
      let d = out.get(v.id);
      if (!d) { d = { id: v.id, cie: c.cie, depart: v.depart, echeance: v.echeance, classes: [] }; out.set(v.id, d); }
      d.depart = Math.min(d.depart, v.depart);
      d.echeance = Math.min(d.echeance, v.echeance);
      d.classes.push({ id: c.id, cabine: c.cabine, pax: v.pax, etat: par[c.id] || {} });
    }
  }
  for (const d of out.values()) {
    const fins = d.classes.map(c => c.etat.fin);
    d.fin = fins.every(f => f != null) ? Math.max(...fins) : null;
    // La dernière classe fixe l'heure du vol : c'est elle qu'il faut regarder.
    d.dernier = d.fin == null
      ? d.classes.find(c => c.etat.fin == null)
      : d.classes.find(c => c.etat.fin === d.fin);
    d.retard = d.fin == null ? null : Math.max(0, Math.round(d.fin - d.echeance));
  }
  return [...out.values()].sort((a, b) => a.echeance - b.echeance);
}

function renderFlights() {
  if (activeView !== 'vols') return;
  // Le tableau des vols est le bilan de la journée entière : il ne suit pas
  // l'heure rejouée dans « La journée ».
  const t = Infinity;
  const search = document.getElementById('flight-search').value.trim().toLowerCase();
  const filtre = document.getElementById('flight-filter').value;
  // Une classe que personne ne fabrique ne sera jamais prête : ce n'est pas un
  // retard à attendre, c'est un atelier à décrire. On le dit tel quel.
  const orphelines = d => d.classes.filter(c => c.etat.absente);
  const etatDe = d => orphelines(d).length ? 'orphan'
    : d.fin == null || d.fin > t ? (t > d.echeance ? 'overdue' : 'pending')
    : d.retard > 0 ? 'late' : 'ready';
  const mot = { ready: 'Prêt à l’heure', late: 'Prêt en retard', overdue: 'En retard',
    pending: 'Pas encore prêt', orphan: 'Commandes sans équipe' };
  // Les filtres regroupent : « Non prêts » compte aussi ce qui a dépassé son
  // échéance, « Terminés » ce qui est sorti, à l'heure ou non.
  const groupe = { pending: ['pending', 'overdue', 'orphan'], overdue: ['overdue'], ready: ['ready', 'late'], ontime: ['ready'] };

  const lignes = departsSuivis().filter(d => {
    const e = etatDe(d);
    return (!search || (d.id + ' ' + d.cie).toLowerCase().includes(search))
      && (filtre === 'all' || (groupe[filtre] || [filtre]).includes(e));
  });

  const I = window.OrlyIcones, hh = MoteurProduction.hhmm;
  const icoEtat = { ready: 'check', late: 'sablier', overdue: 'alerte', pending: 'chrono', orphan: 'equipe' };
  const nomCab = k => (MoteurProduction.NOM_CABINE || {})[k] || k;
  // Chaque repas du vol : une pastille de la couleur de sa classe, et son état.
  const pastille = c => {
    const k = c.cabine || c.id.slice(c.id.lastIndexOf('/') + 1), e = c.etat;
    const etat = e.absente ? 'sans' : e.fin == null ? 'attente' : e.aHeure === false || (e.retard > 0) ? 'tard' : 'ok';
    const dit = e.absente ? 'pas encore d’équipe' : e.fin == null ? 'pas prête'
      : 'prête à ' + hh(e.fin) + (e.retard > 0 ? ' (+' + Math.round(e.retard) + ' min)' : '');
    return '<span class="rc ' + etat + '" title="' + escapeHTML(nomCab(k) + ' : ' + dit) + '">'
      + '<span class="puce-classe" data-cab="' + escapeHTML(k) + '"></span>' + escapeHTML(nomCab(k))
      + (etat === 'sans' ? '<span class="sr-only"> : pas encore d’équipe</span>' : '') + '</span>';
  };
  const html = lignes.map(d => {
    const e = etatDe(d);
    return '<tr class="vol-' + e + '"><td class="vol-heure">' + hh(d.depart) + '</td>'
      + '<td><strong>' + escapeHTML(d.id) + '</strong><small>' + escapeHTML(d.cie)
      + ' · ' + d.classes.length + ' classe' + (d.classes.length > 1 ? 's' : '') + '</small></td>'
      + '<td class="vol-avant">' + hh(d.echeance) + '</td>'
      + '<td><span class="status ' + e + '">' + (I ? I.ico(icoEtat[e]) : '') + mot[e] + '</span>'
      + (d.fin != null && d.fin <= t ? '<small>prêt à ' + hh(d.fin)
          + (d.retard ? ' · +' + d.retard + ' min' : '') + '</small>' : '')
      + '</td><td><div class="vol-repas">' + d.classes.map(pastille).join('') + '</div></td></tr>';
  }).join('') || '<tr><td colspan="5" class="empty-state">Aucun départ ne correspond à ces filtres.</td></tr>';
  renderFriseVols(departsSuivis(), etatDe, mot, icoEtat);

  const body = document.getElementById('flight-rows');
  if (body.innerHTML !== html) body.innerHTML = html;
}

/* La journée des vols en un coup d'œil : trois compteurs qui filtrent, et une
 * frise où chaque avion est posé à son heure de départ, dans la couleur de son
 * état. Personne ne lit douze lignes ; tout le monde voit trois taches rouges. */
function renderFriseVols(tous, etatDe, mot, icoEtat) {
  const box = document.getElementById('vols-frise'); if (!box) return;
  const I = window.OrlyIcones, hh = MoteurProduction.hhmm;
  if (!tous.length) { box.innerHTML = ''; return; }
  const n = { ready: 0, late: 0, sans: 0 };
  for (const d of tous) { const e = etatDe(d); if (e === 'ready') n.ready++; else if (e === 'late') n.late++; else n.sans++; }
  const filtre = document.getElementById('flight-filter').value;
  const compteur = (cle, val, nb, lib, ico) => '<button class="vf-compte vf-' + cle + (filtre === val ? ' actif' : '')
    + '" data-vf-filtre="' + val + '" aria-pressed="' + (filtre === val) + '">' + (I ? I.ico(ico) : '')
    + '<b>' + nb + '</b><span>' + lib + '</span></button>';
  const t0 = Math.floor((Math.min(...tous.map(d => d.echeance)) - 30) / 60) * 60;
  const t1 = Math.ceil((Math.max(...tous.map(d => d.depart)) + 30) / 60) * 60;
  const L = 1400, G = 24, W = L - 2 * G - 60, x = t => G + (t - t0) / Math.max(1, t1 - t0) * W;
  // Des couloirs, pour que deux avions proches ne se couvrent pas.
  const couloirs = [];
  const points = tous.slice().sort((a, b) => a.depart - b.depart).map(d => {
    let c = couloirs.findIndex(fin => x(d.depart) - fin > 38 + d.id.length * 8.5);
    if (c < 0) { c = couloirs.length; couloirs.push(0); }
    couloirs[c] = x(d.depart);
    return { d, c, e: etatDe(d) };
  });
  const H = 20 + couloirs.length * 32 + 22;
  const heures = []; for (let h = t0; h <= t1; h += 60) heures.push(h);
  const pas = heures.length > 14 ? 2 : 1;
  box.innerHTML = '<div class="vf-comptes">'
    + compteur('ok', 'ontime', n.ready, (n.ready > 1 ? 'vols prêts' : 'vol prêt') + ' à l’heure', 'check')
    + compteur('tard', 'late', n.late, (n.late > 1 ? 'vols prêts' : 'vol prêt') + ' en retard', 'sablier')
    + compteur('sans', 'pending', n.sans, (n.sans > 1 ? 'vols pas prêts' : 'vol pas prêt') + ' ou sans équipe', 'chrono')
    + (filtre !== 'all' ? '<button class="vf-tout" data-vf-filtre="all">Tout voir</button>' : '') + '</div>'
    + '<svg class="vf-svg" viewBox="0 0 ' + L + ' ' + H + '" role="img" aria-label="Les départs de la journée, par heure et par état">'
    + heures.map((h, i) => '<line class="vf-grille" x1="' + x(h) + '" y1="14" x2="' + x(h) + '" y2="' + (H - 18) + '"/>'
        + (i % pas ? '' : '<text class="vf-heure" x="' + x(h) + '" y="' + (H - 4) + '" text-anchor="middle">' + hh(h) + '</text>')).join('')
    + points.map(p => {
        const y = 16 + p.c * 32;
        return '<g class="vf-vol vf-' + p.e + '" transform="translate(' + (x(p.d.depart) - 11) + ',' + y + ')">'
          + '<title>' + escapeHTML(p.d.id + ' · départ ' + hh(p.d.depart) + ' · ' + mot[p.e]) + '</title>'
          + '<circle cx="11" cy="11" r="14"/>'
          + (I ? '<g class="vf-avion">' + I.TRAITS.avion + '</g>' : '')
          + '<text x="30" y="15">' + escapeHTML(p.d.id) + '</text></g>';
      }).join('')
    + '</svg>';
}

function initWorkbench() {
  document.getElementById('btn-limits').addEventListener('click',()=>{
    if(editMode)basculerEdition();if(Sim.onglets)Sim.onglets.choisir('u-sauvegarde');else showView('flux');
    const l=document.getElementById('model-limits');l.scrollIntoView({block:'nearest'});
    const d=l.querySelector('details');if(d)d.open=true;
  });
  document.getElementById('edit-done').addEventListener('click',()=>{if(editMode)basculerEdition();document.getElementById('btn-edit').focus();});
  const picker=document.getElementById('zone-picker');
  majPicker();
  picker.addEventListener('change',()=>{const id=picker.value;selection=null;selectionner(id||null);});
  document.getElementById('goulot-info').addEventListener('click',e=>{if(e.target.closest('[data-clear-selection]'))selectionner(selection);});
  // Un bouton « aller à l'étape… » posé n'importe où dans la page.
  document.addEventListener('click',e=>{const b=e.target.closest('[data-aller]');if(!b||editMode)return;
    showView(b.dataset.aller);if(b.dataset.onglet&&Sim.onglets)Sim.onglets.choisir(b.dataset.onglet);});
  document.getElementById('flight-search').addEventListener('input',renderFlights);
  document.getElementById('flight-filter').addEventListener('change',renderFlights);
  document.getElementById('vols-frise').addEventListener('click',e=>{const b=e.target.closest('[data-vf-filtre]');if(!b)return;
    const f=document.getElementById('flight-filter');f.value=f.value===b.dataset.vfFiltre?'all':b.dataset.vfFiltre;renderFlights();});
  document.getElementById('csv-template').addEventListener('click',()=>{
    const content='vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_CREW,nb_SPML\nDEMO001,DEMO,A320,DEP,12:00,,0,0,100,4,3\nDEMO-RET001,DEMO,A320,RET,,08:00,0,0,100,4,0\n';
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));a.download='modele-vols-demo.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  });
  document.getElementById('restore-demo').addEventListener('click',()=>{
    if(dataSource!=='Jeu de démonstration'&&!confirm('Recharger la démo ? Les vols importés et les scénarios capturés seront remplacés.'))return;
    dataSource='Jeu de démonstration';Sim.dataCourante=SAMPLE;snaps={};majCompare();reset(SAMPLE);updateSource();
    const report=document.getElementById('import-report');report.classList.remove('error');report.textContent='Jeu de démonstration rechargé.';
  });
  installerCentreReglages();
  updateSource();updateRunState();majCompare();
}

/* ==========================================================================
 *  11. DÉMARRAGE
 * ==========================================================================*/
const Sim = { dataCourante:SAMPLE };
// Réglages et état courant, publiés pour l'inspection et les parcours de test
// au même titre que Sim.editor et Sim.ateliers : lecture seule côté appelant.
Sim.cfg = CFG;
window.Sim = Sim;
chargerZones();
construirePlan(); chargerVols(SAMPLE); initControles(); initEdition(); initFlux(); initAteliers(); initWorkbench();
// Le fil de mise en route vient en dernier : il relit les autres, il ne peut
// donc se dresser qu'une fois qu'ils sont là.
initVueSimulation();
initOnglets();
initDemarrage();
majHorloge(); majPlan(); majDashboard(); majStocks();

})();

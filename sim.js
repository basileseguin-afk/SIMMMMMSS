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
/* Un service du plan d'origine retiré de l'unité (Organisation › Services) :
 * il sort de toutes les listes, des liens et du plan, sans être effacé. */
function estRetire(id){const z=Sim.editor&&Sim.editor.state.zones.find(v=>v.id===id);return !!(z&&z.retire);}
const servicesDuPlan=()=>Object.keys(ZONES).filter(id=>!estRetire(id));
function servicesDisponibles(){
  const liste=servicesDuPlan().map(id=>({id,nom:nomLisible(ZONES[id].nom)}));
  for(const a of annexes()) liste.push({id:a.id,nom:nomLisible(a.nom)});
  return liste;
}
/* Le parcours des compagnies × classes se lit dans le graphe du Centre des
 * flux : on n'en retient que les couples de services, en ignorant le détail
 * des stockages et les liaisons désactivées. */
function liaisonsServices(){
  const f=Sim.flows; if(!f) return FLUX.map(([from,to])=>({from,to}));
  const service=point=>{try{return JSON.parse(point)[0];}catch(e){return null;}};
  const out=[],tous=[];
  for(const l of f.state.flows){
    if(!l.enabled) continue;
    const from=service(l.from),to=service(l.to);
    if(!from||!to||from===to) continue;
    tous.push({from,to});
    // Un service retiré de l'unité garde ses liens (Remettre les retrouve),
    // mais le calcul ne les lit plus.
    if(!estRetire(from)&&!estRetire(to)) out.push({from,to});
  }
  // Une annexe est une seconde salle de son atelier : elle en hérite les
  // fournisseurs et les clients. Sans cela, un atelier posé dans « Armement 2 »
  // n'attendrait personne et ne serait attendu de personne.
  const liens=out.slice();
  for(const a of annexes()){
    // Un service à part entière (05/10) n'hérite de personne.
    if(a.autonome)continue;
    // … sauf si on l'a câblée soi-même dans le Centre des flux : la saisie
    // explicite l'emporte sur l'héritage, sinon on ne pourrait jamais donner
    // à une annexe un parcours qui lui soit propre.
    if(liens.some(l=>l.from===a.id||l.to===a.id))continue;
    // Le service de rattachement peut avoir été supprimé de l'unité (« Armement »
    // tout court, quand tout se fait dans « Armement AF Équipage ») : ses salles
    // gardent ses liens, sans quoi elles n'attendraient plus personne.
    const source=estRetire(a.parent)?tous.filter(l=>!estRetire(l.from===a.parent?l.to:l.from)):liens;
    for(const l of source){
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
/* ==========================================================================
 *  LES SERVICES DE L'UNITÉ — Organisation › Services
 *  Un service par ligne : son nom (qu'on change ici), ses équipes, les
 *  commandes qui y passent, et ce qu'il lui manque. C'est la porte d'entrée
 *  d'un service : « il manque une équipe » doit se corriger d'ici, sans aller
 *  chercher l'édition du plan.
 * ==========================================================================*/
function etatService(id){
  const cases=((Sim.ateliers&&Sim.ateliers.state.ateliers)||[]).filter(a=>a.service===id);
  const st=(Sim.ateliers&&Sim.ateliers.state)||{};
  const classes=(Sim.ateliers&&Sim.ateliers.classes)||[];
  const cmds=window.OrlyParcours?classes.filter(c=>{const p=OrlyParcours.fluxDe(st,c);return p&&MoteurProduction.servicesDuParcours(p).includes(id);}).length:0;
  const lu=Sim.flows?lectureDuGraphe():{lignes:[],liens:[]};
  // Il manque une équipe quand une commande passe par ce service, ou quand les
  // liens de l'unité en attendent quelque chose (le même constat que les Contrôles).
  const attendu=lu.lignes.some(l=>l.id===id&&!l.equipes);
  const relie=(lu.liens||[]).some(l=>l.from===id||l.to===id);
  let etat,texte;
  if(!cases.length){etat=cmds||attendu?'manque':'libre';texte=cmds||attendu?'il manque une équipe':relie?'relié, sans équipe':'pas utilisé';}
  else if(cases.some(a=>a.type==='dispo')){etat='ok';texte='mise à disposition';}
  else if(cases.some(a=>a.type==='lavage')){etat='ok';texte='plonge';}
  else if(cases.some(a=>a.type==='handling')){etat='ok';texte='charge les vols';}
  else if(!cases.some(a=>(a.lots||[]).some(l=>l.length))){etat='manque';texte='équipe sans commande';}
  else {etat='ok';texte=cases.length>1?cases.length+' équipes':'une équipe';}
  return {cases,cmds,etat,texte};
}
function renderServices(){
  const box=document.getElementById('services-unite');if(!box)return;
  // On ne redessine pas sous les doigts de quelqu'un qui renomme un service.
  if(box.contains(document.activeElement)&&document.activeElement.matches('input'))return;
  const zones=(Sim.editor&&Sim.editor.state.zones)||[];
  const brut=id=>{const z=zones.find(x=>x.id===id);return z?z.nom:(ZONES[id]||{}).nom||id;};
  const rang={manque:0,ok:1,libre:2};
  const lignes=servicesDisponibles().map(s=>({...s,...etatService(s.id)}))
    .sort((a,b)=>rang[a.etat]-rang[b.etat]||a.nom.localeCompare(b.nom));
  const manque=lignes.filter(l=>l.etat==='manque').length;
  const type={dispo:'mise à disposition',lavage:'plonge',robot:'robot',handling:'par vol',appui:'hors tunnel',manuel:''};
  const cherche=(box.querySelector('[data-svc-chercher]')||{}).value||'';
  box.innerHTML='<div class="svc-tete"><p class="mini-note">'+(manque
      ?'<b>'+manque+(manque>1?' services attendent':' service attend')+' une équipe ou du travail</b> : ils sont en tête de liste.'
      :'Chaque service a ce qu’il lui faut.')+' Le nom se change ici ; la forme et la place, sur le plan.</p>'
    +'<button class="btn btn-sm" type="button" data-svc-action="plan">Modifier le plan de l’unité</button></div>'
    +sectionFantomes()
    +'<div class="svc-chercher"><label>Chercher un service <input type="search" data-svc-chercher value="'+escapeHTML(cherche)+'" placeholder="ex. armement" autocomplete="off"></label>'
    +'<span class="mini-note" data-svc-compte aria-live="polite"></span></div>'
    +'<form class="svc-nouveau" data-svc-nouveau><b>Nouveau service</b><label>Nom <input name="nom" maxlength="120" placeholder="ex. Armement EZY/AF" required></label>'
    +'<label>Rattaché à <select name="parent"><option value="">Aucun — service à part entière (comme Prépa, Dotation)</option>'+servicesDuPlan().map(id=>'<option value="'+escapeHTML(id)+'">'+escapeHTML(nomLisible(ZONES[id].nom))+'</option>').join('')+'</select></label>'
    +'<button class="btn btn-sm btn-play" type="submit">+ Créer le service</button>'
    +'<span class="mini-note">À part entière : ses propres minutes et ses propres liens. Rattaché : une salle de plus de ce service, qui en reprend les liens.</span></form>'
    +'<div class="table-scroll"><table class="svc-table"><thead><tr><th>Service</th><th>Équipes</th><th>Commandes qui y passent</th><th>État</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>'
    +lignes.map(l=>{
      const annexe=!ZONES[l.id]?annexes().find(a=>a.id===l.id):null;
      const pere=annexe&&ZONES[annexe.parent]?nomLisible(ZONES[annexe.parent].nom):'';
      return '<tr data-svc="'+escapeHTML(l.id)+'" class="svc-'+l.etat+'">'
        +'<td><input class="svc-nom" data-svc-nom="'+escapeHTML(l.id)+'" maxlength="120" value="'+escapeHTML(brut(l.id))+'" aria-label="Nom du service '+escapeHTML(l.nom)+'">'
        +(annexe?'<label class="svc-parent">rattaché à <select data-svc-reparent="'+escapeHTML(l.id)+'"><option value=""'+(annexe.autonome?' selected':'')+'>aucun — service à part entière</option>'
            // Son service de rattachement a pu être supprimé : on le montre tel
            // quel, sans quoi la liste afficherait un autre service que le sien.
            +(estRetire(annexe.parent)&&ZONES[annexe.parent]?'<option value="'+escapeHTML(annexe.parent)+'" selected>'+escapeHTML(nomDeService(annexe.parent))+'</option>':'')
            +servicesDuPlan().map(id=>'<option value="'+escapeHTML(id)+'"'+(!annexe.autonome&&id===annexe.parent?' selected':'')+'>'+escapeHTML(nomLisible(ZONES[id].nom))+'</option>').join('')+'</select></label>'
          :'<small>service du plan</small>')+'</td>'
        +'<td>'+(l.cases.length?l.cases.map(a=>'<button type="button" class="lien-discret" data-svc-case="'+escapeHTML(a.id)+'">'+escapeHTML(a.nom)+'</button>'
          +(type[a.type]?' <small>'+type[a.type]+((a.type==='dispo'||a.type==='appui')&&+a.personnes>0?' · '+a.personnes+' pers.':'')+'</small>':a.type==='manuel'?' <small>'+a.personnes+' pers.</small>':'')).join('<br>'):'<em>aucune</em>')+'</td>'
        +'<td>'+(l.cmds?l.cmds+(l.cmds>1?' commandes':' commande'):'—')+'</td>'
        +'<td><span class="svc-etat '+l.etat+'">'+escapeHTML(l.texte)+'</span></td>'
        +'<td class="svc-actions"><button class="btn btn-sm'+(l.etat==='manque'&&!l.cases.length?' btn-play':'')+'" type="button" data-svc-action="equipe" data-svc="'+escapeHTML(l.id)+'">+ Une équipe</button>'
        +'<button class="btn btn-sm" type="button" data-svc-action="voir" data-svc="'+escapeHTML(l.id)+'">Voir sur le plan</button>'
        // Un service du plan d'origine se « supprime » comme les autres : il sort
        // de l'unité, et se remet d'un clic en bas de la page. « Retirer » ne
        // se lisait pas comme une suppression : on cherchait le bouton.
        +(annexe?'<button class="btn btn-sm svc-danger" type="button" data-svc-supprimer="'+escapeHTML(l.id)+'">Supprimer</button>'
          :'<button class="btn btn-sm svc-danger" type="button" data-svc-retirer="'+escapeHTML(l.id)+'" title="Il sort des listes, des liens et du plan ; on peut le remettre en bas de la page">Supprimer</button>')+'</td></tr>';
    }).join('')+'</tbody></table></div>'
    +sectionOrphelines()+sectionLocaux()+sectionRetires();
  filtrerServices(box);
}
/* Chercher un service par son nom : la liste est longue, et un service sans
 * équipe se range en tête, loin de l'ordre alphabétique. */
function filtrerServices(box){
  const q=box.querySelector('[data-svc-chercher]');if(!q)return;
  const t=q.value.trim().toLowerCase();let n=0;
  for(const tr of box.querySelectorAll('.svc-table tbody tr')){
    const i=tr.querySelector('.svc-nom'),ok=!t||(i?i.value:tr.textContent).toLowerCase().includes(t);
    tr.hidden=!ok;if(ok)n++;
  }
  const note=box.querySelector('[data-svc-compte]');
  if(note)note.textContent=t?(n?n+(n>1?' services':' service'):'Aucun service de l’unité ne porte ce nom. Regardez les services supprimés, en bas de la page.'):'';
}
/* Les services du plan d'origine supprimés de l'unité : on peut les remettre. */
function sectionRetires(){
  const r=Object.keys(ZONES).filter(estRetire);if(!r.length)return '';
  return '<section class="svc-bloc"><h3>Services supprimés de l’unité</h3><p class="mini-note">Ils ne figurent plus dans les listes, les liens ni le plan. On peut les y remettre.</p><ul class="svc-liste">'
    +r.map(id=>'<li><b>'+escapeHTML(nomLisible(ZONES[id].nom))+'</b><button class="btn btn-sm" type="button" data-svc-remettre="'+escapeHTML(id)+'">Remettre dans l’unité</button></li>').join('')+'</ul></section>';
}
/* Le nom d'un service, même supprimé : « Armement (supprimé) » se comprend,
 * « armement » tout court se cherche en vain dans les listes. */
function nomDeService(id){
  const s=servicesDisponibles().find(x=>x.id===id);if(s)return s.nom;
  const z=ZONES[id]||((Sim.editor&&Sim.editor.state.zones)||[]).find(x=>x.id===id);
  return (z?nomLisible(z.nom):id)+' (supprimé)';
}
/* Les services supprimés (de l'unité ou du plan) que des cases ou des chemins
 * citent encore — après un « Annuler » des cases, un vieil import… Ils font
 * des alertes qu'aucune liste ne permet de retrouver : on les montre ici. */
function servicesFantomes(){
  const at=Sim.ateliers;if(!at||!window.MoteurProduction)return [];
  const connus=new Set(servicesDisponibles().map(s=>s.id)),par=new Map();
  const noter=(id,champ)=>{if(!id||connus.has(id))return;
    const f=par.get(id)||{id,nom:nomDeService(id),cases:0,chemins:0,retire:estRetire(id)};f[champ]++;par.set(id,f);};
  for(const a of at.state.ateliers)noter(a.service,'cases');
  for(const p of at.state.parcours||[])for(const s of MoteurProduction.servicesDuParcours(p))noter(s,'chemins');
  return [...par.values()];
}
function sectionFantomes(){
  const f=servicesFantomes();if(!f.length)return '';
  const pl=(n,s,p)=>n+' '+(n>1?p:s);
  return '<section class="svc-bloc svc-alerte" data-svc-fantomes><h3>'+(f.length>1?f.length+' services supprimés sont encore utilisés':'Un service supprimé est encore utilisé')+'</h3>'
    +'<p class="mini-note">Ils ne sont plus dans l’unité, mais des cases ou des chemins y passent encore : ce sont eux qui font les alertes. '
    +'Effacez-les partout, ou faites passer leur travail dans un autre service.</p><ul class="svc-liste">'
    +f.map(x=>'<li><b>'+escapeHTML(x.nom)+'</b><span>'+[x.cases?pl(x.cases,'case','cases'):'',x.chemins?pl(x.chemins,'chemin','chemins'):''].filter(Boolean).join(' · ')+'</span>'
      +'<button class="btn btn-sm svc-danger" type="button" data-svc-effacer="'+escapeHTML(x.id)+'">Effacer partout</button>'
      +'<label>ou passer dans <select data-svc-vers="'+escapeHTML(x.id)+'">'+optionsServices(null)+'</select></label>'
      +'<button class="btn btn-sm" type="button" data-svc-remplacer="'+escapeHTML(x.id)+'">Passer</button>'
      +(x.retire?'<button class="btn btn-sm" type="button" data-svc-remettre="'+escapeHTML(x.id)+'">Remettre dans l’unité</button>':'')+'</li>').join('')
    +'</ul></section>';
}
const optionsServices=(choisi)=>servicesDisponibles().map(x=>'<option value="'+escapeHTML(x.id)+'"'+(x.id===choisi?' selected':'')+'>'+escapeHTML(x.nom)+'</option>').join('');
/* Des équipes rattachées à un service qui n'existe plus : on les rattache ailleurs. */
function sectionOrphelines(){
  const o=equipesOrphelines();if(!o.length)return '';
  return '<section class="svc-bloc svc-alerte"><h3>'+(o.length>1?o.length+' équipes n’ont plus de service':'Une équipe n’a plus de service')+'</h3>'
    +'<p class="mini-note">Leur service a disparu du plan. Choisissez où elles travaillent.</p><ul class="svc-liste">'
    +o.map(a=>'<li><b>'+escapeHTML(a.nom)+'</b><label>Rattacher à <select data-svc-orpheline="'+escapeHTML(a.id)+'">'+optionsServices(null)+'</select></label>'
      +'<button class="btn btn-sm" type="button" data-svc-rattacher="'+escapeHTML(a.id)+'">Rattacher</button></li>').join('')+'</ul></section>';
}
/* Les zones dessinées qui ne sont pas des services : on peut en faire un service. */
function sectionLocaux(){
  const l=locauxDuPlan();if(!l.length)return '';
  const racines=servicesDuPlan().map(id=>'<option value="'+escapeHTML(id)+'">'+escapeHTML(nomLisible(ZONES[id].nom))+'</option>').join('');
  return '<section class="svc-bloc"><h3>Zones du plan qui ne sont pas des services</h3>'
    +'<p class="mini-note">Un <b>local</b> dessiné sur le plan est une annotation : il n’apparaît ni dans les chemins ni dans les cases. '
    +'Pour y faire travailler une équipe, faites-en un service (une zone de production, rattachée à un service du plan dont elle reprend les liens).</p><ul class="svc-liste">'
    +l.map(z=>{const pere=parentProbable(z.nom);return '<li><b>'+escapeHTML(z.nom)+'</b><label>Rattachée à <select data-svc-parent="'+escapeHTML(z.id)+'">'
      +racines.replace('value="'+escapeHTML(pere)+'"','value="'+escapeHTML(pere)+'" selected')+'</select></label>'
      +'<button class="btn btn-sm btn-play" type="button" data-svc-convertir="'+escapeHTML(z.id)+'">En faire un service</button></li>';}).join('')+'</ul></section>';
}
/* Les gestes d'un service, d'où qu'ils viennent (sa page, le plan, les contrôles). */
function actionService(action,id){
  if(editMode&&action!=='plan')return;
  if(action==='equipe'){
    // La fiche du service : l'équipe y naît, avec sa grille à cocher.
    if(Sim.unite){Sim.unite.ouvrir(id);Sim.unite.ajouterEquipe(id);return;}
    if(Sim.onglets)Sim.onglets.choisir('at-equipes');
    Sim.ateliers.creer(id);
    toast('Équipe créée dans '+((servicesDisponibles().find(s=>s.id===id)||{}).nom||id)+' : réglez-la ici, puis rattachez-la à ses commandes dans leur chemin.');
  } else if(action==='voir'){
    if(Sim.onglets)Sim.onglets.choisir('j-plan');
    selection=null;selectionner(id);
  } else if(action==='plan'){
    if(!editMode)basculerEdition();
    if(id&&Sim.editor){Sim.editor.select(id);selectionner(id);}
  } else if(action==='supprimer'&&id&&Sim.editor){
    // Depuis une alerte : un service qui n'existe pas dans l'unité se supprime
    // là où on le voit (un service du plan d'origine se retire, et se remet).
    const z=Sim.editor.state.zones.find(v=>v.id===id);if(!z)return;
    const fait=z.kind==='service'?Sim.editor.retirer(id,true):Sim.editor.supprimer(id);
    if(fait)toast('« '+nomLisible(z.nom)+' » supprimé'+(z.kind==='service'?' : on peut le remettre en bas de Équipes › Liste des services.':'.'));
    if(document.body.dataset.sous==='u-services')renderServices();
  }
}
/* Un service supprimé encore cité : ses cases et ses étapes de chemin passent
 * dans un autre service, ou disparaissent. Annuler (dans les cases) les rend. */
function effacerService(id,vers){
  const nom=nomDeService(id);
  const f=servicesFantomes().find(x=>x.id===id)||{cases:0,chemins:0};
  const cible=vers?nomDeService(vers):'';
  const quoi=[f.cases?f.cases+(f.cases>1?' cases':' case'):'',f.chemins?f.chemins+(f.chemins>1?' chemins':' chemin'):''].filter(Boolean).join(' et ');
  if(!confirm(vers?'Faire passer '+quoi+' de « '+nom+' » dans « '+cible+' » ?':'Effacer « '+nom+' » de '+quoi+' ? Ses cases sont supprimées et ses étapes de chemin retirées. « Annuler » dans les cases les rétablit.'))return;
  reaffecterService(id,vers,nom.replace(/ \(supprimé\)$/,''));
  toast(vers?'« '+nom+' » : son travail passe dans « '+cible+' ».':'« '+nom+' » est effacé partout.');
  renderServices();
}
/* Un service renommé (page Services, édition du plan, Annuler…) : ses cases
 * qui portent son nom le suivent — « Montage », « Montage TX BC » deviennent
 * « Montage Nord », « Montage Nord TX BC ». Sans cela, le service et ses cases
 * portaient deux noms, et l'on ne savait plus de quoi l'on parlait. Un nom
 * choisi à la main, qui ne commence pas par celui du service, reste. */
let nomsServices=null;
function suivreNomsServices(){
  const actuels=new Map(servicesDisponibles().map(s=>[s.id,s.nom]));
  const avant=nomsServices;nomsServices=actuels;
  if(!avant||!Sim.ateliers)return;
  const change=[...actuels].filter(([id,n])=>avant.has(id)&&avant.get(id)!==n);
  if(!change.length)return;
  const suivre=(nom,de,vers)=>{const N=String(nom).toUpperCase(),D=String(de).toUpperCase();
    return N===D?vers:N.startsWith(D+' ')?vers+String(nom).slice(de.length):null;};
  const touchees=[];
  for(const [id,vers] of change){const de=avant.get(id);
    for(const a of Sim.ateliers.state.ateliers){if(a.service!==id)continue;const n=suivre(a.nom,de,vers);if(n&&n!==a.nom)touchees.push([a.id,n]);}}
  if(!touchees.length)return;
  Sim.ateliers.changer(()=>{for(const [aid,n] of touchees){const a=Sim.ateliers.state.ateliers.find(x=>x.id===aid);
    if(a)a.nom=OrlyParcours.nomLibre({ateliers:Sim.ateliers.state.ateliers.filter(x=>x!==a)},n);}},
    touchees.length+(touchees.length>1?' cases suivent':' case suit')+' le nouveau nom de leur service.');
}
function renommerService(id,valeur){
  const v=String(valeur||'').trim();
  if(!v||!Sim.editor){renderServices();toast('Le nom ne peut pas être vide.');return;}
  Sim.editor.change(()=>{const z=Sim.editor.state.zones.find(x=>x.id===id);if(z)z.nom=v;},'Nom enregistré.');
  toast('Service renommé : '+v+'.');
  renderServices();
}
function initServices(){
  const vue=document.getElementById('view-flux');if(!vue)return;
  const box=document.createElement('section');
  box.id='services-unite';box.className='services-unite';box.dataset.sous='u-services';box.setAttribute('aria-label','Les services de l’unité');
  vue.appendChild(box);
  box.addEventListener('change',e=>{const i=e.target.closest('[data-svc-nom]');if(i)renommerService(i.dataset.svcNom,i.value);});
  box.addEventListener('keydown',e=>{const i=e.target.closest('[data-svc-nom]');if(i&&e.key==='Enter'){e.preventDefault();i.blur();}});
  box.addEventListener('input',e=>{if(e.target.closest('[data-svc-chercher]'))filtrerServices(box);});
  box.addEventListener('submit',e=>{
    const f=e.target.closest('[data-svc-nouveau]');if(!f)return;e.preventDefault();
    const nom=f.elements.nom.value.trim();if(!nom){toast('Donnez un nom au service.');return;}
    if(servicesDisponibles().some(x=>x.nom.toLowerCase()===nomLisible(nom).toLowerCase())){toast('« '+nom+' » existe déjà.');return;}
    const id=Sim.editor.nouveauService(nom,f.elements.parent.value,!f.elements.parent.value);
    if(id){toast('Service « '+nom+' » créé : il apparaît dans les chemins, les cases et le barème.');renderServices();
      const i=box.querySelector('[data-svc-nom="'+CSS.escape(id)+'"]');if(i)i.closest('tr').classList.add('svc-nouveau-ligne');}
  });
  box.addEventListener('change',e=>{
    const rp=e.target.closest('[data-svc-reparent]');
    if(rp){const id=rp.dataset.svcReparent;Sim.editor.change(()=>{const z=Sim.editor.state.zones.find(v=>v.id===id);if(!z)return;
        if(rp.value){z.parent=rp.value;delete z.autonome;}else{z.autonome=true;delete z.parent;}},'Rattachement enregistré.');
      toast(rp.value?'Rattaché à « '+nomLisible(ZONES[rp.value].nom)+' » : il en reprend les liens.':'Service à part entière : ses propres minutes et ses propres liens.');renderServices();}
  });
  box.addEventListener('click',e=>{
    const sp=e.target.closest('[data-svc-supprimer]');
    if(sp){if(Sim.editor.supprimer(sp.dataset.svcSupprimer))toast('Service supprimé.');renderServices();return;}
    const rt=e.target.closest('[data-svc-retirer]');
    if(rt){if(Sim.editor.retirer(rt.dataset.svcRetirer,true))toast('Service retiré de l’unité : « Remettre » en bas de la page.');renderServices();return;}
    const rm=e.target.closest('[data-svc-remettre]');
    if(rm){Sim.editor.retirer(rm.dataset.svcRemettre,false);toast('Service remis dans l’unité.');renderServices();return;}
    const ef=e.target.closest('[data-svc-effacer]');
    if(ef){effacerService(ef.dataset.svcEffacer,null);return;}
    const rp=e.target.closest('[data-svc-remplacer]');
    if(rp){const sel=box.querySelector('[data-svc-vers="'+CSS.escape(rp.dataset.svcRemplacer)+'"]');if(sel&&sel.value)effacerService(rp.dataset.svcRemplacer,sel.value);return;}
    const cv=e.target.closest('[data-svc-convertir]');
    if(cv){const id=cv.dataset.svcConvertir,sel=box.querySelector('[data-svc-parent="'+CSS.escape(id)+'"]');
      if(Sim.editor.convertir(id,sel?sel.value:null)){toast('« '+Sim.editor.state.zones.find(z=>z.id===id).nom+' » est maintenant un service : il apparaît dans les chemins et les cases.');renderServices();}
      return;}
    const ra=e.target.closest('[data-svc-rattacher]');
    if(ra){const id=ra.dataset.svcRattacher,sel=box.querySelector('[data-svc-orpheline="'+CSS.escape(id)+'"]');
      const a=Sim.ateliers.state.ateliers.find(x=>x.id===id);if(!a||!sel)return;
      const vieux=a.service;reaffecterEquipe(id,sel.value,vieux);renderServices();return;}
    const c=e.target.closest('[data-svc-case]');
    if(c){const id=c.dataset.svcCase;if(!Sim.ateliers.ouvrirFiche(id)){Sim.ateliers.ouvert=id;if(Sim.onglets)Sim.onglets.choisir('at-equipes');Sim.ateliers.rendre();}return;}
  });
  // Les boutons d'un service peuvent vivre ailleurs : le panneau du plan, les contrôles.
  document.addEventListener('click',e=>{const b=e.target.closest('[data-svc-action]');if(b)actionService(b.dataset.svcAction,b.dataset.svc||null);});
}

/* Un service disparu (zone supprimée) : ses équipes et les étapes des chemins
 * passent dans le service qui le remplace, ou sont retirées s'il n'y en a pas. */
function reaffecterService(de,vers,nomDe){
  const at=Sim.ateliers;if(!at)return;
  const st=at.state;
  const touche=st.ateliers.some(a=>a.service===de)||(st.parcours||[]).some(p=>MoteurProduction.servicesDuParcours(p).includes(de));
  if(!touche)return;
  const nomVers=vers?((servicesDisponibles().find(x=>x.id===vers)||{}).nom||vers):'';
  at.changer(()=>{
    if(vers)for(const a of st.ateliers){if(a.service===de)a.service=vers;}
    else st.ateliers=st.ateliers.filter(a=>a.service!==de);
    for(const p of st.parcours||[]){
      if(!Array.isArray(p.noeuds))continue;
      if(!p.noeuds.includes(de))continue;
      // Sans service qui le remplace : ceux qui le livraient livrent ceux qu'il
      // livrait (le chemin ne se coupe pas en deux).
      if(!vers){OrlyParcours.retirerService(p,de);continue;}
      if(!p.noeuds.includes(vers))p.noeuds=p.noeuds.map(x=>x===de?vers:x);
      else p.noeuds=p.noeuds.filter(x=>x!==de);
      const vus=new Set();
      p.liens=(p.liens||[]).map(l=>({de:l.de===de?vers:l.de,vers:l.vers===de?vers:l.vers}))
        .filter(l=>l.de&&l.vers&&l.de!==l.vers&&!vus.has(l.de+'>'+l.vers)&&vus.add(l.de+'>'+l.vers));
    }
  },vers?'« '+(nomDe||de)+' » supprimé : ses équipes et ses étapes de chemin passent dans « '+nomVers+' ».'
       :'« '+(nomDe||de)+' » supprimé : ses équipes et ses étapes de chemin sont retirées.');
}
/* Une équipe orpheline rattachée à un service : ses étapes de chemin suivent. */
function reaffecterEquipe(id,vers,de){
  const at=Sim.ateliers;const a=at.state.ateliers.find(x=>x.id===id);if(!a)return;
  const reste=at.state.ateliers.filter(x=>x.service===de&&x.id!==id).length;
  if(reste){at.changer(()=>{a.service=vers;},a.nom+' rattachée à « '+((servicesDisponibles().find(x=>x.id===vers)||{}).nom||vers)+' ».');return;}
  // La dernière équipe du service disparu : les chemins qui y passaient suivent aussi.
  at.changer(()=>{a.service=vers;},'');reaffecterService(de,vers,de);
}
/* Des équipes dont le service n'existe plus (d'anciennes sauvegardes). */
function equipesOrphelines(){
  const ids=new Set(servicesDisponibles().map(s=>s.id));
  return ((Sim.ateliers&&Sim.ateliers.state.ateliers)||[]).filter(a=>!ids.has(a.service));
}
/* Les zones dessinées qui ne sont pas des services : des locaux, des équipements. */
function locauxDuPlan(){
  return ((Sim.editor&&Sim.editor.state.zones)||[]).filter(z=>z.kind!=='service'&&z.kind!=='annexe');
}
/* Le service dont un local dépend le plus probablement : celui dont le nom
 * commence le sien (« Armement EZY/AF » → Armement), sinon le premier. */
function parentProbable(nom){
  const n=String(nom||'').toLowerCase();
  const s=servicesDuPlan().map(id=>({id,nom:nomLisible(ZONES[id].nom).toLowerCase()}))
    .filter(x=>n.startsWith(x.nom.split(/[ ·/]/)[0])).sort((a,b)=>b.nom.length-a.nom.length)[0];
  return s?s.id:servicesDuPlan()[0];
}

function lectureDuGraphe(){
  const liens=liaisonsServices();
  const noms=new Map(servicesDisponibles().map(s=>[s.id,s.nom]));
  const nom=id=>noms.get(id)||nomDeService(id);
  const ateliers=(Sim.ateliers&&Sim.ateliers.state.ateliers)||[];

  const equipes=new Map();
  for(const a of ateliers){
    const e=equipes.get(a.service)||{n:0,dispo:false,fabrique:false};
    // Une plonge lave pour tout le monde : elle n'a pas de liste de commandes,
    // et ce n'est pas un oubli.
    e.n++; if(a.type==='dispo'||a.type==='lavage'||a.type==='handling')e.dispo=true; if((a.lots||[]).some(l=>l.length))e.fabrique=true;
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
  // Chaque alerte garde les services qu'elle nomme : on doit pouvoir agir
  // dessus d'un clic (ajouter l'équipe qui manque, ouvrir le service).
  const grouper=(liste,grave,texte,geste)=>{ if(liste.length) alertes.push({grave,texte:texte(liste.map(l=>nom(l.id))),
    services:liste.map(l=>({id:l.id,nom:nom(l.id)})),geste:geste||null}); };
  // Un service dont le travail se fait dans ses propres salles (« Armement »,
  // quand tout se prépare dans « Armement AF Équipage ») n'a pas à avoir
  // d'équipe : ses salles reprennent ses liens. Ce n'est pas un point à
  // corriger, et s'il n'existe plus comme salle, on le supprime d'ici.
  const salles=id=>annexes().filter(a=>a.parent===id&&equipes.has(a.id));
  grouper(lignes.filter(l=>!l.equipes&&!salles(l.id).length), true, noms2=>
    noms2.join(', ')+(noms2.length>1?' fournissent':' fournit')+' sans avoir d’équipe : '
    +'rien n’en sort, et personne ne '+(noms2.length>1?'les':'l’')+' attend. '
    +'Donnez-'+(noms2.length>1?'leur':'lui')+' une équipe — une « mise à disposition » '
    +'suffit pour un magasin, des appros ou tout ce qui ne fait que sortir du matériel. '
    +'S’'+(noms2.length>1?'ils n’existent':'il n’existe')+' pas dans votre unité, '+(noms2.length>1?'supprimez-les':'supprimez-le')+'.','equipe');
  for(const l of lignes.filter(l=>!l.equipes&&salles(l.id).length))
    alertes.push({grave:false,geste:'supprimer',services:[{id:l.id,nom:l.nom}],
      texte:l.nom+' n’a pas d’équipe : son travail se fait dans '+salles(l.id).map(a=>nomLisible(a.nom)).join(', ')
        +', qui en reprennent les liens. S’il n’existe plus comme salle, supprimez-le : elles les garderont.'});
  grouper(lignes.filter(l=>l.equipes&&!l.produit), true, noms2=>
    noms2.join(', ')+' : une équipe est décrite mais ne prépare rien. Dites ce qu’elle prépare.');
  grouper(lignes.filter(l=>l.produit&&!l.amonts.length&&!l.avals.length), false, noms2=>
    noms2.join(', ')+' n’est relié à personne : ce qui y est préparé ne sert à aucun autre service.');
  grouper(lignes.filter(l=>l.produit&&l.avals.length===0&&l.amonts.length), false, noms2=>
    noms2.join(', ')+' ne livre à personne. Normal en bout de chaîne.');
  const orphelines=equipesOrphelines();
  if(orphelines.length)alertes.push({grave:true,orphelines:true,
    texte:orphelines.map(a=>a.nom).join(', ')+(orphelines.length>1?' travaillent':' travaille')+' dans un service qui n’existe plus sur le plan. '
      +'Rattachez '+(orphelines.length>1?'ces équipes':'cette équipe')+' à un service (Équipes › Liste des services).'});
  // Un service supprimé qui reste une étape de chemins : l'étape est sautée,
  // et l'alerte du calcul le nomme sans qu'on puisse le retrouver nulle part.
  const fantomes=servicesFantomes().filter(f=>f.chemins);
  const nChemins=fantomes.reduce((n,f)=>n+f.chemins,0);
  if(fantomes.length)alertes.push({grave:true,
    texte:fantomes.map(f=>f.nom).join(', ')+(fantomes.length>1?' restent des étapes':' reste une étape')+' de '
      +nChemins+(nChemins>1?' chemins':' chemin')+'. Effacez-'+(fantomes.length>1?'les':'le')+' partout, ou faites passer '
      +(fantomes.length>1?'leur':'son')+' travail dans un autre service (Équipes › Liste des services, en tête de page).'});
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
    // Le handling a son service à lui, dans la zone CF départ food (où il charge).
    creerHandling:()=>Sim.editor?Sim.editor.nouveauService('Handling','handling',!ZONES.handling):null,
    classes:()=>MoteurProduction.classesDeVols(flights,{delaiChargement:CFG.loadDelay}),
    liaisons:liaisonsServices,
    reglages:()=>(Sim.reglages?Sim.reglages.pourMoteur():{delaiChargement:CFG.loadDelay}),
    // Le plan dit « aménagé » d'après les ateliers : il doit suivre leur saisie.
    // La liste du barème marque les services qui portent une équipe : elle doit
    // donc se redessiner quand les ateliers bougent.
    change:()=>{if(suivreDemo()){Sim.ateliers.rendre();return;}majEtatPlan();majDemarrage();if(Sim.reglages)Sim.reglages.rendre();if(Sim.vue)Sim.vue.recalculer();majStocks();renderPlanche();renderControles();if(Sim.unite)Sim.unite.rendre();},
    // Une case se règle dans le chemin d'une commande : l'ouvrir d'ailleurs y mène.
    onglet:id=>{if(Sim.onglets)Sim.onglets.choisir(id);},
    // Le chemin d'une commande mène à son flux (Chemins) et à ses services (Équipes).
    flux:id=>{if(Sim.unite)Sim.unite.ouvrirFlux(id);},
    ouvrirService:id=>{if(Sim.unite)Sim.unite.ouvrir(id);},
    // Un service supprimé encore cité : son nom, pour que les alertes le
    // disent lisiblement, et le geste qui l'efface.
    fantomes:servicesFantomes,
    effacerService:(id,vers)=>effacerService(id,vers),
    notify:toast
  });
}
/* ==========================================================================
 *  DONNÉES › PLANCHE RETOUR (retour d'usage du 29/09)
 *  La planche retour du handling : quand chaque vol revient à l'unité, pour la
 *  plonge. C'est une donnée : elle se saisit ici ou s'importe en Excel. La
 *  simulation ne la lit que si « D'où viennent les retours ? » (Réglages de la
 *  simulation) le dit. Elle vit dans l'état des ateliers (materiel.planche).
 * ==========================================================================*/
const CLASSES_PLANCHE=[['bc','BC'],['pc','PC'],['yc','YC'],['crew','CREW'],['spml','SPML']];
function renderPlanche(){
  const box=document.getElementById('vols-planche');if(!box||!Sim.ateliers)return;
  if(box.contains(document.activeElement)&&document.activeElement.matches('input'))return;
  const m=Sim.ateliers.state.materiel,planche=m.planche||[],src=MoteurProduction.sourceRetours(m);
  // Un vol qui revient après minuit arrive le lendemain (J+1).
  const jours=j=>[-1,0,1].map(k=>'<option value="'+k+'"'+(k===(j||0)?' selected':'')+'>'+(k>0?'J+'+k:k?'J'+k:'J')+'</option>').join('');
  const lignes=planche.map((l,i)=>'<tr data-index="'+i+'">'
    +'<td><input data-pl-champ="vol" value="'+escapeHTML(l.vol||'')+'" maxlength="40" aria-label="Vol, ligne '+(i+1)+'"></td>'
    +'<td><input data-pl-champ="cie" value="'+escapeHTML(l.cie||'')+'" maxlength="40" aria-label="Compagnie, ligne '+(i+1)+'"></td>'
    +'<td><input type="time" data-pl-champ="heure" value="'+escapeHTML(l.heure)+'" aria-label="Arrivée à l’unité, ligne '+(i+1)+'"></td>'
    +'<td><select data-pl-champ="jour" aria-label="Jour, ligne '+(i+1)+'">'+jours(l.jour)+'</select></td>'
    +CLASSES_PLANCHE.map(([k,c])=>'<td><input type="number" min="0" data-pl-champ="'+k+'" value="'+(l[k]??'')+'" placeholder="—" aria-label="'+c+', ligne '+(i+1)+'"></td>').join('')
    +'<td><button class="lien-discret" data-pl-action="retirer" aria-label="Retirer la ligne '+(i+1)+'">×</button></td></tr>').join('');
  box.innerHTML='<div class="panneau planche">'
    +'<div class="planche-tete"><h3>Planche retour du handling</h3><span class="planche-fin"></span>'
    +'<button class="btn btn-sm" data-pl-action="ajouter">+ Ligne</button>'
    +'<button class="btn btn-sm" data-pl-action="exporter" title="La planche dans un classeur Excel (vide : un modèle à remplir)">⇩ Excel</button>'
    +'<button class="btn btn-sm" data-pl-action="importer" title="Remplacer la planche par un classeur Excel">⇧ Importer</button>'
    +'<input type="file" accept=".xlsx,.csv" hidden data-pl-fichier>'
    +(planche.length?'<button class="btn btn-sm svc-danger" data-pl-action="vider">Vider</button>':'')+'</div>'
    +(src==='planche'?'<p class="mini-note planche-etat ok">La simulation lit cette planche : chaque vol revient à la plonge à son heure d’arrivée à l’unité.</p>'
      :'<p class="mini-note planche-etat">La simulation ne lit pas cette planche : ses retours viennent '+(src==='j1'?'des départs de la veille (J+1)':'des lignes « retour » du programme de vols')
        +'. <button class="btn btn-sm btn-play" data-pl-action="utiliser">Utiliser la planche retour</button> <button class="lien-discret" data-page="rg-simulation">Réglages de la simulation →</button></p>')
    +(planche.length?'<p class="mini-note planche-comparer">Laquelle donne la meilleure journée ? <button class="btn btn-sm" data-comparer-retours>⇄ Comparer J+1 et planche retour</button></p>':'')
    +'<div class="table-scroll"><table class="planche-table"><thead><tr><th>Vol</th><th>Compagnie</th><th>Arrivée à l’unité</th><th>Jour</th>'
    +CLASSES_PLANCHE.map(([,c])=>'<th title="Passagers de cette classe à bord (facultatif)">'+c+'</th>').join('')+'<th></th></tr></thead><tbody>'
    +(lignes||'<tr><td colspan="10" class="mini-note">Aucune ligne. « + Ligne » pour saisir, ou « ⇧ Importer » un classeur (« ⇩ Excel » donne le modèle).</td></tr>')
    +'</tbody></table></div>'
    +'<p class="mini-note">Classes : facultatif. Vides, le vol ramène le matériel des classes que sa compagnie emporte au départ. '
    +planche.length+(planche.length>1?' lignes.':' ligne.')+'</p></div>';
}
function changerPlanche(fn,message){if(Sim.ateliers)Sim.ateliers.changer(()=>{const m=Sim.ateliers.state.materiel;m.planche=(m.planche||[]).slice();fn(m);},message);renderPlanche();}
function initPlanche(){
  const box=document.getElementById('vols-planche');if(!box)return;
  box.addEventListener('change',e=>{
    const el=e.target;
    if(el.matches('[data-pl-fichier]'))return importerPlanche(el);
    const champ=el.dataset.plChamp;if(!champ)return;
    const i=+el.closest('tr').dataset.index,v=el.value;
    setTimeout(()=>changerPlanche(m=>{const l={...m.planche[i]};
      if(champ==='jour')l.jour=parseInt(v,10)||0;
      else if(CLASSES_PLANCHE.some(([k])=>k===champ)){if(v===''||!(+v>0))delete l[champ];else l[champ]=Math.round(+v);}
      else l[champ]=champ==='cie'?v.trim().toUpperCase():v.trim();
      m.planche[i]=l;},'Planche retour enregistrée.'),0);
  });
  box.addEventListener('click',e=>{
    const b=e.target.closest('[data-pl-action]');if(!b)return;
    const a=b.dataset.plAction;
    if(a==='ajouter'){const d=(Sim.ateliers.state.materiel.planche||[]).slice(-1)[0];changerPlanche(m=>m.planche.push({vol:'',cie:d?d.cie:'',heure:d?d.heure:'12:00',jour:0}),'Ligne ajoutée.');}
    else if(a==='retirer'){const i=+b.closest('tr').dataset.index;changerPlanche(m=>m.planche.splice(i,1),'Ligne retirée.');}
    else if(a==='vider'){if(confirm('Vider la planche retour ? « Annuler » (Organisation) la rétablit.'))changerPlanche(m=>{m.planche=[];},'Planche vidée.');}
    else if(a==='utiliser'){changerPlanche(m=>{m.retours='planche';},'La simulation lit maintenant la planche retour.');}
    else if(a==='exporter'){OrlyTableur.telecharger('ory-planche-retour.xlsx',OrlyTableur.ecrireClasseur(OrlyEchanges.plancheVersClasseur(Sim.ateliers.state.materiel.planche||[])));}
    else if(a==='importer')box.querySelector('[data-pl-fichier]').click();
  });
}
async function importerPlanche(input){
  const f=input.files[0];if(!f)return;
  try{
    const lignes=OrlyEchanges.classeurVersPlanche(await OrlyTableur.lireFichier(f,4*1024*1024));
    if(!confirm('Remplacer la planche retour par ce fichier ('+lignes.length+(lignes.length>1?' lignes':' ligne')+') ? L’action est annulable.'))return;
    changerPlanche(m=>{m.planche=lignes;},'Planche retour importée : '+lignes.length+(lignes.length>1?' lignes.':' ligne.'));
    toast('Planche retour importée : '+lignes.length+(lignes.length>1?' lignes':' ligne'));
  }catch(err){toast('Import refusé — '+err.message);}
  finally{input.value='';}
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
  const fabriquent=ats.filter(a=>a.type==='dispo'||a.type==='lavage'||a.type==='handling'||(a.lots||[]).some(l=>l.length)).length;
  // « Calibré » ne veut pas dire « juste » : seulement que ce ne sont plus les
  // valeurs de démonstration. C'est tout ce qu'on peut honnêtement constater.
  let calibre=false;
  try{ calibre=Sim.reglages
    ? JSON.stringify(Sim.reglages.etat.bareme)!==JSON.stringify(MoteurProduction.BAREME_DEMO)
    : false; }catch(e){ calibre=false; }
  return {
    vols:{ total:flights.length, departs:flights.filter(f=>f.sens==='DEP').length,
           source:dataSource==='Jeu de démonstration'?'demo':'importe' },
    plan:{ services:servicesDuPlan().length+annexes().length,
           approx:zones.filter(z=>z.approx&&z.visible!==false).length },
    flux:{ liaisons:Sim.flows?Sim.flows.state.flows.filter(f=>f.enabled).length:0,
           alertes:sansChemin()?lu.alertes.filter(a=>a.grave).length:0 },
    ateliers:{ total:ats.length, fabriquent,
               absentes:(r.indicateurs||{}).classesAbsentes||0 },
    // Les chemins (refonte du 05/10) : combien de flux, et les commandes sans chemin.
    chemins:{ flux:Sim.ateliers&&window.OrlyParcours?OrlyParcours.types(Sim.ateliers.state).filter(t=>!t.auto).length:0,
              variantes:Sim.ateliers&&window.OrlyParcours?OrlyParcours.types(Sim.ateliers.state).filter(t=>t.auto).length:0,
              sansChemin:sansChemin() },
    bareme:{ calibre },
    reglages:{ delai:CFG.loadDelay, decalage:CFG.shift,
               rendement:Sim.reglages?Sim.reglages.etat.rendement:1,
               pauses:Sim.reglages?((Sim.reglages.etat.regime||{}).seuils||[]).length:0 },
    journee:{ calculee:!!(r.lots&&r.lots.length), suivies:(r.indicateurs||{}).classesSuivies||0,
              aHeure:(r.indicateurs||{}).aHeure||0,
              fin:Number.isFinite((r.indicateurs||{}).finDerniere)?MoteurProduction.hhmm(r.indicateurs.finDerniere):null }
  };
}
function majDemarrage(){ if(Sim.onglets)Sim.onglets.rendre(); if(Sim.demarrage)Sim.demarrage.rendre(); afficherTitre(); if(document.body.dataset.sous==='u-services')renderServices(); }
/* Un nombre sur un onglet dit qu'il y a quelque chose à y faire, sans l'ouvrir. */
/* Les contrôles du calcul (audit du 29/09) : la page Contrôles ne parlait que
 * des liens entre services, qui ne servent plus quand chaque commande a son
 * chemin — et taisait ce que le calcul signale. On sépare ce qui est à
 * CORRIGER dans l'organisation de ce que la journée MONTRE (des résultats). */
const CODES_JOURNEE=new Set(['poste','materiel','bouchon','inacheve','plonge-fermee','plonge-vol',
  'handling-bloque','handling-poste','handling-retard','handling-chauffeurs']);
function controlesDuCalcul(){
  const an=((Sim.ateliers&&Sim.ateliers.resultat)||{}).anomalies||[];
  return {corriger:an.filter(a=>!CODES_JOURNEE.has(a.code)),journee:an.filter(a=>CODES_JOURNEE.has(a.code))};
}
function sansChemin(){
  return Sim.ateliers&&window.OrlyParcours?Sim.ateliers.classes.filter(c=>!OrlyParcours.fluxDe(Sim.ateliers.state,c)).length:0;
}
function renderControles(){
  const box=document.getElementById('fc-calcul');if(!box)return;
  const {corriger,journee}=controlesDuCalcul(),n=sansChemin();
  const liste=l=>'<ul>'+l.slice(0,40).map(a=>'<li>'+escapeHTML(a.message||a.code)+'</li>').join('')+(l.length>40?'<li>… et '+(l.length-40)+' autres</li>':'')+'</ul>';
  box.innerHTML=(corriger.length
      ?'<div class="fc-alerte grave"><b>'+corriger.length+(corriger.length>1?' points':' point')+' à corriger dans l’organisation</b>'+liste(corriger)
        +'<button type="button" class="lien-fort" data-page="at-chemins">Ouvrir les chemins →</button></div>'
      :'<p class="fc-alerte ok">L’organisation se lit de bout en bout : chaque étape a sa case, chaque case sait quoi préparer.</p>')
    +(journee.length?'<details class="fc-alerte"><summary><b>'+journee.length+(journee.length>1?' choses que la journée montre':' chose que la journée montre')
        +'</b> — retards, postes trop courts, attentes : ce sont des résultats, pas des erreurs de saisie.</summary>'+liste(journee)
        +'<button type="button" class="lien-fort" data-page="j-chiffres">Voir les résultats →</button></details>':'')
    +'<p class="mini-note fc-liens-note">'+(n?'<b>'+n+(n>1?' commandes n’ont pas':' commande n’a pas')+' de chemin</b> : pour elles, le calcul suit les liens entre services ci-dessous.'
      :'Toutes les commandes ont leur chemin : les liens ci-dessous ne servent pas au calcul, ils décrivent l’unité.')+'</p>';
}
function badgeOnglet(id){
  const r=(Sim.ateliers&&Sim.ateliers.resultat)||{};
  if(id==='mu-pas'&&Sim.unite){const n=Sim.unite.aFaire();return n?{n,ton:'neutre',titre:n+(n>1?' étapes':' étape')+' à faire'}:null;}
  // Les commandes qui n'ont pas encore leur chemin : ce qui reste à dessiner.
  if(id==='at-chemins'&&window.OrlyParcours&&Sim.ateliers){
    const n=Sim.ateliers.classes.filter(c=>!OrlyParcours.fluxDe(Sim.ateliers.state,c)).length;
    return n?{n,ton:'neutre',titre:n+(n>1?' commandes sans flux':' commande sans flux')}:null;
  }
  if(id==='at-repas'){
    const n=(r.indicateurs||{}).classesAbsentes||0;
    return n?{n,ton:'neutre',titre:n+(n>1?' commandes':' commande')+' sans équipe'}:null;
  }
  if(id==='u-lecture'&&Sim.flows){
    // Ce qui est à corriger dans l'organisation ; les liens seulement s'ils servent encore.
    const n=controlesDuCalcul().corriger.length+(sansChemin()?lectureDuGraphe().alertes.filter(a=>a.grave).length:0);
    return n?{n,ton:'attente',titre:n+(n>1?' points':' point')+' à corriger'}:null;
  }
  return null;
}
/* ==========================================================================
 *  MON UNITÉ (unite.js) — tout le paramétrage, service par service
 * ==========================================================================*/
function supprimerServiceUnite(id){
  const z=Sim.editor&&Sim.editor.state.zones.find(v=>v.id===id);if(!z)return false;
  const nom=nomLisible(z.nom),cases=Sim.ateliers.state.ateliers.filter(a=>a.service===id).length;
  if(!confirm('Supprimer le service « '+nom+' »'+(cases?' et ses '+cases+(cases>1?' équipes':' équipe'):'')+' ?'
    +(z.kind==='service'?' (Un service du plan d’origine se remet depuis Équipes › Liste des services.)':'')))return false;
  if(cases||(Sim.ateliers.state.parcours||[]).some(p=>MoteurProduction.servicesDuParcours(p).includes(id)))reaffecterService(id,null,nom);
  const fait=z.kind==='service'?Sim.editor.retirer(id,true):Sim.editor.supprimer(id);
  if(fait)toast('« '+nom+' » supprimé.');
  return !!fait;
}
function initUnite(){
  if(!window.OrlyUnite||!Sim.ateliers)return;
  Sim.unite=new OrlyUnite.MonUnite({
    at:()=>Sim.ateliers, rg:()=>Sim.reglages,
    services:servicesDisponibles,
    parent:id=>{const a=annexes().find(z=>z.id===id);return a?a.parent:null;},
    racines:()=>servicesDuPlan().map(id=>({id,nom:nomLisible(ZONES[id].nom)})),
    // Les retours des vols (quais → plonge) ne placent aucun service : ils
    // refermeraient la boucle du chemin.
    liaisons:()=>liaisonsServices().filter(l=>l.from!=='quais'),
    brut:id=>{const z=((Sim.editor&&Sim.editor.state.zones)||[]).find(x=>x.id===id);return z?z.nom:nomDeService(id);},
    renommer:renommerService,
    creer:(nom,parent,autonome)=>Sim.editor?Sim.editor.nouveauService(nom,parent,autonome):null,
    supprimer:supprimerServiceUnite,
    voir:id=>actionService('voir',id),
    plan:id=>actionService('plan',id),
    vols:()=>({departs:flights.filter(f=>f.sens==='DEP').length,importes:dataSource!=='Jeu de démonstration'}),
    page:id=>{if(Sim.onglets)Sim.onglets.choisir(id);},
    // Le chemin d'une commande, ouvert sur un service.
    chemin:(cmd,s)=>{if(Sim.ateliers&&Sim.ateliers.parcours)Sim.ateliers.parcours.ouvrir(cmd,s);},
    notify:toast
  });
  // Le temps de travail d'un service se règle aussi dans sa fiche.
  const box=document.getElementById('mu-services');
  if(box&&Sim.reglages)Sim.reglages.ecouter(box);
}
/* La hauteur de l'en-tête (menu et onglets) : les listes collées en haut d'une
 * vue (services, commandes) s'y ajustent pour tenir dans l'écran. L'en-tête
 * change de hauteur avec la largeur de la fenêtre et d'une partie à l'autre. */
function majHauteurEntete(){
  const so=document.getElementById('sous-onglets');
  if(!so||so.hidden||!so.offsetParent)return;
  document.documentElement.style.setProperty('--haut-entete',Math.round(so.getBoundingClientRect().bottom)+'px');
}
window.addEventListener('resize',()=>requestAnimationFrame(majHauteurEntete));
function initOnglets(){
  if(!window.OrlyOnglets)return;
  Sim.onglets=new OrlyOnglets.SousOnglets({
    hote:()=>document.getElementById('sous-onglets'),
    vue:()=>activeView,
    badge:badgeOnglet,
    // Une fois la page ouverte : son titre, et le menu qui marque sa partie.
    apres:id=>{afficherTitre();if(Sim.demarrage)Sim.demarrage.rendreMenu();if(id==='u-services')renderServices();majHauteurEntete();},
    change:(vue,id)=>{
      if(vue!==activeView)showView(vue);
      if(id==='v-departs')renderFlights();
      if(id==='v-planche')renderPlanche();
      if(id==='rg-simulation'&&Sim.ateliers)Sim.ateliers.rendreMateriel(Sim.ateliers.resultat);
      if(id==='u-lecture'&&Sim.flows){Sim.flows.refresh();renderControles();}
      // La fenêtre d'une case se cale sous la barre des onglets, mesurée une fois visible.
      if(id==='at-chemins'&&Sim.ateliers)Sim.ateliers.parcours.placeTiroir();
      // Un onglet des ateliers se dessine à son ouverture, s'il a changé depuis.
      if(vue==='ateliers'&&Sim.ateliers)Sim.ateliers.surOnglet(id);
      if((id==='mu-services'||id==='mu-pas'||id==='mu-flux'||id==='mu-carte')&&Sim.unite)Sim.unite.rendre();
    }
  });
  // Les outils d'une vue (annuler, Excel, importer) montent sur la barre des
  // onglets : ils valent pour toute la vue, ils n'ont pas à prendre une ligne.
  const outils=document.getElementById('so-outils');
  // Ceux des liens ne valent que pour les liens : ils ne suivent pas dans la sauvegarde.
  // Ceux des cases et des chemins ne suivent pas dans les résultats (planning, commandes).
  for(const [vue,sel,onglet] of [['ateliers','#view-ateliers .at-actions','mu-services at-chemins at-equipes'],
                                 ['reglages','#rg-bareme-panneau .rg-actions','rg-minutes rg-simulation'],
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
  Sim.demarrage=new OrlyDemarrage.Accueil({
    menu:()=>document.getElementById('menu'),
    accueil:()=>document.getElementById('view-accueil'),
    etat:etatDemarrage,
    partie:()=>activeView==='accueil'?'accueil':(document.body.dataset.partie||null)
  });
  // On arrive sur l'accueil : l'état de chaque partie, et ce qu'il y a à faire.
  showView('accueil');
}
/* Le menu : ouvrir une page, une partie, ou revenir à l'accueil. Pendant
 * l'édition du plan, on ne s'en va pas : il faut d'abord la terminer. */
function allerPage(id){
  if(editMode)return;
  if(Sim.onglets)Sim.onglets.choisir(id);
}
function allerPartie(p){
  if(editMode)return;
  if(p==='accueil'){showView('accueil');return;}
  if(Sim.onglets)Sim.onglets.ouvrir(p);
}
/* Le titre de la page : sa partie, et une phrase qui dit ce qu'on y voit. */
function afficherTitre(){
  const O=window.OrlyOnglets, id=document.body.dataset.sous, pg=O&&id?O.page(id):null;
  const partie=pg&&O.PARTIES.find(p=>p.id===pg.partie);
  document.getElementById('view-title').textContent=partie?partie.nom:'';
  const tuile=document.getElementById('view-ico');
  if(partie&&tuile&&window.OrlyIcones){tuile.innerHTML=OrlyIcones.ico(partie.ico);tuile.style.setProperty('--c',partie.couleur);}
  const intro=document.getElementById('view-intro');if(intro)intro.textContent=pg?pg.intro:'';
}
function initFlux(){
  Sim.flows=new OrlyFlows.FlowCenter({zones:()=>Sim.editor.state.zones.filter(z=>!z.retire).map(z=>({...z,nom:nomLisible(z.nom)})),legacy:FLUX.concat(FLUX_RETOUR),
    lecture:lectureDuGraphe,
    // Deux étapes faites à la chaîne par une même équipe : le diagramme les montre d'un bloc.
    chaines:()=>Sim.ateliers&&window.OrlyParcours?OrlyParcours.chaines(Sim.ateliers.state,null,null).map(g=>({id:g.id,avant:g.avant,service:g.service,equipes:g.equipes.map(a=>a.nom),commandes:g.commandes.length})):[],
    // Les liens ne servent au calcul que pour une commande sans chemin.
    liensUtiles:()=>sansChemin()>0,
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
    refresh(){suivreNomsServices();if(Sim.flows)Sim.flows.refresh();redessinerEdges();majPicker();if(Sim.ateliers)Sim.ateliers.rendre();
      if(Sim.reglages)Sim.reglages.rendre();majDemarrage();},
    pick(id){selectionner(id);},
    // Une zone de production supprimée ne laisse pas d'équipes orphelines : on
    // prévient, puis ses équipes et ses étapes de chemin passent dans son parent.
    avantSuppression(z,mode){
      const n=((Sim.ateliers&&Sim.ateliers.state.ateliers)||[]).filter(a=>a.service===z.id).length;
      const pere=z.kind==='annexe'&&ZONES[z.parent]&&!estRetire(z.parent)?z.parent:null;
      const dansChemins=((Sim.ateliers&&Sim.ateliers.state.parcours)||[]).some(p=>MoteurProduction.servicesDuParcours(p).includes(z.id));
      const verbe=mode==='retirer'?'Retirer « '+nomLisible(z.nom)+' » de l’unité':'Supprimer « '+nomLisible(z.nom)+' »';
      if(!n&&!dansChemins)return confirm(verbe+' ?');
      const nomPere=pere?nomLisible(ZONES[pere].nom):'';
      return confirm(verbe+' ? Il porte '+(n?n+(n>1?' équipes':' équipe')+(dansChemins?' et des étapes de chemins':''):'des étapes de chemins')+' : '
        +(pere?'elles passeront dans « '+nomPere+' ».':'elles seront retirées (Annuler, dans Organisation, les rétablit).'));
    },
    apresSuppression(z){reaffecterService(z.id,z.kind==='annexe'&&ZONES[z.parent]&&!estRetire(z.parent)?z.parent:null,z.nom);},
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

/* Les zones de production : des services à part entière. « Masquer » une zone
 * ne vaut que pour le dessin du plan — elle reste un service partout ailleurs,
 * sinon ses équipes tourneraient sans qu'aucune liste ne les montre. */
function annexes() {
  const e = Sim.editor; if (!e) return [];
  return e.state.zones.filter(z => z.kind === 'annexe');
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
  servicesDuPlan().forEach(id => {
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
    if (a.type === 'lavage' || a.type === 'dispo' || a.type === 'handling') e.sansLots = true;
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
        ? n + (n > 1 ? ' services' : ' service') + ' sans travail — voir Équipes'
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
    if(!equipes.length)html+='<p>Aucune équipe ici.</p><p class="row-btns"><button class="btn btn-play" data-svc-action="equipe" data-svc="'+escapeHTML(id)+'">+ Ajouter une équipe</button><button class="btn" data-mu-ouvrir="'+escapeHTML(id)+'">Le service →</button></p>';
    else html+='<p>'+equipes.map(a=>'<strong>'+escapeHTML(a.nom)+'</strong>'
      +(a.type==='dispo'?' · mise à disposition'+(+a.personnes>0?' · '+a.personnes+' pers.':''):a.type==='lavage'?' · plonge':a.type==='handling'?' · charge les vols':' · '+a.personnes+' pers.')).join('<br>')+'</p>';
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
      +'<button class="btn btn-play" data-page="mu-pas">Décrire votre unité →</button></div>';
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
  // « Comparer J+1 et planche retour » : ici, dans les réglages et sur la planche.
  document.addEventListener('click', e => { if (e.target.closest('[data-comparer-retours]')) comparerRetours(); });
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
function capturer(slot, silencieux) {
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
  if (silencieux) return;
  majCompare();
  toast('Scénario ' + slot + ' capturé');
}
/* J+1 contre planche retour, d'un geste (retour d'usage du 29/09) : la même
 * journée calculée deux fois, A avec les retours du lendemain, B avec la
 * planche. Le réglage choisi n'est pas touché : rien à annuler après. */
function comparerRetours() {
  const sa = Sim.ateliers; if (!sa) return;
  const m = sa.state.materiel;
  if (!(m.planche || []).length) { toast('La planche retour est vide : saisissez-la ou importez-la d’abord (Vols › Planche retour).'); allerPage('v-planche'); return; }
  try {
    for (const [slot, src] of [['A', 'j1'], ['B', 'planche']]) { sa.state.materiel = { ...m, retours: src }; sa.calculer(); capturer(slot, true); }
  } finally { sa.state.materiel = m; sa.calculer(); }
  majCompare();
  allerPage('j-comparer');
  toast(m.actif ? 'Essai A : retours J+1 · essai B : planche retour' : 'Essais retenus — cochez « Matériel en boucle » pour suivre ce que lave la plonge');
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
    // Les cases : une man-minute fixée dans une case prime, le récap le montre.
    ateliers:()=>(Sim.ateliers&&Sim.ateliers.state.ateliers)||[],
    // L'effectif d'une case, réglé depuis le récap des man-minutes.
    // L'effectif calculé d'une équipe (homme-minutes ÷ poste), ou null s'il se saisit.
    effectifCalcule:id=>{const at=Sim.ateliers;return at?at.effectifCalcule(at.state.ateliers.find(x=>x.id===id)):null;},
    personnes:(id,n)=>{const a=Sim.ateliers&&Sim.ateliers.state.ateliers.find(x=>x.id===id);if(!a)return false;
      return Sim.ateliers.changer(()=>{a.personnes=n;},'« '+a.nom+' » : '+n+(n>1?' personnes.':' personne.'));},
    // Le débit d'une commande sur un robot ; vide (null) : celui du robot.
    debitRobot:(id,cls,n)=>{const a=Sim.ateliers&&Sim.ateliers.state.ateliers.find(x=>x.id===id);if(!a)return false;
      return Sim.ateliers.changer(()=>{const d={...(a.debits||{})};if(n==null)delete d[cls];else d[cls]=n;if(Object.keys(d).length)a.debits=d;else delete a.debits;},
        '« '+a.nom+' » : '+MoteurProduction.libelleClasse(cls)+(n==null?' reprend le débit du robot.':' à '+n+' plateaux/h.'));},
    casesImportees:(par,debits)=>Sim.ateliers&&Sim.ateliers.changer(()=>{for(const a of Sim.ateliers.state.ateliers){
      if(par[a.id]!=null)a.personnes=par[a.id];
      if(debits[a.id]){a.debit=debits[a.id].debit;if(Object.keys(debits[a.id].debits).length)a.debits=debits[a.id].debits;else delete a.debits;}}},'Cases mises à jour d’après le fichier.'),
    histoireCases:refaire=>Sim.ateliers&&Sim.ateliers.histoire(refaire),
    // Les compagnies × classes du moment, et le parcours de chacune : c'est ce
    // que le classeur du barème propose de renseigner, service par service.
    classes:()=>Sim.ateliers?Sim.ateliers.classes:[],
    // Les services par compagnie (l'armement) : leurs cases « AF/@ARM », et leur réglage.
    parCompagnie:()=>Sim.ateliers?Object.keys(Sim.ateliers.state.categories||{}).flatMap(s=>Sim.ateliers.classesDe(s)||[]):[],
    categories:()=>(Sim.ateliers&&Sim.ateliers.state.categories)||{},
    minutesCompagnie:(service,cie,n)=>{const at=Sim.ateliers,k=at&&((at.state.categories||{})[service]||[])[0];if(!k)return false;
      return at.changer(()=>{const x=at.state.categories[service][0],m={...(x.minutes||{})},commun=m['*'];
        if(n==null||(commun!=null&&commun!==''&&+commun===n))delete m[cie];else m[cie]=n;x.minutes=m;},
        cie+' · '+k.nom+' : '+(n==null?'reprend la valeur de toutes les compagnies.':n+' min par vol.'));},
    routes:cls=>MoteurProduction.routesDesClasses(cls,Sim.ateliers?Sim.ateliers.state:{}),
    routesSignature:()=>{const e=(Sim.ateliers&&Sim.ateliers.state)||{};return JSON.stringify([e.parcours,e.parcoursCabine,e.parcoursClasse]);},
    // Un service dont toutes les équipes sont des plonges, des mises à
    // disposition ou des robots ne lit pas le barème : inutile de le proposer.
    sansBareme:()=>{
      const par=new Map();
      for(const a of ((Sim.ateliers&&Sim.ateliers.state.ateliers)||[]))
        par.set(a.service,(par.get(a.service)||false)||a.type==='manuel');
      // Un service par compagnie (l'armement) a ses minutes dans sa fiche, pas dans le barème.
      const parCompagnie=Object.keys((Sim.ateliers&&Sim.ateliers.state.categories)||{});
      return [...new Set([...par].filter(([,manuel])=>!manuel).map(([s])=>s).concat(parCompagnie))];
    },
    delaiChargement:()=>CFG.loadDelay,
    change:()=>{if(Sim.ateliers)Sim.ateliers.rendre();majDemarrage();if(Sim.vue)Sim.vue.recalculer();},
    notify:toast
  });
  // Les vols s'importent dans « Données › Vols » ; leurs horaires (décalage,
  // délai de chargement) se règlent dans « Simulation › Réglages de la simulation ».
  const volsDonnees=document.getElementById('vols-donnees');
  const horaires=document.getElementById('panneau-horaires');

  // Comparer deux essais : c'est un regard sur la journée, il en est un onglet.
  const comparer=document.getElementById('view-comparer');
  if(comparer)comparer.appendChild(bloc);
  // Le programme de vols rejoint « Données › Vols » ; la sauvegarde et les limites du
  // calcul, qui valent pour tout le travail, un onglet de « L'unité ».
  if(donnees){
    donnees.hidden=false;donnees.classList.remove('panel-content');donnees.classList.add('reglages-grille');
    const programme=donnees.querySelector('.panneau');
    if(volsDonnees&&programme)volsDonnees.appendChild(programme);
    donnees.dataset.sous='u-sauvegarde';
    const unite=document.getElementById('view-flux');
    if(unite)unite.appendChild(donnees);
  }
  // Les horaires des vols (délai de chargement, décalage) sont un réglage de la
  // simulation : ils rejoignent « Simulation › Réglages de la simulation ».
  const simHoraires=document.getElementById('rg-sim-horaires');
  if(simHoraires&&horaires)simHoraires.appendChild(horaires);
  // La version servie aide à diagnostiquer un cache périmé : elle n'a rien à
  // faire au milieu des réglages, elle rejoint les limites du calcul.
  const version=document.getElementById('rg-version'),limites=document.getElementById('model-limits');
  if(version&&limites){delete version.dataset.sous;limites.appendChild(version);}
}
function showView(name) {
  if(editMode && name!=='plan')return;
  activeView=name;
  document.body.dataset.vue=name;
  const accueil=document.getElementById('view-accueil');
  if(accueil)accueil.hidden=name!=='accueil';
  if(name==='accueil'){pause();window.scrollTo(0,0);}
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
  // La vue est affichée, son onglet connu : on dessine ce qu'il montre, et la
  // fenêtre d'une case peut mesurer où se caler.
  if(name==='ateliers'&&Sim.ateliers){Sim.ateliers.surOnglet(document.body.dataset.sous);Sim.ateliers.parcours.placeTiroir();}
}
function updateSource() {
  majDemarrage();
  // Le jeu de démonstration dit quelles compagnies ont reçu des vols d'essai.
  const essai=[...new Set(flights.filter(f=>f.essai).map(f=>f.cie))];
  document.getElementById('source-label').textContent=dataSource+(essai.length?' + vols d’essai : '+essai.join(', '):'');
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
  // Pendant l'édition du plan, le menu attend : on termine d'abord l'édition.
  document.querySelectorAll('[data-vers-partie],#menu [data-page],#btn-sauvegarde').forEach(b => b.disabled = editMode);
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
  // Avec un handling, un vol est prêt quand il est CHARGÉ, et il doit l'être
  // à son départ ; ses classes, elles, devaient être au handling avant.
  const charges = new Map((r.vols || []).map(v => [v.id, v]));
  for (const d of out.values()) {
    const fins = d.classes.map(c => c.etat.fin);
    d.fin = fins.every(f => f != null) ? Math.max(...fins) : null;
    const h = charges.get(d.id);
    if (h) {
      d.handling = h; d.complet = d.fin;
      d.fin = h.fin; d.echeance = d.depart;
      d.dernier = h.fin == null ? d.classes.find(c => c.etat.fin == null) || null : d.classes.find(c => c.etat.fin === d.complet) || null;
      d.retard = h.fin == null ? null : Math.max(0, Math.round(h.fin - d.depart));
      continue;
    }
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
      + (d.fin != null && d.fin <= t ? '<small>' + (d.handling ? 'chargé à ' : 'prêt à ') + hh(d.fin)
          + (d.retard ? ' · +' + d.retard + ' min' : '')
          + (d.handling && d.handling.chauffeurs ? ' · ' + d.handling.chauffeurs + (d.handling.chauffeurs > 1 ? ' chauffeurs' : ' chauffeur')
            + (d.handling.attenteChauffeurs >= 1 ? ' (attendus ' + Math.round(d.handling.attenteChauffeurs) + ' min)' : '') : '') + '</small>'
        : d.handling && d.handling.etat === 'chauffeurs' ? '<small>pas assez de chauffeurs (' + d.handling.chauffeurs + ' pour un ' + (d.handling.categorie === 'long' ? 'long' : 'court') + ' courrier)</small>'
        : d.handling && d.handling.etat === 'bloque' ? '<small>le handling attend ' + escapeHTML((d.handling.attendu || []).map(x => MoteurProduction.libelleClasse(x.classe)).join(', ') || 'un vol précédent') + '</small>'
        : d.handling && d.handling.etat === 'poste' ? '<small>poste du handling fini</small>' : '')
      + '</td><td><div class="vol-repas">' + d.classes.map(pastille).join('') + '</div></td></tr>';
  }).join('') || '<tr><td colspan="5" class="empty-state">Aucun départ ne correspond à ces filtres.</td></tr>';
  renderFriseVols(departsSuivis(), etatDe, mot, icoEtat);
  renderHandlingVols();

  const body = document.getElementById('flight-rows');
  if (body.innerHTML !== html) body.innerHTML = html;
}

/* Le Robot (28/09) : un service à part, rattaché au Montage, qui remplace le
 * Montage sur le chemin de TX, CRL et FBU Économie. Fait une fois : l'état
 * des cases le retient (« robot-eco »), et « Annuler » le défait. */
const ROBOT_ECO=['TX/YC','CRL/YC','FBU/YC'];
function migrerRobot(){
  const at=Sim.ateliers;if(!at||!Sim.editor)return;
  if((at.state.migrations||[]).includes('robot-eco'))return;
  const presentes=ROBOT_ECO.filter(c=>at.classes.some(k=>k.id===c));
  // Seulement une organisation décrite : l'une de ces commandes a déjà son
  // chemin, par le Montage. Sinon (première visite, chiffres d'exemple), rien.
  const decrite=presentes.some(c=>{const p=OrlyParcours.cheminDe(at.state,c);return p&&MoteurProduction.servicesDuParcours(p).includes('prepa');});
  if(!decrite)return;
  let z=Sim.editor.state.zones.find(v=>!v.retire&&/^robot$/i.test(nomLisible(v.nom).trim()));
  if(!z){const id=Sim.editor.nouveauService('Robot','prepa');z=Sim.editor.state.zones.find(v=>v.id===id);}
  if(!z)return;
  let faites=[];
  at.changer(()=>{faites=OrlyParcours.remplacerEtape(at.state,'prepa',z.id,presentes,at.classes,nomLisible(z.nom),nomDeService);
    at.state.migrations=[...(at.state.migrations||[]),'robot-eco'];},'');
  if(faites.length)at.rendre('Robot : il remplace le Montage sur le chemin de '+faites.map(MoteurProduction.libelleClasse).join(', ')
    +'. Une seule case Robot les prépare, à régler (débit par commande, personnes) dans Équipes › Services et équipes ou dans le tableau des minutes. « Annuler » revient en arrière.');
}


/* LE JEU D'ESSAI SUIT L'UNITÉ (retour d'usage du 02/10 : « supprime QR et DL
 * de la simulation et rajoute des vols des compagnies que j'utilise pour la
 * prépa »). Tant que le programme est celui de démonstration, chaque compagnie
 * que vos équipes préparent ou que vous avez ajoutée, sans départ, y reçoit
 * des vols d'essai (OrlyDemo.completer) ; il se relit quand cette liste change.
 * Un programme importé n'est jamais complété. */
let cleDemo='';
function suivreDemo(){
  if(dataSource!=='Jeu de démonstration'||!Sim.ateliers)return false;
  const data=OrlyDemo.completer(SAMPLE,OrlyDemo.compagniesUtilisees(Sim.ateliers.state));
  const cle=data.map(v=>v.id).join(',');
  if(cle===cleDemo)return false;
  cleDemo=cle;Sim.dataCourante=data;chargerVols(data);
  return true;
}

/* QR et DL sortent de la simulation (même retour d'usage) : leurs cases
 * cochées, leurs chemins à elles, leurs réglages s'en vont, une fois. */
function migrerSansQrDl(){
  const at=Sim.ateliers;if(!at||(at.state.migrations||[]).includes('sans-qr-dl'))return;
  const sort=x=>/^(QR|DL)$/i.test(String(x).trim());
  const deCie=id=>sort(String(id).slice(0,String(id).lastIndexOf('/')));
  let n=0;
  at.changer(()=>{
    const st=at.state,avant=JSON.stringify(st);
    for(const a of st.ateliers){
      if(Array.isArray(a.lots))a.lots=a.lots.map(l=>[].concat(l).filter(id=>!deCie(id))).filter(l=>l.length);
      if(Array.isArray(a.compagnies))a.compagnies=a.compagnies.filter(c=>!sort(c));
      if(a.durees)for(const k of Object.keys(a.durees))if(sort(k))delete a.durees[k];
    }
    st.exclues=(st.exclues||[]).filter(id=>!deCie(id));
    st.ajoutees=(st.ajoutees||[]).filter(c=>!sort(c.cie));
    const pc=st.parcoursClasse||{},orphelins=new Set();
    for(const k of Object.keys(pc))if(deCie(k)){orphelins.add(pc[k]);delete pc[k];}
    // Le chemin à elle d'une commande retirée part avec elle (pas un flux partagé).
    st.parcours=(st.parcours||[]).filter(p=>!(orphelins.has(p.id)&&!p.type&&!Object.values(pc).includes(p.id)));
    for(const l of Object.values(st.categories||{}))for(const k of l)for(const c of Object.keys(k.minutes||{}))if(sort(c))delete k.minutes[c];
    n=avant!==JSON.stringify(st);
    st.migrations=[...(st.migrations||[]),'sans-qr-dl'];
  },'');
  if(n)at.rendre('QR et DL retirées de la simulation : leurs cases cochées et leurs réglages sont partis. « Annuler » revient en arrière.');
}

/* L'armement (retour d'usage du 02/10 : « intègre pour moi l'armement sur tous
 * les chemins et lie-le uniquement au handling » ; puis « le handling est le
 * handling, CF food c'est juste une zone tampon »). Fait une fois, dès qu'un
 * handling existe : chaque service « Armement » travaille par compagnie (ses
 * cases par classe deviennent des cases par compagnie), et il entre dans tous
 * les chemins en branche à part, avec une seule flèche, vers le handling.
 * L'état le retient (« armement-handling ») ; « Annuler » le défait. */
/* CF départ food n'est pas le handling (retour d'usage du 05/10). La zone
 * « handling » du plan s'appelle CF DÉPART FOOD : des checkeurs y vérifient les
 * trolleys, à heures fixes, avant que le handling les charge. Un handling rangé
 * là passe dans son service à lui (« Handling »), avec ses réglages et sa place
 * dans chaque chemin ; CF départ food redevient un service avec ses équipes. */
function migrerCfDepart(){
  const at=Sim.ateliers;if(!at)return;
  const zone=(Sim.editor&&Sim.editor.state.zones||[]).find(z=>z.id==='handling');
  if(!zone||/handling|chargement/i.test(zone.nom||''))return;      // la zone EST le handling : rien à séparer
  if(!at.state.ateliers.some(a=>a.service==='handling'&&a.type==='handling'))return;
  const autre=servicesDisponibles().find(s=>s.id!=='handling'&&/handling|chargement/i.test(s.nom));
  const vers=autre?autre.id:Sim.editor.nouveauService('Handling','handling',false);
  if(!vers)return;
  let n=0;
  at.changer(()=>{n=OrlyParcours.separerHandling(at.state,'handling',vers);},'');
  if(n)at.rendre('Le handling a maintenant son service à lui : CF départ food est le service des checkeurs (ajoutez-y leurs équipes). « Annuler » revient en arrière.');
}
function migrerArmement(){
  const at=Sim.ateliers;if(!at)return;
  const faites=at.state.migrations||[];
  if(faites.includes('armement-handling')&&faites.includes('handling-seul'))return;
  const handlings=[...new Set(at.state.ateliers.filter(a=>a.type==='handling').map(a=>a.service))];
  if(!handlings.length)return;                       // rien à quoi le relier : on attend un handling
  const armements=servicesDisponibles().filter(s=>/armement/i.test(s.nom)&&!handlings.includes(s.id));
  if(!armements.length)return;
  // Déjà intégré par la première version, qui reliait aussi le handling à la fin
  // des chemins des repas (CF food → handling) : on retire ces flèches.
  if(faites.includes('armement-handling')){
    let n=0;
    at.changer(()=>{n=OrlyParcours.delierHandling(at.state,armements.map(s=>s.id),handlings);
      at.state.migrations=[...(at.state.migrations||[]),'handling-seul'];},'');
    if(n)at.rendre('Handling : '+n+(n>1?' flèches retirées':' flèche retirée')+' depuis les étapes des repas (CF food…) ; il n’est relié qu’à l’armement. « Annuler » revient en arrière.');
    return;
  }
  let n=0;
  at.changer(()=>{
    const st=at.state;st.categories=st.categories||{};
    for(const s of armements){
      if(!(st.categories[s.id]||[]).length)st.categories[s.id]=[{id:OrlyEchanges.codeService(s.nom,st),nom:s.nom,minutes:{}}];
      for(const a of st.ateliers)if(a.service===s.id&&a.type!=='manuel')at.typer(a,'manuel');
      OrlyParcours.versParCompagnie(st,s.id,st.categories[s.id][0].id);
    }
    n=OrlyParcours.integrerArmement(st,armements.map(s=>s.id),handlings);
    st.migrations=[...(st.migrations||[]),'armement-handling','handling-seul'];
  },'');
  at.rendre(armements.map(s=>s.nom).join(', ')+' : intégré à '+n+(n>1?' chemins':' chemin')+', en branche à part, relié seulement au handling ; une case par compagnie. « Annuler » revient en arrière.');
}

/* Le handling, là où l'on regarde les vols : s'il n'y en a pas, un vol est
 * « prêt » quand ses commandes le sont ; le mettre en place se fait d'un geste. */
function renderHandlingVols() {
  const box = document.getElementById('vols-handling'); if (!box) return;
  const at = Sim.ateliers; if (!at) { box.innerHTML = ''; return; }
  const h = at.state.ateliers.filter(a => a.type === 'handling');
  const r = at.resultat || {}, k = r.indicateurs || {};
  const vieilles = at.anciensHandlings();
  let html;
  if (vieilles.length) {
    // Des cases de handling d'avant : une par commande, qui préparent comme un
    // service. Elles se convertissent en une seule case qui charge les vols.
    html = '<p><b>Vos chemins passent déjà par le handling, mais avec l’ancienne logique</b> : '
      + vieilles.length + (vieilles.length > 1 ? ' cases le préparent' : ' case le prépare') + ' commande par commande ('
      + escapeHTML(vieilles.slice(0, 3).map(a => a.nom).join(', ')) + (vieilles.length > 3 ? '…' : '') + '). '
      + 'Le handling travaille par vol : ' + (vieilles.length > 1 ? 'elles deviennent' : 'elle devient') + ' une seule case Handling, '
      + 'qui réunit les classes de chaque vol et le charge, le jour J. Vos chemins ne changent pas.</p>'
      + '<p class="row-btns"><button class="btn btn-play" type="button" data-vh-action="brancher">Passer au handling par vol</button>'
      + '<span class="mini-note">Leurs man-minutes ne servent plus : le handling a une durée par vol et par compagnie. Annuler (Organisation) revient en arrière.</span></p>';
  } else if (!h.length) {
    html = '<p><b>Pas de handling pour l’instant.</b> Un vol est donc « prêt » dès que ses commandes le sont. '
      + 'Le handling réunit les classes d’un même vol et le charge, dans l’ordre des départs, le jour J : '
      + 'le vol doit être chargé à son départ.</p>'
      + '<p class="row-btns"><button class="btn btn-play" type="button" data-vh-action="brancher">Mettre en place le handling</button>'
      + '<span class="mini-note">Crée la case Handling et l’ajoute au bout de chaque chemin. « Annuler » (en haut de page) le retire.</span></p>';
  } else {
    const a = h[0], vus = (r.vols || []).length;
    const sans = (at.state.parcours || []).filter(p => Array.isArray(p.noeuds) && !p.noeuds.includes(a.service)).length;
    html = '<p><b>Handling : « ' + escapeHTML(a.nom) + ' »</b> — ' + (h.length > 1 ? h.length + ' cases · ' : '')
      + 'arrive à ' + escapeHTML(a.debut) + ' (jour J), ' + a.simultanes + (a.simultanes > 1 ? ' vols' : ' vol') + ' à la fois, '
      + 'pas avant ' + String(Math.round((a.avance ?? 180) / 6) / 10).replace('.', ',') + ' h avant le départ. '
      + (vus ? '<b>' + (k.volsAHeure || 0) + ' vol' + (k.volsAHeure > 1 ? 's' : '') + ' chargé' + (k.volsAHeure > 1 ? 's' : '') + ' à l’heure sur ' + vus + '</b>'
        + (vus - (k.volsCharges || 0) ? ', ' + (vus - k.volsCharges) + ' non chargé' + (vus - k.volsCharges > 1 ? 's' : '') : '') + '.' : 'Aucun vol suivi.')
      + '</p><p class="row-btns"><button class="btn btn-sm" type="button" data-vh-action="regler" data-vh-atelier="' + escapeHTML(a.id) + '">Régler le handling →</button>'
      + (sans ? '<button class="btn btn-sm" type="button" data-vh-action="brancher">L’ajouter aux ' + sans + ' chemin' + (sans > 1 ? 's' : '') + ' qui n’y passent pas</button>' : '')
      + '</p>';
  }
  if (box.innerHTML !== html) box.innerHTML = html;
}
function initHandlingVols() {
  const box = document.getElementById('vols-handling'); if (!box) return;
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-vh-action]'); if (!b) return;
    if (b.dataset.vhAction === 'brancher') {
      const r = Sim.ateliers.brancherHandling();
      if (r) toast(r.converties ? r.converties + (r.converties > 1 ? ' anciennes cases deviennent' : ' ancienne case devient') + ' une case Handling par vol'
          + (r.chemins ? ', ajoutée à ' + r.chemins + (r.chemins > 1 ? ' autres chemins.' : ' autre chemin.') : '.')
        : (r.cree ? 'Case Handling créée' : 'Handling') + ' ajouté' + (r.chemins ? ' à ' + r.chemins + (r.chemins > 1 ? ' chemins.' : ' chemin.') : '.'));
      renderFlights();
    } else if (b.dataset.vhAction === 'regler') {
      Sim.ateliers.ouvert = b.dataset.vhAtelier;
      allerPage('at-equipes');
      Sim.ateliers.rendre();
    }
  });
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
  const heures = []; if (Number.isFinite(t0) && Number.isFinite(t1)) for (let h = t0; h <= t1 && heures.length < 400; h += 60) heures.push(h);
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
  document.getElementById('edit-done').addEventListener('click',()=>{if(editMode)basculerEdition();document.getElementById('btn-edit').focus();});
  const picker=document.getElementById('zone-picker');
  majPicker();
  picker.addEventListener('change',()=>{const id=picker.value;selection=null;selectionner(id||null);});
  document.getElementById('goulot-info').addEventListener('click',e=>{if(e.target.closest('[data-clear-selection]'))selectionner(selection);});
  // Un bouton « aller à l'étape… » posé n'importe où dans la page.
  document.addEventListener('click',e=>{const b=e.target.closest('[data-aller]');if(!b||editMode)return;
    if(b.dataset.onglet&&Sim.onglets)Sim.onglets.choisir(b.dataset.onglet);else showView(b.dataset.aller);});
  // Le menu : une page ([data-page]) ou une partie ([data-vers-partie]), depuis
  // l'en-tête, l'accueil ou n'importe quel lien de la page.
  document.addEventListener('click',e=>{
    const pg=e.target.closest('[data-page]');
    if(pg&&!pg.disabled){allerPage(pg.dataset.page);return;}
    const pa=e.target.closest('[data-vers-partie]');
    if(pa&&!pa.disabled)allerPartie(pa.dataset.versPartie);
  });
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
    dataSource='Jeu de démonstration';cleDemo='';suivreDemo();snaps={};majCompare();reset(Sim.dataCourante);updateSource();
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
/* Un démarrage qui ne va pas au bout (des données enregistrées que le calcul
 * ne sait pas relire, une boucle sans fin) laisse sa marque : au chargement
 * suivant, on propose la page de secours au lieu de se figer encore. Chaque
 * étape est isolée : une erreur dans l'une n'empêche plus les autres, ni la
 * navigation (retour d'usage : « ça bug encore, je ne peux pas naviguer »). */
const CLE_DEMARRAGE='ory-demarrage-en-cours';
const lireCle=k=>{try{return localStorage.getItem(k);}catch(e){return null;}};
const continuer=/[?&]continuer=1/.test(location.search);
if(lireCle(CLE_DEMARRAGE)==='1'&&!continuer){location.replace('secours.html?bloque=1');return;}
try{localStorage.setItem(CLE_DEMARRAGE,'1');}catch(e){/* stockage indisponible */}
const pannes=[];
const etape=(nom,fn)=>{try{fn();}catch(e){pannes.push(nom+' : '+(e&&e.message||e));console.error('Démarrage — '+nom,e);}};
etape('plan',()=>{chargerZones();construirePlan();});
etape('vols',()=>chargerVols(SAMPLE));
etape('contrôles',initControles); etape('édition du plan',initEdition); etape('liens',initFlux);
etape('cases et chemins',initAteliers); etape('réglages',initWorkbench); etape('services',initServices);
etape('handling',initHandlingVols); etape('CF départ food',migrerCfDepart); etape('robot',migrerRobot); etape('armement',migrerArmement);
etape('vols d’essai',()=>{migrerSansQrDl();if(suivreDemo())Sim.ateliers.rendre();});
etape('planche retour',()=>{initPlanche();renderPlanche();});
etape('mon unité',initUnite);
// Les retours et le matériel se règlent dans les Réglages : leur panneau existe maintenant.
etape('réglages de la simulation',()=>{if(Sim.ateliers)Sim.ateliers.rendreMateriel(Sim.ateliers.resultat);});
// Le fil de mise en route vient en dernier : il relit les autres, il ne peut
// donc se dresser qu'une fois qu'ils sont là.
etape('simulation',initVueSimulation);
etape('menu',initOnglets);
etape('accueil',initDemarrage);
etape('affichage',()=>{majHorloge();majPlan();majDashboard();majStocks();});
// Le démarrage est allé au bout : la marque s'efface.
try{localStorage.removeItem(CLE_DEMARRAGE);}catch(e){/* rien */}
if(pannes.length){
  const b=document.createElement('div');b.className='panne-demarrage';b.setAttribute('role','alert');
  b.innerHTML='<b>Une partie du site n’a pas pu se charger</b> ('+escapeHTML(pannes.join(' ; '))+'). Le reste fonctionne. '
    +'<a href="secours.html">Page de secours : récupérer vos données, repartir sans elles</a>';
  document.body.prepend(b);
}


/* La version servie, dans l'en-tête, sur toutes les pages (retour d'usage du
 * 02/10 : « je ne vois pas la version » — elle n'était qu'en bas de Réglages ›
 * Simulation). C'est elle qu'on compare pour savoir si le navigateur sert la
 * dernière mise en ligne. */
(function versionVisible(){
  const v=document.querySelector('meta[name="ory-version"]'),t=document.querySelector('header .marque-txt');
  if(!t||!v||!/^[0-9a-f]{4,}$/.test(v.content)||t.querySelector('.marque-version'))return;
  const e=document.createElement('span');e.className='marque-version';e.textContent='version '+v.content;
  e.title='La version servie par le site : si elle ne change pas après une mise en ligne, rechargez la page (Ctrl+F5).';
  t.appendChild(e);
})();
})();

/* Éditeur du plan : annotations indépendantes du moteur, historique transactionnel. */
(function(root){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
const COLORS={service:'#0b6fa4',annexe:'#0e8aa8',room:'#087f75',cold:'#3178c6',equipment:'#9659b5',path:'#bd7621'};
// Une annexe est une seconde salle d'un atelier du moteur : Armement 2 fait le
// même travail qu'Armement. Elle a son espace et ses gens, pas sa propre file.
const TYPES={service:'Service du plan',annexe:'Zone de production (annexe)',room:'Local / zone',cold:'Chambre froide',equipment:'Équipement',path:'Circulation'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/* La couleur retenue par l'utilisateur, ou null si c'est celle du type. */
function couleurVoulue(z){
 const def=COLORS[z.kind];
 return z.color&&def&&z.color.toLowerCase()!==def.toLowerCase()?z.color:null;
}
function bounds(z){if(!z.pts)return {x:z.x,y:z.y,w:z.w,h:z.h};const xs=z.pts.map(p=>p[0]),ys=z.pts.map(p=>p[1]);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};}
function resize(z,b){const old=bounds(z);if(z.pts)z.pts=z.pts.map(p=>[b.x+(p[0]-old.x)*b.w/old.w,b.y+(p[1]-old.y)*b.h/old.h]);Object.assign(z,b);}
function area(pts){return Math.abs(pts.reduce((a,p,i)=>{const n=pts[(i+1)%pts.length];return a+p[0]*n[1]-n[0]*p[1];},0))/2;}
// Les anciens identifiants suivent l'ordre historique du tableau STORAGES.
const OLD_STORAGE_IDS=new Set([0,1,2,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,24,25].map(i=>'storage-'+i));
function validStorages(list=[]){
 if(!Array.isArray(list)||list.length>200)throw new Error('Maximum 200 stockages par service.');
 const ids=new Set();return list.map(s=>{
  if(!s||typeof s.id!=='string'||!s.id||s.id.length>160||ids.has(s.id)||typeof s.nom!=='string'||!s.nom.trim()||s.nom.length>120||typeof s.contenu!=='string'||s.contenu.length>1000)throw new Error('Stockage invalide : identifiant unique, nom et description attendus.');
  ids.add(s.id);return {id:s.id,nom:s.nom.trim(),contenu:s.contenu};
 });
}
function validZone(z){
 if(!z||typeof z!=='object'||typeof z.id!=='string'||!z.id||typeof z.nom!=='string'||!z.nom.trim()||z.nom.length>120)throw new Error('Chaque zone doit avoir un identifiant et un nom (120 caractères maximum).');
 if(!Object.hasOwn(TYPES,z.kind))throw new Error('Type de zone inconnu.');
 if(!['x','y','w','h'].every(k=>typeof z[k]==='number'&&Number.isFinite(z[k])&&Math.abs(z[k])<1e7)||z.w<=0||z.h<=0)throw new Error('Dimensions invalides pour '+z.nom+'.');
 if(z.pts!==undefined){if(!Array.isArray(z.pts)||z.pts.length<3||z.pts.length>500||!z.pts.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<1e7))||area(z.pts)<1)throw new Error('Polygone invalide pour '+z.nom+'.');Object.assign(z,bounds(z));}
 if(z.color!==undefined&&!/^#[0-9a-f]{6}$/i.test(z.color))throw new Error('Couleur invalide.');
 if(z.kind==='annexe'&&(typeof z.parent!=='string'||!z.parent.trim()||z.parent.length>160))throw new Error('L’annexe '+z.nom+' doit indiquer l’atelier dont elle dépend.');
 return{id:z.id,nom:z.nom.trim(),kind:z.kind,...(z.kind==='service'?{storages:validStorages(z.storages)}:{}),...(z.kind==='annexe'?{parent:z.parent.trim()}:{}),...bounds(z),...(z.pts?{pts:clone(z.pts)}:{}),color:z.color||COLORS[z.kind],locked:z.locked===true,visible:z.visible!==false,approx:z.approx===true};
}
function validatePlan(raw,originals){
 const base=clone(originals);let zones,opacity=.85,pending=[];
 if(raw?.schema==='ory-plan'){
  if(![2,3].includes(raw.version)||!Array.isArray(raw.zones))throw new Error('Version de plan non prise en charge.');
  zones=raw.zones;pending=validStorages(raw.unassignedStorages);opacity=raw.backgroundOpacity??.85;
 }else{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Fichier de plan ou ancien export de zones attendu.');
  const ids=Object.keys(raw).filter(id=>base.some(z=>z.id===id));if(!ids.length)throw new Error('Aucune zone reconnue dans ce fichier.');
  zones=base.map(z=>{const v=raw[z.id];return v?{...z,...v,id:z.id,kind:'service'}:z;});
 }
 if(!zones.length||zones.length>500||typeof opacity!=='number'||!Number.isFinite(opacity)||opacity<0||opacity>1)throw new Error('Plan invalide (maximum 500 zones).');
 const ids=new Set();zones=zones.map(z=>{const v=validZone(z);if(ids.has(v.id))throw new Error('Identifiant de zone en double.');ids.add(v.id);const builtin=base.some(b=>b.id===v.id);if((v.kind==='service')!==builtin)throw new Error('Les ateliers du moteur ne peuvent pas être ajoutés ou convertis par import.');if(v.kind==='annexe'&&!base.some(b=>b.id===v.parent))throw new Error('L’annexe '+v.nom+' dépend d’un atelier inconnu : '+v.parent+'.');return v;});
 // Un plan enregistré avant l'arrivée d'un nouveau service (la prépa) ne le
 // connaît pas : on le complète à sa place par défaut, au lieu de refuser tout
 // le tracé. (Un service ne peut pas être supprimé depuis l'éditeur.)
 for(const b of base)if(!ids.has(b.id)){ids.add(b.id);zones.push(validZone(clone(b)));}
 zones=zones.filter(z=>{if(z.kind!=='service'&&(z.kind==='cold'||OLD_STORAGE_IDS.has(z.id))){pending.push({id:z.id,nom:z.nom,contenu:''});return false;}return true;});
 return {schema:'ory-plan',version:3,zones,unassignedStorages:validStorages(pending),backgroundOpacity:opacity};
}
class PlanEditor{
 constructor(adapter){
  this.a=adapter;this.svg=adapter.svg;this.active=false;this.tool='select';this.selected=null;this.vertex=null;this.undoStack=[];this.redoStack=[];this.snap=true;this.grid=false;this.space=false;this.points=[];this.gesture=null;this.redraw=false;
  this.originals=Object.entries(adapter.zones).map(([id,z])=>validZone({id,nom:z.nom,kind:'service',...bounds(z),...(z.pts?{pts:z.pts}:{}),approx:!!z.approx}));
  const annotations=(adapter.storages||[]).map((s,i)=>({s,i})).filter(({i})=>!OLD_STORAGE_IDS.has('storage-'+i)).map(({s,i})=>validZone({id:'storage-'+i,nom:s.l,kind:['cf','gel'].includes(s.cat)?'cold':'room',x:s.x,y:s.y,w:s.w,h:s.h,approx:true}));
  this.state={schema:'ory-plan',version:3,zones:clone(this.originals).concat(annotations),unassignedStorages:[],backgroundOpacity:.85};
  this.layer=this.el('g',{id:'editor-layer'});adapter.viewport.appendChild(this.layer);
  let warning='';try{const saved=localStorage.getItem('orly-plan-v3')||localStorage.getItem('orly-plan-v2');if(saved)this.state=validatePlan(JSON.parse(saved),this.originals);}catch(e){warning='Plan enregistré non chargé : '+e.message+' Le contenu reste conservé dans le navigateur.';}
  this.buildUI();this.bindStoragePanel(document.getElementById('pe-storages'));this.bindStoragePanel(document.getElementById('service-storages'));this.bind();this.sync();this.render();this.status(warning||'Plan prêt. Les anciennes positions sont conservées.');
 }
 el(tag,attrs={}){const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);return e;}
 get zone(){return this.state.zones.find(z=>z.id===this.selected);}
 scale(){const m=this.layer.getScreenCTM();return m?Math.hypot(m.a,m.b):1;}
 point(e){const p=this.svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const m=this.layer.getScreenCTM();return p.matrixTransform(m.inverse());}
 status(text){document.getElementById('pe-status').textContent=text;}
 setActive(active){
  this.cancel();this.active=active;this.tool='select';this.space=false;document.body.classList.toggle('plan-editing',active);document.getElementById('plan-editor-toolbar').hidden=!active;
  document.getElementById('panneau-edition').hidden=!active;this.render();this.status(active?'Choisissez une zone, ou dessinez-en une nouvelle : un local, ou une zone de production rattachée à un atelier.':'Plan enregistré dans ce navigateur.');
 }
 buildUI(){
  const panel=document.getElementById('panneau-edition');panel.innerHTML=`
   <div class="pe-heading"><div><span class="eyebrow">ÉDITEUR DU PLAN</span><h2>Construire l’unité</h2></div><button class="btn" id="edit-done">Terminer</button></div>
   <div id="pe-status" role="status" aria-live="polite"></div>
   <div class="pe-section"><div class="pe-section-title"><h3>Zones & locaux <span id="pe-count"></span></h3><button class="text-button" id="pe-focus">Centrer la sélection</button></div><label class="sr-only" for="pe-search">Rechercher une zone</label><input type="search" id="pe-search" placeholder="Rechercher une zone…"><div id="pe-list" aria-label="Liste des zones"></div></div>
   <div class="pe-section" id="pe-properties" hidden><h3>Zone sélectionnée</h3><label>Nom<input id="pe-name" maxlength="120" type="text"></label><div class="pe-two"><label>Type<select id="pe-kind"><option value="service">Service du plan</option><option value="annexe">Zone de production (annexe)</option><option value="room">Local / zone</option><option value="equipment">Équipement</option><option value="path">Circulation</option></select></label><label>Couleur<input type="color" id="pe-color"><button class="text-button" id="pe-color-reset" type="button">Couleur du type</button></label></div>
   <label id="pe-parent-champ" hidden>Atelier dont elle dépend<select id="pe-parent"></select></label>
   <p id="pe-kind-note" class="mini-note"></p><div class="pe-two pe-dimensions">${[['x','X'],['y','Y'],['w','Largeur'],['h','Hauteur']].map(([k,label])=>`<label>${label}<input id="pe-${k}" type="number" step="1" ${k==='w'||k==='h'?'min="1"':''}></label>`).join('')}</div><p class="mini-note">Coordonnées du dessin, pas des mètres.</p>
   <label class="chk"><input id="pe-locked" type="checkbox">Verrouiller la géométrie</label><label class="chk"><input id="pe-confirmed" type="checkbox">Emplacement confirmé sur le terrain</label>
   <div class="pe-actions"><button class="btn" id="pe-duplicate">Dupliquer</button><button class="btn" id="pe-delete">Supprimer</button><button class="btn" id="pe-redraw">Redessiner le contour</button><button class="btn" id="pe-convert">Convertir en polygone</button><button class="btn" id="pe-delete-vertex">Supprimer le sommet</button></div></div>
   <section id="pe-storages" class="pe-section"></section><details class="pe-section"><summary>Fond & aide au placement</summary><label>Opacité du plan d’origine<input id="pe-opacity" type="range" min="0" max="100" value="85"></label><label class="chk"><input id="pe-snap" type="checkbox" checked>Aimanter aux bords et sommets proches</label><label class="chk"><input id="pe-grid" type="checkbox">Grille de 20 unités du dessin</label><p class="mini-note">Alt suspend l’aimantation. Maj contraint le rectangle au carré et les segments à l’horizontale/verticale.</p></details>
   <details class="pe-section"><summary>Enregistrer & partager</summary><p class="mini-note">Sauvegarde locale automatique. Exportez un fichier pour le conserver ou l’ouvrir sur un autre poste. Les locaux ajoutés sont des annotations, sans charge simulée.</p><div class="pe-actions"><button class="btn" id="pe-export">Exporter le plan</button><button class="btn" id="pe-import-button">Importer un plan</button><input type="file" id="pe-import" accept=".json" hidden><button class="btn" id="pe-backup">Restaurer la sauvegarde précédente</button></div></details>
   <details class="pe-section"><summary>Raccourcis clavier</summary><p class="mini-note">V : sélectionner · R : rectangle · P : polygone · H ou Espace : déplacer la vue · Ctrl/Cmd Z : annuler · Ctrl/Cmd Maj Z : rétablir · Ctrl/Cmd D : dupliquer · flèches : déplacer de 1 unité (Maj : 10) · Suppr : supprimer · Entrée : fermer le polygone · Échap : annuler le geste.</p></details>`;
  const bar=document.createElement('div');bar.id='plan-editor-toolbar';bar.hidden=true;bar.innerHTML=`<div class="pe-tools" role="group" aria-label="Outils de dessin">${[['select','Sélection','V'],['rect','Rectangle','R'],['poly','Polygone','P'],['hand','Main','H']].map(([tool,label,key])=>`<button class="btn" data-pe-tool="${tool}" aria-pressed="false" title="${label} (${key})">${label}<kbd>${key}</kbd></button>`).join('')}</div><div class="pe-tools"><button class="btn" id="pe-undo" title="Annuler (Ctrl Z)">↶ Annuler</button><button class="btn" id="pe-redo" title="Rétablir (Ctrl Maj Z)">↷ Rétablir</button><button class="btn" id="pe-finish" hidden>Fermer le polygone</button><button class="btn" id="pe-cancel" hidden>Annuler le tracé</button></div><span id="pe-tool-help"></span>`;
  document.querySelector('.plan-tete').after(bar);
 }
 bind(){
  const on=(id,event,fn)=>document.getElementById(id).addEventListener(event,fn);
  document.querySelectorAll('[data-pe-tool]').forEach(b=>b.addEventListener('click',()=>this.setTool(b.dataset.peTool)));
  on('pe-undo','click',()=>this.undo());on('pe-redo','click',()=>this.redo());on('pe-finish','click',()=>this.finishPolygon());on('pe-cancel','click',()=>this.cancel());
  on('pe-search','input',()=>this.renderList());on('pe-focus','click',()=>{if(this.zone){this.a.focus(bounds(this.zone));this.render();}});
  on('pe-list','click',e=>{const b=e.target.closest('[data-zone]');if(!b)return;const id=b.dataset.zone;
   if(b.dataset.action==='lock'||b.dataset.action==='visibility'){this.change(()=>{const z=this.state.zones.find(v=>v.id===id);if(b.dataset.action==='lock')z.locked=!z.locked;else z.visible=!z.visible;},'Zone mise à jour.');}
   else this.select(id);
  });
  on('pe-list','dblclick',e=>{const b=e.target.closest('[data-zone]');if(b&&b.dataset.action==='select'){this.select(b.dataset.zone);this.a.focus(bounds(this.zone));}});
  on('pe-name','change',e=>{const value=e.target.value.trim();if(!value){e.target.value=this.zone?.nom||'';this.status('Le nom ne peut pas être vide.');return;}this.change(()=>{if(this.zone)this.zone.nom=value;},'Nom enregistré.');});
  on('pe-color','change',e=>{const value=e.target.value;this.change(()=>{if(this.zone)this.zone.color=value;},'Couleur enregistrée. Elle reste visible hors édition.');});
  on('pe-color-reset','click',()=>{this.change(()=>{if(this.zone)this.zone.color=COLORS[this.zone.kind];},'Couleur du type rétablie.');});
  on('pe-kind','change',e=>{const value=e.target.value;this.change(()=>{if(this.zone&&this.zone.kind!=='service'&&value!=='service'){this.zone.kind=value;this.zone.color=COLORS[value];if(value==='annexe'){if(!this.zone.parent)this.zone.parent=this.originals[0].id;}else delete this.zone.parent;}},'Type enregistré.');});
  on('pe-parent','change',e=>{const value=e.target.value;this.change(()=>{if(this.zone&&this.zone.kind==='annexe')this.zone.parent=value;},'Atelier de rattachement enregistré.');});
  for(const k of ['x','y','w','h'])on('pe-'+k,'change',e=>{const n=Number(e.target.value);if(!e.target.value||!Number.isFinite(n)||Math.abs(n)>=1e7||(['w','h'].includes(k)&&n<=0)){e.target.value=this.zone?Math.round(bounds(this.zone)[k]):'';this.status('Valeur invalide.');return;}this.change(()=>{if(this.zone&&!this.zone.locked)resize(this.zone,{...bounds(this.zone),[k]:n});},'Dimensions enregistrées.');});
  on('pe-locked','change',e=>{const checked=e.target.checked;this.change(()=>{if(this.zone)this.zone.locked=checked;},'Verrouillage mis à jour.');});
  on('pe-confirmed','change',e=>{const checked=e.target.checked;this.change(()=>{if(this.zone)this.zone.approx=!checked;},'Statut de confirmation enregistré.');});
  on('pe-duplicate','click',()=>this.duplicate());on('pe-delete','click',()=>this.remove());on('pe-delete-vertex','click',()=>this.removeVertex());
  on('pe-redraw','click',()=>{if(!this.zone||this.zone.locked)return;this.setTool('poly');this.redraw=true;this.status('Tracez le nouveau contour. Entrée pour terminer ; Échap conserve l’ancien.');});
  on('pe-convert','click',()=>this.change(()=>{const z=this.zone;if(!z||z.locked)return;if(z.pts)delete z.pts;else z.pts=[[z.x,z.y],[z.x+z.w,z.y],[z.x+z.w,z.y+z.h],[z.x,z.y+z.h]];},'Forme convertie.'));
  let opacityBefore=null;on('pe-opacity','input',e=>{opacityBefore??=clone(this.state);this.state.backgroundOpacity=+e.target.value/100;this.renderCanvas();});on('pe-opacity','change',()=>{if(opacityBefore)this.commit(opacityBefore,'Opacité enregistrée.');opacityBefore=null;});
  on('pe-snap','change',e=>{this.snap=e.target.checked;});on('pe-grid','change',e=>{this.grid=e.target.checked;this.renderCanvas();});
  on('pe-export','click',()=>this.export());on('pe-import-button','click',()=>document.getElementById('pe-import').click());on('pe-import','change',e=>this.import(e));
  on('pe-backup','click',()=>{try{const raw=localStorage.getItem('orly-plan-v3-backup');if(!raw)throw new Error('Aucune sauvegarde précédente disponible.');const plan=validatePlan(JSON.parse(raw),this.originals);this.change(()=>{this.state=plan;this.selected=null;},'Sauvegarde précédente restaurée.');}catch(e){this.status(e.message);}});
  this.svg.addEventListener('pointerdown',e=>this.down(e),true);this.svg.addEventListener('pointermove',e=>this.move(e),true);this.svg.addEventListener('pointerup',e=>this.up(e),true);
  this.svg.addEventListener('pointercancel',()=>{if(this.active)this.cancel();},true);
  this.svg.addEventListener('click',e=>{if(this.active)e.stopImmediatePropagation();},true);
  this.svg.addEventListener('dblclick',e=>{if(this.active){e.preventDefault();e.stopImmediatePropagation();if(this.tool==='poly')this.finishPolygon();}},true);
  this.svg.addEventListener('contextmenu',e=>{if(this.active)e.preventDefault();});
  window.addEventListener('keydown',e=>this.key(e),true);window.addEventListener('keyup',e=>{if(e.code==='Space'){this.space=false;this.svg.classList.remove('pe-panning');}},true);
  window.addEventListener('blur',()=>{this.space=false;if(this.gesture)this.cancel();});
  window.addEventListener('resize',()=>this.renderCanvas());
  // Hors édition, cliquer une annexe la choisit comme service courant.
  this.layer.addEventListener('click',e=>{
   if(this.active)return;const g=e.target.closest('[data-pe-zone]');if(!g)return;
   const z=this.state.zones.find(v=>v.id===g.dataset.peZone);
   if(z&&z.kind==='annexe'&&this.a.pick)this.a.pick(z.id);
  });
 }
 setTool(tool){this.cancel();this.tool=tool;this.vertex=null;this.render();}
 select(id){this.cancel();this.selected=id;this.vertex=null;this.tool='select';this.render();if(this.zone)this.status(this.zone.locked?'Zone verrouillée : déverrouillez-la pour modifier sa géométrie.':'Glissez la zone ou une poignée. Double-cliquez son nom dans la liste pour zoomer.');}
 change(fn,message){this.cancel();const before=clone(this.state);try{fn();this.state=validatePlan(this.state,this.originals);this.commit(before,message);}catch(e){this.state=before;this.render();this.status(e.message+' Modification annulée.');}}
 commit(before,message){
  try{this.state=validatePlan(this.state,this.originals);}catch(e){this.state=before;this.render();this.status(e.message+' Modification annulée.');return;}
  if(JSON.stringify(before)!==JSON.stringify(this.state)){this.undoStack.push(before);if(this.undoStack.length>80)this.undoStack.shift();this.redoStack=[];this.sync();const saved=this.persist();this.render();if(saved&&message)this.status(message);return;}
  this.render();if(message)this.status(message);
 }
 persist(){try{const old=localStorage.getItem('orly-plan-v3');if(old)localStorage.setItem('orly-plan-v3-backup',old);localStorage.setItem('orly-plan-v3',JSON.stringify(this.state));return true;}catch(e){this.status('Sauvegarde locale impossible. Exportez le plan pour conserver vos modifications.');this.a.notify('Sauvegarde impossible : utilisez Exporter le plan.');return false;}}
 /* Hors édition, les ateliers du moteur ne sont plus dessinés ici : c'est
  * l'interface de simulation qui les rend. Sa couleur doit donc lui être
  * transmise, sans quoi le choix de l'utilisateur disparaît en quittant
  * l'éditeur (BUG-013). On ne transmet qu'une couleur VOULUE : la teinte par
  * défaut du type resterait un aplat bleu sur toute l'unité. */
 sync(){
  for(const z of this.state.zones){
   if(!Object.hasOwn(this.a.zones,z.id))continue;
   const target=this.a.zones[z.id];
   Object.assign(target,{nom:z.nom,...bounds(z),approx:z.approx});
   if(z.pts)target.pts=clone(z.pts);else delete target.pts;
   target.couleur=couleurVoulue(z);
   this.a.update(z.id,z.visible);
  }
  this.a.refresh();
 }
 undo(){this.cancel();if(!this.undoStack.length)return;this.redoStack.push(clone(this.state));this.state=this.undoStack.pop();this.afterHistory('Action annulée.');}
 redo(){this.cancel();if(!this.redoStack.length)return;this.undoStack.push(clone(this.state));this.state=this.redoStack.pop();this.afterHistory('Action rétablie.');}
 afterHistory(message){if(!this.zone)this.selected=null;this.vertex=null;this.sync();const saved=this.persist();this.render();if(saved)this.status(message);}
 cancel(){if(this.gesture?.before)this.state=this.gesture.before;this.gesture=null;this.points=[];this.preview=null;this.redraw=false;this.guides=[];if(this.layer)this.render();}
 snapPoint(p,e={}){
  if(!this.snap||e.altKey)return{x:p.x,y:p.y};const limit=8/this.scale();let x=p.x,y=p.y,dx=limit,dy=limit;
  const candidates=[];for(const z of this.state.zones){if(!z.visible||(z.id===this.selected&&(this.tool==='select'||this.redraw)))continue;const b=bounds(z);candidates.push([b.x,b.y],[b.x+b.w,b.y+b.h]);if(z.pts)candidates.push(...z.pts);}
  if(this.grid)candidates.push([Math.round(x/20)*20,Math.round(y/20)*20]);
  for(const pt of candidates){if(Math.abs(p.x-pt[0])<dx){dx=Math.abs(p.x-pt[0]);x=pt[0];}if(Math.abs(p.y-pt[1])<dy){dy=Math.abs(p.y-pt[1]);y=pt[1];}}
  this.guides=[dx<limit?x:null,dy<limit?y:null];return{x,y};
 }
 down(e){
  if(!this.active)return;if(e.button!==0&&e.button!==1)return;e.preventDefault();e.stopImmediatePropagation();this.svg.focus({preventScroll:true});
  const p=this.point(e);this.svg.setPointerCapture(e.pointerId);
  if(this.tool==='hand'||this.space||e.button===1){this.gesture={type:'pan',client:{x:e.clientX,y:e.clientY},view:this.a.getView()};return;}
  if(this.tool==='poly'){
   if(e.detail>1)return;let q=this.snapPoint(p,e);const prev=this.points.at(-1);if(e.shiftKey&&prev){if(Math.abs(q.x-prev[0])>Math.abs(q.y-prev[1]))q.y=prev[1];else q.x=prev[0];}
   if(this.points.length>=3&&Math.hypot(q.x-this.points[0][0],q.y-this.points[0][1])<12/this.scale()){this.finishPolygon();return;}
   if(!prev||Math.hypot(q.x-prev[0],q.y-prev[1])>2/this.scale())this.points.push([q.x,q.y]);this.render();return;
  }
  if(this.tool==='rect'){this.gesture={type:'rect',start:this.snapPoint(p,e),before:clone(this.state)};return;}
  const handle=e.target.closest('[data-pe-handle]');const hit=e.target.closest('[data-pe-zone]');
  if(handle&&this.zone&&!this.zone.locked){
   const z=this.zone,before=clone(this.state);if(handle.dataset.peHandle==='mid'){const i=+handle.dataset.index;z.pts.splice(i+1,0,[p.x,p.y]);this.vertex=i+1;this.gesture={type:'vertex',index:i+1,start:p,before,original:clone(z)};}
   else if(handle.dataset.peHandle==='vertex'){this.vertex=+handle.dataset.index;this.gesture={type:'vertex',index:this.vertex,start:p,before,original:clone(z)};}
   else this.gesture={type:'resize',handle:handle.dataset.peHandle,start:p,before,original:clone(z)};
   this.render();return;
  }
  if(hit){this.selected=hit.dataset.peZone;this.vertex=null;this.render();const z=this.zone;if(!z.locked)this.gesture={type:'move',start:p,before:clone(this.state),original:clone(z)};else this.status('Zone verrouillée. Utilisez le cadenas dans la liste pour la modifier.');}
  else{this.selected=null;this.vertex=null;this.render();this.gesture={type:'pan',client:{x:e.clientX,y:e.clientY},view:this.a.getView()};}
 }
 move(e){
  if(!this.active)return;e.stopImmediatePropagation();const p=this.point(e),g=this.gesture;
  if(this.tool==='poly'&&this.points.length){let q=this.snapPoint(p,e);const prev=this.points.at(-1);if(e.shiftKey){if(Math.abs(q.x-prev[0])>Math.abs(q.y-prev[1]))q.y=prev[1];else q.x=prev[0];}this.preview=q;this.renderCanvas();return;}
  if(!g)return;
  if(g.type==='pan'){this.a.pan(g.view,e.clientX-g.client.x,e.clientY-g.client.y);return;}
  if(g.type==='rect'){const q=this.snapPoint(p,e);let dx=q.x-g.start.x,dy=q.y-g.start.y;if(e.shiftKey){const d=Math.max(Math.abs(dx),Math.abs(dy));dx=Math.sign(dx||1)*d;dy=Math.sign(dy||1)*d;}this.preview={x:Math.min(g.start.x,g.start.x+dx),y:Math.min(g.start.y,g.start.y+dy),w:Math.abs(dx),h:Math.abs(dy)};this.renderCanvas();return;}
  const z=this.zone;if(!z)return;
  if(g.type==='move'){const b=bounds(g.original),q=this.snapPoint({x:b.x+p.x-g.start.x,y:b.y+p.y-g.start.y},e);Object.assign(z,clone(g.original));resize(z,{...b,x:q.x,y:q.y});}
  if(g.type==='vertex'){const q=this.snapPoint(p,e);z.pts[g.index]=[q.x,q.y];Object.assign(z,bounds(z));}
  if(g.type==='resize'){
   const b=bounds(g.original),q=this.snapPoint(p,e);let x=b.x,y=b.y,r=b.x+b.w,bottom=b.y+b.h;const min=6/this.scale();
   if(g.handle.includes('w'))x=Math.min(q.x,r-min);if(g.handle.includes('e'))r=Math.max(q.x,x+min);if(g.handle.includes('n'))y=Math.min(q.y,bottom-min);if(g.handle.includes('s'))bottom=Math.max(q.y,y+min);
   Object.assign(z,clone(g.original));resize(z,{x,y,w:r-x,h:bottom-y});
  }
  this.renderCanvas();this.renderProperties();
 }
 up(e){
  if(!this.active)return;e.stopImmediatePropagation();if(this.svg.hasPointerCapture(e.pointerId))this.svg.releasePointerCapture(e.pointerId);
  const g=this.gesture;if(!g)return;this.gesture=null;this.guides=[];
  if(g.type==='pan')return;
  if(g.type==='rect'){const b=this.preview;this.preview=null;if(!b||b.w*this.scale()<6||b.h*this.scale()<6){this.render();this.status('Glissez pour dessiner une zone ; un simple clic ne suffit pas.');return;}this.addZone(b);this.tool='select';this.commit(g.before,'Local créé. Nommez-le à droite ; pour une seconde salle d’atelier, choisissez le type « Zone de production ».');return;}
  try{if(this.zone)validZone(this.zone);this.commit(g.before,'Géométrie enregistrée.');}catch(err){this.state=g.before;this.render();this.status(err.message+' Geste annulé.');}
 }
 addZone(shape){const id='local-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);const n=this.state.zones.filter(z=>z.kind!=='service').length+1;const z=validZone({id,nom:'Local '+n,kind:'room',...shape,approx:true});this.state.zones.push(z);this.selected=id;this.vertex=null;}
 finishPolygon(){
  if(this.points.length<3){this.status('Placez au moins trois sommets.');return;}
  const pts=clone(this.points),b=bounds({pts});if(area(pts)<1||b.w*this.scale()<6||b.h*this.scale()<6){this.status('Le contour doit délimiter une surface.');return;}
  const before=clone(this.state);if(this.redraw&&this.zone){Object.assign(this.zone,b,{pts});}else this.addZone({...b,pts});
  this.points=[];this.preview=null;this.redraw=false;this.tool='select';this.commit(before,'Contour enregistré. Déplacez ses sommets ou utilisez les + pour en ajouter.');
 }
 /* Dupliquer un atelier du moteur, c'est lui ouvrir une seconde salle : on
  * obtient « Armement 2 », rattaché à Armement, et non une annotation morte.
  * Dupliquer autre chose reste une copie sans effet sur le calcul. */
 duplicate(){
  if(!this.zone)return;const src=this.zone,seconde=src.kind==='service'||src.kind==='annexe';
  const pere=src.kind==='annexe'?src.parent:src.id;
  this.change(()=>{
   const z=clone(src);z.id='local-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
   if(seconde){
    z.kind='annexe';z.parent=pere;z.color=COLORS.annexe;delete z.storages;
    const base=this.state.zones.find(v=>v.id===pere),racine=base?base.nom:src.nom;
    const n=this.state.zones.filter(v=>v.kind==='annexe'&&v.parent===pere).length+2;
    z.nom=(racine+' '+n).slice(0,120);
   } else z.nom=(z.nom+' — copie').slice(0,120);
   z.locked=false;z.visible=true;z.approx=true;
   resize(z,{...bounds(z),x:z.x+30,y:z.y+30});
   this.state.zones.push(z);this.selected=z.id;this.vertex=null;
  },seconde?'Seconde salle créée : déplacez-la, puis décrivez ses équipes dans l’onglet « Ateliers ».'
          :'Copie créée comme annotation : elle ne crée aucun service.');
 }
 remove(){if(!this.zone)return;if(this.zone.kind==='service'){this.status('Cet atelier est relié au moteur. Utilisez l’œil pour le masquer ; il ne peut pas être supprimé.');return;}if(this.zone.locked){this.status('Déverrouillez la zone avant de la supprimer.');return;}this.change(()=>{this.state.zones=this.state.zones.filter(z=>z.id!==this.selected);this.selected=null;},'Zone supprimée. Annuler permet de la retrouver.');}
 removeVertex(){if(!this.zone?.pts||this.vertex==null||this.zone.locked)return;if(this.zone.pts.length<=3){this.status('Un polygone doit conserver au moins trois sommets.');return;}this.change(()=>{this.zone.pts.splice(this.vertex,1);Object.assign(this.zone,bounds(this.zone));this.vertex=null;},'Sommet supprimé.');}
 key(e){
  if(!this.active||e.target.closest('input,textarea,select,[contenteditable=true]'))return;
  const mod=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
  if(mod&&k==='z'){e.preventDefault();e.stopImmediatePropagation();e.shiftKey?this.redo():this.undo();return;}
  if(mod&&k==='y'){e.preventDefault();e.stopImmediatePropagation();this.redo();return;}
  if(mod&&k==='d'){e.preventDefault();this.duplicate();return;}
  if(e.code==='Space'){e.preventDefault();this.space=true;this.svg.classList.add('pe-panning');return;}
  if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();this.cancel();this.tool='select';this.render();return;}
  if(e.key==='Enter'&&this.tool==='poly'){e.preventDefault();e.stopImmediatePropagation();this.finishPolygon();return;}
  if(e.key==='Backspace'&&this.points.length){e.preventDefault();this.points.pop();this.render();return;}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();this.vertex!=null?this.removeVertex():this.remove();return;}
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&this.zone&&!this.zone.locked){e.preventDefault();const n=e.shiftKey?10:1;this.change(()=>{const b=bounds(this.zone);resize(this.zone,{...b,x:b.x+(e.key==='ArrowLeft'?-n:e.key==='ArrowRight'?n:0),y:b.y+(e.key==='ArrowUp'?-n:e.key==='ArrowDown'?n:0)});},'Zone déplacée.');return;}
  if(!mod&&{v:1,r:1,p:1,h:1}[k]){e.preventDefault();this.setTool({v:'select',r:'rect',p:'poly',h:'hand'}[k]);}
 }
 render(){this.renderStoragePanels();this.renderCanvas();if(!this.active)return;const opacity=document.getElementById('pe-opacity');if(document.activeElement!==opacity)opacity.value=Math.round(this.state.backgroundOpacity*100);this.renderList();this.renderProperties();document.querySelectorAll('[data-pe-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.peTool===this.tool)));document.getElementById('pe-undo').disabled=!this.undoStack.length;document.getElementById('pe-redo').disabled=!this.redoStack.length;document.getElementById('pe-finish').hidden=this.tool!=='poly';document.getElementById('pe-finish').disabled=this.points.length<3;document.getElementById('pe-cancel').hidden=!this.points.length&&!this.gesture;
  document.getElementById('pe-tool-help').textContent={select:'Glisser : déplacer · poignées : redimensionner · Espace : déplacer la vue',rect:'Glissez sur le plan pour créer un local · Maj : carré',poly:'Cliquez les sommets · cliquez le premier point ou Entrée pour fermer · Échap : annuler',hand:'Glissez pour déplacer le plan · molette : zoom'}[this.tool];this.svg.dataset.editorTool=this.tool;
 }
 showService(id){this.serviceId=id;this.renderStoragePanels();if(!this.active)this.renderCanvas();}
 bindStoragePanel(panel){
  panel.addEventListener('click',e=>{
   const b=e.target.closest('[data-stock-action]');if(!b)return;
   const action=b.dataset.stockAction,id=panel.dataset.service,stock=b.dataset.stockId;
   if(action==='undo'){this.undo();return;}if(action==='redo'){this.redo();return;}
   this.change(()=>{
    const z=this.state.zones.find(z=>z.id===id&&z.kind==='service');if(!z)return;
    if(action==='add')z.storages.push({id:'stock-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),nom:'Nouveau stockage',contenu:''});
    if(action==='remove')z.storages=z.storages.filter(s=>s.id!==stock);
    if(action==='assign'){const old=this.state.unassignedStorages.find(s=>s.id===stock);if(old){z.storages.push({...old,id:'stock-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)});this.state.unassignedStorages=this.state.unassignedStorages.filter(s=>s.id!==stock);}}
   },'Stockages enregistrés.');
  });
  panel.addEventListener('change',e=>{
   const field=e.target.dataset.stockField;if(!field)return;
   const id=panel.dataset.service,stock=e.target.dataset.stockId,value=e.target.value;
   this.change(()=>{const item=this.state.zones.find(z=>z.id===id)?.storages.find(s=>s.id===stock);if(item)item[field]=value;},'Stockage enregistré.');
  });
 }
 renderStoragePanels(){
  for(const [panelId,id] of [['pe-storages',this.selected],['service-storages',this.serviceId]]){
   const panel=document.getElementById(panelId);if(!panel)continue;
   const z=this.state.zones.find(z=>z.id===id&&z.kind==='service');panel.hidden=!z;if(!z)continue;panel.dataset.service=id;
   const button=(action,label,stock='')=>`<button class="btn" data-stock-action="${action}" data-stock-id="${esc(stock)}">${label}</button>`;
   const html=`<h3>Stockages · ${esc(z.nom)}</h3><p class="mini-note">Nommez les espaces de stockage et décrivez leur contenu. Les articles et quantités seront gérés ultérieurement.</p>`+
    z.storages.map(s=>`<fieldset class="storage-card"><legend>Stockage</legend><label>Nom<input maxlength="120" data-stock-field="nom" data-stock-id="${esc(s.id)}" value="${esc(s.nom)}"></label><label>Ce qui est stocké<textarea maxlength="1000" rows="2" data-stock-field="contenu" data-stock-id="${esc(s.id)}" placeholder="Décrivez les familles de produits…">${esc(s.contenu)}</textarea></label>${button('remove','Supprimer ce stockage',s.id)}</fieldset>`).join('')+
    (z.storages.length?'':'<p class="mini-note">Aucun stockage renseigné pour ce service.</p>')+
    button('add','+ Ajouter un stockage')+`<div class="pe-actions"><button class="btn" data-stock-action="undo" ${this.undoStack.length?'':'disabled'}>Annuler</button><button class="btn" data-stock-action="redo" ${this.redoStack.length?'':'disabled'}>Rétablir</button></div>`+
    (this.state.unassignedStorages.length?`<details><summary>Anciens stockages à rattacher (${this.state.unassignedStorages.length})</summary><p class="mini-note">Leurs noms sont conservés. Rattachez chaque stockage au bon service.</p>${this.state.unassignedStorages.map(s=>`<div class="storage-pending"><span>${esc(s.nom)}</span>${button('assign','Rattacher ici',s.id)}</div>`).join('')}</details>`:'');
   const structure=JSON.stringify([id,z.nom,z.storages.map(s=>s.id),this.state.unassignedStorages]);
   if(panel._structure!==structure){panel.innerHTML=html;panel._structure=structure;}
   else {for(const input of panel.querySelectorAll('[data-stock-field]')){const item=z.storages.find(s=>s.id===input.dataset.stockId);input.value=item[input.dataset.stockField];}}
   panel.querySelector('[data-stock-action=undo]').disabled=!this.undoStack.length;panel.querySelector('[data-stock-action=redo]').disabled=!this.redoStack.length;
  }
 }
 renderList(){
  const search=document.getElementById('pe-search').value.trim().toLowerCase(),list=document.getElementById('pe-list');
  const zones=this.state.zones.filter(z=>z.nom.toLowerCase().includes(search));document.getElementById('pe-count').textContent=this.state.zones.length;
  const html=zones.map(z=>`<div class="pe-list-row ${z.id===this.selected?'selected':''}"><button data-action="select" data-zone="${esc(z.id)}" class="pe-zone-name" aria-pressed="${z.id===this.selected}"><span class="pe-swatch" style="background:${z.color}"></span><span>${esc(z.nom)}<small>${TYPES[z.kind]}${z.approx?' · à confirmer':''}</small></span></button><button data-zone="${esc(z.id)}" data-action="visibility" aria-label="${z.visible?'Masquer':'Afficher'} ${esc(z.nom)}" title="${z.visible?'Masquer':'Afficher'}" aria-pressed="${!z.visible}">${z.visible?'◉':'○'}</button><button data-zone="${esc(z.id)}" data-action="lock" aria-label="${z.locked?'Déverrouiller':'Verrouiller'} ${esc(z.nom)}" title="${z.locked?'Déverrouiller':'Verrouiller'}" aria-pressed="${z.locked}">${z.locked?'Fixé':'Libre'}</button></div>`).join('')||'<p class="mini-note">Aucune zone trouvée.</p>';
  if(list.innerHTML!==html)list.innerHTML=html;
 }
 renderProperties(){
  const z=this.zone;document.getElementById('pe-properties').hidden=!z;document.getElementById('pe-focus').disabled=!z;if(!z)return;
  const assign=(id,value)=>{const e=document.getElementById(id);if(document.activeElement!==e)e.value=value;};
  assign('pe-name',z.nom);assign('pe-kind',z.kind);assign('pe-color',z.color);
  document.getElementById('pe-color-reset').hidden=!couleurVoulue(z);
  document.getElementById('pe-kind').disabled=z.kind==='service';document.querySelector('#pe-kind option[value=service]').disabled=z.kind!=='service';
  const champParent=document.getElementById('pe-parent-champ'),selParent=document.getElementById('pe-parent');
  champParent.hidden=z.kind!=='annexe';
  if(z.kind==='annexe'){
   selParent.innerHTML=this.originals.map(o=>`<option value="${esc(o.id)}">${esc(o.nom)}</option>`).join('');
   assign('pe-parent',z.parent||this.originals[0].id);
  }
  document.getElementById('pe-kind-note').textContent=z.kind==='service'
   ?'Service du plan : vous pouvez corriger son contour et son nom.'
   :z.kind==='annexe'
    ?'Seconde salle d’un service : on y pose des équipes dans l’onglet « Ateliers », comme dans le service dont elle dépend.'
    :'Annotation du plan : elle ne crée aucun service.';
  for(const k of ['x','y','w','h']){assign('pe-'+k,Math.round(bounds(z)[k]));document.getElementById('pe-'+k).disabled=z.locked;}
  document.getElementById('pe-locked').checked=z.locked;document.getElementById('pe-confirmed').checked=!z.approx;
  document.getElementById('pe-delete').disabled=z.kind==='service'||z.locked;
  document.getElementById('pe-redraw').disabled=z.locked;document.getElementById('pe-convert').disabled=z.locked;
  document.getElementById('pe-convert').textContent=z.pts?'Revenir au rectangle':'Convertir en polygone';
  document.getElementById('pe-delete-vertex').hidden=!z.pts;document.getElementById('pe-delete-vertex').disabled=z.locked||this.vertex==null||z.pts?.length<=3;
 }
 renderCanvas(){
  this.layer.replaceChildren();document.getElementById('plan-fond').style.opacity=this.state.backgroundOpacity;
  if(this.active&&this.grid){const defs=this.el('defs');const pattern=this.el('pattern',{id:'pe-grid-pattern',width:20,height:20,patternUnits:'userSpaceOnUse'});pattern.appendChild(this.el('path',{d:'M 20 0 L 0 0 0 20',fill:'none',stroke:'#91a0ac','stroke-width':.7}));defs.appendChild(pattern);this.layer.appendChild(defs);this.layer.appendChild(this.el('rect',{x:-10000,y:-10000,width:30000,height:30000,fill:'url(#pe-grid-pattern)','pointer-events':'none'}));}
  const scale=this.scale(),r=6/scale;
  for(const z of this.state.zones){if(!z.visible||(!this.active&&z.kind==='service'))continue;
   const vise=this.active?z.id===this.selected:z.id===this.serviceId;
   const g=this.el('g',{'data-pe-zone':z.id,class:'pe-shape'+(vise?' selected':'')+(z.kind==='annexe'?' pe-annexe':''),'pointer-events':this.active||z.kind==='annexe'?'all':'none'});
   const b=bounds(z),shape=z.pts?this.el('polygon',{points:z.pts.map(p=>p.join(',')).join(' ')}):this.el('rect',{x:b.x,y:b.y,width:b.w,height:b.h});
   for(const[k,v]of Object.entries({fill:z.color,'fill-opacity':vise?.22:z.kind==='annexe'?.16:.09,stroke:z.color,'stroke-width':vise?2.5:z.kind==='annexe'?2:1.3,'vector-effect':'non-scaling-stroke','stroke-dasharray':z.approx?'6 4':'none'}))shape.setAttribute(k,v);g.appendChild(shape);
   const text=this.el('text',{x:b.x+7/scale,y:b.y+17/scale,'font-size':12/scale,'pointer-events':'none',class:'pe-shape-label'});const limit=Math.floor((b.w*scale-14)/7);text.textContent=limit>=5?(z.nom.length>limit?z.nom.slice(0,limit-1)+'…':z.nom):'';if(z.id===this.selected)text.textContent=z.nom;const title=this.el('title');title.textContent=z.nom;g.appendChild(title);g.appendChild(text);this.layer.appendChild(g);
  }
  if(!this.active)return;
  if(this.zone?.visible&&!this.zone.locked&&this.tool==='select'){
   const z=this.zone,b=bounds(z),g=this.el('g',{class:'pe-handles'});this.layer.appendChild(g);
   const h=(x,y,type,index,mid=false)=>{const e=this.el('circle',{cx:x,cy:y,r:mid?4/scale:r,fill:mid?'#fff':index===this.vertex&&type==='vertex'?'#d36e12':'#087f75',stroke:mid?'#087f75':'#fff','stroke-width':1.5/scale,'data-pe-handle':type,...(index!=null?{'data-index':index}:{}),class:'pe-handle handle-'+type});g.appendChild(e);if(mid){const plus=this.el('text',{x,y:y+3/scale,'text-anchor':'middle','font-size':9/scale,fill:'#087f75','pointer-events':'none'});plus.textContent='+';g.appendChild(plus);}};
   if(z.pts)z.pts.forEach((p,i)=>{h(p[0],p[1],'vertex',i);const q=z.pts[(i+1)%z.pts.length];h((p[0]+q[0])/2,(p[1]+q[1])/2,'mid',i,true);});
   else for(const [x,y,k]of [[b.x,b.y,'nw'],[b.x+b.w/2,b.y,'n'],[b.x+b.w,b.y,'ne'],[b.x+b.w,b.y+b.h/2,'e'],[b.x+b.w,b.y+b.h,'se'],[b.x+b.w/2,b.y+b.h,'s'],[b.x,b.y+b.h,'sw'],[b.x,b.y+b.h/2,'w']])h(x,y,k);
  }
  if(this.gesture?.type==='rect'&&this.preview){const b=this.preview;this.layer.appendChild(this.el('rect',{...{x:b.x,y:b.y,width:b.w,height:b.h},class:'pe-draft','vector-effect':'non-scaling-stroke'}));}
  if(this.points.length){const pts=this.preview?this.points.concat([[this.preview.x,this.preview.y]]):this.points;this.layer.appendChild(this.el('polyline',{points:pts.map(p=>p.join(',')).join(' '),class:'pe-draft','vector-effect':'non-scaling-stroke'}));this.points.forEach((p,i)=>this.layer.appendChild(this.el('circle',{cx:p[0],cy:p[1],r:(i===0?7:4)/scale,fill:i===0?'#d36e12':'#087f75',stroke:'#fff','stroke-width':1/scale,'pointer-events':'none'})));}
  if(this.guides){const[x,y]=this.guides;if(x!=null)this.layer.appendChild(this.el('line',{x1:x,x2:x,y1:-10000,y2:20000,class:'pe-guide','vector-effect':'non-scaling-stroke'}));if(y!=null)this.layer.appendChild(this.el('line',{y1:y,y2:y,x1:-10000,x2:20000,class:'pe-guide','vector-effect':'non-scaling-stroke'}));}
 }
 export(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(this.state,null,2)],{type:'application/json'}));a.download='plan-ory-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);this.status('Plan exporté : locaux, contours, stockages, noms, couleurs et verrouillages.');}
 async import(e){const file=e.target.files[0];if(!file)return;try{if(file.size>5*1024*1024)throw new Error('Fichier trop volumineux (maximum 5 Mo).');const raw=JSON.parse(await file.text());const plan=validatePlan(raw,raw.schema==='ory-plan'?this.originals:this.state.zones.filter(z=>z.kind==='service'));if(raw.schema!=='ory-plan')plan.unassignedStorages=clone(this.state.unassignedStorages);if(raw.schema!=='ory-plan')plan.zones.push(...clone(this.state.zones.filter(z=>z.kind!=='service')));if(!confirm('Remplacer le plan par ce fichier ? Vous pourrez annuler cette action.'))return;this.change(()=>{this.state=plan;this.selected=null;},'Plan importé. Annuler restaure votre plan précédent.');}catch(err){this.status('Import refusé : '+err.message+' Le plan actuel est conservé.');}finally{e.target.value='';}}
}
const api={PlanEditor,validatePlan,validZone,bounds,resize};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.OrlyPlan=api;
})(typeof globalThis!=='undefined'?globalThis:this);

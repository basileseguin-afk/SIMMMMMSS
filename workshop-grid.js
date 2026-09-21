/* Aménagement schématique : un carreau représente 50 cm, sans calibrer le fond. */
(function(root){
'use strict';
const TYPES={table:'Table',tapis:'Chaîne',robot:'Ligne robot',desserte:'Desserte',trolley:'Trolley'};
const PREFIXES={table:'T',robot:'R',tapis:'C',desserte:'D',trolley:'TR'};
const COLORS={table:'#b67b34',tapis:'#168886',robot:'#7956ad',desserte:'#4479ae',trolley:'#657482'};
const clone=x=>JSON.parse(JSON.stringify(x)),uid=()=> 'atelier-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key=(x,y)=>x+','+y,xy=s=>s.split(',').map(Number);
function inside(p,z){
 if(!z.pts)return p[0]>=z.x-1e-7&&p[0]<=z.x+z.w+1e-7&&p[1]>=z.y-1e-7&&p[1]<=z.y+z.h+1e-7;
 let yes=false;for(let i=0,j=z.pts.length-1;i<z.pts.length;j=i++){
  const a=z.pts[j],b=z.pts[i],cross=(p[0]-a[0])*(b[1]-a[1])-(p[1]-a[1])*(b[0]-a[0]);
  if(Math.abs(cross)<1e-7&&p[0]>=Math.min(a[0],b[0])-1e-7&&p[0]<=Math.max(a[0],b[0])+1e-7&&p[1]>=Math.min(a[1],b[1])-1e-7&&p[1]<=Math.max(a[1],b[1])+1e-7)return true;
  if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;
 }return yes;
}
function cellInside(cell,z,step){
 const [cx,cy]=xy(cell),x=cx*step,y=cy*step;
 if(![[x,y],[x+step,y],[x,y+step],[x+step,y+step],[x+step/2,y+step/2]].every(p=>inside(p,z)))return false;
 // Reject cells covering a concave notch, even if their corners are inside.
 return !(z.pts||[]).some(p=>p[0]>x+1e-7&&p[0]<x+step-1e-7&&p[1]>y+1e-7&&p[1]<y+step-1e-7);
}
function validate(raw){
 if(!raw||raw.schema!=='ory-workshops'||raw.version!==1||!Number.isInteger(raw.step)||raw.step<10||raw.step>200||!Array.isArray(raw.workshops)||raw.workshops.length>300||!Array.isArray(raw.items)||raw.items.length>2000)throw Error('Aménagement v1 invalide.');
 const ids=new Set(),groups=new Map(),codes=new Set();
 const text=(s,n)=>typeof s==='string'&&s.trim().length>0&&s.length<=n;
 const workshops=raw.workshops.map(w=>{if(!w||!text(w.id,160)||ids.has(w.id)||!text(w.service,160)||!text(w.nom,120))throw Error('Atelier invalide ou identifiant en double.');if(w.code!==undefined&&(!/^AT-\d{3,6}$/.test(w.code)||codes.has(w.code)))throw Error('Code atelier invalide ou en double.');if(w.validated!==undefined&&typeof w.validated!=='boolean')throw Error('État atelier invalide.');if(w.code)codes.add(w.code);ids.add(w.id);groups.set(w.id,w);return{id:w.id,service:w.service,nom:w.nom.trim(),...(w.code?{code:w.code}:{}),...(w.validated!==undefined?{validated:w.validated}:{})};});
 const occupied=new Set();let total=0;
 // Reserve existing codes before allocating any missing ones (legacy imports).
 const equipmentCodes=new Set();
 for(const i of raw.items){if(i?.code!==undefined){if(typeof i.code!=='string'||!new RegExp('^'+(PREFIXES[i.type]||'INVALID')+'-[0-9]{3,6}$').test(i.code)||equipmentCodes.has(i.code))throw Error('Code équipement invalide ou en double.');equipmentCodes.add(i.code);}}
 const items=raw.items.map(i=>{
  if(!i||!text(i.id,160)||ids.has(i.id)||!groups.has(i.workshop)||!Object.hasOwn(TYPES,i.type)||!text(i.nom,120)||!Array.isArray(i.cells)||!i.cells.length||i.cells.length>5000)throw Error('Équipement invalide.');
  // Personnes affectées à l'équipement. Un compte, pas des positions : la
  // grille est schématique, le placement fin reste l'affaire de la bibliothèque.
  if(i.postes!==undefined&&(!Number.isInteger(i.postes)||i.postes<0||i.postes>99))throw Error('Nombre de personnes invalide : entier de 0 à 99.');
  ids.add(i.id);total+=i.cells.length;if(total>30000)throw Error('Maximum 30 000 cases.');
  const cells=i.cells.map(c=>{if(typeof c!=='string'||!/^(-?\d+),(-?\d+)$/.test(c)||xy(c).some(v=>Math.abs(v)>100000))throw Error('Case invalide.');c=key(...xy(c));const k=groups.get(i.workshop).service+':'+c;if(occupied.has(k))throw Error('Deux équipements ne peuvent pas occuper la même case.');occupied.add(k);return c;});
  const code=i.code||nextCode(equipmentCodes,i.type);equipmentCodes.add(code);
  return{id:i.id,workshop:i.workshop,type:i.type,nom:i.nom.trim(),code,cells,...(i.postes?{postes:i.postes}:{}),...(i.source?{source:clone(i.source)}:{})};
 });if(workshops.some(w=>w.validated&&!items.some(i=>i.workshop===w.id)))throw Error('Un atelier vide ne peut pas être validé.');return{schema:'ory-workshops',version:1,step:raw.step,workshops,items};
}
// Union visuelle exacte : aplats sans joints et contour seulement sur les bords libres.
// Les cellules originales restent disponibles pour reprendre l’édition.
function surface(cells,step){
 const set=new Set(cells);let fill='',outline='';
 for(const c of set){const [cx,cy]=xy(c),x=cx*step,y=cy*step;
  fill+=`M${x} ${y}h${step}v${step}h${-step}Z`;
  if(!set.has(key(cx,cy-1)))outline+=`M${x} ${y}h${step}`;
  if(!set.has(key(cx+1,cy)))outline+=`M${x+step} ${y}v${step}`;
  if(!set.has(key(cx,cy+1)))outline+=`M${x} ${y+step}h${step}`;
  if(!set.has(key(cx-1,cy)))outline+=`M${x} ${y}v${step}`;
 }return{fill,outline};
}
function nextCode(used,type){const prefix=PREFIXES[type];if(!prefix)throw Error('Type équipement inconnu.');let n=1;while(used.has(prefix+'-'+String(n).padStart(3,'0')))n++;return prefix+'-'+String(n).padStart(3,'0');}
function rotate(cells){const pts=cells.map(xy),minX=Math.min(...pts.map(p=>p[0])),minY=Math.min(...pts.map(p=>p[1])),maxY=Math.max(...pts.map(p=>p[1]));return pts.map(([x,y])=>key(minX+maxY-y,minY+x-minX));}
function footprint(model){
 if(!model||!Object.hasOwn(TYPES,model.type))throw Error('Modèle inconnu.');
 let pts;if(['table','tapis','robot'].includes(model.type)){
  if(!Array.isArray(model.cells)||!model.cells.length||model.cells.length>5000)throw Error('Forme de modèle invalide.');
  pts=model.cells.map(c=>{if(typeof c!=='string'||!/^(-?\d+),(-?\d+)$/.test(c))throw Error('Carreau de modèle invalide.');const p=xy(c);if(p.some(v=>Math.abs(v)>5000))throw Error('Modèle trop grand.');return p;});
 }else{const w=Math.ceil(Number(model.dimCm?.l)/50),h=Math.ceil(Number(model.dimCm?.p)/50);if(!Number.isFinite(w*h)||w<1||h<1||w*h>5000)throw Error('Dimensions invalides.');pts=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++)pts.push([x,y]);}
 const x0=Math.min(...pts.map(p=>p[0])),y0=Math.min(...pts.map(p=>p[1]));return [...new Set(pts.map(([x,y])=>key(x-x0,y-y0)))];
}
class WorkshopGrid{
 constructor(a){
  this.a=a;this.active=false;this.service=null;this.workshop=null;this.selected=null;this.tool='select';this.undoStack=[];this.redoStack=[];this.state={schema:'ory-workshops',version:1,step:40,workshops:[],items:[]};
  let warning='';try{const data=localStorage.getItem('ory-workshops-v1');if(data)this.state=validate(JSON.parse(data));}catch(e){warning='Sauvegarde non chargée : '+e.message+' La copie originale reste conservée.';}
  this.layer=this.el('g',{id:'workshop-layer'});a.viewport.appendChild(this.layer);this.build();this.bind();this.render();this.status(warning||'Choisissez un service sur le plan.');
 }
 el(tag,attrs={}){const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);return el;}
 get zone(){return this.a.zones().find(z=>z.id===this.service);}
 get item(){return this.state.items.find(i=>i.id===this.selected);}
 status(s){document.getElementById('wg-status').textContent=s;}
 build(){
  const outils=[['select','Déplacer',''],['table','Table',COLORS.table],['tapis','Chaîne',COLORS.tapis],['robot','Ligne robot',COLORS.robot],['erase','Gomme','']];
  const panel=document.createElement('section');panel.id='workshop-panel';panel.hidden=true;panel.className='panel-content';panel.innerHTML=`<h2>Aménager le service</h2><p id="wg-service">Choisissez un service sur la carte.</p>
<p class="wg-modele">Un <b>service</b> contient un ou plusieurs <b>ateliers</b> — un îlot, une ligne, un coin de la pièce. Chaque atelier contient des <b>équipements</b> : tables, chaînes, lignes robot. Les <b>personnes</b> s’affectent aux équipements.</p>
<p class="scope-badge">Grille 50 × 50 cm · schématique</p><div id="wg-status" role="status" aria-live="polite"></div><div class="wg-actions"><button class="btn" id="wg-overview">Toute l’unité</button><button class="btn" id="wg-focus">Cadrer le service</button></div>
<div id="wg-controls" hidden>
<h3 class="wg-etape"><span>1</span> Ateliers de ce service</h3>
<div id="wg-groups" class="wg-groups"></div>
<div class="wg-actions"><button class="btn" id="wg-add-group">+ Nouvel atelier</button><button class="btn" id="wg-delete-group">Supprimer</button></div>
<label>Nom de l’atelier<input id="wg-group-name" maxlength="120"></label>
<div class="wg-actions"><button class="btn" id="wg-validate">Fusionner en une surface</button><span class="mini-note" id="wg-validation-state"></span></div>
<h3 class="wg-etape"><span>2</span> Dessiner les équipements</h3>
<div class="wg-tools">${outils.map(([id,label,c])=>`<button class="btn" data-wg-tool="${id}" aria-pressed="false">${c?`<span class="wg-dot" style="background:${c}"></span>`:''}${label}</button>`).join('')}</div>
<p class="mini-note"><b>Chaque tracé crée un équipement.</b> Cliquez-glissez pour en poser un, recommencez pour en poser un deuxième. Un équipement peut prendre n’importe quelle forme.</p>
<label class="chk chk-mini"><input type="checkbox" id="wg-extend"> Agrandir l’équipement sélectionné au lieu d’en créer un nouveau</label>
<details class="inline-help"><summary>Codes, gomme et limites</summary><p class="mini-note">La gomme retire des cases ; retirer la dernière supprime l’équipement. « Déplacer » sélectionne et fait glisser. Chaque équipement porte un code : T = table, C = chaîne, R = ligne robot, D = desserte, TR = trolley.</p><p class="mini-note">« Fusionner en une surface » réunit les cases d’un atelier en un seul aplat, une fois son dessin arrêté. Le détail revient en un clic, sans changer les codes.</p><p class="mini-note">Le fond n’est pas calibré : les cases de 50 × 50 cm sont théoriques, pas un relevé réel. Seules les personnes affectées sont lues par le moteur.</p></details>
<h3 class="wg-etape"><span>3</span> Équipements et personnes</h3>
<div id="wg-postes-total" class="wg-total"></div>
<div id="wg-items"></div>
<div id="wg-item-properties" hidden><label>Nom de l’équipement<input id="wg-item-name" maxlength="120"></label><label>Personnes à cet équipement<input id="wg-item-postes" type="number" min="0" max="99" step="1"></label><div class="wg-actions"><button class="btn" id="wg-rotate">Pivoter 90°</button><button class="btn" id="wg-delete-item">Supprimer</button></div></div>
<button class="btn" id="wg-library">Modèles de tables et chaînes…</button></div>
<div class="wg-actions"><button class="btn" id="wg-undo">Annuler</button><button class="btn" id="wg-redo">Rétablir</button></div><details id="wg-settings"><summary>Grille et sauvegarde</summary><label>Taille visuelle d’une case (unités du dessin)<input type="number" id="wg-step" min="10" max="200" step="1"></label><p class="mini-note">Réglage commun à l’unité, indépendant d’une mesure réelle. Verrouillé dès qu’un équipement est placé.</p><div class="wg-actions"><button class="btn" id="wg-export">Exporter les ateliers</button><button class="btn" id="wg-import-button">Importer</button><input id="wg-import" type="file" accept=".json" hidden></div></details>`;
  document.querySelector('.workbench').appendChild(panel);
  const warning=document.createElement('p');warning.id='wg-placement-warning';warning.className='mini-note';warning.setAttribute('role','status');document.getElementById('wg-status').after(warning);
  const dialog=document.createElement('dialog');dialog.id='wg-library-dialog';dialog.innerHTML='<div class="wg-dialog-head"><strong>Bibliothèque existante — modèles et assemblages</strong><button class="btn" id="wg-close-library">Retour au plan</button></div><p>Créez ou sélectionnez un modèle / assemblage, puis cliquez « Placer dans le service ».</p><iframe id="wg-library-frame" title="Éditeur de tables, chaînes et assemblages"></iframe>';document.body.appendChild(dialog);
 }
 bind(){
  const on=(id,event,fn)=>document.getElementById(id).addEventListener(event,fn);
  on('wg-overview','click',()=>this.a.overview());on('wg-focus','click',()=>{if(this.zone)this.a.focus(this.zone);});
  on('wg-add-group','click',()=>this.change(()=>{const w={id:uid(),service:this.service,nom:'Atelier '+(this.state.workshops.filter(w=>w.service===this.service).length+1)};this.state.workshops.push(w);this.workshop=w.id;this.selected=null;},'Atelier créé. Choisissez Table ou Chaîne et dessinez.'));
  on('wg-validate','click',()=>this.change(()=>{
   const w=this.state.workshops.find(w=>w.id===this.workshop);if(!w)return;
   if(w.validated){w.validated=false;return;}
   const items=this.state.items.filter(i=>i.workshop===w.id);if(!items.length)throw Error('Dessinez des cases avant de valider.');
   for(const item of items)this.assertPlacement(item);
   w.validated=true;this.tool='select';this.selected=null;
  },'État de l’atelier enregistré.'));
  on('wg-extend','change',e=>{this.extend=e.target.checked;});
  on('wg-groups','click',e=>{const b=e.target.closest('[data-wg-group]');if(b){this.workshop=b.dataset.wgGroup;this.selected=null;this.render();}});
  on('wg-group-name','change',e=>{const value=e.target.value;this.change(()=>{const w=this.state.workshops.find(w=>w.id===this.workshop);if(w)w.nom=value;},'Atelier renommé.');});
  on('wg-delete-group','click',()=>{if(this.workshop&&confirm('Supprimer cet atelier et ses équipements ? Vous pourrez annuler.'))this.change(()=>{this.state.items=this.state.items.filter(i=>i.workshop!==this.workshop);this.state.workshops=this.state.workshops.filter(w=>w.id!==this.workshop);this.workshop=null;this.selected=null;},'Atelier supprimé.');});
  document.querySelectorAll('[data-wg-tool]').forEach(b=>b.addEventListener('click',()=>{this.tool=b.dataset.wgTool;this.stamp=null;this.render();}));
  on('wg-items','click',e=>{const b=e.target.closest('[data-wg-item]');if(b){this.selected=b.dataset.wgItem;const it=this.item;if(it)this.workshop=it.workshop;this.tool='select';this.render();}});
  on('wg-item-name','change',e=>{const value=e.target.value;this.change(()=>{if(this.item)this.item.nom=value;},'Équipement renommé.');});
  on('wg-item-postes','change',e=>{const n=Math.max(0,Math.min(99,Math.round(+e.target.value||0)));e.target.value=n;this.change(()=>{if(this.item){if(n)this.item.postes=n;else delete this.item.postes;}},n?n+' personne(s) affectée(s).':'Aucune personne à cet équipement.');});
  on('wg-delete-item','click',()=>this.change(()=>{this.state.items=this.state.items.filter(i=>i.id!==this.selected);this.selected=null;},'Équipement supprimé.'));
  on('wg-rotate','click',()=>this.change(()=>{if(this.item){this.item.cells=rotate(this.item.cells);this.assertPlacement(this.item);}},'Équipement pivoté.'));
  on('wg-undo','click',()=>this.history(false));on('wg-redo','click',()=>this.history(true));
  on('wg-step','change',e=>{const value=+e.target.value;this.change(()=>{if(this.state.items.length)throw Error('La grille est verrouillée tant que des équipements existent.');this.state.step=value;},'Grille ajustée.');});
  on('wg-export','click',()=>{const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([JSON.stringify(this.state,null,2)],{type:'application/json'}));link.download='ateliers-ory.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);});
  on('wg-import-button','click',()=>document.getElementById('wg-import').click());on('wg-import','change',async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>5*1024*1024)throw Error('Maximum 5 Mo.');const state=validate(JSON.parse(await f.text()));if(confirm('Remplacer les ateliers enregistrés ? Cette action est annulable.'))this.change(()=>{this.state=state;this.workshop=null;this.selected=null;},'Ateliers importés. Vérifiez leur position sur votre plan.');}catch(err){this.status('Import refusé : '+err.message);}finally{e.target.value='';}});
  on('wg-library','click',()=>{const frame=document.getElementById('wg-library-frame');if(!frame.hasAttribute('src'))frame.src='postes/index.html?integrated=1';document.getElementById('wg-library-dialog').showModal();});
  on('wg-close-library','click',()=>document.getElementById('wg-library-dialog').close());
  window.addEventListener('message',e=>{const frame=document.getElementById('wg-library-frame');if(e.source!==frame.contentWindow||!['null',location.origin].includes(e.origin)||e.data?.type!=='ory-place-selection'||!this.active||!this.zone)return;
   try{const payload=e.data.payload;if(!Array.isArray(payload)||!payload.length||payload.length>200)throw Error('Sélection invalide.');this.stamp=payload.map(p=>{const cells=footprint(p.model);if(![0,90,180,270].includes(p.rot)||![p.x,p.y].every(Number.isFinite))throw Error('Position invalide.');let shape=cells;for(let r=0;r<p.rot;r+=90)shape=rotate(shape);const postes=Array.isArray(p.model.postes)?Math.min(99,p.model.postes.length):0;
   return{type:p.model.type,nom:String(p.model.nom||TYPES[p.model.type]).slice(0,120),...(postes?{postes}:{}),cells:shape.map(c=>{const [x,y]=xy(c);return key(x+Math.round(p.x),y+Math.round(p.y));}),source:clone(p.model)};});this.tool='stamp';document.getElementById('wg-library-dialog').close();this.status('Cliquez dans le service pour poser la sélection. Encombrements arrondis à la case supérieure pour les meubles en cm.');this.render();}catch(err){this.status('Modèle refusé : '+err.message);}
  });
  this.a.svg.addEventListener('pointerdown',e=>this.down(e),true);this.a.svg.addEventListener('pointermove',e=>this.move(e),true);this.a.svg.addEventListener('pointerup',e=>this.up(e),true);
  this.a.svg.addEventListener('pointercancel',()=>{if(this.gesture){this.state=this.gesture.before;this.gesture=null;this.render();}});
  this.a.svg.addEventListener('click',e=>{if(this.blockClick){e.stopImmediatePropagation();this.blockClick=false;}},true);
 }
 setActive(active){this.active=active;document.body.classList.toggle('workshops-open',active);document.getElementById('workshop-panel').hidden=!active;if(!active){this.stamp=null;this.tool='select';}this.render();}
 selectService(id){this.service=id;this.selected=null;this.workshop=this.state.workshops.find(w=>w.service===id)?.id||null;this.stamp=null;this.tool='select';this.render();if(this.zone){this.a.focus(this.zone);this.status('Service cadré au zoom maximal. Créez un atelier, puis peignez ses équipements.');}}
 ensureGroup(){if(!this.workshop){const w={id:uid(),service:this.service,nom:'Atelier 1'};this.state.workshops.push(w);this.workshop=w.id;}}
 itemsForService(){const ids=new Set(this.state.workshops.filter(w=>w.service===this.service).map(w=>w.id));return this.state.items.filter(i=>ids.has(i.workshop));}
 point(e){const p=this.a.svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const q=p.matrixTransform(this.layer.getScreenCTM().inverse());return [Math.floor(q.x/this.state.step),Math.floor(q.y/this.state.step)];}
 assertPlacement(item){if(!item.cells.every(c=>cellInside(c,this.zone,this.state.step)))throw Error('L’équipement doit rester dans le service.');const cells=new Set(item.cells);if(this.itemsForService().some(i=>i.id!==item.id&&i.cells.some(c=>cells.has(c))))throw Error('Une case est déjà occupée.');}
 down(e){if(!this.active||!this.zone||e.button!==0)return;const p=this.point(e),c=key(...p);if(!cellInside(c,this.zone,this.state.step))return;
  const hit=this.itemsForService().find(i=>i.cells.includes(c));if(this.tool==='select'&&!hit)return;
  e.preventDefault();e.stopImmediatePropagation();this.blockClick=true;this.a.svg.setPointerCapture(e.pointerId);this.gesture={before:clone(this.state),start:p,last:p};
  if(this.tool==='select'){this.selected=hit.id;this.workshop=hit.workshop;this.gesture.original=clone(hit);}
  else if(this.tool==='stamp'){try{this.ensureGroup();for(const s of this.stamp){const item={...clone(s),id:uid(),workshop:this.workshop,cells:s.cells.map(c=>{const [x,y]=xy(c);return key(x+p[0],y+p[1]);})};this.assertPlacement(item);this.state.items.push(item);this.selected=item.id;}}catch(err){this.state=this.gesture.before;this.status(err.message);this.gesture.failed=true;}}
  else {
   // UN TRACÉ = UN ÉQUIPEMENT. Sans cette ligne, un deuxième tracé prolongeait
   // le premier : deux tables posées à deux endroits n'en faisaient qu'une.
   if(!this.extend&&Object.hasOwn(TYPES,this.tool))this.selected=null;
   this.paint(c);
  }this.render();
 }
 paint(c){if(!cellInside(c,this.zone,this.state.step))return;const hit=this.itemsForService().find(i=>i.cells.includes(c));
  if(this.tool==='erase'){if(hit){hit.cells=hit.cells.filter(v=>v!==c);if(!hit.cells.length)this.state.items=this.state.items.filter(i=>i.id!==hit.id);}return;}
  if(hit||!Object.hasOwn(TYPES,this.tool))return;this.ensureGroup();let item=this.item;
  if(!item||item.type!==this.tool||item.workshop!==this.workshop){item={id:uid(),workshop:this.workshop,type:this.tool,nom:TYPES[this.tool]+' '+(this.state.items.length+1),cells:[]};this.state.items.push(item);this.selected=item.id;}item.cells.push(c);
 }
 move(e){if(!this.gesture)return;e.stopImmediatePropagation();const p=this.point(e),g=this.gesture;
  if(this.tool==='select'){const item=this.item;const original=g.original;item.cells=original.cells.map(c=>{const [x,y]=xy(c);return key(x+p[0]-g.start[0],y+p[1]-g.start[1]);});try{this.assertPlacement(item);}catch{item.cells=clone(original.cells);} }
  else if(this.tool!=='stamp'){const [x,y]=g.last,dx=p[0]-x,dy=p[1]-y,n=Math.max(Math.abs(dx),Math.abs(dy));for(let i=1;i<=Math.min(n,2000);i++)this.paint(key(Math.round(x+dx*i/n),Math.round(y+dy*i/n)));}g.last=p;this.renderCanvas();
 }
 up(e){if(!this.gesture)return;e.stopImmediatePropagation();const g=this.gesture;this.gesture=null;if(this.a.svg.hasPointerCapture(e.pointerId))this.a.svg.releasePointerCapture(e.pointerId);this.finish(g.before,g.failed?'Placement annulé.':'Aménagement enregistré.');}
 change(fn,message){const before=clone(this.state);try{fn();this.finish(before,message);}catch(err){this.state=before;this.render();this.status(err.message);}}
 finish(before,message){
  const shape=(state,id)=>JSON.stringify(state.items.filter(i=>i.workshop===id).map(i=>({id:i.id,type:i.type,cells:i.cells})));
  let reopened=false;for(const w of this.state.workshops)if(w.validated&&before.workshops.some(old=>old.id===w.id&&old.validated)&&shape(before,w.id)!==shape(this.state,w.id)){w.validated=false;reopened=true;}
  if(reopened)message='Atelier modifié : validez à nouveau pour fusionner les cases.';
  try{this.state=validate(this.state);}catch(err){this.state=before;this.render();this.status(err.message);return;}if(JSON.stringify(before)!==JSON.stringify(this.state)){this.undoStack.push(before);if(this.undoStack.length>80)this.undoStack.shift();this.redoStack=[];}this.render();this.save(message);}
 save(message){try{localStorage.setItem('ory-workshops-v1',JSON.stringify(this.state));this.status(message);}catch{this.status('Sauvegarde impossible : exportez les ateliers avant de quitter.');}}
 history(redo){const from=redo?this.redoStack:this.undoStack,to=redo?this.undoStack:this.redoStack;if(!from.length)return;to.push(clone(this.state));this.state=from.pop();this.selected=null;this.render();this.save(redo?'Action rétablie.':'Action annulée.');}
 render(){
  document.body.classList.toggle('workshop-focused',this.active&&!!this.zone);
  const invalid=this.state.items.filter(i=>{const owner=this.state.workshops.find(w=>w.id===i.workshop)?.service,z=this.a.zones().find(z=>z.id===owner);return !z||i.cells.some(c=>!cellInside(c,z,this.state.step));}).length;
  const orphan=this.state.workshops.filter(w=>!this.a.zones().some(z=>z.id===w.service)).length;
  document.getElementById('wg-placement-warning').textContent=invalid||orphan?`${invalid} équipement(s) hors contour / service absent ; ${orphan} atelier(s) sans service reconnu. Données conservées : corrigez le plan, déplacez les équipements ou exportez-les.`:'';
  const groups=this.state.workshops.filter(w=>w.service===this.service);if(!groups.some(w=>w.id===this.workshop))this.workshop=groups[0]?.id||null;if(!this.item)this.selected=null;
  document.getElementById('wg-controls').hidden=!this.zone;document.getElementById('wg-service').textContent=this.zone?this.zone.nom:'Choisissez un service sur la carte.';
  // Les ateliers du service sont VISIBLES, pas cachés dans un menu déroulant :
  // on voit d'un coup d'œil combien il y en a et ce que chacun contient.
  document.getElementById('wg-groups').innerHTML=groups.length?groups.map(w=>{
   const items=this.state.items.filter(i=>i.workshop===w.id);
   const pers=items.reduce((n,i)=>n+(i.postes||0),0);
   return `<button class="wg-group-btn" data-wg-group="${esc(w.id)}" aria-pressed="${w.id===this.workshop}"><b>${esc(w.nom)}</b><span>${items.length} équipement${items.length>1?'s':''} · ${pers} personne${pers>1?'s':''}${w.validated?' · surface fusionnée':''}</span></button>`;
  }).join(''):'<p class="mini-note">Aucun atelier dans ce service. Dessinez directement : le premier sera créé pour vous.</p>';
  const assign=(id,value)=>{const e=document.getElementById(id);if(document.activeElement!==e)e.value=value;};assign('wg-group-name',groups.find(w=>w.id===this.workshop)?.nom||'');document.getElementById('wg-group-name').disabled=!this.workshop;
  const group=groups.find(w=>w.id===this.workshop),filled=this.state.items.some(i=>i.workshop===this.workshop);
  document.getElementById('wg-validate').disabled=!group||!filled;
  document.getElementById('wg-validate').textContent=group?.validated?'Reprendre le détail':'Fusionner en une surface';
  document.getElementById('wg-validation-state').textContent=group?(group.validated?'Surface fusionnée : les cases ne se distinguent plus.':'En cours de dessin : chaque équipement se voit.'):'';
  document.getElementById('wg-delete-group').disabled=!this.workshop;document.getElementById('wg-focus').disabled=!this.zone;
  document.querySelectorAll('[data-wg-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.wgTool===this.tool)));
  // TOUS les équipements du service, groupés par atelier : c'est ce qui montre
  // qu'un atelier en contient autant qu'on veut.
  document.getElementById('wg-items').innerHTML=groups.map(w=>{
   const items=this.state.items.filter(i=>i.workshop===w.id);
   if(!items.length)return '';
   return `<div class="wg-item-group"${w.id===this.workshop?' data-wg-courant="1"':''}><h4>${esc(w.nom)}</h4>`+items.map(i=>`<button class="btn wg-item" data-wg-item="${esc(i.id)}" aria-pressed="${i.id===this.selected}"><span class="wg-dot" style="background:${COLORS[i.type]}"></span>${i.code?esc(i.code)+' · ':''}${esc(i.nom)} · ${i.cells.length} cases${i.postes?' · '+i.postes+' pers.':''}</button>`).join('')+'</div>';
  }).join('')||'<p class="mini-note">Aucun équipement pour l’instant : choisissez Table, Chaîne ou Ligne robot, puis cliquez-glissez sur la grille.</p>';
  const parAtelier=this.state.items.filter(i=>i.workshop===this.workshop).reduce((n,i)=>n+(i.postes||0),0);
  const parService=this.itemsForService().reduce((n,i)=>n+(i.postes||0),0);
  document.getElementById('wg-postes-total').textContent=this.zone
   ? 'Personnes affectées — ce service : '+parService+' · atelier courant : '+parAtelier
   : '';
  document.getElementById('wg-item-properties').hidden=!this.item;assign('wg-item-name',this.item?.nom||'');assign('wg-item-postes',String(this.item?.postes||0));
  const ext=document.getElementById('wg-extend');ext.checked=!!this.extend;ext.disabled=!this.item;assign('wg-step',this.state.step);document.getElementById('wg-step').disabled=!!this.state.items.length;
  document.getElementById('wg-undo').disabled=!this.undoStack.length;document.getElementById('wg-redo').disabled=!this.redoStack.length;this.renderCanvas();
 }
 renderCanvas(){this.layer.replaceChildren();if(!this.active||!this.zone)return;const z=this.zone,s=this.state.step,scale=Math.hypot(this.layer.getScreenCTM()?.a||1,this.layer.getScreenCTM()?.b||0);
  const defs=this.el('defs'),clip=this.el('clipPath',{id:'wg-service-clip'});clip.appendChild(z.pts?this.el('polygon',{points:z.pts.map(p=>p.join(',')).join(' ')}):this.el('rect',{x:z.x,y:z.y,width:z.w,height:z.h}));defs.appendChild(clip);
  const pattern=this.el('pattern',{id:'wg-pattern',width:s,height:s,patternUnits:'userSpaceOnUse'});pattern.appendChild(this.el('path',{d:`M ${s} 0 H 0 V ${s}`,fill:'none',stroke:'#6e8396','stroke-width':.6/scale}));defs.appendChild(pattern);this.layer.appendChild(defs);
  const g=this.el('g',{'clip-path':'url(#wg-service-clip)'});g.appendChild(this.el('rect',{x:z.x,y:z.y,width:z.w,height:z.h,fill:'url(#wg-pattern)','pointer-events':'none'}));this.layer.appendChild(g);
  const confirmed=new Set();
  for(const w of this.state.workshops.filter(w=>w.service===this.service&&w.validated)){
   confirmed.add(w.id);const cells=this.state.items.filter(i=>i.workshop===w.id).flatMap(i=>i.cells),shape=surface(cells,s);
   const area=this.el('g',{'data-workshop-surface':w.id});
   area.appendChild(this.el('path',{d:shape.fill,fill:'var(--accent)','fill-opacity':.22,stroke:'none'}));
   area.appendChild(this.el('path',{d:shape.outline,fill:'none',stroke:'var(--accent)','stroke-width':2/scale}));g.appendChild(area);
  }
  for(const item of this.itemsForService().filter(i=>!confirmed.has(i.workshop)))for(const c of item.cells){const [x,y]=xy(c);g.appendChild(this.el('rect',{x:x*s+1/scale,y:y*s+1/scale,width:s-2/scale,height:s-2/scale,fill:COLORS[item.type],opacity:item.workshop===this.workshop?.toString()?'.85':'.55',stroke:item.id===this.selected?'#102c40':'#fff','stroke-width':item.id===this.selected?2/scale:.6/scale,'data-workshop-item':item.id}));}
  // Anchor on an occupied cell, never in a hole or outside an L-shaped footprint.
  for(const item of this.itemsForService().filter(i=>i.code)){
   const cells=item.cells;if(!cells.length)continue;
   const [x,y]=cells.map(xy).sort((a,b)=>a[1]-b[1]||a[0]-b[0])[0];
   const label=this.el('text',{x:(x+.5)*s,y:(y+.5)*s,'text-anchor':'middle','dominant-baseline':'central','font-size':12/scale,'font-weight':700,fill:'var(--txt)',stroke:'var(--bg3)','stroke-width':4/scale,'paint-order':'stroke','pointer-events':'none','data-equipment-code':item.id});label.textContent=item.code+(item.postes?' · '+item.postes+'p':'');this.layer.appendChild(label);
  }
 }
}
const api={WorkshopGrid,validate,inside,cellInside,rotate,footprint,surface,nextCode};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.OrlyWorkshops=api;
})(typeof globalThis!=='undefined'?globalThis:this);

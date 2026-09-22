/* Configuration des liaisons : indépendante du calcul de charge du démonstrateur. */
(function(root){
'use strict';
const TYPES={personnel:{label:'Personnel du service',family:'human',color:'#167b76'},runner:{label:'Runner',family:'human',color:'#167b76'},material:{label:'Matériel',family:'material',color:'#7552ac'},raw:{label:'Matières premières',family:'matter',color:'#b16b10'},processed:{label:'Matières transformées',family:'matter',color:'#ce532c'},of:{label:'OF',family:'information',color:'#2769ac'},kanban:{label:'Kanban',family:'information',color:'#2769ac'},unclassified:{label:'À classer',family:'unclassified',color:'#74818b'}};
const FAMILIES={all:'Tous',human:'Humains',material:'Matériels',matter:'Matières',information:'Informations',unclassified:'À classer'};
const clone=x=>JSON.parse(JSON.stringify(x));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=> 'flow-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);
const endpointId=(service,storage=null)=>JSON.stringify([service,storage]);
/* Une annexe — « Armement 2 » — est un emplacement comme un autre : on doit
 * pouvoir lui adresser une liaison. Elle n'a pas de stockages propres. */
function endpoints(zones){return zones.filter(z=>z.kind==='service'||z.kind==='annexe').flatMap(z=>[{id:endpointId(z.id),owner:z.id,label:z.nom,service:true},...(z.storages||[]).map(s=>({id:endpointId(z.id,s.id),owner:z.id,label:z.nom+' / '+s.nom,service:false}))]);}
function parseEndpoint(id){
 if(typeof id!=='string'||id.length>400)throw Error('Origine ou destination invalide.');
 let p;try{p=JSON.parse(id);}catch{throw Error('Origine ou destination invalide.');}
 if(!Array.isArray(p)||p.length!==2||typeof p[0]!=='string'||!p[0]||(p[1]!==null&&(typeof p[1]!=='string'||!p[1])))throw Error('Origine ou destination invalide.');
 return p;
}
function validate(raw){
 if(!raw||raw.schema!=='ory-flows'||raw.version!==1||!Array.isArray(raw.flows)||raw.flows.length>2000)throw Error('Fichier de flux v1 attendu (maximum 2 000 liaisons).');
 const ids=new Set(),links=new Set();
 const flows=raw.flows.map(f=>{
  if(!f||typeof f.id!=='string'||!f.id||f.id.length>160||ids.has(f.id)||!Object.hasOwn(TYPES,f.type)||typeof f.enabled!=='boolean'||typeof f.label!=='string'||f.label.length>200)throw Error('Liaison invalide ou identifiant en double.');
  const a=parseEndpoint(f.from),b=parseEndpoint(f.to);
  if(f.from===f.to)throw Error('Choisissez deux emplacements distincts. La circulation dans un service est déjà gérée par sa règle interne.');
  if(f.type==='personnel'&&a[0]!==b[0])throw Error('Seuls les runners peuvent circuler entre les services.');
  const key=JSON.stringify([f.type,f.from,f.to]);if(links.has(key))throw Error('Cette liaison existe déjà pour ce type de flux.');
  ids.add(f.id);links.add(key);return{id:f.id,type:f.type,from:f.from,to:f.to,enabled:f.enabled,label:f.label};
 });
 if(!raw.internal||typeof raw.internal!=='object'||Array.isArray(raw.internal)||Object.keys(raw.internal).length>500||Object.entries(raw.internal).some(([k,v])=>!k||k.length>160||typeof v!=='boolean'))throw Error('Règles internes invalides.');
 return {schema:'ory-flows',version:1,flows,internal:Object.fromEntries(Object.entries(raw.internal))};
}
function usable(f,points){return f.enabled&&f.type!=='unclassified'&&points.some(p=>p.id===f.from)&&points.some(p=>p.id===f.to);}
function canTravel(state,points,from,to,role){
 if(!['personnel','runner'].includes(role))return false;
 const a=points.find(p=>p.id===from),b=points.find(p=>p.id===to);if(!a||!b)return false;
 if(a.owner===b.owner&&state.internal[a.owner]!==false)return true;
 if(a.owner!==b.owner&&role!=='runner')return false;
 return state.flows.some(f=>usable(f,points)&&f.from===from&&f.to===to&&(f.type===role||(role==='runner'&&f.type==='personnel')));
}
function initial(pairs){return validate({schema:'ory-flows',version:1,internal:{},flows:pairs.map(([a,b],i)=>({id:'legacy-flow-'+i,type:'unclassified',from:endpointId(a),to:endpointId(b),enabled:true,label:''}))});}
class FlowCenter{
 constructor(adapter){
  this.a=adapter;this.host=document.getElementById('view-flux');this.family='all';this.service='';this.undoStack=[];this.redoStack=[];this.state=initial(adapter.legacy);this.mapFilter='all';this.mapOwner='';
  let warning='';try{const saved=localStorage.getItem('orly-flows-v1');if(saved)this.state=validate(JSON.parse(saved));}catch(e){warning='Configuration enregistrée non chargée : '+e.message+' La copie reste conservée.';}
  this.build();this.bind();this.refresh();this.status(warning||'Configuration locale · liaisons non classées à préciser.');
 }
 get points(){return endpoints(this.a.zones());}
 status(message){document.getElementById('fc-status').textContent=message;}
 build(){
  this.host.innerHTML=`<div class="fc-heading"><div><p class="scope-badge">Ce graphe donne le parcours des compagnies × classes</p></div><div class="fc-actions"><button class="btn" id="fc-undo">Annuler</button><button class="btn" id="fc-redo">Rétablir</button><button class="btn" id="fc-export">Exporter</button><button class="btn" id="fc-import-button">Importer</button><input id="fc-import" type="file" accept=".json" hidden></div></div>
   <div id="fc-status" role="status" aria-live="polite"></div>
   <section id="fc-lecture" class="fc-lecture">
    <h3 class="fc-list-title">Ce que le modèle en lit</h3>
    <p class="mini-note">Un service ne travaille une classe que lorsque <b>tous ses fournisseurs</b>
     la lui ont livrée. Seul compte ici le <b>sens</b> des liaisons actives, d'un service à un autre :
     la famille de flux, les stockages et la précision restent de la description.</p>
    <div id="fc-alertes"></div>
    <div id="fc-parcours"></div>
   </section>
   <h3 class="fc-list-title">Les liaisons</h3>
   <nav id="fc-families" class="fc-families" aria-label="Familles de flux"></nav>
   <div class="fc-filters"><label>Service concerné<select id="fc-service"></select></label><span id="fc-summary"></span><button class="btn" id="fc-show-map">Voir ces flux sur le plan</button><button class="btn btn-play" id="fc-new">+ Nouvelle liaison</button></div>
   <form id="fc-add" class="fc-creation" hidden><div class="fc-creation-head"><h3>Nouvelle liaison</h3><button class="text-button" type="button" id="fc-cancel">Fermer</button></div><div class="fc-fields"><label>Flux<select id="fc-type">${this.typeOptions('material',false)}</select></label><label>Origine<select id="fc-from" required></select></label><label>Destination<select id="fc-to" required></select></label><label>Précision facultative<input id="fc-label" maxlength="200" placeholder="Ex. matériel propre"></label></div><button class="btn btn-play" type="submit">Ajouter la liaison</button></form>
   <div id="fc-list"></div>
   <details id="fc-rules" class="fc-rules"><summary>Circulation humaine à l’intérieur des services</summary><p class="mini-note">Description seule : le modèle ne déplace pas encore les personnes. Par défaut, chacun circule dans son service et ses stockages ; sortir demande une liaison Runner explicite, dans le sens indiqué.</p><div id="fc-internal"></div></details>`;
  const label=document.createElement('label');label.className='fc-map-filter';label.innerHTML=`Flux affichés <select id="fc-map-filter" title="Liaisons entre services. Les échanges internes sont décrits dans le Centre des flux.">${Object.entries(FAMILIES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}<option value="none">Aucun</option></select><span id="fc-map-scope"></span>`;document.querySelector('.map-footer').appendChild(label);
 }
 typeOptions(value,pending=true){return Object.entries(FAMILIES).filter(([k])=>k!=='all'&&(pending||k!=='unclassified')).map(([family,label])=>`<optgroup label="${label}">${Object.entries(TYPES).filter(([,t])=>t.family===family).map(([k,t])=>`<option value="${k}" ${k===value?'selected':''}>${t.label}</option>`).join('')}</optgroup>`).join('');}
 pointOptions(value,allowed=this.points){
  let html='<option value="">Choisir…</option>';
  for(const service of this.points.filter(p=>p.service)){
   const ps=allowed.filter(p=>p.owner===service.owner);if(!ps.length)continue;
   html+=`<optgroup label="${esc(service.label)}">${ps.map(p=>`<option value="${esc(p.id)}" ${p.id===value?'selected':''}>${esc(p.service?'Service · '+p.label:'Stockage · '+p.label)}</option>`).join('')}</optgroup>`;
  }
  if(value&&!allowed.some(p=>p.id===value))html+=`<option value="${esc(value)}" selected>Emplacement absent · à remplacer</option>`;
  return html;
 }
 bind(){
  const on=(id,event,fn)=>document.getElementById(id).addEventListener(event,fn);
  on('fc-families','click',e=>{const b=e.target.closest('[data-family]');if(b){this.family=b.dataset.family;const type={human:'runner',material:'material',matter:'raw',information:'of'}[this.family];if(type){document.getElementById('fc-type').value=type;this.refreshAdd();}this.render();}});
  on('fc-service','change',e=>{this.service=e.target.value;this.render();});
  on('fc-type','change',()=>this.refreshAdd());on('fc-from','change',()=>this.refreshAdd());
  on('fc-add','submit',e=>{e.preventDefault();const from=document.getElementById('fc-from').value,to=document.getElementById('fc-to').value;
   if(!from||!to){this.status('Choisissez une origine et une destination.');return;}
   const flow={id:uid(),type:document.getElementById('fc-type').value,from,to,enabled:true,label:document.getElementById('fc-label').value};
   if(this.change(()=>this.state.flows.push(flow),'Liaison ajoutée.')){this.family=TYPES[flow.type].family;document.getElementById('fc-label').value='';this.render();}
  });
  on('fc-list','change',e=>{const field=e.target.dataset.field,id=e.target.closest('[data-flow]')?.dataset.flow;if(!field||!id)return;const value=field==='enabled'?e.target.checked:e.target.value;if((field==='from'||field==='to')&&!value){this.render();return;}this.change(()=>{this.state.flows.find(f=>f.id===id)[field]=value;},'Liaison enregistrée.');});
  on('fc-list','click',e=>{const b=e.target.closest('[data-action]'),id=b?.closest('[data-flow]')?.dataset.flow;if(!id)return;
   this.change(()=>{const flow=this.state.flows.find(f=>f.id===id);if(b.dataset.action==='delete')this.state.flows=this.state.flows.filter(f=>f.id!==id);if(b.dataset.action==='reverse')this.state.flows.push({...flow,id:uid(),from:flow.to,to:flow.from});},b.dataset.action==='delete'?'Liaison supprimée. Vous pouvez annuler.':'Liaison retour ajoutée.');
  });
  on('fc-internal','change',e=>{const owner=e.target.dataset.owner,value=e.target.checked;if(owner)this.change(()=>{Object.defineProperty(this.state.internal,owner,{value,enumerable:true,writable:true,configurable:true});},'Règle de circulation interne enregistrée.');});
  on('fc-undo','click',()=>this.history(false));on('fc-redo','click',()=>this.history(true));
  on('fc-show-map','click',()=>{this.mapFilter=this.family;this.mapOwner=this.service;document.getElementById('fc-map-filter').value=this.mapFilter;this.a.changed();this.a.showMap();});
  on('fc-map-filter','change',e=>{this.mapFilter=e.target.value;this.mapOwner='';this.a.changed();});
  // Le formulaire ne vit plus au milieu des liaisons : on l'ouvre quand on en
  // veut une nouvelle, et il reste ouvert tant qu'on en enchaîne.
  on('fc-new','click',()=>{const f=document.getElementById('fc-add');f.hidden=false;f.scrollIntoView({block:'nearest'});document.getElementById('fc-type').focus();});
  on('fc-cancel','click',()=>{document.getElementById('fc-add').hidden=true;document.getElementById('fc-new').focus();});
  on('fc-export','click',()=>this.export());on('fc-import-button','click',()=>document.getElementById('fc-import').click());
  on('fc-import','change',e=>this.import(e));
 }
 refreshAdd(){
  const from=document.getElementById('fc-from'),to=document.getElementById('fc-to'),type=document.getElementById('fc-type').value;
  const a=from.value,b=to.value;from.innerHTML=this.pointOptions(this.points.some(p=>p.id===a)?a:'');
  const owner=this.points.find(p=>p.id===from.value)?.owner;
  const allowed=this.points.filter(p=>p.id!==from.value&&(type!=='personnel'||p.owner===owner));
  to.innerHTML=this.pointOptions(allowed.some(p=>p.id===b)?b:'',allowed);
 }
 refresh(){this.refreshAdd();this.render();this.a.changed();}
 change(fn,message){
  const before=clone(this.state);try{fn();this.state=validate(this.state);}catch(e){this.state=before;this.render();this.status(e.message);return false;}
  if(JSON.stringify(before)!==JSON.stringify(this.state)){this.undoStack.push(before);if(this.undoStack.length>80)this.undoStack.shift();this.redoStack=[];}
  this.render();this.a.changed();this.save(message);return true;
 }
 save(message){try{localStorage.setItem('orly-flows-v1',JSON.stringify(this.state));this.status(message);}catch{this.status('Sauvegarde impossible. Exportez vos flux avant de fermer la page.');this.a.notify('Sauvegarde des flux impossible : exportez la configuration.');}}
 history(redo){const source=redo?this.redoStack:this.undoStack,target=redo?this.undoStack:this.redoStack;if(!source.length)return;target.push(clone(this.state));this.state=source.pop();this.render();this.a.changed();this.save(redo?'Action rétablie.':'Action annulée.');}
 visibleFlows(){return this.state.flows.filter(f=>(this.family==='all'||TYPES[f.type].family===this.family)&&(!this.service||parseEndpoint(f.from)[0]===this.service||parseEndpoint(f.to)[0]===this.service));}
 mapFlows(){return this.state.flows.filter(f=>f.enabled&&(!this.mapOwner||parseEndpoint(f.from)[0]===this.mapOwner||parseEndpoint(f.to)[0]===this.mapOwner)&&(this.mapFilter==='all'||TYPES[f.type].family===this.mapFilter)&&this.points.some(p=>p.id===f.from)&&this.points.some(p=>p.id===f.to));}
 /* Le parcours tel que le moteur le lit : un service, ses fournisseurs, ses
  * clients. C'est ce qu'on vérifie avant de simuler — le reste de cet onglet
  * décrit, celui-ci décide. */
 renderLecture(){
  const box=document.getElementById('fc-parcours'),alertes=document.getElementById('fc-alertes');
  if(!box)return;
  const lu=this.a.lecture?this.a.lecture():null;
  if(!lu||!lu.lignes.length){
   alertes.innerHTML='';
   box.innerHTML='<p class="mini-note">Aucune équipe n’est encore décrite : le graphe ne porte donc aucun parcours. Créez des ateliers de travail, puis revenez ici.</p>';
   return;
  }
  const nom=id=>esc((lu.noms||{})[id]||id);
  const graves=lu.alertes.filter(a=>a.grave),notes=lu.alertes.filter(a=>!a.grave);
  alertes.innerHTML=(graves.length?`<div class="fc-alerte grave"><b>${graves.length} point(s) à corriger</b><ul>${graves.map(a=>`<li>${esc(a.texte)}</li>`).join('')}</ul></div>`:'')
   +(notes.length?`<div class="fc-alerte"><ul>${notes.map(a=>`<li>${esc(a.texte)}</li>`).join('')}</ul></div>`:'')
   +(!lu.alertes.length?'<p class="fc-alerte ok">Le parcours se lit de bout en bout.</p>':'');
  box.innerHTML=`<table class="fc-table"><thead><tr>
    <th scope="col">Service</th><th scope="col">Ce qu’il est</th>
    <th scope="col">Attend</th><th scope="col">Livre à</th></tr></thead><tbody>`
   +lu.lignes.map(l=>`<tr${l.equipes?'':' class="fc-inerte"'}>
     <th scope="row">${esc(l.nom)}</th>
     <td>${l.dispo?'<span class="fc-nature dispo">mise à disposition</span>'
        :l.equipes?esc(l.equipes+' équipe'+(l.equipes>1?'s':''))
        :'<span class="fc-nature vide">aucune équipe</span>'}</td>
     <td>${l.amonts.map(nom).join(', ')||'—'}</td>
     <td>${l.avals.map(nom).join(', ')||'—'}</td></tr>`).join('')
   +'</tbody></table>';
 }
 render(){
  this.renderLecture();
  const points=this.points,services=points.filter(p=>p.service),select=document.getElementById('fc-service');
  if(this.service&&!services.some(p=>p.owner===this.service))this.service='';
  select.innerHTML='<option value="">Tous les services</option>'+services.map(p=>`<option value="${esc(p.owner)}" ${p.owner===this.service?'selected':''}>${esc(p.label)}</option>`).join('');
  document.getElementById('fc-families').innerHTML=Object.entries(FAMILIES).map(([k,v])=>`<button class="btn" data-family="${k}" aria-pressed="${k===this.family}">${v} <span>${this.state.flows.filter(f=>k==='all'||TYPES[f.type].family===k).length}</span></button>`).join('');
  document.getElementById('fc-internal').innerHTML=services.map(p=>`<label><input type="checkbox" data-owner="${esc(p.owner)}" ${this.state.internal[p.owner]!==false?'checked':''}> ${esc(p.label)} : circulation interne libre</label>`).join('');
  document.getElementById('fc-rules').open=this.family==='human';
  const flows=this.visibleFlows();const missing=this.state.flows.filter(f=>!points.some(p=>p.id===f.from)||!points.some(p=>p.id===f.to)).length;
  document.getElementById('fc-summary').textContent=flows.length+' liaison(s) affichée(s) · '+this.state.flows.filter(f=>usable(f,points)).length+' active(s) et classée(s)'+(missing?' · '+missing+' à réparer (emplacement absent)':'');
  const list=document.getElementById('fc-list');
  // Keep the card nodes stable on edits, so blur cannot swallow the next button click.
  const structure=JSON.stringify([flows.map(f=>f.id),points]);
  if(list._structure!==structure){
   list.innerHTML=flows.length?flows.map(f=>`<article class="fc-card" data-flow="${esc(f.id)}"><div class="fc-card-head"><strong data-title></strong><label><input data-field="enabled" type="checkbox"> Activer</label></div><div class="fc-fields"><label>Flux<select data-field="type"></select></label><label>Origine<select data-field="from"></select></label><label>Destination<select data-field="to"></select></label><label>Précision facultative<input data-field="label" maxlength="200"></label></div><p class="fc-warning" data-warning></p><div class="fc-actions"><button class="btn" data-action="reverse">Ajouter le retour</button><button class="btn" data-action="delete">Supprimer</button></div></article>`).join(''):'<p class="fc-empty">Aucune liaison dans cette vue. Ajoutez une origine et une destination ci-dessus.</p>';
   list._structure=structure;
  }
  for(const card of list.querySelectorAll('[data-flow]')){
   const f=flows.find(v=>v.id===card.dataset.flow),a=points.find(p=>p.id===f.from),b=points.find(p=>p.id===f.to);
   card.querySelector('[data-title]').textContent=TYPES[f.type].label+' · '+(a?.label||'Origine absente')+' → '+(b?.label||'Destination absente');
   card.querySelector('[data-field=type]').innerHTML=this.typeOptions(f.type);
   card.querySelector('[data-field=from]').innerHTML=this.pointOptions(f.from);
   card.querySelector('[data-field=to]').innerHTML=this.pointOptions(f.to);
   card.querySelector('[data-field=label]').value=f.label;card.querySelector('[data-field=enabled]').checked=f.enabled;
   card.querySelector('[data-warning]').textContent=!a||!b?'Emplacement supprimé ou absent : liaison conservée mais inutilisable. Choisissez un nouvel emplacement.':f.type==='unclassified'?'Ancienne liaison : choisissez sa famille avant de l’utiliser.':!f.enabled?'Liaison désactivée.':'';
  }
  document.getElementById('fc-undo').disabled=!this.undoStack.length;document.getElementById('fc-redo').disabled=!this.redoStack.length;
 }
 export(){const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([JSON.stringify(this.state,null,2)],{type:'application/json'}));link.download='centre-flux-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);this.status('Flux et règles humaines exportés. Les emplacements sont référencés par leurs identifiants du plan.');}
 async import(e){const file=e.target.files[0];if(!file)return;try{if(file.size>2*1024*1024)throw Error('Fichier trop volumineux (2 Mo maximum).');const state=validate(JSON.parse(await file.text()));if(!confirm('Remplacer la configuration des flux ? Cette action est annulable.'))return;this.change(()=>{this.state=state;},'Flux importés. Les emplacements absents sont signalés dans la liste.');}catch(err){this.status('Import refusé : '+err.message+' Configuration actuelle conservée.');}finally{e.target.value='';}}
}
const api={TYPES,FAMILIES,endpoints,endpointId,validate,initial,usable,canTravel,FlowCenter};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.OrlyFlows=api;
})(typeof globalThis!=='undefined'?globalThis:this);

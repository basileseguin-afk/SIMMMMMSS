/* « Chemins » (version 1, évolution 22 c) — cinq pages en une, sur l'unité fictive.
 *   1. À gauche, la liste des chemins, avec pour chacun son nombre de commandes et d'étapes ; en tête, « Ajouter un
 *      chemin » ; en bas, « Toutes les commandes ont un chemin », ou le nombre de celles qui n'en ont pas.
 *   2. À droite, le chemin choisi : ses étapes en cases reliées, dans un seul éditeur ; un clic sur une étape montre,
 *      dessous, le tableau « commande, équipe à cette étape, temps par vol ». Une commande sans équipe est « à corriger ».
 *   3. Le nom d'une équipe mène à sa fiche, dans « Services et équipes » ; l'équipe d'une commande se choisit ici.
 *   4. Créer un chemin, y mettre une étape, y rattacher une commande, choisir son équipe à une étape : la sauvegarde
 *      est celle que donnaient les anciennes pages — les mêmes gestes sont faits dans la version 2 (gelée), qui les
 *      porte, et les deux sauvegardes changent des mêmes champs, aux mêmes valeurs.
 *   5. Une commande sans chemin : le bas de la liste la compte, un lien la montre, elle y choisit son chemin.
 *   6. Une variante pour une commande ; les commandes exclues et ajoutées, dans une section repliée.
 *   7. Un chemin à part (celui d'une seule commande) se règle avec le même éditeur.
 *   8. La page ne défile pas : chaque colonne défile seule ; texte de 13 px au moins.
 *   9. (c2) Un seul éditeur de chemin dans l'application : les quatre pages d'avant (« Vue d'ensemble », « Chemin d'une
 *      commande », « Étapes de chaque commande », et les onglets de « Chemins ») n'existent plus.
 *  10. (c2) Leurs noms dans « Aller à… », un lien vers l'une d'elles et la page que le navigateur avait retenue mènent
 *      à « Chemins », au bon endroit ; le chemin d'une commande s'ouvre ici, sur son étape.
 *  11. (c2) « Suivre ces commandes dans les résultats » mène à « Détails › Commandes », le tableau des étapes déplié ;
 *      une cellule ramène au chemin de la commande, sur son étape.
 *  12. (c2) « Liens entre services » n'est jamais au menu : elle s'ouvre depuis les commandes sans chemin.
 *  13. (c2) Dans un service encore sans équipe qui sert toutes les commandes, « + » crée l'équipe du service ;
 *      « Relier à… » relie deux étapes sans la souris.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href,URL_V2=pathToFileURL(path.resolve(__dirname,'../v2/index.html')).href;
const M='#mu-flux';

/** Ce qui a changé d'un état à l'autre : [chemin du champ, sa nouvelle valeur] (absent : `null`), trié. */
function ecarts(avant,apres,chemin='',out=[]){
  if(JSON.stringify(avant)===JSON.stringify(apres))return out;
  const objet=x=>x!==null&&typeof x==='object';
  if(!objet(avant)||!objet(apres)||Array.isArray(avant)!==Array.isArray(apres)){out.push([chemin,apres===undefined?null:apres]);return out;}
  for(const k of new Set([...Object.keys(avant),...Object.keys(apres)]))ecarts(avant[k],apres[k],chemin+'/'+k,out);
  return out.sort((x,y)=>x[0].localeCompare(y[0]));
}

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 const ouvrir=async url=>{
  const ctx=await browser.newContext({viewport:{width:1366,height:768}});
  const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
  const site=await F.charger(page,nav,url,{pageId:'mu-flux'});
  return {page,ctx,site};
 };
 const attendre=(page,ms=300)=>page.waitForTimeout(ms);
 /** L'état des équipes et des chemins, tel que la sauvegarde le porte — les identifiants des chemins et des équipes nés
  *  pendant le test (tirés au hasard) remplacés par leur nom. */
 const sauvegarde=page=>page.evaluate(()=>{
  const e=JSON.parse(localStorage.getItem('ory-ateliers-v1')||'null');if(!e)return null;
  let texte=JSON.stringify(e);
  for(const x of [...(e.parcours||[]),...(e.ateliers||[])])if(/^[a-z]+-[a-z0-9]+-[a-z0-9]+$/i.test(x.id)||x.id.length>12)texte=texte.split(JSON.stringify(x.id)).join(JSON.stringify('«'+x.nom+'»'));
  return JSON.parse(texte);});
 const etat=(page,f,arg)=>page.evaluate(([src,arg])=>(new Function('st','arg','PC','P','return ('+src+')(st,arg,PC,P);'))(Sim.ateliers.state,arg,OrlyParcours,MoteurProduction),[f.toString(),arg===undefined?null:arg]);
 const noeud=async(page,s)=>{await page.locator(`${M} [data-mu-graphe] [data-noeud="${s}"]`).click();await attendre(page);};
 const section=async(page,cle)=>{const d=page.locator(`${M} details[data-ch-section="${cle}"]`);if(!(await d.evaluate(e=>e.open))){await d.locator('> summary').click();await attendre(page,150);}};
 try{
  const v1=await ouvrir(URL_V1),page=v1.page;

  /* ---- 1. la liste des chemins --------------------------------------------------------------------------------- */
  const attendus=await etat(page,(st,a,PC,P)=>st.parcours.map(p=>[p.id,p.nom,PC.commandesDuType(st,p.id,Sim.ateliers.classes).length,P.servicesDuParcours(p).length]));
  assert.ok(attendus.length>=2,'l’unité fictive a ses chemins');
  const liste=await page.locator(`${M} .ch-liste [data-mu-flux-choisir]`).evaluateAll(bs=>bs.map(b=>[b.dataset.muFluxChoisir,b.querySelector('b').textContent,b.querySelector('small').textContent]));
  const pl=(n,mot)=>n+' '+mot+(n>1?'s':'');
  assert.deepEqual(liste,attendus.map(([id,nom,c,e])=>[id,nom,pl(c,'commande')+' · '+pl(e,'étape')]),'chaque chemin, ses commandes et ses étapes');
  assert.equal(await page.locator(`${M} .ch-liste > *`).first().evaluate(e=>e.matches('details.se-ajout')&&!e.open),true,'« Ajouter un chemin » en tête, replié');
  assert.equal(await page.locator(`${M} .ch-liste > *`).last().innerText(),'Toutes les commandes ont un chemin');
  assert.equal(await page.locator(`${M} .ch-liste [aria-current=true]`).count(),1,'un chemin est choisi');

  /* ---- 2. le chemin choisi : un seul éditeur ; une étape choisie montre son tableau ------------------------------ */
  const complet=attendus.sort((a,b)=>b[2]-a[2])[0];
  await page.locator(`${M} .ch-liste [data-mu-flux-choisir="${complet[0]}"]`).click();await attendre(page);
  assert.equal(await page.locator(`${M} [data-mu-flux-nom]`).inputValue(),complet[1]);
  assert.equal(await page.locator(`${M} .ch-compte`).innerText(),pl(complet[2],'commande')+' · '+pl(complet[3],'étape'));
  assert.equal(await page.locator(`${M} [data-mu-graphe]`).count(),1,'un éditeur de chemin sur la page');
  assert.equal(await page.locator(`${M} [data-mu-graphe] [data-noeud]`).count(),complet[3],'une case par étape');
  assert.ok(await page.locator(`${M} [data-mu-graphe] .gr-lien`).count()>=complet[3]-3,'reliées');
  assert.equal(await page.locator(`${M} .ch-etape`).count(),0,'aucune étape choisie : pas de tableau');
  assert.equal(await page.locator(`${M} details[data-ch-section]`).evaluateAll(ds=>ds.every(d=>!d.open)),true,'ses sections sont repliées');
  await noeud(page,'cuisine');
  const commandes=await etat(page,(st,id,PC)=>PC.commandesDuType(st,id,Sim.ateliers.classes).map(c=>c.id),complet[0]);
  assert.deepEqual(await page.locator(`${M} .ch-table thead th`).allInnerTexts().then(t=>t.map(x=>x.toLowerCase())),['commande','équipe à cette étape','temps par vol']);
  assert.deepEqual(await page.locator(`${M} .ch-table tbody tr`).evaluateAll(ts=>ts.map(t=>t.dataset.chCmd)),commandes,'une ligne par commande du chemin');
  // Chaque ligne dit l'équipe que le réglage donne, ou « à corriger » ; le temps par vol est celui du service.
  const lignes=await page.locator(`${M} .ch-table tbody tr`).evaluateAll(ts=>ts.map(t=>({cmd:t.dataset.chCmd,choisie:(t.querySelector('select[data-ch-equipe]')||{}).value,manque:t.classList.contains('ch-manque'),
    dit:t.cells[1].innerText,temps:t.cells[2].innerText.trim()})));
  const regle=await etat(page,(st,cmds,PC,P)=>cmds.map(c=>{const a=PC.caseDe(st,'cuisine',c),k=Sim.ateliers.classes.find(x=>x.id===c);
    return {cmd:c,equipe:a&&(a.lots||[]).some(l=>l.includes(c))?a.id:'',temps:P.heuresFr(P.minutesParVol(Sim.reglages.baremeComplet().cuisine,k))+' h'};}),commandes);
  for(const [i,l] of lignes.entries()){
   assert.equal(l.choisie,regle[i].equipe,l.cmd+' : son équipe à la cuisine');
   assert.equal(l.manque,!regle[i].equipe,l.cmd+' : « à corriger » seulement sans équipe');
   assert.equal(/à corriger/.test(l.dit),!regle[i].equipe,l.cmd);
   assert.equal(l.temps,regle[i].temps,l.cmd+' : son temps par vol');
  }
  assert.ok(lignes.some(l=>l.manque)&&lignes.some(l=>!l.manque),'l’unité fictive a des commandes avec et sans équipe à la cuisine');
  assert.match(await page.locator(`${M} .ch-etape-tete`).innerText(),new RegExp(lignes.filter(l=>l.manque).length+' commandes? sans équipe ici'));
  // Aucun résultat sur la page : ni heure de fin, ni attente.
  assert.equal(await page.locator(`${M} .ch-cadre`).innerText().then(t=>/\d\d:\d\d ?[–→-] ?\d\d:\d\d|prête à|en retard|attend \d/.test(t)),false,'aucun résultat');
  // Une mise à disposition : rien à choisir, elle sert toutes les commandes ; son nom mène à sa fiche.
  await noeud(page,'magasin');
  assert.equal(await page.locator(`${M} .ch-table select[data-ch-equipe]`).count(),0,'une mise à disposition ne se choisit pas par commande');
  assert.match(await page.locator(`${M} .ch-table tbody tr`).first().innerText(),/mise à disposition : elle sert toutes les commandes/);

  /* ---- 3. le nom d'une équipe mène à sa fiche ; l'équipe d'une commande se choisit ici --------------------------- */
  await noeud(page,'cuisine');
  const avec=lignes.find(l=>!l.manque),sansEq=lignes.find(l=>l.manque);
  await page.locator(`${M} tr[data-ch-cmd="${avec.cmd}"] [data-ch-fiche]`).click();await attendre(page);
  assert.deepEqual(await page.evaluate(()=>[document.body.dataset.sous,Sim.unite.equipeOuverte,Sim.unite.choisi]),['mu-services',avec.choisie,'cuisine'],'sa fiche, dans « Services et équipes »');
  await nav.aller(page,'mu-flux');await attendre(page);
  assert.equal(await page.locator(`${M} .ch-etape`).getAttribute('data-ch-etape'),'cuisine','au retour, l’étape est toujours choisie');
  // Une commande « à corriger » reçoit son équipe ; puis aucune : elle redevient « à corriger ».
  const choix=()=>page.locator(`${M} tr[data-ch-cmd="${sansEq.cmd}"] select[data-ch-equipe]`);
  await choix().selectOption(avec.choisie);await attendre(page,400);
  assert.equal(await etat(page,(st,[c,id])=>st.ateliers.find(a=>a.id===id).lots.some(l=>l.includes(c)),[sansEq.cmd,avec.choisie]),true,'l’équipe la prépare');
  assert.equal(await page.locator(`${M} tr[data-ch-cmd="${sansEq.cmd}"]`).evaluate(t=>t.classList.contains('ch-manque')),false);
  await choix().selectOption('');await attendre(page,400);
  assert.equal(await etat(page,(st,c)=>st.ateliers.filter(a=>a.service==='cuisine').some(a=>a.lots.some(l=>l.includes(c))),sansEq.cmd),false,'plus aucune équipe de la cuisine');
  assert.equal(await page.locator(`${M} tr[data-ch-cmd="${sansEq.cmd}"]`).evaluate(t=>t.classList.contains('ch-manque')),true);
  // « Ses équipes » et « Ses temps par vol » mènent à la fiche du service.
  await page.locator(`${M} .ch-etape [data-ch-temps]`).click();await attendre(page);
  assert.deepEqual(await page.evaluate(()=>[document.body.dataset.sous,Sim.unite.choisi,!!document.querySelector('#mu-services details[data-mu-section=temps][open]')]),['mu-services','cuisine',true]);
  await nav.aller(page,'mu-flux');await attendre(page);

  /* ---- 4. créer un chemin, y mettre une étape, y rattacher une commande, choisir son équipe : la même sauvegarde - */
  const v2=await ouvrir(URL_V2);
  const cmd=sansEq.cmd,equipeChoisie=avec.choisie;
  const GESTES=[
   ['créer un chemin',async(p,v)=>{
     if(v===1){const d=p.locator(`${M} details.se-ajout`);if(!(await d.evaluate(e=>e.open)))await d.locator('> summary').click();}
     await p.locator(`${M} [data-mu-flux-nouveau] [name=nom]`).fill('Chemin fictif');
     await p.locator(`${M} [data-mu-flux-nouveau] [name=source]`).selectOption({label:'Sans cuisine'});
     await p.locator(`${M} [data-mu-flux-nouveau] button[type=submit]`).click();await attendre(p,400);}],
   ['y mettre une étape',async p=>{await p.locator(`${M} [data-mu-flux-ajout]`).selectOption('cuisine');await attendre(p,400);}],
   ['y rattacher une commande',async(p,v)=>{if(v===1)await section(p,'suivi');
     await p.locator(`${M} [data-mu-flux-ajouter-cmd]`).selectOption(cmd);await attendre(p,400);}],
   ['choisir son équipe à une étape',async(p,v)=>{
     if(v===1){await noeud(p,'cuisine');await p.locator(`${M} tr[data-ch-cmd="${cmd}"] select[data-ch-equipe]`).selectOption(equipeChoisie);}
     else{
      // Version 2 : « Chemin d'une commande » — la commande, puis le service dans son diagramme, puis sa case.
      await nav.aller(p,'at-chemins');await p.locator(`[data-pc-action=cmd][data-classe="${cmd}"]`).click();await attendre(p);
      await p.locator('#at-parcours .pc-graphe [data-noeud=cuisine]').click();await attendre(p);
      await p.locator('#at-parcours [data-pc-champ=case][data-service=cuisine]').selectOption(equipeChoisie);
     }
     await attendre(p,500);}],
   ['renommer le chemin',async(p,v)=>{if(v===2){await nav.aller(p,'mu-flux');await attendre(p);await p.locator(`${M} .mu-liste [data-mu-flux-choisir]`,{hasText:'Chemin fictif'}).click();await attendre(p);}
     const c=p.locator(`${M} [data-mu-flux-nom]`);await c.fill('Chemin fictif B');await c.press('Tab');await attendre(p,400);}],
   ['retirer une étape',async(p,v)=>{
     if(v===1){await noeud(p,'cuisine');await p.locator(`${M} .ch-etape [data-mu-flux-action=retirer-service]`).click();}
     else{await p.locator(`${M} [data-mu-graphe] [data-noeud=cuisine]`).click();await attendre(p);await p.locator(`${M} [data-mu-flux-action=retirer-service]`).click();}
     await attendre(p,500);}],
   ['dupliquer le chemin',async p=>{await p.locator(`${M} [data-mu-flux-action=dupliquer]`).click();await attendre(p,400);}],
   ['supprimer la copie',async p=>{await p.locator(`${M} [data-mu-flux-action=supprimer]`).click();await attendre(p,400);}]
  ];
  let avant1=await sauvegarde(page),avant2=await sauvegarde(v2.page),changes=0;
  assert.deepEqual(avant1,avant2,'les deux versions partent de la même sauvegarde');
  for(const [nom,geste] of GESTES){
   await geste(page,1);await geste(v2.page,2);
   const apres1=await sauvegarde(page),apres2=await sauvegarde(v2.page);
   const e1=ecarts(avant1,apres1),e2=ecarts(avant2,apres2);
   assert.deepEqual(e1,e2,nom+' : la sauvegarde change des mêmes champs, aux mêmes valeurs, que depuis les anciennes pages');
   assert.ok(e1.length>0,nom+' : la sauvegarde a changé');changes++;
   avant1=apres1;avant2=apres2;
  }
  assert.equal(changes,GESTES.length);
  await v2.site.effacer();await v2.ctx.close();
  // Le chemin créé est dans la liste, avec sa commande.
  assert.match(await page.locator(`${M} .ch-liste`).innerText(),/Chemin fictif B\s+1 commande · \d+ étapes/);

  /* ---- 5. une commande sans chemin ----------------------------------------------------------------------------- */
  // Les Économie ne suivent plus aucun chemin : le bas de la liste les compte ; un lien les montre.
  const eco=await etat(page,st=>Object.entries(st.parcoursCabine).find(([c])=>c==='YC'));
  assert.ok(eco,'les Économie ont un chemin au départ');
  await page.locator(`${M} .ch-liste [data-mu-flux-choisir="${eco[1]}"]`).click();await attendre(page);await section(page,'suivi');
  await page.locator(`${M} [data-mu-flux-classe=YC]`).uncheck();await attendre(page,400);
  const nSans=await page.evaluate(()=>OrlyCheminsPage.sansChemin(Sim.ateliers.state,Sim.ateliers.classes).length);
  assert.ok(nSans>=1);
  assert.equal(await page.locator(`${M} .ch-bas`).innerText(),nSans+' commande'+(nSans>1?'s':'')+' sans chemin →');
  await page.locator(`${M} .ch-bas [data-ch-panneau=sans]`).click();await attendre(page);
  assert.equal(await page.locator(`${M} .ch-fiche`).getAttribute('data-ch-vue'),'sans');
  assert.equal(await page.locator(`${M} .ch-sans-table tbody tr`).count(),nSans,'une ligne par commande sans chemin');
  assert.equal(await page.locator(`${M} .ch-fiche [data-page=u-liens]`).count(),1,'les liens entre services ne s’ouvrent que d’ici');
  // Elle choisit son chemin : une de moins.
  const premiere=await page.locator(`${M} .ch-sans-table tbody tr`).first().getAttribute('data-ch-cmd');
  await page.locator(`${M} .ch-sans-table select[data-mu-cmd-chemin="${premiere}"]`).selectOption(eco[1]);await attendre(page,400);
  assert.equal(await etat(page,(st,c)=>st.parcoursClasse[c],premiere),eco[1]);
  assert.equal(await page.evaluate(()=>OrlyCheminsPage.sansChemin(Sim.ateliers.state,Sim.ateliers.classes).length),nSans-1);
  // La classe retrouve son chemin : « Toutes les commandes ont un chemin », et le panneau se referme.
  await page.locator(`${M} .ch-liste [data-mu-flux-choisir="${eco[1]}"]`).click();await attendre(page);await section(page,'suivi');
  await page.locator(`${M} [data-mu-flux-classe=YC]`).check();await attendre(page,400);
  assert.equal(await page.locator(`${M} .ch-bas`).innerText(),'Toutes les commandes ont un chemin');
  assert.equal(await page.locator(`${M} .ch-fiche [data-page=u-liens]`).count(),0);

  /* ---- 6. une variante ; les commandes exclues et ajoutées ------------------------------------------------------ */
  await page.locator(`${M} .ch-liste [data-mu-flux-choisir="${complet[0]}"]`).click();await attendre(page);await section(page,'suivi');
  const pour=commandes[1];
  await page.locator(`${M} [data-ch-variante]`).selectOption(pour);await attendre(page,400);
  const variante=await etat(page,(st,c)=>{const p=st.parcours.find(x=>x.id===st.parcoursClasse[c]);return p&&{id:p.id,nom:p.nom,type:!!p.type,auto:!!p.auto};},pour);
  // (Comme depuis « Chemin d'une commande » : une copie du chemin, à son nom, qu'elle est seule à suivre.)
  assert.deepEqual([variante.type,variante.nom.startsWith(complet[1]+' · ')],[true,true],'sa variante du chemin');
  assert.equal(await page.locator(`${M} .ch-liste [aria-current=true]`).getAttribute('data-mu-flux-choisir'),variante.id,'la variante est ouverte');
  assert.equal(await page.locator(`${M} .ch-compte`).innerText(),'1 commande · '+pl(complet[3],'étape'));
  assert.equal(await etat(page,(st,[a,b],PC,P)=>JSON.stringify(P.arcsDuParcours(st.parcours.find(p=>p.id===a)))===JSON.stringify(P.arcsDuParcours(st.parcours.find(p=>p.id===b))),[variante.id,complet[0]]),true,'les mêmes étapes, reliées de même');
  await page.locator('#btn-annuler').click();await attendre(page,400);
  assert.equal(await etat(page,(st,c)=>st.parcoursClasse[c]||null,pour),null,'« Annuler » la défait');
  // Exclure une commande du programme, puis la remettre.
  await page.locator(`${M} .ch-liste [data-mu-flux-choisir="${complet[0]}"]`).click();await attendre(page);await section(page,'commandes');
  assert.equal(await page.locator(`${M} details[data-ch-section=commandes] [data-at-action=classe-nouvelle]`).count(),1,'« Ajouter une compagnie ou une classe »');
  const dejaExclues=await etat(page,st=>st.exclues||[]);
  assert.equal(await page.locator(`${M} details[data-ch-section=commandes] [data-at-action=classe-retablir]`).count(),dejaExclues.length,'les commandes déjà retirées du programme');
  await page.locator(`${M} [data-ch-exclure]`).selectOption(pour);await attendre(page,500);
  assert.deepEqual(await etat(page,st=>st.exclues),[...dejaExclues,pour],'la commande est retirée du programme');
  assert.equal(await page.locator(`${M} .ch-table tr[data-ch-cmd="${pour}"]`).count(),0,'elle ne suit plus le chemin');
  await section(page,'commandes');
  await page.locator(`${M} [data-at-action=classe-retablir][data-classe="${pour}"]`).click();await attendre(page,500);
  assert.deepEqual(await etat(page,st=>st.exclues),dejaExclues,'remise au programme');
  // Le suivi des commandes dans le temps est un résultat : un lien y mène.
  await page.locator(`${M} .ch-resultats [data-page=at-repas]`).click();await attendre(page);
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'at-repas','« Suivre ces commandes dans les résultats » : Détails › Commandes');
  await nav.aller(page,'mu-flux');await attendre(page);

  /* ---- 7. un chemin à part : le même éditeur ----------------------------------------------------------------- */
  await page.evaluate(c=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
    st.parcours.push({id:'ch-apart',nom:'Chemin à part fictif',noeuds:['dotation','prepa'],liens:[{de:'dotation',vers:'prepa'}]});st.parcoursClasse[c]='ch-apart';},''),commandes[2]);
  await attendre(page,400);
  await page.locator(`${M} .ch-liste [data-mu-flux-choisir=ch-apart]`).click();await attendre(page);
  assert.match(await page.locator(`${M} .ch-compte`).innerText(),/1 commande · 2 étapes · chemin à part/);
  assert.equal(await page.locator(`${M} [data-mu-graphe] [data-noeud]`).count(),2);
  await page.locator(`${M} [data-mu-flux-ajout]`).selectOption('cuisine');await attendre(page,400);
  assert.equal(await etat(page,(st,a,PC,P)=>P.servicesDuParcours(st.parcours.find(p=>p.id==='ch-apart')).includes('cuisine')),true,'une étape de plus');
  const nomApart=page.locator(`${M} [data-mu-flux-nom]`);
  await nomApart.fill('Chemin à part B');await nomApart.press('Tab');await attendre(page,400);
  assert.equal(await etat(page,st=>st.parcours.find(p=>p.id==='ch-apart').nom),'Chemin à part B');
  await noeud(page,'cuisine');
  assert.deepEqual(await page.locator(`${M} .ch-table tbody tr`).evaluateAll(ts=>ts.map(t=>t.dataset.chCmd)),[commandes[2]],'sa commande, à cette étape');
  await page.locator(`${M} [data-mu-flux-action=supprimer]`).click();await attendre(page,400);
  assert.deepEqual(await etat(page,(st,c)=>[st.parcours.some(p=>p.id==='ch-apart'),st.parcoursClasse[c]||null],commandes[2]),[false,null],'supprimé : sa commande reprend le chemin de sa classe');
  // « Regrouper les chemins à part » ne se propose que s'il y en a ; il en fait des chemins que des classes suivent.
  assert.equal(await page.locator(`${M} .ch-regrouper`).count(),0,'aucun chemin à part : rien à regrouper');
  await page.evaluate(c=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
    st.parcours.push({id:'ch-apart-2',nom:'Chemin à part fictif 2',noeuds:['dotation','prepa'],liens:[{de:'dotation',vers:'prepa'}]});st.parcoursClasse[c]='ch-apart-2';},''),commandes[2]);
  await attendre(page,400);
  assert.match(await page.locator(`${M} .ch-liste`).innerText(),/CHEMINS À PART|Chemins à part/);
  await page.locator(`${M} .ch-regrouper`).click();await attendre(page,500);
  assert.equal(await etat(page,(st,a,PC)=>Sim.ateliers.classes.filter(c=>PC.cheminDe(st,c.id)).length),0,'plus aucun chemin à part');
  assert.equal(await page.locator(`${M} .ch-regrouper`).count(),0);
  await page.locator('#btn-annuler').click();await attendre(page,400);await page.locator('#btn-annuler').click();await attendre(page,400);
  assert.equal(await etat(page,st=>st.parcours.some(p=>p.id==='ch-apart-2')),false,'« Annuler », deux fois : comme avant');

  /* ---- 8. la page ne défile pas : chaque colonne défile seule ---------------------------------------------------- */
  await page.locator(`${M} .ch-liste [data-mu-flux-choisir="${complet[0]}"]`).click();await attendre(page);await noeud(page,'cuisine');
  const m=await page.evaluate(()=>{const v=document.getElementById('view-ateliers'),l=document.querySelector('#mu-flux .ch-liste'),f=document.querySelector('#mu-flux .ch-fiche'),c=document.querySelector('#mu-flux .ch-cadre').getBoundingClientRect();
    return {doc:document.documentElement.scrollHeight-innerHeight,vue:v.scrollHeight-v.clientHeight,bas:Math.round(c.bottom),haut:innerHeight,
      colonnes:[getComputedStyle(l).overflowY,getComputedStyle(f).overflowY],
      texte:Math.min(...[...f.querySelectorAll('td,th,label,button,p,small,summary,input,select')].filter(e=>e.getBoundingClientRect().width>0).map(e=>parseFloat(getComputedStyle(e).fontSize))),
      teteVisible:(()=>{const t=document.querySelector('#mu-flux .ch-etape-tete').getBoundingClientRect(),r=f.getBoundingClientRect();return t.top>=r.top&&t.bottom<=r.bottom;})()};});
  assert.equal(m.doc,0,'la page ne défile pas');
  assert.ok(m.vue<=1,'la vue non plus ('+m.vue+' px)');
  assert.ok(m.bas<=m.haut,'la liste et le chemin tiennent dans l’écran ('+m.bas+' / '+m.haut+')');
  assert.deepEqual(m.colonnes,['auto','auto'],'chaque colonne défile seule');
  assert.ok(m.texte>=13,'le texte fait 13 px au moins : '+m.texte+' px');
  assert.equal(m.teteVisible,true,'l’étape choisie montre son tableau, dans la colonne');

  /* ---- 9. un seul éditeur de chemin dans l'application ---------------------------------------------------------- */
  const sous=()=>page.evaluate(()=>document.body.dataset.sous);
  assert.equal(await page.locator('[data-mu-graphe], .pc-graphe').count(),1,'un seul éditeur de chemin dans le document');
  assert.equal(await page.locator('#at-parcours, #mu-carte, .pc-cmds, .pc-tiroir').count(),0,'ni « Vue d’ensemble », ni « Chemin d’une commande »');
  assert.equal(await page.evaluate(()=>Sim.ateliers.parcours),undefined,'l’éditeur d’avant n’est plus construit');
  const pages=await page.evaluate(()=>OrlyOnglets.PARTIES.flatMap(p=>p.pages.map(q=>q.id)).filter(id=>OrlyOnglets.montree(id)));
  assert.ok(!pages.some(id=>['mu-carte','at-chemins','at-grille'].includes(id)),'les trois pages d’avant ne sont plus des pages : '+pages.join(' '));
  const avecEditeur=[],avecOnglet=[];
  for(const id of pages){
    await nav.aller(page,id);await attendre(page,150);
    if(await page.locator('[data-mu-graphe]:visible, .pc-graphe:visible').count())avecEditeur.push(id);
    if(await page.locator('#onglets-internes:not([hidden]) [data-sous-onglet]').evaluateAll(bs=>bs.some(b=>['mu-carte','mu-flux','at-chemins','at-grille','u-liens'].includes(b.dataset.sousOnglet))))avecOnglet.push(id);
  }
  await nav.terminerPlan(page);
  assert.deepEqual(avecEditeur,['mu-flux'],'l’éditeur de chemin ne se voit que dans « Chemins »');
  assert.deepEqual(avecOnglet,[],'aucun onglet interne d’une page de chemins');
  assert.deepEqual(await page.locator('#menu [data-espace=organisation] [data-sous-onglet]').evaluateAll(bs=>bs.map(b=>b.dataset.entree)),['mu-services','mu-flux','u-plan'],'« Chemins » est une entrée, pas un groupe');

  /* ---- 10. les noms, les liens et la page retenue d'avant mènent à « Chemins », au bon endroit --------------------- */
  assert.deepEqual(await page.evaluate(()=>Object.entries(OrlyOnglets.ANCIENNES).filter(([,a])=>a.vers==='mu-flux').map(([id,a])=>[id,a.lieu,a.nom])),
    [['mu-carte','liste','Vue d’ensemble'],['mu-flux:avant','liste','Chemins de production'],['at-chemins','etapes','Chemin d’une commande'],['at-grille','etapes','Étapes de chaque commande']]);
  const ENDROIT={liste:`${M} .ch-liste .mu-svc.actif`,etapes:`${M} .ch-etape`};
  for(const [nom,lieu] of [['Vue d’ensemble','liste'],['Chemins de production','liste'],['Chemin d’une commande','etapes'],['Étapes de chaque commande','etapes']]){
    await nav.aller(page,'j-chiffres');await page.evaluate(()=>{Sim.unite.fluxSel=null;if(Sim.unite.graphe)Sim.unite.graphe.selection=null;});
    await page.keyboard.press('Control+k');await page.waitForSelector('dialog.palette [role=option]');
    await page.keyboard.type(nom);await attendre(page,200);
    await page.locator('dialog.palette [role=option]').filter({hasText:nom}).first().click();await attendre(page,300);
    assert.equal(await sous(),'mu-flux','« '+nom+' » mène à « Chemins »');
    assert.equal(await page.locator(ENDROIT[lieu]).first().isVisible(),true,'« '+nom+' » mène au bon endroit ('+lieu+')');
    assert.equal(await page.locator('#view-title').textContent(),'Chemins');
  }
  // Un lien vers une page d'avant (data-page) : la page nouvelle, au bon endroit.
  await nav.aller(page,'j-chiffres');await page.evaluate(()=>{Sim.unite.fluxSel=null;if(Sim.unite.graphe)Sim.unite.graphe.selection=null;});
  await page.evaluate(()=>{const b=document.createElement('button');b.id='ch-vieux-lien';b.dataset.page='at-chemins';b.textContent='Chemin d’une commande';document.querySelector('#view-title').after(b);});
  await page.locator('#ch-vieux-lien').click();await attendre(page,300);
  assert.deepEqual([await sous(),await page.locator(`${M} .ch-etape`).count()],['mu-flux',1],'un lien vers « Chemin d’une commande » : « Chemins », une étape ouverte');
  await page.evaluate(()=>document.getElementById('ch-vieux-lien').remove());
  // La page que ce navigateur avait retenue (une page d'avant) : son espace rouvre « Chemins ».
  assert.equal(await page.evaluate(()=>{Sim.onglets.choix.organisation='at-chemins';return Sim.onglets.actifDe('organisation');}),'mu-flux','la page d’avant retenue vaut « Chemins »');
  assert.equal(await page.evaluate(()=>{Sim.onglets.parVue.ateliers='at-grille';return OrlyOnglets.resoudre(Sim.onglets.retenue('ateliers'));}),'mu-flux');
  // Le chemin d'une commande, sur un service : ici, son étape ouverte, la commande en évidence.
  await page.evaluate(()=>Sim.unite.chemin('NORD/BC','cuisine'));await attendre(page,300);
  assert.deepEqual([await sous(),await page.locator(`${M} .ch-etape`).getAttribute('data-ch-etape'),await page.locator(`${M} .ch-etape tr.ch-vise`).getAttribute('data-ch-cmd')],['mu-flux','cuisine','NORD/BC']);

  /* ---- 11. « Suivre ces commandes dans les résultats » : « Détails › Commandes », le tableau des étapes ------------ */
  await page.locator(`${M} .ch-resultats [data-page="at-repas"]`).click();await attendre(page,400);
  assert.equal(await sous(),'at-repas');
  assert.equal(await page.locator('#at-etapes').evaluate(d=>d.open),true,'le tableau des étapes est déplié');
  assert.ok(await page.locator('#at-etapes .qf-table tbody tr[data-classe]').count()>=10,'une ligne par commande');
  assert.equal(await page.locator('[data-mu-graphe]:visible, .pc-graphe:visible').count(),0,'sans éditeur de chemin : il se lit');
  assert.equal(await page.locator('#at-etapes select:visible, #at-etapes input:not([type=search]):not([type=checkbox]):visible').count(),0,'aucun réglage dans le tableau');
  const cellule=page.locator('#at-etapes [data-qf=aller][data-classe="SUD/YC"][data-service]').first(),serviceVise=await cellule.getAttribute('data-service');
  await cellule.click();await attendre(page,400);
  assert.deepEqual([await sous(),await page.locator(`${M} .ch-etape`).getAttribute('data-ch-etape'),await page.locator(`${M} .ch-etape tr.ch-vise`).getAttribute('data-ch-cmd')],['mu-flux',serviceVise,'SUD/YC'],'une cellule ramène au chemin de la commande, sur son étape');
  // Replié, le tableau n'est pas dessiné (il coûte cher) ; l'état de la page des commandes ne change pas.
  await nav.aller(page,'at-repas');await page.locator('#at-etapes>summary').click();await attendre(page,200);
  assert.equal(await page.locator('#at-etapes .qf').count(),0);
  assert.equal(await page.locator('#at-classes table.at-commandes').count(),1,'les commandes, au-dessus, comme avant');

  /* ---- 12. « Liens entre services » : jamais au menu ; elle s'ouvre depuis les commandes sans chemin ---------------- */
  await nav.aller(page,'mu-flux');await attendre(page,200);
  assert.equal(await page.locator(`${M} [data-page=u-liens]`).count(),0,'toutes les commandes ont un chemin : rien ne mène aux liens');
  const orpheline=await page.evaluate(()=>{const at=Sim.ateliers,c=at.classes.find(x=>!x.categorie&&!(at.state.parcoursClasse||{})[x.id]),avant=at.state.parcoursCabine[c.cabine];
    at.changer(()=>{const p={...at.state.parcoursCabine};delete p[c.cabine];at.state.parcoursCabine=p;},'');return {cabine:c.cabine,avant};});
  await attendre(page,300);
  await page.locator(`${M} .ch-bas [data-ch-panneau=sans]`).click();await attendre(page,200);
  await page.locator(`${M} [data-page=u-liens]`).click();await attendre(page,300);
  assert.equal(await sous(),'u-liens','le panneau des commandes sans chemin mène aux liens');
  assert.equal(await page.locator('#menu [aria-selected=true]').getAttribute('data-entree'),'mu-flux','« Chemins » reste marquée');
  assert.equal(await page.locator('#menu [data-sous-onglet=u-liens], #onglets-internes:not([hidden]) [data-sous-onglet]').count(),0,'ni au menu, ni en onglet');
  assert.equal(await page.locator('#view-title').textContent(),'Liens entre services');
  await page.evaluate(x=>{const at=Sim.ateliers;at.changer(()=>{at.state.parcoursCabine={...at.state.parcoursCabine,[x.cabine]:x.avant};},'');},orpheline);await attendre(page,300);

  /* ---- 13. « + » dans un service sans équipe qui sert toutes les commandes ; « Relier à… » ------------------------- */
  await nav.aller(page,'mu-flux');
  const sv=await page.evaluate(()=>{const at=Sim.ateliers,p=at.state.parcours.find(x=>x.nom==='Complet'),s='magasin';
    const avant=at.state.ateliers.filter(a=>a.service===s);at.changer(()=>{at.state.ateliers=at.state.ateliers.filter(a=>a.service!==s);},'');return {id:p.id,s,n:avant.length,dedans:MoteurProduction.servicesDuParcours(p).includes(s)};});
  assert.ok(sv.n>=1&&sv.dedans,'le magasin fictif est une étape de « Complet », avec son équipe');
  await attendre(page,300);
  await page.locator(`${M} .ch-liste [data-mu-flux-choisir="${sv.id}"]`).click();await attendre(page);await noeud(page,sv.s);
  const choixPlus=page.locator(`${M} .ch-etape select[data-ch-equipe]`).first();
  assert.match(await choixPlus.locator('option[value="+"]').innerText(),/Créer l’équipe de .* : elle sert toutes les commandes/);
  assert.ok(await page.locator(`${M} .ch-etape .ch-a-corriger`).count()>=1,'sans équipe : à corriger');
  await choixPlus.selectOption('+');await attendre(page,400);
  assert.deepEqual(await page.evaluate(s=>Sim.ateliers.state.ateliers.filter(a=>a.service===s).map(a=>[a.type,a.lots.length]),sv.s),[['dispo',0]],'une mise à disposition, partagée : pas une équipe par commande');
  assert.equal(await page.locator(`${M} .ch-etape .ch-a-corriger`).count(),0,'toutes les commandes sont servies');
  // « Relier à… » : l'étape choisie, puis une autre, au clavier — le lien se crée ; « Annuler » le défait.
  const liensDe=()=>page.evaluate(id=>Sim.ateliers.state.parcours.find(p=>p.id===id).liens.map(l=>l.de+'>'+l.vers),sv.id);
  const avantLien=await liensDe();
  const cible=await page.evaluate(([id,s])=>{const p=Sim.ateliers.state.parcours.find(x=>x.id===id);
    return MoteurProduction.servicesDuParcours(p).find(t=>t!==s&&!p.liens.some(l=>l.de===s&&l.vers===t)&&!OrlyParcours.creeBoucle(p,s,t))||null;},[sv.id,sv.s]);
  assert.ok(cible,'une étape que le magasin ne livre pas encore');
  await page.locator(`${M} .ch-etape [data-ch-relier="${sv.s}"]`).click();await attendre(page,200);
  assert.match(await page.locator('#notifs .notif.consigne').textContent(),/Relier/,'la consigne du geste');
  await page.locator(`${M} [data-mu-graphe] [data-noeud="${cible}"]`).focus();await page.keyboard.press('Enter');await attendre(page,300);
  assert.deepEqual(await liensDe(),avantLien.concat(sv.s+'>'+cible),'le lien est créé, sans la souris');
  await page.locator('#btn-annuler').click();await attendre(page,300);
  assert.deepEqual(await liensDe(),avantLien,'« Annuler » le défait');

  assert.deepEqual(erreurs,[],'aucune erreur de page');
  await v1.site.effacer();
  console.log('chemins-page-browser : ok — la liste des chemins (commandes, étapes), « Ajouter un chemin » en tête, les commandes sans chemin en bas ; un seul éditeur ; le tableau d’une étape (commande, équipe, temps par vol, « à corriger ») ; le nom d’une équipe mène à sa fiche ; '+GESTES.length+' gestes écrivent la même sauvegarde que les anciennes pages ; une variante, les commandes exclues et ajoutées, un chemin à part, « Regrouper » ; la page ne défile pas');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

/* Le bouton de l'armement n'apparaît que s'il y a vraiment à faire (retour
 * d'usage du 05/10 : « j'ai relié correctement, dans tous les chemins,
 * l'armement vers le handling, et la fiche me le propose encore »). Seuls les
 * chemins que suivent les commandes comptent ; un lien vers UN handling suffit ;
 * sinon la fiche nomme le chemin à reprendre et pourquoi, et le relie au seul
 * handling d'un clic. v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 const fiche=async()=>{await nav.aller(page,'mu-services');await page.locator('[data-mu-choisir=armement]').click();await attendre();return page.locator('#mu-services .mu-lien-handling');};
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   // Deux services de handling ; chaque chemin suivi relie l'armement à l'un d'eux seulement,
   // à la main ; un chemin modèle que personne ne suit n'a pas d'armement.
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
     st.categories={armement:[{id:'ARM',nom:'Armement',minutes:{'*':10}}]};
     st.ateliers.push({id:'mo',nom:'Montage',service:'prepa',type:'manuel',debut:'04:00',jour:0,personnes:3,pauses:[],lots:[['AF/YC']],regime:{actif:true}});
     st.ateliers.push({id:'h',nom:'Quais',service:'quais',type:'handling',debut:'04:00',jour:0,personnes:2,pauses:[],lots:[],regime:{actif:true},durees:{'*':20}});
     st.ateliers.push({id:'h2',nom:'CF départ',service:'cf-food',type:'handling',debut:'04:00',jour:0,personnes:2,pauses:[],lots:[],regime:{actif:true},durees:{'*':20}});
     for(const p of st.parcours){p.noeuds=p.noeuds.concat(['armement','quais']);p.liens=p.liens.concat([{de:'armement',vers:'quais'}]);}
     st.parcours.push({id:'modele',nom:'Modèle inutilisé',noeuds:['prepa','quais'],liens:[{de:'prepa',vers:'quais'}]});
     st.migrations=[...(st.migrations||[]),'armement-handling','handling-seul'];},''));
   let f=await fiche();
   assert.match(await f.innerText(),/✓ Dans chaque chemin qui passe par lui/,version+' : rien à intégrer');
   assert.equal(await f.locator('[data-mu-action=integrer-armement]').count(),0,version+' : pas de bouton');

   // Un chemin suivi où l'armement est aussi relié au Montage : la fiche le nomme.
   const nomFlux=await page.evaluate(()=>{const st=Sim.ateliers.state,p=st.parcours.find(x=>x.id===st.parcoursCabine.YC);
     Sim.ateliers.changer(()=>{st.parcours.find(x=>x.id===p.id).liens.push({de:'armement',vers:'prepa'});},'');return p.nom;});
   f=await fiche();
   assert.match(await f.innerText(),new RegExp('À reprendre dans ce chemin : « '+nomFlux+' » \\(relié aussi à Montage\\)'),version);
   await f.locator('[data-mu-action=integrer-armement]').click();await attendre();
   f=await fiche();
   assert.match(await f.innerText(),/✓ Dans chaque chemin qui passe par lui/,version+' : un clic le remet en ordre');
  }
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('armement-integre-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

/* CF départ food n'est pas le handling (retour d'usage du 05/10 : « CF départ
 * food et le handling ont la même page de paramétrage, mais CF départ food est
 * une zone tampon pour récupérer les trolleys ; des gens y travaillent à heures
 * fixes, ce sont des checkeurs »).
 *   - la zone « handling » du plan (CF DÉPART FOOD) est un service à équipes ;
 *   - un handling rangé là passe, au chargement, dans son service à lui
 *     (« Handling »), avec ses réglages et sa place dans chaque chemin ;
 *   - CF départ food reçoit ses checkeurs, à heures fixes ;
 *   - « Mettre en place le handling » vise le Handling, jamais CF départ food.
 *   v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 const M='#mu-services';
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();

   // 1. Sans handling : CF départ food est un service à équipes, pas le chargement des vols.
   await nav.aller(page,'mu-services');
   await page.locator(`${M} [data-mu-choisir=handling]`).click();await attendre();
   assert.match(await page.locator(`${M} [data-mu-nom=handling]`).inputValue(),/CF/i);
   assert.equal(await page.locator(`${M} [data-mu-nature=handling]`).inputValue(),'manuel',version+' : CF départ food a des équipes');
   assert.equal(await page.locator(`${M} [data-at-champ=durees], ${M} .at-chauffeurs`).count(),0,'pas les réglages du handling');

   // 2. Un handling rangé dans CF départ food (comme le faisait « Mettre en place le handling »).
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
     st.ateliers.push({id:'h-cf',nom:'Handling',service:'handling',type:'handling',debut:'04:00',jour:0,personnes:4,pauses:[],lots:[],regime:{actif:true},durees:{'*':30,AF:45},simultanes:3,avance:180,compagnies:[]});
     for(const p of st.parcours){p.noeuds.push('handling');p.liens.push({de:'prepa',vers:'handling'});}},''));
   await page.reload();await attendre();
   const apres=await page.evaluate(()=>{const st=Sim.ateliers.state,h=st.ateliers.find(a=>a.id==='h-cf');
     const svc=Sim.ateliers.a.services().find(s=>s.id===h.service);
     return {service:h.service,nom:svc&&svc.nom,durees:h.durees,chemins:st.parcours.map(p=>p.liens.filter(l=>l.de==='prepa').map(l=>l.vers).join()),
       cfDansChemins:st.parcours.some(p=>p.noeuds.includes('handling'))};});
   assert.notEqual(apres.service,'handling',version+' : le handling a quitté CF départ food');
   assert.equal(apres.nom,'Handling','dans son service à lui');
   assert.deepEqual(apres.durees,{'*':30,AF:45},'avec ses réglages');
   assert.ok(apres.chemins.every(c=>c===apres.service),'les chemins le suivent : '+apres.chemins);
   assert.equal(apres.cfDansChemins,false);

   // 3. Les deux fiches ne se ressemblent plus.
   await nav.aller(page,'mu-services');
   await page.locator(`${M} [data-mu-choisir=handling]`).click();await attendre();
   assert.equal(await page.locator(`${M} [data-mu-nature=handling]`).inputValue(),'manuel');
   await page.locator(`${M} [data-mu-choisir="${apres.service}"]`).click();await attendre();
   assert.equal(await page.locator(`${M} [data-mu-nature="${apres.service}"]`).inputValue(),'handling','le Handling charge les vols');

   // 4. Les checkeurs de CF départ food, à heures fixes.
   await page.locator(`${M} [data-mu-choisir=handling]`).click();await attendre();
   await page.locator(`${M} [data-mu-action=equipe]`).first().click();await attendre();
   const eq=await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>a.service==='handling'));
   assert.equal(eq.length,1);assert.equal(eq[0].type,'manuel','une équipe, pas un handling');
   const nom=page.locator(`${M} [data-at="${eq[0].id}"] [data-at-champ=nom]`);
   await nom.fill('Checkeurs');await nom.dispatchEvent('change');await attendre();
   const h=page.locator(`${M} [data-at="${eq[0].id}"] [data-at-champ=debut]`);
   await h.fill('03:00');await h.dispatchEvent('change');await attendre();
   assert.deepEqual(await page.evaluate(id=>{const a=Sim.ateliers.state.ateliers.find(x=>x.id===id);return [a.nom,a.debut,a.service];},eq[0].id),['Checkeurs','03:00','handling']);

   // 5. « Mettre en place le handling » vise le Handling, jamais CF départ food.
   const avant=await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>a.type==='handling').map(a=>a.service));
   await page.evaluate(()=>Sim.ateliers.brancherHandling());await attendre();
   const ensuite=await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>a.type==='handling').map(a=>a.service));
   assert.deepEqual(ensuite,avant,'toujours une seule case Handling, au même endroit');
   assert.ok(!ensuite.includes('handling'));
   // Rechargé : rien ne bouge plus (la séparation est faite une fois).
   await page.reload();await attendre();
   assert.deepEqual(await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>a.type==='handling').map(a=>a.service)),avant);
  }
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('cf-depart-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

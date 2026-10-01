/* Retirer un service d'un flux (retour d'usage du 01/10 : « j'ai enlevé la
 * cuisine de la branche éco, mais quand je vais dans le service cuisine je
 * peux encore cocher la case »). Ses équipes lâchent les commandes de ce flux ;
 * une ancienne saisie restée cochée est signalée et se retire en un clic ;
 * une commande hors de son flux ne se coche pas : on fait d'abord passer le
 * flux par le service. Même chose quand on retire un atelier d'un chemin. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 const lots=()=>page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.id==='cu').lots.flat());
 const eco=()=>page.evaluate(()=>Sim.ateliers.state.parcours.find(p=>p.id==='eco').noeuds);
 const cellule=c=>page.locator(`#mu-services table[data-mu-equipe="cu"] [data-mu-cocher="${c}"]`);
 const classe=c=>cellule(c).evaluate(i=>i.closest('td').className);
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   // Un flux « Éco » qui passe par la Cuisine ; une équipe de cuisine qui prépare AF BC, AF YC et TX YC.
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state,c=st.parcours.find(x=>x.id==='complet');
     st.parcours.push({...JSON.parse(JSON.stringify(c)),id:'eco',nom:'Éco'});st.parcoursCabine.YC='eco';
     st.ateliers.push({id:'cu',nom:'Cuisine matin',service:'cuisine',type:'manuel',debut:'04:00',jour:0,personnes:3,pauses:[],lots:[['AF/BC'],['AF/YC'],['TX/YC']],regime:{actif:true}});},''));

   // 1. Retirer la Cuisine du flux Éco : ses équipes lâchent AF YC et TX YC, gardent AF BC.
   await nav.aller(page,'mu-flux');
   await page.locator('[data-mu-flux-choisir=eco]').click();await attendre();
   await page.evaluate(()=>{Sim.unite.fluxSel={type:'noeud',id:'cuisine'};Sim.unite.rendreFlux();});await attendre();
   await page.locator('[data-mu-flux-action=retirer-service]').click();await attendre();
   assert.ok(!(await eco()).includes('cuisine'),version+' : la Cuisine sort du flux');
   assert.deepEqual(await lots(),['AF/BC'],version+' : ses équipes ne préparent plus l’Éco');

   // 2. Dans la Cuisine, l'Éco n'y passe plus : grisée, pas cochée.
   await nav.aller(page,'mu-services');await page.locator('[data-mu-choisir=cuisine]').click();await attendre();
   assert.match(await classe('AF/YC'),/\bhors\b/);
   assert.equal(await cellule('AF/YC').isChecked(),false);
   assert.equal(await page.locator('.mu-hors-flux').count(),0,'rien à signaler');
   // Hors de son flux, elle ne se coche pas ; on fait d'abord passer le flux par ici.
   assert.equal(await cellule('AF/YC').isDisabled(),true,version+' : pas cochable');
   assert.equal(await cellule('AF/BC').isDisabled(),false);
   await page.locator('#mu-services [data-mu-flux-ici=cuisine]').selectOption('eco');await attendre();
   assert.ok((await eco()).includes('cuisine'),version+' : la Cuisine revient dans l’Éco');
   assert.equal(await cellule('AF/YC').isDisabled(),false,version+' : et ses commandes se cochent');
   await cellule('AF/YC').check();await attendre();
   assert.deepEqual(await lots(),['AF/BC','AF/YC']);
   // On la retire de nouveau, cette fois depuis Une commande (le modèle « Éco »).
   await nav.aller(page,'at-chemins');
   await page.evaluate(()=>{const e=Sim.ateliers.parcours;e.cmd=null;e.actif='eco';e.sel=null;e.rendre();});await attendre();
   await page.evaluate(()=>{const b=document.createElement('button');b.dataset.pcAction='noeud-retirer';b.dataset.service='cuisine';
     Sim.ateliers.parcours.cliquer({target:b});});await attendre();
   assert.ok(!(await eco()).includes('cuisine'),version+' : retirée du chemin');
   assert.deepEqual(await lots(),['AF/BC'],version+' : ses équipes la lâchent aussi');
   await nav.aller(page,'mu-services');await page.locator('[data-mu-choisir=cuisine]').click();await attendre();
   assert.equal(await cellule('AF/YC').isDisabled(),true);

   // 3. Une ancienne saisie (le flux changé avant ce correctif) : signalée, retirée en un clic.
   await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id==='cu').lots.push(['AF/YC'],['TX/YC']);},''));await attendre();
   assert.match(await classe('AF/YC'),/hors-flux/);
   assert.match(await page.locator('.mu-hors-flux').innerText(),/2 commandes sont encore cochées ici \(AF YC, TX YC\), mais leur flux ne passe plus par CUISINE/i);
   await page.locator('.mu-hors-flux [data-mu-action=liberer]').click();await attendre();
   assert.deepEqual(await lots(),['AF/BC']);
   assert.equal(await page.locator('.mu-hors-flux').count(),0);
  }
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('flux-retrait-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

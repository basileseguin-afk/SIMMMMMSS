/* Un service à part entière, créé depuis le site (retour d'usage du 05/10 :
 * « il faut que je crée un tout nouveau service, Roulés couverts, qui a la même
 * entité que Prépa ou Dotation »). Jusque-là, un service créé était une salle
 * de plus d'un service existant : rangé sous lui, il en reprenait les minutes et
 * les liens. Désormais, par défaut, il est à part entière ; la salle reste un choix.
 * De bout en bout : flux, équipe, minutes, calcul, tableau des minutes, planning,
 * Excel, rechargement. v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();

   // 1. Créé depuis Mon unité, près de la Dotation : à part entière par défaut.
   await nav.aller(page,'mu-services');
   const form=page.locator('#mu-services [data-mu-nouveau]');
   await form.locator('[name=nom]').fill('Roulés couverts');
   await form.locator('[name=parent]').selectOption('dotation');
   assert.equal(await form.locator('[name=genre]').inputValue(),'autonome');
   await form.locator('button[type=submit]').click();await attendre();
   const z=await page.evaluate(()=>Sim.editor.state.zones.find(v=>v.nom==='Roulés couverts'));
   assert.ok(z&&z.autonome===true&&!z.parent,version+' : à part entière, rattaché à personne '+JSON.stringify(z));
   const id=z.id;
   assert.ok(await page.evaluate(id=>Sim.ateliers.a.services().some(s=>s.id===id),id),'dans la liste des services');
   assert.equal(await page.evaluate(id=>MoteurProduction.libelleClasse?OrlyIcones.icoService(id,'Roulés couverts'):'',id),'couverts');
   // Il n'hérite ni des liens, ni des minutes de la Dotation.
   assert.deepEqual(await page.evaluate(id=>Sim.ateliers.a.liaisons().filter(l=>l.from===id||l.to===id),id),[],version+' : aucun lien hérité');
   assert.equal(await page.evaluate(id=>JSON.stringify(Sim.reglages.baremeComplet()[id]||null),id),'null',version+' : aucune minute reprise');

   // 2. Dans le flux « Complet », entre la Dotation et le Montage ; une équipe y prépare AF Business.
   await page.evaluate(id=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state,p=st.parcours.find(x=>x.id==='complet');
     p.noeuds.push(id);p.liens=p.liens.filter(l=>!(l.de==='dotation'&&l.vers==='prepa')).concat([{de:'dotation',vers:id},{de:id,vers:'prepa'}]);},''),id);await attendre();
   await page.locator(`[data-mu-choisir="${id}"]`).click();await attendre();
   await page.locator('#mu-services [data-mu-action=equipe]').first().click();await attendre();
   const eq=await page.evaluate(id=>Sim.ateliers.state.ateliers.filter(a=>a.service===id),id);
   assert.equal(eq.length,1);assert.equal(eq[0].type||'manuel','manuel',version+' : une équipe qui prépare, comme en Prépa');
   await page.locator(`#mu-services table[data-mu-equipe="${eq[0].id}"] [data-mu-cocher="AF/BC"]`).check();await attendre();

   // 3. Ses heures, dans le tableau des heures de travail : une colonne à lui ; le calcul les compte.
   await nav.aller(page,'rg-recap');await nav.deplier(page);
   assert.match(await page.locator('#rg-recap thead').innerText(),/Roulés couverts/,version+' : sa colonne');
   const champ=page.locator(`#rg-recap input[data-rg-champ=recap][data-service="${id}"][data-classe="AF/BC"]`);
   await champ.fill('0.1');await champ.press('Tab');await attendre();   // 0,1 h = 6 min
   const r=await page.evaluate(([id,eq])=>{const r=Sim.ateliers.resultat,l=r.lots.find(x=>x.atelier===eq&&x.classes.includes('AF/BC'));
     const dot=r.lots.find(x=>x.service==='prepa'&&x.classes.includes('AF/BC'));return {hm:l&&l.hommeMinutes,vols:Sim.ateliers.classes.find(c=>c.id==='AF/BC').vols.length,
       services:(r.parClasse['AF/BC']||{}).services||[]};},[id,eq[0].id]);
   assert.equal(r.hm,6*r.vols,version+' : 6 min (0,1 h) × vols');
   assert.ok(r.services.includes(id),version+' : sur le chemin d’AF Business');

   // 4. Planning, Excel, rechargement.
   await nav.aller(page,'at-planning');
   assert.match(await page.locator('#view-ateliers').innerText(),/Roulés couverts/);
   const feuilles=await page.evaluate(()=>OrlyEchanges.ateliersVersClasseur(Sim.ateliers.state,{services:Sim.ateliers.a.services(),programme:Sim.ateliers.a.classes(),classes:Sim.ateliers.classes}));
   assert.ok(JSON.stringify(feuilles).includes('Roulés couverts'),version+' : dans le classeur');
   await page.reload();await attendre();
   assert.equal(await page.evaluate(id=>{const z=Sim.editor.state.zones.find(v=>v.id===id);return z&&z.autonome;},id),true,version+' : rechargé, toujours à part entière');
   assert.ok(await page.evaluate(id=>Sim.ateliers.state.ateliers.some(a=>a.service===id),id));

   // 5. Organisation › Services : « aucun » rattachement ; on peut le rattacher, puis le détacher.
   await nav.aller(page,'u-services');
   const sel=page.locator(`[data-svc-reparent="${id}"]`);
   assert.equal(await sel.inputValue(),'',version+' : rattaché à aucun');
   await sel.selectOption('dotation');await attendre();
   assert.equal(await page.evaluate(id=>Sim.editor.state.zones.find(v=>v.id===id).parent,id),'dotation');
   await page.locator(`[data-svc-reparent="${id}"]`).selectOption('');await attendre();
   assert.equal(await page.evaluate(id=>Sim.editor.state.zones.find(v=>v.id===id).autonome,id),true);

   // 6. La salle reste un choix : rangée sous son service, elle en reprend minutes et liens.
   await nav.aller(page,'mu-services');
   await form.locator('[name=nom]').fill('Dotation 2');
   await form.locator('[name=parent]').selectOption('dotation');
   await form.locator('[name=genre]').selectOption('salle');
   await form.locator('button[type=submit]').click();await attendre();
   const s2=await page.evaluate(()=>Sim.editor.state.zones.find(v=>v.nom==='Dotation 2'));
   assert.equal(s2.parent,'dotation');assert.ok(!s2.autonome);
   assert.ok(await page.evaluate(id=>Sim.ateliers.a.liaisons().some(l=>l.from===id||l.to===id),s2.id),version+' : la salle reprend les liens');
  }
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('service-autonome-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

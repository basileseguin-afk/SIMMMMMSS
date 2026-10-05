/* La plonge se règle sur l'arrivée des retours (retour d'usage du 05/10 :
 * « c'est con de mettre le jour de départ, il faut le jour d'arrivée »).
 *   - le jour d'une équipe de plonge : veille / jour / lendemain de l'arrivée
 *     des retours (J-1, J, J+1), dans sa carte comme dans le tableau des horaires ;
 *   - la fiche Plonge met face à face les retours qui arrivent, heure par
 *     heure, et les équipes de plonge, et dit ce qui arrive sans personne ;
 *   - une équipe le lendemain (J+1) lave ce qui est arrivé le soir : rien ne
 *     reste sale ;
 *   - une équipe qui prépare ne peut pas travailler après le départ (pas de J+1).
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
 const F='#mu-services .mu-retours';
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.materiel.actif=true;},''));

   // 1. La plonge, sans équipe : la frise dit quand les retours arrivent.
   await nav.aller(page,'mu-services');
   await page.locator('#mu-services [data-mu-choisir=plonge]').click();await attendre();
   assert.match(await page.locator(F).innerText(),/\d+ retours à laver, le jour J, de \d\d:\d\d à \d\d:\d\d — d’après les vols retour du programme/,version);
   assert.match(await page.locator(F).innerText(),/Aucune équipe de plonge : les retours attendent/);

   // 2. Une équipe : son jour se compte depuis l'arrivée des retours.
   await page.locator('#mu-services [data-mu-action=equipe]').click();await attendre();
   const jour=page.locator('#mu-services .at-carte [data-at-champ=jour]').first();
   assert.deepEqual(await jour.evaluate(s=>[...s.options].map(o=>o.textContent)),
     ['Veille de l’arrivée (J-1)','Jour d’arrivée des retours (J)','Lendemain de l’arrivée (J+1)'],version+' : plus de « jour du départ » pour la plonge');
   assert.equal(await jour.inputValue(),'0');
   assert.match(await page.locator(F).innerText(),/arrive(nt)? après la dernière équipe .* reste(nt)? sales?/,'les retours du soir restent sales');
   assert.equal(await page.locator(`${F} .mr-retour.seul`).count()>0,true,'en orange sur la frise');
   const sale=()=>page.evaluate(()=>(Sim.ateliers.resultat.plonge||{}).resteSale);
   const avant=await sale();
   assert.ok(avant>0,'du matériel reste sale en fin de journée : '+avant);

   // 3. Une deuxième équipe, le lendemain de l'arrivée, à 02:00.
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state,a=st.ateliers.find(x=>x.service==='plonge');
     if(st.ateliers.filter(x=>x.service==='plonge').length<2)st.ateliers.push({...JSON.parse(JSON.stringify(a)),id:a.id+'-nuit'});
     const n=st.ateliers.filter(x=>x.service==='plonge')[1];n.nom='Plonge de nuit';n.debut='02:00';n.jour=0;},''));
   await attendre();
   const jourNuit=page.locator('#mu-services .at-carte:has(input[value="Plonge de nuit"]) [data-at-champ=jour], #mu-services .at-carte [data-at-champ=jour]').last();
   await jourNuit.selectOption('1');await attendre();
   assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.nom==='Plonge de nuit').jour),1,version+' : J+1 retenu');
   assert.match(await page.locator(F).innerText(),/J\+1 · lendemain/);
   assert.match(await page.locator(F).innerText(),/Plonge de nuit[\s\S]*J\+1 02:00 → J\+1 10:15/);
   assert.match(await page.locator(F).innerText(),/entre deux équipes .* attend(ent)? « Plonge de nuit » \(J\+1 02:00\)/);
   assert.equal(await sale(),0,'la plonge du lendemain lave ce qui est arrivé le soir');
   // Le tableau des horaires dit la même chose.
   await nav.aller(page,'at-recap');await attendre();
   const sel=page.locator('#rc-liste tr:has-text("Plonge de nuit") [data-at-champ=jour]');
   assert.deepEqual(await sel.evaluate(s=>[...s.options].map(o=>o.textContent)),['J-1','J','J+1']);
   assert.equal(await sel.inputValue(),'1');
   assert.match(await sel.getAttribute('aria-label'),/depuis l’arrivée des retours/);
   // Une équipe qui prépare, elle, reste avant le départ.
   await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'cui-test',nom:'Cuisine test',service:'cuisine',type:'manuel',debut:'04:00',jour:0,personnes:2,pauses:[],lots:[],regime:{actif:true}});},''));await attendre();
   const autre=page.locator('#rc-liste tr:has-text("Cuisine test") [data-at-champ=jour]').first();
   assert.deepEqual(await autre.evaluate(s=>[...s.options].map(o=>o.textContent)),['J','J-1','J-2','J-3']);

   // 4. Rechargé : tout est là.
   await page.reload();await attendre();
   assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.nom==='Plonge de nuit').jour),1);
  }
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('plonge-jour-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

/* L'effectif calculé dans l'interface (retour d'usage du 05/10 : « le nombre de
 * personnes dépend du nombre de vols, à part sur certains ateliers : il faut
 * dissocier les ateliers calculés des constants », avec « une case à cocher ») :
 *   - un service calculé (la cuisine) : l'équipe montre son effectif calculé,
 *     homme-minutes ÷ poste, et il suit ce qu'elle prépare ;
 *   - la case « Effectif constant » rend la main : l'effectif saisi avant le
 *     calcul revient, il se saisit et il reste ;
 *   - CF départ food est constant par défaut ;
 *   - Minutes de travail : l'effectif calculé se lit, il ne se saisit pas ;
 *   - une mise à disposition (les appros) a ses personnes sur la journée ;
 *   - la plonge a ses équipes hors tunnel, calculées d'après les retours ou saisies.
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
 const equipe=id=>page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id),id);
 const effectif=id=>page.evaluate(id=>(Sim.ateliers.resultat.effectifs||{})[id]||null,id);
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   // Une équipe de cuisine (calculée) qui prépare trois commandes, une de checkeurs (constante).
   await page.evaluate(()=>{const cl=Sim.ateliers.classes.map(c=>c.id).slice(0,3);
     Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
       st.ateliers.push({id:'cu',nom:'Cuisine matin',service:'cuisine',type:'manuel',debut:'05:00',jour:-1,personnes:9,pauses:[],lots:cl.map(c=>[c]),regime:{actif:true}});
       st.ateliers.push({id:'cf',nom:'Checkeurs',service:'handling',type:'manuel',debut:'04:00',jour:0,personnes:3,pauses:[],lots:[],regime:{actif:true}});},'');});

   // 1. La cuisine se calcule : la case n'est pas cochée, l'effectif se lit.
   await nav.aller(page,'mu-services');
   await page.locator(`${M} [data-mu-choisir=cuisine]`).click();await attendre();
   assert.equal(await page.locator(`${M} [data-mu-effectif=cuisine]`).isChecked(),false,version+' : la cuisine se calcule');
   let e=await effectif('cu');
   assert.ok(e&&e.hommeMinutes>0,version+' : un effectif calculé');
   assert.equal(e.personnes,Math.ceil(e.hommeMinutes/(e.poste*e.rendement)-1e-9),'homme-minutes ÷ poste, arrondi au-dessus');
   assert.equal((await equipe('cu')).personnes,e.personnes,'l’équipe porte l’effectif calculé');
   assert.equal(await page.locator(`${M} [data-at="cu"] [data-at-calcule="cu"]`).first().innerText(),String(e.personnes));
   assert.equal(await page.locator(`${M} .mu-equipe-tete [data-at="cu"] [data-at-champ=personnes], ${M} [data-at="cu"] .mu-equipe-tete [data-at-champ=personnes]`).count(),0,'pas de champ à saisir');
   assert.match(await page.locator(`${M} [data-at="cu"] .at-pers-calc`).first().innerText(),/calculé/);

   // 2. Elle prépare une commande de plus : le travail monte, l'effectif suit.
   const libre=page.locator(`${M} [data-at="cu"] [data-mu-cocher]:not(:disabled):not(:checked)`).first();
   assert.ok(await libre.count(),'une commande à cocher');
   await libre.click();await attendre();
   const e2=await effectif('cu');
   assert.ok(e2.hommeMinutes>e.hommeMinutes,version+' : plus de travail');
   assert.equal(e2.personnes,Math.ceil(e2.hommeMinutes/(e2.poste*e2.rendement)-1e-9));
   assert.equal((await equipe('cu')).personnes,e2.personnes);

   // 3. Minutes de travail : l'effectif calculé se lit, il ne se saisit pas.
   await nav.aller(page,'rg-recap');await attendre();
   assert.ok(await page.locator('[data-rg-calcule="cu"]').count()>0,version+' : l’effectif calculé dans le tableau');
   assert.equal(await page.locator('[data-rg-calcule="cu"]').first().innerText(),String(e2.personnes));
   assert.equal(await page.locator('[data-rg-champ=recap-pers][data-atelier="cu"]').count(),0,version+' : pas de saisie dans le tableau');

   // 4. « Effectif constant » : l'effectif se saisit, et il reste.
   await nav.aller(page,'mu-services');
   await page.locator(`${M} [data-mu-choisir=cuisine]`).click();await attendre();
   await page.locator(`${M} [data-mu-effectif=cuisine]`).check();await attendre();
   assert.equal(await page.evaluate(()=>Sim.ateliers.state.effectifs.cuisine),'fixe');
   assert.equal(await effectif('cu'),null,version+' : plus de calcul');
   const champ=page.locator(`${M} [data-at="cu"] [data-at-champ=personnes]`).first();
   assert.equal(await champ.inputValue(),'9','elle retrouve l’effectif saisi avant le calcul : rien ne se perd');
   await champ.fill('7');await champ.dispatchEvent('change');await attendre();
   assert.equal((await equipe('cu')).personnes,7,version+' : l’effectif saisi reste');
   assert.equal(await page.evaluate(()=>Sim.ateliers.resultat.ateliers.find(a=>a.id==='cu').personnes),7,'la journée se joue avec lui');
   // Décochée : le calcul reprend.
   await page.locator(`${M} [data-mu-effectif=cuisine]`).uncheck();await attendre();
   assert.equal((await equipe('cu')).personnes,e2.personnes,version+' : le calcul reprend');
   // Rechargé : le choix est gardé.
   await page.locator(`${M} [data-mu-effectif=cuisine]`).check();await attendre();
   await page.reload();await attendre();
   assert.equal(await page.evaluate(()=>Sim.ateliers.effectifConstant('cuisine')),true,'le choix se garde');

   // 5. CF départ food est constant par défaut : ses checkeurs gardent leur effectif.
   await nav.aller(page,'mu-services');
   await page.locator(`${M} [data-mu-choisir=handling]`).click();await attendre();
   assert.equal(await page.locator(`${M} [data-mu-effectif=handling]`).isChecked(),true,version+' : CF départ food est constant');
   assert.equal(await page.locator(`${M} [data-at="cf"] [data-at-champ=personnes]`).first().inputValue(),'3');
   assert.deepEqual(await page.evaluate(()=>['magasin','decontam','bobduty','appros','handling','cuisine','prepa','dotation'].filter(s=>!Sim.ateliers.effectifConstant(s))),
     ['prepa','dotation'],'constants par défaut : CF départ food, magasin, légumerie, duty free, appros (et la cuisine, cochée ici)');

   // 6. Une mise à disposition a aussi ses gens (06/10 : « 2 personnes aux appros,
   //    ce sont 2 personnes en tout sur la journée ») : constant, une présence chacune.
   await page.locator(`${M} [data-mu-choisir=appros]`).click();await attendre();
   const ajout=page.locator(`${M} [data-mu-action=equipe]`);if(await ajout.count()){await ajout.first().click();await attendre();}
   const ap=page.locator(`${M} .at-pers-jour [data-at-champ=personnes]`).first();
   assert.equal(await ap.count(),1,version+' : les personnes des appros se saisissent');
   await ap.fill('2');await ap.dispatchEvent('change');await attendre();
   assert.deepEqual(await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>a.service==='appros').map(a=>[a.type,a.personnes])),[['dispo',2]]);
   assert.match(await page.locator(`${M} .at-pers-jour + .mini-note`).first().innerText(),/2 × 8 h de présence \(dont 1 h de pause\) = 16 h de présence,\s+14 h de travail/);
   assert.match(await page.locator(`${M} .at-carte, ${M} .mu-carte`).first().innerText(),/2 pers\. sur la journée/);
   assert.equal(await page.evaluate(()=>(Sim.ateliers.resultat.effectifs||{})[Sim.ateliers.state.ateliers.find(a=>a.service==='appros').id]),undefined,'jamais calculé');

   // 7. La plonge a ses équipes hors tunnel (06/10), dont l'effectif suit les vols
   //    qui reviennent, ou se saisit (« Effectif constant »).
   await page.locator(`${M} [data-mu-choisir=plonge]`).click();await attendre();
   if(!(await page.evaluate(()=>Sim.ateliers.state.ateliers.some(a=>a.type==='lavage')))){await page.locator(`${M} [data-mu-action=equipe]`).first().click();await attendre();}
   assert.equal(await page.locator(`${M} [data-mu-effectif=plonge]`).isChecked(),false,version+' : à la plonge aussi, la case « Effectif constant »');
   await page.locator(`${M} [data-mu-action=appui]`).click();await attendre();
   const ht=await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.type==='appui'&&a.service==='plonge'));
   assert.ok(ht&&/hors tunnel/.test(ht.nom),version+' : une équipe hors tunnel');
   const min=page.locator(`${M} [data-at="${ht.id}"] [data-at-champ=appui-min][data-cie="*"]`);
   if(!(await min.count())){await page.locator(`${M} [data-at="${ht.id}"] button`).first().click();await attendre();}
   await min.fill('300');await min.dispatchEvent('change');await attendre();
   const eh=await effectif(ht.id);
   assert.ok(eh&&eh.retours&&eh.vols>0,version+' : elle compte les vols qui reviennent '+JSON.stringify(eh));
   assert.equal(eh.hommeMinutes,300*eh.vols);
   assert.equal(eh.personnes,Math.ceil(eh.hommeMinutes/(eh.poste*eh.rendement)-1e-9));
   assert.equal(eh.poste,420,'un poste de 8 h dont 1 h de pause : 7 h de travail');
   assert.equal((await equipe(ht.id)).personnes,eh.personnes);
   assert.match(await page.locator(`${M} [data-at="${ht.id}"] .at-appui-note`).innerText(),new RegExp(eh.vols+' vols?'));
   // Effectif constant : elle reprend l'effectif saisi.
   await page.locator(`${M} [data-mu-effectif=plonge]`).check();await attendre();
   assert.equal((await equipe(ht.id)).personnes,1,version+' : constant, l’effectif saisi revient');
   assert.equal(await page.locator(`${M} [data-at="${ht.id}"] [data-at-champ=appui-min]`).count(),0,'plus de minutes par vol à saisir');
  }
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('effectif-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

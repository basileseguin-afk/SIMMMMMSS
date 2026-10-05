/* L'effectif calculé dans l'interface (retour d'usage du 05/10 : « le nombre de
 * personnes dépend du nombre de vols, à part sur certains ateliers : il faut
 * dissocier les ateliers calculés des constants », avec « une case à cocher ») :
 *   - un service calculé (la cuisine) : l'équipe montre son effectif calculé,
 *     homme-minutes ÷ poste, et il suit ce qu'elle prépare ;
 *   - la case « Effectif constant » rend la main : l'effectif saisi avant le
 *     calcul revient, il se saisit et il reste ;
 *   - CF départ food est constant par défaut ;
 *   - Minutes de travail : l'effectif calculé se lit, il ne se saisit pas.
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
  }
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('effectif-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

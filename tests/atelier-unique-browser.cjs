/* Un service à un seul atelier, pour certaines compagnies (retour d'usage du
 * 07/10 : « le plus simple serait de dire que le service comporte un seul et
 * unique atelier de x personnes, commençant à telle heure, faisant certaines
 * compagnies » — le BOB, les checkeurs de CF départ food). Effectif constant :
 * ses commandes passent dans ses heures, sans minutes ; cocher une compagnie
 * fait passer ses flux par le service ; les autres y passent sans alerte. v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(300);
 const M='#mu-services';
 const etat=()=>page.evaluate(()=>{const st=Sim.ateliers.state,a=st.ateliers.filter(x=>x.service==='bobduty'),R=Sim.ateliers.resultat;
   return {eq:a.map(x=>({pers:x.personnes,cies:x.compagnies,lots:x.lots.map(l=>l[0]),par:!!x.parCompagnie,eff:x.effectif})),
     flux:st.parcours.every(t=>t.noeuds.includes('bobduty')),
     journal:R.lots.filter(l=>l.service==='bobduty').map(l=>[l.classes[0],l.duree,!!l.impossible]),
     alertes:R.anomalies.filter(x=>x.service==='bobduty'||a.some(y=>y.id===x.atelier)).map(x=>x.code)};});
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   await nav.aller(page,'mu-services');
   await page.locator(`${M} [data-mu-choisir=bobduty]`).click();await attendre();
   // 1. La nature « un seul atelier » : une équipe, constante, sans compagnie.
   await page.locator(`${M} [data-mu-nature=bobduty]`).selectOption('atelier');await attendre();
   let e=await etat();
   assert.equal(e.eq.length,1,version+' : un seul atelier');
   assert.deepEqual([e.eq[0].par,e.eq[0].eff,e.eq[0].cies],[true,'fixe',[]]);
   assert.equal(await page.locator(`${M} [data-mu-nature=bobduty]`).inputValue(),'atelier');
   assert.equal(await page.locator(`${M} [data-mu-action=equipe]`).count(),0,'pas de « + Ajouter une équipe »');
   // 2. Ses personnes et ses compagnies.
   const pers=page.locator(`${M} .mu-atelier-unique [data-at-champ=personnes]`);await pers.fill('3');await pers.dispatchEvent('change');await attendre();
   await page.locator(`${M} [data-mu-atelier-cie="AF"]`).check();await attendre();
   await page.locator(`${M} [data-mu-atelier-cie="TX"]`).check();await attendre();
   e=await etat();
   assert.deepEqual(e.eq[0].cies,['AF','TX']);assert.equal(e.eq[0].pers,3);
   const attendues=await page.evaluate(()=>Sim.ateliers.classes.filter(c=>!c.categorie&&['AF','TX'].includes(c.cie)).map(c=>c.id));
   assert.deepEqual(e.eq[0].lots,attendues,version+' : toutes les commandes AF et TX, dans l’ordre des départs');
   assert.ok(e.flux,'les flux passent par le service');
   assert.equal(e.journal.length,attendues.length,'chacune passe par l’atelier');
   assert.ok(e.journal.every(([,d,imp])=>d===0&&!imp),'constant : dans ses heures, sans minutes');
   assert.deepEqual(e.alertes,[],version+' : les autres compagnies y passent sans alerte');
   // 3. Décocher, Toutes, Aucune.
   await page.locator(`${M} [data-mu-atelier-cie="TX"]`).uncheck();await attendre();
   assert.deepEqual((await etat()).eq[0].cies,['AF']);
   await page.locator(`${M} [data-mu-action=atelier-toutes]`).click();await attendre();
   const toutes=await page.evaluate(()=>[...new Set(Sim.ateliers.classes.filter(c=>!c.categorie).map(c=>c.cie))].sort());
   assert.deepEqual((await etat()).eq[0].cies,toutes);
   await page.locator(`${M} [data-mu-action=atelier-aucune]`).click();await attendre();
   assert.deepEqual((await etat()).eq[0].lots,[]);
   await page.locator(`${M} [data-mu-atelier-cie="AF"]`).check();await attendre();
   // 4. Gardé au rechargement.
   await page.reload();await attendre();
   e=await etat();assert.deepEqual([e.eq.length,e.eq[0].cies,e.eq[0].pers],[1,['AF'],3],version+' : gardé');
   // 5. Retour à « des équipes préparent » : une équipe ordinaire, avec ses commandes.
   await nav.aller(page,'mu-services');await page.locator(`${M} [data-mu-choisir=bobduty]`).click();await attendre();
   await page.locator(`${M} [data-mu-nature=bobduty]`).selectOption('manuel');await attendre();
   e=await etat();assert.deepEqual([e.eq[0].par,e.eq[0].eff],[false,undefined],version+' : redevenue une équipe ordinaire');
   assert.ok(e.eq[0].lots.length>0,'elle garde ses commandes');
  }
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('atelier-unique-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

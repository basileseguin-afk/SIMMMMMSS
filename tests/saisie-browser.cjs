/* Ce qu'on tape n'est jamais perdu (retour d'usage du 05/10 : « des fois, en
 * dotation, j'écris dans un champ ou des heures, et le champ ne retient pas
 * ce que j'ai écrit »).
 * Chaque modification relance le calcul et redessine la fiche ; quand le
 * calcul est lent, on tape déjà dans le champ suivant, et le rendu le
 * remplaçait. Ici, on force un rendu AU MILIEU de la saisie — l'heure
 * d'arrivée, les personnes, les minutes par vol — et rien ne se perd. Un
 * champ validé, lui, se redessine avec la valeur retenue. v1 et v2. */
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
   await page.waitForTimeout(200);await nav.effectifSaisi(page);   // les personnes se saisissent ici (05/10)
   await nav.aller(page,'mu-services');
   await page.locator(`${M} [data-mu-choisir=dotation]`).click();await attendre();
   await page.locator(`${M} [data-mu-action=equipe]`).first().click();await attendre();
   const equipe=await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.service==='dotation').id);
   // Un rendu qui change vraiment la fiche (une équipe de plus), comme celui
   // qu'amène le calcul d'un champ quitté juste avant : il arrive PENDANT la
   // frappe (une minuterie dans la page), sans rien interrompre — comme pour
   // de vrai. (Piloter la page entre deux touches casse, à lui seul, la
   // saisie d'une heure dans le navigateur de test.)
   let n=0;
   const renduDans=ms=>page.evaluate(([k,ms])=>{window.__rendu=0;setTimeout(()=>{Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
     st.ateliers.push({id:'leurre-'+k,nom:'Leurre '+k,service:'dotation',type:'manuel',debut:'03:00',jour:0,personnes:1,pauses:[],lots:[],regime:{actif:true}});},'');
     window.__rendu=OrlyRendu.attentes();},ms);},[++n,ms]);
   const champ=sel=>page.locator(`${M} [data-at="${equipe}"] ${sel}`).first();
   const etat=()=>page.evaluate(id=>{const a=Sim.ateliers.state.ateliers.find(x=>x.id===id);return {debut:a.debut,personnes:a.personnes};},equipe);

   // 1. L'heure : « 05 », un rendu, « 45 ».
   await renduDans(300);
   // (Sur les heures : au milieu du champ, le clic du navigateur de test tombe à côté des chiffres.)
   await champ('[data-at-champ=debut]').click({position:{x:14,y:12}});await page.keyboard.type('0545',{delay:120});
   // Le rendu est arrivé au milieu, et il a attendu : on écrivait dans la fiche.
   assert.equal(await page.evaluate(()=>window.__rendu),1,version+' : le rendu attend la fin de la saisie');
   assert.equal(await page.locator(`${M} [data-at^=leurre]`).count(),0);
   assert.equal(await champ('[data-at-champ=debut]').inputValue(),'05:45',version+' : l’heure tapée est toujours là');
   // On quitte le champ (un clic ailleurs ; Tab, dans une heure, passe des heures aux minutes).
   await page.locator(`${M} .mu-tete`).first().click();await attendre();
   assert.equal((await etat()).debut,'05:45',version+' : et retenue');
   // Validée : la fiche se redessine, le focus suit le champ suivant.
   assert.equal(await page.locator(`${M} [data-at^=leurre]`).count()>0,true,'la fiche s’est redessinée');
   assert.equal(await page.evaluate(()=>OrlyRendu.attentes()),0);

   // 2. Les personnes : « 1 », un rendu, « 2 ».
   const pers=champ('[data-at-champ=personnes]');
   await renduDans(250);
   await pers.click();await page.keyboard.press('Control+A');await page.keyboard.type('12',{delay:250});
   assert.equal(await champ('[data-at-champ=personnes]').inputValue(),'12',version+' : « 12 », pas « 2 »');
   await page.keyboard.press('Tab');await attendre();
   assert.equal((await etat()).personnes,12);

   // 3. Les minutes par vol (le barème du service), « 4 », un rendu, « 2 ».
   const bc=page.locator(`${M} [data-rg-champ=minutes][data-service=dotation][data-cle="*/BC"]`).first();
   await renduDans(250);
   await bc.click();await page.keyboard.press('Control+A');await page.keyboard.type('42',{delay:250});
   assert.equal(await page.locator(`${M} [data-rg-champ=minutes][data-service=dotation][data-cle="*/BC"]`).first().inputValue(),'42',version+' : les minutes tapées restent');
   await page.keyboard.press('Tab');await attendre();
   assert.equal(await page.locator(`${M} [data-rg-champ=minutes][data-service=dotation][data-cle="*/BC"]`).first().inputValue(),'42','et sont retenues');

   // 4. Un champ validé se redessine normalement, avec la valeur retenue.
   await champ('[data-at-champ=personnes]').click();await page.keyboard.press('Control+A');await page.keyboard.type('5000',{delay:30});
   await page.keyboard.press('Tab');await attendre();
   assert.equal((await etat()).personnes,999,'borné à 999');
   assert.equal(await champ('[data-at-champ=personnes]').inputValue(),'999','le champ montre la valeur retenue');
   assert.equal(await page.evaluate(()=>OrlyRendu.enSaisie()),null,'plus rien en cours de saisie');

   // 5. Rechargé : tout est là.
   await page.reload();await attendre();
   const fin=await page.evaluate(id=>{const a=Sim.ateliers.state.ateliers.find(x=>x.id===id);return a.debut+'/'+a.personnes;},equipe);
   assert.equal(fin,'05:45/999');
  }
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('saisie-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

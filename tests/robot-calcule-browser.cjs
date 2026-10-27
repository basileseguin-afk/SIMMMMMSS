/* Banc d'essai, évolution 9, dans la page : l'équipe d'un robot, dans un
 * service à effectif calculé, prend ses personnes du barème propre de son
 * service.
 *   - Le Robot posé sous le Montage reprend son barème : ces minutes ne sont pas
 *     les siennes, il garde son effectif saisi et le récap montre son débit ;
 *   - ses heures par vol se saisissent dans Barème, comme pour un autre
 *     service : l'effectif se calcule, « calculé » dans sa fiche, ses heures par
 *     vol au récap ;
 *   - « Effectif » : « Constant (saisi) » lui rend son effectif saisi ; ses heures
 *     par vol retirées aussi, et la journée affichée se joue déjà avec lui ;
 *   - sa ligne va toujours à son débit ;
 *   - l'export du barème lui donne ses lignes.
 * Vols, compagnies et équipes de la démonstration (fictifs). */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 const robot=()=>page.evaluate(()=>{const z=Sim.editor.state.zones.find(z=>/^robot$/i.test(z.nom));return Sim.ateliers.state.ateliers.find(a=>a.service===z.id);});
 const effectif=id=>page.evaluate(id=>(Sim.ateliers.resultat.effectifs||{})[id]||null,id);
 const duree=id=>page.evaluate(id=>Sim.ateliers.resultat.lots.filter(l=>l.atelier===id).reduce((n,l)=>n+(l.fin-l.debut),0),id);
 const fiche=async id=>{await nav.aller(page,'at-equipes');await page.evaluate(id=>{Sim.ateliers.ouvert=id;Sim.ateliers.rendre();},id);await attendre();};
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  // Une organisation décrite : le Robot remplace le Montage pour TX, CRL et FBU Économie (robot-browser).
  await nav.aller(page,'at-chemins');
  for(const c of ['TX/YC','CRL/YC']){
    await page.locator(`[data-pc-action=cmd][data-classe="${c}"]`).click();await attendre();
    await nav.creerChemin(page,c);
  }
  await page.reload();await page.waitForTimeout(700);
  let a=await robot();
  assert.ok(a,'le Robot est posé');
  const rid=a.service,id=a.id;
  await page.evaluate(id=>Sim.ateliers.changer(()=>{const x=Sim.ateliers.state.ateliers.find(y=>y.id===id);x.personnes=5;x.personnesMin=2;delete x.personnesSaisies;},''),id);
  await attendre();

  // 1. Le barème repris du Montage n'est pas le sien : son effectif saisi, son débit au récap.
  assert.ok(await page.evaluate(id=>Sim.ateliers.robotCalcule(Sim.ateliers.state.ateliers.find(a=>a.id===id)),id),'son service se calcule');
  assert.equal(await effectif(id),null,'pas de calcul sur les minutes du Montage');
  assert.equal((await robot()).personnes,5);
  const dureeSaisi=await duree(id);
  await fiche(id);
  assert.equal(await page.locator(`[data-at="${id}"] [data-at-champ=personnes]`).count()>0,true,'son effectif se saisit');
  await nav.aller(page,'rg-recap');await nav.deplier(page);
  assert.equal(await page.locator('.rg-recap-table tr[data-classe="TX/YC"] input[data-rg-champ=recap-debit]').count(),1,'le récap montre son débit');

  // 2. Ses heures par vol, dans Barème, comme pour un autre service : 1 h par vol en Économie.
  await nav.vue(page,'reglages');await attendre();
  await nav.aller(page,'rg-minutes');await attendre();
  await page.locator(`.rg-service[data-service="${rid}"] > summary`).click();await attendre();
  const yc=`[data-rg-champ=heures][data-service="${rid}"][data-cle="*/YC"]`;
  await page.fill(yc,'1');await page.dispatchEvent(yc,'change');await attendre();
  assert.equal(await page.evaluate(rid=>Sim.reglages.etat.bareme[rid]['*/YC'],rid),60,'gardée en minutes');
  const e=await effectif(id);
  assert.ok(e,'l’effectif se calcule');
  const vols=await page.evaluate(()=>Sim.ateliers.resultat.classes.filter(c=>['TX/YC','CRL/YC','FBU/YC'].includes(c.id)).reduce((n,c)=>n+c.vols.length,0));
  assert.equal(e.hommeMinutes,60*vols,'1 h × ses vols');
  assert.equal(e.personnes,Math.max(2,Math.ceil(e.hommeMinutes/(e.poste*e.rendement)-1e-9)),'÷ poste, arrondi au-dessus, au moins son minimum');
  a=await robot();
  assert.deepEqual([a.personnes,a.personnesSaisies],[e.personnes,5],'le robot porte l’effectif calculé, son effectif saisi est gardé');
  assert.equal(await duree(id),dureeSaisi,'la ligne va toujours à son débit');
  await fiche(id);
  assert.match(await page.locator(`[data-at="${id}"] .at-pers-calc`).first().innerText(),/calculé/);
  assert.equal(await page.locator(`[data-at="${id}"] [data-at-calcule="${id}"]`).first().innerText(),String(e.personnes));
  await nav.aller(page,'rg-recap');await nav.deplier(page);
  assert.equal(await page.locator('.rg-recap-table tr[data-classe="TX/YC"] input[data-rg-champ=recap-debit]').count(),0);
  assert.equal(await page.locator(`.rg-recap-table tr[data-classe="TX/YC"] input[data-rg-champ=recap][data-service="${rid}"]`).inputValue(),'1','ses heures par vol au récap');

  // 3. « Constant (saisi) » : son effectif saisi revient ; « comme le service » : calculé à nouveau.
  await fiche(id);
  const choix=page.locator(`[data-at="${id}"] [data-at-champ=effectif]`).first();
  assert.match(await choix.locator('option[value=""]').innerText(),/Comme le service \(calculé s’il a des heures par vol au barème\)/);
  await choix.selectOption('fixe');await attendre();
  a=await robot();
  assert.deepEqual([a.effectif,a.personnes,a.personnesSaisies],['fixe',5,undefined],'constant : ses 5 personnes saisies');
  assert.equal(await effectif(id),null);
  await page.locator(`[data-at="${id}"] [data-at-champ=effectif]`).first().selectOption('');await attendre();
  assert.equal((await robot()).personnes,e.personnes,'revenu au service : calculé');

  // 4. Le barème exporté lui donne ses lignes : son service lit le barème.
  assert.ok(!(await page.evaluate(()=>Sim.reglages.a.sansBareme())).includes(rid));

  // 5. Tout survit au rechargement.
  await page.reload();await page.waitForTimeout(700);
  assert.equal((await effectif(id)).personnes,e.personnes);

  // 6. Ses heures par vol retirées : son effectif saisi revient, et la journée affichée se joue déjà avec lui.
  await nav.vue(page,'reglages');await attendre();
  await nav.aller(page,'rg-minutes');await attendre();
  await page.locator(`.rg-service[data-service="${rid}"] > summary`).click();await attendre();
  await page.fill(yc,'');await page.dispatchEvent(yc,'change');await attendre();
  assert.equal(await effectif(id),null,'plus de calcul');
  a=await robot();
  assert.deepEqual([a.personnes,a.personnesSaisies],[5,undefined],'ses 5 personnes saisies');
  assert.equal(await page.evaluate(id=>Sim.ateliers.resultat.ateliers.find(x=>x.id===id).personnes,id),5,'la journée affichée, avec ses 5 personnes');

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('robot-calcule-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

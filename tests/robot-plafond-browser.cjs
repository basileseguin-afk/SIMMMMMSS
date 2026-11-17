/* Évolution 21 (b) — les postes de travail dans la fiche d'une équipe de robot.
 * Le réglage « Postes de travail » ne limitait que les renforts ; il plafonne
 * aussi l'effectif calculé d'un robot. Dans sa fiche, le champ est toujours
 * là, à côté du minimum, et dit ses deux effets (« au plus, renforts
 * compris ») ; un maximum sous le minimum est refusé, sous le champ. Sur les
 * données de démonstration : rien de l'unité. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const kase=id=>page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id),id);
 const effectif=id=>page.evaluate(id=>(Sim.ateliers.resultat.effectifs||{})[id]||null,id);
 const champ=(id,nom)=>page.locator(`[data-at="${id}"] [data-at-champ=${nom}]:visible`);
 const ouvrir=async id=>{await nav.aller(page,'at-equipes');await page.locator(`#at-liste [data-at="${id}"] .at-carte-nom`).click();await champ(id,'debut').waitFor();};
 /** Saisit une valeur dans un champ de la fiche et la valide ; attend son effet : la valeur gardée dans l'équipe (vide : le champ ôté)… */
 const saisir=async(id,nom,valeur)=>{const f=champ(id,nom);await f.fill(valeur);await f.press('Tab');
   await page.waitForFunction(([id,nom,v])=>{const a=Sim.ateliers.state.ateliers.find(x=>x.id===id);return v===''?!(nom in a):String(a[nom])===v;},[id,nom,valeur]);};
 /** … ou le refus : la raison sous le champ, qui est marqué. */
 const refuser=async(id,nom,valeur)=>{const f=champ(id,nom);await f.fill(valeur);await f.press('Tab');
   await page.waitForFunction(([id,nom])=>{const e=document.querySelector(`[data-at="${id}"] [data-at-champ=${nom}]`);return !!e&&e.getAttribute('aria-invalid')==='true'&&!!document.querySelector('.champ-erreur');},[id,nom]);};
 const erreur=()=>page.locator('.champ-erreur:visible');
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat);
  // Une équipe de robot (minimum 2), calculée au barème de son service, et une équipe à la main. Les renforts sont fermés.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state,toutes=(Sim.ateliers.resultat.classes||[]).map(c=>c.id).filter(c=>/\/YC$/.test(c)).slice(0,6);
    st.ateliers.push({id:'rb',nom:'Robot essai',service:'prepa',type:'robot',debut:'06:00',jour:0,personnes:4,personnesMin:2,debit:60,pauses:[],lots:toutes.map(c=>[c]),regime:{actif:false},effectif:'calcule'},
      {id:'mn',nom:'Main essai',service:'prepa',type:'manuel',debut:'06:00',jour:0,personnes:2,pauses:[],lots:[],regime:{actif:false}});},''));
  assert.equal(await page.evaluate(()=>Sim.ateliers.renfortsActifs()),false,'les renforts ne sont pas ouverts');

  // 1. Dans la fiche du robot, le champ est là, juste après le minimum, et dit ses deux effets.
  await ouvrir('rb');
  const postes=champ('rb','personnesMax');
  assert.ok(await postes.isVisible(),'le champ « Postes de travail » est visible sans les renforts');
  assert.match(await postes.evaluate(e=>e.closest('label').innerText),/Postes de travail[\s\S]*au plus, renforts compris/);
  assert.ok(await postes.evaluate(e=>!!e.closest('label').previousElementSibling.querySelector('[data-at-champ=personnesMin]')),'à côté du minimum');
  assert.equal(await postes.inputValue(),'','vide : pas de plafond');
  const avant=await effectif('rb');
  assert.ok(avant&&avant.personnes>=3&&avant.plafond===undefined,'le robot est calculé, sans plafond : '+JSON.stringify(avant));

  // 2. Une équipe à la main, sans les renforts : pas de champ, comme avant.
  await ouvrir('mn');
  assert.equal(await page.locator('[data-at="mn"] [data-at-champ=personnesMax]').count(),0);

  // 3. Un maximum sous le minimum est refusé, sous le champ, avec un message clair ; rien n'est gardé.
  await ouvrir('rb');
  await refuser('rb','personnesMax','1');
  assert.equal('personnesMax' in (await kase('rb')),false,'« 1 » n’est pas enregistré');
  assert.equal(await champ('rb','personnesMax').getAttribute('aria-invalid'),'true');
  assert.match(await erreur().innerText(),/Postes de travail : au moins son minimum pour tourner \(2\)/);

  // 4. Un maximum sous le calcul : l'effectif calculé s'y arrête, et la fiche le dit.
  const max=avant.personnes-1;
  await saisir('rb','personnesMax',String(max));
  assert.equal((await kase('rb')).personnesMax,max);
  await page.waitForFunction(([id,n])=>{const e=(Sim.ateliers.resultat.effectifs||{})[id];return !!e&&e.personnes===n;},['rb',max]);
  assert.deepEqual(await effectif('rb').then(e=>[e.personnes,e.plafond,e.hommeMinutes]),[max,max,avant.hommeMinutes],'plafonné, pour le même travail');
  const calcule=page.locator('[data-at="rb"] .at-pers-calc:visible').first();
  await page.waitForFunction(n=>{const o=document.querySelector('[data-at="rb"] .at-pers-calc output');return !!o&&o.textContent.trim()===String(n);},max);
  assert.equal((await calcule.locator('output').innerText()).trim(),String(max));
  assert.match(await calcule.innerText(),new RegExp('au plus '+max+' postes'));
  assert.match(await calcule.getAttribute('title'),new RegExp('sans dépasser ses '+max+' postes de travail'));

  // 5. Le minimum ne passe pas au-dessus des postes de travail.
  await refuser('rb','personnesMin',String(max+1));
  assert.equal((await kase('rb')).personnesMin,2,'le minimum gardé');
  assert.match(await erreur().innerText(),new RegExp('Minimum pour tourner : au plus ses postes de travail \\('+max+'\\)'));

  // 6. Vidé : plus de plafond, le calcul d'avant.
  await saisir('rb','personnesMax','');
  assert.equal('personnesMax' in (await kase('rb')),false);
  await page.waitForFunction(([id,n])=>{const e=(Sim.ateliers.resultat.effectifs||{})[id];return !!e&&e.personnes===n&&e.plafond===undefined;},['rb',avant.personnes]);

  assert.deepEqual(errors,[],'aucune erreur dans la page');
  console.log('robot-plafond-browser : ok — le champ « Postes de travail » dans la fiche du robot, à côté du minimum ; un maximum sous le minimum refusé ; l’effectif calculé plafonné et dit ; le minimum ne passe pas au-dessus ; vidé, le calcul d’avant');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

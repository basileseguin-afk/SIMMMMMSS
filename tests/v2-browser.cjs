/* La version 2 (v2/) : une copie complète du site, pour aller plus loin
 * (finances, aléas, heures sup, optimisation) sans toucher la version 1.
 * Même site, donc même stockage du navigateur : la v2 range ses données à
 * part (« ory-v2: »), et part d'une copie du travail de la v1. */
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(300);
 const v1=pathToFileURL(path.resolve(__dirname,'../index.html')).href,v2=pathToFileURL(path.resolve(__dirname,'../v2/index.html')).href;
 const equipes=()=>page.evaluate(()=>Sim.ateliers.state.ateliers.map(a=>a.nom));
 const ajouter=nom=>page.evaluate(nom=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'t-'+nom,nom,service:'prepa',type:'manuel',debut:'05:00',jour:0,personnes:2,pauses:[],lots:[],regime:{actif:false}});},''),nom);
 try{
  // 1. La v1 : un travail en cours, et un lien vers la v2.
  await page.goto(v1);await attendre();
  await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
  await ajouter('Équipe de la v1');await attendre();
  assert.ok((await equipes()).includes('Équipe de la v1'));
  assert.equal(await page.locator('header .btn-version').getAttribute('href'),'v2/');

  // 2. La v2 s'ouvre sans erreur, se dit en construction, et part du travail de la v1.
  await page.goto(v2);await attendre();
  assert.match(await page.title(),/v2/);
  assert.match(await page.locator('header .btn-version.v2').innerText(),/Version 2/);
  assert.equal(await page.locator('header .btn-version.v2').getAttribute('href'),'../');
  assert.ok((await equipes()).includes('Équipe de la v1'),'la v2 part d’une copie du travail de la v1');

  // 3. Ce qu'on fait dans la v2 reste dans la v2…
  await ajouter('Équipe de la v2');await attendre();
  await page.reload();await attendre();
  assert.ok((await equipes()).includes('Équipe de la v2'),'la v2 garde son travail');

  // 4. … et la v1 n'en voit rien.
  await page.goto(v1);await attendre();
  const dansV1=await equipes();
  assert.ok(dansV1.includes('Équipe de la v1'));
  assert.ok(!dansV1.includes('Équipe de la v2'),'la v2 n’écrit pas dans la v1');
  const cles=await page.evaluate(()=>{const o=[];for(let i=0;i<localStorage.length;i++)o.push(localStorage.key(i));return o;});
  assert.ok(cles.some(k=>k.startsWith('ory-v2:')),'les données de la v2 sont rangées sous « ory-v2: »');
  assert.ok(cles.includes('ory-v2:__copie-de-la-v1'),'la copie n’a lieu qu’une fois');

  // 5. Une modification ultérieure de la v1 ne se recopie pas dans la v2.
  await ajouter('Plus tard dans la v1');await attendre();
  await page.goto(v2);await attendre();
  assert.ok(!(await equipes()).includes('Plus tard dans la v1'),'après la première ouverture, les deux versions vivent leur vie');

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('v2-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

/* Retour d'usage : « ça bug encore, je ne peux pas naviguer sur le site ». Un
 * démarrage qui ne va pas au bout laisse sa marque ; au chargement suivant, la
 * page de secours s'ouvre : elle ne fait aucun calcul, rend les données, et
 * permet de repartir sans elles — puis de les remettre. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1280,height:800},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(300);
 const site=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
 try{
  await page.goto(site);await attendre();
  // 1. Un démarrage normal efface sa marque.
  assert.equal(await page.evaluate(()=>localStorage.getItem('ory-demarrage-en-cours')),null,'le démarrage est allé au bout');
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'x1',nom:'Case témoin',service:'cuisine',type:'manuel',
    debut:'05:00',jour:0,personnes:2,pauses:[],lots:[],regime:{actif:true}});},''));
  // 2. Un démarrage resté en plan (la marque est là) : le chargement suivant ouvre le secours.
  await page.evaluate(()=>localStorage.setItem('ory-demarrage-en-cours','1'));
  await page.goto(site);await attendre();
  assert.match(page.url(),/secours\.html\?bloque=1/,'on arrive sur la page de secours');
  assert.equal(await page.locator('#bloque').isVisible(),true);
  assert.match(await page.locator('#liste').innerText(),/ory-ateliers-v1/);
  // 3. Récupérer ses données : un fichier de sauvegarde complète.
  const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('#telecharger').click()]);
  const f=path.join(os.tmpdir(),'secours-'+process.pid+'.json');await dl.saveAs(f);
  const sv=JSON.parse(fs.readFileSync(f,'utf8'));fs.unlinkSync(f);
  assert.equal(sv.schema,'ory-sauvegarde');
  assert.ok(sv.contenu['ory-ateliers-v1'].ateliers.some(a=>a.id==='x1'),'les cases sont dans le fichier');
  // 4. Mettre les cases de côté : le site s'ouvre sans elles.
  await page.locator('#cote-cases').click();await page.waitForURL(/index\.html\?continuer=1/);await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.some(a=>a.id==='x1')),false,'repartis sans les cases');
  assert.ok(await page.evaluate(()=>!!localStorage.getItem('ory-secours-copie')),'elles sont gardées de côté');
  await page.locator('#menu [data-vers-partie=organisation]').click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.partie),'organisation','on navigue');
  // 5. Les remettre.
  await page.goto(pathToFileURL(path.resolve(__dirname,'../secours.html')).href);await attendre();
  assert.equal(await page.locator('#bloque').isVisible(),false,'pas de blocage à signaler');
  await page.locator('#remettre').click();await attendre();
  await page.goto(site);await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.some(a=>a.id==='x1')),true,'les cases sont revenues');
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('secours-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

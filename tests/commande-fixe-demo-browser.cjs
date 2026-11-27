/* Évolution 26 (d), corrigée en (g) — une commande fixe, sur le programme d'exemple (version 1), à 1 366 × 768.
 * Tant que le programme est celui de démonstration, chaque compagnie de la liste sans départ y reçoit des vols d'essai
 * (sim.js, `suivreDemo`). Une compagnie « Fixe, sans vol » n'en reçoit pas : ses départs sont ses commandes fixes. Sinon,
 * les départs d'essai, pris pour des lignes du programme, remplaceraient sa quantité par la leur.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 try{
  const page=await browser.newPage({viewport:{width:1366,height:768}});
  page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
  const attendre=ms=>page.waitForTimeout(ms);
  await F.restaurer(page,nav,URL_V1,F.sauvegardeComplete(),'mu-commandes');
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.commandes);
  const source=()=>page.evaluate(()=>document.getElementById('source-label').textContent);
  assert.match(await source(),/^Jeu de démonstration/,'le programme d’exemple');
  // Une compagnie fixe, 80 par jour en économie.
  await page.locator('#mu-commandes [data-co-action="ouvrir-ajout"]').click();await attendre(200);
  await page.keyboard.type('cantine');await page.locator('#mu-commandes [data-co-champ="type"][value="fixe"]').check();
  await page.locator('#mu-commandes [data-co-action="valider"]').click();await attendre(600);
  await page.locator('#mu-commandes [data-co-ouvrir="CANTINE"]').click();await attendre(300);
  const quantite=page.locator('#mu-commandes [data-co-fixe="YC"][data-co-fixe-champ="quantite"]');
  await quantite.fill('80');await quantite.press('Enter');await attendre(800);
  // Aucun vol d'essai pour elle ; sa quantité est la sienne.
  assert.doesNotMatch(await source(),/vols d’essai : [^]*CANTINE/,'pas de vols d’essai pour une compagnie fixe');
  assert.deepEqual(await page.evaluate(()=>Sim.dataCourante.filter(v=>String(v.cie).toUpperCase()==='CANTINE').map(v=>v.id)),[],'aucun vol de CANTINE au programme');
  assert.equal(await page.evaluate(()=>(Sim.ateliers.resultat.parClasse['CANTINE/YC']||{}).pax),80,'sa quantité fixe : 80');
  // « Avec des vols » : elle redevient une compagnie à vols ; le programme d'exemple lui donne ses vols d'essai.
  await page.locator('#mu-commandes [data-co-champ="type-cie"][value="vols"]').check();await attendre(800);
  assert.match(await source(),/vols d’essai : [^]*CANTINE/,'avec des vols : ses vols d’essai');
  assert.deepEqual(erreurs,[],'aucune erreur de page');
  console.log('commande-fixe-demo-browser : ok — sur le programme d’exemple, une compagnie fixe ne reçoit pas de vols d’essai, et sa quantité est la sienne ; « Avec des vols », elle les reçoit');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

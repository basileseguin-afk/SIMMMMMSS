/* La page entière ne défile jamais (retour d'usage du 05/10 : « bug de
 * scrolling pour le service Plonge »). Seule la vue défile : l'en-tête et le
 * menu restent en place. Un texte pour lecteur d'écran (.sr-only), posé dans
 * une fiche longue, se calait sur la page et l'allongeait (fiche Plonge avec
 * son équipe, Barème par service) : la molette faisait alors remonter l'en-tête.
 * Toutes les pages, et chaque fiche de service, v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(150);
 const deborde=()=>page.evaluate(()=>document.documentElement.scrollHeight-innerHeight);
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();

   // 1. La plonge, avec son équipe : la fiche est longue, la page ne bouge pas.
   await nav.aller(page,'mu-services');
   await page.locator('#mu-services [data-mu-choisir=plonge]').click();await attendre();
   await page.locator('#mu-services [data-mu-action=equipe]').click();await page.waitForTimeout(300);
   assert.ok(await page.locator('#mu-services [data-at-champ]').count()>0,'l’équipe de plonge est là');
   assert.equal(await deborde(),0,version+' : la fiche de la plonge n’allonge pas la page');
   const vue=page.locator('#view-ateliers');
   assert.ok(await vue.evaluate(v=>v.scrollHeight>v.clientHeight),'c’est la vue qui défile');
   // La molette, sur la fiche puis sur l'en-tête : l'en-tête reste en place.
   await page.mouse.move(800,600);await page.mouse.wheel(0,800);await attendre();
   assert.ok(await vue.evaluate(v=>v.scrollTop)>0,'la fiche défile');
   await page.mouse.move(700,100);await page.mouse.wheel(0,400);await attendre();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollTop),0,version+' : l’en-tête ne remonte pas');
   assert.equal(await page.locator('#menu').evaluate(m=>Math.round(m.getBoundingClientRect().top)>=0),true);

   // 2. Toutes les pages du menu.
   const ids=await page.evaluate(()=>Object.values(OrlyOnglets.ONGLETS).flat().map(o=>o.id).filter(id=>OrlyOnglets.partieDe(id)));
   for(const id of ids){await nav.aller(page,id);assert.equal(await deborde(),0,version+' : '+id+' allonge la page');}

   // 3. Chaque fiche de service.
   await nav.aller(page,'mu-services');
   for(const s of await page.locator('#mu-services [data-mu-choisir]').evaluateAll(bs=>bs.map(x=>x.dataset.muChoisir))){
    await page.locator(`#mu-services [data-mu-choisir="${s}"]`).click();await attendre();
    assert.equal(await deborde(),0,version+' : la fiche de '+s+' allonge la page');
   }
  }
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('defilement-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

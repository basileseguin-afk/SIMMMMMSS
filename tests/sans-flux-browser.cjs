/* Une équipe dans un service où aucun flux ne passe (retour d'usage du 06/10 :
 * « le frigo départ et le BOB, une équipe de nombre constant qui prépare des
 * commandes, mais ça met l'équipe ne prépare rien ? »). Ce n'est pas son
 * effectif : sa grille est grisée parce qu'aucun chemin ne passe par le
 * service. Le site le dit sous la grille, et « Faire passer tous les flux par
 * ici » la débloque ; ses commandes passent ensuite dans ses heures de
 * présence (poste constant : pas de minutes). CF départ food et Duty free, v1 et v2. */
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
   await nav.aller(page,'mu-services');
   for(const s of ['handling','bobduty']){
    await page.locator(`${M} [data-mu-choisir=${s}]`).click();await attendre();
    await page.locator(`${M} [data-mu-action=equipe]`).first().click();await attendre();
    assert.equal(await page.locator(`${M} .mu-equipe [data-mu-cocher]:not(:disabled)`).count(),0,version+' '+s+' : grille grisée');
    assert.match(await page.locator(`${M} .mu-aucun-flux`).innerText(),/Aucun flux ne passe par[\s\S]*Ce n’est pas son effectif/,version+' '+s+' : le site dit pourquoi');
    await page.locator(`${M} .mu-aucun-flux [data-mu-action=flux-tous]`).click();await attendre();
    assert.equal(await page.locator(`${M} .mu-aucun-flux`).count(),0,'plus de message');
    assert.ok(await page.evaluate(s=>Sim.ateliers.state.parcours.every(p=>p.noeuds.includes(s)),s),version+' '+s+' : dans tous les flux');
    await page.locator(`${M} .mu-equipe [data-mu-cocher]:not(:disabled)`).first().click();await attendre();
    const r=await page.evaluate(s=>{const a=Sim.ateliers.state.ateliers.find(x=>x.service===s);return {lots:a.lots.length,
      journal:Sim.ateliers.resultat.lots.filter(l=>l.atelier===a.id).map(l=>[l.duree,l.hommeMinutes,l.impossible])};},s);
    assert.equal(r.lots,1,version+' '+s+' : elle prépare une commande');
    assert.deepEqual(r.journal,[[0,0,false]],'poste constant : la commande passe dans ses heures, sans minutes');
   }
  }
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('sans-flux-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

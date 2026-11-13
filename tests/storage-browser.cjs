/* Les stockages d'un service, dans le navigateur : de vrais clics, ajouter, modifier, retirer, annuler et rétablir, le
 * rechargement, l'éditeur, l'export, la reprise d'un plan en version 2, la fenêtre étroite.
 * Chaque rechargement attend que le plan soit écrit dans le navigateur, que la page ait redémarré et que le service soit
 * choisi, pas un délai (correction 18 c) : le test ne dépend pas de la vitesse de la machine. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const click=s=>page.locator(s).click();
 const state=()=>page.evaluate(()=>structuredClone(Sim.editor.state));
 const selected=()=>page.evaluate(()=>structuredClone(Sim.editor.zone));
 const drag=async(x,y,dx,dy)=>{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:6});await page.mouse.up();};
 const center=async selector=>{const b=await page.locator(selector).boundingBox();assert.ok(b);return{x:b.x+b.width/2,y:b.y+b.height/2};};

 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await nav.pret(page);
  // Le site s'ouvre sur l'étape à faire ensuite : ce parcours travaille sur le plan.
  const versPlan=async()=>{await nav.vue(page,'plan');await page.locator('.zone[data-id="cuisine"]').waitFor();};await versPlan();
  /** Les stockages de la cuisine, tels qu'ils sont écrits dans le navigateur. */
  const cuisineEnregistree=(n,nom)=>nav.enregistre(page,'orly-plan-v3',(v,[n,nom])=>{const c=v.zones.find(z=>z.id==='cuisine');return !!c&&c.storages.length===n&&(nom===null||c.storages[0].nom===nom);},[n,nom===undefined?null:nom]);
  /** Choisir la cuisine d'un vrai clic sur le plan (BUG-002), et attendre qu'elle soit choisie : si le plan se redessinait sous le pointeur, on reclique. */
  const choisirCuisine=async()=>{
    for(let essai=0;essai<5;essai++){
      await page.locator('.zone[data-id="cuisine"]').click();
      if(await page.waitForFunction(()=>document.getElementById('zone-picker').value==='cuisine',null,{timeout:5000}).then(()=>true,()=>false))return;
    }
    assert.fail('la cuisine ne se choisit pas d’un clic sur le plan');
  };
  // Real mouse selection, not synthetic dispatch: BUG-002.
  await page.locator('.zone[data-id="cuisine"]').click();
  assert.equal(await page.locator('#zone-picker').inputValue(),'cuisine');
  assert.equal(await page.locator('.zone[data-id="cuisine"]').getAttribute('aria-pressed'),'true');
  const panel=page.locator('#service-storages');await panel.locator('[data-stock-action=add]').click();
  await panel.locator('input').fill('Réserve essai');await panel.locator('textarea').click();
  await panel.locator('textarea').fill('Produits de démonstration');await panel.locator('input').click();
  assert.equal((await state()).zones.find(z=>z.id==='cuisine').storages[0].contenu,'Produits de démonstration');
  await panel.locator('[data-stock-action=add]').click();assert.equal(await panel.locator('fieldset').count(),2);
  await panel.locator('[data-stock-action=remove]').last().click();assert.equal(await panel.locator('fieldset').count(),1);
  await panel.locator('[data-stock-action=undo]').click();assert.equal(await panel.locator('fieldset').count(),2);
  await panel.locator('[data-stock-action=redo]').click();assert.equal(await panel.locator('fieldset').count(),1);
  await cuisineEnregistree(1,'Réserve essai');
  await nav.recharger(page);await versPlan();await cuisineEnregistree(1,'Réserve essai');
  await choisirCuisine();await panel.locator('input').waitFor();assert.equal(await panel.locator('input').inputValue(),'Réserve essai');
  await click('#btn-edit');await click('[data-action=select][data-zone=cuisine]');assert.equal(await page.locator('#pe-storages input').inputValue(),'Réserve essai');
  const download=page.waitForEvent('download');await page.evaluate(()=>Sim.editor.export());const d=await download;const exported=JSON.parse(fs.readFileSync(await d.path(),'utf8'));assert.equal(exported.zones.find(z=>z.id==='cuisine').storages.length,1);
  await click('#edit-done');await click('#sim-pas');
  await page.locator('[data-clear-selection]').click({delay:150});assert.equal(await page.locator('#zone-picker').inputValue(),'');
  // Existing v2 data migrates without assuming which service owns a fridge.
  await page.evaluate(()=>{const p=structuredClone(Sim.editor.state);p.version=2;p.zones.push({id:'cold-custom',nom:'Ancien froid',kind:'cold',x:0,y:0,w:20,h:20});localStorage.removeItem('orly-plan-v3');localStorage.setItem('orly-plan-v2',JSON.stringify(p));});
  await nav.recharger(page);await versPlan();await choisirCuisine();assert.equal((await state()).unassignedStorages.length,1);assert.equal(await page.locator('[data-pe-zone="cold-custom"]').count(),0);
  await panel.locator('summary').click();await panel.locator('[data-stock-action=assign]').click();assert.equal((await state()).unassignedStorages.length,0);assert.equal(await panel.locator('fieldset').count(),2);
  await cuisineEnregistree(2);
  await nav.recharger(page);await versPlan();assert.equal((await state()).zones.find(z=>z.id==='cuisine').storages.length,2);
  await page.setViewportSize({width:1024,height:700});await page.locator('#zone-picker').selectOption('cuisine');assert.equal(await panel.isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);console.log('Service storage browser passed: real clicks, CRUD, undo/redo, reload, editor, export, v2 migration and assignment, running close, narrow desktop.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

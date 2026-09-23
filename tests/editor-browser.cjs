const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
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
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await page.evaluate(()=>localStorage.setItem('orly-zones',JSON.stringify({cuisine:{x:1880,y:1560,w:280,h:520,approx:true}})));await page.reload();
  await click('#btn-edit');assert.equal(await page.locator('#btn-play').isDisabled(),true);
  const initial=(await state()).zones.length;assert.ok(initial>=11&&initial<30,'storage shapes no longer clutter the plan');
  await click('[data-action=select][data-zone=cuisine]');assert.equal((await selected()).x,1880);await click('#pe-focus');
  const h1=await page.locator('.handle-nw').boundingBox();await click('#zoom-in');const h2=await page.locator('.handle-nw').boundingBox();assert.ok(Math.abs(h1.width-h2.width)<.5,'handles remain constant screen size');
  await click('#zoom-reset');await page.locator('summary').filter({hasText:'Fond & aide au placement'}).click();await page.locator('#pe-snap').uncheck();await page.locator('summary').filter({hasText:'Fond & aide au placement'}).click();
  await click('[data-pe-tool=rect]');const box=await page.locator('#plan').boundingBox();
  await drag(box.x+150,box.y+160,160,100);assert.equal((await state()).zones.length,initial+1);
  await page.locator('#pe-name').fill('Local essai');await page.locator('#pe-name').press('Tab');let z=await selected();const id=z.id;assert.equal(z.nom,'Local essai');
  let c=await center(`[data-pe-zone="${id}"] rect`);const oldX=z.x;await drag(c.x,c.y,35,20);assert.notEqual((await selected()).x,oldX);
  await page.keyboard.press('Control+z');assert.equal((await selected()).x,oldX);await page.keyboard.press('Control+Shift+z');assert.notEqual((await selected()).x,oldX);
  const w=(await selected()).w;c=await center('.handle-e');await drag(c.x,c.y,35,0);assert.ok((await selected()).w>w);
  await page.locator('#pe-locked').check();z=await selected();c=await center(`[data-pe-zone="${id}"] rect`);await drag(c.x,c.y,35,20);assert.equal((await selected()).x,z.x);await page.locator('#pe-locked').uncheck();
  await click('#pe-duplicate');assert.equal((await state()).zones.length,initial+2);assert.equal((await selected()).kind,'room');await click('#pe-delete');assert.equal((await state()).zones.length,initial+1);await click('#pe-undo');assert.equal((await state()).zones.length,initial+2);
  await click('[data-pe-tool=poly]');for(const [dx,dy]of [[400,170],[570,170],[560,300],[410,270]])await page.mouse.click(box.x+dx,box.y+dy);await page.keyboard.press('Enter');z=await selected();assert.equal(z.pts.length,4);
  const beforeMove=JSON.stringify(z.pts);c=await center('.handle-vertex[data-index="1"]');await drag(c.x,c.y,15,25);assert.notEqual(JSON.stringify((await selected()).pts),beforeMove);
  c=await center('.handle-mid[data-index="0"]');await drag(c.x,c.y,0,-15);assert.equal((await selected()).pts.length,5);
  await click('#pe-delete-vertex');assert.equal((await selected()).pts.length,4);
  const count=(await state()).zones.length;await click('[data-pe-tool=poly]');await page.mouse.click(box.x+100,box.y+100);await page.mouse.click(box.x+180,box.y+100);await page.keyboard.press('Escape');assert.equal((await state()).zones.length,count);
  // Pan without moving a shape.
  const geometry=JSON.stringify((await state()).zones);await click('[data-pe-tool=hand]');const transform=await page.locator('#viewport').getAttribute('transform');await drag(box.x+100,box.y+100,50,40);assert.notEqual(await page.locator('#viewport').getAttribute('transform'),transform);assert.equal(JSON.stringify((await state()).zones),geometry);
  await click('[data-pe-tool=select]');await click('[data-action=select][data-zone=cuisine]');assert.equal(await page.locator('#pe-delete').isDisabled(),true);
  await page.locator('#pe-search').fill('Local essai');assert.equal(await page.locator('.pe-list-row').count(),2);await page.locator('#pe-search').fill('');
  // Entire exported document survives reload and round-trip import.
  await page.locator('summary').filter({hasText:'Enregistrer & partager'}).click();
  const downloadPromise=page.waitForEvent('download');await click('#pe-export');const download=await downloadPromise;const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(exported.zones.length,count);
  await page.reload();await click('#btn-edit');assert.deepEqual((await state()).zones,exported.zones);
  const beforeInvalid=JSON.stringify(await state());await page.locator('#pe-import').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({schema:'ory-plan',version:2,zones:[]}))});await page.waitForFunction(()=>document.getElementById('pe-status').textContent.includes('Import refusé'));assert.equal(JSON.stringify(await state()),beforeInvalid);
  await page.locator('#pe-import').setInputFiles({name:'plan.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});await page.waitForFunction(()=>document.getElementById('pe-status').textContent.includes('Plan importé'));assert.deepEqual((await state()).zones,exported.zones);
  await click('[data-action=select][data-zone=cuisine]');await click('#pe-focus');await page.screenshot({path:path.join(os.tmpdir(),'ory-editor-desktop.png'),fullPage:true});
  await click('#btn-theme');await page.waitForTimeout(200);await page.screenshot({path:path.join(os.tmpdir(),'ory-editor-dark.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(os.tmpdir(),'ory-editor-mobile.png'),fullPage:true});
  await click('#edit-done');assert.notEqual(await page.locator('#run-state').textContent(),'Édition du plan');assert.equal(await page.locator('#btn-play').isDisabled(),await page.evaluate(()=>Sim.vue.vide),'hors édition, seul un jour vide empêche de lire');assert.equal(await page.locator('[data-pe-tool=rect]').isVisible(),false);assert.deepEqual(errors,[]);
  console.log('Editor browser passed: legacy migration, storage zones, constant handles, drawing, movement, resize, undo/redo, locking, duplicate/delete, polygons, pan, import/export/reload, desktop/dark/mobile.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

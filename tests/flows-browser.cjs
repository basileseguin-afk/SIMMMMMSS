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
  const endpoint=(id,stock=null)=>JSON.stringify([id,stock]);
  await click('[data-view=flux]');assert.equal(await page.locator('#view-flux').isVisible(),true);assert.equal(await page.locator('.workbench').isVisible(),false);
  const old=await page.evaluate(()=>Sim.flows.state.flows.length);assert.equal(old,16);
  const add=async(type,from,to)=>{await page.locator('#fc-type').selectOption(type);await page.locator('#fc-from').selectOption(endpoint(from));await page.locator('#fc-to').selectOption(endpoint(to));await page.locator('#fc-add button[type=submit]').click();};
  await add('raw','appros','cuisine');await add('raw','appros','prepa');await add('raw','cuisine','prepa');
  assert.equal(await page.evaluate(()=>Sim.flows.state.flows.filter(f=>f.type==='raw').length),3);
  await add('raw','appros','cuisine');assert.match(await page.locator('#fc-status').innerText(),/existe déjà/);
  await page.locator('#fc-type').selectOption('personnel');await page.locator('#fc-from').selectOption(endpoint('cuisine'));
  assert.equal(await page.locator('#fc-to option').count(),1,'employee cannot select another service');
  await add('runner','cuisine','prepa');let row=page.locator('#fc-list article').first();
  await row.locator('[data-action=reverse]').click();assert.equal(await page.locator('#fc-list article').count(),2);
  await row.locator('[data-field=enabled]').uncheck();assert.equal(await page.evaluate(()=>Sim.flows.state.flows.filter(f=>f.type==='runner'&&f.enabled).length),1);
  await click('#fc-undo');assert.equal(await page.evaluate(()=>Sim.flows.state.flows.filter(f=>f.type==='runner'&&f.enabled).length),2);
  await click('#fc-show-map');assert.equal(await page.locator('#flow-edges [data-flow-id]').count(),2);
  await page.locator('#fc-map-filter').selectOption('none');assert.equal(await page.locator('#flow-edges [data-flow-id]').count(),0);
  await click('[data-view=flux]');await add('of','cuisine','prepa');await add('kanban','prepa','cuisine');
  await page.locator('#fc-list article').first().locator('[data-field=label]').fill('<img src=x onerror=alert(1)>');await page.locator('#fc-list article').first().locator('[data-action=reverse]').click();
  assert.equal(await page.locator('#fc-list article').count(),3,'blur does not swallow reverse click');assert.equal(await page.locator('#fc-list img').count(),0);
  await page.reload();await click('[data-view=flux]');assert.equal(await page.evaluate(()=>Sim.flows.state.flows.length),old+8);
  const download=page.waitForEvent('download');await click('#fc-export');const d=await download;const exported=fs.readFileSync(await d.path(),'utf8');
  await page.locator('#fc-import').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"schema":"ory-flows","version":99}')});await page.waitForFunction(()=>document.getElementById('fc-status').textContent.includes('Import refusé'));assert.match(await page.locator('#fc-status').innerText(),/Import refusé/);
  assert.equal(await page.evaluate(()=>Sim.flows.state.flows.length),old+8);
  await page.locator('#fc-import').setInputFiles({name:'good.json',mimeType:'application/json',buffer:Buffer.from(exported)});await page.waitForFunction(()=>document.getElementById('fc-status').textContent.includes('Flux importés'));
  // A service storage becomes an endpoint, rename remains linked, delete is flagged.
  await click('[data-view=plan]');await page.locator('#zone-picker').selectOption('cuisine');await page.locator('#service-storages [data-stock-action=add]').click();
  const stock=await page.evaluate(()=>Sim.editor.state.zones.find(z=>z.id==='cuisine').storages[0].id);
  await click('[data-view=flux]');await page.locator('#fc-type').selectOption('processed');await page.locator('#fc-from').selectOption(endpoint('cuisine',stock));await page.locator('#fc-to').selectOption(endpoint('prepa'));await page.locator('#fc-add button[type=submit]').click();
  await click('[data-view=plan]');await page.locator('#service-storages [data-stock-action=remove]').click();
  await click('[data-view=flux]');assert.match(await page.locator('#fc-summary').innerText(),/à réparer/);
  await click('[data-view=plan]');await page.locator('#service-storages [data-stock-action=undo]').click();await click('[data-view=flux]');assert.doesNotMatch(await page.locator('#fc-summary').innerText(),/à réparer/);
  await click('[data-family=human]');await page.locator('#fc-internal [data-owner=cuisine]').uncheck();assert.equal(await page.evaluate(()=>Sim.flows.state.internal.cuisine),false);
  await page.screenshot({path:'/tmp/ory-flows-desktop.png'});
  await click('#btn-theme');await page.screenshot({path:'/tmp/ory-flows-dark.png'});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'/tmp/ory-flows-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log('Flow center browser passed: many-to-many, human restrictions, reverse, active/map filters, CRUD, persistence, import/export, storage lifecycle, dark/mobile.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

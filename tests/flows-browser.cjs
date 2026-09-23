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
  // Le formulaire de création s'ouvre à la demande : il ne traîne plus en
  // permanence en tête de liste, où on le lisait comme la première liaison
  // (BUG-014).
  assert.equal(await page.locator('#fc-add').isHidden(),true,'fermé au départ');
  assert.equal(await page.locator('#fc-new').isVisible(),true,'le bouton de création est visible');
  assert.equal(await page.locator('#fc-list #fc-add, #fc-list #fc-new').count(),0,'ni l’un ni l’autre dans la liste');
  assert.equal(await page.locator('#fc-add.fc-card').count(),0,'le formulaire n’a plus l’allure d’une liaison');
  await page.locator('#fc-new').click();
  assert.equal(await page.locator('#fc-add').isVisible(),true);
  await page.locator('#fc-cancel').click();
  assert.equal(await page.locator('#fc-add').isHidden(),true,'« Fermer » le referme');
  const ouvrir=async()=>{if(await page.locator('#fc-add').isHidden())await page.locator('#fc-new').click();};
  const add=async(type,from,to)=>{await ouvrir();await page.locator('#fc-type').selectOption(type);await page.locator('#fc-from').selectOption(endpoint(from));await page.locator('#fc-to').selectOption(endpoint(to));await page.locator('#fc-add button[type=submit]').click();};
  await add('raw','appros','cuisine');await add('raw','appros','prepa');await add('raw','cuisine','prepa');
  assert.equal(await page.evaluate(()=>Sim.flows.state.flows.filter(f=>f.type==='raw').length),3);
  await add('raw','appros','cuisine');assert.match(await page.locator('#fc-status').innerText(),/existe déjà/);
  await ouvrir();await page.locator('#fc-type').selectOption('personnel');await page.locator('#fc-from').selectOption(endpoint('cuisine'));
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
  await click('[data-view=flux]');await ouvrir();await page.locator('#fc-type').selectOption('processed');await page.locator('#fc-from').selectOption(endpoint('cuisine',stock));await page.locator('#fc-to').selectOption(endpoint('prepa'));await page.locator('#fc-add button[type=submit]').click();
  await click('[data-view=plan]');await page.locator('#service-storages [data-stock-action=remove]').click();
  await click('[data-view=flux]');assert.match(await page.locator('#fc-summary').innerText(),/à réparer/);
  await click('[data-view=plan]');await page.locator('#service-storages [data-stock-action=undo]').click();await click('[data-view=flux]');assert.doesNotMatch(await page.locator('#fc-summary').innerText(),/à réparer/);
  await click('[data-family=human]');await page.locator('#fc-internal [data-owner=cuisine]').uncheck();assert.equal(await page.evaluate(()=>Sim.flows.state.internal.cuisine),false);

  /* Ce que le modèle en lit : depuis les ateliers de travail, ce graphe n'est
   * plus décoratif — il donne le parcours. La section le dit et le montre. */
  await click('[data-view=flux]');
  assert.doesNotMatch(await page.locator('#view-flux .scope-badge').textContent(),/sans effet/,
    'le badge ne peut plus dire que ce graphe ne sert à rien');
  assert.match(await page.locator('#fc-lecture').textContent(),/son chemin/,'le chemin du repas passe avant ces liens');
  assert.match(await page.locator('#fc-lecture').textContent(),/tous ceux qui le\s+livrent/);
  // Sans aucune équipe décrite, le graphe ne porte aucun parcours, et on le dit.
  assert.match(await page.locator('#fc-parcours').textContent(),/Aucune équipe/);
  // Une équipe au montage met ses fournisseurs sur le chemin.
  await click('[data-view=ateliers]');
  await page.locator('#at-new').click();await page.waitForTimeout(150);
  const eq=await page.evaluate(()=>Sim.ateliers.state.ateliers.at(-1).id);
  await page.selectOption(`[data-at="${eq}"] [data-at-champ=service]`,'prepa');await page.waitForTimeout(150);
  await page.selectOption(`[data-at="${eq}"] [data-at-champ=lot-nouveau]`,'CRL/BC');await page.waitForTimeout(250);
  await click('[data-view=flux]');await page.waitForTimeout(150);
  // Le nom du service est en TÊTE de ligne : le chercher dans toute la ligne
  // attraperait MAGASIN, qui livre à MONTAGE.
  const parcours=nom=>page.evaluate(n=>{
    const tr=[...document.querySelectorAll('#fc-parcours tbody tr')].find(r=>r.cells[0].textContent.trim()===n);
    return tr?[...tr.cells].map(c=>c.textContent.trim()).join(' | '):null;
  },nom);
  const ligne=await parcours('MONTAGE');
  assert.match(ligne,/1 équipe/);
  assert.match(ligne,/CUISINE/,'ses fournisseurs sont nommés');
  // Un fournisseur sans équipe ne produit rien : l'alerte le dit et propose le remède.
  assert.match(await page.locator('#fc-alertes').textContent(),/sans avoir d’équipe/);
  assert.match(await page.locator('#fc-alertes').textContent(),/mise à disposition/);
  // Une mise à disposition sur ce fournisseur fait taire l'alerte le concernant.
  await click('[data-view=ateliers]');
  await page.locator('#at-new').click();await page.waitForTimeout(150);
  const md=await page.evaluate(()=>Sim.ateliers.state.ateliers.at(-1).id);
  await page.selectOption(`[data-at="${md}"] [data-at-champ=service]`,'magasin');await page.waitForTimeout(150);
  await page.selectOption(`[data-at="${md}"] [data-at-champ=type]`,'dispo');await page.waitForTimeout(250);
  await click('[data-view=flux]');await page.waitForTimeout(150);
  assert.doesNotMatch(await page.locator('#fc-alertes').textContent(),/MAGASIN/,
    'le magasin n’est plus signalé');
  assert.match(await parcours('MAGASIN'),/mise à disposition/i);

  await page.screenshot({path:'/tmp/ory-flows-desktop.png'});
  await click('#btn-theme');await page.screenshot({path:'/tmp/ory-flows-dark.png'});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'/tmp/ory-flows-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log('Flow center browser passed: many-to-many, human restrictions, reverse, active/map filters, CRUD, persistence, import/export, storage lifecycle, dark/mobile.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

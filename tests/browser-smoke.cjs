/* Run with Playwright installed; optional CHROMIUM_EXECUTABLE_PATH for a system browser. */
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const file=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
 const click=s=>page.locator(s).click();
 const setRange=(s,v)=>page.locator(s).evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));},v);
 try {
  await page.goto(file);
  assert.equal(await page.locator('#kpi-ontime').textContent(),'—');
  assert.equal(await page.locator('#source-count').textContent(),'12 départs · 6 retours');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await click('[data-view="reglages"]');
  // Les commandes de lecture ne vivent plus que dans la vue qu'elles pilotent :
  // ailleurs, un gros bouton « Lancer » invitait à lancer ce qu'on ne regardait pas.
  assert.equal(await page.locator('#btn-play').isVisible(),false,'pas de « Lancer » sur les réglages');
  assert.equal(await page.locator('.kpi-grille').isVisible(),false,'ni les indicateurs de la simulation');
  await click('[data-view="plan"]');
  assert.equal(await page.locator('#btn-play').isVisible(),true);
  // Rien n'est décrit : il n'y a pas de journée à relire, et le bouton le dit
  // plutôt que de lancer une lecture vide.
  assert.equal(await page.locator('#btn-play').isDisabled(),true);
  assert.match(await page.locator('#run-state').textContent(),/Rien à relire/);
  // Les réglages ne se verrouillent plus : la journée se recalcule à chaque frappe.
  await click('[data-view="vols"]');
  assert.equal(await page.locator('#loadDelay').isDisabled(),false);
  await click('[data-view="vols"]');assert.equal(await page.locator('#flight-rows tr').count(),12);
  await page.locator('#flight-search').fill('NO-MATCH');assert.match(await page.locator('#flight-rows').textContent(),/Aucun départ/);
  await page.locator('#flight-search').fill('');
  await click('[data-view="plan"]');await page.locator('#zone-picker').selectOption('prepa');assert.match(await page.locator('#goulot-info').textContent(),/MONTAGE/);
  await click('#btn-edit');assert.equal(await page.locator('#btn-play').isVisible(),false,'pas de lecture pendant l’édition du plan');
  await page.locator('[data-action=select][data-zone=cuisine]').click();
  await page.locator('#pe-x').fill('1910');await page.locator('#pe-x').press('Tab');
  await click('#pe-convert');await click('#edit-done');
  const geom=await page.evaluate(()=>Object.fromEntries(JSON.parse(localStorage.getItem('orly-plan-v3')).zones.map(z=>[z.id,z])));
  assert.equal(geom.cuisine.x,1910);assert.equal(geom.cuisine.approx,true);assert.equal(geom.cuisine.pts.length,4);
  await page.reload();assert.equal(await page.evaluate(()=>Object.fromEntries(JSON.parse(localStorage.getItem('orly-plan-v3')).zones.map(z=>[z.id,z])).cuisine.x),1910);
  await click('[data-view="vols"]');
  await page.locator('#imp-vols').setInputFiles({name:'invalid.csv',mimeType:'text/csv',buffer:Buffer.from('FlightId,Qty\n1,100')});
  await page.waitForFunction(()=>document.getElementById('import-report').classList.contains('error'));
  assert.match(await page.locator('#source-count').textContent(),/12 départs/);
  const header='vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC\n';
  await page.locator('#imp-vols').setInputFiles({name:'test.csv',mimeType:'text/csv',buffer:Buffer.from(header+'<img src=x>,TX,A350,DEP,05:00,,1,2,100')});
  await page.waitForFunction(()=>document.getElementById('source-label').textContent==='test.csv');
  await click('[data-view="vols"]');assert.equal(await page.locator('#flight-rows img').count(),0);assert.match(await page.locator('#flight-rows').textContent(),/<img src=x>/);
  // Personne ne fabrique ce vol : le tableau le dit, sans inventer de retard.
  assert.match(await page.locator('#flight-rows').textContent(),/Des repas sans équipe/);
  // Un atelier qui ouvre à 06:00 pour un départ de 05:00 : la classe sort, en retard.
  await click('[data-view="ateliers"]');
  await page.locator('[data-sous-onglet=at-equipes]').click();await page.locator('#at-new').click();await page.waitForTimeout(150);
  const at=await page.evaluate(()=>Sim.ateliers.state.ateliers.at(-1).id);
  await page.selectOption(`[data-at="${at}"] [data-at-champ=service]`,'prepa');await page.waitForTimeout(150);
  // Le vol emporte BC, PC et YC : l'atelier fabrique les trois.
  for(const c of ['TX/BC','TX/PC','TX/YC']){
    await page.selectOption(`[data-at="${at}"] [data-at-champ=lot-nouveau]`,c);await page.waitForTimeout(250);
  }
  await click('[data-view="plan"]');
  assert.equal(await page.locator('#btn-play').isDisabled(),false,'une journée existe : on peut la relire');
  await setRange('#vitesse','120');
  await click('#btn-play');await page.waitForFunction(()=>document.getElementById('run-state').textContent==='Fin de journée',{},{timeout:20000});
  assert.equal(await page.locator('#kpi-ontime').textContent(),'0 %');
  assert.equal(await page.locator('#kpi-overdue').textContent(),'0','sortie, elle n’est plus « en retard à venir »');
  // Le panneau de droite résume la journée entière et nomme qui attend.
  const bilan=await page.locator('#bilan-journee').textContent();
  assert.match(bilan,/0 sur 3/);assert.match(bilan,/Retard le plus long/);
  await page.locator('#zone-picker').selectOption('prepa');
  assert.match(await page.locator('#goulot-info').textContent(),/TX · Économie/,'le service choisi liste ce qu’il prépare, en clair');
  await page.locator('#zone-picker').selectOption('');
  await click('[data-view="vols"]');
  const ligneVol=await page.locator('#flight-rows').textContent();
  assert.match(ligneVol,/Prêt en retard/);
  // Comparer deux essais : un onglet de « La journée ».
  await click('[data-view="plan"]');await click('[data-sous-onglet=j-comparer]');
  await click('#snap-a');assert.match(await page.locator('#compare').textContent(),/Repas prêts à l’heure/);
  const downloaded=page.waitForEvent('download');await click('#btn-export');const download=await downloaded;
  const result=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  assert.equal(result.modele,'ateliers');
  assert.ok(result.departs[0].retard>0,'le retard du départ est exporté');
  assert.ok(result.instant,'l’instant relu est exporté');
  assert.ok(result.journal.some(l=>l.service==='prepa'),'le journal des lots est exporté');
  await click('[data-view="vols"]');await click('[data-sous-onglet=v-programme]');await click('#restore-demo');
  await click('[data-view="plan"]');await click('[data-sous-onglet=j-plan]');
  await page.evaluate(()=>{localStorage.removeItem('orly-zones');localStorage.removeItem('orly-plan-v3');});await page.reload();
  await page.screenshot({path:path.join(os.tmpdir(),'ory-interface-desktop.png'),fullPage:true});
  // Un seul thème, clair ; le site vise les écrans de bureau (1 024 px et plus).
  assert.equal(await page.locator('#btn-theme').count(),0,'plus de bascule de thème');
  await page.setViewportSize({width:1024,height:700});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await click('[data-view="vols"]');assert.equal(await page.locator('#flight-rows tr').count(),12);
  assert.deepEqual(errors,[]);
  console.log('Browser smoke passed: navigation, replay controls, editor persistence, CSV rejection/import, escaping, overdue completion, snapshots, export, narrow desktop layout.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

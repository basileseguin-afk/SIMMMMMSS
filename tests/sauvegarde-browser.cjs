/* Sauvegarde complète : l'aller-retour doit rendre un tracé intact après effacement. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const click=s=>page.locator(s).click();
 const cles=()=>page.evaluate(()=>['orly-plan-v3','ory-workshops-v1','orly-flows-v1'].map(k=>localStorage.getItem(k)));
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);

  // 1. Tracer quelque chose : une zone déplacée, une table de 5 personnes.
  await click('[data-view=ateliers]');await page.locator('.zone[data-id=cuisine]').click();
  const cells=await page.evaluate(()=>{const w=Sim.workshops,z=w.zone,s=w.state.step;for(let y=Math.ceil(z.y/s)+1;y<(z.y+z.h)/s-2;y++)for(let x=Math.ceil(z.x/s)+1;x<(z.x+z.w)/s-4;x++)if(Array.from({length:3},(_,i)=>OrlyWorkshops.cellInside((x+i)+','+y,z,s)).every(Boolean))return [x,y];throw Error('pas de place');});
  const scr=c=>page.evaluate(c=>{const q=document.getElementById('plan').createSVGPoint();q.x=(c[0]+.5)*Sim.workshops.state.step;q.y=(c[1]+.5)*Sim.workshops.state.step;const r=q.matrixTransform(document.getElementById('workshop-layer').getScreenCTM());return{x:r.x,y:r.y};},c);
  await click('[data-wg-tool=table]');
  const a=await scr(cells),b=await scr([cells[0]+2,cells[1]]);
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:6});await page.mouse.up();
  await click('[data-wg-tool=select]');await page.locator('#wg-items [data-wg-item]').first().click();
  await page.locator('#wg-item-postes').fill('5');await page.locator('#wg-item-postes').press('Tab');
  await page.locator('#wg-item-name').fill('Table témoin');await page.locator('#wg-item-name').press('Tab');
  await click('[data-view=plan]');await click('#btn-edit');
  await page.locator('[data-action=select][data-zone=cuisine]').click();
  await page.locator('#pe-x').fill('1888');await page.locator('#pe-x').press('Tab');await click('#edit-done');
  const avant=await cles();
  // Le centre des flux n'écrit sa clé que si on y touche : une partie absente
  // est normale, et la sauvegarde doit s'en accommoder.
  assert.ok(avant[0]&&avant[1],'plan et ateliers doivent exister après le tracé');

  // 2. Tout sauvegarder en un fichier.
  await click('[data-view=reglages]');
  const dl=page.waitForEvent('download');await click('#sauvegarde-export');const fichier=await dl;
  assert.match(fichier.suggestedFilename(),/^ory-sauvegarde-\d{4}-\d{2}-\d{2}\.json$/);
  const chemin=await fichier.path(),sauvegarde=JSON.parse(fs.readFileSync(chemin,'utf8'));
  assert.equal(sauvegarde.schema,'ory-sauvegarde');assert.equal(sauvegarde.version,1);
  assert.ok(sauvegarde.contenu['orly-plan-v3']&&sauvegarde.contenu['ory-workshops-v1']);
  assert.match(await page.locator('#sauvegarde-etat').textContent(),/partie\(s\) enregistrée/);

  // 3. Un fichier invalide ne remplace rien — la validation est atomique.
  const casse=JSON.parse(JSON.stringify(sauvegarde));
  casse.contenu['ory-workshops-v1'].items[0].cells=['pas une case'];
  await page.locator('#sauvegarde-import').setInputFiles({name:'casse.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(casse))});
  await page.waitForFunction(()=>document.getElementById('sauvegarde-etat').classList.contains('error'));
  assert.match(await page.locator('#sauvegarde-etat').textContent(),/ateliers et personnes/);
  assert.match(await page.locator('#sauvegarde-etat').textContent(),/Rien n’a été remplacé/);
  assert.deepEqual(await cles(),avant,'un refus ne doit toucher à aucune clé');
  await page.locator('#sauvegarde-import').setInputFiles({name:'autre.json',mimeType:'application/json',buffer:Buffer.from('{"schema":"autre"}')});
  await page.waitForFunction(()=>/pas une sauvegarde complète/.test(document.getElementById('sauvegarde-etat').textContent));
  assert.deepEqual(await cles(),avant);

  // 4. Tout effacer, comme un navigateur qui vide ses données de site.
  await page.evaluate(()=>localStorage.clear());await page.reload();
  await click('[data-view=ateliers]');await page.locator('#zone-picker').selectOption('cuisine');
  assert.equal(await page.locator('#wg-items [data-wg-item]').count(),0,'tout doit avoir disparu');

  // 5. Restaurer : le tracé revient à l'identique.
  await click('[data-view=reglages]');
  await page.locator('#sauvegarde-import').setInputFiles({name:'ory-sauvegarde.json',mimeType:'application/json',buffer:fs.readFileSync(chemin)});
  await page.waitForFunction(()=>localStorage.getItem('ory-workshops-v1')!==null,{},{timeout:15000});
  await page.waitForLoadState('load');
  assert.deepEqual(await cles(),avant,'les trois clés doivent être rendues à l’identique');
  await click('[data-view=ateliers]');await page.locator('#zone-picker').selectOption('cuisine');
  await page.locator('#wg-items [data-wg-item]').first().click();
  assert.equal(await page.locator('#wg-item-postes').inputValue(),'5');
  assert.match(await page.locator('#wg-items [data-wg-item]').first().textContent(),/Table témoin · 3 cases · 5 pers\./);
  assert.match(await page.locator('#wg-postes-total').textContent(),/5 personnes dans le service/);
  assert.equal(await page.evaluate(()=>Sim.editor.state.zones.find(z=>z.id==='cuisine').x),1888,'la zone déplacée est revenue');

  assert.deepEqual(errors,[]);
  console.log('Sauvegarde browser passed: full export, atomic refusal on invalid part, wipe and restore of plan, workshops and people.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

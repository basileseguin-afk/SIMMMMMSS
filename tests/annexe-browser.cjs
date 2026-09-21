/* Une zone de production annexe — « Armement 2 » — doit pouvoir être dessinée,
 * rattachée à un atelier du moteur, aménagée, et ses personnes comptées. */
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const click=s=>page.locator(s).click();
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);

  // 1. Dessiner un rectangle libre dans l'éditeur du plan.
  await click('#btn-edit');
  await click('[data-pe-tool=rect]');
  const box=await page.locator('#plan').boundingBox();
  await page.mouse.move(box.x+180,box.y+180);await page.mouse.down();
  await page.mouse.move(box.x+330,box.y+300,{steps:8});await page.mouse.up();
  let zone=await page.evaluate(()=>Sim.editor.zone&&{id:Sim.editor.zone.id,kind:Sim.editor.zone.kind});
  assert.ok(zone,'un rectangle a été créé');
  assert.equal(zone.kind,'room','par défaut ce n’est pas une zone de production');

  // 2. En faire une annexe d'Armement, et la nommer.
  await page.locator('#pe-name').fill('ARMEMENT 2');
  await page.locator('#pe-name').press('Tab');
  await page.locator('#pe-kind').selectOption('annexe');
  assert.equal(await page.locator('#pe-parent-champ').isVisible(),true,'l’atelier de rattachement est demandé');
  await page.locator('#pe-parent').selectOption('armement');
  zone=await page.evaluate(()=>({id:Sim.editor.zone.id,kind:Sim.editor.zone.kind,parent:Sim.editor.zone.parent,nom:Sim.editor.zone.nom}));
  assert.equal(zone.kind,'annexe');assert.equal(zone.parent,'armement');assert.equal(zone.nom,'ARMEMENT 2');
  await click('#edit-done');

  // 3. Elle figure dans la liste des services, sous son atelier.
  const options=await page.locator('#zone-picker option').allTextContents();
  const iArm=options.findIndex(t=>t.trim()==='ARMEMENT'), iAnx=options.findIndex(t=>t.includes('ARMEMENT 2'));
  assert.ok(iAnx>0,'l’annexe est proposée');
  assert.equal(iAnx,iArm+1,'elle est rangée juste sous son atelier');

  // 4. On peut l'aménager comme un service.
  await click('[data-view=ateliers]');
  await page.locator('#zone-picker').selectOption(zone.id);
  assert.match(await page.locator('#wg-service').textContent(),/ARMEMENT 2/);
  const cellule=await page.evaluate(()=>{const w=Sim.workshops,z=w.zone,s=w.state.step;
   for(let y=Math.ceil(z.y/s);y<(z.y+z.h)/s;y++)for(let x=Math.ceil(z.x/s);x<(z.x+z.w)/s;x++)
    if(OrlyWorkshops.cellInside(x+','+y,z,s))return [x,y];throw Error('aucune case dans l’annexe');});
  const p=await page.evaluate(c=>{const q=document.getElementById('plan').createSVGPoint();q.x=(c[0]+.5)*Sim.workshops.state.step;q.y=(c[1]+.5)*Sim.workshops.state.step;const r=q.matrixTransform(document.getElementById('workshop-layer').getScreenCTM());return{x:r.x,y:r.y};},cellule);
  await click('[data-wg-tool=table]');
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x,p.y,{steps:2});await page.mouse.up();
  assert.equal(await page.evaluate(()=>Sim.workshops.state.items.length),1);
  await page.locator('#wg-item-postes').fill('4');
  await page.locator('#wg-item-postes').press('Tab');

  // 5. Ses personnes comptent dans l'effectif de l'atelier dont elle dépend.
  await click('[data-view=reglages]');
  assert.match(await page.locator('#s-armement').textContent(),/grille 4/,'le tracé de l’annexe alimente ARMEMENT');
  await click('#grille-effectifs');
  assert.equal(await page.evaluate(()=>Sim.cfg.staff.armement),4);

  // 6. Le plan la montre et la décrit, sans prétendre à une file séparée.
  await click('[data-view=plan]');
  await page.locator('#zone-picker').selectOption(zone.id);
  assert.match(await page.locator('#goulot-info').textContent(),/Annexe de/);
  assert.match(await page.locator('#goulot-info').textContent(),/ARMEMENT/);

  // 7. Elle survit au rechargement.
  await page.reload();
  assert.equal(await page.evaluate(()=>Sim.editor.state.zones.filter(z=>z.kind==='annexe').length),1);
  assert.ok((await page.locator('#zone-picker option').allTextContents()).some(t=>t.includes('ARMEMENT 2')));

  // 8. Le chemin le plus court : dupliquer l'atelier donne directement sa 2e salle.
  await click('#btn-edit');
  await page.locator('.pe-shape[data-pe-zone=armement]').click();
  await click('#pe-duplicate');
  const copie=await page.evaluate(()=>({kind:Sim.editor.zone.kind,parent:Sim.editor.zone.parent,nom:Sim.editor.zone.nom}));
  assert.equal(copie.kind,'annexe','dupliquer un atelier ouvre une seconde salle');
  assert.equal(copie.parent,'armement');
  assert.equal(copie.nom,'ARMEMENT 3','la num\u00e9rotation suit les salles existantes');
  await click('#edit-done');

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('annexe-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

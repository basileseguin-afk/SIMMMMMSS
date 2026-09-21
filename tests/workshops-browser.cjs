const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const click=s=>page.locator(s).click();
 const state=()=>page.evaluate(()=>structuredClone(Sim.workshops.state));
 const screen=async(c)=>page.evaluate(c=>{const p=document.getElementById('plan').createSVGPoint();p.x=(c[0]+.5)*Sim.workshops.state.step;p.y=(c[1]+.5)*Sim.workshops.state.step;const q=p.matrixTransform(document.getElementById('workshop-layer').getScreenCTM());return{x:q.x,y:q.y};},c);
 const at=async(c)=>{const p=await screen(c);await page.mouse.click(p.x,p.y);};
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await click('[data-view=ateliers]');assert.equal(await page.locator('#view-plan').isVisible(),true);assert.equal(await page.locator('#btn-play').isDisabled(),true);
  await page.locator('.zone[data-id=cuisine]').click();
  const cadrage=await page.locator('#viewport').getAttribute('transform');await click('#zoom-in');
  // Le cadrage du service n'est plus un plafond : on doit pouvoir s'approcher
  // d'un carreau de 50 cm, puis revenir au cadrage d'un bouton.
  const proche=await page.locator('#viewport').getAttribute('transform');
  const ech=t=>parseFloat(t.match(/scale\(([\d.]+)\)/)[1]);
  assert.ok(ech(proche)>ech(cadrage),'on peut zoomer au-del\u00e0 du cadrage du service');
  await click('#zoom-fit');assert.equal(await page.locator('#viewport').getAttribute('transform'),cadrage,'\u00ab cadrer \u00bb revient au service');
  const cells=await page.evaluate(()=>{const w=Sim.workshops,z=w.zone,s=w.state.step;for(let y=Math.ceil(z.y/s)+1;y<(z.y+z.h)/s-2;y++)for(let x=Math.ceil(z.x/s)+1;x<(z.x+z.w)/s-5;x++)if(Array.from({length:5},(_,i)=>OrlyWorkshops.cellInside((x+i)+','+y,z,s)).every(Boolean))return [x,y];throw Error('No five-cell span');});
  await click('[data-wg-tool=table]');const a=await screen(cells),b=await screen([cells[0]+2,cells[1]]);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:6});await page.mouse.up();
  assert.equal((await state()).items.length,1);assert.equal((await state()).items[0].cells.length,3);assert.equal((await state()).workshops[0].service,'cuisine');
  await click('#wg-undo');assert.equal((await state()).items.length,0);await click('#wg-redo');assert.equal((await state()).items.length,1);
  await click('[data-wg-tool=erase]');await at([cells[0]+1,cells[1]]);assert.equal((await state()).items[0].cells.length,2);await click('#wg-undo');
  await click('[data-wg-tool=select]');await at(cells);await click('#wg-rotate');assert.equal((await state()).items[0].cells.length,3);
  await page.locator('#wg-item-name').fill('Table test');await page.locator('#wg-item-name').press('Tab');
  await click('#wg-validate');let group=(await state()).workshops[0];assert.equal(group.validated,true);assert.equal((await state()).items[0].code,'T-001');
  assert.equal(await page.locator('[data-workshop-surface]').count(),1);assert.equal(await page.locator('[data-workshop-item]').count(),0);assert.equal(await page.locator('[data-equipment-code]').textContent(),'T-001');
  await click('#wg-undo');assert.equal((await state()).workshops[0].validated,undefined);await click('#wg-redo');assert.equal((await state()).workshops[0].validated,true);
  await click('#wg-validate');assert.equal((await state()).workshops[0].validated,false);assert.equal((await state()).items[0].code,'T-001');await click('#wg-validate');
  await page.screenshot({path:'/tmp/ory-validated-workshop.png'});
  const saved=await state();await page.reload();await click('[data-view=ateliers]');await page.locator('#zone-picker').selectOption('cuisine');assert.deepEqual(await state(),saved);
  await page.locator('#wg-items [data-wg-item]').first().click();await click('#wg-delete-item');assert.equal((await state()).workshops[0].validated,false);await click('#wg-undo');assert.equal((await state()).workshops[0].validated,true);
  // Personnes affectées à un équipement : la régression de l'absorption.
  await page.locator('#wg-items [data-wg-item]').first().click();
  assert.equal(await page.locator('#wg-item-postes').inputValue(),'0');
  await page.locator('#wg-item-postes').fill('4');await page.locator('#wg-item-postes').press('Tab');
  assert.equal((await state()).items[0].postes,4);
  assert.match(await page.locator('#wg-postes-total').textContent(),/ce service : 4/);
  assert.match(await page.locator('#wg-items [data-wg-item]').first().textContent(),/4 pers\./);
  assert.match(await page.locator('[data-equipment-code]').textContent(),/T-001 · 4p/);
  // Bornes : refusé au-delà de 99, ramené à l'entier, zéro efface le champ.
  await page.locator('#wg-item-postes').fill('150');await page.locator('#wg-item-postes').press('Tab');
  assert.equal((await state()).items[0].postes,99);
  await page.locator('#wg-item-postes').fill('0');await page.locator('#wg-item-postes').press('Tab');
  assert.equal((await state()).items[0].postes,undefined);
  await page.locator('#wg-item-postes').fill('4');await page.locator('#wg-item-postes').press('Tab');
  await click('#wg-undo');assert.equal((await state()).items[0].postes,undefined);
  await click('#wg-redo');assert.equal((await state()).items[0].postes,4);

  await click('#wg-add-group');await page.locator('#wg-group-name').fill('Deuxième atelier');await page.locator('#wg-group-name').press('Tab');
  await click('[data-wg-tool=tapis]');await at([cells[0]+4,cells[1]]);assert.equal((await state()).workshops.length,2);assert.equal((await state()).items.length,2);assert.equal((await state()).items[1].code,'C-001');
  await click('#wg-library');const frame=page.frameLocator('#wg-library-frame');await frame.locator('[data-neuf=table]').click();await frame.locator('#btn-place-service').click();await page.locator('#wg-library-dialog').waitFor({state:'hidden'});
  await at([cells[0],cells[1]+4]);assert.equal((await state()).items.length,3,'library model is placed on main map');assert.ok((await state()).items[2].source);
  const download=page.waitForEvent('download');await page.locator('#wg-settings summary').click();await click('#wg-export');const d=await download;const exported=JSON.parse(fs.readFileSync(await d.path(),'utf8'));assert.equal(exported.items.length,3);assert.equal(exported.items[0].code,'T-001');assert.equal(exported.workshops[0].validated,true);
  const before=await state();await page.locator('#wg-import').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"schema":"no"}')});await page.waitForFunction(()=>document.getElementById('wg-status').textContent.includes('Import refusé'));assert.deepEqual(await state(),before);
  await click('#wg-overview');assert.equal(await page.locator('#zone-picker').inputValue(),'');await page.locator('#zone-picker').selectOption('prepa');assert.equal(await page.locator('#wg-items [data-wg-item]').count(),0);
  await page.locator('#zone-picker').selectOption('cuisine');await page.screenshot({path:'/tmp/ory-workshops-desktop.png'});await click('#btn-theme');await page.screenshot({path:'/tmp/ory-workshops-dark.png'});
  await click('[data-view=flux]');assert.equal(await page.locator('#view-flux').isVisible(),true);await click('[data-view=plan]');assert.equal(await page.locator('#btn-play').isDisabled(),false);
  // Un tracé = un équipement. Deux tracés séparés ne doivent plus n'en faire
  // qu'un : c'était le défaut qui donnait l'impression d'une table par atelier.
  await click('[data-view=ateliers]');await page.locator('#zone-picker').selectOption('cuisine');
  const avantTraces=(await state()).items.length;
  await click('[data-wg-tool=table]');
  const libre=await page.evaluate(()=>{const w=Sim.workshops,z=w.zone,s=w.state.step,pris=new Set(w.state.items.flatMap(i=>i.cells));
   for(let y=Math.ceil(z.y/s)+1;y<(z.y+z.h)/s-4;y++)for(let x=Math.ceil(z.x/s)+1;x<(z.x+z.w)/s-4;x++){
    const bloc=[[x,y],[x+1,y],[x,y+2],[x+1,y+2]];
    if(bloc.every(([a,b])=>OrlyWorkshops.cellInside(a+','+b,z,s)&&!pris.has(a+','+b)))return [x,y];
   }throw Error('pas de place libre');});
  const glisser=async(a,b)=>{const p1=await screen(a),p2=await screen(b);await page.mouse.move(p1.x,p1.y);await page.mouse.down();await page.mouse.move(p2.x,p2.y,{steps:5});await page.mouse.up();};
  await glisser(libre,[libre[0]+1,libre[1]]);
  await glisser([libre[0],libre[1]+2],[libre[0]+1,libre[1]+2]);
  assert.equal((await state()).items.length,avantTraces+2,'deux tracés séparés doivent donner deux équipements');

  // « Agrandir » est explicite : coché, le tracé prolonge la sélection.
  await click('[data-wg-tool=select]');await page.locator('[data-wg-item]').last().click();
  await page.locator('#wg-extend').check();
  const apres=(await state()).items.length;
  await click('[data-wg-tool=table]');await at([libre[0]+2,libre[1]+2]);
  assert.equal((await state()).items.length,apres,'avec « agrandir », rien de neuf n’est créé');
  await page.locator('#wg-extend').uncheck();

  // La liste des ateliers est visible, plus cachée dans un menu déroulant.
  assert.equal(await page.locator('#wg-group').count(),0,'le select a disparu');
  assert.ok(await page.locator('[data-wg-group]').count()>=1);
  assert.match(await page.locator('#wg-groups').innerText(),/équipement/);
  // Les équipements de TOUS les ateliers du service sont listés, groupés.
  assert.ok(await page.locator('.wg-item-group').count()>=1);
  assert.match(await page.locator('#wg-validate').textContent(),/Fusionner en une surface|Reprendre le détail/);

  // Réconciliation curseurs / grille : l'écart se voit toujours, la grille ne
  // pilote que les services renseignés, et seulement si on le demande.
  await click('[data-view=plan]');await click('[data-view=reglages]');
  assert.match(await page.locator('#grille-note').textContent(),/service\(s\) aménagé/);
  assert.match(await page.locator('#s-cuisine').innerText(),/grille/);
  assert.equal(await page.locator('#staff-cuisine').isDisabled(),false,'sans la case, le curseur reste maître');
  const avant=await page.locator('#staff-cuisine').inputValue();
  await page.locator('#grille-effectifs').check();
  assert.equal(await page.locator('#staff-cuisine').isDisabled(),true);
  assert.notEqual(await page.locator('#staff-cuisine').inputValue(),avant);
  // Un service non aménagé n'est pas touché : c'est ce qui évite de choisir.
  assert.equal(await page.locator('#staff-appros').isDisabled(),false);
  assert.doesNotMatch(await page.locator('#s-appros').innerText(),/grille/);
  await page.locator('#grille-effectifs').uncheck();
  assert.equal(await page.locator('#staff-cuisine').isDisabled(),false);

  await page.setViewportSize({width:390,height:844});await click('[data-view=ateliers]');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);console.log('Workshop browser passed: same map, zoom beyond the service fit, painting, erase, rotation, groups, library placement, persistence, export, invalid import, tabs and mobile.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

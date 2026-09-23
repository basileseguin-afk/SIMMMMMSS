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
  // Le site s'ouvre sur l'étape à faire ensuite : ce parcours travaille sur le plan.
  const versPlan=async()=>{await page.locator('#etapes [data-view=plan]').click();await page.waitForTimeout(120);};await versPlan();

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
  const iArm=options.findIndex(t=>t.trim()==='Armement'), iAnx=options.findIndex(t=>t.includes('Armement 2'));
  assert.ok(iAnx>0,'l’annexe est proposée');
  assert.equal(iAnx,iArm+1,'elle est rangée juste sous son atelier');

  // 4. Elle accueille des ateliers de travail comme n'importe quel service.
  await click('[data-view=ateliers]');
  await page.locator('[data-sous-onglet=at-equipes]').click();await page.locator('#at-new').click();await page.waitForTimeout(150);
  const at=await page.evaluate(()=>Sim.ateliers.state.ateliers.at(-1).id);
  await page.selectOption(`[data-at="${at}"] [data-at-champ=service]`,zone.id);await page.waitForTimeout(150);
  await page.fill(`[data-at="${at}"] [data-at-champ=debut]`,'05:00');
  await page.dispatchEvent(`[data-at="${at}"] [data-at-champ=debut]`,'change');await page.waitForTimeout(150);
  await page.selectOption(`[data-at="${at}"] [data-at-champ=lot-nouveau]`,'CRL/BC');await page.waitForTimeout(250);
  assert.equal(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).service,at),zone.id);

  // 5. Elle hérite des liaisons de son atelier : ses amonts sont ceux d'ARMEMENT.
  const liens=await page.evaluate(()=>Sim.ateliers.a.liaisons());
  const amontsArmement=liens.filter(l=>l.to==='armement').map(l=>l.from).sort();
  const amontsAnnexe=liens.filter(l=>l.to===zone.id).map(l=>l.from).sort();
  assert.deepEqual(amontsAnnexe,amontsArmement,'mêmes fournisseurs que l’atelier dont elle dépend');
  const r=await page.evaluate(()=>({ok:Sim.ateliers.resultat.ok,
    services:(Sim.ateliers.resultat.parClasse['CRL/BC']||{}).services||[]}));
  assert.equal(r.ok,true);
  assert.ok(r.services.includes(zone.id),'le parcours de CRL/BC passe par l’annexe');

  // 6. Le Centre des flux la propose comme n'importe quel emplacement, et une
  //    liaison saisie à la main l'emporte sur l'héritage.
  await click('[data-view=flux]');
  const emplacements=await page.evaluate(()=>Sim.flows.points.map(p=>p.label));
  assert.ok(emplacements.includes('Armement 2'),'l’annexe figure parmi les emplacements du Centre des flux');
  await click('#fc-new');
  await page.selectOption('#fc-type','material');
  await page.selectOption('#fc-from',JSON.stringify(['magasin',null]));
  await page.selectOption('#fc-to',JSON.stringify([zone.id,null]));
  await page.locator('#fc-add button[type=submit]').click();
  const cables=await page.evaluate(()=>Sim.ateliers.a.liaisons());
  assert.deepEqual(cables.filter(l=>l.to===zone.id).map(l=>l.from),['magasin'],
    'câblée à la main, elle n’hérite plus des amonts de son atelier');
  assert.deepEqual(cables.filter(l=>l.to==='armement').map(l=>l.from).sort(),amontsArmement,
    'l’atelier dont elle dépend garde les siens');

  // 7. Le plan la montre et la décrit, sans prétendre à une file séparée.
  await click('[data-view=plan]');
  await page.locator('#zone-picker').selectOption(zone.id);
  assert.match(await page.locator('#goulot-info').textContent(),/Annexe de/);
  assert.match(await page.locator('#goulot-info').textContent(),/Armement/);

  // 8. Elle survit au rechargement.
  await page.reload();await versPlan();
  assert.equal(await page.evaluate(()=>Sim.editor.state.zones.filter(z=>z.kind==='annexe').length),1);
  assert.ok((await page.locator('#zone-picker option').allTextContents()).some(t=>t.includes('Armement 2')),'affichée en minuscules lisibles');

  // 9. Le chemin le plus court : dupliquer l'atelier donne directement sa 2e salle.
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

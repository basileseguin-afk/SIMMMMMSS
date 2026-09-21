/* Le plan au repos doit répondre à « que me reste-t-il à renseigner ? ».
 * Ce parcours vérifie les trois états, le basculement de légende au
 * lancement, et que la bande d'indicateurs se retire hors Simulation. */
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const click=s=>page.locator(s).click();
 const etat=id=>page.locator('.zone[data-id='+id+']').getAttribute('class');
 const screen=async(c)=>page.evaluate(c=>{const p=document.getElementById('plan').createSVGPoint();p.x=(c[0]+.5)*Sim.workshops.state.step;p.y=(c[1]+.5)*Sim.workshops.state.step;const q=p.matrixTransform(document.getElementById('workshop-layer').getScreenCTM());return{x:q.x,y:q.y};},c);
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);

  // 1. Au repos : rien n'est aménagé, tout est « au curseur » ; hors calcul à part.
  assert.equal(await page.evaluate(()=>document.body.classList.contains('avant-lancement')),true);
  assert.match(await etat('cuisine'),/\bp-partiel\b/,'cuisine réglée au curseur seulement');
  assert.match(await etat('magasin'),/\bp-hors\b/,'magasin hors calcul');
  assert.match(await etat('handling'),/\bp-hors\b/,'un tampon n’est pas un atelier à effectif');
  assert.match(await page.locator('#plan-etat').textContent(),/restent à aménager/);
  assert.match(await page.locator('#legende-plan').textContent(),/Aménagé/);

  // 2. Un atelier simulé sans personne est un défaut, pas un état neutre.
  await click('[data-view=reglages]');
  assert.equal(await page.locator('.kpi-grille').isVisible(),false,'les indicateurs ne décrivent pas un réglage');
  await page.locator('#staff-cuisine').fill('0');
  await page.locator('#staff-cuisine').dispatchEvent('input');
  await click('[data-view=plan]');
  assert.match(await etat('cuisine'),/\bp-vide\b/);
  assert.equal(await page.locator('.kpi-grille').isVisible(),true);
  await click('[data-view=reglages]');
  await page.locator('#staff-cuisine').fill('10');
  await page.locator('#staff-cuisine').dispatchEvent('input');
  await click('[data-view=plan]');
  assert.match(await etat('cuisine'),/\bp-partiel\b/);

  // 3. Un équipement tracé dans « Création des ateliers » rend la cuisine aménagée.
  await click('[data-view=ateliers]');
  await page.locator('.zone[data-id=cuisine]').click();
  const cells=await page.evaluate(()=>{const w=Sim.workshops,z=w.zone,s=w.state.step;for(let y=Math.ceil(z.y/s)+1;y<(z.y+z.h)/s-2;y++)for(let x=Math.ceil(z.x/s)+1;x<(z.x+z.w)/s-5;x++)if(Array.from({length:5},(_,i)=>OrlyWorkshops.cellInside((x+i)+','+y,z,s)).every(Boolean))return [x,y];throw Error('Aucune bande de cinq cases');});
  await click('[data-wg-tool=table]');
  const a=await screen(cells),b=await screen([cells[0]+2,cells[1]]);
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:6});await page.mouse.up();
  const avant=await page.locator('#plan-etat').textContent();
  await click('[data-view=plan]');
  assert.match(await etat('cuisine'),/\bp-pret\b/,'une table tracée suffit à marquer le service aménagé');
  assert.notEqual(await page.locator('#plan-etat').textContent(),avant,'le reste à faire diminue');
  // Ce qui a été tracé se revoit sur la vue d'ensemble, dans la couleur du type.
  assert.equal(await page.locator('#workshop-overview .wg-apercu').count(),1,'la table tracée apparaît sur le plan');
  assert.equal(await page.locator('#workshop-overview .wg-apercu').getAttribute('fill'),'var(--eq-table)');
  await click('[data-view=ateliers]');
  assert.equal(await page.locator('#workshop-overview .wg-apercu').count(),0,'pas de doublon pendant l’édition');
  await click('[data-view=plan]');

  // 4. Une fois lancée, la simulation reprend la main sur les couleurs.
  await click('#btn-play');
  await page.waitForFunction(()=>!document.body.classList.contains('avant-lancement'),null,{timeout:8000});
  assert.match(await page.locator('#legende-plan').textContent(),/Soutenue/);
  assert.doesNotMatch(await page.locator('#legende-plan').textContent(),/Aménagé/);
  assert.match(await etat('magasin'),/\bp-hors\b/,'hors calcul le reste pendant la simulation');

  // 5. BUG-013 : une couleur choisie dans l'éditeur survit à la sortie du mode
  //    édition. Elle tient le fond ; l'état de paramétrage passe au contour.
  await click('#btn-reset');
  // Le fond des zones est en transition (0,35 s) : lire trop tôt donne une
  // couleur intermédiaire. On attend la fin de l'animation avant de mesurer.
  const pose=()=>page.waitForTimeout(450);
  const fond=async s=>{await pose();return page.locator(s).evaluate(e=>getComputedStyle(e).fill);};
  const contour=async s=>{await pose();return page.locator(s).evaluate(e=>getComputedStyle(e).stroke);};
  const avantCouleur=await fond('.zone[data-id=dotation] .fond');
  await click('#btn-edit');
  await page.locator('.pe-shape[data-pe-zone=dotation]').click();
  await page.locator('#pe-color').evaluate(i=>{i.value='#cc0033';i.dispatchEvent(new Event('change',{bubbles:true}));});
  await click('#edit-done');
  assert.equal(await fond('.zone[data-id=dotation] .fond'),'rgb(204, 0, 51)','la couleur tient hors édition');
  assert.notEqual(await fond('.zone[data-id=dotation] .fond'),avantCouleur);
  assert.match(await etat('dotation'),/\bp-partiel\b/);
  assert.equal(await contour('.zone[data-id=dotation] .fond'),await contour('.zone[data-id=appros] .fond'),
    'l’état reste lisible dans le contour, comme un atelier non colorié');
  // Un atelier non colorié garde le fond du thème.
  assert.notEqual(await fond('.zone[data-id=appros] .fond'),'rgb(204, 0, 51)');
  // Elle survit au rechargement.
  await page.reload();
  assert.equal(await fond('.zone[data-id=dotation] .fond'),'rgb(204, 0, 51)','la couleur est relue au démarrage');
  // Retour à la couleur du type.
  await click('#btn-edit');
  await page.locator('.pe-shape[data-pe-zone=dotation]').click();
  await click('#pe-color-reset');
  await click('#edit-done');
  assert.equal(await fond('.zone[data-id=dotation] .fond'),avantCouleur,'le bouton rend la couleur du thème');

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('etat-plan-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

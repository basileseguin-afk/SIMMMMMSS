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
  // Avant le lancement, les quatre indicateurs valent tous « — » ou « 0 » : une
  // bande entière pour ne rien dire, juste au-dessus de ce qu'on vient voir.
  assert.equal(await page.locator('.kpi-grille').isVisible(),false,'rien à montrer avant de lancer');
  await page.locator('#btn-play').click();await page.waitForTimeout(350);
  assert.equal(await page.locator('.kpi-grille').isVisible(),true,'ils apparaissent dès que la journée tourne');
  await page.locator('#btn-play').click();
  await page.locator('#btn-reset').click();await page.waitForTimeout(200);
  assert.equal(await page.locator('.kpi-grille').isVisible(),false,'et repartent avec « Recommencer »');
  await click('[data-view=reglages]');
  await page.locator('#staff-cuisine').fill('10');
  await page.locator('#staff-cuisine').dispatchEvent('input');
  await click('[data-view=plan]');
  assert.match(await etat('cuisine'),/\bp-partiel\b/);

  // 3. Un atelier de travail qui fabrique rend la cuisine « aménagée ».
  await click('[data-view=ateliers]');
  await page.locator('#at-new').click();await page.waitForTimeout(150);
  const at=await page.evaluate(()=>Sim.ateliers.state.ateliers.at(-1).id);
  await page.selectOption(`[data-at="${at}"] [data-at-champ=service]`,'cuisine');await page.waitForTimeout(150);
  // Un atelier sans lot ne fabrique rien : le service reste « au curseur ».
  await click('[data-view=plan]');
  assert.match(await etat('cuisine'),/\bp-partiel\b/,'un atelier vide n’aménage rien');
  const avant=await page.locator('#plan-etat').textContent();
  await click('[data-view=ateliers]');
  await page.selectOption(`[data-at="${at}"] [data-at-champ=lot-nouveau]`,'CRL/BC');await page.waitForTimeout(250);
  await click('[data-view=plan]');
  assert.match(await etat('cuisine'),/\bp-pret\b/,'un lot à fabriquer suffit à marquer le service aménagé');
  assert.notEqual(await page.locator('#plan-etat').textContent(),avant,'le reste à faire diminue');

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
  assert.equal(await contour('.zone[data-id=dotation] .fond'),'rgb(204, 0, 51)',
    'le contour prend aussi la couleur : c’est lui qui la porte à petite taille');
  assert.notEqual(await contour('.zone[data-id=appros] .fond'),'rgb(204, 0, 51)');
  // Un atelier non colorié garde le fond du thème.
  assert.notEqual(await fond('.zone[data-id=appros] .fond'),'rgb(204, 0, 51)');
  // Exception : un atelier simulé sans personne garde son contour d'alerte,
  // même colorié. La couleur est une identité, pas un moyen de masquer un défaut.
  await click('[data-view=reglages]');
  await page.locator('#staff-dotation').fill('0');
  await page.locator('#staff-dotation').dispatchEvent('input');
  await click('[data-view=plan]');
  assert.match(await etat('dotation'),/\bp-vide\b/);
  assert.equal(await fond('.zone[data-id=dotation] .fond'),'rgb(204, 0, 51)','le fond reste celui qu’on a choisi');
  const rouge=await contour('.zone[data-id=prepa] .fond');
  await click('[data-view=reglages]');
  await page.locator('#staff-prepa').fill('0');
  await page.locator('#staff-prepa').dispatchEvent('input');
  await click('[data-view=plan]');
  assert.equal(await contour('.zone[data-id=dotation] .fond'),await contour('.zone[data-id=prepa] .fond'),
    'même contour d’alerte qu’un atelier vide non colorié');
  await click('[data-view=reglages]');
  for(const [id,v] of [['staff-dotation','6'],['staff-prepa','18']]){
    await page.locator('#'+id).fill(v);await page.locator('#'+id).dispatchEvent('input');
  }
  await click('[data-view=plan]');
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

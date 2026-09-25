/* Organisation › Services : la porte d'entrée d'un service. « Il manque une
 * équipe » doit se corriger d'un clic, et un service se renomme sans passer
 * par l'édition du plan. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(200);
 const ligne=id=>page.locator(`.svc-table tr[data-svc=${id}]`);
 const cases=id=>page.evaluate(id=>Sim.ateliers.state.ateliers.filter(a=>a.service===id),id);
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();

  // 1. Une ligne par service de l'unité, dans l'Organisation.
  await nav.aller(page,'u-services');
  assert.equal(await page.evaluate(()=>document.body.dataset.partie),'organisation');
  assert.equal(await page.locator('.svc-table tbody tr').count(),await page.evaluate(()=>Sim.ateliers.a.services().length),'tous les services');
  assert.match(await ligne('plonge').textContent(),/aucune/);
  assert.equal(await page.locator('#fc-export').isVisible(),false,'les outils des liens restent sur leur page');

  // 2. « + Une équipe » : la case naît dans ce service, et s'ouvre pour être réglée.
  await ligne('plonge').locator('[data-svc-action=equipe]').click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'at-equipes','on la règle dans les cases');
  const pl=(await cases('plonge'))[0];
  assert.ok(pl,'une case dans la plonge');
  assert.equal(await page.evaluate(()=>Sim.ateliers.filtre),'plonge','la liste se resserre sur ce service');
  assert.equal(await page.locator(`[data-at="${pl.id}"] [data-at-champ=type]`).isVisible(),true,'sa fiche est ouverte');
  await page.selectOption(`[data-at="${pl.id}"] [data-at-champ=type]`,'lavage');await attendre();

  // 3. Les contrôles : les quais livrent la plonge sans équipe. Le point à
  //    corriger porte son geste, et une plonge n'est plus « une équipe qui ne prépare rien ».
  await nav.aller(page,'u-lecture');
  assert.match(await page.locator('#fc-alertes').textContent(),/Quais · Réception fournit sans avoir d’équipe/);
  assert.doesNotMatch(await page.locator('#fc-alertes').textContent(),/Plonge : une équipe est décrite mais ne prépare rien/,
    'une plonge lave pour tout le monde : pas d’alerte');
  await page.locator('#fc-alertes [data-svc-action=equipe][data-svc=quais]').click();await attendre();
  assert.equal((await cases('quais')).length,1,'l’équipe qui manquait est créée d’un clic');
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'at-equipes');

  // 4. Retour aux services : la ligne dit ce qui a changé.
  await nav.aller(page,'u-services');
  assert.match(await ligne('quais').textContent(),/Quais/,'l’équipe est listée');
  assert.match(await ligne('plonge').locator('.svc-etat').textContent(),/plonge/);
  // Une équipe listée ouvre sa fiche.
  await ligne('plonge').locator('[data-svc-case]').click();await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.ouvert),pl.id);
  await nav.aller(page,'u-services');

  // 5. Renommer un service ici : le plan, les listes et les chemins suivent.
  const champ=page.locator('[data-svc-nom=armement]');
  await champ.fill('Armement EZY/AF');await champ.press('Enter');await attendre();
  assert.equal(await page.evaluate(()=>Sim.editor.state.zones.find(z=>z.id==='armement').nom),'Armement EZY/AF','le plan porte le nouveau nom');
  assert.ok(await page.evaluate(()=>Sim.ateliers.a.services().some(s=>s.id==='armement'&&/EZY\/AF/.test(s.nom))),'les listes aussi');
  assert.match(await page.locator('#zone-picker').textContent(),/EZY\/AF/,'le choix d’un service sur le plan aussi');
  // Un nom vide est refusé.
  await champ.fill('   ');await champ.press('Enter');await attendre();
  assert.equal(await page.evaluate(()=>Sim.editor.state.zones.find(z=>z.id==='armement').nom),'Armement EZY/AF','nom vide refusé');

  // 6. « Voir sur le plan » : le plan rejoué, le service choisi. Sans équipe,
  //    son panneau propose d'en ajouter une.
  await ligne('armement').locator('[data-svc-action=voir]').click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'j-plan');
  assert.equal(await page.locator('#zone-picker').inputValue(),'armement');
  assert.match(await page.locator('#goulot-info').textContent(),/Aucune équipe ici/);
  await page.locator('#goulot-info [data-svc-action=equipe][data-svc=armement]').click();await attendre();
  assert.equal((await cases('armement')).length,1,'depuis le plan aussi');

  // 7. « Modifier le plan de l'unité » ouvre l'édition du plan.
  await nav.aller(page,'u-services');
  await page.locator('.svc-tete [data-svc-action=plan]').click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.classList.contains('plan-editing')),true);
  await page.locator('#edit-done').click();await attendre();

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('services-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

/* Sauvegarde complète : l'aller-retour doit rendre un tracé intact après effacement. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const click=s=>page.locator(s).click();
 const cles=()=>page.evaluate(()=>['orly-plan-v3','ory-ateliers-v1','orly-flows-v1'].map(k=>localStorage.getItem(k)));
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);

  // 1. Saisir quelque chose : un atelier de travail, et une zone déplacée.
  await click('[data-view=ateliers]');
  await page.locator('[data-sous-onglet=at-equipes]').click();await page.locator('#at-new').click();await page.waitForTimeout(150);
  const at=await page.evaluate(()=>Sim.ateliers.state.ateliers.at(-1).id);
  await page.selectOption(`[data-at="${at}"] [data-at-champ=service]`,'cuisine');await page.waitForTimeout(150);
  await page.fill(`[data-at="${at}"] [data-at-champ=nom]`,'Atelier témoin');
  await page.dispatchEvent(`[data-at="${at}"] [data-at-champ=nom]`,'change');await page.waitForTimeout(150);
  await page.fill(`[data-at="${at}"] [data-at-champ=personnes]`,'5');
  await page.dispatchEvent(`[data-at="${at}"] [data-at-champ=personnes]`,'change');await page.waitForTimeout(150);
  await page.selectOption(`[data-at="${at}"] [data-at-champ=lot-nouveau]`,'CRL/BC');await page.waitForTimeout(250);
  await click('[data-view=plan]');await click('#btn-edit');
  await page.locator('[data-action=select][data-zone=cuisine]').click();
  await page.locator('#pe-x').fill('1888');await page.locator('#pe-x').press('Tab');await click('#edit-done');
  const avant=await cles();
  // Le centre des flux n'écrit sa clé que si on y touche : une partie absente
  // est normale, et la sauvegarde doit s'en accommoder.
  assert.ok(avant[0]&&avant[1],'plan et ateliers doivent exister après la saisie');

  // 2. Tout sauvegarder en un fichier.
  await click('[data-view=reglages]');
  // Comme le centre des flux, le barème n'écrit sa clé que si on y touche.
  const champBareme='[data-rg-champ=minutes][data-service=cuisine][data-cle="*/BC"]';
  // Le barème se lit un service à la fois : il faut déplier celui qu'on modifie.
  await page.locator('.rg-service[data-service=cuisine] > summary').click();
  await page.waitForTimeout(150);
  await page.fill(champBareme,'41.5');await page.dispatchEvent(champBareme,'change');
  await page.waitForTimeout(200);
  // La sauvegarde vit dans « L'unité », onglet « Sauvegarde et limites ».
  await click('[data-view=flux]');await click('[data-sous-onglet=u-sauvegarde]');
  const dl=page.waitForEvent('download');await click('#sauvegarde-export');const fichier=await dl;
  assert.match(fichier.suggestedFilename(),/^ory-sauvegarde-\d{4}-\d{2}-\d{2}\.json$/);
  const chemin=await fichier.path(),sauvegarde=JSON.parse(fs.readFileSync(chemin,'utf8'));
  assert.equal(sauvegarde.schema,'ory-sauvegarde');assert.equal(sauvegarde.version,1);
  assert.ok(sauvegarde.contenu['orly-plan-v3']&&sauvegarde.contenu['ory-ateliers-v1']);
  // Le barème est une étude à part entière : une sauvegarde qui l'oublierait
  // ramènerait les valeurs de démonstration sans le dire.
  assert.ok(sauvegarde.contenu['ory-modele-v1'],'le barème et les règles de poste en font partie');
  assert.equal(sauvegarde.contenu['ory-modele-v1'].bareme.cuisine['*/BC'],41.5,'avec la valeur saisie');
  assert.match(await page.locator('#sauvegarde-etat').textContent(),/partie\(s\) enregistrée/);

  // 3. Un fichier invalide ne remplace rien — la validation est atomique.
  const casse=JSON.parse(JSON.stringify(sauvegarde));
  casse.contenu['ory-ateliers-v1'].version=99;
  await page.locator('#sauvegarde-import').setInputFiles({name:'casse.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(casse))});
  await page.waitForFunction(()=>document.getElementById('sauvegarde-etat').classList.contains('error'));
  assert.match(await page.locator('#sauvegarde-etat').textContent(),/ateliers de travail/);
  assert.match(await page.locator('#sauvegarde-etat').textContent(),/Rien n’a été remplacé/);
  assert.deepEqual(await cles(),avant,'un refus ne doit toucher à aucune clé');
  await page.locator('#sauvegarde-import').setInputFiles({name:'autre.json',mimeType:'application/json',buffer:Buffer.from('{"schema":"autre"}')});
  await page.waitForFunction(()=>/pas une sauvegarde complète/.test(document.getElementById('sauvegarde-etat').textContent));
  assert.deepEqual(await cles(),avant);

  // 4. Tout effacer, comme un navigateur qui vide ses données de site.
  await page.evaluate(()=>localStorage.clear());await page.reload();
  await click('[data-view=ateliers]');
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.length),0,'tout doit avoir disparu');

  // 5. Restaurer : le tracé revient à l'identique.
  await click('[data-view=flux]');
  await page.locator('#sauvegarde-import').setInputFiles({name:'ory-sauvegarde.json',mimeType:'application/json',buffer:fs.readFileSync(chemin)});
  await page.waitForFunction(()=>localStorage.getItem('ory-ateliers-v1')!==null,{},{timeout:15000});
  await page.waitForLoadState('load');
  assert.deepEqual(await cles(),avant,'les trois clés doivent être rendues à l’identique');
  await click('[data-view=ateliers]');
  const rendu=await page.evaluate(()=>Sim.ateliers.state.ateliers[0]);
  assert.equal(rendu.nom,'Atelier témoin');
  assert.equal(rendu.service,'cuisine');
  assert.equal(rendu.personnes,5);
  assert.deepEqual(rendu.lots,[['CRL/BC']],'les lots reviennent à l’identique');
  assert.equal(await page.evaluate(()=>Sim.editor.state.zones.find(z=>z.id==='cuisine').x),1888,'la zone déplacée est revenue');

  assert.deepEqual(errors,[]);
  console.log('Sauvegarde browser passed: full export, atomic refusal on invalid part, wipe and restore of plan and ateliers de travail.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

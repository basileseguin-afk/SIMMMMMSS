/* Le Centre des réglages depuis qu'il pilote les ateliers de travail : barème,
 * rendement, régime de poste, et la séparation d'avec l'ancien moteur. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1100},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(150);
 const duree=()=>page.evaluate(()=>Sim.ateliers.resultat.lots[0].duree);
 const ecrire=async(sel,v)=>{await page.fill(sel,String(v));await page.dispatchEvent(sel,'change');await attendre();};
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);

  // 1. Un atelier réel, pour mesurer l'effet des réglages sur quelque chose.
  await page.locator('[data-view=ateliers]').click();await attendre();
  await page.locator('#at-new').click();await attendre();
  const at=await page.evaluate(()=>Sim.ateliers.state.ateliers.at(-1).id);
  await page.selectOption(`[data-at="${at}"] [data-at-champ=service]`,'cuisine');await attendre();
  await page.selectOption(`[data-at="${at}"] [data-at-champ=lot-nouveau]`,'CRL/BC');await attendre();
  const avant=await duree();
  assert.ok(avant>0,'l’atelier travaille');

  // 2. Le modèle passe AVANT l'ancien moteur, et chacun dit ce qu'il pilote.
  await page.locator('[data-view=reglages]').click();await attendre();
  // Le titre porte désormais un « ? » : on ne lit que son propre texte, pas
  // celui de l'aide repliée (textContent ramasse aussi ce qui est caché).
  const ordre=await page.evaluate(()=>[...document.querySelectorAll('#view-reglages .reglages-titre')]
    .map(h=>[...h.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim()));
  assert.equal(ordre[0],'Le modèle de production','il vient en premier');
  assert.ok(ordre.includes('Ancien moteur de démonstration'),'l’ancien est nommé pour ce qu’il est');
  assert.match(await page.locator('#view-reglages').textContent(),/ne pilotent que la vue/);
  // Le barème n'est pas calibré : le dire là où on le modifie.
  assert.match(await page.locator('#rg-alerte').textContent(),/non calibrées/);

  // 3. Le barème se lit un service à la fois : cent dix champs d'un bloc ne se
  //    lisaient pas. Replié, chaque service tient en une ligne.
  assert.equal(await page.locator('#rg-bareme input:visible').count(),0,'aucun champ à l’arrivée');
  assert.ok(await page.locator('.rg-service').count()>=10,'un pli par service');
  assert.match(await page.locator('.rg-service[data-service=cuisine] .rg-svc-digest').textContent(),
    /BC 1,4/,'le résumé replié dit l’essentiel');
  await page.locator('.rg-service[data-service=cuisine] > summary').click();await attendre();
  assert.equal(await page.locator('#rg-bareme input:visible').count(),10,'dix champs, pas cent dix');
  // Un seul service ouvert à la fois : sinon on retrouve le mur.
  await page.locator('.rg-service[data-service=magasin] > summary').click();await attendre();
  assert.equal(await page.locator('.rg-service[open]').count(),1);
  await page.locator('.rg-service[data-service=cuisine] > summary').click();await attendre();

  // Le barème pilote la durée : doubler les minutes par unité double la durée.
  const cuisineBC='[data-rg-champ=parPax][data-service=cuisine][data-cabine=BC]';
  assert.equal(await page.locator(cuisineBC).inputValue(),'1.4','la valeur est lisible, pas vide');
  await ecrire(cuisineBC,'2.8');
  assert.ok(Math.abs(await duree()-avant*2)<1e-6,'la durée a doublé');
  // Saisir ne referme pas la fiche qu'on était en train de remplir.
  assert.equal(await page.locator('.rg-service[data-service=cuisine][open]').count(),1);

  // 4. Le rendement allonge la journée sans toucher au barème.
  await ecrire('#rg-rendement','0.5');
  assert.ok(Math.abs(await duree()-avant*4)<1e-6,'un rendement de 0,5 double encore');
  await ecrire('#rg-rendement','1');

  // 5. Le régime de poste est celui de la maison : il déplace tous les ateliers
  //    qui n'ont pas fixé le leur.
  await ecrire('#rg-presence','300');
  assert.equal(await page.evaluate(()=>Sim.ateliers.resultat.ateliers[0].finPoste-Sim.ateliers.resultat.ateliers[0].debut),300);
  assert.match(await page.locator('#rg-presence-note').textContent(),/h de travail effectif/);
  // Un seuil de pause se retire et s'ajoute.
  const seuils=()=>page.evaluate(()=>Sim.reglages.etat.regime.seuils.length);
  const n=await seuils();
  await page.locator('[data-rg-action=seuil-retirer][data-index="0"]').click();await attendre();
  assert.equal(await seuils(),n-1);
  await page.locator('#rg-seuil-ajouter').click();await attendre();
  assert.equal(await seuils(),n);
  await ecrire('#rg-presence','495');

  // 6. Un service que le barème ne connaît pas est signalé : sans cela il
  //    travaillerait en temps nul sans rien dire.
  assert.ok(await page.locator('.rg-service.vide .rg-zero').count()>0,
    'un service sans barème se voit sans qu’on ait à l’ouvrir');

  // 7. Annuler et rétablir.
  await page.locator('#rg-undo').click();await attendre();
  await page.locator('#rg-redo').click();await attendre();
  assert.equal(await page.evaluate(()=>Sim.reglages.etat.bareme.cuisine.BC.parPax),2.8);

  // 8. Le barème s'exporte et se réimporte : c'est ainsi qu'une étude arrive en bloc.
  const dl=await Promise.all([page.waitForEvent('download'),page.locator('#rg-export').click()]);
  const fichier=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'ory-')),'bareme.json');
  await dl[0].saveAs(fichier);
  const lu=JSON.parse(fs.readFileSync(fichier,'utf8'));
  assert.equal(lu.schema,'ory-bareme');
  assert.equal(lu.bareme.cuisine.BC.parPax,2.8);
  await page.locator('#rg-reset').click();await attendre();
  assert.equal(await page.evaluate(()=>Sim.reglages.etat.bareme.cuisine.BC.parPax),1.4,'les valeurs de démonstration sont revenues');
  await page.locator('#rg-import').setInputFiles(fichier);await page.waitForTimeout(350);
  assert.equal(await page.evaluate(()=>Sim.reglages.etat.bareme.cuisine.BC.parPax),2.8,'le fichier a repris la main');
  // Un fichier étranger est refusé, et le barème en place conservé.
  const mauvais=path.join(path.dirname(fichier),'autre.json');
  fs.writeFileSync(mauvais,JSON.stringify({schema:'autre-chose'}));
  await page.locator('#rg-import').setInputFiles(mauvais);await page.waitForTimeout(350);
  assert.match(await page.locator('#rg-status').textContent(),/refusé/i);
  assert.equal(await page.evaluate(()=>Sim.reglages.etat.bareme.cuisine.BC.parPax),2.8);

  // 9. Tout survit au rechargement.
  await page.reload();await page.waitForTimeout(500);
  assert.equal(await page.evaluate(()=>Sim.reglages.etat.bareme.cuisine.BC.parPax),2.8);

  // 10. Le délai de chargement n'est pas recopié : un seul champ pour les deux moteurs.
  await page.locator('[data-view=reglages]').click();await attendre();
  assert.equal(await page.locator('#loadDelay').count(),1,'un seul champ');
  assert.equal(await page.evaluate(()=>document.getElementById('rg-modele').contains(document.getElementById('loadDelay'))),true,
    'et il est remonté avec le modèle');

  // 11. Rien ne déborde, en clair comme en sombre, sur téléphone comme sur écran.
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#btn-theme').click();await attendre();
  await page.setViewportSize({width:390,height:844});await attendre();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'pas de débordement sur téléphone');

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('reglages-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

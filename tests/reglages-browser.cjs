/* Le Centre des réglages depuis qu'il pilote les ateliers de travail : barème
 * en minutes par vol (valeur commune et valeurs par compagnie), rendement,
 * régime de poste, et l'échange du barème par Excel. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const T=require('../tableur.js');
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
  await nav.vue(page,'ateliers');await attendre();
  await nav.aller(page,'at-equipes');await page.locator('#at-new').click();await attendre();
  const at=await page.evaluate(()=>Sim.ateliers.state.ateliers.at(-1).id);
  await page.selectOption(`[data-at="${at}"] [data-at-champ=service]`,'cuisine');await attendre();
  await page.selectOption(`[data-at="${at}"] [data-at-champ=lot-nouveau]`,'CRL/BC');await attendre();
  const avant=await duree();
  assert.ok(avant>0,'l’atelier travaille');

  // 2. Le modèle passe AVANT l'ancien moteur, et chacun dit ce qu'il pilote.
  await nav.vue(page,'reglages');await attendre();
  // Le titre porte désormais un « ? » : on ne lit que son propre texte, pas
  // celui de l'aide repliée (textContent ramasse aussi ce qui est caché).
  const ordre=await page.evaluate(()=>[...document.querySelectorAll('#view-reglages .reglages-titre')]
    .map(h=>[...h.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim()));
  assert.equal(ordre[0],'Minutes de travail par vol','il vient en premier');
  assert.ok(!ordre.includes('Ancien moteur de démonstration'),'l’ancien moteur a disparu');
  // Les temps de travail, et eux seuls : la comparaison est un onglet de « La journée ».
  assert.ok(!ordre.includes('Comparer deux essais'),'la comparaison n’encombre plus les temps de travail');
  assert.equal(await page.evaluate(()=>document.getElementById('view-comparer').contains(document.getElementById('snap-a'))),true);
  // Ce sont des chiffres d'exemple : le dire là où on les modifie.
  assert.match(await page.locator('#rg-alerte').textContent(),/chiffres d’exemple/);

  // 3. Le barème se lit un service à la fois : cent dix champs d'un bloc ne se
  //    lisaient pas. Replié, chaque service tient en une ligne.
  assert.equal(await page.locator('#rg-bareme input:visible').count(),0,'aucun champ à l’arrivée');
  assert.ok(await page.locator('.rg-service').count()>=10,'un pli par service');
  assert.match(await page.locator('.rg-service[data-service=cuisine] .rg-svc-digest').textContent(),
    /BC 35 · .* min\/vol/,'le résumé replié dit l’essentiel, en minutes par vol');
  await page.locator('.rg-service[data-service=cuisine] > summary').click();await attendre();
  assert.equal(await page.locator('#rg-bareme input:visible').count(),5,'une valeur commune par classe');
  // Un seul service ouvert à la fois : sinon on retrouve le mur.
  await page.locator('.rg-service[data-service=magasin] > summary').click();await attendre();
  assert.equal(await page.locator('.rg-service[open]').count(),1);
  await page.locator('.rg-service[data-service=cuisine] > summary').click();await attendre();

  // Le barème pilote la durée : doubler les minutes par vol double la durée.
  const cuisineBC='[data-rg-champ=minutes][data-service=cuisine][data-cle="*/BC"]';
  assert.equal(await page.locator(cuisineBC).inputValue(),'35','la valeur est lisible, pas vide');
  await ecrire(cuisineBC,'70');
  assert.ok(Math.abs(await duree()-avant*2)<1e-6,'la durée a doublé');
  // Une compagnie peut avoir sa valeur propre : elle l'emporte sur la commune.
  await page.selectOption('[data-rg-champ=propre-ajout][data-service=cuisine]','CRL/BC');await attendre();
  const crlBC='[data-rg-champ=minutes][data-service=cuisine][data-cle="CRL/BC"]';
  assert.equal(await page.locator(crlBC).inputValue(),'70','elle naît à la valeur commune');
  await ecrire(crlBC,'35');
  assert.ok(Math.abs(await duree()-avant)<1e-6,'CRL/BC suit sa propre valeur');
  await page.locator('[data-rg-action=propre-retirer][data-cle="CRL/BC"]').click();await attendre();
  assert.ok(Math.abs(await duree()-avant*2)<1e-6,'retirée, la valeur commune revient');
  // Saisir ne referme pas la fiche qu'on était en train de remplir.
  assert.equal(await page.locator('.rg-service[data-service=cuisine][open]').count(),1);

  // 3 bis. Saisie par compagnie × classe : une grille, une case par couple.
  await page.locator('[data-rg-action=mode][data-mode=compagnie][data-service=cuisine]').click();await attendre();
  assert.equal(await page.locator('.rg-service[data-service=cuisine] .rg-grille').count(),1,'la grille paraît');
  assert.ok(await page.locator('.rg-service[data-service=cuisine] .rg-grille tbody tr').count()>=2,'une ligne par compagnie + « autres »');
  assert.equal(await page.locator(crlBC).inputValue(),'','case vide : la valeur commune s’applique');
  assert.equal(await page.locator(crlBC).getAttribute('placeholder'),'70');
  await ecrire(crlBC,'35');
  assert.ok(Math.abs(await duree()-avant)<1e-6,'la case de la grille pilote la durée');
  assert.match(await page.locator('.rg-service[data-service=cuisine] .rg-svc-digest').textContent(),/par compagnie × classe/);
  // Sans valeur commune, la case sans valeur propre est signalée.
  const communePC='[data-rg-champ=minutes][data-service=cuisine][data-cle="*/PC"]',pc=await page.locator(communePC).inputValue();
  await ecrire(communePC,'');
  assert.ok(await page.locator('.rg-service[data-service=cuisine] input.rg-manque').count()>0,'case à renseigner signalée');
  await ecrire(communePC,pc);
  await ecrire(crlBC,'');
  await page.locator('[data-rg-action=mode][data-mode=classe][data-service=cuisine]').click();await attendre();
  assert.equal(await page.locator('.rg-service[data-service=cuisine] .rg-grille').count(),0,'retour à la saisie par classe');
  assert.ok(Math.abs(await duree()-avant*2)<1e-6,'la valeur commune revient');

  // 4. Le rendement allonge la journée sans toucher au barème. Il a son onglet,
  //    avec les pauses : les minutes par vol restent seules sur le leur.
  await nav.aller(page,'rg-rythme');await attendre();
  assert.equal(await page.locator('#rg-bareme-panneau').isVisible(),false,'le barème attend derrière son onglet');
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
  const valeur=cle=>page.evaluate(c=>Sim.reglages.etat.bareme.cuisine[c],cle);
  assert.equal(await valeur('*/BC'),70);

  // 8. Le barème s'exporte en Excel et se réimporte : c'est ainsi qu'une étude arrive en bloc.
  const dl=await Promise.all([page.waitForEvent('download'),page.locator('#rg-export').click()]);
  assert.match(dl[0].suggestedFilename(),/^ory-bareme-.*\.xlsx$/);
  const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-'));
  const fichier=path.join(dossier,'bareme.xlsx');
  await dl[0].saveAs(fichier);
  const feuilles=await T.lireClasseur(fs.readFileSync(fichier));
  const bareme=T.feuille(feuilles,'Barème');
  const ligne=(svc,cie,cab)=>bareme.lignes.findIndex(l=>String(l[0]).toUpperCase()===svc&&l[1]===cie&&l[2]===cab);
  assert.equal(bareme.lignes[ligne('CUISINE','*','BC')][3],70,'la valeur commune est dans le classeur');
  assert.ok(ligne('CUISINE','CRL','BC')>0,'une ligne pour CRL/BC, que son parcours fait passer en cuisine');
  assert.equal(ligne('CUISINE','CRL','YC'),-1,'aucune pour CRL/YC : son parcours évite la cuisine');
  // Dans Excel, on renseigne une valeur propre et on réimporte.
  bareme.lignes[ligne('CUISINE','CRL','BC')][3]=17.5;
  const modifie=path.join(dossier,'bareme-modifie.xlsx');
  fs.writeFileSync(modifie,T.ecrireClasseur(feuilles));
  await nav.aller(page,'rg-minutes');await page.locator('#rg-reset').click();await attendre();
  assert.equal(await valeur('*/BC'),35,'les valeurs de démonstration sont revenues');
  await page.locator('#rg-import').setInputFiles(modifie);await page.waitForTimeout(400);
  assert.equal(await valeur('*/BC'),70,'le fichier a repris la main');
  assert.equal(await valeur('CRL/BC'),17.5,'avec la valeur saisie dans Excel');
  // Un fichier faux est refusé, ligne à l'appui, et le barème en place conservé.
  bareme.lignes[ligne('CUISINE','*','PC')][0]='GARAGE';
  const mauvais=path.join(dossier,'mauvais.xlsx');
  fs.writeFileSync(mauvais,T.ecrireClasseur(feuilles));
  await page.locator('#rg-import').setInputFiles(mauvais);await page.waitForTimeout(400);
  assert.match(await page.locator('#rg-status').textContent(),/refusé[\s\S]*ligne \d+ : service inconnu « GARAGE »/i);
  assert.equal(await valeur('CRL/BC'),17.5);
  // Un barème d'hier, en JSON et par passager, est encore lu — et converti.
  const ancien=path.join(dossier,'ancien.json');
  fs.writeFileSync(ancien,JSON.stringify({schema:'ory-bareme',version:1,bareme:{cuisine:{BC:{parPax:2,parVol:0}}}}));
  await page.locator('#rg-import').setInputFiles(ancien);await page.waitForTimeout(400);
  assert.equal(await valeur('*/BC'),50,'2 min × 25 passagers types');
  await page.locator('#rg-undo').click();await attendre();
  assert.equal(await valeur('CRL/BC'),17.5,'et l’import s’annule');

  // 9. Tout survit au rechargement.
  await page.reload();await page.waitForTimeout(500);
  assert.equal(await valeur('CRL/BC'),17.5);

  // 10. Le délai de chargement n'est pas recopié : un seul champ, avec les vols
  //     dont il fixe l'heure où les repas doivent être prêts.
  await nav.vue(page,'vols');await attendre();
  assert.equal(await page.locator('#loadDelay').count(),1,'un seul champ');
  assert.equal(await page.evaluate(()=>document.getElementById('view-vols').contains(document.getElementById('loadDelay'))),true,
    'et il vit à l’étape 1, « Les vols »');
  await nav.vue(page,'reglages');await attendre();

  // 11. Rien ne déborde, sur grand écran comme sur le plus petit visé.
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.setViewportSize({width:1024,height:700});await attendre();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'pas de débordement à 1 024 px');

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('reglages-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

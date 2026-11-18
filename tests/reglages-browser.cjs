/* Le Centre des réglages depuis qu'il pilote les ateliers de travail : barème
 * en heures par vol (08/10 ; gardé en minutes : valeur commune et valeurs par compagnie), rendement,
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
  // (Évolution 22 b : une équipe naît dans la fiche de son service, « Ajouter une équipe » ; sa fiche s'ouvre, tous ses réglages dépliés.)
  const at=await nav.ajouterEquipe(page,'cuisine');await nav.reglagesEquipe(page,at);
  await page.selectOption(`[data-at="${at}"] [data-at-champ=lot-nouveau]`,'CRL/BC');await attendre();
  const avant=await duree();
  assert.ok(avant>0,'l’atelier travaille');

  // 2. Les temps par vol d'un service se règlent dans sa fiche (évolution 22 b : « Temps par vol par service » n'est plus
  //    une page ; sa section « Ses temps par vol » en reprend l'éditeur, service par service).
  const FT='#mu-services .rg-fiche[data-service=cuisine]';
  await nav.service(page,'cuisine');await attendre();
  assert.equal(await page.locator('#mu-services details[data-mu-section=temps]').evaluate(d=>d.open),false,'repliée à l’arrivée');
  assert.equal(await page.locator('#mu-services [data-rg-champ=heures]:visible').count(),0,'aucun champ à l’arrivée');
  await nav.section(page,'temps');await attendre();
  // L'ancien moteur a disparu ; la comparaison est une page des résultats.
  assert.doesNotMatch(await page.locator('#view-reglages').textContent(),/Ancien moteur de démonstration/);
  assert.equal(await page.evaluate(()=>document.getElementById('view-comparer').contains(document.getElementById('snap-a'))),true);
  // Ce sont des chiffres d'exemple : le dire là où on les modifie.
  assert.match(await page.locator('#mu-services [data-mu-section=temps] .se-exemple').textContent(),/temps par vol d’exemple/);

  // 3. Les temps par vol se lisent un service à la fois : cent dix champs d'un bloc ne se lisaient pas.
  assert.equal(await page.locator(`${FT} [data-rg-champ=heures]:visible`).count(),5,'une valeur commune par classe');
  assert.equal(await page.locator('#mu-services .rg-fiche').count(),1,'un seul service à la fois : sinon on retrouve le mur');

  // Le barème pilote la durée : doubler les heures par vol double la durée.
  // Saisies et lues en heures (08/10), gardées en minutes : 35 min ≈ 0,583 h ; 1,1667 h = 70 min.
  const cuisineBC='#mu-services [data-rg-champ=heures][data-service=cuisine][data-cle="*/BC"]';
  assert.equal(await page.locator(cuisineBC).inputValue(),'0.583','la valeur est lisible, en heures, pas vide');
  assert.equal(await page.locator('#mu-services [data-mu-section=temps] .se-exemple').count(),1,'tant qu’on n’a rien changé : des chiffres d’exemple');
  await ecrire(cuisineBC,'1.1667');
  assert.equal(await page.evaluate(()=>Sim.reglages.etat.bareme.cuisine['*/BC']),70,'gardée en minutes');
  assert.equal(await page.locator('#mu-services [data-mu-section=temps] .se-exemple').count(),0,'ce ne sont plus les chiffres d’exemple');
  assert.ok(Math.abs(await duree()-avant*2)<1e-6,'la durée a doublé');
  // Une compagnie peut avoir sa valeur propre : elle l'emporte sur la commune.
  await page.selectOption('#mu-services [data-rg-champ=propre-ajout][data-service=cuisine]','CRL/BC');await attendre();
  const crlBC='#mu-services [data-rg-champ=heures][data-service=cuisine][data-cle="CRL/BC"]';
  assert.equal(await page.locator(crlBC).inputValue(),'1.167','elle naît à la valeur commune');
  await ecrire(crlBC,'0.5833');
  assert.ok(Math.abs(await duree()-avant)<1e-6,'CRL/BC suit sa propre valeur');
  await page.locator('#mu-services [data-rg-action=propre-retirer][data-cle="CRL/BC"]').click();await attendre();
  assert.ok(Math.abs(await duree()-avant*2)<1e-6,'retirée, la valeur commune revient');
  // Saisir ne referme pas la section qu'on était en train de remplir.
  assert.equal(await page.locator('#mu-services details[data-mu-section=temps][open]').count(),1);

  // 3 bis. Saisie par compagnie × classe : une grille, une case par couple.
  await page.locator('#mu-services [data-rg-action=mode][data-mode=compagnie][data-service=cuisine]').click();await attendre();
  assert.equal(await page.locator(`${FT} .rg-grille`).count(),1,'la grille paraît');
  assert.ok(await page.locator(`${FT} .rg-grille tbody tr`).count()>=2,'une ligne par compagnie + « autres »');
  assert.equal(await page.locator(crlBC).inputValue(),'','case vide : la valeur commune s’applique');
  assert.equal(await page.locator(crlBC).getAttribute('placeholder'),'1,167');
  await ecrire(crlBC,'0.5833');
  assert.ok(Math.abs(await duree()-avant)<1e-6,'la case de la grille pilote la durée');
  // Sans valeur commune, la case sans valeur propre est signalée.
  // La valeur d'origine, au dix-millième d'heure : la remettre retrouve les minutes exactes.
  const communePC='#mu-services [data-rg-champ=heures][data-service=cuisine][data-cle="*/PC"]',pc=String(await page.evaluate(()=>MoteurProduction.versHeures(Sim.reglages.etat.bareme.cuisine['*/PC'],4)));
  await ecrire(communePC,'');
  assert.ok(await page.locator(`${FT} input.rg-manque`).count()>0,'case à renseigner signalée');
  await ecrire(communePC,pc);
  await ecrire(crlBC,'');
  await page.locator('#mu-services [data-rg-action=mode][data-mode=classe][data-service=cuisine]').click();await attendre();
  assert.equal(await page.locator(`${FT} .rg-grille`).count(),0,'retour à la saisie par classe');
  assert.ok(Math.abs(await duree()-avant*2)<1e-6,'la valeur commune revient');

  // 4. Le rendement allonge la journée sans toucher au barème. Il a son onglet,
  //    avec les pauses : les heures par vol restent seules sur le leur.
  await nav.aller(page,'rg-simulation');await attendre();
  assert.equal(await page.locator('#view-reglages [data-rg-champ=heures]').count(),0,'les temps par vol ne sont pas ici : ils se règlent dans la fiche de chaque service');
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

  // 6. Un service sans temps par vol est signalé — seulement si une équipe y lit ses temps par vol : sinon il
  //    travaillerait en temps nul sans rien dire. Un service sans équipe qui prépare (handling, quais…) n'est pas une alerte.
  //    (Dans la liste des services : son point, et ce qu'il dit.)
  await nav.aller(page,'mu-services');await attendre();
  const point=id=>page.locator(`#mu-services .se-liste [data-mu-choisir="${id}"] .mu-point`);
  const sans=await page.evaluate(()=>Sim.ateliers.a.services().map(s=>s.id).find(id=>!Sim.ateliers.state.ateliers.some(a=>a.service===id)&&!Object.keys(Sim.reglages.etat.bareme[id]||{}).length));
  assert.ok(sans,'des services sans temps par vol, mais que personne ne lit');
  assert.doesNotMatch(await point(sans).getAttribute('title'),/temps par vol à remplir/,'aucune fausse alerte');
  //    (La liste le dit dès que l'équipe prépare une commande : sans commande, elle dit d'abord qu'elle ne prépare rien.)
  await page.evaluate(s=>Sim.ateliers.changer(()=>Sim.ateliers.state.ateliers.push({id:'x-vide',nom:'Équipe sans barème',service:s,type:'manuel',
    debut:'06:00',jour:0,personnes:1,pauses:[],lots:[['CRL/BC']],regime:{actif:true}})),sans);await attendre();
  assert.match(await point(sans).getAttribute('title'),/temps par vol à remplir/,
    'une équipe y travaille : le service sans temps par vol se voit sans qu’on ait à l’ouvrir');
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers=Sim.ateliers.state.ateliers.filter(a=>a.id!=='x-vide');}));await attendre();

  // 7. Annuler et rétablir.
  await page.locator('#btn-annuler').click();await attendre();
  await page.locator('#btn-retablir').click();await attendre();
  const valeur=cle=>page.evaluate(c=>Sim.reglages.etat.bareme.cuisine[c],cle);
  assert.equal(await valeur('*/BC'),70);

  // 8. Le barème s'exporte en Excel et se réimporte : c'est ainsi qu'une étude arrive en bloc. (Depuis « Fichiers »,
  //    évolution 22 b ; « Remettre les temps par vol d'exemple » est dans « Réglages de la simulation ».)
  await nav.aller(page,'u-sauvegarde');await attendre();
  const dl=await Promise.all([page.waitForEvent('download'),page.locator('#rg-export').click()]);
  assert.match(dl[0].suggestedFilename(),/^ory-bareme-.*\.xlsx$/);
  const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-'));
  const fichier=path.join(dossier,'bareme.xlsx');
  await dl[0].saveAs(fichier);
  const feuilles=await T.lireClasseur(fs.readFileSync(fichier));
  const bareme=T.feuille(feuilles,'Temps par vol');
  const ligne=(svc,cie,cab)=>bareme.lignes.findIndex(l=>String(l[0]).toUpperCase()===svc&&l[1]===cie&&l[2]===cab);
  assert.equal(bareme.lignes[0][3],'Heures par vol');
  assert.equal(bareme.lignes[ligne('CUISINE','*','BC')][3],1.1667,'la valeur commune est dans le classeur, en heures');
  assert.ok(ligne('CUISINE','CRL','BC')>0,'une ligne pour CRL/BC, que son parcours fait passer en cuisine');
  assert.equal(ligne('CUISINE','CRL','YC'),-1,'aucune pour CRL/YC : son parcours évite la cuisine');
  // Dans Excel, on renseigne une valeur propre et on réimporte.
  bareme.lignes[ligne('CUISINE','CRL','BC')][3]=0.25;   // un quart d'heure
  const modifie=path.join(dossier,'bareme-modifie.xlsx');
  fs.writeFileSync(modifie,T.ecrireClasseur(feuilles));
  await nav.aller(page,'rg-simulation');await page.locator('#rg-reset').click();await attendre();
  assert.equal(await valeur('*/BC'),35,'les valeurs de démonstration sont revenues');
  await page.locator('#rg-import').setInputFiles(modifie);await page.waitForTimeout(400);
  assert.equal(await valeur('*/BC'),70,'le fichier a repris la main');
  assert.equal(await valeur('CRL/BC'),15,'avec la valeur saisie dans Excel, en minutes');
  // Un fichier faux est refusé, ligne à l'appui, et le barème en place conservé.
  bareme.lignes[ligne('CUISINE','*','PC')][0]='GARAGE';
  const mauvais=path.join(dossier,'mauvais.xlsx');
  fs.writeFileSync(mauvais,T.ecrireClasseur(feuilles));
  await page.locator('#rg-import').setInputFiles(mauvais);await page.waitForTimeout(400);
  assert.match(await page.locator('#rg-status').textContent(),/refusé[\s\S]*ligne \d+ : service inconnu « GARAGE »/i);
  assert.equal(await valeur('CRL/BC'),15);
  // Un barème d'hier, en JSON et par passager, est encore lu — et converti.
  const ancien=path.join(dossier,'ancien.json');
  fs.writeFileSync(ancien,JSON.stringify({schema:'ory-bareme',version:1,bareme:{cuisine:{BC:{parPax:2,parVol:0}}}}));
  await page.locator('#rg-import').setInputFiles(ancien);await page.waitForTimeout(400);
  assert.equal(await valeur('*/BC'),50,'2 min × 25 passagers types');
  await page.locator('#btn-annuler').click();await attendre();
  assert.equal(await valeur('CRL/BC'),15,'et l’import s’annule');

  // 9. Tout survit au rechargement.
  await page.reload();await page.waitForTimeout(500);
  assert.equal(await valeur('CRL/BC'),15);

  // 10. Le délai de chargement n'est pas recopié : un seul champ, avec les autres
  //     réglages de la simulation (les horaires des vols).
  await nav.aller(page,'rg-simulation');await attendre();
  assert.equal(await page.locator('#loadDelay').count(),1,'un seul champ');
  assert.equal(await page.evaluate(()=>document.getElementById('rg-sim-horaires').contains(document.getElementById('loadDelay'))),true,
    'et il vit dans Simulation › Réglages de la simulation');
  assert.equal(await page.locator('#loadDelay').isVisible(),true);

  // 11. Rien ne déborde, sur grand écran comme sur le plus petit visé.
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.setViewportSize({width:1024,height:700});await attendre();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'pas de débordement à 1 024 px');

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('reglages-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

/* La planche retour du handling (Données › Planche retour) et les réglages de
 * la simulation réunis sur une page (Réglages › Réglages de la simulation) :
 * saisir une ligne, l'exporter et la réimporter par Excel, et la faire lire à
 * la simulation — les retours arrivent alors à la plonge à l'heure dite. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const T=require('../tableur.js');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(160);
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-planche-'));
 const etat=()=>page.evaluate(()=>JSON.parse(JSON.stringify(Sim.ateliers.state.materiel)));
 const ecrire=async(sel,v)=>{await page.fill(sel,String(v));await page.dispatchEvent(sel,'change');await attendre();};
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);

  // 1. La page existe dans Données ; vide, elle dit comment la remplir.
  await nav.aller(page,'v-planche');
  assert.equal(await page.evaluate(()=>document.body.dataset.partie),'donnees');
  assert.match(await page.locator('#vols-planche').textContent(),/Aucune ligne/);
  assert.match(await page.locator('.planche-etat').textContent(),/ne lit pas cette planche/,'la simulation lit encore le programme');
  // Le tableau prend toute la largeur : aucune colonne coupée.
  const largeurs=await page.evaluate(()=>{const b=document.getElementById('vols-planche'),p=b.querySelector('.planche');
    return [b.getBoundingClientRect().width,p.getBoundingClientRect().width];});
  assert.ok(largeurs[1]>=largeurs[0]-2,'la planche occupe toute la largeur');

  // 2. Saisir une ligne : vol, compagnie, heure d'arrivée, jour, classes.
  await page.locator('[data-pl-action=ajouter]').click();await attendre();
  await ecrire('[data-index="0"] [data-pl-champ=vol]','AF1080');
  await ecrire('[data-index="0"] [data-pl-champ=cie]','af');
  await ecrire('[data-index="0"] [data-pl-champ=heure]','09:30');
  await page.selectOption('[data-index="0"] [data-pl-champ=jour]','-1');await attendre();
  await ecrire('[data-index="0"] [data-pl-champ=yc]','150');
  assert.deepEqual((await etat()).planche,[{vol:'AF1080',cie:'AF',heure:'09:30',jour:-1,yc:150}],'la compagnie s’écrit en capitales');
  // Une deuxième ligne reprend la compagnie et l'heure de la précédente.
  await page.locator('[data-pl-action=ajouter]').click();await attendre();
  assert.deepEqual((await etat()).planche[1],{vol:'',cie:'AF',heure:'09:30',jour:0});
  await page.locator('[data-index="1"] [data-pl-action=retirer]').click();await attendre();
  assert.equal((await etat()).planche.length,1);

  // 3. L'export donne un classeur ; modifié puis réimporté, il remplace la planche.
  const dl=await Promise.all([page.waitForEvent('download'),page.locator('[data-pl-action=exporter]').click()]);
  const fichier=path.join(dossier,'planche.xlsx');await dl[0].saveAs(fichier);
  const feuilles=await T.lireClasseur(fs.readFileSync(fichier));
  const f=T.feuille(feuilles,'Planche retour');
  assert.deepEqual(f.lignes[0].slice(0,4),['Vol','Compagnie','Arrivée à l’unité','Jour']);
  f.lignes.push(['TX305','TX','11:00','J']);
  const modifie=path.join(dossier,'planche-2.xlsx');fs.writeFileSync(modifie,T.ecrireClasseur(feuilles));
  await page.locator('[data-pl-fichier]').setInputFiles(modifie);await page.waitForTimeout(400);
  assert.deepEqual((await etat()).planche.map(l=>[l.vol,l.cie,l.heure,l.jour]),[['AF1080','AF','09:30',-1],['TX305','TX','11:00',0]]);
  // Un classeur faux est refusé en bloc : la planche reste telle quelle.
  f.lignes.push(['XX1','XX','','J']);
  const mauvais=path.join(dossier,'planche-3.xlsx');fs.writeFileSync(mauvais,T.ecrireClasseur(feuilles));
  await page.locator('[data-pl-fichier]').setInputFiles(mauvais);await page.waitForTimeout(400);
  assert.equal((await etat()).planche.length,2,'rien n’est importé');

  // 4. « Utiliser la planche retour » : la simulation la lit, et la page le dit.
  await page.locator('[data-pl-action=utiliser]').click();await attendre();
  assert.equal((await etat()).retours,'planche');
  assert.match(await page.locator('.planche-etat').textContent(),/La simulation lit cette planche/);
  // Le moteur la lit telle quelle : l'heure d'arrivée, le jour, sans délai ajouté.
  const retours=await page.evaluate(()=>MoteurProduction.retoursDeVols(
    [{id:'AF1080',cie:'AF',sens:'DEP',std:400,bc:12,yc:150}],Sim.ateliers.state.materiel,true).map(r=>[r.vol,r.t]));
  assert.deepEqual(retours,[['AF1080',-1440+570],['TX305',660]],'AF1080 la veille à 09:30, TX305 à 11:00');

  // 5. La page des réglages : horaires des vols, retours à la plonge, rythme.
  await nav.aller(page,'rg-simulation');
  assert.equal(await page.evaluate(()=>document.body.dataset.partie),'reglages');
  assert.match(await page.locator('#panneau-horaires h3').textContent(),/Horaires des vols/);
  assert.equal(await page.locator('#panneau-horaires').isVisible(),true);
  assert.equal(await page.locator('[data-at-champ=mat-retours]').inputValue(),'planche');
  assert.match(await page.locator('#rg-sim-materiel').textContent(),/2 lignes/);
  assert.equal(await page.locator('[data-at-champ=mat-delai]').isDisabled(),true,'pas de délai : la planche donne l’arrivée à l’unité');
  // Le choix « J+1 » : chaque départ revient le lendemain ; le délai se règle à nouveau.
  await page.selectOption('[data-at-champ=mat-retours]','j1');await attendre();
  assert.equal((await etat()).retours,'j1');
  assert.equal(await page.locator('[data-at-champ=mat-delai]').isDisabled(),false);
  assert.match(await page.locator('#rg-sim-materiel').textContent(),/la veille|\+ 24 h/);
  // Le lien vers la planche y ramène.
  await page.selectOption('[data-at-champ=mat-retours]','planche');await attendre();
  await page.locator('#rg-sim-materiel [data-page=v-planche]').click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'v-planche');

  // 6. Tout survit au rechargement.
  await page.reload();await attendre();
  const relu=await etat();
  assert.equal(relu.retours,'planche');
  assert.equal(relu.planche.length,2,'la planche est enregistrée');

  // 7. J+1 contre planche retour, d'un geste : A et B retenus, le réglage intact.
  await nav.aller(page,'v-planche');
  await page.locator('#vols-planche [data-comparer-retours]').click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'j-comparer','on arrive sur la comparaison');
  const ligne=lib=>page.evaluate(lib=>{const tr=[...document.querySelectorAll('#compare tr')].find(t=>t.cells[0]&&t.cells[0].textContent===lib);
    return tr?[tr.cells[1].textContent,tr.cells[2].textContent]:null;},lib);
  assert.deepEqual(await ligne('Retours à la plonge'),['J+1 (lendemain du départ)','Planche retour']);
  assert.ok(await ligne('Plus longue attente à la plonge'),'la plonge se compare');
  assert.equal((await etat()).retours,'planche','le réglage choisi n’a pas bougé');
  assert.equal(await page.locator('#snap-clear').isVisible(),true);
  // Le même bouton, depuis les réglages de la simulation ; la comparaison est aussi sur sa page.
  await nav.aller(page,'rg-simulation');
  assert.equal(await page.locator('#rg-sim-materiel [data-comparer-retours]').isEnabled(),true);
  await nav.aller(page,'j-comparer');
  assert.equal(await page.locator('.panneau-compare [data-comparer-retours]').isVisible(),true);

  // 8. Rien ne déborde, même sur un petit écran.
  await nav.aller(page,'v-planche');
  await page.setViewportSize({width:1024,height:700});await attendre();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'pas de débordement à 1 024 px');

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('planche-browser : ok');
 }finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});

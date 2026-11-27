/* Évolution 26 (b) — la liste des compagnies appartient à l'utilisateur (version 1), sur l'unité fictive, à 1 366 × 768.
 *   1. L'unité d'avant, privée de sa liste : le résultat est celui du moteur seul (le calcul d'avant), et la sauvegarde,
 *      restaurée puis exportée sans aucun geste, est rendue à l'identique. « Contrôles » dit, en information : « Les
 *      compagnies de cette unité viennent encore des vols : 5 trouvées. », avec « En faire ma liste ».
 *   2. « En faire ma liste » écrit la liste telle qu'elle est (classes ajoutées comprises, classes retirées exclues) : le
 *      résultat ne change pas, champ par champ ; le point s'en va ; la notification porte « Annuler », qui défait tout.
 *   3. Avec une liste, une compagnie sans vol est proposée dans les équipes (ce qu'une équipe prépare), les chemins (ce qui
 *      suit un chemin) et le tableau de tous les temps par vol.
 *   4. L'aller-retour de la sauvegarde garde la liste.
 *   5. Le classeur des équipes : réimporté tel quel, la liste et les commandes ne bougent pas ; sa feuille « Classes »
 *      retouchée (une classe retirée, une compagnie ajoutée), la liste la suit.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const T=require('../tableur.js');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const LISTE=F.sauvegardeFictive().contenu['ory-ateliers-v1'].compagnies;

/** Dans la page : le résultat de la journée, sous sa forme écrite (ses lots, ses commandes, ses équipes). */
const RESULTAT=()=>{const r=Sim.ateliers.resultat;return JSON.stringify({ok:r.ok,lots:r.lots,parClasse:r.parClasse,ateliers:r.ateliers});};
const pointsInfo=page=>page.$$eval('#mu-pas [data-ct-niveau=information] .ct-point b',l=>l.map(e=>e.textContent.trim()));

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-liste-'));
 const erreurs=[];
 try{
  const ctx=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce',acceptDownloads:true});
  const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
  const exporter=async nom=>{
    await nav.aller(page,'u-sauvegarde');
    const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#sauvegarde-export').click()]);
    const f=path.join(dossier,nom);await d.saveAs(f);return JSON.parse(fs.readFileSync(f,'utf8'));
  };

  /* 1. L'unité d'avant, privée de sa liste. */
  const avant=F.sauvegardeFictive({liste:false});
  const site=await F.charger(page,nav,URL_V1,{sauvegarde:avant,pageId:'mu-pas'});
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.unite);await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>Sim.ateliers.compagnies),null,'une unité d’avant n’a pas de liste');
  const attendu=F.heureDuPicAttendue(avant,F.volsCsv()).resultat;
  assert.equal(await page.evaluate(()=>JSON.stringify(Sim.ateliers.resultat.lots)),JSON.stringify(attendu.lots),'sans liste : les lots du calcul d’avant');
  assert.equal(await page.evaluate(()=>JSON.stringify(Sim.ateliers.resultat.parClasse)),JSON.stringify(attendu.parClasse),'sans liste : les commandes du calcul d’avant');
  const exportee=await exporter('avant.json');
  assert.deepEqual(exportee.contenu,avant.contenu,'sans liste : la sauvegarde, restaurée puis exportée sans geste, est rendue à l’identique');
  await nav.aller(page,'mu-pas');await page.waitForTimeout(200);
  const info=await pointsInfo(page);
  assert.equal(info[0],'Les compagnies de cette unité viennent encore des vols : 5 trouvées.','le point d’information, en tête des informations');
  const bouton=page.locator('#mu-pas [data-ct-action=faire-liste]');
  assert.equal(await bouton.count(),1);assert.equal((await bouton.textContent()).trim(),'En faire ma liste');

  /* 2. « En faire ma liste ». */
  const resultatAvant=await page.evaluate(RESULTAT);
  await bouton.click();await page.waitForTimeout(500);
  assert.deepEqual(await page.evaluate(()=>Sim.ateliers.compagnies),LISTE,'la liste telle qu’elle est : classes ajoutées comprises, classes retirées exclues');
  assert.equal(await page.evaluate(RESULTAT),resultatAvant,'« En faire ma liste » ne change pas le résultat');
  assert.ok(!(await pointsInfo(page)).some(t=>/viennent encore des vols/.test(t)),'le point s’en va');
  const notif=page.locator('.notifs .notif').filter({hasText:'Votre liste des compagnies est faite'});
  assert.equal(await notif.count(),1,'une notification le dit');
  assert.match(await notif.textContent(),/5 compagnies, 17 commandes\. Le résultat ne change pas\./);
  await notif.getByRole('button',{name:'Annuler'}).click();await page.waitForTimeout(500);
  assert.equal(await page.evaluate(()=>Sim.ateliers.compagnies),null,'« Annuler » défait la liste');
  assert.equal(await page.evaluate(RESULTAT),resultatAvant);
  assert.equal((await pointsInfo(page))[0],'Les compagnies de cette unité viennent encore des vols : 5 trouvées.','le point revient');
  await site.effacer();

  /* 3. L'unité d'exemple, avec sa liste : une compagnie sans vol est proposée partout. */
  const site2=await F.charger(page,nav,URL_V1,{pageId:'mu-pas'});
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.unite);await page.waitForTimeout(300);
  assert.deepEqual(await page.evaluate(()=>Sim.ateliers.compagnies),LISTE,'l’unité d’exemple a sa liste');
  assert.ok(!(await pointsInfo(page)).some(t=>/viennent encore des vols/.test(t)),'avec une liste, pas de point');
  assert.equal(await page.evaluate(RESULTAT),resultatAvant,'avec sa liste, l’unité d’exemple rend le résultat d’avant');
  assert.deepEqual((await exporter('exemple.json')).contenu,F.sauvegardeFictive().contenu,'avec sa liste, restaurée puis exportée sans geste, la sauvegarde est rendue à l’identique');
  await nav.aller(page,'mu-pas');
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.compagnies.push({nom:'NEUVE',classes:['YC']});},''));
  await page.waitForTimeout(400);
  assert.ok(await page.evaluate(()=>Sim.ateliers.classes.some(c=>c.id==='NEUVE/YC'&&c.origine==='ajoutee')),'NEUVE · Économie est une commande, sans vol');
  // Dans les équipes : ce qu'une équipe de montage prépare.
  await nav.equipe(page,'mo');await page.waitForTimeout(300);
  assert.match(await page.locator('#mu-services .se-equipe').innerText(),/NEUVE/,'la fiche d’une équipe propose NEUVE');
  // Dans les chemins : la commande suit le chemin de sa classe.
  assert.equal(await page.evaluate(()=>{const PC=OrlyParcours,c=Sim.ateliers.classes.find(x=>x.id==='NEUVE/YC');return !!PC.fluxDe(Sim.ateliers.state,c);}),true,'NEUVE · Économie a un chemin');
  await nav.aller(page,'mu-flux');await page.waitForTimeout(300);
  const chemin=await page.evaluate(()=>{const PC=OrlyParcours,c=Sim.ateliers.classes.find(x=>x.id==='NEUVE/YC');return PC.fluxDe(Sim.ateliers.state,c).id;});
  await page.locator(`#mu-flux [data-mu-flux-choisir="${chemin}"]`).first().click();await page.waitForTimeout(300);
  await nav.sectionChemin(page,'suivi');
  assert.match(await page.locator('#mu-flux').innerText(),/NEUVE/,'la fiche de son chemin la nomme');
  // Dans le tableau de tous les temps par vol : sa ligne.
  await nav.aller(page,'mu-services');await page.locator('#mu-services [data-se-panneau=temps]').click();await page.waitForTimeout(400);
  assert.match(await page.locator('#mu-services').innerText(),/NEUVE/,'le tableau de tous les temps a sa ligne');

  /* 4. L'aller-retour de la sauvegarde garde la liste. */
  const apres=await exporter('apres.json');
  const liste=[...LISTE,{nom:'NEUVE',classes:['YC']}];
  assert.deepEqual(apres.contenu['ory-ateliers-v1'].compagnies,liste,'la sauvegarde porte la liste');
  const f=path.join(dossier,'apres.json');
  await page.locator('#sauvegarde-import').setInputFiles(f);
  const recharge=page.waitForEvent('load');await nav.repondre(page);await recharge;await page.waitForLoadState('load');await page.waitForTimeout(600);
  assert.deepEqual(await page.evaluate(()=>Sim.ateliers.compagnies),liste,'restaurée, la liste est la même');
  assert.deepEqual((await exporter('encore.json')).contenu['ory-ateliers-v1'].compagnies,liste,'et elle repart dans la sauvegarde suivante');

  /* 5. Le classeur des équipes. */
  const classeur=async nom=>{
    await nav.versFichiers(page,'#at-export');
    const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#at-export').click()]);
    const f=path.join(dossier,nom);await d.saveAs(f);return f;
  };
  const importer=async f=>{await nav.versFichiers(page,'#at-import');await page.locator('#at-import').setInputFiles(f);await page.waitForTimeout(500);};
  const COMMANDES=()=>Sim.ateliers.classes.map(c=>c.id).sort().join(' ');
  const commandesListe=await page.evaluate(COMMANDES);
  const fx=await classeur('equipes.xlsx');
  await importer(fx);
  assert.deepEqual(await page.evaluate(()=>Sim.ateliers.compagnies),liste,'réimporté tel quel : la même liste');
  assert.equal(await page.evaluate(COMMANDES),commandesListe,'et les mêmes commandes');
  const feuilles=await T.lireClasseur(fs.readFileSync(fx)),cl=T.feuille(feuilles,'Classes'),[tete]=cl.lignes;
  const ligne=(cie,cab)=>cl.lignes.find(l=>l[tete.indexOf('Compagnie')]===cie&&l[tete.indexOf('Classe')]===cab);
  ligne('SUD','BC')[tete.indexOf('Retirée')]='oui';
  // (Une classe retirée n'est plus fabriquée : ses lots la quittent, comme on le ferait dans Excel.)
  const fab=T.feuille(feuilles,'Fabrications');
  fab.lignes=[fab.lignes[0],...fab.lignes.slice(1).map(l=>{const k=l.length-1;return [...l.slice(0,k),String(l[k]).split(' + ').filter(x=>x!=='SUD/BC').join(' + ')];}).filter(l=>l[l.length-1])];
  cl.lignes.push(tete.map(t=>t==='Compagnie'?'AUTRE':t==='Classe'?'PC':t==='Retirée'?'non':null));
  const fy=path.join(dossier,'equipes-retouche.xlsx');fs.writeFileSync(fy,T.ecrireClasseur(feuilles));
  await importer(fy);
  const apresClasseur=await page.evaluate(()=>Sim.ateliers.compagnies);
  assert.deepEqual(apresClasseur.find(c=>c.nom==='SUD').classes,['YC','CREW','SPML'],'la feuille retire SUD · Affaires : la liste aussi');
  assert.deepEqual(apresClasseur.find(c=>c.nom==='AUTRE'),{nom:'AUTRE',classes:['PC']},'la feuille ajoute AUTRE · Premium : la liste aussi');
  assert.ok(await page.evaluate(()=>!Sim.ateliers.classes.some(c=>c.id==='SUD/BC')&&Sim.ateliers.classes.some(c=>c.id==='AUTRE/PC')),'les commandes suivent');
  await site2.effacer();
  assert.deepEqual(erreurs,[],'aucune erreur de page');
  console.log('compagnies-liste-browser : ok — sans liste, le calcul et la sauvegarde d’avant, et le point « 5 trouvées » ; « En faire ma liste » ne change rien au résultat et se défait ; avec une liste, une compagnie sans vol est proposée dans les équipes, les chemins et le tableau des temps ; la sauvegarde et le classeur des équipes gardent la liste.');
 }finally{fs.rmSync(dossier,{recursive:true,force:true});await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

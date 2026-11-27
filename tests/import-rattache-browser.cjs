/* Évolution 26 (e) — l'import rattache, il ne crée plus (version 1), sur l'unité fictive, à 1 366 × 768.
 *   1. Avec une liste, un programme qui porte une compagnie inconnue (ECO, un départ et un retour) : aucune commande ECO,
 *      ses vols ne comptent pas. La notification de l'import le dit (« … vols rattachés à votre liste, 2 non rattachés »)
 *      et son bouton mène à « Contrôles » ; le compte rendu de l'import aussi. « Contrôles » montre un point à corriger,
 *      avec trois gestes ; le bandeau de la Synthèse le compte.
 *   2. « La rattacher à… » NORD : le point disparaît ; la notification montre la règle écrite (« ECO = NORD »), que la
 *      section des règles d'import porte ; les vols d'ECO comptent pour NORD. « Annuler » rend tout, la sauvegarde d'avant.
 *   3. « L'ignorer » : le point disparaît ; ECO est parmi les ICAO exclus ; « Annuler » le remet.
 *   4. « L'ajouter » : le panneau d'ajout de « Commandes », le nom rempli, les classes de ses vols cochées ; ajoutée, le
 *      point disparaît et ses commandes sont dans la journée ; « Annuler » le remet.
 *   5. Un nom qui change emmène ses vols : renommer NORD écrit la règle et la montre ; « Annuler » rend la sauvegarde d'avant.
 *   6. Sans liste : l'import d'avant (ECO a ses commandes, pas de point, le compte rendu d'avant).
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const CSV_ECO=F.volsCsv().replace(/\n?$/,'\n')+'EC101,ECO,PETIT,DEP,09:40,,0,0,90,3,0\nEC100,ECO,PETIT,RET,,08:20,0,0,90,3,0\n';
const TITRE='ECO : 2 vols de l’import ne sont dans aucune compagnie de votre liste';
const texte=s=>String(s||'').replace(/\s+/g,' ').trim();

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-rattache-'));
 const erreurs=[];
 try{
  const ctx=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce',acceptDownloads:true});
  const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
  const attendre=ms=>page.waitForTimeout(ms);
  const fichier=(nom,t)=>{const f=path.join(dossier,nom);fs.writeFileSync(f,t);return f;};
  const exporter=async nom=>{
    await nav.aller(page,'u-sauvegarde');
    const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#sauvegarde-export').click()]);
    const f=path.join(dossier,nom);await d.saveAs(f);return JSON.parse(fs.readFileSync(f,'utf8'));
  };
  const importer=async(nom,csv)=>{
    await nav.aller(page,'v-programme');
    await page.locator('#imp-vols').setInputFiles(fichier(nom,csv));
    await page.waitForFunction(n=>document.getElementById('source-label').textContent===n,nom);await attendre(400);
  };
  const point=()=>page.locator('#mu-pas .ct-point',{hasText:TITRE});
  const controles=async()=>{await nav.aller(page,'mu-pas');await attendre(400);};
  const commandesEco=()=>page.evaluate(()=>Sim.ateliers.classes.filter(c=>c.id.startsWith('ECO/')).map(c=>c.id).sort());
  const pax=id=>page.evaluate(i=>(Sim.ateliers.resultat.parClasse[i]||{pax:0}).pax,id);
  const reglesImport=()=>page.evaluate(()=>{const r=localStorage.getItem('ory-import-winrest-v1');return r?JSON.parse(r).regles:null;});
  const annulerLaNotif=async motif=>{await page.locator('.notifs .notif').filter({hasText:motif}).getByRole('button',{name:'Annuler'}).click();await attendre(600);};

  await F.charger(page,nav,URL_V1,{pageId:'v-programme'});
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.commandes);await attendre(300);
  const nordAvant=await pax('NORD/YC');
  const avant=await exporter('avant.json');

  /* 1. L'import d'un programme qui porte ECO. */
  await importer('vols-eco.csv',CSV_ECO);
  const notif=page.locator('.notifs .notif').filter({hasText:'non rattachés'});
  assert.match(texte(await notif.locator('.notif-texte').textContent()),/^\d+ vols rattachés à votre liste, 2 non rattachés : voir « Contrôles »\.$/,'la notification de l’import le dit');
  const total=await page.evaluate(()=>Sim.dataCourante.length);
  assert.equal(texte(await notif.locator('.notif-texte').textContent()),(total-2)+' vols rattachés à votre liste, 2 non rattachés : voir « Contrôles ».');
  assert.match(texte(await page.locator('#import-report').textContent()),new RegExp((total-2)+' vols rattachés à votre liste, 2 non rattachés\\. Voir dans « Contrôles » →'),'le compte rendu de l’import aussi');
  assert.deepEqual(await commandesEco(),[],'aucune commande ECO');
  assert.equal(await pax('NORD/YC'),nordAvant,'le calcul ne voit pas ECO');
  assert.ok(await page.evaluate(()=>!Object.keys(Sim.ateliers.resultat.parClasse).some(id=>id.startsWith('ECO/'))));
  await notif.getByRole('button',{name:'Voir « Contrôles »'}).click();await attendre(400);
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-pas','le bouton de la notification mène à « Contrôles »');
  assert.equal(await point().count(),1,'un point à corriger : '+TITRE);
  assert.equal(await point().evaluate(e=>e.closest('[data-ct-niveau]').dataset.ctNiveau),'corriger');
  assert.deepEqual(await point().locator('button[data-ct-action]').evaluateAll(l=>l.map(b=>b.textContent)),['L’ajouter','L’ignorer']);
  assert.equal(texte(await point().locator('label.ct-choix span').textContent()),'La rattacher à…');
  assert.deepEqual(await point().locator('select[data-ct-action="rattacher"] option').evaluateAll(l=>l.map(o=>o.textContent)),['choisir…','EST','NORD','OUEST','SUD','ZEN'],'les compagnies de la liste');
  await nav.aller(page,'j-chiffres');await attendre(400);
  assert.match(texte(await page.locator('#bilan-journee .bilan-probleme').textContent()),/1 compagnie de l’import n’est pas dans votre liste : ses vols ne sont pas comptés ici\./,'le bandeau de la Synthèse le compte');
  await page.locator('#bilan-journee .bilan-probleme [data-page="mu-pas"]').click();await attendre(300);
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-pas','le bandeau mène à « Contrôles »');
  const apresImport=await exporter('import.json');

  /* 2. « La rattacher à… » NORD. */
  await controles();
  await point().locator('select[data-ct-action="rattacher"]').selectOption('NORD');await attendre(700);
  assert.equal(await point().count(),0,'« La rattacher à… » : le point disparaît');
  assert.equal(texte(await page.locator('.notifs .notif').filter({hasText:'ECO rattachée à NORD'}).locator('.notif-texte').textContent()),
    'ECO rattachée à NORD : la règle « ECO = NORD » est écrite dans les codes compagnie de « Règles d’import Winrest » (Programme des vols).','la règle écrite se montre');
  assert.deepEqual((await reglesImport()).compagnies,{ECO:'NORD'});
  assert.match(await page.locator('#winrest-regles-corps [data-wr-compagnies]').inputValue(),/ECO = NORD/,'la section des règles d’import la porte');
  assert.equal(await pax('NORD/YC'),nordAvant+90,'les vols d’ECO comptent pour NORD');
  assert.ok(await page.evaluate(()=>Sim.ateliers.resultat.lots.some(l=>l.vol==='EC101'&&(l.classes||[]).some(id=>id.startsWith('NORD/')))),'EC101 se prépare pour NORD');
  await annulerLaNotif('ECO rattachée à NORD');
  assert.equal(await point().count(),1,'« Annuler » : le point revient');
  assert.equal(await reglesImport(),null,'« Annuler » : les règles d’avant');
  assert.equal(await pax('NORD/YC'),nordAvant);
  assert.deepEqual((await exporter('rattache-annule.json')).contenu,apresImport.contenu,'« Annuler » : la sauvegarde d’avant');

  /* 3. « L'ignorer ». */
  await controles();
  await point().locator('button[data-ct-action="ignorer"]').click();await attendre(700);
  assert.equal(await point().count(),0,'« L’ignorer » : le point disparaît');
  assert.match(texte(await page.locator('.notifs .notif').filter({hasText:'ECO ignorée'}).locator('.notif-texte').textContent()),/ECO ignorée : « ECO » est écrit parmi les ICAO exclus de « Règles d’import Winrest » \(Programme des vols\)\. Ses vols ne comptent pas\./);
  assert.deepEqual((await reglesImport()).icaoExclus,['ECO']);
  assert.match(await page.locator('#winrest-regles-corps [data-wr-liste="icaoExclus"]').inputValue(),/^ECO$/m);
  assert.deepEqual(await commandesEco(),[]);
  await annulerLaNotif('ECO ignorée');
  assert.equal(await point().count(),1,'« Annuler » : le point revient');
  assert.equal(await reglesImport(),null);

  /* 4. « L'ajouter ». */
  await controles();
  await point().locator('button[data-ct-action="ajouter-cie"]').click();await attendre(500);
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-commandes','« L’ajouter » ouvre « Commandes »');
  const panneau=page.locator('#mu-commandes .co-panneau[data-co-panneau="ajout"]');
  assert.equal(await panneau.count(),1,'le panneau d’ajout');
  assert.equal(await panneau.locator('[data-co-champ="nom"]').inputValue(),'ECO','le nom rempli');
  assert.deepEqual(await panneau.locator('[data-co-champ="cabine"]:checked').evaluateAll(l=>l.map(c=>c.value)),['YC','CREW'],'les classes de ses vols');
  await panneau.locator('[data-co-action="valider"]').click();await attendre(700);
  assert.deepEqual(await commandesEco(),['ECO/CREW','ECO/YC'],'ajoutée : ses commandes sont dans la journée');
  await controles();
  assert.equal(await point().count(),0,'ajoutée : le point disparaît');
  await annulerLaNotif('ECO ajoutée');
  await controles();
  assert.equal(await point().count(),1,'« Annuler » : le point revient');
  assert.deepEqual(await commandesEco(),[]);

  /* 5. Un nom qui change emmène ses vols. */
  await nav.aller(page,'mu-commandes');await attendre(300);
  await page.locator('#mu-commandes [data-co-ouvrir="NORD"]').click();await attendre(300);
  const renommer=page.locator('#mu-commandes [data-co-champ="renommer"]');
  await renommer.fill('BOREAL');await renommer.press('Enter');await attendre(700);
  const phrase=texte(await page.locator('.notifs .notif').filter({hasText:'s’appelle maintenant BOREAL'}).locator('.notif-texte').textContent());
  assert.equal(phrase,'NORD s’appelle maintenant BOREAL : ses réglages et sa couleur suivent. Ses vols aussi : la règle « NORD = BOREAL » est écrite dans les codes compagnie de « Règles d’import Winrest » (Programme des vols).');
  assert.deepEqual((await reglesImport()).compagnies,{NORD:'BOREAL'});
  assert.equal(await pax('BOREAL/YC'),nordAvant,'ses vols comptent pour BOREAL');
  await controles();
  assert.equal(await page.locator('#mu-pas .ct-point',{hasText:'NORD :'}).count(),0,'aucun vol de NORD à rattacher');
  await annulerLaNotif('s’appelle maintenant BOREAL');
  assert.equal(await reglesImport(),null,'« Annuler » : les règles d’avant');
  assert.deepEqual((await exporter('renomme-annule.json')).contenu,apresImport.contenu,'renommer puis « Annuler » : la sauvegarde d’avant');

  /* 6. Sans liste : l'import d'avant. */
  const sans=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});
  const p2=await sans.newPage();p2.on('pageerror',e=>erreurs.push(e.message));p2.on('dialog',d=>d.accept());
  await F.charger(p2,nav,URL_V1,{sauvegarde:F.sauvegardeFictive({liste:false}),csv:CSV_ECO,pageId:'v-programme'});
  await p2.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat);await p2.waitForTimeout(300);
  assert.deepEqual(await p2.evaluate(()=>Sim.ateliers.classes.filter(c=>c.id.startsWith('ECO/')).map(c=>c.id).sort()),['ECO/CREW','ECO/YC'],'sans liste : ECO a ses commandes, comme avant');
  assert.equal(await p2.locator('.notifs .notif',{hasText:'rattach'}).count(),0,'sans liste : pas de notification de rattachement');
  assert.doesNotMatch(texte(await p2.locator('#import-report').textContent()),/rattach/,'sans liste : le compte rendu d’avant');
  await nav.aller(p2,'mu-pas');await p2.waitForTimeout(300);
  assert.equal(await p2.locator('#mu-pas .ct-point',{hasText:'de l’import ne'}).count(),0,'sans liste : aucun point');
  await sans.close();

  assert.deepEqual(erreurs,[],'aucune erreur de page');
  console.log('OK import-rattache : avec une liste, une compagnie inconnue ne crée aucune commande ; la notification de l’import le dit et mène à « Contrôles », le compte rendu aussi ; '
   +'un point à corriger avec trois gestes, compté par le bandeau de la Synthèse ; « La rattacher à… » écrit et montre la règle, les vols comptent pour la compagnie choisie ; '
   +'« L’ignorer » écrit l’ICAO exclu ; « L’ajouter » ouvre le panneau d’ajout rempli ; chacun retire le point et se défait par « Annuler » ; un nom qui change emmène ses vols ; sans liste, l’import d’avant');
 }finally{fs.rmSync(dossier,{recursive:true,force:true});await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

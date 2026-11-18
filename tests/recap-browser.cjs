/* « Temps par vol », tous les temps d'un coup : un fichier Excel de paramétrage (retour d'usage du 28/09).
 * Évolution 22 (b) : la vue d'ensemble a quitté l'écran — une ligne par commande, une colonne par service, c'est son
 * classeur, dans « Fichiers » ; à l'écran, les temps d'un service se règlent dans sa fiche (« Services et équipes »),
 * la valeur propre à une commande aussi. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const T=require('../tableur.js');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 const bareme=()=>page.evaluate(()=>Sim.reglages.etat.bareme);
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  await page.waitForTimeout(200);await nav.effectifSaisi(page);   // les personnes se saisissent ici (05/10)

  // Le classeur « Temps par vol, vue d'ensemble », exporté depuis « Fichiers ».
  const fichier=path.join(os.tmpdir(),'recap-'+process.pid+'.xlsx');
  const exporter=async()=>{
    await nav.aller(page,'u-sauvegarde');
    const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('#fi-classeurs tr[data-classeur=temps] #rg-recap-export').click()]);
    await dl.saveAs(fichier);return T.lireClasseur(fs.readFileSync(fichier));
  };

  // 1. Tous les temps d'un coup : une ligne par commande, une colonne par service — dans le classeur ; plus à l'écran.
  const n=await page.evaluate(()=>Sim.ateliers.classes.length);
  let feuilles=await exporter();
  assert.deepEqual(feuilles.map(f=>f.nom),['Heures par vol','Toutes compagnies','Personnes','Robot','Lisez-moi']);
  assert.equal(feuilles[0].lignes.length-1,n,'une ligne par commande');
  assert.deepEqual(feuilles[0].lignes[0].slice(0,3),['Compagnie','Classe','Vols (info)']);
  assert.ok(feuilles[0].lignes[0].length-3>=4,'des colonnes de services');
  assert.equal(await page.locator('#rg-recap, .rg-recap-table, #rg-recap-filtre, [data-rg-action=recap-vue]').count(),0,'la vue d’ensemble n’est plus à l’écran');
  // Son ancien nom mène à la fiche d'un service, sur ses temps.
  await page.keyboard.press('Control+k');await page.waitForSelector('dialog.palette [role=option]');
  await page.keyboard.type('Temps par vol');await attendre();
  const options=page.locator('dialog.palette [role=option]');
  const io=(await options.evaluateAll(os=>os.map(o=>(o.querySelector('.pal-nom')||o).textContent.trim()))).indexOf('Temps par vol');
  assert.ok(io>=0,'« Aller à… » trouve encore « Temps par vol »');
  await options.nth(io).click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-services');
  assert.equal(await page.evaluate(()=>document.body.dataset.partie),'organisation');
  assert.equal(await page.locator('#mu-services details[data-mu-section=temps][open]').count(),1,'la section des temps du service, dépliée');

  // 2. Une valeur propre à une compagnie × classe, dans la fiche du service ; la retirer la ramène à la commune.
  const sid='cuisine',cls='AF/BC',cle=cls;
  await nav.service(page,sid);await nav.section(page,'temps');
  const champ=()=>page.locator(`#mu-services .se-fiche [data-rg-champ=heures][data-service="${sid}"][data-cle="${cle}"]`);
  assert.equal(await champ().count(),0,'pas encore de valeur propre');
  await page.locator(`#mu-services .se-fiche select[data-rg-champ=propre-ajout][data-service="${sid}"]`).selectOption(cle);await attendre();
  // Saisie en heures par vol (08/10), gardée en minutes : 1,25 h = 75 min.
  await champ().fill('1.25');await champ().dispatchEvent('change');await attendre();
  assert.equal((await bareme())[sid][cle],75,'valeur propre au barème, en minutes');
  assert.equal(await champ().inputValue(),'1.25','relue en heures');
  await page.locator(`#mu-services .se-fiche [data-rg-action=propre-retirer][data-service="${sid}"][data-cle="${cle}"]`).click();await attendre();
  assert.equal((await bareme())[sid][cle],undefined,'retirée : elle suit la valeur commune');
  // « Annuler », en tête de page, défait le dernier geste : ici, un temps par vol.
  await page.locator(`#mu-services .se-fiche select[data-rg-champ=propre-ajout][data-service="${sid}"]`).selectOption(cle);await attendre();
  await champ().fill('1.1');await champ().dispatchEvent('change');await attendre();
  assert.equal((await bareme())[sid][cle],66);
  await page.locator('#btn-annuler').click();await attendre();
  assert.notEqual((await bareme())[sid][cle],66,'Annuler');
  await page.locator('#btn-annuler').click();await attendre();
  assert.equal((await bareme())[sid][cle],undefined,'Annuler, encore : plus de valeur propre');

  // 3. (La lecture « sur la journée » — heures par vol × vols, totaux — était un résultat de la vue d'ensemble : elle a
  //    quitté l'écran avec elle ; la charge de chaque service se lit dans les résultats.)

  // 4. Le fichier de paramétrage : exporté, modifié dans « Excel », réimporté — depuis « Fichiers ».
  feuilles=await exporter();
  const g=feuilles[0].lignes, nomSvc=await page.evaluate(sid=>Sim.reglages.a.services().find(s=>s.id===sid).nom,sid);
  const col=g[0].indexOf(nomSvc), i=g.findIndex(l=>l[0]+'/'+l[1]===cls);
  assert.ok(col>2&&i>0);
  g[i][col]=1.65;   // en heures : 99 min
  fs.writeFileSync(fichier,T.ecrireClasseur(feuilles));
  await page.setInputFiles('#fi-classeurs tr[data-classeur=temps] #rg-recap-import',fichier);await page.waitForTimeout(600);
  assert.equal((await bareme())[sid][cle],99,'réimporté, en minutes');
  assert.match(await page.locator('#rg-status').innerText(),/1 valeur changée/);
  // La fiche du service montre la valeur importée.
  await nav.service(page,sid);await nav.section(page,'temps');
  assert.equal(await champ().inputValue(),'1.65','la fiche suit le classeur');

  // 5. L'effectif de l'équipe qui prépare : il se lit dans le classeur (feuille « Personnes »), il suit la fiche.
  // (Évolution 22 c : le chemin à part d'une commande, avec une équipe par service, se demande au modèle — nav.creerChemin.)
  await nav.aller(page,'mu-flux');
  await nav.creerChemin(page,'AF/BC');
  const personnes=async()=>(await exporter()).find(f=>f.nom==='Personnes').lignes;
  let pers=await personnes();
  assert.deepEqual(pers[0],['Équipe','Service (info)','Commandes (info)','Personnes']);
  assert.ok(pers.length>1,'l’effectif des équipes qui préparent est là');
  const [nomEquipe,,,avant]=pers[1];
  const at=await page.evaluate(nom=>Sim.ateliers.state.ateliers.find(a=>a.nom===nom).id,nomEquipe);
  assert.equal(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).personnes,at),avant);
  // Il se règle dans la fiche de l'équipe ; le classeur suit.
  const fiche=await nav.reglagesEquipe(page,at);
  const p=page.locator(`${fiche} [data-at-champ=personnes]`).first();
  await p.fill(String(avant+2));await p.dispatchEvent('change');await attendre();
  pers=await personnes();
  assert.equal(pers.find(l=>l[0]===nomEquipe)[3],avant+2,'le classeur suit la fiche');
  fs.unlinkSync(fichier);

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('recap-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

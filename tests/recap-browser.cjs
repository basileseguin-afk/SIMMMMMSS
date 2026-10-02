/* Données › Récap des man-minutes : tout le barème d'un coup d'œil, modifiable,
 * et un fichier Excel de paramétrage (retour d'usage du 28/09). */
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

  // 1. Dans Mon unité (Tableau des minutes) : une ligne par commande, une colonne par service.
  await nav.aller(page,'rg-recap');await nav.deplier(page);
  assert.equal(await page.evaluate(()=>document.body.dataset.partie),'organisation');
  const n=await page.evaluate(()=>Sim.ateliers.classes.length);
  assert.equal(await page.locator('.rg-recap-table tbody tr[data-classe]').count(),n,'une ligne par commande');
  assert.equal(await page.locator('.rg-recap-table tbody tr.rg-recap-cie').count(),await page.evaluate(()=>new Set(Sim.ateliers.classes.map(c=>c.cie)).size),'et une ligne total par compagnie');
  assert.ok(await page.locator('.rg-recap-table thead th').count()>=4,'des colonnes de services');
  assert.match(await page.locator('.rg-recap-resume').innerText(),/\d+ commandes · \d+ compagnies · \d+ services · .* de travail sur la journée/);

  // 2. Modifier une case : elle devient propre à cette compagnie × classe ; la vider la ramène à la commune.
  const champ=page.locator('.rg-recap-table input[data-rg-champ=recap]').first();
  const sid=await champ.getAttribute('data-service'),cls=await champ.getAttribute('data-classe');
  const cle=cls;   // « AF/BC »
  await champ.fill('77');await champ.dispatchEvent('change');await attendre();
  assert.equal((await bareme())[sid][cle],77,'valeur propre au barème');
  assert.match(await page.locator(`.rg-recap-table input[data-service="${sid}"][data-classe="${cls}"]`).evaluate(i=>i.closest('td').className),/propre/);
  await page.locator(`.rg-recap-table input[data-service="${sid}"][data-classe="${cls}"]`).fill('');
  await page.locator(`.rg-recap-table input[data-service="${sid}"][data-classe="${cls}"]`).dispatchEvent('change');await attendre();
  assert.equal((await bareme())[sid][cle],undefined,'vidée : elle suit la valeur commune');
  // Le barème par service le montre aussi.
  await page.locator(`.rg-recap-table input[data-service="${sid}"][data-classe="${cls}"]`).fill('66');
  await page.locator(`.rg-recap-table input[data-service="${sid}"][data-classe="${cls}"]`).dispatchEvent('change');await attendre();
  await page.locator('#rg-recap-undo').click();await attendre();
  assert.equal((await bareme())[sid][cle],undefined,'Annuler');

  // 3. Sur la journée : par vol × vols, totaux en heures, en lecture.
  await page.locator('[data-rg-action=recap-vue][data-vue=jour]').click();await attendre();
  assert.equal(await page.locator('.rg-recap-table input').count(),0,'lecture seule');
  assert.match(await page.locator('.rg-recap-table tfoot').innerText(),/Total journée[\s\S]*h/);
  await page.locator('[data-rg-action=recap-vue][data-vue=vol]').click();await attendre();
  // Chercher une compagnie.
  await page.fill('#rg-recap-filtre','TX');await attendre();
  assert.ok(await page.locator('.rg-recap-table tbody tr[data-classe]').evaluateAll(tr=>tr.every(t=>/^TX/.test(t.dataset.classe))),'seulement TX');
  await page.fill('#rg-recap-filtre','');await attendre();

  // 4. Le fichier de paramétrage : exporté, modifié dans « Excel », réimporté.
  const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('#rg-recap-export').click()]);
  const fichier=path.join(os.tmpdir(),'recap-'+process.pid+'.xlsx');await dl.saveAs(fichier);
  const feuilles=await T.lireClasseur(fs.readFileSync(fichier));
  assert.deepEqual(feuilles.map(f=>f.nom),['Man-minutes par vol','Toutes compagnies','Personnes','Robot','Lisez-moi']);
  const g=feuilles[0].lignes, nomSvc=await page.evaluate(sid=>Sim.reglages.a.services().find(s=>s.id===sid).nom,sid);
  const col=g[0].indexOf(nomSvc), i=g.findIndex(l=>l[0]+'/'+l[1]===cls);
  assert.ok(col>2&&i>0);
  g[i][col]=99;
  fs.writeFileSync(fichier,T.ecrireClasseur(feuilles));
  await page.setInputFiles('#rg-recap-import',fichier);await page.waitForTimeout(600);
  assert.equal((await bareme())[sid][cle],99,'réimporté');
  assert.match(await page.locator('#rg-status').innerText(),/1 valeur changée/);
  fs.unlinkSync(fichier);

  // 5. L'effectif de l'équipe qui prépare, dans chaque case, modifiable ; la durée suit.
  await nav.aller(page,'at-chemins');
  await page.locator('[data-pc-action=cmd][data-classe="AF/BC"]').click();await attendre();
  await nav.creerChemin(page,'AF/BC');
  await nav.aller(page,'rg-recap');await nav.deplier(page);
  const pers=page.locator('.rg-recap-table tr[data-classe="AF/BC"] input[data-rg-champ=recap-pers]').first();
  assert.equal(await pers.count(),1,'l’effectif de la case est là');
  const at=await pers.getAttribute('data-atelier');
  const avant=await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).personnes,at);
  await pers.fill(String(avant+2));await pers.dispatchEvent('change');await attendre();
  assert.equal(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).personnes,at),avant+2,'la case a son nouvel effectif');
  const cel=page.locator(`.rg-recap-table input[data-atelier="${at}"]`).first().locator('xpath=ancestor::td/following-sibling::td[1]');
  assert.match(await cel.innerText(),/\d/,'la durée d’un vol est dite, dans sa colonne');
  assert.equal(await page.locator('.rg-recap-t2 th').first().innerText(),'min/vol','trois sous-colonnes par service');
  // « Annuler » du récap défait aussi un effectif.
  await page.locator('#rg-recap-undo').click();await attendre();
  assert.equal(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).personnes,at),avant,'annulé');

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('recap-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

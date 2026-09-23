/* Import CSV dans le navigateur : BUG-005 (réimport après échec de lecture), vols,
 * export et scénarios A/B sur le modèle par ateliers. */
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const click=s=>page.locator(s).click();
 const setRange=(s,v)=>page.locator(s).evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));},v);
 const header='vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC\n';
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  // L'import des vols vit à l'étape 1, « Les vols ».
  await click('[data-view="vols"]');

  // BUG-005 : on force un échec de lecture, puis on vérifie qu'un second choix du
  // même fichier est bien pris en compte.
  await page.evaluate(()=>{const orig=FileReader.prototype.readAsText;window.__lectureCassee=true;
    FileReader.prototype.readAsText=function(f){if(window.__lectureCassee){setTimeout(()=>this.onerror(new Event('error')));return;}return orig.call(this,f);};});
  const fichier={name:'vols.csv',mimeType:'text/csv',buffer:Buffer.from(header+'OK1,TX,A350,DEP,12:00,,1,2,100')};
  await page.locator('#imp-vols').setInputFiles(fichier);
  await page.waitForFunction(()=>/Lecture du fichier impossible/.test(document.getElementById('import-report').textContent));
  assert.equal(await page.locator('#imp-vols').inputValue(),'','le champ doit être vidé après un échec de lecture');
  await page.evaluate(()=>{window.__lectureCassee=false;});
  await page.locator('#imp-vols').setInputFiles(fichier);
  await page.waitForFunction(()=>document.getElementById('source-label').textContent==='vols.csv');
  assert.match(await page.locator('#import-report').textContent(),/1 lignes importées/);

  // BUG-003 vu de l'interface : le message désigne la ligne physique.
  await page.locator('#imp-vols').setInputFiles({name:'faux.csv',mimeType:'text/csv',buffer:Buffer.from(header+'\n\nX,TX,A350,DEP,25:00,,1,2,100')});
  await page.waitForFunction(()=>document.getElementById('import-report').classList.contains('error'));
  assert.match(await page.locator('#import-report').textContent(),/Ligne 4 /);
  assert.equal(await page.locator('#source-label').textContent(),'vols.csv');

  await click('#restore-demo');
  // La vue Vols lit le modèle par équipes : sans équipe décrite, aucun repas
  // n'est préparé, et le tableau le dit plutôt que d'annoncer un retard.
  assert.match(await page.locator('#flight-rows').textContent(),/Des repas sans équipe/);
  assert.match(await page.locator('#flight-rows').textContent(),/personne ne prépare/);
  // L'export suit ce qu'on regarde : la journée calculée.
  const attendu=page.waitForEvent('download');await click('#btn-export');const dl=await attendu;
  const exp=JSON.parse(require('node:fs').readFileSync(await dl.path(),'utf8'));
  assert.equal(exp.schemaVersion,'0.5');assert.equal(exp.modele,'ateliers');
  assert.ok(exp.departs.length>0,'les départs du programme sont exportés');
  assert.ok(exp.departs.every(d=>d.classes.every(c=>c.absente)),'sans atelier, aucune classe n’est fabriquée');

  // Scénarios A/B sur le modèle par ateliers : une cuisine à deux, puis à douze.
  await click('[data-view="ateliers"]');
  await page.locator('#at-new').click();await page.waitForTimeout(150);
  const at=await page.evaluate(()=>Sim.ateliers.state.ateliers.at(-1).id);
  await page.selectOption(`[data-at="${at}"] [data-at-champ=service]`,'cuisine');await page.waitForTimeout(150);
  for(const c of ['AF/BC','AF/YC','DL/YC'])await page.selectOption(`[data-at="${at}"] [data-at-champ=lot-nouveau]`,c);
  const personnes=n=>page.evaluate(([id,n])=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id===id).personnes=n;}),[at,n]);
  await personnes(2);
  await click('[data-view="reglages"]');
  assert.match(await page.locator('#compare-note').textContent(),/Photographiez A/);
  await click('#snap-a');
  await personnes(12);
  await click('#snap-b');
  // Le tableau est relu à chaque appel : il change à chaque capture.
  const lignes=()=>page.locator('#compare tbody tr:not(.compare-groupe)').evaluateAll(trs=>trs.map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent)));
  const ligne=async nom=>(await lignes()).find(l=>l[0].startsWith(nom));
  assert.deepEqual((await ligne('Personnes au travail')).slice(1),['2','12']);
  assert.deepEqual((await ligne('Vols')).slice(1),['Jeu de démonstration','Jeu de démonstration']);
  assert.match((await ligne('Dernier repas prêt'))[2],/mieux/,'à douze, la cuisine finit plus tôt, et le tableau le dit en mots');
  assert.equal(await page.locator('#compare tr.diff').count()>0,true);
  assert.equal(await page.locator('#compare tr.moins-bien').count(),0,'plus de monde ne dégrade rien');
  assert.match(await page.locator('#compare-note').textContent(),/seul ce que vous avez changé/);
  // Mêmes réglages ⇒ mêmes chiffres, et la note le dit.
  await personnes(2);await click('#snap-b');
  assert.match(await page.locator('#compare-note').textContent(),/Rien n’a changé/);
  assert.equal(await page.locator('#compare tr.diff').count(),0);
  // Le décalage des vols est un réglage comme un autre : il se capture.
  await click('[data-view="vols"]');await setRange('#shift','30');
  assert.equal(await page.locator('#shift-val').textContent(),'+30 min');
  await click('[data-view="reglages"]');await click('#snap-b');
  assert.deepEqual((await ligne('Décalage des vols')).slice(1),['0 min','+30 min']);
  await click('[data-view="vols"]');await setRange('#shift','0');
  // Deux programmes de vols différents : la comparaison le signale.
  await page.locator('#imp-vols').setInputFiles({name:'autre.csv',mimeType:'text/csv',buffer:Buffer.from(header+'AF1,AF,A320,DEP,12:00,,4,0,90')});
  await page.waitForFunction(()=>document.getElementById('source-label').textContent==='autre.csv');
  await click('[data-view="reglages"]');
  assert.match(await page.locator('#compare-note').textContent(),/Photographiez A/,'un nouveau programme efface les captures');
  await click('#snap-a');await click('[data-view="vols"]');await click('#restore-demo');await click('[data-view="reglages"]');
  assert.match(await page.locator('#compare-note').textContent(),/Photographiez A/);
  // L'ancien moteur n'a plus de curseurs à offrir.
  for(const id of ['#staff-cuisine','#robot','#vivier','#calendrier','#materiel','#tunnels'])
    assert.equal(await page.locator(id).count(),0,id+' a disparu avec l’ancien moteur');

  assert.deepEqual(errors,[]);
  console.log('Import browser passed: read failure then re-import (BUG-005), physical line numbers (BUG-003), Vols and export, A/B on the atelier model.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

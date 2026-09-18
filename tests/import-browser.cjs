/* Import CSV dans le navigateur : BUG-005 (réimport après échec de lecture) et scénarios A/B. */
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const click=s=>page.locator(s).click();
 const setRange=(s,v)=>page.locator(s).evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));},v);
 const header='vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC\n';
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await click('[data-panel="donnees"]');

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

  // Scénarios A/B : deux journées complètes, seule la cadence du robot change.
  await click('#restore-demo');
  await click('[data-panel="reglages"]');
  await click('#snap-a');
  await setRange('#robot','560');
  await click('#snap-b');
  const lignes=await page.locator('#compare tbody tr').evaluateAll(trs=>trs.map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent)));
  const ligne=nom=>lignes.find(l=>l[0].startsWith(nom));
  assert.deepEqual(ligne('Journée simulée').slice(1),['23:00','23:00']);
  assert.deepEqual(ligne('Robot pl/h').slice(1),['320','560']);
  const pct=v=>parseInt(v,10);
  assert.ok(pct(ligne('Prêts à l’échéance')[2])>pct(ligne('Prêts à l’échéance')[1]),'un robot plus rapide doit améliorer la ponctualité : '+ligne('Prêts à l’échéance'));
  assert.ok(pct(ligne('Robot occupé')[2])<pct(ligne('Robot occupé')[1]));
  assert.equal(await page.locator('#compare tr.diff').count()>0,true);
  assert.match(await page.locator('#compare-note').textContent(),/journée entière/);
  // Même réglages ⇒ mêmes chiffres, et la note le dit.
  await setRange('#robot','320');await click('#snap-b');
  assert.match(await page.locator('#compare-note').textContent(),/Réglages identiques/);
  assert.equal(await page.locator('#compare tr.diff').count(),0);
  // Capturer pendant une simulation en cours reste possible et rejoue la journée entière.
  await setRange('#vitesse','120');await click('#btn-play');await page.waitForTimeout(300);await click('#btn-play');
  await click('#snap-a');assert.deepEqual(ligne('Journée simulée').slice(1),['23:00','23:00']);
  assert.deepEqual(errors,[]);
  console.log('Import browser passed: read failure then re-import (BUG-005), physical line numbers (BUG-003), A/B full-day replay.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

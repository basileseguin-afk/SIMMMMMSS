/* Import CSV dans le navigateur : BUG-005 (réimport après échec de lecture) et scénarios A/B. */
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
  await setRange('#robot','200');
  await click('#snap-b');
  // Le tableau est relu à chaque appel : il change à chaque capture.
  const lignes=()=>page.locator('#compare tbody tr').evaluateAll(trs=>trs.map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent)));
  const ligne=async nom=>(await lignes()).find(l=>l[0].startsWith(nom));
  assert.deepEqual((await ligne('Journée simulée')).slice(1),['23:00','23:00']);
  assert.deepEqual((await ligne('Robot pl/h')).slice(1),['320','200']);
  const pct=v=>parseInt(v,10);
  const prets=await ligne('Prêts à l’échéance');assert.ok(pct(prets[2])<pct(prets[1]),'un robot plus lent doit dégrader la ponctualité : '+prets);
  const occ=await ligne('Robot occupé');assert.ok(pct(occ[2])>pct(occ[1]));
  assert.deepEqual((await ligne('Compagnies servies')).slice(1),['FBU, TX, FWI, CRL','FBU, TX, FWI, CRL']);
  assert.equal(await page.locator('#compare tr.diff').count()>0,true);
  assert.match(await page.locator('#compare-note').textContent(),/journée entière/);
  // Même réglages ⇒ mêmes chiffres, et la note le dit.
  await setRange('#robot','320');await click('#snap-b');
  assert.match(await page.locator('#compare-note').textContent(),/Réglages identiques/);
  assert.equal(await page.locator('#compare tr.diff').count(),0);
  // Retirer toutes les compagnies du robot : le montage porte tout, la ligne diffère.
  await page.locator('#robot-cies').fill('');await page.locator('#robot-cies').dispatchEvent('change');
  await click('#snap-b');
  assert.deepEqual((await ligne('Compagnies servies')).slice(1),['FBU, TX, FWI, CRL','aucune']);
  assert.equal(pct((await ligne('Robot occupé'))[2]),0);
  await page.locator('#robot-cies').fill('FBU, TX, FWI, CRL');await page.locator('#robot-cies').dispatchEvent('change');
  // Contenance finie au montage : le levier est pris en compte dans la capture.
  await page.locator('#tampon-prepa').fill('2');await page.locator('#tampon-prepa').dispatchEvent('change');
  await click('#snap-b');
  assert.match((await ligne('Contenances'))[2],/MONTAGE 2/);
  await page.locator('#tampon-prepa').fill('');await page.locator('#tampon-prepa').dispatchEvent('change');
  // Équipe du soir : cuisine à 0 après 14:00 → la vague du soir ne sort pas.
  await page.locator('#equipe-soir summary').click();
  assert.match(await page.locator('#so-cuisine').textContent(),/comme le matin/);
  await setRange('#soir-cuisine','0');
  assert.equal(await page.locator('#so-cuisine').textContent(),'0');
  await click('#snap-b');
  assert.match((await ligne('Équipe du soir'))[2],/CUISINE 0/);
  assert.equal((await ligne('Équipe du soir'))[1],'comme le matin');
  const pretsSoir=await ligne('Prêts à l’échéance');assert.ok(pct(pretsSoir[2])<pct(pretsSoir[1]),'sans cuisine le soir, la ponctualité doit chuter : '+pretsSoir);
  assert.ok(pct((await ligne('Échéances dépassées'))[2])>0);
  await setRange('#soir-cuisine','10');
  // Matériel propre : un stock serré dégrade la ponctualité et se mesure.
  await setRange('#materiel','600');
  assert.equal(await page.locator('#materiel-val').textContent(),'600 u');
  await click('#snap-b');
  assert.deepEqual((await ligne('Matériel propre à l’ouverture')).slice(1),['2600 u','600 u']);
  const pretsMat=await ligne('Prêts à l’échéance');
  assert.ok(pct(pretsMat[2])<pct(pretsMat[1]),'un stock serré doit dégrader la ponctualité : '+pretsMat);
  const rupture=await ligne('Part du temps en rupture');
  assert.ok(pct(rupture[2])>50,'stock serré : la rupture doit dominer la journée · '+rupture);
  assert.ok(pct(rupture[1])<10,'stock par défaut : la rupture doit rester marginale · '+rupture);
  await setRange('#materiel','2600');
  // Capturer pendant une simulation en cours reste possible et rejoue la journée entière.
  await setRange('#robot','200');await setRange('#vitesse','120');await click('#btn-play');await page.waitForTimeout(300);await click('#btn-play');
  await click('#snap-a');assert.deepEqual((await ligne('Journée simulée')).slice(1),['23:00','23:00']);
  // Pendant la journée, chaque OF dit ce qu'il attend ; à la fin, le retard s'explique.
  await click('[data-view="vols"]');
  assert.match(await page.locator('#flight-rows').textContent(),/en cours|attend/);
  await click('#btn-play');await page.waitForFunction(()=>document.getElementById('run-state').textContent==='Terminé',{},{timeout:20000});
  const texte=await page.locator('#flight-rows').textContent();
  assert.match(texte,/attente du robot \d+ min/,'un vol servi par le robot doit expliquer son retard');
  assert.match(texte,/le dernier fini/);
  const attendu=page.waitForEvent('download');await click('#btn-export');const dl=await attendu;
  const exp=JSON.parse(require('node:fs').readFileSync(await dl.path(),'utf8'));
  assert.equal(exp.schemaVersion,'0.4');assert.ok(exp.journal.length>50);
  assert.ok(exp.vols.some(v=>v.explication&&v.explication.attenteRobot>0));
  assert.deepEqual(errors,[]);
  console.log('Import browser passed: read failure then re-import (BUG-005), physical line numbers (BUG-003), A/B full-day replay.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

/* Banc d'essai, évolution 10 (a) — le programme daté dans la page (v1) : le
 * rapport d'import décrit la période et signale un jour sans vol ; « Modèle
 * CSV daté » ; « Exporter les vols (Excel) » écrit la date en première
 * colonne. Données fictives ; aucune capture d'écran (le plan est confidentiel). */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const T=require('../tableur.js');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

// Trois jours fictifs, le 03/11 sans aucun vol.
const CSV='date,vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC\n'
  +'2026-11-02,NO1,NORD,A320,DEP,10:00,,0,0,100\n2026-11-02,NO-R1,NORD,A320,RET,,09:00,0,0,100\n2026-11-04,NO1,NORD,A320,DEP,10:00,,0,0,90\n';

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=250)=>page.waitForTimeout(ms);
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-date-'));
 const telecharger=async id=>{const [d]=await Promise.all([page.waitForEvent('download'),page.locator(id).click()]);const f=path.join(dossier,d.suggestedFilename());await d.saveAs(f);return f;};
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(500);
  await nav.aller(page,'v-programme');

  // 1. Le modèle daté : deux jours fictifs, la date en première colonne.
  const modele=fs.readFileSync(await telecharger('#csv-template-date'),'utf8');
  assert.match(modele,/^date,vol_id,/);
  assert.deepEqual([...new Set(modele.trim().split('\n').slice(1).map(l=>l.split(',')[0]))],['2026-11-02','2026-11-03']);

  // 2. L'import : la période, les vols par jour, le jour sans vol signalé, sans bloquer.
  const csv=path.join(dossier,'vols-dates.csv');fs.writeFileSync(csv,CSV);
  await page.locator('#imp-vols').setInputFiles(csv);
  await page.waitForFunction(()=>document.getElementById('source-label').textContent==='vols-dates.csv');
  const rapport=await page.locator('#import-report').innerText();
  assert.match(rapport,/3 lignes importées\. 2 départs et 1 retours\./);
  assert.match(rapport,/Programme daté : du 02\/11\/2026 au 04\/11\/2026, 3 jours\./);
  assert.match(rapport,/02\/11 : 2 · 03\/11 : 0 · 04\/11 : 1/);
  assert.match(rapport,/Aucun vol le 03\/11 : jour sans vol ou oubli \?/);
  assert.equal(await page.locator('#import-report.error').count(),0,'sans bloquer');
  assert.deepEqual(await page.evaluate(()=>Sim.dataCourante.map(v=>v.date)),['2026-11-02','2026-11-02','2026-11-04']);

  // 3. Une ligne sans date parmi des lignes datées : rien n'est importé, la ligne est nommée.
  const casse=path.join(dossier,'casse.csv');fs.writeFileSync(casse,CSV.replace('2026-11-04,NO1',',NO1'));
  await page.locator('#imp-vols').setInputFiles(casse);await attendre(400);
  assert.match(await page.locator('#import-report.error').innerText(),/Ligne 4 : date manquante/);
  assert.equal(await page.evaluate(()=>Sim.dataCourante.length),3,'le programme d’avant reste');

  // 4. L'export Excel : la date en première colonne, une vraie date Excel.
  const xlsx=await telecharger('#exp-vols');
  const f=await T.lireClasseur(fs.readFileSync(xlsx));
  const dep=f.find(x=>x.nom==='Départs').lignes;
  assert.equal(dep[0][0],'date');
  assert.deepEqual(dep.slice(1).map(l=>l[0]),[46328,46330]);

  assert.deepEqual(errors,[]);
  console.log('programme-date-browser : ok — modèle daté, rapport de la période, refus nommé, export');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})();

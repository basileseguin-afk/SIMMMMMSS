/* Banc d'essai, correction 1 — dans la page (v1) : un programme sans aucun vol
 * d'une compagnie dont une équipe prépare XX/CREW se calcule ; les autres
 * commandes de l'équipe sont faites ; une information le dit ; une commande
 * mal écrite refuse toujours la journée. Données fictives ; aucune capture
 * d'écran (le plan est confidentiel). */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

// Ce jour-là, seule SUD vole.
const VOLS_CSV='vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_CREW\n'
  +'SU1,SUD,MOYEN,DEP,12:00,,0,0,100,4\nSU2,SUD,MOYEN,DEP,14:00,,0,0,100,4\n';
const UNITE=lots=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
  st.ateliers=st.ateliers.filter(a=>a.id!=='mo');
  st.ateliers.push({id:'mo',nom:'Montage NORD SUD',service:'prepa',type:'manuel',debut:'06:00',jour:0,personnes:2,pauses:[],lots,regime:{actif:false}});
  st.effectifs={prepa:'impose'};},'');

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=250)=>page.waitForTimeout(ms);
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-csv-'));
 const csv=path.join(dossier,'vols-sud.csv');fs.writeFileSync(csv,VOLS_CSV);
 const resultat=()=>page.evaluate(()=>{const r=Sim.ateliers.resultat;
   return {ok:r.ok,codes:(r.anomalies||[]).map(a=>a.code),lots:(r.lots||[]).filter(l=>l.atelier==='mo').map(l=>l.nom)};});
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(500);
  await nav.aller(page,'v-programme');
  await page.locator('#imp-vols').setInputFiles(csv);
  await page.waitForFunction(()=>document.getElementById('source-label').textContent==='vols-sud.csv');

  // 1. NORD ne vole pas ce jour-là : ses commandes sont absentes, la journée se calcule, SUD est faite.
  await page.evaluate(UNITE,[['NORD/CREW'],['SUD/YC'],['NORD/YC','SUD/CREW']]);await attendre();
  let r=await resultat();
  assert.equal(r.ok,true,'la journée se calcule');
  assert.deepEqual(r.lots,['SUD/YC','SUD/CREW'],'l’équipe fait ses autres commandes');
  assert.ok(r.codes.includes('commande-absente'));
  await nav.aller(page,'at-equipes');
  assert.match(await page.locator('#at-anomalies').textContent(),/Montage NORD SUD : NORD\/CREW, NORD\/YC n’ont aucun vol ce jour-là/);

  // 2. Une compagnie qu'on ne voit nulle part : un avertissement, la journée se calcule.
  await page.evaluate(UNITE,[['NROD/CREW'],['SUD/YC']]);await attendre();
  r=await resultat();
  assert.equal(r.ok,true);
  assert.ok(r.codes.includes('compagnie-inconnue'));
  assert.match(await page.locator('#at-anomalies').textContent(),/compagnie jamais vue : NROD — faute de frappe \?/);

  // 3. Mal écrite : la journée reste refusée.
  await page.evaluate(UNITE,[['NORD/CRWE'],['SUD/YC']]);await attendre();
  r=await resultat();
  assert.equal(r.ok,false);
  assert.deepEqual(r.codes,['lot']);

  assert.deepEqual(errors,[]);
  console.log('commandes-sans-vol-browser : ok — commande absente, compagnie jamais vue, commande mal écrite');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})();

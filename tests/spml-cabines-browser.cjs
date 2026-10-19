/* Banc d'essai, évolution 7 — les repas spéciaux par cabine dans la page
 * (v1) : les colonnes nb_SPML_BC, nb_SPML_PC, nb_SPML_YC lues par l'import du
 * programme ; dans « Réglages de la simulation », les cabines dont chaque
 * service prépare les SPML, rangées avec les cases (ory-ateliers-v1)
 * seulement quand on les règle ; gardées au rechargement et dans « Tout
 * sauvegarder ». Données fictives ; aucune capture d'écran (le plan est
 * confidentiel). */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

// SU1 : des SPML en éco seulement ; SU2 : un en business ; SU3 : nb_SPML seul.
const VOLS_CSV='vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_SPML,nb_SPML_BC,nb_SPML_PC,nb_SPML_YC\n'
  +'SU1,SUD,MOYEN,DEP,10:00,,10,0,100,,0,0,3\nSU2,SUD,MOYEN,DEP,11:00,,10,0,100,,1,0,2\nSU3,SUD,MOYEN,DEP,12:00,,10,0,100,4,,,\n';
const UNITE=()=>{
  Sim.reglages.changer(()=>{const e=Sim.reglages.etat;e.bareme={...e.bareme,cuisine:{'*/SPML':60},prepa:{'*/SPML':60}};},'');
  Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
    for(const [id,service] of [['cu','cuisine'],['pr','prepa']])st.ateliers.push({id,nom:id==='cu'?'Cuisine SPML':'Prépa SPML',service,type:'manuel',debut:'04:00',jour:0,personnes:1,pauses:[],lots:[['SUD/SPML']],regime:{actif:false}});
    st.effectifs={cuisine:'impose',prepa:'impose'};},'');
};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=250)=>page.waitForTimeout(ms);
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-spml-'));
 const csv=path.join(dossier,'vols-spml.csv');fs.writeFileSync(csv,VOLS_CSV);
 const cases=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ory-ateliers-v1')||'null'));
 const minutes=()=>page.evaluate(()=>Object.fromEntries(['cu','pr'].map(id=>[id,Sim.ateliers.resultat.lots.filter(l=>l.atelier===id).reduce((n,l)=>n+(l.hommeMinutes||0),0)])));
 const ligne=()=>page.locator('#rg-sim-spml tr[data-spml-service=cuisine]');
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(500);
  await page.evaluate(UNITE);await attendre();
  await nav.aller(page,'v-programme');
  await page.locator('#imp-vols').setInputFiles(csv);
  await page.waitForFunction(()=>document.getElementById('source-label').textContent==='vols-spml.csv');
  assert.deepEqual(await page.evaluate(()=>Sim.dataCourante.map(v=>[v.id,v.spml,v.spmlParCabine||null])),
    [['SU1',3,{BC:0,PC:0,YC:3}],['SU2',3,{BC:1,PC:0,YC:2}],['SU3',4,null]],'l’import de la page lit le détail ; nb_SPML vide vaut la somme');

  // 1. Par défaut, toutes les cabines : rien d'enregistré, trois vols par service.
  await nav.aller(page,'rg-simulation');
  assert.equal(await ligne().isVisible(),true,'la cuisine prépare une commande SPML');
  assert.match(await page.locator('#rg-sim-spml').innerText(),/2 vols du programme détaillent leurs repas spéciaux par cabine/);
  for(const c of ['BC','PC','YC'])assert.equal(await ligne().locator('[data-spml-cabine='+c+']').isChecked(),true);
  assert.equal('spmlCabines' in (await cases()),false);
  assert.deepEqual(await minutes(),{cu:180,pr:180});

  // 2. La cuisine ne prépare pas les SPML de l'éco : SU1 sort de sa commande ; la prépa ne change pas.
  await ligne().locator('[data-spml-cabine=YC]').uncheck();await attendre();
  assert.deepEqual((await cases()).spmlCabines,{cuisine:['BC','PC']});
  assert.deepEqual(await minutes(),{cu:120,pr:180});

  // 3. Rechargée, le réglage est le même ; dans « Tout sauvegarder » aussi.
  await page.reload();await attendre(600);
  await nav.aller(page,'rg-simulation');
  assert.equal(await ligne().locator('[data-spml-cabine=YC]').isChecked(),false);
  await nav.aller(page,'u-sauvegarde');
  const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#sauvegarde-export').click()]);
  const fichier=path.join(dossier,'sauvegarde.json');await d.saveAs(fichier);
  const sauve=JSON.parse(fs.readFileSync(fichier,'utf8')).contenu['ory-ateliers-v1'];
  assert.deepEqual((typeof sauve==='string'?JSON.parse(sauve):sauve).spmlCabines,{cuisine:['BC','PC']});

  // 4. Toutes les cabines cochées : le défaut, plus rien d'enregistré ; « Annuler » revient.
  // (Le programme importé ne se garde pas au rechargement : on le réimporte.)
  await nav.aller(page,'v-programme');
  await page.locator('#imp-vols').setInputFiles(csv);
  await page.waitForFunction(()=>document.getElementById('source-label').textContent==='vols-spml.csv');
  assert.deepEqual(await minutes(),{cu:120,pr:180});
  await nav.aller(page,'rg-simulation');
  await ligne().locator('[data-spml-cabine=YC]').check();await attendre();
  assert.equal('spmlCabines' in (await cases()),false);
  assert.deepEqual(await minutes(),{cu:180,pr:180});
  await page.evaluate(()=>Sim.ateliers.histoire(false));await attendre();
  assert.deepEqual((await cases()).spmlCabines,{cuisine:['BC','PC']},'annulé');

  assert.deepEqual(errors,[]);
  console.log('spml-cabines-browser : ok — import, réglage par service, sauvegarde');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})();

/* Banc d'essai, évolution 8 — le handling 24 h/24 par vagues dans la page (v1) :
 * les réglages par compagnie de la fiche du handling, rangés avec l'équipe
 * (ory-ateliers-v1) seulement quand on les saisit, gardés au rechargement et
 * dans « Tout sauvegarder ». Données fictives ; aucune capture d'écran (le
 * plan est confidentiel). */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

// SUD part le matin et l'après-midi ; NORD l'après-midi.
const VOLS_CSV='vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC\n'
  +'SU1,SUD,MOYEN,DEP,08:00,,0,0,100\nSU2,SUD,MOYEN,DEP,14:00,,0,0,100\nNO1,NORD,MOYEN,DEP,14:00,,0,0,100\n';
const UNITE=H=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
  st.ateliers.push({id:'mo',nom:'Montage',service:'prepa',type:'manuel',debut:'00:00',jour:-1,personnes:10,pauses:[],lots:[['NORD/YC'],['SUD/YC']],regime:{actif:false}});
  st.ateliers.push({id:'ha',nom:'Quais',service:H,type:'handling',debut:'00:00',jour:0,personnes:0,pauses:[],lots:[],regime:{actif:false},
    durees:{'*':20},allers:{'*':10},retours:{'*':10},simultanes:3,avance:180,handling24h:true});
  st.effectifs={prepa:'impose'};},'');

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=250)=>page.waitForTimeout(ms);
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-vagues-'));
 const csv=path.join(dossier,'vols-vagues.csv');fs.writeFileSync(csv,VOLS_CSV);
 const equipe=()=>page.evaluate(()=>(JSON.parse(localStorage.getItem('ory-ateliers-v1')||'{"ateliers":[]}').ateliers||[]).find(a=>a.id==='ha'));
 const ouvrir=async()=>{await nav.aller(page,'at-equipes');await page.evaluate(()=>{Sim.ateliers.ouvert='ha';Sim.ateliers.rendre();});await attendre();};
 const fiche=()=>page.locator('[data-at="ha"]');
 const vehicules=()=>page.evaluate(()=>Sim.ateliers.resultat.vols.map(x=>[x.id,x.vehicule]));
 const saisir=async(sel,v)=>{const c=fiche().locator(sel);await c.fill(String(v));await c.press('Tab');await attendre();};
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(500);
  const H=await page.evaluate(()=>Sim.ateliers.a.creerHandling());await attendre();
  await page.evaluate(UNITE,H);
  await nav.aller(page,'v-programme');
  await page.locator('#imp-vols').setInputFiles(csv);
  await page.waitForFunction(()=>document.getElementById('source-label').textContent==='vols-vagues.csv');

  // 1. Sans réglage : tout en gros camion, rien d'enregistré.
  await ouvrir();
  const choix=fiche().locator('[data-at-champ=vehicule][data-cie=SUD]');
  assert.equal(await choix.inputValue(),'camion');
  assert.equal(await fiche().locator('[data-at-champ=vl-des]').count(),0,'pas d’heure tant que le choix n’est pas « VL à partir de »');
  assert.equal('vlDes' in (await equipe()),false);
  assert.deepEqual(await vehicules(),[['SU1','camion'],['NO1','camion'],['SU2','camion']]);

  // 2. a. SUD en VL à partir d'une heure : 12:00 proposé, puis 10:00 saisi. Le départ de 08:00 reste en gros camion.
  await choix.selectOption('des');await attendre();
  assert.deepEqual((await equipe()).vlDes,{SUD:'12:00'});
  await saisir('[data-at-champ=vl-des][data-cie=SUD]','10:00');
  assert.deepEqual((await equipe()).vlDes,{SUD:'10:00'});
  assert.equal('vl' in (await equipe()),false);
  assert.deepEqual(await vehicules(),[['SU1','camion'],['NO1','camion'],['SU2','vl']]);
  // Une heure illisible est refusée, sous le champ ; la valeur d'avant reste.
  await saisir('[data-at-champ=vl-des][data-cie=SUD]','midi');
  assert.deepEqual((await equipe()).vlDes,{SUD:'10:00'});
  // VL toute la journée, puis de nouveau à partir d'une heure.
  await fiche().locator('[data-at-champ=vehicule][data-cie=SUD]').selectOption('vl');await attendre();
  assert.deepEqual([(await equipe()).vl,'vlDes' in (await equipe())],[['SUD'],false]);
  assert.deepEqual(await vehicules(),[['SU1','vl'],['NO1','camion'],['SU2','vl']]);
  await fiche().locator('[data-at-champ=vehicule][data-cie=SUD]').selectOption('des');await attendre();
  await saisir('[data-at-champ=vl-des][data-cie=SUD]','10:00');
  assert.deepEqual([(await equipe()).vlDes,'vl' in (await equipe())],[{SUD:'10:00'},false]);

  // 3. Rechargée, tout est là ; dans « Tout sauvegarder » aussi.
  await page.reload();await attendre(600);
  await ouvrir();
  assert.equal(await fiche().locator('[data-at-champ=vehicule][data-cie=SUD]').inputValue(),'des');
  assert.equal(await fiche().locator('[data-at-champ=vl-des][data-cie=SUD]').inputValue(),'10:00');
  await nav.aller(page,'u-sauvegarde');
  const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#sauvegarde-export').click()]);
  const fichier=path.join(dossier,'sauvegarde.json');await d.saveAs(fichier);
  const sauve=JSON.parse(fs.readFileSync(fichier,'utf8')).contenu['ory-ateliers-v1'];
  const ha=(typeof sauve==='string'?JSON.parse(sauve):sauve).ateliers.find(a=>a.id==='ha');
  assert.deepEqual(ha.vlDes,{SUD:'10:00'});

  // 4. De nouveau en gros camion : rien ne reste.
  await ouvrir();
  await fiche().locator('[data-at-champ=vehicule][data-cie=SUD]').selectOption('camion');await attendre();
  assert.deepEqual(['vl' in (await equipe()),'vlDes' in (await equipe())],[false,false]);

  assert.deepEqual(errors,[]);
  console.log('handling-vagues-browser : ok — véhicule selon l’heure, rechargement, sauvegarde');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})();

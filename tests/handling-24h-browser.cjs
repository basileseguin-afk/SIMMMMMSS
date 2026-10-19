/* Banc d'essai, évolution 3 — le handling 24 h/24 dans la page (v1) : la case
 * et les réglages dans la fiche du handling, rangés avec l'équipe
 * (ory-ateliers-v1) seulement quand on les saisit, gardés au rechargement et
 * dans « Tout sauvegarder » ; l'heure_eta du programme ; le bilan des
 * tournées ; la page des départs. Données fictives ; aucune capture d'écran
 * (le plan est confidentiel). */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

// SU1 : l'avion arrive à 07:30 (heure_eta). ES1 : son avion n'a que 30 min d'escale.
const VOLS_CSV='vol_id,compagnie,type_avion,sens,heure_std,heure_sta,heure_eta,nb_BC,nb_PC,nb_YC\n'
  +'NO1,NORD,MOYEN,DEP,10:00,,,0,0,100\nSU1,SUD,MOYEN,DEP,12:00,,07:30,0,0,100\nES1,EST,MOYEN,DEP,10:00,,,0,0,100\n';
const UNITE=H=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
  st.ateliers.push({id:'mo',nom:'Montage',service:'prepa',type:'manuel',debut:'00:00',jour:-1,personnes:10,pauses:[],lots:[['NORD/YC'],['SUD/YC'],['EST/YC']],regime:{actif:false}});
  st.ateliers.push({id:'ha',nom:'Quais',service:H,type:'handling',debut:'00:00',jour:0,personnes:0,pauses:[],lots:[],regime:{actif:false},
    durees:{'*':20},allers:{'*':10},retours:{'*':10},simultanes:3,avance:180});
  st.effectifs={prepa:'impose'};},'');

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=250)=>page.waitForTimeout(ms);
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-h24-'));
 const csv=path.join(dossier,'vols-h24.csv');fs.writeFileSync(csv,VOLS_CSV);
 const equipe=()=>page.evaluate(()=>(JSON.parse(localStorage.getItem('ory-ateliers-v1')||'{"ateliers":[]}').ateliers||[]).find(a=>a.id==='ha'));
 const ouvrir=async()=>{await nav.aller(page,'at-equipes');await page.evaluate(()=>{Sim.ateliers.ouvert='ha';Sim.ateliers.rendre();});await attendre();};
 const fiche=()=>page.locator('[data-at="ha"]');
 const resultat=()=>page.evaluate(()=>{const r=Sim.ateliers.resultat,v=r.ateliers.find(a=>a.id==='ha');
   return {tournees:v.tournees||null,vols:r.vols.map(x=>({id:x.id,limite:x.limite,arrivee:x.arrivee,etat:x.etat,vehicule:x.vehicule,escaleCourte:x.escaleCourte}))};});
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(500);
  const H=await page.evaluate(()=>Sim.ateliers.a.creerHandling());await attendre();
  await page.evaluate(UNITE,H);
  await nav.aller(page,'v-programme');
  await page.locator('#imp-vols').setInputFiles(csv);
  await page.waitForFunction(()=>document.getElementById('source-label').textContent==='vols-h24.csv');
  assert.equal(await page.evaluate(()=>Sim.dataCourante.find(v=>v.id==='SU1').eta),7*60+30,'heure_eta lue par l’import de la page');

  // 1. Désactivé par défaut : la case n'est pas cochée, rien d'enregistré, le handling d'avant.
  await ouvrir();
  const case24=fiche().locator('[data-at-champ=handling24h]');
  assert.equal(await case24.isChecked(),false);
  assert.equal(await fiche().locator('.at-tournees').count(),0,'pas de réglage des tournées');
  assert.equal(await fiche().locator('[data-map=escale]').count(),0);
  assert.equal('handling24h' in (await equipe()),false,'rien d’enregistré tant qu’on n’y touche pas');
  assert.equal((await resultat()).tournees,null);

  // 2. Cochée : rangée avec l'équipe, la journée se joue en tournées.
  await case24.check();await attendre();
  assert.equal((await equipe()).handling24h,true);
  for(const k of ['escale','quaiDepart','vl','margeDepart','camionsVL'])assert.equal(k in (await equipe()),false,k+' : seulement saisi');
  let r=await resultat();
  assert.ok(r.tournees.length>=3,'des tournées');
  assert.deepEqual(r.vols.find(v=>v.id==='SU1').arrivee,7*60+30,'l’ETA donne l’arrivée de l’avion');
  assert.equal(r.vols.find(v=>v.id==='NO1').limite,9*60,'chargé avant départ − 60 min');
  assert.equal(await fiche().locator('.at-tournees [data-cle=margeDepart]').getAttribute('placeholder'),'60');

  // 3. Les réglages : une escale, une compagnie en VL, une marge.
  await fiche().locator('[data-at-champ=temps][data-map=escale][data-cie=EST]').fill('30');await fiche().locator('[data-at-champ=temps][data-map=escale][data-cie=EST]').press('Tab');await attendre();
  await fiche().locator('[data-at-champ=vehicule][data-cie=SUD]').selectOption('vl');await attendre();
  await fiche().locator('[data-at-champ=h24][data-cle=margeDepart]').fill('45');await fiche().locator('[data-at-champ=h24][data-cle=margeDepart]').press('Tab');await attendre();
  const e=await equipe();
  assert.deepEqual([e.escale,e.vl,e.margeDepart],[{EST:30},['SUD'],45]);
  r=await resultat();
  assert.equal(r.vols.find(v=>v.id==='ES1').escaleCourte,true,'30 min d’escale : un échange sur le même avion');
  assert.ok(r.tournees.some(t=>t.echange&&t.charges.includes('ES1')));
  assert.equal(r.vols.find(v=>v.id==='SU1').vehicule,'vl');
  assert.equal(r.vols.find(v=>v.id==='NO1').limite,9*60+15);
  assert.match(await fiche().locator('.at-bilan-tournees').innerText(),/tournées \(\d+ en gros camion, 2 en VL\).*3 vols sur 3 chargés à l’heure/s);

  // 4. Les départs : l'échéance d'un vol est sa limite de chargement.
  await nav.aller(page,'v-departs');
  const ligne=page.locator('#flight-rows tr',{hasText:'NO1'});
  assert.equal((await ligne.locator('.vol-avant').innerText()).trim(),'09:15');
  assert.match(await page.locator('#vols-handling').innerText(),/24 h\/24, en tournées/);

  // 5. Rechargée, la règle est la même ; dans « Tout sauvegarder » aussi.
  await page.reload();await attendre(600);
  await ouvrir();
  assert.equal(await fiche().locator('[data-at-champ=handling24h]').isChecked(),true);
  await nav.aller(page,'u-sauvegarde');
  const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#sauvegarde-export').click()]);
  const fichier=path.join(dossier,'sauvegarde.json');await d.saveAs(fichier);
  const sauve=JSON.parse(fs.readFileSync(fichier,'utf8')).contenu['ory-ateliers-v1'];
  const ha=(typeof sauve==='string'?JSON.parse(sauve):sauve).ateliers.find(a=>a.id==='ha');
  assert.deepEqual([ha.handling24h,ha.escale,ha.vl,ha.margeDepart],[true,{EST:30},['SUD'],45]);

  // 6. Décochée : le handling d'avant, ses réglages gardés pour plus tard ; « Annuler » revient.
  await ouvrir();
  await fiche().locator('[data-at-champ=handling24h]').uncheck();await attendre();
  assert.equal('handling24h' in (await equipe()),false);
  assert.equal((await resultat()).tournees,null);
  assert.deepEqual((await equipe()).escale,{EST:30});
  await page.evaluate(()=>Sim.ateliers.histoire(false));await attendre();
  assert.equal((await equipe()).handling24h,true,'annulé : de nouveau 24 h/24');

  assert.deepEqual(errors,[]);
  console.log('handling-24h-browser : ok — case, réglages, ETA, tournées, départs, sauvegarde');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})();

/* Banc d'essai, évolution 4 — les chauffeurs calculés au plus juste, dans la
 * page (v1) : le choix du mode dans la fiche du handling 24 h/24, ses
 * réglages (rangés avec l'équipe seulement quand on les saisit), le plan
 * calculé lisible comme des créneaux, et sa reprise en créneaux saisis.
 * Données fictives ; aucune capture d'écran (le plan est confidentiel). */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const VOLS_CSV='vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC\n'
  +['08:00','09:00','10:00','11:00','14:00','15:30'].map((h,i)=>'NO'+(i+1)+',NORD,MOYEN,DEP,'+h+',,0,0,100').join('\n')+'\n'
  +'SU1,SUD,MOYEN,DEP,12:00,,0,0,100\n';
const UNITE=H=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
  st.ateliers.push({id:'mo',nom:'Montage',service:'prepa',type:'manuel',debut:'00:00',jour:-1,personnes:10,pauses:[],lots:[['NORD/YC'],['SUD/YC']],regime:{actif:false}});
  st.ateliers.push({id:'ha',nom:'Quais',service:H,type:'handling',debut:'00:00',jour:0,personnes:0,pauses:[],lots:[],regime:{actif:true},
    durees:{'*':20},allers:{'*':10},retours:{'*':10},simultanes:3,avance:180,handling24h:true,vl:['SUD'],
    creneaux:[{de:'05:00',a:'13:00',n:2}]});
  st.effectifs={prepa:'impose'};},'');

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=250)=>page.waitForTimeout(ms);
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-ch-'));
 const csv=path.join(dossier,'vols-ch.csv');fs.writeFileSync(csv,VOLS_CSV);
 const equipe=()=>page.evaluate(()=>(JSON.parse(localStorage.getItem('ory-ateliers-v1')||'{"ateliers":[]}').ateliers||[]).find(a=>a.id==='ha'));
 const ouvrir=async()=>{await nav.aller(page,'at-equipes');await page.evaluate(()=>{Sim.ateliers.ouvert='ha';Sim.ateliers.rendre();});await attendre();};
 const fiche=()=>page.locator('[data-at="ha"]');
 const plan=()=>page.evaluate(()=>{const v=Sim.ateliers.resultat.ateliers.find(a=>a.id==='ha');return v.planChauffeurs||null;});
 const saisir=async(sel,val)=>{const l=fiche().locator(sel);await l.fill(val);await l.press('Tab');await attendre();};
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(500);
  const H=await page.evaluate(()=>Sim.ateliers.a.creerHandling());await attendre();
  await page.evaluate(UNITE,H);
  await nav.aller(page,'v-programme');
  await page.locator('#imp-vols').setInputFiles(csv);
  await page.waitForFunction(()=>document.getElementById('source-label').textContent==='vols-ch.csv');

  // 1. Par défaut, les créneaux saisis : rien d'enregistré, pas de plan.
  await ouvrir();
  const mode=fiche().locator('[data-at-champ=chauffeurs-mode]');
  assert.equal(await mode.inputValue(),'saisis');
  assert.equal(await fiche().locator('[data-at-champ=creneau-de]').count(),1,'les créneaux saisis sont là');
  assert.deepEqual((await equipe()).chauffeurs,{long:2,court:1});
  assert.equal(await plan(),null);

  // 2. Calculés : le plan se lit comme des créneaux, avec sa borne basse ; les créneaux saisis restent, de côté.
  await mode.selectOption('calcules');await attendre();
  assert.deepEqual((await equipe()).chauffeurs,{long:2,court:1,mode:'calcules'});
  let p=await plan();
  assert.ok(p&&p.total>=2,'au moins un gros camion et un VL');
  assert.ok(p.borneBasse.total<=p.total);
  assert.deepEqual(await page.evaluate(()=>Sim.ateliers.resultat.vols.filter(v=>v.cause==='chauffeur').length),0,'aucun vol sans chauffeur');
  const lignes=fiche().locator('.at-plan tbody tr');
  assert.equal(await lignes.count(),p.vacations.length);
  assert.match(await lignes.first().innerText(),/gros camion\s+\d\d:\d\d\s+\d\d:\d\d\s+\d+/);
  assert.match(await fiche().locator('.at-bilan-plan').innerText(),/chauffeurs? \(\d+ en gros camion, \d+ en VL\).*borne basse/s);
  assert.equal(await fiche().locator('[data-at-champ=creneau-de]').count(),0,'les créneaux ne s’affichent plus');
  assert.equal((await equipe()).creneaux.length,1,'mais restent enregistrés');

  // 3. Les réglages : une heure de début toutes les 60 min, puis un roulement ; une heure illisible est refusée.
  await saisir('[data-at-champ=ch-nombre][data-cle=pasDebut]','60');
  assert.equal((await equipe()).chauffeurs.pasDebut,60);
  assert.ok((await plan()).vacations.every(v=>v.de%60===0));
  await saisir('[data-at-champ=ch-debuts]','05:00, 13:00 21:00');
  assert.deepEqual((await equipe()).chauffeurs.debutsPossibles,['05:00','13:00','21:00']);
  assert.ok((await plan()).vacations.every(v=>['05:00','13:00','21:00'].includes(v.debut)));
  await saisir('[data-at-champ=ch-debuts]','midi');
  assert.deepEqual((await equipe()).chauffeurs.debutsPossibles,['05:00','13:00','21:00'],'refusé : la liste reste');
  await saisir('[data-at-champ=ch-debuts]','');
  assert.equal('debutsPossibles' in (await equipe()).chauffeurs,false,'vidé : toutes les 60 min');
  await fiche().locator('[data-at-champ=ch-selon]').check();await attendre();
  assert.equal((await equipe()).chauffeurs.selonPreparation,true);

  // 4. Rechargée, le mode est le même ; dans « Tout sauvegarder » aussi.
  await page.reload();await attendre(600);
  await ouvrir();
  assert.equal(await fiche().locator('[data-at-champ=chauffeurs-mode]').inputValue(),'calcules');
  await nav.aller(page,'u-sauvegarde');
  const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#sauvegarde-export').click()]);
  const fichier=path.join(dossier,'sauvegarde.json');await d.saveAs(fichier);
  const sauve=JSON.parse(fs.readFileSync(fichier,'utf8')).contenu['ory-ateliers-v1'];
  const ha=(typeof sauve==='string'?JSON.parse(sauve):sauve).ateliers.find(a=>a.id==='ha');
  assert.deepEqual(ha.chauffeurs,{long:2,court:1,mode:'calcules',selonPreparation:true,pasDebut:60});

  // 5. Le plan repris en créneaux saisis : le même nombre de chauffeurs ; « Annuler » revient au calcul.
  await ouvrir();
  p=await plan();
  await fiche().locator('[data-at-action=plan-en-creneaux]').click();await attendre();
  const e=await equipe();
  assert.equal('mode' in e.chauffeurs,false);
  assert.equal(e.creneaux.reduce((n,c)=>n+c.n,0),p.total);
  assert.ok(e.creneaux.some(c=>c.type==='vl'),'les VL gardent leur véhicule');
  assert.equal(await fiche().locator('[data-at-champ=creneau-de]').count(),e.creneaux.length);
  await page.evaluate(()=>Sim.ateliers.histoire(false));await attendre();
  assert.equal((await equipe()).chauffeurs.mode,'calcules','annulé : de nouveau calculés');

  assert.deepEqual(errors,[]);
  console.log('chauffeurs-calcules-browser : ok — mode, réglages, plan, sauvegarde, reprise en créneaux');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})();

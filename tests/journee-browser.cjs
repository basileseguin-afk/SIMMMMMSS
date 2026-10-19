/* Le banc d'essai joue la journée de la page (évolution 1, docs/BANC_ESSAI.md).
 * Pour la démo, puis pour une unité fictive, les fichiers que donne la page —
 * « Tout sauvegarder », et le programme de vols exporté ou importé — rejoués
 * par outils/simuler-journee.cjs rendent la journée de la page, au champ près.
 * La sauvegarde fictive, restaurée dans un navigateur vide, redonne aussi la
 * même journée. Données fictives ; aucune capture d'écran (le plan est
 * confidentiel). */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const OUTIL=path.join(__dirname,'..','outils','simuler-journee.cjs');
// Un programme fictif : quatre compagnies, seize départs, six retours.
const VOLS_CSV=['vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_CREW,nb_SPML',
  'NO101,NORD,GROS,DEP,06:10,,24,30,180,10,8','SU201,SUD,MOYEN,DEP,06:35,,12,0,140,6,3','ES301,EST,PETIT,DEP,06:50,,0,0,150,4,0',
  'OU401,OUEST,GROS,DEP,07:20,,20,28,200,9,6','ES303,EST,PETIT,DEP,08:05,,0,0,148,4,1','SU203,SUD,MOYEN,DEP,09:15,,10,0,130,6,2',
  'NO103,NORD,GROS,DEP,10:40,,26,32,190,10,9','ES305,EST,PETIT,DEP,11:30,,0,0,152,4,0','OU403,OUEST,GROS,DEP,13:05,,18,24,210,9,5',
  'SU205,SUD,MOYEN,DEP,14:20,,11,0,135,6,2','ES307,EST,PETIT,DEP,15:10,,0,0,149,4,2','NO105,NORD,GROS,DEP,16:45,,22,28,185,10,7',
  'SU207,SUD,MOYEN,DEP,18:00,,12,0,138,6,3','OU405,OUEST,GROS,DEP,19:30,,20,26,205,9,6','ES309,EST,PETIT,DEP,20:15,,0,0,151,4,1',
  'NO107,NORD,GROS,DEP,22:30,,25,30,195,10,8','NO100,NORD,GROS,RET,,05:40,24,30,180,0,0','ES300,EST,PETIT,RET,,07:55,0,0,150,0,0',
  'SU200,SUD,MOYEN,RET,,10:20,12,0,140,0,0','OU400,OUEST,GROS,RET,,12:45,20,28,200,0,0','NO102,NORD,GROS,RET,,15:30,26,32,190,0,0',
  'ES302,EST,PETIT,RET,,18:40,0,0,148,0,0'].join('\n')+'\n';

// L'unité fictive : toutes les sortes d'équipes, une salle annexe, un service renommé, des liens et un barème retouchés.
const UNITE=()=>{const A=Sim.ateliers;A.changer(()=>{const st=A.state;
  st.ajoutees=[{cie:'ZEN',cabine:'YC'}];st.exclues=['EST/SPML'];
  st.categories={armement:[{id:'ARM',nom:'Armement',minutes:{'*':12,NORD:18}}]};
  const t=(id,nom,service,debut,personnes,lots,x)=>({id,nom,service,type:'manuel',debut,jour:0,personnes,pauses:[],lots,regime:{actif:true},...x});
  st.ateliers.push(
    {id:'leg',nom:'Légumerie',service:'decontam',type:'dispo',debut:'18:00',jour:-1,personnes:2,pauses:[],lots:[],regime:{actif:true},permanent:true},
    {id:'mag',nom:'Magasin',service:'magasin',type:'dispo',debut:'02:00',jour:0,personnes:1,pauses:[],lots:[],regime:{actif:true},permanent:true,ouverture:{de:'02:30',a:'14:00'}},
    t('cu1','Cuisine nuit','cuisine','20:00',3,[['NORD/BC'],['NORD/PC'],['SUD/BC'],['OUEST/BC'],['OUEST/PC']],{jour:-1}),
    t('cu2','Cuisine équipage','cuisine','21:00',2,[['NORD/CREW','NORD/SPML'],['SUD/SPML'],['OUEST/CREW','OUEST/SPML']],{jour:-1,pauses:[{de:'01:00',a:'01:20'}]}),
    t('pr','Prépa','preparation','00:30',3,[['NORD/BC','NORD/PC','OUEST/BC']],{regime:{actif:false}}),
    t('mo','Montage','prepa','03:00',8,[['NORD/YC','NORD/BC','NORD/PC'],['SUD/YC','SUD/BC'],['OUEST/YC','OUEST/BC','OUEST/PC'],['NORD/CREW','NORD/SPML','OUEST/CREW','OUEST/SPML','SUD/SPML']],{fusion:'preparation',regime:{actif:true,presence:600}}),
    t('mo2','Montage EST','prepa','06:00',2,[['EST/CREW','SUD/CREW']],{condition:{cie:'EST',seuil:20,mesure:'vols',sinon:'mo'}}),
    {id:'rb',nom:'Robot',service:'prepa',type:'robot',debut:'03:00',jour:0,personnes:2,pauses:[],lots:[['EST/YC']],regime:{actif:true},debit:300,personnesMin:1,arretsLigne:[{de:'04:00',a:'04:20'}]},
    t('ar','Armement','armement','03:00',2,[['NORD/@ARM','SUD/@ARM'],['EST/@ARM','OUEST/@ARM']]),
    {id:'do',nom:'Dotation',service:'dotation',type:'appui',debut:'05:00',jour:0,personnes:2,pauses:[],lots:[],regime:{actif:true},minutesVol:{'*':6,NORD:10},effectif:'calcule'},
    {id:'h',nom:'Quais',service:'quais',type:'handling',debut:'04:00',jour:0,personnes:4,pauses:[],lots:[],regime:{actif:true},
      durees:{'*':25,NORD:40,OUEST:40},longs:['NORD','OUEST'],chauffeurs:{long:2,court:1},creneaux:[{de:'03:30',a:'12:00',n:3},{de:'12:00',a:'23:30',n:2}],
      camions:2,volsParCamion:2,allers:{'*':15,NORD:20},retours:{'*':15},avance:180,compagnies:[],simultanes:1},
    {id:'pl1',nom:'Plonge matin',service:'plonge',type:'lavage',debut:'05:00',jour:0,personnes:3,pauses:[],lots:[],regime:{actif:true},parVol:true,durees:{'*':30,NORD:45},
      tunnels:[{nom:'T1',debit:300,personnes:1,actif:true},{nom:'T2',debit:300,personnes:1,actif:true,vitesse:1.5}]},
    {id:'pl2',nom:'Plonge soir',service:'plonge',type:'lavage',debut:'13:00',jour:0,personnes:2,pauses:[],lots:[],regime:{actif:true},parVol:true,durees:{'*':30,NORD:45},
      tunnels:[{nom:'T1',debit:300,personnes:1,actif:true}]});
  st.effectifs={cuisine:'calcule',prepa:'impose',preparation:'fixe'};
  st.materiel={...st.materiel,actif:true,retours:'j1',delaiRetour:30,stockInitial:0};
  OrlyParcours.integrerArmement(st,['armement'],['quais']);},'');
  const id=Sim.editor.nouveauService('Montage bis','prepa');
  A.changer(()=>{A.state.ateliers.push({id:'mob',nom:'Montage bis',service:id,type:'manuel',debut:'04:00',jour:0,personnes:3,pauses:[],lots:[['ZEN/YC']],regime:{actif:true}});},'');
  Sim.editor.change(()=>{Sim.editor.state.zones.find(z=>z.id==='cuisine').nom='CUISINE FROIDE';},'');
  Sim.flows.change(()=>{const f=Sim.flows.state.flows;f[0].enabled=false;
    f.push({id:'lien-fictif',type:'runner',from:JSON.stringify(['magasin',null]),to:JSON.stringify(['dotation',null]),enabled:true,label:'navette'});},'');
  Sim.reglages.changer(()=>{const e=Sim.reglages.etat;e.rendement=0.9;e.bareme.prepa={...e.bareme.prepa,'NORD/YC':80};e.regime.presence=450;},'');
};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=300)=>page.waitForTimeout(ms);
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-journee-'));
 const telecharger=async(sel,nom)=>{const [d]=await Promise.all([page.waitForEvent('download'),page.locator(sel).click()]);
   const f=path.join(dossier,nom);await d.saveAs(f);return f;};
 // La journée de la page, une fois l'effectif calculé reporté dans les cases (il l'est au premier calcul).
 const stabiliser=()=>page.evaluate(()=>{Sim.ateliers.calculer();Sim.ateliers.calculer();});
 const journeeDeLaPage=async()=>JSON.parse(await page.evaluate(()=>JSON.stringify(Sim.ateliers.calculer())));
 const outil=(...f)=>JSON.parse(execFileSync(process.execPath,[OUTIL,...f],{encoding:'utf8',maxBuffer:256*1024*1024}));
 const csv=path.join(dossier,'vols-fictifs.csv');fs.writeFileSync(csv,VOLS_CSV);
 const url=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
 try{
  // 1. La démo : un navigateur neuf, ses vols d'exemple exportés.
  await page.goto(url);await attendre();await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(600);
  await stabiliser();
  await nav.aller(page,'u-sauvegarde');const svDemo=await telecharger('#sauvegarde-export','demo-sauvegarde.json');
  await nav.aller(page,'v-programme');const volsDemo=await telecharger('#exp-vols','demo-vols.xlsx');
  const demo=await journeeDeLaPage();
  const sortieDemo=outil(svDemo,volsDemo);
  assert.equal(sortieDemo.journee.departs,12);
  assert.deepStrictEqual(sortieDemo.resultat,demo,'la démo : l’outil rend la journée de la page');

  // 2. Une unité fictive, rechargée (ce qui se range à l'ouverture est fait), ses vols importés.
  await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(400);
  await page.evaluate(UNITE);await page.reload();await attendre(600);
  await nav.aller(page,'v-programme');
  await page.locator('#imp-vols').setInputFiles(csv);
  await page.waitForFunction(()=>document.getElementById('source-label').textContent==='vols-fictifs.csv');
  await stabiliser();
  await nav.aller(page,'u-sauvegarde');const sv=await telecharger('#sauvegarde-export','fictive-sauvegarde.json');
  const fictive=await journeeDeLaPage();
  assert.ok(fictive.ok&&fictive.lots.length>40,'une journée fournie');
  assert.ok(fictive.lots.some(l=>l.handling&&l.aHeure)&&fictive.lots.some(l=>l.retourVol),'des vols chargés, des retours lavés');
  const sortie=outil(sv,csv);
  assert.deepStrictEqual(sortie.resultat,fictive,'l’unité fictive : l’outil rend la journée de la page');
  // Ce que l'outil ajoute pour le banc, chaque équipe le porte déjà dans la page.
  const mo=sortie.resultat.ateliers.find(a=>a.id==='mo');
  assert.deepEqual([mo.service,mo.jour,mo.debutPoste,mo.presence],['prepa',0,180,600]);

  // 3. Restaurée dans un navigateur vide, la sauvegarde redonne la même journée.
  await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(400);
  await nav.aller(page,'u-sauvegarde');
  await page.locator('#sauvegarde-import').setInputFiles(sv);
  const recharge=page.waitForEvent('load');
  await nav.repondre(page);await recharge;
  await page.waitForLoadState('load');await attendre(600);
  await nav.aller(page,'v-programme');
  await page.locator('#imp-vols').setInputFiles(csv);
  await page.waitForFunction(()=>document.getElementById('source-label').textContent==='vols-fictifs.csv');
  await stabiliser();
  assert.deepStrictEqual(await journeeDeLaPage(),sortie.resultat,'restaurée : la même journée');

  assert.deepEqual(errors,[]);
  console.log('journee-browser : ok — la démo et une unité fictive, l’outil rend la journée de la page');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})();

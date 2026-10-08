/* « J'ai bien paramétré la simulation : ne change rien, toutes les valeurs
 * doivent être les mêmes » (retour d'usage du 08/10, avant la refonte de
 * l'interface). Le garde-fou de la refonte :
 *   1. un état complet, chargé, puis parcouru page par page — le plan ouvert
 *      en édition puis refermé sans rien toucher, le thème changé — garde
 *      toutes ses clés du navigateur identiques, à l'octet près, après
 *      rechargement (seules les préférences d'affichage peuvent bouger) ;
 *   2. la journée calculée donne les mêmes nombres, relevés avant la refonte.
 * v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

// Les préférences d'affichage : la dernière page ouverte, le service choisi,
// le sens des diagrammes, le thème… Elles ne sont pas des données de l'unité.
const PREFERENCES=/^(ory-v2:)?(ory-menu-pages(-vues)?|ory-service-ouvert|ory-graphes-sens|ory-demarrage-en-cours|ory-ui-.*)$/;

// La journée de l'unité type ci-dessous, relevée le 08/10 sur la version
// d'avant la refonte (commit bf9299c) : la refonte ne doit pas la changer.
const ATTENDU=require('./donnees-intactes.attendu.json');

const UNITE_TYPE=()=>{const A=Sim.ateliers;A.changer(()=>{const st=A.state;
  st.ajoutees=[{cie:'EZY',cabine:'YC'},{cie:'RAM',cabine:'YC'}];
  st.categories={armement:[{id:'ARM',nom:'Armement',minutes:{'*':10,AF:15}}]};
  const t=(id,nom,service,debut,personnes,lots,x)=>({id,nom,service,type:'manuel',debut,jour:0,personnes,pauses:[],lots,regime:{actif:true},...x});
  st.ateliers.push(
    {id:'leg',nom:'Légumerie',service:'decontam',type:'dispo',debut:'05:00',jour:-1,personnes:2,pauses:[],lots:[],regime:{actif:true},permanent:true},
    t('cu','Cuisine','cuisine','03:00',4,[['AF/BC','AF/PC'],['TX/BC','FWI/BC','CRL/BC','FBU/BC']],{jour:-1}),
    t('pr','Prépa','preparation','04:00',3,[['AF/BC','AF/PC','TX/BC']]),
    t('mo','Montage','prepa','04:30',5,[['AF/YC','AF/BC','AF/PC','TX/BC','TX/YC','EZY/YC','RAM/YC']],{fusion:'preparation'}),
    t('mo2','Montage 2','prepa','05:00',3,[['FWI/YC','CRL/YC','FBU/YC','FWI/BC','CRL/BC','FBU/BC']],{pauses:[{de:'08:00',a:'08:15'}]}),
    t('ar','Armement','armement','04:00',2,[['AF/@ARM','TX/@ARM','EZY/@ARM'],['FWI/@ARM','CRL/@ARM']]),
    {id:'h',nom:'Quais',service:'quais',type:'handling',debut:'04:00',jour:0,personnes:3,pauses:[],lots:[],regime:{actif:true},durees:{'*':25},compagnies:[]},
    {id:'pl',nom:'Plonge',service:'plonge',type:'lavage',debut:'06:00',jour:0,personnes:3,pauses:[],lots:[],regime:{actif:true},parVol:true,durees:{'*':30},tunnels:[{nom:'T1',debit:300,personnes:1,actif:true}]});
  st.effectifs={prepa:'impose'};
  OrlyParcours.integrerArmement(st,['armement'],['quais']);},'');};

// Toutes les clés du navigateur (pour la v2, son tiroir), préférences d'affichage mises à part.
const CLES=()=>{const out={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);out[k]=localStorage.getItem(k);}return out;};
// La journée : ce que les Résultats montrent, réduit à ses nombres.
const JOURNEE=()=>{const r=Sim.ateliers.resultat,arrondi=x=>x==null?null:Math.round(x*1000)/1000;
  return {indicateurs:Object.fromEntries(Object.entries(r.indicateurs||{}).filter(([,v])=>typeof v!=='object').map(([k,v])=>[k,typeof v==='number'?arrondi(v):v])),
    lots:r.lots.length,debuts:arrondi(r.lots.reduce((n,l)=>n+(l.debut||0),0)),fins:arrondi(r.lots.reduce((n,l)=>n+(l.fin||0),0)),
    hommeMinutes:arrondi(r.lots.reduce((n,l)=>n+(l.hommeMinutes||0),0)),
    classes:r.classes.length,anomalies:[...new Set(r.anomalies.map(a=>a.code))].sort()};};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=300)=>page.waitForTimeout(ms);
 const releve={};
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   await page.evaluate(UNITE_TYPE);
   // Rechargée : ce qui se range au chargement (migrations) est fait une fois pour toutes.
   await page.reload();await attendre(600);
   const filtre=o=>Object.fromEntries(Object.entries(o).filter(([k])=>!PREFERENCES.test(k)));
   const avant=filtre(await page.evaluate(CLES));
   assert.ok(Object.keys(avant).some(k=>/ory-ateliers-v1$/.test(k)),version+' : l’état est enregistré');
   const journee=await page.evaluate(JOURNEE);
   releve[version]=journee;

   // Le tour : chaque page, l'accueil, le plan en édition puis refermé, le thème.
   const pages=await page.evaluate(()=>OrlyOnglets.PARTIES.flatMap(p=>p.pages.map(x=>x.id)));
   for(const id of pages){await nav.aller(page,id);await attendre(120);}
   await nav.accueil(page);
   await nav.aller(page,'j-plan');
   const edition=page.locator('#btn-edit');
   if(await edition.count()&&await edition.isVisible()){await edition.click();await attendre();await page.locator('#edit-done').click();await attendre();}
   const theme=page.locator('[data-ui-theme]');
   if(await theme.count()){await theme.first().click();await attendre();}
   await page.reload();await attendre(600);

   const apres=filtre(await page.evaluate(CLES));
   assert.deepEqual(Object.keys(apres).sort(),Object.keys(avant).sort(),version+' : les mêmes clés');
   for(const k of Object.keys(avant))assert.equal(apres[k],avant[k],version+' : « '+k+' » a changé');
   assert.deepEqual(await page.evaluate(JOURNEE),journee,version+' : la journée calculée est la même après le tour');
   if(ATTENDU[version])assert.deepEqual(journee,ATTENDU[version],version+' : la journée relevée avant la refonte');
   assert.deepEqual(errors,[],version+' : '+errors.join(' | '));
  }
  if(process.env.RELEVER)console.log(JSON.stringify(releve,null,1));
  console.log('donnees-intactes-browser : ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

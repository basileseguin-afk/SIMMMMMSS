/* Banc d'essai, correction 9 — dans la Synthèse (v1), les heures sup d'une
 * plonge comptent seulement les personnes des tunnels qui finissent un vol
 * après sa présence (heuresSupPersonnes). Données fictives ; aucune capture
 * d'écran (le plan est confidentiel). */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

// Deux retours, à la plonge à 14:40 et 15:10 : lavés en 90 min, ils finissent 10 et 40 min après 16:00.
const VOLS_CSV='vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC\n'
  +'NO1,NORD,MOYEN,DEP,12:00,,0,0,100\nR1,NORD,MOYEN,RET,,14:10,0,0,100\nR2,NORD,MOYEN,RET,,14:40,0,0,100\n';
// La plonge : 08:00 à 16:00, 9 personnes, trois tunnels de 3.
const UNITE=()=>{
  Sim.reglages.changer(()=>{const e=Sim.reglages.etat;e.regime={seuils:[],presence:480};e.heuresSup={actif:true,plafond:180};},'');
  Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;st.materiel.actif=false;st.materiel.retours='programme';st.materiel.delaiRetour=30;
    st.ateliers=st.ateliers.filter(a=>a.service!=='plonge');
    st.ateliers.push({id:'pl',nom:'Plonge jour',service:'plonge',type:'lavage',debut:'08:00',jour:0,personnes:9,pauses:[],lots:[],regime:{actif:true,presence:480},
      plafond:0,parVol:true,durees:{'*':90},tunnels:['T1','T2','T3'].map(nom=>({nom,debit:300,personnes:3,actif:true}))});},'');
};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=250)=>page.waitForTimeout(ms);
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-hsp-'));
 const csv=path.join(dossier,'vols-hsp.csv');fs.writeFileSync(csv,VOLS_CSV);
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(500);
  await page.evaluate(UNITE);await attendre();
  await nav.aller(page,'v-programme');
  await page.locator('#imp-vols').setInputFiles(csv);
  await page.waitForFunction(()=>document.getElementById('source-label').textContent==='vols-hsp.csv');
  assert.deepEqual(await page.evaluate(()=>{const v=Sim.ateliers.resultat.ateliers.find(a=>a.id==='pl');return [v.heuresSup,v.heuresSupPersonnes];}),[40,150]);

  // La Synthèse : 2 h 30 pour la plonge (40 × 3 + 10 × 3), pas 9 × 40 min.
  await nav.aller(page,'j-chiffres');
  const ligne=page.locator('#bilan-heures-sup tr[data-hs-service=plonge]');
  assert.match(await ligne.textContent(),/2 h 30/);
  assert.match(await ligne.textContent(),/Plonge jour : 2 h 30 \(les personnes des tunnels qui finissent un vol ; la dernière part 40 min après sa présence\)/);
  assert.doesNotMatch(await ligne.textContent(),/9 pers\./);

  assert.deepEqual(errors,[]);
  console.log('heures-sup-personnes-browser : ok — la Synthèse compte les personnes restées');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})();

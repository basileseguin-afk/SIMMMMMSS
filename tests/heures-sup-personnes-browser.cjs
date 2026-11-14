/* Banc d'essai, correction 9, puis évolution 18 — dans « Détails » (v1), une
 * plonge par vol ne fait plus d'heures sup : le vol en cours à la fin de sa
 * présence s'arrête (personne pour le reprendre), avec sa durée restante.
 * Avant l'évolution 18, les personnes des tunnels qui finissaient un vol
 * restaient (heuresSupPersonnes : 40 × 3 + 10 × 3 = 150 min, « 2 h 30 »).
 * Données fictives ; aucune capture d'écran (le plan est confidentiel). */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

// Deux retours, à la plonge à 14:40 et 15:10 : lavés en 90 min, ils finiraient 10 et 40 min après 16:00.
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
  assert.deepEqual(await page.evaluate(()=>{const v=Sim.ateliers.resultat.ateliers.find(a=>a.id==='pl');return [v.heuresSup,v.heuresSupPersonnes];}),[0,0]);
  // Chaque vol s'arrête à 16:00 dans son tunnel : 80 et 50 min lavées, 10 et 40 restent, pour le lendemain.
  assert.deepEqual(await page.evaluate(()=>Sim.ateliers.resultat.lots.filter(l=>l.retourVol).map(l=>[l.vol,l.tunnel,l.fin,l.fait,l.reste])),[['R1',1,null,80,10],['R2',2,null,50,40]]);
  assert.deepEqual(await page.evaluate(()=>Sim.ateliers.resultat.saleFinal.map(x=>[x.vol,x.reste])),[['R1',10],['R2',40]]);

  // « Détails » (la Synthèse jusqu'à l'évolution 15 b) : plus de ligne d'heures sup pour la plonge.
  await nav.aller(page,'j-details');
  await page.waitForSelector('#bilan-heures-sup');
  assert.equal(await page.locator('#bilan-heures-sup tr[data-hs-service=plonge]').count(),0);
  assert.match(await page.locator('#bilan-heures-sup').textContent(),/Aucune : chaque équipe finit dans sa présence\./);

  assert.deepEqual(errors,[]);
  console.log('heures-sup-personnes-browser : ok — une plonge par vol ne fait plus d’heures sup ; le vol en cours s’arrête, avec sa durée restante');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})();

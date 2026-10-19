/* Banc d'essai, évolution 2 — les heures supplémentaires dans la page (v1) :
 * la case et le plafond dans « Réglages de la simulation », rangés avec le
 * barème (ory-modele-v1), gardés au rechargement et dans « Tout sauvegarder » ;
 * dans la Synthèse, les heures sup par service (personnes × heures) et par
 * équipe ; désactivées, rien ne se montre. Données fictives ; aucune capture
 * d'écran (le plan est confidentiel). */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const VOLS_CSV='vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC\n'
  +'NO1,NORD,MOYEN,DEP,12:00,,0,0,100\nNO2,NORD,MOYEN,DEP,12:10,,0,0,100\nNO3,NORD,MOYEN,DEP,12:20,,0,0,100\n';
// Une seule personne au montage, 2 h 20 de présence, pour trois vols : elle déborde.
const UNITE=()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
  st.ateliers.push({id:'mo',nom:'Montage NORD',service:'prepa',type:'manuel',debut:'05:00',jour:0,personnes:1,pauses:[],lots:[['NORD/YC']],regime:{actif:true,presence:140}});
  st.effectifs={prepa:'impose'};},'');

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=250)=>page.waitForTimeout(ms);
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-hs-'));
 const csv=path.join(dossier,'vols-hs.csv');fs.writeFileSync(csv,VOLS_CSV);
 const modele=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ory-modele-v1')||'null'));
 const sup=()=>page.evaluate(()=>Object.fromEntries(Sim.ateliers.resultat.ateliers.map(a=>[a.id,a.heuresSup])));
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(500);
  await page.evaluate(UNITE);
  await nav.aller(page,'v-programme');
  await page.locator('#imp-vols').setInputFiles(csv);
  await page.waitForFunction(()=>document.getElementById('source-label').textContent==='vols-hs.csv');

  // 1. Désactivées par défaut : la case n'est pas cochée, rien dans la Synthèse.
  await nav.aller(page,'rg-simulation');
  const caseHS=page.locator('#rg-sim-heures-sup [data-hs-actif]'),plafond=page.locator('#rg-sim-heures-sup [data-hs-plafond]');
  assert.equal(await caseHS.isVisible(),true,'le réglage est dans les réglages de la simulation');
  assert.equal(await caseHS.isChecked(),false);
  assert.equal(await plafond.isDisabled(),true);
  assert.equal(await plafond.inputValue(),'3','3 h par défaut');
  assert.equal(await page.evaluate(()=>!!document.getElementById('bilan-heures-sup')),false);
  assert.deepEqual(await sup(),{mo:0});
  assert.equal(((await modele())||{}).heuresSup,undefined,'rien d’enregistré tant qu’on n’y touche pas');

  // 2. Cochée : rangée avec le barème, la journée se recalcule.
  await caseHS.check();await attendre();
  assert.deepEqual((await modele()).heuresSup,{actif:true,plafond:180});
  const avec=await sup();
  assert.ok(avec.mo>0&&avec.mo<=180,'le montage reste en heures sup : '+avec.mo);
  assert.equal(await page.evaluate(()=>Sim.ateliers.resultat.indicateurs.pasFinies),0,'et finit sa commande');

  // 3. Le plafond, en heures ; hors bornes, refusé sous le champ.
  await plafond.fill('1');await plafond.press('Tab');await attendre();
  assert.equal((await modele()).heuresSup.plafond,60);
  assert.deepEqual(await sup(),{mo:60},'le plafond coupe');
  assert.equal(await page.evaluate(()=>Sim.ateliers.resultat.indicateurs.pasFinies),1);
  await plafond.fill('13');await plafond.press('Tab');await attendre();
  assert.equal((await modele()).heuresSup.plafond,60,'13 h : refusé');
  await page.locator('#rg-sim-heures-sup [data-hs-plafond]').fill('3');await page.locator('#rg-sim-heures-sup [data-hs-plafond]').press('Tab');await attendre();
  assert.equal((await modele()).heuresSup.plafond,180);

  // 4. La Synthèse : par service (personnes × heures) et par équipe.
  await nav.aller(page,'j-chiffres');
  const bilan=page.locator('#bilan-heures-sup');
  assert.equal(await bilan.isVisible(),true);
  const dl=await page.evaluate(()=>{const a=Sim.ateliers.resultat.ateliers.find(x=>x.id==='mo');return MoteurProduction.dureeLisible(a.personnes*a.heuresSup);});
  const ligne=bilan.locator('tr[data-hs-service=prepa]');
  assert.match(await ligne.textContent(),new RegExp('Montage.*'+dl.replace(/ /g,'\\s')));
  assert.match(await ligne.textContent(),/Montage NORD : 1 pers\. ×/);

  // 5. Rechargée, la règle est la même ; dans « Tout sauvegarder » aussi.
  await page.reload();await attendre(600);
  await nav.aller(page,'rg-simulation');
  assert.equal(await page.locator('#rg-sim-heures-sup [data-hs-actif]').isChecked(),true);
  await nav.aller(page,'u-sauvegarde');
  const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#sauvegarde-export').click()]);
  const fichier=path.join(dossier,'sauvegarde.json');await d.saveAs(fichier);
  assert.deepEqual(JSON.parse(fs.readFileSync(fichier,'utf8')).contenu['ory-modele-v1'].heuresSup,{actif:true,plafond:180});

  // 6. Décochée : plus d'heures sup, plus rien dans la Synthèse ; « Annuler » revient.
  await nav.aller(page,'rg-simulation');
  await page.locator('#rg-sim-heures-sup [data-hs-actif]').uncheck();await attendre();
  assert.deepEqual(await sup(),{mo:0});
  assert.equal(await page.evaluate(()=>!!document.getElementById('bilan-heures-sup')),false);
  await page.evaluate(()=>Sim.reglages.histoire(false));await attendre();
  assert.equal(await page.locator('#rg-sim-heures-sup [data-hs-actif]').isChecked(),true,'annulé : de nouveau cochée');

  assert.deepEqual(errors,[]);
  console.log('heures-sup-browser : ok — réglage, enregistrement, synthèse par service et par équipe');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})();

/* Banc d'essai, évolution 5 — les renforts dans la page (v1) : la case et ses
 * réglages dans « Réglages de la simulation », rangés avec le barème
 * (ory-modele-v1) ; qui peut aider qui, rangé avec les cases (ory-ateliers-v1,
 * `polyvalence`) ; les postes de travail dans la fiche d'une équipe ; le
 * tableau des renforts dans la Synthèse ; gardés au rechargement et dans
 * « Tout sauvegarder ». Données fictives ; aucune capture d'écran (le plan est
 * confidentiel). */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const VOLS_CSV='vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC\n'
  +'NO1,NORD,MOYEN,DEP,15:00,,0,0,100\nSU1,SUD,MOYEN,DEP,15:10,,0,0,100\n'
  +['ES1','ES2','ES3'].map((v,i)=>v+',EST,MOYEN,DEP,15:'+(2+i)+'0,,0,0,100').join('\n')+'\n'
  +['OU1','OU2','OU3'].map((v,i)=>v+',OUEST,MOYEN,DEP,16:'+i+'0,,0,0,100').join('\n')+'\n';
// Une heure de montage par vol. A : deux vols, finis à 10:00, présente jusqu'à 11:00. B : six vols, présente jusqu'à 13:00 — elle déborde.
const UNITE=()=>{
  Sim.reglages.changer(()=>{const e=Sim.reglages.etat;e.bareme={...e.bareme,prepa:{'*/YC':60}};e.regime={seuils:[],presence:480};e.heuresSup={actif:true,plafond:180};},'');
  Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
    st.ateliers.push({id:'ma',nom:'Montage A',service:'prepa',type:'manuel',debut:'08:00',jour:0,personnes:1,pauses:[],lots:[['NORD/YC'],['SUD/YC']],regime:{actif:true,presence:180}});
    st.ateliers.push({id:'mb',nom:'Montage B',service:'prepa',type:'manuel',debut:'08:00',jour:0,personnes:1,pauses:[],lots:[['EST/YC'],['OUEST/YC']],regime:{actif:true,presence:300}});
    // Une équipe dans un autre service : une cible de plus pour la matrice.
    st.ateliers.push({id:'cu',nom:'Cuisine C',service:'cuisine',type:'manuel',debut:'08:00',jour:0,personnes:1,pauses:[],lots:[],regime:{actif:true,presence:300}});
    st.effectifs={prepa:'impose'};},'');
};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=250)=>page.waitForTimeout(ms);
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-rf-'));
 const csv=path.join(dossier,'vols-rf.csv');fs.writeFileSync(csv,VOLS_CSV);
 const modele=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ory-modele-v1')||'null'));
 const cases=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ory-ateliers-v1')||'null'));
 const resultat=()=>page.evaluate(()=>{const r=Sim.ateliers.resultat,v=id=>r.ateliers.find(a=>a.id===id);
   return {renforts:r.renforts||null,supB:Math.round(v('mb').heuresSup*100)/100,pretes:v('ma').renfortsPretes,recus:v('mb').renfortsRecus};});
 const panneau=()=>page.locator('#rg-sim-renforts');
 const saisir=async(sel,val)=>{const l=panneau().locator(sel);await l.fill(val);await l.press('Tab');await attendre();};
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(500);
  await page.evaluate(UNITE);await attendre();
  await nav.aller(page,'v-programme');
  await page.locator('#imp-vols').setInputFiles(csv);
  await page.waitForFunction(()=>document.getElementById('source-label').textContent==='vols-rf.csv');

  // 1. Désactivés par défaut : la case n'est pas cochée, rien d'enregistré, rien dans la Synthèse.
  await nav.aller(page,'rg-simulation');
  const caseRF=panneau().locator('[data-rf-actif]');
  assert.equal(await caseRF.isVisible(),true,'le réglage est dans les réglages de la simulation, après les heures sup');
  assert.equal(await caseRF.isChecked(),false);
  assert.equal(await panneau().locator('[data-rf=efficacite]').isDisabled(),true);
  assert.equal(await panneau().locator('.rf-table').count(),0,'pas de matrice tant qu’ils sont désactivés');
  assert.equal(((await modele())||{}).renforts,undefined,'rien d’enregistré tant qu’on n’y touche pas');
  let r=await resultat();
  assert.deepEqual([r.renforts,r.supB,r.pretes],[null,60,undefined],'seule, B déborde de 60 min');
  await nav.aller(page,'j-chiffres');
  assert.equal(await page.evaluate(()=>!!document.getElementById('bilan-renforts')),false);

  // 2. Cochée : rangée avec le barème ; A aide B de 10:00 à 11:00.
  await nav.aller(page,'rg-simulation');
  await caseRF.check();await attendre();
  assert.deepEqual((await modele()).renforts,{actif:true,efficacite:0.8,efficaciteAutreService:0.6,delai:10,versHeuresSup:false});
  r=await resultat();
  assert.deepEqual(r.renforts,[{de:'ma',vers:'mb',minutes:60}]);
  assert.deepEqual([r.supB,r.pretes,r.recus],[20,60,60],'50 min × 0,8 : le débordement passe de 60 à 20 min');

  // 3. L'efficacité : 0,6 ; hors bornes, refusée sous le champ.
  await saisir('[data-rf=efficacite]','0.6');
  assert.equal((await modele()).renforts.efficacite,0.6);
  assert.equal((await resultat()).supB,30);
  await saisir('[data-rf=efficacite]','3');
  assert.equal((await modele()).renforts.efficacite,0.6,'3 : refusé');
  await saisir('[data-rf=delai]','30');
  assert.equal((await modele()).renforts.delai,30);
  assert.equal((await resultat()).supB,42,'arrivé à 10:30 : 30 min × 0,6');
  await saisir('[data-rf=delai]','10');await saisir('[data-rf=efficacite]','0.8');

  // 4. Qui peut aider qui : le montage aide toujours le montage (coché et grisé) ; cocher la cuisine l'ajoute ; « Revenir au défaut ».
  const ligne=panneau().locator('tr[data-rf-service=prepa]');
  assert.match(await ligne.locator('summary').innerText(),/^Son service$/);
  await ligne.locator('summary').click();await attendre();
  const cible=ligne.locator('[data-rf-cible=prepa]');
  assert.deepEqual([await cible.isChecked(),await cible.isDisabled()],[true,true],'son propre service : coché et grisé');
  const cuisine=()=>panneau().locator('tr[data-rf-service=prepa] [data-rf-cible=cuisine]');
  assert.deepEqual([await cuisine().isChecked(),await cuisine().isDisabled()],[false,false]);
  await cuisine().check();await attendre();
  assert.deepEqual((await cases()).polyvalence,{prepa:['cuisine']},'rangée avec les cases : les autres services seulement');
  assert.deepEqual((await resultat()).renforts,[{de:'ma',vers:'mb',minutes:60}],'il aide toujours son service');
  assert.match(await panneau().locator('tr[data-rf-service=prepa] summary').innerText(),/^Son service, et : /);
  assert.equal(await panneau().locator('tr[data-rf-service=prepa] details').getAttribute('open'),'','la ligne reste dépliée');
  await panneau().locator('tr[data-rf-service=prepa] [data-rf-defaut]').click();await attendre();
  assert.equal('polyvalence' in (await cases()),false,'revenue au défaut : rien d’enregistré');
  assert.deepEqual((await resultat()).renforts,[{de:'ma',vers:'mb',minutes:60}]);
  // Une sauvegarde d'avant qui cochait le service lui-même : relue telle quelle, et gardée quand on retouche la ligne.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.polyvalence={prepa:['prepa','cuisine']};},''));await attendre();
  assert.deepEqual([await cible.isChecked(),await cible.isDisabled(),await cuisine().isChecked()],[true,true,true]);
  await cuisine().uncheck();await attendre();
  assert.deepEqual((await cases()).polyvalence,{prepa:['prepa']});
  // Un robot dans son propre service : ses équipes à la main restent cochées et grisées ; la case de son robot se coche (correction 2, suite).
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'ro',nom:'Robot R',service:'prepa',type:'robot',debut:'08:00',jour:0,personnes:1,personnesMin:1,debit:100,
    pauses:[],lots:[],regime:{actif:true,presence:300}});},''));await attendre();
  const main=ligne.locator('[data-rf-main=prepa]');
  assert.deepEqual([await main.isChecked(),await main.isDisabled()],[true,true],'ses équipes à la main : cochées et grisées');
  assert.deepEqual([await cible.isChecked(),await cible.isDisabled()],[true,false],'la sauvegarde d’avant l’avait cochée : son robot reste ouvert, et se décoche');
  assert.match(await ligne.locator('label:has([data-rf-cible=prepa])').innerText(),/· robot$/);
  await cible.uncheck();await attendre();
  assert.equal('polyvalence' in (await cases()),false,'décochée : plus rien d’enregistré');
  assert.deepEqual([await main.isChecked(),await cible.isChecked(),await cible.isDisabled()],[true,false,false],'décochée par défaut');
  await cible.check();await attendre();
  assert.deepEqual((await cases()).polyvalence,{prepa:['prepa']});
  assert.match(await ligne.locator('summary').innerText(),/^Son service, et : .+ \(robot\)$/);
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;st.ateliers=st.ateliers.filter(a=>a.id!=='ro');},''));await attendre();
  assert.deepEqual([await cible.isChecked(),await cible.isDisabled(),await main.count()],[true,true,0],'sans robot : coché et grisé, comme avant');

  // 5. Les postes de travail, dans la fiche de B : un seul poste, déjà pris ; vidé, plus de limite.
  await nav.aller(page,'at-equipes');
  await page.evaluate(()=>{Sim.ateliers.ouvert='mb';Sim.ateliers.rendre();});await attendre();
  const postes=page.locator('[data-at="mb"] [data-at-champ=personnesMax]');
  assert.equal(await postes.inputValue(),'','sans limite par défaut');
  await postes.fill('1');await postes.press('Tab');await attendre();
  assert.equal((await cases()).ateliers.find(a=>a.id==='mb').personnesMax,1);
  assert.deepEqual((await resultat()).renforts,[],'aucun poste libre');
  await page.locator('[data-at="mb"] [data-at-champ=personnesMax]').fill('');await page.locator('[data-at="mb"] [data-at-champ=personnesMax]').press('Tab');await attendre();
  assert.equal('personnesMax' in (await cases()).ateliers.find(a=>a.id==='mb'),false);

  // 6. La Synthèse : qui a aidé qui, et combien de temps.
  await nav.aller(page,'j-chiffres');
  const bilan=page.locator('#bilan-renforts');
  assert.equal(await bilan.isVisible(),true);
  const rangee=bilan.locator('tr[data-rf-de=ma][data-rf-vers=mb]');
  assert.match(await rangee.innerText(),/Montage A[\s\S]*Montage B[\s\S]*1 h/);
  assert.match(await bilan.innerText(),/Temps prêté en tout : 1 h 00\./);

  // 7. Rechargée, la règle est la même ; dans « Tout sauvegarder » aussi, avec la matrice.
  await nav.aller(page,'rg-simulation');
  assert.equal(await panneau().locator('tr[data-rf-service=prepa] details').getAttribute('open'),'','toujours dépliée');
  await panneau().locator('tr[data-rf-service=prepa] [data-rf-defaut]').click();await attendre();
  await panneau().locator('tr[data-rf-service=prepa] [data-rf-cible=cuisine]').check();await attendre();
  await page.reload();await attendre(600);
  await nav.aller(page,'rg-simulation');
  assert.equal(await panneau().locator('[data-rf-actif]').isChecked(),true);
  assert.match(await panneau().locator('tr[data-rf-service=prepa] summary').innerText(),/, et : /);
  await nav.aller(page,'u-sauvegarde');
  const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#sauvegarde-export').click()]);
  const fichier=path.join(dossier,'sauvegarde.json');await d.saveAs(fichier);
  const contenu=JSON.parse(fs.readFileSync(fichier,'utf8')).contenu,lu=x=>(typeof x==='string'?JSON.parse(x):x);
  assert.deepEqual(lu(contenu['ory-modele-v1']).renforts,{actif:true,efficacite:0.8,efficaciteAutreService:0.6,delai:10,versHeuresSup:false});
  assert.deepEqual(lu(contenu['ory-ateliers-v1']).polyvalence,{prepa:['cuisine']});

  // 8. Décochée : plus de renfort, plus rien dans la Synthèse ; « Annuler » revient.
  await nav.aller(page,'rg-simulation');
  await panneau().locator('[data-rf-actif]').uncheck();await attendre();
  assert.deepEqual((await resultat()).renforts,null);
  assert.equal(await page.evaluate(()=>!!document.getElementById('bilan-renforts')),false);
  await page.evaluate(()=>Sim.reglages.histoire(false));await attendre();
  assert.equal(await panneau().locator('[data-rf-actif]').isChecked(),true,'annulé : de nouveau cochée');

  assert.deepEqual(errors,[]);
  console.log('renforts-browser : ok — réglages, matrice, postes de travail, synthèse, sauvegarde');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})();

/* La légumerie, les appros et le magasin comme des boutiques (retour d'usage :
 * « ils sont libres en permanence entre une heure et une heure, ce sont comme
 * des boutiques »). Ouverts, on y est servi tout de suite ; fermés, l'étape
 * d'après attend l'ouverture. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  // Une légumerie par vagues, et une cuisine qui en a besoin à 04:00.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
    st.ateliers.push({id:'lg',nom:'Légumerie',service:'decontam',type:'dispo',debut:'14:00',jour:-1,personnes:0,pauses:[],lots:[],regime:{actif:true},
      permanent:false,vagues:[{debut:'14:00',jour:-1},{debut:'04:00',jour:0}]},
      {id:'cu',nom:'Cuisine AF BC',service:'cuisine',type:'manuel',debut:'04:00',jour:0,personnes:3,pauses:[],lots:[['AF/BC']],regime:{actif:true}});
    st.parcours.push({id:'pb',nom:'Chemin AF/BC',noeuds:['decontam','cuisine'],liens:[{de:'decontam',vers:'cuisine'}]});
    st.parcoursClasse['AF/BC']='pb';},''));
  await attendre();
  const cuisine=()=>page.evaluate(()=>{const l=Sim.ateliers.resultat.lots.find(x=>x.atelier==='cu');return {debut:l.debut,attente:l.attente};});
  assert.equal((await cuisine()).debut,4*60,'par vagues : servie par celle de la veille');

  // 1. Les points à regarder proposent d'en faire une boutique, d'un clic.
  //    (Évolution 22 b : « Équipes une par une » n'est plus une page ; les mêmes points se lisent en tête des chemins.)
  await nav.aller(page,'at-chemins');
  await page.locator('#at-anomalies').evaluate(d=>d.open=true);
  assert.match(await page.locator('#at-anomalies').innerText(),/Légumerie sert par vagues[\s\S]*Facultatif\s*Les ouvrir de 07:00 à 18:00/,'une information ; son geste dit « Facultatif »');
  await page.locator('#at-anomalies [data-at-action=boutiques]').click();await attendre();
  assert.deepEqual(await page.evaluate(()=>{const a=Sim.ateliers.state.ateliers.find(x=>x.id==='lg');return [a.permanent,a.ouverture];}),[true,{de:'07:00',a:'18:00'}]);
  assert.equal(await page.locator('#at-anomalies [data-at-action=boutiques]').count(),0,'plus rien à proposer');

  // 2. Fermée à 04:00 : la cuisine attend l'ouverture, et l'attente se voit.
  assert.deepEqual(await cuisine(),{debut:7*60,attente:180});

  // 3. Le tableau de son service dit ses heures ; sa fiche les règle. (Évolution 22 b : « Horaires des équipes », qui
  //    faisait les deux, a quitté l'écran.)
  await nav.service(page,await page.evaluate(()=>Sim.ateliers.state.ateliers.find(x=>x.id==='lg').service));
  assert.deepEqual(await page.locator('#mu-services .se-equipes tr[data-se-equipe="lg"] td').evaluateAll(cs=>cs.slice(0,2).map(c=>c.textContent.trim())),['de 07:00 à 18:00','chaque jour']);
  await nav.reglagesEquipe(page,'lg');
  const ligne=page.locator('#mu-services [data-at="lg"]').first();
  assert.equal(await ligne.locator('select[data-at-champ=mode-dispo]').inputValue(),'boutique');
  await ligne.locator('[data-at-champ=ouverture-de]').fill('03:00');await ligne.locator('[data-at-champ=ouverture-de]').dispatchEvent('change');await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(x=>x.id==='lg').ouverture.de),'03:00');
  assert.deepEqual(await cuisine(),{debut:4*60,attente:0},'ouverte dès 03:00 : servie sans attendre');

  // 3 bis. Une équipe « toujours ouverte » devient une boutique depuis sa fiche.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'mg',nom:'Magasin',service:'magasin',type:'dispo',debut:'06:00',jour:0,
    personnes:0,pauses:[],lots:[],regime:{actif:true},permanent:true});},''));await attendre();
  await nav.reglagesEquipe(page,'mg');
  const mag=page.locator('#mu-services [data-at="mg"]').first();
  assert.equal(await mag.locator('select[data-at-champ=mode-dispo]').inputValue(),'toujours');
  await mag.locator('select[data-at-champ=mode-dispo]').selectOption('boutique');await attendre();
  assert.deepEqual(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(x=>x.id==='mg').ouverture),{de:'07:00',a:'18:00'});
  assert.equal(await mag.locator('[data-at-champ=ouverture-a]').inputValue(),'18:00','ses heures apparaissent aussitôt');
  await mag.locator('[data-at-champ=ouverture-a]').fill('16:00');await mag.locator('[data-at-champ=ouverture-a]').dispatchEvent('change');await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(x=>x.id==='mg').ouverture.a),'16:00');

  // 4. « Qui prépare quoi » dit ses heures, pas une vague.
  await nav.aller(page,'at-grille');
  assert.match(await page.locator('.qf').first().innerText(),/ouvert 03:00–18:00/);

  // 5. La fiche le règle aussi, et « Annuler » revient en arrière.
  await page.evaluate(()=>Sim.ateliers.histoire(false));await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(x=>x.id==='mg').ouverture.a),'18:00','la dernière heure changée revient');

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('boutique-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

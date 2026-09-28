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
  await nav.aller(page,'at-equipes');
  await page.locator('#at-anomalies').evaluate(d=>d.open=true);
  assert.match(await page.locator('#at-anomalies').innerText(),/Légumerie sert par vagues/);
  await page.locator('#at-anomalies [data-at-action=boutiques]').click();await attendre();
  assert.deepEqual(await page.evaluate(()=>{const a=Sim.ateliers.state.ateliers.find(x=>x.id==='lg');return [a.permanent,a.ouverture];}),[true,{de:'07:00',a:'18:00'}]);
  assert.equal(await page.locator('#at-anomalies [data-at-action=boutiques]').count(),0,'plus rien à proposer');

  // 2. Fermée à 04:00 : la cuisine attend l'ouverture, et l'attente se voit.
  assert.deepEqual(await cuisine(),{debut:7*60,attente:180});

  // 3. Le récap des cases montre ses heures, et les règle.
  await nav.aller(page,'at-recap');
  const ligne=page.locator('tr.rc-case[data-at="lg"]');
  assert.equal(await ligne.locator('select[data-at-champ=mode-dispo]').inputValue(),'boutique');
  assert.match(await ligne.innerText(),/chaque jour/);
  await ligne.locator('[data-at-champ=ouverture-de]').fill('03:00');await ligne.locator('[data-at-champ=ouverture-de]').dispatchEvent('change');await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(x=>x.id==='lg').ouverture.de),'03:00');
  assert.deepEqual(await cuisine(),{debut:4*60,attente:0},'ouverte dès 03:00 : servie sans attendre');

  // 3 bis. Une case « toujours ouverte » devient une boutique depuis le récap aussi
  //        (retour d'usage : « cela n'a pas modifié dans le récap des cases »).
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'mg',nom:'Magasin',service:'magasin',type:'dispo',debut:'06:00',jour:0,
    personnes:0,pauses:[],lots:[],regime:{actif:true},permanent:true});},''));await attendre();
  const mag=page.locator('tr.rc-case[data-at="mg"]');
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

/* La ligne robot dans l'interface (retour d'usage du 29/09) : les équipes du
 * matin et de l'après-midi partagent UNE ligne, arrêtée de 12:15 à 13:00.
 * Réglé dans la fiche d'une case Robot, valable pour toute la ligne. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 const kase=id=>page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id),id);
 const lot=at=>page.evaluate(at=>Sim.ateliers.resultat.lots.find(l=>l.atelier===at&&!l.impossible),at);
 const fiche=(id,sel)=>page.locator(`[data-at="${id}"] ${sel}:visible`);
 const ouvrir=async id=>{await nav.aller(page,'at-equipes');await page.locator(`#at-liste [data-at="${id}"] .at-carte-nom`).click();await attendre();};
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  // Deux équipes robot dans le même service : matin 06:00, après-midi 07:00 (elles se chevauchent).
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
    const r=(id,nom,debut,lots)=>({id,nom,service:'prepa',type:'robot',debut,jour:0,personnes:4,personnesMin:1,debit:60,pauses:[],lots,regime:{actif:false}});
    st.ateliers.push(r('rm','Robot matin','06:00',[['AF/YC']]),r('ra','Robot APM','07:00',[['TX/YC']]));},''));

  // 1. Une seule ligne : l'après-midi attend que le matin libère le robot.
  const m=await lot('rm'),a=await lot('ra');
  assert.ok(a.debut>=m.fin-1e-9,'un lot à la fois sur la ligne');
  assert.ok(a.attenteLigne>0,'l’attente de la ligne est comptée');
  await ouvrir('ra');
  assert.match(await fiche('ra','.at-ligne-robot').innerText(),/partagée avec « Robot matin »[\s\S]*Attend la ligne/);

  // 2. L'arrêt de la ligne, ajouté dans une fiche, vaut pour les deux équipes.
  await fiche('ra','[data-at-action=arret-ligne-ajouter]').click();await attendre();
  assert.deepEqual((await kase('ra')).arretsLigne,[{de:'12:15',a:'13:00'}],'12:15–13:00 par défaut');
  assert.deepEqual((await kase('rm')).arretsLigne,[{de:'12:15',a:'13:00'}],'et sur l’autre équipe de la ligne');
  const de=fiche('ra','[data-at-champ=arret-ligne-de]');
  await de.fill('12:30');await de.dispatchEvent('change');await attendre();
  assert.equal((await kase('rm')).arretsLigne[0].de,'12:30','modifier l’arrêt le change pour toute la ligne');

  // 3. Un second robot : sa propre ligne, il tourne en même temps.
  await fiche('ra','[data-at-champ=ligne-propre]').check();await attendre();
  assert.equal((await kase('ra')).lignePropre,true);
  const a2=await lot('ra');
  assert.equal(a2.attenteLigne,undefined,'plus d’attente');
  assert.ok(a2.debut<(await lot('rm')).fin,'les deux robots tournent ensemble');
  await fiche('ra','[data-at-champ=ligne-propre]').uncheck();await attendre();
  assert.equal((await kase('ra')).lignePropre,undefined);

  // 4. Le récap des cases le dit.
  await nav.aller(page,'at-recap');
  assert.match(await page.locator('tr.rc-case[data-at="rm"] .rc-type').innerText(),/ligne partagée/);

  // 5. Tout survit au rechargement.
  await page.reload();await attendre();
  assert.equal((await kase('rm')).arretsLigne[0].de,'12:30');

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('robot-ligne-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

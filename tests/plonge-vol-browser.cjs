/* La plonge par vol (retour d'usage : « le débit de tunnel se parle en vol :
 * un tunnel nettoie un vol en tant de temps »), réglée compagnie par
 * compagnie depuis sa fiche. */
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
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'pl',nom:'Plonge',service:'plonge',type:'lavage',debut:'05:00',jour:0,
    personnes:2,pauses:[],lots:[],regime:{actif:true},plafond:0,tunnels:[{nom:'T1',debit:300,personnes:1,actif:true},{nom:'T2',debit:300,personnes:1,actif:true}]});},''));
  await nav.aller(page,'at-equipes');
  await page.evaluate(()=>{Sim.ateliers.ouvert='pl';Sim.ateliers.aDessiner.add('at-equipes');Sim.ateliers.rendre();});await attendre();
  const fiche=page.locator('[data-at="pl"]');

  // 1. Par vol : le débit en u/h disparaît, une ligne par compagnie des vols revenus.
  await fiche.locator('[data-at-champ=plonge-mode]').selectOption('vol');await attendre();
  assert.deepEqual(await page.evaluate(()=>{const a=Sim.ateliers.state.ateliers.find(x=>x.id==='pl');return [a.parVol,a.durees];}),[true,{'*':30}]);
  assert.equal(await fiche.locator('[data-at-champ=tunnel-debit]').count(),0,'plus de débit en u/h');
  const ciesRet=await page.evaluate(()=>[...new Set(Sim.ateliers.a.vols().filter(v=>v.sens==='RET').map(v=>v.cie))].sort());
  assert.ok(ciesRet.length>0,'des vols reviennent');
  for(const c of ciesRet)assert.equal(await fiche.locator(`[data-at-champ=duree][data-cie="${c}"]`).count(),1,c+' a sa ligne');
  assert.match(await fiche.innerText(),/2 tunnels tournent/);

  // 2. Le calcul : chaque vol revenu est lavé, au temps de sa compagnie.
  const c0=ciesRet[0];
  await fiche.locator(`[data-at-champ=duree][data-cie="${c0}"]`).fill('45');
  await fiche.locator(`[data-at-champ=duree][data-cie="${c0}"]`).dispatchEvent('change');await attendre();
  const lav=await page.evaluate(()=>Sim.ateliers.resultat.lots.filter(l=>l.retourVol).map(l=>({cie:l.cie,duree:l.duree,tunnel:l.tunnel,fin:l.fin})));
  assert.equal(lav.length,await page.evaluate(()=>Sim.ateliers.a.vols().filter(v=>v.sens==='RET').length),'un lavage par vol revenu');
  assert.ok(lav.filter(l=>l.cie===c0).every(l=>l.duree===45),c0+' : 45 min');
  assert.ok(lav.filter(l=>l.cie!==c0).every(l=>l.duree===30),'les autres : le temps de toutes');
  // Ceux qui reviennent après la fin du poste ne sont pas lavés : le calcul le dit.
  assert.ok(lav.filter(l=>l.fin!=null).every(l=>l.tunnel===1||l.tunnel===2),'deux tunnels');
  assert.ok(lav.some(l=>l.tunnel===2),'le second tunnel sert');
  if(lav.some(l=>l.fin==null))assert.ok(await page.evaluate(()=>Sim.ateliers.resultat.anomalies.some(a=>a.code==='plonge-vol')),'les vols non lavés sont signalés');

  // 2 bis. Un tunnel deux fois plus rapide : les temps saisis sont ceux d'un tunnel normal.
  await fiche.locator('[data-at-champ=tunnel-vitesse][data-index="1"]').fill('2');
  await fiche.locator('[data-at-champ=tunnel-vitesse][data-index="1"]').dispatchEvent('change');await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(x=>x.id==='pl').tunnels[1].vitesse),2);
  const rapides=await page.evaluate(()=>Sim.ateliers.resultat.lots.filter(l=>l.retourVol&&l.vitesse===2).map(l=>[l.cie,l.duree]));
  assert.ok(rapides.length,'le tunnel rapide lave des vols');
  for(const [cie,d] of rapides)assert.equal(d,(cie===c0?45:30)/2,'en deux fois moins de temps');
  assert.match(await fiche.innerText(),/dans un tunnel normal \(×1\)/);

  // 3. Le récap des cases le dit.
  await nav.aller(page,'at-recap');
  assert.match(await page.locator('tr.rc-case[data-at="pl"]').innerText(),/lave \d+ vols? revenus?, dans l’ordre des retours/);

  // 3 bis. Avec la boucle du matériel (retour d'usage : « j'ai essayé d'ajouter des tunnels et ça
  //        fait que crasher ») : un débit « infini » faisait tourner sans fin le graphique de la
  //        plonge. Chaque ajout de tunnel doit rester instantané, et la page des stocks s'afficher.
  await nav.aller(page,'at-equipes');
  await page.evaluate(()=>{Sim.ateliers.changer(()=>{Sim.ateliers.state.materiel.actif=true;},'');Sim.ateliers.ouvert='pl';Sim.ateliers.aDessiner.add('at-equipes');Sim.ateliers.rendre();});await attendre();
  for(let i=0;i<3;i++){const t=Date.now();
    await fiche.locator('[data-at-action=tunnel-ajouter]').click({timeout:5000});
    assert.ok(Date.now()-t<3000,'ajouter un tunnel reste instantané ('+(Date.now()-t)+' ms)');}
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(x=>x.id==='pl').tunnels.length),5);
  await nav.aller(page,'j-stocks');
  const stocks=await page.locator('#journee-stocks').innerText({timeout:5000});
  assert.match(stocks,/Tunnels qui tournent/,'la page des stocks s’affiche, en tunnels et non en u/h');
  assert.doesNotMatch(stocks,/Infinity|NaN/);

  // 4. Retour au débit : l'ancien réglage revient.
  await nav.aller(page,'at-equipes');
  await page.evaluate(()=>{Sim.ateliers.ouvert='pl';Sim.ateliers.aDessiner.add('at-equipes');Sim.ateliers.rendre();});await attendre();
  await fiche.locator('[data-at-champ=plonge-mode]').selectOption('debit');await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(x=>x.id==='pl').parVol),undefined);
  assert.equal(await fiche.locator('[data-at-champ=tunnel-debit]').count(),5);

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('plonge-vol-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

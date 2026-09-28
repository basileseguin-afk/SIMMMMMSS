/* Le handling dans l'interface : il se pose sur un chemin comme un service,
 * mais sa case charge des vols (retour d'usage du 28/09). */
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

  // 1. Sur le chemin d'AF · Business, on ajoute le handling : sa case est un handling, partagé.
  await nav.aller(page,'at-chemins');
  await page.locator('[data-pc-action=cmd][data-classe="AF/BC"]').click();await attendre();
  if(await page.locator('[data-pc-action=creer][data-classe="AF/BC"]').count()){await page.locator('[data-pc-action=creer][data-classe="AF/BC"]').click();await attendre();}
  await page.selectOption('[data-pc-champ=noeud-ajout]','handling');await attendre();
  const cases=await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>a.service==='handling'));
  assert.equal(cases.length,1);
  assert.equal(cases[0].type,'handling');
  assert.deepEqual(cases[0].lots,[],'pas de liste de commandes');
  const id=cases[0].id;
  // Une seconde commande qui passe par le handling ne crée pas de seconde case.
  await page.locator('[data-pc-action=cmd][data-classe="AF/YC"]').click();await attendre();
  if(await page.locator('[data-pc-action=creer][data-classe="AF/YC"]').count()){await page.locator('[data-pc-action=creer][data-classe="AF/YC"]').click();await attendre();}
  await page.selectOption('[data-pc-champ=noeud-ajout]','handling');await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>a.service==='handling').length),1,'un seul handling, partagé');

  // 2. Le calcul suit les vols : AF chargé, dans l'ordre des départs.
  const r=await page.evaluate(()=>{const r=Sim.ateliers.resultat;return {vols:r.vols.map(v=>({id:v.id,depart:v.depart,debut:v.debut,etat:v.etat})),k:r.indicateurs};});
  assert.ok(r.vols.length>0,'des vols suivis');
  const faits=r.vols.filter(v=>v.debut!=null);
  for(let i=1;i<faits.length;i++)assert.ok(faits[i].debut>=faits[i-1].debut,'ordre strict des départs');
  assert.equal(r.k.volsSuivis,r.vols.length);

  // 3. La fiche : type, vols en même temps, pas avant, durées par compagnie.
  await nav.aller(page,'at-equipes');
  await page.evaluate(id=>{Sim.ateliers.ouvert=id;Sim.ateliers.rendre();},id);await attendre();
  const fiche=page.locator(`[data-at="${id}"]`);
  assert.equal(await fiche.locator('[data-at-champ=type]').inputValue(),'handling');
  assert.equal(await fiche.locator('[data-at-champ=jour]').count(),0,'pas de choix du jour : le handling travaille le jour J');
  assert.match(await fiche.innerText(),/le jour J des vols/);
  await fiche.locator('[data-at-champ=avance]').fill('2');await fiche.locator('[data-at-champ=avance]').dispatchEvent('change');await attendre();
  assert.equal(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).avance,id),120,'saisi en heures, gardé en minutes');
  await page.locator(`[data-at="${id}"] [data-at-champ=duree-nouvelle]`).selectOption('AF');await attendre();
  await page.locator(`[data-at="${id}"] [data-at-champ=duree][data-cie=AF]`).fill('50');
  await page.locator(`[data-at="${id}"] [data-at-champ=duree][data-cie=AF]`).dispatchEvent('change');await attendre();
  assert.equal(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).durees.AF,id),50);
  const af=await page.evaluate(()=>Sim.ateliers.resultat.vols.find(v=>v.cie==='AF'&&v.fin!=null));
  assert.ok(af&&Math.round(af.fin-af.debut)>=50,'un vol AF dure 50 min');

  // 4. Les départs disent « chargé à », la synthèse compte les vols.
  await nav.aller(page,'v-departs');
  assert.match(await page.locator('#flight-rows').innerText(),/chargé à \d\d:\d\d/);
  await nav.aller(page,'j-chiffres');
  assert.match(await page.locator('#bilan-journee').innerText(),/Vols chargés à l’heure/);

  // 5. Revenir à une équipe qui prépare efface les réglages du handling.
  await nav.aller(page,'at-equipes');
  await page.evaluate(id=>{Sim.ateliers.ouvert=id;Sim.ateliers.rendre();},id);await attendre();
  await page.locator(`[data-at="${id}"] [data-at-champ=type]`).selectOption('manuel');await attendre();
  const a=await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id),id);
  assert.equal(a.durees,undefined);assert.equal(a.simultanes,undefined);
  assert.deepEqual(await page.evaluate(()=>Sim.ateliers.resultat.vols),[]);

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('handling-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

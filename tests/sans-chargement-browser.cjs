/* Évolution 21 (e) — une compagnie sans chargement par camion, dans la page : l'avis « aucun handling ne charge cette
 * compagnie » garde son texte et gagne un bouton « C'est voulu : pas de chargement pour cette compagnie ». Le choix se
 * retient avec les réglages ; la liste se voit et se défait dans la fiche du handling ; si un handling charge ensuite la
 * compagnie, elle sort de la liste d'elle-même. Le résultat de la journée ne change pas, à l'avis près. Sur l'unité
 * fictive de tests/plan-rejoue-fictif.cjs : rien d'une vraie unité. Chaque étape attend son effet. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {siteSansPlan}=require('./plan-fictif.cjs');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const site=siteSansPlan();
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const avis=()=>page.evaluate(()=>(Sim.ateliers.resultat.anomalies||[]).filter(a=>a.code==='handling-sans').map(a=>a.compagnie).sort());
 const liste=()=>page.evaluate(()=>Sim.ateliers.state.sansChargement||null);
 /** Le résultat de la journée, sans les avis. */
 const journee=()=>page.evaluate(()=>{const r=Sim.ateliers.resultat;return JSON.stringify({...r,anomalies:(r.anomalies||[]).filter(a=>a.code!=='handling-sans')});});
 /** « Contrôles » (évolution 22 d : le panneau « Problèmes » l'a rejointe), ouverte : ses avis de compagnie sans handling, avec leur bouton. */
 const panneau=async()=>{
   if(await page.evaluate(()=>document.body.dataset.sous)!=='mu-pas')await nav.aller(page,'mu-pas');
   await page.waitForFunction(()=>!!document.querySelector('#mu-pas .ct-cadre'));
   return page.evaluate(()=>[...document.querySelectorAll('#mu-pas .ct-point')].filter(li=>/aucun handling ne charge cette compagnie/.test(li.textContent))
     .map(li=>({groupe:li.closest('.ct-niveau').className,titre:li.querySelector('.ct-corps b').textContent,
       boutons:[...li.querySelectorAll('[data-ct-voulu]')].map(b=>[b.dataset.ctVoulu,b.textContent,b.getAttribute('aria-label')]),aller:(li.querySelector('[data-ct-aller]')||{}).textContent||''})));};
 try{
  const ch=await F.charger(page,nav,site.url('index.html'),{pageId:'mu-services'});
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.problemes);
  // Le handling de l'unité fictive ne charge plus qu'une compagnie : les autres n'ont plus de chargement.
  const idHandling=await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.type==='handling').id),chargee='NORD';
  assert.deepEqual(await avis(),[],'au départ, le handling charge toutes les compagnies');
  await page.evaluate(([id,c])=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id===id).compagnies=[c];},''),[idHandling,chargee]);
  await page.waitForFunction(()=>(Sim.ateliers.resultat.anomalies||[]).filter(a=>a.code==='handling-sans').length>=2);
  const cies=[chargee].concat(await avis()),[,voulue,autre]=cies;
  const avant=await journee();
  assert.equal(await liste(),null,'la liste est vide par défaut');

  // 1. L'avis garde son texte, à corriger, et gagne son bouton.
  const p1=await panneau(),a1=p1.find(x=>x.boutons.some(b=>b[0]===voulue));
  assert.equal(p1.length,cies.length-1,'un avis par compagnie sans handling');
  assert.match(a1.titre,new RegExp('vols? '+voulue+' : aucun handling ne charge cette compagnie\\. Ajoutez-la à un handling, ou videz sa liste de compagnies\\.$'));
  assert.match(a1.groupe,/corriger/);
  // Le bouton dit « C'est voulu » ; sa phrase entière est son nom accessible. À côté, le bouton qui mène à l'équipe du handling.
  assert.deepEqual(a1.boutons,[[voulue,'C’est voulu','C’est voulu : pas de chargement pour cette compagnie ('+voulue+')']]);
  assert.equal(a1.aller,'Régler dans Services et équipes →');

  // 2. Le choix : l'avis de cette compagnie disparaît, les autres restent ; le résultat est le même, à l'avis près.
  await page.locator(`#mu-pas [data-ct-voulu="${voulue}"]`).click();
  await page.waitForFunction(c=>(Sim.ateliers.state.sansChargement||[]).includes(c)&&!(Sim.ateliers.resultat.anomalies||[]).some(a=>a.code==='handling-sans'&&a.compagnie===c),voulue);
  assert.deepEqual(await liste(),[voulue]);
  assert.deepEqual(await avis(),cies.filter(c=>c!==chargee&&c!==voulue));
  assert.equal(await journee(),avant,'le calcul ne change pas d’un champ');
  await page.waitForFunction(c=>!document.querySelector(`#mu-pas [data-ct-voulu="${c}"]`),voulue);
  assert.equal((await panneau()).length,cies.length-2);
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-pas','on reste sur « Contrôles » après le choix');
  await page.waitForFunction(()=>document.getElementById('mu-pas').contains(document.activeElement));
  assert.ok(await page.evaluate(()=>document.getElementById('mu-pas').contains(document.activeElement)),'le clavier reste dans la page');

  // 3. La liste se voit dans la fiche du handling, et s'y défait : l'avis revient.
  //    (Sa fiche, dans « Services et équipes » — évolution 22 b.)
  await nav.reglagesEquipe(page,idHandling);
  const bloc=page.locator(`[data-at="${idHandling}"] .at-sans-chargement:visible`);
  await bloc.waitFor();
  assert.match(await bloc.innerText(),new RegExp('Compagnies sans chargement\\s*'+voulue));
  await bloc.locator(`[data-at-action="sans-chargement-oter"][data-cie="${voulue}"]`).click();
  await page.waitForFunction(c=>!Sim.ateliers.state.sansChargement&&(Sim.ateliers.resultat.anomalies||[]).some(a=>a.code==='handling-sans'&&a.compagnie===c),voulue);
  assert.equal(await page.locator(`[data-at="${idHandling}"] .at-sans-chargement`).count(),0,'la liste vide ne s’affiche pas');
  assert.equal(await journee(),avant);

  // 4. « Annuler » et « Rétablir » ; le rechargement de la page garde le choix.
  await page.evaluate(c=>Sim.ateliers.regleSansChargement(c,true),voulue);
  await page.waitForFunction(c=>(Sim.ateliers.state.sansChargement||[]).includes(c),voulue);
  await page.locator('#btn-annuler').click();
  await page.waitForFunction(()=>!Sim.ateliers.state.sansChargement);
  await page.locator('#btn-retablir').click();
  await page.waitForFunction(c=>(Sim.ateliers.state.sansChargement||[]).includes(c),voulue);
  await page.reload();
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.problemes);
  assert.deepEqual(await liste(),[voulue],'le choix est gardé avec les réglages');
  assert.equal((await avis()).includes(voulue),false);

  // 5. Un handling charge ensuite la compagnie : elle sort de la liste d'elle-même.
  await page.evaluate(c=>Sim.ateliers.regleSansChargement(c,true),autre);
  await page.waitForFunction(c=>(Sim.ateliers.state.sansChargement||[]).includes(c),autre);
  await nav.reglagesEquipe(page,idHandling);
  const champ=page.locator(`[data-at="${idHandling}"] [data-at-champ=compagnies]:visible`);
  await champ.waitFor();
  await champ.fill(chargee+', '+voulue);await champ.press('Tab');
  await page.waitForFunction(c=>(Sim.ateliers.state.ateliers.find(a=>a.type==='handling').compagnies||[]).includes(c),voulue);
  assert.deepEqual(await liste(),[autre],voulue+' est chargée : elle n’est plus dans la liste');
  assert.deepEqual(await avis(),cies.filter(c=>c!==chargee&&c!==voulue&&c!==autre));

  assert.deepEqual(errors,[],'aucune erreur dans la page');
  ch.effacer();
  console.log('sans-chargement-browser : ok — l’avis et son bouton « C’est voulu » ; l’avis disparaît, le résultat ne change pas ; la liste dans la fiche du handling, qui se défait ; annuler, rétablir, recharger ; une compagnie qu’un handling charge sort de la liste');
 }finally{site.effacer();await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

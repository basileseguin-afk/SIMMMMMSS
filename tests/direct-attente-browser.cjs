/* Évolution 20 (c) — ce qui attend son vol se rassemble là où l'utilisateur le dit (v1).
 *   — dans la fiche de l'équipe de handling, un choix de plus : « Ce qui attend
 *     le chargement se range dans la zone de : » — le quai par défaut, ou une
 *     autre zone de la vue en direct ;
 *   — avec le réglage, les lots finis qui attendent leur vol sont dessinés dans
 *     la zone choisie, et non sur le quai ; sans lui, sur le quai, comme avant ;
 *     le compte des chariots dessinés ne change pas ;
 *   — le réglage se sauvegarde avec les équipes, s'annule, revient après un
 *     rechargement ; une sauvegarde d'avant se relit sans lui ;
 *   — aucun calcul ne change ; la version 2 n'a pas ce champ.
 * Chaque étape attend son effet, pas un délai. Unité, équipes et vols fictifs. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true}),erreurs=[];
 page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
 const pret=()=>page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.unite&&!!Sim.ateliers.resultat);
 const attentes=()=>page.evaluate(()=>Sim.ateliers.state.attentes||null);
 const journee=()=>page.evaluate(()=>JSON.stringify(Sim.ateliers.resultat));
 const zones=()=>page.evaluate(()=>Sim.ateliers.site(Sim.reglages.etat.regime).zones.map(z=>({id:z.id,nom:z.nom,services:z.services,x:z.x,y:z.y,w:z.w,h:z.h})));
 /** La fiche de l'équipe de handling, ouverte : son choix de la zone d'attente. */
 const choix=async()=>{
   await nav.reglagesEquipe(page,'h');
   await page.waitForSelector('[data-at="h"] [data-at-champ=attente]');
   return page.locator('[data-at="h"] [data-at-champ=attente]');
 };
 /** La scène en relief à l'heure `t` (en pause) : les zones du site et ce qui circule. */
 const scene=async t=>{
   await nav.aller(page,'j-plan',{relief:true});
   await page.waitForFunction(()=>document.body.dataset.direct==='relief'&&Sim.direct.etatVue().images>0);
   await page.evaluate(t=>{Sim.vue.pause();Sim.vue.allerA(t);},t);
   await page.waitForFunction(t=>Math.abs(Sim.direct.etatVue().t-t)<1e-9,t);
   await page.waitForFunction(()=>!Sim.direct.etatVue().enMouvement);
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   return {zones:await zones(),chariots:(await page.evaluate(()=>Sim.direct.etatVue())).circule.chariots};
 };
 const dans=(p,z)=>p.x>=z.x-1e-6&&p.x<=z.x+z.w+1e-6&&p.y>=z.y-1e-6&&p.y<=z.y+z.h+1e-6;
 /** Ce qui attend le chargement : les chariots en file devant le handling, arrivés. */
 const aCharger=s=>s.chariots.filter(o=>o.service==='quais'&&o.etat==='file'&&!o.enChemin);
 const restaurer=async(nom,contenu)=>{
  await nav.aller(page,'u-sauvegarde');
  await page.locator('#sauvegarde-import').setInputFiles({name:nom,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(contenu))});
  assert.match(await page.locator('dialog.question[open] h2').textContent({timeout:5000}),/Restaurer cette sauvegarde/);
  const recharge=page.waitForEvent('load');await nav.repondre(page);await recharge;await page.waitForLoadState('load');await pret();
 };
 try{
  const x=await F.charger(page,nav,URL,{pageId:'j-plan',relief:true});await pret();
  // La journée de référence est celle d'un changement neutre (les effectifs calculés se posent au premier changement).
  const neutre=()=>page.evaluate(()=>{Sim.ateliers.changer(()=>{},'');return JSON.stringify(Sim.ateliers.resultat);});
  const avant=await neutre();
  assert.equal(await neutre(),avant,'un changement neutre laisse la journée identique');
  assert.equal(await attentes(),null,'aucun réglage');
  // Une heure où des lots attendent leur chargement depuis plus de dix minutes.
  const heure=()=>page.evaluate(()=>{const s=Sim.ateliers.resultat.stocks.sejours.filter(q=>q.vers==='quais'&&q.sortie-q.entree>40).sort((p,q)=>p.entree-q.entree)[0];return s?s.entree+10:null;});
  const T=await heure();
  assert.ok(Number.isFinite(T),'des lots attendent le chargement dans la journée fictive');

  // 1. Sans le réglage : ce qui attend le chargement est sur le quai, comme avant.
  const s0=await scene(T),quai0=s0.zones.find(z=>z.id==='quais'),n0=s0.chariots.length;
  assert.ok(aCharger(s0).length>0,'des chariots attendent le chargement à cette heure');
  for(const o of aCharger(s0))assert.ok(dans(o,quai0),'sans réglage : au quai');

  // 2. La fiche de l'équipe de handling : « le quai » par défaut, puis les autres zones du site, par leur nom.
  const c=await choix();
  assert.match(await page.locator('[data-at="h"] label.at-attente').textContent(),/^Ce qui attend le chargement se range dans la zone de\s:/);
  assert.equal(await c.inputValue(),'');
  const options=await c.locator('option').evaluateAll(l=>l.map(o=>[o.value,o.textContent]));
  assert.deepEqual(options[0],['','le quai']);
  assert.deepEqual(options.slice(1).map(o=>o[0]),s0.zones.filter(z=>z.id!=='quais').map(z=>z.id),'les autres zones, dans l’ordre du site');
  assert.deepEqual(options.slice(1).map(o=>o[1]),s0.zones.filter(z=>z.id!=='quais').map(z=>z.nom),'par leur nom');
  // Une équipe qui n'est pas de handling n'a pas ce choix.
  await nav.reglagesEquipe(page,await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.type!=='handling').id));
  assert.equal(await page.locator('#mu-services [data-at-champ=attente], #at-liste [data-at-champ=attente]').count(),0);

  // 3. On choisit la cuisine : le réglage est gardé avec les équipes ; aucun calcul ne change ; le site est le même.
  await (await choix()).selectOption('cuisine');
  await page.waitForFunction(()=>(Sim.ateliers.state.attentes||{}).quais==='cuisine');
  assert.deepEqual(await attentes(),{quais:'cuisine'});
  assert.equal(await journee(),avant,'la journée est identique, champ par champ');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('ory-ateliers-v1')).attentes),{quais:'cuisine'},'gardé dans ce navigateur');
  assert.equal(await (await choix()).inputValue(),'cuisine');
  assert.deepEqual(await page.evaluate(()=>Sim.ateliers.site().attentes),{quais:'cuisine'});

  // 4. Dans la scène : ce qui attend le chargement est dans la cuisine, et non sur le quai ; autant de chariots.
  const s1=await scene(T),quai1=s1.zones.find(z=>z.id==='quais'),cuisine1=s1.zones.find(z=>z.id==='cuisine');
  assert.deepEqual(s1.zones,s0.zones,'les zones ne bougent pas');
  assert.equal(aCharger(s1).length,aCharger(s0).length,'autant de chariots attendent le chargement');
  for(const o of aCharger(s1))assert.ok(dans(o,cuisine1)&&!dans(o,quai1),'avec le réglage : dans la cuisine');
  assert.equal(s1.chariots.filter(o=>o.etat==='file'&&!o.enChemin&&dans(o,quai1)).length,0,'plus aucun lot en attente sur le quai');
  assert.equal(s1.chariots.length,n0,'le compte des chariots dessinés ne change pas');
  const cles=s1.chariots.filter(o=>o.etat==='file'&&!o.enChemin).map(o=>Math.round(o.x*1000)+','+Math.round(o.y*1000)+','+(dans(o,cuisine1)?'c':''));
  assert.equal(new Set(cles.filter(k=>k.endsWith('c'))).size,cles.filter(k=>k.endsWith('c')).length,'dans la cuisine, aucun chariot sur un autre');

  // 5. « Annuler » rend le quai ; « Rétablir », la cuisine.
  await choix();
  await page.locator('#btn-annuler').click();
  await page.waitForFunction(()=>!Sim.ateliers.state.attentes);
  assert.equal(await (await choix()).inputValue(),'');
  for(const o of aCharger(await scene(T)))assert.ok(dans(o,quai0),'annulé : au quai');
  await choix();
  await page.locator('#btn-retablir').click();
  await page.waitForFunction(()=>(Sim.ateliers.state.attentes||{}).quais==='cuisine');

  // 6. Le service choisi désigne sa zone : si la cuisine partage la zone de la dotation (évolution 20 a), c'est cette zone.
  await page.evaluate(()=>Sim.ateliers.reglePartage('cuisine','dotation'));
  await page.waitForFunction(()=>(Sim.ateliers.state.partages||{}).cuisine==='dotation');
  assert.deepEqual(await page.evaluate(()=>Sim.ateliers.site().attentes),{quais:'dotation'});
  assert.equal(await (await choix()).inputValue(),'dotation','la fiche montre la zone où c’est rangé');
  const s2=await scene(T),dotation2=s2.zones.find(z=>z.id==='dotation');
  for(const o of aCharger(s2))assert.ok(dans(o,dotation2),'dans la zone que la cuisine partage');
  assert.equal(s2.chariots.length,n0);
  await page.evaluate(()=>Sim.ateliers.reglePartage('cuisine',null));
  await page.waitForFunction(()=>!Sim.ateliers.state.partages);
  // Le quai qui rejoint la zone choisie : c'est sa zone — le quai ; la fiche le dit.
  await page.evaluate(()=>Sim.ateliers.reglePartage('quais','cuisine'));
  await page.waitForFunction(()=>(Sim.ateliers.state.partages||{}).quais==='cuisine');
  assert.equal(await page.evaluate(()=>'attentes' in Sim.ateliers.site()),false);
  assert.equal(await (await choix()).inputValue(),'');
  await page.evaluate(()=>Sim.ateliers.reglePartage('quais',null));
  await page.waitForFunction(()=>!Sim.ateliers.state.partages);
  assert.equal(await (await choix()).inputValue(),'cuisine');
  assert.equal(await journee(),avant);

  // 7. Dans un site disposé par l'utilisateur (évolution 20 b) aussi.
  await page.evaluate(()=>Sim.ateliers.regleDisposition(OrlyDisposition.depuisLeSite(Sim.ateliers.site()),''));
  await page.waitForFunction(()=>!!Sim.ateliers.state.disposition);
  const s3=await scene(T),cuisine3=s3.zones.find(z=>z.id==='cuisine');
  assert.ok(aCharger(s3).length>0);
  for(const o of aCharger(s3))assert.ok(dans(o,cuisine3),'site disposé : dans la cuisine');
  assert.equal(s3.chariots.length,n0);
  await page.evaluate(()=>Sim.ateliers.regleDisposition(null,''));
  await page.waitForFunction(()=>!Sim.ateliers.state.disposition);

  // 8. Après un rechargement, le réglage est là ; « Tout sauvegarder » le porte, « Restaurer » le rend ; une sauvegarde
  //    d'avant, sans lui, se relit : ce qui attend le chargement est au quai.
  await page.reload();await pret();
  assert.deepEqual(await attentes(),{quais:'cuisine'});
  assert.equal(await (await choix()).inputValue(),'cuisine');
  await nav.aller(page,'u-sauvegarde');
  const dl=page.waitForEvent('download');await page.locator('#sauvegarde-export').click();
  const sauvegarde=JSON.parse(fs.readFileSync(await (await dl).path(),'utf8')),lu=v=>(typeof v==='string'?JSON.parse(v):v);
  assert.deepEqual(lu(sauvegarde.contenu['ory-ateliers-v1']).attentes,{quais:'cuisine'},'dans la sauvegarde');
  const ancienne=JSON.parse(JSON.stringify(sauvegarde)),texte=typeof ancienne.contenu['ory-ateliers-v1']==='string';
  {const e=lu(ancienne.contenu['ory-ateliers-v1']);delete e.attentes;ancienne.contenu['ory-ateliers-v1']=texte?JSON.stringify(e):e;}
  await restaurer('ory-sauvegarde-ancienne.json',ancienne);
  assert.equal(await attentes(),null,'une sauvegarde d’avant : pas de réglage');
  assert.equal(await (await choix()).inputValue(),'');
  // (La sauvegarde porte son propre programme de vols : l'heure se reprend dans sa journée.)
  const s4=await scene(await heure());
  assert.ok(aCharger(s4).length>0,'des chariots attendent le chargement');
  for(const o of aCharger(s4))assert.ok(dans(o,s4.zones.find(z=>z.id==='quais')),'une sauvegarde d’avant : au quai');
  await restaurer('ory-sauvegarde.json',sauvegarde);
  assert.deepEqual(await attentes(),{quais:'cuisine'},'restaurée');

  // 9. Une zone qui n'existe pas est refusée, sans rien changer ; le nom d'une zone s'affiche tel quel, échappé.
  assert.equal(await page.evaluate(()=>Sim.ateliers.changer(()=>Sim.ateliers.regleAttente('quais','inconnue'),'')),false,'refusé');
  assert.deepEqual(await attentes(),{quais:'cuisine'},'rien n’est changé');
  await page.evaluate(()=>Sim.editor.change(()=>{Sim.editor.state.zones.find(z=>z.id==='dotation').nom='Dotation <i>bis</i> & "co"';},''));
  const c9=await choix();
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-at="h"] [data-at-champ=attente] option')].some(o=>o.textContent.includes('<i>bis</i>')));
  assert.equal(await c9.locator('i').count(),0,'le nom n’est pas lu comme du HTML');
  assert.equal(await c9.locator('option[value=dotation]').textContent(),'Dotation <i>bis</i> & "co"');

  // 10. « le quai » retire le réglage.
  await (await choix()).selectOption('');
  await page.waitForFunction(()=>!Sim.ateliers.state.attentes);
  assert.equal('attentes' in (await page.evaluate(()=>JSON.parse(localStorage.getItem('ory-ateliers-v1')))),false);

  // 11. La version 2 n'a pas ce champ.
  await page.goto(pathToFileURL(path.resolve(__dirname,'../v2/index.html')).href);
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.unite);
  assert.equal(await page.evaluate(()=>typeof Sim.ateliers.champAttente),'undefined');

  x.effacer();
  assert.deepEqual(erreurs,[]);
  console.log('direct-attente-browser : ok — dans la fiche de l’équipe de handling, « Ce qui attend le chargement se range dans la zone de : » (le quai, ou une autre zone du site) ; sans réglage, les lots en attente de chargement sur le quai ; avec lui, dans la zone choisie et plus sur le quai, autant de chariots dessinés, aucun sur un autre ; la journée inchangée ; « Annuler » et « Rétablir » ; le service choisi désigne sa zone (zone partagée, site disposé) ; le rechargement, « Tout sauvegarder » et « Restaurer », une sauvegarde d’avant ; une zone inconnue refusée, un nom de zone échappé ; la version 2 sans ce champ.');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

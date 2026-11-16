/* Évolution 20 (a) — qui partage la zone de qui, dans la vue en direct (v1).
 *   — une annexe rattachée à un service n'a pas de zone à elle : ses équipes
 *     sont dans la zone de son parent ; sa fiche le dit ;
 *   — dans la fiche d'un service, section « Avancé », à côté de la part de
 *     surface : « Dans la vue en direct, partage la zone de » (aucun, ou un
 *     autre service). Les deux services forment une seule zone, au nom du
 *     service choisi ; une boucle est refusée en la nommant, sous le champ ;
 *   — le réglage se sauvegarde avec les équipes, s'annule, revient après un
 *     rechargement ; une sauvegarde d'avant se relit sans lui ;
 *   — aucun calcul ne change ; à côté de la scène, chaque service garde sa
 *     ligne ; la version 2 n'a pas ce champ.
 * Chaque étape attend son effet, pas un délai. Unité, équipes et vols fictifs. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),erreurs=[];
 page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
 const M='#mu-services';
 const pret=()=>page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.unite&&window.OrlySiteReglages&&!!Sim.ateliers.resultat);
 /** La fiche d'un service, sa section « Avancé » ouverte : le choix de la zone y est, après la part de surface. */
 const fiche=async service=>{
   await nav.aller(page,'mu-services');
   await page.locator(`${M} [data-mu-choisir="${service}"]`).click();
   await page.waitForSelector(`${M} [data-mu-encadrement="${service}"]`,{state:'attached'});
   if(!(await page.locator(`${M} [data-mu-section=avance]`).evaluate(d=>d.open)))await page.locator(`${M} [data-mu-section=avance] > summary`).click();
   await page.waitForSelector(`${M} [data-site-partage="${service}"]`);
   return page.locator(`${M} [data-site-partage="${service}"]`);
 };
 const partages=()=>page.evaluate(()=>Sim.ateliers.state.partages||null);
 const journee=()=>page.evaluate(()=>JSON.stringify(Sim.ateliers.resultat));
 const zones=()=>page.evaluate(()=>Sim.ateliers.site(Sim.reglages.etat.regime).zones.map(z=>({id:z.id,nom:z.nom,services:z.services,ateliers:z.ateliers,lignes:(z.lignes||[]).map(l=>l.ateliers),part:z.part})));
 const mot=()=>page.locator(`${M} .site-partage small`).first().textContent();
 const relief=async()=>{await nav.aller(page,'j-plan',{relief:true});await page.waitForFunction(()=>document.body.dataset.direct==='relief'&&Sim.direct.etatVue().images>0);
   await page.waitForFunction(()=>!Sim.direct.etatVue().enMouvement);return page.evaluate(()=>Sim.direct.etatVue());};
 const restaurer=async(nom,contenu)=>{
  await nav.aller(page,'u-sauvegarde');
  await page.locator('#sauvegarde-import').setInputFiles({name:nom,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(contenu))});
  assert.match(await page.locator('dialog.question[open] h2').textContent({timeout:5000}),/Restaurer cette sauvegarde/);
  const recharge=page.waitForEvent('load');await nav.repondre(page);await recharge;await page.waitForLoadState('load');await pret();
 };
 try{
  const x=await F.charger(page,nav,URL,{pageId:'j-plan',relief:true});await pret();
  // Les effectifs calculés de l'unité se posent au premier changement : la journée de référence est celle d'un changement
  // neutre, et un second la laisse identique. Le réglage de la zone se compare à elle.
  const neutre=()=>page.evaluate(()=>{Sim.ateliers.changer(()=>{},'');return JSON.stringify(Sim.ateliers.resultat);});
  const avant=await neutre();
  assert.equal(await neutre(),avant,'un changement neutre laisse la journée identique');
  const annexe=await page.evaluate(()=>Sim.editor.state.zones.find(z=>z.kind==='annexe'&&z.parent==='prepa'&&!z.autonome).id);
  assert.equal(await partages(),null,'aucune zone partagée');

  // 1. L'annexe rattachée au montage n'a pas de zone à elle : son équipe est dans la production. Une seule ligne robotisée.
  const z0=await zones(),food0=z0.find(z=>z.id==='food');
  assert.equal(z0.some(z=>z.id===annexe),false,'pas de zone pour l’annexe rattachée');
  assert.deepEqual(food0.services,['preparation','prepa',annexe]);
  assert.ok(food0.ateliers.includes('mob')&&food0.ateliers.includes('rb'),'ses équipes sont dans la production');
  assert.deepEqual(z0.flatMap(z=>z.lignes),[['rb']],'une seule ligne dans tout le site');
  const e0=await relief();
  assert.deepEqual(e0.zones,z0.map(z=>z.id),'la scène montre ces zones');
  assert.equal(e0.ilots.find(i=>i.atelier==='mob').zone,'food');
  // Sa fiche le dit : « aucun » y est la zone de son service.
  const choixAnnexe=await fiche(annexe);
  assert.equal(await choixAnnexe.inputValue(),'');
  assert.match(await choixAnnexe.locator('option').first().textContent(),/^aucun : la zone de .+, son service$/);
  assert.match(await mot(),/Aujourd’hui, il est dans la zone FOOD, avec /);

  // 2. Le choix est dans « Avancé », après la part de surface : « aucun », puis les autres services ; pas le service lui-même.
  const choix=await fiche('dotation');
  assert.equal(await page.locator(`${M} label.site-partage`).evaluate(l=>l.firstChild.textContent),'Dans la vue en direct, partage la zone de');
  assert.equal(await page.evaluate(()=>{const s=document.querySelector('#mu-services [data-mu-section=avance]'),a=s.querySelector('.site-surface'),b=s.querySelector('.site-partage');
    return !!(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING);}),true,'après la part de surface');
  const options=await choix.locator('option').evaluateAll(l=>l.map(o=>[o.value,o.textContent]));
  assert.deepEqual(options[0],['','aucun']);
  assert.ok(options.some(o=>o[0]==='cuisine')&&!options.some(o=>o[0]==='dotation'),'les autres services, pas lui-même');
  assert.match(await mot(),/Aujourd’hui, il a sa propre zone\. Ce réglage ne change aucun calcul\.$/);
  // La fiche de la préparation : « aucun » y est la production.
  assert.equal(await (await fiche('preparation')).locator('option').first().textContent(),'aucun : la zone FOOD, avec la préparation et le montage');

  // 3. La dotation partage la zone de la cuisine : une seule zone, au nom de la cuisine, avec les équipes des deux ; leurs
  //    parts s'additionnent ; la journée ne change pas.
  const part=id=>z0.find(z=>z.id===id).part;
  await (await fiche('dotation')).selectOption('cuisine');
  await page.waitForFunction(()=>(Sim.ateliers.state.partages||{}).dotation==='cuisine');
  assert.deepEqual(await partages(),{dotation:'cuisine'});
  assert.equal(await journee(),avant,'la journée est la même, champ par champ');
  const z1=await zones(),cu=z1.find(z=>z.id==='cuisine');
  assert.equal(z1.some(z=>z.id==='dotation'),false);
  assert.deepEqual([cu.services.slice().sort(),z1.length],[['cuisine','dotation'],z0.length-1]);
  assert.ok(cu.ateliers.includes('do')&&cu.ateliers.includes('cu1'),'les équipes des deux');
  assert.ok(Math.abs(cu.part-(part('cuisine')+part('dotation')))<1e-9,'leurs parts s’additionnent');
  await page.waitForFunction(()=>/Aujourd’hui, il est dans la zone .+, avec /.test(document.querySelector('#mu-services .site-partage small').textContent));
  assert.equal(await page.locator(`${M} [data-site-partage=dotation]`).inputValue(),'cuisine');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('ory-ateliers-v1')).partages),{dotation:'cuisine'},'gardé dans ce navigateur');
  // La scène : la zone de la dotation n'est plus ; son îlot est dans celle de la cuisine. À côté, chaque service garde sa ligne.
  const e1=await relief();
  assert.equal(e1.zones.includes('dotation'),false);
  assert.equal(e1.ilots.find(i=>i.atelier==='do').zone,'cuisine');
  if(await page.locator('#direct-panneau').evaluate(p=>p.hidden||!p.checkVisibility()))await page.locator('#direct-en-ce-moment').click();
  await page.waitForSelector('#direct-panneau [data-direct-service=cuisine]');
  assert.equal(await page.locator('#direct-panneau [data-direct-service=dotation]').count(),1,'la dotation garde sa ligne');
  assert.equal(await page.locator('#direct-panneau [data-direct-service=cuisine]').count(),1,'la cuisine garde la sienne');

  // 4. Une boucle est refusée en la nommant, sous le champ : la cuisine ne peut pas partager la zone de la dotation.
  const cuisine=await fiche('cuisine');
  await cuisine.selectOption('dotation');
  const refus=page.locator(`${M} .site-partage + .champ-erreur`);
  await refus.waitFor();
  assert.match(await refus.textContent(),/^.+ est déjà dans la zone de .+ — ce serait une boucle : (.+) → (.+) → \1\.$/);
  assert.equal(await cuisine.inputValue(),'','le choix revient à « aucun »');
  assert.equal(await cuisine.getAttribute('aria-invalid'),'true');
  assert.deepEqual(await partages(),{dotation:'cuisine'},'rien n’est changé');
  // Un choix permis efface le refus.
  await cuisine.selectOption('armement');
  await page.waitForFunction(()=>(Sim.ateliers.state.partages||{}).cuisine==='armement');
  assert.equal(await refus.count(),0);
  assert.equal(await cuisine.getAttribute('aria-invalid'),null);
  // De proche en proche : la dotation et la cuisine sont dans la zone de l'armement.
  const z2=await zones(),ar=z2.find(z=>z.id==='armement');
  assert.deepEqual([ar.services.slice().sort(),z2.some(z=>z.id==='cuisine'),z2.some(z=>z.id==='dotation')],[['armement','cuisine','dotation'],false,false]);
  assert.equal(await journee(),avant);

  // 5. « Annuler » revient en arrière ; « aucun » rend au service sa zone.
  await page.locator('#btn-annuler').click();
  await page.waitForFunction(()=>!(Sim.ateliers.state.partages||{}).cuisine);
  assert.deepEqual(await partages(),{dotation:'cuisine'});
  await (await fiche('dotation')).selectOption('');
  await page.waitForFunction(()=>!Sim.ateliers.state.partages);
  assert.deepEqual((await zones()).map(z=>z.id),z0.map(z=>z.id),'le site d’avant');
  assert.equal(await journee(),avant);

  // 6. Après un rechargement, le réglage est là ; « Tout sauvegarder » le porte, « Restaurer » le rend ; une sauvegarde
  //    d'avant, sans lui, se relit : chaque service a sa zone.
  await (await fiche('dotation')).selectOption('cuisine');
  await page.waitForFunction(()=>(Sim.ateliers.state.partages||{}).dotation==='cuisine');
  await page.reload();await pret();
  assert.deepEqual(await partages(),{dotation:'cuisine'});
  assert.equal(await (await fiche('dotation')).inputValue(),'cuisine');
  await nav.aller(page,'u-sauvegarde');
  const dl=page.waitForEvent('download');await page.locator('#sauvegarde-export').click();
  const sauvegarde=JSON.parse(fs.readFileSync(await (await dl).path(),'utf8')),lu=v=>(typeof v==='string'?JSON.parse(v):v);
  assert.deepEqual(lu(sauvegarde.contenu['ory-ateliers-v1']).partages,{dotation:'cuisine'},'dans la sauvegarde');
  const ancienne=JSON.parse(JSON.stringify(sauvegarde)),texte=typeof ancienne.contenu['ory-ateliers-v1']==='string';
  {const e=lu(ancienne.contenu['ory-ateliers-v1']);delete e.partages;ancienne.contenu['ory-ateliers-v1']=texte?JSON.stringify(e):e;}
  await restaurer('ory-sauvegarde-ancienne.json',ancienne);
  assert.equal(await partages(),null,'une sauvegarde d’avant : aucune zone partagée');
  assert.deepEqual((await zones()).map(z=>[z.id,z.services]),z0.map(z=>[z.id,z.services]),'le même site qu’avant le réglage');
  await restaurer('ory-sauvegarde.json',sauvegarde);
  assert.deepEqual(await partages(),{dotation:'cuisine'},'restaurée');

  // 7. Une annexe à part entière garde sa zone : rattachée, elle la perd ; à part entière de nouveau, elle la retrouve.
  await page.evaluate(id=>Sim.editor.change(()=>{const z=Sim.editor.state.zones.find(v=>v.id===id);z.autonome=true;delete z.parent;},''),annexe);
  await page.waitForFunction(id=>Sim.ateliers.site().zones.some(z=>z.id===id),annexe);
  const z3=await zones();
  assert.deepEqual(z3.find(z=>z.id===annexe).ateliers,['mob'],'à part entière : sa zone, avec son équipe');
  assert.equal(z3.find(z=>z.id==='food').services.includes(annexe),false);
  assert.equal(await (await fiche(annexe)).locator('option').first().textContent(),'aucun');

  // 8. La version 2 n'a pas ce champ.
  await page.goto(pathToFileURL(path.resolve(__dirname,'../v2/index.html')).href);
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.unite);
  assert.equal(await page.evaluate(()=>typeof window.OrlySiteReglages),'undefined');

  x.effacer();
  assert.deepEqual(erreurs,[]);
  console.log('site-zones-browser : ok — l’annexe rattachée dans la zone de son service, une seule ligne robotisée ; le choix « partage la zone de » dans la fiche ; une zone pour deux services, leurs parts ajoutées, la journée inchangée, chaque service à sa ligne à côté de la scène ; la boucle refusée en la nommant ; « Annuler », le rechargement, « Tout sauvegarder » et « Restaurer », une sauvegarde d’avant ; une annexe à part entière garde sa zone ; la version 2 sans ce champ');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

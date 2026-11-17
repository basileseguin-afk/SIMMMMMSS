/* Correction 21 (c) — le poste de travail, pour tout un service d'un coup (v1).
 *   — dans la fiche d'un service, section « Avancé », à côté de « Des
 *     rayonnages dans sa zone » : « Poste de travail de ses équipes, dans la
 *     vue en direct » — laisser à chaque équipe (par défaut), ou des tables,
 *     des trolleys, une machine, des rayonnages, aucun : les mots de la fiche
 *     d'une équipe ;
 *   — le choix s'applique aux équipes du service qui n'ont pas leur propre
 *     réglage ; une équipe peut toujours avoir le sien : sa fiche dit « celui
 *     de son service » tant qu'elle n'en a pas ;
 *   — le réglage se sauvegarde avec les équipes, s'annule, revient après un
 *     rechargement ; une sauvegarde d'avant se relit sans lui ;
 *   — aucun calcul ne change ; la version 2 n'a pas ce choix.
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
 const M='#mu-services';
 const pret=()=>page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.unite&&window.OrlySiteReglages&&!!Sim.ateliers.resultat);
 /** La fiche d'un service, sa section « Avancé » ouverte. */
 const fiche=async service=>{
   await nav.aller(page,'mu-services');
   await page.locator(`${M} [data-mu-choisir="${service}"]`).click();
   await page.waitForSelector(`${M} [data-mu-encadrement="${service}"]`,{state:'attached'});
   if(!(await page.locator(`${M} [data-mu-section=avance]`).evaluate(d=>d.open)))await page.locator(`${M} [data-mu-section=avance] > summary`).click();
   await page.waitForSelector(`${M} [data-site-surface="${service}"]`);
   return page.locator(`${M} [data-mu-section=avance]`);
 };
 const choixDe=async service=>(await fiche(service)).locator(`[data-site-poste="${service}"]`);
 /** La fiche d'une équipe, ouverte : son choix « Poste de travail, dans la vue en direct ». */
 const posteDeLEquipe=async id=>{
   await nav.aller(page,'at-equipes');
   await page.evaluate(id=>{Sim.ateliers.ouvert=id;Sim.ateliers.rendre();},id);
   await page.waitForSelector(`[data-at="${id}"] [data-at-champ=poste]`,{state:'attached'});
   return page.locator(`[data-at="${id}"] [data-at-champ=poste]`);
 };
 const postes=()=>page.evaluate(()=>Sim.ateliers.state.postes||null);
 const journee=()=>page.evaluate(()=>JSON.stringify(Sim.ateliers.resultat));
 /** Dans la scène en relief : le poste de travail de l'îlot de chaque équipe. */
 const ilots=async()=>{
   await nav.aller(page,'j-plan',{relief:true});
   await page.waitForFunction(()=>document.body.dataset.direct==='relief'&&Sim.direct.etatVue().images>0);
   await page.waitForFunction(()=>!Sim.direct.etatVue().enMouvement);
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   return page.evaluate(()=>Object.fromEntries(Sim.direct.ilots.map(i=>[i.atelier,{poste:i.poste,tables:i.tables.length,trolleys:i.trolleys.length,service:i.service}])));
 };
 const restaurer=async(nom,contenu)=>{
  await nav.aller(page,'u-sauvegarde');
  await page.locator('#sauvegarde-import').setInputFiles({name:nom,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(contenu))});
  assert.match(await page.locator('dialog.question[open] h2').textContent({timeout:5000}),/Restaurer cette sauvegarde/);
  const recharge=page.waitForEvent('load');await nav.repondre(page);await recharge;await page.waitForLoadState('load');await pret();
 };
 try{
  const x=await F.charger(page,nav,URL,{pageId:'j-plan',relief:true});await pret();
  const neutre=()=>page.evaluate(()=>{Sim.ateliers.changer(()=>{},'');return JSON.stringify(Sim.ateliers.resultat);});
  const avant=await neutre();
  assert.equal(await neutre(),avant,'un changement neutre laisse la journée identique');
  assert.equal(await postes(),null,'aucun réglage');
  // Les équipes de la cuisine (deux, sur des tables par défaut) ; le site de la vue.
  const equipes=await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>a.service==='cuisine').map(a=>a.id));
  assert.ok(equipes.length>=2,'la cuisine fictive a plusieurs équipes');
  const site0=await page.evaluate(()=>JSON.stringify(Sim.ateliers.site(Sim.reglages.etat.regime)));

  // 1. Sans le réglage : chaque équipe de la cuisine est à ses tables.
  const i0=await ilots();
  for(const id of equipes)assert.deepEqual([i0[id].poste,i0[id].tables>0],['tables',true],id+' : des tables');

  // 2. La fiche de la cuisine, section « Avancé » : le choix, après la case des rayonnages ; « laisser à chaque équipe » par défaut.
  const c=await choixDe('cuisine');
  assert.equal(await c.inputValue(),'');
  assert.match(await page.locator(`${M} label.site-poste`).textContent(),/^Poste de travail de ses équipes, dans la vue en direct/);
  assert.deepEqual(await c.locator('option').evaluateAll(l=>l.map(o=>[o.value,o.textContent])),
    [['','laisser à chaque équipe'],['tables','des tables'],['trolleys','des trolleys'],['machine','une machine'],['rayonnages','des rayonnages'],['aucun','aucun']]);
  assert.match(await page.locator(`${M} #site-poste-mot`).textContent(),/qui n’ont pas leur propre réglage.*une équipe peut toujours avoir le sien.*aucun calcul/);
  assert.deepEqual(await page.locator(`${M} [data-mu-section=avance]`).evaluate(s=>[...s.querySelectorAll('[data-site-surface],[data-site-partage],[data-site-rayonnages],[data-site-poste]')].map(e=>Object.keys(e.dataset).find(k=>k.startsWith('site')))),
    ['siteSurface','sitePartage','siteRayonnages','sitePoste'],'à côté de « Des rayonnages dans sa zone »');
  // Les mêmes mots que dans la fiche d'une équipe.
  const mots=await (await posteDeLEquipe(equipes[0])).locator('option').evaluateAll(l=>l.map(o=>[o.value,o.textContent.trim()]));
  assert.deepEqual(mots.slice(1),[['tables','des tables'],['trolleys','des trolleys'],['machine','une machine'],['rayonnages','des rayonnages'],['aucun','aucun']]);
  assert.equal(mots[0][1],'par défaut (des tables)');

  // 3. On choisit « des trolleys » pour la cuisine : le réglage est gardé avec les équipes ; aucun calcul ne change ; le site non plus.
  await (await choixDe('cuisine')).selectOption('trolleys');
  await page.waitForFunction(()=>(Sim.ateliers.state.postes||{}).cuisine==='trolleys');
  assert.deepEqual(await postes(),{cuisine:'trolleys'});
  assert.equal(await journee(),avant,'la journée est identique, champ par champ');
  assert.equal(await page.evaluate(()=>JSON.stringify(Sim.ateliers.site(Sim.reglages.etat.regime))),site0,'le site généré est le même');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('ory-ateliers-v1')).postes),{cuisine:'trolleys'},'gardé dans ce navigateur');
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.some(a=>a.poste)),false,'aucune équipe n’a reçu de réglage à elle');
  assert.equal(await (await choixDe('cuisine')).inputValue(),'trolleys');

  // 4. Dans la scène : toutes les équipes de la cuisine sont à des trolleys ; les autres services ne changent pas.
  const i1=await ilots();
  for(const id of equipes)assert.deepEqual([i1[id].poste,i1[id].tables,i1[id].trolleys>0],['trolleys',0,true],id+' : des trolleys');
  for(const [id,v] of Object.entries(i1))if(v.service!=='cuisine')assert.deepEqual(v,i0[id],id+' : comme avant');

  // 5. Une équipe peut avoir son propre réglage : sa fiche dit « celui de son service » tant qu'elle n'en a pas ; avec le
  //    sien, elle le garde, les autres suivent le service ; la fiche du service compte les équipes qui ont le leur.
  const p=await posteDeLEquipe(equipes[0]);
  assert.equal(await p.inputValue(),'');
  assert.equal((await p.locator('option').first().textContent()).trim(),'celui de son service (des trolleys)');
  await p.selectOption('tables');
  await page.waitForFunction(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).poste==='tables',equipes[0]);
  const i2=await ilots();
  assert.deepEqual([i2[equipes[0]].poste,i2[equipes[0]].tables>0],['tables',true],'son propre réglage');
  for(const id of equipes.slice(1))assert.equal(i2[id].poste,'trolleys',id+' suit le service');
  await choixDe('cuisine');
  assert.match(await page.locator(`${M} #site-poste-mot`).textContent(),new RegExp('1 de ses '+equipes.length+' équipes a son propre réglage'));
  // Elle rend son réglage : elle suit de nouveau le service.
  await (await posteDeLEquipe(equipes[0])).selectOption('');
  await page.waitForFunction(id=>!Sim.ateliers.state.ateliers.find(a=>a.id===id).poste,equipes[0]);
  assert.equal((await ilots())[equipes[0]].poste,'trolleys');
  assert.equal(await journee(),avant);

  // 6. « Annuler » revient à l'équipe qui avait son réglage ; « Rétablir » le lui retire ; le choix du service se remet à jour.
  await choixDe('cuisine');
  await page.locator('#btn-annuler').click();
  await page.waitForFunction(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).poste==='tables',equipes[0]);
  await page.locator('#btn-retablir').click();
  await page.waitForFunction(id=>!Sim.ateliers.state.ateliers.find(a=>a.id===id).poste,equipes[0]);
  assert.equal(await (await choixDe('cuisine')).inputValue(),'trolleys');

  // 7. Après un rechargement, le réglage est là ; « Tout sauvegarder » le porte, « Restaurer » le rend ; une sauvegarde
  //    d'avant, sans lui, se relit : chaque équipe à son poste par défaut.
  await page.reload();await pret();
  assert.deepEqual(await postes(),{cuisine:'trolleys'});
  assert.equal(await (await choixDe('cuisine')).inputValue(),'trolleys');
  for(const id of equipes)assert.equal((await ilots())[id].poste,'trolleys',id+' après le rechargement');
  await nav.aller(page,'u-sauvegarde');
  const dl=page.waitForEvent('download');await page.locator('#sauvegarde-export').click();
  const sauvegarde=JSON.parse(fs.readFileSync(await (await dl).path(),'utf8')),lu=v=>(typeof v==='string'?JSON.parse(v):v);
  assert.deepEqual(lu(sauvegarde.contenu['ory-ateliers-v1']).postes,{cuisine:'trolleys'},'dans la sauvegarde');
  const ancienne=JSON.parse(JSON.stringify(sauvegarde)),texte=typeof ancienne.contenu['ory-ateliers-v1']==='string';
  {const e=lu(ancienne.contenu['ory-ateliers-v1']);delete e.postes;ancienne.contenu['ory-ateliers-v1']=texte?JSON.stringify(e):e;}
  await restaurer('ory-sauvegarde-ancienne.json',ancienne);
  assert.equal(await postes(),null,'une sauvegarde d’avant : pas de réglage');
  assert.equal(await (await choixDe('cuisine')).inputValue(),'');
  const i7=await ilots();
  for(const id of equipes)assert.equal(i7[id].poste,'tables',id+' : son poste par défaut');
  await restaurer('ory-sauvegarde.json',sauvegarde);
  assert.deepEqual(await postes(),{cuisine:'trolleys'},'restaurée');

  // 8. « laisser à chaque équipe » retire le réglage.
  await (await choixDe('cuisine')).selectOption('');
  await page.waitForFunction(()=>!Sim.ateliers.state.postes);
  assert.equal('postes' in (await page.evaluate(()=>JSON.parse(localStorage.getItem('ory-ateliers-v1')))),false);
  for(const id of equipes)assert.equal((await ilots())[id].poste,'tables');

  // 9. La version 2 n'a pas ce choix.
  await page.goto(pathToFileURL(path.resolve(__dirname,'../v2/index.html')).href);
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.unite);
  assert.equal(await page.evaluate(()=>typeof window.OrlySiteReglages),'undefined');
  assert.equal(await page.evaluate(()=>typeof Sim.ateliers.reglePosteDuService),'undefined');

  x.effacer();
  assert.deepEqual(erreurs,[]);
  console.log('site-postes-browser : ok — dans la fiche d’un service, « Poste de travail de ses équipes, dans la vue en direct », après « Des rayonnages dans sa zone », avec les mots de la fiche d’une équipe ; le choix s’applique à toutes les équipes du service dans la scène, la journée et le site inchangés ; une équipe avec son propre réglage le garde, sa fiche dit « celui de son service » tant qu’elle n’en a pas ; « Annuler » et « Rétablir » ; le rechargement, « Tout sauvegarder » et « Restaurer », une sauvegarde d’avant ; la version 2 sans ce choix.');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

/* Évolution 20 (d) — des rayonnages et des postes dans la même zone (v1).
 *   — dans la fiche d'un service, section « Avancé » : une case « Des
 *     rayonnages dans sa zone », non cochée par défaut ; la fiche du magasin
 *     dit qu'il en a toujours, sans case ;
 *   — cochée : dans la vue en direct, des rayonnages au fond de la zone, les
 *     tables de ses équipes devant, les deux dessinés, sans chevauchement ;
 *     sans elle, la zone d'avant ;
 *   — le réglage se sauvegarde avec les équipes, s'annule, revient après un
 *     rechargement ; une sauvegarde d'avant se relit sans lui ;
 *   — aucun calcul ne change ; la version 2 n'a pas cette case.
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
 const caseDe=async service=>(await fiche(service)).locator(`[data-site-rayonnages="${service}"]`);
 const rayonnages=()=>page.evaluate(()=>Sim.ateliers.state.rayonnages||null);
 const journee=()=>page.evaluate(()=>JSON.stringify(Sim.ateliers.resultat));
 /** Ce que la scène en relief dessine dans une zone : ses rayonnages, les tables et l'emprise des îlots de ses équipes. */
 const dessine=async zone=>{
   await nav.aller(page,'j-plan',{relief:true});
   await page.waitForFunction(()=>document.body.dataset.direct==='relief'&&Sim.direct.etatVue().images>0);
   await page.waitForFunction(()=>!Sim.direct.etatVue().enMouvement);
   return page.evaluate(id=>{
     const v=Sim.direct,z=v.site.zones.find(q=>q.id===id),o=v.decor.objets.filter(q=>q.zone===id);
     return {zone:{x:z.x,y:z.y,w:z.w,h:z.h,bande:z.bande,minimum:z.minimum,surface:z.surface},regles:(z.rayonnages||[]).length,
       rayonnages:o.filter(q=>q.quoi==='rayonnage').map(q=>({x:q.x,y:q.y,w:q.w,h:q.d})),tables:o.filter(q=>q.quoi==='table').map(q=>({x:q.x,y:q.y,w:q.w,h:q.d})),
       ilots:v.ilots.filter(i=>i.zone===id&&!i.machines&&!i.allee).map(i=>({atelier:i.atelier,poste:i.poste,x:i.x,y:i.y,w:i.w,h:i.h}))};
   },zone);
 };
 const seTouchent=(p,q)=>p.x<q.x+q.w-1e-6&&q.x<p.x+p.w-1e-6&&p.y<q.y+q.h-1e-6&&q.y<p.y+p.h-1e-6;
 const dans=(m,z)=>m.x>=z.x-1e-6&&m.y>=z.y-1e-6&&m.x+m.w<=z.x+z.w+1e-6&&m.y+m.h<=z.y+z.h+1e-6;
 const duFond=(m,z)=>(z.bande===0?m.y-z.y:z.y+z.h-(m.y+m.h));
 /** Les rayonnages au fond, les îlots et leurs tables devant : tout dans la zone, rien ne se chevauche, rien n'est effacé. */
 const controler=(d,mot)=>{
   assert.ok(d.rayonnages.length>0,mot+' : des rayonnages dessinés');
   assert.equal(d.rayonnages.length,d.regles,mot+' : toutes les rangées sont dessinées, aucune n’est effacée');
   assert.ok(d.tables.length>0,mot+' : des tables dessinées');
   const fond=Math.max(...d.rayonnages.map(r=>duFond(r,d.zone)+r.h));
   for(const r of d.rayonnages)assert.ok(dans(r,d.zone),mot+' : un rayonnage hors de la zone');
   for(const t of [...d.tables,...d.ilots]){
     assert.ok(dans(t,d.zone),mot+' : un poste hors de la zone');
     for(const r of d.rayonnages)assert.ok(!seTouchent(t,r),mot+' : un poste chevauche un rayonnage');
     assert.ok(duFond(t,d.zone)>=fond-1e-6,mot+' : les postes sont devant les rayonnages');
   }
   assert.ok(fond<=d.zone.h*0.5+1e-6,mot+' : les rayonnages au fond, la moitié de la profondeur au plus');
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
  assert.equal(await rayonnages(),null,'aucun réglage');

  // 1. Sans le réglage : la cuisine n'a pas de rayonnages ; ses tables sont dessinées.
  const d0=await dessine('cuisine');
  assert.deepEqual([d0.regles,d0.rayonnages.length],[0,0]);
  assert.ok(d0.tables.length>0,'les tables de la cuisine');

  // 2. La fiche de la cuisine, section « Avancé » : la case, non cochée ; ce qu'elle fait est dit dessous.
  const c=await caseDe('cuisine');
  assert.equal(await c.isChecked(),false);
  assert.equal((await page.locator(`${M} .site-rayonnages label`).textContent()).trim(),'Des rayonnages dans sa zone','le libellé de la case, sans son explication');
  assert.match(await page.locator(`${M} #site-rayonnages-mot`).textContent(),/au fond de la zone.*gardent leur poste de travail.*devant.*la place des deux.*aucun calcul/);
  // Elle vient après la part de surface et la zone partagée.
  assert.deepEqual(await page.locator(`${M} [data-mu-section=avance]`).evaluate(s=>[...s.querySelectorAll('[data-site-surface],[data-site-partage],[data-site-rayonnages]')].map(e=>Object.keys(e.dataset).find(k=>k.startsWith('site')))),['siteSurface','sitePartage','siteRayonnages']);
  // La fiche du magasin : pas de case — il en a toujours, c'est dit.
  const mag=await fiche('magasin');
  assert.equal(await mag.locator('[data-site-rayonnages]').count(),0);
  assert.match(await mag.locator('p.site-rayonnages').textContent(),/le magasin a toujours des rayonnages dans sa zone/);

  // 3. On coche : le réglage est gardé avec les équipes ; aucun calcul ne change.
  await (await caseDe('cuisine')).check();
  await page.waitForFunction(()=>(Sim.ateliers.state.rayonnages||{}).cuisine===true);
  assert.deepEqual(await rayonnages(),{cuisine:true});
  assert.equal(await journee(),avant,'la journée est identique, champ par champ');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('ory-ateliers-v1')).rayonnages),{cuisine:true},'gardé dans ce navigateur');
  assert.equal(await (await caseDe('cuisine')).isChecked(),true);

  // 4. Dans la scène : des rayonnages au fond de la cuisine, ses tables devant ; les deux sont dessinés, sans chevauchement.
  const d1=await dessine('cuisine');
  controler(d1,'la cuisine');
  assert.equal(d1.tables.length,d0.tables.length,'les équipes gardent leurs tables');
  assert.deepEqual(d1.ilots.map(i=>[i.atelier,i.poste]),d0.ilots.map(i=>[i.atelier,i.poste]),'et leur poste de travail');
  assert.ok(d1.zone.minimum>d0.zone.minimum&&d1.zone.surface>=d1.zone.minimum-1e-9,'la zone garde la place des deux');

  // 5. « Annuler » retire les rayonnages ; « Rétablir » les rend.
  await caseDe('cuisine');
  await page.locator('#btn-annuler').click();
  await page.waitForFunction(()=>!Sim.ateliers.state.rayonnages);
  assert.equal(await (await caseDe('cuisine')).isChecked(),false);
  assert.deepEqual(await dessine('cuisine'),d0,'la zone d’avant, champ par champ');
  await caseDe('cuisine');
  await page.locator('#btn-retablir').click();
  await page.waitForFunction(()=>(Sim.ateliers.state.rayonnages||{}).cuisine===true);
  assert.equal(await journee(),avant);

  // Un service qui partage la zone de la cuisine y trouve ses rayonnages : sa fiche le dit, sa case reste la sienne.
  await page.evaluate(()=>Sim.ateliers.reglePartage('dotation','cuisine'));
  await page.waitForFunction(()=>(Sim.ateliers.state.partages||{}).dotation==='cuisine');
  const cd=await caseDe('dotation');
  assert.equal(await cd.isChecked(),false);
  assert.match(await page.locator(`${M} #site-rayonnages-mot`).textContent(),/Aujourd’hui, sa zone a déjà ceux de /);
  await page.evaluate(()=>Sim.ateliers.reglePartage('dotation',null));
  await page.waitForFunction(()=>!Sim.ateliers.state.partages);
  await caseDe('dotation');
  await page.waitForFunction(()=>!/déjà ceux de/.test(document.querySelector('#mu-services #site-rayonnages-mot').textContent));

  // 6. Le magasin, seul avec ses équipes : l'entrepôt d'aujourd'hui, sur toute sa profondeur ; ses rayonnages ne
  //    dépendent pas du poste de ses équipes (une sauvegarde d'avant donne le même site).
  const equipe=await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.service==='magasin').id);
  const m0=await dessine('magasin'),site0=await page.evaluate(()=>JSON.stringify(Sim.ateliers.site(Sim.reglages.etat.regime).zones.find(z=>z.id==='magasin')));
  assert.ok(m0.rayonnages.length>0,'le magasin a ses rayonnages');
  assert.ok(Math.max(...m0.rayonnages.map(r=>duFond(r,m0.zone)+r.h))>m0.zone.h*0.7,'un entrepôt : des rangées jusque devant');
  await page.evaluate(id=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id===id).poste='tables';},''),equipe);
  await page.waitForFunction(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).poste==='tables',equipe);
  assert.equal(await page.evaluate(()=>JSON.stringify(Sim.ateliers.site(Sim.reglages.etat.regime).zones.find(z=>z.id==='magasin'))),site0,'la zone du magasin, champ par champ');
  await page.evaluate(id=>Sim.ateliers.changer(()=>{delete Sim.ateliers.state.ateliers.find(a=>a.id===id).poste;},''),equipe);
  await page.waitForFunction(id=>!Sim.ateliers.state.ateliers.find(a=>a.id===id).poste,equipe);
  assert.deepEqual(await dessine('magasin'),m0,'l’entrepôt d’avant');
  assert.equal(await journee(),avant);

  // 7. Après un rechargement, le réglage est là ; « Tout sauvegarder » le porte, « Restaurer » le rend ; une sauvegarde
  //    d'avant, sans lui, se relit : pas de rayonnages dans la cuisine.
  await page.reload();await pret();
  assert.deepEqual(await rayonnages(),{cuisine:true});
  assert.equal(await (await caseDe('cuisine')).isChecked(),true);
  await nav.aller(page,'u-sauvegarde');
  const dl=page.waitForEvent('download');await page.locator('#sauvegarde-export').click();
  const sauvegarde=JSON.parse(fs.readFileSync(await (await dl).path(),'utf8')),lu=v=>(typeof v==='string'?JSON.parse(v):v);
  assert.deepEqual(lu(sauvegarde.contenu['ory-ateliers-v1']).rayonnages,{cuisine:true},'dans la sauvegarde');
  const ancienne=JSON.parse(JSON.stringify(sauvegarde)),texte=typeof ancienne.contenu['ory-ateliers-v1']==='string';
  {const e=lu(ancienne.contenu['ory-ateliers-v1']);delete e.rayonnages;ancienne.contenu['ory-ateliers-v1']=texte?JSON.stringify(e):e;}
  await restaurer('ory-sauvegarde-ancienne.json',ancienne);
  assert.equal(await rayonnages(),null,'une sauvegarde d’avant : pas de réglage');
  assert.equal(await (await caseDe('cuisine')).isChecked(),false);
  assert.equal((await dessine('cuisine')).rayonnages.length,0);
  await restaurer('ory-sauvegarde.json',sauvegarde);
  assert.deepEqual(await rayonnages(),{cuisine:true},'restaurée');
  controler(await dessine('cuisine'),'la cuisine, restaurée');

  // 8. On décoche : le réglage disparaît de ce qui est gardé.
  await (await caseDe('cuisine')).uncheck();
  await page.waitForFunction(()=>!Sim.ateliers.state.rayonnages);
  assert.equal('rayonnages' in (await page.evaluate(()=>JSON.parse(localStorage.getItem('ory-ateliers-v1')))),false);

  // 9. La version 2 n'a pas cette case.
  await page.goto(pathToFileURL(path.resolve(__dirname,'../v2/index.html')).href);
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.unite);
  assert.equal(await page.evaluate(()=>typeof window.OrlySiteReglages),'undefined');
  assert.equal(await page.evaluate(()=>typeof Sim.ateliers.regleRayonnages),'undefined');

  x.effacer();
  assert.deepEqual(erreurs,[]);
  console.log('site-rayonnages-browser : ok — dans la fiche d’un service, « Des rayonnages dans sa zone », non cochée par défaut, après la part de surface et la zone partagée ; le magasin en a toujours, sans case ; cochée : des rayonnages au fond de la zone, les tables des équipes devant, les deux dessinés sans chevauchement, la zone plus grande, la journée inchangée ; « Annuler » et « Rétablir » ; le magasin seul, l’entrepôt d’aujourd’hui ; le rechargement, « Tout sauvegarder » et « Restaurer », une sauvegarde d’avant ; la version 2 sans cette case.');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

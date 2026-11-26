/* Évolution 23 (b) — la barre « Journée de vols » seulement là où le jour compte ; sur l'unité fictive et un programme
 * daté fictif de trois jours, à 1 366 × 768.
 *   1. Sans programme daté : aucune barre, nulle part (comme avant).
 *   2. Avec un programme daté : la barre (le sélecteur du jour, l'état de la période — correction 24 e : une étiquette
 *      courte, plus de bouton « Simuler la période », qui est dans « Période ») est présente sur les pages du
 *      bloc « Lire », sur « Programme », « Retours » et « Contrôles » ; absente sur « Services et équipes », « Chemins »,
 *      « Liens entre services », « Réglages », « Fichiers » et le plan.
 *   3. Là où elle est absente, elle ne prend pas de place : le contenu commence plus haut.
 *   4. Le jour choisi se garde d'une page à l'autre, y compris après un passage par une page sans barre ; la journée
 *      calculée reste celle du jour choisi.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const AVEC=['j-chiffres','j-plan','at-planning','j-periode','at-repas','v-departs','j-stocks','j-details','j-comparer','v-programme','v-planche','mu-pas'];
const SANS=['mu-services','mu-flux','u-liens','rg-simulation','u-sauvegarde'];

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 const ctx=await browser.newContext({viewport:{width:1366,height:768}});
 const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=300)=>page.waitForTimeout(ms);
 const barre=()=>page.evaluate(()=>{const b=document.getElementById('periode-bandeau'),r=b.getBoundingClientRect();
   return {visible:b.getClientRects().length>0&&r.height>0,jour:(document.getElementById('periode-jour')||{}).value||null,bouton:!!b.querySelector('[data-pv=lancer]'),etiquette:(b.querySelector('.pj-mot .pj-court')||{}).textContent||null,
     sous:document.body.dataset.sous,tete:Math.round(document.getElementById('tete-page').getBoundingClientRect().height)};});
 try{
  const site=await F.charger(page,nav,URL_V1,{pageId:'j-chiffres'});
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.onglets&&Sim.periode);
  await attendre(400);

  /* ---- 1. sans programme daté : aucune barre ------------------------------------------------------------------- */
  for(const id of ['j-chiffres','v-programme','mu-pas','mu-services','rg-simulation']){
    await nav.aller(page,id,{relief:true,panneau:false});await attendre(150);
    assert.equal((await barre()).visible,false,id+' : sans programme daté, pas de barre du jour');
  }

  /* ---- 2. avec un programme daté : présente là où le jour compte, absente ailleurs ------------------------------ */
  await F.importerVols(page,nav,site.fichier,'vols-dates.csv',F.volsDatesCsv(3,'2031-03-03'));
  await attendre(400);
  assert.deepEqual(await page.evaluate(()=>OrlyOnglets.pagesDuJour()),AVEC,'les pages où le jour compte');
  const hauteurs={};
  for(const id of AVEC){
    await nav.aller(page,id,{relief:true,panneau:false});await attendre(200);
    const b=await barre();
    assert.equal(b.sous,id);
    assert.equal(b.visible,true,id+' : la barre du jour est là');
    assert.equal(b.jour,'2031-03-03',id+' : son sélecteur, sur le premier jour');
    assert.equal(b.bouton,false,id+' : plus de bouton « Simuler la période » dans la barre');
    assert.equal(b.etiquette,'période non simulée',id+' : l’état de la période, en une étiquette');
    hauteurs[id]=b.tete;
  }
  for(const id of SANS){
    await nav.aller(page,id);await attendre(200);
    const b=await barre();
    assert.equal(b.sous,id);
    assert.equal(b.visible,false,id+' : pas de barre du jour');
    assert.equal(await page.locator('#periode-jour:visible, #periode-bandeau [data-pv]:visible').count(),0,id+' : ni sélecteur, ni « Simuler la période »');
    hauteurs[id]=b.tete;
  }
  // Le plan (hors du menu, par « Aller à… ») : pas de barre non plus ; la vue à plat de « En direct », qui se lit : si.
  await nav.aller(page,'u-plan');await attendre(300);
  assert.equal((await barre()).visible,false,'le plan : pas de barre du jour');
  await page.locator('#edit-done').click();await attendre(300);
  await nav.aller(page,'j-plan');await attendre(300);
  assert.deepEqual([await page.evaluate(()=>document.body.dataset.direct),(await barre()).visible],['plat',true],'la vue à plat, qui se lit : la barre y est');

  /* ---- 3. absente, elle ne prend pas de place -------------------------------------------------------------------- */
  // Deux pages de même forme (un titre, une phrase) : avec la barre, l'en-tête est plus haut d'une bande.
  assert.ok(hauteurs['v-programme']-hauteurs['rg-simulation']>=24,'« Réglages » gagne la bande de la barre ('+hauteurs['rg-simulation']+' px d’en-tête, contre '+hauteurs['v-programme']+' sur « Programme »)');
  await nav.aller(page,'mu-services');await attendre(300);
  assert.equal(await page.evaluate(()=>{const t=document.getElementById('tete-page').getBoundingClientRect(),m=document.getElementById('mu-services').getBoundingClientRect();return m.top>=t.bottom-1&&m.top-t.bottom<40;}),true,'le contenu commence sous l’en-tête, sans bande vide');

  /* ---- 4. le jour choisi se garde d'une page à l'autre ---------------------------------------------------------- */
  await nav.aller(page,'j-chiffres');await attendre(200);
  const jour1=await page.evaluate(()=>({jour:Sim.jourVols,departs:Sim.ateliers.a.vols().filter(v=>v.sens==='DEP').length}));
  assert.equal(jour1.jour,'2031-03-03');
  await page.locator('#periode-jour').selectOption('2031-03-04');await attendre(400);
  assert.equal(await page.evaluate(()=>Sim.jourVols),'2031-03-04');
  // Un passage par des pages sans barre : le jour choisi tient, et se retrouve sur la page suivante qui la porte.
  for(const id of ['mu-services','mu-flux','rg-simulation','u-sauvegarde']){
    await nav.aller(page,id);await attendre(150);
    assert.equal((await barre()).visible,false);
    assert.equal(await page.evaluate(()=>Sim.jourVols),'2031-03-04',id+' : le jour choisi reste');
  }
  for(const id of ['at-planning','v-programme','mu-pas','j-chiffres']){
    await nav.aller(page,id);await attendre(200);
    const b=await barre();
    assert.deepEqual([b.visible,b.jour],[true,'2031-03-04'],id+' : la barre revient, sur le jour choisi');
  }
  // « Journée suivante », depuis « Contrôles » : le jour avance, et la Synthèse lit ce jour-là.
  await nav.aller(page,'mu-pas');await attendre(200);
  await page.locator('#periode-bandeau [data-pv=suivant]').click();await attendre(400);
  assert.equal(await page.evaluate(()=>Sim.jourVols),'2031-03-05');
  await nav.aller(page,'mu-services');await attendre(150);
  await nav.aller(page,'j-chiffres');await attendre(200);
  assert.equal((await barre()).jour,'2031-03-05');
  assert.equal(await page.evaluate(()=>Sim.ateliers.a.vols().filter(v=>v.sens==='DEP').length),jour1.departs,'la journée calculée est celle du jour choisi');

  assert.deepEqual(erreurs,[],'aucune erreur de page');
  await site.effacer();
  console.log('barre-jour-browser : ok — sans programme daté, aucune barre ; avec un programme daté, la barre « Journée de vols » est présente sur les douze pages où le jour compte (le bloc « Lire », « Programme », « Retours », « Contrôles ») et absente sur « Services et équipes », « Chemins », « Liens entre services », « Réglages », « Fichiers » et le plan, où elle ne prend plus de place ; le jour choisi tient après un passage par une page sans barre.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

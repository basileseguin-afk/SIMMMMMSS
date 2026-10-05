/* Des chemins lisibles même avec beaucoup de services (retour d'usage du
 * 05/10 : « dès qu'on a beaucoup de services, cela devient incompréhensible »).
 *   - Chemins › Vue d'ensemble : une colonne par chemin, une ligne par service
 *     rangée par étape, une pastille où le chemin passe ; une pastille ouvre le
 *     flux sur ce service, une case vide l'y fait passer ;
 *   - les diagrammes, en étapes : de haut en bas, une bande par étape, sans
 *     défilement de côté ; survoler un service éclaire sa chaîne ;
 *   - « En ligne » revient à l'ancienne disposition, et le choix est retenu.
 *   v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 const C='#mu-carte';
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();

   // 1. Chemins s'ouvre sur la vue d'ensemble : une colonne par flux.
   await page.locator('#menu [data-vers-partie=chemins]').click();await attendre();
   assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-carte',version+' : Chemins s’ouvre sur la vue d’ensemble');
   const flux=await page.evaluate(()=>OrlyParcours.types(Sim.ateliers.state).map(t=>t.id));
   assert.deepEqual(await page.locator(`${C} [data-mu-carte-flux]`).evaluateAll(bs=>bs.map(b=>b.dataset.muCarteFlux)),flux,version+' : une colonne par flux');
   // Une ligne par service des chemins, rangées par étape (de haut en bas).
   const services=await page.evaluate(()=>[...new Set(OrlyParcours.types(Sim.ateliers.state).flatMap(t=>MoteurProduction.servicesDuParcours(t)))].sort());
   const lignes=await page.locator(`${C} tbody tr`).evaluateAll(trs=>trs.map(t=>t.dataset.muCarteSvc));
   assert.deepEqual([...lignes].sort(),services,version+' : une ligne par service');
   assert.equal(lignes[0],'appros','la réception, en haut');
   assert.ok(lignes.indexOf('cuisine')<lignes.indexOf('prepa'),'la cuisine avant le montage');
   assert.match(await page.locator(`${C} tbody .mu-ct-etape`).first().textContent(),/Étape 1/);
   // Une pastille là où le flux passe, rien ailleurs : « Sans cuisine » ne passe pas par la cuisine.
   const arret=(f,s)=>page.locator(`${C} [data-mu-carte-arret="${f}|${s}"]`);
   assert.equal(await arret('complet','cuisine').count(),1);
   assert.equal(await arret('sans-cuisine','cuisine').count(),0);
   assert.equal(await page.locator(`${C} [data-mu-carte-ajout="sans-cuisine|cuisine"]`).count(),1,'mais on peut l’y faire passer');
   assert.match(await arret('complet','cuisine').getAttribute('title'),/« Complet » passe par Cuisine — après Légumerie/);

   // 2. Une case vide : le flux y passe, à sa place.
   await page.locator(`${C} tr[data-mu-carte-svc=decontam]`).hover();
   await page.locator(`${C} [data-mu-carte-ajout="sans-cuisine|decontam"]`).click();await attendre();
   assert.ok(await page.evaluate(()=>MoteurProduction.servicesDuParcours(Sim.ateliers.state.parcours.find(p=>p.id==='sans-cuisine')).includes('decontam')),version+' : la légumerie entre dans « Sans cuisine »');
   assert.equal(await arret('sans-cuisine','decontam').count(),1,'et sa pastille apparaît');
   // « Annuler » revient en arrière.
   await page.evaluate(()=>Sim.ateliers.histoire(false));await attendre();
   assert.equal(await page.evaluate(()=>MoteurProduction.servicesDuParcours(Sim.ateliers.state.parcours.find(p=>p.id==='sans-cuisine')).includes('decontam')),false);

   // 3. Une pastille ouvre le flux, ce service choisi et sa chaîne éclairée.
   await nav.aller(page,'mu-carte');
   await arret('complet','cuisine').click();await attendre();
   assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-flux');
   assert.equal(await page.evaluate(()=>Sim.unite.fluxChoisi),'complet');
   const G='#mu-flux [data-mu-graphe]';
   assert.equal(await page.locator(`${G} [data-noeud=cuisine]`).evaluate(n=>n.classList.contains('sel')),true,'la cuisine est choisie');
   assert.equal(await page.locator(`${G} .gr-svg`).evaluate(s=>s.classList.contains('gr-focus')),true,'sa chaîne est éclairée');
   assert.equal(await page.locator(`${G} [data-noeud=decontam]`).evaluate(n=>n.classList.contains('lie')),true,'la légumerie (avant) en fait partie');
   assert.equal(await page.locator(`${G} [data-noeud=plonge]`).evaluate(n=>n.classList.contains('lie')),false,'la plonge (une autre branche) pâlit');

   // 4. Le diagramme en étapes : de haut en bas, une bande par étape, dans la largeur.
   const y=id=>page.locator(`${G} [data-noeud=${id}]`).evaluate(n=>n.transform.baseVal.consolidate().matrix.f);
   assert.ok(await y('appros')<await y('decontam')&&await y('decontam')<await y('cuisine'),'de haut en bas');
   assert.ok(await page.locator(`${G} .gr-etape`).count()>=4,'une bande par étape');
   assert.match(await page.locator(`${G} .gr-etape text`).first().textContent(),/Étape 1/);
   assert.equal(await page.locator(`${G} .gr-cadre`).evaluate(c=>c.scrollWidth<=c.clientWidth+1),true,'pas de défilement de côté');
   // Survoler un autre service éclaire sa chaîne à lui.
   await page.locator(`${G} [data-noeud=plonge] .gr-fond`).hover();await page.waitForTimeout(80);
   assert.equal(await page.locator(`${G} [data-noeud=dotation]`).evaluate(n=>n.classList.contains('lie')),true,'la plonge livre la dotation');
   assert.equal(await page.locator(`${G} [data-noeud=cuisine]`).evaluate(n=>n.classList.contains('lie')),false);

   // 5. « En ligne » : l'ancienne disposition, de gauche à droite ; le choix est retenu.
   await page.locator(`${G} [data-gr-sens]`).click();await attendre();
   assert.equal(await page.evaluate(()=>localStorage.getItem('ory-graphes-sens')),'ligne');
   const x=id=>page.locator(`${G} [data-noeud=${id}]`).evaluate(n=>n.transform.baseVal.consolidate().matrix.e);
   assert.ok(await x('appros')<await x('decontam'),'de gauche à droite');
   assert.equal(await page.locator(`${G} .gr-etape`).count(),0,'sans bandes');
   await nav.aller(page,'at-chemins');
   assert.equal(await page.locator('#at-parcours [data-gr-sens]').textContent(),'↓ En étapes','le choix vaut pour tous les diagrammes');
   await page.locator('#at-parcours [data-gr-sens]').click();await attendre();
   assert.equal(await page.locator('#at-parcours .gr-etape').count()>0,true,'retour en étapes');

   // 6. Le nom d'une colonne ouvre son flux ; le nom d'un service, sa fiche.
   await nav.aller(page,'mu-carte');
   await page.locator(`${C} [data-mu-carte-flux=sans-cuisine]`).click();await attendre();
   assert.equal(await page.evaluate(()=>[document.body.dataset.sous,Sim.unite.fluxChoisi].join()),'mu-flux,sans-cuisine');
   await nav.aller(page,'mu-carte');
   await page.locator(`${C} tr[data-mu-carte-svc=plonge] [data-mu-ouvrir]`).click();await attendre();
   assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-services');
   assert.equal(await page.locator('.mu-fiche[data-mu-fiche]').getAttribute('data-mu-fiche'),'plonge');
  }
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('vue-ensemble-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

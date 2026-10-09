/* Le plan de l'unité a sa page (refonte du 08/10, étape 5).
 *   1. Équipes › Plan de l'unité ouvre l'édition ; le menu attend qu'on la
 *      termine ; « Terminer » ramène à la page d'avant ; la page n'est pas
 *      retenue (Équipes rouvre la page d'avant).
 *   2. Les calques à gauche, la toile au centre (la barre d'outils flotte
 *      dessus), l'inspecteur à droite ; le plan prend la hauteur.
 *   3. Les calques sont rangés par type, l'œil et le cadenas en pictogrammes.
 *   4. Sur la toile : poignées carrées de 8 px à tout zoom, taille affichée,
 *      cadenas sur une zone fixée, dont l'inspecteur explique les actions
 *      grisées. Les contours du plan rejoué gardent leur épaisseur.
 *   5. « Modifier le plan » (plan rejoué) et la fiche d'un service y mènent ;
 *      « Terminer » ramène d'où l'on vient. Le plan enregistré ne change pas.
 * v1 et v2. Aucune capture : le plan de l'unité est confidentiel. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=150)=>page.waitForTimeout(ms);
 const actif=()=>page.evaluate(()=>document.body.dataset.sous);
 const edition=()=>page.evaluate(()=>document.body.classList.contains('plan-editing'));
 const boite=s=>page.evaluate(s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return b.width||b.height?{x:b.x,y:b.y,w:b.width,h:b.height,bas:b.bottom,droite:b.right}:null;},s);
 const planEnregistre=()=>page.evaluate(()=>localStorage.getItem('orly-plan-v3'));
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   const V=version+' : ';
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre(300);
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(400);

   // 1. Équipes › Plan de l'unité ouvre l'édition.
   await page.locator('#menu [data-vers-partie=organisation]').click();await attendre();
   assert.equal(await actif(),'mu-services');
   await page.locator('#sous-onglets [data-sous-onglet=u-plan]').click();await attendre(300);
   assert.equal(await actif(),'u-plan');
   assert.equal(await edition(),true,V+'la page ouvre l’édition');
   assert.equal(await page.locator('#ariane-partie').textContent(),'Équipes');
   assert.equal(await page.locator('#view-title').textContent(),'Plan de l’unité');
   assert.equal(await page.locator('#btn-problemes').isDisabled(),true,V+'le menu attend la fin de l’édition');
   assert.equal(await page.locator('#en-ce-moment').getAttribute('aria-label'),'La zone choisie');

   // 2. Calques à gauche, toile au centre, inspecteur à droite.
   const calques=await boite('#pe-calques'),toile=await boite('#plan'),insp=await boite('#panneau-edition'),barre=await boite('#plan-editor-toolbar'),haut=await boite('.haut');
   assert.ok(calques&&insp&&barre,V+'les trois panneaux');
   assert.ok(calques.droite<=toile.x+1&&toile.droite<=insp.x+1,V+'calques | toile | inspecteur');
   assert.ok(barre.x>=toile.x&&barre.droite<=toile.droite+1&&barre.y>=toile.y&&barre.bas<toile.y+toile.h/3,V+'la barre d’outils flotte en haut de la toile');
   assert.ok(toile.h/(900-haut.bas)>=0.75,V+'le plan prend la hauteur ('+Math.round(100*toile.h/(900-haut.bas))+' %)');
   for(const t of ['select','rect','poly','hand'])assert.equal(await page.locator(`#plan-editor-toolbar [data-pe-tool=${t}] svg.ico`).count(),1,V+t+' : son pictogramme');
   assert.equal(await page.locator('#plan-editor-toolbar #pe-snap').isChecked(),true,V+'l’aimantation, sur la barre');
   await page.locator('#plan-editor-toolbar #pe-grid').check();
   assert.equal(await page.evaluate(()=>Sim.editor.grid),true,V+'la grille, sur la barre');
   await page.locator('#pe-grid').uncheck();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,V+'sans débord');

   // 3. Les calques, par type ; l'œil et le cadenas en pictogrammes.
   const groupes=await page.locator('#pe-list .pe-groupe-tete').allInnerTexts();
   assert.match(groupes[0],/^Services du plan/i,V+'les services d’abord : '+groupes.join(' | '));
   assert.equal(await page.locator('#pe-list .pe-list-row').count(),await page.evaluate(()=>Sim.editor.state.zones.length),V+'chaque zone a sa ligne');
   assert.doesNotMatch(await page.locator('#pe-list').innerText(),/\bFixé\b|\bLibre\b/,V+'plus de « Fixé » ni « Libre » écrits');
   assert.equal(await page.locator('#pe-list [data-action=lock][data-zone=cuisine] svg.ico').count(),1,V+'le cadenas est un pictogramme');

   // 4. Une zone choisie : poignées carrées de 8 px, taille affichée.
   await page.locator('[data-action=select][data-zone=cuisine]').click();await attendre();
   assert.match(await page.locator('#pe-insp-nom').innerText(),/cuisine/i,V+'l’inspecteur nomme la zone');
   assert.equal(await page.locator('#pe-vide').isVisible(),false);
   const z=await page.evaluate(()=>{const b=OrlyPlan.bounds(Sim.editor.zone);return {w:Math.round(b.w),h:Math.round(b.h)};});
   assert.equal(await page.locator('.pe-taille').textContent(),z.w+' × '+z.h,V+'la taille affichée');
   await page.locator('#pe-focus').click();await attendre();
   const p1=await page.locator('.handle-nw').boundingBox();
   assert.equal(await page.locator('.handle-nw').evaluate(e=>e.tagName),'rect',V+'une poignée carrée');
   assert.ok(p1.width>=8&&p1.width<=10.5,V+'8 px (avec son trait) : '+p1.width);
   await page.locator('#zoom-in').click();await attendre();
   const p2=await page.locator('.handle-nw').boundingBox();
   assert.ok(Math.abs(p1.width-p2.width)<.5,V+'à tout zoom');
   // Fixée : un cadenas sur la toile, des actions grisées et expliquées.
   await page.locator('#pe-list [data-action=lock][data-zone=cuisine]').click();await attendre();
   assert.equal(await page.locator('#pe-list [data-action=lock][data-zone=cuisine]').getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('.pe-cadenas[data-pe-cadenas=cuisine]').count(),1,V+'un cadenas sur la zone');
   assert.equal(await page.locator('#pe-fixe-note').isVisible(),true,V+'l’inspecteur explique');
   for(const id of ['#pe-redraw','#pe-convert','#pe-x'])assert.equal(await page.locator(id).isDisabled(),true,V+id+' grisé');
   assert.equal(await page.locator('.handle-nw').count(),0,V+'plus de poignées');
   await page.locator('#pe-list [data-action=lock][data-zone=cuisine]').click();await attendre();
   assert.equal(await page.locator('#pe-fixe-note').isVisible(),false);

   // « Terminer » : la page d'avant ; Équipes ne rouvre pas le plan.
   await page.locator('#edit-done').click();await attendre(300);
   assert.equal(await edition(),false);
   assert.equal(await actif(),'mu-services',V+'« Terminer » ramène à la page d’avant');
   await nav.aller(page,'j-chiffres');
   await page.locator('#menu [data-vers-partie=organisation]').click();await attendre();
   assert.equal(await actif(),'mu-services',V+'Équipes rouvre la page d’avant, pas le plan');

   // Les contours du plan rejoué gardent leur épaisseur à tout zoom.
   await nav.aller(page,'j-plan');
   assert.equal(await page.locator('#plan .zone .fond').first().evaluate(e=>getComputedStyle(e).vectorEffect),'non-scaling-stroke',V+'contours constants');

   // 5. « Modifier le plan » y mène, « Terminer » ramène au plan rejoué.
   const avantTout=await planEnregistre();
   await page.locator('#btn-edit').click();await attendre(300);
   assert.equal(await actif(),'u-plan');assert.equal(await edition(),true);
   await page.locator('#edit-done').click();await attendre(300);
   assert.equal(await actif(),'j-plan',V+'retour au plan rejoué');
   assert.equal(await page.evaluate(()=>document.activeElement&&document.activeElement.id),'btn-edit',V+'le focus revient au bouton');
   // La fiche d'un service aussi.
   await nav.aller(page,'u-services');
   await page.locator('.svc-tete [data-svc-action=plan]').click();await attendre(300);
   assert.equal(await actif(),'u-plan');
   await page.locator('#edit-done').click();await attendre(300);
   assert.equal(await actif(),'u-services',V+'retour à la liste des services');
   assert.equal(await page.evaluate(()=>Sim.onglets.actif('plan')),'j-plan',V+'arriver « sur le plan » rouvre le plan rejoué');

   // Ouvrir et fermer le plan n'enregistre rien.
   assert.equal(await planEnregistre(),avantTout,V+'le plan enregistré n’a pas bougé');
   assert.deepEqual(errors,[],V+errors.join(' | '));
  }
  console.log('plan-unite-browser : ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

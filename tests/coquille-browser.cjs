/* La coquille (refonte du 08/10) : une barre latérale — les parties dans
 * l'ordre du travail, celle qui est ouverte déplie ses pages —, une barre du
 * haut — le fil d'Ariane et un seul Annuler / Rétablir —, puis le titre de la
 * page et ses outils.
 *   1. Toute page s'atteint en deux clics : sa partie, puis elle.
 *   2. Annuler agit sur ce que la page ouverte modifie (les cases et équipes,
 *      le barème, le plan en édition), au bouton comme au clavier ; dans un
 *      champ de texte, Ctrl Z reste celui du champ.
 *   3. Pendant l'édition du plan, la barre se replie et attend.
 *   4. Rien n'est coupé à 1 280 px, ni à 1 024 px (le plus petit écran visé).
 * v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=150)=>page.waitForTimeout(ms);
 const actif=()=>page.locator('#sous-onglets [aria-selected=true]').getAttribute('data-sous-onglet');
 const eteint=sel=>page.locator(sel).isDisabled();
 const equipes=()=>page.evaluate(()=>Sim.ateliers.state.ateliers.length);
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   const V=version+' : ';
   await page.setViewportSize({width:1440,height:900});
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(300);

   // 0. L'accueil : le titre suffit, rien à annuler. La barre latérale tient
   //    toute la hauteur ; la barre du haut commence à côté d'elle.
   assert.equal(await page.locator('#view-title').textContent(),'Accueil');
   assert.equal(await page.locator('#ariane-partie').isVisible(),false,V+'pas de partie sur l’accueil');
   assert.equal(await page.locator('#sous-onglets').isVisible(),false);
   assert.equal(await eteint('#btn-annuler'),true);assert.equal(await eteint('#btn-retablir'),true);
   assert.match(await page.locator('#btn-annuler').getAttribute('title'),/Rien à annuler/);
   const b=await page.locator('#barre').boundingBox(),h=await page.locator('header.haut').boundingBox();
   assert.ok(b.x===0&&b.y===0&&Math.round(b.height)===900,V+'la barre latérale, sur toute la hauteur');
   assert.ok(Math.abs(h.x-b.width)<1&&h.y===0&&h.height<=48,V+'la barre du haut, à côté');

   // 1. Toute page en deux clics : sa partie, puis elle. Les pages de la partie
   //    ouverte se déplient juste sous elle ; le fil d'Ariane dit la partie, le titre la page.
   const parties=await page.evaluate(()=>OrlyOnglets.PARTIES.filter(p=>!p.cache).map(p=>({id:p.id,nom:p.nom,pages:p.pages.map(x=>x.id)})));
   for(const p of parties){
    await page.locator(`#menu [data-vers-partie=${p.id}]`).click();await attendre();
    assert.equal(await page.evaluate(()=>{const on=document.querySelector('#menu .menu-partie.actif');
      return !!on&&on.nextElementSibling===document.getElementById('sous-onglets');}),true,V+p.id+' : ses pages sous elle');
    for(const id of p.pages){
     const bouton=page.locator(`#sous-onglets [data-sous-onglet=${id}]`);
     assert.equal(await bouton.isVisible(),true,V+id+' : à un clic');
     await bouton.click();await attendre(100);
     assert.equal(await actif(),id);
     assert.equal(await page.locator('#ariane-partie').textContent(),p.nom);
     assert.equal(await page.locator('#view-title').textContent(),await page.evaluate(id=>OrlyOnglets.page(id).nom,id));
     // Le plan de l'unité ouvre l'édition ; « Terminer » ramène à la page d'avant.
     if(id==='u-plan'){
      const avant=p.pages[p.pages.indexOf(id)-1];
      assert.equal(await page.evaluate(()=>document.body.classList.contains('plan-editing')),true,V+'le plan de l’unité s’ouvre en édition');
      await page.locator('#edit-done').click();await attendre(150);
      assert.equal(await actif(),avant,V+'« Terminer » ramène à « '+avant+' »');
     }
    }
   }
   // La partie, dans le fil d'Ariane, mène à sa première page.
   await nav.aller(page,'at-recap');
   await page.locator('#ariane-partie').click();await attendre();
   assert.equal(await actif(),'mu-services',V+'Équipes mène à sa première page');
   // Au clavier, les pages se suivent en colonne : bas et haut, le focus suit.
   await page.locator('#sous-onglets [data-sous-onglet=mu-services]').focus();await page.keyboard.press('ArrowDown');await attendre();
   assert.equal(await actif(),'at-recap');
   assert.equal(await page.evaluate(()=>document.activeElement.dataset.sousOnglet),'at-recap','le focus suit');
   await page.keyboard.press('ArrowUp');await attendre();
   assert.equal(await actif(),'mu-services');
   // La sauvegarde, au pied de la barre : marquée quand on y est, sans être une partie du travail.
   await page.locator('#btn-sauvegarde').click();await attendre();
   assert.equal(await actif(),'u-sauvegarde');
   assert.equal(await page.locator('#btn-sauvegarde').getAttribute('aria-current'),'page');
   assert.equal(await page.locator('#menu [aria-current=page]').count(),0);
   assert.equal(await page.locator('#sous-onglets').isVisible(),false,V+'une seule page : pas de liste à déplier');

   // 2. Un seul Annuler, pour ce que la page ouverte modifie.
   await nav.aller(page,'v-programme');
   assert.equal(await eteint('#btn-annuler'),true,V+'rien à annuler dans les vols');
   await nav.aller(page,'at-equipes');
   const n0=await equipes();
   await page.locator('#at-new').click();await attendre();
   assert.equal(await equipes(),n0+1);
   // Dans un champ de texte, Ctrl Z reste celui du champ : la case créée reste là.
   const champ=page.locator('.at-carte.ouverte [data-at-champ=nom]').first();
   assert.equal(await champ.isVisible(),true,'la case créée s’ouvre, son nom à saisir');
   await champ.focus();await page.keyboard.press('Control+z');await attendre();
   assert.equal(await equipes(),n0+1,V+'Ctrl Z dans un champ ne défait pas la case');
   // Hors d'un champ : Ctrl Z annule, Ctrl Maj Z et Ctrl Y rétablissent.
   await page.locator('#view-title').click();
   await page.keyboard.press('Control+z');await attendre();
   assert.equal(await equipes(),n0,V+'Ctrl Z annule');
   await page.keyboard.press('Control+Shift+z');await attendre();
   assert.equal(await equipes(),n0+1,V+'Ctrl Maj Z rétablit');
   await page.keyboard.press('Control+z');await attendre();
   await page.keyboard.press('Control+y');await attendre();
   assert.equal(await equipes(),n0+1,V+'Ctrl Y rétablit');
   // Et au bouton.
   await page.locator('#btn-annuler').click();await attendre();
   assert.equal(await equipes(),n0,V+'le bouton Annuler');
   assert.equal(await eteint('#btn-retablir'),false);
   await page.locator('#btn-retablir').click();await attendre();
   assert.equal(await equipes(),n0+1,V+'le bouton Rétablir');
   // Le barème a son historique : sur sa page, Annuler défait le barème, pas les cases.
   await nav.aller(page,'rg-minutes');
   assert.equal(await eteint('#btn-annuler'),await page.evaluate(()=>!Sim.reglages.undo.length),V+'Annuler suit l’historique du barème, pas celui des cases');
   const seuils=()=>page.evaluate(()=>Sim.reglages.etat.regime.seuils.length);
   const s0=await seuils();
   await page.evaluate(()=>Sim.reglages.changer(()=>{Sim.reglages.etat.regime.seuils.push({apres:900,duree:5});},'Pause ajoutée.'));await attendre();
   assert.equal(await seuils(),s0+1);
   await page.locator('#btn-annuler').click();await attendre();
   assert.equal(await seuils(),s0,V+'le barème est rendu');
   assert.equal(await equipes(),n0+1,V+'les cases n’ont pas bougé');

   // 3. L'édition du plan : la barre se replie, le menu attend, Annuler défait le plan.
   await nav.aller(page,'j-plan');
   await page.locator('#btn-edit').click();await attendre(300);
   assert.ok((await page.locator('#barre').boundingBox()).width<=60,V+'la barre se replie');
   assert.equal(await eteint('#menu [data-vers-partie=donnees]'),true,V+'le menu attend la fin de l’édition');
   assert.equal(await eteint('#ariane-partie'),true);
   const nomCuisine=()=>page.evaluate(()=>Sim.editor.state.zones.find(z=>z.id==='cuisine').nom);
   const avant=await nomCuisine();
   await page.evaluate(()=>Sim.editor.change(()=>{Sim.editor.state.zones.find(z=>z.id==='cuisine').nom='Cuisine essai';},'Renommé.'));await attendre();
   assert.equal(await nomCuisine(),'Cuisine essai');
   await page.locator('#btn-annuler').click();await attendre();
   assert.equal(await nomCuisine(),avant,V+'Annuler défait le plan, pendant l’édition');
   await page.locator('#edit-done').click();await attendre(300);
   assert.ok((await page.locator('#barre').boundingBox()).width>=200,V+'la barre revient');
   assert.equal(await eteint('#menu [data-vers-partie=donnees]'),false);

   // 4. Rien de coupé : à 1 280 px et à 1 024 px, aucune page ne déborde, ni la
   //    barre du haut, ni le titre de la page et ses outils.
   const pages=parties.flatMap(p=>p.pages);
   for(const [l,hauteur] of [[1280,800],[1024,700]]){
    await page.setViewportSize({width:l,height:hauteur});await attendre();
    for(const id of pages){
     await nav.aller(page,id);
     const m=await page.evaluate(()=>{const t=document.getElementById('tete-page'),hh=document.querySelector('header.haut');
       return {doc:document.documentElement.scrollWidth-innerWidth,tete:t.scrollWidth-t.clientWidth,haut:hh.scrollWidth-hh.clientWidth};});
     assert.ok(m.doc<=0&&m.tete<=1&&m.haut<=1,V+id+' à '+l+' px : '+JSON.stringify(m));
    }
    await nav.accueil(page);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),V+'l’accueil à '+l+' px');
   }
   assert.deepEqual(errors,[],V+errors.join(' | '));
  }
  console.log('coquille-browser : ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

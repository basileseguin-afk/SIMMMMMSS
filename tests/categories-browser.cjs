/* L'armement : une case par compagnie, oui ou non, liée au chemin (retour
 * d'usage du 01/10). Le site le propose dans la fiche d'un service Armement ;
 * seules les compagnies dont le chemin passe par lui ont une case ; minutes
 * par vol selon la compagnie ; joué par le calcul. v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 const reglage=()=>page.evaluate(()=>(Sim.ateliers.state.categories||{}).armement);
 const fiche=sel=>page.locator('#mu-services .mu-fiche '+sel);
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   await nav.aller(page,'mu-services');
   await page.locator('[data-mu-choisir=armement]').click();await attendre();

   // 1. La fiche de l'armement le propose, à la vue.
   assert.match(await fiche('.mu-par-cie').innerText(),/une case par compagnie/);
   await fiche('[data-mu-action=par-compagnie]').click();await attendre();
   assert.deepEqual(await reglage(),[{id:'ARM',nom:'Armement',minutes:{}}],version+' : un seul réglage, au nom du service');
   assert.equal(await fiche('.mu-par-cie').count(),0);
   assert.equal(await fiche('[data-mu-nature]').inputValue(),'categories');

   // 2. Aucun chemin ne passe par l'armement : pas de case, et on dit comment faire.
   assert.match(await fiche('').innerText(),/aucun chemin ne passe par ARMEMENT/i);
   await fiche('[data-mu-flux-ici=armement]').selectOption({label:'Sans cuisine'});await attendre();
   const cies=await page.evaluate(()=>Sim.ateliers.classesDe('armement').map(c=>c.cie));
   assert.ok(cies.includes('AF'),version+' : le flux de l’Éco passe maintenant par l’armement : '+cies.join(', '));

   // 3. Ses minutes par vol : toutes, puis AF.
   const min=async(cie,v)=>{const c=fiche(`[data-mu-cat-min="ARM"][data-cie="${cie}"]`);await c.fill(String(v));await c.press('Tab');await attendre();};
   await min('*',10);await min('AF',15);
   assert.deepEqual((await reglage())[0].minutes,{'*':10,AF:15});

   // 4. Une équipe : une seule colonne, une case par compagnie.
   await fiche('[data-mu-action=equipe]').click();await attendre();
   const eq=await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.service==='armement').id);
   const grille=page.locator(`#mu-services table[data-mu-equipe="${eq}"]`);
   assert.deepEqual((await grille.locator('thead th').allInnerTexts()).map(t=>t.trim().toUpperCase()).filter(Boolean).slice(1),['ARMEMENT']);
   const toutes=await page.evaluate(()=>[...new Set(Sim.ateliers.classes.map(c=>c.cie))]);
   assert.equal(await grille.locator('tbody tr').count(),toutes.length,'toutes les compagnies sont listées');
   assert.equal(await grille.locator('[data-mu-cocher]').count(),cies.length,'une case pour celles dont le chemin passe ici');
   await grille.locator('[data-mu-cocher="AF/@ARM"]').check();await attendre();
   assert.deepEqual(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).lots,eq),[['AF/@ARM']]);

   // 5. Le calcul : 15 min par vol AF.
   const r=await page.evaluate(id=>{const r=Sim.ateliers.resultat,l=r.lots.find(x=>x.atelier===id&&x.classes.includes('AF/@ARM'));
     return {ok:r.ok,minutes:l&&l.hommeMinutes,vols:r.classes.find(c=>c.id==='AF/@ARM').vols.length,lib:MoteurProduction.libelleClasse('AF/@ARM')};},eq);
   assert.ok(r.ok);
   assert.equal(r.minutes,15*r.vols,version+' : minutes par vol × vols');
   assert.equal(r.lib,'AF · Armement');

   // 6. Toutes les pages s'affichent.
   for(const p of ['at-recap','rg-recap','mu-pas','mu-flux','at-chemins','at-equipes']) await nav.aller(page,p);

   // 7. L'armement sort du flux : plus de case, et l'équipe lâche AF.
   await nav.aller(page,'mu-flux');
   await page.evaluate(()=>{const t=OrlyParcours.types(Sim.ateliers.state).find(x=>x.nom==='Sans cuisine');Sim.unite.fluxChoisi=t.id;Sim.unite.fluxSel={type:'noeud',id:'armement'};Sim.unite.rendreFlux();});await attendre();
   await page.locator('[data-mu-flux-action=retirer-service]').click();await attendre();
   assert.equal(await page.evaluate(()=>Sim.ateliers.classesDe('armement').length),0);
   assert.deepEqual(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).lots,eq),[],version+' : l’équipe lâche la case AF');
   await nav.aller(page,'mu-services');await page.locator('[data-mu-choisir=armement]').click();await attendre();
   assert.equal(await page.locator(`#mu-services table[data-mu-equipe="${eq}"]`).count(),0,'plus de grille : aucun chemin');
   assert.match(await fiche('.mu-afaire').innerText(),/aucun flux ne passe par ici/);

   // 8. Revenir à « des équipes préparent les commandes ».
   await fiche('[data-mu-nature]').selectOption('manuel');await attendre();
   assert.equal(await reglage(),undefined);
  }
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('categories-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

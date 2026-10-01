/* Un service qui travaille par catégories à lui (retour d'usage du 01/10 :
 * « l'armement ne travaille pas en fonction de BC, PC, Éco, SPML, mais d'autres
 * catégories » — les trolleys bar, le matériel thé/café…), minutes par vol
 * selon la compagnie. Réglé dans sa fiche ; cochable dans ses équipes ; joué
 * par le calcul. v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 const cats=()=>page.evaluate(()=>(Sim.ateliers.state.categories||{}).armement);
 const fiche=sel=>page.locator('#mu-services .mu-fiche '+sel);
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   await nav.aller(page,'mu-services');
   await page.locator('[data-mu-choisir=armement]').click();await attendre();

   // 1. « Ce service… travaille par catégories à lui ».
   await fiche('[data-mu-nature]').selectOption('categories');await attendre();
   assert.deepEqual(await cats(),[],version+' : par catégories, sans catégorie encore');
   assert.match(await fiche('').innerText(),/Créez la première/);

   // 2. Deux catégories ; leurs minutes par vol, pour toutes ou compagnie par compagnie.
   const ajouter=async nom=>{await fiche('[data-mu-cat-ajout] input[name=nom]').fill(nom);await fiche('[data-mu-cat-ajout] button').click();await attendre();};
   await ajouter('Trolleys bar');await ajouter('Matériel thé/café');
   assert.deepEqual((await cats()).map(k=>[k.id,k.nom]),[['TB','Trolleys bar'],['MTC','Matériel thé/café']]);
   const min=async(id,cie,v)=>{const c=fiche(`[data-mu-cat-min="${id}"][data-cie="${cie}"]`);await c.fill(String(v));await c.press('Tab');await attendre();};
   await min('TB','*',10);await min('TB','AF',15);await min('MTC','TX',5);
   assert.deepEqual((await cats())[0].minutes,{'*':10,AF:15});
   assert.equal(await fiche('[data-mu-cat-min="TB"][data-cie="TX"]').getAttribute('placeholder'),'10','une case vide prend la valeur de « Toutes »');

   // 3. Une équipe : sa grille a les catégories en colonnes.
   await fiche('[data-mu-action=equipe]').click();await attendre();
   const eq=await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.service==='armement').id);
   const grille=page.locator(`#mu-services table[data-mu-equipe="${eq}"]`);
   assert.deepEqual((await grille.locator('thead th').allInnerTexts()).map(t=>t.trim()).filter(Boolean).slice(1),['Trolleys bar','Matériel thé/café']);
   assert.equal(await grille.locator('[data-mu-cocher="TX/@MTC"]').count(),1);
   assert.equal(await grille.locator('[data-mu-cocher="AF/@MTC"]').count(),0,'AF n’a pas de thé/café : pas de case');
   await grille.locator('[data-mu-col="@TB"]').click();await attendre();
   await grille.locator('[data-mu-cocher="TX/@MTC"]').check();await attendre();
   const lots=await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).lots.flat(),eq);
   assert.ok(lots.includes('AF/@TB')&&lots.includes('TX/@MTC'),version+' : '+lots.join(', '));
   assert.equal(await page.evaluate(()=>Object.keys(Sim.ateliers.state.parcoursCabine).some(k=>k.startsWith('@'))),false,'pas de flux créé pour une catégorie');

   // 4. Le calcul : 15 min par vol AF, en clair dans les libellés.
   const r=await page.evaluate(id=>{const r=Sim.ateliers.resultat,l=r.lots.find(x=>x.atelier===id&&x.classes.includes('AF/@TB'));
     return {ok:r.ok,minutes:l&&l.hommeMinutes,vols:r.parClasse['AF/@TB']&&r.classes.find(c=>c.id==='AF/@TB').vols.length,lib:MoteurProduction.libelleClasse('AF/@TB')};},eq);
   assert.ok(r.ok);
   assert.equal(r.minutes,15*r.vols,version+' : minutes par vol × vols');
   assert.equal(r.lib,'AF · Trolleys bar');

   // 5. Toutes les pages s'affichent avec ces commandes.
   for(const p of ['at-recap','rg-recap','mu-pas','mu-flux','at-chemins','at-equipes']) await nav.aller(page,p);
   await nav.aller(page,'mu-services');await page.locator('[data-mu-choisir=armement]').click();await attendre();

   // 6. Supprimer une catégorie : ses équipes ne la préparent plus.
   await fiche('[data-mu-cat-retirer="MTC"]').click();await attendre();
   assert.deepEqual((await cats()).map(k=>k.id),['TB']);
   assert.ok(!(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).lots.flat(),eq)).includes('TX/@MTC'));

   // 7. Revenir à « des équipes préparent les commandes » : plus de catégories.
   await fiche('[data-mu-nature]').selectOption('manuel');await attendre();
   assert.equal(await cats(),undefined);
   assert.deepEqual(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).lots,eq),[]);
  }
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('categories-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

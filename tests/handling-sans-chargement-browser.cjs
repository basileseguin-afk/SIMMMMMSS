/* Correction 23 (f) — fiche du handling : une compagnie sans chargement n'est pas dans le tableau par compagnie
 * (version 1), sur l'unité fictive, à 1 366 × 768.
 *   1. Sans compagnie « sans chargement », rien ne change : une ligne par compagnie, comme avant.
 *   2. Déclarer une compagnie sans chargement (évolution 21 e) retire sa ligne du tableau « Par compagnie : courrier et
 *      trajet du camion » ; elle reste dans la liste « Compagnies sans chargement », au-dessus. La sauvegarde ne change
 *      pas en dehors de cette liste : ses valeurs déjà saisies y restent.
 *   3. L'en retirer rend sa ligne, et ses valeurs.
 *   4. Aucun calcul ne change.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const CIE='EST';

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 try{
  const ctx=await browser.newContext({viewport:{width:1366,height:768}});
  const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
  const attendre=(ms=400)=>page.waitForTimeout(ms);
  const site=await F.charger(page,nav,URL_V1,{pageId:'mu-services'});
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.unite);
  const h=await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.type==='handling').id);
  const F_=`#mu-services [data-at="${h}"]`;
  const fiche=async()=>{await nav.aller(page,'mu-services');await page.evaluate(id=>Sim.unite.ouvrirEquipe(id),h);await attendre();};
  /** Le tableau par compagnie : ses lignes (la compagnie, puis ce que portent ses champs). */
  const tableau=()=>page.evaluate(sel=>[...document.querySelectorAll(sel+' table.at-cies tbody tr')].map(tr=>[tr.querySelector('th').textContent.trim(),
    [...tr.querySelectorAll('input,select')].map(c=>(c.dataset.map||c.dataset.atChamp)+'='+(c.type==='checkbox'?c.checked:c.value)).join(' ')]),F_);
  const etat=()=>page.evaluate(()=>JSON.parse(JSON.stringify(Sim.ateliers.state)));
  /** Le résultat de la journée, sans ses avis (déclarer une compagnie sans chargement retire le sien, évolution 21 e). */
  const journee=()=>page.evaluate(()=>{const r=Sim.ateliers.resultat;return JSON.stringify({lots:r.lots,parClasse:r.parClasse,ateliers:r.ateliers,indicateurs:r.indicateurs});});
  const sansListe=s=>{const c={...s};delete c.sansChargement;return c;};
  const toutes=await page.evaluate(()=>[...new Set(Sim.ateliers.classes.map(c=>c.cie))].sort());
  assert.ok(toutes.includes(CIE)&&toutes.length>=4,'les compagnies de l’unité fictive : '+toutes);

  /* ---- 1. sans compagnie « sans chargement », une ligne par compagnie, comme avant ------------------------------- */
  await fiche();
  assert.match(await page.locator(F_+' .at-sous-titre',{hasText:'Par compagnie'}).innerText(),/^Par compagnie : courrier et trajet du camion/);
  assert.deepEqual((await tableau()).map(l=>l[0]),['Toutes les compagnies',...toutes],'une ligne par compagnie');
  assert.equal(await page.locator(F_+' .at-sans-chargement').count(),0);
  // Des valeurs propres à la compagnie : son temps de chargement, son aller, son courrier.
  const champ=(sel)=>page.locator(F_+' table.at-cies '+sel);
  await champ(`input[data-at-champ="duree"][data-cie="${CIE}"]`).fill('33');await champ(`input[data-at-champ="duree"][data-cie="${CIE}"]`).press('Enter');await attendre(500);
  await champ(`input[data-at-champ="temps"][data-map="allers"][data-cie="${CIE}"]`).fill('7');await champ(`input[data-at-champ="temps"][data-map="allers"][data-cie="${CIE}"]`).press('Enter');await attendre(500);
  await champ(`select[data-at-champ="categorie"][data-cie="${CIE}"]`).selectOption('long');await attendre(500);
  // Le handling ne charge plus que les autres compagnies : celle-ci n'a plus de handling.
  await page.evaluate(([id,cies])=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id===id).compagnies=cies;},''),[h,toutes.filter(c=>c!==CIE)]);
  await attendre(700);
  await fiche();
  const lignesAvant=await tableau(),saLigne=lignesAvant.find(l=>l[0]===CIE);
  assert.ok(saLigne,'sa ligne est dans le tableau');
  assert.match(saLigne[1],/categorie=long/);assert.match(saLigne[1],/allers=7/);assert.match(saLigne[1],/duree=33/);
  const etatAvant=await etat(),journeeAvant=await journee();
  assert.equal(etatAvant.sansChargement,undefined);

  /* ---- 2. déclarée sans chargement : plus de ligne ; la sauvegarde ne change pas en dehors de la liste ------------ */
  assert.equal(await page.evaluate(c=>Sim.ateliers.regleSansChargement(c,true),CIE),true,'la compagnie est déclarée sans chargement');
  await attendre(700);
  await fiche();
  const lignesSans=await tableau();
  assert.equal(lignesSans.some(l=>l[0]===CIE),false,'elle n’a plus de ligne dans le tableau par compagnie');
  assert.deepEqual(lignesSans,lignesAvant.filter(l=>l[0]!==CIE),'les autres lignes ne changent pas');
  // Elle reste dans la liste « Compagnies sans chargement », au-dessus du tableau.
  const liste=page.locator(F_+' .at-sans-chargement');
  assert.match((await liste.innerText()).replace(/\s+/g,' '),new RegExp('^Compagnies sans chargement ?'+CIE));
  assert.equal(await page.evaluate(sel=>{const l=document.querySelector(sel+' .at-sans-chargement'),t=document.querySelector(sel+' table.at-cies');
    return !!(l.compareDocumentPosition(t)&Node.DOCUMENT_POSITION_FOLLOWING);},F_),true,'la liste est au-dessus du tableau');
  // La sauvegarde : seule la liste change ; ses valeurs déjà saisies y restent.
  const etatSans=await etat();
  assert.deepEqual(etatSans.sansChargement,[CIE]);
  assert.deepEqual(sansListe(etatSans),sansListe(etatAvant),'en dehors de la liste, la sauvegarde ne change pas');
  const eq=etatSans.ateliers.find(a=>a.id===h);
  assert.deepEqual([eq.durees[CIE],eq.allers[CIE],eq.longs.includes(CIE)],[33,7,true],'ses valeurs restent dans la sauvegarde');
  assert.equal(await page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('ory-ateliers-v1')).sansChargement)),JSON.stringify([CIE]),'la sauvegarde enregistrée porte la liste');
  // Aucun calcul ne change.
  assert.equal(await journee(),journeeAvant,'le résultat de la journée est le même, champ par champ');
  // On ne peut pas lui redonner une ligne par mégarde : « Ajouter une compagnie » reste pour les autres.
  assert.equal(await page.locator(F_+' table.at-cies input[data-cie="'+CIE+'"], '+F_+' table.at-cies select[data-cie="'+CIE+'"]').count(),0,'aucun champ pour elle');

  /* ---- 3. retirée de la liste : sa ligne revient, avec ses valeurs ------------------------------------------------- */
  await liste.locator(`[data-at-action="sans-chargement-oter"][data-cie="${CIE}"]`).click();
  await page.waitForFunction(()=>!Sim.ateliers.state.sansChargement);
  await attendre(700);
  await fiche();
  assert.deepEqual(await tableau(),lignesAvant,'le tableau d’avant, ligne pour ligne : sa ligne et ses valeurs sont revenues');
  assert.deepEqual(await etat(),etatAvant,'la sauvegarde d’avant');
  assert.equal(await page.locator(F_+' .at-sans-chargement').count(),0);
  // Deux compagnies déclarées : deux lignes de moins ; « Annuler » en rend une.
  const autre=toutes.find(c=>c!==CIE);
  await page.evaluate(([id,cies])=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id===id).compagnies=cies;},''),[h,toutes.filter(c=>c!==CIE&&c!==autre)]);
  await attendre(500);
  await page.evaluate(([a,b])=>{Sim.ateliers.regleSansChargement(a,true);Sim.ateliers.regleSansChargement(b,true);},[CIE,autre]);
  await attendre(700);
  await fiche();
  assert.deepEqual((await tableau()).map(l=>l[0]),['Toutes les compagnies',...toutes.filter(c=>c!==CIE&&c!==autre)],'deux compagnies sans chargement : deux lignes de moins');
  await page.evaluate(()=>Sim.ateliers.histoire(false));await attendre(700);
  await fiche();
  assert.equal((await tableau()).filter(l=>l[0]===CIE||l[0]===autre).length,1,'« Annuler » rend une ligne');

  assert.deepEqual(erreurs,[],'aucune erreur de page : '+erreurs.join(' | '));
  await site.effacer();
  console.log('OK handling-sans-chargement : sans compagnie « sans chargement », le tableau d’avant ; déclarée, la compagnie n’a plus de ligne et reste dans sa liste, la sauvegarde ne change pas en dehors de la liste, aucun calcul ne change ; retirée de la liste, sa ligne et ses valeurs reviennent');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

/* Évolution 26 (f) — les compagnies d'abord : le menu, l'accueil et « il ne manque que les vols ».
 *   1. Le menu : l'accueil en tête, au-dessus de « Lire » ; « Régler » dans l'ordre du travail, sans sous-groupes
 *      (Commandes, Services et équipes, Chemins, Programme des vols, Planche retour, Réglages, Contrôles). L'entrée de
 *      l'accueil dit qu'on y est, et y mène.
 *   2. « Aller à… » trouve « Commandes » et l'accueil.
 *   3. L'accueil guide dans l'ordre du travail : les compagnies et leurs commandes, les services et leurs équipes, les
 *      chemins, les contrôles, le programme des vols, puis lire le résultat. Une unité vide : « À faire ensuite » propose
 *      d'ajouter une première compagnie, et ouvre le panneau d'ajout de « Commandes ».
 *   4. Une unité décrite, sans vols (avant tout import) : « Contrôles » dit que le site est prêt — « il ne manque que les
 *      vols », avec un bouton vers « Programme des vols » ; un point à corriger le fait taire.
 *   5. Une unité complète (ses vols importés) : tout est en place, l'accueil mène au résultat.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_SITE=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const LIRE=['Synthèse','En direct','Planning','Détails','Comparer'];
const REGLER=['Commandes','Services et équipes','Chemins','Programme des vols','Planche retour','Réglages','Contrôles'];
const PRET='Le site est prêt : il ne manque que les vols';
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=200)=>page.waitForTimeout(ms);
 const ou=()=>page.evaluate(()=>document.body.dataset.vue==='accueil'?'accueil':document.body.dataset.sous);
 /** Le guide de l'accueil : une rangée par étape — sa page, son nom, ce qu'elle dit, son état. */
 const guide=()=>page.evaluate(()=>[...document.querySelectorAll('#view-accueil .acc-etape')].map(li=>{const b=li.querySelector('.acc-etape-tete');
   return b?[b.dataset.page,b.querySelector('.acc-etape-nom').textContent,b.querySelector('.acc-etape-dit').textContent,b.querySelector('.acc-etat').textContent]:['ferme',li.textContent.trim()];}));
 const suite=()=>page.locator('#view-accueil .acc-suite').innerText().then(t=>t.replace(/\s+/g,' ').trim());
 const accueil=async()=>{await page.locator('#menu [data-entree="accueil"]').click();await attendre(300);};
 const points=()=>page.evaluate(()=>Sim.problemes.liste.map(p=>[p.niveau,p.titre]));
 try{
  await page.goto(URL_SITE);await nav.pret(page);

  // 1. Le menu : l'accueil, puis « Lire », puis « Régler » dans l'ordre du travail, puis « Fichiers ».
  const lus=()=>page.evaluate(()=>[...document.querySelectorAll('#menu .menu-entree > span:not(.so-badge), #btn-sauvegarde > span:last-child')].map(x=>x.textContent.trim()));
  assert.deepEqual(await lus(),['Accueil',...LIRE,...REGLER,'Fichiers'],'l’ordre du menu');
  const tete=await page.evaluate(()=>{const m=document.getElementById('menu'),a=m.querySelector('[data-entree="accueil"]'),l=m.querySelector('[data-bloc="lire"]');
    return {avant:!!(a.compareDocumentPosition(l)&Node.DOCUMENT_POSITION_FOLLOWING),haut:a.getBoundingClientRect().bottom<=l.getBoundingClientRect().top,
      onglet:a.hasAttribute('data-sous-onglet'),ico:!!a.querySelector('svg.ico')};});
  assert.deepEqual(tete,{avant:true,haut:true,onglet:false,ico:true},'l’accueil, au-dessus de « Lire », avec son pictogramme, hors des onglets');
  // On arrive sur l'accueil (rien ne se calcule) : son entrée le dit ; aucune page n'est ouverte.
  assert.equal(await ou(),'accueil');
  assert.deepEqual(await page.locator('#menu [aria-current="page"]').evaluateAll(es=>es.map(e=>e.dataset.entree)),['accueil']);
  assert.equal(await page.locator('#menu [aria-selected="true"]').count(),0);
  // « Régler », sans sous-groupes : ni titre d'espace, et ses entrées se suivent toutes du même pas.
  const regler=await page.evaluate(()=>{const b=document.querySelector('#menu [data-bloc="regler"]'),es=[...b.querySelectorAll('.menu-entree')].map(e=>e.getBoundingClientRect());
    return {titres:b.querySelectorAll('.menu-espace-titre').length,pas:[...new Set(es.slice(1).map((r,i)=>Math.round(r.top-es[i].top)))]};});
  assert.equal(regler.titres,0,'aucun titre d’espace');
  assert.equal(regler.pas.length,1,'les entrées de « Régler » se suivent du même pas : '+regler.pas);
  // Une page ouverte : l'entrée de l'accueil n'est plus marquée ; un clic y ramène.
  await page.locator('#menu [data-entree="mu-commandes"]').click();await attendre();
  assert.equal(await ou(),'mu-commandes');
  assert.equal(await page.locator('#menu [data-entree="accueil"]').getAttribute('aria-current'),null);
  await accueil();
  assert.equal(await ou(),'accueil');
  assert.equal(await page.locator('#menu [data-entree="accueil"].actif').count(),1);

  // 2. « Aller à… » trouve « Commandes » (celle de « Régler », et celle de « Détails ») et l'accueil.
  const allerA=async(cherche,choisir)=>{
    await page.keyboard.press('Control+k');await page.waitForSelector('dialog.palette [role=option]');
    await page.keyboard.type(cherche);await attendre(150);
    const o=page.locator('dialog.palette [role=option]'),t=await o.evaluateAll(os=>os.map(x=>(x.querySelector('.pal-nom')||x).textContent.trim()));
    const i=t.indexOf(choisir);assert.ok(i>=0,'« Aller à… » « '+cherche+' » propose « '+choisir+' » : '+t.join(' | '));
    await o.nth(i).click();await attendre();};
  await allerA('Commandes','Commandes');assert.equal(await ou(),'mu-commandes','« Commandes » mène à la page de « Régler »');
  await allerA('Commandes','Détails › Commandes');assert.equal(await ou(),'at-repas');
  await allerA('Accueil','Accueil');assert.equal(await ou(),'accueil','« Accueil » mène à l’accueil');
  await allerA('Planche','Planche retour');assert.equal(await ou(),'v-planche');
  await allerA('Retours','Planche retour');assert.equal(await ou(),'v-planche','le nom court d’avant se cherche toujours');

  // L'histoire du haut, dans l'ordre du travail.
  await accueil();
  assert.match(await page.locator('.acc-histoire').innerText(),/compagnies[\s\S]*équipes[\s\S]*chemin[\s\S]*vols[\s\S]*calcule/);

  // 3. Une unité vide (une liste sans compagnie) : le guide commence par les compagnies.
  await F.restaurer(page,nav,URL_SITE,F.sauvegardeComplete({liste:[]}));await accueil();
  const vide=await guide();
  assert.deepEqual(vide.map(x=>x[0]),['mu-commandes','mu-services','mu-flux','mu-pas','v-programme','j-chiffres'],'l’ordre du guide');
  assert.deepEqual(vide.map(x=>x[1]),['Commandes','Services et équipes','Chemins','Contrôles','Programme des vols','Lire le résultat']);
  assert.deepEqual(vide[0].slice(2),['aucune compagnie','à faire']);
  // Aucune commande : rien à lire encore (ce que le calcul suit encore — un service par compagnie — n'est pas une commande).
  assert.deepEqual(vide[5].slice(2),['rien à calculer encore','à faire']);
  assert.equal(await suite(),'À faire ensuite : Ajouter une première compagnie →');
  await page.locator('#view-accueil .acc-suite [data-page]').click();await attendre(300);
  assert.equal(await ou(),'mu-commandes');
  assert.equal(await page.locator('#mu-commandes [data-co-panneau="ajout"]').isVisible(),true,'le panneau d’ajout s’ouvre');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.coChamp),'nom','le clavier sur son nom');
  // La rangée de l'étape y mène aussi.
  await accueil();await page.locator('#view-accueil [data-etape="commandes"] .acc-etape-tete').click();await attendre(300);
  assert.equal(await page.locator('#mu-commandes [data-co-panneau="ajout"]').isVisible(),true);

  // 4. Une unité décrite, sans vols (le programme d'exemple) : « il ne manque que les vols ».
  await F.restaurer(page,nav,URL_SITE,F.sauvegardeComplete());await accueil();
  assert.match(await page.evaluate(()=>document.getElementById('source-label').textContent),/Jeu de démonstration/,'aucun import');
  assert.deepEqual((await points()).filter(p=>p[0]!=='information'),[],'rien de bloquant, rien à corriger');
  const sansVols=await guide();
  assert.deepEqual(sansVols.map(x=>x[3]),['fait','fait','fait','fait','provisoire','à vérifier'],JSON.stringify(sansVols));
  assert.match(sansVols[0][2],/^4 compagnies · \d+ commandes$/);
  assert.equal(sansVols[3][2],'il ne manque que les vols');
  assert.match(sansVols[4][2],/départs · exemple$/);
  assert.equal(await suite(),'À faire ensuite : Importer vos vols →');
  // « Contrôles » : le point, en tête des informations, à la place de l'étape des vols d'exemple ; son bouton mène au programme.
  await nav.aller(page,'mu-pas');await attendre(300);
  const infos=await page.locator('[data-ct-niveau="information"] .ct-point').evaluateAll(ps=>ps.map(p=>p.querySelector('.ct-corps b').textContent));
  assert.equal(infos[0],PRET,'en tête des informations : '+infos.join(' | '));
  assert.ok(!infos.includes('Les vols de la journée'),'l’étape des vols d’exemple ne se répète pas');
  assert.match(await page.locator('[data-ct-niveau="information"] .ct-point').first().innerText(),/Chaque commande a son chemin, ses équipes et ses temps\./);
  assert.equal(await page.locator('#menu [data-entree="mu-pas"] .so-badge').count(),0,'aucune pastille');
  const bouton=page.locator('[data-ct-niveau="information"] .ct-point').first().locator('[data-ct-aller]');
  assert.equal((await bouton.innerText()).trim(),'Voir dans Programme des vols →');
  await bouton.click();await attendre(300);
  assert.equal(await ou(),'v-programme','le bouton mène à « Programme des vols »');
  // Un point à corriger (une étape sans équipe) : le site n'est plus prêt ; l'étape des vols d'exemple revient.
  const lots=await page.evaluate(()=>JSON.parse(JSON.stringify(Sim.ateliers.state.ateliers.find(a=>a.id==='pr').lots)));
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const a=Sim.ateliers.state.ateliers.find(x=>x.id==='pr');a.lots=a.lots.slice(0,-1);},''));await attendre(500);
  const apres=await points();
  assert.ok(apres.some(p=>p[0]==='corriger'),'un point à corriger');
  assert.ok(!apres.some(p=>p[1]===PRET),'le site n’est plus prêt');
  assert.ok(apres.some(p=>p[1]==='Les vols de la journée'),'l’étape des vols d’exemple revient');
  await accueil();
  assert.deepEqual((await guide())[3].slice(2),['1 à corriger','à vérifier']);
  await page.evaluate(l=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(x=>x.id==='pr').lots=l;},''),lots);await attendre(500);
  assert.ok((await points()).some(p=>p[1]===PRET),'remis : le site est prêt de nouveau');

  // 5. Une unité complète : ses vols importés (sans retard). Le point se tait ; tout est en place.
  await F.restaurer(page,nav,URL_SITE,F.sauvegardeComplete());
  const dossier=require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(),'ory-guide-'));
  try{await F.importerVols(page,nav,(n,t)=>{const f=path.join(dossier,n);require('node:fs').writeFileSync(f,t);return f;},'vols-fictifs.csv',F.volsSansRetardCsv());}
  finally{require('node:fs').rmSync(dossier,{recursive:true,force:true});}
  await attendre(400);
  assert.ok(!(await points()).some(p=>p[1]===PRET),'après l’import, le point se tait');
  await accueil();
  const complet=await guide();
  assert.deepEqual(complet.map(x=>x[3]),['fait','fait','fait','fait','fait','fait'],JSON.stringify(complet));
  assert.match(complet[4][2],/départs · les vôtres$/);
  assert.match(complet[5][2],/^tout est à l’heure/);
  assert.equal(await suite(),'Tout est en place : lisez le résultat →');
  await page.locator('#view-accueil .acc-suite [data-page]').click();await attendre(300);
  assert.equal(await ou(),'j-chiffres');

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('accueil-guide-browser : ok — l’accueil en tête du menu, « Régler » dans l’ordre du travail sans sous-groupes ; « Aller à… » trouve « Commandes » et l’accueil ; le guide d’une unité vide (« Ajouter une première compagnie », le panneau ouvert), d’une unité sans vols (« il ne manque que les vols », son bouton vers « Programme des vols », tu par un point à corriger) et d’une unité complète');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

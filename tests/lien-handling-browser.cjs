/* Correction 23 (e) — fiche d'un service par compagnie : l'encart « Lié au handling » (version 1), sur l'unité fictive,
 * à 1 366 × 768.
 *   1. La phrase dit le service par son nom : « Le handling attend <nom du service> avant de charger un vol, pour les
 *      compagnies qui passent par lui : celles dont un chemin passe par ce service, ou qu'une de ses équipes a cochées.
 *      Il charge les autres sans l'attendre. » Elle ne contient « armement » que pour un service de ce nom.
 *   2. La fiche n'a plus de bouton qui écrit un lien : ni « Le relier au seul handling », ni « L'ajouter à tous les
 *      chemins, relié au handling ». Les liens se règlent dans « Chemins ».
 *   3. « À reprendre dans ces chemins : … » reste ; chaque chemin cité est un lien qui l'ouvre dans « Chemins », ce
 *      service choisi. Rien n'est écrit par ce clic.
 *   4. Les migrations d'ouverture ne changent pas : une sauvegarde rouverte garde ses liens.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const ENCART='#mu-services .se-fiche .mu-lien-handling';
const phrase=nom=>'Lié au handling. Le handling attend '+nom+' avant de charger un vol, pour les compagnies qui passent par lui : celles dont un chemin passe par ce service, ou qu’une de ses équipes a cochées. Il charge les autres sans l’attendre.';

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 try{
  const ctx=await browser.newContext({viewport:{width:1366,height:768}});
  const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
  const attendre=(ms=350)=>page.waitForTimeout(ms);
  const sous=()=>page.evaluate(()=>document.body.dataset.sous);
  const site=await F.charger(page,nav,URL_V1,{pageId:'mu-services'});
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.unite);
  const fiche=async()=>{await nav.aller(page,'mu-services');await page.evaluate(()=>Sim.unite.ouvrir('armement'));await attendre();};
  const chemins=()=>page.evaluate(()=>JSON.stringify(Sim.ateliers.state.parcours));
  /** Le texte de l'encart, sur une ligne ; ses boutons. */
  const encart=()=>page.evaluate(sel=>{const e=document.querySelector(sel);
    return {premier:e.querySelector('p').innerText.replace(/\s+/g,' ').replace(/^\S+ /,'').trim(),texte:e.innerText.replace(/\s+/g,' ').trim(),
      boutons:[...e.querySelectorAll('button')].map(b=>({texte:b.textContent.trim(),action:b.dataset.muAction||null,chemin:b.dataset.muArmChemin||null,page:b.dataset.page||null}))};},ENCART);

  /* ---- 1. la phrase dit le service par son nom -------------------------------------------------------------------- */
  await fiche();
  assert.equal(await page.locator('#mu-services [data-mu-nature=armement]').inputValue(),'categories','un service par compagnie');
  let e=await encart();
  assert.equal(e.premier,phrase('Armement'),'la phrase, avec le nom du service');
  assert.equal((e.texte.match(/armement/gi)||[]).length,1,'« armement » n’y est que le nom du service : '+e.texte);
  assert.doesNotMatch(e.texte,/a un armement|son armement|sans armement/i);
  // Dans chaque chemin qui passe par lui, relié au seul handling : la fiche le dit, sans bouton.
  assert.match(e.texte,/Dans chaque chemin qui passe par lui, en branche à part, relié seulement au handling\.$/);
  assert.deepEqual(e.boutons,[],'aucun bouton dans l’encart');
  // Un service par compagnie qui ne s'appelle pas « Armement » : le mot n'y est plus du tout.
  const nom=page.locator('#mu-services [data-mu-nom=armement]');
  await nom.fill('Presse');await nom.press('Enter');await attendre(600);
  e=await encart();
  assert.equal(e.premier,phrase('Presse'),'la phrase suit le nom du service');
  assert.doesNotMatch(e.texte,/armement/i,'plus aucun « armement » dans l’encart d’un service qui ne s’appelle pas ainsi : '+e.texte);

  /* ---- 3. « À reprendre dans ces chemins » : chaque chemin est un lien qui l'ouvre dans « Chemins » ---------------- */
  // Un chemin de plus, suivi par une commande, où ce service est relié à une autre étape, pas au handling.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
    st.parcours.push({id:'neuf',nom:'Neuf',noeuds:['prepa','armement'],liens:[{de:'prepa',vers:'armement'}]});
    st.parcoursClasse={...(st.parcoursClasse||{}),'NORD/BC':'neuf'};},''));
  await attendre(700);
  await fiche();
  e=await encart();
  assert.equal(e.premier,phrase('Presse'));
  assert.match(e.texte,/À reprendre dans ce chemin : « Neuf » \((relié aussi à .+|pas relié au handling)\)\. Dans un chemin, Presse se relie au handling, et à lui seul : cela se règle dans « Chemins »\.$/);
  assert.deepEqual(e.boutons,[{texte:'« Neuf »',action:null,chemin:'neuf',page:null}],'le chemin cité est un lien ; aucun bouton n’écrit de lien');
  assert.doesNotMatch(e.texte,/armement/i);
  // Le lien ouvre ce chemin dans « Chemins », ce service choisi ; rien n'est écrit.
  const avant=await chemins();
  await page.locator(ENCART+' [data-mu-arm-chemin=neuf]').click();await attendre(500);
  assert.deepEqual([await sous(),await page.evaluate(()=>Sim.unite.fluxChoisi),await page.locator('#mu-flux .ch-etape').getAttribute('data-ch-etape')],['mu-flux','neuf','armement'],'« Chemins », sur ce chemin, ce service choisi');
  assert.equal(await chemins(),avant,'le clic n’écrit aucun lien');
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.parcours.find(p=>p.id==='neuf').liens.length),1);
  // Deux chemins à reprendre : deux liens.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
    st.parcours.push({id:'neuf2',nom:'Neuf bis',noeuds:['prepa','armement'],liens:[{de:'prepa',vers:'armement'}]});
    st.parcoursClasse={...(st.parcoursClasse||{}),'SUD/BC':'neuf2'};},''));
  await attendre(700);
  await fiche();
  e=await encart();
  assert.match(e.texte,/À reprendre dans ces chemins : « Neuf » \(.+\), « Neuf bis » \(.+\)\. /);
  assert.deepEqual(e.boutons.map(b=>[b.texte,b.chemin,b.action]),[['« Neuf »','neuf',null],['« Neuf bis »','neuf2',null]]);
  await page.locator(ENCART+' [data-mu-arm-chemin=neuf2]').click();await attendre(500);
  assert.deepEqual([await sous(),await page.evaluate(()=>Sim.unite.fluxChoisi)],['mu-flux','neuf2']);

  /* ---- 2. plus aucun bouton qui écrit un lien, dans aucun des états de l'encart ------------------------------------ */
  // Aucun chemin ne passe par lui : la fiche renvoie à « Chemins », sans rien ajouter d'elle-même.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
    st.parcours=st.parcours.filter(p=>!/^neuf/.test(p.id)).map(p=>({...p,noeuds:(p.noeuds||[]).filter(n=>n!=='armement'),liens:(p.liens||[]).filter(l=>l.de!=='armement'&&l.vers!=='armement')}));
    const pc={...(st.parcoursClasse||{})};delete pc['NORD/BC'];delete pc['SUD/BC'];st.parcoursClasse=pc;},''));
  await attendre(700);
  await fiche();
  e=await encart();
  assert.equal(e.premier,phrase('Presse'));
  assert.match(e.texte,/Aucun chemin ne passe encore par Presse : ajoutez-le comme étape dans Chemins →, relié au handling\.$/);
  assert.deepEqual(e.boutons,[{texte:'Chemins →',action:null,chemin:null,page:'mu-flux'}],'un lien vers « Chemins », aucun bouton qui écrit');
  const sans=await chemins();
  await page.locator(ENCART+' [data-page=mu-flux]').click();await attendre(400);
  assert.equal(await sous(),'mu-flux');
  assert.equal(await chemins(),sans,'ouvrir « Chemins » n’écrit rien');
  // Nulle part dans la fiche : ni le geste d'avant, ni ses deux noms.
  await fiche();
  assert.equal(await page.locator('#mu-services [data-mu-action=integrer-armement]').count(),0,'le geste « integrer-armement » n’a plus de bouton');
  assert.doesNotMatch(await page.locator('#mu-services .se-fiche').innerText(),/Le relier au seul handling|L’ajouter à tous les chemins/);
  await site.effacer();await ctx.close();

  /* ---- 4. les migrations d'ouverture ne changent pas -------------------------------------------------------------- */
  // Une sauvegarde rouverte : ses chemins et ses liens sont ceux qu'elle portait (la migration d'ouverture est déjà faite).
  const ctx2=await browser.newContext({viewport:{width:1366,height:768}});
  const p2=await ctx2.newPage();p2.on('pageerror',x=>erreurs.push(x.message));p2.on('dialog',d=>d.accept());
  const site2=await F.charger(p2,nav,URL_V1,{pageId:'mu-services'});
  await p2.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat);
  const lus=await p2.evaluate(()=>({migrations:(Sim.ateliers.state.migrations||[]).slice().sort(),liens:Sim.ateliers.state.parcours.map(p=>[p.id,(p.liens||[]).filter(l=>l.de==='armement'||l.vers==='armement')])}));
  const attendus=F.sauvegardeFictive().contenu['ory-ateliers-v1'];
  assert.deepEqual(lus.liens,attendus.parcours.map(p=>[p.id,(p.liens||[]).filter(l=>l.de==='armement'||l.vers==='armement')]),'les liens de la sauvegarde, tels quels');
  for(const m of attendus.migrations||[])assert.ok(lus.migrations.includes(m),'la migration « '+m+' » reste faite');
  await site2.effacer();await ctx2.close();

  assert.deepEqual(erreurs,[],'aucune erreur de page : '+erreurs.join(' | '));
  console.log('OK lien-handling : la phrase dit le service par son nom (« armement » seulement s’il s’appelle ainsi) ; plus aucun bouton qui écrit un lien ; chaque chemin à reprendre ouvre « Chemins », ce service choisi, sans rien écrire ; les liens d’une sauvegarde rouverte ne bougent pas');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

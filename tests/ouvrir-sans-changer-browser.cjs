/* Correction 24 (a) — ouvrir une page ne change jamais le résultat (version 1), sur l'unité fictive et un programme
 * daté fictif, à 1 366 × 768. Le constat : ouvrir « Planning » changeait `effectifs.<équipe>.saisi` dans le résultat,
 * sans aucun geste (le calcul lisait l'effectif de l'équipe, puis y écrivait l'effectif calculé : le calcul suivant,
 * relancé par l'ouverture de la page, ne lisait donc plus le même nombre).
 *   1. Après le chargement, ouvrir une à une toutes les pages du menu (en dépliant leurs sections, en survolant ce
 *      qu'elles montrent), puis chaque onglet de « Détails » et du Planning (ses jours de travail, ses échelles, ses
 *      rangées dépliées et repliées) : le résultat (champ par champ), les réponses de la Synthèse, chaque entrée de la
 *      sauvegarde et la révision des données sont les mêmes avant et après. Puis dans l'ordre inverse.
 *   2. Le résultat de la page est celui du moteur sur l'état enregistré : un recalcul rend le même, et n'écrit rien.
 *   3. De même une fois la période simulée (le jour affiché se joue alors avec ce que la veille lui laisse).
 *   4. Un geste de réglage, lui, change le résultat et l'entrée de la sauvegarde : le test voit bien un changement.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs'),Stockage=require('../stockage.js');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const CSV=F.volsDatesCsv(3,'2031-03-03');

/** Dans la page : ce que la simulation a calculé, et tout ce que le navigateur garde. */
const ETAT=()=>({resultat:JSON.stringify(Sim.ateliers.resultat),reponses:JSON.stringify(Sim.reponses()),
  garde:Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).sort().map(k=>[k,localStorage.getItem(k)]))});
/** Dans la page : déplier chaque section repliée de la zone de travail, puis survoler ce qu'elle montre. */
const REGARDER=()=>{const vu=e=>e.getClientRects().length>0,z=document.getElementById('workspace');
  for(const s of z.querySelectorAll('details:not([open]) > summary'))if(vu(s))s.click();
  const cibles=[...z.querySelectorAll('button,summary,tbody tr,svg [data-zone],svg g[tabindex],[title]')].filter(vu).slice(0,40);
  for(const e of cibles)for(const t of ['pointerover','pointerenter','mouseover','mouseenter','mousemove'])
    e.dispatchEvent(new MouseEvent(t,{bubbles:t!=='pointerenter'&&t!=='mouseenter',cancelable:true,view:window}));
  return cibles.length;};
/** Les champs qui diffèrent entre deux valeurs : leur chemin, l'ancienne et la nouvelle (les huit premiers). */
const ecarts=(a,b,chemin='',liste=[])=>{
  if(liste.length>=8||a===b)return liste;
  const objet=x=>x!==null&&typeof x==='object';
  if(!objet(a)||!objet(b)||Array.isArray(a)!==Array.isArray(b)){liste.push(chemin+' : '+JSON.stringify(a)+' → '+JSON.stringify(b));return liste;}
  for(const k of new Set([...Object.keys(a),...Object.keys(b)]))ecarts(a[k],b[k],chemin?chemin+'.'+k:k,liste);
  return liste;};
/** Les entrées de la sauvegarde (toute donnée du site) et la révision, qu'une écriture de donnée avance. */
const donnees=garde=>Object.fromEntries(Object.entries(garde).filter(([k])=>Stockage.estDonnee(k)||k===Stockage.REVISION));

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 const ctx=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});
 const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
 const site=await F.charger(page,nav,URL_V1,{csv:CSV,pageId:'j-chiffres'});
 await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.unite);
 try{
  const lire=()=>page.evaluate(ETAT);
  /** Rien n'a changé depuis `avant` : ni le résultat, ni les réponses, ni une entrée de la sauvegarde, ni la révision. */
  const constater=async(avant,quoi)=>{
   const e=await lire();
   if(e.resultat!==avant.resultat)assert.deepEqual(ecarts(JSON.parse(avant.resultat),JSON.parse(e.resultat)),[],quoi+' : le résultat a changé');
   if(e.reponses!==avant.reponses)assert.deepEqual(ecarts(JSON.parse(avant.reponses),JSON.parse(e.reponses)),[],quoi+' : les réponses de la Synthèse ont changé');
   const a=donnees(avant.garde),b=donnees(e.garde);
   assert.deepEqual(Object.keys(b),Object.keys(a),quoi+' : les entrées de la sauvegarde ne sont plus les mêmes');
   for(const k of Object.keys(a))if(a[k]!==b[k]){
    let x=a[k],y=b[k];try{x=JSON.parse(x);y=JSON.parse(y);}catch(_){}
    assert.deepEqual(ecarts(x,y),[],quoi+' : l’entrée « '+k+' » a changé');}
  };
  const pages=await page.evaluate(()=>OrlyOnglets.entrees().flatMap(o=>o.pages||[o.id]));
  assert.ok(pages.length>=14&&pages.includes('at-planning')&&pages.includes('j-details'),'les pages du menu : '+pages.join(' '));
  /** Les onglets de « Détails », puis ceux du Planning : ses jours de travail, ses échelles, ses rangées. */
  const onglets=async(avant,tour,inverse)=>{
   const sens=l=>inverse?l.slice().reverse():l;
   await nav.aller(page,'at-repas');
   const details=await page.locator('.oi-onglet').count();
   assert.ok(details>=4,tour+' : « Détails » a ses onglets ('+details+')');
   for(const i of sens([...Array(details).keys()])){
    const o=page.locator('.oi-onglet').nth(i),nom=(await o.textContent()).trim();
    await o.click();await page.waitForFunction(i=>document.querySelectorAll('.oi-onglet')[i].getAttribute('aria-selected')==='true',i);
    await page.evaluate(REGARDER);await constater(avant,tour+', « Détails », onglet « '+nom+' »');}
   await nav.aller(page,'at-planning');
   const jours=await page.locator('#workspace .pg-onglet').count();
   assert.ok(jours>=2,tour+' : le Planning a ses jours de travail ('+jours+')');
   for(const i of sens([...Array(jours).keys()])){
    const o=page.locator('#workspace .pg-onglet').nth(i),nom=(await o.textContent()).trim();
    await o.click();await page.waitForFunction(i=>document.querySelectorAll('#workspace .pg-onglet')[i].getAttribute('aria-pressed')==='true',i);
    await constater(avant,tour+', Planning, jour de travail « '+nom+' »');}
   for(const nom of sens(['Toute la chaîne','6 h','Un jour','Tout replier','Tout déplier','Légende'])){
    await page.locator('#workspace button.btn-sm',{hasText:new RegExp('^'+nom+'$')}).first().click();
    await constater(avant,tour+', Planning, « '+nom+' »');}
   const rangees=await page.locator('#workspace .pg-replier').count();
   for(const i of sens([...Array(Math.min(rangees,6)).keys()])){await page.locator('#workspace .pg-replier').nth(i).click();await constater(avant,tour+', Planning, la rangée '+(i+1));}
   await page.evaluate(REGARDER);await constater(avant,tour+', Planning, sections dépliées et survol');
  };
  /** Toutes les pages du menu, une à une, puis les onglets ; à la fin, le temps qu'une écriture tardive se montre. */
  const tour=async(avant,nom,inverse)=>{
   for(const id of inverse?pages.slice().reverse():pages){
    await nav.aller(page,id);await constater(avant,nom+', page « '+id+' » ouverte');
    const n=await page.evaluate(REGARDER);await constater(avant,nom+', page « '+id+' », sections dépliées et survol ('+n+' cibles)');}
   await onglets(avant,nom,inverse);
   await page.waitForTimeout(500);await constater(avant,nom+', une demi-seconde après');
  };

  // 1. Après le chargement : toutes les pages, tous les onglets, dans l'ordre puis dans l'ordre inverse.
  const charge=await lire();
  assert.ok(Object.keys(JSON.parse(charge.resultat).effectifs||{}).length>=3,'l’unité fictive a des équipes à l’effectif calculé');
  assert.ok(Object.keys(donnees(charge.garde)).length>=5,'la sauvegarde a ses entrées : '+Object.keys(donnees(charge.garde)).join(' '));
  await tour(charge,'après le chargement',false);
  await tour(charge,'après le chargement, ordre inverse',true);

  // 2. Le résultat de la page est celui du moteur sur l'état enregistré : un recalcul rend le même, sans rien écrire.
  await page.evaluate(()=>{Sim.ateliers.calculer();Sim.ateliers.calculer();});
  await constater(charge,'un recalcul, sans aucun geste');

  // 3. La période simulée : le jour affiché se joue avec ce que la veille lui laisse. Un geste : le résultat peut
  //    changer. Ensuite, plus rien ne bouge.
  await nav.aller(page,'j-periode');await page.locator('#journee-periode [data-pv=lancer]').click();
  await page.waitForFunction(()=>Sim.periode.etat()==='a-jour',null,{timeout:300000});
  await nav.aller(page,'j-chiffres');
  const simulee=await lire();
  await tour(simulee,'période simulée',false);
  await tour(simulee,'période simulée, ordre inverse',true);
  await page.evaluate(()=>{Sim.ateliers.calculer();});
  await constater(simulee,'période simulée, un recalcul');

  // 4. Un geste de réglage change bien le résultat et la sauvegarde : le constat sait voir un changement.
  await page.evaluate(()=>{const e=Sim.ateliers.state.ateliers.find(a=>a.id==='pr');Sim.ateliers.changer(()=>{e.personnes+=1;},'essai');});
  const regle=await lire();
  assert.notEqual(regle.resultat,simulee.resultat,'un réglage change le résultat');
  assert.notEqual(regle.garde['ory-ateliers-v1'],simulee.garde['ory-ateliers-v1'],'un réglage change son entrée de la sauvegarde');
  assert.notEqual(regle.garde[Stockage.REVISION],simulee.garde[Stockage.REVISION],'un réglage avance la révision des données');
  await assert.rejects(constater(simulee,'après un réglage'),/a changé/,'le constat voit un changement');
  await tour(regle,'après un réglage',false);

  assert.deepEqual(erreurs,[],'aucune erreur de script : '+erreurs.join(' | '));
  console.log('OK ouvrir-sans-changer : après le chargement puis une fois la période simulée — '+pages.length+' pages du menu, les onglets de « Détails » et du Planning (jours de travail, échelles, rangées), sections dépliées et survol, dans l’ordre puis dans l’ordre inverse : le résultat champ par champ, les réponses, chaque entrée de la sauvegarde et la révision sont les mêmes ; un recalcul rend le même résultat ; un réglage, lui, les change');
 }finally{site.effacer();await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

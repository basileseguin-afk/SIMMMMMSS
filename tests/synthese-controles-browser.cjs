/* Correction 23 (d) — Synthèse : le bandeau « n commandes que personne ne prépare » mène à « Contrôles » (version 1), sur
 * l'unité fictive (une commande que personne ne prépare, une compagnie sans personne à l'armement), à 1 366 × 768.
 *   1. Le bouton du bandeau s'appelle « Voir dans Contrôles » (avant : « Cocher dans un service », qui ouvrait « Services
 *      et équipes » sans dire quel service). Il ouvre « Contrôles », où le point bloquant est en tête, avec ses boutons :
 *      un par service, au nom du service.
 *   2. En lecture seule, il s'ouvre aussi : « Contrôles » se lit.
 *   3. L'autre écriture de ce bandeau en version 1 — la Synthèse d'avant les cinq réponses (resultats-vue.js) — dit et fait
 *      de même. Le module commun avec la version 2 (simulation.js, non modifié) garde son bouton : sa Synthèse ne
 *      s'affiche jamais en version 1. Nulle part, la version 1 ne dit plus « Cocher dans un service ».
 *   4. Sans commande que personne ne prépare, pas de bandeau.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const BANDEAU='#bilan-journee .bilan-probleme';

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 /** Une page neuve sur l'unité fictive ; `sans` : les modules de la version 1 que la page ne reçoit pas (la page d'avant). */
 const ouvrir=async(sans=[])=>{
   const ctx=await browser.newContext({viewport:{width:1366,height:768}});
   const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
   for(const m of sans)await page.route(new RegExp('/'+m.replace('.','\\.')+'(\\?|$)'),r=>r.fulfill({status:200,contentType:'application/javascript',body:''}));
   const site=await F.charger(page,nav,URL_V1,{pageId:'j-chiffres'});
   await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.problemes&&Sim.problemes.liste.length>0);
   await page.waitForSelector(BANDEAU);
   await page.waitForTimeout(400);
   return {ctx,page,site,attendre:(ms=350)=>page.waitForTimeout(ms),sous:()=>page.evaluate(()=>document.body.dataset.sous)};
 };
 /** Le bandeau : sa phrase, son bouton. */
 const bandeau=page=>page.evaluate(sel=>{const p=document.querySelector(sel),b=p&&p.querySelector('button');
   return p?{phrase:p.querySelector('span b').textContent,bouton:b.textContent.trim(),page:b.dataset.page,grise:b.disabled,boutons:p.querySelectorAll('button').length}:null;},BANDEAU);
 try{
  /* ---- 1. le bouton s'appelle « Voir dans Contrôles », et ouvre « Contrôles » -------------------------------------- */
  let s=await ouvrir(),{page,attendre}=s;
  const absentes=await page.evaluate(()=>Sim.ateliers.resultat.indicateurs.classesAbsentes);
  assert.ok(absentes>=1,'une commande au moins que personne ne prépare');
  let b=await bandeau(page);
  assert.equal(b.phrase,absentes+(absentes>1?' commandes que personne ne prépare':' commande que personne ne prépare'));
  assert.deepEqual([b.bouton,b.page,b.grise,b.boutons],['Voir dans Contrôles','mu-pas',false,1],'le bouton du bandeau');
  assert.doesNotMatch(await page.locator('#bilan-journee').innerText(),/Cocher dans un service/);
  await page.locator(BANDEAU+' button').click();await attendre();
  assert.equal(await s.sous(),'mu-pas','le bouton ouvre « Contrôles »');
  assert.equal(await page.locator('#view-title').textContent(),'Contrôles');
  // Le point bloquant est en tête, avec ses boutons : un par service, au nom du service.
  const tete=page.locator('#mu-pas .ct-niveau').first();
  assert.equal(await tete.getAttribute('data-ct-niveau'),'bloquant');
  const point=tete.locator('.ct-point').first();
  assert.equal(await point.locator('.ct-corps>b').innerText(),'Chaque commande a quelqu’un pour la préparer');
  const services=await page.evaluate(()=>Sim.problemes.liste.find(p=>p.etape==='commandes').nomsServices.slice());
  assert.ok(services.length>=2);
  assert.deepEqual(await point.locator('[data-ct-aller]').evaluateAll(bs=>bs.map(x=>x.textContent)),services.map(n=>n+' →'),'ses boutons : un par service');
  assert.equal(await point.evaluate(li=>{const r=li.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),true,'à l’écran, sans défiler');

  /* ---- 2. en lecture seule, il s'ouvre aussi ---------------------------------------------------------------------- */
  await nav.aller(page,'j-chiffres');await attendre();
  await page.locator('#btn-lecture-seule').click();await attendre(500);
  assert.equal(await page.evaluate(()=>document.body.dataset.lecture),'seule');
  b=await bandeau(page);
  assert.deepEqual([b.bouton,b.page,b.grise],['Voir dans Contrôles','mu-pas',false],'en lecture seule, le bouton n’est pas grisé');
  await page.locator(BANDEAU+' button').click();await attendre();
  assert.equal(await s.sous(),'mu-pas','en lecture seule, le bouton ouvre « Contrôles »');
  assert.equal(await page.locator('#mu-pas .ct-niveau.bloquant .ct-point .ct-corps>b').first().innerText(),'Chaque commande a quelqu’un pour la préparer');
  // « Contrôles » se lit : ses boutons vers un réglage sont grisés, avec leur raison.
  assert.equal(await page.locator('#mu-pas .ct-niveau.bloquant [data-ct-aller]').first().isDisabled(),true);
  assert.ok(await page.locator('#mu-pas .ct-niveau.bloquant .ct-raison').count()>=1);
  await page.locator('#btn-lecture-seule').click();await attendre(400);

  /* ---- 4. sans commande que personne ne prépare, pas de bandeau --------------------------------------------------- */
  // Chaque commande absente est cochée dans la première équipe qui l'attend.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const at=Sim.ateliers,st=at.state,r=at.resultat;
    for(const c of Object.values(r.parClasse).filter(x=>x.absente).map(x=>x.id)){
      const service=Sim.unite.ordre(Sim.unite.a.services()).find(x=>Sim.unite.bilan(x.id,at.classes,r).attendues.includes(c));
      st.ateliers.find(a=>a.service===service.id&&(a.type==='manuel'||a.type==='robot')).lots.push([c]);}},''));
  await attendre(800);
  await nav.aller(page,'j-chiffres');await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.resultat.indicateurs.classesAbsentes),0);
  assert.equal(await bandeau(page),null,'plus de bandeau');
  await s.site.effacer();await s.ctx.close();

  /* ---- 3. l'autre écriture du bandeau, en version 1 : la Synthèse d'avant les cinq réponses (resultats-vue.js) ------- */
  s=await ouvrir();({page,attendre}=s);
  const autre=await page.evaluate(()=>{const hote=document.createElement('div');hote.id='essai-bandeau';document.querySelector('#bilan-journee').after(hote);
    OrlyResultatsVue.rendreSynthese(hote,Sim.vue.resultat.indicateurs,{titreDe:()=>''});
    const b=hote.querySelector('.bilan-probleme button');return b?{bouton:b.textContent.trim(),page:b.dataset.page}:null;});
  assert.deepEqual(autre,{bouton:'Voir dans Contrôles',page:'mu-pas'},'resultats-vue.js : le même bouton');
  await page.locator('#essai-bandeau .bilan-probleme button').click();await attendre();
  assert.equal(await s.sous(),'mu-pas','il ouvre « Contrôles »');
  // Le module commun avec la version 2 (simulation.js, non modifié) garde son bouton, mais sa Synthèse ne s'affiche jamais
  // en version 1 : celle de la version 1 la remplace. Nulle part, la version 1 ne dit plus « Cocher dans un service ».
  assert.equal(await page.evaluate(()=>Sim.vue.rendreBilan===Object.getPrototypeOf(Sim.vue).rendreBilan),false,'la Synthèse affichée est celle de la version 1');
  for(const id of ['j-chiffres','mu-pas','mu-services','mu-flux']){
    await nav.aller(page,id);await attendre(250);
    assert.doesNotMatch(await page.locator('#workspace').innerText(),/Cocher dans un service/,id+' : plus de « Cocher dans un service »');
  }
  await s.site.effacer();await s.ctx.close();

  assert.deepEqual(erreurs,[],'aucune erreur de page : '+erreurs.join(' | '));
  console.log('OK synthese-controles : le bandeau « n commandes que personne ne prépare » dit « Voir dans Contrôles » et ouvre « Contrôles », le point bloquant en tête avec un bouton par service ; en lecture seule aussi ; de même pour l’autre écriture du bandeau ; sans commande absente, pas de bandeau');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

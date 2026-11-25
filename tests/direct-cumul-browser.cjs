/* Correction 23 (h) — « En direct » : les chiffres cumulés à l'heure rejouée (version 1), sur l'unité fictive et ses vols
 * fictifs, à 1 366 × 768. Seule la vue à plat les montrait, dans sa bande au-dessus du plan ; ils se lisent maintenant
 * en une ligne du panneau « En ce moment » :
 *     « À 05:10 · commandes prêtes jusqu'ici : 7 sur 17, dont 3 en retard · 2 commandes en retard à cette heure ·
 *       9 services au travail, 2 attendent le service d'avant ».
 *   1. La ligne est dans le panneau, en tête, et se lit à l'ouverture.
 *   2. À chaque heure rejouée, elle dit les mêmes chiffres que la bande de la vue à plat — les commandes prêtes
 *      jusqu'ici sur le total (dont celles prêtes en retard), les commandes en retard à cette heure, les services au
 *      travail et ceux qui attendent le service d'avant —, avec les mêmes mots, et ce que le module en calcule.
 *   3. Elle reste en tête quand on ouvre le détail d'un service ; elle suit le curseur et les flèches du temps.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const P='#en-ce-moment';

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 try{
  const ctx=await browser.newContext({viewport:{width:1366,height:768}});
  const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
  const attendre=(ms=450)=>page.waitForTimeout(ms);
  const site=await F.charger(page,nav,URL_V1,{pageId:'j-plan',relief:true,panneau:true});
  await page.waitForFunction(()=>window.Sim&&Sim.vue&&!Sim.vue.vide&&Sim.ateliers&&Sim.ateliers.resultat&&document.body.dataset.direct==='relief');
  await attendre(700);
  /** Aller à l'heure `t` (minutes), comme le curseur du lecteur. */
  const allerA=async t=>{await page.evaluate(t=>{const c=document.getElementById('sim-curseur');c.value=String(t);c.dispatchEvent(new Event('input',{bubbles:true}));},t);await attendre();};
  /** La ligne du panneau : son heure, ses chiffres (leur texte, leur état). */
  const ligne=()=>page.evaluate(sel=>{const l=document.querySelector(sel+' .dp-cumul');if(!l)return null;const r=l.getBoundingClientRect();
    return {quand:l.querySelector('.dp-cumul-quand').textContent,chiffres:[...l.querySelectorAll('.dp-chiffre')].map(c=>({texte:c.textContent,etat:c.dataset.etat||null})),
      texte:l.textContent.replace(/\s+/g,' ').trim(),visible:r.width>0&&r.height>0,police:parseFloat(getComputedStyle(l).fontSize),haut:Math.round(r.top),t:Sim.vue.t};},P);
  /** La bande de la vue à plat : la même lecture. */
  const bande=()=>page.evaluate(()=>{const b=document.getElementById('plan-bande-texte'),r=b.getBoundingClientRect();
    return {quand:b.querySelector('.pr-quand').textContent,chiffres:[...b.querySelectorAll('.pr-chiffre')].map(c=>({texte:c.textContent,etat:c.dataset.etat||null})),visible:r.width>0&&r.height>0,t:Sim.vue.t};});
  /** Ce que le module calcule à l'heure rejouée, hors de la page des yeux. */
  const calcule=()=>page.evaluate(()=>{const c=OrlyPlanRejoue.chiffresCumules(Sim.ateliers.resultat,Sim.vue.t);return {c,morceaux:OrlyPlanRejoue.morceaux(c).map(m=>({texte:m.texte,etat:m.etat||null}))};});

  /* ---- 1. la ligne est dans le panneau, en tête, à l'ouverture ---------------------------------------------------- */
  let l=await ligne();
  assert.ok(l,'le panneau « En ce moment » a sa ligne de chiffres cumulés');
  assert.deepEqual([l.visible,l.police>=13],[true,true],'elle se lit : '+JSON.stringify(l));
  assert.match(l.quand,/^À (J )?\d\d:\d\d$/);
  assert.match(l.texte,/^À (J )?\d\d:\d\d · commandes prêtes jusqu’ici : \d+ sur \d+/);
  assert.equal(await page.evaluate(sel=>{const p=document.querySelector(sel),l=p.querySelector('.dp-cumul'),c=p.querySelector('.dp-zone-corps');
    return !!(l.compareDocumentPosition(c)&Node.DOCUMENT_POSITION_FOLLOWING)||c.contains(l)&&c.firstElementChild===l;},P),true,'en tête du panneau, avant les réponses');
  assert.equal(await page.locator(P+' .dp-cumul').count(),1,'une seule ligne');

  /* ---- 2. à chaque heure, les mêmes chiffres que la bande de la vue à plat ----------------------------------------- */
  const {debut,fin}=await page.evaluate(()=>({debut:Sim.vue.debut,fin:Sim.vue.fin}));
  // Douze heures réparties sur la journée rejouée, du début à la fin.
  const heures=[...new Set(Array.from({length:12},(_,i)=>Math.round((debut+(fin-debut)*i/11)/5)*5))];
  const enRelief=[];
  for(const t of heures){
    await allerA(t);
    l=await ligne();const c=await calcule();
    assert.equal(l.t,t);
    assert.deepEqual(l.chiffres,c.morceaux,'à '+t+' min : la ligne dit ce que le module calcule');
    enRelief.push({t,quand:l.quand,chiffres:l.chiffres,c:c.c});
  }
  // Les chiffres : les commandes prêtes jusqu'ici ne diminuent jamais, et finissent au total ; ils bougent dans la journée.
  const pretes=enRelief.map(x=>x.c.pretes);
  assert.ok(pretes.every((n,i)=>!i||n>=pretes[i-1]),'les commandes prêtes se cumulent : '+pretes);
  assert.ok(pretes[0]<pretes[pretes.length-1]&&enRelief[0].c.total>0,'elles avancent dans la journée, sur un total de '+enRelief[0].c.total);
  assert.ok(new Set(enRelief.map(x=>JSON.stringify(x.chiffres))).size>=4,'la ligne change avec l’heure');
  assert.ok(enRelief.some(x=>x.c.auTravail>0),'des services au travail');
  assert.ok(enRelief.some(x=>x.chiffres.some(m=>m.etat==='retard')),'un retard se dit par son état, comme dans la bande');
  // La vue à plat, ouverte par son nom : sa bande, aux mêmes heures.
  await nav.vueDuPlan(page,'plat');await attendre(600);
  assert.equal(await page.evaluate(()=>document.body.dataset.direct),'plat');
  for(const x of enRelief){
    await allerA(x.t);
    const b=await bande();
    assert.deepEqual([b.t,b.visible],[x.t,true],'la bande de la vue à plat, à '+x.t+' min');
    assert.deepEqual({quand:b.quand,chiffres:b.chiffres},{quand:x.quand,chiffres:x.chiffres},'à '+x.t+' min : la ligne du panneau dit ce que dit la bande de la vue à plat');
  }

  /* ---- 3. elle reste en tête avec le détail d'un service ; elle suit le temps -------------------------------------- */
  await nav.vueDuPlan(page,'relief');await attendre(600);
  assert.equal(await page.evaluate(()=>document.body.dataset.direct),'relief');
  await allerA(heures[5]);
  const avant=await ligne();
  assert.deepEqual(avant.chiffres,enRelief[5].chiffres,'revenu en relief : la même ligne à la même heure');
  // Un service choisi dans le panneau : son détail, sous la ligne.
  await page.locator(P+' [data-direct-service]').first().click();await attendre(600);
  assert.equal(await page.locator(P+' .dp-detail').count(),1,'le détail du service');
  l=await ligne();
  assert.deepEqual([l.visible,l.chiffres],[true,avant.chiffres],'la ligne reste en tête du panneau, avec le détail d’un service');
  await page.locator(P+' [data-direct-retour]').click();await attendre(500);
  // Une autre heure : la ligne suit.
  await allerA(heures[8]);
  l=await ligne();
  assert.deepEqual([l.quand,l.chiffres],[enRelief[8].quand,enRelief[8].chiffres],'elle suit l’heure rejouée');
  // La fenêtre ne défile pas ; le panneau garde ses cinq réponses sous la ligne.
  assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight-innerHeight),0,'la fenêtre ne défile pas');
  assert.ok(await page.locator(P+' .dp-zone-corps').evaluate(c=>c.textContent.trim().length>20),'le reste du panneau est là');

  assert.deepEqual(erreurs,[],'aucune erreur de page : '+erreurs.join(' | '));
  await site.effacer();
  console.log('OK direct-cumul : la ligne des chiffres cumulés, en tête de « En ce moment » ; à douze heures de la journée fictive, elle dit ce que dit la bande de la vue à plat (commandes prêtes jusqu’ici sur le total, dont en retard ; commandes en retard à cette heure ; services au travail, et ceux qui attendent) ; elle reste avec le détail d’un service et suit l’heure');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

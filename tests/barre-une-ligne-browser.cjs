/* Correction 24 (e) — la barre « Journée de vols » sur une ligne (version 1), sur l'unité fictive et un programme daté
 * fictif, à 1 366 × 768. Le constat : la barre prenait deux à trois lignes pour dire « Période de 30 jours : pas encore
 * simulée… » ; l'en-tête d'« En direct » en relief était coupé.
 *   1. Sur chaque page qui la porte : une seule ligne, 44 px de haut au plus ; dans l'ordre le libellé, ‹, la liste, ›,
 *      une étiquette d'état courte, « La période → » ; plus de bouton « Simuler la période ». La phrase entière est
 *      l'infobulle et le texte lu de l'étiquette. Les trois règles d'une page : 13 px au moins, la fenêtre ne défile
 *      pas, la barre va d'un bord à l'autre.
 *   2. L'étiquette suit l'état : « période non simulée », « période simulée », « période à relancer » ; la phrase
 *      entière reste écrite dans la page « Période ».
 *   3. « En direct » en relief, panneau ouvert puis fermé, et à plat : rien n'est coupé dans l'en-tête — le titre, la
 *      barre et « En ce moment » —, la liste de la journée comprise ; rien ne se recouvre.
 *   4. La bande des chiffres de la vue à plat ne se coupe plus par « … » : trop longue, elle passe sur deux lignes.
 *   5. La Synthèse : son tableau, amené dans sa zone, montre au moins quatre services d'un coup.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const CSV=F.volsDatesCsv(3,'2031-03-03');
const PHRASE={jamais:/^Période de 3 jours : pas encore simulée\. La journée affichée part du sale de la veille saisi\.$/,
  simulee:/^Période simulée : 3 journées de vols ; /,relancer:/^À relancer : un réglage ou les vols ont changé depuis le calcul\./};

/** Dans la page : la barre — sa boîte, ce qu'elle porte dans l'ordre, son étiquette. */
const BARRE=()=>{const b=document.getElementById('periode-bandeau');if(!b||b.hidden||!b.getClientRects().length)return null;
  const r=e=>{const q=e.getBoundingClientRect();return {g:Math.round(q.left),h:Math.round(q.top),d:Math.round(q.right),b:Math.round(q.bottom)};};
  const vus=[...b.querySelectorAll('label,button,select,.pj-mot')].filter(e=>e.getClientRects().length);
  const mot=b.querySelector('.pj-mot'),zone=b.parentElement.getBoundingClientRect(),cs=getComputedStyle(b.parentElement);
  return {boite:r(b),hauteur:Math.round(b.getBoundingClientRect().height*10)/10,
    ordre:vus.map(e=>e.matches('label')?'libellé':e.matches('select')?'liste':e.matches('.pj-mot')?'étiquette':e.textContent.trim()),
    lignes:[...new Set(vus.map(e=>Math.round((e.getBoundingClientRect().top+e.getBoundingClientRect().bottom)/2)))],
    tailles:vus.map(e=>parseFloat(getComputedStyle(e).fontSize)),
    mot:mot?{court:mot.querySelector('.pj-court').textContent,cache:mot.querySelector('.pj-court').getAttribute('aria-hidden'),lu:mot.querySelector('.pj-lu').textContent,titre:mot.title,etat:mot.dataset.etat,
      statut:mot.parentElement.getAttribute('role')}:null,
    bords:[Math.round(zone.left+parseFloat(cs.paddingLeft)),Math.round(zone.right-parseFloat(cs.paddingRight))],
    fenetre:[document.documentElement.scrollHeight>innerHeight,document.documentElement.scrollWidth>innerWidth],
    deborde:b.scrollWidth>b.clientWidth+1};};
/** Dans la page : l'en-tête d'« En direct » — chaque élément visible, s'il est coupé, s'il sort de l'en-tête ; la liste. */
const ENTETE=()=>{const t=document.getElementById('tete-page'),T=t.getBoundingClientRect();
  const r=e=>{const q=e.getBoundingClientRect();return {g:Math.round(q.left),h:Math.round(q.top),d:Math.round(q.right),b:Math.round(q.bottom)};};
  const vu=e=>{const q=e.getBoundingClientRect();return q.width>1&&q.height>1&&getComputedStyle(e).visibility!=='hidden';};
  const els=[...t.querySelectorAll('.tete-titre,label,button,select,.pj-mot')].filter(vu);
  const coupes=els.filter(e=>{const q=e.getBoundingClientRect();if(q.left<T.left-1||q.right>T.right+1||q.top<T.top-1||q.bottom>T.bottom+1)return true;
    // Coupé par un ancêtre qui masque ce qui dépasse.
    for(let p=e.parentElement;p&&p!==t.parentElement;p=p.parentElement){const c=getComputedStyle(p);if(/hidden|clip/.test(c.overflowX)){const P=p.getBoundingClientRect();if(q.left<P.left-1||q.right>P.right+1)return true;}}
    return e.tagName!=='SELECT'&&e.scrollWidth>e.clientWidth+1;}).map(e=>(e.id||e.className||e.tagName)+' «'+e.textContent.trim().slice(0,20)+'»');
  // La liste montre son texte en entier : le texte de l'option choisie, mesuré dans sa police, tient dans la liste.
  const s=document.getElementById('periode-jour'),cs=getComputedStyle(s),c=document.createElement('canvas').getContext('2d');c.font=cs.fontWeight+' '+cs.fontSize+' '+cs.fontFamily;
  const texte=c.measureText(s.selectedOptions[0].textContent).width,place=s.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
  const boites=[t.querySelector('.tete-titre'),document.getElementById('periode-bandeau'),document.getElementById('btn-en-ce-moment')].map(r);
  const croise=(a,b)=>a.g<b.d-1&&b.g<a.d-1&&a.h<b.b-1&&b.h<a.b-1;
  return {coupes,liste:{texte:Math.round(texte),place:Math.round(place)},boites,recouvre:croise(boites[0],boites[1])||croise(boites[1],boites[2])||croise(boites[0],boites[2]),
    hauteur:Math.round(T.height),panneau:!document.body.classList.contains('sans-en-ce-moment')};};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 const ctx=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});
 const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
 const site=await F.charger(page,nav,URL_V1,{csv:CSV,pageId:'j-chiffres'});
 await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.unite);
 try{
  const pages=await page.evaluate(()=>OrlyOnglets.entrees().flatMap(o=>o.pages||[o.id]));
  /** La barre de chaque page qui la porte, dans l'état du moment : `court` et `phrase` attendus. */
  const partout=async(court,phrase,etat)=>{
   const portees=[];
   for(const id of pages){
    await nav.aller(page,id);
    const b=await page.evaluate(BARRE);if(!b)continue;
    portees.push(id);const Q='« '+id+' » ('+court+')';
    assert.ok(b.hauteur<=44,Q+' : la barre fait 44 px de haut au plus — '+b.hauteur);
    assert.equal(b.lignes.length===1||Math.max(...b.lignes)-Math.min(...b.lignes)<=2,true,Q+' : tout est sur une ligne — '+JSON.stringify(b.lignes));
    assert.deepEqual(b.ordre,['libellé','‹','liste','›','étiquette'].concat(id==='j-periode'?[]:['La période →']),Q+' : le libellé, ‹, la liste, ›, l’étiquette, « La période → »');
    assert.deepEqual([b.mot.court,b.mot.cache,b.mot.etat,b.mot.statut],[court,'true',etat,'status'],Q+' : l’étiquette courte');
    assert.match(b.mot.titre,phrase,Q+' : la phrase entière est l’infobulle');
    assert.equal(b.mot.lu,b.mot.titre,Q+' : et le texte lu');
    assert.ok(b.tailles.every(t=>t>=13),Q+' : 13 px au moins — '+b.tailles.join(' '));
    assert.deepEqual(b.fenetre,[false,false],Q+' : la fenêtre ne défile pas');
    assert.equal(b.deborde,false,Q+' : rien ne dépasse de la barre');
    if(id!=='j-plan')assert.deepEqual([b.boite.g,b.boite.d],b.bords,Q+' : la barre va d’un bord à l’autre');
   }
   return portees;};

  // 1. Période non simulée.
  const portees=await partout('période non simulée',PHRASE.jamais,'jamais');
  assert.ok(portees.length>=8&&['j-chiffres','j-plan','at-planning','j-periode','v-programme'].every(p=>portees.includes(p)),'les pages qui portent la barre : '+portees.join(' '));
  assert.equal(await page.locator('#periode-bandeau button',{hasText:/la période$/}).count(),0,'plus de bouton « Simuler la période » dans la barre');

  // 2. Simulée, puis à relancer. La phrase entière reste écrite dans « Période ».
  await nav.aller(page,'j-periode');
  assert.match((await page.locator('#journee-periode .pv-etat').innerText()).trim(),PHRASE.jamais,'« Période » écrit la phrase entière');
  await page.locator('#journee-periode [data-pv=lancer]').click();
  await page.waitForFunction(()=>Sim.periode.etat()==='a-jour',null,{timeout:300000});
  assert.match((await page.locator('#journee-periode .pv-etat').innerText()).trim(),PHRASE.simulee,'« Période » écrit la phrase entière, simulée');
  await partout('période simulée',PHRASE.simulee,'a-jour');
  await page.evaluate(()=>{const e=Sim.ateliers.state.ateliers.find(a=>a.id==='pr');Sim.ateliers.changer(()=>{e.personnes+=1;},'essai');});
  await page.waitForFunction(()=>Sim.periode.etat()==='a-relancer');
  await partout('période à relancer',PHRASE.relancer,'a-relancer');

  // 3. « En direct » : en relief, panneau ouvert puis fermé ; à plat.
  const direct=[];
  for(const [nom,ouvrir] of [['en relief, panneau ouvert',async()=>{await nav.aller(page,'j-plan',{relief:true,panneau:true});}],
    ['en relief, panneau fermé',async()=>{await page.locator('#btn-en-ce-moment').click();await page.waitForFunction(()=>document.body.classList.contains('sans-en-ce-moment'));}],
    ['à plat, panneau fermé',async()=>{await nav.aller(page,'j-plan');}],
    ['à plat, panneau ouvert',async()=>{if(await page.evaluate(()=>document.body.classList.contains('sans-en-ce-moment')))await page.locator('#btn-en-ce-moment').click();await page.waitForFunction(()=>!document.body.classList.contains('sans-en-ce-moment'));}]]){
   await ouvrir();
   await page.waitForFunction(()=>{const b=document.getElementById('periode-bandeau');return b&&!b.hidden&&b.getClientRects().length>0;});
   const e=await page.evaluate(ENTETE);
   assert.deepEqual(e.coupes,[],'« En direct » '+nom+' : rien n’est coupé dans l’en-tête');
   assert.ok(e.liste.texte<=e.liste.place,'« En direct » '+nom+' : la liste de la journée montre son texte en entier ('+e.liste.texte+' px pour '+e.liste.place+')');
   assert.equal(e.recouvre,false,'« En direct » '+nom+' : le titre, la barre et « En ce moment » ne se recouvrent pas — '+JSON.stringify(e.boites));
   const b=await page.evaluate(BARRE);assert.ok(b.hauteur<=44&&b.deborde===false,'« En direct » '+nom+' : la barre sur une ligne ('+b.hauteur+' px)');
   direct.push(nom+' '+e.hauteur+' px');
  }

  // 4. La bande des chiffres de la vue à plat : plus de « … » ; trop longue, elle passe sur deux lignes.
  const bande=await page.evaluate(()=>{const p=document.getElementById('plan-bande-texte'),c=getComputedStyle(p),ligne=parseFloat(getComputedStyle(p.parentElement).lineHeight);
    const avant={points:c.textOverflow,blanc:c.whiteSpace,deborde:p.scrollWidth>p.clientWidth+1,lignes:Math.round(p.getBoundingClientRect().height/ligne)};
    const garde=p.innerHTML;p.innerHTML=garde+' · <span class="pr-chiffre">'+'un chiffre de plus pour allonger la bande '.repeat(3)+'</span>';
    const long={deborde:p.scrollWidth>p.clientWidth+1,lignes:Math.round(p.getBoundingClientRect().height/ligne),dansLaBande:p.getBoundingClientRect().bottom<=p.parentElement.getBoundingClientRect().bottom+1};
    p.innerHTML=garde;return {avant,long};});
  assert.notEqual(bande.avant.points,'ellipsis','la bande des chiffres ne se coupe plus par « … »');
  assert.deepEqual([bande.avant.blanc,bande.avant.deborde],['normal',false],'la bande des chiffres va à la ligne, rien ne dépasse');
  assert.deepEqual([bande.long.deborde,bande.long.dansLaBande],[false,true],'trop longue, elle reste dans sa bande');
  assert.ok(bande.long.lignes>=2,'trop longue, elle passe sur deux lignes ('+bande.long.lignes+')');

  // 5. La Synthèse : le tableau, amené en haut de sa zone, montre au moins quatre services d'un coup.
  await nav.aller(page,'j-chiffres');
  const synthese=await page.evaluate(()=>{const t=document.querySelector('#workspace .sy-table'),z=t.closest('.page-zone');
    z.scrollTop+=t.getBoundingClientRect().top-z.getBoundingClientRect().top;
    // Un service est montré quand son nom se lit en entier dans la zone (sa rangée peut continuer plus bas).
    const Z=z.getBoundingClientRect(),noms=[...t.tBodies[0].rows].map(r=>(r.querySelector('.sy-service')||r.cells[0]).getBoundingClientRect());
    return {zone:Math.round(Z.height),services:noms.length,visibles:noms.filter(q=>q.height>0&&q.top>=Z.top-1&&q.bottom<=Math.min(Z.bottom,innerHeight)+1).length};});
  assert.ok(synthese.visibles>=4,'la Synthèse montre au moins quatre services de son tableau à 1 366 × 768 — '+JSON.stringify(synthese));

  assert.deepEqual(erreurs,[],'aucune erreur de script : '+erreurs.join(' | '));
  console.log('OK barre-une-ligne : à 1 366 × 768, sur '+portees.length+' pages, dans ses trois états — la barre « Journée de vols » sur une ligne, 44 px au plus, le libellé, ‹, la liste, ›, l’étiquette, « La période → », sans bouton « Simuler la période » ; la phrase entière en infobulle et en texte lu, et écrite dans « Période » ; « En direct » ('+direct.join(' ; ')+') : rien de coupé, la liste entière, rien ne se recouvre ; la bande des chiffres passe sur deux lignes ; la Synthèse montre '+synthese.visibles+' services sur '+synthese.services+' dans une zone de '+synthese.zone+' px');
 }finally{site.effacer();await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

/* Évolution 26 (a) — la charte de l'interface tenue par des tests : le budget d'une page (règle 8 de
 * docs/CHARTE_INTERFACE.md), mesuré sur l'unité fictive et un programme daté fictif de trois jours, à 1 366 × 768, sur
 * chaque page du menu, l'accueil, la fiche d'un service et celle d'une équipe.
 *
 * Cinq mesures par écran, dans la page (hors du menu et de la barre du haut), sur ce qui se voit à l'écran (un élément
 * caché, ou plus bas dans une zone qui défile, ne compte pas) :
 *   mots       les mots visibles hors des tableaux et des dessins                       150 au plus
 *   phrases    les phrases d'explication de 12 mots et plus                             1 au plus
 *   deplier    les sections à déplier (`details`, un élément qui porte `aria-expanded`)  0
 *   boutons    les boutons visibles                                                     12 au plus
 *   colonnes   les colonnes du plus grand tableau                                        7 au plus (la Synthèse : 8)
 *
 * Un test à cliquet. L'écart de chaque page (ce qui dépasse le budget, mesure par mesure) a été relevé une fois, au
 * début de l'évolution 26, dans `tests/charte-dette.json` (« pages »). Le test échoue :
 *   - si une page dépasse le budget sans être dans la dette, ou si son écart grandit ;
 *   - si une page créée depuis (`NEUVES`) a une dette : elle tient le budget, sans exception ;
 *   - si un écart baisse sans que la dette soit réécrite à la baisse : `node tests/charte-budget-browser.cjs --reecrire`
 *     la réécrit (elle ne fait que baisser, jamais monter, et retire ce qui tombe à zéro).
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const FICHIER_DETTE=path.join(__dirname,'charte-dette.json');

/** Le budget de la règle 8, et ses deux exceptions décidées (la Synthèse, à huit colonnes ; la grille de tous les temps,
 *  qui n'est pas une page du menu). */
const BUDGET={mots:150,phrases:1,deplier:0,boutons:12,colonnes:7};
const EXCEPTIONS={'j-chiffres':{colonnes:8}};
/** Les pages créées par l'évolution 26 : aucune dette. */
const NEUVES=[];
const MESURES=Object.keys(BUDGET);

/* ---- dans la page : les cinq mesures ---------------------------------------------------------------------------- */
function mesurer(selZone){
  const zone=document.querySelector(selZone);
  if(!zone)return null;
  const vw=innerWidth,vh=innerHeight;
  /** Ce qui se voit : l'élément a une boîte, n'est pas caché, et une part de lui est à l'écran — dans la fenêtre et dans
   *  chaque zone qui le contient et coupe ce qui la dépasse (une liste qui défile). */
  const vu=e=>{
    if(!e.getClientRects().length)return false;
    if(!e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))return false;
    let b=e.getBoundingClientRect(),g=Math.max(b.left,0),h=Math.max(b.top,0),d=Math.min(b.right,vw),bas=Math.min(b.bottom,vh);
    for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){
      const s=getComputedStyle(p);
      if(s.overflowX==='visible'&&s.overflowY==='visible')continue;
      const c=p.getBoundingClientRect();g=Math.max(g,c.left);h=Math.max(h,c.top);d=Math.min(d,c.right);bas=Math.min(bas,c.bottom);
    }
    return d-g>=1&&bas-h>=1;
  };
  const horsTexte='script,style,noscript,template,select,option,textarea,svg,canvas,title,desc,.sr-only,[hidden],dialog:not([open]),#notifs';
  const tableau='table,[role=table],[role=grid],[role=treegrid]';
  const mots=t=>(t.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-.,:]*/gu)||[]).length;
  /* mots et phrases : les textes, rangés par leur bloc (l'ancêtre le plus proche qui n'est pas en ligne) */
  let nMots=0;const blocs=new Map();
  const enLigne=e=>/^inline/.test(getComputedStyle(e).display)&&!e.matches('button,[role=button],a.btn,label.btn,summary,input,select');
  const marche=document.createTreeWalker(zone,NodeFilter.SHOW_TEXT);
  for(let n=marche.nextNode();n;n=marche.nextNode()){
    const t=n.textContent;if(!t.trim())continue;
    const e=n.parentElement;if(!e||e.closest(horsTexte)||e.closest(tableau))continue;
    if(!vu(e))continue;
    nMots+=mots(t);
    // Une phrase d'explication : du texte courant, pas l'étiquette d'un bouton, d'un champ ou d'un onglet.
    if(e.closest('button,[role=button],[role=tab],a.btn,label.btn,summary,label,legend,h1,h2,h3,h4,h5,h6,th'))continue;
    let b=e;while(b!==zone&&enLigne(b))b=b.parentElement;
    blocs.set(b,(blocs.get(b)||'')+t);
  }
  const longues=[];
  for(const t of blocs.values())for(const ph of t.replace(/\s+/g,' ').split(/(?<=[.!?…])\s+(?=\S)/))if(mots(ph)>=12)longues.push(ph.trim().slice(0,90));
  /* sections à déplier */
  const deplier=[...zone.querySelectorAll('details,[aria-expanded]')].filter(vu)
    .map(e=>(e.tagName==='DETAILS'?(e.querySelector('summary')||e).textContent:e.textContent||e.getAttribute('aria-label')||'').trim().replace(/\s+/g,' ').slice(0,50));
  /* boutons visibles */
  const boutons=[...zone.querySelectorAll('button,summary,[role=button],a.btn,label.btn,input[type=button],input[type=submit]')].filter(vu)
    .map(e=>(e.textContent||e.getAttribute('aria-label')||e.title||e.value||'').trim().replace(/\s+/g,' ').slice(0,40));
  /* colonnes du plus grand tableau */
  let colonnes=0,leTableau='';
  for(const t of [...zone.querySelectorAll(tableau)].filter(vu)){
    let n=0;
    if(t.tagName==='TABLE')for(const r of t.rows)n=Math.max(n,[...r.cells].reduce((s,c)=>s+(c.colSpan||1),0));
    else for(const r of t.querySelectorAll('[role=row]'))n=Math.max(n,r.querySelectorAll('[role=cell],[role=gridcell],[role=columnheader],[role=rowheader]').length);
    if(n>colonnes){colonnes=n;leTableau=(t.getAttribute('aria-label')||(t.caption&&t.caption.textContent)||t.className||t.tagName).toString().trim().slice(0,50);}
  }
  return {mesures:{mots:nMots,phrases:longues.length,deplier:deplier.length,boutons:boutons.length,colonnes},detail:{longues,deplier,boutons,leTableau}};
}

/** L'écart d'une page au budget : ce qui dépasse, mesure par mesure (rien quand elle le tient). */
function ecartDe(id,m){
  const lim={...BUDGET,...(EXCEPTIONS[id]||{})},e={};
  for(const k of MESURES)if(m[k]>lim[k])e[k]=m[k]-lim[k];
  return e;
}
const lireDette=()=>JSON.parse(fs.readFileSync(FICHIER_DETTE,'utf8'));

(async()=>{
 const reecrire=process.argv.includes('--reecrire');
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[],releve={},details={};
 try{
  const ctx=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});
  const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
  const site=await F.charger(page,nav,URL_V1,{csv:F.volsDatesCsv(3,'2031-03-03'),pageId:'j-chiffres'});
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.onglets&&Sim.unite);
  await page.waitForTimeout(400);
  const lire=async(id,zone='#workspace')=>{
    const r=await page.evaluate(mesurer,zone);
    assert.ok(r,id+' : la page se mesure');
    releve[id]=r.mesures;details[id]=r.detail;
  };
  // Les pages du menu : chaque entrée (une page, ou chaque onglet de son groupe), puis « Fichiers ».
  const pages=await page.evaluate(()=>OrlyOnglets.entrees().flatMap(o=>o.pages||[o.id]));
  for(const id of pages){
    await nav.aller(page,id,{relief:true,panneau:false});await page.waitForTimeout(id==='j-plan'?1200:450);
    assert.equal(await page.evaluate(()=>document.body.dataset.sous),id,id+' s’ouvre');
    await lire(id);
  }
  // La fiche d'un service, puis celle d'une de ses équipes, comme elles s'ouvrent.
  await nav.service(page,'prepa');await page.waitForTimeout(300);
  await lire('fiche-service');
  const equipe=await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.type==='manuel'&&a.service==='prepa').id);
  await nav.equipe(page,equipe);await page.waitForTimeout(300);
  await lire('fiche-equipe');
  // L'accueil : la marque, en haut du menu.
  await page.locator('#btn-accueil').click();await page.waitForTimeout(400);
  await lire('accueil','#view-accueil');
  await site.effacer();await ctx.close();

  /* ---- le cliquet ---- */
  const dette=lireDette(),avant=dette.pages||{},trop=[],baisse=[],ecarts={};
  for(const id of Object.keys(releve)){
    const e=ecartDe(id,releve[id]);ecarts[id]=e;
    const d=avant[id]||{};
    for(const k of MESURES){
      const a=d[k]||0,n=e[k]||0;
      if(n>a)trop.push(id+' — '+k+' : '+releve[id][k]+' (budget '+(({...BUDGET,...(EXCEPTIONS[id]||{})})[k])+', dette '+a+')'
        +(k==='phrases'?' — '+JSON.stringify(details[id].longues):k==='deplier'?' — '+JSON.stringify(details[id].deplier):k==='boutons'?' — '+JSON.stringify(details[id].boutons):k==='colonnes'?' — '+details[id].leTableau:''));
      else if(n<a)baisse.push({id,k,a,n});
    }
  }
  for(const id of NEUVES)assert.ok(!avant[id],id+' : une page créée par l’évolution 26 n’a pas de dette');
  if(reecrire){
    const pagesNeuves={};
    for(const [id,d] of Object.entries(avant)){
      const e={};for(const k of MESURES){const v=Math.min(d[k]||0,(ecarts[id]||{})[k]||0);if(v>0)e[k]=v;}
      if(Object.keys(e).length)pagesNeuves[id]=e;
    }
    fs.writeFileSync(FICHIER_DETTE,JSON.stringify({...dette,pages:pagesNeuves},null,1)+'\n');
    console.log('charte-budget-browser : dette réécrite à la baisse ('+baisse.length+' écart(s) baissé(s)).');
  }
  assert.deepEqual(trop,[],'une page dépasse le budget de la charte au-delà de sa dette (tests/charte-dette.json) :\n'+trop.join('\n')
    +'\nLes écarts mesurés : '+JSON.stringify(ecarts));
  if(!reecrire)assert.deepEqual(baisse.map(b=>b.id+' — '+b.k+' : '+b.a+' → '+b.n),[],'un écart a baissé : réécrire la dette à la baisse (node tests/charte-budget-browser.cjs --reecrire)');
  assert.deepEqual(erreurs,[],'aucune erreur de page');
  const n=Object.keys(releve).length,dans=Object.values(ecarts).filter(e=>!Object.keys(e).length).length;
  console.log('charte-budget-browser : ok — '+n+' écrans mesurés à 1 366 × 768 (les pages du menu, la fiche d’un service, celle d’une équipe, l’accueil) ; '
    +dans+' tiennent le budget de la règle 8, les autres ne dépassent pas leur dette.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

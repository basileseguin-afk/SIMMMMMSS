/* Banc d'essai, correction 22 (b) — la page ne touche pas son stockage trop
 * tôt, et ce qu'elle accepte est enregistré avant d'être quittée (v1).
 *
 * Un document qui touche `localStorage` avant que le navigateur ait fini de
 * l'installer peut se retrouver avec un stockage détaché : il s'ouvre vide et
 * n'enregistre rien (docs/BANC_ESSAI.md § 11 ; outils/banc-stockage.cjs).
 *   1. Dans index.html, accueil.html et secours.html, le premier accès au
 *      stockage vient après la lecture de `document.cookie` ; dans les deux
 *      premières, il vient d'un fichier (theme-tot.js), plus d'un script en
 *      ligne. Le thème sombre est posé avant que le corps de la page existe :
 *      pas d'éclair clair.
 *   2. Un réglage changé juste avant de recharger, de fermer ou de quitter la
 *      page est enregistré : les équipes, le plan, les liens, le barème —
 *      avec le garde et sans lui (le garde ôté sans toucher le stockage).
 *   3. Les cases mises de côté par la page de secours reviennent, sans
 *      attendre.
 * Les accès sont relevés sans toucher le stockage : la propriété est
 * remplacée par un accesseur qui note, puis rend la main à celui d'origine.
 * Chaque étape attend son effet, pas un délai. Équipes et noms fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const U=nom=>pathToFileURL(path.resolve(__dirname,'..',nom)).href;

/** Au tout début de chaque document : note, dans l'ordre, les lectures de `document.cookie` et les accès à `localStorage`
 *  (d'où ils viennent), et le thème posé quand le corps de la page apparaît. Ne touche pas le stockage. */
const RELEVER=()=>{
  const journal=window.__journal=[],dOu=()=>{const s=document.currentScript;return s?(s.src?s.src.split('/').pop().split('?')[0]:'en ligne'):'hors script';};
  const d=Object.getOwnPropertyDescriptor(window,'localStorage');
  Object.defineProperty(window,'localStorage',{configurable:true,enumerable:d.enumerable,get(){journal.push(['stockage',dOu()]);return d.get.call(window);}});
  const c=Object.getOwnPropertyDescriptor(Document.prototype,'cookie');
  Object.defineProperty(Document.prototype,'cookie',{configurable:true,enumerable:c.enumerable,set:c.set,get(){journal.push(['cookie',dOu()]);return c.get.call(this);}});
  // (Au tout début, le document n'a pas encore d'élément racine : on observe le document entier.)
  new MutationObserver((_,o)=>{if(document.body){window.__themeAuCorps=document.documentElement.dataset.theme||'clair';o.disconnect();}}).observe(document,{childList:true,subtree:true});
};
/** Ôte le garde de stockage.js sans toucher le stockage : la propriété est figée avec son accesseur d'origine. */
const SANS_GARDE=()=>{const d=Object.getOwnPropertyDescriptor(window,'localStorage');Object.defineProperty(window,'localStorage',{get:d.get,set:d.set,enumerable:d.enumerable,configurable:false});};
const pret=p=>p.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.editor&&Sim.flows&&Sim.reglages&&!!Sim.ateliers.resultat);
/** Un réglage de plus dans chaque module qui enregistre : une équipe, une zone déplacée, un lien basculé, un temps par vol. */
const REGLER=n=>{
  Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'e'+n,nom:'Équipe '+n,service:'cuisine',type:'manuel',debut:'05:00',jour:0,personnes:2,pauses:[],lots:[],regime:{actif:true}});},'');
  Sim.editor.change(()=>{Sim.editor.state.zones.find(z=>z.id==='cuisine').x+=10;},'');
  Sim.flows.change(()=>{Sim.flows.state.flows[0].enabled=!Sim.flows.state.flows[0].enabled;},'');
  Sim.reglages.changer(()=>{const b=Sim.reglages.etat.bareme;b.cuisine={...(b.cuisine||{}),'*/BC':30+n};},'');
};
/** Ce que la page tient en mémoire, dans ces quatre modules. */
const ETAT=()=>({equipes:Sim.ateliers.state.ateliers.map(a=>a.nom),x:Sim.editor.state.zones.find(z=>z.id==='cuisine').x,lien:Sim.flows.state.flows[0].enabled,temps:(Sim.reglages.etat.bareme.cuisine||{})['*/BC']});

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 try{
  /* ---- 1. le premier accès au stockage : après document.cookie, et pas dans un script en ligne ---------------- */
  {
   const ctx=await browser.newContext({viewport:{width:1280,height:800}});
   const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));
   await page.addInitScript(RELEVER);
   // Le thème sombre, choisi dans l'application ; puis chaque page, rechargée, le pose avant son corps.
   await page.goto(U('index.html'));await pret(page);
   await page.locator('#btn-theme').click();
   await page.waitForFunction(()=>localStorage.getItem('ory-ui-theme')==='sombre');
   for(const [nom,source] of [['index.html','theme-tot.js'],['accueil.html','theme-tot.js'],['secours.html','en ligne']]){
    await page.goto(U(nom));
    const {journal,theme}=await page.evaluate(()=>({journal:window.__journal,theme:window.__themeAuCorps}));
    const i=journal.findIndex(x=>x[0]==='stockage');
    assert.ok(i>=0,nom+' : la page lit son stockage');
    assert.deepEqual(journal[i],['stockage',source],nom+' : son premier accès au stockage vient de « '+source+' » — '+JSON.stringify(journal.slice(0,4)));
    assert.ok(i>0&&journal[i-1][0]==='cookie'&&journal[i-1][1]===source,nom+' : juste après la lecture de document.cookie, dans le même script — '+JSON.stringify(journal.slice(0,4)));
    if(nom!=='secours.html'){
     assert.equal(theme,'sombre',nom+' : le thème sombre est posé avant le corps de la page');
     assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'sombre');
    }
   }
   // Sans préférence : le thème clair, et les mêmes accès.
   await page.goto(U('index.html'));await pret(page);
   await page.locator('#btn-theme').click();
   await page.waitForFunction(()=>localStorage.getItem('ory-ui-theme')===null);
   await page.reload();await pret(page);
   assert.equal(await page.evaluate(()=>window.__themeAuCorps),'clair','sans préférence : le thème clair');
   await ctx.close();
  }

  /* ---- 2. un réglage changé juste avant de recharger, de fermer ou de quitter la page est enregistré ---------- */
  for(const sansGarde of [false,true]){
   const M=(sansGarde?'sans le garde':'avec le garde')+' : ';
   const ctx=await browser.newContext({viewport:{width:1280,height:800}});
   if(sansGarde)await ctx.addInitScript(SANS_GARDE);
   const ouvrir=async()=>{const p=await ctx.newPage();p.on('pageerror',e=>erreurs.push(e.message));await p.goto(U('index.html'));await pret(p);return p;};
   let page=await ouvrir();
   assert.equal(await page.evaluate(()=>OrlyStockage.installe),!sansGarde,M+'le garde est '+(sansGarde?'ôté':'posé'));
   // Recharger aussitôt : sans aucune attente entre le réglage et le rechargement.
   await page.evaluate(REGLER,1);const a=await page.evaluate(ETAT);
   await page.reload();await pret(page);
   assert.deepEqual(await page.evaluate(ETAT),a,M+'rechargée aussitôt, la page retrouve les quatre réglages');
   assert.ok(a.equipes.includes('Équipe 1')&&a.temps===31);
   // Fermer aussitôt l'onglet : un onglet neuf les retrouve.
   await page.evaluate(REGLER,2);const b=await page.evaluate(ETAT);
   await page.close();
   page=await ouvrir();
   assert.deepEqual(await page.evaluate(ETAT),b,M+'l’onglet fermé aussitôt, un onglet neuf retrouve les réglages');
   // Quitter aussitôt la page pour une autre, puis revenir.
   await page.evaluate(REGLER,3);const c=await page.evaluate(ETAT);
   await page.goto(U('accueil.html'));
   await page.goto(U('index.html'));await pret(page);
   assert.deepEqual(await page.evaluate(ETAT),c,M+'la page quittée aussitôt, puis rouverte, retrouve les réglages');
   assert.deepEqual(c.equipes.slice(-3),['Équipe 1','Équipe 2','Équipe 3']);
   // Et les données enregistrées sont bien celles-là : chaque module a sa clé.
   const cles=await page.evaluate(()=>['ory-ateliers-v1','orly-plan-v3','orly-flows-v1','ory-modele-v1'].filter(k=>localStorage.getItem(k)!==null));
   assert.deepEqual(cles,['ory-ateliers-v1','orly-plan-v3','orly-flows-v1','ory-modele-v1'],M+'chaque module a enregistré');
   assert.equal(await page.locator('.donnees-changees').count(),0,M+'aucun bandeau');
   await ctx.close();
  }

  /* ---- 3. la page de secours : les cases mises de côté reviennent, sans attendre -------------------------------- */
  {
   const ctx=await browser.newContext({viewport:{width:1280,height:800}});
   const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));
   await page.goto(U('index.html'));await pret(page);
   await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'x1',nom:'Case témoin',service:'cuisine',type:'manuel',debut:'05:00',jour:0,personnes:2,pauses:[],lots:[],regime:{actif:true}});},''));
   await page.goto(U('secours.html'));
   assert.match(await page.locator('#liste').innerText(),/ory-ateliers-v1/,'la page de secours lit les données enregistrées');
   await page.locator('#cote-cases').click();await page.waitForURL(/index\.html\?continuer=1/);await pret(page);
   assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.some(a=>a.id==='x1')),false,'repartis sans les cases');
   await page.goto(U('secours.html'));
   await page.locator('#remettre').click();
   await page.goto(U('index.html'));await pret(page);
   assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.some(a=>a.id==='x1')),true,'les cases sont revenues');
   await ctx.close();
  }

  assert.deepEqual(erreurs,[],'aucune erreur de page');
  console.log('stockage-tot-browser : ok — le premier accès au stockage de index.html, accueil.html et secours.html vient après document.cookie (et d’un fichier, pour les deux premières) ; le thème sombre posé avant le corps de la page ; un réglage changé juste avant de recharger, de fermer ou de quitter la page est enregistré, avec le garde et sans lui ; les cases de la page de secours reviennent');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

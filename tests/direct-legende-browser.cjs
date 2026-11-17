/* Correction 21 (d) — la légende ne cache pas la scène (v1), à 1 366 × 768 et
 * 1 920 × 1 080, sur l'unité fictive :
 *   — sous 1 500 px de large, la légende est repliée à l'ouverture : son seul
 *     titre, dans le coin de la toile ; sur un grand écran, elle est dépliée ;
 *   — le choix de l'utilisateur est retenu (un clic, ou Entrée sur son
 *     titre) : il revient après un rechargement, quelle que soit la taille ;
 *     l'état pris à l'ouverture, lui, n'est pas un choix : rien n'est gardé ;
 *   — dépliée, elle ne recouvre jamais plus de 20 % de la toile : « En ce
 *     moment » ouvert ou replié, et dans une petite fenêtre ; elle reste dans
 *     la toile, et son contenu défile s'il ne tient pas.
 * Chaque étape attend son effet, pas un délai. Unité, équipes et vols fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const CLE='ory-ui-direct-legende',PLAFOND=0.20;
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 try{
  for(const [largeur,hauteur] of [[1366,768],[1920,1080]]){
   const V=largeur+' × '+hauteur+' : ',portable=largeur<1500;
   const ctx=await browser.newContext({viewport:{width:largeur,height:hauteur},deviceScaleFactor:1,reducedMotion:'no-preference'});
   const page=await ctx.newPage(),erreurs=[];
   page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
   const pret=()=>page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.direct&&!!Sim.ateliers.resultat&&Sim.direct.etatVue().images>0&&Sim.direct.etatVue().zones.length>0);
   const stable=async()=>{await page.waitForFunction(()=>{const e=Sim.direct.etatVue(),c=document.getElementById('direct-toile');return !e.enMouvement&&e.ecran.w===c.clientWidth&&e.ecran.h===c.clientHeight;});
     await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
   /** La page rechargée, de retour sur « En direct ». */
   const ouvrir=async()=>{await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.direct&&!!Sim.ateliers.resultat);
     await nav.aller(page,'j-plan',{relief:true});await pret();await stable();};
   /** La légende : ouverte ou non, sa part de la toile, sa place, ce qui s'y voit, le choix gardé. */
   const legende=()=>page.evaluate(cle=>{const b=s=>document.querySelector(s).getBoundingClientRect(),d=document.getElementById('direct-coin'),c=b('#direct-coin'),t=b('#direct-toile');
     return {ouverte:d.open,part:c.width*c.height/(t.width*t.height),dans:c.left>=t.left-0.5&&c.right<=t.right+0.5&&c.top>=t.top-0.5&&c.bottom<=t.bottom+0.5,
       coin:c.left-t.left<=16,largeur:c.width/t.width,hauteur:c.height/t.height,toile:[Math.round(t.width),Math.round(t.height)],
       contenu:document.getElementById('direct-legende').checkVisibility(),titre:d.querySelector('summary').textContent.trim(),choix:localStorage.getItem(cle),
       panneau:!document.body.classList.contains('sans-en-ce-moment')};},CLE);
   /** Ouvre ou replie « En ce moment » sans retenir de choix pour la légende ; la toile change de taille. */
   const enCeMoment=async ouvert=>{
     if(await page.evaluate(()=>!document.body.classList.contains('sans-en-ce-moment'))!==ouvert)await page.locator('#btn-en-ce-moment').click();
     await page.waitForFunction(o=>!document.body.classList.contains('sans-en-ce-moment')===o,ouvert);await stable();};
   const pourcent=x=>(Math.round(x*1000)/10+' %').replace('.',',');
   /** Dépliée : jamais plus de 20 % de la toile, dans la toile, dans son coin. */
   const mesuree=(l,mot)=>{assert.ok(l.ouverte&&l.contenu,mot+' : dépliée');
     assert.ok(l.part<=PLAFOND+1e-9,mot+' : '+pourcent(l.part)+' de la toile ('+l.toile.join(' × ')+'), au plus 20 %');
     assert.ok(l.largeur<=0.4+1e-6&&l.hauteur<=0.5+1e-6,mot+' : au plus 40 % de sa largeur et la moitié de sa hauteur');
     assert.ok(l.dans&&l.coin,mot+' : dans la toile, dans son coin');};
   try{
    const x=await F.charger(page,nav,URL,{pageId:'j-plan',relief:true});await pret();
    // (Le chargement de l'unité fictive ouvre « En ce moment » ; on rouvre la page comme l'utilisateur la trouve.)
    await page.evaluate(()=>{localStorage.removeItem('ory-ui-direct-legende');localStorage.removeItem('ory-ui-en-ce-moment');});
    await page.reload();await ouvrir();

    // 1. À l'ouverture, sans choix retenu : repliée sous 1 500 px de large, dépliée au-delà. Rien n'est gardé.
    const l0=await legende();
    assert.equal(l0.choix,null,V+'aucun choix retenu : l’état d’ouverture n’en est pas un');
    assert.equal(l0.titre,'Légende');
    if(portable){
      assert.ok(!l0.ouverte&&!l0.contenu,V+'sur un portable, la légende est repliée à l’ouverture');
      assert.ok(l0.part<0.012&&l0.dans&&l0.coin,V+'son seul titre, dans le coin de la toile ('+pourcent(l0.part)+')');
    }else mesuree(l0,V+'sur un grand écran, à l’ouverture');
    // Rien n'a été gardé par l'ouverture elle-même, même après un moment.
    await stable();
    assert.equal((await legende()).choix,null,V+'toujours aucun choix gardé');

    // 2. Le choix de l'utilisateur est retenu : un clic sur son titre la déplie (ou la replie), et il revient après un rechargement.
    await page.locator('#direct-coin > summary').click();
    await page.waitForFunction(([cle,o])=>document.getElementById('direct-coin').open===o&&localStorage.getItem(cle)===(o?'ouverte':'repliee'),[CLE,portable]);
    await page.reload();await ouvrir();
    const l1=await legende();
    assert.deepEqual([l1.ouverte,l1.choix],[portable,portable?'ouverte':'repliee'],V+'après un rechargement, le choix est là');
    // Au clavier : Entrée sur son titre fait l'autre choix, retenu lui aussi.
    await page.locator('#direct-coin > summary').focus();await page.keyboard.press('Enter');
    await page.waitForFunction(([cle,o])=>document.getElementById('direct-coin').open===o&&localStorage.getItem(cle)===(o?'ouverte':'repliee'),[CLE,!portable]);
    await page.reload();await ouvrir();
    const l2=await legende();
    assert.deepEqual([l2.ouverte,l2.choix],[!portable,!portable?'ouverte':'repliee'],V+'l’autre choix, retenu aussi');

    // 3. Dépliée, elle ne recouvre jamais plus de 20 % de la toile : « En ce moment » replié, puis ouvert.
    if(!(await legende()).ouverte){await page.locator('#direct-coin > summary').click();await page.waitForFunction(()=>document.getElementById('direct-coin').open);}
    await enCeMoment(false);
    mesuree(await legende(),V+'« En ce moment » replié');
    await enCeMoment(true);
    mesuree(await legende(),V+'« En ce moment » ouvert');
    // Dans une petite fenêtre (une demi-largeur d'écran) : toujours 20 % au plus ; son contenu défile s'il ne tient pas.
    await page.setViewportSize({width:1024,height:560});await stable();
    const petite=await legende();
    mesuree(petite,V+'une fenêtre de 1 024 × 560, « En ce moment » ouvert');
    const defile=await page.evaluate(()=>{const d=document.getElementById('direct-coin');return {deborde:d.scrollHeight>d.clientHeight+1,overflow:getComputedStyle(d).overflowY};});
    assert.ok(!defile.deborde||defile.overflow==='auto',V+'un contenu trop haut défile dans la légende');
    await page.setViewportSize({width:largeur,height:hauteur});await stable();
    mesuree(await legende(),V+'revenue à sa taille');

    // 4. Un choix fait sur un portable vaut sur un grand écran, et l'inverse : c'est le choix de l'utilisateur.
    assert.equal((await legende()).choix,'ouverte');

    x.effacer();
    assert.deepEqual(erreurs,[],V+erreurs.join(' | '));
   }finally{await ctx.close();}
  }
  console.log('direct-legende-browser : ok — à 1 366 × 768, la légende est repliée à l’ouverture (son seul titre, dans le coin) ; à 1 920 × 1 080, dépliée ; l’état d’ouverture n’est pas gardé ; le choix de l’utilisateur (un clic, Entrée) est retenu et revient après un rechargement ; dépliée, elle ne recouvre jamais plus de 20 % de la toile — « En ce moment » replié ou ouvert, et dans une fenêtre de 1 024 × 560 —, au plus 40 % de sa largeur et la moitié de sa hauteur, dans la toile.');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

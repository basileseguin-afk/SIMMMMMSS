/* Évolution 25 (g) — les captures de contrôle du nouveau visuel de la version 1, sur l'unité fictive
 * (tests/plan-rejoue-fictif.cjs) et un programme daté fictif, aux deux tailles (1 366 × 768 et 1 920 × 1 080) et dans
 * les deux thèmes :
 *   — chaque page du menu (« En direct » en relief, comme le menu l'ouvre), et « En direct » à plat ;
 *   — l'accueil de l'application (son bandeau au bordeaux du menu), et la page d'entrée (accueil.html) ;
 *   — la fiche d'un service par compagnie, avec des champs saisis et des champs vides (c), et les pastilles (d) ;
 *   — le tableau de tous les temps par vol, une compagnie dépliée (c, d) ;
 *   — « Chemins », un chemin ouvert ;
 *   — les couleurs des compagnies (d), dans le panneau d'une compagnie de « Commandes » depuis l'évolution 26 (c) ; une
 *     notification, avec « Annuler » ;
 *   — une question (« Restaurer cette sauvegarde ? ») ; la palette « Aller à… ».
 * Chaque capture est vérifiée : sa taille, le thème (le fond de la page et celui du menu), ce qu'elle doit montrer, la
 * fenêtre qui ne défile pas, aucun texte sous 13 px (12 px à l'écran dans un dessin).
 * Les captures sont gardées hors du dépôt : dans $ORY_CAPTURES s'il est donné, sinon dans un dossier temporaire, dit à la
 * fin. Aucune donnée de l'unité : tout est fictif. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href,URL_ENTREE=pathToFileURL(path.resolve(__dirname,'../accueil.html')).href;

const dossier=process.env.ORY_CAPTURES?path.resolve(process.env.ORY_CAPTURES):fs.mkdtempSync(path.join(os.tmpdir(),'ory-captures-e25-'));
fs.mkdirSync(dossier,{recursive:true});
/** Le visuel de chaque thème : le fond de la page, celui du menu. */
const THEMES={clair:{fond:'rgb(251, 248, 246)',menu:'rgb(46, 15, 26)'},sombre:{fond:'rgb(22, 17, 19)',menu:'rgb(30, 23, 25)'}};
const TAILLES=[[1366,768],[1920,1080]];
/** La largeur et la hauteur d'un PNG, lues dans son en-tête (IHDR). */
const taillePng=f=>{const b=fs.readFileSync(f);assert.equal(b.toString('latin1',1,4),'PNG',f);return [b.readUInt32BE(16),b.readUInt32BE(20)];};
/** Dans la page : les textes sous la taille (13 px ; 12 px à l'écran dans un dessin), la fenêtre qui défile, le thème. */
const LIRE=()=>{
  const petits=[],vus=new Set(),marche=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  for(let n=marche.nextNode();n;n=marche.nextNode()){
    const e=n.parentElement;if(!n.textContent.trim()||!e||vus.has(e))continue;vus.add(e);
    if(e.closest('script,style,option,title,desc,[hidden],.sr-only,dialog:not([open])')||!e.getClientRects().length)continue;
    if(!e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true,contentVisibilityAuto:true}))continue;
    const dessin=e.closest('svg');let t=parseFloat(getComputedStyle(e).fontSize);
    if(dessin){const m=(e.getScreenCTM&&e.getScreenCTM())||dessin.getScreenCTM();if(m)t*=Math.sqrt(Math.abs(m.a*m.d-m.b*m.c));}
    if(t>=1&&t<(dessin?12:13)-0.05)petits.push(e.tagName.toLowerCase()+'.'+(e.className.baseVal??e.className)+' '+Math.round(t*10)/10+' px « '+n.textContent.trim().slice(0,24)+' »');
  }
  const menu=document.querySelector('body>.barre');
  return {petits,fenetre:[document.scrollingElement.scrollHeight-innerHeight,document.scrollingElement.scrollWidth-innerWidth],
    fond:getComputedStyle(document.body).backgroundColor,menu:menu?getComputedStyle(menu).backgroundColor:null,sombre:document.documentElement.dataset.theme==='sombre'};
};
/** Un élément se voit en entier dans la fenêtre. */
const A_L_ECRAN=sel=>{const e=document.querySelector(sel);if(!e)return null;const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight+1&&r.left>=0&&r.right<=innerWidth+1;};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const faites=[];let vues=0;
 try{
  for(const [largeur,hauteur] of TAILLES)for(const theme of Object.keys(THEMES)){
   const V=largeur+' × '+hauteur+', thème '+theme+' : ';
   const ctx=await browser.newContext({viewport:{width:largeur,height:hauteur},reducedMotion:'reduce'});
   const page=await ctx.newPage(),erreurs=[];
   page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
   const attendre=(ms=300)=>page.waitForTimeout(ms);
   let rang=0;
   /** Une capture, vérifiée. `document` : une page qui défile (la page d'entrée). `notifs` : garder les notifications. */
   const capturer=async(nom,o={})=>{
     if(!o.notifs){await page.evaluate(()=>document.querySelectorAll('.notif .notif-fermer').forEach(b=>b.click()));
       await page.waitForFunction(()=>!document.querySelector('.notifs .notif'));}
     const m=await page.evaluate(LIRE);
     assert.equal(m.sombre,theme==='sombre',V+nom+' : le thème');
     assert.equal(m.fond,THEMES[theme].fond,V+nom+' : le fond de la page');
     if(!o.document){assert.equal(m.menu,THEMES[theme].menu,V+nom+' : le fond du menu');assert.deepEqual(m.fenetre,[0,0],V+nom+' : la fenêtre ne défile pas');}
     assert.deepEqual(m.petits,[],V+nom+' : aucun texte sous 13 px (12 px à l’écran dans un dessin)');
     const f=path.join(dossier,'e25-'+largeur+'-'+theme+'-'+String(++rang).padStart(2,'0')+'-'+nom+'.png');await page.screenshot({path:f});
     assert.deepEqual(taillePng(f),[largeur,hauteur],V+nom+' : la taille de la capture');
     assert.ok(fs.statSync(f).size>15000,V+nom+' : une capture qui montre quelque chose');faites.push(f);};
   const site=await F.charger(page,nav,URL_V1,{csv:F.volsDatesCsv(3,'2031-03-03'),pageId:'j-chiffres'});
   try{
    await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.unite&&window.OrlyPastilles);
    if(theme==='sombre'){await page.evaluate(()=>{localStorage.setItem('ory-ui-theme','sombre');document.documentElement.dataset.theme='sombre';});await attendre();}

    /* ---- chaque page du menu ---------------------------------------------------------------------------------------- */
    const pages=await page.evaluate(()=>OrlyOnglets.entrees().flatMap(o=>o.pages||[o.id]));
    assert.ok(pages.length>=16,V+'toutes les pages du menu');
    for(const id of pages){
      await nav.aller(page,id,id==='j-plan'?{relief:true}:undefined);await attendre(id==='j-plan'?1200:600);
      assert.equal(await page.evaluate(()=>document.body.dataset.sous),id,V+'la page '+id+' est ouverte');
      await capturer('page-'+id);
    }
    // « En direct », à plat : le plan dessiné, ses services aux couleurs de leur état.
    await nav.aller(page,'j-plan');await attendre(800);
    assert.ok(await page.locator('#workspace svg .zone').first().isVisible(),V+'le plan dessiné');
    await capturer('en-direct-a-plat');

    /* ---- l'accueil de l'application : son bandeau au bordeaux du menu ------------------------------------------------- */
    await page.locator('.barre .marque').click();await page.waitForFunction(()=>document.body.dataset.vue==='accueil');await attendre(400);
    assert.deepEqual(await page.evaluate(()=>{const b=getComputedStyle(document.querySelector('#view-accueil .acc-histoire'));return [b.backgroundColor,b.backgroundImage];}),[THEMES[theme].menu,'none'],V+'le bandeau de l’accueil a le fond du menu, uni');
    await capturer('accueil');

    /* ---- (c) la fiche d'un service : des champs saisis, des champs vides ------------------------------------------------ */
    // Un service par compagnie : la valeur de toutes les compagnies et une valeur propre sont saisies ; les autres
    // compagnies, laissées vides, montrent la valeur reprise ; chaque compagnie a sa pastille.
    await nav.service(page,'armement');await nav.section(page,'temps');await attendre(300);
    await page.locator('#mu-services .mu-cat-table').evaluate(e=>e.scrollIntoView({block:'center'}));await attendre(300);
    const champs=await page.evaluate(()=>{const s=document.createElement('i');document.body.appendChild(s);s.style.color='var(--ds-saisi-fond)';const saisi=getComputedStyle(s).color;s.remove();
      const vus=[...document.querySelectorAll('#mu-services .se-fiche input:not([type=checkbox]):not([type=radio])')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.top>=0&&r.bottom<=innerHeight;});
      return {saisis:vus.filter(e=>getComputedStyle(e).backgroundColor===saisi).length,vides:vus.filter(e=>e.matches(':placeholder-shown')&&getComputedStyle(e).backgroundColor!==saisi).length};});
    assert.ok(champs.saisis>=2&&champs.vides>=2,V+'la fiche montre des champs saisis ('+champs.saisis+') et des champs vides ('+champs.vides+')');
    assert.ok(await page.locator('#mu-services .mu-cat-table tbody .pa-cie').first().isVisible(),V+'chaque compagnie du service a sa pastille');
    await capturer('fiche-service-champs');

    /* ---- (c, d) le tableau de tous les temps par vol, une compagnie dépliée ---------------------------------------------- */
    await page.locator('#mu-services .se-tous-temps').click();await attendre(400);
    await page.locator('.rg-cie-btn').first().click();await attendre(400);
    assert.ok(await page.locator('.rg-recap-cie .pa-cie').first().isVisible()&&await page.locator('.rg-recap-classe .pa-classe').first().isVisible(),V+'la pastille d’une compagnie, l’étiquette de ses classes');
    assert.ok(await page.locator('.rg-recap-legende').isVisible(),V+'la légende du tableau');
    await capturer('tous-les-temps');

    /* ---- « Chemins », un chemin ouvert ------------------------------------------------------------------------------------- */
    await nav.aller(page,'mu-flux');await attendre();
    await page.locator('#mu-flux .ch-liste [data-mu-flux-choisir="complet"]').click();
    await page.waitForFunction(()=>document.querySelector('#mu-flux .ch-fiche').dataset.muFluxFiche==='complet'&&!!document.querySelector('#mu-flux .gr-svg .gr-noeud'));await attendre(400);
    await capturer('chemin-ouvert');

    /* ---- (d) les couleurs des compagnies (depuis l'évolution 26 c : le panneau d'une compagnie de « Commandes ») ; une
     *      notification ------------------------------------------------------------------------------------------------- */
    await nav.aller(page,'mu-commandes');await attendre(400);
    await page.locator('#mu-commandes [data-co-ouvrir="NORD"]').click();
    await page.waitForFunction(()=>document.querySelectorAll('#mu-commandes .co-panneau [data-pa-teinte]').length===12);await attendre();
    assert.equal(await page.locator('#mu-commandes [data-co-ouvrir] .pa-cie').count(),5,V+'une pastille par compagnie');
    assert.equal(await page.evaluate(A_L_ECRAN,'#mu-commandes .co-panneau'),true,V+'le panneau se voit en entier');
    await capturer('couleurs-des-compagnies');
    await page.locator('#mu-commandes .co-panneau [data-pa-teinte="9"]').click();
    await page.waitForFunction(()=>!!document.querySelector('#notifs .notif .notif-annuler'));
    assert.match(await page.locator('#notifs .notif').last().textContent(),/NORD\s: couleur 9\.Annuler/,V+'la notification, avec « Annuler »');
    await capturer('notification',{notifs:true});
    await page.locator('#notifs .notif-annuler').last().click();
    await page.waitForFunction(()=>localStorage.getItem('ory-couleurs-compagnies-v1')===null);
    await page.keyboard.press('Escape');

    /* ---- une question ------------------------------------------------------------------------------------------------------ */
    await nav.aller(page,'u-sauvegarde');await attendre();
    await page.locator('#sauvegarde-import').setInputFiles({name:'unite-fictive.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(F.sauvegardeFictive()))});
    await page.locator('dialog.question[open]').waitFor({state:'visible',timeout:5000});await attendre();
    assert.match(await page.locator('dialog.question[open]').textContent(),/Restaurer cette sauvegarde/,V+'la question');
    await capturer('question');
    await nav.repondre(page,false);

    /* ---- la palette « Aller à… » -------------------------------------------------------------------------------------------- */
    await page.locator('#btn-palette').click();
    await page.locator('#pal-texte').waitFor({state:'visible',timeout:5000});await page.locator('#pal-texte').fill('pro');
    await page.locator('#pal-liste [role=option]').first().waitFor({state:'visible',timeout:5000});await attendre();
    assert.ok(await page.locator('#pal-liste [role=option]').count()>=1,V+'la palette propose des pages');
    await capturer('palette-aller-a');
    await page.keyboard.press('Escape');await attendre(200);

    /* ---- la page d'entrée (accueil.html) : un document, aux jetons de l'application ------------------------------------- */
    await page.goto(URL_ENTREE);await page.evaluate(()=>document.fonts.ready);await attendre();
    assert.equal(await page.title(),'ORY — Applications');
    await capturer('page-d-entree',{document:true});
    assert.equal(rang,pages.length+10,V+rang+' captures : chaque page du menu, et dix vues');
    vues=rang;
    assert.deepEqual(erreurs,[],V+'aucune erreur de page : '+erreurs.join(' | '));
   }finally{site.effacer();await ctx.close();}
  }
  assert.equal(faites.length,vues*4,vues+' vues, deux tailles, deux thèmes');
  console.log('OK captures de l’évolution 25 : '+faites.length+' captures dans '+dossier+' — '+vues+' vues (chaque page du menu, « En direct » à plat, l’accueil, la fiche d’un service aux champs saisis et vides, le tableau de tous les temps, un chemin ouvert, la carte « Couleurs des compagnies », une notification, une question, la palette « Aller à… », la page d’entrée), à 1 366 × 768 et 1 920 × 1 080, en clair et en sombre : le thème, la fenêtre qui ne défile pas, aucun texte sous 13 px');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

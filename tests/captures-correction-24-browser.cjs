/* Correction 24 (i) — les captures de contrôle des retouches du visuel (version 1), sur l'unité fictive
 * (tests/plan-rejoue-fictif.cjs) et un programme daté fictif, aux deux tailles (1 366 × 768 et 1 920 × 1 080) et dans
 * les deux thèmes :
 *   — la barre du haut dans ses trois états de sauvegarde : « Jamais sauvegardé », « Sauvegardé à… », « Non sauvegardé
 *     depuis… » (b) ;
 *   — « En direct » en relief et à plat (c, e) ; la Synthèse (e) ; « Période », simulée (d, e) ;
 *   — « Services et équipes », « Chemins », « Réglages » (f) ; « Stocks et retours » et le Planning (f) ;
 *   — « Contrôles », avec un point bloquant et un point à corriger (d) ;
 *   — les couleurs des compagnies (g) : depuis l'évolution 26 (c), la liste de « Commandes » et le panneau d'une compagnie ;
 *   — le tableau de tous les temps par vol, défilé à droite (h).
 * Chaque capture est vérifiée : sa taille, le thème (le fond de la page et celui du menu), ce qu'elle doit montrer, la
 * fenêtre qui ne défile pas, aucun texte sous 13 px (12 px à l'écran dans un dessin).
 * Les captures sont gardées hors du dépôt : dans $ORY_CAPTURES s'il est donné, sinon dans un dossier temporaire, dit à la
 * fin. Aucune donnée de l'unité : tout est fictif. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;

const dossier=process.env.ORY_CAPTURES?path.resolve(process.env.ORY_CAPTURES):fs.mkdtempSync(path.join(os.tmpdir(),'ory-captures-c24-'));
fs.mkdirSync(dossier,{recursive:true});
/** Le visuel de chaque thème : le fond de la page, celui du menu. */
const THEMES={clair:{fond:'rgb(251, 248, 246)',menu:'rgb(46, 15, 26)'},sombre:{fond:'rgb(22, 17, 19)',menu:'rgb(30, 23, 25)'}};
const TAILLES=[[1366,768],[1920,1080]];
const CSV=F.volsDatesCsv(3,'2031-03-03');
const HEURE='\\d\\d:\\d\\d';
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
/** Dans la page : l'état de sauvegarde de la barre du haut — son état, ce qu'il dit, et s'il se voit en entier. */
const SAUVE=()=>{const b=document.getElementById('etat-sauvegarde'),r=b.getBoundingClientRect(),h=document.querySelector('header.haut').getBoundingClientRect();
  return {etat:b.dataset.etat,dit:b.innerText.replace(/\s+/g,' ').trim(),vu:r.width>0&&r.left>=h.left&&r.right<=h.right+0.5&&r.top>=h.top&&r.bottom<=h.bottom+0.5};};
/** Dans la page : les boutons au fond de l'accent qui se voient. */
const PLEINS=()=>{const s=document.createElement('i');document.body.append(s);s.style.color='var(--ds-accent)';const accent=getComputedStyle(s).color;s.remove();
  return [...document.querySelectorAll('#workspace button,#workspace a.btn')].filter(b=>b.getClientRects().length&&getComputedStyle(b).backgroundColor===accent).map(b=>b.textContent.trim().replace(/\s+/g,' '));};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const faites=[];let vues=0;
 try{
  for(const [largeur,hauteur] of TAILLES)for(const theme of Object.keys(THEMES)){
   const V=largeur+' × '+hauteur+', thème '+theme+' : ';
   const ctx=await browser.newContext({viewport:{width:largeur,height:hauteur},reducedMotion:'reduce',acceptDownloads:true});
   const page=await ctx.newPage(),erreurs=[];
   page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
   const attendre=(ms=300)=>page.waitForTimeout(ms);
   let rang=0;
   /** Une capture, vérifiée. */
   const capturer=async nom=>{
     await page.evaluate(()=>document.querySelectorAll('.notif .notif-fermer').forEach(b=>b.click()));
     await page.waitForFunction(()=>!document.querySelector('.notifs .notif'));
     const m=await page.evaluate(LIRE);
     assert.equal(m.sombre,theme==='sombre',V+nom+' : le thème');
     assert.deepEqual([m.fond,m.menu],[THEMES[theme].fond,THEMES[theme].menu],V+nom+' : le fond de la page et celui du menu');
     assert.deepEqual(m.fenetre,[0,0],V+nom+' : la fenêtre ne défile pas');
     assert.deepEqual(m.petits,[],V+nom+' : aucun texte sous 13 px (12 px à l’écran dans un dessin)');
     const f=path.join(dossier,'c24-'+largeur+'-'+theme+'-'+String(++rang).padStart(2,'0')+'-'+nom+'.png');await page.screenshot({path:f});
     assert.deepEqual(taillePng(f),[largeur,hauteur],V+nom+' : la taille de la capture');
     assert.ok(fs.statSync(f).size>15000,V+nom+' : une capture qui montre quelque chose');faites.push(f);};
   const pret=()=>page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.unite&&window.OrlyPastilles&&window.OrlyEtatSauvegarde&&document.getElementById('etat-sauvegarde'));
   const sombre=async()=>{if(theme==='sombre'){await page.evaluate(()=>{localStorage.setItem('ory-ui-theme','sombre');document.documentElement.dataset.theme='sombre';});await attendre();}};
   /** « Tout sauvegarder », par le bouton d'état de la barre du haut : un fichier descend. */
   const sauvegarder=async()=>{const d=page.waitForEvent('download');await page.locator('#etat-sauvegarde').click();await (await d).path();
     await page.waitForFunction(()=>document.getElementById('etat-sauvegarde').dataset.etat==='sauvegarde');};
   const site=await F.charger(page,nav,URL_V1,{csv:CSV,pageId:'j-chiffres'});
   try{
    await pret();await sombre();

    /* ---- (b) la barre du haut, dans ses trois états de sauvegarde ----------------------------------------------------- */
    // Jamais sauvegardé : le navigateur n'a la mémoire d'aucune sauvegarde (une unité saisie ici, jamais descendue).
    await page.evaluate(()=>{for(const k of ['ory-ui-etat-sauvegarde','ory-ui-derniere-sauvegarde'])localStorage.removeItem(k);});
    await page.reload();await pret();await sombre();
    await F.importerVols(page,nav,site.fichier,'vols-fictifs.csv',CSV);
    await nav.aller(page,'j-chiffres');await attendre(500);
    let e=await page.evaluate(SAUVE);
    assert.deepEqual([e.etat,e.dit,e.vu],['jamais','Jamais sauvegardé',true],V+'la barre du haut dit « Jamais sauvegardé »');
    await capturer('barre-jamais-sauvegarde');
    // Sauvegardé : un clic sur l'état fait « Tout sauvegarder », sans changer de page.
    await sauvegarder();await attendre();
    e=await page.evaluate(SAUVE);
    assert.equal(e.etat,'sauvegarde');assert.match(e.dit,new RegExp('^Sauvegardé à '+HEURE+'$'),V+'la barre du haut dit « Sauvegardé à… » : '+e.dit);assert.equal(e.vu,true);
    assert.equal(await page.evaluate(()=>document.body.dataset.sous),'j-chiffres',V+'sauvegarder ne change pas de page');
    await capturer('barre-sauvegarde');
    // Non sauvegardé : un réglage change (la couleur d'une compagnie, gardée à son rang du moment).
    await page.evaluate(()=>OrlyPastilles.choisirCouleur('ZEN',OrlyPastilles.rang('ZEN')));
    await page.waitForFunction(()=>document.getElementById('etat-sauvegarde').dataset.etat==='non-sauvegarde');await attendre();
    e=await page.evaluate(SAUVE);
    assert.match(e.dit,new RegExp('^Non sauvegardé depuis '+HEURE+'$'),V+'la barre du haut dit « Non sauvegardé depuis… » : '+e.dit);assert.equal(e.vu,true);
    await capturer('barre-non-sauvegarde');
    // Le réglage est défait, et l'unité sauvegardée : la suite se lit « Sauvegardé ».
    await page.evaluate(()=>OrlyPastilles.revenirAuxAutomatiques());
    await page.waitForFunction(()=>localStorage.getItem('ory-couleurs-compagnies-v1')===null);
    await sauvegarder();

    /* ---- (c, e) « En direct », en relief puis à plat ------------------------------------------------------------------- */
    await nav.aller(page,'j-plan',{relief:true});await attendre(1200);
    assert.equal(await page.evaluate(()=>document.body.dataset.sous),'j-plan');
    const barre=await page.evaluate(()=>{const b=document.querySelector('#workspace .barre-jour:not([hidden]), #workspace [data-pj-barre]')||document.querySelector('.pj-mot').closest('div');
      const r=b.getBoundingClientRect(),mot=document.querySelector('.pj-mot .pj-court');return {haut:Math.round(r.height),mot:mot?mot.textContent.trim():null};});
    assert.ok(barre.mot&&/^période /.test(barre.mot),V+'la barre « Journée de vols » dit l’état de la période d’un mot : '+barre.mot);
    await capturer('en-direct-en-relief');
    await nav.aller(page,'j-plan');await attendre(800);
    assert.ok(await page.locator('#workspace svg .zone').first().isVisible(),V+'le plan dessiné');
    await capturer('en-direct-a-plat');

    /* ---- (e) la Synthèse ------------------------------------------------------------------------------------------------- */
    await nav.aller(page,'j-chiffres');await attendre(600);
    await capturer('synthese');

    /* ---- (d, e) « Période », simulée : un seul bouton plein ---------------------------------------------------------- */
    await nav.aller(page,'j-periode');await attendre(500);
    assert.deepEqual(await page.evaluate(PLEINS),['Simuler la période'],V+'« Période » : un seul bouton plein, « Simuler la période »');
    await page.locator('#journee-periode [data-pv="lancer"]').click();
    await page.waitForFunction(()=>Sim.periode&&Sim.periode.etat()==='a-jour',null,{timeout:120000});await attendre(600);
    await capturer('periode');

    /* ---- (f) les listes plates : « Services et équipes », « Chemins », « Réglages » ----------------------------------- */
    await nav.aller(page,'mu-services');await attendre(500);
    assert.ok(await page.locator('#mu-services .se-liste .mu-svc.actif').count()>=1,V+'un service est choisi dans la liste');
    await capturer('services-et-equipes');
    await nav.aller(page,'mu-flux');await attendre(500);
    await capturer('chemins');
    await nav.aller(page,'rg-simulation');await attendre(500);
    await capturer('reglages');

    /* ---- (f) « Stocks et retours », le Planning ------------------------------------------------------------------------- */
    await nav.aller(page,'j-stocks');await attendre(600);
    await capturer('stocks-et-retours');
    await nav.aller(page,'at-planning');await attendre(700);
    await capturer('planning');

    /* ---- (d) « Contrôles » : un point bloquant, un point à corriger -------------------------------------------------- */
    await nav.aller(page,'mu-pas');await attendre(600);
    const points=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#workspace [data-ct-niveau]')].map(n=>[n.dataset.ctNiveau,n.querySelectorAll('.ct-point').length])));
    assert.ok(points.bloquant>=1&&points.corriger>=1,V+'« Contrôles » montre un point bloquant et un point à corriger : '+JSON.stringify(points));
    const boutons=await page.evaluate(()=>{const s=document.createElement('i');document.body.append(s);s.style.color='var(--ds-accent)';const accent=getComputedStyle(s).color;s.remove();
      const plein=n=>[...document.querySelectorAll('#workspace [data-ct-niveau="'+n+'"] .ct-point [data-ct-aller]:not([data-ct-geste])')].filter(b=>b.getClientRects().length).map(b=>getComputedStyle(b).backgroundColor===accent);
      return {bloquant:plein('bloquant'),corriger:plein('corriger')};});
    assert.ok(boutons.bloquant.length>=1&&boutons.bloquant.every(Boolean),V+'le bouton d’un point bloquant est plein');
    assert.ok(boutons.corriger.length>=1&&!boutons.corriger.some(Boolean),V+'le bouton d’un point à corriger est un bouton de carte');
    await capturer('controles');

    /* ---- (g) les couleurs des compagnies : depuis l'évolution 26 (c), dans « Commandes » — la liste, puis le panneau d'une
     *      compagnie ouvert (la carte du programme des vols n'est plus) ---------------------------------------------------- */
    await nav.aller(page,'mu-commandes');await attendre(500);
    assert.equal(await page.locator('#mu-commandes [data-co-ouvrir] .pa-cie').count(),5,V+'la liste : une pastille par compagnie');
    await capturer('couleurs-liste');
    await page.locator('#mu-commandes [data-co-ouvrir="NORD"]').click();
    await page.locator('#mu-commandes .co-panneau [role=radiogroup]').waitFor();await attendre(200);
    assert.deepEqual(await page.evaluate(()=>{const c=document.querySelector('#mu-commandes .co-panneau'),q=c.getBoundingClientRect();return [c.querySelectorAll('[role=radio]').length,c.querySelectorAll('[aria-checked=true]').length,q.top>=0&&q.bottom<=innerHeight&&q.left>=0&&q.right<=innerWidth];}),
      [12,1,true],V+'le panneau : douze teintes, une cochée, dans la fenêtre');
    await capturer('couleurs-panneau');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>localStorage.getItem('ory-couleurs-compagnies-v1')),null,V+'regarder le panneau ne choisit rien');

    /* ---- (h) le tableau de tous les temps par vol, défilé à droite --------------------------------------------------- */
    await nav.aller(page,'mu-services');await page.locator('#mu-services .se-liste [data-se-panneau="temps"]').click();await attendre(500);
    const defile=await page.evaluate(()=>{const c=document.querySelector('#mu-services .rg-recap-scroll');c.scrollLeft=c.scrollWidth;
      const q=c.getBoundingClientRect(),coin=c.querySelector('thead .rg-recap-t1 th:first-child'),r=coin.getBoundingClientRect();
      const sous=document.elementFromPoint(r.left+r.width/2,r.bottom-6);
      return {defile:c.scrollLeft,coin:Math.round(r.left-q.left),sous:sous&&sous.closest('th')?sous.closest('th').textContent.trim():null,figees:[...c.querySelectorAll('thead .rg-recap-t2 th')].filter(x=>getComputedStyle(x).left!=='auto').length};});
    if(defile.defile>0)assert.deepEqual([defile.coin<=2,defile.sous,defile.figees],[true,'Compagnie · classe',0],V+'défilé à droite, seule la colonne des compagnies est figée : '+JSON.stringify(defile));
    else assert.equal(defile.figees,0,V+'le tableau tient dans son cadre, rien d’autre que la colonne des compagnies n’est figé');
    await attendre(200);
    await capturer('tous-les-temps-defile');

    assert.equal(rang,16,V+rang+' captures');
    vues=rang;
    assert.deepEqual(erreurs,[],V+'aucune erreur de page : '+erreurs.join(' | '));
   }finally{site.effacer();await ctx.close();}
  }
  assert.equal(faites.length,vues*4,vues+' vues, deux tailles, deux thèmes');
  console.log('OK captures de la correction 24 : '+faites.length+' captures dans '+dossier+' — '+vues+' vues (la barre du haut dans ses trois états de sauvegarde, « En direct » en relief et à plat, la Synthèse, « Période » simulée, « Services et équipes », « Chemins », « Réglages », « Stocks et retours », le Planning, « Contrôles » avec un point bloquant et un point à corriger, la carte des couleurs repliée, dépliée et son panneau ouvert, le tableau des temps défilé à droite), à 1 366 × 768 et 1 920 × 1 080, en clair et en sombre ; chacune vérifiée : sa taille, le thème, la fenêtre qui ne défile pas, aucun texte sous 13 px.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

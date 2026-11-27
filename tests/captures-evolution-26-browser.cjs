/* Évolution 26 (g) — les captures de contrôle des compagnies d'abord, sur l'unité fictive (tests/plan-rejoue-fictif.cjs),
 * aux deux tailles (1 366 × 768 et 1 920 × 1 080) et dans les deux thèmes :
 *   — l'accueil dans ses trois états : une unité vide, une unité décrite sans vols, une unité complète ;
 *   — le menu (l'accueil en tête, « Régler » dans l'ordre du travail) ;
 *   — « Commandes » : la liste ; le panneau d'ajout « Comme une autre compagnie » ; le panneau d'une compagnie avec ses
 *     couleurs ; le panneau d'une commande fixe ;
 *   — « Contrôles » : « il ne manque que les vols » ; une compagnie non rattachée et une classe à compléter.
 * Chaque capture est vérifiée : sa taille, le thème (le fond de la page et celui du menu), ce qu'elle doit montrer, la
 * fenêtre qui ne défile pas, aucun texte sous 13 px (12 px à l'écran dans un dessin).
 * Les captures sont gardées hors du dépôt : dans $ORY_CAPTURES s'il est donné, sinon dans un dossier temporaire, dit à la
 * fin. Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;

const dossier=process.env.ORY_CAPTURES?path.resolve(process.env.ORY_CAPTURES):fs.mkdtempSync(path.join(os.tmpdir(),'ory-captures-e26-'));
fs.mkdirSync(dossier,{recursive:true});
const fichiers=fs.mkdtempSync(path.join(os.tmpdir(),'ory-e26-fichiers-'));
/** Le visuel de chaque thème : le fond de la page, celui du menu. */
const THEMES={clair:{fond:'rgb(251, 248, 246)',menu:'rgb(46, 15, 26)'},sombre:{fond:'rgb(22, 17, 19)',menu:'rgb(30, 23, 25)'}};
const TAILLES=[[1366,768],[1920,1080]];
const VUES=10;
const PRET='Le site est prêt : il ne manque que les vols';
const ECO='ECO : 2 vols de l’import ne sont dans aucune compagnie de votre liste';
const A_COMPLETER='NEUVE · Premium est à compléter';
/** Les vols fictifs d'une journée sans retard, plus une compagnie qu'aucune de la liste n'est (ECO, un départ, un retour). */
const CSV_ECO=F.volsSansRetardCsv().replace(/\n?$/,'\n')+'EC101,ECO,PETIT,DEP,09:40,,0,0,90,3,0\nEC100,ECO,PETIT,RET,,08:20,0,0,90,3,0\n';
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
  const menu=document.querySelector('body>.barre'),defile=document.querySelector('.barre-defile');
  return {petits,fenetre:[document.scrollingElement.scrollHeight-innerHeight,document.scrollingElement.scrollWidth-innerWidth],
    menuDeborde:defile?defile.scrollHeight-defile.clientHeight:0,
    fond:getComputedStyle(document.body).backgroundColor,menu:menu?getComputedStyle(menu).backgroundColor:null,sombre:document.documentElement.dataset.theme==='sombre'};
};
/** Un élément se voit en entier dans la fenêtre. */
const A_L_ECRAN=sel=>{const e=typeof sel==='string'?document.querySelector(sel):sel;if(!e)return null;const r=e.getBoundingClientRect();
  return r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight+1&&r.left>=0&&r.right<=innerWidth+1;};
const texte=s=>String(s||'').replace(/\s+/g,' ').trim();

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const faites=[];
 try{
  for(const [largeur,hauteur] of TAILLES)for(const theme of Object.keys(THEMES)){
   const V=largeur+' × '+hauteur+', thème '+theme+' : ';
   const ctx=await browser.newContext({viewport:{width:largeur,height:hauteur},reducedMotion:'reduce'});
   const page=await ctx.newPage(),erreurs=[];
   page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
   const attendre=(ms=300)=>page.waitForTimeout(ms);
   let rang=0;
   /** Le thème, posé comme le fait son bouton (une préférence du navigateur : une restauration l'efface). */
   const poserTheme=async()=>{if(theme==='sombre'){await page.evaluate(()=>{localStorage.setItem('ory-ui-theme','sombre');document.documentElement.dataset.theme='sombre';});await attendre();}};
   const restaurer=async(sauvegarde,pageId)=>{await F.restaurer(page,nav,URL_V1,sauvegarde,pageId);await poserTheme();};
   const importer=async(nom,csv)=>F.importerVols(page,nav,(n,t)=>{const f=path.join(fichiers,n);fs.writeFileSync(f,t);return f;},nom,csv);
   const accueil=async()=>{await page.locator('#menu [data-entree="accueil"]').click();await page.waitForFunction(()=>document.body.dataset.vue==='accueil');await attendre(400);};
   const suite=()=>page.locator('#view-accueil .acc-suite').innerText().then(texte);
   const etats=()=>page.locator('#view-accueil .acc-etape .acc-etat').evaluateAll(l=>l.map(e=>e.textContent));
   const point=t=>page.locator('#mu-pas .ct-point',{hasText:t});
   /** Une capture, vérifiée. */
   const capturer=async nom=>{
     await page.evaluate(()=>document.querySelectorAll('.notif .notif-fermer').forEach(b=>b.click()));
     await page.waitForFunction(()=>!document.querySelector('.notifs .notif'));
     const m=await page.evaluate(LIRE);
     assert.equal(m.sombre,theme==='sombre',V+nom+' : le thème');
     assert.equal(m.fond,THEMES[theme].fond,V+nom+' : le fond de la page');
     assert.equal(m.menu,THEMES[theme].menu,V+nom+' : le fond du menu');
     assert.deepEqual(m.fenetre,[0,0],V+nom+' : la fenêtre ne défile pas');
     assert.ok(m.menuDeborde<=0,V+nom+' : le menu ne défile pas ('+m.menuDeborde+' px de trop)');
     assert.deepEqual(m.petits,[],V+nom+' : aucun texte sous 13 px (12 px à l’écran dans un dessin)');
     const f=path.join(dossier,'e26-'+largeur+'-'+theme+'-'+String(++rang).padStart(2,'0')+'-'+nom+'.png');await page.screenshot({path:f});
     assert.deepEqual(taillePng(f),[largeur,hauteur],V+nom+' : la taille de la capture');
     assert.ok(fs.statSync(f).size>15000,V+nom+' : une capture qui montre quelque chose');faites.push(f);};
   try{
    /* ---- 1. l'accueil d'une unité vide : « Ajouter une première compagnie » --------------------------------------------- */
    await restaurer(F.sauvegardeComplete({liste:[]}));await accueil();
    assert.equal(await suite(),'À faire ensuite : Ajouter une première compagnie →',V+'unité vide');
    assert.deepEqual((await etats())[0],'à faire',V+'les commandes : à faire');
    assert.equal(await page.evaluate(A_L_ECRAN,'#view-accueil .acc-guide'),true,V+'le guide se voit en entier');
    await capturer('accueil-unite-vide');

    /* ---- 2. une unité décrite, sans vols : l'accueil, puis « Contrôles » — « il ne manque que les vols » ---------------- */
    await restaurer(F.sauvegardeComplete());await accueil();
    assert.deepEqual(await etats(),['fait','fait','fait','fait','provisoire','à vérifier'],V+'sans vols');
    assert.equal(await suite(),'À faire ensuite : Importer vos vols →');
    await capturer('accueil-sans-vols');
    await nav.aller(page,'mu-pas');await attendre(400);
    const pret=page.locator('[data-ct-niveau="information"] .ct-point').first();
    assert.equal(texte(await pret.locator('.ct-corps b').textContent()),PRET,V+'en tête des informations');
    assert.equal(texte(await pret.locator('[data-ct-aller]').textContent()),'Voir dans Programme des vols →');
    assert.equal(await pret.evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1;}),true,V+'le point se voit');
    await capturer('controles-il-ne-manque-que-les-vols');

    /* ---- 3. une unité complète : ses vols importés ; l'accueil, puis le menu sur la Synthèse ------------------------------ */
    await importer('vols-fictifs.csv',F.volsSansRetardCsv());await attendre(400);
    await accueil();
    assert.deepEqual(await etats(),['fait','fait','fait','fait','fait','fait'],V+'complète');
    assert.equal(await suite(),'Tout est en place : lisez le résultat →');
    await capturer('accueil-unite-complete');
    await page.locator('#view-accueil .acc-suite [data-page]').click();await attendre(400);
    assert.equal(await page.evaluate(()=>document.body.dataset.sous),'j-chiffres');
    assert.deepEqual(await page.locator('#menu .menu-entree > span:not(.so-badge)').evaluateAll(l=>l.map(e=>e.textContent.trim())),
      ['Accueil','Synthèse','En direct','Planning','Détails','Comparer','Commandes','Services et équipes','Chemins','Programme des vols','Planche retour','Réglages','Contrôles'],V+'le menu');
    await capturer('menu');

    /* ---- 4. « Commandes » : la liste ---------------------------------------------------------------------------------- */
    await nav.aller(page,'mu-commandes');await attendre(400);
    assert.match(await page.locator('#mu-commandes .co-compte').textContent(),/^\d+ commandes · 4 compagnies$/,V+'le compte');
    await capturer('commandes-liste');

    /* ---- 5. le panneau d'ajout, « Comme une autre compagnie » ----------------------------------------------------------- */
    await page.locator('#mu-commandes [data-co-action="ouvrir-ajout"]').click();await attendre(200);
    const ajout=page.locator('#mu-commandes .co-panneau[data-co-panneau="ajout"]');
    await page.keyboard.type('neuve');
    for(const c of ['BC','PC','CREW'])await ajout.locator(`[data-co-champ="cabine"][value="${c}"]`).check();
    await ajout.locator('[data-co-champ="mode"][value="modele"]').check();
    await ajout.locator('[data-co-champ="modele"]').selectOption('SUD');await attendre(300);
    assert.equal(texte(await ajout.locator('.co-bilan').textContent()),'4 commandes seront créées',V+'le bilan');
    assert.equal(await page.evaluate(A_L_ECRAN,'#mu-commandes .co-panneau'),true,V+'le panneau d’ajout se voit en entier');
    await capturer('commandes-ajout-comme-une-autre');
    await ajout.locator('[data-co-action="valider"]').click();await attendre(600);

    /* ---- 6. le panneau d'une compagnie, avec ses couleurs --------------------------------------------------------------- */
    await page.locator('#mu-commandes [data-co-ouvrir="SUD"]').click();
    await page.waitForFunction(()=>document.querySelectorAll('#mu-commandes .co-panneau [data-pa-teinte]').length===12);await attendre();
    assert.equal(await page.evaluate(A_L_ECRAN,'#mu-commandes .co-panneau'),true,V+'le panneau de SUD se voit en entier');
    await capturer('commandes-compagnie-couleurs');
    await page.keyboard.press('Escape');await attendre(200);

    /* ---- 7. le panneau d'une commande fixe ------------------------------------------------------------------------------ */
    await page.locator('#mu-commandes [data-co-action="ouvrir-ajout"]').click();await attendre(200);
    await page.keyboard.type('cantine');await ajout.locator('[data-co-champ="type"][value="fixe"]').check();
    await ajout.locator('[data-co-action="valider"]').click();await attendre(600);
    await page.locator('#mu-commandes [data-co-ouvrir="CANTINE"]').click();await attendre(300);
    const fixe=page.locator('#mu-commandes .co-panneau[data-co-panneau="compagnie"]');
    assert.equal(await fixe.locator('[data-co-champ="type-cie"][value="fixe"]').isChecked(),true,V+'« Fixe, sans vol »');
    const quantite=fixe.locator('[data-co-fixe="YC"][data-co-fixe-champ="quantite"]');
    await quantite.fill('80');await quantite.press('Enter');await attendre(600);
    assert.equal(await quantite.inputValue(),'80');
    assert.equal(await page.evaluate(A_L_ECRAN,'#mu-commandes .co-panneau'),true,V+'le panneau de CANTINE se voit en entier');
    await capturer('commandes-panneau-fixe');
    await page.keyboard.press('Escape');await attendre(200);

    /* ---- 8. « Contrôles » : une compagnie non rattachée, une classe à compléter ----------------------------------------- */
    await importer('vols-eco.csv',CSV_ECO);await attendre(400);
    await nav.aller(page,'mu-pas');await attendre(400);
    for(const t of [ECO,A_COMPLETER]){
      assert.equal(await point(t).count(),1,V+'le point : '+t);
      assert.equal(await point(t).evaluate(e=>e.closest('[data-ct-niveau]').dataset.ctNiveau),'corriger',V+t+' : à corriger');
      assert.equal(await point(t).evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1;}),true,V+t+' : se voit');
    }
    await capturer('controles-non-rattachee-a-completer');

    assert.equal(rang,VUES,V+rang+' captures');
    assert.deepEqual(erreurs,[],V+'aucune erreur de page : '+erreurs.join(' | '));
   }finally{await ctx.close();}
  }
  assert.equal(faites.length,VUES*4,VUES+' vues, deux tailles, deux thèmes');
  console.log('OK captures de l’évolution 26 : '+faites.length+' captures dans '+dossier+' — '+VUES+' vues (l’accueil d’une unité vide, d’une unité sans vols, d’une unité complète ; « Contrôles » : « il ne manque que les vols », une compagnie non rattachée et une classe à compléter ; le menu ; « Commandes » : la liste, l’ajout « comme une autre », le panneau d’une compagnie et ses couleurs, celui d’une commande fixe), à 1 366 × 768 et 1 920 × 1 080, en clair et en sombre : le thème, la fenêtre et le menu qui ne défilent pas, aucun texte sous 13 px');
 }finally{await browser.close();fs.rmSync(fichiers,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});

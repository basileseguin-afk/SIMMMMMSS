/* Évolution 25 (b) — la coquille et les composants du nouveau visuel (version 1), sur l'unité fictive, à 1 366 × 768,
 * dans les deux thèmes. Tout vient de la feuille neuve (visuel.css) : le balisage ne change pas.
 *   1. LE MENU : un fond uni, sans dégradé ; l'entrée ouverte (texte du menu, fond éclairci, trait de 3 px au repère) ;
 *      les titres de bloc en minuscules (13 px, graisse 500, sans lettres espacées) ; un compteur en pastille au repère,
 *      son chiffre à la couleur du menu ; la marque, un carré arrondi (9 px) au repère.
 *   2. LE HAUT D'UNE PAGE : plus de bandeau ni d'ombre derrière le titre (22 px, graisse 600, −0,01 em) ; l'ombre de la
 *      barre du haut n'apparaît que quand un contenu défile dessous.
 *   3. UNE CARTE : rayon de 14 px, trait fin ; elle ne s'élève au survol que si elle se clique.
 *      Le bandeau de l'accueil de l'application prend le bordeaux du menu, uni comme lui (évolution 25 f).
 *   4. UN BOUTON : rayon de 8 px ; le principal plein, à l'accent ; les autres sur le fond de carte ; le geste qui
 *      détruit garde sa couleur. Les hauteurs ne changent pas (28 et 32 px).
 *   5. UN CHOIX PARMI QUELQUES-UNS (les onglets d'une page, les jours et les zooms du planning) : des pastilles ; celle
 *      qui est choisie est pleine — le bordeaux du menu en clair ; en sombre, la surface haute, cernée de l'accent.
 *   6. UN TABLEAU : des en-têtes en minuscules (13 px, graisse 500, le troisième gris), une ligne fine entre les
 *      rangées, le survol ; les chiffres tabulaires, à droite.
 * Les trois règles d'une page, les capitales et la coquille sur chaque page du menu : tests/pages-menu-browser.cjs.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;

/** Dans la page : le style calculé d'un élément (quelques propriétés), et la couleur calculée d'un jeton. */
const STYLE=([sel,props])=>{const e=document.querySelector(sel);if(!e)return null;const cs=getComputedStyle(e),out={};for(const p of props)out[p]=cs[p];return out;};
const JETON=noms=>{const s=document.createElement('i');document.body.appendChild(s);const out={};
  for(const n of noms){s.style.color='var(--'+n+')';out[n]=getComputedStyle(s).color;}s.remove();return out;};
const JETONS=['ds-nav-fond','ds-nav-repere','ds-nav-texte-1','ds-nav-actif','ds-accent','ds-sur-accent','ds-surface-1','ds-surface-3','ds-bordure','ds-bordure-forte',
  'ds-texte-1','ds-texte-3','ds-retard-texte','ds-survol','ds-choix-fond','ds-choix-texte','ds-choix-trait','ds-fond'];

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 try{
  for(const theme of ['clair','sombre']){
   const V='thème '+theme+' : ';
   const ctx=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});
   const page=await ctx.newPage(),erreurs=[];
   page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
   const attendre=(ms=350)=>page.waitForTimeout(ms);
   const site=await F.charger(page,nav,URL_V1,{pageId:'v-programme'});
   try{
    await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.unite&&window.OrlyVisuel);
    if(theme==='sombre')await page.evaluate(()=>{document.documentElement.dataset.theme='sombre';});
    await attendre();
    const style=(sel,...props)=>page.evaluate(STYLE,[sel,props]);
    const j=await page.evaluate(JETON,JETONS);
    // Les jetons du choix, tels que la demande les donne.
    if(theme==='clair')assert.deepEqual([j['ds-choix-fond'],j['ds-choix-texte'],j['ds-nav-fond'],j['ds-nav-repere']],['rgb(46, 15, 26)','rgb(255, 255, 255)','rgb(46, 15, 26)','rgb(255, 152, 83)'],V+'le bordeaux du menu, le repère pêche');
    else assert.deepEqual([j['ds-choix-fond'],j['ds-choix-texte'],j['ds-choix-trait']],[j['ds-surface-3'],j['ds-texte-1'],j['ds-accent']],V+'le choix : la surface haute, cernée de l’accent');

    /* ---- 1. le menu ------------------------------------------------------------------------------------------------ */
    let s=await style('body>.barre','backgroundColor','backgroundImage');
    assert.deepEqual(s,{backgroundColor:j['ds-nav-fond'],backgroundImage:'none'},V+'le menu : un fond uni, sans dégradé');
    s=await style('.barre .brand-mark','borderRadius','backgroundColor','backgroundImage','color');
    assert.deepEqual(s,{borderRadius:'9px',backgroundColor:j['ds-nav-repere'],backgroundImage:'none',color:j['ds-nav-fond']},V+'la marque : un carré arrondi, au repère');
    const titres=await page.evaluate(()=>[...document.querySelectorAll('.barre .menu-bloc-titre')].map(t=>{const c=getComputedStyle(t);return [t.textContent.trim(),c.fontSize,c.fontWeight,c.letterSpacing,c.textTransform];}));
    assert.deepEqual(titres,[['Lire','13px','500','normal','none'],['Régler','13px','500','normal','none']],V+'les titres de bloc : en minuscules, 13 px, graisse 500, sans lettres espacées');
    s=await style('.barre .menu-entree.actif','color','backgroundColor','boxShadow');
    assert.equal(s.color,j['ds-nav-texte-1'],V+'l’entrée ouverte : le texte du menu');
    assert.equal(s.backgroundColor,j['ds-nav-actif'],V+'l’entrée ouverte : son fond éclairci');
    assert.match(s.boxShadow,/3px 0px 0px 0px inset$/,V+'l’entrée ouverte : un trait de 3 px à gauche : '+s.boxShadow);
    assert.ok(s.boxShadow.startsWith(j['ds-nav-repere']),V+'ce trait est au repère : '+s.boxShadow);
    if(theme==='clair')assert.equal(s.color,'rgb(255, 255, 255)',V+'texte blanc');
    if(theme==='clair')assert.match(s.backgroundColor,/^(rgba\(255, 255, 255, 0\.1\)|color\(srgb 1 1 1 \/ 0\.1\))$/,V+'fond blanc à 10 % : '+s.backgroundColor);
    const compteur=await style('.barre .menu-entree .so-badge','backgroundColor','color','boxShadow','borderRadius');
    assert.ok(compteur,V+'un compteur dans le menu (« Contrôles »)');
    assert.deepEqual([compteur.backgroundColor,compteur.color,compteur.boxShadow],[j['ds-nav-repere'],j['ds-nav-fond'],'none'],V+'un compteur : une pastille au repère, son chiffre à la couleur du menu');

    /* ---- 2. le haut d'une page ------------------------------------------------------------------------------------- */
    s=await style('#tete-page','backgroundImage','backgroundColor','boxShadow','borderBottomWidth');
    assert.deepEqual(s,{backgroundImage:'none',backgroundColor:'rgba(0, 0, 0, 0)',boxShadow:'none',borderBottomWidth:'0px'},V+'plus de bandeau ni d’ombre derrière le titre');
    s=await style('#tete-titre','fontSize','fontWeight','letterSpacing','color');
    assert.deepEqual(s,{fontSize:'22px',fontWeight:'600',letterSpacing:'-0.22px',color:j['ds-texte-1']},V+'le titre : 22 px, graisse 600, −0,01 em');
    // La barre du haut : sans ombre au repos ; elle n'apparaît que quand un contenu défile dessous.
    const barreHaut=()=>page.evaluate(()=>({ombre:getComputedStyle(document.querySelector('body>.haut')).boxShadow,dit:document.body.hasAttribute('data-defile-sous-la-barre')}));
    assert.deepEqual(await barreHaut(),{ombre:'none',dit:false},V+'la barre du haut, au repos : pas d’ombre');
    // Une zone sous le titre de la page (le tableau des vols) défile : rien ne passe sous la barre.
    await page.evaluate(()=>{const z=[...document.querySelectorAll('#workspace *')].find(e=>/(auto|scroll)/.test(getComputedStyle(e).overflowY)&&e.scrollHeight>e.clientHeight+40&&e.getClientRects().length);z.scrollTop=40;z.dataset.essai='zone';});
    await attendre(200);
    assert.equal(await page.evaluate(()=>document.querySelector('[data-essai="zone"]').scrollTop),40,V+'une zone de la page a défilé');
    assert.deepEqual(await barreHaut(),{ombre:'none',dit:false},V+'une zone sous le titre défile : toujours pas d’ombre');
    // L'accueil défile juste sous la barre du haut : l'ombre apparaît, puis s'efface au retour en haut.
    await page.locator('.barre .marque').click();await page.waitForFunction(()=>document.body.dataset.vue==='accueil');await attendre();
    const accueil=await page.evaluate(()=>{const a=document.getElementById('view-accueil');return {depasse:a.scrollHeight-a.clientHeight,haut:Math.round(a.getBoundingClientRect().top),barre:Math.round(document.querySelector('body>.haut').getBoundingClientRect().bottom)};});
    assert.ok(accueil.depasse>20&&accueil.haut===accueil.barre,V+'l’accueil défile, juste sous la barre du haut : '+JSON.stringify(accueil));
    assert.deepEqual(await barreHaut(),{ombre:'none',dit:false});
    await page.evaluate(()=>{document.getElementById('view-accueil').scrollTop=30;});await attendre(200);
    let b=await barreHaut();
    assert.equal(b.dit,true,V+'un contenu défile sous la barre : la page le dit');
    if(theme==='clair')assert.notEqual(b.ombre,'none',V+'la barre du haut prend son ombre');
    await page.evaluate(()=>{document.getElementById('view-accueil').scrollTop=0;});await attendre(200);
    assert.deepEqual(await barreHaut(),{ombre:'none',dit:false},V+'revenu en haut : l’ombre s’efface');

    /* ---- 3. une carte ---------------------------------------------------------------------------------------------- */
    // Le bandeau de l'accueil prend le bordeaux du menu, uni comme lui (évolution 25 f) ; en sombre, la surface du menu.
    const bandeau=await page.evaluate(()=>{const b=getComputedStyle(document.querySelector('#view-accueil .acc-histoire')),m=getComputedStyle(document.querySelector('body>.barre'));
      return {fond:b.backgroundColor,image:b.backgroundImage,rayon:b.borderTopLeftRadius,titre:getComputedStyle(document.querySelector('#view-accueil .acc-histoire h1')).color,menu:m.backgroundColor,menuImage:m.backgroundImage};});
    assert.deepEqual([bandeau.fond,bandeau.image],[bandeau.menu,'none'],V+'le bandeau de l’accueil : le fond du menu, uni');
    assert.equal(bandeau.menuImage,'none');
    assert.equal(bandeau.rayon,'16px',V+'le bandeau garde son rayon');
    // Une tuile de l'accueil se clique : elle s'élève au survol.
    const tuile=page.locator('#view-accueil .acc-tuile').first();
    s=await tuile.evaluate(e=>{const c=getComputedStyle(e);return {r:c.borderRadius,b:c.borderTopColor,o:c.boxShadow};});
    assert.deepEqual([s.r,s.b],['14px',j['ds-bordure']],V+'une carte : rayon de 14 px, trait fin');
    if(theme==='clair'){
      assert.match(s.o,/rgba\(42, 31, 35, 0\.04\) 0px 1px 2px 0px, rgba\(42, 31, 35, 0\.08\) 0px 12px 32px -8px/,V+'l’ombre d’une carte : '+s.o);
      await tuile.hover();await attendre(250);
      assert.notEqual(await tuile.evaluate(e=>getComputedStyle(e).boxShadow),s.o,V+'une carte qui se clique s’élève au survol');
      await page.mouse.move(2,2);
    }
    // Une carte qui se lit (le programme de vols) ne bouge pas au survol.
    await nav.aller(page,'v-programme');await attendre();
    const carte=page.locator('#workspace .panneau:visible').first();
    s=await carte.evaluate(e=>{const c=getComputedStyle(e);return {r:c.borderRadius,b:c.borderTopColor,o:c.boxShadow,curseur:c.cursor};});
    assert.deepEqual([s.r,s.b],['14px',j['ds-bordure']],V+'une carte de page : rayon de 14 px, trait fin');
    await carte.hover({position:{x:6,y:6}});await attendre(250);
    assert.equal(await carte.evaluate(e=>getComputedStyle(e).boxShadow),s.o,V+'une carte qui ne se clique pas ne s’élève pas au survol');
    await page.mouse.move(2,2);
    // Sur chaque page du menu, tout ce qui est posé en carte (un trait, un fond de carte ou une ombre) a ce rayon.
    const rayons={};
    for(const id of await page.evaluate(()=>OrlyOnglets.entrees().flatMap(o=>o.pages||[o.id]))){
      await nav.aller(page,id);await attendre(id==='j-plan'?900:350);
      for(const [k,r] of await page.evaluate(()=>[...document.querySelectorAll('#workspace :is(.panneau,.mu-fiche,.svc-table,.sy-carte,.ct-niveau,.rg-recap-scroll,.table-scroll,.gr-cadre)')].filter(e=>e.getClientRects().length&&getComputedStyle(e).borderTopStyle!=='none'&&parseFloat(getComputedStyle(e).borderTopWidth)>0)
        .map(e=>[e.tagName.toLowerCase()+'.'+[...e.classList].slice(0,2).join('.'),getComputedStyle(e).borderTopLeftRadius])))if(r!=='14px')rayons[id+' : '+k]=r;
    }
    assert.deepEqual(rayons,{},V+'une carte a un rayon de 14 px, sur chaque page du menu');

    /* ---- 4. un bouton ---------------------------------------------------------------------------------------------- */
    await nav.aller(page,'v-programme');await attendre();
    const boutons=await page.evaluate(()=>{const lire=e=>{if(!e)return null;const c=getComputedStyle(e);return {r:c.borderRadius,fond:c.backgroundColor,texte:c.color,trait:c.borderTopColor,h:Math.round(e.getBoundingClientRect().height)};};
      const vus=[...document.querySelectorAll('#workspace .btn')].filter(e=>e.getClientRects().length&&!e.disabled&&!e.closest('.pg-jours,.pg-zooms,.rg-mode,.dq-essais,.direct-choix'));
      return {principal:lire(vus.find(e=>e.classList.contains('btn-play'))),autre:lire(vus.find(e=>!e.classList.contains('btn-play')&&!e.classList.contains('svc-danger')&&!e.classList.contains('btn-sm')&&!e.classList.contains('btn-icone')))};});
    assert.deepEqual([boutons.principal.r,boutons.principal.fond,boutons.principal.texte,boutons.principal.h],['8px',j['ds-accent'],j['ds-sur-accent'],32],V+'le bouton principal : plein, à l’accent, rayon de 8 px, 32 px de haut');
    assert.deepEqual([boutons.autre.r,boutons.autre.fond,boutons.autre.trait,boutons.autre.h],['8px',j['ds-surface-1'],j['ds-bordure-forte'],32],V+'un autre bouton : fond de carte, trait fort, 32 px de haut');
    // Le geste qui détruit garde sa couleur (« Supprimer » un chemin).
    await nav.aller(page,'mu-flux');await attendre();
    await page.locator('#mu-flux .ch-liste [data-mu-flux-choisir="sans-cuisine"]').click();await attendre(500);
    s=await style('#mu-flux [data-mu-flux-action="supprimer"]','color','borderRadius');
    assert.deepEqual(s,{color:j['ds-retard-texte'],borderRadius:'8px'},V+'le geste qui détruit garde sa couleur');
    assert.equal(await page.locator('#mu-flux .btn.btn-sm').first().evaluate(e=>Math.round(e.getBoundingClientRect().height)),28,V+'un petit bouton : 28 px de haut');

    /* ---- 5. un choix parmi quelques-uns : des pastilles --------------------------------------------------------------- */
    const pastilles=sel=>page.evaluate(sel=>[...document.querySelectorAll(sel)].filter(e=>e.getClientRects().length).map(e=>{const c=getComputedStyle(e);
      return {choisi:e.classList.contains('actif')||e.getAttribute('aria-pressed')==='true'||e.getAttribute('aria-selected')==='true',r:c.borderTopLeftRadius,fond:c.backgroundColor,texte:c.color,trait:c.borderTopColor,h:Math.round(e.getBoundingClientRect().height)};}),sel);
    const verifierChoix=(liste,ou,n)=>{
      assert.ok(liste.length>=n,V+ou+' : '+liste.length+' pastilles');
      assert.equal(liste.filter(p=>p.choisi).length,1,V+ou+' : une seule est choisie');
      for(const p of liste){
        assert.equal(p.r,'999px',V+ou+' : une pastille arrondie');assert.equal(p.h,28,V+ou+' : 28 px de haut');
        if(p.choisi)assert.deepEqual([p.fond,p.texte,p.trait],[j['ds-choix-fond'],j['ds-choix-texte'],j['ds-choix-trait']],V+ou+' : celle qui est choisie est pleine');
        else assert.deepEqual([p.fond,p.trait],[j['ds-surface-1'],j['ds-bordure-forte']],V+ou+' : les autres sur le fond de carte');
      }
    };
    await nav.aller(page,'at-repas');await attendre();
    verifierChoix(await pastilles('#onglets-internes .oi-onglet'),'les onglets de « Détails »',4);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('onglets-internes')).borderBottomWidth),'0px',V+'plus de trait sous les onglets');
    await nav.aller(page,'at-planning');await attendre(600);
    verifierChoix(await pastilles('#at-planning .pg-jours .pg-onglet'),'les jours du planning',2);
    verifierChoix(await pastilles('#at-planning .pg-zooms .btn'),'les zooms du planning',3);
    // Choisir une autre pastille la remplit.
    const autreZoom=page.locator('#at-planning .pg-zooms .btn[aria-pressed="false"]').first();
    await autreZoom.click();await attendre(400);
    verifierChoix(await pastilles('#at-planning .pg-zooms .btn'),'les zooms, après un clic',3);
    await nav.aller(page,'mu-services');await page.locator('#mu-services .se-tous-temps').click();await attendre(500);
    verifierChoix(await pastilles('#mu-services .rg-mode .btn'),'« Par vol / Sur la journée »',2);

    /* ---- 6. un tableau ------------------------------------------------------------------------------------------------ */
    await nav.aller(page,'v-programme');await attendre();
    const tete=await page.evaluate(()=>[...document.querySelectorAll('#workspace .flight-table thead th')].filter(e=>e.getClientRects().length).map(e=>{const c=getComputedStyle(e);return [c.fontSize,c.fontWeight,c.textTransform,c.letterSpacing,c.color].join(' | ');}));
    assert.ok(tete.length>=5,V+'le tableau des vols : '+tete.length+' en-têtes');
    assert.deepEqual([...new Set(tete)],[['13px','500','none','normal',j['ds-texte-3']].join(' | ')],V+'les en-têtes : en minuscules, 13 px, graisse 500, le troisième gris');
    const rangee=page.locator('#workspace .flight-table tbody tr').first();
    s=await rangee.evaluate(tr=>{const td=tr.querySelector('td.num')||tr.cells[tr.cells.length-1],c=getComputedStyle(td),p=getComputedStyle(tr.cells[0]);
      return {align:c.textAlign,chiffres:c.fontVariantNumeric,ligne:p.borderBottomWidth,style:p.borderBottomStyle,fond:getComputedStyle(tr).backgroundColor};});
    assert.deepEqual([s.align,s.chiffres,s.ligne,s.style],['right','tabular-nums','1px','solid'],V+'les chiffres tabulaires, à droite ; une ligne fine entre les rangées');
    await rangee.hover();await attendre(250);
    assert.equal(await rangee.evaluate(tr=>getComputedStyle(tr).backgroundColor),j['ds-survol'],V+'le survol d’une rangée');
    await page.mouse.move(2,2);

    assert.deepEqual(erreurs,[],V+'aucune erreur de page : '+erreurs.join(' | '));
   }finally{await site.effacer();await ctx.close();}
  }
  console.log('OK visuel-coquille : dans les deux thèmes — le menu uni, son entrée ouverte, ses titres de bloc en minuscules, son compteur et sa marque au repère ; le titre de la page sur le fond, sans bandeau ; l’ombre de la barre du haut seulement quand un contenu défile dessous ; les cartes (14 px, élevées au survol si elles se cliquent) ; les boutons (8 px, 28 et 32 px de haut) ; les pastilles de choix ; les en-têtes de tableau en minuscules');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

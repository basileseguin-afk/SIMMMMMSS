/* Évolution 21 (f) — la vue en direct : le cadrage d'un site disposé et le
 * retour à « À plat » (v1), à 1 366 × 768 et 1 920 × 1 080, sur l'unité
 * fictive :
 *   — avec une disposition, à l'ouverture : l'emprise du site à l'écran ne
 *     recoupe ni la légende dépliée ni la barre de la caméra ; aucune zone du
 *     site n'est dessous ; ses marges haute et basse dans la partie libre de
 *     la toile sont égales, à quelques pixels près ;
 *   — replier ou déplier la légende ne déplace pas la caméra ; « Tout voir »
 *     recadre selon son état du moment ; après un rechargement de la page, la
 *     légende dépliée, le site s'ouvre hors d'elle, aux deux tailles ;
 *   — sans disposition réglée : la vue d'aujourd'hui — toute la toile, à
 *     l'angle de la maquette, la caméra d'avant champ par champ ;
 *   — le retour à « À plat » après un déplacement de l'heure montre les
 *     chiffres de l'heure courante dès la première image, que le plan soit
 *     encore cadré en entier ou qu'on l'ait zoomé.
 * Chaque étape attend son effet, pas un délai. Unité, équipes et vols fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {siteSansPlan}=require('./plan-fictif.cjs');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
/** Quatre colonnes, de gauche à droite ; deux rangées du bas. */
const DISPOSITION={colonnes:[['magasin','decontam'],['cuisine','dotation'],['food'],['armement']],rangees:[{zone:'plonge',de:1,a:2},{zone:'quais',de:1,a:4}]};
const CLES=['ory-ui-direct-legende','ory-ui-en-ce-moment'];
const recoupe=(a,b)=>a.x0<b.x1-0.5&&b.x0<a.x1-0.5&&a.y0<b.y1-0.5&&b.y0<a.y1-0.5;
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const site=siteSansPlan();
 try{
  for(const [largeur,hauteur] of [[1366,768],[1920,1080]]){
   const V=largeur+' × '+hauteur+' : ',portable=largeur<1500;
   const ctx=await browser.newContext({viewport:{width:largeur,height:hauteur},deviceScaleFactor:1,reducedMotion:'no-preference'});
   const page=await ctx.newPage(),erreurs=[];
   page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
   const pret=()=>page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.direct&&!!Sim.ateliers.resultat&&Sim.direct.etatVue().images>0&&Sim.direct.etatVue().zones.length>0);
   /** La scène dessinée, à la taille de sa toile, sans changement d'angle en cours. */
   const dessinee=async()=>{await page.waitForFunction(()=>{const e=Sim.direct.etatVue(),c=document.getElementById('direct-toile');return !e.enMouvement&&e.ecran.w===c.clientWidth&&e.ecran.h===c.clientHeight;});
     await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));return page.evaluate(()=>Sim.direct.etatVue());};
   const siteRegle=async()=>{await page.waitForFunction(()=>JSON.stringify(Sim.direct.site)===JSON.stringify(Sim.ateliers.site(Sim.reglages.etat.regime)));return dessinee();};
   const bouton=async nom=>{await page.locator(`#direct-cmd [data-direct-cmd=${nom}]`).click();return dessinee();};
   /** Ce qui recouvre la toile, en pixels de la toile : la légende (et son état), la barre de la caméra ; chaque zone du site à l'écran. */
   const mesures=()=>page.evaluate(()=>{const t=document.getElementById('direct-toile').getBoundingClientRect(),
     r=id=>{const q=document.getElementById(id).getBoundingClientRect();return {x0:q.left-t.left,y0:q.top-t.top,x1:q.right-t.left,y1:q.bottom-t.top};};
     const zones=Object.fromEntries(Sim.direct.site.zones.map(z=>{const c=[[z.x,z.y],[z.x+z.w,z.y],[z.x,z.y+z.h],[z.x+z.w,z.y+z.h]].map(([x,y])=>Sim.direct.ecranDe(x,y,0));
       return [z.id,{x0:Math.min(...c.map(q=>q[0])),x1:Math.max(...c.map(q=>q[0])),y0:Math.min(...c.map(q=>q[1])),y1:Math.max(...c.map(q=>q[1]))}];}));
     return {toile:{w:t.width,h:t.height},legende:r('direct-coin'),depliee:document.getElementById('direct-coin').open,barre:r('direct-cmd'),zones};});
   const legende=async ouverte=>{
     if(await page.evaluate(()=>document.getElementById('direct-coin').open)!==ouverte)await page.locator('#direct-coin > summary').click();
     await page.waitForFunction(o=>document.getElementById('direct-coin').open===o,ouverte);
     await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
   /** Le site disposé, cadré : hors de la barre, hors de la légende si elle est dépliée ; centré dans la partie libre. */
   const cadre=(e,m,mot)=>{
     assert.ok(e.ajustee&&e.tient,mot+' : le site tient entier, cadré');
     assert.ok(!recoupe(e.emprise,m.barre),mot+' : l’emprise du site ne recoupe pas la barre de la caméra — '+JSON.stringify([e.emprise,m.barre]));
     if(m.depliee)assert.ok(!recoupe(e.emprise,m.legende),mot+' : l’emprise du site ne recoupe pas la légende dépliée — '+JSON.stringify([e.emprise,m.legende]));
     for(const [id,z] of Object.entries(m.zones)){
       assert.ok(!recoupe(z,m.barre),mot+' : '+id+' n’est pas sous la barre de la caméra');
       if(m.depliee)assert.ok(!recoupe(z,m.legende),mot+' : '+id+' n’est pas sous la légende');
       assert.ok(z.x0>=-0.5&&z.y0>=-0.5&&z.x1<=m.toile.w+0.5&&z.y1<=m.toile.h+0.5,mot+' : '+id+' est dans la toile');
     }
     // La partie libre : la toile, moins les bandes gardées pour la barre et la légende.
     const libre={x0:e.ecran.gauche,y0:e.ecran.haut,x1:e.ecran.w-e.ecran.droite,y1:e.ecran.h-e.ecran.bas};
     assert.ok(libre.y1<=m.barre.y0+0.5,mot+' : la partie libre s’arrête au-dessus de la barre ('+libre.y1+' ≤ '+m.barre.y0+')');
     if(m.depliee)assert.ok(libre.x0>=m.legende.x1-0.5||libre.y1<=m.legende.y0+0.5,mot+' : la partie libre est à côté de la légende, ou au-dessus');
     const haut=e.emprise.y0-libre.y0,bas=libre.y1-e.emprise.y1;
     assert.ok(Math.abs(haut-bas)<=3,mot+' : les marges haute et basse dans la partie libre sont égales ('+haut.toFixed(1)+' et '+bas.toFixed(1)+')');
     assert.ok(haut>=e.marge-0.5,mot+' : à la marge du cadrage ('+haut.toFixed(1)+' ≥ '+e.marge+')');
     return libre;};
   const memeCamera=(a,b,mot)=>assert.deepEqual([a.camera,a.ecran],[b.camera,b.ecran],mot);
   try{
    const x=await F.charger(page,nav,site.url('index.html'),{pageId:'j-plan',relief:true});await pret();
    const reimporter=()=>F.importerVols(page,nav,x.fichier,'vols-fictifs.csv',F.volsCsv());
    // Aucun choix gardé : la légende s'ouvre repliée sur un portable, dépliée sur un grand écran (correction 21 d).
    await page.evaluate(cles=>cles.forEach(c=>localStorage.removeItem(c)),CLES);
    await page.reload();await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.direct&&!!Sim.ateliers.resultat);
    // Rechargée, la page revient au programme d'exemple : les vols fictifs se réimportent. (Depuis l'évolution 26 e, avec la
    // liste des compagnies de l'unité fictive, les vols d'exemple hors de la liste ne comptent plus : la journée d'exemple
    // ne garde que des vols d'essai, trop peu pour que quatre services travaillent à l'heure choisie plus bas.)
    await reimporter();
    await nav.aller(page,'j-plan',{relief:true});await pret();

    /* ---- 1. sans disposition réglée : la vue d'aujourd'hui ------------------------------------------------ */
    assert.equal(await page.evaluate(()=>Sim.ateliers.state.disposition||null),null);
    const e0=await dessinee();
    assert.deepEqual([e0.ecran.haut,e0.ecran.bas,e0.ecran.gauche,e0.ecran.droite],[0,0,0,0],V+'sans disposition : toute la toile');
    const avant=await page.evaluate(()=>{const C=OrlyDirectCamera,D=OrlyDirectScene,e=Sim.direct.etatVue();
      return C.cadrer(C.camera({cap:C.CAP_MAQUETTE,site:C.SITE_MAQUETTE}),{w:e.ecran.w,h:e.ecran.h,haut:0,bas:0,gauche:0,droite:0},D.boiteCadree(Sim.direct.site,e.cadre));});
    assert.deepEqual(e0.camera,avant,V+'sans disposition : la caméra d’avant, champ par champ');
    await legende(!(await mesures()).depliee);
    memeCamera(await dessinee(),e0,V+'sans disposition : la légende ne déplace pas la caméra');
    memeCamera(await bouton('tout'),e0,V+'sans disposition : « Tout voir » rend la même vue, quel que soit l’état de la légende');
    await legende(!portable);

    /* ---- 2. avec une disposition, à l'ouverture ----------------------------------------------------------- */
    await page.evaluate(d=>{Sim.ateliers.regleDisposition(d,'');},DISPOSITION);
    const e1=await siteRegle(),m1=await mesures();
    assert.equal(m1.depliee,!portable,V+'la légende : repliée sur un portable, dépliée sur un grand écran');
    assert.deepEqual([e1.camera.cap,Math.round(e1.camera.site*100)/100],[25,35.26],V+'l’angle d’ouverture d’un site disposé');
    const libre1=cadre(e1,m1,V+'à l’ouverture');
    assert.ok(e1.ecran.bas>0,V+'une bande est gardée en bas, pour la barre de la caméra');

    /* ---- 3. replier ou déplier la légende ne déplace pas la caméra ; « Tout voir » recadre -------------------- */
    await legende(!m1.depliee);
    const e2=await dessinee(),m2=await mesures();
    memeCamera(e2,e1,V+(m1.depliee?'replier':'déplier')+' la légende ne déplace pas la caméra');
    const e3=await bouton('tout'),m3=await mesures();
    assert.equal(m3.depliee,!m1.depliee);
    const libre3=cadre(e3,m3,V+'« Tout voir », la légende '+(m3.depliee?'dépliée':'repliée'));
    assert.deepEqual([e3.camera.cap,Math.round(e3.camera.site*100)/100],[25,35.26],V+'« Tout voir » : l’angle d’ouverture');
    // Dépliée, la légende prend de la place : la partie libre est plus petite que repliée, le site jamais plus grand.
    const [replie,deplie]=m3.depliee?[[libre1,e1],[libre3,e3]]:[[libre3,e3],[libre1,e1]];
    const aire=l=>(l.x1-l.x0)*(l.y1-l.y0);
    assert.ok(aire(deplie[0])<aire(replie[0]),V+'la légende dépliée réduit la partie libre');
    assert.ok(deplie[1].camera.zoom<=replie[1].camera.zoom+1e-9,V+'dépliée, le site n’est jamais plus grand');
    assert.deepEqual([replie[0].x0,replie[0].y0,replie[0].x1],[0,0,replie[1].ecran.w],V+'repliée : seule la barre compte');
    // De retour à l'état de l'ouverture : « Tout voir » rend le cadrage de l'ouverture.
    await legende(m1.depliee);
    memeCamera(await dessinee(),e3,V+'la légende remise comme à l’ouverture : la caméra n’a pas bougé');
    memeCamera(await bouton('tout'),e1,V+'« Tout voir » : le cadrage de l’ouverture');
    // Après une rotation et un déplacement, « Tout voir » revient à cette vue.
    await bouton('droite');await bouton('plus');
    memeCamera(await bouton('tout'),e1,V+'après une rotation et un zoom, « Tout voir » revient à la vue d’ouverture');

    /* ---- 4. après un rechargement de la page, la légende dépliée : le site s'ouvre hors d'elle, aux deux tailles ---- */
    await legende(true);
    await page.waitForFunction(()=>localStorage.getItem('ory-ui-direct-legende')==='ouverte');
    await page.reload();
    await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.direct&&!!Sim.ateliers.resultat);
    await reimporter();
    await nav.aller(page,'j-plan',{relief:true});await pret();
    const e4=await siteRegle(),m4=await mesures();
    assert.equal(m4.depliee,true,V+'après un rechargement : la légende dépliée, comme on l’a laissée');
    cadre(e4,m4,V+'à l’ouverture, la légende dépliée');
    assert.deepEqual([e4.camera.cap,Math.round(e4.camera.site*100)/100],[25,35.26],V+'après un rechargement : l’angle d’ouverture');
    memeCamera(e4,deplie[1],V+'le cadrage de l’ouverture est celui de « Tout voir », la légende dépliée');

    /* ---- 5. la disposition automatique : la vue d'aujourd'hui ------------------------------------------------ */
    await page.evaluate(()=>{Sim.ateliers.regleDisposition(null,'');});
    const e5=await siteRegle();
    assert.deepEqual([e5.ecran.haut,e5.ecran.bas,e5.ecran.gauche,e5.ecran.droite],[0,0,0,0],V+'la disposition automatique : toute la toile');
    assert.deepEqual([e5.camera.cap,Math.round(e5.camera.site*100)/100],[45,35.26],V+'la disposition automatique : l’angle de la maquette');

    /* ---- 6. le retour à « À plat » : les chiffres de l'heure courante, dès la première image ------------------- */
    // Les chiffres du plan dessiné : pour chaque service qui a du monde, au travail, présents, en file.
    await page.evaluate(()=>{window.__chiffres=()=>Object.fromEntries([...document.querySelectorAll('#plan .zone[data-au-travail]')].map(z=>[z.dataset.id,[z.dataset.auTravail,z.dataset.presents,z.dataset.enFile]]));});
    /** À plat, repeint exprès à l'heure courante, deux images plus tard : la référence. */
    const reference=()=>page.evaluate(()=>{Sim.vue.pause();return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(window.__chiffres()))));});
    const aLHeure=async t=>{await page.evaluate(t=>{Sim.vue.pause();Sim.vue.allerA(t);},t);await page.waitForFunction(t=>Math.abs(Sim.vue.t-t)<1e-9,t);};
    /** Ouvre la vue à plat et lit le plan dans le même geste, avant toute image : ce que la première image montrera.
     *  (Évolution 23 a : la vue à plat ne s'ouvre plus que par « Aller à… » ; c'est la porte que prend ce choix.) */
    const revenirAPlat=()=>page.evaluate(()=>{Sim.onglets.choisir('j-plan:plat');
      return {mode:document.body.dataset.direct,t:Sim.vue.t,lus:window.__chiffres()};});
    const enRelief=async()=>{await page.locator('#menu [data-entree="j-plan"]').click();await page.waitForFunction(()=>document.body.dataset.direct==='relief');await dessinee();};
    const bornes=await page.evaluate(()=>({debut:Sim.vue.debut,fin:Sim.vue.fin}));
    const h1=Math.round(bornes.debut+(bornes.fin-bornes.debut)*0.3),h2=Math.round(bornes.debut+(bornes.fin-bornes.debut)*0.55),h3=Math.round(bornes.debut+(bornes.fin-bornes.debut)*0.42);
    // Le plan dessiné est vu une première fois, à l'heure h1.
    await aLHeure(h1);
    const r1=await revenirAPlat();
    assert.equal(r1.mode,'plat');
    const ref1=await reference();
    assert.ok(Object.keys(ref1).length>=4,V+'à plat : les services dessinés');
    assert.deepEqual(r1.lus,ref1,V+'à plat, à '+h1+' min : les chiffres de l’heure courante');
    // En relief, l'heure avance : le plan caché ne se repeint pas. De retour à « À plat », il montre l'heure courante dès la première image.
    await enRelief();
    await aLHeure(h2);
    const r2=await revenirAPlat(),ref2=await reference();
    assert.equal(r2.t,h2,V+'la même heure');
    assert.notDeepEqual(ref2,ref1,V+'les deux heures n’ont pas les mêmes chiffres : le test voit la différence');
    assert.deepEqual(r2.lus,ref2,V+'le retour à « À plat » après un déplacement de l’heure : les chiffres de l’heure courante, dès la première image');
    // Le plan zoomé (il n'est plus cadré en entier) : de même.
    await page.locator('#zoom-in').click();
    await enRelief();
    await aLHeure(h3);
    const r3=await revenirAPlat(),ref3=await reference();
    assert.notDeepEqual(ref3,ref2,V+'une troisième heure, d’autres chiffres');
    assert.deepEqual(r3.lus,ref3,V+'le plan zoomé, de retour à « À plat » : les chiffres de l’heure courante, dès la première image');
    await enRelief();

    x.effacer();
    assert.deepEqual(erreurs,[],V+erreurs.join(' | '));
   }finally{await ctx.close();}
  }
  console.log('direct-cadrage-browser : ok — à 1 366 × 768 et 1 920 × 1 080 : un site disposé se cadre au centre de la partie libre de la toile, hors de la barre de la caméra et de la légende dépliée (aucune zone dessous, des marges haute et basse égales) ; replier ou déplier la légende ne déplace pas la caméra, « Tout voir » recadre selon son état ; après un rechargement aussi ; sans disposition, la vue d’avant, champ par champ ; le retour à « À plat » montre les chiffres de l’heure courante dès la première image');
 }catch(e){console.error(e);process.exitCode=1;}finally{site.effacer();await browser.close();}
})();

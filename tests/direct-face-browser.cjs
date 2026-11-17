/* Correction 21 (b), évolution 21 (f) — quand l'utilisateur a disposé les zones,
 * la scène s'ouvre comme il les a rangées (v1), à 1 366 × 768 et 1 920 × 1 080 :
 *   — sans disposition réglée : l'angle d'aujourd'hui (la maquette, de trois
 *     quarts) à l'ouverture et sur « Tout voir » ;
 *   — avec une disposition : la vue d'ouverture et « Tout voir » prennent
 *     l'inclinaison de la maquette et un cap à peine tourné (entre 20° et
 *     30°) — la première colonne est à gauche de la dernière à l'écran, une
 *     rangée du bas est sous les colonnes, les volumes montrent une face
 *     latérale ; après un rechargement aussi ;
 *   — la caméra reste libre : après une rotation, « Cadrer » garde l'angle et
 *     « Tout voir » revient à la vue d'ouverture ;
 *   — « Revenir à la disposition automatique » rend l'angle d'aujourd'hui.
 * (Jusqu'à l'évolution 21 f, un site disposé s'ouvrait de face, au cap 0, de
 * trois quarts haut : il se lisait comme un plan vu du dessus.)
 * Chaque étape attend son effet, pas un délai. Unité, équipes et vols fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
/** Quatre colonnes, de gauche à droite ; deux rangées du bas. */
const DISPOSITION={colonnes:[['magasin','decontam'],['cuisine','dotation'],['food'],['armement']],rangees:[{zone:'plonge',de:1,a:2},{zone:'quais',de:1,a:4}]};
const MAQUETTE=[45,35.26],DISPOSE=[25,35.26];
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 try{
  for(const [largeur,hauteur] of [[1366,768],[1920,1080]]){
   const V=largeur+' × '+hauteur+' : ';
   const ctx=await browser.newContext({viewport:{width:largeur,height:hauteur},deviceScaleFactor:1,reducedMotion:'no-preference'});
   const page=await ctx.newPage(),erreurs=[];
   page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
   const pret=()=>page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.direct&&!!Sim.ateliers.resultat&&Sim.direct.etatVue().images>0&&Sim.direct.etatVue().zones.length>0);
   const dessinee=async()=>{await page.waitForFunction(()=>!Sim.direct.etatVue().enMouvement);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));return page.evaluate(()=>Sim.direct.etatVue());};
   const angle=e=>[e.camera.cap,Math.round(e.camera.site*100)/100];
   const bouton=async(nom,n=1)=>{for(let i=0;i<n;i++){await page.locator(`#direct-cmd [data-direct-cmd=${nom}]`).click();await dessinee();}return dessinee();};
   /** Attend que la vue dessine le site des réglages du moment. */
   const siteRegle=async()=>{await page.waitForFunction(()=>JSON.stringify(Sim.direct.site)===JSON.stringify(Sim.ateliers.site(Sim.reglages.etat.regime)));return dessinee();};
   /** À l'écran : le milieu d'une zone ; le milieu de son bord du haut et de son bord du bas. */
   const aLEcran=()=>page.evaluate(()=>Object.fromEntries(Sim.direct.site.zones.map(z=>{const p=(x,y)=>Sim.direct.ecranDe(x,y,0),c=p(z.x+z.w/2,z.y+z.h/2);
     return [z.id,{x:c[0],y:c[1],haut:p(z.x+z.w/2,z.y)[1],bas:p(z.x+z.w/2,z.y+z.h)[1]}];})));
   /** La scène tient entière dans la toile. */
   const tient=(e,mot)=>assert.ok(e.tient&&e.ajustee,mot+' : la scène tient entière, cadrée');
   try{
    const x=await F.charger(page,nav,URL,{pageId:'j-plan',relief:true});await pret();

    // 1. Sans disposition réglée : l'angle d'aujourd'hui, à l'ouverture et sur « Tout voir ».
    assert.equal(await page.evaluate(()=>Sim.ateliers.state.disposition||null),null);
    const e0=await dessinee();
    assert.deepEqual(angle(e0),MAQUETTE,V+'sans disposition, à l’ouverture : l’angle de la maquette');
    tient(e0,V+'à l’ouverture');
    await bouton('droite',2);
    assert.deepEqual(angle(await bouton('tout')),MAQUETTE,V+'sans disposition, « Tout voir » : l’angle de la maquette');

    // 2. Une disposition réglée : l'inclinaison de la maquette, le cap à peine tourné — les colonnes de gauche à droite,
    //    les rangées du bas en bas, une face latérale.
    await page.evaluate(d=>{Sim.ateliers.regleDisposition(d,'');},DISPOSITION);
    const e1=await siteRegle();
    assert.deepEqual(angle(e1),DISPOSE,V+'avec une disposition : l’inclinaison de la maquette, le cap à peine tourné');
    assert.ok(e1.camera.cap>20&&e1.camera.cap<30,V+'le cap est entre 20° et 30° : '+e1.camera.cap);
    assert.equal(e1.camera.site,e0.camera.site,V+'l’inclinaison est celle de la vue sans disposition');
    tient(e1,V+'le site disposé');
    const z=await aLEcran();
    assert.ok(z.magasin.x<z.armement.x,V+'la première colonne est à gauche de la dernière ('+Math.round(z.magasin.x)+' < '+Math.round(z.armement.x)+')');
    assert.ok(z.magasin.x<z.cuisine.x&&z.cuisine.x<z.food.x&&z.food.x<z.armement.x,V+'les quatre colonnes, de gauche à droite');
    for(const id of ['magasin','decontam','cuisine','dotation'])assert.ok(z.plonge.y>z[id].y+5,V+'la plonge (une rangée du bas) est sous '+id);
    for(const id of ['magasin','decontam','cuisine','dotation','food','armement','plonge'])assert.ok(z.quais.y>z[id].y+5,V+'le quai (la rangée la plus basse) est sous '+id);
    assert.ok(z.magasin.bas<z.decontam.haut+0.5&&z.magasin.y<z.decontam.y,V+'dans une colonne, de haut en bas');
    // Les volumes montrent une face latérale : celle de droite, avec celle de devant ; les murs du fond sont en haut et à gauche.
    assert.deepEqual(e1.murs,{x0:true,x1:false,y0:true,y1:false},V+'les murs du fond');
    // On voit encore les personnes et les chariots.
    assert.ok(e1.personnes.length>0||e1.circule.chariots.length>0,V+'des personnes ou des chariots dans la scène');
    assert.deepEqual(e1.recouvrements,[],V+'aucune étiquette n’en recouvre une autre');

    // 3. La caméra reste libre : après une rotation, « Cadrer » garde l'angle ; « Tout voir » revient à la vue d'ouverture.
    const e2=await bouton('droite',2);
    assert.deepEqual(angle(e2),[55,35.26],V+'deux pas à droite');
    await bouton('bas');
    await page.evaluate(()=>{const b=document.getElementById('btn-en-ce-moment');if(document.body.classList.contains('sans-en-ce-moment'))b.click();});
    await page.waitForFunction(()=>!document.body.classList.contains('sans-en-ce-moment'));
    await page.locator('#direct-panneau-corps .dq-personnes [data-direct-service="cuisine"]').click();
    await page.waitForFunction(()=>Sim.direct.etatVue().selection==='cuisine');
    const e3=await bouton('cadrer');
    assert.deepEqual(angle(e3),[55,25.26],V+'« Cadrer » garde l’angle choisi');
    assert.equal(e3.ajustee,false,V+'cadré sur le service');
    assert.ok(e3.camera.zoom>e2.camera.zoom,V+'de plus près');
    const e4=await bouton('tout');
    assert.deepEqual(angle(e4),DISPOSE,V+'« Tout voir » revient à la vue d’ouverture');
    tient(e4,V+'« Tout voir »');
    await page.locator('#direct-panneau-corps [data-direct-retour]').click();
    await page.waitForFunction(()=>!Sim.direct.etatVue().selection);
    // Au clavier aussi : « 0 » montre tout, à l'angle d'ouverture.
    await bouton('gauche',3);
    await page.locator('#direct-toile').focus();await page.keyboard.press('0');
    assert.deepEqual(angle(await dessinee()),DISPOSE,V+'la touche 0 : la vue d’ouverture');

    // 4. Après un rechargement, la disposition est là : la scène s'ouvre au même angle.
    await page.reload();
    await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.direct&&!!Sim.ateliers.resultat);
    await nav.aller(page,'j-plan',{relief:true});await pret();
    const e5=await siteRegle();
    assert.deepEqual(await page.evaluate(()=>Sim.ateliers.state.disposition),DISPOSITION);
    assert.deepEqual(angle(e5),DISPOSE,V+'après un rechargement : le même angle');
    const z5=await aLEcran();
    assert.ok(z5.magasin.x<z5.armement.x&&z5.quais.y>z5.food.y+5,V+'les colonnes de gauche à droite, le quai en bas');

    // 5. « Revenir à la disposition automatique » : l'angle d'aujourd'hui.
    await page.evaluate(()=>{Sim.ateliers.regleDisposition(null,'');});
    const e6=await siteRegle();
    assert.deepEqual(angle(e6),MAQUETTE,V+'la disposition automatique : l’angle de la maquette');
    tient(e6,V+'la disposition automatique');

    x.effacer();
    assert.deepEqual(erreurs,[],V+erreurs.join(' | '));
   }finally{await ctx.close();}
  }
  console.log('direct-face-browser : ok — à 1 366 × 768 et 1 920 × 1 080 : sans disposition, l’angle de la maquette à l’ouverture et sur « Tout voir » ; avec une disposition, l’inclinaison de la maquette et un cap entre 20° et 30° — la première colonne à gauche de la dernière, les rangées du bas sous les colonnes, une face latérale ; après une rotation, « Cadrer » garde l’angle, « Tout voir » et la touche 0 reviennent à la vue d’ouverture ; après un rechargement aussi ; la disposition automatique rend l’angle de la maquette');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

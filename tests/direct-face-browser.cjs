/* Correction 21 (b) — quand l'utilisateur a disposé les zones, la scène s'ouvre
 * comme il les a rangées (v1), à 1 366 × 768 et 1 920 × 1 080 :
 *   — sans disposition réglée : l'angle d'aujourd'hui (la maquette, de trois
 *     quarts) à l'ouverture et sur « Tout voir » ;
 *   — avec une disposition : la vue d'ouverture et « Tout voir » regardent le
 *     site de face — la première colonne est à gauche de la dernière à
 *     l'écran, une rangée du bas est sous les colonnes — de trois quarts haut ;
 *     après un rechargement aussi ;
 *   — la caméra reste libre : après une rotation, « Cadrer » garde l'angle et
 *     « Tout voir » revient à la vue d'ouverture ;
 *   — « Revenir à la disposition automatique » rend l'angle d'aujourd'hui.
 * Chaque étape attend son effet, pas un délai. Unité, équipes et vols fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
/** Quatre colonnes, de gauche à droite ; deux rangées du bas. */
const DISPOSITION={colonnes:[['magasin','decontam'],['cuisine','dotation'],['food'],['armement']],rangees:[{zone:'plonge',de:1,a:2},{zone:'quais',de:1,a:4}]};
const MAQUETTE=[45,35.26],DE_FACE=[0,55.26];
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
   /** À l'écran : le centre d'une zone, son haut et son bas. */
   const aLEcran=()=>page.evaluate(()=>Object.fromEntries(Sim.direct.site.zones.map(z=>{const p=(x,y)=>Sim.direct.ecranDe(x,y,0);
     return [z.id,{x:p(z.x+z.w/2,z.y+z.h/2)[0],haut:Math.min(p(z.x,z.y)[1],p(z.x+z.w,z.y)[1]),bas:Math.max(p(z.x,z.y+z.h)[1],p(z.x+z.w,z.y+z.h)[1]),gauche:[p(z.x,z.y)[0],p(z.x,z.y+z.h)[0]]}];})));
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

    // 2. Une disposition réglée : la scène s'ouvre de face — les colonnes de gauche à droite, les rangées du bas en bas.
    await page.evaluate(d=>{Sim.ateliers.regleDisposition(d,'');},DISPOSITION);
    const e1=await siteRegle();
    assert.deepEqual(angle(e1),DE_FACE,V+'avec une disposition : de face, de trois quarts haut');
    tient(e1,V+'le site disposé');
    const z=await aLEcran();
    assert.ok(z.magasin.x<z.armement.x,V+'la première colonne est à gauche de la dernière ('+Math.round(z.magasin.x)+' < '+Math.round(z.armement.x)+')');
    assert.ok(z.magasin.x<z.cuisine.x&&z.cuisine.x<z.food.x&&z.food.x<z.armement.x,V+'les quatre colonnes, de gauche à droite');
    for(const id of ['magasin','decontam','cuisine','dotation'])assert.ok(z.plonge.haut>z[id].bas-0.5,V+'la plonge (une rangée du bas) est sous '+id);
    for(const id of ['magasin','decontam','cuisine','dotation','food','armement','plonge'])assert.ok(z.quais.haut>z[id].bas-0.5,V+'le quai (la rangée la plus basse) est sous '+id);
    for(const id of Object.keys(z))assert.ok(Math.abs(z[id].gauche[0]-z[id].gauche[1])<0.5,V+id+' : un bord vertical à l’écran');
    assert.ok(z.magasin.bas<z.decontam.haut+0.5,V+'dans une colonne, de haut en bas');
    // On voit encore les personnes et les chariots.
    assert.ok(e1.personnes.length>0||e1.circule.chariots.length>0,V+'des personnes ou des chariots dans la scène');
    assert.deepEqual(e1.recouvrements,[],V+'aucune étiquette n’en recouvre une autre');

    // 3. La caméra reste libre : après une rotation, « Cadrer » garde l'angle ; « Tout voir » revient à la vue d'ouverture.
    const e2=await bouton('droite',2);
    assert.deepEqual(angle(e2),[30,55.26],V+'deux pas à droite');
    await bouton('bas');
    await page.evaluate(()=>{const b=document.getElementById('btn-en-ce-moment');if(document.body.classList.contains('sans-en-ce-moment'))b.click();});
    await page.waitForFunction(()=>!document.body.classList.contains('sans-en-ce-moment'));
    await page.locator('#direct-panneau-corps .dq-personnes [data-direct-service="cuisine"]').click();
    await page.waitForFunction(()=>Sim.direct.etatVue().selection==='cuisine');
    const e3=await bouton('cadrer');
    assert.deepEqual(angle(e3),[30,45.26],V+'« Cadrer » garde l’angle choisi');
    assert.equal(e3.ajustee,false,V+'cadré sur le service');
    assert.ok(e3.camera.zoom>e2.camera.zoom,V+'de plus près');
    const e4=await bouton('tout');
    assert.deepEqual(angle(e4),DE_FACE,V+'« Tout voir » revient à la vue d’ouverture');
    tient(e4,V+'« Tout voir »');
    await page.locator('#direct-panneau-corps [data-direct-retour]').click();
    await page.waitForFunction(()=>!Sim.direct.etatVue().selection);
    // Au clavier aussi : « 0 » montre tout, de face.
    await bouton('gauche',3);
    await page.locator('#direct-toile').focus();await page.keyboard.press('0');
    assert.deepEqual(angle(await dessinee()),DE_FACE,V+'la touche 0 : la vue d’ouverture');

    // 4. Après un rechargement, la disposition est là : la scène s'ouvre de face.
    await page.reload();
    await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.direct&&!!Sim.ateliers.resultat);
    await nav.aller(page,'j-plan',{relief:true});await pret();
    const e5=await siteRegle();
    assert.deepEqual(await page.evaluate(()=>Sim.ateliers.state.disposition),DISPOSITION);
    assert.deepEqual(angle(e5),DE_FACE,V+'après un rechargement : de face');
    const z5=await aLEcran();
    assert.ok(z5.magasin.x<z5.armement.x&&z5.quais.haut>z5.food.bas-0.5,V+'les colonnes de gauche à droite, le quai en bas');

    // 5. « Revenir à la disposition automatique » : l'angle d'aujourd'hui.
    await page.evaluate(()=>{Sim.ateliers.regleDisposition(null,'');});
    const e6=await siteRegle();
    assert.deepEqual(angle(e6),MAQUETTE,V+'la disposition automatique : l’angle de la maquette');
    tient(e6,V+'la disposition automatique');

    x.effacer();
    assert.deepEqual(erreurs,[],V+erreurs.join(' | '));
   }finally{await ctx.close();}
  }
  console.log('direct-face-browser : ok — à 1 366 × 768 et 1 920 × 1 080 : sans disposition, l’angle de la maquette à l’ouverture et sur « Tout voir » ; avec une disposition, la scène s’ouvre de face, de trois quarts haut — la première colonne à gauche de la dernière, les rangées du bas sous les colonnes, des bords verticaux ; après une rotation, « Cadrer » garde l’angle, « Tout voir » et la touche 0 reviennent à la vue d’ouverture ; après un rechargement aussi ; la disposition automatique rend l’angle de la maquette.');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

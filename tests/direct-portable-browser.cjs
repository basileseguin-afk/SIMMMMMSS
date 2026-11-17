/* Évolution 16, retouches — la vue en direct sur un portable, dans la page (v1),
 * sur l'unité fictive de 15 services (tests/unite-15-services.cjs), à
 * 1 366 × 768 et à 1 920 × 1 080 :
 *   1. la scène d'abord : à l'ouverture, après « Tout voir » et après un
 *      changement de taille de fenêtre, ce qu'on cadre — le bâtiment et les
 *      avions présents, pas l'aire vide (évolution 19, retouche) — remplit la
 *      toile, avec une marge de 5 % au plus ; à 1 366 × 768 la toile fait au
 *      moins 560 px de haut, et le bâtiment occupe au moins 70 % de sa largeur
 *      ou de sa hauteur ; le titre, le choix de la journée de vols et « En
 *      relief / À plat » tiennent sur une ligne ; la légende est dans un coin
 *      de la toile, repliable, et le choix est retenu (sous 1 500 px de large,
 *      elle est repliée à l'ouverture — correction 21 d) ; « Plein écran » masque
 *      le menu et l'en-tête, Échap en sort ; sous 1 500 px de large, « En ce
 *      moment » est replié à l'ouverture — un bouton l'ouvre, le choix est
 *      retenu ;
 *   2. les étiquettes ne cachent pas la scène : le nom seul, en petit ; les
 *      chiffres au survol, sur le service choisi, et pour le seul goulot du
 *      moment ; les vols : ceux qu'on charge ou qui partent dans l'heure, six
 *      au plus, les autres au survol ; à l'ouverture, moins de 15 % de la toile ;
 *   3. le tableau « Les personnes » tombe juste : « En pause, en appui ou en
 *      chemin », et pour chaque service la somme des trois colonnes égale les
 *      présents — à trois heures, dont une où des chauffeurs sont en route.
 * Des captures de contrôle aux deux tailles, gardées hors du dépôt : dans
 * $ORY_CAPTURES s'il est donné, sinon dans un dossier temporaire, dit à la fin.
 * Chaque étape attend son effet, pas un délai. Aucune donnée de l'unité : tout
 * est fictif. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs'),U=require('./unite-15-services.cjs');
const {siteSansPlan}=require('./plan-fictif.cjs');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const dossier=process.env.ORY_CAPTURES?path.resolve(process.env.ORY_CAPTURES):fs.mkdtempSync(path.join(os.tmpdir(),'ory-captures-portable-'));
fs.mkdirSync(dossier,{recursive:true});
const taillePng=f=>{const b=fs.readFileSync(f);assert.equal(b.toString('latin1',1,4),'PNG',f);return [b.readUInt32BE(16),b.readUInt32BE(20)];};
const pourcent=x=>Math.round(x*1000)/10+' %';

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const site=siteSansPlan(),faites=[],mesures=[];
 try{
  const sauvegarde=U.sauvegarde(),CSV=U.volsCsv();
  for(const [largeur,hauteur] of [[1366,768],[1920,1080]]){
   const V=largeur+' × '+hauteur+' : ',etroit=largeur<1500;
   const ctx=await browser.newContext({viewport:{width:largeur,height:hauteur},deviceScaleFactor:1,colorScheme:'light',reducedMotion:'no-preference'});
   const page=await ctx.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   const etat=()=>page.evaluate(()=>Sim.direct.etatVue());
   const dessinee=async()=>{await page.waitForFunction(()=>!Sim.direct.etatVue().enMouvement);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));return etat();};
   const aLHeure=async t=>{await page.evaluate(t=>{Sim.vue.pause();Sim.vue.allerA(t);},t);await page.waitForFunction(t=>Math.abs(Sim.direct.etatVue().t-t)<1e-9,t);return dessinee();};
   const prete=()=>page.waitForFunction(()=>window.Sim&&Sim.direct&&Sim.directPanneau&&Sim.direct.etatVue().images>0&&Sim.direct.etatVue().circule&&Sim.direct.etatVue().zones.length>0);
   const replie=()=>page.evaluate(()=>({replie:document.body.classList.contains('sans-en-ce-moment'),bouton:document.getElementById('btn-en-ce-moment').getAttribute('aria-expanded'),panneau:document.getElementById('en-ce-moment').offsetParent!==null,choix:localStorage.getItem('ory-ui-en-ce-moment')}));
   const capturer=async nom=>{const f=path.join(dossier,'16r-'+largeur+'-'+nom+'.png');await page.screenshot({path:f});
     assert.deepEqual(taillePng(f),[largeur,hauteur],V+nom+' : la taille de la capture');assert.ok(fs.statSync(f).size>20000,V+nom);faites.push(f);};
   /** Le site cadré dans la toile : la part de la toile qu'il prend en largeur et en hauteur, sa marge du côté qui le limite. */
   const cadrage=(e,mot)=>{
     const b=e.emprise,w=e.ecran.w,h=e.ecran.h,parts={largeur:(b.x1-b.x0)/w,hauteur:(b.y1-b.y0)/h},marges={gauche:b.x0,droite:w-b.x1,haut:b.y0,bas:h-b.y1};
     assert.ok(e.ajustee&&e.tient,mot+' : la scène est cadrée, entière');
     assert.deepEqual([e.ecran.haut,e.ecran.bas,e.ecran.gauche,e.ecran.droite],[0,0,0,0],mot+' : aucune bande de la toile gardée libre');
     const limite=parts.hauteur>=parts.largeur?['haut','bas',h]:['gauche','droite',w];
     // Du côté qui le limite, le site touche sa marge : 5 % de la toile au plus, des deux bords.
     for(const c of limite.slice(0,2))assert.ok(marges[c]/limite[2]<=0.05&&marges[c]>=e.marge-0.6,mot+' : la marge '+c+' ('+Math.round(marges[c])+' px, '+pourcent(marges[c]/limite[2])+')');
     assert.ok(Math.max(parts.largeur,parts.hauteur)>=0.9,mot+' : le site cadré remplit la toile ('+pourcent(parts.largeur)+' de sa largeur, '+pourcent(parts.hauteur)+' de sa hauteur)');
     assert.ok(Math.min(marges.gauche,marges.droite,marges.haut,marges.bas)>=e.marge-0.6,mot+' : rien n’est coupé');
     return parts;};
   /** La part de la toile que couvrent les étiquettes (celles des services, des vols, et les mots posés dans la scène). */
   const couverture=e=>[...e.etiquettes,...e.vols,...e.circule.marques].reduce((s,q)=>s+q.w*q.h,0)/(e.ecran.w*e.ecran.h);
   const chiffres=l=>l.lignes.find(x=>/^\d+ au travail \/ \d+ présents?$/.test(x))||null;
   /** Un point de l'écran, dans la page, pour un point du sol de la scène. */
   const surLaToile=async(x,y,z=0)=>{const b=await page.locator('#direct-toile').boundingBox(),p=await page.evaluate(([x,y,z])=>Sim.direct.ecranDe(x,y,z),[x,y,z]);return {x:b.x+p[0],y:b.y+p[1]};};
   const ch=await F.charger(page,nav,site.url('index.html'),{sauvegarde,csv:CSV,pageId:'j-plan',relief:true,panneau:false});
   try{
    await prete();

    // 1. À l'ouverture : sous 1 500 px, « En ce moment » est replié (aucun choix retenu) ; au-delà, ouvert.
    const p0=await replie();
    assert.deepEqual([p0.replie,p0.bouton,p0.panneau,p0.choix],etroit?[true,'false',false,null]:[false,'true',true,null],V+'le panneau à l’ouverture');
    const e0=await dessinee();
    assert.ok(e0.zones.length>=15,V+'une unité d’une quinzaine de services ('+e0.zones.length+' zones)');
    const parts0=cadrage(e0,V+'à l’ouverture');
    // Ce qu'on cadre : le bâtiment et les avions présents à cette heure — pas l'aire entière des avions de la journée.
    const presents=e0.circule.avions.length;
    assert.equal(e0.cadre.length,presents,V+'le cadre compte les avions présents ('+presents+')');
    assert.ok(e0.aire.places>presents,V+'l’aire a plus de places ('+e0.aire.places+') que d’avions présents : le cadrage ne la compte plus entière');
    // Le bâtiment : au moins 70 % de la largeur ou de la hauteur de la toile ; sur un portable, la toile fait au moins 560 px de haut.
    const bat={largeur:(e0.batiment.x1-e0.batiment.x0)/e0.ecran.w,hauteur:(e0.batiment.y1-e0.batiment.y0)/e0.ecran.h};
    assert.ok(Math.max(bat.largeur,bat.hauteur)>=0.7,V+'le bâtiment occupe au moins 70 % de la largeur ou de la hauteur de la toile ('+pourcent(bat.largeur)+', '+pourcent(bat.hauteur)+')');
    if(etroit)assert.ok(e0.ecran.h>=560,V+'la toile fait au moins 560 px de haut ('+e0.ecran.h+' px)');
    mesures.push(largeur+' px : toile '+e0.ecran.w+' × '+e0.ecran.h+', bâtiment '+pourcent(bat.largeur)+' × '+pourcent(bat.hauteur));
    // L'en-tête : le titre de la page et « En relief / À plat » sur une seule ligne ; plus de bande au-dessus de la scène.
    const tete=await page.evaluate(()=>{const b=s=>document.querySelector(s).getBoundingClientRect(),t=b('#tete-titre'),c=b('#direct-choix'),h=b('#tete-page'),toile=b('#direct-toile');
      return {hauteur:h.height,ligne:t.bottom>c.top&&c.bottom>t.top,titre:document.getElementById('tete-titre').textContent,bande:document.getElementById('plan-bande').offsetParent!==null,
        intro:document.getElementById('view-intro').textContent.length>10&&b('#view-intro').width<=2,colle:Math.abs(toile.top-h.bottom)};});
    assert.ok(tete.ligne&&tete.hauteur<=44&&tete.titre==='En direct',V+'le titre et « En relief / À plat » sur une seule ligne ('+tete.hauteur+' px)');
    assert.ok(!tete.bande&&tete.colle<=1,V+'la scène commence sous l’en-tête : plus de bande entre les deux');
    assert.ok(tete.intro,V+'l’introduction n’est plus à l’écran ; les lecteurs d’écran la lisent encore');
    // La légende : dans un coin de la toile, repliable ; le choix est retenu. À l'ouverture, sans choix retenu, elle est
    // dépliée sur un grand écran et repliée sous 1 500 px de large (correction 21 d) : un clic la déplie.
    const coin=async()=>page.evaluate(()=>{const b=s=>document.querySelector(s).getBoundingClientRect(),d=document.getElementById('direct-coin'),c=b('#direct-coin'),t=b('#direct-toile');
      return {ouverte:d.open,dans:c.left>=t.left&&c.right<=t.right&&c.top>=t.top&&c.bottom<=t.bottom,coin:c.left-t.left<=16&&t.bottom-c.bottom<=16,part:c.width*c.height/(t.width*t.height),
        legende:document.getElementById('direct-legende').checkVisibility(),note:document.getElementById('direct-note').checkVisibility(),aide:document.getElementById('direct-aide').checkVisibility(),
        titre:d.querySelector('summary').textContent,choix:localStorage.getItem('ory-ui-direct-legende')};});
    let lg=await coin();
    assert.equal(lg.choix,null,V+'aucun choix retenu à l’ouverture');
    if(etroit){
      assert.ok(!lg.ouverte&&!lg.legende&&lg.titre==='Légende'&&lg.dans&&lg.coin&&lg.part<0.012,V+'la légende, repliée à l’ouverture sur un portable : '+JSON.stringify(lg));
      await page.locator('#direct-coin > summary').click();
      await page.waitForFunction(()=>document.getElementById('direct-coin').open&&localStorage.getItem('ory-ui-direct-legende')==='ouverte');
      lg=await coin();
    }
    assert.ok(lg.ouverte&&lg.legende&&lg.note&&lg.aide&&lg.titre==='Légende',V+'la légende, dépliée : '+JSON.stringify(lg));
    assert.ok(lg.dans&&lg.coin&&lg.part<0.15,V+'dans le coin de la toile ('+pourcent(lg.part)+' de la toile)');
    await page.locator('#direct-coin > summary').click();
    await page.waitForFunction(()=>!document.getElementById('direct-coin').open&&localStorage.getItem('ory-ui-direct-legende')==='repliee');
    lg=await coin();
    assert.ok(!lg.ouverte&&!lg.legende&&lg.dans&&lg.coin&&lg.part<0.012,V+'repliée : son seul titre, dans le coin ('+pourcent(lg.part)+')');
    await page.locator('#direct-coin > summary').focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.getElementById('direct-coin').open&&localStorage.getItem('ory-ui-direct-legende')==='ouverte');
    // « Plein écran » : le menu et l'en-tête sont masqués, la toile prend toute la fenêtre ; Échap en sort.
    const places=()=>page.evaluate(()=>{const vu=s=>{const e=document.querySelector(s);return !!e&&e.offsetParent!==null;},t=document.getElementById('direct-toile').getBoundingClientRect(),b=document.getElementById('direct-plein');
      return {plein:document.body.classList.contains('direct-plein'),menu:vu('#barre'),haut:vu('header.haut'),tete:vu('#tete-page'),toile:[Math.round(t.left),Math.round(t.top),Math.round(t.width),Math.round(t.height)],
        bouton:[b.getAttribute('aria-pressed'),b.textContent,b.offsetParent!==null],temps:vu('#direct-temps'),lecteur:vu('#lecteur')};});
    const avantPlein=await places();
    assert.deepEqual([avantPlein.plein,avantPlein.menu,avantPlein.haut,avantPlein.tete,avantPlein.bouton],[false,true,true,true,['false','Plein écran',true]],V+'avant le plein écran');
    await page.locator('#direct-plein').click();
    await page.waitForFunction(()=>document.body.classList.contains('direct-plein')&&Sim.direct.etatVue().ecran.h===document.getElementById('direct-toile').clientHeight);
    const plein=await places();
    assert.deepEqual([plein.plein,plein.menu,plein.haut,plein.tete,plein.bouton],[true,false,false,false,['true','Quitter le plein écran',true]],V+'en plein écran : ni menu ni en-tête, le bouton reste');
    // Depuis le coin de la fenêtre ; sur toute sa largeur, moins « En ce moment » quand il est ouvert (un écran large).
    const panneauOuvert=await page.evaluate(()=>{const p=document.getElementById('en-ce-moment');return p.offsetParent!==null?Math.round(p.getBoundingClientRect().width):0;});
    assert.deepEqual(plein.toile.slice(0,3),[0,0,largeur-panneauOuvert],V+'la toile part du coin de la fenêtre et prend toute la largeur libre');
    assert.equal(panneauOuvert>0,!etroit,V+'« En ce moment » garde son état');
    assert.ok(plein.toile[3]>avantPlein.toile[3]+80&&plein.temps&&plein.lecteur,V+'et plus de hauteur ('+avantPlein.toile[3]+' → '+plein.toile[3]+' px) ; la barre du temps et le lecteur restent');
    cadrage(await dessinee(),V+'en plein écran');
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.body.classList.contains('direct-plein')&&Sim.direct.etatVue().ecran.h===document.getElementById('direct-toile').clientHeight);
    assert.deepEqual(await places(),avantPlein,V+'Échap : le menu et l’en-tête reviennent, la toile reprend sa place');
    assert.equal(await page.evaluate(()=>document.activeElement&&document.activeElement.id),'direct-plein',V+'le bouton garde le clavier');
    cadrage(await dessinee(),V+'après le plein écran');
    // Les étiquettes : le nom seul, en petit — sauf le goulot du moment ; elles couvrent moins de 15 % de la toile.
    const zoneGoulot=e0.goulot&&e0.goulot.zone;
    assert.ok(zoneGoulot,V+'la journée s’ouvre sur un goulot');
    for(const l of e0.etiquettes){
      if(l.id===zoneGoulot)assert.ok(!l.compacte&&chiffres(l)&&l.ton==='critique',V+'le goulot du moment dit sa phrase et ses chiffres : '+l.lignes.join(' | '));
      else assert.ok(l.compacte&&l.lignes.length===0&&l.h<=20,V+l.titre+' : le nom seul, en petit');
    }
    assert.ok(e0.vols.length<=6,V+'six vols étiquetés au plus ('+e0.vols.length+')');
    const part0=couverture(e0);
    assert.ok(part0<0.15,V+'à l’ouverture, les étiquettes couvrent moins de 15 % de la toile ('+pourcent(part0)+')');
    assert.deepEqual(e0.recouvrements,[],V+'aucune étiquette n’en recouvre une autre');
    await capturer('1-ouverture');

    // 2. Après « Tout voir », après un changement de taille de fenêtre : le site cadré remplit encore la toile.
    await page.locator('#direct-cmd [data-direct-cmd=plus]').click();await page.locator('#direct-cmd [data-direct-cmd=droite]').click();
    await page.waitForFunction(()=>!Sim.direct.etatVue().ajustee);
    await page.locator('#direct-cmd [data-direct-cmd=tout]').click();
    await page.waitForFunction(()=>{const e=Sim.direct.etatVue();return e.ajustee&&!e.enMouvement&&e.camera.cap===45;});
    cadrage(await dessinee(),V+'après « Tout voir »');
    const autre=etroit?[1280,720]:[1600,900];
    await page.setViewportSize({width:autre[0],height:autre[1]});
    await page.waitForFunction(w=>{const c=document.getElementById('direct-toile'),e=Sim.direct.etatVue();return window.innerWidth===w&&e.ecran.w===c.clientWidth&&e.ecran.h===c.clientHeight;},autre[0]);
    const partsAutre=cadrage(await dessinee(),V+'après un changement de taille ('+autre.join(' × ')+')');
    await page.setViewportSize({width:largeur,height:hauteur});
    await page.waitForFunction(w=>{const c=document.getElementById('direct-toile'),e=Sim.direct.etatVue();return window.innerWidth===w&&e.ecran.w===c.clientWidth&&e.ecran.h===c.clientHeight;},largeur);
    cadrage(await dessinee(),V+'revenu à sa taille');

    // 3. Au survol d'un service, son étiquette dit ses chiffres ; le pointeur parti, elle redevient son nom.
    const cible=await page.evaluate(g=>{const v=Sim.direct,e=v.etatVue(),c=document.getElementById('direct-toile'),cmd=document.getElementById('direct-cmd').getBoundingClientRect(),b=c.getBoundingClientRect();
      const et=OrlyDirectEtat.etatA(v.journee,v.t),libres=v.site.zones.filter(z=>z.id!==g).map(z=>{const p=v.ecranDe(z.x+z.w/2,z.y+z.h/2,0),n=z.services.reduce((s,id)=>{const x=et.services[id]||{auTravail:0,presents:0};return [s[0]+x.auTravail,s[1]+x.presents];},[0,0]);
        return {id:z.id,service:z.services[0],x:z.x+z.w/2,y:z.y+z.h/2,X:p[0],Y:p[1],attendu:n[0]+' au travail / '+n[1]+(n[1]>1?' présents':' présent'),presents:n[1]};})
        .filter(q=>q.X>30&&q.Y>30&&q.X<e.ecran.w-30&&q.Y<e.ecran.h-30&&!(b.left+q.X>cmd.left-10&&b.top+q.Y>cmd.top-10));
      return libres.sort((a,b)=>b.presents-a.presents)[0];},zoneGoulot);
    assert.ok(cible,V+'une zone à survoler');
    const ou=await surLaToile(cible.x,cible.y);
    await page.mouse.move(ou.x,ou.y);
    await page.waitForFunction(id=>{const s=Sim.direct.etatVue().survol;return !!s&&s.zone===id;},cible.id);
    const survole=await dessinee(),lSurvol=survole.etiquettes.find(l=>l.id===cible.id);
    assert.equal(chiffres(lSurvol),cible.attendu,V+'au survol, « n au travail / n présents » — ceux de la journée à cette heure');
    assert.ok(!lSurvol.compacte,V+'l’étiquette survolée est à sa taille');
    assert.deepEqual(survole.etiquettes.filter(l=>!l.compacte).map(l=>l.id).sort(),[cible.id,zoneGoulot].sort(),V+'seules la zone survolée et le goulot disent leurs chiffres');
    assert.deepEqual(survole.recouvrements,[],V+'au survol, aucune étiquette n’en recouvre une autre');
    await capturer('2-survol');
    await page.mouse.move(2,2);
    await page.waitForFunction(()=>!Sim.direct.etatVue().survol);
    assert.ok((await dessinee()).etiquettes.find(l=>l.id===cible.id).compacte,V+'le pointeur parti, le nom seul');

    // 4. Sur le service choisi : ses chiffres restent, sans survol ; « En ce moment » s'ouvre pour dire son détail.
    await page.mouse.click(ou.x,ou.y);
    await page.waitForFunction(s=>Sim.direct.etatVue().selection===s&&!!document.querySelector('#direct-panneau-corps .dp-detail'),cible.service);
    await page.mouse.move(2,2);
    await page.waitForFunction(()=>!Sim.direct.etatVue().survol);
    const choisi=await dessinee();
    assert.equal(chiffres(choisi.etiquettes.find(l=>l.id===cible.id)),cible.attendu,V+'le service choisi garde ses chiffres');
    const p4=await replie();
    assert.deepEqual([p4.replie,p4.panneau,p4.choix],[false,true,null],V+'le panneau s’ouvre pour le service choisi, sans rien retenir');
    cadrage(choisi,V+'le panneau ouvert');
    await page.locator('#direct-panneau-corps [data-direct-retour]').click();
    await page.waitForFunction(()=>!Sim.direct.etatVue().selection);

    // 5. Les vols : ceux qu'on charge ou qui partent dans l'heure, six au plus — à chaque heure de la journée ; un autre, au survol.
    const bornes=await page.evaluate(()=>({de:Sim.vue.debut,a:Sim.vue.fin}));
    let etiquetes=0,survolable=null;
    for(let t=Math.ceil(bornes.de/60)*60;t<=bornes.a;t+=60){
      const e=await aLHeure(t),attendus=await page.evaluate(()=>{const v=Sim.direct;return OrlyDirectScene.volsEtiquetes(v.circule.avions,v.circule.vehicules,v.t);});
      assert.deepEqual(e.vols.map(q=>q.vol).sort(),attendus.slice().sort(),V+'à '+t+' : les vols étiquetés');
      assert.ok(e.vols.length<=6,V+'à '+t+' : six au plus');
      const enCharge=new Set(e.circule.vehicules.filter(q=>q.phase!=='retour').flatMap(q=>q.vols));
      for(const q of e.vols){const a=e.circule.avions.find(o=>o.id===q.vol);assert.ok(a&&(enCharge.has(a.id)||(a.depart>=t&&a.depart-t<=60)),V+'à '+t+' : '+q.vol+' est chargé ou part dans l’heure');}
      assert.deepEqual(e.recouvrements,[],V+'à '+t);
      etiquetes+=e.vols.length;
      const sans=e.circule.avions.find(a=>!(a.decolle>0)&&!attendus.includes(a.id));
      if(sans&&!survolable)survolable={t,id:sans.id,x:sans.x,y:sans.y};
    }
    assert.ok(etiquetes>=5&&survolable,V+'des vols étiquetés dans la journée ('+etiquetes+'), et un avion sans étiquette');
    await aLHeure(survolable.t);
    const ouAvion=await surLaToile(survolable.x,survolable.y,0.6);
    await page.mouse.move(ouAvion.x,ouAvion.y);
    await page.waitForFunction(id=>{const s=Sim.direct.etatVue().survol;return !!s&&s.vol===id;},survolable.id);
    assert.ok((await dessinee()).vols.some(q=>q.vol===survolable.id),V+'au survol de son avion, un vol dit son numéro et son heure');
    await page.mouse.move(2,2);
    await page.waitForFunction(()=>!Sim.direct.etatVue().survol);

    // 6. Le bouton ouvre « En ce moment », et le choix est retenu : la page rechargée le garde ; replié, de même.
    const avantClic=await replie();
    await page.locator('#btn-en-ce-moment').click();
    await page.waitForFunction(o=>document.body.classList.contains('sans-en-ce-moment')!==o,avantClic.replie);
    const apresClic=await replie();
    assert.deepEqual([apresClic.replie,apresClic.choix],[!avantClic.replie,avantClic.replie?'ouvert':'replie'],V+'le bouton retient le choix');
    if(apresClic.replie){await page.locator('#btn-en-ce-moment').click();await page.waitForFunction(()=>!document.body.classList.contains('sans-en-ce-moment'));}
    assert.equal((await replie()).choix,'ouvert');
    await page.reload();await page.waitForLoadState('load');
    await nav.aller(page,'j-plan',{relief:true,panneau:false});await prete();
    assert.deepEqual([(await replie()).replie,(await replie()).panneau],[false,true],V+'rechargée, la page garde le panneau ouvert');
    cadrage(await dessinee(),V+'rechargée, le panneau ouvert');

    // 7. Le tableau « Les personnes » : la somme des trois colonnes fait les présents, pour chaque service — à trois
    //    heures, dont une où des chauffeurs du handling sont en route (présents, ni au travail, ni en pause, ni sans travail).
    const route=await page.evaluate(()=>{const v=Sim.direct;
      for(let t=Math.ceil(Sim.vue.debut/15)*15;t<=Sim.vue.fin;t+=15){
        if(!OrlyDirectEtat.vehiculesA(v.journee.r,t).length)continue;
        const e=OrlyDirectEtat.etatA(v.journee,t);
        for(const [id,x] of Object.entries(e.services))if(x.presents>0&&!x.auTravail&&!x.sansTravail&&!x.enPause)return {t,service:id,presents:x.presents};
      }
      return null;});
    assert.ok(route,V+'une heure où des personnes présentes sont sur la route');
    const lire=()=>page.evaluate(()=>{const c=document.getElementById('direct-panneau-corps');
      return {titres:[...c.querySelectorAll('.dq-personnes thead th')].map(th=>th.textContent.trim()),
        lignes:[...c.querySelectorAll('.dq-personnes tbody tr, .dq-personnes tfoot tr')].map(tr=>({id:(tr.querySelector('[data-direct-service]')||{dataset:{directService:'unité'}}).dataset.directService,
          n:Object.fromEntries([...tr.querySelectorAll('td[data-etat]')].map(td=>[td.dataset.etat,+td.textContent]))}))};});
    for(const t of [e0.t,route.t,bornes.a-120]){
      await aLHeure(t);
      await page.waitForFunction(h=>(document.querySelector('#direct-panneau-corps .dq-question[data-question="1"] h3 small')||{}).textContent==='à '+h,await page.evaluate(t=>MoteurProduction.hhmm(t),t));
      const tableau=await lire(),module=await page.evaluate(()=>{const e=OrlyDirectEtat.etatA(Sim.direct.journee,Sim.direct.etatVue().t);return Object.fromEntries(Object.entries(e.services).map(([id,x])=>[id,x.presents]));});
      assert.deepEqual(tableau.titres,['Service','Au travail','En pause, en appui ou en chemin','Sans travail','Présents'],V+'les colonnes, avec les mots de la légende');
      assert.ok(tableau.lignes.length>=16,V+'une ligne par service, et l’unité ('+tableau.lignes.length+')');
      for(const l of tableau.lignes){
        assert.equal(l.n.auTravail+l.n.ailleurs+l.n.sansTravail,l.n.presents,V+'à '+t+', '+l.id+' : la somme des trois colonnes fait les présents');
        if(l.id!=='unité')assert.equal(l.n.presents,module[l.id]||0,V+'à '+t+', '+l.id+' : les présents de la journée');
      }
      if(t===route.t){const l=tableau.lignes.find(x=>x.id===route.service);
        assert.deepEqual([l.n.auTravail,l.n.ailleurs,l.n.sansTravail,l.n.presents],[0,route.presents,0,route.presents],V+route.service+', des chauffeurs en route : ils sont « en pause, en appui ou en chemin »');
        await capturer('3-personnes');}
    }
    // Le détail d'un service dit ses personnes avec les mêmes mots, et tombe juste aussi.
    await page.locator(`#direct-panneau-corps .dq-personnes [data-direct-service="${route.service}"]`).click();
    await page.waitForFunction(()=>!!document.querySelector('#direct-panneau-corps .dp-detail .dp-etats'));
    const mots=await page.locator('#direct-panneau-corps .dp-detail .dp-etats').innerText(),n=/^(\d+) au travail · (\d+) en pause, en appui ou en chemin · (\d+) sans travail — (\d+) présents?$/.exec(mots.trim());
    assert.ok(n&&+n[1]+ +n[2]+ +n[3]===+n[4],V+'le détail du service : '+mots);
    await page.locator('#direct-panneau-corps [data-direct-retour]').click();

    // 8. Replié par son bouton, le choix est retenu aussi.
    await page.locator('#btn-en-ce-moment').click();
    await page.waitForFunction(()=>document.body.classList.contains('sans-en-ce-moment'));
    await page.reload();await page.waitForLoadState('load');
    await nav.aller(page,'j-plan',{relief:true,panneau:false});await prete();
    assert.deepEqual([(await replie()).replie,(await replie()).choix],[true,'replie'],V+'rechargée, la page garde le panneau replié');
    mesures.push(V+'le site cadré prend '+pourcent(parts0.largeur)+' de la largeur de la toile et '+pourcent(parts0.hauteur)+' de sa hauteur (à '+autre.join(' × ')+' : '+pourcent(partsAutre.largeur)+' et '+pourcent(partsAutre.hauteur)+') ; les étiquettes en couvrent '+pourcent(part0));
    assert.deepEqual(errors,[],V+errors.join(' | '));
   }finally{ch.effacer();await ctx.close();}
  }
  assert.equal(faites.length,6);
  console.log('direct-portable-browser : ok — '+mesures.join(' ; ')+' ; le titre et « En relief / À plat » sur une ligne, la légende dans un coin de la toile, repliable ; « Plein écran » puis Échap ; « En ce moment » replié sous 1 500 px, son choix retenu ; les chiffres au survol et sur le service choisi ; six vols étiquetés au plus ; la somme des colonnes des personnes égale aux présents, des chauffeurs en route compris ; '+faites.length+' captures dans '+dossier);
 }catch(e){console.error(e);process.exitCode=1;}finally{site.effacer();await browser.close();}
})();

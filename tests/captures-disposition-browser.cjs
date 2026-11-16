/* Évolution 20 (e) — les captures de contrôle de la disposition du site, dans
 * la vue en direct, sur l'unité et les vols fictifs (tests/plan-rejoue-fictif.cjs),
 * en thème clair et sombre, à 1 366 × 768 et 1 920 × 1 080 :
 *   — la disposition automatique (les deux bandes, sans aucun réglage) ;
 *   — une disposition de quatre colonnes et deux rangées du bas ;
 *   — le panneau « Disposer les zones » ouvert ;
 *   — une zone partagée (deux services dans la même zone) ;
 *   — une zone avec rayonnages et tables.
 * Chaque capture est vérifiée (sa taille, ce qu'elle doit montrer, la page qui
 * tient sur la largeur) et gardée hors du dépôt : dans $ORY_CAPTURES s'il est
 * donné, sinon dans un dossier temporaire, dit à la fin.
 * La non-régression, dans la page : ces réglages ne changent aucun calcul. Le
 * résultat, les indicateurs de charge, les réponses et l'export de la journée
 * sont les mêmes, octet pour octet, sans réglage, avec tous, et une fois
 * retirés ; une sauvegarde d'avant (sans eux) donne le site automatique.
 * Chaque étape attend son effet, pas un délai. Aucune donnée de l'unité : tout
 * est fictif. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {siteSansPlan}=require('./plan-fictif.cjs');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const sauvegarde=F.sauvegardeFictive(),CSV=F.volsCsv(),attendu=F.heureDOuvertureAttendue(sauvegarde,CSV);
const dossier=process.env.ORY_CAPTURES?path.resolve(process.env.ORY_CAPTURES):fs.mkdtempSync(path.join(os.tmpdir(),'ory-captures-20-'));
fs.mkdirSync(dossier,{recursive:true});
/** La largeur et la hauteur d'un PNG, lues dans son en-tête (IHDR). */
const taillePng=f=>{const b=fs.readFileSync(f);assert.equal(b.toString('latin1',1,4),'PNG',f);return [b.readUInt32BE(16),b.readUInt32BE(20)];};
const MARGE=24;
/** Quatre colonnes, de gauche à droite ; deux rangées du bas : la plonge sous les deux premières colonnes, le quai sous toutes. */
const DISPOSITION={colonnes:[['magasin','decontam'],['cuisine','dotation'],['food'],['armement']],rangees:[{zone:'plonge',de:1,a:2},{zone:'quais',de:1,a:4}]};
const REGLAGES=['partages','disposition','attentes','rayonnages'];

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const site=siteSansPlan(),faites=[];
 try{
  for(const theme of ['clair','sombre'])for(const [largeur,hauteur] of [[1366,768],[1920,1080]]){
   const V=theme+', '+largeur+' × '+hauteur+' : ';
   const ctx=await browser.newContext({viewport:{width:largeur,height:hauteur},deviceScaleFactor:1,colorScheme:theme==='sombre'?'dark':'light',reducedMotion:'no-preference',acceptDownloads:true});
   const page=await ctx.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   const ch=await F.charger(page,nav,site.url('index.html'),{sauvegarde,csv:CSV,pageId:'j-plan',relief:true});
   const etat=()=>page.evaluate(()=>Sim.direct.etatVue());
   const dessinee=async()=>{await page.waitForFunction(()=>!Sim.direct.etatVue().enMouvement);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));return etat();};
   const aLHeure=async t=>{await page.evaluate(t=>{Sim.vue.pause();Sim.vue.allerA(t);},t);await page.waitForFunction(t=>Math.abs(Sim.direct.etatVue().t-t)<1e-9,t);return dessinee();};
   const bouton=async nom=>{await page.locator(`#direct-cmd [data-direct-cmd=${nom}]`).click();return dessinee();};
   /** Le site que la vue dessine : ses zones, ses allées, ce qu'il dit des réglages. */
   const siteVu=()=>page.evaluate(()=>{const s=Sim.direct.site;return {zones:s.zones.map(z=>({id:z.id,nom:z.nom,services:z.services,x:z.x,y:z.y,w:z.w,h:z.h,bande:z.bande,rayonnages:(z.rayonnages||[]).length,auFond:z.rayonnagesAuFond===true})),
     allees:(s.allees||[]).length,avions:s.avions,attentes:s.attentes||null,notes:(s.notes||[]).length,largeur:s.largeur,profondeur:s.profondeur};});
   /** Attend que la vue dessine le site des réglages du moment, puis le rend. */
   const siteRegle=async()=>{await page.waitForFunction(()=>JSON.stringify(Sim.direct.site)===JSON.stringify(Sim.ateliers.site(Sim.reglages.etat.regime)));await dessinee();return siteVu();};
   /** La scène tient entière dans la toile, à la marge du cadrage. */
   const tient=(e,mot)=>{const v={x0:e.ecran.gauche,y0:e.ecran.haut,x1:e.ecran.w-e.ecran.droite,y1:e.ecran.h-e.ecran.bas},b=e.emprise,M=e.marge;
     assert.ok(M>0&&M<=MARGE&&e.tient&&b.x0>=v.x0+M-0.6&&b.y0>=v.y0+M-0.6&&b.x1<=v.x1-M+0.6&&b.y1<=v.y1-M+0.6,mot+' : la scène tient entière, à sa marge des bords');};
   /** La page tient sur la largeur : pas de défilement horizontal. */
   const surLaLargeur=async mot=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),mot+' : la page tient sur la largeur');
   const capturer=async nom=>{const f=path.join(dossier,'20-'+theme+'-'+largeur+'-'+nom+'.png');await surLaLargeur(V+nom);await page.screenshot({path:f});
     assert.deepEqual(taillePng(f),[largeur,hauteur],V+nom+' : la taille de la capture');
     assert.ok(fs.statSync(f).size>20000,V+nom+' : une capture qui montre quelque chose');faites.push(f);};
   /** Ouvre ou replie « En ce moment », à côté de la scène ; la toile change de taille, la scène se recadre. */
   const enCeMoment=async ouvert=>{
     if(await page.evaluate(()=>!document.body.classList.contains('sans-en-ce-moment'))!==ouvert)await page.locator('#btn-en-ce-moment').click();
     await page.waitForFunction(o=>!document.body.classList.contains('sans-en-ce-moment')===o,ouvert);
     await page.waitForFunction(()=>{const e=Sim.direct.etatVue(),c=document.getElementById('direct-toile');return !e.enMouvement&&e.ecran.w===c.clientWidth&&e.ecran.h===c.clientHeight;});
     return dessinee();};
   /** Sous 1 500 px de large, « En ce moment » est replié à l'ouverture de la page : les captures de la scène le montrent ainsi. */
   const portable=largeur<1500;
   /** Replie ou déplie la légende (repliée, elle ne cache rien d'une zone vue de près). */
   const legende=async ouverte=>{
     if(await page.evaluate(()=>document.getElementById('direct-coin').open)!==ouverte)await page.locator('#direct-coin > summary').click();
     await page.waitForFunction(o=>document.getElementById('direct-coin').open===o,ouverte);};
   /** Cadre la scène sur un service : choisi à côté de la scène, puis « Cadrer » (sur un portable, « En ce moment » replié ensuite) ; la légende repliée. */
   const cadrerSur=async service=>{
     await legende(false);
     await enCeMoment(true);
     await page.locator(`#direct-panneau-corps .dq-personnes [data-direct-service="${service}"]`).click();
     await page.waitForFunction(s=>Sim.direct.etatVue().selection===s&&!!document.querySelector(`#direct-panneau-corps .dp-detail[data-service="${s}"]`),service);
     if(portable)await enCeMoment(false);
     return bouton('cadrer');};
   const decadrer=async()=>{await enCeMoment(true);await page.locator('#direct-panneau-corps [data-direct-retour]').click();await page.waitForFunction(()=>!Sim.direct.etatVue().selection);
     if(portable)await enCeMoment(false);await legende(true);return bouton('tout');};
   /** La légende, dans son coin : visible, et sans passer sur la barre de la scène. */
   const legendeEtBarre=async mot=>{const [leg,cmd]=await Promise.all([page.locator('#direct-coin').boundingBox(),page.locator('#direct-cmd').boundingBox()]);
     assert.ok(leg&&cmd,mot+' : la légende et la barre sont là');
     assert.ok(leg.x+leg.width<=cmd.x+0.5||leg.y+leg.height<=cmd.y+0.5||cmd.y+cmd.height<=leg.y+0.5,mot+' : la légende ne passe pas sur la barre');};
   /** La zone d'un service est à l'écran, entière. */
   const zoneALEcran=async(id,mot)=>{const b=await page.evaluate(id=>{const v=Sim.direct,z=v.site.zones.find(q=>q.id===id),e=v.etatVue(),c=[[z.x,z.y],[z.x+z.w,z.y],[z.x,z.y+z.h],[z.x+z.w,z.y+z.h]].map(p=>v.ecranDe(p[0],p[1],0));
       return {coins:c,w:e.ecran.w,h:e.ecran.h};},id);
     for(const [x,y] of b.coins)assert.ok(x>=-1&&y>=-1&&x<=b.w+1&&y<=b.h+1,mot+' : la zone est entière à l’écran ('+Math.round(x)+', '+Math.round(y)+')');};
   /** La journée, telle que la page la tient : le résultat, les indicateurs de charge, les réponses. */
   const journee=()=>page.evaluate(()=>{const at=Sim.ateliers,r=at.resultat;return {resultat:JSON.stringify(r),indicateurs:JSON.stringify(OrlyIndicateurs.journee(r,at.args||{})),reponses:JSON.stringify(Sim.reponses())};});
   /** L'export de la journée (le fichier que la page enregistre), depuis la Synthèse ; puis retour à la vue en direct. */
   const exporter=async()=>{await nav.aller(page,'j-chiffres');const attente=page.waitForEvent('download');await page.locator('#btn-export').click();
     const texte=fs.readFileSync(await (await attente).path(),'utf8');
     for(const x of await page.locator('.notif-fermer').all())await x.click();
     await page.waitForFunction(()=>!document.querySelector('.notif-fermer'));
     await nav.aller(page,'j-plan',{relief:true});await dessinee();return texte;};
   /** Un réglage fait par la page (les gestes eux-mêmes ont leurs tests) ; le message « Annuler » se ferme : il ne reste pas sur la capture. */
   const regler=async(f,arg)=>{await page.evaluate(f,arg);for(const x of await page.locator('.notif-fermer').all())await x.click();await page.waitForFunction(()=>!document.querySelector('.notif-fermer'));return siteRegle();};
   const reglages=()=>page.evaluate(k=>Object.fromEntries(k.map(c=>[c,Sim.ateliers.state[c]??null])),REGLAGES);
   try{
    await page.waitForFunction(()=>window.Sim&&Sim.direct&&Sim.directTemps&&Sim.directPanneau&&Sim.disposer&&Sim.direct.etatVue().images>0&&Sim.direct.etatVue().circule);
    const clair=(await etat()).couleurs.fond;
    await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);
    if(theme==='sombre')await page.waitForFunction(c=>{const k=Sim.direct.etatVue().couleurs;return !!k&&k.fond!==c;},clair);
    const fond=await page.evaluate(()=>getComputedStyle(document.body).backgroundColor);
    assert.ok(theme==='sombre'?/^rgb\((\d+), (\d+), (\d+)\)$/.exec(fond).slice(1).every(n=>+n<60):fond==='rgb(255, 255, 255)'||/^rgb\(2[0-9]{2}, 2[0-9]{2}, 2[0-9]{2}\)$/.test(fond),V+'le thème : '+fond);
    // Les effectifs calculés se posent au premier changement : la journée de référence est celle d'un changement neutre.
    await page.evaluate(()=>Sim.ateliers.changer(()=>{},''));
    for(const x of await page.locator('.notif-fermer').all())await x.click();
    await aLHeure(attendu.pic);
    const avant=await journee(),exportAvant=await exporter();

    // 1. La disposition automatique : une sauvegarde d'avant, aucun réglage — les deux bandes de part et d'autre du couloir.
    assert.deepEqual(await reglages(),{partages:null,disposition:null,attentes:null,rayonnages:null},V+'une sauvegarde d’avant : aucun réglage');
    const s1=await siteRegle(),auto=JSON.stringify(s1);
    assert.deepEqual([s1.allees,s1.attentes,s1.notes,s1.avions],[0,null,0,'droite'],V+'le site automatique');
    assert.deepEqual(s1.zones.map(z=>z.id),['decontam','cuisine','food','plonge','dotation','magasin','armement','quais']);
    assert.deepEqual([...new Set(s1.zones.map(z=>z.bande))].sort(),[0,1],V+'deux bandes');
    assert.deepEqual(s1.zones.filter(z=>z.rayonnages).map(z=>z.id),['magasin'],V+'seul le magasin a des rayonnages');
    await enCeMoment(!portable);
    const e1=await bouton('tout');
    await legendeEtBarre(V+'la disposition automatique');
    tient(e1,V+'la disposition automatique');assert.deepEqual(e1.recouvrements,[],V+'aucune étiquette n’en recouvre une autre');
    assert.ok(e1.personnes.length>0&&e1.circule.chariots.length>0,V+'des personnes et des chariots');
    await capturer('1-automatique');

    // 2. Quatre colonnes et deux rangées du bas : chaque zone là où la disposition la met, des allées entre elles.
    const s2=await regler(d=>{Sim.ateliers.regleDisposition(d,'');},DISPOSITION);
    assert.deepEqual((await reglages()).disposition,DISPOSITION,V+'la disposition est gardée');
    assert.equal(s2.notes,0,V+'rien à signaler');
    assert.ok(s2.allees>=7,V+'des allées : une en haut, une par colonne, une par rangée ('+s2.allees+')');
    const z2=id=>s2.zones.find(z=>z.id===id),gauche=id=>z2(id).x;
    assert.ok(gauche('magasin')<gauche('cuisine')&&gauche('cuisine')<gauche('food')&&gauche('food')<gauche('armement'),V+'les quatre colonnes, de gauche à droite');
    assert.ok(Math.abs(gauche('magasin')-gauche('decontam'))<1e-6&&z2('magasin').y<z2('decontam').y,V+'dans une colonne, de haut en bas');
    assert.ok(Math.abs(gauche('cuisine')-gauche('dotation'))<1e-6&&z2('cuisine').y<z2('dotation').y);
    // Les rangées du bas : la plonge sous les deux premières colonnes, le quai sous toutes, tout en bas.
    assert.ok(z2('plonge').y>z2('decontam').y&&z2('plonge').y>z2('dotation').y&&z2('plonge').x+z2('plonge').w<=gauche('food')+1e-6,V+'la plonge sous les deux premières colonnes');
    assert.ok(z2('quais').y>z2('plonge').y&&Math.abs(z2('quais').y+z2('quais').h-s2.profondeur)<1e-6&&Math.abs(z2('quais').w-s2.largeur)<1e-6,V+'le quai en bas, sur toute la largeur');
    assert.equal(s2.avions,'bas',V+'les avions le long du quai');
    // Les tailles viennent toujours des parts : chaque zone garde sa surface.
    for(const z of s2.zones){const a=s1.zones.find(q=>q.id===z.id);assert.ok(Math.abs(z.w*z.h-a.w*a.h)<1e-6*a.w*a.h+1e-6,V+z.id+' garde sa surface');}
    const e2=await bouton('tout');
    tient(e2,V+'la disposition réglée');assert.deepEqual(e2.recouvrements,[],V+'aucune étiquette n’en recouvre une autre');
    await capturer('2-quatre-colonnes-deux-rangees');

    // 3. Le panneau « Disposer les zones », ouvert à côté de la scène : ses quatre colonnes, ses deux rangées.
    await page.locator('#direct-disposer-btn').click();
    await page.waitForFunction(()=>document.body.classList.contains('direct-dispose')&&document.getElementById('direct-disposer').offsetParent!==null);
    const panneau=page.locator('#direct-disposer');
    assert.equal(await panneau.locator('.dd-colonne').count(),4,V+'les quatre colonnes du panneau');
    assert.deepEqual(await panneau.locator('.dd-colonne').evaluateAll(l=>l.map(c=>[...c.querySelectorAll('li.dd-zone')].map(z=>z.dataset.ddZone))),DISPOSITION.colonnes,V+'chaque colonne, ses zones de haut en bas');
    assert.deepEqual(await panneau.locator('.dd-rangees li.dd-zone').evaluateAll(l=>l.map(z=>z.dataset.ddZone)),['plonge','quais'],V+'les deux rangées du bas');
    assert.equal(await page.locator('#dd-pastille').isVisible(),false,V+'rien à signaler : pas de nombre sur le bouton');
    // Le panneau tient dans la page. Sur un portable, la toile est étroite : la légende laisse la place au site qu'on
    // dispose ; sur un grand écran elle reste dans son coin, sans passer sur la barre.
    const bp=await panneau.boundingBox();
    assert.ok(bp.x>=0&&bp.x+bp.width<=largeur+0.5&&bp.width>=260,V+'le panneau est dans la page');
    const toile=await page.evaluate(()=>document.getElementById('direct-toile').clientWidth);
    if(toile<=980)assert.equal(await page.locator('#direct-coin').isVisible(),false,V+'toile étroite ('+toile+' px) : pas de légende sur le site qu’on dispose');
    else await legendeEtBarre(V+'le panneau ouvert');
    const e3=await bouton('tout');
    tient(e3,V+'le panneau ouvert');
    await capturer('3-panneau-disposer-les-zones');
    await page.locator('#dd-fermer').click();
    await page.waitForFunction(()=>!document.body.classList.contains('direct-dispose'));
    assert.equal(await page.locator('#direct-coin').isVisible(),true,V+'le panneau fermé : la légende revient');
    await enCeMoment(!portable);
    await regler(()=>{Sim.ateliers.regleDisposition(null,'');});
    assert.equal(JSON.stringify(await siteRegle()),auto,V+'« Revenir à la disposition automatique » : le site d’avant');

    // 4. Une zone partagée : la dotation dans la zone de la cuisine — une seule zone, au nom de la cuisine, leurs équipes ensemble.
    const s4=await regler(()=>{Sim.ateliers.reglePartage('dotation','cuisine');});
    assert.equal(s4.zones.length,s1.zones.length-1,V+'une zone de moins');
    const c4=s4.zones.find(z=>z.id==='cuisine');
    assert.deepEqual([c4.services,c4.nom],[['cuisine','dotation'],s1.zones.find(z=>z.id==='cuisine').nom],V+'les deux services dans la zone de la cuisine, qui garde son nom');
    const p4=s=>s.zones.find(z=>z.id==='cuisine'),part=(s,id)=>{const z=s.zones.find(q=>q.id===id);return z.w*z.h;};
    assert.ok(Math.abs(part(s4,'cuisine')-part(s1,'cuisine')-part(s1,'dotation'))<1e-6*part(s4,'cuisine'),V+'leurs parts de surface s’additionnent');
    const ilots4=await page.evaluate(()=>Sim.direct.ilots.filter(i=>i.zone==='cuisine').map(i=>i.service));
    assert.ok(ilots4.includes('cuisine')&&ilots4.includes('dotation'),V+'les îlots des deux services dans la zone');
    await cadrerSur('cuisine');
    await zoneALEcran('cuisine',V+'la zone partagée');
    await capturer('4-zone-partagee');
    await decadrer();
    await regler(()=>{Sim.ateliers.reglePartage('dotation',null);});

    // 5. Une zone avec rayonnages et tables : la cuisine — les rayonnages au fond, les tables de ses équipes devant.
    const s5=await regler(()=>{Sim.ateliers.regleRayonnages('cuisine',true);});
    const c5=s5.zones.find(z=>z.id==='cuisine');
    assert.ok(c5.rayonnages>0&&c5.auFond,V+'des rayonnages au fond de la cuisine');
    const d5=await page.evaluate(()=>{const v=Sim.direct,z=v.site.zones.find(q=>q.id==='cuisine'),o=v.decor.objets.filter(q=>q.zone==='cuisine'),r=o.filter(q=>q.quoi==='rayonnage'),t=o.filter(q=>q.quoi==='table');
      const touche=(p,q)=>p.x<q.x+q.w-1e-6&&q.x<p.x+p.w-1e-6&&p.y<q.y+q.d-1e-6&&q.y<p.y+p.d-1e-6,fond=m=>(z.bande===0?m.y-z.y:z.y+z.h-(m.y+m.d));
      return {rayonnages:r.length,tables:t.length,chevauchements:t.filter(a=>r.some(b=>touche(a,b))).length,devant:t.every(a=>fond(a)>=Math.max(...r.map(b=>fond(b)+b.d))-1e-6)};});
    assert.equal(d5.rayonnages,c5.rayonnages,V+'toutes les rangées sont dessinées');
    assert.ok(d5.tables>0&&d5.chevauchements===0&&d5.devant,V+'les tables sont dessinées devant les rayonnages, sans chevauchement ('+JSON.stringify(d5)+')');
    await cadrerSur('cuisine');
    await zoneALEcran('cuisine',V+'la zone aux rayonnages');
    await capturer('5-rayonnages-et-tables');
    await decadrer();

    // 6. Non-régression : tous les réglages à la fois — la disposition, la zone partagée, la zone d'attente du
    //    chargement, les rayonnages. Le résultat, les indicateurs, les réponses et l'export : les mêmes, octet pour octet.
    const s6=await regler(d=>{Sim.ateliers.regleDisposition(d,'');Sim.ateliers.reglePartage('dotation','cuisine');Sim.ateliers.changer(()=>Sim.ateliers.regleAttente('quais','cuisine'),'');Sim.ateliers.regleRayonnages('armement',true);},
      {colonnes:[['magasin','decontam'],['cuisine'],['food'],['armement']],rangees:DISPOSITION.rangees});
    assert.deepEqual([s6.allees>0,s6.attentes,s6.notes,s6.zones.length,s6.zones.filter(z=>z.auFond).map(z=>z.id).sort()],[true,{quais:'cuisine'},0,7,['armement','cuisine']],V+'les quatre réglages jouent');
    await aLHeure(attendu.pic);
    const tous=await journee(),exportTous=await exporter();
    for(const k of ['resultat','indicateurs','reponses'])assert.equal(tous[k],avant[k],V+k+' : identique avec tous les réglages');
    assert.equal(exportTous,exportAvant,V+'l’export de la journée : identique avec tous les réglages');
    assert.ok(avant.resultat.length>10000&&avant.reponses.length>500,V+'une journée entière comparée');
    // Tout retiré : le site automatique, champ par champ, et la même journée.
    const s7=await regler(()=>{Sim.ateliers.regleDisposition(null,'');Sim.ateliers.reglePartage('dotation',null);Sim.ateliers.changer(()=>Sim.ateliers.regleAttente('quais',''),'');Sim.ateliers.regleRayonnages('cuisine',false);Sim.ateliers.regleRayonnages('armement',false);});
    assert.deepEqual(await reglages(),{partages:null,disposition:null,attentes:null,rayonnages:null},V+'plus aucun réglage');
    assert.equal(JSON.stringify(s7),auto,V+'le site automatique, champ par champ');
    const apres=await journee();
    for(const k of ['resultat','indicateurs','reponses'])assert.equal(apres[k],avant[k],V+k+' : identique une fois les réglages retirés');
    assert.deepEqual(errors,[],V+errors.join(' | '));
   }finally{ch.effacer();await ctx.close();}
  }
  assert.equal(faites.length,20);
  console.log('captures-disposition-browser : ok — '+faites.length+' captures de contrôle de la disposition du site dans '+dossier+' (la disposition automatique ; quatre colonnes et deux rangées du bas ; le panneau « Disposer les zones » ouvert ; une zone partagée ; une zone avec rayonnages et tables ; thème clair et sombre ; 1 366 × 768 et 1 920 × 1 080) ; le résultat, les indicateurs, les réponses et l’export de la journée identiques sans réglage, avec tous, et une fois retirés ; une sauvegarde d’avant donne le site automatique');
 }catch(e){console.error(e);process.exitCode=1;}finally{site.effacer();await browser.close();}
})();

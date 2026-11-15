/* Évolution 16 (g) — les captures de contrôle de la vue en direct, sur l'unité
 * et les vols fictifs (tests/plan-rejoue-fictif.cjs), en thème clair et sombre,
 * à 1 280 et 1 920 px de large :
 *   — à l'ouverture (l'heure où le premier goulot commence à coincer) ;
 *   — pendant un goulot, cadré sur son service, son détail dans le panneau ;
 *   — en suivant un vol chargé en retard ;
 *   — sous deux autres angles (au pic de travail ; pendant une tournée du
 *     handling).
 * Chaque capture est vérifiée (sa taille, ce qu'elle doit montrer) et gardée
 * hors du dépôt : dans $ORY_CAPTURES s'il est donné, sinon dans un dossier
 * temporaire, dit à la fin. Sous les deux autres angles, les traits qui relient
 * les étiquettes à leur ancre passent sous les cartouches : aucun ne barre une
 * étiquette (un défaut que ces captures ont montré).
 * La non-régression, dans la page : regarder la journée ne la change pas. Le
 * résultat, les indicateurs de charge, les réponses et l'export de la journée
 * sont les mêmes, octet pour octet, avant et après ; « À plat » montre les
 * mêmes données que « En relief », à la même heure. Chaque étape attend son
 * effet, pas un délai. Aucune donnée de l'unité : tout est fictif. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const P=require('../moteur/production.js');
const {siteSansPlan}=require('./plan-fictif.cjs');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const sauvegarde=F.sauvegardeFictive(),CSV=F.volsCsv(),attendu=F.heureDOuvertureAttendue(sauvegarde,CSV);
const dossier=process.env.ORY_CAPTURES?path.resolve(process.env.ORY_CAPTURES):fs.mkdtempSync(path.join(os.tmpdir(),'ory-captures-direct-'));
fs.mkdirSync(dossier,{recursive:true});
/** La largeur et la hauteur d'un PNG, lues dans son en-tête (IHDR). */
const taillePng=f=>{const b=fs.readFileSync(f);assert.equal(b.toString('latin1',1,4),'PNG',f);return [b.readUInt32BE(16),b.readUInt32BE(20)];};
const MARGE=24;
/** Les deux autres angles : le cap et le site de la caméra, l'heure rejouée, ce qu'on doit y voir. */
const ANGLES=[
  {nom:'4-angle-pic',t:attendu.pic,droite:6,haut:0,cap:135,site:35.26,quoi:'personnes'},
  {nom:'5-angle-tournee',droite:12,haut:2,cap:225,site:55.26,quoi:'vehicules'}
];

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const site=siteSansPlan(),faites=[];
 try{
  const G=attendu.goulot,tard=attendu.reponses.exceptions.find(q=>q.type==='vol-en-retard');
  assert.ok(G&&G.fenetres.length&&tard,'la journée fictive a un goulot et un vol chargé en retard');
  const milieu=Math.round((G.fenetres[0].de+G.fenetres[0].a)/2);
  // Une tournée du handling : le milieu de son trajet (lu dans le journal du résultat).
  const tournee=attendu.resultat.lots.find(l=>l.handling&&l.trajet&&l.trajet.retour>l.trajet.depart);
  assert.ok(tournee,'la journée fictive a une tournée du handling');
  ANGLES[1].t=Math.round((tournee.trajet.depart+tournee.trajet.retour)/2);

  for(const theme of ['clair','sombre'])for(const [largeur,hauteur] of [[1280,800],[1920,1080]]){
   const V=theme+', '+largeur+' px : ';
   const ctx=await browser.newContext({viewport:{width:largeur,height:hauteur},deviceScaleFactor:1,colorScheme:theme==='sombre'?'dark':'light',reducedMotion:'no-preference',acceptDownloads:true});
   const page=await ctx.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   const ch=await F.charger(page,nav,site.url('index.html'),{sauvegarde,csv:CSV,pageId:'j-plan',relief:true});
   const etat=()=>page.evaluate(()=>Sim.direct.etatVue());
   const dessinee=async()=>{await page.waitForFunction(()=>!Sim.direct.etatVue().enMouvement);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));return etat();};
   const aLHeure=async t=>{await page.evaluate(t=>{Sim.vue.pause();Sim.vue.allerA(t);},t);await page.waitForFunction(t=>Math.abs(Sim.direct.etatVue().t-t)<1e-9&&Math.abs(Sim.directTemps.etat().t-t)<1e-9,t);return dessinee();};
   const bouton=async(nom,n=1)=>{for(let i=0;i<n;i++)await page.locator(`#direct-cmd [data-direct-cmd=${nom}]`).click();return dessinee();};
   /** La scène tient entière dans la zone visible, à 24 px de ses bords. */
   const tient=(e,mot)=>{const v={x0:e.ecran.gauche,y0:e.ecran.haut,x1:e.ecran.w-e.ecran.droite,y1:e.ecran.h-e.ecran.bas},b=e.emprise;
     assert.ok(e.tient&&b.x0>=v.x0+MARGE-0.6&&b.y0>=v.y0+MARGE-0.6&&b.x1<=v.x1-MARGE+0.6&&b.y1<=v.y1-MARGE+0.6,mot+' : la scène tient entière, à 24 px des bords');};
   const capturer=async nom=>{const f=path.join(dossier,'16-'+theme+'-'+largeur+'-'+nom+'.png');await page.screenshot({path:f});
     assert.deepEqual(taillePng(f),[largeur,hauteur],V+nom+' : la taille de la capture');
     assert.ok(fs.statSync(f).size>20000,V+nom+' : une capture qui montre quelque chose');faites.push(f);};
   /**
    * Les traits des étiquettes passent sous les cartouches : à chaque image, la scène trace tous les traits, puis tous les
    * cartouches. On note ce que la toile reçoit pendant quelques images, et on lit l'ordre. Rend le nombre de traits vus.
    */
   const traitsSousLesCartouches=async mot=>{
     const vu=await page.evaluate(async()=>{
       const v=Sim.direct,ctx=v.toile.getContext('2d'),e=v.etatVue(),poses=[...e.etiquettes,...e.vols,...e.circule.marques],pres=(a,b)=>Math.abs(a-b)<0.01;
       const suite=[],avant={moveTo:ctx.moveTo,roundRect:ctx.roundRect};
       ctx.moveTo=function(x,y){if(poses.some(q=>pres(x,q.x+q.w/2)&&pres(y,q.y+q.h)))suite.push('t');return avant.moveTo.apply(this,arguments);};
       ctx.roundRect=function(x,y){if(poses.some(q=>pres(x,q.x+0.5)&&pres(y,q.y+0.5)))suite.push('c');return avant.roundRect.apply(this,arguments);};
       const images=v.etatVue().images;v.rendre();
       await new Promise(r=>{const f=()=>(v.etatVue().images>=images+2?r():requestAnimationFrame(f));requestAnimationFrame(f);});
       ctx.moveTo=avant.moveTo;ctx.roundRect=avant.roundRect;
       return {suite:suite.join(''),n:poses.length};});
     // Une image : des traits, puis les n cartouches d'un bloc. Un trait après un cartouche de la même image serait un défaut.
     const images=vu.suite.match(/t*c+/g)||[];
     assert.ok(images.length>=2&&images.join('')===vu.suite,mot+' : des images entières ('+vu.suite.length+' tracés)');
     for(const i of images)assert.equal(i.replace(/t/g,'').length,vu.n,mot+' : tous les traits avant tous les cartouches ('+i+')');
     return Math.max(...images.map(i=>i.replace(/c/g,'').length));};
   /** La journée, telle que la page la tient : le résultat, les indicateurs de charge, les réponses. */
   const journee=()=>page.evaluate(()=>{const at=Sim.ateliers,r=at.resultat;return {resultat:JSON.stringify(r),indicateurs:JSON.stringify(OrlyIndicateurs.journee(r,at.args||{})),reponses:JSON.stringify(Sim.reponses())};});
   /** L'export de la journée (le fichier que la page enregistre), depuis la Synthèse ; puis retour à la vue en direct. */
   const exporter=async()=>{await nav.aller(page,'j-chiffres');const attente=page.waitForEvent('download');await page.locator('#btn-export').click();
     const texte=fs.readFileSync(await (await attente).path(),'utf8');
     // Le message « Journée exportée » se ferme : il ne doit pas rester sur les captures.
     for(const x of await page.locator('.notif-fermer').all())await x.click();
     await page.waitForFunction(()=>!document.querySelector('.notif-fermer'));
     await nav.aller(page,'j-plan',{relief:true});await dessinee();return texte;};
   try{
    await page.waitForFunction(()=>window.Sim&&Sim.direct&&Sim.directTemps&&Sim.directPanneau&&Sim.direct.etatVue().images>0&&Sim.direct.etatVue().circule);
    const clair=(await etat()).couleurs.fond;
    await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);
    if(theme==='sombre')await page.waitForFunction(c=>{const k=Sim.direct.etatVue().couleurs;return !!k&&k.fond!==c;},clair);
    const fond=await page.evaluate(()=>getComputedStyle(document.body).backgroundColor);
    assert.ok(theme==='sombre'?/^rgb\((\d+), (\d+), (\d+)\)$/.exec(fond).slice(1).every(n=>+n<60):fond==='rgb(255, 255, 255)'||/^rgb\(2[0-9]{2}, 2[0-9]{2}, 2[0-9]{2}\)$/.test(fond),V+'le thème : '+fond);

    // 1. À l'ouverture : l'heure où le premier goulot commence à coincer ; sa zone critique, la scène entière.
    await page.waitForFunction(t=>Math.abs(Sim.vue.t-t)<1e-6,attendu.t);
    const avant=await journee(),exportAvant=await exporter();
    assert.ok(Math.abs(await page.evaluate(()=>Sim.vue.t)-attendu.t)<1e-6,V+'de retour de la Synthèse : la même heure');
    const e1=await dessinee();
    assert.equal(e1.goulot.service,G.service,V+'le premier goulot du jour');
    assert.equal(e1.teintes[e1.goulot.zone],'critique',V+'sa zone est critique');
    assert.deepEqual([e1.camera.cap,Math.round(e1.camera.site*100)/100,e1.ajustee],[45,35.26,true],V+'l’angle d’ouverture');
    tient(e1,V+'à l’ouverture');assert.deepEqual(e1.recouvrements,[],V+'aucune étiquette n’en recouvre une autre');
    assert.ok(e1.personnes.length>0&&e1.circule.chariots.length>0,V+'des personnes et des chariots');
    assert.equal(await page.evaluate(()=>document.querySelectorAll('#direct-panneau-corps .dq-question').length),5,V+'les cinq réponses à côté de la scène');
    await capturer('1-ouverture');

    // 2. Pendant un goulot : au milieu de sa fenêtre, cadré sur son service, son détail dans le panneau.
    await aLHeure(milieu);
    await page.locator(`#direct-panneau-corps .dq-personnes [data-direct-service="${G.service}"]`).click();
    await page.waitForFunction(s=>!!document.querySelector(`#direct-panneau-corps .dp-detail[data-service="${s}"]`),G.service);
    const e2=await bouton('cadrer');
    assert.equal(e2.selection,G.service,V+'le service du goulot est choisi');
    assert.equal(e2.goulot.service,G.service);assert.equal(e2.teintes[e2.goulot.zone],'critique',V+'pendant le goulot, sa zone est critique');
    assert.equal(e2.ajustee,false,V+'cadré sur le service');
    const etq=e2.etiquettes.find(l=>l.id===e2.goulot.zone);
    assert.ok(etq&&etq.ton==='critique'&&etq.lignes.join(' ').startsWith(G.phrase),V+'son étiquette dit la phrase de la Synthèse');
    assert.ok(etq.x>=0&&etq.y>=0&&etq.x+etq.w<=e2.ecran.w&&etq.y+etq.h<=e2.ecran.h,V+'elle est à l’écran');
    assert.deepEqual(e2.recouvrements,[]);
    await capturer('2-goulot');
    await page.locator('#direct-panneau-corps [data-direct-retour]').click();
    await page.waitForFunction(()=>!document.querySelector('#direct-panneau-corps .dp-detail'));
    const tout=await bouton('tout');tient(tout,V+'« Tout voir »');

    // 3. En suivant un vol chargé en retard : ses lots nets, le reste pâli, sa phrase sur la scène.
    const e3a=await aLHeure(tard.depart+5),avion=e3a.circule.avions.find(a=>a.id===tard.id);
    assert.ok(avion,V+'l’avion du vol en retard est là');
    const b=await page.locator('#direct-toile').boundingBox(),p=await page.evaluate(([x,y])=>Sim.direct.ecranDe(x,y,0.6),[avion.x,avion.y]);
    await page.mouse.click(b.x+p[0],b.y+p[1]);
    await page.waitForFunction(v=>{const s=Sim.direct.etatVue().suivi;return s&&s.vol===v;},tard.id);
    const e3=await dessinee();
    assert.ok(e3.suivi.nets>=1&&e3.suivi.pales>=5,V+'ses lots restent nets ('+e3.suivi.nets+'), le reste pâlit ('+e3.suivi.pales+')');
    const bandeau=page.locator('#direct-suivi');
    assert.ok(await bandeau.isVisible()&&(await bandeau.textContent()).includes(e3.suivi.phrase),V+'la phrase de son retard est sur la scène');
    tient(e3,V+'en suivant un vol');assert.deepEqual(e3.recouvrements,[]);
    await capturer('3-vol-suivi');
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!Sim.direct.etatVue().suivi);

    // 4. Sous deux autres angles : la scène tient encore entière, les étiquettes ne se recouvrent pas.
    for(const a of ANGLES){
     await aLHeure(a.t);await bouton('tout');
     if(a.haut)await bouton('haut',a.haut);
     const e=await bouton('droite',a.droite),mot=V+a.nom;
     assert.deepEqual([e.camera.cap,Math.round(e.camera.site*100)/100,e.ajustee],[a.cap,a.site,true],mot+' : l’angle');
     tient(e,mot);assert.deepEqual(e.recouvrements,[],mot+' : aucune étiquette n’en recouvre une autre');
     assert.ok(await traitsSousLesCartouches(mot)>=3,mot+' : des étiquettes reliées à leur ancre par un trait');
     if(a.quoi==='vehicules')assert.ok(e.circule.vehicules.length>=1,mot+' : un véhicule du handling en tournée');
     else assert.ok(e.personnes.filter(q=>q.etat==='auTravail').length>=10,mot+' : des personnes au travail');
     await capturer(a.nom);
    }
    await bouton('tout');

    // 5. « À plat » montre les mêmes données, à la même heure : les personnes au travail de chaque service.
    const enRelief=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#direct-panneau-corps .dq-personnes [data-direct-service]')].map(x=>[x.dataset.directService,+x.closest('tr').querySelector('td[data-etat="auTravail"]').textContent])));
    const heure=await page.evaluate(()=>Sim.vue.t);
    await page.locator('#direct-choix [data-direct-mode=plat]').click();
    await page.waitForFunction(()=>document.getElementById('direct').offsetParent===null&&document.querySelectorAll('#plan .zone[data-au-travail]').length>0);
    const aPlat=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#plan .zone[data-au-travail]')].map(z=>[z.dataset.id,+z.dataset.auTravail])));
    assert.equal(await page.evaluate(()=>Sim.vue.t),heure,V+'à plat : la même heure');
    assert.ok(Object.keys(aPlat).length>=4,V+'à plat : les services dessinés');
    for(const [id,n] of Object.entries(aPlat))assert.equal(n,enRelief[id],V+'à plat, '+id+' : autant de personnes au travail qu’en relief');
    await page.locator('#direct-choix [data-direct-mode=relief]').click();
    await page.waitForFunction(()=>document.getElementById('direct').offsetParent!==null);

    // 6. Non-régression : regarder la journée ne l'a pas changée. Le résultat, les indicateurs, les réponses, et
    //    l'export à la même heure : les mêmes, octet pour octet.
    await aLHeure(attendu.t);
    const apres=await journee(),exportApres=await exporter();
    for(const k of ['resultat','indicateurs','reponses'])assert.equal(apres[k],avant[k],V+k+' : identique après la vue en direct');
    assert.ok(avant.resultat.length>10000&&avant.reponses.length>500,V+'une journée entière comparée');
    assert.equal(exportApres,exportAvant,V+'l’export de la journée : identique à la même heure');
    assert.equal(JSON.parse(exportAvant).instant,P.hhmm(attendu.t),V+'l’export dit l’heure rejouée');
    assert.deepEqual(errors,[],V+errors.join(' | '));
   }finally{ch.effacer();await ctx.close();}
  }
  assert.equal(faites.length,20);
  console.log('captures-direct-browser : ok — '+faites.length+' captures de contrôle de la vue en direct dans '+dossier+' (à l’ouverture, pendant un goulot, en suivant un vol, sous deux autres angles ; thème clair et sombre ; 1 280 et 1 920 px) ; le résultat, les indicateurs, les réponses et l’export de la journée identiques avant et après ; « À plat » aux mêmes données');
 }catch(e){console.error(e);process.exitCode=1;}finally{site.effacer();await browser.close();}
})();

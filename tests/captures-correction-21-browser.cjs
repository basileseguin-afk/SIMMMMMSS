/* Correction 21 — les captures de contrôle des quatre retouches de la vue en
 * direct, sur l'unité et les vols fictifs (tests/plan-rejoue-fictif.cjs), en
 * thème clair et sombre, à 1 366 × 768 et 1 920 × 1 080 :
 *   — (a) deux services d'une même zone (la préparation et le montage) avec
 *     chacun des lots en attente : une seule file, à la suite ;
 *   — (b) un site disposé, à l'ouverture : les colonnes de gauche à droite,
 *     les rangées du bas en bas de l'écran — de face jusqu'à l'évolution 21 (f),
 *     depuis à l'inclinaison de la maquette, le cap à peine tourné ;
 *   — (c) le poste de travail réglé pour tout un service : ses équipes à des
 *     trolleys ;
 *   — (d) la légende à l'ouverture de la page (repliée sous 1 500 px de large,
 *     dépliée au-delà), puis dans l'autre état : dépliée, jamais plus de 20 %
 *     de la toile.
 * Chaque capture est vérifiée (sa taille, ce qu'elle doit montrer, la page qui
 * tient sur la largeur) et gardée hors du dépôt : dans $ORY_CAPTURES s'il est
 * donné, sinon dans un dossier temporaire, dit à la fin.
 * La non-régression, dans la page : ces retouches ne changent aucun calcul. Le
 * résultat, les indicateurs de charge et les réponses de la journée sont les
 * mêmes, octet pour octet, avant, pendant et après.
 * Chaque étape attend son effet, pas un délai. Aucune donnée de l'unité : tout
 * est fictif. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {siteSansPlan}=require('./plan-fictif.cjs');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const sauvegarde=F.sauvegardeFictive(),CSV=F.volsCsv();
const dossier=process.env.ORY_CAPTURES?path.resolve(process.env.ORY_CAPTURES):fs.mkdtempSync(path.join(os.tmpdir(),'ory-captures-21-'));
fs.mkdirSync(dossier,{recursive:true});
/** La largeur et la hauteur d'un PNG, lues dans son en-tête (IHDR). */
const taillePng=f=>{const b=fs.readFileSync(f);assert.equal(b.toString('latin1',1,4),'PNG',f);return [b.readUInt32BE(16),b.readUInt32BE(20)];};
/** Quatre colonnes, de gauche à droite ; deux rangées du bas. */
const DISPOSITION={colonnes:[['magasin','decontam'],['cuisine','dotation'],['food'],['armement']],rangees:[{zone:'plonge',de:1,a:2},{zone:'quais',de:1,a:4}]};
const CLES=['ory-ui-direct-legende','ory-ui-en-ce-moment'];

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const site=siteSansPlan(),faites=[];
 try{
  for(const theme of ['clair','sombre'])for(const [largeur,hauteur] of [[1366,768],[1920,1080]]){
   const V=theme+', '+largeur+' × '+hauteur+' : ',portable=largeur<1500;
   const ctx=await browser.newContext({viewport:{width:largeur,height:hauteur},deviceScaleFactor:1,colorScheme:theme==='sombre'?'dark':'light',reducedMotion:'no-preference'});
   const page=await ctx.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   const ch=await F.charger(page,nav,site.url('index.html'),{sauvegarde,csv:CSV,pageId:'j-plan',relief:true});
   const etat=()=>page.evaluate(()=>Sim.direct.etatVue());
   const dessinee=async()=>{await page.waitForFunction(()=>{const e=Sim.direct.etatVue(),c=document.getElementById('direct-toile');return !e.enMouvement&&e.ecran.w===c.clientWidth&&e.ecran.h===c.clientHeight;});
     await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));return etat();};
   const aLHeure=async t=>{await page.evaluate(t=>{Sim.vue.pause();Sim.vue.allerA(t);},t);await page.waitForFunction(t=>Math.abs(Sim.direct.etatVue().t-t)<1e-9,t);return dessinee();};
   const bouton=async nom=>{await page.locator(`#direct-cmd [data-direct-cmd=${nom}]`).click();return dessinee();};
   const angle=e=>[e.camera.cap,Math.round(e.camera.site*100)/100];
   /** Attend que la vue dessine le site et les équipes des réglages du moment. */
   const regle=async()=>{await page.waitForFunction(()=>JSON.stringify(Sim.direct.site)===JSON.stringify(Sim.ateliers.site(Sim.reglages.etat.regime)));return dessinee();};
   /** Un réglage fait par la page (les gestes eux-mêmes ont leurs tests) ; son message se ferme : il ne reste pas sur la capture. */
   const regler=async(f,arg)=>{await page.evaluate(f,arg);for(const x of await page.locator('.notif-fermer').all())await x.click();await page.waitForFunction(()=>!document.querySelector('.notif-fermer'));return regle();};
   const theming=async()=>{const clair=(await etat()).couleurs.fond;await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);
     if(theme==='sombre')await page.waitForFunction(c=>{const k=Sim.direct.etatVue().couleurs;return !!k&&k.fond!==c;},clair);};
   const prete=()=>page.waitForFunction(()=>window.Sim&&Sim.direct&&Sim.directTemps&&Sim.directPanneau&&Sim.direct.etatVue().images>0&&Sim.direct.etatVue().circule);
   /** Ouvre ou replie « En ce moment » ; la toile change de taille, la scène se recadre. */
   const enCeMoment=async ouvert=>{
     if(await page.evaluate(()=>!document.body.classList.contains('sans-en-ce-moment'))!==ouvert)await page.locator('#btn-en-ce-moment').click();
     await page.waitForFunction(o=>!document.body.classList.contains('sans-en-ce-moment')===o,ouvert);return dessinee();};
   /** Replie ou déplie la légende, d'un clic sur son titre : le choix est retenu (on attend qu'il le soit). */
   const legende=async ouverte=>{
     if(await page.evaluate(()=>document.getElementById('direct-coin').open)===ouverte)return;
     await page.locator('#direct-coin > summary').click();
     await page.waitForFunction(o=>document.getElementById('direct-coin').open===o&&localStorage.getItem('ory-ui-direct-legende')===(o?'ouverte':'repliee'),ouverte);};
   /** La légende : ouverte ou non, sa part de la toile, dans la toile. */
   const mesure=()=>page.evaluate(()=>{const b=s=>document.querySelector(s).getBoundingClientRect(),d=document.getElementById('direct-coin'),c=b('#direct-coin'),t=b('#direct-toile');
     return {ouverte:d.open,part:c.width*c.height/(t.width*t.height),dans:c.left>=t.left-0.5&&c.right<=t.right+0.5&&c.top>=t.top-0.5&&c.bottom<=t.bottom+0.5,choix:localStorage.getItem('ory-ui-direct-legende')};});
   /** Cadre la scène sur un service : choisi à côté de la scène, puis « Cadrer » (sur un portable, « En ce moment » replié ensuite). */
   const cadrerSur=async service=>{
     await enCeMoment(true);
     await page.locator(`#direct-panneau-corps .dq-personnes [data-direct-service="${service}"]`).click();
     await page.waitForFunction(s=>Sim.direct.etatVue().selection===s&&!!document.querySelector(`#direct-panneau-corps .dp-detail[data-service="${s}"]`),service);
     if(portable)await enCeMoment(false);
     return bouton('cadrer');};
   const decadrer=async()=>{await enCeMoment(true);await page.locator('#direct-panneau-corps [data-direct-retour]').click();await page.waitForFunction(()=>!Sim.direct.etatVue().selection);
     await enCeMoment(!portable);return bouton('tout');};
   const surLaLargeur=async mot=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),mot+' : la page tient sur la largeur');
   const capturer=async nom=>{const f=path.join(dossier,'21-'+theme+'-'+largeur+'-'+nom+'.png');await surLaLargeur(V+nom);await page.screenshot({path:f});
     assert.deepEqual(taillePng(f),[largeur,hauteur],V+nom+' : la taille de la capture');
     assert.ok(fs.statSync(f).size>20000,V+nom+' : une capture qui montre quelque chose');faites.push(f);};
   /** La journée, telle que la page la tient : le résultat, les indicateurs de charge, les réponses. */
   const journee=()=>page.evaluate(()=>{const at=Sim.ateliers,r=at.resultat;return {resultat:JSON.stringify(r),indicateurs:JSON.stringify(OrlyIndicateurs.journee(r,at.args||{})),reponses:JSON.stringify(Sim.reponses())};});
   try{
    await prete();await theming();
    // Les effectifs calculés se posent au premier changement : la journée de référence est celle d'un changement neutre.
    await page.evaluate(()=>Sim.ateliers.changer(()=>{},''));
    for(const x of await page.locator('.notif-fermer').all())await x.click();
    await enCeMoment(!portable);await legende(false);
    const avant=await journee();

    // (a) Deux services d'une même zone, des lots devant chacun : une seule file — la préparation, puis le montage.
    const t=await page.evaluate(()=>{const r=Sim.ateliers.resultat,E=OrlyDirectEtat,n=E.tranche(r);
      for(let t=-300;t<=1500;t+=7.5){const f=E.filesA(r,t,n),ok=s=>(f[s]||[]).filter(l=>l.arrive>=1).reduce((k,l)=>k+l.chariots,0);if(ok('preparation')>=2&&ok('prepa')>=2)return t;}return null;});
    assert.ok(Number.isFinite(t),V+'une heure où la préparation et le montage ont chacun des lots en attente');
    await aLHeure(t);
    const files=await page.evaluate(()=>{const v=Sim.direct,z=v.site.zones.find(q=>q.id==='food'),dans=o=>o.x>=z.x-1e-6&&o.x<=z.x+z.w+1e-6&&o.y>=z.y-1e-6&&o.y<=z.y+z.h+1e-6;
      const l=v.etatVue().circule.chariots.filter(o=>o.etat==='file'&&!o.enChemin&&z.services.includes(o.service));
      let recouvrements=0;for(let i=0;i<l.length;i++)for(let k=i+1;k<l.length;k++)if(Math.abs(l[i].x-l[k].x)<0.6-1e-6&&Math.abs(l[i].y-l[k].y)<0.48-1e-6)recouvrements++;
      const debut=Math.min(...l.map(o=>o.x)),col=o=>Math.round((o.x-debut)*1000),de=s=>l.filter(o=>o.service===s);
      return {n:l.length,preparation:de('preparation').length,montage:de('prepa').length,dedans:l.every(dans),recouvrements,suite:Math.max(...de('preparation').map(col))<=Math.min(...de('prepa').map(col)),total:v.etatVue().circule.chariots.length};});
    assert.ok(files.preparation>=2&&files.montage>=2&&files.dedans,V+'des lots devant la préparation et devant le montage, dans la zone de production : '+JSON.stringify(files));
    assert.equal(files.recouvrements,0,V+'aucun chariot n’en recouvre un autre');
    assert.ok(files.suite,V+'service après service : la préparation, puis le montage');
    await cadrerSur('prepa');
    await capturer('1-files-d-une-meme-zone');
    await decadrer();

    // (b) Un site disposé s'ouvre comme on l'a rangé : les colonnes de gauche à droite, les rangées du bas en bas de l'écran
    //     (l'inclinaison de la maquette, le cap à peine tourné : évolution 21 f).
    assert.deepEqual(angle(await dessinee()),[45,35.26],V+'sans disposition : l’angle de la maquette');
    const e2=await regler(d=>{Sim.ateliers.regleDisposition(d,'');},DISPOSITION);
    assert.deepEqual(angle(e2),[25,35.26],V+'avec une disposition : l’inclinaison de la maquette, le cap à peine tourné');
    assert.ok(e2.tient&&e2.ajustee,V+'le site disposé tient entier');
    const z=await page.evaluate(()=>Object.fromEntries(Sim.direct.site.zones.map(q=>{const p=Sim.direct.ecranDe(q.x+q.w/2,q.y+q.h/2,0);return [q.id,{x:p[0],y:p[1]}];})));
    assert.ok(z.magasin.x<z.cuisine.x&&z.cuisine.x<z.food.x&&z.food.x<z.armement.x,V+'la première colonne à gauche de la dernière');
    for(const id of ['magasin','decontam','cuisine','dotation','food','armement','plonge'])assert.ok(z.quais.y>z[id].y+5,V+'le quai, une rangée du bas, est sous '+id);
    await capturer('2-site-dispose-a-l-ouverture');
    await regler(()=>{Sim.ateliers.regleDisposition(null,'');});
    assert.deepEqual(angle(await dessinee()),[45,35.26],V+'la disposition automatique : l’angle de la maquette');

    // (c) Le poste de travail pour tout un service : les équipes de la cuisine à des trolleys, d'un seul choix.
    const equipes=await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>a.service==='cuisine').map(a=>a.id));
    const postes=()=>page.evaluate(l=>Object.fromEntries(Sim.direct.ilots.filter(i=>l.includes(i.atelier)).map(i=>[i.atelier,[i.poste,i.tables.length,i.trolleys.length>0]])),equipes);
    for(const v of Object.values(await postes()))assert.deepEqual(v.slice(0,1),['tables'],V+'sans le réglage : des tables');
    await regler(()=>{Sim.ateliers.reglePosteDuService('cuisine','trolleys');});
    await page.waitForFunction(l=>l.every(id=>(Sim.direct.ilots.find(i=>i.atelier===id)||{}).poste==='trolleys'),equipes);
    for(const [id,v] of Object.entries(await postes()))assert.deepEqual(v,['trolleys',0,true],V+id+' : des trolleys, plus de tables');
    assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.some(a=>a.poste)),false,V+'aucune équipe n’a reçu de réglage à elle');
    const pendant=await journee();
    for(const k of ['resultat','indicateurs','reponses'])assert.equal(pendant[k],avant[k],V+k+' : identique avec le poste du service');
    await cadrerSur('cuisine');
    await capturer('3-poste-de-travail-du-service');
    await decadrer();
    await regler(()=>{Sim.ateliers.reglePosteDuService('cuisine','');});

    // (d) La légende, comme la page s'ouvre : sans choix retenu, repliée sous 1 500 px de large, dépliée au-delà.
    // Avant de recharger : la journée est celle du début, octet pour octet, après les trois premières retouches.
    const apresTrois=await journee();
    for(const k of ['resultat','indicateurs','reponses'])assert.equal(apresTrois[k],avant[k],V+k+' : identique après les trois premières retouches');
    await page.evaluate(l=>l.forEach(k=>localStorage.removeItem(k)),CLES);
    await page.reload();
    await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.direct&&!!Sim.ateliers.resultat);
    // (La page rechargée relit ses vols enregistrés : la référence se reprend ici, après un changement neutre, comme au début.)
    await page.evaluate(()=>Sim.ateliers.changer(()=>{},''));
    await nav.aller(page,'j-plan',{relief:true});await prete();await theming();
    for(const x of await page.locator('.notif-fermer').all())await x.click();
    const rechargee=await journee();
    await enCeMoment(!portable);await dessinee();
    const l4=await mesure();
    assert.equal(l4.choix,null,V+'aucun choix retenu : l’état d’ouverture n’en est pas un');
    if(portable)assert.ok(!l4.ouverte&&l4.part<0.012&&l4.dans,V+'sur un portable, la légende est repliée à l’ouverture ('+(l4.part*100).toFixed(1)+' % de la toile)');
    else assert.ok(l4.ouverte&&l4.part<=0.2+1e-9&&l4.dans,V+'sur un grand écran, la légende est dépliée, '+(l4.part*100).toFixed(1)+' % de la toile');
    assert.ok((await bouton('tout')).tient,V+'la scène tient entière');
    await capturer('4-legende-a-l-ouverture');
    // L'autre état, d'un clic : dépliée, jamais plus de 20 % de la toile — « En ce moment » ouvert aussi.
    await legende(!l4.ouverte);
    const l5=await mesure();
    assert.equal(l5.choix,l5.ouverte?'ouverte':'repliee',V+'le choix de l’utilisateur est retenu');
    if(l5.ouverte)assert.ok(l5.part<=0.2+1e-9&&l5.dans,V+'dépliée : '+(l5.part*100).toFixed(1)+' % de la toile, au plus 20 %');
    await capturer(l5.ouverte?'5-legende-depliee':'5-legende-repliee');
    await legende(true);await enCeMoment(true);
    const l6=await mesure();
    assert.ok(l6.ouverte&&l6.part<=0.2+1e-9&&l6.dans,V+'« En ce moment » ouvert, la légende dépliée : '+(l6.part*100).toFixed(1)+' % de la toile');

    // Non-régression : replier et déplier la légende ne change rien à la journée, octet pour octet.
    const apres=await journee();
    for(const k of ['resultat','indicateurs','reponses'])assert.equal(apres[k],rechargee[k],V+k+' : identique après les gestes sur la légende');
    assert.ok(avant.resultat.length>10000&&avant.reponses.length>500,V+'une journée entière comparée');
    assert.deepEqual(errors,[],V+errors.join(' | '));
   }finally{ch.effacer();await ctx.close();}
  }
  assert.equal(faites.length,20);
  console.log('captures-correction-21-browser : ok — '+faites.length+' captures de contrôle de la correction 21 dans '+dossier+' (deux services d’une même zone, une seule file ; un site disposé, à l’ouverture ; le poste de travail d’un service ; la légende à l’ouverture puis dans l’autre état ; thème clair et sombre ; 1 366 × 768 et 1 920 × 1 080) ; le résultat, les indicateurs et les réponses de la journée identiques avant, pendant et après');
 }catch(e){console.error(e);process.exitCode=1;}finally{site.effacer();await browser.close();}
})();

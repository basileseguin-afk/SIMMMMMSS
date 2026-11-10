/* Évolution 14 (b) — le plan rejoué : ce qui se passe à l'heure rejouée. Sur
 * un plan et des vols fictifs (tests/plan-rejoue-fictif.cjs), à 1 280 px de
 * large, en thème clair puis sombre :
 *   1. les quatre états se lisent par un remplissage franc, aux couleurs de
 *      leurs jetons ; 3:1 au moins entre un remplissage et la toile (« pas
 *      commencé », gris clair : son contour pointillé), 4,5:1 pour le texte ;
 *      la légende a les mêmes couleurs ;
 *   2. « au travail / présents » et « en file » de chaque service égalent les
 *      indicateurs de charge au même créneau (calculés hors de la page) ;
 *   3. « Ce qui circule », le défaut des « Liens » : un trait par paire de
 *      services qui ont des repas en stock entre eux (les séjours du moteur),
 *      d'un bord de zone à l'autre ; l'épaisseur suit la quantité ; les trois
 *      plus épais portent leur quantité ; aucun trait quand rien n'attend ;
 *      jamais plus de 8, les autres dans « + n liens » ;
 *   4. pendant la lecture, des points avancent (« un point = … repas ») ; à
 *      la pause, plus de points ; avec prefers-reduced-motion, jamais ;
 *   5. les choix d'avant (Tous… Aucun) dessinent comme avant ;
 *   6. le handling : un véhicule par tournée, du quai vers le bord du plan,
 *      puis plus rien après le retour. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const PF=require('../plan-flux.js');
const PE=require('../moteur/periode.js');
const I=require('../moteur/indicateurs.js');
const {siteSansPlan}=require('./plan-fictif.cjs');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const sauvegarde=F.sauvegardeFictive(),CSV=F.volsCsv(),pic=F.heureDuPicAttendue(sauvegarde,CSV),R=pic.resultat,SEJOURS=R.stocks.sejours;
/* Les créneaux de chaque service sur l'horloge du jour J, comme charge-vue.js : décalés de leur jour, additionnés. */
const decale=g=>{const c=g.creneaux;if(c.debut===null)return c;const d=g.jour*1440,o={debut:c.debut+d};for(const m of I.MESURES)o[m]=c[m]?{debut:c[m].debut+d,valeurs:c[m].valeurs}:null;return o;};
const groupes=new Map();for(const g of pic.k.services){if(!groupes.has(g.service))groupes.set(g.service,[]);groupes.get(g.service).push(g);}
const chargeAttendue=(id,t)=>{const gs=groupes.get(id);if(!gs)return null;const n=PF.chargeA(PE.sommeDesCreneaux(gs.map(decale)),t,pic.k.pas);return n.presents||n.auTravail||n.enFile?n:null;};

/* Le contraste WCAG de deux couleurs « rgb(r, g, b) ». */
const rgb=s=>{const m=String(s).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);assert.ok(m,'une couleur : '+s);return [+m[1],+m[2],+m[3]];};
const lum=c=>{const [r,g,b]=rgb(c).map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;});return 0.2126*r+0.7152*g+0.0722*b;};
const contraste=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05);};
const TOKENS={travail:'--ds-accent',attente:'--ds-attente',fini:'--ds-texte-4',avenir:'--ds-survol'};
const plat=s=>String(s).replace(/[\s  ]+/g,' ').trim();

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const site=siteSansPlan();
 try{
  for(const theme of ['clair','sombre']){
   const V=theme+' : ';
   const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   const attendre=(ms=200)=>page.waitForTimeout(ms);
   const ch=await F.charger(page,nav,site.url('index.html'),{sauvegarde,csv:CSV});
   try{
    if(theme==='sombre'){await page.evaluate(()=>{document.documentElement.dataset.theme='sombre';});await attendre(200);}
    assert.equal(await page.evaluate(()=>Sim.vue.t),pic.t,V+'l’ouverture, au pic de travail');

    // 1. Les quatre états : un remplissage franc, ses contrastes ; la légende a les mêmes couleurs.
    const etats=await page.evaluate(TOKENS=>{
     const couleur=v=>{const d=document.createElement('div');d.style.color='var('+v+')';document.body.appendChild(d);const c=getComputedStyle(d).color;d.remove();return c;};
     const g=document.querySelector('#plan .zone[data-id="dotation"]'),avant=g.getAttribute('class'),out={toile:getComputedStyle(document.getElementById('plan')).backgroundColor};
     g.querySelector('.fond').style.transition='none';   // la couleur d'arrivée, pas celle d'une transition en cours
     for(const e of Object.keys(TOKENS)){
      g.setAttribute('class','zone s-'+e);
      const f=getComputedStyle(g.querySelector('.fond')),t=getComputedStyle(g.querySelector('.titre'));
      out[e]={fill:f.fill,opacite:f.fillOpacity,stroke:f.stroke,pointilles:f.strokeDasharray,texte:t.fill,jeton:couleur(TOKENS[e])};
     }
     g.setAttribute('class',avant);g.querySelector('.fond').style.transition='';
     out.legende=[...document.querySelectorAll('#legende-plan .pastille')].map(p=>getComputedStyle(p).backgroundColor);
     return out;
    },TOKENS);
    for(const e of Object.keys(TOKENS)){
     const x=etats[e];
     assert.equal(x.fill,x.jeton,V+e+' : le remplissage est son jeton '+TOKENS[e]);
     assert.equal(+x.opacite,1,V+e+' : un remplissage franc');
     assert.ok(contraste(x.texte,x.fill)>=4.5,V+e+' : texte '+contraste(x.texte,x.fill).toFixed(2)+':1');
     if(e==='avenir'){
      assert.notEqual(x.pointilles,'none',V+'pas commencé : un contour pointillé');
      assert.ok(contraste(x.stroke,etats.toile)>=3,V+'pas commencé : le contour '+contraste(x.stroke,etats.toile).toFixed(2)+':1 sur la toile');
     }else assert.ok(contraste(x.fill,etats.toile)>=3,V+e+' : remplissage '+contraste(x.fill,etats.toile).toFixed(2)+':1 sur la toile');
    }
    assert.deepEqual(etats.legende,Object.keys(TOKENS).map(e=>etats[e].jeton),V+'la légende a les couleurs des remplissages');

    // 2. « au travail / présents », « en file » : les indicateurs de charge, au même créneau.
    for(const t of [pic.t,pic.t+120,pic.t+400]){
     await page.evaluate(t=>Sim.vue.allerA(t),t);await attendre(100);
     const lus=await page.evaluate(()=>Sim.planRejoue.zones().map(id=>{const g=document.querySelector('#plan .zone[data-id="'+id+'"]'),c=g.querySelector('.zone-charge');
      return {id,n:g.dataset.presents===undefined?null:{auTravail:+g.dataset.auTravail,presents:+g.dataset.presents,enFile:+g.dataset.enFile},
       vu:!!c&&getComputedStyle(c).display!=='none',label:c&&c.getAttribute('aria-label'),file:g.querySelector('.zone-file text')?.textContent||'',fileVue:!!g.querySelector('.zone-file')&&getComputedStyle(g.querySelector('.zone-file')).display!=='none'};}));
     let vus=0;
     for(const z of lus){
      assert.deepEqual(z.n,chargeAttendue(z.id,t),V+z.id+' à '+F.hh(t)+' : les indicateurs de charge');
      if(!z.vu)continue;
      vus++;
      assert.equal(z.label,z.n.auTravail+' au travail / '+z.n.presents+(z.n.presents>1?' présents':' présent'),V+z.id+' : le texte');
      if(z.fileVue)assert.equal(z.file,z.n.enFile+' en file',V+z.id+' : le badge');
      else assert.equal(z.n.enFile,0,V+z.id+' : un badge quand il y a une file');
     }
     if(t===pic.t)assert.ok(vus>=2,V+'au pic, des services montrent leurs chiffres');
    }
    await page.evaluate(t=>Sim.vue.allerA(t),pic.t);await attendre(100);

    // 3. « Ce qui circule », le défaut.
    const liens=await page.evaluate(()=>{const s=document.getElementById('fc-map-filter');return {valeur:s.value,options:[...s.options].map(o=>[o.value,o.textContent])};});
    assert.equal(liens.valeur,'circule',V+'« Ce qui circule » par défaut');
    assert.deepEqual(liens.options.map(o=>o[0]),['circule','all','human','material','matter','information','unclassified','none'],V+'les choix d’avant restent');
    assert.equal(liens.options[0][1],'Ce qui circule');
    const traits=()=>page.evaluate(()=>({
     connus:Sim.planRejoue.zones(),
     boites:Object.fromEntries(Sim.planRejoue.zones().map(id=>[id,Sim.planRejoue.boite(id)])),
     traits:[...document.querySelectorAll('#plan-circule .pc-trait')].map(g=>({de:g.dataset.de,vers:g.dataset.vers,repas:+g.dataset.repas,
      px:parseFloat(getComputedStyle(g.querySelector('.pc-ligne')).strokeWidth),d:g.querySelector('.pc-ligne').getAttribute('d'),pointe:g.querySelector('.pc-pointe').getAttribute('d'),
      etiquette:g.querySelector('.pc-etiquette')?.textContent||null})),
     note:document.getElementById('plan-circule-note').textContent,
     points:document.querySelectorAll('#plan-circule .pc-point').length,t:Sim.vue.t}));
    let c=await traits();
    const connus=new Set(c.connus),ref=PF.reference(SEJOURS,connus),attendu=PF.traits(PF.circulation(SEJOURS,pic.t,connus),ref);
    assert.ok(attendu.traits.length>=3,'la journée fictive a au moins trois paires au pic');
    assert.deepEqual(c.traits.map(x=>[x.de,x.vers,x.repas]),attendu.traits.map(x=>[x.de,x.vers,x.repas]),V+'un trait par paire, les séjours du moteur');
    c.traits.forEach((x,i)=>{
     assert.ok(Math.abs(x.px-attendu.traits[i].epaisseur)<0.01,V+x.de+' → '+x.vers+' : '+x.px+' px');
     assert.ok(x.px>=1&&x.px<=8);
     if(i)assert.ok(x.px<=c.traits[i-1].px,V+'l’épaisseur suit la quantité');
     assert.equal(x.etiquette&&plat(x.etiquette),i<3?x.repas+' repas':null,V+'les trois plus épais portent leur quantité');
     // D'un bord de zone à l'autre : le départ sur le bord de « de », la pointe sur celui de « vers ».
     const surBord=(p,b)=>(Math.abs(p[0]-b.x)<1||Math.abs(p[0]-b.x-b.w)<1)&&p[1]>=b.y-1&&p[1]<=b.y+b.h+1||(Math.abs(p[1]-b.y)<1||Math.abs(p[1]-b.y-b.h)<1)&&p[0]>=b.x-1&&p[0]<=b.x+b.w+1;
     const dep=x.d.match(/^M([-\d.]+) ([-\d.]+)/).slice(1).map(Number),bout=x.pointe.match(/L([-\d.]+) ([-\d.]+) L/).slice(1).map(Number);
     assert.ok(surBord(dep,c.boites[x.de]),V+x.de+' : le trait part du bord');
     assert.ok(surBord(bout,c.boites[x.vers]),V+x.vers+' : la pointe touche le bord');
    });
    assert.equal(c.points,0,V+'à l’arrêt, pas de points');
    // Rien n'attend : aucun trait.
    await page.evaluate(()=>Sim.vue.allerA(1310));await attendre(100);
    c=await traits();
    assert.deepEqual(PF.circulation(SEJOURS,1310,connus),[],'à 21:50, rien n’attend dans la journée fictive');
    assert.equal(c.traits.length,0,V+'rien n’attend : aucun trait');
    assert.equal(c.note,'',V+'ni mention');
    // Jamais plus de 8 traits : dix paires de plus, fictives ; les plus petites se replient.
    const replies=await page.evaluate(t=>{
     const ids=Sim.planRejoue.zones(),r=Sim.ateliers.resultat,plus=[];
     for(let i=0;i<10;i++)plus.push({de:ids[i],vers:ids[(i+3)%ids.length],classe:'X',entree:t-10,sortie:t+10,duree:20,repas:1+i});
     window.__resultat=r;Sim.ateliers.resultat={...r,stocks:{...r.stocks,sejours:r.stocks.sejours.concat(plus)}};
     Sim.vue.allerA(t);
     return {traits:document.querySelectorAll('#plan-circule .pc-trait').length,note:document.getElementById('plan-circule-note').textContent,
      paires:new Set(Sim.ateliers.resultat.stocks.sejours.filter(s=>s.entree<=t&&t<s.sortie&&s.de!==s.vers&&ids.includes(s.de)&&ids.includes(s.vers)).map(s=>s.de+'>'+s.vers)).size};
    },pic.t);
    assert.ok(replies.paires>8);
    assert.equal(replies.traits,8,V+'au plus 8 traits');
    assert.equal(plat(replies.note),'+ '+(replies.paires-8)+' liens',V+'les autres se replient dans « + n liens »');
    await page.evaluate(t=>{Sim.ateliers.resultat=window.__resultat;delete window.__resultat;Sim.vue.allerA(t);},pic.t);await attendre(100);
    assert.equal((await traits()).traits.length,attendu.traits.length);

    // 4. Pendant la lecture, des points avancent ; à la pause, plus rien.
    await page.evaluate(()=>{Sim.vue.vitesse=5;Sim.vue.lancer();});await attendre(400);
    const lecture=async()=>page.evaluate(()=>({t:Sim.vue.t,n:document.querySelectorAll('#plan-circule .pc-point').length,
     premier:[...document.querySelectorAll('#plan-circule .pc-point')].map(p=>p.getAttribute('cx')+','+p.getAttribute('cy')).join(' '),
     traits:[...document.querySelectorAll('#plan-circule .pc-trait')].map(g=>+g.dataset.repas),note:document.getElementById('plan-circule-note').textContent}));
    const l1=await lecture();await attendre(500);const l2=await lecture();
    const tranche=PF.tranche(ref);
    for(const l of [l1,l2])assert.equal(l.n,l.traits.reduce((n,q)=>n+Math.max(1,Math.ceil(q/tranche)),0),V+'un point par tranche de '+tranche+' repas');
    assert.ok(l1.n>0,V+'des points pendant la lecture');
    assert.ok(l2.t>l1.t&&l2.premier!==l1.premier,V+'les points avancent avec la lecture');
    assert.equal(plat(l1.note),'un point = '+tranche.toLocaleString('fr-FR').replace(/\s/g,' ')+' repas',V+'la tranche, dans la légende');
    await page.evaluate(()=>{Sim.vue.pause();Sim.vue.vitesse=30;});await attendre(100);
    const arret=await lecture();
    assert.equal(arret.n,0,V+'à la pause, plus de points');
    assert.equal(arret.note,'',V+'ni de tranche');

    // 5. Les choix d'avant dessinent comme avant : les liens configurés, et plus « ce qui circule ».
    for(const choix of ['all','human','material','matter','information','unclassified','none']){
     await page.locator('#fc-map-filter').selectOption(choix);await attendre(80);
     const d=await page.evaluate(()=>{
      const pts=Sim.flows.points,owner=id=>(pts.find(p=>p.id===id)||{}).owner;
      const attendus=Sim.flows.mapFlows().filter(f=>owner(f.from)&&owner(f.to)&&Sim.planRejoue.existe(owner(f.from))&&Sim.planRejoue.existe(owner(f.to))&&owner(f.from)!==owner(f.to)).map(f=>f.id);
      return {attendus,dessines:[...document.querySelectorAll('#flow-edges [data-flow-id]')].map(p=>p.dataset.flowId),circule:document.querySelectorAll('#plan-circule *').length,filtre:Sim.flows.mapFilter};
     });
     assert.equal(d.filtre,choix);
     assert.deepEqual(d.dessines,d.attendus,V+choix+' : les liens configurés, comme avant');
     assert.equal(d.circule,0,V+choix+' : rien de « ce qui circule »');
     if(choix==='all')assert.ok(d.dessines.length>0,'l’unité fictive a des liens configurés');
    }
    await page.locator('#fc-map-filter').selectOption('circule');await attendre(100);
    c=await traits();
    assert.equal(c.traits.length,attendu.traits.length,V+'retour à « Ce qui circule »');
    assert.equal(await page.locator('#flow-edges [data-flow-id]').count(),0);

    // 6. Le handling : un véhicule par tournée, du quai vers le bord du plan.
    const vehicules=t=>page.evaluate(t=>{Sim.vue.allerA(t);const B=Sim.planRejoue.bornes(),q=Sim.planRejoue.boite('quais');
     return {plan:B,quai:q,v:[...document.querySelectorAll('#plan-vehicules .pv-vehicule')].map(g=>{const c=g.querySelector('.pv-fond');
      return {camion:g.dataset.camion,vehicule:g.dataset.vehicule,avance:+g.dataset.avance,x:+c.getAttribute('cx'),y:+c.getAttribute('cy')};})};},t);
    // La journée fictive : avant 551,8, aucun camion ; puis les camions 1 et 2 partent ensemble (allers de 20 et 15 min) ;
    // le camion 2 rentre de 592 à 607.
    const avant=await vehicules(545),a=await vehicules(560),b=await vehicules(575),r=await vehicules(600);
    for(const [t,l] of [[545,avant],[560,a],[575,b],[600,r]]){
     const att=PF.vehiculesA(R.lots,t);
     assert.deepEqual(l.v.map(x=>[x.camion,x.vehicule,x.avance]),att.map(x=>[String(x.camion),x.vehicule,+x.avance.toFixed(3)]),V+'à '+F.hh(t)+' : les tournées du moteur');
    }
    assert.equal(avant.v.length,0,V+'pas de trajet, pas de véhicule');
    assert.ok(a.v.length===2&&b.v.length===2,V+'un véhicule par tournée');
    const cq={x:a.quai.x+a.quai.w/2,y:a.quai.y+a.quai.h/2},dist=p=>Math.hypot(p.x-cq.x,p.y-cq.y);
    const camion=(l,n)=>l.v.find(x=>x.camion===String(n));
    assert.ok(dist(camion(b,1))>dist(camion(a,1)),V+'à l’aller, il s’éloigne du quai');
    const auBord=p=>Math.min(Math.abs(p.x-b.plan.x),Math.abs(p.x-b.plan.x-b.plan.w),Math.abs(p.y-b.plan.y),Math.abs(p.y-b.plan.y-b.plan.h));
    assert.equal(camion(b,2).avance,1);
    assert.ok(auBord(camion(b,2))<1,V+'au bout de l’aller, au bord du plan, du côté des avions');
    assert.ok(camion(r,2).avance<1&&dist(camion(r,2))<dist(camion(b,2)),V+'puis il revient vers le quai');

    assert.deepEqual(errors,[],V+errors.join(' | '));
   }finally{ch.effacer();await page.close();}
  }

  // 4 bis. Avec prefers-reduced-motion : pas de points, seules les épaisseurs changent.
  const ctx=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce'});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const ch=await F.charger(page,nav,site.url('index.html'),{sauvegarde,csv:CSV});
  try{
   await page.evaluate(()=>{Sim.vue.vitesse=5;Sim.vue.lancer();});await page.waitForTimeout(500);
   const r=await page.evaluate(()=>({enMarche:Sim.vue.enMarche,traits:document.querySelectorAll('#plan-circule .pc-trait').length,points:document.querySelectorAll('#plan-circule .pc-point').length,note:document.getElementById('plan-circule-note').textContent}));
   await page.evaluate(()=>Sim.vue.pause());
   assert.ok(r.enMarche&&r.traits>0,'reduced-motion : la lecture tourne, les traits sont là');
   assert.equal(r.points,0,'reduced-motion : pas de points');
   assert.doesNotMatch(r.note,/un point/,'reduced-motion : pas de tranche');
   assert.deepEqual(errors,[],errors.join(' | '));
  }finally{ch.effacer();await ctx.close();}
  console.log('plan-flux-browser : ok (thèmes clair et sombre, reduced-motion)');
 }catch(e){console.error(e);process.exitCode=1;}finally{site.effacer();await browser.close();}
})();

/* Évolution 16 (d) — ce qui circule dans la vue en direct, dans la page (v1).
 * Les lots sont des chariots (un par tranche de repas, dite dans la légende) :
 * en file devant le service qui va les prendre, ou dans l'îlot de l'atelier qui
 * y travaille ; les tournées du handling, des véhicules ; les vols, des avions
 * au bord de la scène, dont l'étiquette passe au critique quand ils sont
 * chargés en retard ; les retours sales rejoignent la plonge, où seul le tunnel
 * qui lave s'anime ; la ligne robotisée dit sa cadence quand elle travaille.
 * Tout est lu dans le résultat de la journée. Chaque étape attend son effet,
 * pas un délai. Unité et vols fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const somme=(l,f)=>l.reduce((s,x)=>s+f(x),0);
const dans=(p,b,jeu=1e-6)=>p.x>=b.x-jeu&&p.x<=b.x+b.w+jeu&&p.y>=b.y-jeu&&p.y<=b.y+b.h+jeu;
const proche=(a,b,jeu=3)=>a.every((v,i)=>Math.abs(v-b[i])<=jeu);
const rvb=texte=>(String(texte).match(/\d+(\.\d+)?/g)||[]).slice(0,3).map(Number);

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1}),erreurs=[];
 page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
 const etat=()=>page.evaluate(()=>Sim.direct.etatVue());
 const dessinee=async()=>{await page.waitForFunction(()=>!Sim.direct.etatVue().enMouvement);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));return etat();};
 /** Va à une heure du rejeu (en pause), attend que la scène la montre. */
 const aLHeure=async t=>{await page.evaluate(t=>{Sim.vue.pause();Sim.vue.allerA(t);},t);await page.waitForFunction(t=>Math.abs(Sim.direct.etatVue().t-t)<1e-9,t);return dessinee();};
 /** La couleur d'un point de la toile. */
 const pixel=(x,y)=>page.evaluate(([x,y])=>{const c=Sim.direct.toile,r=c.width/c.clientWidth;return [...c.getContext('2d').getImageData(Math.round(x*r),Math.round(y*r),1,1).data].slice(0,3);},[x,y]);
 /** Ce que le résultat de la page dit à l'heure `t` : les stocks devant chaque service, les lots en cours, les tournées en route. */
 const lu=t=>page.evaluate(t=>{
   const r=Sim.direct.journee.r,E=OrlyDirectEtat,n=E.tranche(r),P=MoteurProduction;
   const enStock=service=>{const m=new Map();for(const s of r.stocks.sejours)if(s.vers===service&&t>=s.entree&&t<s.sortie)m.set(s.classe+'|'+(s.vol??''),s.repas);return [...m.values()];};
   return {tranche:n,
     stocks:Object.fromEntries(Object.keys(r.stocks.parService).map(s=>[s,{niveau:P.niveauA(r.stocks.parService[s],t),lots:enStock(s).length,repas:enStock(s).reduce((a,b)=>a+b,0),chariots:enStock(s).reduce((a,q)=>a+Math.max(1,Math.ceil(q/n)),0),parVol:r.stocks.sejours.some(x=>x.vers===s&&x.vol)}])),
     enCours:r.lots.filter(l=>!l.dispo&&!l.handling&&!l.retourVol&&Number.isFinite(l.debut)&&Number.isFinite(l.fin)&&t>=l.debut&&t<l.fin).map(l=>({atelier:l.atelier,chariots:Math.max(1,Math.ceil((l.classes||[]).reduce((a,c)=>a+(+(r.classes.find(k=>k.id===c)||{}).pax||0),0)/n))})),
     tournees:r.lots.filter(l=>l.trajet&&t>=l.trajet.depart&&t<=l.trajet.retour).map(l=>l.camion+'|'+l.trajet.depart)};},t);
 try{
  const x=await F.charger(page,nav,URL,{pageId:'j-plan',relief:true});
  await page.waitForFunction(()=>window.Sim&&Sim.direct&&Sim.direct.etatVue().images>0&&Sim.direct.etatVue().circule);
  const scene=await page.evaluate(()=>({zones:Sim.direct.site.zones.map(z=>({id:z.id,services:z.services,x:z.x,y:z.y,w:z.w,h:z.h,role:z.role,tunnels:(z.tunnels||[]).map(t=>({nom:t.nom,x:t.x,y:t.y,w:t.w,h:t.h}))})),largeur:Sim.direct.site.largeur,
    ilots:Sim.direct.ilots.map(i=>({atelier:i.atelier,x:i.x,y:i.y,w:i.w,h:i.h})),vols:Sim.direct.journee.r.vols.map(v=>({id:v.id,depart:v.depart,fin:v.fin,retard:v.retard})),
    tournees:Sim.direct.journee.r.lots.filter(l=>l.trajet).map(l=>({vol:l.vol,cle:l.camion+'|'+l.trajet.depart,depart:l.trajet.depart,retour:l.trajet.retour,aller:l.trajet.aller})),
    retours:Sim.direct.journee.r.lots.filter(l=>l.retourVol&&Number.isFinite(l.debut)&&Number.isFinite(l.fin)).map(l=>({vol:l.vol,debut:l.debut,fin:l.fin,tunnel:l.nomTunnel})),
    robot:Sim.direct.journee.r.lots.filter(l=>Number.isFinite(l.debit)&&Number.isFinite(l.debut)).map(l=>({atelier:l.atelier,debut:l.debut,fin:l.fin,debit:l.debit}))}));
  const zoneDe=s=>scene.zones.find(z=>z.services.includes(s));

  // 1. La légende : une couleur par nature, et la tranche d'un chariot ; ses carrés ont les couleurs de la scène.
  const e0=await dessinee();
  const legende=await page.evaluate(()=>{const l=document.getElementById('direct-legende'),c=s=>'rgb('+OrlyDirectDessin.rvb(getComputedStyle(l.querySelector(s)).backgroundColor).join(',')+')';
    return {texte:l.textContent.replace(/\s+/g,' ').trim(),visible:l.offsetParent!==null&&l.getBoundingClientRect().right<=document.getElementById('plan-bande').getBoundingClientRect().right+1,
      repas:c('.dl-repas'),equipement:c('.dl-equipement'),sale:c('.dl-sale'),tranche:document.getElementById('direct-tranche').textContent};});
  assert.ok(legende.visible,'la légende tient dans la bande, sans être coupée');
  for(const mot of ['repas','équipement','retour sale','un chariot = 50 repas'])assert.ok(legende.texte.includes(mot),'la légende dit « '+mot+' »');
  assert.equal(legende.tranche,'un chariot = '+e0.circule.tranche+' repas','la tranche de la légende est celle de la scène');
  for(const n of ['repas','equipement','sale'])assert.ok(proche(rvb(legende[n]),rvb(e0.couleurs[n]),2),'le carré « '+n+' » a la couleur des chariots : '+legende[n]+' / '+e0.couleurs[n]);
  assert.equal(new Set([e0.couleurs.repas,e0.couleurs.equipement,e0.couleurs.sale]).size,3,'trois couleurs distinctes');

  // 2. À plusieurs heures : les chariots en file devant un service égalent les stocks du résultat ; un lot en cours est
  //    dans l'îlot de son atelier ; les véhicules sont ceux des tournées en route.
  let vus={file:0,enCours:0,vehicules:0};
  for(const t of [-120,190,400,560,700,1000,1240]){
    const e=await aLHeure(t),r=await lu(t),c=e.circule;
    for(const [service,s] of Object.entries(r.stocks)){
      const poses=c.chariots.filter(o=>o.etat==='file'&&o.ton!=='sale'&&o.service===service);
      assert.equal(poses.length,s.chariots,service+' à '+t+' : les chariots en file égalent les lots en stock, un par tranche');
      if(!s.parVol)assert.ok(Math.abs(s.repas-s.niveau)<1e-6,service+' à '+t+' : les repas en file sont le niveau du stock');
      if(s.niveau<1e-6&&!s.lots)assert.equal(poses.length,0,service+' à '+t+' : rien n’attend, aucun chariot');
      for(const o of poses)if(!o.enChemin)assert.ok(dans(o,zoneDe(service)),service+' à '+t+' : la file est dans la zone du service');
      vus.file+=poses.length;
    }
    for(const l of r.enCours){
      const ilot=scene.ilots.find(i=>i.atelier===l.atelier),siens=c.chariots.filter(o=>o.etat==='en cours'&&o.atelier===l.atelier);
      assert.equal(siens.length,somme(r.enCours.filter(q=>q.atelier===l.atelier),q=>q.chariots),l.atelier+' à '+t+' : les chariots de ses lots en cours');
      for(const o of siens)assert.ok(dans(o,ilot,0.31),l.atelier+' à '+t+' : dans l’îlot de son atelier');
      vus.enCours+=siens.length;
    }
    assert.equal(c.chariots.filter(o=>o.etat==='en cours').length,somme(r.enCours,q=>q.chariots),'à '+t+' : aucun chariot en cours de trop');
    assert.deepEqual(c.vehicules.map(v=>v.cle).sort(),r.tournees.slice().sort(),'à '+t+' : un véhicule par tournée en route, et seulement elles');
    vus.vehicules+=c.vehicules.length;
    assert.deepEqual(e.recouvrements,[],'à '+t+' : aucune étiquette n’en recouvre une autre');
  }
  assert.ok(vus.file>100&&vus.enCours>20&&vus.vehicules>=2,'le contrôle a vu des files, des lots en cours et des véhicules : '+JSON.stringify(vus));

  // 3. Un véhicule est en route pendant son trajet, et seulement là ; il va du quai aux avions.
  const tournee=scene.tournees[0],quai=scene.zones.find(z=>z.role==='quai');
  const avant=await aLHeure(tournee.depart-1);assert.ok(!avant.circule.vehicules.some(v=>v.cle===tournee.cle),'avant son départ : pas de véhicule');
  const part=(await aLHeure(tournee.depart+0.01)).circule.vehicules.find(v=>v.cle===tournee.cle);
  assert.ok(part&&part.phase==='aller'&&Math.abs(part.x-scene.largeur)<0.1&&part.y>=quai.y&&part.y<=quai.y+quai.h,'il part du quai');
  const charge=(await aLHeure(tournee.depart+tournee.aller+0.5)).circule.vehicules.find(v=>v.cle===tournee.cle);
  assert.ok(charge&&charge.phase==='charge'&&charge.x>avant.aire.x,'il est aux avions, au bord de la scène');
  const revient=(await aLHeure(tournee.retour-1)).circule.vehicules.find(v=>v.cle===tournee.cle);
  assert.ok(revient&&revient.phase==='retour','il revient');
  assert.ok(!(await aLHeure(tournee.retour+1)).circule.vehicules.some(v=>v.cle===tournee.cle),'après son retour : plus de véhicule');

  // 4. Chaque vol est un avion au bord de la scène, avec son numéro et son heure ; chargé en retard, son étiquette est critique.
  const tard=scene.vols.find(v=>v.retard>30&&Number.isFinite(v.fin)),hh=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(Math.round(m)%60).padStart(2,'0');
  const tot=await aLHeure(tard.depart-20),eTot=tot.vols.find(v=>v.vol===tard.id);
  assert.ok(tot.circule.avions.some(a=>a.id===tard.id&&a.x>tot.aire.x),'l’avion est sur l’aire, du côté des avions');
  assert.equal(eTot.titre,tard.id+' · '+hh(tard.depart),'son numéro et son heure');
  assert.equal(eTot.ton,null,'avant son heure, pas de couleur critique');
  const fondNormal=await pixel(eTot.x+4,eTot.y+eTot.h/2);
  // Passé son heure sans être chargé, un vol ne porte plus son étiquette (seuls ceux qu'on charge ou qui partent dans
  // l'heure la portent — évolution 16, retouches) : elle revient au survol de son avion.
  const sans=await aLHeure(tard.depart+5),avionTard=sans.circule.avions.find(a=>a.id===tard.id);
  assert.ok(avionTard&&!sans.circule.vehicules.some(v=>v.vols.includes(tard.id)),'le vol en retard est là, et aucune tournée ne vient encore le charger');
  assert.equal(sans.vols.find(v=>v.vol===tard.id),undefined,'sans survol, pas d’étiquette');
  const boiteToile=await page.locator('#direct-toile').boundingBox(),ou=await page.evaluate(([x,y])=>Sim.direct.ecranDe(x,y,0.6),[avionTard.x,avionTard.y]);
  await page.mouse.move(boiteToile.x+ou[0],boiteToile.y+ou[1]);
  await page.waitForFunction(v=>{const s=Sim.direct.etatVue().survol;return !!s&&s.vol===v;},tard.id);
  const apres=await dessinee(),eTard=apres.vols.find(v=>v.vol===tard.id);
  assert.equal(eTard.ton,'critique','chargé en retard, passé son heure : la couleur critique');
  const m=Math.round(tard.retard);
  assert.equal(eTard.titre,tard.id+' · '+hh(tard.depart)+' · retard '+(m<60?m+' min':Math.floor(m/60)+' h '+String(m%60).padStart(2,'0')),'elle dit le retard');
  const fondCritique=await pixel(eTard.x+4,eTard.y+eTard.h/2);
  assert.ok(proche(fondCritique,rvb(apres.couleurs.etiquetteCritique),3),'le fond de l’étiquette est teinté de critique : '+fondCritique+' / '+apres.couleurs.etiquetteCritique);
  assert.ok(!proche(fondCritique,fondNormal,3),'et ce n’est pas le fond d’une étiquette ordinaire');
  const bord=await pixel(eTard.x+0.5,eTard.y+eTard.h/2);
  assert.ok(proche(bord,rvb(apres.couleurs.critique),40),'son contour est critique : '+bord+' / '+apres.couleurs.critique);
  // Un avion décolle quand il est chargé : il n'est plus là ensuite.
  assert.ok(!(await aLHeure(tard.fin+10)).circule.avions.some(a=>a.id===tard.id),'chargé, il a décollé');
  // « Tout voir » montre aussi l'aire des avions : chaque avion est à l'écran.
  await page.locator('[data-direct-cmd=tout]').click();
  const tout=await aLHeure(tard.depart+5);
  assert.equal(tout.tient,true,'la scène entière, aire des avions comprise, tient à l’écran');
  assert.equal(tout.aire.places>=tout.circule.avions.length,true);
  for(const a of tout.circule.avions){const [X,Y]=await page.evaluate(([x,y])=>Sim.direct.ecranDe(x,y,0),[a.x,a.y]);assert.ok(X>0&&X<tout.ecran.w&&Y>0&&Y<tout.ecran.h,a.id+' est à l’écran');}

  // 5. Les retours sales : chaque tunnel s'anime quand il lave, et seulement lui.
  const lavage=scene.retours[0],plonge=scene.zones.find(z=>z.tunnels.length);
  const lave=await aLHeure((lavage.debut+lavage.fin)/2);
  assert.deepEqual(lave.circule.tunnels,[lavage.tunnel],'un seul tunnel lave');
  assert.ok(lave.circule.chariots.some(o=>o.etat==='lave'&&o.tunnel===lavage.tunnel&&o.vol===lavage.vol&&o.ton==='sale'),'le retour est dans son tunnel');
  // Le dessus du tunnel qui lave est éclairé ; celui de l'autre ne l'est pas.
  await page.evaluate(id=>{const v=Sim.direct,z=v.site.zones.find(z=>z.id===id);v.ajustee=false;v.cam=OrlyDirectCamera.cadrer(v.cam,v.etatVue().ecran,OrlyDirectScene.boiteDeZone(z));v.demander();},plonge.id);
  const pres=await dessinee();
  const dessus=async nom=>{const t=plonge.tunnels.find(q=>q.nom===nom),pris=[...pres.etiquettes,...pres.vols,...pres.circule.marques];
    for(const [fx,fy] of [[0.5,0.5],[0.25,0.5],[0.75,0.5],[0.1,0.5],[0.9,0.5],[0.5,0.25],[0.5,0.75]]){
      const [X,Y]=await page.evaluate(([x,y,z])=>Sim.direct.ecranDe(x,y,z),[t.x+t.w*fx,t.y+t.h*fy,await page.evaluate(()=>OrlyDirectScene.H.tunnel)]);
      if(X<2||Y<2||X>pres.ecran.w-2||Y>pres.ecran.h-2||pris.some(r=>X>=r.x-2&&X<=r.x+r.w+2&&Y>=r.y-2&&Y<=r.y+r.h+2))continue;
      return pixel(X,Y);}
    throw new Error('aucun point libre sur le dessus du tunnel '+nom);};
  const autre=plonge.tunnels.find(q=>q.nom!==lavage.tunnel).nom,cLave=await dessus(lavage.tunnel),cRepos=await dessus(autre);
  assert.ok(!proche(cLave,cRepos,6),'le tunnel qui lave ('+cLave+') ne se dessine pas comme celui au repos ('+cRepos+')');
  const repos=await aLHeure(lavage.fin+0.5>scene.retours[1].debut?-200:lavage.fin+0.5);
  if(!repos.circule.tunnels.length){const a=await dessus(lavage.tunnel),b=await dessus(autre);assert.ok(proche(a,b,6),'au repos, les deux tunnels se dessinent pareil : '+a+' / '+b);}
  await page.locator('[data-direct-cmd=tout]').click();await dessinee();

  // 6. La ligne robotisée : au travail, sa cadence en clair ; au repos, rien.
  const rb=scene.robot[0];
  const robot=await aLHeure((rb.debut+rb.fin)/2);
  assert.deepEqual(robot.circule.lignes.map(l=>[l.atelier,l.debit]),[[rb.atelier,rb.debit]]);
  assert.ok(robot.circule.marques.some(q=>q.texte===Math.round(rb.debit)+' plateaux par heure'),'la cadence est écrite dans la scène : '+JSON.stringify(robot.circule.marques.map(q=>q.texte)));
  const auRepos=await aLHeure(rb.fin+30);
  assert.deepEqual(auRepos.circule.lignes,[]);
  assert.ok(!auRepos.circule.marques.some(q=>/plateaux/.test(q.texte)),'au repos, pas de cadence');

  // 7. Pendant la lecture, la scène avance et s'anime ; en pause, elle ne bouge plus.
  await aLHeure(rb.debut+5);
  const i0=(await etat()).images;
  await page.evaluate(()=>Sim.vue.lancer());
  await page.waitForFunction(([t,i])=>Sim.direct.etatVue().t>t+1&&Sim.direct.etatVue().images>i+5,[rb.debut+5,i0]);
  await page.evaluate(()=>Sim.vue.pause());
  const p1=await dessinee(),p2=await dessinee();
  assert.equal(p1.t,p2.t,'en pause, l’heure ne bouge plus');
  assert.deepEqual(p1.circule.chariots,p2.circule.chariots,'ni les chariots');

  // 8. En thème sombre, la légende et la scène gardent les mêmes couleurs l'une que l'autre.
  await page.evaluate(()=>{document.documentElement.dataset.theme='sombre';});
  await page.waitForFunction(c=>{const s=Sim.direct.etatVue().couleurs;return s&&s.fond!==c;},e0.couleurs.fond);
  const sombre=await dessinee(),lg=await page.evaluate(()=>['.dl-repas','.dl-equipement','.dl-sale'].map(s=>'rgb('+OrlyDirectDessin.rvb(getComputedStyle(document.querySelector('#direct-legende '+s)).backgroundColor).join(',')+')'));
  for(const [i,n] of ['repas','equipement','sale'].entries())assert.ok(proche(rvb(lg[i]),rvb(sombre.couleurs[n]),2),'en sombre, « '+n+' » : '+lg[i]+' / '+sombre.couleurs[n]);
  await page.evaluate(()=>{delete document.documentElement.dataset.theme;});

  // 9. À plat, la légende des chariots n'est pas montrée : elle parle de la scène en relief.
  await nav.vueDuPlan(page,'plat');
  assert.equal(await page.evaluate(()=>document.getElementById('direct-legende').offsetParent),null,'à plat, pas de légende de la scène');
  await nav.vueDuPlan(page,'relief');
  await page.waitForFunction(()=>document.getElementById('direct-legende').offsetParent!==null);

  // 10. La version 2 n'a rien de cela.
  await page.goto(pathToFileURL(path.resolve(__dirname,'../v2/index.html')).href);
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers);
  assert.deepEqual(await page.evaluate(()=>[typeof window.OrlyDirectEtat,!!document.getElementById('direct-tranche')]),['undefined',false]);

  assert.deepEqual(erreurs,[]);
  console.log('direct-circulation-browser : ok — la légende dit une couleur par nature et « un chariot = 50 repas », aux couleurs de la scène ; à sept heures de la journée, les chariots en file devant chaque service égaux aux stocks du résultat ('+vus.file+'), les lots en cours dans l’îlot de leur atelier ('+vus.enCours+'), un véhicule par tournée en route ; un véhicule du quai aux avions pendant son trajet et seulement là ; l’étiquette d’un vol chargé en retard au critique, avec son retard ; « Tout voir » avec l’aire des avions ; seul le tunnel qui lave s’anime ; la cadence de la ligne robotisée en clair ; la lecture et la pause ; le thème sombre ; rien à plat ni en version 2');
  x.effacer();
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

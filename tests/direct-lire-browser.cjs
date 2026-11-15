/* Évolution 16 (e) — lire la vue en direct et agir, dans la page (v1).
 * La journée s'ouvre au moment où le premier goulot commence à coincer ; le sol
 * de sa zone est critique, son contour pulse, son étiquette reprend la phrase
 * de la Synthèse. Sous la scène, la barre du temps ; « Point suivant » mène au
 * prochain moment à regarder. Un clic sur un service ouvre son détail dans le
 * panneau ; un clic sur un avion ou un chariot suit son vol — ses lots restent
 * nets, le reste pâlit, la phrase qui explique son retard s'affiche ; Échap
 * annule. La barre d'espace lit ou met en pause ; les flèches déplacent
 * l'heure ; la liste des services est une liste de boutons. Chaque étape attend
 * son effet, pas un délai. Unité et vols fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const proche=(a,b,jeu=3)=>a.every((v,i)=>Math.abs(v-b[i])<=jeu);
const hh=t=>{const m=((Math.round(t)%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1}),erreurs=[];
 page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
 const etat=()=>page.evaluate(()=>Sim.direct.etatVue());
 const dessinee=async()=>{await page.waitForFunction(()=>!Sim.direct.etatVue().enMouvement);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));return etat();};
 const heure=()=>page.evaluate(()=>Sim.vue.t);
 /** Va à une heure du rejeu (en pause), attend que la scène, la barre et le panneau la montrent. */
 const aLHeure=async t=>{await page.evaluate(t=>{Sim.vue.pause();Sim.vue.allerA(t);},t);await page.waitForFunction(t=>Math.abs(Sim.direct.etatVue().t-t)<1e-9&&Math.abs(Sim.directTemps.etat().t-t)<1e-9,t);return dessinee();};
 const pixel=(x,y)=>page.evaluate(([x,y])=>{const c=Sim.direct.toile,r=c.width/c.clientWidth;return [...c.getContext('2d').getImageData(Math.round(x*r),Math.round(y*r),1,1).data].slice(0,3);},[x,y]);
 /** Un point du sol d'une zone, à l'écran, libre de toute étiquette, de tout meuble et de toute personne. */
 const solLibre=id=>page.evaluate(id=>{const v=Sim.direct,e=v.etatVue(),z=v.site.zones.find(x=>x.id===id),pris=[...e.etiquettes,...e.vols,...e.circule.marques],mobiles=[...e.personnes,...e.circule.chariots];
   const meubles=[...(z.lignes||[]),...(z.tunnels||[]),...(z.rayonnages||[]),...v.ilots.filter(i=>i.zone===z.id)];
   for(const fy of [0.08,0.14,0.2,0.26,0.32,0.4,0.5,0.6,0.7,0.8,0.9])for(const fx of [0.5,0.3,0.7,0.15,0.85,0.4,0.6,0.22,0.78,0.08,0.92]){
     const x=z.x+z.w*fx,y=z.bande===0?z.y+z.h*(1-fy):z.y+z.h*fy,p=v.ecranDe(x,y,0);
     if(p[0]<6||p[1]<6||p[0]>e.ecran.w-6||p[1]>e.ecran.h-6)continue;
     if(pris.some(q=>p[0]>=q.x-4&&p[0]<=q.x+q.w+4&&p[1]>=q.y-4&&p[1]<=q.y+q.h+4))continue;
     if(meubles.some(m=>x>=m.x-0.7&&x<=m.x+m.w+0.7&&y>=m.y-0.7&&y<=m.y+m.h+0.7)||mobiles.some(m=>Math.hypot(m.x-x,m.y-y)<1))continue;
     return {X:p[0],Y:p[1]};}
   return null;},id);
 /** Les coordonnées d'un point de la toile, dans la page. */
 const surLaToile=async p=>{const b=await page.locator('#direct-toile').boundingBox();return {x:b.x+p.X,y:b.y+p.Y};};
 const panneau=()=>page.evaluate(()=>{const c=document.getElementById('direct-panneau-corps');return {texte:c.innerText,visible:c.offsetParent!==null,services:[...c.querySelectorAll('.dq-personnes [data-direct-service]')].map(b=>({id:b.dataset.directService,texte:b.closest('tr').innerText.replace(/\s+/g,' ').trim(),presse:b.getAttribute('aria-pressed'),balise:b.tagName,type:b.type,
     n:Object.fromEntries([...b.closest('tr').querySelectorAll('td[data-etat]')].map(td=>[td.dataset.etat,+td.textContent]))})),
   rubriques:[...c.querySelectorAll('h4')].map(h=>h.textContent),titre:(c.querySelector('.dp-titre')||{}).textContent||null,detail:(c.querySelector('.dp-detail')||{dataset:{}}).dataset.service||null,lignes:c.querySelectorAll('.dp-table tbody tr').length,
   focus:document.activeElement&&c.contains(document.activeElement)?(document.activeElement.dataset.directService||(document.activeElement.hasAttribute('data-direct-retour')?'retour':'autre')):null};});
 try{
  const sauvegarde=F.sauvegardeFictive(),CSV=F.volsCsv(),attendu=F.heureDOuvertureAttendue(sauvegarde,CSV);
  assert.ok(attendu.goulot&&attendu.t!==attendu.pic,'la journée fictive a un goulot, qui ne commence pas au pic de travail');
  const x=await F.charger(page,nav,URL,{sauvegarde,csv:CSV,pageId:'j-plan',relief:true});
  await page.waitForFunction(()=>window.Sim&&Sim.direct&&Sim.directTemps&&Sim.directPanneau&&Sim.direct.etatVue().images>0&&Sim.direct.etatVue().circule);

  // 1. À l'ouverture : l'heure rejouée est le moment où le premier goulot du jour commence à coincer.
  await page.waitForFunction(t=>Math.abs(Sim.vue.t-t)<1e-6,attendu.t);
  const e0=await dessinee(),G=attendu.goulot;
  assert.equal(e0.goulot.service,G.service,'le goulot du moment est le premier goulot du jour');
  assert.equal(e0.goulot.phrase,G.phrase,'sa phrase est celle de la Synthèse');
  assert.equal(e0.teintes[e0.goulot.zone],'critique','le sol de sa zone est critique');
  assert.ok(Object.values(e0.teintes).filter(v=>v==='neutre').length>=3,'les autres zones restent neutres');
  // Son étiquette reprend la phrase, en critique ; les zones où il n'y a personne ne disent que leur nom.
  const etq=e0.etiquettes.find(l=>l.id===e0.goulot.zone);
  assert.equal(etq.ton,'critique');
  assert.ok(etq.lignes.join(' ').startsWith(G.phrase),'l’étiquette du goulot reprend la phrase : '+etq.lignes.join(' | '));
  assert.ok(etq.lignes.every(l=>l.length<=40),'repliée en lignes courtes');
  assert.ok(e0.etiquettes.some(l=>l.lignes.length===0)&&e0.etiquettes.some(l=>/au travail/.test(l.lignes.join(' '))),'des zones vides au nom seul, des zones occupées avec leurs chiffres');
  assert.deepEqual(e0.recouvrements,[],'aucune étiquette n’en recouvre une autre');
  // Le sol critique se voit : le sol de la zone du goulot n'a pas la couleur d'un sol neutre.
  const pG=await solLibre(e0.goulot.zone);
  let pN=null;for(const z of Object.keys(e0.teintes).filter(z=>e0.teintes[z]==='neutre')){pN=await solLibre(z);if(pN)break;}
  assert.ok(pG&&pN,'un point libre du sol dans la zone du goulot ('+JSON.stringify(pG)+') et dans une zone neutre ('+JSON.stringify(pN)+')');
  const cG=await pixel(pG.X,pG.Y),cN=await pixel(pN.X,pN.Y);
  assert.ok(!proche(cG,cN,8),'le sol du goulot est teinté : '+cG+' / '+cN);
  assert.ok(cG[0]>cG[2]+8,'vers la couleur critique : '+cG);
  // Le contour pulse : la scène se redessine sans qu'on y touche.
  const i1=(await etat()).images;await page.waitForFunction(i=>Sim.direct.etatVue().images>i+10,i1);

  // 2. Le panneau : la liste des services est une liste de boutons (le nom de chaque service, dans la première des cinq
  //    réponses — évolution 16 f) ; le goulot y « coince », en toutes lettres.
  const p0=await panneau();
  assert.ok(p0.visible,'le panneau de la scène est là');
  assert.deepEqual(p0.services.map(s=>s.id),await page.evaluate(()=>Sim.direct.site.zones.flatMap(z=>z.services)),'un bouton par service, dans l’ordre des zones');
  assert.ok(p0.services.every(s=>s.balise==='BUTTON'&&s.type==='button'&&s.presse==='false'));
  assert.match(p0.services.find(s=>s.id===G.service).texte,/coince/);
  assert.equal(await page.evaluate(()=>document.getElementById('panel-suivi').offsetParent),null,'le panneau du plan dessiné laisse sa place');
  // Ses chiffres sont ceux de la scène.
  const lus=await page.evaluate(()=>OrlyDirectEtat.etatA(Sim.direct.journee,Sim.vue.t).services);
  for(const s of p0.services){const n=lus[s.id]||{auTravail:0,presents:0};assert.deepEqual([s.n.auTravail,s.n.presents],[n.auTravail,n.presents],s.id+' : au travail, présents');}

  // 3. « Point suivant » mène au début du goulot.
  await aLHeure(G.debut-10);
  assert.equal((await etat()).teintes[e0.goulot.zone],'neutre','dix minutes avant, la zone n’est pas encore critique');
  const point=page.locator('#direct-point');
  assert.ok(await point.isVisible()&&await point.isEnabled());
  assert.match(await point.getAttribute('title'),new RegExp('^Aller à J '+hh(G.debut)+' : '),'le bouton dit où il mène');
  await point.click();
  await page.waitForFunction(t=>Math.abs(Sim.vue.t-t)<1e-6,G.debut);
  const e3=await dessinee();
  assert.equal(await page.evaluate(()=>Sim.vue.enMarche),false,'on s’y arrête, en pause');
  assert.equal(e3.goulot.service,G.service);assert.equal(e3.teintes[e3.goulot.zone],'critique');
  assert.ok((await page.locator('#direct-annonce').textContent()).includes(G.phrase),'la page annonce le moment où l’on arrive');
  // De point en point, dans l'ordre du temps, jusqu'au dernier : le bouton se grise.
  await aLHeure(await page.evaluate(()=>Sim.vue.debut));
  const visites=[];
  for(let i=0;i<60&&await point.isEnabled();i++){const avant=await heure();await point.click();await page.waitForFunction(t=>Sim.vue.t>t,avant);visites.push(await heure());}
  const points=await page.evaluate(()=>{const v=Sim.vue,l=OrlyDirectLire.lire(Sim.direct.journee,{de:v.debut,a:v.fin}).points.map(p=>p.t).filter(t=>t>v.debut+0.5&&t<=v.fin);return l.filter((t,i)=>!i||t>l[i-1]+0.5);});
  assert.deepEqual(visites.map(t=>Math.round(t*100)),points.map(t=>Math.round(t*100)),'chaque moment à regarder, une fois, dans l’ordre');
  assert.ok(visites.length>=5&&await point.isDisabled(),'après le dernier, le bouton se grise');

  // Deux services coincent en même temps : celui du moment porte la phrase ; l'autre le dit en un mot, « coince ».
  const deux=await page.evaluate(()=>{const v=Sim.vue,lu=OrlyDirectLire.lire(Sim.direct.journee,{de:v.debut,a:v.fin});
    for(let t=v.debut;t<=v.fin;t+=5){const l=OrlyDirectLire.goulotsA(lu,t),zones=new Set(l.map(g=>(OrlyDirectScene.zoneDuService(Sim.direct.site,g.service)||{}).id));if(zones.size>=2)return {t,zones:[...zones]};}
    return null;});
  if(deux){const e=await aLHeure(deux.t),autre=deux.zones.find(z=>z!==e.goulot.zone),l=e.etiquettes.find(q=>q.id===autre);
    assert.equal(e.teintes[autre],'critique');
    assert.ok(l&&l.ton==='critique'&&l.lignes[0]==='coince','une zone critique qui n’est pas le goulot du moment dit « coince » : '+JSON.stringify(l));}

  // 4. Un clic sur un service ouvre son détail dans le panneau ; Échap le referme.
  await aLHeure(G.debut+60);
  const pA=await solLibre('armement'),cA=await surLaToile(pA);
  await page.mouse.click(cA.x,cA.y);
  await page.waitForFunction(()=>!!document.querySelector('#direct-panneau-corps .dp-detail[data-service="armement"]'));
  const p4=await panneau();
  assert.deepEqual(p4.rubriques,['Ses personnes','Ses équipes','Ses lots à faire','Ses arrivages en attente','Ses personnes sans travail','Sa courbe de charge']);
  assert.match(p4.titre,/^Armement à \d\d:\d\d$/);
  assert.equal(p4.lignes,await page.evaluate(()=>Sim.direct.journee.k.equipes.filter(e=>e.service==='armement').length),'une ligne par équipe');
  assert.equal(await page.locator('#direct-panneau-corps .dp-courbe svg').count(),1,'sa courbe de charge');
  assert.equal((await etat()).selection,'armement','la scène montre le service choisi');
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.querySelector('#direct-panneau-corps .dp-detail'));
  assert.equal((await etat()).selection,null);
  // Au clavier : la liste est faite de boutons ; Entrée ouvre le détail, le clavier le suit ; Échap revient au bouton.
  await page.locator(`#direct-panneau-corps .dq-personnes [data-direct-service="${G.service}"]`).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(s=>!!document.querySelector('#direct-panneau-corps .dp-detail[data-service="'+s+'"]'),G.service);
  const p5=await panneau();
  assert.equal(p5.focus,'retour','le clavier est sur « Tous les services »');
  assert.ok(p5.texte.includes('Coince')&&p5.texte.includes(G.phrase),'le détail dit pourquoi le service coince');
  assert.ok(await page.locator('#direct-panneau-corps .dp-liste li').count()>=1,'ses lots à faire, ses arrivages en attente');
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>!document.querySelector('#direct-panneau-corps .dp-detail'));
  assert.equal((await panneau()).focus,G.service,'revenu à la liste, le clavier reprend le bouton du service');
  // Panneau replié, un clic sur un service le déplie.
  await page.locator('#btn-en-ce-moment').click();
  await page.waitForFunction(()=>document.body.classList.contains('sans-en-ce-moment'));
  await dessinee();
  const pB=await solLibre('armement'),cB=await surLaToile(pB);
  await page.mouse.click(cB.x,cB.y);
  await page.waitForFunction(()=>!document.body.classList.contains('sans-en-ce-moment')&&!!document.querySelector('#direct-panneau-corps .dp-detail[data-service="armement"]'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.querySelector('#direct-panneau-corps .dp-detail'));

  // 5. Un clic sur un avion suit son vol : ses lots restent nets, le reste pâlit, la phrase de son retard s'affiche.
  const tard=attendu.reponses.exceptions.find(q=>q.type==='vol-en-retard');
  await aLHeure(tard.depart+5);
  const e5=await dessinee(),avion=e5.circule.avions.find(a=>a.id===tard.id);
  assert.ok(avion,'l’avion du vol en retard est là');
  // Un chariot qui n'est pas de ce vol, avant de le suivre : sa couleur à l'écran.
  const autre=await page.evaluate(vol=>{const v=Sim.direct,s=OrlyDirectLire.suivi(v.journee,vol),e=v.etatVue(),pris=[...e.etiquettes,...e.vols,...e.circule.marques];
    for(const o of v.circule.chariots){if(OrlyDirectLire.estDuVol(s,o)||o.enChemin)continue;const p=v.ecranDe(o.x,o.y,0.95);
      if(pris.some(q=>p[0]>=q.x-4&&p[0]<=q.x+q.w+4&&p[1]>=q.y-4&&p[1]<=q.y+q.h+4))continue;
      if(v.circule.chariots.some(q=>q!==o&&Math.hypot(q.x-o.x,q.y-o.y)<0.75)||v.personnes.some(q=>Math.hypot(q.x-o.x,q.y-o.y)<1))continue;
      return {X:p[0],Y:p[1]};}
    return null;},tard.id);
  const avantSuivi=autre?await pixel(autre.X,autre.Y):null;
  const pAv=await page.evaluate(([x,y])=>{const p=Sim.direct.ecranDe(x,y,0.6);return {X:p[0],Y:p[1]};},[avion.x,avion.y]),cAv=await surLaToile(pAv);
  await page.mouse.click(cAv.x,cAv.y);
  await page.waitForFunction(v=>{const s=Sim.direct.etatVue().suivi;return s&&s.vol===v;},tard.id);
  const e6=await dessinee();
  assert.ok(e6.suivi.nets>=1&&e6.suivi.pales>=5,'ses lots restent nets ('+e6.suivi.nets+'), le reste pâlit ('+e6.suivi.pales+')');
  assert.match(e6.suivi.phrase,new RegExp('^Vol '+tard.id+' \\('+hh(tard.depart)+'\\) chargé .+ après sa limite'),'la phrase qui explique son retard');
  const bandeau=page.locator('#direct-suivi');
  assert.ok(await bandeau.isVisible()&&(await bandeau.textContent()).includes(e6.suivi.phrase),'elle s’affiche sur la scène');
  assert.ok((await panneau()).texte.includes('Vol suivi : '+tard.id),'et dans le panneau');
  if(avantSuivi){const apresSuivi=await pixel(autre.X,autre.Y),sol=e6.couleurs.zone.match(/\d+/g).map(Number),d=c=>Math.hypot(c[0]-sol[0],c[1]-sol[1],c[2]-sol[2]);
    assert.ok(d(apresSuivi)<d(avantSuivi)-20,'un chariot d’un autre vol pâlit : '+avantSuivi+' → '+apresSuivi);}
  // Échap annule ; un clic sur un chariot suit aussi son vol.
  await page.locator('#direct-toile').focus();
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!Sim.direct.etatVue().suivi);
  assert.ok(await bandeau.isHidden());
  const chariot=await page.evaluate(()=>{const v=Sim.direct,e=v.etatVue(),pris=[...e.etiquettes,...e.vols,...e.circule.marques];
    for(const o of v.circule.chariots){if(o.ton==='sale')continue;const p=v.ecranDe(o.x,o.y,0.5);
      if(p[0]<6||p[1]<6||p[0]>e.ecran.w-6||p[1]>e.ecran.h-60||pris.some(q=>p[0]>=q.x-4&&p[0]<=q.x+q.w+4&&p[1]>=q.y-4&&p[1]<=q.y+q.h+4))continue;
      const sous=v.sous(p[0],p[1]);if(!sous||sous.quoi!=='chariot')continue;
      return {X:p[0],Y:p[1],vol:OrlyDirectLire.volDe(v.journee,sous)};}
    return null;});
  assert.ok(chariot&&chariot.vol,'un chariot à cliquer');
  const cC=await surLaToile(chariot);
  await page.mouse.click(cC.x,cC.y);
  await page.waitForFunction(v=>{const s=Sim.direct.etatVue().suivi;return s&&s.vol===v;},chariot.vol);
  await page.locator('#direct-suivi [data-direct-nesuivre]').click();
  await page.waitForFunction(()=>!Sim.direct.etatVue().suivi);

  // 6. La barre d'espace lit et met en pause — sur la scène comme sur la barre du temps.
  await aLHeure(G.debut);
  await page.locator('#direct-toile').focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(t=>Sim.vue.enMarche&&Sim.vue.t>t,G.debut);
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>!Sim.vue.enMarche);
  const t6=await heure();await dessinee();assert.equal(await heure(),t6,'en pause, l’heure ne bouge plus');
  await page.locator('#direct-temps').focus();
  await page.keyboard.press('Space');await page.waitForFunction(()=>Sim.vue.enMarche);
  await page.keyboard.press('Space');await page.waitForFunction(()=>!Sim.vue.enMarche);

  // 7. La barre du temps : les flèches déplacent l'heure ; un clic y mène ; un repère par départ de vol ; les jours.
  await aLHeure(600);
  const barre=page.locator('#direct-temps');
  assert.equal(await barre.getAttribute('role'),'slider');
  await barre.focus();
  await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>Sim.vue.t===615);
  await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowLeft');await page.waitForFunction(()=>Sim.vue.t===585);
  await page.keyboard.press('Shift+ArrowRight');await page.waitForFunction(()=>Sim.vue.t===645);
  await page.keyboard.press('Home');await page.waitForFunction(()=>Sim.vue.t===Sim.vue.debut);
  await page.keyboard.press('End');await page.waitForFunction(()=>Sim.vue.t===Sim.vue.fin);
  await aLHeure(600);
  const b7=await page.evaluate(()=>Sim.directTemps.etat());
  assert.match(await barre.getAttribute('aria-valuetext'),/^J 10:00 — \d+ personnes? au travail, \d+ arrivages? en attente$/);
  assert.equal(await barre.getAttribute('aria-valuenow'),'600');
  assert.deepEqual(b7.jours,['J−1','J']);
  const departs=await page.evaluate(()=>OrlyDirectEtat.volsDe(Sim.direct.journee.r).filter(v=>v.depart>=Sim.vue.debut&&v.depart<=Sim.vue.fin).map(v=>({id:v.id,tard:v.retard>0})));
  assert.equal(await page.locator('#direct-temps .dt-vol').count(),departs.length,'un repère par départ de vol');
  assert.equal(await page.locator('#direct-temps .dt-vol-retard').count(),departs.filter(v=>v.tard).length,'ceux des vols en retard, en critique');
  assert.equal(await page.locator('#direct-temps .dt-aire').count(),1);assert.equal(await page.locator('#direct-temps .dt-ligne').count(),1);
  // Le trait de l'heure est à sa place ; un clic sur la barre y mène.
  const bb=await barre.boundingBox(),xDe=t=>b7.x0+(t-b7.de)/(b7.a-b7.de)*(b7.x1-b7.x0);
  assert.ok(Math.abs(b7.x-xDe(600))<0.6);
  await page.mouse.click(bb.x+xDe(900),bb.y+30);
  await page.waitForFunction(()=>Math.abs(Sim.vue.t-900)<3);
  // Le curseur du lecteur laisse sa place à la barre.
  assert.equal(await page.evaluate(()=>document.getElementById('sim-curseur').offsetParent),null);

  // 8. Un goulot qui dépasse son horaire : « Montage : l'équipe … finit à hh:mm pour hh:mm ».
  //    Les heures sup permises, le montage finit 20 min après son horaire (sa présence est raccourcie pour cela).
  const depasse=await F.faireDepasser(page,20,'mo');
  const hs=await page.evaluate(()=>{const avant=Sim.reglages.etat.heuresSup;Sim.reglages.changer(()=>{Sim.reglages.etat.heuresSup={actif:true,plafond:120};},'');return avant||null;});
  await page.waitForFunction(()=>{const r=Sim.reponses();return !!r&&r.coince.goulots.some(g=>g.equipe)&&(Sim.direct.rendre(),Sim.direct.journee&&Sim.direct.journee.reponses===r);});
  const g8=await page.evaluate(()=>{const v=Sim.vue,g=OrlyDirectLire.lire(Sim.direct.journee,{de:v.debut,a:v.fin}).goulots.find(x=>x.equipe);return {service:g.service,phrase:g.phrase,de:g.equipe.finHoraire,a:g.equipe.fin};});
  assert.match(g8.phrase,/^Montage : l’équipe .+ finit à \d\d:\d\d pour \d\d:\d\d$/);
  const e8=await aLHeure((g8.de+g8.a)/2);
  assert.equal(e8.goulot.service,g8.service);assert.equal(e8.goulot.phrase,g8.phrase);
  assert.ok(e8.etiquettes.find(l=>l.id===e8.goulot.zone).lignes.join(' ').startsWith(g8.phrase),'l’étiquette reprend la phrase');
  assert.equal(e8.teintes[e8.goulot.zone],'critique');
  await page.evaluate(h=>Sim.reglages.changer(()=>{if(h)Sim.reglages.etat.heuresSup=h;else delete Sim.reglages.etat.heuresSup;},''),hs);
  await F.retablirEquipe(page,depasse);
  await page.waitForFunction(()=>{const r=Sim.reponses();return !!r&&!r.coince.goulots.some(g=>g.equipe)&&(Sim.direct.rendre(),Sim.direct.journee&&Sim.direct.journee.reponses===r);});

  // 9. Avec « réduire les animations », le contour ne pulse pas : la scène ne se redessine pas seule.
  await page.emulateMedia({reducedMotion:'reduce'});
  await aLHeure(G.debut+30);
  const i9=(await dessinee()).images;await page.evaluate(()=>new Promise(r=>setTimeout(r,250)));
  assert.equal((await etat()).images,i9,'au repos, plus aucune image');
  assert.equal((await etat()).teintes[e0.goulot.zone],'critique','la zone reste critique');
  await page.emulateMedia({reducedMotion:'no-preference'});

  // 10. À plat : ni barre du temps, ni « Point suivant », ni panneau de la scène ; le curseur du lecteur revient.
  await nav.vueDuPlan(page,'plat');
  assert.deepEqual(await page.evaluate(()=>['direct-temps','direct-point','direct-panneau'].map(i=>document.getElementById(i).offsetParent===null)),[true,true,true]);
  assert.ok(await page.evaluate(()=>document.getElementById('sim-curseur').offsetParent!==null&&document.getElementById('panel-suivi').offsetParent!==null));
  await nav.vueDuPlan(page,'relief');
  await page.waitForFunction(()=>document.getElementById('direct-temps').offsetParent!==null);

  // 11. La version 2 n'a rien de cela.
  await page.goto(pathToFileURL(path.resolve(__dirname,'../v2/index.html')).href);
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers);
  assert.deepEqual(await page.evaluate(()=>[typeof window.OrlyDirectLire,typeof window.OrlyDirectTemps,!!document.getElementById('direct-temps'),!!document.getElementById('direct-point')]),['undefined','undefined',false,false]);

  assert.deepEqual(erreurs,[]);
  console.log('direct-lire-browser : ok — à l’ouverture, l’heure où le premier goulot commence à coincer ('+hh(attendu.t)+', et non le pic à '+hh(attendu.pic)+') : sa zone critique, son contour qui pulse, son étiquette à la phrase de la Synthèse ; le panneau en liste de boutons ; « Point suivant » jusqu’au début du goulot, puis de point en point ('+visites.length+') ; le clic sur un service ouvre son détail (six rubriques), au clavier aussi, panneau replié aussi ; le clic sur un avion ou un chariot suit son vol (ses lots nets, le reste pâli, la phrase de son retard), Échap annule ; la barre d’espace lit et met en pause ; les flèches déplacent l’heure sur la barre du temps, ses repères et ses jours ; « l’équipe … finit à … pour … » ; sans animation ; rien à plat ni en version 2');
  x.effacer();
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

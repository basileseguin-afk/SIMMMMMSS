/* Évolution 16 (f) — les cinq réponses, à côté de la scène, dans la page (v1).
 * Le panneau de la vue en direct répond aux cinq questions de l'évolution 15, à
 * l'heure rejouée : à une heure donnée, ses chiffres égalent ceux du module.
 * Avec deux essais retenus, le choix « Référence / Essai » rejoue l'un ou
 * l'autre : changer d'essai garde l'heure rejouée. Sur un écran étroit, le
 * panneau passe sous la scène. Chaque étape attend son effet, pas un délai.
 * Unité et vols fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const hh=t=>{const m=((Math.round(t)%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');};
const net=s=>String(s).replace(/\s+/g,' ').trim();

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1}),erreurs=[];
 page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
 const etat=()=>page.evaluate(()=>Sim.direct.etatVue());
 const dessinee=async()=>{await page.waitForFunction(()=>!Sim.direct.etatVue().enMouvement);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));return etat();};
 /** Ce que dit le panneau : ses questions, les lignes de la première et de la troisième, ses boutons. */
 const panneau=()=>page.evaluate(()=>{const c=document.getElementById('direct-panneau-corps'),texte=e=>(e?e.innerText:'').replace(/\s+/g,' ').trim();
   const q=n=>c.querySelector('.dq-question[data-question="'+n+'"]');
   return {questions:[...c.querySelectorAll('.dq-question')].map(s=>+s.dataset.question),titres:[...c.querySelectorAll('.dq-question h3')].map(texte),
     heure:texte(c.querySelector('.dq-question[data-question="1"] h3 small')),
     personnes:[...c.querySelectorAll('.dq-personnes tbody tr')].map(tr=>({id:tr.querySelector('[data-direct-service]').dataset.directService,nom:texte(tr.querySelector('[data-direct-service]')),ton:texte(tr.querySelector('.dq-ton')),
       n:Object.fromEntries([...tr.querySelectorAll('td[data-etat]')].map(td=>[td.dataset.etat,+td.textContent]))})),
     unite:Object.fromEntries([...c.querySelectorAll('.dq-personnes tfoot td[data-etat]')].map(td=>[td.dataset.etat,+td.textContent])),
     jour:texte(c.querySelector('.dq-jour')),coincent:q(2)?[...q(2).querySelectorAll('.dq-liste.dq-critique [data-direct-service]')].map(b=>({id:b.dataset.directService,texte:texte(b)})):[],q2:texte(q(2)),
     fins:[...c.querySelectorAll('.dq-fins tbody tr')].map(tr=>[...tr.children].map(texte)),q4:texte(q(4)),q5:texte(q(5)),
     essais:q(5)?[...q(5).querySelectorAll('[data-direct-essai]')].map(b=>({cle:b.dataset.directEssai,nom:texte(b),presse:b.getAttribute('aria-pressed')})):[]};});
 /** Va à une heure du rejeu (en pause), attend que la scène et le panneau la montrent. */
 const aLHeure=async t=>{await page.evaluate(t=>{Sim.vue.pause();Sim.vue.allerA(t);},t);
   await page.waitForFunction(([t,h])=>Math.abs(Sim.direct.etatVue().t-t)<1e-9&&((document.querySelector('#direct-panneau-corps .dq-question[data-question="1"] h3 small')||{}).textContent||'').includes(h),[t,hh(t)]);return dessinee();};
 /** Ce que dit le module à l'heure `t`, pour la journée que rejoue la scène. */
 const module=t=>page.evaluate(t=>{const v=Sim.direct,j=v.journee,e=OrlyDirectEtat.etatA(j,t),lu=OrlyDirectLire.lire(j,{de:Sim.vue.debut,a:Sim.vue.fin}),rep=j.reponses,S=OrlySyntheseVue;
   const texte=h=>{const d=document.createElement('div');d.innerHTML=h;document.body.appendChild(d);const s=d.innerText.replace(/\s+/g,' ').trim();d.remove();return s;};
   return {services:v.site.zones.flatMap(z=>z.services).map(id=>({id,n:Object.fromEntries(['auTravail','enPause','sansTravail','presents'].map(m=>[m,(e.services[id]||{})[m]||0]))})),
     coincent:OrlyDirectLire.goulotsA(lu,t).map(g=>({id:g.service,texte:g.phrase})),phrase:S.phrases(rep)[0],coince:texte(S.carteCoince(rep).corps),retard:texte(S.carteRetard(rep).corps),
     fins:rep.fins.services.map(s=>({nom:s.nom,fin:S.heure(s.fin),horaire:S.heure(s.finHoraire),sup:s.heuresSup.total>0?S.duree(s.heuresSup.total):'—'})),memesReponses:rep===Sim.reponses()};},t);
 const verifier=async(t,mot)=>{
   await aLHeure(t);const p=await panneau(),m=await module(t);
   assert.equal(p.heure,'à '+await page.evaluate(t=>MoteurProduction.hhmm(t),t),mot+'l’heure rejouée (la veille dit son jour)');
   // 1. Les personnes par service : au travail, en pause, sans travail, présents — et l'unité, leur somme.
   assert.deepEqual(p.personnes.map(s=>s.id),m.services.map(s=>s.id),mot+'un service par ligne, dans l’ordre des zones');
   for(const [i,s] of m.services.entries())assert.deepEqual(p.personnes[i].n,s.n,mot+s.id+' : ses personnes par état');
   for(const e of ['auTravail','enPause','sansTravail','presents'])assert.equal(p.unite[e],m.services.reduce((n,s)=>n+s.n[e],0),mot+'l’unité : '+e);
   assert.equal(p.jour,'Sur la journée : '+m.phrase,mot+'la réponse de la journée');
   // 2. Où ça coince : à cette heure, et sur la journée (la carte de la Synthèse).
   assert.deepEqual(p.coincent,m.coincent,mot+'ce qui coince à cette heure');
   assert.equal(/Rien ne coince à cette heure\./.test(p.q2),m.coincent.length===0);
   assert.ok(p.q2.includes(m.coince),mot+'sur la journée : la carte de la Synthèse');
   for(const g of m.coincent)assert.equal(p.personnes.find(s=>s.id===g.id).ton,'coince',mot+g.id+' : « coince », en toutes lettres');
   // 3. La fin de chaque service et ses heures sup.
   assert.equal(p.fins.length,m.fins.length,mot+'une ligne par service et jour de travail');
   for(const [i,f] of m.fins.entries()){assert.ok(p.fins[i][0].startsWith(f.nom),mot+f.nom);assert.ok(p.fins[i][1].startsWith(f.fin));assert.equal(p.fins[i][2],f.horaire);assert.equal(p.fins[i][3],f.sup);}
   // 4. Ce qui part en retard, avec la cause.
   assert.ok(p.q4.includes(m.retard),mot+'la carte « Ce qui part en retard » de la Synthèse');
   return {p,m};};
 try{
  const x=await F.charger(page,nav,URL,{pageId:'j-plan',relief:true});
  await page.waitForFunction(()=>window.Sim&&Sim.direct&&Sim.directPanneau&&Sim.direct.etatVue().images>0&&document.querySelectorAll('#direct-panneau-corps .dq-question').length===5);

  // 1. Les cinq questions, dans l'ordre de l'évolution 15.
  const p0=await panneau();
  assert.deepEqual(p0.questions,[1,2,3,4,5]);
  assert.deepEqual(p0.titres.map(t=>t.replace(/ à \d\d:\d\d$/,'')),['1. Les personnes','2. Où ça coince','3. La fin de chaque service','4. Ce qui part en retard','5. Ce que change l’essai']);

  // 2. À plusieurs heures, les chiffres du panneau égalent ceux du module.
  const ouverture=await page.evaluate(()=>Sim.vue.t);
  let vus={coincent:0,calmes:0};
  for(const t of [ouverture,-120,190,560,1000,1240]){const {m}=await verifier(t,'à '+hh(t)+' : ');assert.ok(m.memesReponses,'les réponses de la page');if(m.coincent.length)vus.coincent++;else vus.calmes++;}
  assert.ok(vus.coincent>=2&&vus.calmes>=1,'des heures où ça coince, des heures calmes : '+JSON.stringify(vus));
  // Le nom d'un service est un bouton : il ouvre son détail ; revenu, les cinq réponses sont là.
  await page.locator('#direct-panneau-corps .dq-personnes [data-direct-service="armement"]').click();
  await page.waitForFunction(()=>!!document.querySelector('#direct-panneau-corps .dp-detail[data-service="armement"]'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.querySelectorAll('#direct-panneau-corps .dq-question').length===5);

  // 3. Sans essai retenu : la cinquième question dit comment en retenir deux ; pas de choix.
  assert.deepEqual(p0.essais,[]);assert.match(p0.q5,/Retenez deux essais/);
  assert.ok(await page.locator('#direct-essai').isHidden());

  // 4. Deux essais : la référence (une personne à l'armement), puis l'essai (trois). Les effectifs sont ceux qu'on saisit.
  await nav.effectifSaisi(page);
  await page.waitForFunction(()=>{const e=Sim.ateliers.state.ateliers.find(a=>a.id==='ar'),v=Sim.ateliers.resultat.ateliers.find(a=>a.id==='ar');return v.personnes===e.personnes;});
  await nav.aller(page,'j-comparer');
  await page.locator('#snap-a').click();
  const avant=await page.evaluate(()=>Sim.ateliers.resultat.ateliers.find(a=>a.id==='ar').personnes);
  assert.ok(avant>=1&&avant!==3,'la référence : '+avant+' personne à l’armement');
  await page.evaluate(()=>{window.__r=Sim.ateliers.resultat;Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id==='ar').personnes=3;},'');});
  await page.waitForFunction(()=>Sim.ateliers.resultat!==window.__r&&Sim.ateliers.resultat.ateliers.find(a=>a.id==='ar').personnes===3);
  await page.locator('#snap-b').click();
  await page.waitForFunction(()=>!!Sim.essais());
  await nav.aller(page,'j-plan',{relief:true});
  await page.waitForFunction(()=>document.querySelectorAll('#direct-panneau-corps [data-direct-essai]').length===2);
  const T=400;await aLHeure(T);
  const p4=await panneau();
  assert.deepEqual(p4.essais,[{cle:'A',nom:'Référence',presse:'false'},{cle:'B',nom:'Essai',presse:'false'}],'le choix « Référence / Essai »');
  assert.match(p4.q5,/La scène rejoue la journée en cours\./);
  assert.ok(p4.q5.includes(await page.evaluate(()=>{const d=document.createElement('div');d.innerHTML=OrlySyntheseVue.carteEssai(Sim.essais()).corps;document.body.appendChild(d);const s=d.innerText.replace(/\s+/g,' ').trim();d.remove();return s;})),'la carte « Ce que change l’essai » de la Synthèse');
  const personnesAr=()=>page.evaluate(()=>({resultat:Sim.direct.journee.r.ateliers.find(a=>a.id==='ar').personnes,ilot:Sim.direct.etatVue().ilots.find(i=>i.atelier==='ar').places,t:Sim.vue.t}));
  assert.equal((await personnesAr()).resultat,3,'la journée en cours : trois personnes à l’armement');

  // 5. « Référence » rejoue l'essai A à la même heure ; « Essai », l'essai B ; changer d'essai garde l'heure rejouée.
  await page.locator('#direct-panneau-corps [data-direct-essai="A"]').click();
  await page.waitForFunction(()=>Sim.direct.rendre()||Sim.direct.journee.r.ateliers.find(a=>a.id==='ar').personnes!==3);
  await dessinee();
  const a=await personnesAr();
  assert.equal(a.t,T,'changer d’essai garde l’heure rejouée');
  assert.equal(a.resultat,avant,'la scène rejoue la référence : '+avant+' personne à l’armement');
  assert.equal(a.ilot,Math.max(1,avant),'son îlot a les places de la référence');
  const pA=await panneau();
  assert.equal(pA.essais.find(b=>b.cle==='A').presse,'true');assert.match(pA.q5,/La scène rejoue la référence \(l’essai A\), à la même heure\./);
  const bandeau=page.locator('#direct-essai');
  assert.ok(await bandeau.isVisible()&&/rejoue la référence/.test(await bandeau.textContent()),'la scène dit quelle journée elle rejoue');
  await verifier(T,'la référence : ');
  assert.equal(await page.evaluate(()=>Sim.direct.journee.reponses===Sim.essais().A),true,'les réponses du panneau sont celles de la référence');
  // « Essai » : l'essai B, à la même heure — même pendant la lecture, l'heure continue sans revenir au début.
  await aLHeure(T);
  await page.locator('#direct-panneau-corps [data-direct-essai="B"]').click();
  await page.waitForFunction(()=>Sim.direct.rendre()||Sim.direct.journee.reponses===Sim.essais().B);
  await dessinee();
  const b=await personnesAr();
  assert.deepEqual([b.t,b.resultat,b.ilot],[T,3,3],'l’essai, à la même heure');
  assert.equal((await panneau()).essais.find(q=>q.cle==='B').presse,'true');
  await page.evaluate(()=>Sim.vue.lancer());
  await page.waitForFunction(t=>Sim.vue.t>t+2,T);
  const enCours=await page.evaluate(()=>Sim.vue.t);
  await page.locator('#direct-panneau-corps [data-direct-essai="A"]').click();
  await page.waitForFunction(()=>Sim.direct.rendre()||Sim.direct.journee.reponses===Sim.essais().A);
  assert.ok(await page.evaluate(()=>Sim.vue.t)>=enCours,'en lecture, changer d’essai ne ramène pas l’heure en arrière');
  await page.evaluate(()=>Sim.vue.pause());
  // Le même choix une seconde fois, ou « Journée en cours » sur la scène : la journée en cours.
  await page.locator('#direct-essai [data-direct-essai]').click();
  await page.waitForFunction(()=>Sim.direct.rendre()||Sim.direct.journee.reponses===Sim.reponses());
  assert.ok(await bandeau.isHidden());
  await page.waitForFunction(()=>[...document.querySelectorAll('#direct-panneau-corps [data-direct-essai]')].every(q=>q.getAttribute('aria-pressed')==='false'));
  // Les essais effacés pendant qu'on en rejoue un : la scène revient à la journée en cours.
  await page.locator('#direct-panneau-corps [data-direct-essai="A"]').click();
  await page.waitForFunction(()=>Sim.direct.rendre()||Sim.direct.journee.reponses===Sim.essais().A);
  await nav.aller(page,'j-comparer');await page.locator('#snap-clear').click();
  await nav.aller(page,'j-plan',{relief:true});
  await page.waitForFunction(()=>Sim.direct.rendre()||(Sim.direct.journee.reponses===Sim.reponses()&&document.querySelectorAll('#direct-panneau-corps [data-direct-essai]').length===0));
  assert.ok(await bandeau.isHidden());

  // 6. Sur un écran étroit, le panneau passe sous la scène : la scène garde la largeur.
  await page.setViewportSize({width:1024,height:800});
  if(await page.evaluate(()=>document.body.classList.contains('sans-en-ce-moment')))await page.locator('#btn-en-ce-moment').click();
  await page.waitForFunction(()=>!document.body.classList.contains('sans-en-ce-moment')&&document.getElementById('direct-panneau').offsetParent!==null);
  const etroit=await page.evaluate(()=>{const r=i=>document.getElementById(i).getBoundingClientRect(),s=r('direct-toile'),l=r('lecteur'),p=r('direct-panneau'),c=document.querySelector('.col-plan').getBoundingClientRect();
    return {toile:s.width,colonne:c.width,sousLeLecteur:p.top>=l.bottom-1,memeLargeur:Math.abs(p.width-c.width)<2,questions:document.querySelectorAll('#direct-panneau-corps .dq-question').length};});
  assert.ok(etroit.sousLeLecteur,'le panneau est sous la scène et ses commandes');
  assert.ok(etroit.memeLargeur&&etroit.toile>=etroit.colonne-2,'la scène garde toute la largeur : '+JSON.stringify(etroit));
  assert.equal(etroit.questions,5);
  await page.setViewportSize({width:1600,height:900});
  await page.waitForFunction(()=>{const p=document.getElementById('direct-panneau').getBoundingClientRect(),c=document.querySelector('.col-plan').getBoundingClientRect();return p.left>=c.right-1;});

  // 7. À plat, le panneau du plan dessiné revient ; la version 2 n'a rien de cela.
  await nav.vueDuPlan(page,'plat');
  assert.equal(await page.evaluate(()=>document.getElementById('direct-panneau').offsetParent),null);
  await page.goto(pathToFileURL(path.resolve(__dirname,'../v2/index.html')).href);
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers);
  assert.deepEqual(await page.evaluate(()=>[typeof window.OrlyDirectQuestions,!!document.getElementById('direct-panneau'),!!document.getElementById('direct-essai')]),['undefined',false,false]);

  assert.deepEqual(erreurs,[]);
  console.log('direct-questions-browser : ok — les cinq questions dans l’ordre ; à six heures de la journée, les chiffres du panneau égaux à ceux du module (les personnes par service et par état, l’unité, ce qui coince à cette heure et sur la journée, la fin et les heures sup de chaque service, ce qui part en retard) ; le nom d’un service ouvre son détail ; sans essai, pas de choix ; avec deux essais, « Référence » et « Essai » rejouent l’un ou l’autre à la même heure, en lecture aussi, la scène le dit ; les essais effacés, la journée en cours ; sur un écran étroit, le panneau sous la scène ; rien à plat ni en version 2');
  x.effacer();
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

/* Évolution 16 (c) — les ateliers et les personnes de la vue en direct, dans la
 * page (v1). La scène montre exactement les ateliers réglés dans « Équipes » :
 * un îlot par atelier, dans la zone de son service ; et exactement ses
 * personnes, dans l'état que disent les indicateurs de charge. Le « poste de
 * travail » d'une équipe (tables, trolleys, machine, rayonnages, aucun) se
 * règle dans sa fiche, se garde avec les ateliers, et ne change aucun calcul.
 * La légende dit les couleurs ; une ligne dit ce qui vient des réglages, du
 * moteur, et de la mise en scène. Chaque étape attend son effet, pas un délai.
 * Unité et vols fictifs. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const PHRASE='Les équipes et le nombre de personnes sont ceux de vos réglages ; le moteur calcule combien de personnes sont dans chaque état ; leurs déplacements sont une mise en scène.';
const compter=(l,f)=>l.reduce((m,x)=>{const k=f(x);m[k]=(m[k]||0)+1;return m;},{});

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1600,height:900}}),erreurs=[];
 page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
 const etat=()=>page.evaluate(()=>Sim.direct.etatVue());
 const dessinee=async()=>{await page.waitForFunction(()=>!Sim.direct.etatVue().enMouvement);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));return etat();};
 /** Va à une heure du rejeu, attend que la scène la montre. */
 const aLHeure=async t=>{await page.evaluate(t=>Sim.vue.allerA(t),t);await page.waitForFunction(t=>Sim.direct.etatVue().t===t,t);return dessinee();};
 const relief=async()=>{await nav.aller(page,'j-plan',{relief:true});await page.waitForFunction(()=>document.body.dataset.direct==='relief'&&Sim.direct.etatVue().images>0);return dessinee();};
 const journee=()=>page.evaluate(()=>JSON.stringify(Sim.ateliers.resultat));
 const reglages=()=>page.evaluate(()=>Sim.ateliers.state.ateliers.map(a=>({id:a.id,service:a.service,poste:a.poste||null})));
 const fiche=async id=>{await nav.aller(page,'at-equipes');await page.evaluate(i=>{Sim.ateliers.ouvert=i;Sim.ateliers.rendre();},id);
   const champ=page.locator(`[data-at="${id}"] [data-at-champ=poste]`);await champ.waitFor();return champ;};
 try{
  const x=await F.charger(page,nav,URL,{pageId:'j-plan',relief:true});
  await page.waitForFunction(()=>window.Sim&&Sim.direct&&Sim.direct.etatVue().images>0&&Sim.direct.etatVue().ilots.length>0);

  // 1. Un îlot par atelier réglé, ni plus ni moins, dans la zone de son service.
  const e0=await dessinee(),regles=await reglages();
  assert.deepEqual(e0.ilots.map(i=>i.atelier),regles.map(a=>a.id),'un îlot par atelier, dans l’ordre des réglages');
  assert.deepEqual(compter(e0.ilots,i=>i.service),compter(regles,a=>a.service),'par service : autant d’îlots que d’ateliers');
  const zoneDe=await page.evaluate(()=>Object.fromEntries(Sim.direct.site.zones.flatMap(z=>z.services.map(s=>[s,z.id]))));
  for(const i of e0.ilots)assert.ok(i.zone===zoneDe[i.service]||(i.poste==='machine'&&i.zone==='food'),i.atelier+' dans la zone de son service');
  // Les postes par défaut : des tables, des trolleys à l'armement et à la dotation, une machine pour le robot et la plonge, des rayonnages au magasin.
  const poste=Object.fromEntries(e0.ilots.map(i=>[i.atelier,i.poste]));
  assert.deepEqual([poste.mo,poste.cu1,poste.ar,poste.do,poste.rb,poste.pl1,poste.mag],['tables','tables','trolleys','trolleys','machine','machine','rayonnages']);
  assert.ok(e0.ilots.find(i=>i.atelier==='mo').tables>=1&&e0.ilots.find(i=>i.atelier==='ar').tables===0);

  // 2. À plusieurs heures : les personnages de chaque atelier sont ses présents aux indicateurs, état par état.
  //    (Une étiquette ne dit ses chiffres que pour le service choisi, survolé, ou le goulot du moment — évolution 16,
  //    retouches : on choisit donc un service de la zone FOOD, le temps de lire son étiquette.)
  await page.locator('#direct-panneau-corps .dq-personnes [data-direct-service="prepa"]').click();
  await page.waitForFunction(()=>Sim.direct.etatVue().selection==='prepa');
  for(const t of [-120,190,367,500,720,1000]){
    const e=await aLHeure(t);
    const lus=await page.evaluate(t=>OrlyDirectEtat.etatA(Sim.direct.journee,t).equipes,t);
    for(const [id,p] of Object.entries(lus)){
      const siens=e.personnes.filter(q=>q.atelier===id&&!q.hors),mot=id+' à '+t;
      assert.equal(siens.length,p.presents,mot+' : ses présents');
      assert.deepEqual(['auTravail','enPause','sansTravail','enAppui'].map(m=>siens.filter(q=>q.etat===m).length),[p.auTravail,p.enPause,p.sansTravail,p.enAppui],mot+' : par état');
    }
    // La couleur suit l'état : au travail à l'accent, sans travail à l'avertissement, le reste au neutre.
    for(const q of e.personnes)assert.equal(q.ton,q.enChemin?'neutre':{auTravail:'travail',sansTravail:'attente',enAppui:'neutre',enPause:'neutre'}[q.etat],q.atelier+' : '+q.etat);
    // L'étiquette du service dit la même chose que la scène.
    const food=e.etiquettes.find(l=>l.id==='food'),dansFood=e.personnes.filter(q=>!q.hors&&['preparation','prepa'].includes(regles.find(a=>a.id===q.atelier).service));
    // (Sa ligne de chiffres : après la phrase du goulot quand la zone coince.)
    const chiffres=food&&food.lignes.find(l=>/au travail/.test(l));
    assert.equal(chiffres,dansFood.filter(q=>q.etat==='auTravail').length+' au travail / '+dansFood.length+(dansFood.length>1?' présents':' présent'),'FOOD à '+t);
  }
  await page.locator('#direct-panneau-corps [data-direct-retour]').click();
  await page.waitForFunction(()=>!Sim.direct.etatVue().selection);
  const midi=await aLHeure(190);
  assert.ok(midi.personnes.filter(q=>q.etat==='auTravail').length>=10&&midi.personnes.some(q=>q.etat==='sansTravail'),'à 03:10 : des personnes au travail, d’autres sans travail');
  // Pendant la pause du montage, ses personnes sont dans l'aire de pause.
  const pause=await aLHeure(367),aire=await page.evaluate(()=>Sim.direct.site.pause);
  const enPause=pause.personnes.filter(q=>q.atelier==='mo'&&q.etat==='enPause');
  assert.ok(enPause.length>=8&&enPause.every(q=>q.x>=aire.x&&q.x<=aire.x+aire.w&&q.y>=aire.y&&q.y<=aire.y+aire.h),'en pause : dans l’aire de pause');

  // 3. La légende, la phrase et les gestes de la caméra, dans un coin de la toile, repliables (évolution 19, retouche) ; à plat, la légende du plan dessiné.
  assert.deepEqual((await page.locator('#direct-legende > span').allInnerTexts()).slice(0,3),['au travail','sans travail','en pause, en appui ou en chemin'],'les personnes d’abord (les chariots suivent, partie d)');
  assert.equal(await page.locator('#direct-note').innerText(),PHRASE);
  assert.deepEqual([await page.locator('#direct-legende').isVisible(),await page.locator('#legende-plan').isVisible()],[true,false]);
  const places=()=>page.evaluate(()=>{const b=s=>document.querySelector(s).getBoundingClientRect(),d=document.getElementById('direct-coin');return {ouverte:d.open,coin:b('#direct-coin'),legende:b('#direct-legende'),note:b('#direct-note'),toile:b('#direct-toile'),
    aide:document.getElementById('direct-aide').checkVisibility(),bande:document.getElementById('plan-bande').offsetParent!==null,titre:d.querySelector('summary').textContent};});
  const depliee=await places();
  assert.deepEqual([depliee.ouverte,depliee.titre,depliee.aide,depliee.bande],[true,'Légende',true,false],'dépliée à l’ouverture ; plus de bande au-dessus de la scène');
  assert.ok(depliee.coin.left>=depliee.toile.left&&depliee.coin.bottom<=depliee.toile.bottom&&depliee.coin.left-depliee.toile.left<=16&&depliee.toile.bottom-depliee.coin.bottom<=16,'dans le coin de la toile');
  assert.ok(depliee.note.top>=depliee.legende.bottom-1&&depliee.note.width>200,'la phrase entière, sous la légende');
  assert.ok(await page.evaluate(()=>{const n=document.getElementById('direct-note');return n.scrollWidth<=n.clientWidth+1;}),'sans coupure');
  assert.match(await page.locator('#direct-aide').innerText(),/Glisser : se déplacer/);
  // Repliée : son seul titre ; la toile ne change pas de taille.
  const hauteurToile=()=>page.evaluate(()=>document.getElementById('direct-toile').clientHeight),h0=await hauteurToile();
  await page.locator('#direct-coin > summary').click();
  await page.waitForFunction(()=>!document.getElementById('direct-coin').open);
  const repliee=await places();
  assert.deepEqual([repliee.ouverte,repliee.aide,await page.locator('#direct-legende').isVisible(),await page.locator('#direct-note').isVisible()],[false,false,false,false],'repliée : la légende, la phrase et les gestes sont rangés');
  assert.ok(repliee.coin.height<=34&&await hauteurToile()===h0,'son seul titre ('+repliee.coin.height+' px), sans déplacer la scène');
  await page.locator('#direct-coin > summary').click();
  await page.waitForFunction(()=>document.getElementById('direct-coin').open);
  // Les pastilles ont les couleurs des personnes de la scène (les jetons du thème).
  const couleurs=await page.evaluate(()=>{const c=s=>getComputedStyle(document.querySelector(s)).backgroundColor,j=n=>{const e=document.createElement('span');e.style.color='var(--dv-'+n+')';document.getElementById('direct').appendChild(e);const v=getComputedStyle(e).color;e.remove();return v;};
    return [[c('.dl-travail'),j('travail')],[c('.dl-attente'),j('attente')],[c('.dl-neutre'),j('neutre')]];});
  for(const [pastille,scene] of couleurs)assert.equal(pastille,scene);
  await nav.vueDuPlan(page,'plat');
  assert.deepEqual([await page.locator('#direct-legende').isVisible(),await page.locator('#direct-note').isVisible(),await page.locator('#direct-coin').isVisible(),await page.locator('#legende-plan').isVisible()],[false,false,false,true]);

  // 4. Le poste de travail se règle dans la fiche de l'équipe : cinq choix, le défaut dit ; il ne change aucun calcul.
  //    (Les effectifs calculés de l'unité se posent au premier changement : la journée de référence est celle d'un
  //    changement neutre, et un second la laisse identique.)
  const neutre=()=>page.evaluate(()=>{Sim.ateliers.changer(()=>{},'');return JSON.stringify(Sim.ateliers.resultat);});
  const avant=await neutre();
  assert.equal(await neutre(),avant,'un changement neutre laisse la journée identique');
  const champ=await fiche('cu1');
  assert.deepEqual(await champ.locator('option').allInnerTexts(),['par défaut (des tables)','des tables','des trolleys','une machine','des rayonnages','aucun']);
  assert.equal(await champ.inputValue(),'');
  assert.match(await page.locator('[data-at="cu1"] label:has([data-at-champ=poste])').innerText(),/^Poste de travail, dans la vue en direct/);
  await champ.selectOption('trolleys');
  await page.waitForFunction(()=>Sim.ateliers.state.ateliers.find(a=>a.id==='cu1').poste==='trolleys');
  assert.equal(await journee(),avant,'la journée est la même, champ par champ');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ory-ateliers-v1')).ateliers.find(a=>a.id==='cu1').poste),'trolleys','gardé dans ce navigateur');
  assert.equal(await (await fiche('cu1')).inputValue(),'trolleys');
  // Le défaut d'une équipe de l'armement : des trolleys ; d'un robot : une machine.
  assert.equal(await (await fiche('ar')).locator('option').first().innerText(),'par défaut (des trolleys)');
  assert.equal(await (await fiche('rb')).locator('option').first().innerText(),'par défaut (une machine)');
  // La scène suit : la cuisine aux trolleys n'a plus de table ; toujours un îlot par atelier, les mêmes personnes.
  const e1=await relief(),cu1=e1.ilots.find(i=>i.atelier==='cu1');
  assert.deepEqual([cu1.poste,cu1.tables,e1.ilots.length],['trolleys',0,e0.ilots.length]);
  assert.equal((await aLHeure(190)).personnes.filter(q=>!q.hors).length,midi.personnes.filter(q=>!q.hors).length,'les mêmes personnes');

  // 5. Ajouter un atelier dans les réglages ajoute un îlot ; le retirer le retire.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state,m=st.ateliers.find(a=>a.id==='cu2');st.ateliers.push({...JSON.parse(JSON.stringify(m)),id:'cu9',nom:'Cuisine de renfort',lots:[]});},''));
  await page.waitForFunction(n=>Sim.direct.etatVue().ilots.length===n+1,e0.ilots.length);
  const e2=await dessinee();
  assert.deepEqual(e2.ilots.filter(i=>i.service==='cuisine').map(i=>i.atelier),['cu1','cu2','cu9']);
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;st.ateliers=st.ateliers.filter(a=>a.id!=='cu9');},''));
  await page.waitForFunction(n=>Sim.direct.etatVue().ilots.length===n,e0.ilots.length);

  // 6. Le nom de chaque atelier s'affiche à partir du zoom où il se lit.
  const loin=await dessinee();
  assert.ok(loin.camera.zoom<30&&loin.noms.length===0,'à « Tout voir » : pas de nom (zoom '+Math.round(loin.camera.zoom)+')');
  const food=await page.evaluate(()=>{const v=Sim.direct,i=v.ilots.find(i=>i.atelier==='mo'),p=v.ecranDe(i.x+i.w/2,i.y+i.h/2,0);return p;});
  await page.evaluate(p=>Sim.direct.zoomer(2.4,p[0],p[1],false),food);
  const pres=await dessinee();
  assert.ok(pres.camera.zoom>=30&&pres.noms.length>=1,'de près : les noms ('+pres.noms.join(', ')+')');
  const noms=await page.evaluate(()=>Sim.ateliers.state.ateliers.map(a=>a.nom));
  assert.ok(pres.noms.every(n=>noms.includes(n)),'ce sont les noms des ateliers réglés');
  await page.evaluate(()=>Sim.direct.toutVoir(false));

  // 7. « Tout sauvegarder » porte le poste de travail ; « Restaurer » le rend ; une sauvegarde d'avant, sans lui : les défauts.
  await nav.vue(page,'flux');await nav.aller(page,'u-sauvegarde');
  const dl=page.waitForEvent('download');await page.locator('#sauvegarde-export').click();
  const sauvegarde=JSON.parse(fs.readFileSync(await (await dl).path(),'utf8')),lu=v=>(typeof v==='string'?JSON.parse(v):v);
  assert.equal(lu(sauvegarde.contenu['ory-ateliers-v1']).ateliers.find(a=>a.id==='cu1').poste,'trolleys','dans la sauvegarde');
  const ancienne=JSON.parse(JSON.stringify(sauvegarde)),texte=typeof ancienne.contenu['ory-ateliers-v1']==='string';
  {const s=lu(ancienne.contenu['ory-ateliers-v1']);for(const a of s.ateliers)delete a.poste;ancienne.contenu['ory-ateliers-v1']=texte?JSON.stringify(s):s;}
  const restaurer=async(nom,contenu)=>{
    await page.locator('#sauvegarde-import').setInputFiles({name:nom,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(contenu))});
    assert.match(await page.locator('dialog.question[open] h2').textContent({timeout:5000}),/Restaurer cette sauvegarde/);
    const recharge=page.waitForEvent('load');await nav.repondre(page);await recharge;await page.waitForLoadState('load');
    await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.direct);
  };
  await restaurer('ory-sauvegarde-ancienne.json',ancienne);
  assert.ok((await reglages()).every(a=>a.poste===null),'une sauvegarde d’avant : aucun poste réglé');
  await F.importerVols(page,nav,x.fichier,'vols-fictifs.csv',F.volsCsv());
  const defauts=await relief();
  assert.deepEqual([defauts.ilots.find(i=>i.atelier==='cu1').poste,defauts.ilots.find(i=>i.atelier==='cu1').tables>=1],['tables',true],'les défauts');
  await nav.vue(page,'flux');await nav.aller(page,'u-sauvegarde');
  await restaurer('ory-sauvegarde.json',sauvegarde);
  assert.equal((await reglages()).find(a=>a.id==='cu1').poste,'trolleys','restauré');
  // Revenir au défaut dans la fiche retire le réglage.
  await (await fiche('cu1')).selectOption('');
  await page.waitForFunction(()=>!('poste' in Sim.ateliers.state.ateliers.find(a=>a.id==='cu1')));

  // 8. La version 2 n'a ni ce réglage ni cette vue.
  await page.goto(pathToFileURL(path.resolve(__dirname,'../v2/index.html')).href);
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers);
  assert.deepEqual(await page.evaluate(()=>[typeof window.OrlyDirectScene,!!document.getElementById('direct'),!!document.querySelector('[data-at-champ=poste]')]),['undefined',false,false]);

  assert.deepEqual(erreurs,[]);
  console.log('direct-ateliers-browser : ok — un îlot par atelier réglé, dans la zone de son service ; à six heures de la journée, les personnages de chaque atelier égaux à ses présents aux indicateurs, état par état, à leur couleur ; la pause dans l’aire de pause ; la légende et la phrase ; le poste de travail réglé dans la fiche, gardé, sans effet sur la journée ; un atelier ajouté, un îlot de plus ; les noms au zoom ; « Tout sauvegarder » et « Restaurer », une sauvegarde d’avant aux défauts ; la version 2 sans rien de cela');
  x.effacer();
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

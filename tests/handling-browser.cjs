/* Le handling dans l'interface : il se pose sur un chemin comme un service,
 * mais sa case charge des vols (retour d'usage du 28/09). Il a son service à
 * lui, « Handling » : la zone « handling » du plan est CF départ food, le
 * service des checkeurs (retour d'usage du 05/10). */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();

  // 0. Sans handling, la page des départs le dit, et propose de le mettre en place.
  await nav.aller(page,'v-departs');
  assert.match(await page.locator('#vols-handling').innerText(),/Pas de handling pour l’instant/);
  assert.equal(await page.locator('[data-vh-action=brancher]').count(),1);
  // Le service du handling, à côté de CF départ food.
  const H=await page.evaluate(()=>Sim.ateliers.a.creerHandling());await attendre();
  assert.ok(H&&H!=='handling','un service Handling à lui');
  await page.evaluate(h=>{window.H=h;},H);   // lu aussi dans la page

  // 1. Sur le chemin d'AF · Business, on ajoute le handling : sa case est un handling, partagé.
  await nav.aller(page,'at-chemins');
  await page.locator('[data-pc-action=cmd][data-classe="AF/BC"]').click();await attendre();
  // Elle suit un flux partagé : on lui fait sa variante, modifiable sur place.
  if(await page.locator('[data-pc-action=flux-variante]').count()){await page.locator('[data-pc-action=flux-variante]').click();await attendre();}
  await page.selectOption('[data-pc-champ=noeud-ajout]',H);await attendre();
  const cases=await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>a.service===H));
  assert.equal(cases.length,1);
  assert.equal(cases[0].type,'handling');
  assert.deepEqual(cases[0].lots,[],'pas de liste de commandes');
  const id=cases[0].id;
  // Une seconde commande qui passe par le handling ne crée pas de seconde case.
  await page.locator('[data-pc-action=cmd][data-classe="AF/YC"]').click();await attendre();
  // Elle suit un flux partagé : on lui fait sa variante, modifiable sur place.
  if(await page.locator('[data-pc-action=flux-variante]').count()){await page.locator('[data-pc-action=flux-variante]').click();await attendre();}
  await page.selectOption('[data-pc-champ=noeud-ajout]',H);await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>a.service===H).length),1,'un seul handling, partagé');

  // Une compagnie dont rien n'est construit n'est pas chargée (02/10) : une équipe
  // de repas prépare les commandes du jour, en très peu de temps.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'repas',nom:'Repas',service:'prepa',type:'manuel',debut:'00:00',jour:-1,personnes:50,pauses:[],
    lots:Sim.ateliers.classes.map(c=>[c.id]),minutes:Object.fromEntries(Sim.ateliers.classes.map(c=>[c.id,1])),regime:{actif:false}});},''));await attendre();

  // 2. Le calcul suit les vols : AF chargé, dans l'ordre des départs.
  const r=await page.evaluate(()=>{const r=Sim.ateliers.resultat;return {vols:r.vols.map(v=>({id:v.id,depart:v.depart,debut:v.debut,etat:v.etat})),k:r.indicateurs};});
  assert.ok(r.vols.length>0,'des vols suivis');
  const faits=r.vols.filter(v=>v.debut!=null);
  for(let i=1;i<faits.length;i++)assert.ok(faits[i].debut>=faits[i-1].debut,'ordre strict des départs');
  assert.equal(r.k.volsSuivis,r.vols.length);

  // 3. La fiche : type, vols en même temps, pas avant, durées par compagnie.
  await nav.aller(page,'at-equipes');
  await page.evaluate(id=>{Sim.ateliers.ouvert=id;Sim.ateliers.rendre();},id);await attendre();
  const fiche=page.locator(`[data-at="${id}"]`);
  assert.equal(await fiche.locator('[data-at-champ=type]').inputValue(),'handling');
  assert.equal(await fiche.locator('[data-at-champ=jour]').count(),0,'pas de choix du jour : le handling travaille le jour J');
  assert.match(await fiche.innerText(),/le jour J des vols/);
  await fiche.locator('[data-at-champ=avance]').fill('2');await fiche.locator('[data-at-champ=avance]').dispatchEvent('change');await attendre();
  assert.equal(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).avance,id),120,'saisi en heures, gardé en minutes');
  // Chaque compagnie des vols a sa ligne : sa durée se saisit directement.
  await page.locator(`[data-at="${id}"] [data-at-champ=duree][data-cie=AF]`).fill('50');
  await page.locator(`[data-at="${id}"] [data-at-champ=duree][data-cie=AF]`).dispatchEvent('change');await attendre();
  assert.equal(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).durees.AF,id),50);
  const af=await page.evaluate(()=>Sim.ateliers.resultat.vols.find(v=>v.cie==='AF'&&v.fin!=null));
  assert.ok(af&&Math.round(af.fin-af.debut)>=50,'un vol AF dure 50 min');
  // Les chauffeurs (retour d'usage : « 2 chauffeurs pour les long courrier, 1 pour les court ») :
  // un créneau, AF en long courrier ; un vol AF prend 2 chauffeurs, un TX 1.
  await page.locator(`[data-at="${id}"] [data-at-action=creneau-ajouter]`).click();await attendre();
  const cr=await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).creneaux,id);
  assert.equal(cr.length,1,'un créneau de chauffeurs');
  await page.locator(`[data-at="${id}"] [data-at-champ=creneau-de][data-index="0"]`).fill('00:00');
  await page.locator(`[data-at="${id}"] [data-at-champ=creneau-de][data-index="0"]`).dispatchEvent('change');await attendre();
  await page.locator(`[data-at="${id}"] [data-at-champ=creneau-a][data-index="0"]`).fill('23:59');
  await page.locator(`[data-at="${id}"] [data-at-champ=creneau-a][data-index="0"]`).dispatchEvent('change');await attendre();
  await page.locator(`[data-at="${id}"] [data-at-champ=creneau-n][data-index="0"]`).fill('6');
  await page.locator(`[data-at="${id}"] [data-at-champ=creneau-n][data-index="0"]`).dispatchEvent('change');await attendre();
  await page.locator(`[data-at="${id}"] select[data-at-champ=categorie][data-cie=AF]`).selectOption('long');await attendre();
  assert.deepEqual(await page.evaluate(id=>{const a=Sim.ateliers.state.ateliers.find(x=>x.id===id);return [a.longs,a.creneaux[0]];},id),[['AF'],{de:'00:00',a:'23:59',n:6}]);
  const parCie=await page.evaluate(()=>Object.fromEntries(Sim.ateliers.resultat.vols.filter(v=>v.chauffeurs).map(v=>[v.cie,[v.chauffeurs,v.categorie]])));
  assert.deepEqual(parCie.AF,[2,'long'],'un long courrier prend 2 chauffeurs');
  const court=Object.entries(parCie).find(([c])=>c!=='AF');
  assert.ok(court&&court[1][0]===1&&court[1][1]==='court','un court courrier en prend 1');
  await page.locator(`[data-at="${id}"] [data-at-champ=chauffeurs-long]`).fill('3');
  await page.locator(`[data-at="${id}"] [data-at-champ=chauffeurs-long]`).dispatchEvent('change');await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.resultat.vols.find(v=>v.cie==='AF'&&v.chauffeurs).chauffeurs),3,'réglable');
  assert.match(await fiche.innerText(),/récupère les trolleys prêts dans la CF départ/);
  // Le camion (retour d'usage : « chauffeurs par camion, vols par camion, et le temps = aller sur
  // la piste + charger l'avion + revenir à l'unité ») : chaque partie se règle, le total se lit.
  const champ=async(sel,v)=>{await page.locator(`[data-at="${id}"] ${sel}`).fill(String(v));await page.locator(`[data-at="${id}"] ${sel}`).dispatchEvent('change');await attendre();};
  await champ('[data-at-champ=temps][data-map=allers][data-cie="*"]',10);
  await champ('[data-at-champ=temps][data-map=retours][data-cie="*"]',12);
  await champ('[data-at-champ=temps][data-map=volsCamion][data-cie="*"]',2);
  // Propre à une compagnie (retour d'usage : « cela dépend de la compagnie »).
  const autre=await page.evaluate(id=>[...document.querySelectorAll(`[data-at="${id}"] [data-at-champ=temps][data-map=volsCamion]`)].map(i=>i.dataset.cie).find(c=>c!=='*'),id);
  await champ(`[data-at-champ=temps][data-map=volsCamion][data-cie="${autre}"]`,3);
  assert.deepEqual(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(x=>x.id===id).volsCamion,id),{[autre]:3});
  await champ('[data-at-champ=camions]',3);
  const h=await page.evaluate(id=>{const a=Sim.ateliers.state.ateliers.find(x=>x.id===id);return [a.allers,a.retours,a.volsParCamion,a.camions];},id);
  assert.deepEqual(h,[{'*':10},{'*':12},2,3]);
  const tr=await page.evaluate(()=>{const l=Sim.ateliers.resultat.lots.find(x=>x.handling&&x.trajet&&x.cie==='AF');return l&&[l.trajet.aller,l.trajet.dureeRetour,l.fin-l.trajet.depart];});
  assert.deepEqual(tr.slice(0,2),[10,12],'le trajet compte l’aller et le retour');
  assert.ok(tr[2]>=60,'AF : chargé après 10 min d’aller et 50 min de chargement');
  assert.match(await page.locator(`[data-at="${id}"] .at-cies-toutes`).innerText(),/\b\d+ min/,'le trajet total se lit');

  // 4. Les départs disent « chargé à », la synthèse compte les vols.
  await nav.aller(page,'v-departs');
  assert.match(await page.locator('#vols-handling').innerText(),/Handling : « .+ »[\s\S]*chargés? à l’heure sur/);
  // Les chemins qui n'y passent pas encore le reçoivent d'un geste, sans seconde case.
  const sans=await page.evaluate(()=>Sim.ateliers.state.parcours.filter(p=>!p.noeuds.includes(H)).length);
  if(sans){await page.locator('[data-vh-action=brancher]').click();await attendre();}
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.parcours.filter(p=>!p.noeuds.includes(H)).length),0);
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>a.type==='handling').length),1);
  // « Régler le handling » ouvre sa fiche.
  await page.locator('[data-vh-action=regler]').click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'at-equipes');
  assert.equal(await page.evaluate(()=>Sim.ateliers.ouvert),id);
  await nav.aller(page,'v-departs');
  assert.match(await page.locator('#flight-rows').innerText(),/chargé à \d\d:\d\d/);
  await nav.aller(page,'j-chiffres');
  assert.match(await page.locator('#bilan-journee').innerText(),/Vols chargés à l’heure/);

  // 5. Revenir à une équipe qui prépare efface les réglages du handling.
  await nav.aller(page,'at-equipes');
  await page.evaluate(id=>{Sim.ateliers.ouvert=id;Sim.ateliers.rendre();},id);await attendre();
  await page.locator(`[data-at="${id}"] [data-at-champ=type]`).selectOption('manuel');await attendre();
  const a=await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id),id);
  assert.equal(a.durees,undefined);assert.equal(a.simultanes,undefined);
  assert.deepEqual(await page.evaluate(()=>Sim.ateliers.resultat.vols),[]);

  // 6. Des cases de handling d'avant, une par commande (retour d'usage : « j'avais
  //    déjà ajouté du handling sur les chemins ») : le bandeau le dit, et les
  //    convertit en une seule case par vol.
  await page.evaluate(id=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;st.ateliers=st.ateliers.filter(a=>a.id!==id);
    for(const c of ['AF/BC','AF/YC'])st.ateliers.push({id:'vieux-'+c.replace('/',''),nom:'CF départ food '+c,service:H,type:'manuel',debut:c==='AF/BC'?'05:00':'04:30',
      jour:0,personnes:3,pauses:[],lots:[[c]],regime:{actif:true}});},''),id);
  await nav.aller(page,'v-departs');
  assert.match(await page.locator('#vols-handling').innerText(),/l’ancienne logique[\s\S]*2 cases le préparent commande par commande/);
  await page.locator('[data-vh-action=brancher]').click();await attendre();
  const apres=await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>a.service===H).map(a=>({type:a.type,debut:a.debut,lots:a.lots})));
  assert.deepEqual(apres,[{type:'handling',debut:'04:30',lots:[]}]);
  assert.match(await page.locator('#vols-handling').innerText(),/Handling : « .+ »/);
  assert.ok(await page.evaluate(()=>Sim.ateliers.resultat.vols.length>0),'les vols sont suivis');
  // 7. Même chose depuis l'Organisation, là où l'on travaille les chemins.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'vieux-TX',nom:'CF départ food TX',service:H,type:'manuel',
    debut:'05:00',jour:0,personnes:2,pauses:[],lots:[['TX/YC']],regime:{actif:true}});},''));
  await nav.aller(page,'at-chemins');
  assert.equal(await page.locator('#at-anomalies').evaluate(d=>d.open),true,'ouvert d’office');
  assert.match(await page.locator('#at-anomalies').innerText(),/1 case le prépare commande par commande/);
  await page.locator('#at-anomalies [data-at-action=handling-convertir]').click();await attendre();
  assert.deepEqual(await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>a.service===H).map(a=>a.type)),['handling'],'l’ancienne case rejoint le handling existant');
  assert.doesNotMatch(await page.locator('#at-anomalies').innerText(),/ancienne logique/);

  // La fenêtre de la case dans un chemin tient dans l'écran (retour d'usage : « la page est
  // beaucoup trop grande pour la taille de la fenêtre ») : rien ne dépasse, même à 1280 px.
  await page.setViewportSize({width:1280,height:720});
  await nav.aller(page,'at-chemins');
  const cmd=await page.evaluate(()=>Sim.ateliers.classes.find(c=>c.vols.length).id);
  await page.evaluate(cmd=>Sim.ateliers.parcours.ouvrir(cmd,H),cmd);await attendre();
  assert.equal(await page.locator('.pc-tiroir').count(),1,'la case du handling s’ouvre dans le chemin');
  {
    const debord=await page.evaluate(()=>{const t=document.querySelector('.pc-tiroir'),ts=t.querySelector('.at-cies-bloc .table-scroll');
      return {t:t.scrollWidth-t.clientWidth,doc:document.documentElement.scrollWidth-innerWidth,table:ts?ts.scrollWidth-ts.clientWidth:0};});
    assert.ok(debord.t<=1&&debord.doc<=1&&debord.table<=1,'rien ne dépasse de la fenêtre de la case : '+JSON.stringify(debord));
    assert.equal(await page.evaluate(()=>document.body.classList.contains('pc-tiroir-large')),true,'la fenêtre s’élargit pour le handling');
  }
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('handling-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

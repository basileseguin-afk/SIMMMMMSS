/* La légumerie, le magasin, la réception : une seule case, partagée, qui sert
 * toutes les commandes à la fois par vagues ; sur chaque chemin, une question —
 * « besoin de légumerie ? » (retour d'usage du 28/09). */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 const dans=s=>page.evaluate(s=>Sim.ateliers.state.ateliers.filter(a=>a.service===s).map(a=>({type:a.type,lots:a.lots})),s);
 const chemin=c=>page.evaluate(c=>{const st=Sim.ateliers.state;return st.parcours.find(p=>p.id===st.parcoursClasse[c]);},c);
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();

  // 1. Un chemin créé depuis le modèle : la légumerie y a UNE équipe, partagée.
  //    (Évolution 22 c : « Chemin d'une commande » a rejoint « Chemins » ; son chemin à part se demande au modèle —
  //    nav.creerChemin — et l'étape se lit, se retire et se remet dans « Chemins ».)
  await nav.aller(page,'mu-flux');
  await nav.creerChemin(page,'AF/BC');
  assert.deepEqual(await dans('decontam'),[{type:'dispo',lots:[]}]);
  await nav.cheminDe(page,'AF/BC','decontam');
  assert.match(await page.locator('#mu-flux .ch-etape[data-ch-etape=decontam] tr[data-ch-cmd="AF/BC"]').innerText(),/sert toutes les commandes/,'la légumerie est une étape de son chemin, servie par l’équipe partagée');
  // Une seconde commande qui en a besoin : toujours une seule équipe.
  await nav.creerChemin(page,'TX/BC');
  assert.equal((await dans('decontam')).length,1,'une seule légumerie pour toutes les commandes');

  // 2. La légumerie retirée du chemin, puis remise : le service quitte le chemin, puis y revient relié.
  await nav.cheminDe(page,'TX/BC','decontam');
  await page.locator('#mu-flux .ch-etape [data-mu-flux-action=retirer-service]').click();await attendre();
  assert.equal((await chemin('TX/BC')).noeuds.includes('decontam'),false);
  assert.equal(await page.locator('#mu-flux [data-mu-graphe] [data-noeud=decontam]').count(),0);
  assert.equal((await dans('decontam')).length,1,'l’équipe partagée reste : AF BC en a besoin');
  await page.selectOption('#mu-flux [data-mu-flux-ajout]','decontam');await attendre();
  const q=await chemin('TX/BC');
  assert.ok(q.noeuds.includes('decontam'));
  assert.ok(q.liens.some(l=>l.de==='decontam')&&q.liens.some(l=>l.vers==='decontam'),'reliée des deux côtés');

  // 3. Les vagues : deux, et chaque commande prend celle qui précède son besoin.
  const id=await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.service==='decontam').id);
  await page.evaluate(id=>Sim.ateliers.changer(()=>{const a=Sim.ateliers.state.ateliers.find(x=>x.id===id);a.permanent=false;a.vagues=[{debut:'03:00',jour:0},{debut:'05:00',jour:0}];},''),id);
  await attendre();
  const lignes=await page.evaluate(()=>Sim.ateliers.resultat.lots.filter(l=>l.dispo&&l.service==='decontam').map(l=>({vague:l.vague,classes:l.classes})));
  assert.ok(lignes.length>=1&&lignes.every(l=>l.classes.length),'une ligne par vague servie : '+JSON.stringify(lignes));
  await nav.etapesCommandes(page);
  assert.match(await page.locator('.qf-c.auto[title^="Légumerie"]').first().innerText(),/vague \d · \d\d:\d\d|dès \d\d:\d\d/,'le tableau dit quelle vague sert la commande');

  // 4. Des cases d'avant, une par commande : l'Organisation le dit, et les fond en une.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;st.ateliers=st.ateliers.filter(a=>a.service!=='decontam');
    for(const [c,h] of [['AF/BC','14:00'],['TX/BC','15:00']])st.ateliers.push({id:'vl'+c.replace('/',''),nom:'Légumerie '+c,service:'decontam',type:'manuel',debut:h,jour:-1,personnes:2,pauses:[],lots:[[c]],regime:{actif:true}});},''));
  await nav.aller(page,'mu-flux');
  assert.match(await page.locator('#at-anomalies').innerText(),/Légumerie : 2 équipes préparent commande par commande/);
  await page.locator('#at-anomalies [data-at-action=dispo-partager]').click();await attendre();
  const leg=await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>a.service==='decontam').map(a=>({type:a.type,vagues:a.vagues})));
  assert.deepEqual(leg,[{type:'dispo',vagues:[{debut:'14:00',jour:-1},{debut:'15:00',jour:-1}]}],'leurs heures deviennent ses vagues');
  assert.doesNotMatch(await page.locator('#at-anomalies').innerText(),/commande par commande/);

  // 5. Une organisation enregistrée avec une case par commande (légumerie qui
  //    prépare, magasin en mises à disposition) : à l'ouverture, elles se fondent.
  const etat=await page.evaluate(()=>{const st=JSON.parse(JSON.stringify(Sim.ateliers.state));
    st.ateliers=st.ateliers.filter(a=>!['decontam','magasin'].includes(a.service));
    for(const c of ['AF/BC','TX/BC']){const k=c.replace('/',' ');
      st.ateliers.push({id:'L'+k,nom:'Légumerie '+k,service:'decontam',type:'manuel',debut:c==='AF/BC'?'14:00':'16:00',jour:-1,personnes:2,pauses:[],lots:[[c]],regime:{actif:true}});
      st.ateliers.push({id:'M'+k,nom:'Magasin '+k,service:'magasin',type:'dispo',debut:'06:00',jour:0,personnes:0,pauses:[],lots:[],regime:{actif:true},permanent:true});}
    return st;});
  const p2=page;
  await page.evaluate(e=>localStorage.setItem('ory-ateliers-v1',e),JSON.stringify(etat));
  await page.reload();await page.waitForTimeout(600);
  const fondu=await p2.evaluate(()=>['decontam','magasin'].map(s=>Sim.ateliers.state.ateliers.filter(a=>a.service===s).map(a=>({type:a.type,permanent:a.permanent,vagues:a.permanent?undefined:a.vagues}))));
  assert.deepEqual(fondu,[[{type:'dispo',permanent:false,vagues:[{debut:'14:00',jour:-1},{debut:'16:00',jour:-1}]}],[{type:'dispo',permanent:true,vagues:undefined}]],'une case par poste, dès l’ouverture');
  await nav.aller(p2,'mu-flux');
  assert.match(await p2.locator('#at-status').innerText(),/deviennent une équipe par poste[\s\S]*Annuler/);
  await nav.cheminDe(p2,'AF/BC');await p2.waitForTimeout(300);
  assert.match(await p2.locator('#mu-flux [data-mu-graphe] [data-noeud=decontam]').textContent(),/à disposition/,'le nœud du chemin est servi par l’équipe partagée');
  // « Annuler » revient à l'organisation d'avant.
  await p2.locator('#btn-annuler').click();await p2.waitForTimeout(300);
  assert.equal(await p2.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>a.service==='decontam').length),2);

  // 6. Une copie de l'organisation d'avant la fusion est gardée : on peut y revenir.
  //    C'est une information, repliée sous ce qui est à corriger (évolution 19 d) : on la déplie ; son geste dit « Facultatif ».
  await page.locator('#at-anomalies details.avis-niveau.information summary').click();await attendre();
  assert.match(await page.locator('#at-anomalies').innerText(),/copie de l’organisation d’avant la fusion[\s\S]*Facultatif\s*Revenir à l’organisation d’avant la fusion/);
  await page.locator('#at-anomalies [data-at-action=avant-fonte]').click();await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>a.service==='magasin').length),2,'l’organisation d’avant est rétablie');
  assert.equal(await page.evaluate(()=>localStorage.getItem('ory-ateliers-v1-avant-fonte')),null,'la copie a servi');

  // 7. La cuisine prépare commande par commande : jamais fondue. Une cuisine
  //    fondue par erreur (avant ce correctif) se rend une case par commande.
  const avecCuisine=await page.evaluate(()=>{const st=JSON.parse(JSON.stringify(Sim.ateliers.state));
    st.ateliers=st.ateliers.filter(a=>a.service!=='cuisine');
    st.ateliers.push({id:'cu1',nom:'Cuisine AF BC',service:'cuisine',type:'manuel',debut:'16:00',jour:-1,personnes:3,pauses:[],lots:[['AF/BC']],regime:{actif:true}});
    st.ateliers.push({id:'cu2',nom:'Cuisine TX BC',service:'cuisine',type:'dispo',debut:'16:00',jour:-1,personnes:0,pauses:[],lots:[],regime:{actif:true},permanent:true});
    return st;});
  await page.evaluate(e=>localStorage.setItem('ory-ateliers-v1',e),JSON.stringify(avecCuisine));
  await page.reload();await page.waitForTimeout(600);
  assert.deepEqual(await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>a.service==='cuisine').map(a=>a.id).sort()),['cu1','cu2'],'la cuisine n’est pas fondue');
  // La cuisine fondue par erreur : une seule mise à disposition.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;st.ateliers=st.ateliers.filter(a=>a.service!=='cuisine');
    st.ateliers.push({id:'cuF',nom:'Cuisine',service:'cuisine',type:'dispo',debut:'15:00',jour:-1,personnes:0,pauses:[],lots:[],regime:{actif:true},permanent:false,vagues:[{debut:'15:00',jour:-1}]});},''));
  await nav.aller(page,'mu-flux');
  assert.match(await page.locator('#at-anomalies').innerText(),/« Cuisine » est une mise à disposition/);
  await page.locator('#at-anomalies [data-at-action=separer][data-service=cuisine]').click();await attendre();
  const cui=await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>a.service==='cuisine').map(a=>({type:a.type,lots:a.lots,debut:a.debut})));
  assert.ok(cui.length>=2&&cui.every(a=>a.type==='manuel'&&a.lots.length===1&&a.debut==='15:00'),'une case par commande : '+JSON.stringify(cui));

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('partage-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

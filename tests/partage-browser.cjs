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

  // 1. Un chemin créé depuis le modèle : la légumerie y a UNE case, partagée.
  await nav.aller(page,'at-chemins');
  await page.locator('[data-pc-action=cmd][data-classe="AF/BC"]').click();await attendre();
  await page.locator('[data-pc-action=creer][data-classe="AF/BC"]').click();await attendre();
  assert.deepEqual(await dans('decontam'),[{type:'dispo',lots:[]}]);
  assert.equal(await page.locator('[data-pc-action=besoin][data-service=decontam]').getAttribute('aria-pressed'),'true','« besoin de légumerie » : oui');
  // Une seconde commande qui en a besoin : toujours une seule case.
  await page.locator('[data-pc-action=cmd][data-classe="TX/BC"]').click();await attendre();
  await page.locator('[data-pc-action=creer][data-classe="TX/BC"]').click();await attendre();
  assert.equal((await dans('decontam')).length,1,'une seule légumerie pour toutes les commandes');

  // 2. « Besoin de légumerie ? » non, puis oui : le service quitte le chemin, puis y revient relié.
  await page.locator('[data-pc-action=besoin][data-service=decontam]').click();await attendre();
  assert.equal((await chemin('TX/BC')).noeuds.includes('decontam'),false);
  assert.equal(await page.locator('[data-pc-action=besoin][data-service=decontam]').getAttribute('aria-pressed'),'false');
  assert.equal((await dans('decontam')).length,1,'la case partagée reste : AF BC en a besoin');
  await page.locator('[data-pc-action=besoin][data-service=decontam]').click();await attendre();
  const q=await chemin('TX/BC');
  assert.ok(q.noeuds.includes('decontam'));
  assert.ok(q.liens.some(l=>l.de==='decontam')&&q.liens.some(l=>l.vers==='decontam'),'reliée des deux côtés');

  // 3. Les vagues : deux, et chaque commande prend celle qui précède son besoin.
  const id=await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.service==='decontam').id);
  await page.evaluate(id=>Sim.ateliers.changer(()=>{const a=Sim.ateliers.state.ateliers.find(x=>x.id===id);a.permanent=false;a.vagues=[{debut:'03:00',jour:0},{debut:'05:00',jour:0}];},''),id);
  await attendre();
  const lignes=await page.evaluate(()=>Sim.ateliers.resultat.lots.filter(l=>l.dispo&&l.service==='decontam').map(l=>({vague:l.vague,classes:l.classes})));
  assert.ok(lignes.length>=1&&lignes.every(l=>l.classes.length),'une ligne par vague servie : '+JSON.stringify(lignes));
  await nav.aller(page,'at-grille');
  assert.match(await page.locator('.qf-c.auto[title^="Légumerie"]').first().innerText(),/vague \d · \d\d:\d\d|dès \d\d:\d\d/,'le tableau dit quelle vague sert la commande');

  // 4. Des cases d'avant, une par commande : l'Organisation le dit, et les fond en une.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;st.ateliers=st.ateliers.filter(a=>a.service!=='decontam');
    for(const [c,h] of [['AF/BC','14:00'],['TX/BC','15:00']])st.ateliers.push({id:'vl'+c.replace('/',''),nom:'Légumerie '+c,service:'decontam',type:'manuel',debut:h,jour:-1,personnes:2,pauses:[],lots:[[c]],regime:{actif:true}});},''));
  await nav.aller(page,'at-chemins');
  assert.match(await page.locator('#at-anomalies').innerText(),/Légumerie : 2 cases préparent commande par commande/);
  await page.locator('#at-anomalies [data-at-action=dispo-partager]').click();await attendre();
  const leg=await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>a.service==='decontam').map(a=>({type:a.type,vagues:a.vagues})));
  assert.deepEqual(leg,[{type:'dispo',vagues:[{debut:'14:00',jour:-1},{debut:'15:00',jour:-1}]}],'leurs heures deviennent ses vagues');
  assert.doesNotMatch(await page.locator('#at-anomalies').innerText(),/commande par commande/);

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('partage-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

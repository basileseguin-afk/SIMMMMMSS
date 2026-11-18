/* Le Robot (28/09) : un service à part, rattaché au Montage, qui remplace le
 * Montage sur le chemin de TX, CRL et FBU Économie ; un débit (plateaux/h) par
 * commande, un effectif minimum pour tourner. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 const robotId=()=>page.evaluate(()=>(Sim.editor.state.zones.find(z=>/^robot$/i.test(z.nom))||{}).id||null);
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  // 1. Première visite : rien ne change (pas d'organisation décrite).
  assert.equal(await robotId(),null,'pas de Robot sur une première visite');

  // 2. Une organisation décrite : TX et CRL Économie ont leur chemin, par le Montage.
  // (Évolution 22 c : le chemin à part d'une commande se demande au modèle — nav.creerChemin.)
  await nav.aller(page,'mu-flux');
  for(const c of ['TX/YC','CRL/YC']){
    await nav.creerChemin(page,c);
  }
  assert.ok(await page.evaluate(()=>{const st=Sim.ateliers.state;return st.parcours.find(p=>p.id===st.parcoursClasse['TX/YC']).noeuds.includes('prepa');}));
  // 3. À l'ouverture suivante, le Robot remplace le Montage pour TX, CRL et FBU Économie.
  await page.reload();await page.waitForTimeout(700);
  const rid=await robotId();
  assert.ok(rid,'le service Robot est créé');
  assert.equal(await page.evaluate(id=>Sim.editor.state.zones.find(z=>z.id===id).parent,rid),'prepa','rattaché au Montage');
  for(const c of ['TX/YC','CRL/YC','FBU/YC']){
    const n=await page.evaluate(c=>{const st=Sim.ateliers.state;const p=st.parcours.find(p=>p.id===st.parcoursClasse[c]);return p?p.noeuds:null;},c);
    assert.ok(n&&n.includes(rid)&&!n.includes('prepa'),c+' : Robot à la place du Montage — '+JSON.stringify(n));
  }
  const robots=await page.evaluate(id=>Sim.ateliers.state.ateliers.filter(a=>a.service===id).map(a=>({type:a.type,lots:a.lots.flat()})),rid);
  assert.equal(robots.length,1,'une seule case Robot');
  assert.equal(robots[0].type,'robot');
  assert.deepEqual([...robots[0].lots].sort(),['CRL/YC','FBU/YC','TX/YC']);
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.some(a=>a.service==='prepa'&&a.lots.some(l=>l.includes('TX/YC')))),false,'TX YC a quitté le Montage');
  assert.match(await page.locator('#at-status').innerText(),/Robot : il remplace le Montage/);
  // Une seule fois : recharger ne refait rien.
  await page.reload();await page.waitForTimeout(700);
  assert.equal(await page.evaluate(()=>Sim.editor.state.zones.filter(z=>/^robot$/i.test(z.nom)).length),1);

  // 4. Le calcul : TX YC dure ses plateaux ÷ son débit.
  const at=await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.service===id).id,rid);
  await page.evaluate(id=>Sim.ateliers.changer(()=>{const a=Sim.ateliers.state.ateliers.find(x=>x.id===id);a.debit=300;a.debits={'TX/YC':600};a.personnes=2;a.personnesMin=2;},''),at);
  await attendre();
  const l=await page.evaluate(id=>{const r=Sim.ateliers.resultat;const k=r.classes.find(c=>c.id==='TX/YC');const x=r.lots.find(y=>y.atelier===id&&y.classes.includes('TX/YC'));return {pax:k.pax,duree:x.fin-x.debut};},at);
  assert.ok(Math.abs(l.duree-l.pax/600*60)<0.01,'plateaux ÷ débit : '+JSON.stringify(l));

  // 5. Le débit d'une commande sur le robot se règle dans sa fiche. (Évolution 22 b : la vue d'ensemble des temps par
  //    vol, où il se réglait aussi, a quitté l'écran ; son classeur Excel porte toujours la colonne du robot.)
  await nav.reglagesEquipe(page,at);await attendre();
  const deb=page.locator(`#mu-services [data-at="${at}"] [data-at-champ=debit-cmd][data-classe="CRL/YC"]`);
  assert.equal(await deb.count(),1,'le débit de CRL YC sur le robot');
  assert.equal(await deb.getAttribute('placeholder'),'300','vide : celui du robot');
  await deb.fill('450');await deb.dispatchEvent('change');await attendre();
  assert.equal(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).debits['CRL/YC'],at),450);
  assert.equal(await page.locator(`#mu-services [data-at="${at}"] [data-at-champ=debit-cmd][data-classe="CRL/YC"]`).inputValue(),'450');
  const cellule=await page.evaluate(([id])=>{const l=OrlyEchanges.recapManMinutes(Sim.reglages.contexteRecap()).lignes.find(x=>x.classe.id==='CRL/YC');
    const c=Object.values(l.cellules).find(x=>x.source==='robot');return c?{debit:c.debit,duree:c.duree}:null;},[at]);
  assert.equal(cellule.debit,450,'le classeur « Temps par vol » : le débit de CRL YC sur le robot');
  assert.ok(cellule.duree>0,'et sa durée : plateaux ÷ débit');

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('robot-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

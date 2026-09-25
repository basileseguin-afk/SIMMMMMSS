/* Le temps entre les ateliers, dans la page : le stock sur les liens du
 * chemin et dans la case, la frise d'une commande, l'onglet « Stocks et
 * retours » (tableau, tuiles, graphiques et survol), et le plan rejoué. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=200)=>page.waitForTimeout(ms);
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre(300);
  // Une journée : la cuisine de TX BC finit vers 01:30, la prépa ne commence qu'à 04:00 ;
  // les retours reviennent plus vite qu'une plonge lente ne lave.
  await page.evaluate(()=>{const A=Sim.ateliers;A.changer(()=>{const s=A.state;
    OrlyParcours.creerChemin(s,'TX/BC','complet',false,null,{nomDe:x=>x,classes:A.classes});
    for(const a of s.ateliers){a.debut='01:00';a.personnes=4;}
    s.ateliers.find(a=>a.service==='preparation').debut='04:00';
    s.materiel.actif=true;s.materiel.stockInitial=3000;
    const pl=s.ateliers.find(a=>a.service==='plonge');pl.tunnels=[{nom:'T1',debit:150,personnes:1,actif:true}];pl.regime={actif:false};
  });});
  await attendre(300);
  const sej=await page.evaluate(()=>Sim.ateliers.resultat.stocks.sejours.find(x=>x.classe==='TX/BC'&&x.de==='cuisine'&&x.vers==='preparation'));
  assert.ok(sej&&sej.sortie===240&&sej.duree>100,'TX BC est en stock entre la cuisine et la prépa');

  // 1. Le chemin : le temps en stock sur le lien, et dans la case de la prépa.
  await nav.vue(page,'ateliers');await nav.aller(page,'at-chemins');await attendre();
  await page.locator('[data-pc-action=cmd][data-classe="TX/BC"]').click();await attendre();
  assert.match(await page.locator('.pc-graphe .gr-lien[data-lien="cuisine>preparation"] .gr-etiq').textContent(),/^2 h \d\d$/);
  assert.match(await page.locator('.pc-graphe .gr-lien[data-lien="cuisine>preparation"] title').textContent(),/en stock/);
  await page.locator('.pc-graphe [data-noeud=preparation]').click();await attendre();
  assert.match(await page.locator('.pc-tiroir .pc-temps').textContent(),/Livrée par Cuisine à 01:\d\d, prise à 04:00 :\s+2 h \d\d en stock \(32 repas\)/);
  await page.keyboard.press('Escape');await attendre();

  // 2. La frise de la commande : une barre « en stock », et la phrase le dit.
  await nav.aller(page,'at-grille');await attendre();
  await page.locator('[data-qf=suivre][data-classe="TX/BC"]').click();await attendre();
  assert.ok(await page.locator('.qf-temps .qf-t-stock').count()>=1,'le stock se voit dans la frise');
  assert.match(await page.locator('.qf-temps .qf-phrase').textContent(),/Le plus long en stock/);

  // 3. L'onglet « Stocks et retours ».
  await nav.vue(page,'plan');await nav.aller(page,'j-stocks');await attendre();
  assert.ok(await page.locator('#journee-stocks .tp-table tbody tr').count()>=2,'une ligne par lien où quelque chose attend');
  assert.match(await page.locator('#journee-stocks .tp-table').textContent(),/Cuisine → Prépa/);
  assert.match(await page.locator('#journee-stocks .tp-table').textContent(),/Chargement \(avion\)/);
  assert.equal(await page.locator('#journee-stocks .tp-svg').count(),2,'les retours heure par heure, puis le sale pas encore lavé');
  // Le panneau défile : sans cela le graphique de la plonge, en bas, était coupé et hors d'atteinte.
  const defile=await page.locator('#journee-stocks').evaluate(s=>{s.scrollTop=1e5;const r=s.getBoundingClientRect(),g=s.querySelectorAll('.tp-svg')[1].getBoundingClientRect();return {bas:g.bottom<=r.bottom+1&&g.bottom<=innerHeight+1,pleine:r.right>innerWidth-40};});
  assert.deepEqual(defile,{bas:true,pleine:true},'le bas des stocks s’atteint, sur toute la largeur');
  assert.match(await page.locator('#journee-stocks .tp-phrase').textContent(),/Bouchon[\s\S]*dépassent ce que la plonge lave/);
  assert.ok(await page.locator('#journee-stocks .tp-barre.trop').count()>=1,'les heures en dépassement sont marquées');
  assert.match(await page.locator('#journee-stocks .tp-barre.trop .tp-val').first().textContent(),/^▲ /,'et étiquetées, pas seulement colorées');
  // Survol : une bulle sur une barre, un curseur sur la courbe.
  await page.locator('#journee-stocks .tp-barre.trop .tp-cible').first().hover();await attendre();
  assert.match(await page.locator('#journee-stocks .tp-bulle').textContent(),/u revenues, \d+ de plus que la plonge n’en lave/);
  const cible=page.locator('#journee-stocks .tp-cible-file');await cible.scrollIntoViewIfNeeded();
  const f=await cible.boundingBox();
  await cible.hover({position:{x:Math.round(f.width*0.8),y:Math.round(f.height/2)}});await attendre();
  assert.match(await page.locator('#journee-stocks .tp-bulle').textContent(),/^À \d\d:\d\d : \d+ u pas encore lavées$/);
  // Un trait vertical n'a pas de largeur : on vérifie qu'il est affiché et placé.
  assert.deepEqual(await page.locator('#journee-stocks .tp-curseur').evaluate(l=>[l.style.display,+l.getAttribute('x1')>0]),['',true],'le curseur suit la souris');

  // 4. Le plan rejoué : à 03:00, TX BC attend devant la prépa, et « En ce moment » le dit.
  await nav.aller(page,'j-plan');await attendre();
  await page.evaluate(()=>Sim.vue.allerA(180));await attendre(300);
  const badge=page.locator('.zone[data-id=preparation] .zone-stock');
  assert.equal(await badge.evaluate(g=>g.style.display),'','la pastille est affichée');
  assert.equal(await badge.locator('text').textContent(),'32 repas en stock');
  assert.match(await page.locator('#goulot-info').textContent(),/À 03:00, en attente :[\s\S]*Prépa 32 repas en stock/);
  // Plus tard, la plonge a du sale à laver.
  const maxA=await page.evaluate(()=>Sim.ateliers.resultat.plonge.maxA);
  await page.evaluate(t=>Sim.vue.allerA(t),maxA);await attendre(300);
  assert.match(await page.locator('.zone[data-id=plonge] .zone-stock text').textContent(),/^\d+ u à laver$/);
  // Au début de la journée, rien n'est affiché.
  await page.evaluate(()=>Sim.vue.auDebut());await attendre(300);
  assert.equal(await badge.isVisible(),false);

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('temps-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

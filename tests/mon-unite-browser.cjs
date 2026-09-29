/* Mon unité (retour d'usage du 29/09) : « que quelqu'un qui connaît uniquement
 * l'unité puisse paramétrer entièrement la simulation ». Le menu n'a plus que
 * Vols · Mon unité · Réglages · Résultats ; un service se règle dans sa fiche :
 * ce qu'il fait, ses équipes (heure, personnes), ce que chacune prépare (une
 * grille à cocher) et ses minutes. Les chemins suivent tout seuls. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 const st=()=>page.evaluate(()=>JSON.parse(JSON.stringify(Sim.ateliers.state)));
 const chemin=c=>page.evaluate(c=>{const p=OrlyParcours.cheminDe(Sim.ateliers.state,c);return p?{services:MoteurProduction.servicesDuParcours(p),arcs:MoteurProduction.arcsDuParcours(p).map(a=>a.from+'>'+a.to)}:null;},c);
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();

  // 1. Le menu : quatre parties, sans chemins ni cases ni liens.
  assert.deepEqual(await page.locator('#menu [data-vers-partie]').allInnerTexts(),['Accueil','Vols','Mon unité','Réglages','Résultats']);
  await page.locator('#menu [data-vers-partie=organisation]').click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-pas','Mon unité s’ouvre sur le pas à pas');
  const onglets=await page.locator('#sous-onglets [data-sous-onglet]').allInnerTexts();
  assert.ok(!onglets.some(t=>/Chemins|Cases|Qui prépare quoi|Liens/.test(t)),onglets.join(', '));

  // 2. Le pas à pas : les vols d'exemple, puis les services sans équipe.
  const pas=await page.locator('#mu-pas').innerText();
  assert.match(pas,/vols d’exemple/);
  assert.match(pas,/Vos services et leurs équipes/);
  assert.match(pas,/ne sont préparées par aucune équipe/);

  // 3. Un service depuis le pas à pas : sa fiche s'ouvre.
  await page.locator('#mu-pas [data-mu-ouvrir=prepa]').click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-services');
  assert.equal(await page.locator('.mu-fiche').getAttribute('data-mu-fiche'),'prepa');
  assert.equal(await page.locator('[data-mu-nature=prepa]').inputValue(),'manuel');

  // 4. Deux équipes ; la première prépare toute la ligne AF, la seconde toute la colonne YC.
  await page.locator('.mu-fiche [data-mu-action=equipe]').click();await attendre();
  await page.locator('.mu-fiche [data-mu-action=equipe]').click();await attendre();
  const [e1,e2]=(await st()).ateliers.filter(a=>a.service==='prepa').map(a=>a.id);
  assert.ok(e1&&e2,'deux équipes');
  await page.locator(`table[data-mu-equipe="${e1}"] [data-mu-ligne=AF]`).click();await attendre();
  await page.locator(`table[data-mu-equipe="${e2}"] [data-mu-col=YC]`).click();await attendre();
  let s=await st();
  const lots=id=>s.ateliers.find(a=>a.id===id).lots.flat();
  assert.ok(lots(e1).includes('AF/BC')&&lots(e1).includes('AF/YC'),'la ligne AF');
  assert.ok(!lots(e2).includes('AF/YC'),'tout cocher ne prend rien à l’autre équipe');
  assert.ok(lots(e2).includes('TX/YC')&&lots(e2).includes('DL/YC'),'la colonne YC');
  // L'ordre suit les départs.
  const ech=await page.evaluate(ids=>ids.map(id=>Sim.ateliers.classes.find(c=>c.id===id).echeance),s.ateliers.find(a=>a.id===e1).lots.map(l=>l[0]));
  assert.deepEqual(ech,[...ech].sort((a,b)=>a-b),'la plus pressée d’abord');
  // Cocher une commande de l'autre équipe la déplace.
  await page.locator(`table[data-mu-equipe="${e1}"] [data-mu-cocher="TX/YC"]`).check();await attendre();
  s=await st();
  assert.ok(lots(e1).includes('TX/YC')&&!lots(e2).includes('TX/YC'));
  // Le chemin de la commande suit.
  assert.ok((await chemin('TX/YC')).services.includes('prepa'));

  // 5. L'heure (tapée, champ à champ) et les personnes, dans la ligne de l'équipe.
  const heure=page.locator(`.mu-equipe[data-at="${e1}"] input[data-at-champ=debut]`);
  await heure.click({position:{x:10,y:10}});await page.waitForTimeout(120);   // la case des heures
  for(const k of '0215P'){await page.keyboard.press(k);await page.waitForTimeout(80);}
  await heure.press('Tab');await attendre();
  const pers=page.locator(`.mu-equipe[data-at="${e1}"] input[data-at-champ=personnes]`);
  await pers.fill('6');await pers.press('Tab');await attendre();
  s=await st();
  assert.equal(s.ateliers.find(a=>a.id===e1).debut,'14:15');
  assert.equal(s.ateliers.find(a=>a.id===e1).personnes,6);

  // 6. Décocher la dernière équipe d'une commande : le service sort de son chemin.
  await page.locator(`table[data-mu-equipe="${e2}"] [data-mu-cocher="DL/YC"]`).uncheck();await attendre();
  assert.ok(!(await chemin('DL/YC')).services.includes('prepa'));
  // … et la grille dit maintenant qu'elle ne passe plus par là.
  assert.match(await page.locator(`table[data-mu-equipe="${e2}"] [data-mu-cocher="DL/YC"]`).evaluate(e=>e.closest('td').className),/hors/);

  // 7. Les minutes de travail se règlent dans la fiche.
  const min=page.locator('.mu-fiche .rg-fiche input[data-rg-champ=minutes][data-cle="*/BC"]');
  await min.fill('42');await min.press('Tab');await attendre();
  assert.equal(await page.evaluate(()=>Sim.reglages.etat.bareme.prepa['*/BC']),42);

  // 8. Un service qui sert tout le monde : « Qui en a besoin ? ».
  await page.locator('[data-mu-choisir=decontam]').click();await attendre();
  assert.equal(await page.locator('[data-mu-nature=decontam]').inputValue(),'dispo');
  assert.ok((await chemin('AF/BC')).services.includes('decontam'));
  await page.locator('table[data-mu-service=decontam] [data-mu-cocher="AF/BC"]').uncheck();await attendre();
  assert.ok(!(await chemin('AF/BC')).services.includes('decontam'),'AF BC n’a plus besoin de légumerie');

  // 9. Un nouveau service, placé sur le plan près du Montage : il prend sa place dans le chemin.
  await page.locator('[data-mu-nouveau] input[name=nom]').fill('Atelier APM');
  await page.locator('[data-mu-nouveau] select[name=parent]').selectOption('prepa');
  await page.locator('[data-mu-nouveau] button[type=submit]').click();await attendre();
  const apm=await page.locator('.mu-fiche').getAttribute('data-mu-fiche');
  assert.ok(apm&&apm!=='prepa','la fiche du nouveau service est ouverte');
  await page.locator('.mu-fiche [data-mu-action=equipe]').click();await attendre();
  const e3=(await st()).ateliers.find(a=>a.service===apm).id;
  await page.locator(`table[data-mu-equipe="${e3}"] [data-mu-cocher="QR/BC"]`).check();await attendre();
  const qr=await chemin('QR/BC');
  assert.ok(qr.services.includes(apm));
  assert.ok(qr.arcs.some(a=>a.endsWith('>'+apm)),'quelqu’un le livre : '+qr.arcs.join(', '));

  // 10. Le calcul lit tout cela : l'équipe du matin prépare, à son heure.
  const lotAF=await page.evaluate(id=>Sim.ateliers.resultat.lots.find(l=>l.atelier===id&&l.classes.includes('AF/BC')),e1);
  assert.ok(lotAF&&lotAF.debut>=14*60+15,'AF BC préparée par l’équipe, à partir de 14:15');

  // 11. Les outils d'avant restent à portée, hors du menu.
  await page.locator('#mu-services [data-page=at-chemins]').click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.partie),'avance');
  assert.equal(await page.locator('#menu .menu-partie.actif').count(),0,'aucune partie du menu n’est marquée');

  // 12. Tout survit au rechargement.
  await page.reload();await attendre();
  s=await st();
  assert.equal(s.ateliers.find(a=>a.id===e1).personnes,6);
  assert.ok(lots(e1).includes('AF/BC'));

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('mon-unite-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

/* Piloter le site depuis Excel, et décrire le chemin de chaque classe.
 *  1. les parcours : branches, jonction, parcours propre à une compagnie × classe ;
 *  2. le classeur des ateliers : exporter, modifier dans « Excel », réimporter ;
 *  3. le classeur des vols : départs et retours, aller-retour. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {pathToFileURL}=require('node:url');
const T=require('../tableur.js');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1100},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=180)=>page.waitForTimeout(ms);
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-excel-'));
 const telecharger=async(sel,nom)=>{const [d]=await Promise.all([page.waitForEvent('download'),page.locator(sel).click()]);
   const f=path.join(dossier,nom);await d.saveAs(f);return {f,nom:d.suggestedFilename()};};
 const lot=(service,classe)=>page.evaluate(([s,c])=>Sim.ateliers.resultat.lots.find(l=>l.service===s&&l.classes.includes(c)),[service,classe]);
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await page.locator('[data-view=ateliers]').click();await attendre();

  // 1. Deux parcours types, prêts : YC ne passe ni par la cuisine ni par la légumerie.
  assert.equal(await page.locator('.pc-carte').count(),2);
  const defaut=c=>page.locator(`[data-pc-champ=cabine][data-cabine=${c}]`).inputValue();
  assert.equal(await defaut('BC'),'complet');
  assert.equal(await defaut('YC'),'sans-cuisine');
  assert.match(await page.locator('[data-parcours=complet] .pc-jonction-col').textContent(),/MONTAGE/,'les branches se rejoignent au montage');
  assert.equal(await page.locator('[data-parcours=sans-cuisine] .pc-box[data-service=cuisine], [data-parcours=sans-cuisine] .pc-box[data-service=decontam]').count(),0,
    'le parcours sans cuisine n’a ni cuisine ni légumerie');

  // Trois équipes : cuisine, dotation, montage. Le montage YC n'attend que la dotation.
  const creer=async(nom,service,lots)=>{
    await page.locator('#at-new').click();await attendre();
    const id=await page.evaluate(()=>Sim.ateliers.state.ateliers.at(-1).id);
    await page.evaluate(([id,nom,service,lots])=>Sim.ateliers.changer(()=>{
      Object.assign(Sim.ateliers.state.ateliers.find(a=>a.id===id),{nom,service,debut:'05:00',personnes:1,lots});
    }),[id,nom,service,lots]);
    await attendre();return id;
  };
  await creer('Cuisine','cuisine',[['AF/BC']]);
  await creer('Dotation','dotation',[['AF/YC'],['AF/BC']]);
  await creer('Montage','prepa',[['AF/YC'],['AF/BC']]);
  assert.equal((await lot('prepa','AF/YC')).debut,(await lot('dotation','AF/YC')).fin,'YC : le montage attend la dotation, pas la cuisine');
  assert.ok((await lot('prepa','AF/BC')).debut>=(await lot('cuisine','AF/BC')).fin,'BC : le montage attend la cuisine');
  assert.match(await page.locator('#at-anomalies').textContent(),/sans qu’aucun atelier ne l’y travaille/,'les étapes sans équipe sont dites');

  // Une compagnie × classe peut suivre un autre parcours que sa classe.
  await page.selectOption('[data-at-champ=classe-parcours][data-classe="AF/YC"]','complet');await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.parcoursClasse['AF/YC']),'complet');
  assert.match(await page.locator('#at-anomalies').textContent(),/« CUISINE » est sur le parcours de 1 classe\(s\)[^.]*\(AF\/YC\)/,
    'la cuisine est désormais sur son chemin, sans équipe pour AF/YC : la liste le dit');
  await page.selectOption('[data-at-champ=classe-parcours][data-classe="AF/YC"]','');await attendre();

  // Modifier un parcours : ajouter une étape à une branche.
  await page.locator('[data-parcours=sans-cuisine] [data-pc-action=ouvrir]').click();await attendre();
  const branche=page.locator('[data-parcours=sans-cuisine] [data-branche="0"]');
  await branche.locator('[data-pc-champ=etape-ajout]').selectOption('armement');await attendre();
  assert.deepEqual(await page.evaluate(()=>Sim.ateliers.state.parcours.find(p=>p.id==='sans-cuisine').branches[0].services),
    ['appros','prepa','armement']);
  await page.locator('[data-parcours=sans-cuisine] [data-branche="0"] [data-pc-action=etape-retirer][data-etape="2"]').click();await attendre();
  await page.locator('[data-parcours=sans-cuisine] [data-pc-action=fermer]').click();await attendre();

  // 2. Le classeur des ateliers : export, modification « dans Excel », import.
  const {f:fAt,nom:nomAt}=await telecharger('#at-export','ateliers.xlsx');
  assert.match(nomAt,/^ory-ateliers-.*\.xlsx$/);
  const feuilles=await T.lireClasseur(fs.readFileSync(fAt));
  assert.deepEqual(feuilles.map(f=>f.nom),['Ateliers','Fabrications','Tunnels','Classes','Parcours','Parcours par classe','Matériel','Lisez-moi']);
  const fab=T.feuille(feuilles,'Fabrications');
  assert.deepEqual(fab.lignes.slice(1).map(l=>l.join('|')),['Cuisine|1|AF/BC','Dotation|1|AF/YC','Dotation|2|AF/BC','Montage|1|AF/YC','Montage|2|AF/BC']);
  // Dans Excel : deux personnes en cuisine, une compagnie × classe de plus,
  // et une nouvelle branche au parcours complet.
  const at=T.feuille(feuilles,'Ateliers');
  const col=at.lignes[0].indexOf('Personnes');
  at.lignes.find(l=>l[0]==='Cuisine')[col]=2;
  fab.lignes.push(['Cuisine',2,'DL/BC']);
  T.feuille(feuilles,'Parcours').lignes.push(['Complet','Armement','ARMEMENT > MONTAGE']);
  const modifie=path.join(dossier,'ateliers-modifie.xlsx');
  fs.writeFileSync(modifie,T.ecrireClasseur(feuilles));
  await page.locator('#at-import').setInputFiles(modifie);await attendre(400);
  const etat=await page.evaluate(()=>Sim.ateliers.state);
  const cuisine=etat.ateliers.find(a=>a.nom==='Cuisine');
  assert.equal(cuisine.personnes,2);
  assert.deepEqual(cuisine.lots,[['AF/BC'],['DL/BC']]);
  assert.ok(etat.parcours.find(p=>p.id==='complet').branches.some(b=>b.services.join('>')==='armement>prepa'));
  assert.match(await page.locator('#at-status').textContent(),/Ateliers importés/);
  // Un classeur faux est refusé en bloc, et dit quoi corriger.
  at.lignes.push(['Fantaisie','GARAGE','manuel','05:00']);
  const faux=path.join(dossier,'faux.xlsx');fs.writeFileSync(faux,T.ecrireClasseur(feuilles));
  await page.locator('#at-import').setInputFiles(faux);await attendre(400);
  assert.match(await page.locator('#at-status').textContent(),/Import refusé[\s\S]*service inconnu « GARAGE »[\s\S]*Rien n’a été importé/);
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.length),3,'rien n’a changé');
  // Et l'import s'annule.
  await page.locator('#at-undo').click();await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.nom==='Cuisine').personnes),1);

  // 3. Le classeur des vols : départs et retours, aller-retour.
  await page.locator('[data-view=reglages]').click();await attendre();
  const {f:fVols}=await telecharger('#exp-vols','vols.xlsx');
  const vols=await T.lireClasseur(fs.readFileSync(fVols));
  const dep=T.feuille(vols,'Départs'),ret=T.feuille(vols,'Retours');
  assert.equal(dep.lignes.length-1,12,'douze départs');
  assert.equal(ret.lignes.length-1,6,'six retours');
  dep.lignes.push(['NEW1','ZZ','A320','14:30',4,0,120,3,2]);
  const volsModifies=path.join(dossier,'programme.xlsx');fs.writeFileSync(volsModifies,T.ecrireClasseur(vols));
  await page.locator('#imp-vols').setInputFiles(volsModifies);
  await page.waitForFunction(()=>document.getElementById('source-label').textContent==='programme.xlsx');
  assert.equal(await page.locator('#source-count').textContent(),'13 départs · 6 retours');
  assert.equal(await page.evaluate(()=>Sim.ateliers.classes.some(c=>c.id==='ZZ/YC')),true,'la nouvelle compagnie × classe existe');
  // Une heure fausse désigne sa feuille et sa ligne.
  dep.lignes.push(['BAD','ZZ','A320','27:00',0,0,10,0,0]);
  const volsFaux=path.join(dossier,'faux-vols.xlsx');fs.writeFileSync(volsFaux,T.ecrireClasseur(vols));
  await page.locator('#imp-vols').setInputFiles(volsFaux);
  await page.waitForFunction(()=>document.getElementById('import-report').classList.contains('error'));
  assert.match(await page.locator('#import-report').textContent(),/Départs, ligne 15/);
  assert.equal(await page.locator('#source-count').textContent(),'13 départs · 6 retours','rien n’a été remplacé');

  // 4. Parcours et équipes, d'un même geste : chaque étape dit ses équipes et
  //    ce qui lui manque, et se complète sur place.
  await page.locator('[data-view=ateliers]').click();await attendre();
  const complet='[data-parcours=complet]';
  const boite=s=>page.locator(`${complet} .pc-box[data-service=${s}]`);
  assert.match(await boite('cuisine').locator('.pc-chip').textContent(),/Cuisine/,'l’équipe figure à son étape');
  assert.match(await boite('cuisine').getAttribute('class'),/manque/,'des classes du parcours n’y sont pas');
  // Une seule équipe à l'étape : un bouton lui confie les classes qui manquent.
  await boite('cuisine').locator('[data-pc-action=confier]').click();await attendre();
  assert.match(await boite('cuisine').getAttribute('class'),/\bok\b/,'toutes les classes du parcours passent en cuisine');
  const lotsCuisine=await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.nom==='Cuisine').lots.flat());
  assert.ok(lotsCuisine.includes('DL/BC')&&!lotsCuisine.some(c=>c.endsWith('/YC')),'les YC ne vont pas en cuisine');
  // Aucune équipe : on la pose ici, et sa fiche s'ouvre.
  const avantN=await page.evaluate(()=>Sim.ateliers.state.ateliers.length);
  await boite('appros').locator('[data-pc-champ=equipe-creer]').selectOption('manuel');await attendre();
  const nouvelle=await page.evaluate(()=>Sim.ateliers.state.ateliers.at(-1));
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.length),avantN+1);
  assert.equal(nouvelle.service,'appros');
  assert.ok(nouvelle.lots.length>0,'elle naît avec les classes de l’étape');
  assert.equal(await page.evaluate(()=>Sim.ateliers.ouvert),nouvelle.id,'sa fiche est ouverte');
  // Le bouton général confie tout ce qui n'a qu'une équipe possible.
  await page.locator('[data-pc-action=completer]').click();await attendre();
  assert.equal(await page.locator('.pc-box.manque [data-pc-action=confier]').count(),0,'plus rien à confier d’un clic');
  assert.equal(await page.locator('[data-pc-action=completer]').count(),0,'le bouton s’efface');
  // Le chronogramme suit une classe à travers les branches, jusqu'à l'échéance.
  await page.selectOption(`[data-pc-champ=chrono][data-parcours=complet]`,'AF/BC');await attendre();
  assert.equal(await page.locator(`${complet} .pc-chrono svg`).count(),1,'le chemin de AF/BC dans le temps');

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('excel-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

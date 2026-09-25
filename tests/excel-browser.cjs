/* Piloter le site depuis Excel, et décrire le chemin de chaque classe.
 *  1. les parcours : branches, jonction, parcours propre à une compagnie × classe ;
 *  2. le classeur des ateliers : exporter, modifier dans « Excel », réimporter ;
 *  3. le classeur des vols : départs et retours, aller-retour ;
 *  4. le tableau « Qui prépare quoi » : choisir, créer, vider, remplir, suivre. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
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
 // Tirer le « + » d'un service jusqu'à un autre, dans le diagramme des chemins.
 // Relier au clic : le + du premier, puis le second (le trait tiré est éprouvé dans graphe-browser).
 const tirer=async(de,vers)=>{
   await page.locator(`.pc-graphe .gr-port[data-port=${de}]`).click();await attendre();
   await page.locator(`.pc-graphe [data-noeud=${vers}] .gr-fond`).click();await attendre();
 };
 const liens=id=>page.evaluate(id=>Sim.ateliers.state.parcours.find(p=>p.id===id).liens.map(l=>l.de+'>'+l.vers),id);
 const lot=(service,classe)=>page.evaluate(([s,c])=>Sim.ateliers.resultat.lots.find(l=>l.service===s&&l.classes.includes(c)),[service,classe]);
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await nav.vue(page,'ateliers');await attendre();

  // 1. Deux parcours types, prêts : YC ne passe ni par la cuisine ni par la légumerie.
  assert.equal(await page.locator('.pc-puce').count(),2,'deux chemins, deux pastilles');
  const defaut=c=>page.locator(`[data-pc-champ=cabine][data-cabine=${c}]`).inputValue();
  assert.equal(await defaut('BC'),'complet');
  assert.equal(await defaut('YC'),'sans-cuisine');
  // Un modèle est un diagramme : un nœud par service, un trait par livraison.
  await nav.aller(page,'at-chemins');
  await page.locator('.pc-modeles>summary').click();
  await page.locator('[data-pc-action=modele][data-parcours=complet]').click();await attendre();
  assert.equal(await page.locator('.pc-graphe .gr-lien[data-lien$=">prepa"]').count(),3,'trois traits arrivent au montage');
  await page.locator('[data-pc-action=modele][data-parcours=sans-cuisine]').click();await attendre();
  assert.equal(await page.locator('.pc-graphe [data-noeud=cuisine], .pc-graphe [data-noeud=decontam]').count(),0,
    'le parcours sans cuisine n’a ni cuisine ni légumerie');

  // Trois équipes : cuisine, dotation, montage. Le montage YC n'attend que la dotation.
  const creer=async(nom,service,lots)=>{
    await nav.aller(page,'at-equipes');await page.locator('#at-new').click();await attendre();
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
  assert.match(await page.locator('#at-anomalies').textContent(),/commandes? commencées? sautent? une étape sans équipe[\s\S]*« Qui prépare quoi »/,'les étapes sans équipe renvoient au tableau');

  // Une commande peut avoir son propre chemin, copié d'un modèle.
  await nav.aller(page,'at-chemins');await attendre();
  await page.locator('[data-pc-action=cmd][data-classe="AF/YC"]').click();await attendre();
  await page.selectOption('[data-pc-champ=creer-depuis]','complet');await attendre();
  await page.locator('[data-pc-action=creer]').click();await attendre();
  const propre=await page.evaluate(()=>Sim.ateliers.state.parcoursClasse['AF/YC']);
  assert.equal(await page.evaluate(id=>Sim.ateliers.state.parcours.find(p=>p.id===id).nom,propre),'Complet AF YC');
  await nav.aller(page,'at-grille');await attendre();
  assert.match(await page.locator('[data-qf=aller][data-classe="AF/YC"][data-service=cuisine]').textContent(),/Cuisine AF YC/,
    'la cuisine est désormais sur son chemin, avec sa case, créée d’office');
  await nav.aller(page,'at-chemins');await attendre();
  await page.locator('[data-pc-action=parcours-retirer]').click();await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.parcoursClasse['AF/YC']),undefined,'supprimé, il suit de nouveau le modèle');
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>/AF YC/.test(a.nom)).length),0,'ses cases propres partent avec lui');

  // Modifier un modèle dans son diagramme : ajouter un service, le relier en
  // tirant un trait, refuser une boucle, retirer le lien puis le service.
  await nav.aller(page,'at-chemins');await attendre();
  await page.locator('.pc-modeles>summary').click();
  await page.locator('[data-pc-action=modele][data-parcours=sans-cuisine]').click();await attendre();
  const avant=await liens('sans-cuisine');
  await page.selectOption('[data-pc-champ=noeud-ajout]','armement');await attendre();
  assert.equal(await page.locator('.pc-graphe [data-noeud=armement]').count(),1,'le service rejoint le diagramme');
  await tirer('prepa','armement');
  assert.deepEqual(await liens('sans-cuisine'),avant.concat('prepa>armement'),'tirer un trait crée le lien');
  assert.match(await page.locator('#at-status').textContent(),/Montage livre maintenant Armement/);
  // « Relier à… » fait la même chose sans glisser — et une boucle est refusée.
  await page.locator('.pc-graphe [data-noeud=armement]').click();await attendre();
  await page.locator('[data-pc-action=relier-depuis]').click();await attendre();
  await page.locator('.pc-graphe [data-noeud=appros]').click();await attendre();
  assert.deepEqual(await liens('sans-cuisine'),avant.concat('prepa>armement'),'armement → appros ferait tourner en rond');
  assert.match(await page.locator('#at-status').textContent(),/Impossible[\s\S]*tournerait en rond/);
  // Un lien choisi se retire par sa croix.
  await page.locator('.pc-graphe .gr-lien[data-lien="prepa>armement"] .gr-prise').click({force:true});await attendre();
  await page.locator('.pc-graphe .gr-retirer').click();await attendre();
  assert.deepEqual(await liens('sans-cuisine'),avant);
  await page.locator('.pc-graphe [data-noeud=armement]').click();await attendre();
  await page.locator('[data-pc-action=noeud-retirer]').click();await attendre();
  assert.equal(await page.locator('.pc-graphe [data-noeud=armement]').count(),0,'et le service quitte le chemin');

  // 2. Le classeur des ateliers : export, modification « dans Excel », import.
  const {f:fAt,nom:nomAt}=await telecharger('#at-export','ateliers.xlsx');
  assert.match(nomAt,/^ory-ateliers-.*\.xlsx$/);
  const feuilles=await T.lireClasseur(fs.readFileSync(fAt));
  assert.deepEqual(feuilles.map(f=>f.nom),['Ateliers','Horaires','Fabrications','Man-minutes','Tunnels','Classes','Parcours','Parcours par classe','Matériel','Lisez-moi']);
  const fab=T.feuille(feuilles,'Fabrications');
  assert.deepEqual(fab.lignes.slice(1).map(l=>l.join('|')),['Cuisine|1|AF/BC','Dotation|1|AF/YC','Dotation|2|AF/BC','Montage|1|AF/YC','Montage|2|AF/BC']);
  // Dans Excel : deux personnes en cuisine, une compagnie × classe de plus,
  // et une nouvelle branche au parcours complet.
  const at=T.feuille(feuilles,'Ateliers');
  const col=at.lignes[0].indexOf('Personnes');
  at.lignes.find(l=>l[0]==='Cuisine')[col]=2;
  fab.lignes.push(['Cuisine',2,'DL/BC']);
  assert.deepEqual(T.feuille(feuilles,'Parcours').lignes[0],['Parcours','De','Vers'],'une ligne par lien du diagramme');
  T.feuille(feuilles,'Parcours').lignes.push(['Complet','Armement','MONTAGE']);
  const modifie=path.join(dossier,'ateliers-modifie.xlsx');
  fs.writeFileSync(modifie,T.ecrireClasseur(feuilles));
  await page.locator('#at-import').setInputFiles(modifie);await attendre(400);
  const etat=await page.evaluate(()=>Sim.ateliers.state);
  const cuisine=etat.ateliers.find(a=>a.nom==='Cuisine');
  assert.equal(cuisine.personnes,2);
  assert.deepEqual(cuisine.lots,[['AF/BC'],['DL/BC']]);
  assert.ok(etat.parcours.find(p=>p.id==='complet').liens.some(l=>l.de==='armement'&&l.vers==='prepa'));
  assert.match(await page.locator('#at-status').textContent(),/Cases importées/);
  // Un classeur faux est refusé en bloc, et dit quoi corriger.
  const nAvant=await page.evaluate(()=>Sim.ateliers.state.ateliers.length);
  at.lignes.push(['Fantaisie','GARAGE','manuel',1]);
  const faux=path.join(dossier,'faux.xlsx');fs.writeFileSync(faux,T.ecrireClasseur(feuilles));
  await page.locator('#at-import').setInputFiles(faux);await attendre(400);
  assert.match(await page.locator('#at-status').textContent(),/Import refusé[\s\S]*service inconnu « GARAGE »[\s\S]*Rien n’a été importé/);
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.length),nAvant,'rien n’a changé');
  // Et l'import s'annule.
  await page.locator('#at-undo').click();await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.nom==='Cuisine').personnes),1);

  // 2 bis. Les horaires seuls : un petit classeur, et seules les heures changent.
  const {f:fH,nom:nomH}=await telecharger('#at-export-horaires','horaires.xlsx');
  assert.match(nomH,/^ory-horaires-.*\.xlsx$/);
  const hor=await T.lireClasseur(fs.readFileSync(fH));
  assert.deepEqual(hor.map(f=>f.nom),['Horaires','Lisez-moi']);
  const h=T.feuille(hor,'Horaires');
  assert.deepEqual(h.lignes[0].slice(0,3),['Atelier','Jour','Début']);
  const ligneCuisine=h.lignes.find(l=>l[0]==='Cuisine');
  assert.deepEqual(ligneCuisine.slice(1,3),['J','05:00']);
  assert.match(String(ligneCuisine[5]),/^\d\d:\d\d$/,'la fin prévue, pour se repérer');
  ligneCuisine[1]='J-1';ligneCuisine[2]='21:30';
  const avantH=await page.evaluate(()=>JSON.stringify(Sim.ateliers.state.ateliers.map(({debut,jour,...a})=>a)));
  const finAvant=await page.evaluate(()=>Sim.ateliers.resultat.lots.find(l=>l.service==='cuisine').debut);
  const modifH=path.join(dossier,'horaires-modifie.xlsx');fs.writeFileSync(modifH,T.ecrireClasseur(hor));
  await page.locator('#at-import').setInputFiles(modifH);await attendre(400);
  const cu=await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.nom==='Cuisine'));
  assert.deepEqual([cu.debut,cu.jour],['21:30',-1]);
  assert.equal(await page.evaluate(()=>JSON.stringify(Sim.ateliers.state.ateliers.map(({debut,jour,...a})=>a))),avantH,'rien d’autre ne change');
  assert.match(await page.locator('#at-status').textContent(),/Horaires importés : 1 case décalée \(Cuisine\)/);
  assert.equal(await page.evaluate(()=>Sim.ateliers.resultat.lots.find(l=>l.service==='cuisine').debut),-150,'la journée est recalculée : la cuisine part la veille à 21:30');
  assert.notEqual(finAvant,-150);
  await page.locator('#at-undo').click();await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.nom==='Cuisine').debut),'05:00','annulable');

  // 3. Le classeur des vols : départs et retours, aller-retour.
  // L'import et l'export des vols vivent à l'étape 1, « Les vols ».
  await nav.vue(page,'vols');await nav.aller(page,'v-programme');await attendre();
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

  // 4. « Qui prépare quoi » se calcule : une ligne par commande, une colonne
  //    par service, dans chaque case celle qui la prépare — et un clic mène au chemin.
  await nav.vue(page,'ateliers');await nav.aller(page,'at-grille');await attendre();
  const kase=(c,s)=>page.locator(`[data-qf=aller][data-classe="${c}"][data-service=${s}]`);
  assert.match(await kase('AF/BC','cuisine').textContent(),/Cuisine/,'la case figure dans sa cellule, avec ses heures');
  assert.match(await kase('AF/BC','cuisine').textContent(),/\d\d:\d\d–\d\d:\d\d/);
  assert.equal(await page.locator('tr[data-classe="AF/YC"] td.hors').count()>=2,true,'YC ne passe ni en cuisine ni en légumerie : grisé');
  assert.match(await kase('DL/BC','cuisine').textContent(),/à faire/,'une étape sans case est à faire');
  assert.equal(await page.locator('.qf-menu').count(),0,'plus de menu : le tableau ne se modifie pas, il se lit');
  assert.equal(await page.locator('[data-qf=remplir]').count(),0);
  // Une cellule ouvre le chemin de sa commande, sur son service.
  await kase('DL/BC','cuisine').click();await attendre();
  assert.equal(await page.locator('[data-sous-onglet=at-chemins]').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('.pc-cmd.actif').getAttribute('data-classe'),'DL/BC');
  // Le tableau se relit.
  await nav.aller(page,'at-grille');await attendre();
  // Filtrer : chercher une compagnie.
  await page.fill('[data-qf=recherche]','AF/');
  assert.ok(await page.locator('tr[data-classe]:visible').count()>0);
  assert.equal(await page.locator('tr[data-classe^="DL"]:visible').count(),0,'DL est masquée');
  await page.fill('[data-qf=recherche]','');
  // Une ligne se suit dans le temps, étape par étape, et le dit en clair.
  await page.locator('[data-qf=suivre][data-classe="AF/BC"]').click();await attendre();
  assert.equal(await page.locator('.qf-temps svg').count(),1,'le chemin de AF/BC dans le temps');
  assert.match(await page.locator('.qf-temps .qf-phrase').textContent(),/AF · Business (est prête à \d\d:\d\d|n’est pas encore prête)/);

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('excel-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

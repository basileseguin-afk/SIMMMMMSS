/* Piloter le site depuis Excel, et décrire le chemin de chaque classe.
 *  1. les chemins : branches, jonction, variante d'une commande (dans « Chemins », évolution 22 c) ;
 *  2. le classeur des ateliers : exporter, modifier dans « Excel », réimporter ;
 *  3. le classeur des vols : départs et retours, aller-retour ;
 *  4. le tableau « Étapes de chaque commande » : il se lit dans « Détails › Commandes », et se suit dans le temps. */
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
 // (Évolution 22 e : les boutons des classeurs sont dans le tableau de « Fichiers ».)
 const telecharger=async(sel,nom)=>{const ici=await page.evaluate(()=>document.body.dataset.sous);await nav.versFichiers(page,sel);
   const [d]=await Promise.all([page.waitForEvent('download'),page.locator(sel).click()]);if(ici&&ici!==await page.evaluate(()=>document.body.dataset.sous))await nav.aller(page,ici);
   const f=path.join(dossier,nom);await d.saveAs(f);return {f,nom:d.suggestedFilename()};};
 // Tirer le « + » d'un service jusqu'à un autre, dans le diagramme des chemins.
 // Relier au clic : le + du premier, puis le second (le trait tiré est éprouvé dans graphe-browser).
 const tirer=async(de,vers)=>{
   await page.locator(`${G} .gr-port[data-port=${de}]`).click();await attendre();
   await page.locator(`${G} [data-noeud=${vers}] .gr-fond`).click();await attendre();
 };
 // (Évolution 22 c : un seul éditeur de chemin, dans « Chemins » — la liste à gauche, le chemin choisi à droite.)
 const G='#mu-flux [data-mu-graphe]';
 const ouvrir=async id=>{await page.locator(`#mu-flux .ch-liste [data-mu-flux-choisir="${id}"]`).click();await attendre();};
 const liens=id=>page.evaluate(id=>Sim.ateliers.state.parcours.find(p=>p.id===id).liens.map(l=>l.de+'>'+l.vers),id);
 const lot=(service,classe)=>page.evaluate(([s,c])=>Sim.ateliers.resultat.lots.find(l=>l.service===s&&l.classes.includes(c)),[service,classe]);
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await page.waitForTimeout(200);await nav.effectifSaisi(page);   // les personnes se saisissent ici (05/10)
  await nav.vue(page,'ateliers');await attendre();

  // 1. Deux chemins, prêts : YC ne passe ni par la cuisine ni par la légumerie.
  await nav.aller(page,'mu-flux');await attendre();
  assert.equal(await page.locator('#mu-flux .ch-liste [data-mu-flux-choisir]').count(),2,'deux chemins, deux lignes dans la liste');
  // Chaque classe suit le sien : « Qui le suit » la coche.
  const defaut=async c=>{for(const id of ['complet','sans-cuisine']){await ouvrir(id);await nav.sectionChemin(page,'suivi');
    if(await page.locator(`#mu-flux [data-mu-flux-classe="${c}"]`).isChecked())return id;}return '';};
  assert.equal(await defaut('BC'),'complet');
  assert.equal(await defaut('YC'),'sans-cuisine');
  // Un chemin est un diagramme : un nœud par service, un trait par livraison.
  await ouvrir('complet');
  // (Évolution 24 b : le magasin, un fournisseur, n'est plus dessiné. Deux traits arrivent au montage, de ses étapes, et
  //  il porte la pastille de son fournisseur ; « Montrer les fournisseurs sur le schéma » redonne le troisième trait.)
  assert.equal(await page.locator(`${G} .gr-lien[data-lien$=">prepa"]`).count(),2,'deux traits arrivent au montage, de ses étapes');
  assert.equal(await page.locator(`${G} [data-noeud=prepa] .ch-pastille`).count(),1,'et la pastille de son fournisseur');
  await page.locator('#mu-flux [data-ch-fournisseurs]').click();await page.waitForTimeout(300);
  assert.equal(await page.locator(`${G} .gr-lien[data-lien$=">prepa"]`).count(),3,'le dessin complet : trois traits arrivent au montage');
  await page.locator('#mu-flux [data-ch-fournisseurs]').click();await page.waitForTimeout(300);
  await ouvrir('sans-cuisine');
  assert.equal(await page.locator(`${G} [data-noeud=cuisine], ${G} [data-noeud=decontam]`).count(),0,
    'le chemin sans cuisine n’a ni cuisine ni légumerie');
  assert.equal(await page.locator('[data-mu-graphe]').count(),1,'un seul éditeur de chemin');

  // Trois équipes : cuisine, dotation, montage. Le montage YC n'attend que la dotation.
  const creer=async(nom,service,lots)=>{
    // (Évolution 22 b : une équipe s'ajoute dans la fiche de son service.)
    const id=await nav.ajouterEquipe(page,service);await attendre();
    await page.evaluate(([id,nom,service,lots])=>Sim.ateliers.changer(()=>{
      Object.assign(Sim.ateliers.state.ateliers.find(a=>a.id===id),{nom,service,debut:'05:00',personnes:2,lots});
    }),[id,nom,service,lots]);
    await attendre();return id;
  };
  await creer('Cuisine','cuisine',[['AF/BC']]);
  await creer('Dotation','dotation',[['AF/YC'],['AF/BC']]);
  await creer('Montage','prepa',[['AF/YC'],['AF/BC']]);
  assert.equal((await lot('prepa','AF/YC')).debut,(await lot('dotation','AF/YC')).fin,'YC : le montage attend la dotation, pas la cuisine');
  assert.ok((await lot('prepa','AF/BC')).debut>=(await lot('cuisine','AF/BC')).fin,'BC : le montage attend la cuisine');
  assert.match(await page.locator('#at-anomalies').textContent(),/commandes? commencées? sautent? une étape sans équipe[\s\S]*L’unité › Services et équipes/,'les étapes sans équipe renvoient au tableau');

  // Une commande qui suit le chemin de sa classe peut avoir sa variante, copiée du chemin.
  await nav.aller(page,'mu-flux');await attendre();
  await ouvrir('sans-cuisine');await nav.sectionChemin(page,'suivi');
  assert.equal(await page.locator('#mu-flux .ch-suivent select[data-mu-cmd-chemin="AF/YC"]').count(),1,'AF/YC suit le chemin « Sans cuisine »');
  await page.locator('#mu-flux [data-ch-variante]').selectOption('AF/YC');await attendre(400);
  const propre=await page.evaluate(()=>Sim.ateliers.state.parcoursClasse['AF/YC']);
  assert.equal(await page.evaluate(id=>Sim.ateliers.state.parcours.find(p=>p.id===id).nom,propre),'Sans cuisine · AF YC');
  assert.equal(await page.evaluate(()=>OrlyParcours.fluxDe(Sim.ateliers.state,'TX/YC').id),'sans-cuisine','les autres gardent le chemin');
  assert.equal(await page.locator('#mu-flux .ch-fiche [data-mu-flux-nom]').inputValue(),'Sans cuisine · AF YC','la variante est ouverte');
  assert.equal(await page.locator('#mu-flux [data-mu-flux-ajout]').count(),1,'et se modifie sur place');
  await page.locator('#mu-flux [data-mu-flux-action=supprimer]').click();await attendre(400);
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.parcoursClasse['AF/YC']),undefined,'supprimée, la commande suit de nouveau le chemin de sa classe');
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>/AF YC/.test(a.nom)).length),0,'aucune équipe propre ne reste');

  // Modifier un chemin dans son diagramme : ajouter un service (il entre à sa place), le relier en
  // tirant un trait, refuser une boucle, retirer le lien puis le service.
  await nav.aller(page,'mu-flux');await attendre();
  await ouvrir('sans-cuisine');
  const avant=await liens('sans-cuisine');
  await page.selectOption('#mu-flux [data-mu-flux-ajout]','armement');await attendre();
  assert.equal(await page.locator(`${G} [data-noeud=armement]`).count(),1,'le service rejoint le diagramme');
  const avec=await liens('sans-cuisine');
  assert.deepEqual(avec,avant.concat('armement>prepa'),'à sa place : l’armement livre le montage');
  await tirer('plonge','armement');
  assert.deepEqual(await liens('sans-cuisine'),avec.concat('plonge>armement'),'tirer un trait crée le lien');
  assert.match(await page.locator('#at-status').textContent(),/Plonge livre maintenant Armement/);
  // Une boucle est refusée : le montage ne livre pas l'armement, qui le livre déjà.
  await tirer('prepa','armement');
  assert.deepEqual(await liens('sans-cuisine'),avec.concat('plonge>armement'),'montage → armement ferait tourner en rond');
  assert.match(await page.locator('#at-status').textContent(),/Impossible[\s\S]*livre déjà/);
  // Un lien choisi se retire par sa croix.
  await page.locator(`${G} .gr-lien[data-lien="plonge>armement"] .gr-prise`).click({force:true});await attendre();
  await page.locator(`${G} .gr-retirer`).click();await attendre();
  assert.deepEqual(await liens('sans-cuisine'),avec);
  // Une étape choisie se retire du chemin, depuis son tableau.
  await page.locator(`${G} [data-noeud=armement]`).click();await attendre();
  await page.locator('#mu-flux .ch-etape [data-mu-flux-action=retirer-service]').click();await attendre();
  assert.equal(await page.locator(`${G} [data-noeud=armement]`).count(),0,'et le service quitte le chemin');
  assert.deepEqual(await liens('sans-cuisine'),avant,'avec ses liens');

  // 2. Le classeur des ateliers : export, modification « dans Excel », import.
  const {f:fAt,nom:nomAt}=await telecharger('#at-export','ateliers.xlsx');
  assert.match(nomAt,/^ory-ateliers-.*\.xlsx$/);
  const feuilles=await T.lireClasseur(fs.readFileSync(fAt));
  assert.deepEqual(feuilles.map(f=>f.nom),['Équipes','Horaires','Fabrications','Par compagnie','Heures propres','Débits robot','Tunnels','Handling','Chauffeurs','Plonge par vol','Classes','Parcours','Parcours par classe','Matériel','Lisez-moi']);
  const fab=T.feuille(feuilles,'Fabrications');
  assert.deepEqual(fab.lignes.slice(1).map(l=>l.join('|')),['Cuisine|1|AF/BC','Dotation|1|AF/YC','Dotation|2|AF/BC','Montage|1|AF/YC','Montage|2|AF/BC']);
  // Dans Excel : deux personnes en cuisine, une compagnie × classe de plus,
  // et une nouvelle branche au parcours complet.
  const at=T.feuille(feuilles,'Équipes');
  const col=at.lignes[0].indexOf('Personnes');
  at.lignes.find(l=>l[0]==='Cuisine')[col]=2;
  fab.lignes.push(['Cuisine',2,'FWI/BC']);
  assert.deepEqual(T.feuille(feuilles,'Parcours').lignes[0],['Parcours','De','Vers'],'une ligne par lien du diagramme');
  T.feuille(feuilles,'Parcours').lignes.push(['Complet','Armement','MONTAGE']);
  const modifie=path.join(dossier,'ateliers-modifie.xlsx');
  fs.writeFileSync(modifie,T.ecrireClasseur(feuilles));
  await page.locator('#at-import').setInputFiles(modifie);await attendre(400);
  const etat=await page.evaluate(()=>Sim.ateliers.state);
  const cuisine=etat.ateliers.find(a=>a.nom==='Cuisine');
  assert.equal(cuisine.personnes,2);
  assert.deepEqual(cuisine.lots,[['AF/BC'],['FWI/BC']]);
  assert.ok(etat.parcours.find(p=>p.id==='complet').liens.some(l=>l.de==='armement'&&l.vers==='prepa'));
  assert.match(await page.locator('#at-status').textContent(),/Équipes importées/);
  // Un classeur faux est refusé en bloc, et dit quoi corriger.
  const nAvant=await page.evaluate(()=>Sim.ateliers.state.ateliers.length);
  at.lignes.push(['Fantaisie','GARAGE','manuel',1]);
  const faux=path.join(dossier,'faux.xlsx');fs.writeFileSync(faux,T.ecrireClasseur(feuilles));
  await page.locator('#at-import').setInputFiles(faux);await attendre(400);
  assert.match(await page.locator('#at-status').textContent(),/Import refusé[\s\S]*service inconnu « GARAGE »[\s\S]*Rien n’a été importé/);
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.length),nAvant,'rien n’a changé');
  // Et l'import s'annule.
  await page.locator('#btn-annuler').click();await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.nom==='Cuisine').personnes),2);

  // 2 bis. Les horaires seuls : un petit classeur, et seules les heures changent.
  const {f:fH,nom:nomH}=await telecharger('#at-export-horaires','horaires.xlsx');
  assert.match(nomH,/^ory-horaires-.*\.xlsx$/);
  const hor=await T.lireClasseur(fs.readFileSync(fH));
  assert.deepEqual(hor.map(f=>f.nom),['Horaires','Lisez-moi']);
  const h=T.feuille(hor,'Horaires');
  assert.deepEqual(h.lignes[0].slice(0,3),['Équipe','Jour','Début']);
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
  assert.match(await page.locator('#at-status').textContent(),/Horaires importés : 1 équipe décalée \(Cuisine\)/);
  assert.equal(await page.evaluate(()=>Sim.ateliers.resultat.lots.find(l=>l.service==='cuisine').debut),-150,'la journée est recalculée : la cuisine part la veille à 21:30');
  assert.notEqual(finAvant,-150);
  await page.locator('#btn-annuler').click();await attendre();
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

  // 4. « Étapes de chaque commande » se calcule : une ligne par commande, une colonne par service, dans chaque
  //    cellule l'équipe qui la prépare. (Évolution 22 c : ce n'est plus une page de réglage ; le tableau se lit dans
  //    « Détails › Commandes », replié sous les commandes, et « Chemins » y mène.)
  await nav.aller(page,'mu-flux');await attendre();
  await page.locator('#mu-flux .ch-resultats [data-page="at-repas"]').click();await attendre(400);
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'at-repas','« Suivre ces commandes dans les résultats » mène à « Détails › Commandes »');
  assert.equal(await page.locator('#at-etapes').evaluate(d=>d.open),true,'et déplie le tableau des étapes');
  const kase=(c,s)=>page.locator(`[data-qf=aller][data-classe="${c}"][data-service=${s}]`);
  assert.match(await kase('AF/BC','cuisine').textContent(),/Cuisine/,'l’équipe figure dans sa cellule, avec ses heures');
  assert.match(await kase('AF/BC','cuisine').textContent(),/\d\d:\d\d–\d\d:\d\d/);
  assert.equal(await page.locator('tr[data-classe="AF/YC"] td.hors').count()>=2,true,'YC ne passe ni en cuisine ni en légumerie : grisé');
  assert.match(await kase('FWI/BC','cuisine').textContent(),/à faire/,'une étape sans équipe est à faire');
  assert.equal(await page.locator('.qf-menu').count(),0,'plus de menu : le tableau ne se modifie pas, il se lit');
  assert.equal(await page.locator('[data-qf=remplir]').count(),0);
  assert.equal(await page.locator('.pc-graphe:visible, [data-mu-graphe]:visible').count(),0,'aucun éditeur de chemin sur la page des résultats');
  // Une cellule ouvre le chemin de sa commande, sur son service : dans « Chemins », la commande est « à corriger ».
  await kase('FWI/BC','cuisine').click();await attendre(400);
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-flux');
  assert.equal(await page.locator('#mu-flux .ch-etape').getAttribute('data-ch-etape'),'cuisine');
  assert.match(await page.locator('#mu-flux .ch-etape tr.ch-vise[data-ch-cmd="FWI/BC"]').innerText(),/à corriger/);
  // Le tableau se relit : replié, il ne se dessine pas ; déplié, il revient.
  await nav.aller(page,'at-repas');await attendre();
  assert.equal(await page.locator('#at-etapes').evaluate(d=>d.open),true,'il reste déplié');
  await page.locator('#at-etapes>summary').click();await attendre();
  assert.equal(await page.locator('#at-etapes .qf').count(),0,'replié, il n’est pas dessiné');
  await page.locator('#at-etapes>summary').click();await attendre();
  // Filtrer : chercher une compagnie.
  await page.fill('[data-qf=recherche]','AF/');
  assert.ok(await page.locator('tr[data-classe]:visible').count()>0);
  assert.equal(await page.locator('tr[data-classe^="FWI"]:visible').count(),0,'FWI est masquée');
  await page.fill('[data-qf=recherche]','');
  // Une ligne se suit dans le temps, étape par étape, et le dit en clair.
  await page.locator('[data-qf=suivre][data-classe="AF/BC"]').click();await attendre();
  assert.equal(await page.locator('.qf-temps svg').count(),1,'le chemin de AF/BC dans le temps');
  assert.equal(await page.locator('[data-mu-graphe]:visible, .pc-graphe:visible').count(),0,'toujours sans éditeur de chemin');
  assert.match(await page.locator('.qf-temps .qf-phrase').textContent(),/AF · Business (est prête à \d\d:\d\d|n’est pas encore prête)/);

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('excel-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

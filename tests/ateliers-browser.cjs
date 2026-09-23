/* L'onglet « Ateliers de travail » : saisie, enchaînement, attente des amonts,
 * robot, planning, couverture par compagnie × classe, persistance. */
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(120);
 const etat=()=>page.evaluate(()=>structuredClone(Sim.ateliers.state));
 const resultat=()=>page.evaluate(()=>({ok:Sim.ateliers.resultat.ok,
   anomalies:Sim.ateliers.resultat.anomalies.map(a=>a.code),
   lots:(Sim.ateliers.resultat.lots||[]).map(l=>({service:l.service,nom:l.nom,debut:l.debut,fin:l.fin,attente:l.attente,plateaux:l.plateaux})),
   parClasse:Sim.ateliers.resultat.parClasse}));
 const champ=async(id,nom,valeur)=>{
   const s=`[data-at="${id}"] [data-at-champ=${nom}]`;
   if(nom==='service'||nom==='type'||nom==='jour')await page.selectOption(s,valeur);
   else{await page.fill(s,String(valeur));await page.dispatchEvent(s,'change');}
   await attendre();
 };
 const creer=async(nom,service,debut,personnes,type)=>{
   await page.locator('#at-new').click();await attendre();
   const id=await page.evaluate(()=>Sim.ateliers.state.ateliers.at(-1).id);
   await champ(id,'service',service);await champ(id,'nom',nom);
   await champ(id,'debut',debut);await champ(id,'personnes',personnes);
   if(type)await champ(id,'type',type);
   return id;
 };
 // Créer un atelier ouvre sa carte et referme la précédente : pour agir sur
 // une carte plus ancienne, il faut la rouvrir.
 const ouvrir=async(id)=>{
   if(await page.evaluate(id=>Sim.ateliers.ouvert===id,id))return;
   await page.locator(`[data-at="${id}"] .at-carte-nom`).click();await attendre();
 };
 // Une fabrication s'ajoute d'un seul geste : la ligne na\u00eet avec sa classe.
 // Les suivantes de la m\u00eame ligne passent par « fabriquer en m\u00eame temps ».
 const lot=async(id,classes)=>{
   await ouvrir(id);
   await page.selectOption(`[data-at="${id}"] [data-at-champ=lot-nouveau]`,classes[0]);await attendre();
   const i=await page.evaluate(([id,c])=>Sim.ateliers.state.ateliers.find(a=>a.id===id).lots.findIndex(l=>l.includes(c)),[id,classes[0]]);
   for(const c of classes.slice(1)){await page.selectOption(`[data-at="${id}"] [data-at-champ=lot-ajout][data-index="${i}"]`,c);await attendre();}
   return i;
 };
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await page.locator('[data-view=ateliers]').click();await attendre();

  // 1. L'onglet occupe toute la largeur et part d'une page vide qui explique.
  assert.equal(await page.locator('#view-ateliers').isVisible(),true);
  assert.equal(await page.locator('.workbench').isVisible(),false,'la colonne de droite s’efface');
  assert.equal(await page.locator('#view-plan').isVisible(),false,'le plan n’est plus la vue des ateliers');
  assert.match(await page.locator('.at-vide').textContent(),/Aucun atelier/);

  // 2. Toutes les compagnies × classes du programme sont listées, à fabriquer.
  const lignes=await page.locator('#at-classes tbody tr').count();
  assert.equal(lignes,34,'34 compagnies × classes dans le jeu de démonstration');
  assert.equal(await page.locator('.at-etat.manque').count(),34,'aucune n’est fabriquée au départ');
  // CREW et SPML sont des classes comme les autres : elles figurent au tableau.
  const ids=await page.locator('#at-classes tbody tr th').allTextContents();
  assert.ok(ids.some(t=>t.includes('/CREW')),'les plateaux d’équipage sont comptés');
  assert.ok(ids.some(t=>t.includes('/SPML')),'les repas spéciaux aussi');

  // 3. Un atelier enchaîne ses lots : le second démarre quand le premier finit.
  const cui=await creer('Cuisine CRL','cuisine','04:30',6);
  await lot(cui,['CRL/BC']);await lot(cui,['CRL/PC']);
  let r=await resultat();
  assert.equal(r.ok,true,JSON.stringify(r.anomalies));
  assert.equal(r.lots.length,2);
  assert.equal(r.lots[0].debut,4*60+30,'il part à l’heure dite');
  assert.equal(r.lots[1].debut,r.lots[0].fin,'le second enchaîne sans trou');

  // 3 bis. « Terminé » referme la fiche et confirme : sans ce geste, on cherche
  //        un bouton de création qui n'existe pas et on doute que l'atelier soit là.
  assert.equal(await page.evaluate(()=>Sim.ateliers.ouvert),cui,'la fiche est ouverte');
  await page.locator(`[data-at="${cui}"] [data-at-action=fermer]`).click();await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.ouvert),null,'la fiche est refermée');
  assert.match(await page.locator('#at-status').textContent(),/enregistré/,'et l’enregistrement est dit');
  assert.equal((await etat()).ateliers.length,1,'l’atelier reste, il n’y avait rien à valider');

  // 4. Un atelier aval attend son amont, et l'attente est chiffrée.
  const mon=await creer('Montage CRL','prepa','04:00',8);
  await lot(mon,['CRL/BC']);
  r=await resultat();
  const amont=r.lots.find(l=>l.service==='cuisine'&&l.nom==='CRL/BC');
  const aval=r.lots.find(l=>l.service==='prepa'&&l.nom==='CRL/BC');
  assert.equal(aval.debut,amont.fin,'le montage part quand la cuisine a livré');
  assert.ok(aval.attente>0,'l’attente est mesurée');
  assert.equal(Math.round(aval.attente),Math.round(amont.fin-4*60),'elle vaut le temps perdu depuis son heure de début');

  // 5. Le robot travaille au débit et refuse de tourner sous son minimum.
  const rob=await creer('Robot YC','prepa','06:00',3,'robot');
  await champ(rob,'debit',300);await champ(rob,'personnesMin',2);
  await lot(rob,['CRL/YC']);
  r=await resultat();
  const lrob=r.lots.find(l=>l.plateaux!==undefined);
  assert.equal(lrob.plateaux,340,'les passagers YC de CRL');
  assert.ok(Math.abs((lrob.fin-lrob.debut)-340/300*60)<1e-6);
  await champ(rob,'personnes',1);
  r=await resultat();
  assert.ok(r.anomalies.includes('personnesMin'),'l’effectif insuffisant est signalé');
  await champ(rob,'personnes',3);

  // 6. Une pause repousse la fin sans changer le travail.
  const avant=(await resultat()).lots.find(l=>l.plateaux!==undefined);
  // L’arrêt programmé est replié tant qu’il n’y en a aucun : il faut l’ouvrir.
  await page.locator(`[data-at="${rob}"] .at-arrets > summary`).click();
  await page.locator(`[data-at="${rob}"] [data-at-action=pause-ajouter]`).click();await attendre();
  await page.fill(`[data-at="${rob}"] [data-at-champ=pause-de][data-index="0"]`,'06:10');
  await page.dispatchEvent(`[data-at="${rob}"] [data-at-champ=pause-de][data-index="0"]`,'change');await attendre();
  await page.fill(`[data-at="${rob}"] [data-at-champ=pause-a][data-index="0"]`,'06:40');
  await page.dispatchEvent(`[data-at="${rob}"] [data-at-champ=pause-a][data-index="0"]`,'change');await attendre();
  const apres=(await resultat()).lots.find(l=>l.plateaux!==undefined);
  assert.equal(apres.fin,avant.fin+30,'la pause de 30 min décale la fin de 30 min');

  // 7. Le planning dessine une barre par lot.
  assert.equal(await page.locator('#at-planning svg').count(),1);
  assert.equal(await page.locator('#at-planning .at-pl-lot').count(),4,'quatre lots fabriqués');
  assert.equal(await page.locator('#at-planning .at-pl-lot.robot').count(),1,'le robot se distingue');
  assert.ok(await page.locator('#at-planning .at-pl-attente').count()>0,'l’attente est dessinée');

  // 8. La couverture par classe dit ce qui sort et par où.
  const etats=await page.locator('#at-classes tbody tr').evaluateAll(rs=>rs.map(r=>r.cells[0].textContent.trim()+'|'+r.cells[5].textContent));
  assert.ok(etats.some(t=>t.startsWith('CRL/BC')&&/à l’heure/.test(t)));
  assert.equal(etats.filter(t=>/jamais fabriquée/.test(t)).length,31,'34 classes moins les 3 fabriquées');
  // Par où elle passe, et qui la fabrique : le tableau « Qui fabrique quoi » le dit case par case.
  const traverses=await page.locator('tr[data-classe="CRL/BC"] .qf-case.ok').evaluateAll(bs=>bs.map(b=>b.dataset.service).sort());
  assert.deepEqual(traverses,['cuisine','prepa'],'les services qui la fabriquent ont leur case remplie');

  // 9. Les indicateurs résument la journée.
  assert.match(await page.locator('#at-indicateurs').textContent(),/Classes à l’heure/);
  assert.match(await page.locator('#at-indicateurs').textContent(),/31/,'les classes sans atelier sont comptées');

  // 10. Annuler, rétablir, et la saisie survit au rechargement.
  const avantSuppr=(await etat()).ateliers.length;
  await page.locator(`[data-at="${rob}"] [data-at-action=supprimer]`).click();await attendre();
  assert.equal((await etat()).ateliers.length,avantSuppr-1);
  await page.locator('#at-undo').click();await attendre();
  assert.equal((await etat()).ateliers.length,avantSuppr,'l’annulation rend l’atelier');
  const garde=await etat();
  await page.reload();await page.locator('[data-view=ateliers]').click();await attendre();
  assert.deepEqual(await etat(),garde,'tout est relu du navigateur');

  // 11. Un fichier d'ateliers invalide est refusé en entier.
  await page.locator('#at-import').setInputFiles({name:'faux.json',mimeType:'application/json',
    buffer:Buffer.from('{"schema":"ory-ateliers","version":99,"ateliers":[]}')});
  await attendre();
  assert.match(await page.locator('#at-status').textContent(),/Import refusé/);
  assert.deepEqual(await etat(),garde,'rien n’a été remplacé');

  // 12. Retirer une compagnie × classe coupe ses liens avec les ateliers.
  const cui2=await creer('Cuisine CRL 2','cuisine','04:00',4);
  const iLot=await lot(cui2,['CRL/BC','CRL/PC']);
  await page.selectOption(`[data-at="${cui2}"] [data-at-champ=lot-ajout][data-index="${iLot}"]`,'CRL/YC');await attendre();
  assert.deepEqual((await etat()).ateliers.find(a=>a.id===cui2).lots,[['CRL/BC','CRL/PC','CRL/YC']]);
  const avantLignes=await page.locator('#at-classes tbody tr').count();
  await page.locator('[data-at-action=classe-supprimer][data-classe="CRL/PC"]').click();await attendre();
  assert.equal(await page.locator('#at-classes tbody tr').count(),avantLignes-1,'la ligne dispara\u00eet');
  assert.deepEqual((await etat()).ateliers.find(a=>a.id===cui2).lots,[['CRL/BC','CRL/YC']],
    'le lien est coup\u00e9 dans le lot, les autres classes restent');
  assert.match(await page.locator('#at-status').textContent(),/CRL\/PC retir\u00e9e/);
  assert.equal((await resultat()).ok,true,'le mod\u00e8le tourne encore : aucun lot ne d\u00e9signe un inconnu');

  // 13. Un lot vidé de sa dernière classe disparaît avec elle.
  const seul=await creer('Armement CRL','armement','05:00',2);
  await lot(seul,['CRL/YC']);
  assert.equal((await etat()).ateliers.find(a=>a.id===seul).lots.length,1);
  await page.locator('[data-at-action=classe-supprimer][data-classe="CRL/YC"]').click();await attendre();
  assert.deepEqual((await etat()).ateliers.find(a=>a.id===seul).lots,[],'plus de lot, puisqu\u2019il n\u2019avait que celle-l\u00e0');
  assert.deepEqual((await etat()).ateliers.find(a=>a.id===cui2).lots,[['CRL/BC']],'et l\u2019autre atelier perd juste le lien');

  // 14. Un retrait se rétablit : rien n'est perdu définitivement.
  assert.match(await page.locator('.at-exclues').textContent(),/CRL\/PC/);
  await page.locator('[data-at-action=classe-retablir][data-classe="CRL/PC"]').click();await attendre();
  assert.equal(await page.locator('#at-classes tbody tr').count(),avantLignes-1,'CRL/PC revient, CRL/YC reste retir\u00e9e');
  assert.ok((await etat()).exclues.includes('CRL/YC'));
  assert.ok(!(await etat()).exclues.includes('CRL/PC'));

  // 15. On déclare une compagnie × classe que le programme de vols ne porte pas.
  //     On ne lui saisit QUE son identité : passagers, vols et échéance viennent
  //     de l'import, et les redemander ouvrirait deux vérités.
  await page.locator('[data-at-action=classe-nouvelle]').click();await attendre();
  assert.equal(await page.locator('#at-cls-pax').count(),0,'plus de champ Passagers');
  assert.equal(await page.locator('#at-cls-vols').count(),0,'plus de champ Vols');
  assert.equal(await page.locator('#at-cls-echeance').count(),0,'plus de champ Échéance');
  await page.fill('#at-cls-cie','zz');await page.selectOption('#at-cls-cabine','BC');
  await page.locator('[data-at-action=classe-valider]').click();await attendre();
  assert.match(await page.locator('#at-status').textContent(),/ZZ\/BC déclarée/);
  const ajoutee=(await etat()).ajoutees[0];
  assert.equal(ajoutee.cie,'ZZ','la compagnie est normalisée en majuscules');
  assert.equal(ajoutee.cabine,'BC');
  assert.deepEqual(Object.keys(ajoutee).sort(),['cabine','cie'],'rien d’autre n’est retenu');
  // Hors import, elle n'a ni volume ni échéance : on le dit, on ne l'invente pas.
  const ligneZZ=await page.locator('#at-classes tbody tr',{hasText:'ZZ/BC'}).first()
    .evaluate(tr=>[...tr.cells].slice(1,4).map(c=>c.textContent.trim()));
  assert.deepEqual(ligneZZ,['—','—','—'],'passagers, vols et échéance restent vides');
  // Elle se fabrique comme les autres.
  await ouvrir(cui2);
  await page.selectOption(`[data-at="${cui2}"] [data-at-champ=lot-ajout][data-index="0"]`,'ZZ/BC');await attendre();
  const rz=await resultat();
  assert.equal(rz.ok,true,JSON.stringify(rz.anomalies));
  assert.ok(rz.parClasse['ZZ/BC'].fin!=null,'ZZ/BC sort bien de l\u2019unit\u00e9');

  // 16. Une ajoutée se retire comme les autres, et quitte la liste pour de bon.
  await page.locator('[data-at-action=classe-supprimer][data-classe="ZZ/BC"]').click();await attendre();
  assert.equal((await etat()).ajoutees.length,0,'elle n\u2019est pas mise de c\u00f4t\u00e9, elle est supprim\u00e9e');
  assert.deepEqual((await etat()).ateliers.find(a=>a.id===cui2).lots,[['CRL/BC']]);

  // 17. Retraits et ajouts survivent au rechargement.
  await page.locator('[data-at-action=classe-nouvelle]').click();await attendre();
  await page.fill('#at-cls-cie','QQ');await page.locator('[data-at-action=classe-valider]').click();await attendre();
  const memoire=await etat();
  await page.reload();await page.locator('[data-view=ateliers]').click();await attendre();
  assert.deepEqual(await etat(),memoire,'exclusions et ajouts sont relus du navigateur');

  // 17 bis. La mise à disposition : un service qui ne fabrique pas.
  //         Ni effectif, ni homme-minutes, ni durée — et il sert TOUT.
  const mag=await creer('Magasin','magasin','06:00',2);
  await champ(mag,'type','dispo');
  const fiche=`[data-at="${mag}"]`;
  assert.equal(await page.locator(`${fiche} [data-at-champ=personnes]`).count(),0,'aucun effectif à saisir');
  assert.equal(await page.locator(`${fiche} [data-at-champ=lot-nouveau]`).count(),0,'rien à fabriquer');
  assert.equal(await page.locator(`${fiche} .at-arrets`).count(),0,'aucun arrêt programmé');
  assert.equal(await page.locator(`${fiche} [data-at-champ=permanent]`).isChecked(),true,'permanente par défaut');
  assert.equal(await page.locator(`${fiche} [data-at-champ=debut]`).count(),0,'permanente, elle n’a pas d’heure');
  const apresDispo=await resultat();
  assert.equal(apresDispo.ok,true,JSON.stringify(apresDispo.anomalies));
  const mise=apresDispo.lots.find(l=>l.service==='magasin');
  assert.equal(mise.fin,mise.debut,'elle ne dure pas');
  assert.ok(apresDispo.parClasse['CRL/BC'].services.includes('magasin'),'elle figure au parcours');
  // Décochée, elle prend une heure — et son aval l'attend.
  await page.locator(`${fiche} [data-at-champ=permanent]`).uncheck();await attendre();
  assert.equal(await page.locator(`${fiche} [data-at-champ=debut]`).count(),1,'l’heure apparaît');
  await champ(mag,'debut','09:00');
  const tard=(await resultat()).lots.find(l=>l.service==='magasin');
  assert.equal(tard.debut,9*60,'elle ouvre à l’heure dite');


  // 18. Le poste : pauses automatiques et heure de fin, visibles et r\u00e9glables.
  await ouvrir(cui2);
  assert.equal(await page.locator(`[data-at="${cui2}"] [data-at-champ=regime]`).isChecked(),true);
  assert.match(await page.locator(`[data-at="${cui2}"] .at-cases`).textContent(),/15 min apr\u00e8s 3 h, 30 min apr\u00e8s 6 h/);
  // La présence suit le réglage général tant que l'équipe n'en fixe pas une :
  // changer la règle commune doit déplacer tout le monde, pas seulement les
  // ateliers créés ensuite.
  const champPresence=`[data-at="${cui2}"] [data-at-champ=presence]`;
  assert.equal(await page.locator(champPresence).inputValue(),'','aucune valeur propre');
  assert.equal(await page.locator(champPresence).getAttribute('placeholder'),'495','le réglage général est montré');
  assert.match(await page.locator(`[data-at="${cui2}"] .at-cases`).textContent(),/réglage général/);
  assert.match(await page.locator(`[data-at="${cui2}"] .at-cases`).textContent(),/7,5 h de travail/);
  assert.equal(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).regime.presence,cui2),undefined);
  // Une valeur saisie l'emporte, et se rend en la vidant.
  await champ(cui2,'presence',600);
  assert.equal(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).regime.presence,cui2),600);
  assert.match(await page.locator(`[data-at="${cui2}"] .at-cases`).textContent(),/propre à cette équipe/);
  await champ(cui2,'presence','');
  assert.equal(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).regime.presence,cui2),undefined,'vider revient au réglage général');
  await page.locator(`[data-at="${cui2}"] [data-at-champ=regime]`).uncheck();await attendre();
  assert.equal(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).regime.actif,cui2),false);
  assert.equal(await page.locator(`[data-at="${cui2}"] [data-at-champ=presence]`).count(),0,'sans poste, pas de pr\u00e9sence \u00e0 r\u00e9gler');
  await page.locator(`[data-at="${cui2}"] [data-at-champ=regime]`).check();await attendre();

  // 19. La boucle du mat\u00e9riel : la plonge lave ce qui revient, la prod l'emporte.
  assert.equal(await page.locator('[data-at-champ=mat-unite]').count(),0,'rien à régler tant que le compte n’est pas tenu');
  await page.locator('[data-at-champ=mat-actif]').check();await attendre();
  // Le matériel se compte PAR CLASSE et PAR VOL : un trolley part avec le vol et
  // ne se multiplie pas parce que la cabine est pleine. Plus rien au passager.
  assert.equal(await page.locator('[data-at-champ=mat-unite]').count(),5,'une quantité par vol, par classe');
  assert.equal(await page.locator('[data-at-champ=mat-unite][data-part=parPax]').count(),0,'plus de compte au passager');
  const unite=c=>`[data-at-champ=mat-unite][data-cabine=${c}]`;
  await page.fill(unite('YC'),'6');await page.dispatchEvent(unite('YC'),'change');await attendre();
  assert.deepEqual(await page.evaluate(()=>Sim.ateliers.state.materiel.unites.YC),{parVol:6});
  const plonge=await creer('Plonge','plonge','05:00',3,'lavage');
  assert.equal(await page.locator(`[data-at="${plonge}"] [data-at-champ=lot-nouveau]`).count(),0,
    'un atelier de lavage n\u2019a pas de lots');
  assert.match(await page.locator(`[data-at="${plonge}"] .at-lavage-note`).textContent(),/retours de vols/);

  // 19 bis. La plonge se décrit TUNNEL PAR TUNNEL : son débit est la somme de
  //         ceux qui tournent — et un tunnel ne tourne que si l'équipe a les
  //         gens pour le tenir. Sans cela, additionner les débits donnerait une
  //         plonge deux fois trop rapide sans qu'on sache pourquoi.
  const total=()=>page.locator(`[data-at="${plonge}"] .at-bilan-debit`).textContent();
  assert.match(await total(),/300/,'un tunnel par défaut');
  await page.locator(`[data-at="${plonge}"] [data-at-action=tunnel-ajouter]`).click();await attendre();
  await page.fill(`[data-at="${plonge}"] [data-at-champ=tunnel-debit][data-index="1"]`,'600');
  await page.dispatchEvent(`[data-at="${plonge}"] [data-at-champ=tunnel-debit][data-index="1"]`,'change');await attendre();
  assert.match(await total(),/900/,'300 + 600, les deux sont tenus');
  // Deux personnes par tunnel, mais l'équipe est à trois : le second ne tourne pas.
  for(const i of [0,1]){
    const s=`[data-at="${plonge}"] [data-at-champ=tunnel-personnes][data-index="${i}"]`;
    await page.fill(s,'2');await page.dispatchEvent(s,'change');await attendre();
  }
  assert.match(await total(),/300 u\/h/,'seul le premier tunnel est tenu');
  assert.match(await total(),/1 tunnel\(s\) sur 2/);
  assert.match(await total(),/1 sans personnel/);
  assert.equal(await page.locator(`[data-at="${plonge}"] .at-tunnel.sans-personne`).count(),1,
    'le tunnel sans personnel se voit');
  assert.match(await page.locator('.at-anomalies').textContent(),/sans personne pour les tenir/);
  // Ajouter du monde le fait tourner.
  await champ(plonge,'personnes',4);
  assert.match(await total(),/900 u\/h/,'les deux tunnels tournent');
  assert.equal(await page.locator(`[data-at="${plonge}"] .at-tunnel.sans-personne`).count(),0);
  // Un tunnel à l'arrêt ne lave rien et ne mobilise personne, sans être supprimé.
  await page.locator(`[data-at="${plonge}"] [data-at-champ=tunnel-actif][data-index="0"]`).uncheck();await attendre();
  assert.match(await total(),/600 u\/h/);
  assert.match(await total(),/1 tunnel\(s\) sur 2/);
  const tunnels=await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).tunnels,plonge);
  assert.deepEqual(tunnels.map(t=>[t.debit,t.personnes,t.actif]),[[300,2,false],[600,2,true]]);
  await page.locator(`[data-at="${plonge}"] [data-at-champ=tunnel-actif][data-index="0"]`).check();await attendre();

  // 19 ter. Deux débits : celui de chaque ligne, et celui de L'ENSEMBLE.
  //         C'est le plus bas qui compte — ce qui est partagé entre les lignes
  //         les bride toutes, et un tunnel de plus n'y change rien.
  const debits=()=>page.evaluate(id=>{
    const b=document.querySelector(`[data-at="${id}"] .at-bilan-debit`);
    return [...b.querySelectorAll('b')].map(x=>x.textContent);
  },plonge);
  assert.deepEqual(await debits(),['900','—','900'],'sans plafond, la somme des lignes');
  const champPlafond=`[data-at="${plonge}"] [data-at-champ=plafond]`;
  assert.equal(await page.locator(champPlafond).getAttribute('placeholder'),'aucun plafond');
  await page.fill(champPlafond,'700');await page.dispatchEvent(champPlafond,'change');await attendre();
  assert.deepEqual(await debits(),['900','700','700'],'le plafond l’emporte');
  assert.equal(await page.locator(`[data-at="${plonge}"] .at-bilan-debit.bride`).count(),1,'et se voit');
  assert.match(await page.locator(`[data-at="${plonge}"] .at-tunnel-note`).textContent(),/Ici, c’est le plafond/);
  assert.equal(await page.evaluate(id=>MoteurProduction.debitLavage(
    Sim.ateliers.state.ateliers.find(a=>a.id===id)),plonge),700,'le moteur retient 700');
  // Un plafond plus haut que les lignes ne bride rien.
  await page.fill(champPlafond,'1500');await page.dispatchEvent(champPlafond,'change');await attendre();
  assert.deepEqual(await debits(),['900','1500','900']);
  assert.equal(await page.locator(`[data-at="${plonge}"] .at-bilan-debit.bride`).count(),0);
  // Le vider rend la plonge à ses lignes.
  await page.fill(champPlafond,'');await page.dispatchEvent(champPlafond,'change');await attendre();
  assert.deepEqual(await debits(),['900','—','900']);
  assert.equal(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).plafond,plonge),0);

  await ouvrir(cui2);
  await page.locator(`[data-at="${cui2}"] [data-at-champ=consomme]`).check();await attendre();
  const rm=await page.evaluate(()=>Sim.ateliers.resultat.materiel);
  assert.ok(rm.entrees>0,'les retours du programme ram\u00e8nent du mat\u00e9riel');
  assert.ok(rm.lavees>0,'la plonge en lave une partie');
  assert.match(await page.locator('.at-mat-bilan').textContent(),/Revenu des vols/);

  // Sans plonge, rien ne revient propre : la production attend pour de bon.
  await ouvrir(plonge);
  await page.locator(`[data-at="${plonge}"] [data-at-action=supprimer]`).click();await attendre();
  const sansPlonge=await page.evaluate(()=>Sim.ateliers.resultat);
  assert.equal(sansPlonge.materiel.lavees,0);
  assert.ok(sansPlonge.materiel.enAttente>0,'le lot attend un mat\u00e9riel qui ne vient pas');
  assert.equal(sansPlonge.parClasse['CRL/BC'].fin,null,'et la classe ne sort pas');

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('ateliers-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

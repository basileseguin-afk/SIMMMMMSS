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
 const lot=async(id,classes)=>{
   await ouvrir(id);
   await page.locator(`[data-at="${id}"] [data-at-action=lot-ajouter]`).click();await attendre();
   const i=await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).lots.length-1,id);
   for(const c of classes){await page.selectOption(`[data-at="${id}"] [data-at-champ=lot-ajout][data-index="${i}"]`,c);await attendre();}
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
  assert.equal(lignes,20,'20 compagnies × classes dans le jeu de démonstration');
  assert.equal(await page.locator('.at-etat.manque').count(),20,'aucune n’est fabriquée au départ');

  // 3. Un atelier enchaîne ses lots : le second démarre quand le premier finit.
  const cui=await creer('Cuisine CRL','cuisine','04:30',6);
  await lot(cui,['CRL/BC']);await lot(cui,['CRL/PC']);
  let r=await resultat();
  assert.equal(r.ok,true,JSON.stringify(r.anomalies));
  assert.equal(r.lots.length,2);
  assert.equal(r.lots[0].debut,4*60+30,'il part à l’heure dite');
  assert.equal(r.lots[1].debut,r.lots[0].fin,'le second enchaîne sans trou');

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
  assert.equal(etats.filter(t=>/jamais fabriquée/.test(t)).length,17);
  const parcours=await page.locator('#at-classes tbody tr').evaluateAll(rs=>(rs.find(r=>r.cells[0].textContent.trim()==='CRL/BC')||{cells:[]}).cells[6].textContent);
  assert.equal(parcours,'cuisine → prepa','le parcours réel est affiché');

  // 9. Les indicateurs résument la journée.
  assert.match(await page.locator('#at-indicateurs').textContent(),/Classes à l’heure/);
  assert.match(await page.locator('#at-indicateurs').textContent(),/17/,'les classes sans atelier sont comptées');

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

  // 15. On ajoute une compagnie × classe que le programme de vols ne porte pas.
  await page.locator('[data-at-action=classe-nouvelle]').click();await attendre();
  await page.fill('#at-cls-cie','zz');await page.selectOption('#at-cls-cabine','BC');
  await page.fill('#at-cls-pax','80');await page.fill('#at-cls-vols','2');await page.fill('#at-cls-echeance','09:30');
  await page.locator('[data-at-action=classe-valider]').click();await attendre();
  assert.match(await page.locator('#at-status').textContent(),/ZZ\/BC ajout\u00e9e/);
  const ajoutee=(await etat()).ajoutees[0];
  assert.equal(ajoutee.cie,'ZZ','la compagnie est normalis\u00e9e en majuscules');
  assert.equal(ajoutee.cabine,'BC');
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

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('ateliers-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

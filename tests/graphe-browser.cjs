/* Les diagrammes de nœuds dans la page : un chemin par commande, créé à la
 * main ; une case par service, choisie ou créée dans le chemin, avec ses
 * personnes et ses man-minutes ; « dupliquer pour… » dans les mêmes cases ;
 * relier (au clic, en tirant, au clavier), retirer, déplacer et retrouver sa
 * disposition ; le tableau et les cases qui se calculent et mènent au chemin ;
 * les liens de l'unité dessinés de même. */
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=160)=>page.waitForTimeout(ms);
 const tirer=async(zone,de,vers)=>{
   await page.locator(`${zone} [data-noeud=${vers}]`).scrollIntoViewIfNeeded();
   const a=await page.locator(`${zone} .gr-port[data-port=${de}]`).boundingBox(),b=await page.locator(`${zone} [data-noeud=${vers}] .gr-fond`).boundingBox();
   await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
   await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:6});await page.mouse.up();await attendre();
 };
 const liens=id=>page.evaluate(id=>Sim.ateliers.state.parcours.find(p=>p.id===id).liens.map(l=>l.de+'>'+l.vers),id);
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  await page.locator('#etapes [data-view=ateliers]').click();await page.locator('[data-sous-onglet=at-chemins]').click();await attendre();
  const Z='.pc-graphe';

  // 1. Chaque commande a son chemin, créé à la main : ici TX · Business, copié du modèle de sa classe.
  assert.ok(await page.locator('.pc-cmds [data-pc-action=cmd]').count()>=30,'une ligne par commande');
  await page.locator('[data-pc-action=cmd][data-classe="TX/BC"]').click();await attendre();
  assert.match(await page.locator('.pc-creer').textContent(),/TX · Business n’a pas encore son chemin[\s\S]*modèle « Complet »/);
  assert.equal(await page.locator('[data-pc-champ=creer-depuis]').inputValue(),'complet','son modèle est proposé');
  await page.locator('[data-pc-action=creer]').click();await attendre();
  const bc=await page.evaluate(()=>Sim.ateliers.state.parcoursClasse['TX/BC']);
  assert.ok(bc,'TX/BC a son chemin');
  assert.equal(await page.evaluate(id=>Sim.ateliers.state.parcours.find(p=>p.id===id).nom,bc),'Complet TX BC');
  assert.match(await page.locator('.pc-cmd.actif').textContent(),/Complet TX BC/,'la liste le dit');
  assert.equal(await page.locator(`${Z} [data-noeud=prepa] .gr-sous`).textContent(),'aucune case');
  assert.equal(await page.locator(`${Z} [data-noeud=prepa]`).evaluate(n=>n.classList.contains('ton-neutre')),true,'sans case : à faire, pas une alerte');

  // 2. Cliquer un service : sa case se choisit ou se crée, et sa fiche s'ouvre dessous.
  await page.locator(`${Z} [data-noeud=prepa]`).click();await attendre();
  assert.match(await page.locator('.pc-panneau').textContent(),/Montage[\s\S]*aucune case/);
  await page.locator('[data-pc-champ=case]').selectOption('+');await attendre();
  const kase=await page.evaluate(()=>Sim.ateliers.state.ateliers.at(-1));
  assert.equal(kase.service,'prepa');assert.equal(kase.nom,'Montage TX BC');assert.deepEqual(kase.lots,[['TX/BC']]);
  assert.equal(await page.locator(`${Z} [data-noeud=prepa]`).evaluate(n=>n.classList.contains('ton-ok')),true,'le nœud passe au vert');
  assert.match(await page.locator(`${Z} [data-noeud=prepa] .gr-sous`).textContent(),/^TX BC · 2 p\. · 06:00/,'le nœud porte sa case');
  const fiche=`.pc-panneau [data-at="${kase.id}"]`;
  assert.equal(await page.locator(fiche).isVisible(),true,'la fiche de la case est dans le chemin');
  // Ses personnes, son heure : saisies là, lues sur le nœud.
  await page.fill(`${fiche} [data-at-champ=personnes]`,'3');await page.dispatchEvent(`${fiche} [data-at-champ=personnes]`,'change');await attendre(300);
  assert.equal(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).personnes,kase.id),3);
  assert.match(await page.locator(`${Z} [data-noeud=prepa] .gr-sous`).textContent(),/3 p\./);
  // Ses man-minutes : celles de l'import, modifiables pour cette case seulement.
  const mm=`${fiche} [data-at-champ=minutes][data-classe="TX/BC"]`;
  const importees=+(await page.locator(mm).getAttribute('placeholder'));
  assert.ok(importees>0,'l’import donne les man-minutes');
  assert.equal(await page.evaluate(id=>Sim.ateliers.resultat.lots.find(l=>l.atelier===id).hommeMinutes,kase.id),importees);
  await page.fill(mm,'50');await page.dispatchEvent(mm,'change');await attendre(300);
  assert.deepEqual(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).minutes,kase.id),{'TX/BC':50});
  assert.equal(await page.evaluate(id=>Sim.ateliers.resultat.lots.find(l=>l.atelier===id).hommeMinutes,kase.id),50,'le calcul prend celles de la case');
  assert.match(await page.locator(`${fiche} .at-mm`).textContent(),new RegExp('import '+importees));

  // 3. « Dupliquer pour… » TX · Économie, dans les mêmes cases, à la suite de TX BC.
  await page.locator('.pc-dup>summary').click();
  await page.locator('[data-pc="dup-cible"][value="TX/YC"]').check();
  await page.locator('[data-pc-action=dupliquer]').click();await attendre();
  const yc=await page.evaluate(()=>Sim.ateliers.state.parcoursClasse['TX/YC']);
  assert.ok(yc&&yc!==bc,'TX/YC a son propre chemin');
  assert.deepEqual(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).lots,kase.id),[['TX/BC'],['TX/YC']],'TX BC puis TX YC');
  // TX BC ne tire que ses propres minutes : sa ligne sort avant celle de TX YC.
  const lignes=await page.evaluate(id=>Sim.ateliers.resultat.lots.filter(l=>l.atelier===id).map(l=>({c:l.classes[0],fin:l.fin,mm:l.hommeMinutes})),kase.id);
  assert.equal(lignes[0].c,'TX/BC');assert.equal(lignes[0].mm,50);assert.ok(lignes[0].fin<lignes[1].fin);
  // Dans le chemin de TX YC, la même case, sa ligne en évidence.
  await page.locator('[data-pc-action=cmd][data-classe="TX/YC"]').click();await attendre();
  await page.locator(`${Z} [data-noeud=prepa]`).click();await attendre();
  assert.equal(await page.locator('[data-pc-champ=case]').inputValue(),kase.id);
  assert.match(await page.locator('.pc-panneau .pc-pan-tete').textContent(),/partagée avec TX BC/);
  assert.match(await page.locator('.pc-panneau .at-lot.ici').textContent(),/TX · Économie/);

  // 4. Un lien ne vaut que pour son chemin : appros → montage sur TX YC, au clic.
  const liensBC=await liens(bc);
  await page.locator(`${Z} .gr-port[data-port=appros]`).click();await attendre();
  assert.match(await page.locator('.pc-message').textContent(),/Relier/,'la consigne s’affiche au-dessus du diagramme');
  await page.locator(`${Z} [data-noeud=prepa]`).click();await attendre();
  assert.ok((await liens(yc)).includes('appros>prepa'));
  assert.ok((await liens(yc)).includes('appros>decontam'),'appros livre deux services');
  assert.deepEqual(await liens(bc),liensBC,'le chemin de TX BC ne bouge pas');
  assert.match(await page.locator('#at-status').textContent(),/sur le chemin de TX · Économie seulement/);
  // Suppr retire le lien qui a le focus ; un lien en double est refusé et dit pourquoi.
  await page.locator(`${Z} .gr-lien[data-lien="appros>prepa"]`).focus();await page.keyboard.press('Delete');await attendre();
  assert.ok(!(await liens(yc)).includes('appros>prepa'));
  await tirer(Z,'dotation','prepa');
  assert.match(await page.locator('#at-status').textContent(),/livre déjà/);
  // Au clavier : Entrée choisit un service, « Relier à… », Entrée sur l'autre relie.
  await page.locator('[data-pc-champ=noeud-ajout]').selectOption('armement');await attendre();
  await page.locator(`${Z} [data-noeud=prepa]`).focus();await page.keyboard.press('Enter');await attendre();
  await page.locator('[data-pc-action=relier-depuis]').click();await attendre();
  await page.locator(`${Z} [data-noeud=armement]`).focus();await page.keyboard.press('Enter');await attendre();
  assert.ok((await liens(yc)).includes('prepa>armement'));
  // La prépa se place avant le montage.
  assert.ok((await liens(yc)).includes('preparation>prepa'),'cuisine → prépa → montage');
  assert.equal(await page.locator(`${Z} [data-noeud=preparation] .gr-nom`).textContent(),'Prépa');

  // 5. Les autres onglets se calculent : le tableau et les cases mènent au chemin.
  await page.locator('[data-sous-onglet=at-grille]').click();await attendre();
  assert.match(await page.locator('[data-qf=aller][data-classe="TX/BC"][data-service=prepa]').textContent(),/Montage TX BC/);
  await page.locator('[data-qf=aller][data-classe="TX/BC"][data-service=prepa]').click();await attendre();
  assert.equal(await page.locator('[data-sous-onglet=at-chemins]').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('.pc-cmd.actif').getAttribute('data-classe'),'TX/BC');
  assert.equal(await page.locator(`${Z} [data-noeud=prepa]`).evaluate(n=>n.classList.contains('sel')),true,'le service cliqué est choisi');
  assert.equal(await page.locator(fiche).isVisible(),true);
  await page.locator('[data-sous-onglet=at-equipes]').click();await attendre();
  assert.equal(await page.locator('#at-liste [data-at-action=chemin]').count(),2,'la case dit ses deux commandes');
  await page.locator('#at-liste [data-at-action=chemin][data-classe="TX/YC"]').click();await attendre();
  assert.equal(await page.locator('.pc-cmd.actif').getAttribute('data-classe'),'TX/YC');

  // 4. Déplacer un service : la disposition est retenue ; « Réorganiser » l'oublie.
  const y=()=>page.locator(`${Z} [data-noeud=magasin]`).getAttribute('transform');
  const n=page.locator(`${Z} [data-noeud=magasin] .gr-fond`);await n.scrollIntoViewIfNeeded();
  const avantDeplace=await y(),b=await n.boundingBox();
  await page.mouse.move(b.x+60,b.y+20);await page.mouse.down();await page.mouse.move(b.x+60,b.y+140,{steps:5});await page.mouse.up();await attendre();
  const deplace=await y();
  assert.notEqual(deplace,avantDeplace,'le service a bougé');
  await page.reload();await attendre();await page.locator('#etapes [data-view=ateliers]').click();await attendre();
  await page.locator('[data-pc-action=cmd][data-classe="TX/YC"]').click();await attendre();
  assert.equal(await y(),deplace,'la place choisie survit au rechargement');
  await page.locator('[data-pc-action=reorganiser]').click();await attendre();
  assert.notEqual(await y(),deplace);

  // 5. Les liens de l'unité : même diagramme, un trait tiré crée un lien du type choisi.
  await page.locator('#etapes [data-view=flux]').click();await page.locator('[data-sous-onglet=u-liens]').click();await attendre();
  const F='#fc-graphe',nb=()=>page.evaluate(()=>Sim.flows.state.flows.length),n0=await nb();
  assert.ok(await page.locator(`${F} .gr-noeud`).count()>=10,'un nœud par service');
  await page.locator('#fc-graphe-type').selectOption('raw');
  await tirer(F,'magasin','cuisine');
  assert.equal(await nb(),n0+1);
  assert.equal(await page.evaluate(()=>Sim.flows.state.flows.at(-1).type),'raw');
  // Choisir le trait ouvre son détail dans la liste.
  await page.locator(`${F} .gr-lien[data-lien="magasin>cuisine"]`).focus();await page.keyboard.press('Enter');await attendre();
  assert.equal(await page.locator('#fc-liste-toute').getAttribute('open'),'');
  assert.equal(await page.locator('#fc-list article').count(),1,'la liste ne montre que ce lien');
  await page.locator(`${F} .gr-retirer`).click();await attendre();
  assert.equal(await nb(),n0,'la croix le retire');
  await page.locator('#fc-undo').click();await attendre();
  assert.equal(await nb(),n0+1,'et Annuler le rend');

  // 6. Sur le plus petit écran visé, rien ne déborde : le diagramme défile dans son cadre.
  await page.setViewportSize({width:1024,height:700});await attendre();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('graphe-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

/* Les diagrammes de nœuds dans la page : relier en tirant un trait, au
 * clavier, retirer, déplacer et retrouver sa disposition ; créer une équipe
 * depuis un service du chemin ; les liens de l'unité dessinés de même. */
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

  // 1. Chaque service du chemin est un nœud ; il dit ses équipes.
  assert.equal(await page.locator(`${Z} [data-noeud=prepa] .gr-sous`).textContent(),'aucune équipe');
  assert.equal(await page.locator(`${Z} [data-noeud=prepa]`).evaluate(n=>n.classList.contains('ton-neutre')),true,'un service sans équipe est à faire, pas en alerte');

  // 2. Créer l'équipe depuis le nœud : elle prépare les repas du chemin qui n'avaient personne.
  await page.locator(`${Z} [data-noeud=prepa]`).click();await attendre();
  assert.match(await page.locator('.pc-panneau').textContent(),/Montage[\s\S]*aucune équipe/);
  await page.locator('[data-pc-action=equipe-nouvelle]').click();await attendre();
  const eq=await page.evaluate(()=>Sim.ateliers.state.ateliers.at(-1));
  assert.equal(eq.service,'prepa');
  assert.ok(eq.lots.length>5,'les repas du chemin lui sont confiés');
  assert.equal(await page.locator('[data-sous-onglet=at-chemins]').getAttribute('aria-selected'),'true','on reste sur le diagramme');
  assert.match(await page.locator('#at-status').textContent(),/Équipe « Montage » créée/);
  assert.equal(await page.locator(`${Z} [data-noeud=prepa]`).evaluate(n=>n.classList.contains('ton-ok')),true,'le nœud passe au vert');
  assert.equal(await page.locator(`${Z} [data-noeud=prepa] .gr-sous`).textContent(),'Montage');
  // Son nom mène à sa fiche.
  await page.locator(`${Z} [data-noeud=prepa]`).click();await attendre();
  await page.locator('.pc-panneau [data-pc-action=fiche]').click();await attendre();
  assert.equal(await page.locator('[data-sous-onglet=at-equipes]').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator(`[data-at="${eq.id}"]`).isVisible(),true);
  // « Les équipes » montre le même chemin, son service choisi : on sait où l'on est.
  assert.equal(await page.locator(`${Z} [data-noeud=prepa]`).isVisible(),true,'le diagramme suit dans « Les équipes »');
  assert.equal(await page.locator(`${Z} [data-noeud=prepa]`).evaluate(n=>n.classList.contains('sel')),true);
  assert.equal(await page.locator(`${Z} .gr-port`).count(),0,'ici il sert à choisir : pas de +');
  assert.equal(await page.locator(`${Z} .gr-lien[tabindex]`).count(),0,'ni de lien à retirer');
  assert.equal(await page.locator('.pc-panneau').isVisible(),false);
  assert.match(await page.locator('#at-choix').textContent(),/Montage[\s\S]*reçoit de/);
  assert.equal(await page.locator('#at-filtre').inputValue(),'prepa');
  // Cliquer un autre service du diagramme : la liste passe à ses équipes.
  await page.locator(`${Z} [data-noeud=cuisine]`).click();await attendre();
  assert.equal(await page.locator('#at-filtre').inputValue(),'cuisine');
  assert.match(await page.locator('#at-liste').textContent(),/Aucune équipe dans Cuisine/);
  assert.match(await page.locator('#at-choix').textContent(),/Cuisine[\s\S]*reçoit de Légumerie[\s\S]*livre Prépa/);
  // « + Nouvelle équipe · Cuisine » : elle prend d'emblée les commandes du chemin.
  assert.match(await page.locator('#at-new').textContent(),/Cuisine/);
  await page.locator('#at-new').click();await attendre();
  const eq2=await page.evaluate(()=>Sim.ateliers.state.ateliers.at(-1));
  assert.equal(eq2.service,'cuisine');assert.ok(eq2.lots.length>0,'les commandes du chemin lui sont confiées');
  assert.equal(await page.locator('[data-sous-onglet=at-equipes]').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator(`${Z} [data-noeud=cuisine]`).evaluate(n=>n.classList.contains('ton-ok')),true,'le nœud passe au vert');
  // Toutes les équipes : rangées dans le sens du chemin, cuisine avant montage.
  await page.locator('[data-at-action=tout]').click();await attendre();
  assert.equal(await page.locator(`${Z} .gr-noeud.sel`).count(),0);
  assert.deepEqual(await page.locator('#at-liste .at-service-nom').evaluateAll(b=>b.map(x=>x.dataset.service)),['cuisine','prepa']);
  // Retour aux chemins : le même service est choisi, les + reviennent.
  await page.locator('#at-liste .at-service-nom[data-service=cuisine]').click();await attendre();
  await page.locator('[data-sous-onglet=at-chemins]').click();await attendre();
  assert.equal(await page.locator(`${Z} [data-noeud=cuisine]`).evaluate(n=>n.classList.contains('sel')),true);
  assert.match(await page.locator('.pc-panneau').textContent(),/Cuisine/);
  assert.ok(await page.locator(`${Z} .gr-port`).count()>0);
  // Et « Régler ses équipes → » y mène, sur ce service.
  await page.locator(`${Z} [data-noeud=prepa]`).click();await attendre();
  await page.locator('[data-pc-action=equipes]').click();await attendre();
  assert.equal(await page.locator('[data-sous-onglet=at-equipes]').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('#at-filtre').inputValue(),'prepa');
  await page.locator('[data-sous-onglet=at-chemins]').click();await attendre();

  // 3. Au clavier : Entrée choisit un service, « Relier à… », Entrée sur l'autre relie.
  const avant=await liens('complet');
  await page.locator('[data-pc-champ=noeud-ajout]').selectOption('armement');await attendre();
  await page.locator(`${Z} [data-noeud=prepa]`).focus();await page.keyboard.press('Enter');await attendre();
  await page.locator('[data-pc-action=relier-depuis]').click();await attendre();
  assert.equal(await page.locator(`${Z} .gr-noeud.cible`).count()>0,true,'les autres services attendent le lien');
  await page.locator(`${Z} [data-noeud=armement]`).focus();await page.keyboard.press('Enter');await attendre();
  assert.deepEqual(await liens('complet'),avant.concat('prepa>armement'));
  // Suppr retire le lien qui a le focus.
  await page.locator(`${Z} .gr-lien[data-lien="prepa>armement"]`).focus();await page.keyboard.press('Delete');await attendre();
  assert.deepEqual(await liens('complet'),avant);
  // Un lien en double est refusé et dit pourquoi.
  await tirer(Z,'dotation','prepa');
  assert.deepEqual(await liens('complet'),avant);
  assert.match(await page.locator('#at-status').textContent(),/livre déjà/);

  // 3 bis. La prépa se place avant le montage ; un service livre deux services.
  assert.ok((await liens('complet')).includes('cuisine>preparation')&&(await liens('complet')).includes('preparation>prepa'),'cuisine → prépa → montage');
  assert.equal(await page.locator(`${Z} [data-noeud=preparation] .gr-nom`).textContent(),'Prépa');
  // Au clic : un clic sur le + des appros, un clic sur le montage.
  const apres=await liens('complet');
  assert.ok(apres.includes('appros>decontam'));
  await page.locator(`${Z} .gr-port[data-port=appros]`).click();await attendre();
  assert.match(await page.locator('.pc-message').textContent(),/Relier/,'la consigne s’affiche sous le diagramme');
  await page.locator(`${Z} .gr-port[data-port=appros]`).click();await attendre();
  assert.match(await page.locator('.pc-message').textContent(),/annulé/,'un second clic sur le même + annule');
  await page.locator(`${Z} .gr-port[data-port=appros]`).click();await attendre();
  await page.locator(`${Z} [data-noeud=prepa]`).click();await attendre();
  assert.deepEqual(await liens('complet'),apres.concat('appros>prepa'),'appros → montage s’ajoute à appros → légumerie');
  assert.equal(await page.locator(`${Z} .gr-lien[data-lien="appros>prepa"]`).count(),1);
  await page.locator(`${Z} .gr-lien[data-lien="appros>prepa"]`).focus();await page.keyboard.press('Delete');await attendre();
  assert.deepEqual(await liens('complet'),apres);

  // 4. Déplacer un service : la disposition est retenue ; « Réorganiser » l'oublie.
  const n=page.locator(`${Z} [data-noeud=magasin] .gr-fond`),b=await n.boundingBox();
  await page.mouse.move(b.x+60,b.y+20);await page.mouse.down();await page.mouse.move(b.x+60,b.y+140,{steps:5});await page.mouse.up();await attendre();
  const y=()=>page.locator(`${Z} [data-noeud=magasin]`).getAttribute('transform');
  const deplace=await y();
  await page.reload();await attendre();await page.locator('#etapes [data-view=ateliers]').click();await attendre();
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

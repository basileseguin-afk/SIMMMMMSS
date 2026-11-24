/* Les diagrammes de nœuds dans la page (version 1 ; évolution 22 c : un seul éditeur de chemin, dans « Chemins ») :
 * le chemin à part d'une commande, avec une équipe par service ; l'équipe d'une commande à une étape, choisie dans le
 * tableau de l'étape et réglée dans sa fiche ; relier (au clic, en tirant, au clavier), retirer, déplacer et retrouver
 * sa disposition ; le tableau des étapes et les équipes qui mènent au chemin ; les liens de l'unité dessinés de même. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
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
  await page.waitForTimeout(200);await nav.effectifSaisi(page);   // les personnes se saisissent ici (05/10)
  await nav.vue(page,'ateliers');await nav.aller(page,'mu-flux');await attendre();
  const Z='#mu-flux [data-mu-graphe]',M='#mu-flux';
  const sous=()=>page.evaluate(()=>document.body.dataset.sous);
  const choisir=async id=>{await page.locator(`${M} .ch-liste [data-mu-flux-choisir="${id}"]`).click();await attendre();};

  // 1. Une commande suit le chemin de sa classe ; elle peut aussi avoir un chemin à elle, avec ses propres équipes :
  //    ici TX · Business, copié de son chemin. (Le geste « Créer son chemin » de l'ancienne page « Chemin d'une
  //    commande » n'existe plus : le test le demande au modèle, par la même fonction — nav.creerChemin.)
  assert.equal(await page.locator('[data-mu-graphe]').count(),1,'un seul éditeur de chemin');
  assert.equal(await page.locator('#at-parcours, .pc-cmds').count(),0,'plus de page « Chemin d’une commande »');
  assert.equal(await nav.creerChemin(page,'TX/BC'),true);
  const bc=await page.evaluate(()=>Sim.ateliers.state.parcoursClasse['TX/BC']);
  assert.ok(bc,'TX/BC a son chemin');
  assert.equal(await page.evaluate(id=>Sim.ateliers.state.parcours.find(p=>p.id===id).nom,bc),'Complet TX BC');
  assert.match(await page.locator(`${M} .ch-liste [data-mu-flux-choisir="${bc}"]`).innerText(),/Complet TX BC[\s\S]*1 commande · \d+ étapes/,'la liste le dit, parmi les chemins à part');
  // Chaque service du chemin a son équipe dès la création.
  const kase=await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.service==='prepa'&&a.lots.some(l=>l.includes('TX/BC'))));
  assert.equal(kase.nom,'Montage TX BC');assert.deepEqual(kase.lots,[['TX/BC']]);
  // Les postes qui mettent à disposition (réception, légumerie, magasin) ont UNE équipe, partagée : pas de lot.
  const partages=['appros','decontam','magasin'];
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>a.lots.some(l=>l.includes('TX/BC'))).length),
    await page.evaluate(([id,partages])=>Sim.ateliers.state.parcours.find(p=>p.id===id).noeuds.filter(s=>s!=='plonge'&&!partages.includes(s)).length,[bc,partages]),'une équipe par service qui prépare');
  assert.deepEqual(await page.evaluate(partages=>partages.map(s=>Sim.ateliers.state.ateliers.filter(a=>a.service===s).map(a=>a.type)),partages),
    [['dispo'],['dispo'],['dispo']],'une équipe partagée par poste de mise à disposition');
  await choisir(bc);
  assert.equal(await page.locator(`${Z} [data-noeud=prepa]`).evaluate(n=>n.classList.contains('ton-ok')),true,'le nœud a son équipe');
  assert.match(await page.locator(`${Z} [data-noeud=prepa] .gr-sous`).textContent(),/^1\/1 préparée/,'le nœud dit ce qui est préparé');
  // L'équipe est dans le tableau de son service ; sa fiche dit ses commandes, et chacune mène à son chemin.
  await nav.service(page,'prepa');await attendre();
  assert.match(await page.locator('#mu-services .se-equipes').textContent(),/Montage TX BC/,'l’équipe est dans le tableau de son service');
  await nav.equipe(page,kase.id);
  await page.locator(`#mu-services [data-at="${kase.id}"] [data-mu-chemin="TX/BC"]`).first().click();await attendre();
  assert.equal(await sous(),'mu-flux','sa commande mène à son chemin, dans « Chemins »');
  assert.equal(await page.locator(`${M} .ch-fiche [data-mu-flux-nom]`).inputValue(),'Complet TX BC');

  // 2. L'étape choisie montre son tableau : la commande, son équipe, son temps par vol. L'équipe se règle dans sa
  //    fiche, où mène son nom.
  const rang=c=>page.locator(`${M} .ch-etape[data-ch-etape=prepa] tr[data-ch-cmd="${c}"]`);
  assert.equal(await rang('TX/BC').count(),1,'venue de la fiche de l’équipe, l’étape est ouverte');
  assert.equal(await rang('TX/BC').evaluate(tr=>tr.classList.contains('ch-vise')),true,'et la commande, en évidence');
  assert.equal(await rang('TX/BC').locator('select[data-ch-equipe]').inputValue(),kase.id,'le tableau dit son équipe');
  const tempsLu=(await rang('TX/BC').locator('td.num').innerText()).trim();
  // Échap ne ferme rien : il n'y a plus de fenêtre par-dessus le chemin.
  assert.equal(await page.locator('.pc-tiroir').count(),0,'plus de fenêtre de l’équipe dans le chemin');
  await rang('TX/BC').locator('[data-ch-fiche]').click();await attendre();
  assert.equal(await sous(),'mu-services','le nom de l’équipe mène à sa fiche');
  await nav.reglagesEquipe(page,kase.id);
  const fiche=`#mu-services .mu-equipe[data-at="${kase.id}"]`;
  assert.equal(await page.locator(fiche).isVisible(),true,'la fiche de l’équipe');
  // Ses personnes : saisies là.
  await page.fill(`${fiche} [data-at-champ=personnes]`,'3');await page.dispatchEvent(`${fiche} [data-at-champ=personnes]`,'change');await attendre(300);
  assert.equal(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).personnes,kase.id),3);
  // Son temps par vol : celui du service, modifiable pour cette équipe seulement
  // (lu et saisi en heures depuis le 08/10, gardé en minutes).
  const mm=`${fiche} [data-at-champ=heures][data-classe="TX/BC"]`;
  const importees=await page.locator(mm).getAttribute('placeholder');
  assert.ok(+importees.replace(',','.')>0,'les temps par vol du service donnent les heures');
  // Le tableau de l'étape lit le temps par vol du service ; la fiche de l'équipe, celui de la journée (tous ses vols).
  const volsBC=await page.evaluate(()=>Sim.ateliers.classes.find(c=>c.id==='TX/BC').vols.length);
  assert.match(tempsLu,/^\d+(,\d+)? h$/,'un temps par vol, en heures');
  assert.ok(Math.abs(+tempsLu.replace(' h','').replace(',','.')*volsBC-(+importees.replace(',','.')))<0.02,'le même temps par vol, fois ses vols : '+tempsLu+' × '+volsBC+' = '+importees);
  assert.equal(await page.evaluate(id=>MoteurProduction.heuresFr(Sim.ateliers.resultat.lots.find(l=>l.atelier===id).hommeMinutes,2),kase.id),importees);
  await page.fill(mm,'0.5');await page.dispatchEvent(mm,'change');await attendre(300);
  assert.deepEqual(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).minutes,kase.id),{'TX/BC':30});
  assert.equal(await page.evaluate(id=>Sim.ateliers.resultat.lots.find(l=>l.atelier===id).hommeMinutes,kase.id),30,'le calcul prend celles de l’équipe');

  // 3. TX · Économie suit le même chemin : choisi dans sa liste, le chemin à part devient partagé. Son équipe au
  //    Montage se choisit dans le tableau de l'étape : la même que TX BC, à sa suite. (Le geste « Dupliquer pour… »
  //    de l'ancienne page n'existe plus.)
  await nav.cheminDe(page,'TX/YC');await nav.sectionChemin(page,'suivi');
  await page.locator(`${M} [data-mu-cmd-chemin="TX/YC"]`).selectOption(bc);await attendre(300);
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.parcoursClasse['TX/YC']),bc,'TX/YC suit le chemin de TX BC');
  assert.match(await page.locator('#at-status').textContent(),/c’est maintenant un chemin partagé, le modifier change pour les deux/);
  await nav.cheminDe(page,'TX/YC','prepa');
  assert.match(await rang('TX/YC').innerText(),/à corriger/,'sans équipe au Montage : à corriger');
  await rang('TX/YC').locator('select[data-ch-equipe]').selectOption(kase.id);await attendre(300);
  assert.deepEqual(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).lots,kase.id),[['TX/BC'],['TX/YC']],'TX BC puis TX YC');
  assert.equal(await rang('TX/YC').locator('.ch-a-corriger').count(),0);
  assert.equal(await rang('TX/YC').locator('select[data-ch-equipe]').inputValue(),kase.id);
  // TX BC ne tire que ses propres heures (0,5 h = 30 min) : sa ligne sort avant celle de TX YC.
  const lignes=await page.evaluate(id=>Sim.ateliers.resultat.lots.filter(l=>l.atelier===id).map(l=>({c:l.classes[0],fin:l.fin,mm:l.hommeMinutes})),kase.id);
  assert.equal(lignes[0].c,'TX/BC');assert.equal(lignes[0].mm,30);assert.ok(lignes[0].fin<lignes[1].fin);
  assert.match(await page.locator(`${Z} [data-noeud=prepa] .gr-sous`).textContent(),/^2\/2 préparées/);

  // 4. Un lien entre deux étapes ne vaut que pour son chemin : légumerie → montage, au clic, sur celui de TX seulement.
  //    (Évolution 24 a : le lien d'un fournisseur, lui, vaut pour toute l'unité — voir plus bas. Avant, ce geste partait
  //    de la réception.)
  const liensComplet=await liens('complet');
  await page.locator(`${Z} .gr-port[data-port=decontam]`).click();await attendre();
  assert.match(await page.locator('#notifs .notif.consigne').textContent(),/Relier/,'la consigne s’affiche, le temps du geste');
  await page.locator(`${Z} [data-noeud=prepa]`).click();await attendre();
  assert.equal(await page.locator('#notifs .notif.consigne').count(),0,'elle part avec le geste');
  assert.ok((await liens(bc)).includes('decontam>prepa'));
  assert.ok((await liens(bc)).includes('decontam>cuisine'),'la légumerie livre deux services');
  assert.deepEqual(await liens('complet'),liensComplet,'le chemin « Complet » ne bouge pas');
  assert.match(await page.locator('#at-status').textContent(),/livre maintenant Montage, dans « Complet TX BC »/);
  // Suppr retire le lien qui a le focus ; un lien en double est refusé et dit pourquoi.
  await page.locator(`${Z} .gr-lien[data-lien="decontam>prepa"]`).focus();await page.keyboard.press('Delete');await attendre();
  assert.ok(!(await liens(bc)).includes('decontam>prepa'));
  // Évolution 24 (a) : les clients d'un fournisseur (la réception) se règlent une fois pour toute l'unité. Tirer un lien
  // depuis lui ne crée rien : le geste dit pourquoi, et mène au tableau « Qui se fournit où ». Suppr sur un de ses liens
  // ne le retire pas non plus.
  const avantFournisseur=await liens(bc);
  await page.locator(`${Z} .gr-port[data-port=appros]`).click();await attendre();
  await page.locator(`${Z} [data-noeud=prepa]`).click();await attendre(300);
  assert.deepEqual(await liens(bc),avantFournisseur,'aucun lien de fournisseur ne se crée dans le schéma');
  assert.match(await page.locator('#at-status').textContent(),/est un fournisseur : ses clients se règlent ici, une fois pour tous les chemins/);
  assert.equal(await page.locator(`${M} .ch-fiche`).getAttribute('data-ch-vue'),'fournisseurs','le geste mène au tableau');
  await choisir(bc);
  await page.locator(`${Z} .gr-lien[data-lien="appros>decontam"]`).focus();await page.keyboard.press('Delete');await attendre(300);
  assert.deepEqual(await liens(bc),avantFournisseur,'ni ne se retire');
  assert.equal(await page.locator(`${M} .ch-fiche`).getAttribute('data-ch-vue'),'fournisseurs');
  await choisir(bc);
  await tirer(Z,'dotation','prepa');
  assert.match(await page.locator('#at-status').textContent(),/livre déjà/);
  // Au clavier : Entrée choisit une étape (son tableau s'ouvre), « Relier à… », Entrée sur l'autre relie.
  await page.locator(`${M} [data-mu-flux-ajout]`).selectOption('armement');await attendre();
  assert.ok((await liens(bc)).includes('armement>prepa'),'l’armement entre à sa place');
  // (Depuis une étape : la dotation. Le magasin est un fournisseur — son tableau n'a pas « Relier à… », mais « Régler
  //  ses clients », évolution 24 a.)
  await page.locator(`${Z} [data-noeud=magasin]`).focus();await page.keyboard.press('Enter');await attendre();
  assert.equal(await page.locator(`${M} .ch-etape`).getAttribute('data-ch-etape'),'magasin','Entrée ouvre le tableau de l’étape');
  assert.deepEqual([await page.locator(`${M} .ch-etape [data-ch-relier]`).count(),await page.locator(`${M} .ch-etape [data-mu-flux-action=retirer-service]`).count(),
    await page.locator(`${M} .ch-etape [data-fo-ouvrir]`).innerText()],[0,0,'Régler ses clients →']);
  await page.locator(`${Z} [data-noeud=dotation]`).focus();await page.keyboard.press('Enter');await attendre();
  assert.equal(await page.locator(`${M} .ch-etape`).getAttribute('data-ch-etape'),'dotation');
  await page.locator(`${M} [data-ch-relier=dotation]`).click();await attendre();
  await page.locator(`${Z} [data-noeud=armement]`).focus();await page.keyboard.press('Enter');await attendre();
  assert.ok((await liens(bc)).includes('dotation>armement'));
  // La prépa se place avant le montage.
  assert.ok((await liens(bc)).includes('preparation>prepa'),'cuisine → prépa → montage');
  assert.equal(await page.locator(`${Z} [data-noeud=preparation] .gr-nom`).textContent(),'Prépa');

  // 5. Le tableau des étapes (« Détails › Commandes ») et les équipes mènent au chemin.
  await nav.etapesCommandes(page);await attendre();
  assert.match(await page.locator('[data-qf=aller][data-classe="TX/BC"][data-service=prepa]').textContent(),/Montage TX BC/);
  await page.locator('[data-qf=aller][data-classe="TX/BC"][data-service=prepa]').click();await attendre();
  assert.equal(await sous(),'mu-flux');
  assert.equal(await page.locator(`${M} .ch-fiche [data-mu-flux-nom]`).inputValue(),'Complet TX BC');
  assert.equal(await page.locator(`${Z} [data-noeud=prepa]`).evaluate(n=>n.classList.contains('sel')),true,'le service cliqué est choisi');
  assert.equal(await rang('TX/BC').evaluate(tr=>tr.classList.contains('ch-vise')),true);
  await nav.equipe(page,kase.id);await attendre();
  assert.equal(await page.locator(`#mu-services [data-at="${kase.id}"] .mu-ordre [data-mu-chemin]`).count(),2,'l’équipe dit ses deux commandes');
  await page.locator(`#mu-services [data-at="${kase.id}"] .mu-ordre [data-mu-chemin="TX/YC"]`).click();await attendre();
  assert.equal(await sous(),'mu-flux');
  assert.equal(await rang('TX/YC').evaluate(tr=>tr.classList.contains('ch-vise')),true,'sa commande, en évidence dans le tableau de l’étape');

  // 4. Déplacer un service : la disposition est retenue ; « Réorganiser » l'oublie.
  const y=()=>page.locator(`${Z} [data-noeud=magasin]`).getAttribute('transform');
  const n=page.locator(`${Z} [data-noeud=magasin] .gr-fond`);await n.scrollIntoViewIfNeeded();
  const avantDeplace=await y(),b=await n.boundingBox();
  await page.mouse.move(b.x+60,b.y+20);await page.mouse.down();await page.mouse.move(b.x+60,b.y+140,{steps:5});await page.mouse.up();await attendre();
  const deplace=await y();
  assert.notEqual(deplace,avantDeplace,'le service a bougé');
  await page.reload();await attendre();await nav.vue(page,'ateliers');await nav.aller(page,'mu-flux');await attendre();
  await choisir(bc);
  assert.equal(await y(),deplace,'la place choisie survit au rechargement');
  await page.locator(`${M} [data-mu-flux-action=reorganiser]`).click();await attendre();
  assert.notEqual(await y(),deplace);

  // 5. Les liens de l'unité : même diagramme, un trait tiré crée un lien du type choisi.
  await nav.vue(page,'flux');await nav.aller(page,'u-liens');await attendre();
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
  await page.locator('#btn-annuler').click();await attendre();
  assert.equal(await nb(),n0+1,'et Annuler le rend');

  // 6. Sur le plus petit écran visé, rien ne déborde : le diagramme défile dans son cadre.
  await page.setViewportSize({width:1024,height:700});await attendre();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('graphe-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

/* Le menu (évolution 22 a) : deux blocs, quatorze entrées, toutes visibles —
 * « Lire » (Synthèse, En direct, Planning, Période, Détails, Comparer), puis
 * « Régler » en trois espaces (Vols : Programme, Retours ; L'unité : Services
 * et équipes, Chemins, Plan ; Simulation : Réglages, Contrôles), et « Fichiers »
 * en bas. Plus de partie à ouvrir ni de mention « Plus ». L'accueil suit le
 * même rangement. L'application s'ouvre sur la Synthèse quand une journée se
 * calcule, sinon sur l'accueil. La pastille des problèmes est sur « Contrôles ».
 * Chaque page a un titre et une phrase en mots de tous les jours ; son ancien
 * nom se cherche toujours par « Aller à… ». Unité, vols et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_SITE=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const LIRE=['Synthèse','En direct','Planning','Période','Détails','Comparer'];
const REGLER=[['Vols',['Programme','Retours']],['L’unité',['Services et équipes','Chemins','Plan']],['Simulation',['Réglages','Contrôles']]];
const QUATORZE=[...LIRE,...REGLER.flatMap(e=>e[1]),'Fichiers'];
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(150);
 /** Les entrées du menu, dans l'ordre où elles se lisent : celles des deux blocs, puis « Fichiers », en bas. */
 const entrees=()=>page.evaluate(()=>[...document.querySelectorAll('#menu [data-sous-onglet] > span:not(.so-badge), #btn-sauvegarde > span:last-child')].map(x=>x.textContent.trim()));
 const actif=()=>page.evaluate(()=>document.body.dataset.vue==='accueil'?null:document.body.dataset.sous);
 /** L'entrée marquée ouverte : celle du menu, « Fichiers », ou la marque (l'accueil). */
 const courant=()=>page.evaluate(()=>{
   const m=document.querySelector('#menu [aria-selected=true]'),f=document.querySelector('#btn-sauvegarde[aria-current=page]'),a=document.querySelector('#btn-accueil[aria-current=page]');
   return [m&&m.dataset.entree,f&&'fichiers',a&&'accueil'].filter(Boolean).join('+')||null;});
 const tuile=p=>page.locator(`.acc-tuile:has([data-vers-partie=${p}])`);
 try{
  await page.goto(URL_SITE);await nav.pret(page);

  // 1. Rien ne se calcule encore : on arrive sur l'accueil — l'histoire en quatre images, puis le rangement du menu.
  assert.equal(await page.locator('#view-accueil').isVisible(),true,'on arrive sur l’accueil');
  assert.equal(await page.locator('.app').isVisible(),false,'aucune page derrière');
  assert.equal(await courant(),'accueil','la marque dit qu’on y est');
  assert.equal(await page.locator('.acc-histoire .cm-liste li').count(),4);
  assert.equal(await page.locator('.acc-histoire svg.ico').count(),4,'une image par temps de l’histoire');
  assert.match(await page.locator('.acc-histoire').textContent(),/Des avions partent[\s\S]*repas[\s\S]*équipes[\s\S]*calcule/);
  // Deux blocs, une tuile par espace, dans l'ordre du menu ; chaque tuile liste les entrées de son espace.
  assert.deepEqual(await page.locator('.acc-bloc').evaluateAll(bs=>bs.map(b=>[b.querySelector('.acc-bloc-titre').textContent,[...b.querySelectorAll('.acc-tuile-tete')].map(t=>t.dataset.versPartie)])),
    [['Lire',['resultats']],['Régler',['donnees','organisation','reglages']]],'l’accueil suit le rangement du menu');
  assert.deepEqual(await page.locator('.acc-tuile').evaluateAll(ts=>ts.map(t=>[t.querySelector('.acc-titre b').textContent,[...t.querySelectorAll('.acc-page')].map(b=>b.textContent)])),
    [['Lire',LIRE.filter(x=>x!=='Période')],...REGLER]);
  assert.match(await page.locator('.acc-pied').textContent(),/Fichiers/,'« Fichiers », en bas, comme au menu');
  // Chaque tuile dit son état en clair : ce qui est réel, ce qui est un exemple, ce qui reste à faire.
  assert.match(await tuile('donnees').textContent(),/Vols : 12 départs · exemple/);
  assert.match(await tuile('organisation').textContent(),/Temps par vol : chiffres d’exemple/);
  assert.match(await tuile('organisation').textContent(),/Chemins : \d+ chemin/,'la tuile de l’unité compte les chemins');
  assert.match(await tuile('donnees').locator('.acc-etat').textContent(),/provisoire/);
  assert.match(await tuile('organisation').textContent(),/aucune équipe/);
  assert.match(await tuile('reglages').textContent(),/Repas prêts 45 min avant le départ/);
  assert.match(await tuile('resultats').textContent(),/rien à calculer/);
  assert.equal(await page.locator('.acc-etat.verifier').count(),0,'un exemple n’est pas une alerte');
  // Ce qu'il y a à faire ensuite, en un clic.
  assert.match(await page.locator('.acc-suite').textContent(),/À faire ensuite/);
  await page.locator('.acc-suite [data-page]').click();await attendre();
  assert.equal(await courant(),'mu-services');
  assert.equal(await actif(),'mu-services','« Décrire une première équipe » ouvre les services et leurs équipes');

  // 2. Le menu : toutes ses entrées, toujours — sans programme daté, treize (« Période » n'y est pas). Deux blocs,
  //    trois espaces titrés sous « Régler » ; ni partie à ouvrir, ni mention « Plus ».
  assert.deepEqual(await entrees(),QUATORZE.filter(x=>x!=='Période'));
  assert.deepEqual(await page.locator('#menu .menu-bloc').evaluateAll(bs=>bs.map(b=>[b.querySelector('.menu-bloc-titre').textContent,
    [...b.querySelectorAll('.menu-espace')].map(e=>[(e.querySelector('.menu-espace-titre')||{}).textContent||'',[...e.querySelectorAll('[data-sous-onglet]>span:not(.so-badge)')].map(x=>x.textContent)])])),
    [['Lire',[['',LIRE.filter(x=>x!=='Période')]]],['Régler',REGLER]]);
  assert.equal(await page.locator('#menu .so-plus, #menu .so-secondaire, #menu [data-vers-partie], #menu .menu-partie').count(),0,'ni « Plus », ni partie à ouvrir');
  assert.equal(await page.locator('#menu [data-sous-onglet]:not(:visible)').count(),0,'toutes les entrées se voient');
  assert.equal(await page.locator('#menu [data-sous-onglet] svg.ico').count(),12,'un pictogramme par entrée');
  // Chaque entrée ouvre sa page, ou la première de son groupe ; le fil d'Ariane dit l'espace, le titre la page ou le groupe.
  const attendues=[['j-chiffres','Lire','Synthèse'],['j-plan','Lire','En direct'],['at-planning','Lire','Planning des équipes'],['groupe:details','Lire','Détails',['at-repas','v-departs','j-stocks','j-details']],
    ['j-comparer','Lire','Comparer deux essais'],['v-programme','Vols','Programme des vols'],['v-planche','Vols','Planche retour'],
    // « Services et équipes » : une seule page depuis l'évolution 22 (b), sans onglets internes.
    ['mu-services','L’unité','Services et équipes'],
    // « Chemins » : une seule page depuis l'évolution 22 (c), sans onglets internes ; « Liens entre services » n'est
    // jamais au menu. « Contrôles » : une seule page depuis l'évolution 22 (d) — deux pages et un panneau en un.
    ['mu-flux','L’unité','Chemins'],
    ['rg-simulation','Simulation','Réglages de la simulation'],['mu-pas','Simulation','Contrôles']];
  for(const [cle,espace,titre,pages] of attendues){
    await page.locator(`#menu [data-entree="${cle}"]`).click();await attendre();
    assert.equal(await courant(),cle);
    assert.equal(await page.locator('#menu [aria-selected=true]').count(),1,'une seule entrée ouverte');
    assert.equal(await page.locator('#ariane-partie').textContent(),espace,cle);
    assert.equal(await page.locator('#view-title').textContent(),titre,cle);
    assert.deepEqual(await page.locator('#onglets-internes:not([hidden]) [data-sous-onglet]').evaluateAll(bs=>bs.map(b=>b.dataset.sousOnglet)),pages||[],cle+' : ses onglets internes');
    for(const id of pages||[cle]){
      await nav.aller(page,id);
      assert.equal(await actif(),id);
      assert.equal(await courant(),cle,id+' : son entrée reste marquée');
      // Le planning des équipes occupe sa page (correction 18 b) : sa phrase n'est pas affichée.
      if(await page.evaluate(i=>!!OrlyOnglets.page(i).sansIntro,id)){assert.equal(id,'at-planning');assert.equal(await page.locator('#view-intro').textContent(),'',id+' : sans phrase d’introduction');}
      else assert.ok((await page.locator('#view-intro').textContent()).length>20,id+' : une phrase dit ce qu’on voit');
    }
  }

  // 3. Chaque page a sa nature : on ne règle pas dans les résultats, on ne lit
  //    pas de résultat dans les données.
  await nav.aller(page,'v-programme');
  assert.equal(await page.locator('#imp-vols').isVisible(),true,'les vols s’importent dans Données');
  assert.equal(await page.locator('#shift').isVisible(),false,'le décalage des vols n’y est plus');
  assert.match(await page.locator('.vols-source').textContent(),/Jeu de démonstration/,'d’où viennent les vols, dit là où on les change');
  await nav.aller(page,'rg-simulation');
  assert.equal(await page.locator('#shift').isVisible(),true,'c’est un réglage');
  assert.equal(await page.locator('#loadDelay').isVisible(),true);
  assert.equal(await page.locator('#imp-vols').isVisible(),false);
  // Tous les réglages de la simulation sur une seule page : horaires, retours, rythme.
  assert.equal(await page.locator('[data-at-champ=mat-retours]').isVisible(),true,'les retours à la plonge se règlent ici');
  assert.equal(await page.locator('#rg-rendement').isVisible(),true,'le rythme aussi');
  assert.equal(await page.locator('#rg-bareme-panneau').isVisible(),false,'mais pas le barème, qui est une donnée');
  await nav.aller(page,'v-departs');
  assert.equal(await courant(),'groupe:details','les départs prêts ou en retard sont un résultat : un onglet de « Détails »');
  assert.equal(await page.evaluate(()=>document.body.dataset.partie),'resultats');
  assert.equal(await page.locator('#vols-frise .vf-vol').count(),12,'un avion par départ');
  await page.locator('.vf-compte.vf-sans').click();await attendre();
  assert.equal(await page.locator('#flight-filter').inputValue(),'pending','un compteur filtre le tableau');
  await page.locator('.vf-compte.vf-sans').click();await attendre();
  await nav.aller(page,'j-chiffres');
  assert.equal(await page.locator('.chiffres-vide').isVisible(),true,'rien à compter : la synthèse dit par où commencer');
  assert.equal(await page.locator('.chiffres-vide [data-page=mu-pas]').count(),1);
  assert.equal(await page.locator('#btn-play').isVisible(),false,'sans lecteur');
  assert.equal(await page.locator('#btn-export').isVisible(),true,'les résultats s’exportent depuis la synthèse');
  await nav.aller(page,'j-plan');
  assert.equal(await page.locator('#btn-play').isVisible(),true,'le lecteur accompagne le plan rejoué');
  assert.equal(await page.locator('#plan').isVisible(),true);
  assert.equal(await page.locator('.workbench').isVisible(),true,'avec « En ce moment »');
  await nav.aller(page,'j-comparer');
  assert.equal(await page.locator('#snap-a').isVisible(),true);
  assert.equal(await page.locator('#plan').isVisible(),false,'une page à la fois');
  assert.equal(await page.locator('.workbench').isVisible(),false);
  // « Temps par vol par service » n'est plus une page (évolution 22 b) : les minutes se règlent dans la fiche du service.
  await nav.aller(page,'mu-services');await nav.service(page,'cuisine');await nav.section(page,'temps');
  assert.ok(await page.locator('#mu-services .se-fiche [data-rg-champ=heures]:visible').count()>=3,'les minutes d’un service se règlent dans sa fiche');
  assert.equal(await page.locator('.rg-barres').count(),0,'la page « Temps par vol par service » n’est plus à l’écran');

  // 4. Les outils suivent la page : ceux des cases dans Chemins et Équipes, pas dans les résultats.
  await nav.aller(page,'mu-flux');
  assert.equal(await page.locator('#at-export').isVisible(),true,'les outils restent à portée, sur la barre des onglets');
  assert.match(await page.locator('#at-export').textContent(),/Équipes et chemins/,'un export dit ce qu’il contient');
  await nav.aller(page,'mu-services');
  assert.equal(await page.locator('#at-export').isVisible(),true,'et dans la fiche des services');
  await nav.aller(page,'at-planning');
  assert.equal(await page.locator('#at-export').isVisible(),false,'pas d’import ni d’export des cases dans les résultats');
  assert.equal(await page.locator('#at-planning').isVisible(),true);
  // Le classeur des temps par vol s'exporte depuis « Fichiers » (évolution 22 b) : son bouton y dit son classeur.
  await nav.aller(page,'u-sauvegarde');
  assert.equal(await page.locator('#rg-export').isVisible(),true);
  assert.match(await page.locator('#rg-export').getAttribute('aria-label'),/Temps par vol/);
  assert.equal(await page.locator('#fi-classeurs tr[data-classeur=etude] #rg-export').count(),1,'dans le tableau des classeurs');

  // 5. Au clavier : les flèches passent d'une entrée à l'autre, d'un bloc à l'autre ; une seule entrée prend la tabulation.
  await nav.aller(page,'j-comparer');
  assert.equal(await page.locator('#menu [data-sous-onglet][tabindex="0"]').count(),1,'une seule entrée dans l’ordre de tabulation');
  await page.locator('[data-sous-onglet=j-comparer]').focus();await page.keyboard.press('ArrowDown');await attendre();
  assert.equal(await actif(),'v-programme','après « Comparer », la première entrée de « Régler »');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.sousOnglet),'v-programme','le focus suit');
  await page.keyboard.press('ArrowUp');await attendre();
  assert.equal(await actif(),'j-comparer');
  await page.keyboard.press('Home');await attendre();
  assert.equal(await actif(),'j-chiffres');
  await page.keyboard.press('ArrowUp');await attendre();
  assert.equal(await courant(),'mu-pas','avant la première, on revient à la dernière');
  // La dernière page ouverte d'un groupe est retenue d'une visite à l'autre : son entrée y ramène.
  // (Évolution 22 c : « Chemins » n'est plus un groupe ; « Détails » en est un.)
  await nav.aller(page,'j-stocks');await nav.aller(page,'j-comparer');
  await page.reload();await nav.pret(page);
  assert.equal(await courant(),'accueil','rien ne se calcule : on revient par l’accueil');
  // Sur l'accueil, aucune entrée n'est ouverte ; la première prend la tabulation, et Entrée l'ouvre sans perdre le focus.
  assert.equal(await page.locator('#menu [aria-selected=true]').count(),0);
  assert.equal(await page.locator('#menu [data-sous-onglet][tabindex="0"]').getAttribute('data-sous-onglet'),'j-chiffres');
  await page.locator('#menu [data-entree="groupe:details"]').click();await attendre();
  assert.equal(await actif(),'j-stocks','« Détails » rouvre la page choisie');
  await page.locator('#menu [data-entree="at-planning"]').click();await attendre();
  assert.equal(await actif(),'at-planning');
  await page.locator('#menu [data-entree="at-planning"]').focus();await page.keyboard.press('ArrowDown');await attendre();
  assert.equal(await actif(),'j-stocks','au clavier aussi');
  // « Chemins » et « Services et équipes » sont chacune une page : l'entrée l'ouvre.
  await page.locator('#menu [data-entree="mu-flux"]').click();await attendre();
  assert.equal(await actif(),'mu-flux');
  await page.locator('#menu [data-entree="mu-services"]').click();await attendre();
  assert.equal(await actif(),'mu-services');
  // Une tuile ouvre son espace ; ses entrées y sont listées, chacune ouvre la sienne.
  await nav.accueil(page);
  await tuile('reglages').locator('[data-page=rg-simulation]').click();await attendre();
  assert.equal(await actif(),'rg-simulation');
  await nav.accueil(page);
  await tuile('donnees').locator('.acc-tuile-tete').click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.partie),'donnees');
  await nav.accueil(page);
  await page.locator('.acc-pied [data-page=u-sauvegarde]').click();await attendre();
  assert.equal(await courant(),'fichiers');

  // 6. Une équipe qui prépare un repas : l'accueil suit.
  // (Évolution 22 b : une équipe naît dans la fiche de son service, « Ajouter une équipe » ; sa fiche s'ouvre, tous ses réglages dépliés.)
  const id=await nav.ajouterEquipe(page,'prepa');await nav.reglagesEquipe(page,id);
  await page.selectOption(`[data-at="${id}"] [data-at-champ=lot-nouveau]`,'AF/BC');await attendre();
  assert.match(await page.locator(`[data-at="${id}"] .at-chips`).textContent(),/AF · Business/,'les repas s’écrivent en clair');
  await nav.accueil(page);
  assert.match(await tuile('organisation').textContent(),/\d+ commandes sans équipe/);
  assert.match(await tuile('resultats').textContent(),/en retard|à l’heure/,'la journée a un résultat');
  await nav.aller(page,'j-chiffres');
  assert.equal(await page.locator('#bilan-journee').isVisible(),true,'la synthèse : la journée entière d’abord');
  // Évolution 15 (b) : elle répond aux cinq questions — deux phrases, les cartes, le tableau des services, la courbe.
  assert.equal(await page.locator('#bilan-journee .sy-tete .bilan-resume').count(),2,'deux phrases en tête');
  assert.ok(await page.locator('#bilan-journee .sy-carte').count()>=2,'où ça coince, ce qui part en retard');
  assert.ok(await page.locator('#bilan-journee .sy-table tbody tr').count()>=1,'les services');
  // Le tableau des étapes se calcule (« Détails › Commandes », déplié — évolution 22 c) : une cellule mène au chemin
  // de sa commande, dans « Chemins ».
  await nav.etapesCommandes(page);
  assert.equal(await page.locator('.qf-table').isVisible(),true,'le tableau se dessine quand on le déplie');
  await page.locator(`[data-qf=aller][data-classe="AF/BC"][data-service=prepa]`).click();await attendre();
  assert.equal(await actif(),'mu-flux');
  assert.equal(await page.locator('#mu-flux .ch-etape[data-ch-etape=prepa] tr.ch-vise').getAttribute('data-ch-cmd'),'AF/BC');

  // Plus de partie cachée : les anciens « Outils avancés » sont des onglets de leur sujet.
  await nav.accueil(page);
  assert.equal(await page.locator('#btn-avance').count(),0,'plus de bouton à part dans l’en-tête');
  await nav.aller(page,'mu-flux');
  assert.equal(await page.evaluate(()=>document.body.dataset.partie),'organisation');

  // 7. Le sens passe par l'image.
  assert.equal(await page.locator('#menu .menu-entree.actif svg.ico').count(),1,'l’entrée ouverte porte son pictogramme');
  await nav.aller(page,'j-plan');
  assert.ok(await page.locator('#plan .zone-ico').count()>=10,'chaque service du plan a son médaillon');

  // 8. « Fichiers », en bas du menu ; les limites du calcul y sont dites.
  await page.locator('#btn-sauvegarde').click();await attendre();
  assert.equal(await actif(),'u-sauvegarde');
  assert.equal(await courant(),'fichiers','« Fichiers » dit qu’on y est ; aucune autre entrée n’est ouverte');
  assert.equal(await page.locator('#ariane-partie').textContent(),'Fichiers');
  assert.equal(await page.locator('#menu [data-sous-onglet]:not(:visible)').count(),0,'le menu reste entier');
  assert.equal(await page.locator('#model-limits').isVisible(),true);
  assert.equal(await page.locator('#fc-export').isVisible(),false,'les outils des liens ne suivent pas dans la sauvegarde');

  // 9. Pendant l'édition du plan, le menu attend qu'on la termine : toutes ses entrées sont grisées, même après un recalcul.
  await nav.aller(page,'j-plan');await page.locator('#btn-edit').click();await attendre();
  assert.equal(await page.locator('#menu [data-sous-onglet]:not(:disabled)').count(),0,'toutes les entrées attendent');
  assert.equal(await page.locator('#btn-accueil').isDisabled(),true);
  assert.equal(await page.locator('#btn-sauvegarde').isDisabled(),true);
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const a=Sim.ateliers.state.ateliers.at(-1);a.debut=a.debut==='05:00'?'05:15':'05:00';},''));await attendre();
  assert.equal(await page.locator('#menu [data-sous-onglet]:not(:disabled)').count(),0,'encore après un recalcul');
  await page.locator('#edit-done').click();await attendre();
  assert.equal(await page.locator('#menu [data-sous-onglet]:disabled').count(),0);
  assert.equal(await page.locator('#btn-sauvegarde').isDisabled(),false);
  // « Plan » ouvre la modification du plan ; « Terminer » ramène où l'on était.
  await nav.aller(page,'rg-simulation');
  await page.locator('#menu [data-entree="u-plan"]').click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.classList.contains('plan-editing')),true,'« Plan » ouvre le plan en modification');
  await page.locator('#edit-done').click();await attendre();
  assert.equal(await actif(),'rg-simulation','« Terminer » ramène où l’on était');

  // 10. Le contenu commence tout de suite : plus de bandeaux empilés (la barre
  //     du haut, puis le titre de la page et ses outils). Depuis la 2e passe
  //     de direction artistique (15/10), le titre porte sa partie en surtitre
  //     et le nom de la page en grand : une rangée plus haute, toujours une seule.
  //     (Mesuré sur une page sans onglets internes : ceux d'un groupe ajoutent leur rangée.)
  await nav.aller(page,'rg-simulation');
  const haut=await page.evaluate(()=>Math.round(document.getElementById('tete-page').getBoundingClientRect().bottom));
  assert.ok(haut<=132,'le titre de la page finit à '+haut+' px');
  // Sur le plus petit écran visé (1 024 px), rien ne déborde et le menu reste là.
  await page.setViewportSize({width:1024,height:700});await attendre();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'pas de débordement');
  assert.equal(await page.locator('#menu [data-entree="j-chiffres"]').isVisible(),true);
  await nav.accueil(page);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'l’accueil non plus');
  await page.close();

  // 11. Une unité fictive et un programme de vols daté : les quatorze entrées, dans cet ordre, aux deux tailles d'écran ;
  //     à 1 366 × 768, le menu ne défile pas.
  for(const [w,h] of [[1366,768],[1920,1080]]){
   const T=w+' × '+h+' : ';
   const p=await browser.newPage({viewport:{width:w,height:h}});p.on('pageerror',e=>errors.push(e.message));
   const lignes=F.volsCsv().trim().split('\n');
   const date='date,'+lignes[0]+'\n'+['2031-03-03','2031-03-04'].flatMap(d=>lignes.slice(1).map(l=>d+','+l)).join('\n')+'\n';
   const site=await F.charger(p,nav,URL_SITE,{csv:date,pageId:'j-chiffres'});
   try{
    const lus=()=>p.evaluate(()=>[...document.querySelectorAll('#menu [data-sous-onglet] > span:not(.so-badge), #btn-sauvegarde > span:last-child')].map(x=>x.textContent.trim()));
    assert.deepEqual(await lus(),QUATORZE,T+'les quatorze entrées, dans l’ordre');
    // Sans défilement : la zone du menu ne déborde pas, et chaque entrée tient dans l'écran.
    const m=await p.evaluate(()=>{const z=document.querySelector('.barre-defile');
      return {deborde:z.scrollHeight-z.clientHeight,bas:Math.max(...[...document.querySelectorAll('#menu [data-sous-onglet], .barre-pied .barre-lien')].map(b=>b.getBoundingClientRect().bottom)),
        haut:innerHeight,tailles:[...new Set([...document.querySelectorAll('#menu [data-sous-onglet]')].map(b=>parseFloat(getComputedStyle(b).fontSize)))]};});
    assert.ok(m.deborde<=0,T+'le menu ne défile pas (il déborde de '+m.deborde+' px)');
    assert.ok(m.bas<=m.haut,T+'toutes les entrées tiennent dans l’écran ('+m.bas+' / '+m.haut+')');
    assert.ok(m.tailles.every(t=>t>=13),T+'des entrées en 13 px au moins : '+m.tailles);
    // La pastille des problèmes est sur « Contrôles », et nulle part ailleurs : les bloquants plus les « à corriger ».
    const pastilles=await p.evaluate(()=>({menu:[...document.querySelectorAll('#menu [data-sous-onglet]')].filter(b=>b.querySelector('.so-badge')).map(b=>[b.dataset.entree,+b.querySelector('.so-badge').textContent]),
      compte:OrlyAvis.compte(Sim.problemes.liste),infos:Sim.problemes.liste.length-OrlyAvis.compte(Sim.problemes.liste)}));
    assert.ok(pastilles.compte>0,T+'l’unité fictive a des problèmes : '+JSON.stringify(pastilles));
    assert.deepEqual(pastilles.menu,[['mu-pas',pastilles.compte]],T+'une seule pastille, sur « Contrôles »');
    assert.equal(await p.locator('#btn-problemes').count(),0,T+'plus de bouton « Problèmes » au bas du menu (évolution 22 d)');
    // L'accueil suit : avec un programme daté, sa tuile « Lire » liste « Période ».
    await p.locator('#btn-accueil').click();await p.waitForTimeout(150);
    assert.equal(await p.locator('#view-accueil').isVisible(),true,T+'la marque mène à l’accueil');
    assert.deepEqual(await p.locator('.acc-tuile').first().locator('.acc-page').allTextContents(),LIRE,T+'l’accueil liste « Période » avec un programme daté');
    assert.deepEqual(await lus(),QUATORZE,T+'le menu reste entier sur l’accueil');
    if(w===1366){
     // « Aller à… » : chaque nom de page d'avant l'évolution — et chaque nom plus ancien — mène à sa page.
     // Les cinq pages que « Services et équipes » a reprises (évolution 22 b) se cherchent toujours par leur nom, et par
     // leur nom plus ancien : elles mènent à la page nouvelle, au bon endroit dedans (`lieu`).
     const noms=await p.evaluate(()=>[...Object.values(OrlyOnglets.ONGLETS).flat().flatMap(o=>[[o.id,o.nom,o.nom],...(o.ancien?[[o.id,o.ancien,o.nom]]:[])]),
      ...Object.entries(OrlyOnglets.ANCIENNES).flatMap(([id,a])=>[[a.vers,a.nom,a.nom,a.lieu,id],...(a.ancien?[[a.vers,a.ancien,a.nom,a.lieu,id]]:[])])]);
     // Évolution 22 (c) : « Chemins » a repris trois pages de plus (« Vue d'ensemble », « Chemin d'une commande »,
     // « Étapes de chaque commande ») et garde l'ancien nom de la sienne (« Chemins de production ») : dix-neuf pages.
     // Évolution 22 (d) : « Contrôles » a repris « Contrôles détaillés », et garde l'ancien nom de sa page (« Prêt à
     // simuler ? ») et celui du panneau « Problèmes » : dix-huit pages, douze noms repris.
     assert.equal(new Set(noms.filter(x=>!x[4]).map(x=>x[0])).size,18,'les dix-huit pages');
     assert.deepEqual([...new Set(noms.filter(x=>x[4]).map(x=>x[4]))].sort(),['at-chemins','at-equipes','at-grille','at-recap','mu-carte','mu-flux:avant','mu-pas:avant','mu-pas:problemes','rg-minutes','rg-recap','u-lecture','u-services'],'et les douze noms repris');
     const AU_BON_ENDROIT={'mu-services:equipes':'#mu-services details[data-mu-section=equipes][open]','mu-services:temps':'#mu-services details[data-mu-section=temps][open]','mu-services:liste':'#mu-services .se-liste',
       'mu-flux:liste':'#mu-flux .ch-liste .mu-svc.actif','mu-flux:etapes':'#mu-flux .ch-etape'};
     for(const [id,cherche,nom,lieu] of noms){
      await nav.terminerPlan(p);
      await p.keyboard.press('Control+k');await p.waitForSelector('dialog.palette [role=option]');
      await p.keyboard.type(cherche);await p.waitForTimeout(150);
      const options=p.locator('dialog.palette [role=option]');
      const i=(await options.evaluateAll(os=>os.map(o=>(o.querySelector('.pal-nom')||o).textContent.trim()))).findIndex(t=>t===nom||t.endsWith('› '+nom));
      assert.ok(i>=0,'« Aller à… » trouve « '+cherche+' »');
      await options.nth(i).click();await p.waitForTimeout(150);
      assert.equal(await p.evaluate(()=>document.body.dataset.sous),id,'« '+cherche+' » mène à sa page');
      if(lieu){
       assert.equal(await p.locator(AU_BON_ENDROIT[id+':'+lieu]).first().isVisible(),true,'« '+cherche+' » mène au bon endroit : '+lieu);
       if(id==='mu-services')assert.equal(await p.locator('#mu-services .se-equipe').count(),0,'« '+cherche+' » : la fiche du service, pas celle d’une équipe');
       else assert.equal(await p.locator('[data-mu-graphe]:visible').count(),1,'« '+cherche+' » : le chemin, dans le seul éditeur');
      }
     }
     await nav.terminerPlan(p);
     // Le nom court d'une entrée et le nom d'une partie d'avant se cherchent aussi.
     for(const [cherche,attendu] of [['Retours','Planche retour'],['Fichiers','Sauvegarde et limites'],['Sauvegarde','Sauvegarde et limites'],['Résultats','Synthèse'],['Équipes','Services et équipes']]){
      await p.keyboard.press('Control+k');await p.waitForSelector('dialog.palette [role=option]');
      await p.keyboard.type(cherche);await p.waitForTimeout(150);
      const trouves=await p.locator('dialog.palette [role=option] .pal-nom').allTextContents();
      assert.ok(trouves.map(t=>t.trim()).includes(attendu),'« '+cherche+' » propose « '+attendu+' » : '+trouves.join(' | '));
      await p.keyboard.press('Escape');await p.waitForTimeout(100);
     }
    }
    // Une journée se calcule : rechargée, l'application s'ouvre sur la Synthèse, pas sur l'accueil. (Les vols importés
    // ne sont pas gardés d'une visite à l'autre : le programme daté est parti, « Période » avec lui.)
    await nav.aller(p,'j-comparer');await nav.aller(p,'rg-simulation');await nav.recharger(p);
    assert.equal(await p.evaluate(()=>!!Sim.ateliers.resultat&&Sim.ateliers.resultat.ok!==false&&Sim.ateliers.resultat.lots.length>0),true,T+'une journée se calcule');
    assert.deepEqual(await p.evaluate(()=>[document.body.dataset.vue,document.body.dataset.sous,document.getElementById('view-title').textContent]),['plan','j-chiffres','Synthèse'],T+'elle s’ouvre sur la Synthèse');
    assert.equal(await p.locator('#view-accueil').isVisible(),false);
    assert.equal(await p.locator('#bilan-journee').isVisible(),true);
    assert.equal(await p.locator('#menu [aria-selected=true]').getAttribute('data-entree'),'j-chiffres');
    assert.deepEqual(await lus(),QUATORZE.filter(x=>x!=='Période'),T+'sans programme daté, treize entrées');
    // Cette ouverture n'est pas un choix : la dernière page choisie de « Lire » reste « Comparer ».
    assert.deepEqual(await p.evaluate(()=>[Sim.onglets.ouverture,Sim.onglets.choix.resultats,JSON.parse(localStorage.getItem('ory-menu-pages')).resultats]),[true,'j-comparer','j-comparer'],T+'la page choisie reste retenue');
   }finally{site.effacer();await p.close();}
  }

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('menu-browser : ok — quatorze entrées en deux blocs, dans l’ordre, à 1 366 × 768 et 1 920 × 1 080, sans défilement ; l’accueil suit ; ouverture sur la Synthèse ; une pastille, sur « Contrôles » ; chaque ancien nom par « Aller à… »');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

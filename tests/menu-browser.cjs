/* Le menu principal : une page d'accueil à tuiles, quatre parties rangées par
 * nature (Données, Organisation, Réglages, Résultats), et dans chacune ses
 * pages. On arrive sur l'accueil ; chaque page a un titre et une phrase en
 * mots de tous les jours. C'est ce qui permet à quelqu'un qui n'est pas du
 * métier de comprendre où il est et ce qu'il regarde. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(150);
 const onglets=()=>page.locator('#sous-onglets [data-sous-onglet]').evaluateAll(bs=>bs.map(b=>b.dataset.sousOnglet));
 const actif=()=>page.locator('#sous-onglets [aria-selected=true]').getAttribute('data-sous-onglet');
 const courant=()=>page.evaluate(()=>{const b=document.querySelector('#menu [aria-current=page]');return b?b.dataset.versPartie:null;});
 const tuile=p=>page.locator(`.acc-tuile:has([data-vers-partie=${p}])`);
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();

  // 1. On arrive sur l'accueil : l'histoire en quatre images, puis quatre tuiles.
  assert.equal(await page.locator('#view-accueil').isVisible(),true,'on arrive sur l’accueil');
  assert.equal(await page.locator('.app').isVisible(),false,'aucune page derrière');
  assert.equal(await courant(),'accueil');
  assert.equal(await page.locator('.acc-histoire .cm-liste li').count(),4);
  assert.equal(await page.locator('.acc-histoire svg.ico').count(),4,'une image par temps de l’histoire');
  assert.match(await page.locator('.acc-histoire').textContent(),/Des avions partent[\s\S]*repas[\s\S]*équipes[\s\S]*calcule/);
  assert.deepEqual(await page.locator('.acc-tuile-tete').evaluateAll(bs=>bs.map(b=>b.dataset.versPartie)),
    ['donnees','organisation','reglages','resultats'],'quatre parties, dans l’ordre du travail');
  // Chaque tuile dit son état en clair : ce qui est réel, ce qui est un exemple, ce qui reste à faire.
  assert.match(await tuile('donnees').textContent(),/Vols : 12 départs · exemple[\s\S]*Temps de travail : chiffres d’exemple/);
  assert.match(await tuile('donnees').locator('.acc-etat').textContent(),/provisoire/);
  assert.match(await tuile('organisation').textContent(),/aucune équipe/);
  assert.match(await tuile('reglages').textContent(),/Repas prêts 45 min avant le départ/);
  assert.match(await tuile('resultats').textContent(),/rien à calculer/);
  assert.equal(await page.locator('.acc-etat.verifier').count(),0,'un exemple n’est pas une alerte');
  // Ce qu'il y a à faire ensuite, en un clic.
  assert.match(await page.locator('.acc-suite').textContent(),/À faire ensuite/);
  await page.locator('.acc-suite [data-page]').click();await attendre();
  assert.equal(await courant(),'organisation');
  assert.equal(await actif(),'at-chemins','« Décrire une première équipe » ouvre les chemins');

  // 2. Le menu de l'en-tête : une partie ouvre ses pages, et seulement elles.
  const attendues={donnees:['v-programme','rg-minutes'],
    organisation:['at-chemins','at-equipes','at-grille','u-liens','u-lecture'],
    reglages:['v-horaires','rg-rythme'],
    resultats:['j-chiffres','j-plan','at-planning','at-repas','v-departs','j-stocks','j-comparer']};
  const noms={donnees:'Données',organisation:'Organisation',reglages:'Réglages',resultats:'Résultats'};
  for(const [p,pages] of Object.entries(attendues)){
    await page.locator(`#menu [data-vers-partie=${p}]`).click();await attendre();
    assert.equal(await courant(),p);
    assert.equal(await page.locator('#menu [aria-current=page]').count(),1,'une seule partie ouverte');
    assert.deepEqual(await onglets(),pages,p);
    assert.equal(await page.locator('#view-title').textContent(),noms[p]);
    for(const id of pages){
      await nav.aller(page,id);
      assert.equal(await actif(),id);
      assert.ok((await page.locator('#view-intro').textContent()).length>20,id+' : une phrase dit ce qu’on voit');
    }
  }

  // 3. Chaque page a sa nature : on ne règle pas dans les résultats, on ne lit
  //    pas de résultat dans les données.
  await nav.aller(page,'v-programme');
  assert.equal(await page.locator('#imp-vols').isVisible(),true,'les vols s’importent dans Données');
  assert.equal(await page.locator('#shift').isVisible(),false,'le décalage des vols n’y est plus');
  assert.match(await page.locator('.vols-source').textContent(),/Jeu de démonstration/,'d’où viennent les vols, dit là où on les change');
  await nav.aller(page,'v-horaires');
  assert.equal(await page.locator('#shift').isVisible(),true,'c’est un réglage');
  assert.equal(await page.locator('#loadDelay').isVisible(),true);
  assert.equal(await page.locator('#imp-vols').isVisible(),false);
  await nav.aller(page,'v-departs');
  assert.equal(await courant(),'resultats','les départs prêts ou en retard sont un résultat');
  assert.equal(await page.locator('#vols-frise .vf-vol').count(),12,'un avion par départ');
  await page.locator('.vf-compte.vf-sans').click();await attendre();
  assert.equal(await page.locator('#flight-filter').inputValue(),'pending','un compteur filtre le tableau');
  await page.locator('.vf-compte.vf-sans').click();await attendre();
  await nav.aller(page,'j-chiffres');
  assert.equal(await page.locator('.chiffres-vide').isVisible(),true,'rien à compter : la synthèse dit par où commencer');
  assert.equal(await page.locator('.chiffres-vide [data-page=at-chemins]').count(),1);
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
  await nav.aller(page,'rg-minutes');
  assert.ok(await page.locator('.rg-barres .rg-barre i[data-cab=BC]').count()>5,'les minutes se lisent en barres');

  // 4. Les outils suivent la page : ceux des cases en Organisation, pas dans les résultats.
  await nav.aller(page,'at-grille');
  assert.equal(await page.locator('#at-export').isVisible(),true,'les outils restent à portée, sur la barre des onglets');
  assert.match(await page.locator('#at-export').textContent(),/Cases et chemins/,'un export dit ce qu’il contient');
  await nav.aller(page,'at-planning');
  assert.equal(await page.locator('#at-export').isVisible(),false,'pas d’import ni d’export des cases dans les résultats');
  assert.equal(await page.locator('#at-planning').isVisible(),true);
  await nav.aller(page,'rg-rythme');
  assert.match(await page.locator('#rg-export').textContent(),/Temps de travail/);

  // 5. Au clavier : les flèches passent d'une page à l'autre de la partie.
  await nav.aller(page,'j-comparer');
  await page.locator('[data-sous-onglet=j-comparer]').focus();await page.keyboard.press('ArrowRight');await attendre();
  assert.equal(await actif(),'j-chiffres','après la dernière, on revient à la première');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.sousOnglet),'j-chiffres','le focus suit');
  await page.keyboard.press('ArrowLeft');await attendre();
  assert.equal(await actif(),'j-comparer');
  // La page ouverte de chaque partie est retenue d'une visite à l'autre.
  await page.reload();await attendre();
  assert.equal(await courant(),'accueil','on revient par l’accueil');
  await page.locator('#menu [data-vers-partie=resultats]').click();await attendre();
  assert.equal(await actif(),'j-comparer','la page choisie est retenue');
  // Une tuile ouvre sa partie ; ses pages y sont listées, chacune ouvre la sienne.
  await nav.accueil(page);
  await tuile('reglages').locator('[data-page=rg-rythme]').click();await attendre();
  assert.equal(await actif(),'rg-rythme');
  await nav.accueil(page);
  await tuile('donnees').locator('.acc-tuile-tete').click();await attendre();
  assert.equal(await courant(),'donnees');

  // 6. Une équipe qui prépare un repas : l'accueil suit.
  await nav.aller(page,'at-equipes');await page.locator('#at-new').click();await attendre();
  const id=await page.evaluate(()=>Sim.ateliers.state.ateliers.at(-1).id);
  await page.selectOption(`[data-at="${id}"] [data-at-champ=service]`,'prepa');await attendre();
  await page.selectOption(`[data-at="${id}"] [data-at-champ=lot-nouveau]`,'AF/BC');await attendre();
  assert.match(await page.locator(`[data-at="${id}"] .at-chips`).textContent(),/AF · Business/,'les repas s’écrivent en clair');
  await nav.accueil(page);
  assert.match(await tuile('organisation').textContent(),/\d+ commandes sans équipe/);
  assert.match(await tuile('resultats').textContent(),/en retard|à l’heure/,'la journée a un résultat');
  await nav.aller(page,'j-chiffres');
  assert.equal(await page.locator('#bilan-journee').isVisible(),true,'la synthèse : la journée entière d’abord');
  assert.ok(await page.locator('#bilan-journee .bilan>div').count()>=6,'en tuiles');
  // Le tableau se calcule : une case mène au chemin de sa commande.
  await nav.aller(page,'at-grille');
  assert.equal(await page.locator('.qf-table').isVisible(),true,'le tableau se dessine à l’ouverture de sa page');
  await page.locator(`[data-qf=aller][data-classe="AF/BC"][data-service=prepa]`).click();await attendre();
  assert.equal(await actif(),'at-chemins');
  assert.equal(await page.locator('.pc-cmd.actif').getAttribute('data-classe'),'AF/BC');

  // 7. Le sens passe par l'image.
  assert.equal(await page.locator('#menu .menu-partie svg.ico').count(),5,'un pictogramme par partie, et l’accueil');
  assert.equal(await page.locator('#view-ico svg').count(),1,'la page porte le pictogramme de sa partie');
  assert.ok(await page.locator('#plan .zone-ico').count()>=10,'chaque service du plan a son médaillon');

  // 8. La sauvegarde, depuis l'en-tête ; les limites du calcul y sont dites.
  await page.locator('#btn-sauvegarde').click();await attendre();
  assert.equal(await actif(),'u-sauvegarde');
  assert.equal(await courant(),null,'la sauvegarde n’est pas une partie du travail');
  assert.equal(await page.locator('#model-limits').isVisible(),true);
  assert.equal(await page.locator('#fc-export').isVisible(),false,'les outils des liens ne suivent pas dans la sauvegarde');

  // 9. Pendant l'édition du plan, le menu attend qu'on la termine.
  await nav.aller(page,'j-plan');await page.locator('#btn-edit').click();await attendre();
  assert.equal(await page.locator('#menu [data-vers-partie=donnees]').isDisabled(),true);
  assert.equal(await page.locator('#btn-accueil').isDisabled(),true);
  await page.locator('#edit-done').click();await attendre();
  assert.equal(await page.locator('#menu [data-vers-partie=donnees]').isDisabled(),false);

  // 10. Le contenu commence tout de suite : plus de bandeaux empilés.
  await nav.aller(page,'at-chemins');
  const haut=await page.evaluate(()=>Math.round(document.getElementById('sous-onglets').getBoundingClientRect().bottom));
  assert.ok(haut<=170,'les onglets finissent à '+haut+' px');
  // Sur le plus petit écran visé (1 024 px), rien ne déborde et le menu reste là.
  await page.setViewportSize({width:1024,height:700});await attendre();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'pas de débordement');
  assert.equal(await page.locator('#menu [data-vers-partie=resultats]').isVisible(),true);
  await nav.accueil(page);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'l’accueil non plus');

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('menu-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

/* L'histoire du site : quatre étapes numérotées qui sont la navigation, un
 * encart « Comment ça marche » à la première visite, et sur chaque vue un
 * titre et une phrase en mots de tous les jours. C'est ce qui permet à
 * quelqu'un qui n'est pas du métier de comprendre ce qu'il regarde. */
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(150);
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();

  // 1. À la première visite, l'histoire est racontée en quatre images.
  assert.equal(await page.locator('#comment').isVisible(),true,'« Comment ça marche » s’ouvre la première fois');
  assert.equal(await page.locator('#comment .cm-liste li').count(),4);
  assert.equal(await page.locator('#comment svg.cm-picto').count(),4,'une image par étape de l’histoire');
  assert.match(await page.locator('#comment').textContent(),/Des avions partent[\s\S]*repas[\s\S]*équipes[\s\S]*calcule/);
  await page.locator('[data-comment-fermer]').click();await attendre();
  assert.equal(await page.locator('#comment').isVisible(),false,'« J’ai compris » le referme');
  await page.reload();await attendre();
  assert.equal(await page.locator('#comment').isVisible(),false,'et il reste fermé');
  await page.locator('#btn-comment').click();await attendre();
  assert.equal(await page.locator('#comment').isVisible(),true,'le bouton de l’en-tête le rouvre');
  assert.equal(await page.locator('#btn-comment').getAttribute('aria-expanded'),'true');
  await page.locator('#btn-comment').click();await attendre();
  assert.equal(await page.locator('#comment').isVisible(),false);

  // 2. Quatre étapes numérotées, dans l'ordre où l'on pense, puis l'unité à part.
  const etapes=await page.locator('#etapes .etapes-liste .etape').evaluateAll(bs=>bs.map(b=>b.dataset.view+':'+b.querySelector('.etape-num').textContent.trim()));
  assert.deepEqual(etapes,['vols:1','ateliers:2','reglages:3','plan:4']);
  assert.equal(await page.locator('#etapes .etape.annexe[data-view=flux]').count(),1);
  // Chaque étape dit son état en clair.
  assert.match(await page.locator('#etapes [data-view=vols]').textContent(),/12 départs · exemple/);
  assert.match(await page.locator('#etapes [data-view=ateliers]').textContent(),/aucune équipe/);
  assert.match(await page.locator('#etapes [data-view=reglages]').textContent(),/chiffres d’exemple/);
  assert.match(await page.locator('#etapes [data-view=plan]').textContent(),/rien à calculer/);
  // Et la suivante à faire est désignée.
  assert.match(await page.locator('#etapes [data-view=ateliers]').textContent(),/à faire ensuite/);

  // 3. Chaque étape ouvre sa vue, avec un titre et une phrase simples.
  const titres={vols:'Les vols',ateliers:'Qui prépare quoi',reglages:'Les temps de travail',plan:'La journée',flux:'L’unité : qui livre qui'};
  for(const [vue,titre] of Object.entries(titres)){
    await page.locator(`#etapes [data-view=${vue}]`).click();await attendre();
    assert.equal(await page.locator('#view-title').textContent(),titre);
    assert.ok((await page.locator('#view-intro').textContent()).length>20,'une phrase dit ce qu’on voit');
    assert.equal(await page.locator(`#etapes [data-view=${vue}]`).getAttribute('aria-current'),'page');
    assert.equal(await page.locator('#etapes [aria-current=page]').count(),1,'une seule étape en cours');
  }

  // 4. Les commandes de lecture ne vivent que dans « La journée ».
  await page.locator('#etapes [data-view=vols]').click();await attendre();
  assert.equal(await page.locator('#btn-play').isVisible(),false);
  assert.equal(await page.locator('#imp-vols').count(),1);
  assert.equal(await page.evaluate(()=>document.getElementById('view-vols').contains(document.getElementById('imp-vols'))),true,
    'l’import des vols est à l’étape 1');
  await page.locator('#etapes [data-view=plan]').click();await attendre();
  assert.equal(await page.locator('#btn-play').isVisible(),true);

  // 5. Une équipe qui prépare un repas : les étapes suivent.
  await page.locator('#etapes [data-view=ateliers]').click();await attendre();
  await page.locator('[data-sous-onglet=at-equipes]').click();await page.locator('#at-new').click();await attendre();
  const id=await page.evaluate(()=>Sim.ateliers.state.ateliers.at(-1).id);
  await page.selectOption(`[data-at="${id}"] [data-at-champ=service]`,'prepa');await attendre();
  await page.selectOption(`[data-at="${id}"] [data-at-champ=lot-nouveau]`,'AF/BC');await attendre();
  assert.match(await page.locator('#etapes [data-view=ateliers]').textContent(),/1 équipe · \d+ repas sans équipe/);
  assert.match(await page.locator('#etapes [data-view=plan]').textContent(),/en retard|à l’heure/,'la journée a un résultat');
  // Les repas s'écrivent en clair, jamais en code seul.
  assert.match(await page.locator(`[data-at="${id}"] .at-chips`).textContent(),/AF · Business/);

  // 6. Le sens passe par l'image : pictogrammes, couleurs, graphiques.
  assert.equal(await page.locator('#etapes .etape-ico svg.ico').count(),5,'un pictogramme par étape');
  assert.equal(await page.locator('#view-ico svg').count(),1,'la vue porte le pictogramme de son étape');
  assert.ok(await page.locator('#plan .zone-ico').count()>=10,'chaque service du plan a son médaillon');
  await page.locator('#etapes [data-view=vols]').click();await attendre();
  assert.equal(await page.locator('#vols-frise svg.vf-svg').count(),1,'la frise des départs');
  assert.equal(await page.locator('#vols-frise .vf-vol').count(),12,'un avion par départ');
  await page.locator('.vf-compte.vf-sans').click();await attendre();
  assert.equal(await page.locator('#flight-filter').inputValue(),'pending','un compteur filtre le tableau');
  await page.locator('.vf-compte.vf-sans').click();await attendre();
  assert.equal(await page.locator('#flight-filter').inputValue(),'all','et le recliquer rend tout');
  assert.ok(await page.locator('#flight-rows .rc .puce-classe').count()>0,'chaque repas porte la couleur de sa classe');
  await page.locator('#etapes [data-view=reglages]').click();await attendre();
  assert.ok(await page.locator('.rg-barres .rg-barre i[data-cab=BC]').count()>5,'les minutes se lisent en barres');
  await page.locator('#etapes [data-view=ateliers]').click();await attendre();
  assert.ok(await page.locator('.pc-graphe .gr-noeud .gr-ico').count()>5,'le chemin est un diagramme de nœuds');

  // 7. Épuré : chaque vue montre une chose à la fois, derrière des onglets.
  const onglets=async()=>page.locator('#sous-onglets [data-sous-onglet]').evaluateAll(bs=>bs.map(b=>b.dataset.sousOnglet));
  const actif=()=>page.locator('#sous-onglets [aria-selected=true]').getAttribute('data-sous-onglet');
  assert.equal(await page.locator('.context-bar').count(),0,'plus de bandeau de contexte au-dessus de la vue');
  await page.locator('#etapes [data-view=plan]').click();await attendre();
  assert.deepEqual(await onglets(),['j-plan','j-chiffres','j-comparer']);
  assert.equal(await page.locator('#plan').isVisible(),true,'le plan d’abord');
  assert.equal(await page.locator('.kpi-grille').isVisible(),false,'les chiffres attendent leur onglet');
  assert.equal(await page.locator('#snap-a').isVisible(),false,'la comparaison aussi');
  await page.locator('[data-sous-onglet=j-comparer]').click();await attendre();
  assert.equal(await page.locator('#snap-a').isVisible(),true);
  assert.equal(await page.locator('#plan').isVisible(),false,'un onglet à la fois');
  assert.equal(await page.locator('.workbench').isVisible(),false,'la colonne « En ce moment » suit le plan');
  // Au clavier : les flèches passent d'un onglet à l'autre.
  await page.locator('[data-sous-onglet=j-comparer]').focus();await page.keyboard.press('ArrowRight');await attendre();
  assert.equal(await actif(),'j-plan','après le dernier, on revient au premier');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.sousOnglet),'j-plan','le focus suit');
  await page.keyboard.press('ArrowLeft');await attendre();
  assert.equal(await actif(),'j-comparer');
  // L'onglet ouvert est retenu d'une visite à l'autre.
  await page.reload();await attendre();await page.locator('#etapes [data-view=plan]').click();await attendre();
  assert.equal(await actif(),'j-comparer','l’onglet choisi est retenu');
  await page.locator('[data-sous-onglet=j-plan]').click();await attendre();

  await page.locator('#etapes [data-view=ateliers]').click();await attendre();
  assert.deepEqual(await onglets(),['at-grille','at-chemins','at-equipes','at-planning','at-repas']);
  assert.equal(await actif(),'at-equipes','on retrouve l’onglet où l’on a créé l’équipe');
  await page.locator('[data-sous-onglet=at-grille]').click();await attendre();
  assert.equal(await page.locator('.qf-table').isVisible(),true);
  assert.equal(await page.locator('.pc-sec').isVisible(),false);
  assert.equal(await page.locator('#at-liste').isVisible(),false);
  assert.equal(await page.locator('#at-planning').isVisible(),false);
  assert.match(await page.locator('[data-sous-onglet=at-grille] .so-badge').textContent(),/^\d+$/,'un nombre dit les cases à choisir');
  assert.equal(await page.locator('#at-export').isVisible(),true,'les outils de la vue restent à portée, sur la barre des onglets');
  assert.equal(await page.locator('#at-anomalies').evaluate(d=>d.tagName==='DETAILS'&&!d.open),true,'les points à regarder sont repliés');
  // Ouvrir la fiche d'une équipe depuis le tableau mène à l'onglet des équipes.
  await page.locator(`[data-qf=case][data-classe="AF/BC"][data-service=prepa]`).click();await attendre();
  await page.locator('.qf-menu [data-qf=fiche]').first().click();await attendre();
  assert.equal(await actif(),'at-equipes');
  assert.equal(await page.locator(`[data-at="${id}"]`).isVisible(),true,'sa fiche est ouverte');

  await page.locator('#etapes [data-view=vols]').click();await attendre();
  assert.deepEqual(await onglets(),['v-departs','v-programme']);
  assert.equal(await page.locator('#imp-vols').isVisible(),false,'l’import attend dans « Le programme »');
  await page.locator('[data-sous-onglet=v-programme]').click();await attendre();
  assert.equal(await page.locator('#imp-vols').isVisible(),true);
  assert.match(await page.locator('.vols-source').textContent(),/Jeu de démonstration/,'d’où viennent les vols, dit là où on les change');
  await page.locator('[data-sous-onglet=v-departs]').click();await attendre();

  // « Chiffres d'exemple », dans l'en-tête, mène aux limites du calcul.
  await page.locator('#btn-limits').click();await attendre();
  assert.equal(await page.locator('#etapes [data-view=flux]').getAttribute('aria-current'),'page');
  assert.equal(await actif(),'u-sauvegarde');
  assert.equal(await page.locator('#model-limits').isVisible(),true);
  assert.equal(await page.locator('#fc-export').isVisible(),false,'les outils des liens ne suivent pas dans la sauvegarde');

  // 8. Sur téléphone, rien ne déborde et les étapes restent lisibles.
  await page.setViewportSize({width:390,height:844});await attendre();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'pas de débordement');
  assert.equal(await page.locator('#etapes [data-view=vols]').isVisible(),true);

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('histoire-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

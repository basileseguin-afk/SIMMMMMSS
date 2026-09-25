/* Le plan au repos doit répondre à « que me reste-t-il à renseigner ? ».
 * Ce parcours vérifie les trois états, le basculement de légende quand on
 * relit la journée, et que la bande d'indicateurs se retire hors Simulation. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const click=s=>page.locator(s).click();
 const etat=id=>page.locator('.zone[data-id='+id+']').getAttribute('class');
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  // Le site s'ouvre sur l'étape à faire ensuite : ce parcours travaille sur le plan.
  const versPlan=async()=>{await nav.vue(page,'plan');await page.waitForTimeout(120);};await versPlan();

  // 1. Au repos : rien n'est décrit, donc tout est vide. L'état se lit
  //    désormais dans les ateliers de travail, et plus dans des curseurs —
  //    c'est là qu'on décrit l'unité. Il n'y a plus de service « hors calcul » :
  //    un service vide n'est pas exclu du modèle, il est juste vide.
  assert.equal(await page.evaluate(()=>document.body.classList.contains('avant-lancement')),true);
  assert.match(await etat('cuisine'),/\bp-vide\b/,'aucun atelier décrit');
  assert.match(await etat('magasin'),/\bp-vide\b/);
  assert.match(await page.locator('#plan-etat').textContent(),/sans travail/);
  assert.match(await page.locator('#legende-plan').textContent(),/Équipe au travail/);

  // 2. Une équipe sans rien à fabriquer n'est pas un état neutre : elle est
  //    décrite, mais elle ne produira rien.
  await nav.vue(page,'reglages');
  assert.equal(await page.locator('.kpi-grille').isVisible(),false,'les indicateurs ne décrivent pas un réglage');
  await nav.vue(page,'ateliers');
  await nav.aller(page,'at-equipes');await page.locator('#at-new').click();await page.waitForTimeout(150);
  const eq=await page.evaluate(()=>Sim.ateliers.state.ateliers.at(-1).id);
  await page.selectOption(`[data-at="${eq}"] [data-at-champ=service]`,'cuisine');await page.waitForTimeout(200);
  await nav.vue(page,'plan');
  assert.match(await etat('cuisine'),/\bp-partiel\b/,'décrite, mais elle ne fabrique rien');
  // Ce qu'elle fabrique la rend aménagée.
  await nav.vue(page,'ateliers');
  await page.selectOption(`[data-at="${eq}"] [data-at-champ=lot-nouveau]`,'CRL/BC');await page.waitForTimeout(250);
  await nav.vue(page,'plan');
  assert.match(await etat('cuisine'),/\bp-pret\b/);
  // Avant le lancement, les quatre indicateurs valent tous « — » ou « 0 » : une
  // bande entière pour ne rien dire, juste au-dessus de ce qu'on vient voir.
  // Tant qu'on est au début de la journée, les quatre indicateurs ne disent
  // rien : une bande entière au-dessus de ce qu'on vient voir.
  assert.equal(await page.locator('.kpi-grille').isVisible(),false,'rien à montrer au début');
  // Les chiffres « à cette heure » accompagnent le plan rejoué : avancer dans
  // la journée les fait apparaître, ils ont alors quelque chose à dire.
  await page.evaluate(()=>Sim.vue.allerA(Sim.vue.fin));await page.waitForTimeout(200);
  assert.equal(await page.locator('.kpi-grille').isVisible(),true,'ils apparaissent dès qu’on avance');
  // La synthèse, elle, parle de la journée entière, sans lecteur.
  await nav.aller(page,'j-chiffres');await page.waitForTimeout(200);
  assert.equal(await page.locator('#bilan-journee').isVisible(),true,'le bilan de la journée');
  assert.equal(await page.locator('.kpi-grille').isVisible(),false,'pas les chiffres de l’instant');
  assert.equal(await page.locator('#btn-play').isVisible(),false,'ni le lecteur');
  await nav.aller(page,'j-plan');
  await page.locator('#btn-reset').click();await page.waitForTimeout(200);
  assert.equal(await page.locator('.kpi-grille').isVisible(),false,'et repartent au début');
  await nav.aller(page,'j-plan');await page.waitForTimeout(150);
  // 3. Un second service décrit fait baisser le reste à faire.
  const avant=await page.locator('#plan-etat').textContent();
  await nav.vue(page,'ateliers');
  await nav.aller(page,'at-equipes');await page.locator('#at-new').click();await page.waitForTimeout(150);
  const at=await page.evaluate(()=>Sim.ateliers.state.ateliers.at(-1).id);
  await page.selectOption(`[data-at="${at}"] [data-at-champ=service]`,'prepa');await page.waitForTimeout(150);
  await nav.vue(page,'plan');
  assert.match(await etat('prepa'),/\bp-partiel\b/,'un atelier vide n’aménage rien');
  await nav.vue(page,'ateliers');
  await page.selectOption(`[data-at="${at}"] [data-at-champ=lot-nouveau]`,'CRL/PC');await page.waitForTimeout(250);
  await nav.vue(page,'plan');
  assert.match(await etat('prepa'),/\bp-pret\b/,'une fabrication suffit à marquer le service aménagé');
  assert.notEqual(await page.locator('#plan-etat').textContent(),avant,'le reste à faire diminue');

  // 4. Dès qu'on avance dans la journée, le plan dit ce qui s'y passe : les
  //    couleurs de paramétrage cèdent la place aux quatre états de la relecture.
  await click('#sim-pas');await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>document.body.classList.contains('avant-lancement')),false);
  assert.equal(await page.evaluate(()=>document.body.classList.contains('en-lecture')),true);
  const legende=await page.locator('#legende-plan').textContent();
  assert.match(legende,/Au travail/);assert.match(legende,/Attend le service d’avant/);
  assert.doesNotMatch(legende,/Équipe au travail|Aucune équipe/,'jamais deux grilles de lecture à la fois');
  assert.doesNotMatch(legende,/Hors calcul/);
  const actifs=await page.evaluate(()=>['cuisine','prepa'].map(id=>document.querySelector('.zone[data-id='+id+']').getAttribute('class')).join(' '));
  assert.match(actifs,/\bs-(travail|attente)\b/,'le premier pas montre un service ouvert');
  assert.doesNotMatch(await etat('magasin'),/\bs-/,'un service sans atelier ne prend aucun état');
  assert.equal(await page.locator('.zone.p-hors').count(),0,'il n’y a plus de service « hors calcul »');
  // Un service au travail se voit : sa couleur n'est plus celle du repos.
  await page.evaluate(()=>Sim.vue.allerA(Sim.vue.fin));await page.waitForTimeout(150);
  assert.match(await etat('cuisine'),/\bs-fini\b/,'en fin de journée, la cuisine a fini');
  assert.match(await page.locator('#run-state').textContent(),/Fin de journée/);

  // 5. BUG-013 : une couleur choisie dans l'éditeur survit à la sortie du mode
  //    édition. Elle tient le fond ; l'état de paramétrage passe au contour.
  await click('#btn-reset');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('en-lecture')),false,'retour au paramétrage');
  // Le fond des zones est en transition (0,35 s) : lire trop tôt donne une
  // couleur intermédiaire. On attend la fin de l'animation avant de mesurer.
  const pose=()=>page.waitForTimeout(450);
  const fond=async s=>{await pose();return page.locator(s).evaluate(e=>getComputedStyle(e).fill);};
  const contour=async s=>{await pose();return page.locator(s).evaluate(e=>getComputedStyle(e).stroke);};
  const colorier=async(id,c)=>{
    await click('#btn-edit');
    // Une réserve recouvre le centre de la préparation : on la désigne comme
    // le fait la liste des zones, sans viser un point du plan.
    await page.evaluate(id=>Sim.editor.select(id),id);
    if(c)await page.locator('#pe-color').evaluate((i,c)=>{i.value=c;i.dispatchEvent(new Event('change',{bubbles:true}));},c);
    else await click('#pe-color-reset');
    await click('#edit-done');
  };
  const avantCouleur=await fond('.zone[data-id=prepa] .fond');
  await colorier('prepa','#cc0033');
  assert.equal(await fond('.zone[data-id=prepa] .fond'),'rgb(204, 0, 51)','la couleur tient hors édition');
  assert.notEqual(await fond('.zone[data-id=prepa] .fond'),avantCouleur);
  assert.match(await etat('prepa'),/\bp-pret\b/);
  assert.equal(await contour('.zone[data-id=prepa] .fond'),'rgb(204, 0, 51)',
    'le contour prend aussi la couleur : c’est lui qui la porte à petite taille');
  // Un atelier non colorié garde le fond du thème.
  assert.notEqual(await fond('.zone[data-id=appros] .fond'),'rgb(204, 0, 51)');
  assert.notEqual(await contour('.zone[data-id=appros] .fond'),'rgb(204, 0, 51)');
  // Exception : un service sans personne garde son contour d'alerte, même
  // colorié. La couleur est une identité, pas un moyen de masquer un défaut.
  await colorier('dotation','#cc0033');
  assert.match(await etat('dotation'),/\bp-vide\b/);
  assert.equal(await fond('.zone[data-id=dotation] .fond'),'rgb(204, 0, 51)','le fond reste celui qu’on a choisi');
  assert.equal(await contour('.zone[data-id=dotation] .fond'),await contour('.zone[data-id=appros] .fond'),
    'même contour d’alerte qu’un service vide non colorié');
  // Elle survit au rechargement.
  await page.reload();await versPlan();
  assert.equal(await fond('.zone[data-id=prepa] .fond'),'rgb(204, 0, 51)','la couleur est relue au démarrage');
  // Retour à la couleur du thème.
  await colorier('prepa',null);
  assert.equal(await fond('.zone[data-id=prepa] .fond'),avantCouleur,'le bouton rend la couleur du thème');

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('etat-plan-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

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
  await page.locator('#at-new').click();await attendre();
  const id=await page.evaluate(()=>Sim.ateliers.state.ateliers.at(-1).id);
  await page.selectOption(`[data-at="${id}"] [data-at-champ=service]`,'prepa');await attendre();
  await page.selectOption(`[data-at="${id}"] [data-at-champ=lot-nouveau]`,'AF/BC');await attendre();
  assert.match(await page.locator('#etapes [data-view=ateliers]').textContent(),/1 équipe · \d+ repas sans équipe/);
  assert.match(await page.locator('#etapes [data-view=plan]').textContent(),/en retard|à l’heure/,'la journée a un résultat');
  // Les repas s'écrivent en clair, jamais en code seul.
  assert.match(await page.locator(`[data-at="${id}"] .at-chips`).textContent(),/AF · Business/);

  // 6. Sur téléphone, rien ne déborde et les étapes restent lisibles.
  await page.setViewportSize({width:390,height:844});await attendre();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'pas de débordement');
  assert.equal(await page.locator('#etapes [data-view=vols]').isVisible(),true);

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('histoire-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

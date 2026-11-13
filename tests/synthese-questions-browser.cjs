/* Évolution 15 (b) — la Synthèse répond aux cinq questions, dans la page, sur
 * l'unité et les vols fictifs (tests/plan-rejoue-fictif.cjs) :
 *   — les phrases en tête et les chiffres du tableau « Les services » égalent
 *     ceux du module des réponses (moteur/reponses.js) ;
 *   — la page tient sur la largeur à 1 280 et 1 920 px, sans moitié vide ;
 *   — la courbe de la journée : sa bulle suit la souris et les flèches ;
 *   — le clic sur une ligne ouvre ce service dans « Planning des équipes » ;
 *   — la carte « Ce que change l'essai » n'apparaît qu'avec deux essais ;
 *   — une journée sans retard n'affiche aucune couleur critique.
 * Aucune donnée de l'unité : tout est fictif. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {siteSansPlan}=require('./plan-fictif.cjs');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

/** Les couleurs critiques (le retard) dans la Synthèse : chaque élément dont le texte, le fond, le bord ou le tracé en prend une. */
const critiques=page=>page.evaluate(()=>{
  const sonde=document.createElement('span');document.body.appendChild(sonde);
  const lire=v=>{sonde.style.color=`var(${v})`;return getComputedStyle(sonde).color;};
  const rouges=new Set(['--ds-retard','--ds-retard-texte'].map(lire));sonde.remove();
  const out=[];
  for(const el of document.querySelectorAll('#journee-chiffres *')){
    if(!el.getClientRects().length)continue;
    const c=getComputedStyle(el);
    for(const p of ['color','backgroundColor','borderLeftColor','borderTopColor','fill','stroke'])if(rouges.has(c[p]))out.push(el.className.baseVal??el.className);
  }
  return out;});

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const site=siteSansPlan();
 try{
  for(const [largeur,hauteur] of [[1280,900],[1920,1080]]){
   const V=largeur+' px : ',page=await browser.newPage({viewport:{width:largeur,height:hauteur}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   const attendre=(ms=300)=>page.waitForTimeout(ms);
   const ch=await F.charger(page,nav,site.url('index.html'),{pageId:'j-chiffres'});
   try{
    // 1. Les phrases et les chiffres du tableau : ceux du module.
    const lu=await page.evaluate(()=>{const rep=Sim.reponses(),SV=OrlySyntheseVue;
      const ls=SV.lignes(rep,OrlyPlanningVue.ordreDesServices(Sim.ateliers.resultat)),D=MoteurProduction.dureeLisible;
      return {phrases:SV.phrases(rep),attendu:ls.map(l=>[l.service,String(l.jour),SV.nombre(l.besoin),SV.nombre(l.presents)]),
        // Correction 17 (a) : chaque ligne dit son jour, et porte sa propre fin et ses propres heures sup.
        mots:ls.map(l=>l.mot),jours:[...document.querySelectorAll('#bilan-journee .sy-table tbody tr')].map(tr=>(tr.querySelector('.sy-jour')||{}).textContent||null),
        cases:[...document.querySelectorAll('#bilan-journee .sy-table tbody tr')].map(tr=>tr.cells.length),
        sup:ls.map(l=>(l.fin&&l.fin.heuresSup.total>1e-9?D(l.fin.heuresSup.total):'—')),
        supLu:[...document.querySelectorAll('#bilan-journee .sy-table tbody tr')].map(tr=>tr.cells[10].textContent),
        tete:[...document.querySelectorAll('#bilan-journee .sy-tete .bilan-resume')].map(p=>p.textContent),
        lignes:[...document.querySelectorAll('#bilan-journee .sy-table tbody tr')].map(tr=>[tr.dataset.service,tr.dataset.jour,tr.cells[1].textContent,tr.cells[2].textContent])};});
    assert.deepEqual(lu.tete,lu.phrases,V+'les phrases en tête');
    assert.ok(lu.lignes.length>=5,V+'les services');
    assert.deepEqual(lu.lignes,lu.attendu,V+'besoin et présents, ligne par ligne, dans l’ordre du chemin');
    assert.deepEqual(lu.jours,lu.mots,V+'chaque ligne dit son jour');
    assert.ok(lu.mots.some(m=>m==='veille'),V+'la cuisine fictive travaille la veille');
    assert.ok(lu.cases.every(n=>n===11),V+'onze cases par ligne : plus de case partagée entre deux jours');
    assert.deepEqual(lu.supLu,lu.sup,V+'les heures sup de chaque ligne');

    // 2. La largeur : le tableau tient, les cartes occupent la ligne entière.
    const place=await page.evaluate(()=>{const c=document.querySelector('.sy-cadre'),g=document.querySelector('.sy-cartes'),cs=[...g.children];
      return {deborde:c.scrollWidth-c.clientWidth,cartes:cs.reduce((n,x)=>n+x.getBoundingClientRect().width,0),ligne:g.getBoundingClientRect().width,n:cs.length,
        courbe:document.querySelector('.sy-trace svg').getBoundingClientRect().width,bloc:document.querySelector('.sy-trace').getBoundingClientRect().width};});
    assert.ok(place.deborde<=1,V+'le tableau tient sans défiler ('+place.deborde+' px de trop)');
    assert.ok(place.cartes>place.ligne*0.95,V+'les cartes remplissent la ligne : '+JSON.stringify(place));
    assert.ok(Math.abs(place.courbe-place.bloc)<=2,V+'la courbe à la largeur de son bloc');

    // 3. La courbe : sa bulle suit la souris, puis les flèches.
    const svg=page.locator('#bilan-journee .sy-trace svg');
    await svg.scrollIntoViewIfNeeded();const b=await svg.boundingBox();
    await page.mouse.move(b.x+b.width/2,b.y+40);await attendre(100);
    const bulle1=await page.locator('#sy-bulle').textContent();
    assert.match(bulle1,/^\S+–\S+ : \d+ présents?, [\d,]+ au travail, \d+ lots? en file/,V+'la bulle : '+bulle1);
    await page.locator('#bilan-journee .sy-trace').focus();await page.keyboard.press('ArrowRight');await attendre(100);
    assert.notEqual(await page.locator('#sy-bulle').textContent(),bulle1,V+'la flèche avance d’un créneau');

    // 4. Pas d'essai : pas de carte « Ce que change l'essai ».
    assert.equal(await page.locator('#bilan-journee .sy-carte[aria-label="Ce que change l’essai"]').count(),0,V+'sans essais');

    // 5. Un clic sur une ligne ouvre ce service dans le planning, déplié, à la vue.
    const service=await page.locator('#bilan-journee .sy-table tbody tr').nth(2).getAttribute('data-service');
    await page.locator('#bilan-journee .sy-table tbody tr').nth(2).locator('td').first().click();await attendre(500);
    assert.equal(await page.evaluate(()=>document.body.dataset.sous),'at-planning',V+'le planning des équipes');
    const g=page.locator(`#at-planning .pg-groupe[data-service="${service}"]`);
    assert.match(await g.getAttribute('class'),/\bpg-vise\b/,V+'le service visé est marqué');
    assert.equal(await g.evaluate(x=>x.classList.contains('replie')),false,V+'déplié');
    const vu=await g.evaluate(x=>{const r=x.getBoundingClientRect();return r.top>=0&&r.top<innerHeight;});
    assert.ok(vu,V+'à la vue');

    // 6. Deux essais retenus : la carte de l'essai apparaît, B − A.
    await nav.aller(page,'j-comparer');await page.locator('#snap-a').click();await attendre();
    await page.evaluate(()=>Sim.seuils.enregistrer({attenteLot:600}));
    await page.evaluate(()=>Sim.ateliers.changer(()=>{const a=Sim.ateliers.state.ateliers.find(x=>x.id==='mo');a.personnes=(a.personnes||0)+2;},''));await attendre();
    await nav.aller(page,'j-comparer');await page.locator('#snap-b').click();await attendre();
    await nav.aller(page,'j-chiffres');await attendre();
    const essai=page.locator('#bilan-journee .sy-carte[aria-label="Ce que change l’essai"]');
    assert.equal(await essai.count(),1,V+'avec deux essais');
    assert.match(await essai.innerText(),/Il faut .*personnes ;[\s\S]*Goulot : [\s\S]*Heures sup : [\s\S]*En retard : /,V+'les quatre réponses');
    assert.equal(await page.locator('#bilan-journee .sy-carte[aria-label="Où ça coince"] .sy-grand').textContent(),'Rien ne coince.',V+'au seuil de 600 min, rien ne coince');
    await page.evaluate(()=>localStorage.removeItem('ory-seuils-v1'));
    assert.deepEqual(errors,[],V+errors.join(' | '));
   }finally{ch.effacer();await page.close();}
  }

  // 7. Une journée sans retard : aucune couleur critique.
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const ch=await F.charger(page,nav,site.url('index.html'),{pageId:'j-chiffres',csv:F.volsSansRetardCsv()});
  try{
   assert.deepEqual(await page.evaluate(()=>Sim.reponses().exceptions),[],'la journée n’a pas de retard');
   assert.match(await page.locator('#bilan-journee .sy-tete').innerText(),/rien ne part en retard\./);
   assert.equal(await page.locator('#bilan-journee .sy-carte[aria-label="Ce qui part en retard"] .sy-grand').textContent(),'Rien.');
   assert.deepEqual(await critiques(page),[],'aucune couleur critique');
   assert.deepEqual(errors,[],errors.join(' | '));
  }finally{ch.effacer();await page.close();}
  console.log('synthese-questions-browser : ok — chiffres du module, largeur, courbe, clic vers le planning, carte de l’essai, journée sans retard sans rouge.');
 }catch(e){console.error(e);process.exitCode=1;}finally{site.effacer();await browser.close();}
})();

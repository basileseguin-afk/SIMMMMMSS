/* Évolution 14 (a) — le plan rejoué : le cadrage et les commandes. Sur un plan
 * et des vols fictifs (tests/plan-rejoue-fictif.cjs), à 1 280 et 1 920 px de
 * large, sans fond de plan et avec une tuile fictive (tests/plan-fictif.cjs) :
 *   1. à l'ouverture, l'heure rejouée est le pic de travail (calculé hors de la
 *      page, par les mêmes modules) ; le plan entier tient dans la zone visible,
 *      à 24 px des bords ; après un zoom, « Tout voir » le refait tenir ;
 *      « Cadrer » cadre le service choisi ;
 *   2. aucun texte du plan sous 11 px ; les noms entre 12 et 16 px à tout zoom ;
 *      les sous-titres seulement quand ils se lisent ;
 *   3. la bande des chiffres est au-dessus du plan et ne recouvre aucune zone ;
 *      ses chiffres sont cumulés jusqu'à l'heure rejouée, jamais « — » ; la
 *      légende des quatre états à droite ;
 *   4. une seule barre de commandes, en bas, dans l'ordre : lecture, pas à pas,
 *      recommencer, l'heure, le curseur (jours et départs marqués), la vitesse,
 *      le zoom ; en haut à gauche, « Voir un service » et « Liens » seulement ;
 *   5. l'heure choisie reste tant que la journée ne change pas ; un autre
 *      programme de vols ouvre sur son propre pic ;
 *   6. « Fond de plan » ne s'affiche que s'il y a un fond.
 * Aucune capture ici (les captures de contrôle sont dans l'évolution 14 e). */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {siteAvecPlanFictif,siteSansPlan}=require('./plan-fictif.cjs');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const sauvegarde=F.sauvegardeFictive(),CSV=F.volsCsv(),CSV2=F.volsCsv(-120);
const pic=F.heureDuPicAttendue(sauvegarde,CSV),pic2=F.heureDuPicAttendue(sauvegarde,CSV2);

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const sans=siteSansPlan(),fictif=siteAvecPlanFictif();
 try{
  for(const [largeur,hauteur] of [[1280,800],[1920,1080]])for(const [site,url] of [['sans fond',sans.url],['avec une tuile fictive',fictif.url]]){
   const V=largeur+' px, '+site+' : ';
   const page=await browser.newPage({viewport:{width:largeur,height:hauteur}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   const attendre=(ms=200)=>page.waitForTimeout(ms);
   const ch=await F.charger(page,nav,url('index.html'),{sauvegarde,csv:CSV});
   try{
    // 1. L'heure d'ouverture : le pic de travail.
    assert.ok(pic.personnes>0&&pic2.t!==pic.t,'deux programmes, deux pics');
    assert.equal(await page.evaluate(()=>Sim.vue.t),pic.t,V+'à l’ouverture, le créneau où le plus de personnes sont au travail');

    // Le plan entier tient, à 24 px des bords.
    const geometrie=()=>page.evaluate(()=>{
      const s=document.getElementById('plan').getBoundingClientRect();
      const zones=[...document.querySelectorAll('#plan .zone')].filter(g=>g.style.display!=='none').map(g=>{const b=g.querySelector('.fond').getBoundingClientRect();return {id:g.dataset.id,x:b.left,y:b.top,droite:b.right,bas:b.bottom};});
      // Le plan entier : les zones, et le fond quand il est affiché.
      const c=document.getElementById('fond-plan'),fond=c.checked&&!c.disabled&&!document.getElementById('plan').classList.contains('sans-fond')
        ?[...document.querySelectorAll('#plan-fond image')].map(i=>{const b=i.getBoundingClientRect();return {x:b.left,y:b.top,droite:b.right,bas:b.bottom};}):[];
      return {svg:{x:s.left,y:s.top,droite:s.right,bas:s.bottom,w:s.width,h:s.height},zones,tout:zones.concat(fond)};});
    const tientTout=async quoi=>{
      const g=await geometrie();
      assert.ok(g.zones.length>=10,V+'les zones du plan fictif');
      const x=Math.min(...g.tout.map(z=>z.x)),y=Math.min(...g.tout.map(z=>z.y)),d=Math.max(...g.tout.map(z=>z.droite)),b=Math.max(...g.tout.map(z=>z.bas));
      const marges=[x-g.svg.x,y-g.svg.y,g.svg.droite-d,g.svg.bas-b].map(m=>Math.round(m*10)/10);
      assert.ok(marges.every(m=>m>=23),V+quoi+' : le plan entier tient, à 24 px des bords ('+marges.join(', ')+')');
      assert.ok(Math.min(marges[0]+marges[2],marges[1]+marges[3])<=48+3,V+quoi+' : et aussi grand que possible ('+marges.join(', ')+')');
    };
    await tientTout('à l’ouverture');
    for(let i=0;i<3;i++){await page.locator('#zoom-in').click();await attendre(80);}
    const zoome=await page.locator('#zoom-val').textContent();
    await page.locator('#zoom-reset').click();await attendre();
    assert.notEqual(await page.locator('#zoom-val').textContent(),zoome);
    await tientTout('après « Tout voir »');
    // « Cadrer » : le service choisi dans « Voir un service ».
    await page.selectOption('#zone-picker','prepa');await attendre();
    await page.locator('#zoom-fit').click();await attendre();
    const cadre=await page.evaluate(()=>{const s=document.getElementById('plan').getBoundingClientRect(),b=document.querySelector('#plan .zone[data-id=prepa] .fond').getBoundingClientRect();
      return [b.left-s.left,b.top-s.top,s.right-b.right,s.bottom-b.bottom].map(m=>Math.round(m*10)/10);});
    assert.ok(cadre.every(m=>m>=23)&&Math.min(cadre[0]+cadre[2],cadre[1]+cadre[3])<=51,V+'« Cadrer » cadre le service choisi ('+cadre.join(', ')+')');

    // 2. Les textes du plan : aucun sous 11 px ; les noms entre 12 et 16 px, à tout zoom.
    const textes=()=>page.evaluate(()=>[...document.querySelectorAll('#plan text')].filter(t=>t.getBoundingClientRect().width>0)
      .map(t=>({cls:t.getAttribute('class')||'',px:parseFloat(getComputedStyle(t).fontSize)*t.getScreenCTM().a,txt:t.textContent})));
    for(const [geste,quoi] of [['#zoom-reset','vue d’ensemble'],['#zoom-fit','service cadré']]){
      await page.locator(geste).click();await attendre();
      for(let i=0;i<=4;i++){
        const t=await textes(),petits=t.filter(x=>x.px<11-0.01);
        assert.deepEqual(petits,[],V+quoi+', zoom '+i+' : aucun texte sous 11 px');
        const noms=t.filter(x=>/\btitre\b/.test(x.cls));
        assert.ok(noms.length&&noms.every(x=>x.px>=12-0.01&&x.px<=16+0.01),V+quoi+', zoom '+i+' : les noms entre 12 et 16 px ('+[...new Set(noms.map(x=>x.px.toFixed(1)))].join(', ')+')');
        await page.locator('#zoom-in').click();await attendre(60);
      }
    }
    // Les sous-titres : cachés de loin, lus de près.
    await page.locator('#zoom-reset').click();await attendre();
    const sousLoin=(await textes()).filter(x=>/\bsous\b/.test(x.cls)).length;
    await page.locator('#zoom-fit').click();await attendre();
    for(let i=0;i<4;i++){await page.locator('#zoom-in').click();await attendre(60);}
    const sousPres=(await textes()).filter(x=>/\bsous\b/.test(x.cls));
    assert.equal(sousLoin,0,V+'de loin, pas de sous-titre illisible');
    assert.ok(sousPres.length>0&&sousPres.every(x=>x.px>=11-0.01&&x.px<=13+0.01),V+'de près, les sous-titres se lisent');
    await page.locator('#zoom-reset').click();await attendre();

    // 3. La bande des chiffres : au-dessus du plan, sur aucune zone ; cumulée ; la légende à droite.
    const bande=await page.evaluate(()=>{const b=document.getElementById('plan-bande').getBoundingClientRect(),s=document.getElementById('plan').getBoundingClientRect(),
      l=document.getElementById('legende-plan').getBoundingClientRect(),t=document.getElementById('plan-bande-texte').getBoundingClientRect();
      return {bas:b.bottom,haut:b.top,h:b.height,svgHaut:s.top,legende:l.left,texte:t.left,texteBas:t.bottom,texteHaut:t.top};});
    assert.ok(bande.bas<=bande.svgHaut+0.5,V+'la bande est au-dessus du plan');
    const g=await geometrie();
    assert.ok(g.zones.every(z=>z.y>=bande.bas),V+'elle ne recouvre aucune zone');
    assert.ok(bande.legende>bande.texte,V+'la légende à droite');
    assert.ok(bande.h<=48,V+'une ligne ('+bande.h+' px)');
    assert.equal(await page.locator('.plan-kpi').count(),0,V+'plus d’encart sur le plan');
    const texte=await page.locator('#plan-bande-texte').innerText();
    assert.match(texte,/commandes prêtes jusqu’ici : \d+ sur \d+/,V+texte);
    assert.doesNotMatch(texte,/—/);
    const legende=await page.locator('#legende-plan').textContent();
    for(const e of ['Au travail','Attend le service d’avant','A fini','Pas commencé'])assert.ok(legende.includes(e),V+'la légende dit « '+e+' »');
    // Cumulés : en fin de journée, toutes les commandes sont comptées ; au début, aucune.
    await page.evaluate(()=>Sim.vue.allerA(Sim.vue.fin));await attendre();
    const n=await page.evaluate(()=>Object.values(Sim.ateliers.resultat.parClasse).filter(c=>!c.absente).length);
    assert.match(await page.locator('#plan-bande-texte').innerText(),new RegExp('commandes prêtes jusqu’ici : '+n+' sur '+n),V+'en fin de journée, toutes');
    await page.evaluate(()=>Sim.vue.allerA(Sim.vue.debut+1));await attendre();
    assert.match(await page.locator('#plan-bande-texte').innerText(),new RegExp('commandes prêtes jusqu’ici : 0 sur '+n),V+'au début, aucune');

    // 4. Une seule barre de commandes, en bas, dans l'ordre ; en haut à gauche, deux choix.
    const ordre=['#btn-play','#sim-pas','#btn-reset','#horloge','#sim-curseur','#vitesse','#zoom-out','#zoom-val','#zoom-in','#zoom-fit','#zoom-reset'];
    const barre=await page.evaluate(ids=>{const l=document.getElementById('lecteur'),s=document.getElementById('plan').getBoundingClientRect();
      return {dans:ids.map(i=>l.contains(document.querySelector(i))),x:ids.map(i=>document.querySelector(i).getBoundingClientRect().left),
        haut:l.getBoundingClientRect().top,svgBas:s.bottom,lignes:new Set(ids.map(i=>Math.round(document.querySelector(i).getBoundingClientRect().top/20))).size};},ordre);
    assert.ok(barre.dans.every(Boolean),V+'tout est dans la barre du bas');
    assert.ok(barre.x.every((x,i)=>!i||x>barre.x[i-1]),V+'dans l’ordre : '+barre.x.map(Math.round).join(' < '));
    assert.ok(barre.haut>=barre.svgBas-1,V+'la barre est sous le plan');
    for(const id of ordre)assert.equal(await page.locator(id).isVisible(),true,V+id+' visible');
    const tete=await page.evaluate(()=>{const t=document.querySelector('.plan-tete'),e=document.getElementById('btn-edit').getBoundingClientRect(),milieu=t.getBoundingClientRect().left+t.getBoundingClientRect().width/2;
      return [...t.children].filter(c=>c.getBoundingClientRect().width>0&&c.getBoundingClientRect().right<milieu).map(c=>c.className);});
    assert.deepEqual(tete,['zone-picker','fc-map-filter'],V+'en haut à gauche : « Voir un service » et « Liens »');
    assert.match(await page.locator('.fc-map-filter').innerText(),/^Liens/);
    // Les repères du curseur : les jours et les départs.
    // Un repère par heure de départ dans la journée relue (un départ après la dernière fin n'a pas de place sur le curseur).
    const departs=await page.evaluate(()=>new Set(Sim.dataCourante.filter(f=>f.sens==='DEP'&&f.std>=Sim.vue.debut&&f.std<=Sim.vue.fin).map(f=>f.std)).size);
    assert.ok(departs>=10);
    assert.equal(await page.locator('#lecteur .pr-depart').count(),departs,V+'un repère par heure de départ');
    assert.ok(await page.locator('#lecteur .pr-jour').count()>=1,V+'les jours marqués');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,V+'sans débord');

    // 5. L'heure choisie reste tant que la journée ne change pas.
    const choisie=Math.round((pic.t+await page.evaluate(()=>Sim.vue.fin))/2);
    await page.evaluate(t=>Sim.vue.allerA(t),choisie);await attendre();
    await page.evaluate(()=>Sim.ateliers.rendre());await attendre();
    assert.equal(await page.evaluate(()=>Sim.vue.t),choisie,V+'un recalcul de la même journée garde l’heure');
    await F.importerVols(page,nav,ch.fichier,'vols-plus-tard.csv',CSV2);await nav.aller(page,'j-plan');await attendre(300);
    assert.equal(await page.evaluate(()=>Sim.vue.t),pic2.t,V+'un autre programme : son propre pic');
    await tientTout('après un autre programme');

    // 6. « Fond de plan » : seulement s'il y a un fond.
    const fond=await page.evaluate(()=>{const c=document.getElementById('fond-plan'),l=c.closest('label');return {visible:l.getBoundingClientRect().width>0,texte:l.textContent.trim(),coche:c.checked};});
    if(site==='sans fond')assert.equal(fond.visible,false,V+'sans fond, pas de case');
    else assert.deepEqual(fond,{visible:true,texte:'Fond de plan',coche:true},V+'avec un fond, « Fond de plan »');

    assert.deepEqual(errors,[],V+errors.join(' | '));
   }finally{ch.effacer();await page.close();}
  }
  console.log('plan-rejoue-browser : ok (1 280 et 1 920 px, sans fond et avec une tuile fictive)');
 }catch(e){console.error(e);process.exitCode=1;}finally{sans.effacer();fictif.effacer();await browser.close();}
})();

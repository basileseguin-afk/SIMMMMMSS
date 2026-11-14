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
      const ls=SV.lignes(rep,OrlyPlanningVue.ordreDesServices(Sim.ateliers.resultat,Sim.ateliers.args.parcours)),D=MoteurProduction.dureeLisible;
      // Correction 17 (c) : un poste fixe écrit « fixe » ; un service qui en a à côté de son besoin les dit ; un handling compte ses chauffeurs.
      // Correction 18 (a) : une ligne dont le besoin ne se mesure pas écrit « non mesuré ».
      const hors=l=>{const nm=l.nonMesures>1e-9,fx=l.fixes-(l.nonMesures||0)>1e-9,p=l.fixes>=2;return nm&&fx?' fixes ou non mesurés':nm?(p?' non mesurés':' non mesuré'):(p?' fixes':' fixe');};
      const besoin=l=>l.fixe?'fixe':l.nonMesure?'non mesuré':SV.nombre(l.besoin)+(l.fixes>1e-9?'+ '+SV.nombre(l.fixes)+hors(l):'');
      return {phrases:SV.phrases(rep),attendu:ls.map(l=>[l.service,String(l.jour),besoin(l),SV.nombre(l.presents)+(l.chauffeurs?'chauffeurs':'')]),
        // Correction 17 (a) : chaque ligne dit son jour, et porte sa propre fin et ses propres heures sup.
        mots:ls.map(l=>l.mot),jours:[...document.querySelectorAll('#bilan-journee .sy-table tbody tr')].map(tr=>(tr.querySelector('.sy-jour')||{}).textContent||null),
        cases:[...document.querySelectorAll('#bilan-journee .sy-table tbody tr')].map(tr=>tr.cells.length),
        // Correction 18 (retouches) : les heures sup se lisent sous la fin, dans la même case ; l'équipe qui dépasse y est nommée.
        sup:ls.map(l=>(l.fin&&l.fin.heuresSup.total>1e-9?'heures sup '+D(l.fin.heuresSup.total):null)),
        supLu:[...document.querySelectorAll('#bilan-journee .sy-table tbody tr')].map(tr=>(tr.cells[10].querySelector('.sy-hs')||{}).textContent||null),
        depasse:ls.map(l=>(l.fin&&l.fin.equipeQuiDepasse?'l’équipe '+l.fin.equipeQuiDepasse.nom+' finit à '+MoteurProduction.hhmm(l.fin.equipeQuiDepasse.fin)+' pour '+MoteurProduction.hhmm(l.fin.equipeQuiDepasse.finHoraire):null)),
        depasseLu:[...document.querySelectorAll('#bilan-journee .sy-table tbody tr')].map(tr=>(tr.cells[10].querySelector('.sy-depasse')||{}).textContent||null),
        tete:[...document.querySelectorAll('#bilan-journee .sy-tete .bilan-resume')].map(p=>p.textContent),
        lignes:[...document.querySelectorAll('#bilan-journee .sy-table tbody tr')].map(tr=>[tr.dataset.service,tr.dataset.jour,tr.cells[1].textContent,tr.cells[2].textContent])};});
    assert.deepEqual(lu.tete,lu.phrases,V+'les phrases en tête');
    assert.ok(lu.lignes.length>=5,V+'les services');
    assert.deepEqual(lu.lignes,lu.attendu,V+'besoin et présents, ligne par ligne, dans l’ordre du chemin');
    assert.deepEqual(lu.jours,lu.mots,V+'chaque ligne dit son jour');
    assert.ok(lu.mots.some(m=>m==='veille'),V+'la cuisine fictive travaille la veille');
    assert.ok(lu.cases.every(n=>n===11),V+'onze cases par ligne (correction 18 : deux colonnes à la place de « File la plus longue », les heures sup sous la fin) ; aucune case partagée entre deux jours');
    assert.deepEqual(lu.supLu,lu.sup,V+'les heures sup de chaque ligne, sous sa fin');
    assert.deepEqual(lu.depasseLu,lu.depasse,V+'l’équipe qui dépasse, nommée avec sa fin et son horaire');

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
    assert.match(bulle1,/^\S+–\S+ : \d+ présents?, [\d,]+ au travail, \d+ lots? à faire/,V+'la bulle : '+bulle1);
    await page.locator('#bilan-journee .sy-trace').focus();await page.keyboard.press('ArrowRight');await attendre(100);
    assert.notEqual(await page.locator('#sy-bulle').textContent(),bulle1,V+'la flèche avance d’un créneau');

    // 4. Pas d'essai : pas de carte « Ce que change l'essai ».
    assert.equal(await page.locator('#bilan-journee .sy-carte[aria-label="Ce que change l’essai"]').count(),0,V+'sans essais');

    // 4 bis. Correction 17 (c) : des lignes qui disent vrai.
    const vrai=await page.evaluate(()=>{const rep=Sim.reponses(),rangs=[...document.querySelectorAll('#bilan-journee .sy-table tbody tr')];
      const c=(l,i)=>rangs.find(tr=>tr.dataset.service===l.service&&tr.dataset.jour===String(l.jour)).cells[i];
      const fixe=rep.personnes.services.find(x=>x.fixe&&x.presents>0),sur=rep.personnes.services.find(x=>x.sens==='sur'&&x.ecart>=rep.seuils.ecartPersonnes),ch=rep.personnes.services.find(x=>x.chauffeurs);
      return {total:rep.personnes.total,seuils:rep.seuils,goulot:rep.coince.goulot,
        fixe:[c(fixe,1).textContent,c(fixe,3).textContent,c(fixe,3).dataset.ton||null],
        sur:[c(sur,3).dataset.ton||null,!!c(sur,3).querySelector('.sy-ecart-barre i'),c(sur,3).querySelector('.sy-v').textContent],
        chauffeurs:[c(ch,1).textContent,c(ch,2).querySelector('small').textContent,ch.horsCompte],
        notes:[...document.querySelectorAll('#bilan-journee .sy-note')].map(x=>x.textContent),
        legende:document.querySelector('#bilan-journee .sy-legende').textContent,
        carte:document.querySelector('#bilan-journee .sy-carte[aria-label="Où ça coince"]').innerText};});
    assert.ok(vrai.total.fixes>0,V+'l’unité fictive a des postes fixes');
    assert.match(lu.tete[0],/^Il faut \d+ personnes?, [\d,]+ sont présentes, dont [\d,]+ en postes fixes ou non mesurés\.$/,V+'la phrase de tête dit les postes fixes et les besoins non mesurés');
    assert.deepEqual(vrai.fixe,['fixe','—',null],V+'un poste fixe : « fixe », pas d’écart');
    assert.deepEqual(vrai.sur.slice(0,2),[null,true],V+'un surplus de '+vrai.sur[2]+' : sans couleur d’alerte, avec sa barre');
    assert.deepEqual(vrai.chauffeurs.slice(0,2),['fixe','chauffeurs'],V+'le handling : ses chauffeurs');
    assert.ok(vrai.chauffeurs[2]>0&&vrai.notes.length===1,V+'une note pour ce qui n’est pas compté');
    assert.match(vrai.notes[0],/ : les présents sont ses chauffeurs ; les \d+ personnes saisies à l’équipe ne sont pas comptées\.$/,V+'la note');
    assert.match(vrai.legende,/il manque au moins 3 personnes \(un surplus n’est pas une alerte\), un arrivage qui attend plus de 6 h 00/,V+'la légende dit les seuils par défaut');
    assert.deepEqual([vrai.seuils.attenteLot,vrai.seuils.ecartPersonnes],[360,3],V+'les défauts');

    // 4 ter. Correction 18 (a) : des attentes qui disent vrai.
    const att=await page.evaluate(()=>{const rep=Sim.reponses(),rangs=[...document.querySelectorAll('#bilan-journee .sy-table tbody tr')];
      const rang=l=>rangs.find(tr=>tr.dataset.service===l.service&&tr.dataset.jour===String(l.jour)),D=MoteurProduction.dureeLisible;
      const sans=rep.sansTravail.services.filter(x=>x.minutes!=null&&rang(x)),arr=rep.coince.services.filter(x=>x.arrivages!=null&&rang(x));
      return {tetes:[...document.querySelectorAll('#bilan-journee .sy-table thead th')].map(th=>th.textContent),
        sans:sans.map(x=>{const td=rang(x).cells[8];return {attendu:D(x.minutes),part:Math.round(x.part*100)+' %',texte:td.textContent,titre:td.title,ton:td.dataset.ton||null,barre:!!td.querySelector('.sy-sans-barre i')};}),
        arr:arr.map(x=>{const td=rang(x).cells[9];return {n:x.arrivages,max:x.attenteMax?D(x.attenteMax.minutes):null,texte:td.textContent,ton:td.dataset.ton||null};}),
        goulots:rep.coince.goulots.map(g=>({nom:g.nom,depasse:g.depasse,enRetard:g.enRetard,lendemain:g.lendemain?g.lendemain.vols:0})),
        carte:document.querySelector('#bilan-journee .sy-carte[aria-label="Où ça coince"]').innerText,
        notes:[...document.querySelectorAll('#bilan-journee .sy-explique-occ')].map(x=>x.textContent),texte:document.getElementById('bilan-journee').innerText};});
    assert.deepEqual(att.tetes,['Service','Besoin','Présents','Écart','Matin','Après-midi','Pic au travail','Occupation','Personnes sans travail','Attente d’un arrivage','Fin et heures sup'],V+'les colonnes');
    assert.ok(att.sans.length>=5,V+'des lignes avec des personnes sans travail');
    for(const x of att.sans){
     assert.ok(x.texte.includes(x.attendu)&&x.texte.includes(x.part)&&x.barre,V+'les heures, la part et la barre : '+JSON.stringify(x));
     assert.equal(x.ton,null,V+'sans couleur d’alerte');
     assert.match(x.titre,/avant le premier lot : .* ; entre deux lots : .* ; après le dernier lot : /,V+'au survol, les trois moments');
    }
    assert.ok(att.arr.length>=4,V+'des lignes avec des arrivages');
    for(const x of att.arr){
     assert.ok(x.texte.startsWith(x.n+(x.n>=2?' arrivages':' arrivage')),V+'le nombre d’arrivages : '+JSON.stringify(x));
     assert.ok(x.max?x.texte.includes(x.max):x.texte.endsWith('—'),V+'l’attente la plus longue, ou « — » : '+JSON.stringify(x));
     assert.equal(x.ton,null,V+'aucun arrivage n’attend plus de 6 h : pas de couleur');
    }
    assert.ok(att.notes.some(n=>n==='Occupation : la part du temps de présence couverte par le travail du barème. Elle dépend des temps par vol et des effectifs réglés.'),V+'l’occupation s’explique sous le tableau');
    // Les mots : jamais « un lot attend » pour un lot simplement à faire, plus de « file la plus longue ».
    assert.doesNotMatch(att.texte,/un lot (y )?attend|File la plus longue|lots en file/i,V+'les mots');
    // « Où ça coince », sur les conséquences : avec ses départs en retard, l'unité fictive coince ; la carte en montre trois au plus.
    // Sa plonge laisse 2 vols à laver le lendemain, que l'équipe du matin lave pendant sa présence : un reste normal, qui ne la
    // fait pas coincer (correction 19 b ; avec l'évolution 18, elle coinçait aussi, la dernière, pour ces 2 vols).
    assert.ok(att.goulots.length>=1&&att.goulots.every(g=>g.depasse>=15||g.enRetard>0),V+'des goulots : '+JSON.stringify(att.goulots));
    assert.deepEqual(att.goulots.filter(g=>g.lendemain>0),[],V+'la plonge n’est pas un goulot : '+JSON.stringify(att.goulots));
    assert.ok(att.carte.includes(att.goulots[0].nom)&&/part(ent)? en retard par ses lots|après son horaire/.test(att.carte),V+'la carte nomme le goulot et dit pourquoi : '+att.carte);
    assert.ok(lu.tete[1].startsWith(att.goulots[0].nom),V+'la phrase de tête le nomme');
    assert.ok((await page.locator('#bilan-journee .sy-carte[aria-label="Où ça coince"] li').count())<=2,V+'trois services au plus');
    // Le seuil d'attente n'y change rien ; il colore l'attente d'un arrivage.
    await page.evaluate(()=>Sim.seuils.enregistrer({attenteLot:60}));await page.evaluate(()=>Sim.ateliers.changer(()=>{},''));await attendre(400);
    const une=await page.evaluate(()=>({goulots:Sim.reponses().coince.goulots.map(g=>g.nom),tons:[...document.querySelectorAll('#bilan-journee .sy-arrivage[data-ton="attente"]')].length,
      attendus:Sim.reponses().coince.services.filter(x=>x.attenteMax&&x.attenteMax.minutes>60).length}));
    assert.deepEqual(une.goulots,att.goulots.map(g=>g.nom),V+'au seuil d’une heure, les mêmes goulots');
    assert.ok(une.attendus>=1&&une.tons>=1,V+'un arrivage qui attend plus d’une heure est signalé : '+JSON.stringify(une));
    await page.evaluate(()=>localStorage.removeItem('ory-seuils-v1'));await page.evaluate(()=>Sim.ateliers.changer(()=>{},''));await attendre(400);

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
    await page.evaluate(()=>Sim.ateliers.changer(()=>{const a=Sim.ateliers.state.ateliers.find(x=>x.id==='mo');a.personnes=(a.personnes||0)+2;},''));await attendre();
    await nav.aller(page,'j-comparer');await page.locator('#snap-b').click();await attendre();
    await nav.aller(page,'j-chiffres');await attendre();
    const essai=page.locator('#bilan-journee .sy-carte[aria-label="Ce que change l’essai"]');
    assert.equal(await essai.count(),1,V+'avec deux essais');
    assert.match(await essai.innerText(),/Il faut .*personnes ;[\s\S]*Goulot : [\s\S]*Heures sup : [\s\S]*En retard : /,V+'les quatre réponses');
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
   // Sans retard ni dépassement d'un quart d'heure, rien ne coince (correction 18 a). La plonge laisse 5 vols à laver le
   // lendemain, que l'équipe du matin lave pendant sa présence : un reste normal — sur sa ligne, sans couleur d'alerte ; la
   // carte et la phrase de tête ne la citent pas (correction 19 b ; avec l'évolution 18, elle en coinçait : « laisse 5 vols à
   // laver le lendemain » après la correction 19 a, 6 vols et 3 h 20 avant elle).
   assert.deepEqual(await page.evaluate(()=>{const r=Sim.reponses();return [r.coince.goulots.length,r.plonge.lendemain];}),[0,{vols:5,minutes:180,absorbe:true}]);
   assert.equal(await page.locator('#bilan-journee .sy-carte[aria-label="Où ça coince"] .sy-grand').textContent(),'Rien ne coince.');
   assert.match(await page.locator('#bilan-journee .sy-tete').innerText(),/Rien ne coince ; rien ne part en retard\./);
   assert.match(await page.locator('#bilan-journee .sy-table tr[data-service="plonge"] td.sy-fin .sy-lendemain').textContent(),/^reste à laver le lendemain : 5 vols \(3 h 00 de lavage\)$/);
   assert.equal(await page.locator('#bilan-journee .sy-table tr[data-service="plonge"] td.sy-fin').getAttribute('data-ton'),null,'le reste s’affiche sans couleur d’alerte');
   assert.doesNotMatch(await page.locator('#bilan-journee .sy-table tr[data-service="plonge"] td.sy-fin').textContent(),/à signaler/);
   assert.deepEqual(await critiques(page),[],'aucune couleur critique');
   // 8. Correction 17 (c) : l'écart ne prend la couleur de statut que s'il manque des personnes. Le montage garde 1 personne
   // (ni seconde équipe, ni robot) : il lui en manque plus d'une, au seuil de 1 → sa case se colore ; les surplus du tableau
   // restent sans couleur.
   await page.evaluate(()=>Sim.seuils.enregistrer({ecartPersonnes:1}));
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const de=id=>Sim.ateliers.state.ateliers.find(x=>x.id===id);de('mo').personnes=1;de('mo2').personnes=0;de('rb').personnes=0;},''));await page.waitForTimeout(500);
   const ecarts=await page.evaluate(()=>{const rangs=[...document.querySelectorAll('#bilan-journee .sy-table tbody tr')];
     return Sim.reponses().personnes.services.filter(x=>!x.fixe).map(x=>{const tr=rangs.find(t=>t.dataset.service===x.service&&t.dataset.jour===String(x.jour));
       return tr?{service:x.service,sens:x.sens,ecart:x.ecart,ton:tr.cells[3].dataset.ton||null,mots:(tr.cells[3].querySelector('.sr-only')||{}).textContent||null}:null;}).filter(Boolean);});
   const manque=ecarts.find(x=>x.service==='prepa');
   assert.deepEqual([manque.sens,manque.ecart<=-1,manque.ton,manque.mots],['sous',true,'attente','au-delà du seuil : '],'un manque : la couleur de statut, une icône et des mots — '+JSON.stringify(manque));
   const surplus=ecarts.filter(x=>x.sens==='sur'&&x.ecart>=1);
   assert.ok(surplus.length>=1&&surplus.every(x=>x.ton===null),'un surplus : sans couleur d’alerte — '+JSON.stringify(surplus));
   await page.evaluate(()=>localStorage.removeItem('ory-seuils-v1'));
   assert.deepEqual(errors,[],errors.join(' | '));
  }finally{ch.effacer();await page.close();}
  console.log('synthese-questions-browser : ok — chiffres du module, largeur, courbe, clic vers le planning, carte de l’essai, journée sans retard sans rouge, postes fixes, chauffeurs, manque et surplus, personnes sans travail, attente d’un arrivage, goulot sur les conséquences.');
 }catch(e){console.error(e);process.exitCode=1;}finally{site.effacer();await browser.close();}
})();

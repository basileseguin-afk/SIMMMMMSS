/* Évolution 23 (f) — « Programme » et « Retours » : l'essentiel en un écran ; sur l'unité fictive et un programme daté
 * fictif de trente jours.
 *
 * Constat d'avant : après un import daté, le compte rendu écrivait le nombre de vols de chaque jour en une longue phrase,
 * et repoussait le tableau des vols sous l'écran.
 *   1. Le compte rendu tient en deux lignes : le fichier ; la période, le nombre de jours et de vols, la fourchette par
 *      jour. Le détail jour par jour est replié ; déplié, il porte les phrases d'avant.
 *   2. À 1 366 × 768, les six premiers vols du jour se voient sans défiler ; la fenêtre et la page ne défilent pas.
 *   3. Le tableau des vols du jour occupe le reste de l'écran et défile dans son cadre, en-tête figé.
 *   4. Un jour sans vol se lit sur la deuxième ligne, sans rien déplier ; un programme sans date garde sa phrase.
 *   5. « Retours » suit la même forme : la planche défile dans son cadre, en-tête figé ; ses six premières lignes se
 *      voient sans défiler.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 const ctx=await browser.newContext({viewport:{width:1366,height:768}});
 const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=300)=>page.waitForTimeout(ms);
 /** La page, mesurée : le compte rendu, le cadre du tableau, ses lignes, ce qui défile. `cadre`, `lignes` : leurs sélecteurs. */
 const mesure=(cadre,lignes)=>page.evaluate(([c,l])=>{const r=e=>e.getBoundingClientRect(),v=document.getElementById('view-vols'),k=document.querySelector(c),th=k.querySelector('thead th');
   const rapport=document.getElementById('import-report'),trs=[...document.querySelectorAll(l)];
   return {fenetre:document.scrollingElement.scrollHeight-innerHeight,page:v.scrollHeight-v.clientHeight,
     rapport:rapport&&rapport.getClientRects().length?Math.round(r(rapport).height):0,
     cadre:{haut:Math.round(r(k).top),bas:Math.round(r(k).bottom),reste:Math.round(innerHeight-r(k).bottom),defile:k.scrollHeight-k.clientHeight,position:k.scrollTop,largeur:Math.round(r(k).width),libre:Math.round(r(v).width)},
     entete:{haut:Math.round(r(th).top),bas:Math.round(r(th).bottom),fige:getComputedStyle(th).position},
     lignes:trs.length,vues:trs.filter(t=>r(t).top>=r(th).bottom-1&&r(t).bottom<=Math.min(innerHeight,r(k).bottom)+1).length,
     six:trs.slice(0,6).map(t=>[Math.round(r(t).top),Math.round(r(t).bottom)])};},[cadre,lignes]);
 const rapport=()=>page.evaluate(()=>{const b=document.getElementById('import-report'),vis=e=>e.getClientRects().length>0;
   const d=b.querySelector('details');
   return {lignes:[...b.querySelectorAll('.vp-cr-ligne')].map(p=>({texte:p.textContent,hauteur:Math.round(p.getBoundingClientRect().height),ligne:Math.round(parseFloat(getComputedStyle(p).lineHeight))})),
     alerte:(b.querySelector('.vp-cr-alerte')||{textContent:''}).textContent,repli:d?{titre:d.querySelector('summary').textContent,ouvert:d.open,phrases:[...d.querySelectorAll('p')].map(p=>p.textContent)}:null,
     erreur:b.classList.contains('error'),visible:b.innerText,taille:parseFloat(getComputedStyle(b).fontSize)};});
 try{
  const site=await F.charger(page,nav,URL_V1,{pageId:'j-chiffres'});
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.onglets);
  await attendre(400);
  await F.importerVols(page,nav,site.fichier,'vols-trente-jours.csv',F.volsDatesCsv(30,'2031-03-03'));
  await attendre(500);
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'v-programme');

  /* ---- 1. le compte rendu : deux lignes ; le détail jour par jour replié -------------------------------------------- */
  let cr=await rapport();
  assert.equal(cr.erreur,false);
  assert.equal(cr.lignes.length,2,'deux lignes');
  assert.equal(cr.lignes[0].texte,'« vols-trente-jours.csv ». Format reconnu : le CSV daté (un programme sur plusieurs jours).','la première : le fichier, et son format');
  assert.match(cr.lignes[1].texte,/^Du 03\/03\/2031 au 01\/04\/2031 : 30 jours, \d+ vols \(\d+ départs, \d+ retours\), (\d+|de \d+ à \d+) par jour\.$/,'la deuxième : la période, les jours, les vols, la fourchette par jour');
  const total=await page.evaluate(()=>({lignes:Sim.dataCourante.length,departs:Sim.dataCourante.filter(v=>v.sens==='DEP').length,retours:Sim.dataCourante.filter(v=>v.sens==='RET').length}));
  assert.ok(cr.lignes[1].texte.includes('30 jours, '+total.lignes+' vols ('+total.departs+' départs, '+total.retours+' retours)'),'ses nombres sont ceux du programme importé');
  for(const l of cr.lignes)assert.ok(l.hauteur<=l.ligne+2,'chaque ligne tient sur une ligne d’écran ('+l.hauteur+' px) : '+l.texte);
  assert.ok(cr.taille>=13,'le compte rendu fait 13 px au moins');
  // Le détail jour par jour : replié ; ce qui se voit ne porte aucun nombre par jour.
  assert.deepEqual([cr.repli.titre,cr.repli.ouvert],['Le détail jour par jour',false]);
  assert.doesNotMatch(cr.visible,/\d\d\/\d\d : \d+ · /,'replié : le jour par jour ne se voit pas');
  let m=await mesure('#vp-tableau .vp-cadre','#vp-tableau tbody tr');
  assert.ok(m.rapport<=100,'le compte rendu, replié, fait '+m.rapport+' px de haut (141 avant, pour trente jours)');
  // Déplié : les phrases d'avant, mot pour mot — les lignes importées, la période, un nombre par jour.
  await page.locator('#import-report .vp-cr-detail>summary').click();await attendre(150);
  cr=await rapport();
  assert.equal(cr.repli.ouvert,true);
  assert.equal(cr.repli.phrases[0],total.lignes+' lignes importées. '+total.departs+' départs et '+total.retours+' retours.');
  assert.equal(cr.repli.phrases[1],'Programme daté : du 03/03/2031 au 01/04/2031, 30 jours.');
  assert.match(cr.repli.phrases[2],/^Vols par jour : .* — 03\/03 : \d+ · 04\/03 : \d+ · /);
  assert.equal((cr.repli.phrases[2].match(/\d\d\/\d\d : \d+/g)||[]).length,30,'un nombre par jour, pour les trente jours');
  assert.match(cr.visible,/03\/03 : \d+ · 04\/03 : \d+/,'déplié : il se voit');
  // Même déplié, le tableau garde ses six vols à l'écran.
  m=await mesure('#vp-tableau .vp-cadre','#vp-tableau tbody tr');
  assert.ok(m.vues>=6&&m.fenetre<=0,'le détail déplié : encore '+m.vues+' vols à l’écran, la fenêtre ne défile pas');
  await page.locator('#import-report .vp-cr-detail>summary').click();await attendre(150);

  /* ---- 2. à 1 366 × 768, les six premiers vols du jour se voient sans défiler ---------------------------------------- */
  m=await mesure('#vp-tableau .vp-cadre','#vp-tableau tbody tr');
  const departs=await page.evaluate(()=>Sim.ateliers.a.vols().filter(v=>v.sens==='DEP').length);
  assert.equal(m.lignes,departs,'le tableau : les départs du jour ('+departs+')');
  assert.ok(departs>=12,'assez de vols pour que le tableau dépasse l’écran');
  assert.ok(m.fenetre<=0,'la fenêtre ne défile pas ('+m.fenetre+')');
  assert.ok(m.page<=1,'la page ne défile pas ('+m.page+')');
  assert.equal(m.cadre.position,0);
  assert.ok(m.vues>=6,'les six premiers vols du jour se voient sans défiler ('+m.vues+' à l’écran)');
  for(const [haut,bas] of m.six)assert.ok(haut>=m.entete.bas-1&&bas<=768,'un des six premiers vols, entre '+haut+' et '+bas+' px, est à l’écran');
  assert.deepEqual(await page.locator('#vp-tableau tbody tr').evaluateAll(t=>t.slice(0,6).map(x=>x.dataset.vol)),
    await page.evaluate(()=>Sim.ateliers.a.vols().filter(v=>v.sens==='DEP').sort((a,b)=>a.std-b.std||String(a.id).localeCompare(String(b.id))).slice(0,6).map(v=>String(v.id))),'ce sont les six premiers départs du jour');

  /* ---- 3. le tableau occupe le reste de l'écran et défile dans son cadre, en-tête figé ------------------------------ */
  assert.ok(m.cadre.defile>50,'le tableau est plus haut que son cadre : il y défile ('+m.cadre.defile+' px)');
  assert.ok(m.cadre.reste<=16&&m.cadre.reste>=0,'son cadre va jusqu’au bas de l’écran ('+m.cadre.reste+' px du bord)');
  assert.ok(m.cadre.largeur>=m.cadre.libre-52,'et prend la largeur de la page ('+m.cadre.largeur+' px sur '+m.cadre.libre+')');
  assert.equal(m.entete.fige,'sticky');
  await page.locator('#vp-tableau .vp-cadre').evaluate(k=>{k.scrollTop=k.scrollHeight;});await attendre(150);
  const bas=await mesure('#vp-tableau .vp-cadre','#vp-tableau tbody tr');
  assert.ok(bas.cadre.position>50,'le cadre a défilé');
  assert.deepEqual([bas.entete.haut,bas.fenetre<=0],[m.entete.haut,true],'l’en-tête reste en haut du cadre ; la fenêtre ne bouge pas');
  assert.equal(await page.locator('#vp-tableau tbody tr').last().evaluate((t,b)=>t.getBoundingClientRect().bottom<=b+1,bas.cadre.bas),true,'le dernier vol du jour se voit, en bas du cadre');
  await page.locator('#vp-tableau .vp-cadre').evaluate(k=>{k.scrollTop=0;});
  // La recherche, puis un autre jour : la page ne défile toujours pas.
  await page.locator('#periode-jour').selectOption('2031-03-20');await attendre(400);
  m=await mesure('#vp-tableau .vp-cadre','#vp-tableau tbody tr');
  assert.ok(m.fenetre<=0&&m.page<=1&&m.vues>=6,'un autre jour : six vols à l’écran, rien ne défile');
  // À 1 920 × 1 080 : de même, avec plus de vols à l'écran.
  await page.setViewportSize({width:1920,height:1080});await attendre(300);
  m=await mesure('#vp-tableau .vp-cadre','#vp-tableau tbody tr');
  // (Un tableau qui tient en entier ne s'étire pas : son cadre fait la hauteur de ses lignes.)
  assert.ok(m.fenetre<=0&&m.page<=1&&m.vues>=12&&(m.cadre.defile<=1?m.vues===m.lignes:m.cadre.reste<=16),'à 1 920 × 1 080 : '+m.vues+' vols à l’écran sur '+m.lignes+', rien ne défile hors du cadre');
  await page.setViewportSize({width:1366,height:768});await attendre(300);

  /* ---- 4. un jour sans vol, dit sans rien déplier ; un programme sans date ------------------------------------------- */
  await F.importerVols(page,nav,site.fichier,'vols-un-jour-manque.csv',F.volsDatesCsv(30,'2031-03-03',[9]));
  await attendre(400);
  cr=await rapport();
  assert.equal(cr.lignes.length,2);
  assert.match(cr.lignes[1].texte,/^Du 03\/03\/2031 au 01\/04\/2031 : 30 jours, \d+ vols .* par jour\. 1 jour sans vol : 12\/03\.$/);
  assert.equal(cr.alerte,'1 jour sans vol : 12/03.');
  assert.match(cr.visible,/1 jour sans vol : 12\/03\./,'le jour sans vol se lit sans rien déplier');
  assert.ok(cr.repli.phrases.includes('Aucun vol le 12/03 : jour sans vol ou oubli ?'),'et le détail garde la phrase d’avant');
  for(const l of cr.lignes)assert.ok(l.hauteur<=l.ligne+2,'toujours deux lignes d’écran');
  m=await mesure('#vp-tableau .vp-cadre','#vp-tableau tbody tr');
  assert.ok(m.vues>=6&&m.fenetre<=0&&m.page<=1);
  // Un programme sans date : le fichier, puis la phrase d'avant ; rien à replier ; pas de barre du jour.
  await F.importerVols(page,nav,site.fichier,'vols-sans-date.csv',F.volsCsv());
  await attendre(400);
  cr=await rapport();
  assert.deepEqual([cr.lignes.length,cr.repli],[2,null]);
  assert.equal(cr.lignes[0].texte,'« vols-sans-date.csv ». Format reconnu : le modèle CSV (les vols d’une journée).');
  assert.match(cr.lignes[1].texte,/^\d+ lignes importées\. \d+ départs et \d+ retours\.$/);
  m=await mesure('#vp-tableau .vp-cadre','#vp-tableau tbody tr');
  assert.ok(m.vues>=6&&m.fenetre<=0&&m.page<=1,'sans date : six vols à l’écran, rien ne défile');
  // Un fichier refusé : le refus se lit, et le tableau reste à l'écran.
  await page.locator('#imp-vols').setInputFiles({name:'pas-des-vols.csv',mimeType:'text/csv',buffer:Buffer.from('a,b,c\n1,2,3\n','utf8')});
  await page.waitForFunction(()=>document.getElementById('import-report').classList.contains('error'));
  cr=await rapport();
  assert.deepEqual([cr.lignes.length,cr.repli],[0,null],'un refus : la phrase du refus, sans repli');
  assert.match(cr.visible,/^Format non reconnu : « pas-des-vols\.csv »/);
  m=await mesure('#vp-tableau .vp-cadre','#vp-tableau tbody tr');
  assert.ok(m.vues>=6&&m.fenetre<=0&&m.page<=1,'un refus : le tableau reste à l’écran');

  /* ---- 5. « Retours » suit la même forme ---------------------------------------------------------------------------- */
  // Une planche retour fictive de quarante lignes.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const m=Sim.ateliers.state.materiel;
    m.planche=Array.from({length:40},(x,i)=>({vol:'RE'+(100+i),cie:['NORD','SUD','EST','OUEST'][i%4],heure:String(6+Math.floor(i/3)).padStart(2,'0')+':'+String((i%3)*20).padStart(2,'0'),jour:0}));},'Une planche retour fictive.'));
  await nav.aller(page,'v-planche');await attendre(400);
  const P='#vols-planche .planche>.table-scroll',L='#vols-planche .planche-table tbody tr';
  m=await mesure(P,L);
  assert.equal(m.lignes,40);
  assert.ok(m.fenetre<=0&&m.page<=1,'« Retours » : ni la fenêtre ni la page ne défilent ('+m.fenetre+', '+m.page+')');
  assert.ok(m.vues>=6,'ses six premières lignes se voient sans défiler ('+m.vues+' à l’écran)');
  assert.ok(m.cadre.defile>50,'la planche défile dans son cadre ('+m.cadre.defile+' px)');
  assert.equal(m.entete.fige,'sticky');
  // Au-dessus du tableau : le titre et ses gestes, puis deux lignes au plus (ce que lit la simulation ; comparer).
  const tete=await page.evaluate(()=>{const p=document.querySelector('#vols-planche .planche'),k=p.querySelector('.table-scroll');
    return {notes:[...p.querySelectorAll(':scope>p')].filter(e=>e.getBoundingClientRect().bottom<=k.getBoundingClientRect().top).map(e=>Math.round(e.getBoundingClientRect().height)),haut:Math.round(k.getBoundingClientRect().top-p.getBoundingClientRect().top)};});
  assert.ok(tete.notes.length<=2&&tete.notes.every(h=>h<=36),'au-dessus du tableau : deux lignes au plus ('+tete.notes.join(', ')+' px)');
  assert.ok(tete.haut<=160,'le tableau commence '+tete.haut+' px sous le haut du panneau');
  await page.locator(P).evaluate(k=>{k.scrollTop=k.scrollHeight;});await attendre(150);
  const fin=await mesure(P,L);
  assert.deepEqual([fin.entete.haut,fin.fenetre<=0],[m.entete.haut,true],'l’en-tête de la planche reste en haut de son cadre');
  // Sous le tableau, le nombre de lignes reste à l'écran.
  assert.equal(await page.locator('#vols-planche .planche>p.mini-note').last().evaluate(e=>{const r=e.getBoundingClientRect();return r.bottom<=innerHeight&&/40 lignes\./.test(e.textContent);}),true);
  // Une planche courte ne s'étire pas : son cadre fait la hauteur de ses lignes.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const m=Sim.ateliers.state.materiel;m.planche=m.planche.slice(0,3);},'Trois lignes.'));
  await nav.aller(page,'j-chiffres');await nav.aller(page,'v-planche');await attendre(300);
  m=await mesure(P,L);
  assert.deepEqual([m.lignes,m.cadre.defile<=1,m.fenetre<=0],[3,true,true],'trois lignes : rien ne défile');

  assert.deepEqual(erreurs,[],'aucune erreur de page');
  await site.effacer();
  console.log('programme-ecran-browser : ok — après un import daté de trente jours, le compte rendu tient en deux lignes (le fichier ; la période, 30 jours, '+total.lignes+' vols, la fourchette par jour) et son détail jour par jour est replié ; à 1 366 × 768, les six premiers vols du jour se voient sans défiler, le tableau va jusqu’au bas de l’écran et défile dans son cadre, en-tête figé ; un jour sans vol se lit sur la deuxième ligne ; « Retours » suit la même forme (quarante lignes : six à l’écran, le reste dans le cadre).');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

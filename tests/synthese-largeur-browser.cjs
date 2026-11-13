/* Correction 18, retouches d'affichage — le tableau « Les services » de la
 * Synthèse tient sur un écran de 1 366 × 768, sans défilement horizontal
 * (v1). Sur des unités fictives :
 *   — l'unité et les vols fictifs (tests/plan-rejoue-fictif.cjs), avec des
 *     retards, puis sans retard et les heures sup permises : un service dépasse
 *     son horaire — l'équipe qui dépasse est nommée dans sa case, avec sa fin
 *     et son horaire, les heures sup dessous ; la carte « Où ça coince » la
 *     nomme aussi ;
 *   — la même unité avec deux services aux noms longs ;
 *   — l'unité fictive de 15 services (tests/unite-15-services.cjs).
 * À chaque fois : onze colonnes, toutes à l'écran ; ni le tableau ni la page
 * ne défilent en largeur ; et il reste de la marge — la plus petite largeur
 * où le tableau tient encore est à 100 px au moins sous celle de son cadre :
 * des textes plus longs que ceux de l'unité fictive tiennent aussi (avant la
 * retouche, la colonne « Fin » et celle des heures sup ne laissaient que
 * 13 px). Aucune donnée de l'unité : tout est fictif. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const U=require('./unite-15-services.cjs');
const {siteSansPlan}=require('./plan-fictif.cjs');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

/** La marge demandée entre la largeur du cadre et la plus petite largeur où le tableau tient, en pixels. */
const MARGE=100;
const TETES=['Service','Besoin','Présents','Écart','Matin','Après-midi','Pic au travail','Occupation','Personnes sans travail','Attente d’un arrivage','Fin et heures sup'];
/** L'unité fictive, deux services renommés en long : le tableau doit tenir quand même. */
const nomsLongs=()=>{const s=F.sauvegardeFictive();
  for(const [id,nom] of [['cuisine','CUISINE FROIDE ET PATISSERIE DU MATIN'],['prepa','MONTAGE DES PLATEAUX LONG COURRIER']])s.contenu['orly-plan-v3'].zones.find(z=>z.id===id).nom=nom;
  return s;};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const site=siteSansPlan(),page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[],effacer=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 /** Le tableau, mesuré : ses colonnes, ce qui déborde, ce qui sort de l'écran. */
 const mesurer=()=>page.evaluate(()=>{const c=document.querySelector('#bilan-journee .sy-cadre'),t=c.querySelector('.sy-table'),rc=c.getBoundingClientRect();
   c.scrollIntoView({block:'start'});
   // La plus petite largeur où le tableau tient sans défiler : sa largeur quand rien ne l'étire.
   t.style.width='min-content';const mini=t.getBoundingClientRect().width;t.style.width='';
   const th=[...t.querySelectorAll('thead th')],dernieres=[...t.querySelectorAll('tbody tr')].map(tr=>tr.cells[tr.cells.length-1].getBoundingClientRect().right);
   return {fenetre:[innerWidth,innerHeight],tetes:th.map(x=>x.textContent.trim()),cases:[...new Set([...t.querySelectorAll('tbody tr')].map(tr=>tr.cells.length))],lignes:t.querySelectorAll('tbody tr').length,
     mini,largeurDuCadre:c.clientWidth,tableau:c.scrollWidth-c.clientWidth,page:document.documentElement.scrollWidth-innerWidth,droite:Math.max(...th.map(x=>x.getBoundingClientRect().right),...dernieres),cadre:rc.right,
     gauche:Math.min(...th.map(x=>x.getBoundingClientRect().left)),depasse:[...t.querySelectorAll('.sy-depasse')].map(x=>x.textContent),sup:[...t.querySelectorAll('.sy-hs')].map(x=>x.textContent),
     noms:[...t.querySelectorAll('tbody th .sy-service')].map(x=>x.textContent)};});
 const tient=async cas=>{
   await nav.aller(page,'j-chiffres');await page.waitForSelector('#bilan-journee .sy-table tbody tr');
   const m=await mesurer();
   assert.deepEqual(m.fenetre,[1366,768]);
   assert.deepEqual(m.tetes,TETES,cas+' : onze colonnes, les heures sup sous la fin');
   assert.deepEqual(m.cases,[11],cas+' : onze cases par ligne');
   assert.ok(m.tableau<=1,cas+' : le tableau ne défile pas en largeur ('+m.tableau+' px de trop)');
   assert.equal(m.page,0,cas+' : la page non plus');
   assert.ok(m.mini<=m.largeurDuCadre-MARGE,cas+' : il reste de la marge — le tableau tient jusqu’à '+Math.round(m.mini)+' px, son cadre en fait '+m.largeurDuCadre);
   assert.ok(m.gauche>=0&&m.droite<=1366&&m.droite<=m.cadre+1,cas+' : toutes les colonnes sont à l’écran (de '+Math.round(m.gauche)+' à '+Math.round(m.droite)+' px)');
   return m;};
 try{
  // 1. L'unité fictive, des vols en retard.
  effacer.push((await F.charger(page,nav,site.url('index.html'),{pageId:'j-chiffres'})).effacer);
  let m=await tient('des retards');
  assert.ok(m.lignes>=8,'les services de l’unité fictive');

  // 2. Sans retard, les heures sup permises : un service dépasse son horaire — son équipe est nommée, ses heures sup dessous.
  const ch=await F.charger(page,nav,site.url('index.html'),{csv:F.volsSansRetardCsv(),pageId:'j-chiffres'});effacer.push(ch.effacer);
  await page.evaluate(()=>Sim.reglages.changer(()=>{Sim.reglages.etat.heuresSup={actif:true,plafond:120};},''));
  await page.waitForFunction(()=>{const r=Sim.reponses();return !!r&&r.fins.services.some(s=>s.equipeQuiDepasse);});
  await page.waitForFunction(()=>!!document.querySelector('#bilan-journee .sy-table .sy-depasse'));
  m=await tient('une équipe qui dépasse');
  const attendu=await page.evaluate(()=>{const H=MoteurProduction.hhmm,D=MoteurProduction.dureeLisible,rep=Sim.reponses();
    return {depasse:rep.fins.services.filter(s=>s.equipeQuiDepasse).map(s=>'l’équipe '+s.equipeQuiDepasse.nom+' finit à '+H(s.equipeQuiDepasse.fin)+' pour '+H(s.equipeQuiDepasse.finHoraire)),
      sup:rep.fins.services.filter(s=>s.heuresSup.total>1e-9).map(s=>'heures sup '+D(s.heuresSup.total)),goulot:rep.coince.goulot,
      horaires:rep.fins.services.every(s=>s.equipes.every(e=>e.finHoraire==null||s.finHoraire>=e.finHoraire-1e-9))};});
  assert.ok(attendu.depasse.length>=1&&attendu.sup.length>=1,'la journée fictive a un dépassement et des heures sup');
  assert.deepEqual(m.depasse.slice().sort(),attendu.depasse.slice().sort(),'l’équipe qui dépasse, avec sa fin et son horaire');
  assert.deepEqual(m.sup.slice().sort(),attendu.sup.slice().sort(),'les heures sup, sous la fin');
  assert.ok(attendu.horaires,'la fin d’horaire d’un service : celle de ses équipes qui travaillent');
  if(attendu.goulot&&attendu.goulot.equipe){
   const e=attendu.goulot.equipe,carte=await page.locator('#bilan-journee .sy-carte[aria-label="Où ça coince"]').innerText();
   assert.ok(carte.includes('l’équipe '+e.nom+' finit à '),'la carte « Où ça coince » nomme l’équipe qui dépasse : '+carte);
  }

  // 3. Deux services aux noms longs : le tableau tient quand même.
  effacer.push((await F.charger(page,nav,site.url('index.html'),{sauvegarde:nomsLongs(),pageId:'j-chiffres'})).effacer);
  m=await tient('des noms longs');
  assert.ok(m.noms.some(n=>n.length>=30),'un service au nom long : '+m.noms.filter(n=>n.length>=30));

  // 4. L'unité fictive de 15 services.
  effacer.push((await U.charger(page,nav,site.url('index.html'),{pageId:'j-chiffres'})).effacer);
  m=await tient('15 services');
  assert.ok(m.lignes>=18,'les services de l’unité de 15 services, ligne par jour de travail');

  assert.deepEqual(errors,[],errors.join(' | '));
  console.log('synthese-largeur-browser : ok — à 1 366 × 768, le tableau « Les services » tient sans défilement horizontal (onze colonnes, les heures sup sous la fin, l’équipe qui dépasse nommée).');
 }catch(e){console.error(e);process.exitCode=1;}finally{for(const f of effacer)f();site.effacer();await browser.close();}
})();

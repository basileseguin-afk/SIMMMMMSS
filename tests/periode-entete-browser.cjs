/* Correction 23 (i) — « Période » : l'en-tête du tableau jour par jour reste figé (version 1), sur l'unité fictive de la
 * référence de non-régression et un programme daté fictif d'un mois, à 1 366 × 768 et 1 920 × 1 080.
 * Le constat : la zone de la page défilait, et l'en-tête du tableau partait avec elle — il est « collant », mais dans un
 * cadre qui ne défilait pas (sa hauteur était libre).
 *   1. Un mois simulé : le tableau défile dans son cadre, qui tient dans la zone de la page ; la fenêtre ne défile pas.
 *   2. Après un défilement du cadre, l'en-tête est toujours en haut du cadre, par-dessus les lignes ; la dernière ligne
 *      s'atteint.
 *   3. Après un défilement sur le côté, la première colonne est toujours à gauche du cadre ; le coin (« Jour ») reste
 *      en haut à gauche, par-dessus les deux.
 *   4. La zone de la page défile toujours, pour ce qui suit le tableau ; le cadre garde son défilement.
 *   5. Une période courte : le cadre a la hauteur de son tableau, il ne défile pas.
 * Unité, vols et compagnies fictifs. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const PE=require('../moteur/periode.js');
const REF=require('./non-regression.attendu.json');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const S=REF.scenarios.find(s=>s.nom==='unite-vol');
const hh=t=>(t==null?'':String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0'));
const LIGNE=v=>[v.id,v.cie,v.avion,v.sens,v.sens==='DEP'?hh(v.std):'',v.sens==='RET'?hh(v.sta):'',v.bc,v.pc,v.yc,v.crew,v.spml].join(',');
const TETE='date,vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_CREW,nb_SPML';
/** Un programme daté fictif : les vols de l'unité fictive chaque jour, un départ de moins un jour sur trois. */
const programme=(debut,fin)=>TETE+'\n'+PE.joursEntre(debut,fin).flatMap((d,i)=>S.args.vols.filter(v=>!(i%3===1&&v.id==='NO101')).map(v=>d+','+LIGNE(v))).join('\n')+'\n';
const TAILLES=[[1366,768],[1920,1080]];
const CADRE='#journee-periode .pv-tableau .table-scroll';

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1366,height:768}}),erreurs=[];
 page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=250)=>page.waitForTimeout(ms);
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-periode-entete-'));
 const fichier=(nom,texte)=>{const f=path.join(dossier,nom);fs.writeFileSync(f,texte);return f;};
 const importer=async(nom,texte)=>{await nav.aller(page,'v-programme');await page.locator('#imp-vols').setInputFiles(fichier(nom,texte));
   await page.waitForFunction(n=>document.getElementById('source-label').textContent===n,nom);await attendre(150);};
 const simuler=async()=>{await nav.aller(page,'j-periode');await page.locator('#journee-periode [data-pv=lancer]').click();
   await page.waitForFunction(()=>Sim.periode.etat()==='a-jour',null,{timeout:300000});await attendre(400);};
 /** Le cadre du tableau, la zone de la page et ce qui doit rester en place : des rectangles, au pixel. */
 const lire=()=>page.evaluate(sel=>{const r=e=>{const q=e.getBoundingClientRect();return {g:Math.round(q.left),h:Math.round(q.top),d:Math.round(q.right),b:Math.round(q.bottom)};};
   const sc=document.querySelector(sel),t=sc.querySelector('table'),z=document.querySelector('#journee-periode>.page-zone'),tete=[...t.tHead.rows[0].cells],jours=[...t.querySelectorAll('tbody tr[data-pv-jour]')];
   const c=sc.getBoundingClientRect(),dedans={g:Math.round(c.left+sc.clientLeft),h:Math.round(c.top+sc.clientTop)};
   const sous=(x,y)=>{const e=document.elementFromPoint(x,y);const th=e&&e.closest('th,td');return th?(th.closest('thead')?'tete':th.tagName==='TH'?'jour':'case')+(th.cellIndex===0?':0':''):null;};
   const derniere=t.tBodies[0].rows[t.tBodies[0].rows.length-1];
   return {fenetre:[document.documentElement.scrollHeight-innerHeight,document.documentElement.scrollWidth-innerWidth],
     zone:{haut:z.clientHeight,depasse:z.scrollHeight-z.clientHeight,top:Math.round(z.scrollTop),...r(z)},
     cadre:{haut:sc.clientHeight,depasse:sc.scrollHeight-sc.clientHeight,large:sc.scrollWidth-sc.clientWidth,top:Math.round(sc.scrollTop),left:Math.round(sc.scrollLeft),dehors:r(sc),...dedans},
     tete:tete.map(r),coin:r(tete[0]),premierJour:r(jours[0].cells[0]),jours:jours.map(tr=>r(tr.cells[0])),derniere:r(derniere),nbJours:jours.length,
     // Ce qui se trouve sous le pointeur : au milieu de l'en-tête d'une colonne, dans le coin, et dans la première colonne sous l'en-tête.
     sousTete:sous(dedans.g+sc.clientWidth/2,dedans.h+8),sousCoin:sous(dedans.g+8,dedans.h+8),sousJour:sous(dedans.g+8,dedans.h+sc.clientHeight/2),
     collant:[getComputedStyle(tete[1]).position,getComputedStyle(jours[0].cells[0]).position]};},CADRE);
 const defiler=async(sel,haut,cote)=>{await page.evaluate(([sel,haut,cote])=>{const e=document.querySelector(sel);if(haut!=null)e.scrollTop=haut;if(cote!=null)e.scrollLeft=cote;},[sel,haut,cote]);await attendre(200);};
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(500);
  await nav.aller(page,'u-sauvegarde');
  await page.locator('#sauvegarde-import').setInputFiles(fichier('unite-fictive.json',JSON.stringify(S.sauvegarde)));
  const recharge=page.waitForEvent('load');await nav.repondre(page);await recharge;await page.waitForLoadState('load');await attendre(600);
  await importer('vols-un-mois.csv',programme('2026-03-01','2026-03-31'));
  await simuler();

  for(const [w,h] of TAILLES){
   const T=w+' × '+h;
   await page.setViewportSize({width:w,height:h});await attendre(500);
   await defiler('#journee-periode>.page-zone',0);await defiler(CADRE,0,0);

   /* ---- 1. un mois : le tableau défile dans son cadre, qui tient dans la zone ----------------------------------- */
   let m=await lire();
   assert.ok(m.nbJours>=30,T+' : un mois simulé, '+m.nbJours+' jours');
   assert.deepEqual(m.fenetre,[0,0],T+' : la fenêtre ne défile pas');
   assert.deepEqual(m.collant,['sticky','sticky'],T+' : l’en-tête et la première colonne sont collants');
   assert.ok(m.cadre.depasse>200,T+' : le tableau défile dans son cadre (il dépasse de '+m.cadre.depasse+' px)');
   assert.ok(m.cadre.dehors.b-m.cadre.dehors.h<=m.zone.haut,T+' : le cadre tient dans la zone de la page ('+(m.cadre.dehors.b-m.cadre.dehors.h)+' px dans '+m.zone.haut+')');
   assert.ok(m.cadre.haut>=300,T+' : le cadre montre plusieurs jours à la fois ('+m.cadre.haut+' px)');
   // Le cadre amené dans la zone : son en-tête est en haut du cadre, à l'écran.
   await page.locator(CADRE).evaluate(e=>e.scrollIntoView({block:'start'}));await attendre(300);
   m=await lire();
   assert.ok(m.cadre.dehors.h>=m.zone.h-1&&m.cadre.dehors.b<=m.zone.b+1,T+' : le cadre entier se voit dans la zone : '+JSON.stringify([m.cadre.dehors,m.zone]));
   for(const c of m.tete)assert.ok(Math.abs(c.h-m.cadre.h)<=1,T+' : avant de défiler, l’en-tête est en haut du cadre');
   const largeursAvant=m.tete.map(c=>c.d-c.g);

   /* ---- 2. après un défilement du cadre, l'en-tête est toujours en haut du cadre -------------------------------- */
   await defiler(CADRE,260);
   m=await lire();
   assert.equal(m.cadre.top,260,T+' : le cadre a défilé');
   for(const c of m.tete)assert.ok(Math.abs(c.h-m.cadre.h)<=1,T+' : après un défilement du cadre, l’en-tête est toujours en haut du cadre : '+JSON.stringify([c,m.cadre]));
   assert.ok(m.premierJour.b<=m.cadre.h+1,T+' : la première ligne, elle, est passée sous l’en-tête');
   assert.deepEqual([m.sousTete,m.sousCoin],['tete','tete:0'],T+' : l’en-tête est par-dessus les lignes qui défilent');
   assert.deepEqual(m.tete.map(c=>c.d-c.g),largeursAvant,T+' : les colonnes gardent leur largeur');
   assert.deepEqual(m.fenetre,[0,0]);
   // Jusqu'en bas : la dernière ligne s'atteint, l'en-tête toujours en haut.
   await defiler(CADRE,99999);
   m=await lire();
   assert.ok(m.derniere.b<=m.cadre.h+m.cadre.haut+1,T+' : la dernière ligne s’atteint');
   for(const c of m.tete)assert.ok(Math.abs(c.h-m.cadre.h)<=1,T+' : en bas du tableau, l’en-tête est toujours en haut du cadre');

   /* ---- 3. après un défilement sur le côté, la première colonne reste à gauche ---------------------------------- */
   await defiler(CADRE,260,0);
   m=await lire();
   if(m.cadre.large>20){
    await defiler(CADRE,260,m.cadre.large);
    const n=await lire();
    assert.equal(n.cadre.left,m.cadre.large,T+' : le cadre a défilé sur le côté');
    assert.ok(Math.abs(n.coin.g-n.cadre.g)<=1&&Math.abs(n.coin.h-n.cadre.h)<=1,T+' : le coin reste en haut à gauche du cadre : '+JSON.stringify([n.coin,n.cadre]));
    for(const j of n.jours)assert.ok(Math.abs(j.g-n.cadre.g)<=1,T+' : la première colonne reste à gauche du cadre');
    assert.ok(n.tete[1].g<m.tete[1].g,T+' : les autres colonnes, elles, ont défilé');
    assert.deepEqual([n.sousCoin,n.sousJour,n.sousTete],['tete:0','jour:0','tete'],T+' : le coin par-dessus l’en-tête et la première colonne, eux par-dessus les cases');
    await defiler(CADRE,260,0);
   }else assert.ok(w>=1900,T+' : seul un grand écran montre toutes les colonnes sans défiler sur le côté');

   /* ---- 4. la zone de la page défile toujours ; le cadre garde son défilement ----------------------------------- */
   m=await lire();
   assert.ok(m.zone.depasse>100,T+' : la zone de la page défile, pour ce qui suit le tableau');
   await defiler('#journee-periode>.page-zone',99999);
   m=await lire();
   assert.ok(m.zone.top>100,T+' : la zone a défilé');
   assert.equal(m.cadre.top,260,T+' : le cadre garde l’endroit où il a défilé');
   for(const c of m.tete)assert.ok(Math.abs(c.h-m.cadre.h)<=1,T+' : l’en-tête ne quitte pas le haut de son cadre quand la zone défile');
   assert.deepEqual(m.fenetre,[0,0],T+' : la fenêtre ne défile toujours pas');
  }

  /* ---- 5. une période courte : le cadre a la hauteur de son tableau ------------------------------------------------ */
  await page.setViewportSize({width:1366,height:768});await attendre(300);
  await importer('vols-trois-jours.csv',programme('2026-03-01','2026-03-03'));
  await simuler();
  const court=await lire();
  assert.ok(court.nbJours>=3&&court.nbJours<=5,'trois jours de vols : '+court.nbJours+' jours de travail');
  assert.equal(court.cadre.depasse,0,'une période courte : le cadre ne défile pas, il a la hauteur de son tableau');
  assert.deepEqual(court.fenetre,[0,0]);

  assert.deepEqual(erreurs,[],'aucune erreur de page : '+erreurs.join(' | '));
  console.log('OK periode-entete : un mois simulé, à 1 366 × 768 et 1 920 × 1 080 — le tableau jour par jour défile dans son cadre, qui tient dans la zone de la page ; après un défilement du cadre, l’en-tête est toujours en haut du cadre, par-dessus les lignes ; sur le côté, la première colonne et le coin restent en place ; la zone défile toujours pour la suite ; une période courte ne défile pas ; la fenêtre ne défile jamais');
 }finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});

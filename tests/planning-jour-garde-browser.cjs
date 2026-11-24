/* Correction 23 (a) — le jour de travail choisi dans le Planning se garde quand la journée de vols change (version 1),
 * sur l'unité fictive et un programme daté fictif de trois jours ; le deuxième jour, la compagnie EST ne vole pas.
 * Une équipe de la cuisine travaille l'avant-veille (J−2) pour EST : le deuxième jour n'a donc aucun lot à J−2.
 *   1. Sans choix de l'utilisateur, rien ne change : chaque journée ouvre le jour de travail qui a le plus de lots.
 *   2. Choisir « J−2 », changer de journée : l'onglet reste « J−2 ». Une journée sans commande à J−2 ouvre le jour le
 *      plus chargé ; la suivante revient à « J−2 ». Un réglage changé ne le fait pas quitter.
 *   3. Un autre programme importé repart de zéro.
 *   4. « En direct » : l'heure rejouée revenait à son départ quand la journée change. L'heure choisie se garde de la même
 *      façon : la même heure le jour suivant qui la contient ; l'heure d'ouverture le jour qui ne la contient pas ; sans
 *      choix, l'heure d'ouverture, comme avant ; un autre programme repart de zéro.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const JOURS=['2031-03-03','2031-03-04','2031-03-05'];
/** Trois jours de vols ; le deuxième, sans la compagnie EST. */
const CSV=F.volsDatesCsv(3,JOURS[0]).split('\n').filter(l=>!(l.startsWith(JOURS[1]+',')&&l.split(',')[2]==='EST')).join('\n');

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 try{
  const ctx=await browser.newContext({viewport:{width:1366,height:768}});
  const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
  const attendre=(ms=300)=>page.waitForTimeout(ms);
  const site=await F.charger(page,nav,URL_V1,{csv:CSV,pageId:'at-planning'});
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.periode);
  // Une équipe de la cuisine, l'avant-veille, pour l'équipage d'EST.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'cuj2',nom:'Cuisine avant-veille',service:'cuisine',type:'manuel',debut:'09:00',jour:-2,personnes:1,pauses:[],lots:[['EST/CREW']],regime:{actif:true}});},''));
  await attendre(500);
  /** Le planning : ses onglets, celui qui est choisi, et le jour qui a le plus de lots. */
  const planning=()=>page.evaluate(()=>{const r=Sim.ateliers.resultat,E=OrlyPlanningEnsemble;
    return {onglets:[...document.querySelectorAll('#at-planning .pg-onglet')].map(b=>+b.dataset.pgJour),
      choisi:[...document.querySelectorAll('#at-planning .pg-onglet[aria-pressed="true"]')].map(b=>+b.dataset.pgJour),
      nom:(document.querySelector('#at-planning .pg-onglet[aria-pressed="true"]')||{childNodes:[{textContent:''}]}).childNodes[0].textContent.trim(),
      plusCharge:E.jourAOuvrir(r),jourVols:Sim.jourVols};});
  const journee=async d=>{
    await page.locator('#periode-jour').selectOption(d);
    await page.waitForFunction(j=>Sim.jourVols===j&&!!Sim.ateliers.resultat&&Sim.ateliers.resultat.ok,d);await attendre(500);};

  /* ---- 1. sans choix : le jour qui a le plus de lots, chaque journée ------------------------------------------------ */
  let p=await planning();
  assert.equal(p.jourVols,JOURS[0]);
  assert.deepEqual(p.onglets,[-2,-1,0],'trois jours de travail le premier jour : l’avant-veille, la veille, le jour des vols');
  assert.deepEqual(p.choisi,[p.plusCharge],'le planning ouvre le jour qui a le plus de lots');
  assert.notEqual(p.plusCharge,-2);
  const ouverts={};
  for(const d of JOURS){await journee(d);p=await planning();ouverts[d]=p.choisi[0];assert.deepEqual(p.choisi,[p.plusCharge],d+' : sans choix, le jour le plus chargé');}
  assert.deepEqual((await planning()).onglets,[-2,-1,0]);
  await journee(JOURS[1]);
  assert.deepEqual((await planning()).onglets,[-1,0],'le deuxième jour, EST ne vole pas : aucun lot à J−2');

  /* ---- 2. « J−2 » choisi : il se garde d'une journée à l'autre ---------------------------------------------------- */
  await journee(JOURS[0]);
  await page.locator('#at-planning .pg-onglet[data-pg-jour="-2"]').click();await attendre();
  p=await planning();
  assert.deepEqual([p.choisi,p.nom],[[-2],'J−2'],'l’onglet « J−2 » est choisi');
  // Une journée sans commande à J−2 : le jour le plus chargé.
  await journee(JOURS[1]);
  p=await planning();
  assert.deepEqual(p.choisi,[p.plusCharge],'sans lot à J−2, le jour le plus chargé');
  assert.equal(p.choisi[0],ouverts[JOURS[1]],'celui qu’elle ouvrait sans choix');
  // La suivante revient à « J−2 ».
  await journee(JOURS[2]);
  p=await planning();
  assert.deepEqual([p.choisi,p.nom],[[-2],'J−2'],'la journée suivante revient à « J−2 »');
  assert.notEqual(p.plusCharge,-2,'ce n’est pas son jour le plus chargé');
  // Et la première : toujours « J−2 », sans recliquer.
  await journee(JOURS[0]);
  assert.deepEqual((await planning()).choisi,[-2],'d’une journée à l’autre, l’onglet reste « J−2 »');
  // Un réglage changé (une personne de plus au montage) : la journée se recalcule, l'onglet reste.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id==='mo2').lots.push(['OUEST/CREW']);},''));
  await attendre(600);
  assert.deepEqual((await planning()).choisi,[-2],'un réglage changé ne fait pas quitter le jour choisi');
  await page.evaluate(()=>Sim.ateliers.histoire(false));await attendre(500);
  // Un autre onglet choisi le remplace.
  await page.locator('#at-planning .pg-onglet[data-pg-jour="-1"]').click();await attendre();
  await journee(JOURS[2]);
  assert.deepEqual((await planning()).choisi,[-1],'le dernier onglet choisi est celui qui se garde');
  await page.locator('#at-planning .pg-onglet[data-pg-jour="-2"]').click();await attendre();

  /* ---- 3. un autre programme importé repart de zéro --------------------------------------------------------------- */
  await F.importerVols(page,nav,site.fichier,'autres-vols.csv',F.volsDatesCsv(2,JOURS[0]));
  await nav.aller(page,'at-planning');await attendre(600);
  p=await planning();
  assert.ok(p.onglets.includes(-2),'le nouveau programme a des lots à J−2');
  assert.deepEqual(p.choisi,[p.plusCharge],'un autre programme : le jour le plus chargé, pas celui choisi avant');
  await journee(JOURS[1]);
  assert.deepEqual((await planning()).choisi,[(await planning()).plusCharge]);

  /* ---- 4. « En direct » : l'heure rejouée se garde de la même façon ----------------------------------------------- */
  await F.importerVols(page,nav,site.fichier,'vols-dates.csv',CSV);
  await nav.aller(page,'j-plan',{relief:true,panneau:false});await attendre(600);
  const heure=()=>page.evaluate(()=>({t:Sim.vue.t,debut:Sim.vue.debut,fin:Sim.vue.fin,jour:Sim.jourVols}));
  // Sans choix : chaque journée s'ouvre à son heure d'ouverture (son premier goulot, sinon son pic), comme avant.
  const ouvertures={};
  for(const d of JOURS){await journee(d);const x=await heure();ouvertures[d]=x.t;assert.ok(x.t>=x.debut&&x.t<=x.fin);}
  await journee(JOURS[0]);
  let x=await heure();
  assert.equal(x.t,ouvertures[JOURS[0]],'sans choix, la journée retrouve son heure d’ouverture');
  // L'utilisateur choisit une heure, au curseur : 21:40 (1 300 min), en fin de journée, quand le handling charge encore
  // les derniers vols d'EST.
  const choisie=1300;
  assert.ok(choisie>=x.debut&&choisie<=x.fin&&choisie!==x.t,'une heure de la fin de journée, dans la journée : '+JSON.stringify(x));
  await page.evaluate(t=>{const c=document.getElementById('sim-curseur');c.value=String(t);c.dispatchEvent(new Event('input',{bubbles:true}));},choisie);await attendre();
  assert.equal((await heure()).t,choisie);
  // Le troisième jour (EST y vole aussi) : la même heure.
  await journee(JOURS[2]);
  assert.equal((await heure()).t,choisie,'l’heure choisie se garde quand la journée change');
  // Le deuxième jour, sans EST, finit plus tôt : l'heure choisie n'y est pas ; il s'ouvre à son heure d'ouverture.
  await journee(JOURS[1]);
  x=await heure();
  assert.ok(choisie>x.fin,'le deuxième jour ne contient pas cette heure : '+JSON.stringify(x));
  assert.equal(x.t,ouvertures[JOURS[1]],'il s’ouvre à son heure d’ouverture');
  // Le premier : l'heure choisie revient.
  await journee(JOURS[0]);
  assert.equal((await heure()).t,choisie,'le choix revient dès qu’une journée le contient');
  // Un autre programme importé repart de zéro : son heure d'ouverture.
  await F.importerVols(page,nav,site.fichier,'autres-vols.csv',F.volsDatesCsv(2,JOURS[0]));
  await nav.aller(page,'j-plan',{relief:true,panneau:false});await attendre(600);
  x=await heure();
  assert.notEqual(x.t,choisie,'un autre programme : pas l’heure choisie avant');
  await journee(JOURS[1]);await journee(JOURS[0]);
  assert.equal((await heure()).t,x.t,'sans choix, il retrouve son heure d’ouverture');

  assert.deepEqual(erreurs,[],'aucune erreur de page : '+erreurs.join(' | '));
  site.effacer();
  console.log('OK planning-jour-garde : le jour de travail choisi (« J−2 ») se garde d’une journée à l’autre ; sans lot ce jour-là, le plus chargé, puis il revient ; sans choix, rien ne change ; un autre programme repart de zéro ; « En direct » garde de même l’heure choisie');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

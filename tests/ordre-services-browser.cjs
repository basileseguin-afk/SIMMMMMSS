/* Correction 17 (b) — l'ordre des services dans la page (v1), sur l'unité et les
 * vols fictifs (tests/plan-rejoue-fictif.cjs) : le tableau de la Synthèse, les
 * groupes du planning des équipes et les colonnes de la page Période affichent
 * le même ordre, celui du module (moteur/ordre-services.js), tiré de tous les
 * chemins : aucun service ne s'affiche avant un service qui l'alimente ; les
 * services hors chemin sont à la fin. Aucune donnée de l'unité : tout est fictif. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const PE=require('../moteur/periode.js');
const {siteSansPlan}=require('./plan-fictif.cjs');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

/** Trois jours datés fictifs : les vols fictifs chaque jour, du 2 au 4 novembre 2026. */
const troisJours=()=>{const [tete,...l]=F.volsCsv().trim().split('\n');return 'date,'+tete+'\n'+PE.joursEntre('2026-11-02','2026-11-04').flatMap(d=>l.map(x=>d+','+x)).join('\n')+'\n';};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const site=siteSansPlan(),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=300)=>page.waitForTimeout(ms);
 const ch=await F.charger(page,nav,site.url('index.html'),{pageId:'j-chiffres'});
 try{
  // L'ordre du module, pour les services de l'unité ; et les liens de ses chemins.
  const m=await page.evaluate(()=>{const a=Sim.ateliers.args,ids=[...new Set(Sim.ateliers.resultat.ateliers.map(x=>x.service))];
    return {ordre:OrlyOrdreServices.ordreDesServices(a.parcours,ids),liens:a.parcours.flatMap(c=>c.liens.map(l=>[l.de,l.vers])),
      cases:[...new Set(a.parcours.flatMap(c=>c.noeuds))],ids};});
  assert.ok(m.liens.length>3&&m.ordre.length===m.ids.length,JSON.stringify(m));
  /** Une page suit l'ordre du module : ses services, dans le même ordre ; aucun avant un service qui l'alimente. */
  const verifier=(nom,vus)=>{
   assert.ok(vus.length>=4,nom+' : '+vus.join(', '));
   assert.deepEqual(vus,m.ordre.filter(s=>vus.includes(s)),nom+' : l’ordre du module');
   for(const [de,vers] of m.liens)if(vus.includes(de)&&vus.includes(vers))assert.ok(vus.indexOf(de)<vus.indexOf(vers),nom+' : '+de+' avant '+vers);
   const hors=vus.filter(s=>!m.cases.includes(s)),dans=vus.filter(s=>m.cases.includes(s));
   assert.deepEqual(vus,dans.concat(hors),nom+' : les services hors chemin à la fin');
  };

  // 1. La Synthèse : les lignes du tableau « Les services ».
  const synthese=await page.evaluate(()=>[...new Set([...document.querySelectorAll('#bilan-journee .sy-table tbody tr')].map(tr=>tr.dataset.service))]);
  verifier('la Synthèse',synthese);

  // 2. Le planning des équipes : ses lignes de service (correction 18 b), pour toute la chaîne puis pour le jour ouvert ; les
  //    services sans lot sont à part, en bas, sous une seule ligne.
  await nav.aller(page,'at-planning');await page.waitForSelector('#at-planning .pg-groupe');
  const lignes=()=>page.evaluate(()=>[...document.querySelectorAll('#at-planning .pg-groupe[data-service]:not(.pg-sans-lot)')].map(g=>g.dataset.service));
  const duJour=await lignes();
  assert.deepEqual(duJour,m.ordre.filter(s=>duJour.includes(s)),'le planning du jour ouvert : l’ordre du module');
  await page.locator('#at-planning [data-pg-zoom="chaine"]').click();
  await page.waitForFunction(()=>OrlyPlanningVue.etat.vue&&OrlyPlanningVue.etat.vue.jour===null);
  const planning=await lignes();
  verifier('le planning des équipes',planning);
  assert.ok(duJour.every(s=>planning.includes(s)));
  assert.equal(await page.locator('#at-planning .pg-groupe.pg-sans-lot').count(),await page.evaluate(()=>Sim.ateliers.resultat.ateliers.some(a=>!(a.lots||[]).some(l=>!l.dispo))?1:0),'les équipes sans lot, sous une seule ligne');
  assert.equal(await page.evaluate(()=>{const g=[...document.querySelectorAll('#at-planning .pg-groupe')];return g.findIndex(x=>x.classList.contains('pg-sans-lot'));}),
    await page.locator('#at-planning .pg-groupe.pg-sans-lot').count()?planning.length:-1,'en bas');

  // 3. La page Période : les colonnes des services (leurs noms, ramenés à leurs identifiants).
  await F.importerVols(page,nav,ch.fichier,'trois-jours.csv',troisJours());
  await nav.aller(page,'j-periode');await page.locator('#journee-periode [data-pv=lancer]').click();
  await page.waitForFunction(()=>Sim.periode.etat()==='a-jour',null,{timeout:120000});await attendre(400);
  const periode=await page.evaluate(()=>{const noms=new Map(Sim.periode.resultat.bilan.services.map(s=>[s.nom,s.id]));
    return [...document.querySelectorAll('#journee-periode .pv-table thead th')].map(th=>noms.get(th.textContent)).filter(Boolean);});
  verifier('la page Période',periode);

  // Les trois pages : le même ordre pour les services qu'elles ont en commun.
  const commun=l=>l.filter(s=>synthese.includes(s)&&planning.includes(s)&&periode.includes(s));
  assert.deepEqual(commun(planning),commun(synthese));assert.deepEqual(commun(periode),commun(synthese));
  assert.ok(commun(synthese).length>=4);

  assert.deepEqual(errors,[],errors.join(' | '));
  console.log('ordre-services-browser : ok — la Synthèse, le planning des équipes et la page Période affichent l’ordre des chemins.');
 }catch(e){console.error(e);process.exitCode=1;}finally{ch.effacer();site.effacer();await browser.close();}
})();

/* Évolution 21 (c) — le relais sur la ligne du robot, dans les pages, sur une unité fictive
 * (tests/robot-relais-fictif.cjs : rien d'une vraie unité).
 *   — Le planning des équipes : la commande en relais est sur les deux lignes du robot, chacune pour sa part, avec le
 *     repère de relais ; au survol, « avance pour … », « repris par … à hh:mm », « avancé par … : n vols, de hh:mm à hh:mm ».
 *   — La Synthèse dit qui avance, et combien de vols ; « Où ça coince » ne cite plus le robot quand le relais suffit à
 *     tenir les deux postes, et le cite encore quand il ne suffit pas.
 *   — Le récapitulatif des équipes : « avance n vols de … », « n vols déjà faits par … », les heures de chaque part.
 * Chaque étape attend son effet, pas un délai. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const X=require('./robot-relais-fictif.cjs');
const {siteSansPlan}=require('./plan-fictif.cjs');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const h=s=>{const [a,b]=s.split(':').map(Number);return a*60+b;};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const site=siteSansPlan();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  /** Le planning des équipes : les barres des deux lignes du robot. */
  const planning=async()=>{
   await nav.aller(page,'at-planning');
   await page.waitForSelector('#at-planning .pg-cadre .pg-groupe[data-service="prepa"]');
   if(await page.locator('#at-planning .pg-groupe[data-service="prepa"] .pg-lignes').evaluate(e=>e.hidden))await page.locator('#at-planning .pg-groupe[data-service="prepa"] .pg-replier').click();
   await page.waitForSelector('#at-planning .pg-groupe[data-service="prepa"] .pg-ligne[data-equipe="rb2"] g.pg-lot');
   return page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#at-planning .pg-groupe[data-service="prepa"] .pg-ligne')].filter(l=>/^rb/.test(l.dataset.equipe)).map(l=>[l.dataset.equipe,
     [...l.querySelectorAll('g.pg-lot')].map(g=>({part:g.dataset.part||null,debut:+g.dataset.debut,fin:+g.dataset.fin,x:+g.dataset.x,x1:+g.dataset.x1,info:g.dataset.info,
       relais:[...g.querySelectorAll('path.pg-relais')].map(p=>p.dataset.relais),classes:g.getAttribute('class')}))])));};
  /** La Synthèse : la ligne du montage (le service du robot) et la carte « Où ça coince ». */
  const synthese=async()=>{
   await nav.aller(page,'j-chiffres');
   await page.waitForSelector('#bilan-journee .sy-table tr[data-service="prepa"]');
   return page.evaluate(()=>({fin:document.querySelector('#bilan-journee .sy-table tr[data-service="prepa"] td.sy-fin').textContent,
     avance:[...document.querySelectorAll('#bilan-journee .sy-table tr[data-service="prepa"] td.sy-fin .sy-avance')].map(e=>e.textContent),
     coince:[...document.querySelectorAll('#bilan-journee .sy-carte')].map(c=>c.textContent).find(t=>/^\s*Où ça coince/.test(t))||'',
     tete:[...document.querySelectorAll('#bilan-journee .sy-tete p')].map(p=>p.textContent).join(' ')}));};

  /* ---- le relais suffit : le soir tient dans son horaire ------------------------------------------------ */
  const ch=await X.charger(page,nav,site.url('index.html'),{sauvegarde:X.suffit(),csv:X.volsCsv(),pageId:'at-planning'});
  await page.waitForFunction(()=>!!(window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.ateliers.resultat.lots.some(l=>l.nom==='SUD/YC'&&Array.isArray(l.parts))));
  const parts=await page.evaluate(()=>Sim.ateliers.resultat.lots.find(l=>l.nom==='SUD/YC').parts.map(p=>[p.atelier,p.debut,p.fin,p.vols.length]));
  assert.deepEqual(parts,[['rb',h('05:50'),h('07:26'),3],['rb2',h('07:26'),473.6,1]],'la page joue la même journée que le moteur seul');

  // 1. Le planning : la commande en relais sur les deux lignes, avec son repère.
  const pg=await planning();
  const matin=pg.rb.find(l=>l.part==='1/2'),soir=pg.rb2.find(l=>l.part==='2/2');
  assert.ok(matin&&soir,'la commande en relais est sur les deux lignes du planning : '+JSON.stringify(pg));
  assert.deepEqual([matin.debut,matin.fin,soir.debut,soir.fin],[h('05:50'),h('07:26'),h('07:26'),473.6],'chacune pour sa part');
  assert.ok(/en-relais/.test(matin.classes)&&/en-relais/.test(soir.classes));
  assert.deepEqual([matin.relais,soir.relais],[['passe'],['repris']],'le repère de relais : au bout de la part du matin, au début de celle du soir');
  assert.ok(matin.x1<=soir.x+0.6,'la part du soir commence où celle du matin finit');
  assert.match(matin.info,/SUD · Économie\n05:50 → 07:26[^\n]*\nAttente : aucune[\s\S]*\nAvance pour Robot soir : 3 vols\nRepris par Robot soir à 07:26$/);
  assert.match(soir.info,/SUD · Économie\n07:26 → 07:54[^\n]*\nAttente : 26 min[\s\S]*\nAvancé par Robot matin : 3 vols, de 05:50 à 07:26$/);
  // Les autres commandes des deux équipes : des barres ordinaires, sans repère.
  assert.deepEqual([pg.rb.filter(l=>!l.part).length,pg.rb2.filter(l=>!l.part).length,pg.rb.concat(pg.rb2).filter(l=>!l.part).flatMap(l=>l.relais)],[1,1,[]]);

  // 2. La Synthèse dit qui avance et combien ; rien ne dépasse sur la ligne : « Où ça coince » ne cite pas le robot.
  const sy=await synthese();
  assert.deepEqual(sy.avance,['Robot matin avance 3 vols de Robot soir']);
  assert.doesNotMatch(sy.coince,/Robot/,'le relais suffit : '+sy.coince);
  assert.doesNotMatch(sy.fin,/l’équipe Robot/);

  // 3. (Évolution 22 b : « Horaires des équipes », qui disait aussi qui avance, ce qui est déjà fait et les heures de
  //    chaque part, a quitté l'écran. Ces résultats se lisent dans le planning et la Synthèse, ci-dessus ; la page où
  //    les équipes se règlent n'en montre aucun.)
  await nav.equipe(page,'rb2');
  assert.doesNotMatch(await page.locator('#mu-services .se-fiche').innerText(),/déjà faits? par|avance \d+ vols?|\d\d:\d\d–\d\d:\d\d/,'la fiche de l’équipe ne dit rien du relais calculé');
  ch.effacer();

  /* ---- le relais ne suffit pas : le soir dépasse encore -------------------------------------------------- */
  const ch2=await X.charger(page,nav,site.url('index.html'),{sauvegarde:X.insuffisant(),csv:X.volsCsv(),pageId:'j-chiffres'});
  await page.waitForFunction(()=>!!(window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.ateliers.resultat.lots.some(l=>l.nom==='SUD/YC'&&Array.isArray(l.parts)&&l.parts.length===2&&l.parts[0].vols.length===2)));
  const sy2=await synthese();
  assert.deepEqual(sy2.avance,['Robot matin avance 2 vols de Robot soir']);
  assert.match(sy2.coince,/Robot soir/,'le relais ne suffit pas : la ligne du robot est citée — '+sy2.coince);
  assert.match(sy2.fin,/l’équipe Robot soir finit à 10:24 pour 08:30/);
  ch2.effacer();

  assert.deepEqual(errors,[],'aucune erreur dans la page');
  console.log('robot-relais-browser : ok — la commande en relais sur les deux lignes du planning, avec son repère et ses mots ; la Synthèse dit qui avance et combien ; « Où ça coince » ne cite plus le robot quand le relais suffit, et le cite quand il ne suffit pas ; le récapitulatif des équipes');
 }catch(e){console.error(e);process.exitCode=1;}finally{site.effacer();await browser.close();}
})();

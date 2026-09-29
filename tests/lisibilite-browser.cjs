/* Améliorer l'existant (audit du 29/09, sur un état réaliste) : ce que le site
 * montrait de travers ou taisait.
 *  - un message (« Robot : il remplace… ») restait affiché de page en page ;
 *  - les heures du planning se chevauchaient (« J-1 04:00J-1 06:00 ») ;
 *  - « pas finie » ne disait pas pourquoi ;
 *  - la synthèse disait « aucun » vol en retard quand aucun n'était chargé ;
 *  - l'horloge du plan rejoué affichait « 00:00 » sans dire quel jour ;
 *  - les Contrôles ne parlaient que des liens, pas de ce que le calcul signale. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  // Une cuisine la veille, un montage le jour J au poste trop court, un handling.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
    st.parcours.push({id:'ch',nom:'Chaud',noeuds:['cuisine','prepa'],liens:[{de:'cuisine',vers:'prepa'}]});
    for(const c of ['AF/BC','AF/YC','TX/BC'])st.parcoursClasse[c]='ch';
    const c=(id,nom,service,debut,jour,lots,p)=>({id,nom,service,type:'manuel',debut,jour,personnes:2,pauses:[],lots,regime:{actif:false},...p});
    st.ateliers.push(c('cu','Cuisine chaud','cuisine','04:00',-1,[['AF/BC'],['AF/YC'],['TX/BC']]),
      c('mo','Montage court','prepa','06:00',0,[['AF/BC'],['AF/YC'],['TX/BC']],{personnes:1,regime:{actif:true,presence:60}}));},''));

  // 1. Un message s'efface de lui-même.
  await page.evaluate(()=>Sim.ateliers.rendre('Message de test.'));
  assert.equal(await page.locator('#at-status').textContent(),'Message de test.');
  await page.waitForTimeout(5600);
  assert.equal(await page.locator('#at-status').textContent(),'','le message ne traîne pas de page en page');

  // 2. Le planning : des heures lisibles, le jour écrit une fois.
  await nav.aller(page,'at-planning');await attendre();
  const heures=await page.evaluate(()=>[...document.querySelectorAll('#at-planning .at-pl-heure')].map(t=>({x:+t.getAttribute('x'),s:t.textContent})));
  assert.ok(heures.length>=3);
  for(let i=1;i<heures.length;i++)assert.ok(heures[i].x-heures[i-1].x>=60,'deux heures ne se chevauchent pas : '+heures[i-1].s+' / '+heures[i].s);
  assert.match(heures[0].s,/^J-1 /,'le premier repère dit le jour');
  assert.equal(heures.filter(h=>/^J-1 /.test(h.s)).length,1,'une seule fois par jour');
  assert.ok(heures.some(h=>/^J \d\d:\d\d$/.test(h.s)),'le jour J s’écrit à son premier repère');

  // 3. « pas finie » dit pourquoi.
  await nav.aller(page,'at-repas');await attendre();
  const pourquoi=await page.locator('#at-classes .at-pourquoi').allTextContents();
  assert.ok(pourquoi.some(t=>/poste de « Montage court » finit avant/.test(t)),'la cause, en quelques mots : '+pourquoi.join(' | '));

  // 4. La synthèse : des durées en heures, et pas de « aucun » trompeur.
  await nav.aller(page,'j-chiffres');await attendre();
  const bilan=await page.locator('#bilan-journee').innerText();
  assert.doesNotMatch(bilan,/\d{3,} min/,'plus de « 1329 min » : les longues durées s’écrivent en heures');
  // « En retard » (prête, mais tard) et « pas finie » ne se confondent plus.
  const r=await page.evaluate(()=>Sim.ateliers.resultat.indicateurs);
  assert.equal(r.enRetard+r.pasFinies+r.aHeure,r.classesSuivies);
  assert.ok(r.pasFinies>0);
  assert.match(bilan,new RegExp('Commandes en retard\\s*'+r.enRetard+'\\b'));
  assert.match(bilan,new RegExp('Commandes pas finies\\s*'+r.pasFinies+'\\b'));

  // 5. Le plan rejoué : « J 00:00 », pas « 00:00 », sur une journée qui commence la veille.
  await nav.aller(page,'j-plan');await attendre();
  await page.evaluate(()=>Sim.vue.allerA(0));
  assert.equal(await page.locator('#horloge').textContent(),'J 00:00');
  assert.match(await page.locator('.jour').textContent(),/journée de J-1 \d\d:\d\d à J \d\d:\d\d/);

  // 6. Les Contrôles : ce que le calcul signale, séparé des résultats de la journée.
  await nav.aller(page,'u-lecture');await attendre();
  const calcul=await page.locator('#fc-calcul').innerText();
  assert.match(calcul,/choses? que la journée montre/,'les postes trop courts sont des résultats');
  assert.match(calcul,/(point|points) à corriger dans l’organisation|L’organisation se lit de bout en bout/);
  // Une étape du chemin sans case : un point à corriger, compté dans le badge.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;const p=st.parcours.find(x=>x.id==='ch');
    p.noeuds.push('dotation');p.liens.push({de:'cuisine',vers:'dotation'});}));await attendre();
  await nav.aller(page,'u-lecture');await attendre();
  assert.match(await page.locator('#fc-calcul .fc-alerte.grave').innerText(),/Dotation[\s\S]*sans qu’aucune équipe ne l’y prépare/i);
  assert.ok(+(await page.locator('[data-sous-onglet=u-lecture] .so-badge, [data-sous-onglet=u-lecture] [class*=badge]').first().textContent())>=1,'le badge le compte');

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('lisibilite-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

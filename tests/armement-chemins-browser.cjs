/* « Intègre pour moi l'armement sur tous les chemins et lie-le uniquement au
 * handling » (retour d'usage du 02/10). Au chargement, une fois qu'un handling
 * existe : l'armement travaille par compagnie (ses cases par classe deviennent
 * des cases par compagnie) et entre dans chaque chemin en branche à part, avec
 * une seule flèche, vers le handling. Annulable. v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(300);
 const st=()=>page.evaluate(()=>JSON.parse(JSON.stringify(Sim.ateliers.state)));
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   await page.waitForTimeout(200);await nav.effectifSaisi(page);   // les personnes se saisissent ici (05/10)
   // Une unité décrite : des repas, un handling « Quais », et un armement coché par classe, au milieu d'un chemin.
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const s=Sim.ateliers.state;
     s.ateliers.push({id:'mo',nom:'Montage',service:'prepa',type:'manuel',debut:'04:00',jour:0,personnes:6,pauses:[],lots:Sim.ateliers.classes.map(c=>[c.id]),regime:{actif:true}},
       {id:'h',nom:'Quais',service:'quais',type:'handling',debut:'04:00',jour:0,personnes:2,pauses:[],lots:[],regime:{actif:true},durees:{'*':20}},
       {id:'ar',nom:'Armement matin',service:'armement',type:'manuel',debut:'04:00',jour:0,personnes:2,pauses:[],lots:[['AF/YC','AF/BC'],['TX/YC']],regime:{actif:true}});
     const t=s.parcours.find(p=>p.id==='sans-cuisine');t.noeuds.push('armement');t.liens=t.liens.filter(l=>l.de!=='prepa').concat([{de:'prepa',vers:'armement'}]);},''));
   await page.reload();await attendre();

   // 1. Fait au chargement : par compagnie, cases reprises, dans tous les chemins.
   let s=await st();
   assert.ok(s.migrations.includes('armement-handling'),version+' : migration faite');
   const code=s.categories.armement[0].id;
   assert.deepEqual(s.ateliers.find(a=>a.id==='ar').lots,[['AF/@'+code],['TX/@'+code]],version+' : ses compagnies reprises');
   for(const p of s.parcours){
     assert.ok(p.noeuds.includes('armement')&&p.noeuds.includes('quais'),p.nom+' : armement et handling');
     const liens=p.liens.filter(l=>l.de==='armement'||l.vers==='armement');
     assert.deepEqual(liens,[{de:'armement',vers:'quais'}],p.nom+' : une seule flèche, vers le handling');
   }
   // Le handling n'est relié qu'à l'armement : aucune étape des repas ne le livre (02/10 : « CF food c'est juste une zone tampon »).
   assert.ok(s.parcours.every(p=>p.liens.filter(l=>l.vers==='quais').every(l=>l.de==='armement')),version+' : le handling n’est relié qu’à l’armement');
   assert.ok(s.migrations.includes('handling-seul'));

   // 2. Le calcul : pas de trou à l'armement ; le handling attend l'armement d'AF.
   const r=await page.evaluate(c=>{const r=Sim.ateliers.resultat;const arm=r.lots.find(l=>l.classes.includes('AF/@'+c));
     return {trou:r.anomalies.some(a=>a.code==='parcours-trou'&&a.service==='armement'),arm:!!arm,
       ok:r.lots.filter(l=>l.handling&&l.classes.includes('AF/@'+c)).every(l=>l.debut>=arm.fin-1e-6),charges:r.lots.filter(l=>l.handling&&l.classes.includes('AF/@'+c)).length};},code);
   assert.ok(!r.trou,version+' : l’armement n’est pas un trou');
   assert.ok(r.arm&&r.charges>0&&r.ok,version+' : '+JSON.stringify(r));

   // 3. La fiche le dit ; un nouveau chemin sans armement → le bouton le remet.
   await nav.aller(page,'mu-services');await page.locator('[data-mu-choisir=armement]').click();await attendre();
   assert.match(await page.locator('#mu-services .mu-arm-ok').innerText(),/Dans tous les chemins/);
   // Un nouveau chemin, suivi par une commande (un chemin que personne ne suit ne compte pas, 05/10).
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;st.parcours.push({id:'neuf',nom:'Neuf',noeuds:['prepa'],liens:[]});st.parcoursClasse={...(st.parcoursClasse||{}),'AF/BC':'neuf'};},''));await attendre();
   assert.match(await page.locator('#mu-services .mu-arm-reprendre').innerText(),/« Neuf » \(absent\)/);
   await page.locator('#mu-services [data-mu-action=integrer-armement]').click();await attendre();
   s=await st();
   const neuf=s.parcours.find(p=>p.id==='neuf');
   assert.deepEqual(neuf.liens,[{de:'armement',vers:'quais'}]);
   assert.equal(await page.locator('#mu-services .mu-arm-ok').count(),1);

   // 4. Toutes les pages s'affichent ; puis « Annuler » défait l'intégration du nouveau chemin.
   for(const p of ['at-recap','rg-recap','mu-pas','mu-flux','at-chemins','at-equipes','v-departs']) await nav.aller(page,p);
   await page.evaluate(()=>Sim.ateliers.histoire(false));await attendre();
   assert.deepEqual((await st()).parcours.find(p=>p.id==='neuf').liens,[]);

   // 5. Rechargée, la migration ne se refait pas.
   await page.reload();await attendre();
   assert.deepEqual((await st()).parcours.find(p=>p.id==='neuf').liens,[],'fait une fois seulement');

   // 6. Une unité intégrée par la première version (CF food → handling) : la flèche s'en va, celle de l'armement reste.
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const s=Sim.ateliers.state;
     s.migrations=s.migrations.filter(m=>m!=='handling-seul');
     const t=s.parcours.find(p=>p.id==='complet');t.liens.push({de:'magasin',vers:'quais'});},''));
   await page.reload();await attendre();
   s=await st();
   const complet=s.parcours.find(p=>p.id==='complet');
   assert.ok(!complet.liens.some(l=>l.de==='magasin'&&l.vers==='quais'),version+' : flèche des repas vers le handling retirée');
   assert.ok(complet.liens.some(l=>l.de==='armement'&&l.vers==='quais'));
   assert.ok(s.migrations.includes('handling-seul'));
  }
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('armement-chemins-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

/* « Si aucune classe de la compagnie, qu'elle n'est dans aucun chemin et
 * qu'aucun atelier de l'armement ne l'a, pas besoin que le handling attende »
 * (retour d'usage du 08/10). Rien à cocher pour dire qu'une compagnie n'a pas
 * d'armement : elle n'en a pas quand aucun de ses chemins ne passe par
 * l'armement et qu'aucune équipe d'armement ne l'a cochée. Alors pas de case,
 * rien « à cocher », rien « à reprendre » dans son chemin ; la fiche la nomme
 * « sans armement ». Cochée dans une équipe, elle en a un, et la fiche le dit.
 * Plus de colonne « Armée ». v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(350);
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   // Un handling, un armement qui arme AF et TX ; au chargement, l'armement entre dans les chemins.
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const s=Sim.ateliers.state;
     s.ateliers.push({id:'h',nom:'Quais',service:'quais',type:'handling',debut:'04:00',jour:0,personnes:2,pauses:[],lots:[],regime:{actif:true},durees:{'*':20}},
       {id:'ar',nom:'Armement matin',service:'armement',type:'manuel',debut:'04:00',jour:0,personnes:2,pauses:[],lots:[['AF/YC'],['TX/YC']],regime:{actif:true}});},''));
   await page.reload();await attendre();
   const code=await page.evaluate(()=>Sim.ateliers.state.categories.armement[0].id);
   const cases=()=>page.evaluate(()=>Sim.ateliers.classesDe('armement').map(c=>c.cie).sort());
   const fiche=async()=>{await nav.aller(page,'mu-services');await page.locator('[data-mu-choisir=armement]').click();await attendre();return page.locator('#mu-services');};
   assert.ok((await cases()).includes('TX'),version+' : TX a sa case');

   // 1. TX a son chemin à elle, sans armement — mais une équipe d'armement l'a encore cochée :
   //    elle a un armement, et la fiche dit pourquoi.
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const s=Sim.ateliers.state,base=s.parcours.find(p=>p.id==='sans-cuisine');
     s.parcours.push({id:'tx',nom:'TX',type:true,noeuds:base.noeuds.filter(n=>n!=='armement'),liens:base.liens.filter(l=>l.de!=='armement'&&l.vers!=='armement')});
     s.parcoursClasse={...(s.parcoursClasse||{})};
     for(const c of Sim.ateliers.classes.filter(c=>c.cie==='TX'))s.parcoursClasse[c.id]='tx';},''));await attendre();
   let f=await fiche();
   assert.ok((await cases()).includes('TX'),version+' : cochée dans une équipe, TX garde sa case');
   assert.match(await f.locator('.mu-arm-equipe').innerText(),/TX : armée parce qu’une équipe l’a cochée, alors qu’aucun de ses chemins ne passe par/);
   assert.equal(await f.locator('.mu-arm-reprendre').count(),0,version+' : son chemin sans armement n’est pas « à reprendre »');
   assert.match(await f.locator('.mu-arm-ok').innerText(),/Dans chaque chemin qui passe par lui/);
   // Plus de colonne « Armée ».
   assert.deepEqual((await f.locator('.mu-cat-table thead th').allInnerTexts()).map(t=>t.trim()),['Compagnie','Heures par vol','Vols du jour','Sur la journée']);
   assert.equal(await f.locator('[data-mu-cat-arme]').count(),0);
   const aCocher=async()=>{const m=(await f.innerText()).match(/(\d+) compagnies? à cocher dans une équipe/);return m?+m[1]:0;};
   const avant=await aCocher();

   // 2. Décochée dans l'équipe : ni chemin, ni équipe — pas d'armement. Pas de case, rien à cocher
   //    ni à remplir pour elle ; la fiche la nomme ; le handling ne l'attend pas.
   // Sa ligne quitte la grille aussitôt : un clic, pas « décocher et vérifier ».
   await f.locator(`table[data-mu-equipe="ar"] [data-mu-cocher="TX/@${code}"]`).click();await attendre();
   f=await fiche();
   assert.ok(!(await cases()).includes('TX'),version+' : plus de case TX');
   assert.deepEqual(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.id==='ar').lots),[['AF/@'+code]]);
   assert.match(await f.locator('.mu-arm-hors').innerText(),/Sans armement : TX\. Aucun de ses chemins ne passe par .+ et aucune équipe ne l’a cochée : le handling charge ses vols sans l’attendre/);
   assert.equal(await f.locator('.mu-arm-equipe').count(),0);
   assert.equal(await f.locator('.mu-arm-reprendre').count(),0,version+' : rien à reprendre');
   assert.equal(await f.locator(`[data-mu-cocher="TX/@${code}"]`).count(),0,version+' : rien à cocher pour TX');
   assert.equal(await f.locator('.mu-cat-table tbody th',{hasText:/^TX$/}).count(),0,version+' : pas d’heures par vol à remplir pour TX');
   assert.equal(await aCocher(),avant,version+' : TX ne s’ajoute pas aux compagnies à cocher');
   const r=await page.evaluate(c=>{const R=Sim.ateliers.resultat;return {cas:R.classes.some(x=>x.id==='TX/@'+c),alertes:R.anomalies.filter(a=>/TX\/@/.test(a.message||'')).length};},code);
   assert.deepEqual(r,{cas:false,alertes:0},version+' : le calcul n’a pas de case TX à l’armement');

   // 3. Excel : plus de colonne « Armée ».
   const parCie=await page.evaluate(()=>OrlyEchanges.ateliersVersClasseur(Sim.ateliers.state,{services:Sim.ateliers.a.services(),classes:Sim.ateliers.classes}).find(x=>x.nom==='Par compagnie').lignes[0]);
   assert.deepEqual(parCie,['Service','Compagnie','Heures par vol']);

   // 4. L'armement remis dans son chemin : TX en a un, et elle est à cocher dans une équipe.
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const p=Sim.ateliers.state.parcours.find(x=>x.id==='tx');
     p.noeuds=p.noeuds.concat(['armement']);p.liens=p.liens.concat([{de:'armement',vers:'quais'}]);},''));await attendre();
   f=await fiche();
   assert.ok((await cases()).includes('TX'),version+' : la case TX revient');
   assert.equal(await f.locator('.mu-arm-hors').count(),0);
   assert.equal(await aCocher(),avant+1,version+' : TX est à cocher dans une équipe');
   assert.deepEqual(errors,[],version+' : '+errors.join(' | '));
  }
  console.log('sans-armement-browser : ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

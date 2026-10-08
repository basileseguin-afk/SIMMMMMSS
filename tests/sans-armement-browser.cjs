/* « Tu pars du principe que le handling doit recevoir l'armement pour partir,
 * mais il y a des compagnies qui n'ont pas d'armement » (retour d'usage du
 * 08/10). Dans la fiche de l'armement, chaque compagnie a sa case « Armée » :
 * décochée, elle n'a plus de case d'armement (ni à cocher, ni à remplir), sa
 * case quitte les équipes, le handling charge ses vols sans l'attendre, et un
 * chemin qu'elle seule suit n'est plus « à reprendre ». Recochée, elle revient.
 * Excel garde le réglage. v1 et v2. */
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
   // Un handling, un armement par compagnie qui arme AF et TX.
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const s=Sim.ateliers.state;
     s.ateliers.push({id:'h',nom:'Quais',service:'quais',type:'handling',debut:'04:00',jour:0,personnes:2,pauses:[],lots:[],regime:{actif:true},durees:{'*':20}},
       {id:'ar',nom:'Armement matin',service:'armement',type:'manuel',debut:'04:00',jour:0,personnes:2,pauses:[],lots:[['AF/YC'],['TX/YC']],regime:{actif:true}});},''));
   await page.reload();await attendre();
   const code=await page.evaluate(()=>Sim.ateliers.state.categories.armement[0].id);
   await nav.aller(page,'mu-services');await page.locator('[data-mu-choisir=armement]').click();await attendre();
   const ligne=cie=>page.locator('#mu-services .mu-cat-table tbody tr').filter({has:page.locator('th',{hasText:new RegExp('^'+cie+'$')})});
   assert.equal(await ligne('TX').locator('[data-mu-cat-arme]').isChecked(),true,version+' : armée par défaut');
   const avant=await page.evaluate(()=>Sim.ateliers.classesDe('armement').map(c=>c.cie));
   assert.ok(avant.includes('TX'),version+' : TX a sa case');

   // 1. TX n'a pas d'armement : pas de case, elle quitte l'équipe, le handling ne l'attend pas.
   await ligne('TX').locator('[data-mu-cat-arme]').uncheck();await attendre();
   const r=await page.evaluate(c=>({sans:Sim.ateliers.state.categories.armement[0].sans,cases:Sim.ateliers.classesDe('armement').map(x=>x.cie),
     lots:Sim.ateliers.state.ateliers.find(a=>a.id==='ar').lots,alertes:Sim.ateliers.resultat.anomalies.filter(a=>/TX\/@/.test(a.message||'')).length}),code);
   assert.deepEqual(r.sans,['TX'],version+' : gardée dans le réglage');
   assert.ok(!r.cases.includes('TX'),version+' : plus de case TX');
   assert.deepEqual(r.lots,[['AF/@'+code]],version+' : sa case quitte l’équipe');
   assert.equal(r.alertes,0,version+' : aucune alerte pour TX à l’armement');
   assert.match(await ligne('TX').innerText(),/pas d’armement/);
   assert.equal(await page.locator(`#mu-services table[data-mu-equipe="ar"] [data-mu-cocher="TX/@${code}"]`).count(),0,version+' : rien à cocher pour TX');
   assert.match(await page.locator('#mu-services .mu-arm-sans').innerText(),/Sans armement : TX/);

   // 2. Excel garde le réglage (Armée : non).
   const f=await page.evaluate(()=>OrlyEchanges.ateliersVersClasseur(Sim.ateliers.state,{services:Sim.ateliers.a.services(),classes:Sim.ateliers.classes}).find(x=>x.nom==='Par compagnie').lignes);
   assert.ok(f.some(l=>l[1]==='TX'&&l[3]==='non'),version+' : '+JSON.stringify(f));

   // 3. Recochée : la case revient, à cocher dans une équipe.
   await ligne('TX').locator('[data-mu-cat-arme]').check();await attendre();
   assert.equal(await page.evaluate(()=>Sim.ateliers.state.categories.armement[0].sans),undefined);
   assert.ok((await page.evaluate(()=>Sim.ateliers.classesDe('armement').map(c=>c.cie))).includes('TX'),version+' : la case TX revient');
   assert.deepEqual(errors,[],version+' : '+errors.join(' | '));
  }
  console.log('sans-armement-browser : ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

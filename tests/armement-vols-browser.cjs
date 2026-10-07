/* « L'armement dépend du nombre de vols de la compagnie » (retour d'usage du
 * 07/10). Un service qui travaille par compagnie n'est jamais constant : ses
 * minutes par vol × les vols de chaque compagnie font le travail, et les
 * personnes de ses équipes s'en déduisent. Un ancien choix « constant » s'efface.
 * La fiche le montre : vols du jour et travail de la journée par compagnie.
 * Saisir une minute ne lève plus d'erreur de page. v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(300);
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   // Un handling, et un armement qu'un ancien réglage disait constant (service et équipe).
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const s=Sim.ateliers.state;
     s.ateliers.push({id:'h',nom:'Quais',service:'quais',type:'handling',debut:'04:00',jour:0,personnes:2,pauses:[],lots:[],regime:{actif:true},durees:{'*':20}},
       {id:'ar',nom:'Armement matin',service:'armement',type:'manuel',debut:'04:00',jour:0,personnes:2,effectif:'fixe',pauses:[],lots:[['AF/YC'],['TX/YC']],regime:{actif:true}});},''));
   await page.reload();await attendre();
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const s=Sim.ateliers.state;s.effectifs={...(s.effectifs||{}),armement:'fixe'};
     s.ateliers.find(a=>a.id==='ar').effectif='fixe';s.categories.armement[0].minutes={'*':20};},''));await attendre();

   // 1. Jamais constant : le choix s'efface, le travail suit les vols de chaque compagnie.
   const r=await page.evaluate(()=>{const A=Sim.ateliers,a=A.state.ateliers.find(x=>x.id==='ar');
     const vols=c=>A.classesDe('armement').filter(k=>k.cie===c).reduce((n,k)=>n+k.vols.length,0);
     return {effectif:a.effectif,svc:(A.state.effectifs||{}).armement,constant:A.effectifConstant('armement'),dep:A.dependDesVols(a),
       eff:A.resultat.effectifs.ar,af:vols('AF'),tx:vols('TX'),
       lots:A.resultat.lots.filter(l=>l.service==='armement').map(l=>({c:l.classes[0],hm:l.hommeMinutes}))};});
   assert.equal(r.effectif,undefined,version+' : le choix « constant » de l’équipe s’efface');
   assert.notEqual(r.svc,'fixe',version+' : celui du service aussi');
   assert.ok(!r.constant&&r.dep,version+' : l’armement dépend des vols');
   assert.ok(r.af>0&&r.tx>0,version+' : AF et TX ont des vols');
   assert.deepEqual(r.lots.map(l=>l.hm).sort((a,b)=>a-b),[20*r.tx,20*r.af].sort((a,b)=>a-b),version+' : minutes par vol × vols de la compagnie');
   assert.equal(r.eff.hommeMinutes,20*(r.af+r.tx),version+' : '+JSON.stringify(r.eff));

   // 2. Plus de minutes par vol : plus de monde.
   const p=await page.evaluate(()=>{Sim.ateliers.changer(()=>{Sim.ateliers.state.categories.armement[0].minutes={'*':300};},'');
     return Sim.ateliers.resultat.effectifs.ar;});
   assert.equal(p.personnes,Math.ceil(300*(r.af+r.tx)/p.poste),version+' : '+JSON.stringify(p));

   // 3. La fiche : pas de case « Effectif constant », les vols du jour et la journée par compagnie.
   await nav.aller(page,'mu-services');await page.locator('[data-mu-choisir=armement]').click();await attendre();
   assert.equal(await page.locator('#mu-services [data-mu-effectif]').count(),0,version+' : pas de case « constant »');
   assert.match(await page.locator('#mu-services .mu-par-vols').innerText(),/vols de chaque compagnie/);
   assert.equal(await page.locator('#mu-services [data-at=ar] select[data-at-champ=effectif] option[value=fixe]').count(),0,version+' : pas de choix « constant » pour l’équipe');
   const af=page.locator('#mu-services .mu-cat-table tbody tr').filter({has:page.locator('th',{hasText:/^AF$/})});
   assert.equal((await af.locator('.mu-cat-vols').innerText()).trim(),String(r.af));
   assert.match(await af.locator('.mu-cat-jour').innerText(),new RegExp('300 × '+r.af+' ='));

   // 4. Saisir des minutes pour une compagnie : enregistré, sans erreur de page.
   const champ=page.locator('#mu-services [data-mu-cat-min][data-cie=AF]');
   await champ.fill('30');await champ.press('Tab');await attendre();
   assert.equal(await page.evaluate(()=>Sim.ateliers.state.categories.armement[0].minutes.AF),30);
   assert.match(await page.locator('#mu-services .mu-cat-table tbody tr').filter({has:page.locator('th',{hasText:/^AF$/})}).locator('.mu-cat-jour').innerText(),new RegExp('30 × '+r.af+' ='));
   assert.deepEqual(errors,[],version+' : '+errors.join(' | '));
  }
  console.log('armement-vols-browser : ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

/* « La cuisine chaude et la cuisine travaillent en parallèle : il me faut une
 * option pour le dire » (retour d'usage du 08/10 ; la cuisine chaude est un
 * atelier unique qui fait les compagnies cochées). Dans sa fiche, « Il
 * travaille en même temps que… Cuisine » : dans chaque chemin qui a les deux,
 * plus de flèche entre eux ; la cuisine chaude reçoit ce que reçoit la cuisine
 * et livre ce qu'elle livre ; l'étape d'après attend les deux. Une compagnie
 * cochée plus tard s'y range d'elle-même. « Annuler » revient en arrière. v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(350);
 const M='#mu-services';
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   // 1. La cuisine chaude : un service à part entière, près de la cuisine ; un seul atelier, pour AF.
   await nav.aller(page,'mu-services');
   const form=page.locator(`${M} [data-mu-nouveau]`);
   await form.locator('[name=nom]').fill('Cuisine chaude');await form.locator('[name=parent]').selectOption('cuisine');
   await form.locator('button[type=submit]').click();await attendre();
   const id=await page.evaluate(()=>Sim.editor.state.zones.find(v=>v.nom==='Cuisine chaude').id);
   await page.locator(`${M} [data-mu-choisir="${id}"]`).click();await attendre();
   await page.locator(`${M} [data-mu-nature="${id}"]`).selectOption('atelier');await attendre();
   await page.locator(`${M} [data-mu-atelier-cie="AF"]`).check();await attendre();
   // Le chemin d'AF Business (le flux de sa classe) : la cuisine chaude y est, quelque part.
   const chemin=()=>page.evaluate(()=>{const st=Sim.ateliers.state,p=OrlyParcours.fluxDe(st,Sim.ateliers.classes.find(c=>c.id==='AF/BC'));
     return {id:p.id,noeuds:p.noeuds.slice(),liens:p.liens.map(l=>l.de+'>'+l.vers).sort()};});
   const c0=await chemin();
   assert.ok(c0.noeuds.includes(id)&&c0.noeuds.includes('cuisine'),version+' : la cuisine chaude est dans le chemin d’AF Business '+JSON.stringify(c0));

   // 2. « En même temps que la Cuisine », dans l'avancé de la fiche (étape 7).
   await page.locator(`${M} [data-mu-section=avance] > summary`).click();await attendre();
   await page.locator(`${M} [data-mu-parallele="${id}"]`).selectOption('cuisine');await attendre();
   assert.match(await page.locator(`${M} [data-mu-section=avance] > summary`).innerText(),/en même temps que Cuisine/,version+' : l’avancé le dit, replié ou non');
   const c1=await chemin();
   const preds=(c,n)=>c.liens.filter(l=>l.endsWith('>'+n)).map(l=>l.split('>')[0]).sort();
   const succs=(c,n)=>c.liens.filter(l=>l.startsWith(n+'>')).map(l=>l.split('>')[1]).sort();
   assert.ok(!c1.liens.includes('cuisine>'+id)&&!c1.liens.includes(id+'>cuisine'),version+' : plus de flèche entre elles '+JSON.stringify(c1.liens));
   assert.deepEqual(preds(c1,id),preds(c1,'cuisine'),version+' : les mêmes livraisons');
   assert.deepEqual(succs(c1,id),succs(c1,'cuisine'),version+' : les mêmes étapes après');
   assert.ok(succs(c1,'cuisine').length>0,version+' : la cuisine livre toujours quelqu’un');
   assert.equal(await page.evaluate(()=>JSON.stringify(Sim.ateliers.state.paralleles)),JSON.stringify({[id]:'cuisine'}));
   assert.match(await page.locator(`${M} .mu-parallele`).innerText(),/En parallèle de Cuisine/i);
   // Le calcul : l'étape d'après attend les deux (rien ne l'oblige à attendre l'une après l'autre).
   const r=await page.evaluate(()=>({ok:Sim.ateliers.resultat.ok,boucle:Sim.ateliers.resultat.anomalies.filter(a=>/boucle|cycle/i.test(a.code+a.message)).length}));
   assert.equal(r.boucle,0,version+' : pas de boucle');

   // 3. Une compagnie cochée ensuite : la cuisine chaude se range d'elle-même à côté de la cuisine.
   await page.locator(`${M} [data-mu-atelier-cie="TX"]`).check();await attendre();
   const tx=await page.evaluate(id=>{const st=Sim.ateliers.state,ps=[...new Set(Sim.ateliers.classes.filter(c=>c.cie==='TX').map(c=>OrlyParcours.fluxDe(st,c)).filter(Boolean))];
     return ps.filter(p=>p.noeuds.includes(id)&&p.noeuds.includes('cuisine')).map(p=>p.liens.filter(l=>(l.de===id&&l.vers==='cuisine')||(l.de==='cuisine'&&l.vers===id)).length);},id);
   assert.ok(tx.every(n=>n===0),version+' : pas de flèche entre elles dans les chemins de TX '+JSON.stringify(tx));

   // 4. « Annuler » revient en arrière ; « aucun » garde les chemins tels quels.
   await page.locator(`${M} [data-mu-parallele="${id}"]`).selectOption('');await attendre();
   assert.equal(await page.evaluate(()=>Sim.ateliers.state.paralleles),undefined);
   assert.deepEqual((await chemin()).liens.filter(l=>l.includes(id)).length>0,true);
   assert.deepEqual(errors,[],version+' : '+errors.join(' | '));
  }
  console.log('parallele-browser : ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

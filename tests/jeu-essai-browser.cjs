/* Le jeu de démonstration suit l'unité (retour d'usage du 02/10 : « supprime
 * QR et DL de la simulation et rajoute des vols des compagnies que j'utilise
 * pour la prépa, comme ça je peux bien paramétrer l'armement »). Un état
 * enregistré qui cite QR, DL, EZY, RAM et DAH : au chargement, QR et DL s'en
 * vont (une fois, annulable) ; EZY, RAM et DAH reçoivent des vols d'essai et
 * leur case d'armement. v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   // L'état d'un utilisateur d'avant : des cases QR et DL, EZY ajoutée, RAM et DAH cochées au Montage.
   await page.evaluate(()=>{const st=JSON.parse(JSON.stringify(Sim.ateliers.state));
     st.ajoutees=[{cie:'EZY',cabine:'YC'},{cie:'QR',cabine:'BC'}];st.exclues=['DL/CREW'];
     st.ateliers.push({id:'mo',nom:'Montage',service:'prepa',type:'manuel',debut:'05:00',jour:0,personnes:3,pauses:[],
       lots:[['AF/YC','QR/YC'],['RAM/YC','DAH/YC'],['DL/BC']],regime:{actif:true}});
     st.ateliers.push({id:'h',nom:'Quais',service:'quais',type:'handling',debut:'04:00',jour:0,personnes:2,pauses:[],lots:[],regime:{actif:true},
       durees:{'*':20,QR:40},compagnies:['AF','QR','DL','EZY']});
     st.parcoursClasse=Object.assign({},st.parcoursClasse,{'QR/YC':'complet'});st.migrations=(st.migrations||[]).filter(m=>m!=='sans-qr-dl');
     localStorage.setItem('ory-ateliers-v1',JSON.stringify(st));});
   await page.reload();await attendre();

   // 1. QR et DL sont sorties de l'état, une fois.
   const st=await page.evaluate(()=>Sim.ateliers.state);
   const cite=JSON.stringify([st.ateliers,st.ajoutees,st.exclues,st.parcoursClasse]);
   assert.ok(!/"(QR|DL)\//.test(cite)&&!/"(QR|DL)"/.test(cite),version+' : plus de QR ni de DL '+cite);
   assert.deepEqual(st.ateliers.find(a=>a.id==='mo').lots,[['AF/YC'],['RAM/YC','DAH/YC']],version+' : leurs cases parties, les autres gardées');
   assert.deepEqual(st.ateliers.find(a=>a.id==='h').durees,{'*':20},version+' : leurs réglages aussi');
   assert.ok(st.migrations.includes('sans-qr-dl'));
   assert.match(await page.locator('#at-status').textContent(),/QR et DL retirées de la simulation/);

   // 2. Des vols d'essai pour EZY, RAM et DAH ; aucun pour QR ni DL.
   const vols=await page.evaluate(()=>Sim.ateliers.a.vols().map(v=>({cie:v.cie,sens:v.sens,essai:!!v.essai})));
   assert.ok(!vols.some(v=>/^(QR|DL)$/.test(v.cie)),version+' : ni QR ni DL dans le programme');
   for(const c of ['DAH','EZY','RAM'])
     assert.deepEqual(vols.filter(v=>v.cie===c).map(v=>v.sens+(v.essai?'*':'')),['DEP*','DEP*','RET*'],version+' : '+c);
   assert.match(await page.locator('#source-label').textContent(),/Jeu de démonstration \+ vols d’essai : DAH, EZY, RAM/);
   const cmds=await page.evaluate(()=>Sim.ateliers.classes.map(c=>c.id));
   for(const c of ['EZY/YC','RAM/YC','DAH/YC'])assert.ok(cmds.includes(c),version+' : la commande '+c);

   // 3. Leur case d'armement, une fois l'armement dans les chemins.
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;st.categories={armement:[{id:'ARM',nom:'Armement',minutes:{'*':10}}]};
     OrlyParcours.integrerArmement(st,['armement'],['quais']);},''));await attendre();
   const arm=await page.evaluate(()=>Object.fromEntries(Sim.ateliers.classesDe('armement').map(c=>[c.cie,c.vols.length])));
   for(const c of ['DAH','EZY','RAM'])assert.equal(arm[c],2,version+' : '+c+' s’arme sur ses deux départs');
   assert.ok(!('QR' in arm)&&!('DL' in arm));

   // 4. Une compagnie de plus, cochée à la main : ses vols arrivent sans recharger.
   await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id==='mo').lots.push(['ABC/BC']);},''));await attendre();
   assert.equal(await page.evaluate(()=>Sim.ateliers.a.vols().filter(v=>v.cie==='ABC'&&v.sens==='DEP'&&v.bc>0&&!v.yc).length),2,version+' : ABC, en Business seulement');

   // 5. Rechargé : le nettoyage ne repasse pas, les vols d'essai sont toujours là.
   await page.reload();await attendre();
   assert.equal(await page.evaluate(()=>Sim.ateliers.state.migrations.filter(m=>m==='sans-qr-dl').length),1);
   assert.match(await page.locator('#source-label').textContent(),/vols d’essai : ABC, DAH, EZY, RAM/);
   for(const p of ['v-programme','mu-services','at-chemins','rg-recap'])await nav.aller(page,p);
  }
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('jeu-essai-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

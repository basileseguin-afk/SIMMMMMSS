/* Données › Récap des cases : toutes les cases d'un coup d'œil, ce que
 * chacune traite dans l'ordre (tâche unique, à la suite, ensemble), et
 * l'heure de départ réglable ici ; un fichier Excel de paramétrage. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const T=require('../tableur.js');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 const kase=id=>page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id),id);
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  // Trois cases : une tâche unique, deux commandes à la suite, deux ensemble ; et une plonge.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
    const c=(id,nom,service,debut,lots)=>({id,nom,service,type:'manuel',debut,jour:0,personnes:3,pauses:[],lots,regime:{actif:true}});
    st.ateliers.push(c('u1','Cuisine AF BC','cuisine','04:00',[['AF/BC']]),c('s1','Dotation matin','dotation','03:00',[['AF/BC'],['TX/BC']]),
      c('e1','Montage PC','prepa','05:00',[['AF/PC','DL/PC']]),
      {id:'pl',nom:'Plonge',service:'plonge',type:'lavage',debut:'06:00',jour:0,personnes:2,pauses:[],lots:[],regime:{actif:true},plafond:0,tunnels:[{nom:'T1',debit:300,personnes:1,actif:true}]});},''));

  // 1. Dans Données : une ligne par case, service par service.
  await nav.aller(page,'at-recap');
  assert.equal(await page.evaluate(()=>document.body.dataset.partie),'donnees');
  assert.equal(await page.locator('.rc-case').count(),await page.evaluate(()=>Sim.ateliers.state.ateliers.length));
  assert.ok(await page.locator('.rc-svc').count()>=4,'un en-tête par service');
  const ligne=id=>page.locator(`tr.rc-case[data-at="${id}"]`);
  assert.match(await ligne('u1').locator('.rc-type').innerText(),/tâche unique/);
  assert.match(await ligne('s1').locator('.rc-type').innerText(),/2 à la suite/);
  assert.match(await ligne('e1').locator('.rc-type').innerText(),/tâche unique[\s\S]*ensemble/);
  assert.equal(await ligne('e1').locator('.rc-seq li.ens .rc-cmd').count(),2,'deux commandes sur une même ligne, ensemble');
  assert.match(await ligne('s1').locator('.rc-seq').innerText(),/AF BC[\s\S]*\d\d:\d\d–\d\d:\d\d[\s\S]*→[\s\S]*TX BC/,'dans l’ordre, avec leurs heures');
  assert.match(await ligne('pl').locator('.rc-traite').innerText(),/lave les retours/);

  // 2. L'heure et le jour de départ se règlent ici ; le calcul suit.
  const h=ligne('s1').locator('input[data-at-champ=debut]');
  await h.fill('02:30');await h.dispatchEvent('change');await attendre();
  assert.equal((await kase('s1')).debut,'02:30');
  await ligne('s1').locator('select[data-at-champ=jour]').selectOption('-1');await attendre();
  assert.equal((await kase('s1')).jour,-1);
  assert.match(await ligne('s1').locator('.rc-quand').first().innerText(),/J-1 02:30/,'les heures de ses lignes suivent');
  await page.locator('#rc-undo').click();await attendre();
  assert.equal((await kase('s1')).jour,0,'Annuler');

  // 3. Chercher une compagnie, une case ou un service.
  await page.fill('#rc-filtre','plonge');await attendre();
  assert.equal(await page.locator('.rc-case').count(),1);
  await page.fill('#rc-filtre','');await attendre();

  // 4. Le fichier de paramétrage : exporté, modifié dans « Excel », réimporté.
  const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('#rc-export').click()]);
  const fichier=path.join(os.tmpdir(),'cases-'+process.pid+'.xlsx');await dl.saveAs(fichier);
  const feuilles=await T.lireClasseur(fs.readFileSync(fichier));
  const g=feuilles.find(f=>f.nom==='Cases').lignes;
  const r=g.find(l=>l[0]==='Dotation matin');
  assert.equal(r[6],'AF/BC → TX/BC');
  r[4]='01:45';r[5]=5;r[6]='TX/BC → AF/BC + DL/BC';
  fs.writeFileSync(fichier,T.ecrireClasseur(feuilles));
  await page.setInputFiles('#rc-import',fichier);await page.waitForTimeout(600);
  const k=await kase('s1');
  assert.deepEqual([k.debut,k.personnes,k.lots],['01:45',5,[['TX/BC'],['AF/BC','DL/BC']]]);
  fs.unlinkSync(fichier);

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('recap-cases-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

/* Les équipes d'un coup d'œil : ce que chacune prépare, dans l'ordre (une commande, plusieurs à la suite, plusieurs
 * ensemble), son heure et son jour d'arrivée ; un fichier Excel de paramétrage.
 * Évolution 22 (b) : la vue d'ensemble « Horaires des équipes » a quitté l'écran — tous les horaires d'un coup, c'est
 * son classeur, dans « Fichiers » ; à l'écran, les équipes d'un service sont le tableau de sa fiche (« Services et
 * équipes »), et l'heure d'une équipe se règle dans la sienne. */
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
  await page.waitForTimeout(200);await nav.effectifSaisi(page);   // les personnes se saisissent ici (05/10)
  // Trois cases : une tâche unique, deux commandes à la suite, deux ensemble ; et une plonge.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
    const c=(id,nom,service,debut,lots)=>({id,nom,service,type:'manuel',debut,jour:0,personnes:3,pauses:[],lots,regime:{actif:true}});
    st.ateliers.push(c('u1','Cuisine AF BC','cuisine','04:00',[['AF/BC']]),c('s1','Dotation matin','dotation','03:00',[['AF/BC'],['TX/BC']]),
      c('e1','Montage PC','prepa','05:00',[['AF/PC','FWI/PC']]),
      {id:'pl',nom:'Plonge',service:'plonge',type:'lavage',debut:'06:00',jour:0,personnes:2,pauses:[],lots:[],regime:{actif:true},plafond:0,tunnels:[{nom:'T1',debit:300,personnes:1,actif:true}]});},''));

  // 1. Service par service : une ligne par équipe, dans le tableau « Ses équipes » de la fiche du service.
  await nav.aller(page,'mu-services');
  assert.equal(await page.evaluate(()=>document.body.dataset.partie),'organisation');
  assert.equal(await page.locator('.rc-case, .rc-table, #rc-filtre').count(),0,'la vue d’ensemble n’est plus à l’écran');
  const lignes=async svc=>{await nav.service(page,svc);return page.locator('#mu-services .se-equipes tbody tr').evaluateAll(ts=>ts.map(t=>[...t.cells].map(c=>c.innerText.trim())));};
  let vues=0;
  for(const svc of await page.evaluate(()=>[...new Set(Sim.ateliers.state.ateliers.map(a=>a.service))])){
    const n=await page.evaluate(svc=>Sim.ateliers.state.ateliers.filter(a=>a.service===svc).length,svc);
    assert.equal((await lignes(svc)).length,n,svc+' : une ligne par équipe');vues+=n;
  }
  assert.equal(vues,await page.evaluate(()=>Sim.ateliers.state.ateliers.length),'toutes les équipes, service par service');
  assert.deepEqual((await lignes('cuisine')).find(l=>l[0]==='Cuisine AF BC'),['Cuisine AF BC','04:00','J','3 pers.','AF BC'],'une commande');
  assert.deepEqual((await lignes('dotation')).find(l=>l[0]==='Dotation matin'),['Dotation matin','03:00','J','3 pers.','AF BC, TX BC'],'deux commandes');
  assert.deepEqual((await lignes('prepa')).find(l=>l[0]==='Montage PC'),['Montage PC','05:00','J','3 pers.','AF PC, FWI PC']);
  assert.match((await lignes('plonge')).find(l=>l[0]==='Plonge')[4],/lave les retours/);
  // Dans la fiche de l'équipe : l'ordre de ses commandes — à la suite (1, 2), ou ensemble (sur une même ligne).
  const ordre=async id=>{await nav.equipe(page,id);return page.locator('#mu-services .se-equipe .mu-ordre .mu-ordre-cmd').evaluateAll(xs=>xs.map(x=>[...x.querySelectorAll('[data-mu-chemin]')].map(b=>b.dataset.muChemin)));};
  assert.deepEqual(await ordre('u1'),[['AF/BC']],'une seule commande');
  assert.deepEqual(await ordre('s1'),[['AF/BC'],['TX/BC']],'deux à la suite, dans l’ordre');
  assert.deepEqual(await ordre('e1'),[['AF/PC','FWI/PC']],'deux commandes sur une même ligne, ensemble');
  assert.equal(await page.locator('#mu-services .se-equipe').innerText().then(t=>/\d\d:\d\d–\d\d:\d\d|→ fin/.test(t)),false,'sans les heures calculées : ce sont des résultats');

  // 2. L'heure et le jour d'arrivée se règlent dans la fiche de l'équipe ; le tableau du service suit.
  await nav.equipe(page,'s1');
  const h=page.locator('#mu-services .se-equipe [data-at-champ=debut]').first();
  await h.fill('02:30');await h.dispatchEvent('change');await attendre();
  assert.equal((await kase('s1')).debut,'02:30');
  await page.locator('#mu-services .se-equipe select[data-at-champ=jour]').first().selectOption('-1');await attendre();
  assert.equal((await kase('s1')).jour,-1);
  assert.deepEqual((await lignes('dotation')).find(l=>l[0]==='Dotation matin').slice(1,3),['02:30','J-1'],'la ligne de l’équipe suit');
  await page.locator('#btn-annuler').click();await attendre();
  assert.equal((await kase('s1')).jour,0,'Annuler');

  // 3. (Chercher une compagnie, une équipe ou un service dans la vue d'ensemble : la liste des services, à gauche, la
  //    remplace — un service, ses équipes.)

  // 4. Le fichier de paramétrage : exporté, modifié dans « Excel », réimporté — depuis « Fichiers ».
  await nav.aller(page,'u-sauvegarde');
  const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('#fi-classeurs tr[data-classeur=equipes] #rc-export').click()]);
  const fichier=path.join(os.tmpdir(),'cases-'+process.pid+'.xlsx');await dl.saveAs(fichier);
  const feuilles=await T.lireClasseur(fs.readFileSync(fichier));
  const g=feuilles.find(f=>f.nom==='Récap des équipes').lignes;
  assert.equal(g.length-1,await page.evaluate(()=>Sim.ateliers.state.ateliers.length),'tous les horaires d’un coup : une ligne par équipe');
  const r=g.find(l=>l[0]==='Dotation matin');
  assert.equal(r[6],'AF/BC → TX/BC');
  assert.equal(g.find(l=>l[0]==='Montage PC')[6],'AF/PC + FWI/PC','« à la suite » et « ensemble » se lisent dans le classeur');
  r[4]='01:45';r[5]=5;r[6]='TX/BC → AF/BC + FWI/BC';
  fs.writeFileSync(fichier,T.ecrireClasseur(feuilles));
  await page.setInputFiles('#fi-classeurs tr[data-classeur=equipes] #rc-import',fichier);await page.waitForTimeout(600);
  const k=await kase('s1');
  assert.deepEqual([k.debut,k.personnes,k.lots],['01:45',5,[['TX/BC'],['AF/BC','FWI/BC']]]);
  fs.unlinkSync(fichier);
  assert.deepEqual((await lignes('dotation')).find(l=>l[0]==='Dotation matin'),['Dotation matin','01:45','J','5 pers.','TX BC, AF BC, FWI BC'],'la fiche du service suit le classeur');

  // 5. Une commande mène à son chemin, ouvert sur le service de l'équipe
  //    (retour d'usage : « quand je clique sur CRL BC, ça m'emmène sur CRL BC »).
  await nav.equipe(page,'s1');
  await page.locator('#mu-services .se-equipe .mu-ordre [data-mu-chemin="TX/BC"]').click();await attendre();
  // (Évolution 22 c : dans « Chemins », sur le chemin que suit la commande ; le tableau de l'étape la met en évidence.)
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-flux','on arrive sur les chemins');
  assert.deepEqual(await page.evaluate(()=>[Sim.unite.fluxChoisi,Sim.unite.cheminCmd,(Sim.unite.fluxSel||{}).id]),
    [await page.evaluate(()=>OrlyParcours.fluxDe(Sim.ateliers.state,'TX/BC').id),'TX/BC','dotation'],'sur le chemin de TX BC, à la dotation');
  assert.equal(await page.locator('#mu-flux .ch-etape[data-ch-etape=dotation] tr.ch-vise[data-ch-cmd="TX/BC"]').count(),1,'TX BC est la commande en évidence');
  await nav.equipe(page,'e1');
  await page.locator('#mu-services .se-equipe .mu-ordre [data-mu-chemin="FWI/PC"]').click();await attendre();
  assert.deepEqual(await page.evaluate(()=>[document.body.dataset.sous,Sim.unite.cheminCmd]),['mu-flux','FWI/PC'],'une commande « ensemble » aussi');

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('recap-cases-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

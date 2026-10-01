/* Version 2 — Réglages › Calage sur le réel, de bout en bout, sur un mois
 * FICTIF dont on connaît la vérité : le Montage prend 30 % de temps de plus
 * que son barème. Le classeur se télécharge, s'importe, le calage retrouve
 * le facteur et l'applique au barème. */
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(300);
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../v2/index.html')).href);await attendre();
  await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
  // L'unité : une équipe de Montage pour toutes les commandes du jour.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'mo',nom:'Montage matin',service:'prepa',type:'manuel',
    debut:'03:00',jour:0,personnes:3,pauses:[],lots:Sim.ateliers.classes.map(c=>[c.id]),regime:{actif:true}});},''));await attendre();

  // 1. La page, et son classeur modèle.
  await page.locator('#menu [data-vers-partie=reglages]').click();await attendre();
  await page.locator('#sous-onglets [data-sous-onglet=rg-calage]').click();await attendre();
  assert.match(await page.locator('#rg-calage').innerText(),/Le modèle du classeur[\s\S]*Importer le mois/);
  const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('[data-ca=modele]').click()]);
  assert.equal(dl.suggestedFilename(),'calage-modele.xlsx');

  // 2. Un mois fictif : huit jours, plus ou moins chargés ; la vérité : Montage ×1,3.
  const octets=await page.evaluate(()=>{
    const C=OrlyCalage,P=MoteurProduction,at=Sim.ateliers,args=at.argsMoteur(at.state.ateliers);delete args.vols;delete args.classes;
    const vrais={heuresSup:{actif:true,plafond:720}};
    const vols=[['date'].concat(C.COLS_VOLS)],planning=[['date','service','equipe','debut','fin','personnes']],pointages=[['date','service','personne','arrivee','depart']];
    const hh=t=>String(Math.floor(t/60)%24).padStart(2,'0')+':'+String(Math.round(t%60)).padStart(2,'0');
    for(let d=0;d<8;d++){
      const date='2026-09-0'+(d+1),charge=0.7+0.1*d;
      const jv=OrlyDemo.VOLS.map(v=>({...v,yc:Math.round(v.yc*charge),bc:Math.round(v.bc*charge)}));
      for(const v of jv)vols.push([date,v.id,v.cie,v.avion,v.sens,v.sens==='DEP'?hh(v.std):'',v.sens==='RET'?hh(v.sta):'',v.bc,v.pc,v.yc,v.crew||0,v.spml||0]);
      const jour={date,vols:jv,planning:[{service:'prepa',equipe:'Montage matin',debut:180,fin:675,duree:495,personnes:3}],pointages:[]};
      const sup=(C.simulerJour(P,{...args,...vrais},jour,{prepa:1.3}).parService.get('prepa')||{}).sup||0;
      planning.push([date,'Montage','Montage matin','03:00','11:15',3]);
      // Trois personnes : le débordement se partage.
      for(let i=0;i<3;i++)pointages.push([date,'Montage','P'+i,'03:00',hh(675+sup/3)]);
    }
    return Array.from(OrlyTableur.ecrireClasseur([{nom:'Vols',lignes:vols},{nom:'Planning',lignes:planning},{nom:'Pointages',lignes:pointages}]));
  });
  await page.locator('#rg-calage [data-ca=fichier]').setInputFiles({name:'mois.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(octets)});
  await attendre();
  assert.match(await page.locator('#rg-calage .ca-carte').first().innerText(),/8 jour\(s\) — du 2026-09-01 au 2026-09-08/);

  // 3. Le calage : la vitesse cachée est retrouvée.
  await page.locator('[data-ca=lancer]').click();
  await page.waitForSelector('#rg-calage .ca-global',{timeout:120000});
  const k=await page.evaluate(()=>Sim.calage.resultat.facteurs.prepa);
  assert.ok(Math.abs(k-1.3)<=0.08,'facteur trouvé : '+k);
  assert.match(await page.locator('#rg-calage .ca-table').first().innerText(),/MONTAGE[\s\S]*×1,[23]/i);

  // 4. Appliqué au barème : les minutes du Montage sont multipliées.
  const avant=await page.evaluate(()=>JSON.stringify(Sim.reglages.baremeComplet().prepa));
  await page.locator('[data-ca=appliquer]').click();await attendre();
  const apres=await page.evaluate(()=>Sim.reglages.baremeComplet().prepa);
  const a0=JSON.parse(avant),cle=Object.keys(a0)[0];
  assert.ok(Math.abs(apres[cle]-a0[cle]*k)<0.11,'barème calé : '+a0[cle]+' → '+apres[cle]);

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('v2-calage-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

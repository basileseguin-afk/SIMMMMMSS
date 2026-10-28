/* Banc d'essai, évolution 11 — « Réel et calage », dans la page Période (v1).
 * Le parcours avec des fichiers fictifs : une unité fictive (celle de la
 * référence de non-régression), un programme daté fictif, la période simulée,
 * puis :
 *   — (b) l'import du réel (un CSV fictif), le modèle CSV ; la correspondance
 *     faite dans la page (une ligne depuis un rôle, ce qu'elle couvre), les
 *     rôles sans ligne ; les anomalies (une cellule en double, réintégrée) ;
 *     la comparaison par ligne et par mois, celle du module ; l'export JSON de
 *     la correspondance et le classeur ; après rechargement, la correspondance
 *     et les décisions restent, les heures réelles non ;
 *   — (c) « Caler » : le rapport de chaque ligne, celui du module ; le total
 *     de l'unité avant et après ; la feuille « Calage » du classeur.
 * Données fictives ; aucune capture d'écran (le plan est confidentiel). */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const PE=require('../moteur/periode.js'),R=require('../moteur/reel.js'),C=require('../moteur/calage-periode.js'),T=require('../tableur.js');
const REF=require('./non-regression.attendu.json');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const S=REF.scenarios.find(s=>s.nom==='unite-vol');
const hh=t=>(t==null?'':String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0'));
const LIGNE=v=>[v.id,v.cie,v.avion,v.sens,v.sens==='DEP'?hh(v.std):'',v.sens==='RET'?hh(v.sta):'',v.bc,v.pc,v.yc,v.crew,v.spml].join(',');
// Vingt-huit jours fictifs, du 19/10 au 15/11 : les vols de l'unité fictive, un départ de moins un jour sur trois.
const JOURS=PE.joursEntre('2026-10-19','2026-11-15');
const VOLS=JOURS.flatMap((d,i)=>S.args.vols.filter(v=>!(i%3===1&&v.id==='NO101')).map(v=>({...v,date:d})));
const CSV='date,vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_CREW,nb_SPML\n'+VOLS.map(v=>v.date+','+LIGNE(v)).join('\n')+'\n';
const CLE='ory-calage-v1';

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const attendre=(ms=250)=>page.waitForTimeout(ms);
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-calage-page-'));
 const fichier=(nom,texte)=>{const f=path.join(dossier,nom);fs.writeFileSync(f,texte);return f;};
 const telecharger=async fn=>{const [d]=await Promise.all([page.waitForEvent('download'),fn()]);const f=path.join(dossier,d.suggestedFilename());await d.saveAs(f);return f;};
 const B='#pv-reel';
 const reglages=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)||'null'),CLE);
 const bilan=()=>page.evaluate(()=>JSON.parse(JSON.stringify(Sim.periode.resultat.bilan)));
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(500);
  await nav.aller(page,'u-sauvegarde');
  await page.locator('#sauvegarde-import').setInputFiles(fichier('unite-fictive.json',JSON.stringify(S.sauvegarde)));
  const recharge=page.waitForEvent('load');await nav.repondre(page);await recharge;await page.waitForLoadState('load');await attendre(600);
  await nav.aller(page,'v-programme');await page.locator('#imp-vols').setInputFiles(fichier('vols-dates.csv',CSV));
  await page.waitForFunction(()=>document.getElementById('source-label').textContent==='vols-dates.csv');await attendre(150);
  await nav.aller(page,'j-periode');await attendre();

  // 0. Avant tout réel : la vue est là, elle invite à importer.
  assert.match(await page.locator(`${B} .pc-etat`).innerText(),/Aucun réel importé/);
  // Le modèle CSV : fictif, trois jours, deux rôles.
  const modele=await telecharger(()=>page.locator(`${B} [data-cal=modele]`).click());
  assert.equal(fs.readFileSync(modele,'utf8'),R.modeleCsv());

  // 1. La période simulée, puis le réel fictif : un cuisinier et un agent chaque jour, un plongeur sans ligne, un cuisinier en double.
  await page.locator('#journee-periode [data-pv=lancer]').click();
  await page.waitForFunction(()=>Sim.periode.etat()==='a-jour',null,{timeout:120000});
  const b=await bilan(),complets=b.joursTravail.filter(w=>w.complet);
  assert.ok(complets.length>=20,complets.length+' jours complets');
  // Un rôle au nom piégé (du HTML) : il s'affiche en texte, rien ne s'exécute.
  const PIEGE='<img src=x onerror="window.__xss=1">';
  const reelCsv='date;role;heures_titulaires;heures_interim;heures_supp\n'+complets.flatMap((w,i)=>[w.date+';Cuisinier;'+(7*Math.round(w.services.cuisine.charge*0.8)+i%3)+';0;'+(i%4),
    w.date+';Agent;7;0;0',w.date+';Plongeur;14;0;0',w.date+';'+PIEGE+';7;0;0']).join('\n')+'\n'+complets[3].date+';Cuisinier;3;0;0\n';
  await page.locator('#calage-reel').setInputFiles(fichier('reel-fictif.csv',reelCsv));await attendre(400);
  assert.match(await page.locator(`${B} .pc-etat`).innerText(),/reel-fictif\.csv : \d+ lignes, 4 rôles/);
  assert.equal(await page.locator(`${B} img`).count(),0,'le nom piégé reste du texte');
  assert.equal(await page.evaluate(()=>window.__xss),undefined);
  assert.match(await page.locator(`${B} .pc-libres`).innerText(),/<img src=x/);
  // L'import se fait au clavier : un bouton, qui ouvre le choix du fichier.
  assert.equal(await page.locator(`${B} button[data-cal=choisir][data-pour=calage-reel]`).count(),1);
  assert.match(await page.locator(`${B} .pc-libres`).innerText(),/Rôles sans ligne[\s\S]*Agent[\s\S]*Cuisinier[\s\S]*Plongeur/);

  // 2. La correspondance, dans la page : une ligne depuis le rôle « Cuisinier », qui couvre la cuisine ; « Agent », hors simulation.
  await page.locator(`${B} [data-cal=ligne-role][data-role="Cuisinier"]`).click();await attendre();
  await page.locator(`${B} [data-cal-champ=couvre][data-ligne="0"]`).selectOption('services');await attendre();
  const premier=await page.evaluate(()=>Sim.calage.a.services()[0].id);
  if(premier!=='cuisine'){
    await page.locator(`${B} [data-cal-champ=service][data-ligne="0"][value="cuisine"]`).check();await attendre();
    await page.locator(`${B} [data-cal-champ=service][data-ligne="0"][value="${premier}"]`).uncheck();await attendre();
  }
  await page.locator(`${B} [data-cal=ligne-role][data-role="Agent"]`).click();await attendre();
  let r=await reglages();
  assert.deepEqual(r.correspondance.lignes,[{nom:'Cuisinier',roles:['Cuisinier'],services:['cuisine']},{nom:'Agent',roles:['Agent'],hors:true}]);
  assert.match(await page.locator(`${B} .pc-libres`).innerText(),/Plongeur/);
  assert.doesNotMatch(await page.locator(`${B} .pc-libres`).innerText(),/Cuisinier/);
  // Un rôle déjà pris ne se propose pas ; un nom de ligne en double est refusé : l'état reste et le refus se lit.
  await page.locator(`${B} [data-cal=ajouter]`).click();await attendre();
  assert.equal(await page.locator(`${B} [data-cal-champ=ajout-role][data-ligne="2"] option[value="Cuisinier"]`).count(),0,'un rôle déjà pris ne se propose pas');
  const nom=page.locator(`${B} [data-cal-champ=nom][data-ligne="2"]`);
  await nom.fill('Agent');await nom.dispatchEvent('change');await attendre();
  assert.match(await page.locator(`${B} .pc-refus`).innerText(),/Refusé — deux lignes s’appellent « Agent »/);
  assert.equal((await reglages()).correspondance.lignes[2].nom,'Nouvelle ligne','l’état reste');
  await page.locator(`${B} [data-cal=supprimer][data-ligne="2"]`).click();await attendre();
  assert.equal((await reglages()).correspondance.lignes.length,2);
  assert.equal(await page.locator(`${B} .pc-refus`).count(),0,'un geste réussi efface le refus');
  // Le focus reste sur le geste : une case de service cochée, il y est encore.
  const caseCuisine=page.locator(`${B} [data-cal-champ=service][data-ligne="0"][value="cuisine"]`);
  await caseCuisine.focus();await caseCuisine.press('Space');await attendre();
  assert.equal(await page.evaluate(()=>document.activeElement&&document.activeElement.value),'cuisine');
  await page.locator(`${B} [data-cal-champ=service][data-ligne="0"][value="cuisine"]`).check();await attendre();

  // 3. Les anomalies : le cuisinier en double est écarté, avec sa raison ; « Réintégrer » additionne ses lignes.
  const ecartee=page.locator(`${B} .pc-ecartees li[data-cal-cle="${complets[3].date}|Cuisinier"]`);
  assert.match(await ecartee.innerText(),/en double \(lignes \d+, \d+\)/);
  await ecartee.locator('[data-cal=reintegrer]').click();await attendre();
  assert.deepEqual((await reglages()).decisions.reintegres,[complets[3].date+'|Cuisinier']);

  // 3 bis. Écarter un jour depuis la comparaison, jour par jour, puis le rétablir.
  const jourLibre=complets[5].date;
  await page.locator(`${B} [data-cal-comparaison="Cuisinier"] details`).first().evaluate(d=>{d.open=true;});
  await page.locator(`${B} [data-cal-comparaison="Cuisinier"] tr[data-cal-jour="${jourLibre}"] [data-cal=ecarter-jour]`).click();await attendre();
  assert.deepEqual((await reglages()).decisions.ecartes.jours,[jourLibre]);
  assert.equal(await page.locator(`${B} tr[data-cal-jour="${jourLibre}"]`).count(),0,'le jour sort de la comparaison');
  await page.locator(`${B} [data-cal=retablir-jour][data-date="${jourLibre}"]`).click();await attendre();
  assert.deepEqual((await reglages()).decisions.ecartes.jours,[]);

  // 4. La comparaison : celle du module, sur le bilan de la page.
  const attendu=R.comparer(b,R.controler(R.lireReel([{nom:'reel.csv',lignes:T.lireCsv(reelCsv)}]),(await reglages()).decisions),(await reglages()).correspondance);
  const fr=x=>(Math.round(x*100)/100).toLocaleString('fr-FR',{maximumFractionDigits:2});
  assert.equal(await page.locator(`${B} [data-cal-comparaison="Cuisinier"] [data-cal-mae]`).innerText(),fr(attendu.lignes[0].periode.mae));
  assert.equal(await page.locator(`${B} [data-cal-comparaison="Toute l’unité"] [data-cal-mae]`).innerText(),fr(attendu.unite.periode.mae));
  assert.match(await page.locator(`${B} [data-cal-comparaison="Cuisinier"]`).innerText(),/heures supp : [\d,]+ h réelles/);

  // 4 bis (c). « Caler » : le rapport du module, ligne par ligne ; le total de l'unité, avant et après.
  await page.locator(`${B} [data-cal=caler]`).click();await attendre(300);
  const rapport=C.caler(attendu);
  assert.ok(rapport.lignes.every(l=>l.cale),'28 jours : chaque ligne se cale');
  for(const l of rapport.lignes)assert.equal(await page.locator(`${B} [data-cal-rapport="${l.nom}"] [data-cal-retenu]`).innerText(),l.retenu.nom,l.nom);
  assert.equal(await page.locator(`${B} [data-cal-avant]`).innerText(),fr(rapport.unite.avant.mae));
  assert.equal(await page.locator(`${B} [data-cal-apres]`).innerText(),fr(rapport.unite.apres.mae));
  assert.equal(await page.locator(`${B} [data-cal-rapport="Agent"] [data-cal-retenu]`).innerText(),'constante','hors simulation : la constante');
  // L'erreur de chaque découpage laissé de côté : une rangée par semaine, une colonne par modèle, le retenu marqué.
  const cuisinier=rapport.lignes.find(l=>l.nom==='Cuisinier');
  const decoupages=page.locator(`${B} [data-cal-rapport="Cuisinier"] [data-cal-decoupages]`);
  assert.equal(await decoupages.locator('tbody tr').count(),cuisinier.references.moteur.erreurs.parSemaine.length+cuisinier.references.moteur.erreurs.parMois.length);
  assert.equal(await decoupages.locator('thead th').count(),1+2+cuisinier.candidats.length);
  assert.equal(await decoupages.locator('thead th small').count(),1,'le retenu est marqué');
  assert.equal(await decoupages.locator('tbody tr').first().locator('td').first().textContent(),fr(cuisinier.references.moteur.erreurs.parSemaine[0].erreur));

  // 5. Les exports : la correspondance en JSON (avec les décisions), la comparaison en Excel.
  const json=JSON.parse(fs.readFileSync(await telecharger(()=>page.locator(`${B} [data-cal=exporter-correspondance]`).click()),'utf8'));
  assert.deepEqual(json.lignes,(await reglages()).correspondance.lignes);
  assert.deepEqual(json.decisions.reintegres,[complets[3].date+'|Cuisinier']);
  const classeur=await T.lireClasseur(new Uint8Array(fs.readFileSync(await telecharger(()=>page.locator(`${B} [data-cal=exporter]`).click()))));
  assert.deepEqual(classeur.map(f=>f.nom),['Lisez-moi','Réel','Comparaison','Calage']);
  const calage=classeur.find(f=>f.nom==='Calage').lignes;
  assert.ok(calage.some(l=>l[0]==='Cuisinier'&&l[2]==='retenu'&&l[3]===cuisinier.retenu.nom));
  assert.ok(calage.some(l=>l[0]==='Cuisinier'&&l[2]==='référence, une semaine laissée de côté'&&l[3]==='moteur'&&l[l.length-1]===cuisinier.references.moteur.erreurs.parSemaine[0].semaine));

  // 6. La sauvegarde ne garde que des réglages : pas une heure réelle.
  r=await reglages();
  assert.deepEqual(Object.keys(r).sort(),['correspondance','decisions']);
  assert.doesNotMatch(JSON.stringify(r),/heures|titulaires":(?!7)/);
  // « Tout sauvegarder » l'emporte : la partie « calage sur le réel », les mêmes réglages.
  await nav.aller(page,'u-sauvegarde');
  const sv=JSON.parse(fs.readFileSync(await telecharger(()=>page.locator('#sauvegarde-export').click()),'utf8'));
  assert.deepEqual(sv.contenu[CLE],r);
  assert.ok(!JSON.stringify(sv.contenu[CLE]).includes(reelCsv.split('\n')[1].split(';')[2]+';'),'pas une heure du réel');
  await page.reload();await attendre(600);
  // Le programme importé reste en mémoire, comme le réel : on le réimporte.
  await nav.aller(page,'v-programme');await page.locator('#imp-vols').setInputFiles(fichier('vols-dates.csv',CSV));
  await page.waitForFunction(()=>document.getElementById('source-label').textContent==='vols-dates.csv');await attendre(150);
  await nav.aller(page,'j-periode');await attendre();
  assert.deepEqual((await reglages()).correspondance.lignes.map(l=>l.nom),['Cuisinier','Agent'],'la correspondance reste');
  assert.match(await page.locator(`${B} .pc-etat`).innerText(),/Aucun réel importé/,'les heures réelles, non');
  assert.equal(await page.locator(`${B} [data-cal-ligne]`).count(),2);

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('calage-browser : ok');
 }finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});

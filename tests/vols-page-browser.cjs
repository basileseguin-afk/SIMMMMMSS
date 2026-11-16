/* Évolution 19 (e) — la page des vols montre les vols (version 1). Dans
 * « Vols › Programme des vols » :
 *   1. un seul bouton, « Importer des vols » ; les modèles à télécharger sont
 *      dans un menu à côté, qui s'ouvre, donne ses deux modèles et se referme ;
 *   2. sous l'import, le tableau des vols du jour : vol, compagnie, heure de
 *      départ, passagers par classe, trié par heure ; il prend la largeur de
 *      la page ;
 *   3. sa recherche (un numéro de vol, une compagnie) ;
 *   4. le format reconnu pour chacun des trois — le modèle CSV, le CSV daté,
 *      l'export de l'ERP (classeur et CSV) —, dit dans le compte rendu ; le
 *      tableau suit le jour d'un programme daté ;
 *   5. un fichier d'un format inconnu est refusé en le disant, et rien ne
 *      change ;
 *   6. le modèle téléchargé se réimporte : il est reconnu.
 * Données fictives : des compagnies, des vols et des livraisons inventés. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const T=require('../tableur.js'),Z=require('../classeur-compresse.js');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Le modèle CSV : quatre départs dans le désordre, deux à la même heure, et un retour.
const MODELE='vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_CREW,nb_SPML\n'
  +'SU2,SUD,MOYEN,DEP,14:30,,4,0,90,5,1\nNO1,NORD,MOYEN,DEP,06:15,,0,12,100,4,0\nNO2,NORD,GROS,DEP,14:30,,8,20,180,9,2\n'
  +'ES1,EST,MOYEN,DEP,09:00,,0,0,80,4,0\nNO-R1,NORD,MOYEN,RET,,08:00,0,0,100,4,0\n';
// Le CSV daté : deux jours, des vols différents chaque jour.
const DATE='date,vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_CREW,nb_SPML\n'
  +'2031-03-03,NO1,NORD,MOYEN,DEP,06:15,,0,12,100,4,0\n2031-03-03,SU2,SUD,MOYEN,DEP,05:40,,4,0,90,5,0\n'
  +'2031-03-04,ES1,EST,MOYEN,DEP,09:00,,0,0,80,4,0\n';
// L'export de l'ERP : ses en-têtes, deux livraisons fictives.
const TETE=['Date','Delivery No','Flight No','ICAO','ETD','Statut','Guest type','Guest qty'];
const ERP=[TETE,[T.celluleDate('2031-03-05'),'L1','NR 101','NRD','07:30','Delivered','ECONOMY',120],[T.celluleDate('2031-03-05'),'L2','SU 200','SDX','06:10','Delivered','ECONOMY',80]];
const ERP_CSV=TETE.join(',')+'\n05/03/2031,L1,NR 101,NRD,07:30,Delivered,ECONOMY,120\n05/03/2031,L2,SU 200,SDX,06:10,Delivered,ECONOMY,80\n';
const classeur=async feuilles=>Buffer.from(await Z.compresser(T.ecrireClasseur(feuilles)));

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1366,height:768},acceptDownloads:true,reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=250)=>page.waitForTimeout(ms);
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-vols-'));
 const importer=async(nom,contenu,type='text/csv')=>{
   await page.locator('#imp-vols').setInputFiles({name:nom,mimeType:type,buffer:Buffer.isBuffer(contenu)?contenu:Buffer.from(contenu,'utf8')});
   // L'export de l'ERP demande avant de remplacer des vols importés : on répond oui. Puis le compte rendu change.
   const change=()=>{const r=document.getElementById('import-report').textContent;return r!=='Aucun fichier importé.'&&r!==window.__rapportAvant;};
   await page.waitForFunction(()=>!!document.querySelector('dialog.question[open]')||(()=>{const r=document.getElementById('import-report').textContent;
     return r!=='Aucun fichier importé.'&&r!==window.__rapportAvant;})(),null,{timeout:15000});
   if(await page.locator('dialog.question[open]').count())await nav.repondre(page);
   await page.waitForFunction(change,null,{timeout:15000});
   await attendre();
   const r=await page.locator('#import-report').evaluate(e=>({texte:e.textContent,erreur:e.classList.contains('error')}));
   await page.evaluate(t=>{window.__rapportAvant=t;},r.texte);
   return r;
 };
 const lignes=()=>page.locator('#vp-tableau tbody tr').evaluateAll(l=>l.map(tr=>[...tr.children].map(c=>c.textContent)));
 const compte=()=>page.locator('#vp-compte').innerText();
 const source=()=>page.locator('#source-label').innerText();
 const telecharger=async sel=>{const [d]=await Promise.all([page.waitForEvent('download'),page.locator(sel).click()]);const f=path.join(dossier,d.suggestedFilename());await d.saveAs(f);return f;};
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(500);
  await nav.aller(page,'v-programme');

  // 1. Un seul bouton d'import ; les modèles dans un menu, à côté.
  assert.equal(await page.locator('#vols-donnees input[type=file]').count(),1,'un seul bouton d’import');
  assert.equal(await page.locator('#imp-winrest').count(),0,'plus de second import pour l’export de l’ERP');
  assert.match(await page.locator('label:has(#imp-vols)').innerText(),/^Importer des vols$/);
  const menu=page.locator('#vp-modeles');
  assert.equal(await menu.evaluate(d=>d.open),false,'le menu des modèles est fermé');
  assert.match(await menu.locator('summary').innerText(),/^Modèles$/);
  assert.equal(await page.locator('#csv-template').isVisible(),false,'les modèles ne sont plus des boutons de la page');
  const bImport=await page.locator('label:has(#imp-vols)').boundingBox(),bMenu=await menu.locator('summary').boundingBox();
  assert.ok(Math.abs(bImport.y-bMenu.y)<8&&bMenu.x>bImport.x&&bMenu.x-(bImport.x+bImport.width)<24,'le menu est à côté du bouton : '+JSON.stringify([bImport,bMenu]));
  await menu.locator('summary').click();await attendre(150);
  assert.deepEqual(await menu.locator('.at-menu-liste button').evaluateAll(b=>b.map(x=>x.textContent)),
    ['Modèle CSV : les vols d’une journée','Modèle CSV daté : un programme sur plusieurs jours']);
  const fModele=await telecharger('#csv-template');
  assert.equal(path.basename(fModele),'modele-vols-demo.csv');
  assert.equal(await menu.evaluate(d=>d.open),false,'le menu se referme après un choix');
  await menu.locator('summary').click();await attendre(150);
  const fDate=await telecharger('#csv-template-date');
  assert.equal(path.basename(fDate),'modele-vols-dates.csv');
  await menu.locator('summary').click();await attendre(150);
  await page.keyboard.press('Escape');await attendre(150);
  assert.equal(await menu.evaluate(d=>d.open),false,'Échap le referme');
  await menu.locator('summary').click();await attendre(150);
  await page.locator('#vp-titre').click();await attendre(150);
  assert.equal(await menu.evaluate(d=>d.open),false,'un clic ailleurs le referme');

  // 2. Les vols de démonstration sont déjà dans le tableau, par heure de départ.
  const demo=await page.evaluate(()=>Sim.ateliers.a.vols().filter(f=>f.sens==='DEP').map(f=>({id:f.id,std:f.std})).sort((a,b)=>a.std-b.std||a.id.localeCompare(b.id)).map(f=>f.id));
  assert.ok(demo.length>3,'la démonstration a des départs');
  assert.deepEqual((await lignes()).map(l=>l[1]),demo,'les départs de la démonstration, triés par heure');
  assert.equal(await compte(),demo.length+' départs');

  //    Après un import : le format reconnu, puis le tableau — vol, compagnie, heure de départ, passagers par classe.
  let r=await importer('vols-fictifs.csv',MODELE);
  assert.equal(r.erreur,false,r.texte);
  assert.match(r.texte,/^Format reconnu : le modèle CSV \(les vols d’une journée\)\.\n5 lignes importées\. 4 départs et 1 retours\./);
  assert.equal(await source(),'vols-fictifs.csv');
  assert.deepEqual(await page.locator('#vp-tableau thead th').evaluateAll(t=>t.map(x=>x.textContent)),['Départ','Vol','Compagnie','Business','Premium','Économie','Équipage']);
  assert.deepEqual(await lignes(),[
    ['06:15','NO1','NORD','0','12','100','4'],
    ['09:00','ES1','EST','0','0','80','4'],
    ['14:30','NO2','NORD','8','20','180','9'],
    ['14:30','SU2','SUD','4','0','90','5']],'triés par heure de départ, puis par vol ; le retour n’y est pas');
  assert.equal(await compte(),'4 départs');
  //    Il est sous l'import, et prend la largeur de la page.
  const g=await page.evaluate(()=>{const b=s=>document.querySelector(s).getBoundingClientRect(),vue=document.getElementById('view-vols'),st=getComputedStyle(vue);
    return {vue:vue.clientWidth-parseFloat(st.paddingLeft)-parseFloat(st.paddingRight),table:b('#vp-tableau table').width,panneau:b('#vols-donnees .panneau').width,
      basImport:b('#vols-donnees').bottom,hautTable:b('#vols-jour').top,debord:document.documentElement.scrollWidth-document.documentElement.clientWidth};});
  assert.ok(g.hautTable>=g.basImport,'le tableau est sous l’import : '+JSON.stringify(g));
  assert.ok(g.table>=g.vue-4,'le tableau prend la largeur de la page : '+JSON.stringify(g));
  assert.ok(g.panneau>=g.vue-4,'l’import aussi : '+JSON.stringify(g));
  assert.ok(g.debord<=0,'rien ne déborde de la page');

  // 3. La recherche : une compagnie, un numéro de vol, sans casse ; rien trouvé se dit ; vidée, tout revient.
  await page.fill('#vp-recherche','nord');await attendre(150);
  assert.deepEqual((await lignes()).map(l=>l[1]),['NO1','NO2']);
  assert.equal(await compte(),'2 départs sur 4');
  await page.fill('#vp-recherche','su2');await attendre(150);
  assert.deepEqual((await lignes()).map(l=>l[1]),['SU2']);
  assert.equal(await compte(),'1 départ sur 4');
  await page.fill('#vp-recherche','ouest');await attendre(150);
  assert.equal(await page.locator('#vp-tableau table').count(),0);
  assert.equal(await page.locator('#vp-tableau .vp-vide').innerText(),'Aucun vol ne correspond à « ouest ».');
  await page.fill('#vp-recherche','');await attendre(150);
  assert.equal((await lignes()).length,4);

  // 4. Le CSV daté : reconnu ; le tableau montre le jour simulé, et suit le jour choisi.
  r=await importer('programme-fictif.csv',DATE);
  assert.equal(r.erreur,false,r.texte);
  assert.match(r.texte,/^Format reconnu : le CSV daté \(un programme sur plusieurs jours\)\.\n3 lignes importées\./);
  assert.deepEqual((await lignes()).map(l=>[l[0],l[1]]),[['05:40','SU2'],['06:15','NO1']],'le premier jour, par heure');
  assert.equal(await compte(),'2 départs · journée du 03/03/2031');
  await nav.aller(page,'j-chiffres');
  await page.locator('#periode-jour').selectOption('2031-03-04');await attendre();
  await nav.aller(page,'v-programme');
  assert.deepEqual((await lignes()).map(l=>[l[0],l[1]]),[['09:00','ES1']],'le tableau suit le jour choisi');
  assert.equal(await compte(),'1 départ · journée du 04/03/2031');

  //    L'export de l'ERP, en classeur : reconnu à son onglet « Flights » ; son rapport sous l'import ; ses vols au tableau.
  r=await importer('export-fictif.xlsx',await classeur([{nom:'Summary',lignes:[['Export fictif']]},{nom:'Flights',lignes:ERP}]),XLSX);
  assert.equal(r.erreur,false,r.texte);
  assert.match(r.texte,/^Format reconnu : l’export de l’ERP \(Winrest, onglet « Flights »\)\.\n2 lignes importées\./);
  assert.equal(await page.locator('#winrest-rapport').isVisible(),true,'le rapport de l’export, sous l’import');
  assert.deepEqual((await lignes()).map(l=>[l[0],l[1],l[2],l[5]]),[['06:10','SU 200','SDX','80'],['07:30','NR 101','NRD','120']]);
  //    … et en CSV, aux mêmes colonnes.
  r=await importer('export-fictif.csv',ERP_CSV);
  assert.equal(r.erreur,false,r.texte);
  assert.match(r.texte,/^Format reconnu : l’export de l’ERP \(Winrest\), en CSV\.\n2 lignes importées\./);
  assert.equal(await source(),'export-fictif.csv');
  assert.deepEqual((await lignes()).map(l=>l[1]),['SU 200','NR 101']);
  //    Le classeur des vols, que la page exporte, se relit aussi.
  r=await importer('vols.xlsx',await classeur([{nom:'Départs',lignes:[['vol_id','compagnie','type_avion','heure_std','nb_BC','nb_PC','nb_YC','nb_CREW','nb_SPML'],['ES9','EST','MOYEN','10:20',0,0,60,3,0]]},
    {nom:'Retours',lignes:[['vol_id','compagnie','type_avion','heure_sta','nb_BC','nb_PC','nb_YC','nb_CREW','nb_SPML']]}]),XLSX);
  assert.equal(r.erreur,false,r.texte);
  assert.match(r.texte,/^Format reconnu : le classeur des vols \(feuilles « Départs » et « Retours »\)\.\n1 lignes importées\./);
  assert.deepEqual(await lignes(),[['10:20','ES9','EST','0','0','60','3']]);

  // 5. Un format inconnu : refusé en le disant, et rien ne change.
  const avant=await page.evaluate(()=>JSON.stringify(Sim.dataCourante));
  r=await importer('inventaire.csv','article;quantite;emplacement\nplateau;40;A1\n');
  assert.equal(r.erreur,true,'le refus est une erreur');
  assert.equal(r.texte,'Format non reconnu : « inventaire.csv » n’est ni le modèle CSV, ni le CSV daté, ni l’export de l’ERP. Colonnes lues : article, quantite, emplacement. Aucune donnée remplacée.');
  assert.equal(await page.evaluate(()=>JSON.stringify(Sim.dataCourante)),avant,'les vols n’ont pas changé');
  assert.equal(await source(),'vols.xlsx');
  assert.deepEqual(await lignes(),[['10:20','ES9','EST','0','0','60','3']]);
  //    Un classeur d'un autre format aussi.
  r=await importer('inventaire.xlsx',await classeur([{nom:'Stock',lignes:[['article','quantite'],['plateau',40]]}]),XLSX);
  assert.equal(r.erreur,true);
  assert.match(r.texte,/^Format non reconnu : « inventaire\.xlsx » n’est ni le modèle CSV, ni le CSV daté, ni l’export de l’ERP\. Colonnes lues : article, quantite\. Aucune donnée remplacée\.$/);
  assert.equal(await page.evaluate(()=>JSON.stringify(Sim.dataCourante)),avant);
  //    Reconnu mais incomplet : c'est le lecteur du format qui dit la colonne qui manque, comme avant.
  r=await importer('incomplet.csv','vol_id,compagnie,sens\nX1,NORD,DEP\n');
  assert.equal(r.erreur,true);
  assert.doesNotMatch(r.texte,/Format non reconnu/);
  assert.match(r.texte,/heure_std/);
  assert.equal(await page.evaluate(()=>JSON.stringify(Sim.dataCourante)),avant);

  // 6. Les modèles téléchargés se réimportent : chacun est reconnu.
  r=await importer('modele-vols-demo.csv',fs.readFileSync(fModele));
  assert.match(r.texte,/^Format reconnu : le modèle CSV/);
  assert.equal(r.erreur,false,r.texte);
  r=await importer('modele-vols-dates.csv',fs.readFileSync(fDate));
  assert.match(r.texte,/^Format reconnu : le CSV daté/);
  assert.equal(r.erreur,false,r.texte);

  assert.deepEqual(errors,[],errors.join(' | '));
  console.log('vols-page-browser : ok — un seul import, le menu des modèles, le tableau (tri, recherche, largeur), les formats reconnus, le refus');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})();

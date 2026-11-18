/* « Fichiers » (version 1, évolution 22 e) — tous les classeurs au même endroit, sur l'unité fictive.
 *   1. En haut, « Tout sauvegarder » et « Restaurer un fichier », la date de la dernière sauvegarde, et les limites du
 *      calcul. La date est une préférence du navigateur : elle n'entre pas dans le fichier de sauvegarde.
 *   2. Dessous, le tableau des classeurs : une ligne par classeur, trois colonnes — « Importer », « Exporter »,
 *      « Classeur vide à remplir » ; « sans objet » pour un sens qui n'existe pas.
 *   3. Chaque export d'aujourd'hui se fait depuis « Fichiers », et donne le même fichier : son nom, ses feuilles ; pour
 *      les vols, la planche retour et les liens, le même contenu que le bouton d'avant, resté en version 2 (gelée).
 *   4. Chaque import se fait depuis « Fichiers », et donne le même état : un classeur exporté, relu, ne change rien ;
 *      la planche importée est celle du fichier.
 *   5. Un geste qui ne peut pas se faire est grisé, et dit pourquoi ; un classeur vide a ses en-têtes, sans ligne.
 *   6. Plus aucun bouton d'import ou d'export en tête des autres pages : chacune garde un seul lien discret vers
 *      « Fichiers », qui mène au tableau. L'import des vols reste aussi sur « Programme ».
 * Unité, vols, compagnies et équipes fictifs. (Les imports et les exports eux-mêmes, classeur par classeur, sont
 * éprouvés par excel, vols-page, planche, flows, periode, journee… — depuis « Fichiers », avec les mêmes valeurs.) */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const T=require('../tableur.js');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href,URL_V2=pathToFileURL(path.resolve(__dirname,'../v2/index.html')).href;
const TABLE='#fi-classeurs';

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[],dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-fichiers-'));
 const ouvrir=async url=>{
  const ctx=await browser.newContext({viewport:{width:1366,height:768},acceptDownloads:true});
  const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
  const site=await F.charger(page,nav,url,{pageId:'u-sauvegarde'});
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat);
  return {page,ctx,site};
 };
 const attendre=(page,ms=300)=>page.waitForTimeout(ms);
 let n=0;
 /** Le fichier que donne un geste : son nom, et le fichier lui-même. */
 const telecharger=async(page,geste)=>{const [d]=await Promise.all([page.waitForEvent('download'),geste()]);
   const f=path.join(dossier,(++n)+'-'+d.suggestedFilename());await d.saveAs(f);return {nom:d.suggestedFilename(),f};};
 const feuilles=async f=>(await T.lireClasseur(fs.readFileSync(f))).map(x=>({nom:x.nom,lignes:x.lignes}));
 const cellule=(id,sens)=>`${TABLE} tr[data-classeur="${id}"] td[data-fi-sens="${sens}"]`;
 try{
  const v1=await ouvrir(URL_V1),page=v1.page;
  await attendre(page,400);

  /* ---- 1. en haut : tout sauvegarder, restaurer un fichier, la date de la dernière sauvegarde, les limites --------- */
  assert.equal(await page.locator('#view-title').textContent(),'Fichiers');
  assert.deepEqual(await page.locator('#sauvegarde-export, #sauvegarde-import-btn').allInnerTexts().then(t=>t.map(x=>x.trim())),['Tout sauvegarder','Restaurer un fichier']);
  assert.equal(await page.locator('#sauvegarde-date').innerText(),'Aucune sauvegarde faite depuis ce navigateur.');
  assert.equal(await page.locator('#model-limits').isVisible(),true,'les limites du calcul, comme aujourd’hui');
  assert.match(await page.locator('#model-limits').evaluate(e=>e.textContent),/Temps par vol non calibrés[\s\S]*Calcul sans aléa/);
  // Le tableau est sous la sauvegarde.
  assert.equal(await page.evaluate(()=>document.getElementById('sauvegarde-export').getBoundingClientRect().bottom<=document.getElementById('fi-classeurs').getBoundingClientRect().top),true);
  const sauve=await telecharger(page,()=>page.locator('#sauvegarde-export').click());
  assert.match(sauve.nom,/^ory-sauvegarde-\d{4}-\d\d-\d\d\.json$/);
  await attendre(page);
  const dit=await page.locator('#sauvegarde-date').innerText(),maintenant=new Date(),deux=x=>String(x).padStart(2,'0');
  assert.match(dit,/^Dernière sauvegarde faite depuis ce navigateur : le \d\d\/\d\d\/\d{4} à \d\d:\d\d\.$/);
  assert.ok(dit.includes('le '+deux(maintenant.getDate())+'/'+deux(maintenant.getMonth()+1)+'/'+maintenant.getFullYear()),'la date du jour : '+dit);
  // Une préférence du navigateur, hors de la sauvegarde : le fichier ne la porte pas.
  const contenu=JSON.parse(fs.readFileSync(sauve.f,'utf8'));
  assert.equal(contenu.schema,'ory-sauvegarde');
  assert.equal(JSON.stringify(contenu).includes('ory-ui-derniere-sauvegarde'),false,'la date n’est pas dans le fichier');
  assert.ok(await page.evaluate(()=>!!localStorage.getItem('ory-ui-derniere-sauvegarde')));

  /* ---- 2. le tableau des classeurs ------------------------------------------------------------------------------- */
  assert.deepEqual(await page.locator(`${TABLE} thead th`).allInnerTexts().then(t=>t.map(x=>x.trim().toLowerCase())),['classeur','importer','exporter','classeur vide à remplir']);
  const lignes=await page.locator(`${TABLE} tbody tr`).evaluateAll(trs=>trs.map(tr=>[tr.dataset.classeur,tr.querySelector('th').firstChild.textContent.trim(),
    ...[...tr.querySelectorAll('td')].map(td=>[...td.querySelectorAll('button')].map(b=>b.textContent.trim()).join(' + ')||td.textContent.trim())]));
  assert.deepEqual(lignes,[
    ['vols','Programme des vols','Importer','Exporter','Un jour (CSV) + Programme daté (CSV)'],
    ['retours','Retours','Importer','Exporter','Classeur vide'],
    ['equipes-chemins','Équipes et chemins','Importer','Exporter','sans objet'],
    ['horaires','Horaires des équipes','Importer','Exporter','sans objet'],
    ['equipes','Équipes et horaires','Importer','Exporter','sans objet'],
    ['temps','Temps par vol, vue d’ensemble','Importer','Exporter','sans objet'],
    ['etude','Temps par vol, service par service','Importer','Exporter','sans objet'],
    ['journee','Résultats de la journée','sans objet','Exporter (Excel) + Exporter (JSON)','sans objet'],
    ['periode','Résultats de la période','sans objet','Exporter','sans objet'],
    ['liens','Liens entre services','Importer','Exporter','sans objet']],'une ligne par classeur, un sens par colonne');
  // Chaque bouton nomme son classeur ; chaque ligne dit ce que le classeur contient.
  for(const b of await page.locator(`${TABLE} tbody button`).evaluateAll(bs=>bs.map(b=>[b.textContent.trim(),b.getAttribute('aria-label')||'',b.closest('tr').querySelector('th').firstChild.textContent.trim()])))
    assert.equal(b[1],b[0]+' : '+b[2],'le bouton nomme son classeur');
  assert.equal(await page.locator(`${TABLE} tbody th small`).count(),10);
  assert.ok(await page.locator(`${TABLE} *`).evaluateAll(es=>Math.min(...es.filter(e=>e.children.length===0&&e.textContent.trim()&&e.getBoundingClientRect().width>0).map(e=>parseFloat(getComputedStyle(e).fontSize))))>=13,'texte de 13 px au moins');

  /* ---- 3. chaque export se fait d'ici, et donne le même fichier ---------------------------------------------------- */
  const exports={};
  for(const [id,sel,motif,nbFeuilles] of [['vols','#exp-vols',/^ory-vols-.*\.xlsx$/,1],['equipes-chemins','#at-export',/^ory-ateliers-\d{4}-\d\d-\d\d\.xlsx$/,5],
    ['horaires','#at-export-horaires',/^ory-horaires-\d{4}-\d\d-\d\d\.xlsx$/,1],['equipes','#rc-export',/^ory-cases-\d{4}-\d\d-\d\d\.xlsx$/,1],
    ['temps','#rg-recap-export',/^ory-heures-travail-\d{4}-\d\d-\d\d\.xlsx$/,1],['etude','#rg-export',/^ory-bareme-\d{4}-\d\d-\d\d\.xlsx$/,1],
    ['journee','#fi-journee-classeur',/^ory-charge-\d{4}-\d\d-\d\d\.xlsx$/,3]]){
    assert.equal(await page.locator(`${cellule(id,'exporter')} ${sel}`).isVisible(),true,id+' : son bouton est dans sa cellule');
    const x=await telecharger(page,()=>page.locator(sel).click());
    assert.match(x.nom,motif,id+' : le nom du fichier');
    const fs_=await feuilles(x.f);
    assert.ok(fs_.length>=nbFeuilles&&fs_.every(f=>f.lignes.length>=1),id+' : ses feuilles ('+fs_.map(f=>f.nom).join(', ')+')');
    exports[id]={...x,feuilles:fs_};
  }
  // Les résultats de la journée, en JSON ; les liens entre services, en JSON.
  const jsonJournee=await telecharger(page,()=>page.locator('#fi-journee-json').click());
  assert.equal(jsonJournee.nom,'newrest-orly-journee.json');
  assert.ok(Object.keys(JSON.parse(fs.readFileSync(jsonJournee.f,'utf8'))).length>=3);
  exports.liens=await telecharger(page,()=>page.locator(`${cellule('liens','exporter')} #fc-export`).click());
  assert.match(exports.liens.nom,/^centre-flux-.*\.json$/);
  // Les mêmes fichiers que les boutons d'avant, restés en tête des pages de la version 2 (gelée) : les vols et les liens.
  const v2=await ouvrir(URL_V2);
  const clic=id=>v2.page.evaluate(id=>document.getElementById(id).click(),id);
  const volsV2=await telecharger(v2.page,()=>clic('exp-vols'));
  assert.equal(volsV2.nom,exports.vols.nom,'le même nom de fichier');
  assert.deepEqual(await feuilles(volsV2.f),exports.vols.feuilles,'les vols exportés d’ici sont ceux du bouton d’avant');
  const liensV2=await telecharger(v2.page,()=>clic('fc-export'));
  assert.deepEqual(JSON.parse(fs.readFileSync(exports.liens.f,'utf8')),JSON.parse(fs.readFileSync(liensV2.f,'utf8')),'les liens exportés d’ici sont ceux du bouton d’avant');

  /* ---- 4. chaque import se fait d'ici, et donne le même état ----------------------------------------------------- */
  // Un classeur exporté puis relu : le même état que par les boutons d'avant (version 2), partie de la même unité.
  // (Chaque version relit son propre classeur : les mots de ses feuilles ne sont pas les mêmes.)
  const equipes=p=>p.evaluate(()=>JSON.stringify(Sim.ateliers.state.ateliers.map(a=>({nom:a.nom,service:a.service,type:a.type,debut:a.debut,jour:a.jour,personnes:a.personnes,lots:a.lots}))
    .sort((x,y)=>x.nom.localeCompare(y.nom))));
  const chemins=p=>p.evaluate(()=>JSON.stringify(Sim.ateliers.state.parcours.map(x=>({nom:x.nom,noeuds:x.noeuds,liens:x.liens}))));
  assert.equal(await equipes(page),await equipes(v2.page),'au départ, la même unité dans les deux versions');
  for(const [id,bouton,champ] of [['equipes-chemins','at-export','#at-import'],['equipes','rc-export','#rc-import'],['horaires','at-export-horaires','#at-import']]){
    assert.equal(await page.locator(`${cellule(id,'importer')} button`).isVisible(),true,id+' : son bouton « Importer » est dans sa cellule');
    if(id==='horaires'){
      // « Horaires des équipes » : son bouton ouvre le même champ que « Équipes et chemins ».
      const [choix]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#fi-horaires-import').click()]);
      await choix.setFiles(exports.horaires.f);
    }else await page.locator(champ).setInputFiles(exports[id].f);
    await attendre(page,700);
    const avant2=await telecharger(v2.page,()=>clic(bouton));
    await v2.page.locator(champ).setInputFiles(avant2.f);await attendre(v2.page,700);
    assert.equal(await equipes(page),await equipes(v2.page),id+' : relu d’ici, le classeur donne les mêmes équipes que par le bouton d’avant');
    assert.equal(await chemins(page),await chemins(v2.page),id+' : et les mêmes chemins');
  }
  const etat=()=>page.evaluate(()=>JSON.stringify({vols:(Sim.dataCourante||[]).length}));
  const avant=await etat();
  // Les vols : le bouton d'ici ouvre le champ de « Programme » ; le programme exporté, relu, garde ses vols.
  const [choixVols]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#fi-vols-import').click()]);
  await choixVols.setFiles(exports.vols.f);
  await page.waitForFunction(nom=>document.getElementById('source-label').textContent===nom,path.basename(exports.vols.f));
  assert.equal(JSON.parse(await etat()).vols,JSON.parse(avant).vols,'le programme exporté, relu : les mêmes vols');
  // La planche retour : vide, elle n'a rien à exporter ; son classeur vide a ses en-têtes ; remplie et importée, elle est celle du fichier.
  assert.equal(await page.locator('#fi-planche-export').isDisabled(),true);
  assert.equal(await page.locator(`${cellule('retours','exporter')} .fi-raison`).innerText(),'La planche est vide.');
  const vide=await telecharger(page,()=>page.locator('#fi-planche-vide').click());
  assert.equal(vide.nom,'ory-planche-retour-vide.xlsx');
  const fVide=await feuilles(vide.f);
  assert.ok(fVide[0].lignes.length>=1&&fVide[0].lignes[0].length>=4,'ses en-têtes');
  const sansLigne=fVide[0].lignes.length;
  const planche=[{vol:'RET01',cie:'NORD',heure:'08:30',jour:0},{vol:'RET02',cie:'SUD',heure:'10:15',jour:0}];
  const fichierPlanche=path.join(dossier,'planche-fictive.xlsx');
  fs.writeFileSync(fichierPlanche,Buffer.from(await page.evaluate(p=>Array.from(OrlyTableur.ecrireClasseur(OrlyEchanges.plancheVersClasseur(p))),planche)));
  const [choixPlanche]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#fi-planche-import').click()]);
  await choixPlanche.setFiles(fichierPlanche);
  await page.waitForFunction(()=>(Sim.ateliers.state.materiel.planche||[]).length===2);
  assert.deepEqual(await page.evaluate(()=>Sim.ateliers.state.materiel.planche.map(l=>[l.vol,l.cie,l.heure])),[['RET01','NORD','08:30'],['RET02','SUD','10:15']],'la planche importée d’ici est celle du fichier');
  await nav.aller(page,'u-sauvegarde');await attendre(page);
  assert.equal(await page.locator('#fi-planche-export').isDisabled(),false,'remplie, elle s’exporte');
  assert.equal(await page.locator(`${cellule('retours','exporter')} .fi-raison`).count(),0);
  const plancheV1=await telecharger(page,()=>page.locator('#fi-planche-export').click());
  assert.equal(plancheV1.nom,'ory-planche-retour.xlsx');
  assert.equal((await feuilles(plancheV1.f))[0].lignes.length,sansLigne+2,'deux lignes de plus que le classeur vide');
  // La même planche, par le bouton d'avant (version 2) : le même classeur.
  await v2.page.evaluate(p=>Sim.ateliers.changer(()=>{Sim.ateliers.state.materiel.planche=p;},''),await page.evaluate(()=>Sim.ateliers.state.materiel.planche));
  await attendre(v2.page,400);await nav.aller(v2.page,'v-planche');await attendre(v2.page,300);
  const plancheV2=await telecharger(v2.page,()=>v2.page.evaluate(()=>document.querySelector('[data-pl-action=exporter]').click()));
  // (Seul le nom d'une page diffère, dans la note du classeur : « Réglages » ici, « Réglages de la simulation » en version 2.)
  const memeNom=f=>JSON.parse(JSON.stringify(f).replaceAll('Réglages de la simulation','Réglages'));
  assert.deepEqual(memeNom(await feuilles(plancheV1.f)),memeNom(await feuilles(plancheV2.f)),'la planche exportée d’ici est celle du bouton d’avant');
  await v2.ctx.close();

  /* ---- 5. un geste qui ne peut pas se faire est grisé, et dit pourquoi ------------------------------------------ */
  assert.equal(await page.locator('#fi-periode').isDisabled(),true,'sans période simulée, son export attend');
  assert.equal(await page.locator(`${cellule('periode','exporter')} .fi-raison`).innerText(),'Aucune période simulée.');
  assert.equal(await page.locator('#fi-periode').getAttribute('aria-describedby'),'fi-periode-raison');
  assert.equal(await page.locator('#fi-journee-classeur').isDisabled(),false);
  assert.equal(await page.locator('#fi-journee-json').isDisabled(),false,'la journée en JSON s’exporte toujours, comme aujourd’hui');
  // Les modèles des vols : deux classeurs vides à remplir.
  const m1=await telecharger(page,()=>page.locator(`${cellule('vols','vide')} #csv-template`).click());
  const m2=await telecharger(page,()=>page.locator(`${cellule('vols','vide')} #csv-template-date`).click());
  assert.deepEqual([m1.nom,m2.nom],['modele-vols-demo.csv','modele-vols-dates.csv']);
  assert.match(fs.readFileSync(m2.f,'utf8'),/^date,vol_id,compagnie/);

  /* ---- 6. plus de bouton d'import ou d'export en tête des autres pages : un seul lien discret vers « Fichiers » -- */
  const IMPORT_EXPORT=/importer|exporter|excel|horaires$|modèle|classeur/i;
  const pages=await page.evaluate(()=>OrlyOnglets.PARTIES.flatMap(p=>p.pages.map(q=>q.id)).filter(id=>OrlyOnglets.montree(id)&&id!=='u-sauvegarde'));
  const avecLien=[];
  for(const id of pages){
    await nav.aller(page,id);await attendre(page,250);
    const vus=await page.evaluate(()=>({boutons:[...document.querySelectorAll('button,label.btn,a.btn,summary.btn')].filter(b=>b.getClientRects().length&&!b.closest('#menu,.barre,dialog')&&!b.classList.contains('vers-fichiers')).map(b=>b.textContent.trim().replace(/\s+/g,' ').slice(0,50)),
      liens:[...document.querySelectorAll('.vers-fichiers')].filter(b=>b.getClientRects().length).map(b=>b.textContent.trim())}));
    const restent=vus.boutons.filter(t=>IMPORT_EXPORT.test(t));
    // L'import des vols reste sur « Programme ». Le fichier du plan (un JSON, pas un classeur) garde ses deux boutons dans
    // l'inspecteur du plan : plan-editor.js, commun avec la version 2, n'est pas modifié.
    const GARDES={'v-programme':['Importer des vols'],'u-plan':['Exporter le plan','Importer un plan']};
    assert.deepEqual(restent,GARDES[id]||[],id+' : aucun bouton d’import ou d’export en tête de la page');
    assert.ok(vus.liens.length<=1,id+' : un seul lien vers « Fichiers » ('+vus.liens.join(' | ')+')');
    if(vus.liens.length)avecLien.push(id);
  }
  await nav.terminerPlan(page);
  for(const id of ['v-programme','v-planche','mu-services','mu-flux','j-chiffres','at-planning','u-liens'])assert.ok(avecLien.includes(id),id+' garde son lien vers « Fichiers » : '+avecLien.join(' '));
  // Le lien mène à « Fichiers », au tableau des classeurs.
  await nav.aller(page,'mu-services');await attendre(page);
  await page.locator('.vers-fichiers:visible').click();await attendre(page,400);
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'u-sauvegarde');
  assert.equal(await page.evaluate(()=>{const t=document.getElementById('fichiers-classeurs').getBoundingClientRect();return t.top>=0&&t.top<innerHeight;}),true,'le tableau est à l’écran');
  // « Sauvegarde et limites », son nom d'avant, se cherche toujours.
  await nav.aller(page,'j-chiffres');
  await page.keyboard.press('Control+k');await page.waitForSelector('dialog.palette [role=option]');
  await page.keyboard.type('Sauvegarde et limites');await attendre(page,200);
  await page.locator('dialog.palette [role=option]').first().click();await attendre(page,300);
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'u-sauvegarde');
  // Rechargée, la page redit la date de la dernière sauvegarde.
  await nav.recharger(page);await nav.aller(page,'u-sauvegarde');await attendre(page);
  assert.equal(await page.locator('#sauvegarde-date').innerText(),dit);

  assert.deepEqual(erreurs,[],'aucune erreur de page');
  await v1.site.effacer();
  console.log('fichiers-page-browser : ok — « Tout sauvegarder », « Restaurer un fichier », la date de la dernière sauvegarde (hors du fichier), les limites ; dix classeurs, trois colonnes, « sans objet » ; chaque export et chaque import depuis « Fichiers » (les vols, les liens et la planche : le même fichier que le bouton d’avant) ; un geste grisé dit pourquoi ; plus de bouton d’import ou d’export en tête des pages, un lien discret vers « Fichiers »');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})();

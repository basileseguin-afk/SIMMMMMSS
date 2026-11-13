/* Banc d'essai, évolution 12 (c) — la vue « Charge » dans la page Planning (v1) ;
 * depuis l'évolution 14 (c), les courbes en tête de chaque groupe du planning.
 * Une unité fictive (celle de la référence de non-régression : une cuisine à
 * J−1, un montage, un robot, une plonge, une mise à disposition, une équipe
 * d'appui, un handling) et ses vols fictifs :
 *   1. la courbe de chaque service est en tête de son groupe, dans le planning
 *      des équipes, sur la même échelle que ses barres ; le tableau des
 *      équipes, sous le planning ; l'intro de la page le dit ;
 *   2. par service, la courbe présents / au travail / en file, et son pic : les
 *      nombres de moteur/indicateurs.js, les mêmes que l'outil d'une journée
 *      pour la même sauvegarde (un seul chemin de calcul) ; la cuisine à J−1
 *      se place la veille ;
 *   3. le tableau des équipes : occupation, consommé sur disponible, débit, file
 *      la plus longue, attente ; « sans objet » et sa raison, pas 0 ;
 *   4. la bulle d'un créneau ; les couleurs du design system, en clair et en
 *      sombre ; un nom d'équipe piégé (du HTML) reste du texte ;
 *   5. la page Période : par jour de travail et par service, le pic au travail
 *      et l'occupation ; un clic ouvre la journée dans la page Planning ; les
 *      autres mesures ouvrent toujours Les chiffres ;
 *   6. (évolution 12 d) « Exporter la charge (Excel) » : le classeur de la
 *      journée, le même que l'outil (echanges-charge.js) ; celui de la
 *      période a ses feuilles Charge et Créneaux.
 * Données fictives ; aucune capture d'écran (le plan est confidentiel). */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const J=require('../moteur/journee.js'),PE=require('../moteur/periode.js'),I=require('../moteur/indicateurs.js'),P=require('../moteur/production.js');
const ER=require('../echanges-reponses.js'),REP=require('../moteur/reponses.js');
const T=require('../tableur.js'),EC=require('../echanges-charge.js');
const REF=require('./non-regression.attendu.json');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const S=REF.scenarios.find(s=>s.nom==='unite-vol');
const hh=t=>(t==null?'':String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0'));
const LIGNE=v=>[v.id,v.cie,v.avion,v.sens,v.sens==='DEP'?hh(v.std):'',v.sens==='RET'?hh(v.sta):'',v.bc,v.pc,v.yc,v.crew,v.spml].join(',');
const TETE='vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_CREW,nb_SPML';
const SANS_DATE=TETE+'\n'+S.args.vols.map(LIGNE).join('\n')+'\n';
// Quatre jours fictifs : les vols de l'unité fictive, chaque jour.
const JOURS=PE.joursEntre('2026-11-02','2026-11-05');
const CSV='date,'+TETE+'\n'+JOURS.flatMap(d=>S.args.vols.map(v=>d+','+LIGNE(v))).join('\n')+'\n';
const fr=(x,k)=>(Math.round(x*10**k)/10**k+0).toLocaleString('fr-FR',{maximumFractionDigits:k});
const PIEGE='<img src=x onerror="window.__xss=1">';

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const attendre=(ms=250)=>page.waitForTimeout(ms);
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-charge-page-'));
 const fichier=(nom,texte)=>{const f=path.join(dossier,nom);fs.writeFileSync(f,texte);return f;};
 const importer=async(nom,texte)=>{await nav.aller(page,'v-programme');await page.locator('#imp-vols').setInputFiles(fichier(nom,texte));
   await page.waitForFunction(n=>document.getElementById('source-label').textContent===n,nom);await attendre(150);};
 const telecharger=async fn=>{const [d]=await Promise.all([page.waitForEvent('download'),fn()]);const f=path.join(dossier,d.suggestedFilename());await d.saveAs(f);return f;};
 const CLES=['ory-ateliers-v1','ory-modele-v1','orly-plan-v3','orly-flows-v1','ory-graphes-v1'];
 /** La sauvegarde de la page à cet instant (« Tout sauvegarder » : ces clés du navigateur). */
 const sauvegarde=async()=>JSON.parse(await page.evaluate(cles=>{const contenu={};
   for(const k of cles){const v=localStorage.getItem(k);if(v)contenu[k]=JSON.parse(v);}
   return JSON.stringify({schema:'ory-sauvegarde',version:1,contenu});},CLES));
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(500);
  await nav.aller(page,'u-sauvegarde');
  await page.locator('#sauvegarde-import').setInputFiles(fichier('unite-fictive.json',JSON.stringify(S.sauvegarde)));
  const recharge=page.waitForEvent('load');await nav.repondre(page);await recharge;await page.waitForLoadState('load');await attendre(600);
  await importer('vols-fictifs.csv',SANS_DATE);
  await nav.aller(page,'at-planning');await attendre();

  // 1. En tête de chaque groupe du planning, sur l'échelle de ses barres ; le tableau dessous ; l'intro le dit.
  assert.equal(await page.locator('#at-charge').isVisible(),true,'la vue Charge se voit');
  const boites=await page.evaluate(()=>{const g=document.querySelector('#at-planning .pg-groupe[data-service="prepa"]'),c=g.querySelector('.ch-courbe').getBoundingClientRect(),b=g.querySelector('.pg-barres').getBoundingClientRect();
    return {courbe:[c.left,c.width,c.top],barres:[b.left,b.width,b.top],tableau:document.getElementById('at-charge').getBoundingClientRect().top>=document.getElementById('at-planning').getBoundingClientRect().bottom-1};});
  assert.ok(boites.courbe[2]<boites.barres[2],'la courbe, en tête du groupe, au-dessus de ses équipes');
  assert.ok(Math.abs(boites.courbe[0]-boites.barres[0])<1&&Math.abs(boites.courbe[1]-boites.barres[1])<1,'même largeur, même départ : '+JSON.stringify(boites));
  assert.ok(boites.tableau,'le tableau des équipes, sous le planning');
  /** L'échelle du planning : l'heure à x = 0, et les pixels par minute. */
  const echelle=await page.evaluate(()=>({t0:OrlyPlanningVue.etat.vue.t0,pxm:OrlyPlanningVue.etat.vue.pxh/60}));
  assert.ok((await page.locator('#at-planning .ch-courbe').count())>=3);
  assert.match(await page.locator('#view-intro').textContent(),/en tête de chaque service sa charge/);
  assert.equal(await page.locator('#at-charge h4').count(),1);

  // 2. Les nombres : ceux de moteur/indicateurs.js, pour la même sauvegarde que l'outil d'une journée.
  const sv=await sauvegarde();
  const args=J.argumentsDeLaJournee(sv,S.args.vols,S.options),r=J.jouer(args),k=I.journee(r,args);
  const pageK=JSON.parse(await page.evaluate(()=>JSON.stringify(OrlyIndicateurs.journee(Sim.ateliers.resultat,Sim.ateliers.args))));
  assert.deepEqual(pageK,JSON.parse(JSON.stringify(k)),'les indicateurs de la page = ceux de l’outil');
  // Un service par courbe : ceux qui ont des présents ou du travail ; la cuisine (à J−1) en fait partie.
  const attendus=[...new Set(k.services.filter(s=>s.creneaux.presents||s.creneaux.auTravail).map(s=>s.service))].sort();
  const vus=await page.locator('#at-planning .ch-service').evaluateAll(l=>l.map(x=>x.dataset.service));
  assert.deepEqual([...vus].sort(),attendus);
  assert.ok(vus.includes('cuisine')&&vus.includes('prepa'));
  // Le pic au travail, marqué : le plus haut créneau des journées réunies sur l'horloge du jour J (la veille : − 24 h).
  for(const id of ['prepa','cuisine']){
    const gs=k.services.filter(s=>s.service===id).map(s=>({...s,creneaux:Object.fromEntries(Object.entries(s.creneaux).map(([m,c])=>
      [m,m==='debut'?(c===null?null:c+s.jour*1440):c&&{debut:c.debut+s.jour*1440,valeurs:c.valeurs}]))}));
    const pic=I.pic(PE.sommeDesCreneaux(gs.map(g=>g.creneaux)).auTravail);
    assert.ok(pic&&pic.personnes>0,id);
    assert.equal(await page.locator(`#at-planning .ch-service[data-service="${id}"]`).getAttribute('data-pic'),pic.personnes+'|'+pic.debut,id+' : le pic');
    assert.equal(await page.locator(`#at-planning .ch-service[data-service="${id}"] .ch-pic`).count(),1);
    assert.match(await page.locator(`#at-planning .pg-groupe[data-service="${id}"] .ch-note`).first().textContent(),
      new RegExp('pic '+fr(pic.personnes,1).replace(/[.,]/g,'\\$&')+' au travail à '+P.hhmm(pic.debut)));
    if(id==='cuisine')assert.ok(pic.debut<0,'la cuisine travaille la veille : '+P.hhmm(pic.debut));
    // Sa marque, au milieu de son créneau sur l'échelle du planning (la veille comprise), dans le dessin.
    const [cx,w]=await page.locator(`#at-planning .ch-service[data-service="${id}"]`).evaluate(d=>[+d.querySelector('.ch-pic').getAttribute('cx'),+d.querySelector('svg').getAttribute('width')]);
    const attendu=(pic.debut+I.PAS/2-echelle.t0)*echelle.pxm;
    assert.ok(Math.abs(cx-attendu)<0.06&&cx>=0&&cx<=w,id+' : la marque du pic à x '+cx+', attendue '+attendu.toFixed(2));
  }
  // Les courbes : présents (un trait), au travail (une aire), la file (des barres) là où il y en a.
  assert.ok(await page.locator('#at-planning .ch-service[data-service="prepa"] path.ch-presents').count()===1);
  assert.ok(await page.locator('#at-planning .ch-service[data-service="prepa"] path.ch-travail').count()===1);
  // Une mise à disposition seule : présents, mais travail « sans objet ».
  assert.match(await page.locator('#at-planning .pg-groupe[data-service="magasin"] .ch-note').first().textContent(),/travail sans objet/);
  assert.equal(await page.locator('#at-planning .ch-service[data-service="magasin"] path.ch-travail').count(),0);
  // Ses présents sont « en appui ou à disposition » (correction 16) : un trait discret, et la légende le dit.
  assert.equal(await page.locator('#at-planning .ch-service[data-service="magasin"] path.ch-appui').count(),1);
  assert.equal(await page.locator('#at-planning .ch-service[data-service="prepa"] path.ch-appui').count(),0,'pas d’appui au montage');
  assert.match(await page.locator('#at-planning .pg-cle[title*="en appui ou à disposition"]').textContent(),/en appui/);

  // 3. Le tableau des équipes, replié par défaut (correction 16 d) : les courbes se voient, le tableau s'ouvre d'un clic.
  const replie=page.locator('#at-charge details.ch-tableau');
  assert.equal(await replie.evaluate(d=>d.open),false,'replié par défaut');
  assert.equal(await page.locator('#at-charge details.ch-tableau > summary').textContent(),'Le tableau des équipes ('+k.equipes.length+')');
  assert.equal(await page.locator('#at-charge table.ch-equipes').isVisible(),false);
  assert.equal(await page.locator('#at-planning .ch-service').first().isVisible(),true,'les courbes restent visibles');
  await page.locator('#at-charge details.ch-tableau > summary').click();await attendre(100);
  assert.equal(await replie.evaluate(d=>d.open),true);
  assert.equal(await page.evaluate(()=>localStorage.getItem('ory-ui-charge-tableau')),'ouvert','ce navigateur s’en souvient');
  // Redessinée, la vue le garde ouvert ; refermé, il le reste.
  await page.evaluate(()=>{Sim.ateliers.aDessiner.add('at-planning');Sim.ateliers.surOnglet('at-planning');});await attendre(100);
  assert.equal(await page.locator('#at-charge details.ch-tableau').evaluate(d=>d.open),true);
  await page.locator('#at-charge details.ch-tableau > summary').click();await attendre(100);
  await page.evaluate(()=>{Sim.ateliers.aDessiner.add('at-planning');Sim.ateliers.surOnglet('at-planning');});await attendre(100);
  assert.deepEqual([await page.locator('#at-charge details.ch-tableau').evaluate(d=>d.open),await page.evaluate(()=>localStorage.getItem('ory-ui-charge-tableau'))],[false,'replie']);
  // Un stockage qui refuse (navigation privée) : replié, sans erreur.
  await page.evaluate(()=>{window.__getItem=Storage.prototype.getItem;Storage.prototype.getItem=function(){throw new Error('refusé');};
    Sim.ateliers.aDessiner.add('at-planning');Sim.ateliers.surOnglet('at-planning');Storage.prototype.getItem=window.__getItem;});await attendre(100);
  assert.equal(await page.locator('#at-charge details.ch-tableau').evaluate(d=>d.open),false);
  // Le test l'ouvre avant de le lire.
  await page.locator('#at-charge details.ch-tableau > summary').click();await attendre(100);
  // Une ligne par équipe ; ses colonnes ; « sans objet » avec sa raison.
  const entetes=await page.locator('#at-charge table.ch-equipes thead th').allTextContents();
  assert.deepEqual(entetes,['Équipe','Service','Personnes','Occupation','Consommé sur disponible','Débit','File la plus longue','Attente']);
  assert.deepEqual((await page.locator('#at-charge tr[data-equipe]').evaluateAll(l=>l.map(x=>x.dataset.equipe))).sort(),k.equipes.map(e=>e.id).sort());
  const ligne=id=>page.locator(`#at-charge tr[data-equipe="${id}"] td`);
  const mo=k.equipes.find(e=>e.id==='mo');
  assert.equal(await ligne('mo').nth(2).innerText(),fr(mo.occupation*100,0)+' %');
  assert.equal(await ligne('mo').nth(3).innerText(),fr(mo.consommeSurDisponible*100,0)+' %');
  assert.equal(await ligne('mo').nth(4).innerText(),fr(mo.debit,1)+' '+mo.unite+'/h');
  assert.equal(await ligne('mo').nth(6).innerText(),fr(mo.attente,0)+' min');
  for(const [id,raison] of [['h','handling'],['leg','mise à disposition'],['do','équipe d’appui']]){
    assert.equal(await ligne(id).nth(2).innerText(),'sans objet',id);
    assert.equal(await ligne(id).nth(2).locator('.ch-sans-objet').getAttribute('title'),raison,id);
  }
  assert.match(await page.locator('#at-charge tr[data-equipe="cu1"] th').innerText(),/J−1/);

  // 4. La bulle d'un créneau : ses mesures.
  const cibles=page.locator('#at-planning .ch-service[data-service="prepa"] .ch-cible');
  assert.ok(await cibles.count()>20,'un créneau par quart d’heure');
  const cible=cibles.nth(20);
  // La page défile d'abord (un défilement ferme la bulle), puis le pointeur s'y pose.
  await cible.scrollIntoViewIfNeeded();await attendre(200);await cible.hover();await attendre(150);
  const bulle=await page.evaluate(()=>{const b=document.querySelector('.ds-infobulle');return b&&!b.hidden?b.textContent:null;});
  assert.ok(bulle&&/présents/.test(bulle)&&/au travail/.test(bulle)&&/en pause/.test(bulle),'la bulle : '+bulle);
  await page.mouse.move(5,5);
  // Les couleurs du design system : l'équipe au travail en d1, la file dans la couleur de l'attente ; en sombre, les jetons sombres.
  const couleurs=()=>page.evaluate(()=>{const cs=getComputedStyle(document.documentElement),c=v=>{const d=document.createElement('i');d.style.color=cs.getPropertyValue(v);document.body.append(d);const x=getComputedStyle(d).color;d.remove();return x;};
    const travail=document.querySelector('#at-planning .ch-travail'),pic=document.querySelector('#at-planning .ch-pic');
    return {travail:getComputedStyle(travail).stroke,d1:c('--ds-d1'),pic:getComputedStyle(pic).fill,presents:getComputedStyle(document.querySelector('#at-planning .ch-presents')).stroke,texte3:c('--ds-texte-3')};});
  const clair=await couleurs();
  assert.deepEqual([clair.travail,clair.pic,clair.presents],[clair.d1,clair.d1,clair.texte3]);
  const file=await page.evaluate(()=>{const f=document.querySelector('#at-planning .ch-file');if(!f)return null;const d=document.createElement('i');d.style.color=getComputedStyle(document.documentElement).getPropertyValue('--ds-attente');document.body.append(d);const x=getComputedStyle(d).color;d.remove();return [getComputedStyle(f).fill,x];});
  assert.ok(file,'des lots en file dans cette journée');
  assert.equal(file[0],file[1],'la file : la couleur de l’attente');
  await page.evaluate(()=>{document.documentElement.dataset.theme='sombre';});await attendre(100);
  const sombre=await couleurs();
  assert.notEqual(sombre.d1,clair.d1,'le thème sombre a son d1');
  assert.deepEqual([sombre.travail,sombre.pic,sombre.presents],[sombre.d1,sombre.d1,sombre.texte3],'en sombre aussi');
  await page.evaluate(()=>{delete document.documentElement.dataset.theme;});
  // Un nom d'équipe piégé (du HTML) : il s'affiche en texte, rien ne s'exécute.
  await page.evaluate(n=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id==='mo').nom=n;},''),PIEGE);await attendre(300);
  await nav.aller(page,'at-planning');await attendre();
  assert.equal(await page.locator('#at-charge img, #at-planning img').count(),0,'le nom piégé reste du texte');
  assert.equal(await page.evaluate(()=>window.__xss),undefined);
  assert.equal(await page.locator('#at-charge tr[data-equipe="mo"] th').innerText(),PIEGE);
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id==='mo').nom='Montage';},''));await attendre(300);
  // Un nom de service piégé : dans le titre de sa courbe, son aria-label, ses bulles et le tableau, du texte aussi.
  await page.evaluate(n=>{const A=Sim.ateliers,s0=A.a.services;window.__services=s0;A.a.services=()=>s0().map(s=>(s.id==='prepa'?{...s,nom:n}:s));
    A.aDessiner.add('at-planning');A.surOnglet('at-planning');},PIEGE);await attendre(200);
  assert.equal(await page.locator('#at-charge img, #at-planning img').count(),0,'le service piégé reste du texte');
  assert.equal(await page.evaluate(()=>window.__xss),undefined);
  assert.equal(await page.locator('#at-planning .pg-groupe[data-service="prepa"] .pg-service').textContent(),PIEGE);
  assert.ok((await page.locator('#at-planning .ch-service[data-service="prepa"] svg').getAttribute('aria-label')).startsWith(PIEGE));
  assert.ok((await page.locator('#at-planning .ch-service[data-service="prepa"] .ch-cible').first().getAttribute('data-info')).startsWith(PIEGE));
  await page.evaluate(()=>{const A=Sim.ateliers;A.a.services=window.__services;A.aDessiner.add('at-planning');A.surOnglet('at-planning');});await attendre(200);

  // (évolution 12 d) Le classeur de la charge de la journée : le bouton de la vue ; les mêmes feuilles que l'outil, pour la même sauvegarde.
  const fj=await telecharger(()=>page.locator('#at-charge [data-ch=exporter]').click());
  assert.match(path.basename(fj),/^ory-charge-\d{4}-\d\d-\d\d\.xlsx$/);
  const relu=await T.lireClasseur(fs.readFileSync(fj));
  // (évolution 15 e) La feuille « Réponses » à la fin ; les autres, celles d'avant.
  assert.deepEqual(relu.map(f=>f.nom),['Lisez-moi','Charge','Créneaux','Réponses']);
  const outil=EC.journeeVersClasseur({resultat:r,args},{calculeLe:new Date()});
  const net=l=>{const x=l.map(c=>(c==null||c===''?null:c&&typeof c==='object'&&'excel' in c?c.excel:c));while(x.length&&x[x.length-1]==null)x.pop();return x;};
  for(const i of [1,2])assert.deepEqual(relu[i].lignes.map(net).filter(l=>l.length),outil[i].lignes.map(net).filter(l=>l.length),relu[i].nom+' : celle de l’outil');
  const reponses=ER.feuilleDesReponses(REP.reponses(r,args),{calculeLe:new Date()});
  assert.deepEqual(relu[3].lignes.map(net).filter(l=>l.length),reponses.lignes.map(net).filter(l=>l.length),'Réponses : celle du module');

  // 5. La page Période : le pic au travail et l'occupation, par jour de travail et par service.
  await importer('vols-dates.csv',CSV);
  await nav.aller(page,'j-periode');await attendre();
  await page.locator('#journee-periode [data-pv=lancer]').click();
  await page.waitForFunction(()=>Sim.periode.etat()==='a-jour',null,{timeout:120000});
  const b=JSON.parse(await page.evaluate(()=>JSON.stringify(Sim.periode.resultat.bilan)));
  const services=b.services.filter(s=>b.joursTravail.some(w=>w.services[s.id]));
  const w=b.joursTravail.find(x=>x.complet);
  const valeur=(x,f)=>(x&&x.indicateursCharge?f(x.indicateursCharge):null);
  // Évolution 15 (d) : la colonne « Unité » donne la charge de toute l'unité (moteur/periode.js, chargeDeLUnite) ; le pic au
  // travail, une mesure en personnes, n'a plus de ligne Total, seulement sa moyenne par jour.
  const complets=b.joursTravail.filter(x=>x.complet);
  for(const [m,lire,ecrire,cumul,unite,avecTotal] of [
    ['picAuTravail',k=>(k.picAuTravail?k.picAuTravail.personnes:null),x=>fr(x,1),(k,moy)=>(moy?k.picAuTravailMoyen:k.picAuTravail&&k.picAuTravail.personnes),
      (k,moy)=>(moy?k.picAuTravailMoyen:k.picAuTravail&&k.picAuTravail.personnes),false],
    ['occupation',k=>k.occupation,x=>fr(x*100,0)+' %',k=>k.occupation,k=>k.occupation,true]]){
    await page.locator('#periode-mesure').selectOption(m);await attendre(100);
    assert.equal(await page.locator('#journee-periode table.pv-table').getAttribute('data-mesure'),m);
    const ecrit=x=>(x==null?'—':ecrire(x));
    assert.deepEqual(await page.locator(`#journee-periode tr[data-pv-jour="${w.date}"] td`).allInnerTexts(),
      [...services.map(s=>ecrit(valeur(w.services[s.id],lire))),ecrit(unite(PE.chargeDeLUnite([w]),false))],m+' : un jour, service par service, et l’unité');
    const moyenne=page.locator('#journee-periode tr.pv-cumul.pv-moyenne').last();
    const pc=b.periode.indicateursCharge.services;
    if(avecTotal){
     const total=page.locator('#journee-periode tr.pv-cumul:not(.pv-moyenne)').last();
     assert.deepEqual(await total.locator('td').allInnerTexts(),[...services.map(s=>ecrit(pc[s.id]?cumul(pc[s.id],false):null)),ecrit(unite(PE.chargeDeLUnite(complets),false))],m+' : la période');
    }else assert.equal(await page.locator('#journee-periode tr.pv-cumul:not(.pv-moyenne)').count(),0,m+' : pas de total de personnes');
    assert.deepEqual(await moyenne.locator('td').allInnerTexts(),[...services.map(s=>ecrit(pc[s.id]?cumul(pc[s.id],true):null)),ecrit(unite(PE.chargeDeLUnite(complets),true))],m+' : la moyenne');
    assert.ok(await page.locator('#journee-periode .pv-note-mesure').count()===1);
  }
  assert.ok(valeur(w.services.prepa,k=>k.picAuTravail.personnes)>0,'un pic au travail au montage');
  // Un clic sur un jour : la journée s'ouvre dans la page Planning, sa vue Charge en tête.
  await page.locator(`#journee-periode tr[data-pv-jour="${w.date}"] td`).first().click();await attendre(300);
  assert.deepEqual(await page.evaluate(()=>[Sim.jourVols,document.body.dataset.sous]),[w.date,'at-planning']);
  assert.equal(await page.locator('#at-charge').isVisible(),true);
  // Une autre mesure ouvre toujours Les chiffres, comme avant.
  await nav.aller(page,'j-periode');
  await page.locator('#periode-mesure').selectOption('personnes');await attendre(100);
  await page.locator(`#journee-periode tr[data-pv-jour="${w.date}"] td`).first().click();await attendre(300);
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'j-chiffres');
  // Le classeur de la période : ses feuilles Charge et Créneaux, après Équipes.
  await nav.aller(page,'j-periode');
  const fp=await telecharger(()=>page.locator('#journee-periode [data-pv=exporter]').click());
  const rp=await T.lireClasseur(fs.readFileSync(fp));
  assert.deepEqual(rp.map(f=>f.nom),['Lisez-moi','Période','Équipes','Charge','Créneaux','Compagnies','Lots','Vols','Plonge','Jours']);

  assert.deepEqual(errors,[]);
  console.log('charge-browser : ok');
 }finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});

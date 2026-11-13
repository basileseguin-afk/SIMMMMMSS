/* Banc d'essai, évolution 17 (c) — une formule par service, dans les pages
 * (v1). Sur l'unité fictive de tests/calage-17-fictif.cjs (une cuisine dont
 * les heures suivent le travail au barème en puissance, une plonge à effectif
 * fixe, un bureau hors simulation), le parcours de la page Période :
 *   — « Caler » : le rapport de chaque ligne écrit la formule retenue en
 *     clair et le statut, ceux du module ; la cuisine en « puissance », à la
 *     limite ; la plonge « en sur-effectif », l'effectif mis et sa borne ; le
 *     tableau des candidats (sept, leur formule, le seuil corrigé) ;
 *   — le nuage de points d'une ligne : un point par jour appris, la courbe
 *     retenue et celle de « × a », les jours laissés de côté marqués ; la
 *     part se choisit ; un jour survolé dit ses chiffres ;
 *   — « Garder comme politique d'effectif » : le prévu de la page Période et
 *     celui de la Synthèse d'une journée sont ceux du module, avec le statut
 *     et le besoin « au plus » ; la phrase de tête de la Synthèse ;
 *   — les classeurs : les colonnes ajoutées de la feuille Calage et de la
 *     feuille Période.
 * Données fictives ; aucune capture d'écran. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const R=require('../moteur/reel.js'),C=require('../moteur/calage-periode.js'),T=require('../tableur.js'),N=require('../calage-nuage.js');
const F=require('./calage-17-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const CLE=F.CLE_CALAGE,B='#pv-reel';
// Comme la page : deux décimales au plus, à la française.
const fr=(x,k=2)=>(Math.round(x*10**k)/10**k+0).toLocaleString('fr-FR',{maximumFractionDigits:k});
const n2=x=>Math.round(x*100)/100;

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-calage-formes-'));
 const telecharger=async fn=>{const [d]=await Promise.all([page.waitForEvent('download'),fn()]);const f=path.join(dossier,d.suggestedFilename());await d.saveAs(f);return f;};
 const reglages=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)||'null'),CLE);
 const ligne=nom=>page.locator(`${B} [data-cal-rapport="${nom}"]`);
 try{
  // L'unité fictive, sa correspondance, son programme daté de neuf semaines, la période simulée ; puis le réel fabriqué d'après elle.
  const {bilan:b,csv}=await F.charger(page,nav,pathToFileURL(path.resolve(__dirname,'../index.html')).href,dossier);
  // La comparaison et le calage du module, sur les mêmes fichiers.
  const corr=(await reglages()).correspondance;
  const comp=R.comparer(b,R.controler(R.lireReel([{nom:'reel-fictif.csv',lignes:T.lireCsv(csv)}])),corr),rapport=C.caler(comp);
  const cuisine=rapport.lignes.find(l=>l.nom==='Cuisine'),plonge=rapport.lignes.find(l=>l.nom==='Plonge'),bureau=rapport.lignes.find(l=>l.nom==='Bureau');
  assert.deepEqual([cuisine.retenu.modele,cuisine.statut.code,cuisine.lecture],['puissance','limite','besoin'],'la cuisine fictive : une puissance, à la limite');
  assert.deepEqual([plonge.retenu.modele,plonge.statut.code,plonge.lecture],['constante','sur-effectif','effectif mis'],'la plonge fictive : un effectif fixe');
  assert.ok(plonge.rythmeCharge.rythme>0&&bureau.statut===null);

  // 1. « Caler » : la formule retenue en clair et le statut de chaque ligne, ceux du module.
  await page.locator(`${B} [data-cal=caler]`).click();
  await page.waitForSelector(`${B} [data-cal-rapport="Cuisine"] [data-cal-formule]`);
  for(const l of rapport.lignes){
    assert.equal(await ligne(l.nom).locator('[data-cal-retenu]').innerText(),l.retenu.nom,l.nom);
    assert.equal(await ligne(l.nom).locator('summary [data-cal-formule]').innerText(),l.retenu.formule,l.nom+' : la formule en clair');
    const etiquette=ligne(l.nom).locator('summary [data-cal-statut]');
    if(l.statut){
      assert.equal(await etiquette.getAttribute('data-cal-statut'),l.statut.code,l.nom);
      assert.equal(await etiquette.innerText(),l.statut.nom+' : '+l.lecture,l.nom);
    }else assert.equal(await etiquette.count(),0,l.nom+' : hors simulation, pas de statut');
  }
  assert.match(cuisine.retenu.formule,/^heures réelles ≈ 4,\d+ × \(travail au barème\) puissance 0,4$/);
  // La ligne dépliée : la raison du statut ; hors « à la limite », l'effectif mis et sa borne.
  await ligne('Plonge').locator('summary').click();
  const raison=await ligne('Plonge').locator('[data-cal-statut-raison]').innerText();
  assert.ok(raison.startsWith('En sur-effectif : les heures réelles ne suivent pas le travail au barème'),raison);
  assert.match(raison,/La formule retenue dit l’effectif mis, pas le besoin : besoin au plus [\d,]+ × le travail au barème du jour, sans dépasser le prévu \(le rythme des 6 jours les plus chargés\)\.$/);
  assert.equal(await ligne('Plonge').locator('[data-cal-borne]').innerText(),'besoin au plus '+fr(plonge.rythmeCharge.rythme)+' × le travail au barème du jour, sans dépasser le prévu (le rythme des 6 jours les plus chargés)');
  await ligne('Cuisine').locator('summary').click();
  assert.match(await ligne('Cuisine').locator('[data-cal-statut-raison]').innerText(),/^À la limite : .* La formule retenue est aussi le besoin de la ligne\.$/);
  // Le tableau des candidats : les deux références, puis les sept candidats, chacun avec sa formule ; le seuil corrigé.
  const candidats=ligne('Cuisine').locator('[data-cal-candidats] tbody tr');
  assert.deepEqual(await candidats.evaluateAll(l=>l.map(x=>x.dataset.calModele)),['moteur','constante',...cuisine.candidats.map(c=>c.modele)]);
  assert.deepEqual([cuisine.essayes,cuisine.candidats.length+cuisine.confondus.length],[7,7],'les sept candidats essayés (« b + a × » se confond ici avec « × a »)');
  assert.equal(await ligne('Cuisine').locator('[data-cal-confondu]').count(),cuisine.confondus.length);
  assert.equal(await ligne('Cuisine').locator('[data-cal-modele="puissance"] [data-cal-formule-modele]').innerText(),cuisine.retenu.formule);
  assert.match(await ligne('Cuisine').locator('[data-cal-modele="puissance"] th').innerText(),/puissance\s+retenu/);
  assert.equal(await ligne('Cuisine').locator('[data-cal-seuil]').innerText(),'7 candidats essayés : le test de Wilcoxon se juge à 0,05 ÷ 7 = 0,0071. Une forme plus riche n’est retenue que si elle bat la plus simple des acceptées de plus de 0,1 ETP.');
  for(const c of cuisine.candidats.filter(x=>x.choix&&x.choix!=='retenu'))
    assert.equal(await ligne('Cuisine').locator(`[data-cal-modele="${c.modele}"] [data-cal-choix]`).innerText(),c.choix,c.modele);

  // 2. Le nuage de points de la cuisine : un point par jour appris ; la première part (un mois) laissée de côté, ses jours marqués.
  const jours=comp.lignes.find(l=>l.nom==='Cuisine').jours,nuage=ligne('Cuisine').locator('[data-cal-nuage]');
  let d=N.donnees(jours,cuisine.retenu);
  assert.equal(d.part.id.slice(0,5),'mois:','deux mois de 14 jours : la validation par mois');
  assert.equal(await nuage.locator('circle.pcn-point').count(),jours.length);
  assert.equal(await nuage.locator('circle.pcn-cote').count(),d.part.jours);
  assert.equal(await nuage.locator('path.pcn-retenue').count(),1);
  assert.equal(await nuage.locator('path.pcn-xa').count(),1,'la courbe de « × a », à côté de la retenue');
  assert.equal(await nuage.locator('svg').getAttribute('aria-label'),N.decrire(d));
  assert.equal(await nuage.locator('[data-cal-bulle]').innerText(),N.decrire(d));
  assert.match(await nuage.locator('.pcn-legende').innerText(),new RegExp('jour appris\\s*jour laissé de côté \\('+d.part.jours+'\\)\\s*la courbe retenue \\(puissance\\)\\s*« × a »'));
  // Le dessin tient dans sa boîte, sans défilement.
  assert.ok(await nuage.evaluate(f=>{const s=f.querySelector('svg').getBoundingClientRect(),r=f.getBoundingClientRect();return s.width>300&&s.right<=r.right+1&&s.left>=r.left-1;}));
  // Un jour survolé : son cercle, et ses chiffres sous le dessin — ceux du module.
  const i=jours.findIndex((j,k)=>d.points[k].cote),point=nuage.locator(`circle.pcn-point[data-i="${i}"]`);
  await point.scrollIntoViewIfNeeded();
  const boite=await point.boundingBox();
  await page.mouse.move(boite.x+boite.width/2,boite.y+boite.height/2);
  await page.waitForFunction(([sel,texte])=>document.querySelector(sel).textContent===texte,[`${B} [data-cal-rapport="Cuisine"] [data-cal-bulle]`,N.bulle(d,N.plusProche(d,N.px(d,d.points[i].x),N.py(d,d.points[i].y)))]);
  assert.match(await nuage.locator('[data-cal-bulle]').innerText(),/ETP au barème, [\d,]+ ETP réels ; la formule retenue en prévoit [\d,]+, « × a » [\d,]+ — laissé de côté \(le mois de /);
  assert.equal(await nuage.locator('.pcn-curseur').getAttribute('hidden'),null,'le jour survolé est entouré');
  // Le pointeur sorti du dessin : plus de cercle, et la phrase qui décrit le nuage revient.
  await ligne('Cuisine').locator('summary').hover();
  await page.waitForFunction(([sel,texte])=>document.querySelector(sel+' [data-cal-bulle]').textContent===texte&&document.querySelector(sel+' .pcn-curseur').hasAttribute('hidden'),
    [`${B} [data-cal-rapport="Cuisine"]`,N.decrire(d)]);
  // Aucun jour laissé de côté : plus de marque ; une autre part : les siens.
  await nuage.locator('select').selectOption(N.AUCUNE);
  await page.waitForFunction(sel=>!document.querySelector(sel+' circle.pcn-cote'),`${B} [data-cal-rapport="Cuisine"]`);
  d=N.donnees(jours,cuisine.retenu,N.AUCUNE);
  assert.equal(await ligne('Cuisine').locator('[data-cal-bulle]').innerText(),N.decrire(d));
  assert.equal(await ligne('Cuisine').locator('.pcn-l-cote').count(),0);
  const semaine=d.parts.find(p=>p.id.startsWith('semaine:'));
  await ligne('Cuisine').locator('[data-cal-nuage] select').selectOption(semaine.id);
  d=N.donnees(jours,cuisine.retenu,semaine.id);
  await page.waitForFunction(([sel,n])=>document.querySelectorAll(sel+' circle.pcn-cote').length===n,[`${B} [data-cal-rapport="Cuisine"]`,d.part.jours]);
  assert.ok(d.part.jours>=1&&d.part.jours<=7);
  // La ligne reste dépliée et garde sa part quand la page se redessine.
  await page.evaluate(()=>Sim.calage.rendre());
  assert.equal(await ligne('Cuisine').locator('details').evaluate(x=>x.open),true);
  assert.equal(await ligne('Cuisine').locator('[data-cal-nuage] select').inputValue(),semaine.id);

  // 3. « Garder comme politique d'effectif » : le statut et le rythme des jours chargés, sans heure réelle ; le prévu de la page Période, celui du module.
  await page.locator(`${B} [data-cal=garder]`).click();
  await page.waitForSelector(`${B} tr[data-cal-prevu]`);
  const pol=(await reglages()).politique;
  assert.deepEqual(pol.lignes.map(l=>[l.nom,l.modele,l.statut||null,l.rythmeCharge||null]),
    [['Cuisine','puissance','limite',null],['Plonge','constante','sur-effectif',plonge.rythmeCharge.rythme],['Bureau','constante',null,null]]);
  assert.ok(!/"reel"|"heures/.test(JSON.stringify(pol)),'aucune heure réelle dans la politique');
  const prevu=C.prevuDesJours(pol,corr,b.joursTravail,R.simuleDe);
  for(const k of [0,7,20,b.joursTravail.length-1]){
    const w=b.joursTravail[k],rangee=page.locator(`${B} tr[data-cal-prevu="${w.date}"]`),bande=j=>fr(j.prevu)+' ['+fr(j.p10)+' – '+fr(j.p90)+']';
    // Par ligne : le simulé, le prévu et sa bande ; la plonge a une colonne de plus, son besoin « au plus ».
    assert.deepEqual(await rangee.locator('td').allTextContents(),[fr(prevu.lignes[0].jours[k].simule),bande(prevu.lignes[0].jours[k]),
      fr(prevu.lignes[1].jours[k].simule),bande(prevu.lignes[1].jours[k]),fr(prevu.lignes[1].jours[k].besoinAuPlus),
      fr(prevu.lignes[2].jours[k].simule),bande(prevu.lignes[2].jours[k]),bande(prevu.unite[k]),fr(prevu.unite[k].besoinAuPlus)],w.date);
    assert.equal(n2(prevu.lignes[1].jours[k].besoinAuPlus),n2(Math.min(prevu.lignes[1].jours[k].prevu,prevu.lignes[1].jours[k].simule*plonge.rythmeCharge.rythme)));
  }
  assert.equal(await page.locator(`${B} [data-cal-politique-ligne="Cuisine"]`).innerText(),'Cuisine : '+cuisine.retenu.formule+' à la limite : besoin');
  assert.equal(await page.locator(`${B} [data-cal-politique-ligne="Plonge"]`).innerText(),'Plonge : '+plonge.retenu.formule+' en sur-effectif : effectif mis');
  assert.equal(await page.locator(`${B} [data-cal-note-au-plus]`).count(),1);

  // 4. La Synthèse d'une journée : par ligne, les ETP au barème, le prévu et sa bande, le statut, le besoin ; la phrase de tête.
  await nav.aller(page,'j-chiffres');
  await page.waitForSelector('#bilan-cale tr[data-cal-jour-ligne="Plonge"]');
  const jour=await page.evaluate(()=>Sim.calage.a.journee()),pj=C.prevuDesJours(pol,corr,[jour],R.simuleDe);
  assert.deepEqual(await page.locator('#bilan-cale thead th').allTextContents(),['Ligne','Au barème (ETP)','Prévu (ETP)','P10 – P90','Statut','Besoin (ETP)']);
  const cellules=nom=>page.locator(`#bilan-cale tr[data-cal-jour-ligne="${nom}"] td`).allTextContents();
  const tete=l=>[fr(l.jours[0].simule),fr(l.jours[0].prevu),fr(l.jours[0].p10)+' – '+fr(l.jours[0].p90)];
  assert.deepEqual(await cellules('Cuisine'),[...tete(pj.lignes[0]),'à la limite besoin','le prévu']);
  assert.deepEqual(await cellules('Plonge'),[...tete(pj.lignes[1]),'en sur-effectif effectif mis','au plus '+fr(pj.lignes[1].jours[0].besoinAuPlus)]);
  assert.deepEqual(await cellules('Bureau'),[...tete(pj.lignes[2]),'—','—']);
  assert.deepEqual(await cellules('Toute l’unité'),[fr(pj.unite[0].simule),fr(pj.unite[0].prevu),fr(pj.unite[0].p10)+' – '+fr(pj.unite[0].p90),'—','au plus '+fr(pj.unite[0].besoinAuPlus)]);
  // La phrase de tête gagne une phrase : ce que l'unité mettrait, d'après les heures réelles.
  const u=pj.unite[0],entier=x=>String(Math.max(0,Math.round(x)));
  const phrasesTete=await page.locator('#bilan-journee .sy-tete p').allTextContents();
  assert.equal(phrasesTete.length,3);
  assert.equal(phrasesTete[2],'D’après les heures réelles, l’unité mettrait '+entier(u.prevu)+' personnes (de '+entier(u.p10)+' à '+entier(u.p90)+').');
  // Le tableau « Les services » ne change pas : ses onze colonnes.
  assert.equal(await page.locator('#bilan-journee .sy-table thead th').count(),11);
  // La politique oubliée : la phrase s'en va, le bloc aussi.
  await nav.aller(page,'j-periode');

  // 5. Les classeurs. La feuille Période : « Statut » et « Besoin au plus (ETP) », à droite du prévu.
  const xPeriode=await T.lireClasseur(new Uint8Array(fs.readFileSync(await telecharger(()=>page.locator('#journee-periode [data-pv=exporter]').click()))));
  const fp=xPeriode.find(f=>f.nom==='Période').lignes;
  assert.deepEqual(fp[0].slice(-6),['Simulé de la ligne (ETP)','Prévu calé (ETP)','P10 (ETP)','P90 (ETP)','Statut','Besoin au plus (ETP)']);
  // Une case vide en bout de rangée ne s'écrit pas : on lit par colonne.
  const rangees=nom=>fp.filter(l=>l[7]===nom),case_=(l,nom)=>{const v=l[fp[0].indexOf(nom)];return v===undefined?null:v;};
  const trois=l=>[case_(l,'Prévu calé (ETP)'),case_(l,'Statut'),case_(l,'Besoin au plus (ETP)')];
  assert.deepEqual(rangees('Ligne : Plonge').map(trois),prevu.lignes[1].jours.map(j=>[n2(j.prevu),'en sur-effectif',n2(j.besoinAuPlus)]));
  assert.deepEqual(rangees('Ligne : Cuisine').map(trois),prevu.lignes[0].jours.map(j=>[n2(j.prevu),'à la limite',null]));
  assert.deepEqual(rangees('Ligne : Bureau').map(trois),prevu.lignes[2].jours.map(j=>[n2(j.prevu),null,null]));
  assert.deepEqual(rangees('Toute l’unité (prévu calé)').map(trois),prevu.unite.map(j=>[n2(j.prevu),null,n2(j.besoinAuPlus)]));
  // La feuille Calage : la formule, p, le choix, le statut, le rythme des jours chargés.
  const xCalage=await T.lireClasseur(new Uint8Array(fs.readFileSync(await telecharger(()=>page.locator(`${B} [data-cal=exporter]`).click()))));
  const fc=xCalage.find(f=>f.nom==='Calage').lignes,col=nom=>fc[0].indexOf(nom);
  assert.deepEqual(fc[0].slice(-9),['p','p min','p max','Formule','Choix','Statut','Ce que dit la formule','Rythme des jours chargés','Raison du statut']);
  const retenu=nom=>fc.find(l=>l[0]===nom&&l[2]==='retenu');
  assert.deepEqual([retenu('Cuisine')[col('Modèle')],retenu('Cuisine')[col('p')],retenu('Cuisine')[col('Formule')],retenu('Cuisine')[col('Statut')],retenu('Cuisine')[col('Ce que dit la formule')]],
    ['puissance',cuisine.retenu.parametres.p,cuisine.retenu.formule,'à la limite','besoin']);
  assert.deepEqual([retenu('Plonge')[col('Statut')],retenu('Plonge')[col('Ce que dit la formule')],retenu('Plonge')[col('Rythme des jours chargés')]],
    ['en sur-effectif','effectif mis',Math.round(plonge.rythmeCharge.rythme*1000)/1000]);
  assert.equal(retenu('Plonge')[col('Raison du statut')],plonge.statut.raison);

  // 5 bis. Une politique gardée avant l'évolution (ni statut ni rythme) : la page Période d'avant — ni formules, ni colonne « besoin au plus » —
  // et, dans la Synthèse, le bloc d'avant à quatre colonnes ; la phrase de tête, elle, dit toujours ce que l'unité mettrait.
  const avant={...pol,lignes:pol.lignes.map(({statut,rythmeCharge,...l})=>l)};
  await page.evaluate(p=>{Sim.calage.politique=p;Sim.calage.rendre();},avant);
  await page.waitForFunction(sel=>!document.querySelector(sel+' [data-cal-politique-ligne]'),B);
  assert.equal(await page.locator(`${B} .pc-formules, ${B} [data-cal-au-plus], ${B} [data-cal-au-plus-total], ${B} [data-cal-note-au-plus]`).count(),0);
  const prevuAvant=C.prevuDesJours(avant,corr,b.joursTravail,R.simuleDe),w7=b.joursTravail[7],bande7=j=>fr(j.prevu)+' ['+fr(j.p10)+' – '+fr(j.p90)+']';
  assert.deepEqual(await page.locator(`${B} tr[data-cal-prevu="${w7.date}"] td`).allTextContents(),
    [...prevuAvant.lignes.flatMap(l=>[fr(l.jours[7].simule),bande7(l.jours[7])]),bande7(prevuAvant.unite[7])],'le tableau des jours d’avant');
  assert.deepEqual(prevuAvant.lignes.map(l=>l.jours[7].prevu),prevu.lignes.map(l=>l.jours[7].prevu),'le même prévu');
  await nav.aller(page,'j-chiffres');
  await page.waitForSelector('#bilan-cale tr[data-cal-jour-ligne="Plonge"]');
  assert.deepEqual(await page.locator('#bilan-cale thead th').allTextContents(),['Ligne','Simulé (ETP)','Prévu calé','P10 – P90']);
  assert.equal(await page.locator('#bilan-cale tr[data-cal-jour-ligne="Plonge"] td').count(),3);
  assert.equal(await page.locator('#bilan-journee .sy-tete p').count(),3);
  await nav.aller(page,'j-periode');
  await page.evaluate(p=>{Sim.calage.politique=p;Sim.calage.rendre();},pol);
  await page.waitForSelector(`${B} [data-cal-politique-ligne="Plonge"]`);

  // 6. « Oublier la politique » : le bloc de la Synthèse et sa phrase s'en vont.
  await page.locator(`${B} [data-cal=oublier]`).click();
  await page.waitForFunction(sel=>!document.querySelector(sel),`${B} tr[data-cal-prevu]`);
  await nav.aller(page,'j-chiffres');
  await page.waitForFunction(()=>document.querySelectorAll('#bilan-journee .sy-tete p').length===2);
  assert.equal(await page.locator('#bilan-cale tr').count(),0);

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('calage-formes-browser : ok — la formule en clair et le statut de chaque ligne, le tableau des candidats, le nuage de points et ses jours laissés de côté, le prévu de la Période et de la Synthèse égaux à ceux du module, la phrase de tête, les colonnes des classeurs');
 }finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});

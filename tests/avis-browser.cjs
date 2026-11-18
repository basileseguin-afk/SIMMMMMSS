/* Évolution 19 (d) — un problème est un problème (version 1). Sur une unité
 * fictive qui porte un avis de chaque niveau :
 *   1. le registre range chaque avis à son niveau : « bloquant » (une commande
 *      que personne ne prépare), « à corriger » (une compagnie qu'aucun
 *      handling ne charge), « information » (une commande sans vol ce jour-là) ;
 *   2. la pastille du menu, sur « Contrôles », ne compte que les deux premiers :
 *      la commande sans vol n'est pas comptée ; son ton et sa bulle disent les niveaux ;
 *   3. « Contrôles » (évolution 22 d : le panneau « Problèmes » et les deux pages de
 *      contrôle en une) : trois colonnes, « Bloquant », « À corriger »,
 *      « Information » ; un avis mène là où il se règle ;
 *   4. une seule pastille, sur « Contrôles », sans les informations ;
 *   5. les mêmes mots dans les pages : les chemins, « Contrôles », la Synthèse,
 *      l'état du calcul ;
 *   6. un calcul qui ne se fait pas est bloquant ;
 *   7. tout corrigé : plus de problème, le compteur s'efface, l'information
 *      reste lisible.
 * Données fictives : des compagnies, des vols et des équipes inventés. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

// Ce jour-là, NORD, SUD et EST volent ; OUEST ne vole pas.
const VOLS_CSV='vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_CREW\n'
  +'NO1,NORD,MOYEN,DEP,12:00,,0,0,100,0\nNO2,NORD,MOYEN,DEP,15:00,,0,0,120,0\nSU1,SUD,MOYEN,DEP,13:00,,0,0,90,0\nES1,EST,MOYEN,DEP,14:00,,0,0,80,0\n';
/* L'unité : chaque commande a son chemin (cuisine, puis montage). `sud` : SUD/YC est-elle préparée ? `cies` : les
 * compagnies que le handling charge (aucune liste : toutes). Le montage sert aussi OUEST, qui ne vole pas ce jour-là. */
const UNITE=({sud,cies,faute})=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
  st.parcours=[{id:'ch',nom:'Chaud',noeuds:['cuisine','prepa'],liens:[{de:'cuisine',vers:'prepa'}]}];
  st.parcoursClasse={'NORD/YC':'ch','SUD/YC':'ch','EST/YC':'ch'};st.parcoursCabine={};
  const lots=[['NORD/YC'],['EST/YC']].concat(sud?[['SUD/YC']]:[]);
  const equipe=(id,nom,service,l)=>({id,nom,service,type:'manuel',debut:'05:00',jour:0,personnes:3,pauses:[],lots:l,regime:{actif:false}});
  st.ateliers=[equipe('cu','Cuisine chaud','cuisine',lots),
    equipe('mo','Montage','prepa',lots.concat([['OUEST/YC'],['OUEST/CREW']],faute?[['NORD/CRWE']]:[])),
    {id:'h',nom:'Quais',service:'quais',type:'handling',debut:'04:00',jour:0,personnes:2,pauses:[],lots:[],regime:{actif:true},durees:{'*':20},...(cies?{compagnies:cies}:{})}];
  st.effectifs={cuisine:'impose',prepa:'impose'};},'');

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=300)=>page.waitForTimeout(ms);
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-avis-'));
 const csv=path.join(dossier,'vols-fictifs.csv');fs.writeFileSync(csv,VOLS_CSV);
 const registre=()=>page.evaluate(()=>Sim.problemes.liste.map(p=>({niveau:p.niveau,titre:p.titre,detail:p.detail,page:p.page,service:p.service||null})));
 // (Évolution 22 d : le compteur est la pastille de l'entrée « Contrôles » ; le bouton « Problèmes » n'existe plus.)
 const compteur=()=>page.evaluate(()=>{const c=document.querySelector('#menu [data-entree="mu-pas"] .so-badge');
   return {n:c?+c.textContent:0,tons:c?['retard','attente'].filter(t=>c.classList.contains(t)):[],bulle:c?c.title:''};});
 const de=(r,n)=>r.filter(p=>p.niveau===n);
 const C='#mu-pas';
 const ouvrirControles=async()=>{await nav.aller(page,'mu-pas');await attendre();};
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(500);
  await nav.aller(page,'v-programme');
  await page.locator('#imp-vols').setInputFiles(csv);
  await page.waitForFunction(()=>document.getElementById('source-label').textContent==='vols-fictifs.csv');
  await page.evaluate(UNITE,{sud:false,cies:['NORD','SUD']});await attendre(500);

  // 1. Un avis de chaque niveau, chacun au sien.
  let r=await registre();
  const calcul=await page.evaluate(()=>{const x=Sim.ateliers.resultat;return {ok:x.ok,codes:(x.anomalies||[]).map(a=>a.code).sort(),sans:x.indicateurs.classesAbsentes};});
  assert.equal(calcul.ok,true,'la journée se calcule');
  assert.equal(calcul.sans,1,'SUD/YC n’est préparée par personne');
  assert.ok(calcul.codes.includes('handling-sans')&&calcul.codes.includes('commande-absente'),JSON.stringify(calcul.codes));
  assert.deepEqual(de(r,'bloquant').map(p=>[p.titre,p.page]),[['Chaque commande a quelqu’un pour la préparer','mu-services']],JSON.stringify(r));
  assert.match(de(r,'bloquant')[0].detail,/^1 commande n’est préparée par aucune équipe/);
  const handling=de(r,'corriger').filter(p=>/aucun handling ne charge cette compagnie/.test(p.titre));
  assert.deepEqual(handling.map(p=>p.titre.slice(0,11)),['1 vol EST :'],'une compagnie qu’aucun handling ne charge : à corriger — '+JSON.stringify(r));
  const sansVol=de(r,'information').filter(p=>/n’ont aucun vol ce jour-là/.test(p.titre));
  assert.equal(sansVol.length,1,'une commande sans vol ce jour-là : une information — '+JSON.stringify(r));
  assert.match(sansVol[0].titre,/^Montage : .*Ouest/i);
  // Du bloquant à l'information.
  assert.deepEqual([...new Set(r.map(p=>p.niveau))],['bloquant','corriger','information']);

  // 2. Le compteur ne compte que les deux premiers niveaux : la commande sans vol n'est pas comptée.
  const nB=de(r,'bloquant').length,nC=de(r,'corriger').length,nI=de(r,'information').length;
  let c=await compteur();
  assert.equal(c.n,nB+nC,'le compteur : bloquants et à corriger');
  assert.ok(nI>=1&&c.n===r.length-nI,'les informations ne sont pas comptées');
  assert.deepEqual(c.tons,['retard'],'un bloquant : le nombre est rouge');
  assert.match(c.bulle,new RegExp('^1 bloquant · '+nC+' à corriger$'),c.bulle);
  assert.equal(await page.locator('#btn-problemes, #problemes').count(),0,'plus de bouton ni de panneau « Problèmes »');

  // 3. « Contrôles » : la ligne d'état, puis trois colonnes — les avis du registre, au même niveau.
  await ouvrirControles();
  assert.equal(await page.locator('#view-title').textContent(),'Contrôles');
  assert.deepEqual(await page.locator(`${C} .ct-niveau`).evaluateAll(s=>s.map(x=>x.dataset.ctNiveau)),['bloquant','corriger','information'],'bloquant, à corriger, information');
  assert.match(await page.locator(`${C} .ct-etat`).innerText(),/^Le calcul est à jour[\s\S]*Voir la Synthèse →$/);
  assert.match(await page.locator(`${C} .ct-niveau.bloquant h3`).innerText(),/^Bloquant\s*1$/i);
  assert.match(await page.locator(`${C} .ct-niveau.corriger h3`).innerText(),new RegExp('^À corriger\\s*'+nC+'$','i'));
  assert.match(await page.locator(`${C} .ct-niveau.information h3`).innerText(),new RegExp('^Information\\s*'+nI+'$','i'));
  assert.match(await page.locator(`${C} .ct-niveau.bloquant .ct-dit`).innerText(),/^Le calcul ne se fait pas, ou une commande n’est préparée par personne\.$/);
  assert.match(await page.locator(`${C} .ct-niveau.corriger .ct-dit`).innerText(),/^Le calcul se fait, mais il est faux pour une part\.$/);
  // Les mêmes avis, au même niveau : colonne par colonne, les titres du registre, dans l'ordre.
  for(const n of ['bloquant','corriger','information'])
    assert.deepEqual(await page.locator(`${C} .ct-niveau.${n} .ct-point .ct-corps>b`).evaluateAll(bs=>bs.map(b=>b.textContent)),de(r,n).map(p=>p.titre),n+' : les avis du registre');
  // Trois informations d'emblée ; les suivantes sont repliées, et se déplient.
  const infos=page.locator(`${C} .ct-niveau.information`);
  assert.equal(await infos.locator('.ct-point:visible').count(),Math.min(nI,3),'trois informations au plus se lisent d’emblée');
  if(nI>3){
    const plus=infos.locator('details.ct-plus');
    assert.equal(await plus.evaluate(d=>d.open),false,'au-delà de trois, les informations sont repliées');
    assert.match(await plus.locator('summary').innerText(),new RegExp('^'+(nI-3)+' autres? informations?$'));
    await plus.locator('summary').click();await attendre(150);
    assert.equal(await infos.locator('.ct-point:visible').count(),nI,'elles se déplient');
  }
  assert.match(await infos.innerText(),/Montage : .* n’ont aucun vol ce jour-là/);
  // Chaque avis a un bouton nommé par sa destination ; celui d'une information se lit (« Voir dans… »).
  assert.equal(await page.locator(`${C} .ct-point [data-ct-aller]`).count(),r.length,'un bouton par avis');
  assert.match(await page.locator(`${C} .ct-niveau.bloquant [data-ct-aller]`).innerText(),/^Régler dans Services et équipes →$/);
  // Une information mène aussi quelque part : ici, à la fiche de l'équipe qui porte la commande sans vol.
  const sansVolIci=infos.locator('.ct-point',{hasText:'aucun vol ce jour-là'});
  assert.match(await sansVolIci.locator('[data-ct-aller]').innerText(),/^Voir dans Services et équipes →$/);
  await sansVolIci.locator('[data-ct-aller]').click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-services','« Services et équipes »');
  assert.deepEqual(await page.evaluate(()=>[Sim.unite.choisi,Sim.unite.equipeOuverte]),['prepa','mo'],'la fiche de l’équipe');

  // 4. La pastille du menu (évolution 22 a) : une seule, sur « Contrôles » — les problèmes de toute l'unité, sans les
  //    informations. Les autres entrées n'en portent plus ; le compte par page reste celui du registre.
  for(const id of ['mu-services','mu-pas','mu-flux']){
    await nav.aller(page,id);
    const pastilles=await page.evaluate(()=>[...document.querySelectorAll('#menu [data-sous-onglet]')].filter(b=>b.querySelector('.so-badge')).map(b=>{
      const n=b.querySelector('.so-badge');return [b.dataset.entree,+n.textContent,n.title];}));
    const attendu=await page.evaluate(()=>OrlyAvis.compte(Sim.problemes.liste));
    assert.ok(attendu>0,'l’unité a des problèmes');
    assert.deepEqual(pastilles.map(x=>x.slice(0,2)),[['mu-pas',attendu]],id+' : une seule pastille, sur « Contrôles », dérivée du registre');
    assert.match(pastilles[0][2],/(bloquants?|à corriger)$/,'sa bulle dit quoi : '+pastilles[0][2]);
    assert.doesNotMatch(pastilles[0][2],/information/,'jamais les informations');
  }
  const ici=await page.evaluate(()=>({services:OrlyAvis.compte(Sim.problemes.liste,'mu-services'),
    avecInfos:Sim.problemes.liste.filter(p=>p.page==='mu-services').length}));
  assert.ok(ici.avecInfos>ici.services,'la commande sans vol se règlerait dans « Services et équipes », et n’y compte pas');

  // 5. Les mêmes mots dans les pages.
  //    Les chemins : « À corriger », puis l'information repliée. (Évolution 22 b : « Équipes une par une », où ces avis
  //    se lisaient aussi, n'est plus une page.)
  await nav.aller(page,'mu-flux');
  const boite=page.locator('#at-anomalies');
  await boite.evaluate(d=>{d.open=true;});
  assert.deepEqual(await boite.locator('.avis-niveau').evaluateAll(s=>s.map(x=>x.tagName+' '+x.className)),
    ['SECTION avis-niveau corriger','DETAILS avis-niveau information'],'les avis de la page, par niveau');
  assert.match(await boite.locator('.avis-niveau.corriger h4').innerText(),/^À corriger$/);
  assert.match(await boite.locator('.avis-niveau.corriger').innerText(),/1 vol EST : aucun handling ne charge cette compagnie/);
  const infosPage=boite.locator('details.avis-niveau.information');
  assert.equal(await infosPage.evaluate(d=>d.open),false,'l’information est repliée');
  assert.match(await infosPage.locator('summary').innerText(),/^Information$/);
  assert.doesNotMatch(await boite.innerText(),/aucun vol ce jour-là/,'repliée : pas encore lue');
  await infosPage.locator('summary').click();await attendre(150);
  assert.match(await boite.innerText(),/Montage : .* n’ont aucun vol ce jour-là/);
  assert.doesNotMatch(await boite.locator('summary').first().innerText(),/\d/,'pas de nombre à part');
  //    « Contrôles » : ce que le calcul dit, aux mêmes niveaux. « Contrôles détaillés » y mène (évolution 22 d).
  await nav.aller(page,'u-lecture');await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-pas','« Contrôles détaillés » mène à « Contrôles »');
  const corriger=page.locator(`${C} .ct-niveau.corriger`),avisHandling=corriger.locator('.ct-point',{hasText:'aucun handling ne charge'});
  assert.equal(await avisHandling.count(),1);
  assert.match(await avisHandling.locator('[data-ct-aller]').innerText(),/^Régler dans Services et équipes →$/);
  assert.equal(await avisHandling.locator('[data-ct-voulu]').innerText(),'C’est voulu','et « C’est voulu », puisqu’il en a un');
  assert.equal(await page.locator(`${C} [data-ct-voulu]`).count(),1,'les autres avis n’en ont pas');
  const duCalcul=await page.evaluate(()=>Sim.ateliers.resultat.anomalies.filter(a=>OrlyAvis.niveauDuCode(a.code)==='information').length);
  assert.equal(nI,duCalcul,'les informations sont celles du calcul');
  assert.equal(await page.locator(`${C} .ct-niveau.bloquant .ct-point`,{hasText:'NORD'}).count(),0,'le calcul se fait : rien de bloquant dans ce qu’il dit');
  //    Le bouton du handling mène à l'équipe du handling.
  await avisHandling.locator('[data-ct-aller]').click();await attendre();
  assert.deepEqual(await page.evaluate(()=>[document.body.dataset.sous,Sim.unite.choisi,Sim.unite.equipeOuverte]),['mu-services','quais','h']);
  //    La Synthèse : la commande que personne ne prépare est un problème bloquant.
  await nav.aller(page,'j-chiffres');
  assert.match(await page.locator('.bilan-probleme').first().innerText(),/1 commande que personne ne prépare\s*— un problème bloquant/);

  // 6. Une commande mal écrite : le calcul ne se fait pas, c'est bloquant, partout.
  await page.evaluate(UNITE,{sud:false,cies:['NORD','SUD'],faute:true});await attendre(500);
  assert.equal(await page.evaluate(()=>Sim.ateliers.resultat.ok),false,'le calcul s’arrête');
  r=await registre();
  assert.ok(de(r,'bloquant').some(p=>/NORD\/CRWE/.test(p.titre)),'ce que le calcul refuse est bloquant : '+JSON.stringify(de(r,'bloquant')));
  assert.equal(await page.locator('#calcul-etat').getAttribute('title'),'Le calcul s’arrête sur un point bloquant : voir les contrôles');
  await nav.aller(page,'mu-flux');
  await boite.evaluate(d=>{d.open=true;});
  assert.match(await boite.locator('.avis-niveau.bloquant h4').innerText(),/^Bloquant$/);
  assert.match(await boite.locator('.avis-niveau.bloquant').innerText(),/NORD\/CRWE/);
  // L'état du calcul, en tête, mène à « Contrôles » ; sa ligne d'état le dit, et la colonne « Bloquant » porte le point.
  await page.locator('#calcul-etat').click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-pas');
  assert.match(await page.locator(`${C} .ct-etat`).innerText(),/^Le calcul est arrêté par un point bloquant/);
  assert.equal(await page.locator(`${C} .ct-etat`).getAttribute('data-ct-etat'),'arret');
  assert.match(await page.locator(`${C} .ct-niveau.bloquant`).innerText(),/NORD\/CRWE/);
  assert.match(await page.locator(`${C} .ct-niveau.bloquant .ct-dit`).innerText(),/Le calcul ne se fait pas/);

  // 7. Tout corrigé : SUD/YC est préparée, le handling charge toutes les compagnies. Il ne reste que l'information.
  await page.evaluate(UNITE,{sud:true,cies:null});await attendre(500);
  r=await registre();
  assert.deepEqual(de(r,'bloquant'),[],'plus rien de bloquant : '+JSON.stringify(r));
  assert.deepEqual(de(r,'corriger').filter(p=>/handling/.test(p.titre)),[],'le handling charge EST');
  const reste=de(r,'corriger').length;
  c=await compteur();
  assert.equal(c.n,reste,'le compteur suit');
  assert.ok(de(r,'information').some(p=>/aucun vol ce jour-là/.test(p.titre)),'la commande sans vol reste une information');
  if(!reste){
    assert.deepEqual(c.tons,[],'plus de nombre, plus de ton');
    assert.equal(await page.locator('#menu .so-badge').count(),0,'plus de pastille au menu');
    // « Contrôles » : deux colonnes vides le disent en une phrase ; l'information reste lisible.
    await ouvrirControles();
    assert.match(await page.locator(`${C} .ct-niveau.bloquant .ct-vide`).innerText(),/^Rien de bloquant : le calcul se fait, et chaque commande a une équipe pour la préparer\.$/);
    assert.match(await page.locator(`${C} .ct-niveau.corriger .ct-vide`).innerText(),/^Rien à corriger\.$/);
    assert.deepEqual(await page.locator(`${C} .ct-niveau .ct-n`).allInnerTexts(),['0','0',String(de(r,'information').length)]);
    assert.equal(await page.locator(`${C} .ct-niveau.bloquant .ct-point, ${C} .ct-niveau.corriger .ct-point`).count(),0);
    assert.match(await page.locator(`${C} .ct-niveau.information`).innerText(),/aucun vol ce jour-là/);
    // Les équipes : rien que des informations ; la boîte est leur repli, et elle le dit.
    await nav.aller(page,'mu-flux');
    assert.match(await boite.locator('summary').first().innerText(),/^Information$/);
    assert.equal(await boite.locator('.avis-niveau').count(),0,'pas de repli dans le repli');
    assert.equal(await boite.evaluate(d=>d.classList.contains('at-informations')),true);
    assert.match(await boite.evaluate(d=>d.textContent),/Montage : .* n’ont aucun vol ce jour-là/);
  }
  assert.equal(reste,0,'l’unité fictive, corrigée, n’a plus de problème : '+JSON.stringify(de(r,'corriger')));

  assert.deepEqual(errors,[],errors.join(' | '));
  console.log('avis-browser : ok — un avis de chaque niveau, la pastille sans les informations, « Contrôles » (trois colonnes, un bouton par avis), les pages');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})();

/* Évolution 19 (d) — un problème est un problème (version 1). Sur une unité
 * fictive qui porte un avis de chaque niveau :
 *   1. le registre range chaque avis à son niveau : « bloquant » (une commande
 *      que personne ne prépare), « à corriger » (une compagnie qu'aucun
 *      handling ne charge), « information » (une commande sans vol ce jour-là) ;
 *   2. le compteur du menu ne compte que les deux premiers : la commande sans
 *      vol n'est pas comptée ; son ton et sa bulle disent les niveaux ;
 *   3. le panneau : « Bloquant », « À corriger », puis les informations
 *      repliées, dessous ; elles se déplient ;
 *   4. le nombre d'un onglet en dérive, sans les informations ;
 *   5. les mêmes mots dans les pages : les équipes, « Contrôles détaillés »,
 *      la Synthèse, l'état du calcul ;
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
 const compteur=()=>page.evaluate(()=>{const c=document.querySelector('#btn-problemes .pb-compte');
   return {n:c.hidden?0:+c.textContent,tons:['retard','attente'].filter(t=>c.classList.contains(t)),bulle:document.getElementById('btn-problemes').title};});
 const de=(r,n)=>r.filter(p=>p.niveau===n);
 const ouvrirPanneau=async()=>{await page.locator('#btn-problemes').click();await attendre();};
 const fermerPanneau=async()=>{await page.keyboard.press('Escape');await attendre(150);};
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
  assert.match(c.bulle,new RegExp('^1 bloquant · '+nC+' à corriger ; '+nI+' informations? à lire, sans rien à faire$'),c.bulle);

  // 3. Le panneau : les deux premiers niveaux, puis les informations repliées, dessous.
  await ouvrirPanneau();
  assert.deepEqual(await page.locator('#problemes .pb-groupe').evaluateAll(s=>s.map(x=>x.tagName+' '+x.className)),
    ['SECTION pb-groupe bloquant','SECTION pb-groupe corriger','DETAILS pb-groupe information'],'bloquant, à corriger, information');
  assert.equal(await page.locator('#problemes .pb-total').innerText(),'1 bloquant · '+nC+' à corriger');
  assert.match(await page.locator('#problemes .pb-groupe.bloquant h3').innerText(),/^BLOQUANT\s*1$/i);
  assert.match(await page.locator('#problemes .pb-groupe.corriger h3').innerText(),new RegExp('^À CORRIGER\\s*'+nC+'$','i'));
  assert.match(await page.locator('#problemes .pb-groupe.bloquant .pb-dit').innerText(),/^Le calcul ne se fait pas, ou une commande n’est préparée par personne\.$/);
  assert.match(await page.locator('#problemes .pb-groupe.corriger .pb-dit').innerText(),/^Le calcul se fait, mais il est faux pour une part\.$/);
  const infos=page.locator('#problemes details.pb-groupe.information');
  assert.equal(await infos.evaluate(d=>d.open),false,'les informations sont repliées');
  assert.match(await infos.locator('summary').innerText(),new RegExp('^INFORMATION\\s*rien à faire\\s*'+nI+'$','i'));
  assert.equal(await infos.locator('.pb').first().isVisible(),false,'repliées : on ne les lit pas encore');
  assert.equal(await page.locator('#problemes .pb:visible').count(),nB+nC,'on lit d’abord les problèmes');
  await infos.locator('summary').click();await attendre(150);
  assert.equal(await infos.evaluate(d=>d.open),true,'elles se déplient');
  assert.match(await infos.innerText(),/Montage : .* n’ont aucun vol ce jour-là/);
  // Une information mène aussi quelque part : ici, à la fiche du service.
  await infos.locator('.pb',{hasText:'aucun vol ce jour-là'}).click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-services','la fiche du service');
  assert.equal(await page.evaluate(()=>Sim.unite.choisi),'prepa');

  // 4. Le nombre d'un onglet : les problèmes qui se règlent sur sa page, sans les informations.
  for(const id of ['mu-services','mu-pas','at-chemins']){
    await nav.aller(page,id);
    const badges=await page.evaluate(()=>[...document.querySelectorAll('#sous-onglets [data-sous-onglet]')].map(b=>{
      const n=b.querySelector('.so-badge');return [b.dataset.sousOnglet,n?+n.textContent:0,OrlyAvis.compte(Sim.problemes.liste,b.dataset.sousOnglet),n?n.title:''];}));
    for(const [onglet,vu,attendu,bulle] of badges){
      assert.equal(vu,attendu,onglet+' : son nombre dérive du registre');
      if(vu)assert.match(bulle,/(bloquants?|à corriger), à régler ici$/,onglet+' : '+bulle);
    }
  }
  const ici=await page.evaluate(()=>({services:OrlyAvis.compte(Sim.problemes.liste,'mu-services'),
    avecInfos:Sim.problemes.liste.filter(p=>p.page==='mu-services').length}));
  assert.ok(ici.avecInfos>ici.services,'la commande sans vol se règlerait dans « Services et équipes », et n’y compte pas');

  // 5. Les mêmes mots dans les pages.
  //    Les équipes : « À corriger », puis l'information repliée.
  await nav.aller(page,'at-equipes');
  const boite=page.locator('#at-anomalies');
  await boite.evaluate(d=>{d.open=true;});
  assert.deepEqual(await boite.locator('.avis-niveau').evaluateAll(s=>s.map(x=>x.tagName+' '+x.className)),
    ['SECTION avis-niveau corriger','DETAILS avis-niveau information'],'les avis de la page, par niveau');
  assert.match(await boite.locator('.avis-niveau.corriger h4').innerText(),/^À corriger$/);
  assert.match(await boite.locator('.avis-niveau.corriger').innerText(),/1 vol EST : aucun handling ne charge cette compagnie/);
  const infosPage=boite.locator('details.avis-niveau.information');
  assert.equal(await infosPage.evaluate(d=>d.open),false,'l’information est repliée');
  assert.match(await infosPage.locator('summary').innerText(),/^Information — rien à faire$/);
  assert.doesNotMatch(await boite.innerText(),/aucun vol ce jour-là/,'repliée : pas encore lue');
  await infosPage.locator('summary').click();await attendre(150);
  assert.match(await boite.innerText(),/Montage : .* n’ont aucun vol ce jour-là/);
  assert.doesNotMatch(await boite.locator('summary').first().innerText(),/\d/,'pas de nombre à part');
  //    « Contrôles détaillés » : ce que le calcul dit, aux mêmes niveaux.
  await nav.aller(page,'u-lecture');
  const controles=page.locator('#fc-calcul');
  assert.match(await controles.locator('.avis-corriger b').innerText(),/^1 point à corriger$/);
  assert.match(await controles.locator('.avis-corriger').innerText(),/Le calcul se fait, mais il est faux pour une part\.[\s\S]*aucun handling ne charge/);
  assert.equal(await controles.locator('details.avis-information').evaluate(d=>d.open),false);
  const duCalcul=await page.evaluate(()=>Sim.ateliers.resultat.anomalies.filter(a=>OrlyAvis.niveauDuCode(a.code)==='information').length);
  assert.match(await controles.locator('details.avis-information summary').innerText(),new RegExp('^'+duCalcul+' informations? — rien à faire'));
  assert.match(await controles.locator('details.avis-information').evaluate(d=>d.textContent),/n’ont aucun vol ce jour-là/);
  assert.equal(await controles.locator('.avis-bloquant').count(),0,'le calcul se fait : rien de bloquant dans ce qu’il dit');
  //    La Synthèse : la commande que personne ne prépare est un problème bloquant.
  await nav.aller(page,'j-chiffres');
  assert.match(await page.locator('.bilan-probleme').first().innerText(),/1 commande que personne ne prépare\s*— un problème bloquant/);

  // 6. Une commande mal écrite : le calcul ne se fait pas, c'est bloquant, partout.
  await page.evaluate(UNITE,{sud:false,cies:['NORD','SUD'],faute:true});await attendre(500);
  assert.equal(await page.evaluate(()=>Sim.ateliers.resultat.ok),false,'le calcul s’arrête');
  r=await registre();
  assert.ok(de(r,'bloquant').some(p=>/NORD\/CRWE/.test(p.titre)),'ce que le calcul refuse est bloquant : '+JSON.stringify(de(r,'bloquant')));
  assert.equal(await page.locator('#calcul-etat').getAttribute('title'),'Le calcul s’arrête sur un point bloquant : voir les problèmes');
  await nav.aller(page,'at-equipes');
  await boite.evaluate(d=>{d.open=true;});
  assert.match(await boite.locator('.avis-niveau.bloquant h4').innerText(),/^Bloquant$/);
  assert.match(await boite.locator('.avis-niveau.bloquant').innerText(),/NORD\/CRWE/);
  await nav.aller(page,'u-lecture');
  assert.match(await controles.locator('.avis-bloquant b').innerText(),/^1 point bloquant$/);
  assert.match(await controles.locator('.avis-bloquant').innerText(),/Le calcul ne se fait pas/);

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
    assert.match(c.bulle,/^Aucun problème : rien de bloquant, rien à corriger ; \d+ informations? à lire, sans rien à faire$/,c.bulle);
    await ouvrirPanneau();
    assert.match(await page.locator('#problemes .pb-vide').innerText(),/Rien de bloquant, rien à corriger/);
    assert.equal(await page.locator('#problemes .pb-total').innerText(),'aucun');
    assert.equal(await page.locator('#problemes section.pb-groupe').count(),0);
    assert.equal(await page.locator('#problemes details.pb-groupe.information').evaluate(d=>d.open),false);
    await fermerPanneau();
    // Les équipes : rien que des informations ; la boîte est leur repli, et elle le dit.
    await nav.aller(page,'at-equipes');
    assert.match(await boite.locator('summary').first().innerText(),/^Information — rien à faire$/);
    assert.equal(await boite.locator('.avis-niveau').count(),0,'pas de repli dans le repli');
    assert.equal(await boite.evaluate(d=>d.classList.contains('at-informations')),true);
    assert.match(await boite.evaluate(d=>d.textContent),/Montage : .* n’ont aucun vol ce jour-là/);
  }
  assert.equal(reste,0,'l’unité fictive, corrigée, n’a plus de problème : '+JSON.stringify(de(r,'corriger')));

  assert.deepEqual(errors,[],errors.join(' | '));
  console.log('avis-browser : ok — un avis de chaque niveau, le compteur sans les informations, le panneau, les onglets, les pages');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})();

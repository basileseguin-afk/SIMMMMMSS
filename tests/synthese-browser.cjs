/* La synthèse des résultats (refonte du 08/10, étape 9).
 *   1. Les mêmes nombres qu'avant : chaque carte et chaque ligne disent ce que
 *      l'ancienne synthèse disait, écrit de même (recalculé ici depuis les
 *      indicateurs du calcul, comme elle le faisait).
 *   2. Hiérarchisée : les chiffres qui comptent en cartes, avec leur
 *      dénominateur ; Vols · Commandes · Équipes dessous ; des commandes sans
 *      équipe sont un problème, avec son lien.
 *   3. Chaque indicateur mène à sa page.
 *   4. Comparer deux essais : un écart signé et fléché en face de chaque
 *      résultat, coloré selon qu'il est mieux ou moins bien — et le mot.
 * v1 et v2. Depuis l'évolution 15 (b), la Synthèse de la v1 répond aux cinq
 * questions : ses comptes gardent les mots et les nombres d'avant, les deux
 * cartes et le problème mènent à leur page ; 1 à 3 restent ceux de la v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=350)=>page.waitForTimeout(ms);
 const actif=()=>page.evaluate(()=>document.body.dataset.sous);
 // Une journée : trois équipes sur un chemin, puis le handling.
 const decrire=()=>page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
   st.parcours.push({id:'ch',nom:'Chaud',noeuds:['cuisine','prepa','dotation'],liens:[{de:'cuisine',vers:'prepa'},{de:'prepa',vers:'dotation'}]});
   for(const c of ['AF/BC','AF/YC','TX/BC'])st.parcoursClasse[c]='ch';
   const c=(id,nom,service,debut,n)=>({id,nom,service,type:'manuel',debut,jour:0,personnes:n,pauses:[],lots:[['AF/BC'],['AF/YC'],['TX/BC']],regime:{actif:false}});
   st.ateliers.push(c('cu','Cuisine chaud','cuisine','04:00',2),c('mo','Montage','prepa','05:00',2),c('do','Dotation','dotation','06:00',2));},''));
 /** Ce que l'ancienne synthèse écrivait, ligne par ligne, depuis les mêmes indicateurs. */
 const attendu=()=>page.evaluate(()=>{const k=Sim.ateliers.resultat.indicateurs,P=MoteurProduction,o={};
   o['Commandes prêtes à l’heure']=k.classesSuivies?k.aHeure+' sur '+k.classesSuivies+(k.partAHeure!=null?' · '+k.partAHeure+' %':''):'—';
   o['Commandes en retard']=String(k.enRetard??((k.classesSuivies||0)-(k.aHeure||0)));
   if(k.pasFinies)o['Commandes pas finies']=String(k.pasFinies);
   // v1, évolution 14 (d) : la carte dit de quoi il s'agit (« commande la plus en retard ») ; la v2 garde son libellé.
   if(document.querySelector('#bilan-journee .bilan-resume'))o['Commande la plus en retard']=k.retardMax?P.dureeLisible(k.retardMax):k.classesSuivies?'aucune':'—';
   else o['Retard le plus long']=k.retardMax?P.dureeLisible(k.retardMax):k.classesSuivies?'aucun':'—';
   o['Dernière commande prête à']=k.finDerniere!=null&&Number.isFinite(k.finDerniere)?P.hhmm(k.finDerniere):'—';
   o['Temps passé à attendre']=(k.attenteTotale>=1?P.dureeLisible(k.attenteTotale):'aucun')+', tous services';
   o['Travail fourni']=(k.hommeHeures||0).toFixed(1).replace('.',',')+' heures de travail';
   if(k.volsSuivis){o['Vols chargés à l’heure']=k.volsAHeure+' sur '+k.volsSuivis+(k.partVolsAHeure!=null?' · '+k.partVolsAHeure+' %':'');
     o['Vols non chargés']=String(k.volsSuivis-k.volsCharges);
     o['Vol le plus en retard']=k.retardVolMax?'+'+P.dureeLisible(k.retardVolMax)+' après son départ':k.volsCharges?'aucun':'— aucun vol chargé';}
   return {o,absentes:k.classesAbsentes||0};});
 /** Ce que la synthèse dit maintenant : la carte (nombre + dénominateur), ou la ligne. */
 const lu=()=>page.evaluate(()=>{const o={};
   for(const c of document.querySelectorAll('#bilan-journee .bilan-cle'))o[c.querySelector('.bilan-q').textContent]={texte:c.querySelector('.bilan-chiffre').textContent.trim(),page:c.dataset.page};
   for(const d of document.querySelectorAll('#bilan-journee .bilan>div'))o[d.querySelector('dt').textContent.trim()]={texte:d.querySelector('dd').textContent.trim(),page:d.querySelector('[data-page]').dataset.page};
   return o;});
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   const V=version+' : ';
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   await decrire();await page.evaluate(()=>Sim.ateliers.brancherHandling());await attendre();
   await nav.aller(page,'j-chiffres');await attendre();

   // v1, évolution 15 (b) : la Synthèse répond aux cinq questions ; ses comptes gardent les mots et les nombres d'avant.
   if(version==='v1'){await synthesev1(V);continue;}
   // 1. Les mêmes nombres qu'avant.
   const {o,absentes}=await attendu(),l=await lu();
   const travail=o['Travail fourni'];delete o['Travail fourni'];
   for(const [q,v] of Object.entries(o)){
     assert.ok(l[q],V+'« '+q+' » est dit');
     // Une carte écrit « 0 sur 7 · 0 % » ; « Retard le plus long » ajoute la commande dont il parle.
     assert.ok(l[q].texte===v||l[q].texte.startsWith(v+' '),V+q+' : « '+l[q].texte+' » au lieu de « '+v+' »');
   }
   assert.equal(l['Travail fourni'].texte,travail,V+'le travail fourni');

   // 2. Hiérarchisée : quatre cartes avec un handling, trois groupes, le problème avec son lien.
   assert.deepEqual(await page.locator('#bilan-journee .bilan-q').allTextContents(),
     ['Vols chargés à l’heure','Commandes prêtes à l’heure',version==='v1'?'Commande la plus en retard':'Retard le plus long','Travail fourni'],V+'les chiffres qui comptent');
   if(version==='v1')assert.match(await page.locator('#bilan-journee .bilan-resume').textContent(),/^\d+ commandes? à l’heure sur \d+/,V+'une phrase de résumé en tête');
   assert.deepEqual(await page.locator('#bilan-journee .bilan-groupe h4').allTextContents(),['Vols','Commandes','Équipes']);
   assert.ok(absentes>0);
   assert.match(await page.locator('#bilan-journee .bilan-probleme').innerText(),new RegExp(absentes+' commandes que personne ne prépare'),V+'un problème, plus une tuile');

   // 3. Chaque indicateur mène à sa page.
   for(const [q,{page:cible}] of Object.entries(l)){
     await nav.aller(page,'j-chiffres');await attendre(150);
     const el=page.locator('#bilan-journee [data-page]').filter({hasText:q}).first();
     await el.click();await attendre(200);
     assert.equal(await actif(),cible,V+'« '+q+' » mène à '+cible);
   }
   await nav.aller(page,'j-chiffres');await attendre(150);
   await page.locator('#bilan-journee .bilan-probleme [data-page]').click();await attendre(200);
   assert.equal(await actif(),'mu-services',V+'le problème mène où il se règle');

   await comparer(V);
  }
  console.log('synthese-browser : ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
 /** v1 : les comptes de la carte « Ce qui part en retard », les phrases en tête, les cartes, le problème et les liens. */
 async function synthesev1(V){
   const k=await page.evaluate(()=>Sim.ateliers.resultat.indicateurs);
   const comptes=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#bilan-journee .sy-comptes>div')].map(d=>[d.querySelector('dt').textContent,d.querySelector('dd').textContent])));
   // Évolution 15 (c) : un compteur dit son périmètre — les commandes de repas et, à part, celles d'équipement (« CIE/@… »).
   const par=await page.evaluate(()=>Object.values(Sim.ateliers.resultat.parClasse).filter(c=>!c.absente).map(c=>({id:c.id,aHeure:c.aHeure,fin:c.fin})));
   const attendus={};
   for(const [nom,l] of [['de repas',par.filter(c=>!c.id.includes('/@'))],['d’équipement',par.filter(c=>c.id.includes('/@'))]]){
     if(!l.length)continue;
     attendus['Commandes '+nom+' à l’heure']=l.filter(c=>c.aHeure).length+' sur '+l.length;
     const tard=l.filter(c=>c.fin!=null&&!c.aHeure).length,pas=l.filter(c=>c.fin==null).length;
     if(tard)attendus['Commandes '+nom+' en retard']=String(tard);
     if(pas)attendus['Commandes '+nom+' pas finies']=String(pas);
   }
   if(k.volsSuivis)attendus['Vols chargés à l’heure']=k.volsAHeure+' sur '+k.volsSuivis;
   for(const [q,v] of Object.entries(attendus))assert.equal(comptes[q],v,V+q);
   assert.equal(par.length,k.classesSuivies,V+'toutes les commandes suivies sont comptées');
   assert.match(await page.locator('#bilan-journee .bilan-resume').first().textContent(),/^Il faut \d+ personnes?, [\d,]+ (sont présentes|est présente)\.$/,V+'la première phrase');
   assert.deepEqual(await page.locator('#bilan-journee .sy-carte h4').allTextContents(),['Où ça coince','Ce qui part en retard'],V+'deux cartes sans essais');
   assert.ok(k.classesAbsentes>0);
   assert.match(await page.locator('#bilan-journee .bilan-probleme').innerText(),new RegExp(k.classesAbsentes+' commandes que personne ne prépare'),V+'le problème');
   await page.locator('#bilan-journee .bilan-probleme [data-page]').click();await attendre(200);
   assert.equal(await actif(),'mu-services',V+'le problème mène où il se règle');
   await nav.aller(page,'j-chiffres');await attendre(150);
   const vers=await page.locator('#bilan-journee .sy-carte[aria-label="Ce qui part en retard"] .sy-vers').getAttribute('data-page');
   await page.locator('#bilan-journee .sy-carte[aria-label="Ce qui part en retard"] .sy-vers').click();await attendre(200);
   assert.equal(await actif(),vers,V+'« Voir le détail » mène à sa page');
   await comparer(V);
   assert.deepEqual(errors,[],V+errors.join(' | '));
 }
 /** Comparer deux essais : un écart signé en face de chaque résultat. */
 async function comparer(V){
   // 4. Comparer : un écart signé en face de chaque résultat.
   await nav.aller(page,'j-comparer');await attendre();
   await page.locator('#snap-a').click();await attendre();
   // Les équipes commencent une heure plus tôt : la dernière commande est prête plus tôt.
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const h={cu:'03:00',mo:'04:00',do:'05:00'};for(const a of Sim.ateliers.state.ateliers)if(h[a.id])a.debut=h[a.id];},''));await attendre();
   await nav.aller(page,'j-comparer');await page.locator('#snap-b').click();await attendre();
   assert.equal(await page.locator('#compare thead th').nth(3).textContent(),'Écart');
   const lignes=await page.locator('#compare tbody tr:not(.compare-groupe)').evaluateAll(trs=>trs.map(tr=>({lib:tr.cells[0].textContent,ecart:tr.cells[3].textContent.trim(),
     classe:(tr.cells[3].querySelector('.ecart')||{}).className||''})));
   const fin=lignes.find(x=>x.lib==='Dernière commande prête');
   // v1 (évolution 15 c) : une heure ou plus s'écrit en heures.
   assert.match(fin.ecart,/^▼ −(\d+ min|\d+ h \d\d) mieux$/,V+'une heure plus tôt : on finit plus tôt, et c’est dit '+fin.ecart);
   assert.match(fin.classe,/\bmieux\b/,V+'en couleur du mieux');
   assert.equal(lignes.find(x=>x.lib==='Personnes au travail').ecart,'',V+'un réglage n’a pas d’écart');
   assert.ok(lignes.filter(x=>x.ecart).every(x=>/^[▲▼] [+−]/.test(x.ecart)),V+'chaque écart est signé et fléché');
   assert.deepEqual(errors,[],V+errors.join(' | '));
 }
})();

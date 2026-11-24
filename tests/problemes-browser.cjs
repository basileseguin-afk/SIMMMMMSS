/* Un seul registre des problèmes (refonte du 08/10, étape 4).
 *   1. Le pied de la barre latérale en dit le nombre ; le panneau les range en
 *      trois niveaux : en version 2, à corriger, à compléter, ce que la journée
 *      montre ; en version 1 (évolution 19 d), bloquant, à corriger,
 *      information — le nombre ne compte que les deux premiers
 *      (tests/avis-browser.cjs en dit le détail).
 *   2. Le nombre d'un onglet en dérive : il compte ce qui se règle sur sa page.
 *      Les pages qui listent les mêmes points en disent le même nombre.
 *   3. Chaque problème mène à sa page ; un service, à sa fiche.
 *   4. Il suit les changements ; Échap le ferme ; il attend la fin de
 *      l'édition du plan. Plus de nombre à part dans « Points à regarder ».
 * v1 et v2. En version 1, depuis l'évolution 22 (d), le panneau « Problèmes » a rejoint la page « Contrôles » : le nombre
 * est la pastille de son entrée, les avis sont ses trois colonnes, et chaque avis mène là où il se règle (une étape
 * du chemin que personne ne prépare : « Chemins », le tableau de l'étape). */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=150)=>page.waitForTimeout(ms);
 const registre=()=>page.evaluate(()=>Sim.problemes.liste.map(p=>({niveau:p.niveau,titre:p.titre,page:p.page,service:p.service||null})));
 const compteBarre=()=>page.evaluate(()=>{const c=document.querySelector('#btn-problemes .pb-compte')||document.querySelector('#menu [data-entree="mu-pas"] .so-badge');return !c||c.hidden?0:+c.textContent;});
 const ouvert=()=>page.evaluate(()=>document.getElementById('problemes').matches(':popover-open'));
 // Les nombres du menu, et ce que le registre en dit. En v2 (gelée) : sur chaque onglet de la partie ouverte, les problèmes
 // qui se règlent sur sa page. En v1 (évolution 22 a) : une seule pastille, sur « Contrôles » — tous les problèmes de l'unité.
 const badges=()=>page.evaluate(()=>[...document.querySelectorAll('#sous-onglets [data-sous-onglet]')].map(b=>{
   const n=b.querySelector('.so-badge'),v1=typeof OrlyOnglets.entrees==='function',compte=(window.OrlyAvis||OrlyProblemes).compte;
   return [v1?b.dataset.entree:b.dataset.sousOnglet,n?+n.textContent:0,v1?(b.dataset.entree==='mu-pas'?compte(Sim.problemes.liste):0):compte(Sim.problemes.liste,b.dataset.sousOnglet)];}));
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   const V=version+' : ',v1=version==='v1';
   // Ce que le pied de la barre compte : tout en version 2 ; en version 1, les problèmes, pas les informations.
   const comptes=l=>v1?l.filter(p=>p.niveau!=='information').length:l.length;
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre(300);
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(400);

   // 1. La démonstration, sans équipe : deux choses à compléter. En version 1 : aucune commande n'est préparée
   //    (bloquant), aucun service n'a d'équipe (à corriger) ; et, depuis l'évolution 22 (d), les vols d'exemple
   //    (une information, que « Prêt à simuler ? » montrait à l'état « exemple ») ; depuis l'évolution 24 (a), une
   //    information de plus — dans les chemins types, la prépa se fournit à la réception dans un chemin sur deux.
   let r=await registre();
   assert.deepEqual(r.map(p=>p.niveau),v1?['bloquant','corriger','information','information']:['completer','completer'],V+JSON.stringify(r));
   if(v1)assert.equal(r[3].titre,'1 client réglé en partie');
   assert.equal(await compteBarre(),comptes(r),V+'le pied de la barre dit le nombre');
   if(v1){
    // « Contrôles » : les avis du registre, rangés par niveau, dans ses colonnes.
    assert.equal(await page.locator('#btn-problemes, #problemes').count(),0,V+'plus de bouton ni de panneau « Problèmes »');
    await nav.aller(page,'mu-pas');await attendre();
    assert.deepEqual(await page.locator('#mu-pas .ct-niveau').evaluateAll(s=>s.map(x=>[x.dataset.ctNiveau,x.querySelectorAll('.ct-point').length])),
      [['bloquant',1],['corriger',1],['information',2]],V+'rangés par niveau');
    assert.match(await page.locator('#mu-pas .ct-niveau.information .ct-point').first().innerText(),/vols d’exemple[\s\S]*Voir dans Programme des vols/);
    assert.match(await page.locator('#mu-pas .ct-niveau.information .ct-point').nth(1).innerText(),/1 client réglé en partie[\s\S]*Voir dans Chemins › Fournisseurs/);
    await page.locator('#mu-pas .ct-synthese').focus();await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#mu-pas .ct-point')),true,V+'au clavier, on passe d’un avis à l’autre');
   }else{
   await page.locator('#btn-problemes').click();await attendre();
   assert.equal(await ouvert(),true,V+'le panneau s’ouvre');
   assert.deepEqual(await page.locator('#problemes .pb-groupe').evaluateAll(s=>s.map(x=>x.className)),['pb-groupe completer'],V+'rangés par niveau');
   assert.equal(await page.locator('#problemes .pb').count(),2);
   await page.keyboard.press('Tab');
   assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#problemes')),true,V+'au clavier, on y entre');
   await page.keyboard.press('Escape');await attendre();
   assert.equal(await ouvert(),false,V+'Échap le ferme');
   }

   // 2. Un service sur un chemin, sans équipe : un point à corriger, compté
   //    partout pareil.
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
     st.parcours.push({id:'ch',nom:'Chaud',noeuds:['cuisine','prepa','dotation'],liens:[{de:'cuisine',vers:'prepa'},{de:'cuisine',vers:'dotation'}]});
     for(const c of ['AF/BC','AF/YC','TX/BC'])st.parcoursClasse[c]='ch';
     const c=(id,nom,service,lots)=>({id,nom,service,type:'manuel',debut:'05:00',jour:0,personnes:2,pauses:[],lots,regime:{actif:false}});
     st.ateliers.push(c('cu','Cuisine chaud','cuisine',[['AF/BC'],['AF/YC'],['TX/BC']]),c('mo','Montage','prepa',[['AF/BC'],['AF/YC'],['TX/BC']]));},''));
   await attendre(300);
   r=await registre();
   const aCorriger=r.filter(p=>p.niveau==='corriger');
   assert.ok(aCorriger.some(p=>p.service==='dotation'&&/Dotation/.test(p.titre)),V+'la Dotation est à corriger : '+JSON.stringify(r));
   assert.equal(await compteBarre(),comptes(r),V+'le nombre suit le changement');
   for(const id of ['mu-services','mu-pas','u-lecture','at-chemins']){
     await nav.aller(page,id);
     for(const [onglet,vu,attendu] of await badges())assert.equal(vu,attendu,V+onglet+' : son nombre dérive du registre');
   }
   // Contrôles détaillés : la page en dit le même nombre que son onglet.
   await nav.aller(page,'u-lecture');
   if(v1){
    // (« Contrôles détaillés » mène à « Contrôles » : sa colonne « À corriger » compte comme le registre.)
    assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-pas',V+'« Contrôles détaillés » mène à « Contrôles »');
    assert.equal(await page.locator('#mu-pas .ct-niveau.corriger .ct-n').innerText(),String(aCorriger.length),V+'la page et le registre comptent pareil');
    assert.equal(await page.locator('#mu-pas .ct-niveau.corriger .ct-point').count(),aCorriger.length);
   }else{
   const calcul=await page.evaluate(()=>Sim.problemes.liste.filter(p=>p.niveau==='corriger'&&p.aussi.includes('mu-pas')).length);
   assert.match(await page.locator('#fc-calcul').innerText(),new RegExp(calcul+' points? à corriger'),V+'la page et le registre comptent pareil');
   }
   // « Points à regarder » : le détail, sans nombre à lui.
   await nav.aller(page,'at-chemins');
   assert.doesNotMatch(await page.locator('#at-anomalies summary').innerText().catch(()=>''),/\d/,V+'plus de nombre à part');

   // 3. Un problème mène à sa page ; celui d'un service, à sa fiche.
   if(v1){
    // (Une étape du chemin que personne ne prépare se règle dans « Chemins » : le bouton le dit, et y mène — le
    //  tableau de l'étape, la première commande en évidence.)
    await nav.aller(page,'mu-pas');await attendre();
    const avis=page.locator('#mu-pas .ct-niveau.corriger .ct-point',{hasText:'Dotation'}).first();
    assert.match(await avis.locator('[data-ct-aller]').innerText(),/^Régler dans Chemins →$/);
    await avis.locator('[data-ct-aller]').click();await attendre(400);
    assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-flux',V+'« Chemins »');
    assert.equal(await page.locator('#mu-flux .ch-etape').getAttribute('data-ch-etape'),'dotation',V+'le tableau de l’étape Dotation');
    assert.match(await page.locator('#mu-flux .ch-etape tr.ch-vise').innerText(),/à corriger/,V+'la commande sans équipe, en évidence');
   }else{
   await page.locator('#btn-problemes').click();await attendre();
   await page.locator('#problemes .pb[data-pb-service="dotation"]').first().click();await attendre(300);
   assert.equal(await ouvert(),false,V+'le panneau se referme');
   assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-services',V+'la fiche du service');
   assert.equal(await page.evaluate(()=>Sim.unite.choisi),'dotation',V+'la Dotation est ouverte');
   }

   // 4. Pendant l'édition du plan, il attend, comme le menu.
   await nav.aller(page,'j-plan');
   await page.locator('#btn-edit').click();await attendre(300);
   const attend=v1?'#menu [data-entree="mu-pas"]':'#btn-problemes';
   assert.equal(await page.locator(attend).isDisabled(),true,V+'il attend la fin de l’édition');
   await page.locator('#edit-done').click();await attendre(300);
   assert.equal(await page.locator(attend).isDisabled(),false);

   assert.deepEqual(errors,[],V+errors.join(' | '));
  }
  console.log('problemes-browser : ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

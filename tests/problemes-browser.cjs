/* Un seul registre des problèmes (refonte du 08/10, étape 4).
 *   1. Le pied de la barre latérale en dit le nombre ; le panneau les range en
 *      trois niveaux (à corriger, à compléter, ce que la journée montre).
 *   2. Le nombre d'un onglet en dérive : il compte ce qui se règle sur sa page.
 *      Les pages qui listent les mêmes points en disent le même nombre.
 *   3. Chaque problème mène à sa page ; un service, à sa fiche.
 *   4. Il suit les changements ; Échap le ferme ; il attend la fin de
 *      l'édition du plan. Plus de nombre à part dans « Points à regarder ».
 * v1 et v2. */
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
 const compteBarre=()=>page.evaluate(()=>{const c=document.querySelector('#btn-problemes .pb-compte');return c.hidden?0:+c.textContent;});
 const ouvert=()=>page.evaluate(()=>document.getElementById('problemes').matches(':popover-open'));
 // Les nombres des onglets de la partie ouverte, et ce que le registre en dit.
 const badges=()=>page.evaluate(()=>[...document.querySelectorAll('#sous-onglets [data-sous-onglet]')].map(b=>{
   const n=b.querySelector('.so-badge');return [b.dataset.sousOnglet,n?+n.textContent:0,OrlyProblemes.compte(Sim.problemes.liste,b.dataset.sousOnglet)];}));
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   const V=version+' : ';
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre(300);
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(400);

   // 1. La démonstration, sans équipe : deux choses à compléter.
   let r=await registre();
   assert.deepEqual(r.map(p=>p.niveau),['completer','completer'],V+JSON.stringify(r));
   assert.equal(await compteBarre(),r.length,V+'le pied de la barre dit le nombre');
   await page.locator('#btn-problemes').click();await attendre();
   assert.equal(await ouvert(),true,V+'le panneau s’ouvre');
   assert.deepEqual(await page.locator('#problemes .pb-groupe').evaluateAll(s=>s.map(x=>x.className)),['pb-groupe completer'],V+'rangés par niveau');
   assert.equal(await page.locator('#problemes .pb').count(),2);
   await page.keyboard.press('Tab');
   assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#problemes')),true,V+'au clavier, on y entre');
   await page.keyboard.press('Escape');await attendre();
   assert.equal(await ouvert(),false,V+'Échap le ferme');

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
   assert.equal(await compteBarre(),r.length,V+'le nombre suit le changement');
   for(const id of ['mu-services','mu-pas','u-lecture','at-chemins']){
     await nav.aller(page,id);
     for(const [onglet,vu,attendu] of await badges())assert.equal(vu,attendu,V+onglet+' : son nombre dérive du registre');
   }
   // Contrôles détaillés : la page en dit le même nombre que son onglet.
   await nav.aller(page,'u-lecture');
   const calcul=await page.evaluate(()=>Sim.problemes.liste.filter(p=>p.niveau==='corriger'&&p.aussi.includes('mu-pas')).length);
   assert.match(await page.locator('#fc-calcul').innerText(),new RegExp(calcul+' points? à corriger'),V+'la page et le registre comptent pareil');
   // « Points à regarder » : le détail, sans nombre à lui.
   await nav.aller(page,'at-chemins');
   assert.doesNotMatch(await page.locator('#at-anomalies summary').innerText().catch(()=>''),/\d/,V+'plus de nombre à part');

   // 3. Un problème mène à sa page ; celui d'un service, à sa fiche.
   await page.locator('#btn-problemes').click();await attendre();
   await page.locator('#problemes .pb[data-pb-service="dotation"]').first().click();await attendre(300);
   assert.equal(await ouvert(),false,V+'le panneau se referme');
   assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-services',V+'la fiche du service');
   assert.equal(await page.evaluate(()=>Sim.unite.choisi),'dotation',V+'la Dotation est ouverte');

   // 4. Pendant l'édition du plan, il attend, comme le menu.
   await nav.aller(page,'j-plan');
   await page.locator('#btn-edit').click();await attendre(300);
   assert.equal(await page.locator('#btn-problemes').isDisabled(),true,V+'il attend la fin de l’édition');
   await page.locator('#edit-done').click();await attendre(300);
   assert.equal(await page.locator('#btn-problemes').isDisabled(),false);

   assert.deepEqual(errors,[],V+errors.join(' | '));
  }
  console.log('problemes-browser : ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

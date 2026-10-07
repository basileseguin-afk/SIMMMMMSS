/* Le tableau des minutes et l'armement (retours d'usage du 02/10 : « lie les
 * man-hours de l'armement dans le tableau : une ligne récap compagnie » ; puis
 * « utilise cette ligne comme ligne récap / total, et rends le tableau plus
 * digeste ») : un bloc par compagnie, sa ligne total en tête, ses classes
 * repliables. v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 const minutes=()=>page.evaluate(()=>Sim.ateliers.state.categories.armement[0].minutes);
 const ligne=cie=>page.locator(`#rg-recap tr.rg-recap-cie[data-compagnie="${cie}"]`);
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   await page.waitForTimeout(200);await nav.effectifSaisi(page);   // les personnes se saisissent ici (05/10)
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
     st.categories={armement:[{id:'ARM',nom:'Armement',minutes:{'*':10,AF:15}}]};
     st.ateliers.push({id:'mo',nom:'Montage',service:'prepa',type:'manuel',debut:'04:00',jour:0,personnes:4,pauses:[],lots:[['AF/YC','TX/YC']],regime:{actif:true}});
     st.ateliers.push({id:'h',nom:'Quais',service:'quais',type:'handling',debut:'04:00',jour:0,personnes:2,pauses:[],lots:[],regime:{actif:true},durees:{'*':20}});
     st.ateliers.push({id:'ar',nom:'Armement matin',service:'armement',type:'manuel',debut:'05:00',jour:0,personnes:2,pauses:[],lots:[['AF/@ARM']],regime:{actif:true}});
     OrlyParcours.integrerArmement(st,['armement'],['quais']);},''));
   await nav.aller(page,'rg-recap');await attendre();

   // 1. Un bloc par compagnie : sa ligne total en tête, ses classes dessous, repliées.
   assert.match(await page.locator('#rg-recap thead').innerText(),/Armement/,version+' : une colonne Armement');
   const ordre=await page.evaluate(()=>[...document.querySelectorAll('#rg-recap tbody tr')].map(t=>t.dataset.compagnie?t.dataset.compagnie+'*':t.dataset.classe.split('/')[0]));
   const af=ordre.indexOf('AF*');
   assert.ok(af>=0&&ordre[af+1]==='AF'&&ordre.slice(af+1).findIndex(x=>x!=='AF')>0,version+' : AF, sa ligne total puis ses classes '+ordre.join(','));
   assert.equal(await page.locator('#rg-recap tr[data-classe="AF/YC"]').isVisible(),false,'repliées au départ');
   assert.match(await ligne('AF').innerText(),/AF\s+\d+ classes/);
   // Le total de ses classes, service par service : celui du Montage, par exemple.
   const somme=await page.evaluate(()=>{const r=OrlyEchanges.recapManMinutes(Sim.reglages.contexteRecap());const l=r.lignesCie.find(x=>x.compagnie==='AF');
     return [l.cellules.prepa.parVol,r.lignes.filter(x=>x.classe.cie==='AF').reduce((n,x)=>n+(x.cellules.prepa.parVol||0),0)];});
   assert.ok(somme[0]>0&&Math.abs(somme[0]-somme[1])<1e-9,version+' : la ligne AF est la somme de ses classes '+somme);
   // Un clic la déplie ; « Tout replier » referme tout.
   await ligne('AF').locator('[data-rg-action=recap-cie]').click();
   assert.equal(await page.locator('#rg-recap tr[data-classe="AF/YC"]').isVisible(),true,'dépliée d’un clic');
   assert.equal(await ligne('AF').locator('[data-rg-action=recap-cie]').getAttribute('aria-expanded'),'true');
   assert.equal(await page.locator('#rg-recap tr[data-classe="AF/YC"] td.rgr.parcie').count(),1,'sur une classe : la colonne Armement renvoie à la compagnie');
   await page.locator('[data-rg-action=recap-tout][data-ouvrir="0"]').click();
   assert.equal(await page.locator('#rg-recap tr[data-classe="AF/YC"]').isVisible(),false);
   assert.equal(await ligne('AF').locator('[data-rg-champ=recap-cie]').inputValue(),'15','AF : sa valeur propre');
   assert.equal(await ligne('TX').locator('[data-rg-champ=recap-cie]').inputValue(),'','TX : vide…');
   assert.equal(await ligne('TX').locator('[data-rg-champ=recap-cie]').getAttribute('placeholder'),'10','… la valeur de toutes les compagnies');
   assert.match(await ligne('AF').innerText(),/7,5 min/,'15 min ÷ 2 personnes');

   // 2. Saisie : TX à 12 ; puis 10 (= toutes les compagnies) la ramène à la commune.
   const tx=ligne('TX').locator('[data-rg-champ=recap-cie]');
   await tx.fill('12');await tx.press('Tab');await attendre();
   assert.deepEqual(await minutes(),{'*':10,AF:15,TX:12},version+' : TX à 12, dans le réglage de l’armement');
   await ligne('TX').locator('[data-rg-champ=recap-cie]').fill('10');await ligne('TX').locator('[data-rg-champ=recap-cie]').press('Tab');await attendre();
   assert.deepEqual(await minutes(),{'*':10,AF:15});
   // « Annuler » du tableau revient en arrière.
   await page.locator('#rg-recap-undo').click();await attendre();
   assert.deepEqual(await minutes(),{'*':10,AF:15,TX:12},version+' : annulé');
   // L'effectif de l'équipe se lit ici ; il se règle dans sa fiche (07/10).
   await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id==='ar').personnes=3;},''));await attendre();
   assert.equal(await ligne('AF').locator('[data-rg-equipe]').innerText(),'3',version+' : l’effectif se lit sur la ligne de la compagnie');
   assert.equal(await ligne('AF').locator('[data-rg-champ=recap-pers]').count(),0);
   // Le même réglage, vu de la fiche de l'armement.
   await nav.aller(page,'mu-services');await page.locator('[data-mu-choisir=armement]').click();await attendre();
   assert.equal(await page.locator('#mu-services [data-mu-cat-min="ARM"][data-cie="TX"]').inputValue(),'12',version+' : la fiche de l’armement le montre');

   // 3. Sur la journée : minutes par vol × départs, comptées dans le total.
   await nav.aller(page,'rg-recap');await attendre();
   await page.locator('[data-rg-action="recap-vue"][data-vue=jour]').click();await attendre();
   const vols=await page.evaluate(()=>Sim.ateliers.classesDe('armement').find(c=>c.cie==='AF').vols.length);
   assert.match(await ligne('AF').innerText(),new RegExp(String(15*vols)),version+' : 15 × '+vols+' vols');
   await page.locator('[data-rg-action="recap-vue"][data-vue=vol]').click();await attendre();
   // La recherche garde la ligne de la compagnie.
   await page.fill('#rg-recap-filtre','TX');await attendre();
   assert.equal(await ligne('TX').count(),1);assert.equal(await ligne('AF').count(),0);
   await page.fill('#rg-recap-filtre','');
  }
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('recap-compagnie-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

/* Une équipe qui ne travaille que certains jours (retour d'usage du 01/10) :
 * « s'il y a tant de vols Air France, une personne est consacrée au montage
 * AF ; sinon elle est rattachée à un autre atelier ». Réglée comme une phrase
 * dans la fiche de l'équipe (Équipes › Services et équipes), jouée par le
 * calcul. Même parcours dans la version 1 et la version 2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 const kase=id=>page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id),id);
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
     const c=(id,nom,lots,personnes)=>({id,nom,service:'prepa',type:'manuel',debut:'04:00',jour:0,personnes,pauses:[],lots,regime:{actif:false}});
     st.ateliers.push(c('mo','Montage AF',[['AF/YC']],1),c('mg','Montage général',[['TX/YC']],2));},''));
   const af=await page.evaluate(()=>MoteurProduction.compteDuJour(Sim.ateliers.classes,'AF','vols'));
   assert.ok(af>0,version+' : le programme de démonstration a des vols AF');

   // 0. Le jour de l'équipe : chaque choix par son nom (J-2 n'est pas « la veille »).
   await nav.aller(page,'mu-services');
   await page.locator('[data-mu-choisir=prepa]').click();await attendre();
   assert.deepEqual(await page.locator('#mu-services article.mu-equipe[data-at="mo"] [data-at-champ=jour] option').allTextContents(),
     ['jour du vol (J)','la veille (J-1)','l’avant-veille (J-2)','3 jours avant (J-3)']);

   // 1. Dans la fiche de l'équipe : un bouton, puis une phrase à compléter.
   await nav.aller(page,'mu-services');
   await page.locator('[data-mu-choisir=prepa]').click();await attendre();
   const carte=sel=>page.locator(`#mu-services article.mu-equipe[data-at="mo"] ${sel}`);
   await carte('[data-at-action=cond-ajouter]').click();await attendre();
   assert.deepEqual(await kase('mo').then(a=>a.condition),{cie:'AF',seuil:af,mesure:'vols',sinon:'mg',absorbe:true},version+' : proposée remplie pour aujourd’hui ; l’autre équipe absorbe la charge');
   assert.match(await carte('.at-cond').innerText(),/Cette équipe ne travaille que si[\s\S]*Sinon, ses commandes passent à/);
   assert.match(await carte('.at-cond-etat').innerText(),new RegExp('AF a '+af+' vols? \\(au moins '+af+'\\) → elle travaille'));
   assert.match(await carte('.mu-badge.cond').innerText(),/⚡ si AF ≥ \d+ vols · travaille aujourd’hui/);

   // 2. Un vol de plus que la journée : elle ne travaille pas ; tout part au montage général.
   const seuil=carte('[data-at-champ=cond-seuil]');
   await seuil.fill(String(af+1));await seuil.dispatchEvent('change');await attendre();
   assert.equal((await kase('mo')).condition.seuil,af+1);
   assert.match(await carte('.at-cond-etat').innerText(),/elle ne travaille pas ; ses commandes vont à « Montage général », qui absorbe la charge avec ses propres personnes/);
   assert.equal(await page.evaluate(()=>Sim.ateliers.resultat.ateliers.find(a=>a.id==='mg').personnes),2,version+' : sans renfort');
   // Ses personnes peuvent aussi suivre ses commandes.
   await carte('[data-at-champ=cond-renfort]').selectOption('');await attendre();
   assert.equal((await kase('mo')).condition.absorbe,undefined);
   assert.match(await carte('.at-cond-etat').innerText(),/sa personne renforce « Montage général »/);
   assert.match(await carte('.mu-badge.cond').innerText(),/pas aujourd’hui/);
   assert.equal(await page.locator('#mu-services article.mu-equipe[data-at="mo"]').evaluate(e=>e.classList.contains('au-repos')),true);
   const r=await page.evaluate(()=>({ids:Sim.ateliers.resultat.ateliers.map(a=>a.id),mg:Sim.ateliers.resultat.ateliers.find(a=>a.id==='mg'),
     fait:(Sim.ateliers.resultat.lots||[]).some(l=>l.atelier==='mg'&&(l.classes||[]).includes('AF/YC'))}));
   assert.ok(!r.ids.includes('mo'),version+' : l’équipe ne travaille pas');
   assert.equal(r.mg.personnes,3,version+' : sa personne renforce le montage général');
   assert.ok(r.fait,version+' : le montage général fait les commandes AF');

   // 3. Les repas plutôt que les vols ; puis on retire la règle.
   await carte('[data-at-champ=cond-mesure]').selectOption('repas');await attendre();
   assert.equal((await kase('mo')).condition.mesure,'repas');
   await carte('[data-at-action=cond-retirer]').click();await attendre();
   assert.equal((await kase('mo')).condition,undefined);
   assert.equal(await carte('.mu-badge.cond').count(),0);
   assert.ok(await page.evaluate(()=>Sim.ateliers.resultat.ateliers.some(a=>a.id==='mo')));

   // 4. Seule dans son service, une équipe n'a personne à qui passer : on le dit.
   await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers=Sim.ateliers.state.ateliers.filter(a=>a.id!=='mg');},''));await attendre();
   await carte('[data-at-action=cond-ajouter]').click();await attendre();
   assert.equal((await kase('mo')).condition,undefined);
  }
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('condition-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

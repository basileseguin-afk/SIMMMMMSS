/* La fiche d'un service, en feuille de propriétés (refonte du 08/10, étape 7).
 *   1. Chaque section se replie (Ce qu'il fait, Ses équipes, Heures de
 *      travail) ; le repli est gardé d'un service à l'autre, et au rendu
 *      suivant.
 *   2. L'avancé (« en même temps que… », les superviseurs) est replié ; son
 *      titre dit ce qui y est réglé.
 *   3. « Plus de réglages » d'une équipe porte la règle ⚡, et sa ligne
 *      repliée dit ce qui y est réglé.
 *   4. La grille est une matrice : en-têtes collants, la ligne et la colonne
 *      survolées s'éclairent ; Espace coche au clavier.
 * Rien ne change dans les données en ouvrant ou en repliant. v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=300)=>page.waitForTimeout(ms);
 const M='#mu-services';
 const section=cle=>page.locator(`${M} [data-mu-section=${cle}]`);
 const ouverte=cle=>section(cle).evaluate(d=>d.open);
 const titre=cle=>page.locator(`${M} [data-mu-section=${cle}] > summary`);
 const etat=()=>page.evaluate(()=>localStorage.getItem('ory-ateliers-v1'));
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   const V=version+' : ';
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
     st.ateliers.push({id:'m1',nom:'Montage matin',service:'prepa',type:'manuel',debut:'05:00',jour:0,personnes:3,pauses:[{de:'09:00',a:'09:20'}],lots:[['AF/BC'],['AF/YC']],regime:{actif:false}},
       {id:'d1',nom:'Dotation 1',service:'dotation',type:'manuel',debut:'04:00',jour:0,personnes:2,pauses:[],lots:[['AF/YC']],regime:{actif:false}});},''));
   await page.reload();await attendre();
   await nav.aller(page,'mu-services');await page.locator(`${M} [data-mu-choisir=prepa]`).click();await attendre();
   const avant=await etat();

   // 1. Des sections repliables, ouvertes d'abord ; le repli est gardé.
   for(const cle of ['nature','equipes','temps'])assert.equal(await ouverte(cle),true,V+cle+' ouverte');
   await titre('nature').click();await attendre();
   assert.equal(await ouverte('nature'),false);
   assert.equal(await page.locator(`${M} [data-mu-nature]`).isVisible(),false,V+'repliée, elle cache ses champs');
   await page.locator(`${M} [data-mu-choisir=dotation]`).click();await attendre();
   assert.equal(await ouverte('nature'),false,V+'gardée d’un service à l’autre');
   await page.evaluate(()=>Sim.ateliers.rendre());await attendre();
   assert.equal(await ouverte('nature'),false,V+'et au rendu suivant');
   await titre('nature').click();await attendre();
   assert.equal(await ouverte('nature'),true);
   // Au clavier aussi : la ligne d'une section se prend au Tab, Entrée la replie.
   await titre('equipes').focus();await page.keyboard.press('Enter');await attendre();
   assert.equal(await ouverte('equipes'),false,V+'Entrée replie');
   await page.keyboard.press('Enter');await attendre();
   assert.equal(await ouverte('equipes'),true);

   // 2. L'avancé : replié, il dit ce qui y est réglé.
   await page.locator(`${M} [data-mu-choisir=prepa]`).click();await attendre();
   assert.equal(await ouverte('avance'),false,V+'l’avancé est replié');
   assert.match(await titre('avance').innerText(),/Avancé[\s\S]*rien de réglé/);
   assert.equal(await page.locator(`${M} [data-mu-encadrement=prepa]`).isVisible(),false);
   await titre('avance').click();await attendre();
   assert.equal(await page.locator(`${M} [data-mu-parallele=prepa]`).isVisible(),true,V+'« en même temps que » est dans l’avancé');
   const sup=page.locator(`${M} [data-mu-encadrement=prepa]`);
   await sup.fill('3');await sup.press('Tab');await attendre();
   assert.match(await titre('avance').innerText(),/1 réglage : 3 superviseurs/,V+'le titre le dit');
   assert.equal(await ouverte('avance'),true,V+'ouvert, il le reste au rendu');
   await page.locator(`${M} [data-mu-encadrement=prepa]`).fill('0');await page.locator(`${M} [data-mu-encadrement=prepa]`).press('Tab');await attendre();

   // 3. « Plus de réglages » : la règle ⚡ y est ; la ligne dit ce qui est réglé.
   const plus=page.locator(`${M} article.mu-equipe[data-at="m1"] details.mu-plus > summary`);
   assert.match(await plus.innerText(),/1 pause/,V+'la ligne repliée dit la pause');
   assert.equal(await page.locator(`${M} article.mu-equipe[data-at="m1"] [data-at-action=cond-ajouter]`).isVisible(),false,V+'⚡ est dans « Plus de réglages »');
   await plus.click();await attendre();
   assert.equal(await page.locator(`${M} article.mu-equipe[data-at="m1"] [data-at-action=cond-ajouter]`).isVisible(),true);

   // 4. La matrice : en-têtes collants, ligne et colonne survolées.
   const grille=page.locator(`${M} table[data-mu-equipe="m1"]`);
   assert.equal(await grille.locator('thead th').first().evaluate(e=>getComputedStyle(e).position),'sticky',V+'en-tête collant');
   assert.equal(await grille.locator('tbody th').first().evaluate(e=>getComputedStyle(e).position),'sticky',V+'compagnies collantes');
   const af=grille.locator('[data-mu-cocher="AF/YC"]');
   await af.hover();await attendre(150);
   const anneau=sel=>grille.locator(sel).evaluate(e=>getComputedStyle(e.closest('label')).boxShadow);
   const ligne=await grille.locator('tbody tr').filter({has:page.locator('[data-mu-ligne="AF"]')}).locator('td.mu-c label').evaluateAll(l=>l.map(e=>getComputedStyle(e).boxShadow));
   assert.ok(ligne.every(b=>b&&b!=='none'),V+'la ligne survolée s’éclaire');
   const colonne=await grille.locator('tbody tr').evaluateAll(trs=>trs.map(tr=>{const c=[...tr.children].find(x=>x.querySelector&&x.querySelector('[data-mu-cocher$="/YC"]'));return c?getComputedStyle(c.querySelector('label')).boxShadow:'—';}));
   assert.ok(colonne.filter(b=>b!=='—').every(b=>b!=='none'),V+'la colonne survolée aussi');
   assert.notEqual(await anneau('[data-mu-cocher="AF/BC"]'),'none');
   // Espace coche au clavier.
   const fx=grille.locator('[data-mu-cocher="AF/PC"]');
   assert.equal(await fx.isChecked(),false);
   await fx.focus();await page.keyboard.press('Space');await attendre();
   assert.ok(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.id==='m1').lots.some(l=>l.includes('AF/PC'))),V+'Espace coche');
   await page.locator(`${M} table[data-mu-equipe="m1"] [data-mu-cocher="AF/PC"]`).focus();await page.keyboard.press('Space');await attendre();

   // Ouvrir et replier n'a rien changé aux données (seule la case cochée puis décochée est passée).
   assert.equal(JSON.parse(await etat()).ateliers.find(a=>a.id==='m1').lots.flat().sort().join(),JSON.parse(avant).ateliers.find(a=>a.id==='m1').lots.flat().sort().join(),V+'les commandes de l’équipe');
   assert.deepEqual(errors,[],V+errors.join(' | '));
  }
  console.log('fiche-service-browser : ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

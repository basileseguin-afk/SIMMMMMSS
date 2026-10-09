/* Les tableaux d'heures et d'horaires (refonte du 08/10, étape 8).
 *   1. Horaires (Récap des cases) : la case reste à gauche, le service en
 *      cours reste en haut sous les titres quand le tableau défile.
 *   2. Au clavier : Entrée enregistre et descend à la ligne suivante, dans la
 *      même colonne ; Maj+Entrée remonte ; le tableau ne saute pas.
 *   3. Heures de travail : même chose ; les nombres sont alignés à droite.
 *   4. Les autres tableaux d'heures se remplissent de même (planche retour,
 *      barème, temps par compagnie).
 * Les valeurs s'enregistrent comme avant (« HH:MM », heures → minutes). v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=350)=>page.waitForTimeout(ms);
 const debut=id=>page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).debut,id);
 const ligneActive=()=>page.evaluate(()=>document.activeElement&&document.activeElement.closest('tr')?.dataset.at);
 /** Les cases dans l'ordre du tableau. */
 const ordre=()=>page.evaluate(()=>[...document.querySelectorAll('.rc-table tbody tr[data-at]')].map(t=>t.dataset.at));
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   const V=version+' : ';
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   await page.evaluate(()=>Sim.ateliers.changer(()=>{for(let i=0;i<30;i++)Sim.ateliers.state.ateliers.push(
     {id:'c'+i,nom:'Case '+String(i).padStart(2,'0'),service:i<15?'cuisine':'prepa',type:'manuel',debut:'05:00',jour:0,personnes:2,pauses:[],lots:[]});},''));
   await nav.aller(page,'at-recap');await attendre();

   // 1. Ce qui reste à l'écran quand le tableau défile.
   assert.equal(await page.locator('.rc-table').getAttribute('data-clavier'),'',V+'un tableau qui se remplit au clavier');
   assert.equal(await page.locator('.rc-table tbody tr.rc-case > th').first().evaluate(e=>getComputedStyle(e).position),'sticky',V+'la case reste à gauche');
   await page.locator('.rc-scroll').evaluate(z=>{z.scrollTop=260;});await attendre(150);
   const pos=await page.evaluate(()=>{const z=document.querySelector('.rc-scroll').getBoundingClientRect(),t=document.querySelector('.rc-table thead th').getBoundingClientRect();
     const svc=[...document.querySelectorAll('.rc-svc>th')].map(x=>x.getBoundingClientRect()).filter(r=>r.bottom>z.top&&r.top<z.bottom);
     return {tete:Math.round(t.top-z.top),basTete:Math.round(t.bottom-z.top),svc:svc.map(r=>Math.round(r.top-z.top))};});
   assert.ok(pos.tete>=0&&pos.tete<=2,V+'les titres restent en haut (sous le bord du cadre) : '+pos.tete);
   assert.ok(pos.svc.some(y=>Math.abs(y-pos.basTete)<=2),V+'le service en cours reste sous les titres '+JSON.stringify(pos));
   await page.locator('.rc-scroll').evaluate(z=>{z.scrollTop=0;});await attendre(150);

   // 2. Entrée enregistre et descend ; Maj+Entrée remonte.
   const o=await ordre(),i=o.indexOf('c3');
   const champ=id=>page.locator(`tr[data-at="${id}"] [data-at-champ=debut]`);
   await champ('c3').click();await page.keyboard.type('0430');await page.keyboard.press('Enter');await attendre();
   assert.equal(await debut('c3'),'04:30',V+'Entrée enregistre');
   assert.equal(await ligneActive(),o[i+1],V+'et descend à la case suivante');
   assert.equal(await page.evaluate(()=>document.activeElement.dataset.atChamp),'debut',V+'dans la même colonne');
   const o2=await ordre(),j=o2.indexOf(o[i+1]);
   await page.keyboard.type('0445');await page.keyboard.press('Shift+Enter');await attendre();
   assert.equal(await debut(o[i+1]),'04:45',V+'Maj+Entrée enregistre aussi');
   assert.equal(await ligneActive(),o2[j-1],V+'et remonte');
   // Une heure impossible : refusée sous son champ, et l'on descend quand même.
   const o3=await ordre(),k=o3.indexOf(await ligneActive());
   const avant=await debut(o3[k]);
   await page.keyboard.type('2500');await page.keyboard.press('Enter');await attendre();
   assert.equal(await debut(o3[k]),avant,V+'« 2500 » n’est pas enregistré');
   assert.match(await page.locator('.champ-erreur').first().innerText(),/n’est pas une heure/,V+'la raison sous le champ quitté');

   // 3. Heures de travail : les nombres à droite, Entrée descend dans la colonne.
   await nav.aller(page,'rg-recap');await nav.deplier(page);await attendre();
   assert.equal(await page.locator('.rg-recap-table').getAttribute('data-clavier'),'');
   const premier=await page.evaluateHandle(()=>{const z=document.querySelector('#rg-recap .rg-recap-scroll'),q=z.getBoundingClientRect();
     return [...z.querySelectorAll('input[data-rg-champ=recap]')].find(x=>{const r=x.getBoundingClientRect();return r.top>q.top+60&&r.bottom<q.bottom-80&&x.offsetParent;});});
   const el=premier.asElement();
   assert.equal(await el.evaluate(e=>getComputedStyle(e).textAlign),'right',V+'les nombres à droite');
   const x0=await el.evaluate(e=>{const r=e.closest('td').getBoundingClientRect();return r.left+r.width/2;});
   const cle=await el.evaluate(e=>({service:e.dataset.service,classe:e.dataset.classe}));
   const place=await page.locator('#rg-recap .rg-recap-scroll').evaluate(z=>z.scrollTop);
   await el.click();await page.keyboard.press('Control+A');await page.keyboard.type('0.3');await page.keyboard.press('Enter');await attendre(500);
   const minutes=await page.evaluate(({service,classe})=>{const i=classe.lastIndexOf('/');return (Sim.reglages.etat.bareme[service]||{})[MoteurProduction.cleBareme(classe.slice(0,i),classe.slice(i+1))];},cle);
   assert.equal(minutes,18,V+'0,3 h par vol, gardées en minutes');
   const ici=await page.evaluate(()=>{const e=document.activeElement,r=e.closest('td')&&e.closest('td').getBoundingClientRect();return e.tagName==='INPUT'&&r?{x:r.left+r.width/2,champ:e.dataset.rgChamp}:null;});
   assert.ok(ici&&Math.abs(ici.x-x0)<3,V+'Entrée descend dans la même colonne '+JSON.stringify({x0,ici}));
   assert.ok(Math.abs(await page.locator('#rg-recap .rg-recap-scroll').evaluate(z=>z.scrollTop)-place)<40,V+'le tableau ne saute pas');

   // 4. Les autres tableaux d'heures se remplissent de même.
   await nav.aller(page,'v-planche');await attendre();
   await page.locator('#vols-planche [data-pl-action=ajouter]').click();await attendre();
   assert.equal(await page.locator('#vols-planche .planche-table').getAttribute('data-clavier'),'',V+'la planche retour');
   await nav.aller(page,'rg-minutes');await attendre();
   assert.ok(await page.locator('#view-reglages table.rg-table[data-clavier]').count()>0,V+'le barème');

   assert.deepEqual(errors,[],V+errors.join(' | '));
  }
  console.log('tableaux-browser : ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

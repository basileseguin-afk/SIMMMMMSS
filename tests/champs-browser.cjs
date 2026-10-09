/* Les champs (refonte du 08/10, étape 7) : l'heure en 24 h, les flèches, le
 * refus sous le champ.
 *   1. Plus aucun champ natif `type=time` : un navigateur en anglais n'écrit
 *      plus « 04:00 AM ». On tape « 0430 », « 4h15 », « 7 » : le champ écrit
 *      « 04:30 », « 04:15 », « 07:00 », et l'heure gardée reste « HH:MM ».
 *   2. Une heure impossible ne s'enregistre pas : le champ reprend l'heure
 *      gardée, la raison se lit sous lui (bordure, message lié au champ), et
 *      s'efface dès qu'on retape.
 *   3. ↑↓ dans une heure : un quart d'heure ; Maj+↑↓ : une heure. Dans un
 *      nombre, Maj+↑↓ font dix pas, dans ses bornes.
 *   4. Un nom vide, ou déjà pris, est refusé sous le champ, plus dans une
 *      notification : le nom d'une équipe, celui d'un service.
 * v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 // Un navigateur en anglais : c'est là que le champ natif écrivait « AM ».
 const contexte=await browser.newContext({viewport:{width:1440,height:950},locale:'en-US'});
 const page=await contexte.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=300)=>page.waitForTimeout(ms);
 const equipe=id=>page.evaluate(id=>{const a=Sim.ateliers.state.ateliers.find(a=>a.id===id);return {nom:a.nom,debut:a.debut,personnes:a.personnes};},id);
 const champ=(id,c)=>page.locator(`#mu-services [data-at="${id}"] .mu-equipe-tete [data-at-champ=${c}]`);
 const erreurDe=async loc=>{const id=await loc.getAttribute('aria-describedby');return id?page.locator('#'+id):null;};
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   const V=version+' : ';
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const s=Sim.ateliers.state;
     s.ateliers.push({id:'d1',nom:'Dotation 1',service:'dotation',type:'manuel',debut:'04:00',jour:0,personnes:2,pauses:[],lots:[['AF/YC']],regime:{actif:false}},
       {id:'d2',nom:'Dotation 2',service:'dotation',type:'manuel',debut:'05:00',jour:0,personnes:3,pauses:[{de:'09:00',a:'09:20'}],lots:[['AF/BC']],regime:{actif:false}});},''));
   // Effectif constant : les personnes se saisissent (sinon elles se calculent).
   await page.evaluate(()=>Sim.ateliers.regleEffectif('dotation',true));
   await page.reload();await attendre();
   await nav.aller(page,'mu-services');await page.locator('[data-mu-choisir=dotation]').click();await attendre();

   // 1. Plus de champ natif, plus de « AM ».
   const debut=champ('d1','debut');
   assert.equal(await page.locator('input[type=time]').count(),0,V+'aucun champ d’heure natif');
   assert.equal(await debut.getAttribute('inputmode'),'numeric');
   assert.equal(await debut.inputValue(),'04:00',V+'l’heure s’écrit en 24 h');
   assert.doesNotMatch(await page.locator('#mu-services').innerText(),/\b[AP]M\b/,V+'ni AM ni PM');
   // On tape par-dessus : le focus choisit toute l'heure.
   await debut.click();await page.keyboard.type('0430');
   assert.equal(await debut.inputValue(),'04:30',V+'« 0430 » s’écrit 04:30 dès le quatrième chiffre');
   assert.equal((await equipe('d1')).debut,'04:00',V+'rien ne s’enregistre pendant la frappe');
   await page.keyboard.press('Enter');await attendre();
   assert.equal((await equipe('d1')).debut,'04:30',V+'Entrée enregistre');
   for(const [tape,attendu] of [['4h15','04:15'],['7','07:00'],['13:5','13:05']]){
     await champ('d1','debut').click();await page.keyboard.type(tape);await page.keyboard.press('Tab');await attendre();
     assert.equal((await equipe('d1')).debut,attendu,V+'« '+tape+' » → '+attendu);
     assert.equal(await champ('d1','debut').inputValue(),attendu);
   }

   // 2. Une heure impossible : le champ reprend l'heure gardée, la raison sous lui.
   await champ('d1','debut').click();await page.keyboard.type('2500');await page.keyboard.press('Enter');await attendre();
   assert.equal((await equipe('d1')).debut,'13:05',V+'« 2500 » n’est pas enregistré');
   const f=champ('d1','debut');
   assert.equal(await f.inputValue(),'13:05',V+'le champ reprend l’heure gardée');
   assert.equal(await f.getAttribute('aria-invalid'),'true',V+'le champ est marqué');
   const msg=await erreurDe(f);
   assert.ok(msg&&await msg.isVisible(),V+'la raison se lit, liée au champ');
   assert.match(await msg.innerText(),/« 2500 » n’est pas une heure/);
   const bm=await msg.boundingBox(),bf=await f.boundingBox();
   assert.ok(bm.y>=bf.y+bf.height-1,V+'sous le champ');
   assert.equal(await page.locator('.notif').filter({hasText:/2500/}).count(),0,V+'pas dans une notification');
   await f.click();await page.keyboard.type('6');
   assert.equal(await page.locator('.champ-erreur').count(),0,V+'retaper efface le message');
   assert.equal(await f.getAttribute('aria-invalid'),null);
   await page.keyboard.press('Enter');await attendre();
   assert.equal((await equipe('d1')).debut,'06:00');
   // Vide : refusé aussi (toute heure du modèle est obligatoire).
   await champ('d1','debut').fill('');await champ('d1','debut').press('Enter');await attendre();
   assert.equal((await equipe('d1')).debut,'06:00',V+'une heure vide est refusée');
   assert.match(await page.locator('.champ-erreur').innerText(),/Une heure est attendue/);

   // 3. Les flèches : un quart d'heure, une heure ; dix pas dans un nombre.
   await champ('d1','debut').click();await page.keyboard.press('ArrowUp');await attendre();
   assert.equal((await equipe('d1')).debut,'06:15',V+'↑ : un quart d’heure');
   await page.keyboard.press('Shift+ArrowDown');await attendre();
   assert.equal((await equipe('d1')).debut,'05:15',V+'Maj+↓ : une heure');
   assert.equal(await page.evaluate(()=>document.activeElement&&document.activeElement.dataset.atChamp),'debut',V+'le champ garde la main');
   const pers=champ('d1','personnes');
   await pers.click();await page.keyboard.press('Shift+ArrowUp');await attendre();
   assert.equal((await equipe('d1')).personnes,12,V+'Maj+↑ : dix personnes de plus');
   await champ('d1','personnes').click();await page.keyboard.press('ArrowDown');await attendre();
   assert.equal((await equipe('d1')).personnes,11,V+'↓ : une de moins (le navigateur)');
   await champ('d1','personnes').click();for(let i=0;i<2;i++){await page.keyboard.press('Shift+ArrowDown');await attendre(200);}
   assert.equal((await equipe('d1')).personnes,0,V+'jamais sous zéro');

   // 4. Un nom refusé se lit sous son champ.
   const nom=champ('d2','nom');
   await nom.fill('dotation 1');await nom.press('Tab');await attendre();
   assert.equal((await equipe('d2')).nom,'Dotation 2',V+'un nom déjà pris est refusé');
   const n2=champ('d2','nom');
   assert.equal(await n2.inputValue(),'Dotation 2',V+'le champ reprend le nom gardé');
   const m2=await erreurDe(n2);
   assert.ok(m2&&await m2.isVisible(),V+'la raison, sous le champ');
   assert.match(await m2.innerText(),/^« dotation 1 » est déjà le nom d’une autre équipe/);
   assert.equal(await page.locator('.notif').filter({hasText:/Refusé/}).count(),0,V+'plus de notification « Refusé »');
   // Le nom d'un service.
   const svc=page.locator('#mu-services [data-mu-nom=dotation]'),garde=await svc.inputValue();
   await svc.fill('  ');await svc.press('Enter');await attendre();
   const svc2=page.locator('#mu-services [data-mu-nom=dotation]');
   assert.equal(await svc2.inputValue(),garde,V+'un service garde son nom');
   const m3=await erreurDe(svc2);
   assert.ok(m3&&await m3.isVisible(),V+'la raison, sous le nom du service');
   assert.match(await m3.innerText(),/Un service a besoin d’un nom/);

   // L'heure gardée reste « HH:MM », comme le champ natif l'écrivait.
   const heures=await page.evaluate(()=>JSON.parse(localStorage.getItem('ory-ateliers-v1')||'{}').ateliers.flatMap(a=>[a.debut,...(a.pauses||[]).flatMap(p=>[p.de,p.a])]));
   for(const h of heures)assert.match(h,/^\d{2}:\d{2}$/,V+h);
   assert.deepEqual(errors,[],V+errors.join(' | '));
  }
  console.log('champs-browser : ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

/* Le retour des gestes (refonte du 08/10, étape 4) : notifications et questions.
 *   1. Un geste qui se défait ne demande plus rien : il se fait, une
 *      notification le dit, et son « Annuler » le défait.
 *   2. Une notification par source ; trois au plus. Un refus se voit (rouge,
 *      annoncé) ; un enregistrement de routine ne s'affiche pas. L'ancienne
 *      ligne d'état n'est plus à l'écran.
 *   3. « Annuler » ne défait que ce qu'il dit : quand l'historique bouge
 *      autrement, la notification se ferme.
 *   4. Un geste qui touche deux historiques (le barème et les cases) se défait
 *      d'un bloc.
 *   5. Elle reste tant que la souris est dessus ; × et Échap la ferment, et le
 *      focus revient d'où il venait.
 *   6. Une question pour ce qui ne se défait pas d'un clic : supprimer un
 *      service et ses équipes. Échap et « Ne rien changer » sortent sans rien
 *      faire ; « Supprimer le service » supprime, et la notification rend le
 *      service ET ses équipes.
 *   7. Plus aucune boîte de dialogue du navigateur.
 * v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[],natifs=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',d=>{natifs.push(d.message());d.dismiss();});
 const attendre=(ms=150)=>page.waitForTimeout(ms);
 // Les notifications à l'écran (pas celles qui s'effacent).
 const notifs=()=>page.evaluate(()=>[...document.querySelectorAll('#notifs .notif:not(.sort)')].map(n=>({
   texte:n.querySelector('.notif-texte').textContent,annuler:!!n.querySelector('.notif-annuler'),
   retard:n.classList.contains('retard'),role:n.getAttribute('role'),cle:n.dataset.cle})));
 const cases=()=>page.evaluate(()=>Sim.ateliers.state.ateliers.length);
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   const V=version+' : ';
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre(300);
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(400);

   // 1. Créer puis supprimer une case : aucune question, une notification avec « Annuler ».
   await nav.aller(page,'at-equipes');
   const n0=await cases();
   await page.locator('#at-new').click();await attendre();
   const id=await page.evaluate(()=>Sim.ateliers.ouvert);
   let n=await notifs();
   assert.equal(n.length,1,V+'la création se dit');
   assert.match(n[0].texte,/Case créée/);assert.equal(n[0].annuler,true,V+'et se défait');
   assert.equal(await page.locator('#at-status').isVisible(),false,V+'l’ancienne ligne d’état n’est plus à l’écran');
   await page.locator(`[data-at="${id}"] [data-at-action=supprimer]`).click();await attendre();
   assert.equal(await cases(),n0,V+'supprimée, sans question');
   n=await notifs();
   assert.equal(n.length,1,V+'une notification par source : la suppression remplace la création');
   assert.match(n[0].texte,/supprimée\s*:\s*ses commandes sautent cette étape/);
   await page.locator('#notifs .notif-annuler').click();await attendre();
   assert.equal(await cases(),n0+1,V+'« Annuler » rend la case');
   n=await notifs();
   assert.deepEqual(n.map(x=>x.annuler),[false]);
   assert.match(n[0].texte,/^Annulé\s*:\s*Case\s*«/,V+'et le dit, en bref');
   assert.doesNotMatch(n[0].texte,/sautent/,V+'en bref');
   assert.equal(await page.locator('#btn-retablir').isDisabled(),false,V+'Rétablir, en haut, refait la suppression');

   // 2. Routine, refus, et trois au plus.
   await page.evaluate(()=>{for(const n of document.querySelectorAll('#notifs .notif'))n.remove();});
   await page.evaluate(id=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id===id).personnes=3;},'Enregistré.'),id);await attendre();
   assert.deepEqual(await notifs(),[],V+'un enregistrement de routine ne s’affiche pas');
   assert.equal(await page.locator('#at-status').textContent(),'Enregistré.','il reste lisible, caché');
   await page.evaluate(()=>Sim.ateliers.rendre('Refusé : essai.'));await attendre();
   n=await notifs();
   assert.equal(n.length,1);assert.equal(n[0].retard,true,V+'un refus se voit');assert.equal(n[0].role,'alert',V+'et s’annonce');
   assert.equal(n[0].annuler,false,V+'rien à annuler');
   await page.evaluate(()=>{for(const c of ['a','b','c','d'])OrlyNotif.notifier('Message '+c+'.',{cle:'essai-'+c});});await attendre();
   n=await notifs();
   assert.equal(n.length,3,V+'trois au plus');assert.equal(n[2].texte,'Message d.',V+'la plus ancienne s’en va');

   // 3. Le barème bouge autrement : la notification d'un geste du barème se ferme.
   await page.evaluate(()=>{for(const n of document.querySelectorAll('#notifs .notif'))n.remove();});
   const r0=await page.evaluate(()=>Sim.reglages.etat.rendement);
   await page.evaluate(()=>Sim.reglages.changer(()=>{Sim.reglages.etat.rendement=Math.round((Sim.reglages.etat.rendement-.05)*100)/100;},'Rendement changé (essai).'));await attendre();
   n=await notifs();assert.equal(n.length,1);assert.equal(n[0].annuler,true);
   await page.evaluate(()=>Sim.reglages.changer(()=>{Sim.reglages.etat.rendement=Math.round((Sim.reglages.etat.rendement-.05)*100)/100;}));await attendre(300);
   assert.deepEqual(await notifs(),[],V+'« Annuler » ne défairait plus ce qu’elle dit : elle se ferme');
   await page.evaluate(()=>{Sim.reglages.histoire(false);Sim.reglages.histoire(false);});await attendre();
   assert.equal(await page.evaluate(()=>Sim.reglages.etat.rendement),r0);

   // 4. Un geste, deux historiques : un seul « Annuler » les défait tous les deux.
   await page.evaluate(()=>{for(const n of document.querySelectorAll('#notifs .notif'))n.remove();});
   const p0=await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).personnes,id);
   await page.evaluate(id=>{
     Sim.reglages.changer(()=>{Sim.reglages.etat.rendement=Math.round((Sim.reglages.etat.rendement-.05)*100)/100;},'Rendement changé (essai).');
     Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id===id).personnes=7;},'Personnes changées (essai).');},id);await attendre();
   n=await notifs();
   assert.equal(n.length,1,V+'un geste, une notification');assert.equal(n[0].texte,'Personnes changées (essai).');
   await page.locator('#notifs .notif-annuler').click();await attendre();
   assert.equal(await page.evaluate(()=>Sim.reglages.etat.rendement),r0,V+'le barème est rendu');
   assert.equal(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).personnes,id),p0,V+'les cases aussi');

   // 5. Sous la souris, elle reste ; × et Échap la ferment.
   await page.evaluate(()=>{for(const n of document.querySelectorAll('#notifs .notif'))n.remove();});
   await page.evaluate(()=>OrlyNotif.notifier('Message bref.',{cle:'essai',duree:400}));
   await page.locator('#notifs .notif').hover();await attendre(700);
   assert.equal((await notifs()).length,1,V+'la souris dessus, elle attend');
   await page.mouse.move(400,400);await attendre(800);
   assert.equal((await notifs()).length,0,V+'puis elle s’en va');
   await page.evaluate(()=>OrlyNotif.notifier('Message à fermer.',{cle:'essai'}));
   await page.locator('#notifs .notif-fermer').click();await attendre(300);
   assert.equal((await notifs()).length,0,V+'× la ferme');
   await page.locator('#at-new').focus();
   await page.evaluate(()=>OrlyNotif.notifier('Message au clavier.',{cle:'essai'}));
   await page.locator('#notifs .notif-fermer').focus();await page.keyboard.press('Escape');await attendre(300);
   assert.equal((await notifs()).length,0,V+'Échap la ferme');
   assert.equal(await page.evaluate(()=>document.activeElement.id),'at-new',V+'le focus revient d’où il venait');

   // 6. Supprimer un service qui porte des équipes : une question.
   const svc=await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).service,id);
   const equipes=()=>page.evaluate(s=>Sim.ateliers.state.ateliers.filter(a=>a.service===s).length,svc);
   const present=()=>page.evaluate(s=>{const z=Sim.editor.state.zones.find(v=>v.id===s);return !!z&&!z.retire;},svc);
   const e0=await equipes();assert.ok(e0>0);
   await nav.aller(page,'mu-services');
   await page.locator(`[data-mu-choisir="${svc}"]`).click();await attendre();
   await page.locator('#mu-services [data-mu-action=supprimer]').click();await attendre();
   const q=page.locator('dialog.question[open]');
   assert.equal(await q.count(),1,V+'la question s’ouvre');
   assert.match(await q.locator('h2').textContent(),/Supprimer le service/);
   assert.equal(await page.evaluate(()=>document.activeElement.value),'non',V+'le focus va sur la sortie');
   await page.keyboard.press('Escape');await attendre();
   assert.equal(await q.count(),0);assert.equal(await present(),true,V+'Échap : rien ne change');assert.equal(await equipes(),e0);
   await page.locator('#mu-services [data-mu-action=supprimer]').click();await attendre();
   await nav.repondre(page,false);
   assert.equal(await present(),true,V+'« Ne rien changer » : rien ne change');assert.equal(await equipes(),e0);
   await page.locator('#mu-services [data-mu-action=supprimer]').click();await attendre();
   await nav.repondre(page,true);
   assert.equal(await present(),false,V+'le service est supprimé');assert.equal(await equipes(),0,V+'avec ses équipes');
   n=await notifs();
   assert.equal(n.length,1);assert.equal(n[0].annuler,true,V+'et la notification le rend');
   await page.locator('#notifs .notif-annuler').click();await attendre(300);
   assert.equal(await present(),true,V+'le service revient');assert.equal(await equipes(),e0,V+'ses équipes aussi');

   // 7. Aucune boîte de dialogue du navigateur.
   assert.deepEqual(natifs,[],V+'plus de confirm()');
   assert.deepEqual(errors,[],V+errors.join(' | '));
  }
  console.log('notifications-browser : ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

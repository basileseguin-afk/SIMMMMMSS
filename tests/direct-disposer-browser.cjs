/* Évolution 20 (b) — « Disposer les zones », dans la page « En direct » (v1).
 * Un bouton ouvre un panneau à côté de la scène : les colonnes (de gauche à
 * droite, leurs zones de haut en bas) et les rangées du bas. Chaque zone s'y
 * déplace par glisser-déposer, par ses boutons et au clavier ; la scène se
 * redessine à chaque geste ; « Annuler » et « Rétablir » fonctionnent ; la
 * disposition survit à une sauvegarde et à une restauration ; une sauvegarde
 * d'avant donne le site automatique ; aucun calcul ne change.
 * Chaque étape attend son effet, pas un délai. Unité, équipes et vols fictifs. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 // Une fenêtre haute : le panneau tient sans défiler, et un glisser-déposer ne fait pas défiler la liste sous le pointeur.
 const page=await browser.newPage({viewport:{width:1600,height:1400}}),erreurs=[];
 page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
 const pret=()=>page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.unite&&!!Sim.ateliers.resultat&&Sim.direct&&Sim.disposer);
 const relief=async()=>{await nav.aller(page,'j-plan',{relief:true});await page.waitForFunction(()=>document.body.dataset.direct==='relief'&&Sim.direct.etatVue().images>0);};
 const disposition=()=>page.evaluate(()=>Sim.ateliers.state.disposition||null);
 /** Le site que la scène montre : ses zones, ses allées, le côté des avions, ce qu'il a à dire. */
 const site=()=>page.evaluate(()=>{const s=Sim.direct.site;return {zones:Object.fromEntries(s.zones.map(z=>[z.id,{x:z.x,y:z.y,w:z.w,h:z.h}])),allees:(s.allees||[]).length,avions:s.avions,notes:s.notes||[],largeur:s.largeur,profondeur:s.profondeur};});
 /** La scène a redessiné la disposition réglée (ou le site automatique, sans elle). */
 const sceneAJour=()=>page.waitForFunction(()=>{const d=Sim.ateliers.state.disposition||null,s=Sim.direct.site;if(!s)return false;
   const cite=x=>x?JSON.stringify([x.colonnes.filter(c=>c.length),x.rangees.map(r=>r.zone)]):null;
   return d?!!s.disposition&&cite(s.disposition)===cite(d):!s.disposition;});
 /** Ce que le panneau liste : les colonnes (leurs zones), les rangées du bas (zone, de, à). */
 const liste=()=>page.evaluate(()=>({colonnes:[...document.querySelectorAll('#dd-corps .dd-colonne')].map(c=>[...c.querySelectorAll('.dd-zone')].map(z=>z.dataset.ddZone)),
   rangees:[...document.querySelectorAll('#dd-corps .dd-rangee')].map(z=>[z.dataset.ddZone,+z.querySelector('[data-dd=de]').value,+z.querySelector('[data-dd=a]').value])}));
 const focus=()=>page.evaluate(()=>{const a=document.activeElement;return a?[a.dataset.dd||(a.classList.contains('dd-zone')?'zone':a.id||a.tagName),a.dataset.ddZone||null]:null;});
 const colonneDe=async zone=>(await liste()).colonnes.findIndex(c=>c.includes(zone));
 const restaurer=async(nom,contenu)=>{
  await nav.aller(page,'u-sauvegarde');
  await page.locator('#sauvegarde-import').setInputFiles({name:nom,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(contenu))});
  assert.match(await page.locator('dialog.question[open] h2').textContent({timeout:5000}),/Restaurer cette sauvegarde/);
  const recharge=page.waitForEvent('load');await nav.repondre(page);await recharge;await page.waitForLoadState('load');await pret();
 };
 try{
  const x=await F.charger(page,nav,URL,{pageId:'j-plan',relief:true});await pret();
  // Un changement d'équipes fait avant d'ouvrir le panneau (une équipe renommée) : le panneau ne le défera pas.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id==='ar').nom='Armement du matin';},''));
  await page.waitForFunction(()=>Sim.ateliers.state.ateliers.find(a=>a.id==='ar').nom==='Armement du matin');
  // La journée de référence : celle d'un changement neutre (les effectifs calculés se posent au premier changement).
  const neutre=()=>page.evaluate(()=>{Sim.ateliers.changer(()=>{},'');return JSON.stringify(Sim.ateliers.resultat);});
  const avant=await neutre();
  assert.equal(await neutre(),avant);
  await sceneAJour();
  const auto=await site();
  assert.deepEqual([await disposition(),auto.allees,auto.avions],[null,0,'droite'],'sans réglage : le site automatique');

  // 1. Le bouton « Disposer les zones » est dans la barre de la scène ; il ouvre le panneau à côté d'elle, à la place de « En ce moment ».
  const bouton=page.locator('#direct-disposer-btn');
  assert.deepEqual([await bouton.innerText(),await bouton.getAttribute('aria-expanded'),await page.locator('#direct-disposer').isVisible()],['Disposer les zones','false',false]);
  await bouton.click();
  await page.waitForFunction(()=>document.body.classList.contains('direct-dispose'));
  assert.deepEqual([await bouton.getAttribute('aria-expanded'),await page.locator('#direct-disposer').isVisible(),await page.locator('#direct-panneau').isVisible()],['true',true,false]);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'dd-titre','le focus va au panneau');
  const b=await page.evaluate(()=>{const p=document.getElementById('direct-disposer').getBoundingClientRect(),c=document.getElementById('direct-toile').getBoundingClientRect();return p.left>=c.right-2&&p.width>200;});
  assert.ok(b,'à côté de la scène');
  // Automatique : il le dit, et montre d'où l'on part — toutes les zones du site, une fois chacune. Rien n'est réglé.
  assert.match(await page.locator('#dd-etat').innerText(),/^Disposition automatique : deux bandes, dans l’ordre du chemin\./);
  const l0=await liste();
  assert.deepEqual(l0.colonnes.flat().sort(),Object.keys(auto.zones).sort());
  assert.deepEqual(l0.rangees,[]);
  assert.equal(await page.locator('#dd-corps [data-dd=automatique]').isDisabled(),true);
  assert.equal(await disposition(),null,'ouvrir le panneau ne règle rien');
  // « Annuler » n'a rien à défaire ici : le changement d'équipes d'avant n'est pas un geste du panneau.
  await page.waitForFunction(()=>document.getElementById('btn-annuler').disabled);
  assert.deepEqual([await page.locator('#btn-annuler').isDisabled(),await page.locator('#btn-retablir').isDisabled()],[true,true]);

  // 2. Au clavier : une zone change de colonne (son bouton « colonne suivante », Entrée) ; la disposition est réglée, la scène
  //    se redessine, le focus reste sur le bouton — on recommence d'une touche.
  const zone=l0.colonnes[0][0],c0=0;
  await page.locator(`#dd-corps .dd-zone[data-dd-zone="${zone}"] [data-dd=droite]`).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>!!Sim.ateliers.state.disposition);
  await sceneAJour();
  assert.equal(await colonneDe(zone),c0+1,'la zone est dans la colonne suivante');
  assert.deepEqual(await focus(),['droite',zone],'le focus est resté sur son bouton');
  const s1=await site();
  assert.ok(s1.allees>0,'la scène montre des allées');
  assert.notDeepEqual(s1.zones[zone],auto.zones[zone],'la zone a changé de place dans la scène');
  assert.match(await page.locator('#dd-etat').innerText(),/^Les zones sont là où vous les avez mises/);
  // Un geste du panneau s'annule : le bouton du haut s'allume ; défait, il s'éteint — l'équipe renommée avant reste renommée.
  await page.waitForFunction(()=>!document.getElementById('btn-annuler').disabled);
  {
   const faite=await disposition();
   await page.locator('#btn-annuler').click();
   await page.waitForFunction(()=>!Sim.ateliers.state.disposition);
   await page.waitForFunction(()=>document.getElementById('btn-annuler').disabled&&!document.getElementById('btn-retablir').disabled);
   assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.id==='ar').nom),'Armement du matin','le changement d’équipes n’est pas défait');
   await page.keyboard.press('Control+z');
   assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.id==='ar').nom),'Armement du matin','ni par Ctrl Z');
   await page.locator('#btn-retablir').click();
   await page.waitForFunction(()=>!!Sim.ateliers.state.disposition);
   assert.deepEqual(await disposition(),faite,'« Rétablir » refait le geste');
   await sceneAJour();
   await page.locator(`#dd-corps .dd-zone[data-dd-zone="${zone}"] [data-dd=droite]`).focus();
  }
  assert.equal(await page.evaluate(()=>JSON.stringify(Sim.ateliers.resultat)),avant,'la journée est la même, champ par champ');
  if(l0.colonnes.length>2){await page.keyboard.press('Enter');await page.waitForFunction((z)=>Sim.ateliers.state.disposition.colonnes[2].includes(z),zone);assert.equal(await colonneDe(zone),c0+2);}
  // Les flèches, quand la zone a le focus : gauche et droite changent sa colonne, haut et bas son rang.
  await page.locator(`#dd-corps .dd-zone[data-dd-zone="${zone}"]`).focus();
  const cAvant=await colonneDe(zone);
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(([z,c])=>Sim.ateliers.state.disposition.colonnes[c].includes(z),[zone,cAvant-1]);
  assert.deepEqual(await focus(),['zone',zone],'le focus est resté sur la zone');
  const rang=async()=>{const l=await liste();return l.colonnes[await colonneDe(zone)].indexOf(zone);};
  const r0=await rang();
  assert.ok(r0>0,'elle est arrivée à la fin de sa colonne');
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction(([z,c,r])=>Sim.ateliers.state.disposition.colonnes[c].indexOf(z)===r,[zone,cAvant-1,r0-1]);
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(([z,c,r])=>Sim.ateliers.state.disposition.colonnes[c].indexOf(z)===r,[zone,cAvant-1,r0]);
  await sceneAJour();

  // 3. « En rangée du bas » : le quai passe sous les colonnes, sur toute la largeur ; les avions se rangent le long de son
  //    bord extérieur, en bas. Puis de quelle colonne à quelle colonne.
  await page.locator('#dd-corps .dd-zone[data-dd-zone=quais] [data-dd=rangee]').focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>Sim.ateliers.state.disposition.rangees.some(r=>r.zone==='quais'));
  await sceneAJour();
  const n=(await liste()).colonnes.length,s2=await site(),q=s2.zones.quais;
  assert.deepEqual((await liste()).rangees,[['quais',1,n]]);
  assert.ok(Math.abs(q.w-s2.largeur)<1e-6&&Math.abs(q.y+q.h-s2.profondeur)<1e-6&&Math.abs(q.x)<1e-6,'le quai longe toutes les colonnes, en bas du site');
  assert.equal(s2.avions,'bas','les avions le long du bord extérieur du quai');
  for(const [id,z] of Object.entries(s2.zones))if(id!=='quais')assert.ok(z.y+z.h<=q.y+1e-6,id+' est au-dessus du quai');
  // Jusqu'à l'avant-dernière des colonnes qui ont une zone (celle d'où vient le quai est peut-être vide) : il ne longe plus la dernière.
  const pleines=(await liste()).colonnes.map((c,i)=>c.length?i+1:0).filter(Boolean),jusqua=pleines[pleines.length-2];
  assert.ok(pleines.length>=2,'au moins deux colonnes ont une zone');
  await page.locator('#dd-corps .dd-rangee[data-dd-zone=quais] [data-dd=a]').selectOption(String(jusqua));
  await page.waitForFunction(k=>Sim.ateliers.state.disposition.rangees[0].a===k,jusqua);
  await sceneAJour();
  const s3=await site(),derniere=(await liste()).colonnes[pleines[pleines.length-1]-1][0];
  assert.ok(s3.zones.quais.w<s3.largeur-1,'le quai ne longe plus la dernière colonne');
  assert.ok(Math.abs(s3.zones[derniere].x-1.5-(s3.zones.quais.x+s3.zones.quais.w))<1e-6,'il s’arrête à l’allée de la dernière colonne');
  const basDe=id=>s3.zones[id].y+s3.zones[id].h,bas=(await liste()).colonnes[pleines[pleines.length-1]-1].at(-1);
  assert.ok(Math.abs(basDe(bas)-s3.profondeur)<1e-6,'la colonne qu’il ne longe plus descend jusqu’en bas du site');
  assert.deepEqual(await focus(),['a','quais']);

  // 4. Glisser-déposer (une zone se saisit par son nom) : la plonge se lâche dans une autre colonne ; puis sur une zone, dont
  //    elle prend le rang.
  const ou=await colonneDe('plonge'),autre=ou===0?2:0;
  await page.locator('#dd-corps .dd-zone[data-dd-zone=plonge] .dd-nom').dragTo(page.locator(`#dd-corps [data-dd-depot="${autre}"]`),{targetPosition:{x:20,y:2}});
  await page.waitForFunction(c=>Sim.ateliers.state.disposition.colonnes[c].includes('plonge'),autre);
  assert.equal(await colonneDe('plonge'),autre,'lâchée dans une autre colonne');
  const visee=(await liste()).colonnes[1][0];
  await page.locator('#dd-corps .dd-zone[data-dd-zone=plonge] .dd-nom').dragTo(page.locator(`#dd-corps .dd-zone[data-dd-zone="${visee}"] .dd-nom`));
  await page.waitForFunction(v=>{const c=Sim.ateliers.state.disposition.colonnes[1];return c.indexOf('plonge')>=0&&c.indexOf('plonge')===c.indexOf(v)-1;},visee);
  await sceneAJour();
  assert.equal((await liste()).colonnes[1][0],'plonge','lâchée sur une zone : elle prend son rang');

  // 5. « Ajouter une colonne », « Retirer cette colonne vide » ; « Annuler » et « Rétablir » suivent, et le panneau avec eux.
  await page.locator('#dd-corps [data-dd=ajouter]').click();
  await page.waitForFunction(k=>Sim.ateliers.state.disposition.colonnes.length===k,n+1);
  // Chaque colonne vide se retire, et elle seule (celle d'où vient le quai peut l'être aussi) ; on retire la dernière.
  assert.equal(await page.locator('#dd-corps [data-dd=retirer]').count(),(await liste()).colonnes.filter(c=>!c.length).length,'une colonne vide se retire');
  assert.equal(await page.locator('#dd-corps .dd-colonne').last().locator('[data-dd=retirer]').count(),1,'la colonne ajoutée est vide');
  const avecColonne=await disposition();
  await page.locator('#dd-corps [data-dd=retirer]').last().click();
  await page.waitForFunction(k=>Sim.ateliers.state.disposition.colonnes.length===k,n);
  const sansColonne=await disposition();
  await page.locator('#btn-annuler').click();
  await page.waitForFunction(k=>Sim.ateliers.state.disposition.colonnes.length===k,n+1);
  assert.deepEqual(await disposition(),avecColonne,'« Annuler » rend la colonne');
  await page.waitForFunction(k=>document.querySelectorAll('#dd-corps .dd-colonne').length===k,n+1);
  await page.locator('#btn-retablir').click();
  await page.waitForFunction(k=>Sim.ateliers.state.disposition.colonnes.length===k,n);
  assert.deepEqual(await disposition(),sansColonne,'« Rétablir » la retire de nouveau');
  await page.waitForFunction(k=>document.querySelectorAll('#dd-corps .dd-colonne').length===k,n);
  await sceneAJour();
  assert.equal(await page.evaluate(()=>JSON.stringify(Sim.ateliers.resultat)),avant,'après tous ces gestes, la journée est la même');
  assert.deepEqual((await site()).notes,[],'rien à dire');
  const reglee=await disposition();

  // 6. Une zone absente de la disposition (un service qui reçoit sa première équipe) se range à la fin de la dernière colonne,
  //    et la page le signale : sur le bouton, et dans le panneau.
  assert.equal(await page.locator('#dd-pastille').isVisible(),false);
  const sansZone=await page.evaluate(()=>{const dans=new Set(Sim.direct.site.zones.flatMap(z=>z.services));return Sim.unite.a.services().map(s=>s.id).find(id=>!dans.has(id)&&id!=='handling');});
  assert.ok(sansZone,'un service sans équipe');
  await page.evaluate(id=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'nouvelle',nom:'Nouvelle équipe',service:id,type:'manuel',debut:'06:00',jour:0,personnes:2,pauses:[],lots:[],regime:{actif:false}});},''),sansZone);
  await page.waitForFunction(id=>Sim.direct.site.zones.some(z=>z.id===id),sansZone);
  const s4=await site();
  assert.deepEqual(s4.notes,[{code:'absente',zone:sansZone}]);
  assert.deepEqual([await page.locator('#dd-pastille').isVisible(),await page.locator('#dd-pastille').innerText()],[true,'1']);
  assert.match(await page.locator('#dd-corps .dd-notes').innerText(),/n’était pas dans la disposition : rangée à la fin de la dernière colonne\.$/);
  const l4=await liste();
  assert.equal(l4.colonnes[l4.colonnes.length-1].at(-1),sansZone,'à la fin de la dernière colonne');
  // Un geste la range pour de bon : plus rien à dire.
  await page.locator(`#dd-corps .dd-zone[data-dd-zone="${sansZone}"] [data-dd=gauche]`).click();
  await page.waitForFunction(()=>!(Sim.direct.site.notes||[]).length);
  assert.equal(await page.locator('#dd-pastille').isVisible(),false);
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers=Sim.ateliers.state.ateliers.filter(a=>a.id!=='nouvelle');},''));
  await page.evaluate(d=>Sim.ateliers.regleDisposition(d,''),reglee);
  await sceneAJour();

  // 7. « Fermer » rend « En ce moment » ; la disposition survit à un rechargement, à « Tout sauvegarder » et à « Restaurer ».
  await page.locator('#dd-fermer').click();
  await page.waitForFunction(()=>!document.body.classList.contains('direct-dispose'));
  assert.deepEqual([await page.locator('#direct-disposer').isVisible(),await page.locator('#direct-panneau').isVisible(),await focus()],[false,true,['direct-disposer-btn',null]]);
  await page.reload();await pret();await relief();await sceneAJour();
  assert.deepEqual(await disposition(),reglee,'après un rechargement');
  const s5=await site();
  assert.ok(s5.allees>0&&Math.abs(s5.zones.quais.y+s5.zones.quais.h-s5.profondeur)<1e-6,'la scène la montre');
  await nav.aller(page,'u-sauvegarde');
  const dl=page.waitForEvent('download');await page.locator('#sauvegarde-export').click();
  const sauvegarde=JSON.parse(fs.readFileSync(await (await dl).path(),'utf8')),lu=v=>(typeof v==='string'?JSON.parse(v):v);
  assert.deepEqual(lu(sauvegarde.contenu['ory-ateliers-v1']).disposition,reglee,'dans la sauvegarde');
  // Une sauvegarde d'avant, sans disposition : le site automatique, le même qu'avant tout réglage.
  const ancienne=JSON.parse(JSON.stringify(sauvegarde)),texte=typeof ancienne.contenu['ory-ateliers-v1']==='string';
  {const e=lu(ancienne.contenu['ory-ateliers-v1']);delete e.disposition;ancienne.contenu['ory-ateliers-v1']=texte?JSON.stringify(e):e;}
  await restaurer('ory-sauvegarde-ancienne.json',ancienne);
  await relief();await sceneAJour();
  assert.equal(await disposition(),null,'une sauvegarde d’avant : aucune disposition');
  const s6=await site();
  assert.deepEqual([s6.allees,s6.avions],[0,'droite']);
  for(const [id,z] of Object.entries(auto.zones))for(const k of ['x','y','w','h'])assert.ok(Math.abs(s6.zones[id][k]-z[k])<1e-6,'le site d’aujourd’hui : '+id+'.'+k);
  await restaurer('ory-sauvegarde.json',sauvegarde);
  await relief();await sceneAJour();
  assert.deepEqual(await disposition(),reglee,'restaurée');

  // 8. « Revenir à la disposition automatique » : plus de réglage, le site d'aujourd'hui.
  await page.locator('#direct-disposer-btn').click();
  await page.waitForFunction(()=>document.body.classList.contains('direct-dispose'));
  await page.locator('#dd-corps [data-dd=automatique]').click();
  await page.waitForFunction(()=>!Sim.ateliers.state.disposition);
  await sceneAJour();
  const s7=await site();
  assert.deepEqual([s7.allees,s7.avions],[0,'droite']);
  for(const [id,z] of Object.entries(auto.zones))for(const k of ['x','y','w','h'])assert.ok(Math.abs(s7.zones[id][k]-z[k])<1e-6,'revenu à l’automatique : '+id+'.'+k);
  assert.match(await page.locator('#dd-etat').innerText(),/^Disposition automatique/);
  // « Annuler » rend la disposition réglée.
  await page.locator('#btn-annuler').click();
  await page.waitForFunction(()=>!!Sim.ateliers.state.disposition);
  assert.deepEqual(await disposition(),reglee);
  // Passer « À plat » referme le panneau.
  await nav.vueDuPlan(page,'plat');
  await page.waitForFunction(()=>!document.body.classList.contains('direct-dispose'));
  assert.equal(await page.locator('#direct-disposer').isVisible(),false);

  // 9. La version 2 n'a ni ce bouton ni ce panneau.
  await page.goto(pathToFileURL(path.resolve(__dirname,'../v2/index.html')).href);
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.unite);
  assert.deepEqual(await page.evaluate(()=>[typeof window.OrlyDirectDisposer,typeof window.OrlyDisposition,!!document.getElementById('direct-disposer-btn')]),['undefined','undefined',false]);

  x.effacer();
  assert.deepEqual(erreurs,[]);
  console.log('direct-disposer-browser : ok — le bouton et le panneau à côté de la scène ; une zone déplacée d’une colonne à l’autre au clavier, le focus gardé, les flèches ; « En rangée du bas », de quelle colonne à quelle colonne, les avions le long du quai ; le glisser-déposer ; ajouter et retirer une colonne, « Annuler » et « Rétablir » ; une zone absente signalée ; le rechargement, « Tout sauvegarder » et « Restaurer », une sauvegarde d’avant ; le retour à l’automatique ; la journée inchangée ; la version 2 sans ce panneau');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

/* Évolution 15 (c) — moins de pages, et des chiffres qui ne se contredisent
 * plus, dans la page, sur l'unité et les vols fictifs :
 *   — le menu des Résultats : six entrées ; « Détails » en quatre onglets
 *     internes, dans l'ordre ; « Étapes de chaque commande » dans Chemins ;
 *   — les anciens identifiants de page et « Aller à… » mènent au bon endroit ;
 *   — les compteurs de la Synthèse et des pages de détail sont égaux, avec les
 *     mêmes mots ; Commandes et Vols montrent d'abord les exceptions, le reste
 *     se déplie ;
 *   — aucune durée en minutes au-delà de 60 dans les résultats ;
 *   — pas d'alerte de stock sans seuil réglé ; « À regarder » se tait quand
 *     il n'a rien à dire.
 * Aucune donnée de l'unité : tout est fictif. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {siteSansPlan}=require('./plan-fictif.cjs');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

/** Les durées écrites en minutes au-delà d'une heure, dans le texte visible d'un élément. */
const tropDeMinutes=texte=>[...String(texte).matchAll(/(\d[\d   ]*) ?min\b/g)].map(m=>+m[1].replace(/\D/g,'')).filter(v=>v>=60);

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const site=siteSansPlan(),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=250)=>page.waitForTimeout(ms);
 const sous=()=>page.evaluate(()=>document.body.dataset.sous);
 const ch=await F.charger(page,nav,site.url('index.html'),{pageId:'j-chiffres'});
 try{
  // 1. Le menu des Résultats et les onglets de « Détails ».
  assert.deepEqual(await page.locator('#sous-onglets [data-sous-onglet]').allTextContents(),['Synthèse','Le plan rejoué','Planning des équipes','Détails','Comparer deux essais']);
  await page.locator('#sous-onglets [data-sous-onglet]').filter({hasText:'Détails'}).click();await attendre();
  assert.equal(await sous(),'at-repas','« Détails » s’ouvre sur les commandes');
  assert.equal(await page.locator('#view-title').textContent(),'Détails');
  assert.deepEqual(await page.locator('#onglets-internes [data-sous-onglet]').allTextContents(),['Commandes','Vols','Stocks et retours','Heures sup et renforts']);
  await page.locator('#onglets-internes [data-sous-onglet=j-stocks]').click();await attendre();
  assert.equal(await sous(),'j-stocks');
  assert.equal(await page.locator('#onglets-internes [aria-selected=true]').textContent(),'Stocks et retours');
  // Au clavier, les flèches parcourent les onglets internes, et le focus y reste.
  const focus=()=>page.evaluate(()=>{const a=document.activeElement;return a&&a.closest('#onglets-internes')?a.dataset.sousOnglet:null;});
  await page.locator('#onglets-internes [data-sous-onglet=j-stocks]').focus();await page.keyboard.press('ArrowRight');await attendre();
  assert.equal(await sous(),'j-details');assert.equal(await focus(),'j-details','le focus reste dans les onglets internes');
  await page.keyboard.press('ArrowLeft');await attendre();
  assert.equal(await sous(),'j-stocks');assert.equal(await focus(),'j-stocks');
  // « Détails » rouvre le dernier onglet ouvert.
  await nav.aller(page,'j-chiffres');await page.locator('#sous-onglets [data-sous-onglet]').filter({hasText:'Détails'}).click();await attendre();
  assert.equal(await sous(),'j-stocks');
  // « Étapes de chaque commande » : dans Chemins.
  await nav.aller(page,'at-grille');
  assert.equal(await page.evaluate(()=>document.body.dataset.partie),'chemins');

  // 2. Les anciens identifiants et « Aller à… ».
  for(const id of ['at-repas','v-departs','j-stocks','j-details']){
   await page.evaluate(id=>{const b=document.createElement('button');b.dataset.page=id;b.id='lien-test';document.body.append(b);b.click();b.remove();},id);await attendre();
   assert.equal(await sous(),id,'un lien vers '+id);
   assert.equal(await page.locator('#onglets-internes').isVisible(),true,id+' : les onglets de « Détails »');
  }
  await nav.aller(page,'j-chiffres');
  await page.keyboard.press('Control+k');await page.keyboard.type('Heure de chaque commande');await attendre(150);
  assert.equal(await page.locator('dialog.palette [role=option] .pal-nom').first().textContent(),'Détails › Commandes','l’ancien nom se cherche toujours');
  await page.keyboard.press('Enter');await attendre(300);
  assert.equal(await sous(),'at-repas');

  // 3. Les compteurs : les mêmes nombres, avec les mêmes mots, sur la Synthèse et dans « Détails ».
  const comptes=sel=>page.evaluate(sel=>Object.fromEntries([...document.querySelectorAll(sel+' .sy-comptes>div')].map(d=>[d.querySelector('dt').textContent,d.querySelector('dd').textContent])),sel);
  await nav.aller(page,'j-chiffres');const synthese=await comptes('#bilan-journee');
  await nav.aller(page,'at-repas');const commandes=await comptes('#at-classes');
  await nav.aller(page,'v-departs');const vols=await comptes('#vols-comptes');
  assert.ok(Object.keys(commandes).length>=2&&Object.keys(vols).length>=1,JSON.stringify({commandes,vols}));
  assert.deepEqual({...commandes,...vols},synthese,'la Synthèse et les pages de détail disent la même chose');
  assert.ok(Object.keys(commandes).every(q=>/^Commandes (de repas|d’équipement)/.test(q)),'un compteur dit son périmètre : '+Object.keys(commandes));

  // 4. Commandes et Vols : les exceptions d'abord ; le reste replié en une ligne, qui se déplie.
  await nav.aller(page,'at-repas');
  const etats=await page.locator('#at-classes tbody:first-of-type tr .at-etat').allTextContents();
  assert.ok(etats.length>0&&etats.every(t=>!/à l’heure/.test(t)),'les exceptions d’abord : '+etats.join(', '));
  const pli=page.locator('#at-classes .at-deplier');
  assert.match(await pli.textContent(),/^▸ \d+ commandes? à l’heure/);
  await pli.click();await attendre();
  assert.ok(await page.locator('#at-classes .at-etat.ok').count()>0,'dépliées : les commandes à l’heure');
  await nav.aller(page,'v-departs');
  const ordre=await page.locator('#flight-rows tr[class^=vol-]').evaluateAll(trs=>trs.map(t=>t.className));
  const premierPret=ordre.indexOf('vol-ready');
  assert.ok(premierPret<0||ordre.slice(0,premierPret).every(c=>c!=='vol-ready'),'les vols en retard d’abord');

  // 5. Aucune durée en minutes au-delà de 60, dans les pages des résultats (et « Comparer », avec deux essais).
  await nav.aller(page,'j-comparer');await page.locator('#snap-a').click();await attendre();
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const a=Sim.ateliers.state.ateliers.find(x=>x.id==='mo');a.personnes=(a.personnes||0)+2;},''));await attendre();
  await nav.aller(page,'j-comparer');await page.locator('#snap-b').click();await attendre();
  for(const id of ['j-chiffres','j-plan','at-planning','at-repas','v-departs','j-stocks','j-details','j-comparer']){
   await nav.aller(page,id);await attendre(300);
   if(id==='at-repas'&&await page.locator('#at-classes .at-deplier[aria-expanded=false]').count())await page.locator('#at-classes .at-deplier').click();
   const texte=await page.locator('#workspace').innerText(),infos=await page.evaluate(()=>[...document.querySelectorAll('#at-planning [data-info]')].map(e=>e.dataset.info).join('\n'));
   assert.deepEqual(tropDeMinutes(texte+'\n'+(id==='at-planning'?infos:'')),[],id+' : une durée de plus d’une heure s’écrit en heures');
   assert.doesNotMatch(texte,/\d+,\d+ heures de travail/,id+' : pas d’heures décimales');
  }
  const rubriques=await page.locator('#compare .compare-groupe').allTextContents();
  assert.deepEqual(rubriques.slice(0,5),['Le scénario : ce qui change entre A et B','1. Combien de personnes faut-il ?','2. Où et quand ça coince ?',
    '3. À quelle heure chaque service finit-il ?','4. Qu’est-ce qui part en retard ?'],'« Comparer » se range selon les questions');

  // 6. Pas d'alerte de stock sans seuil réglé ; avec un seuil, les stocks plus longs.
  await nav.aller(page,'j-stocks');
  assert.equal(await page.locator('#journee-stocks .tp-plus24').count(),0,'sans durée maximale réglée, aucune alerte de stock');
  await page.evaluate(()=>Sim.seuils.enregistrer({dureeStockMax:600}));await page.evaluate(()=>Sim.ateliers.changer(()=>{},''));await attendre(400);
  await nav.aller(page,'j-stocks');
  const longs=await page.evaluate(()=>Sim.ateliers.resultat.stocks.parLien.filter(l=>l.dureeMax>600).length);
  assert.ok(longs>0);assert.equal(await page.locator('#journee-stocks .tp-plus24').count(),longs,'un stock plus long que 10 h 00 : signalé');
  assert.match(await page.locator('#journee-stocks .tp-plus24').first().textContent(),/plus de 10 h 00/);
  // Une quantité porte son unité : un lien d'équipement ne s'écrit pas « 0 repas ».
  assert.doesNotMatch(await page.locator('#journee-stocks .tp-table').innerText(),/\b0\s+repas/);
  // « Bouchon » à la plonge : du sale reste le soir dans l'unité fictive, l'attente reste sous l'heure ; temps.js (commun,
  // non modifié) ne le dit pas, la version 1 l'ajoute, quel que soit le seuil d'attente.
  const plonge=await page.evaluate(()=>Sim.ateliers.resultat.plonge);
  assert.ok(plonge&&plonge.resteSale>0&&plonge.attenteMax<60,JSON.stringify(plonge&&{a:plonge.attenteMax,s:plonge.resteSale}));
  const etiquette=()=>page.locator('#journee-stocks .tp-etiquette.alerte',{hasText:'Bouchon'}).count();
  for(const attenteLot of [1,1440]){
   await page.evaluate(a=>Sim.seuils.enregistrer({attenteLot:a}),attenteLot);await page.evaluate(()=>Sim.ateliers.changer(()=>{},''));await attendre(400);
   await nav.aller(page,'j-stocks');
   assert.equal(await etiquette(),1,'du sale reste le soir : bouchon, au seuil de '+attenteLot+' min');
   assert.equal(await page.locator('#journee-stocks .tp-tuile.alerte').count(),3,'les deux tuiles du bouchon, et le sale du soir');
  }
  // Et l'inverse, sur une plonge dessinée comme temps.js la dessine : une heure et demie d'attente, rien de sale le soir, un seuil de 2 h.
  const retire=await page.evaluate(()=>{
   const box=document.createElement('div');
   box.innerHTML='<div class="tp-tuile alerte"><span>Le plus de sale pas encore lavé</span></div><div class="tp-tuile alerte"><span>Attente la plus longue</span></div>'
     +'<p class="tp-phrase"><b class="tp-etiquette alerte">▲ Bouchon</b> La plonge suit.</p>';
   OrlyResultatsVue.completerStocks(box,{plonge:{attenteMax:90,resteSale:0},stocks:{parLien:[]}},{...OrlyReponses.SEUILS_DEFAUT,attenteLot:120});
   return {etiquettes:box.querySelectorAll('.tp-etiquette').length,alertes:box.querySelectorAll('.alerte').length,phrase:box.querySelector('.tp-phrase').textContent};
  });
  assert.deepEqual(retire,{etiquettes:0,alertes:0,phrase:'La plonge suit.'},'sous le seuil, sans sale le soir : pas de bouchon');
  await page.evaluate(()=>localStorage.removeItem('ory-seuils-v1'));

  // 7. « À regarder » se tait quand il n'a rien à dire : au début de la journée rejouée, personne n'attend ; et aucune attente
  //    de la journée ne passe un seuil de 24 h. Au seuil d'une heure, il dit qui attend le plus sur la journée.
  await page.evaluate(()=>Sim.seuils.enregistrer({attenteLot:1440}));
  await nav.aller(page,'j-plan');await page.evaluate(()=>Sim.vue.allerA(Sim.vue.debut));await attendre(300);
  assert.equal(await page.locator('#goulot-info').isVisible(),false,'rien à dire : rien d’affiché');
  await page.evaluate(()=>Sim.seuils.enregistrer({attenteLot:60}));await page.evaluate(()=>Sim.vue.allerA(Sim.vue.debut+1));await attendre(300);
  assert.match(await page.locator('#goulot-info').innerText(),/qui attend le plus : \d+ h \d\d en tout/,'au-delà du seuil : il le dit, en heures');
  await page.evaluate(()=>localStorage.removeItem('ory-seuils-v1'));

  assert.deepEqual(errors,[],errors.join(' | '));
  console.log('details-browser : ok — menu et onglets (clavier compris), anciens identifiants, compteurs égaux, exceptions d’abord, durées en heures, alertes au seuil (stocks, bouchon).');
 }catch(e){console.error(e);process.exitCode=1;}finally{ch.effacer();site.effacer();await browser.close();}
})();

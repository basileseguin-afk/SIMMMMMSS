/* « Contrôles » (version 1, évolution 22 d) — deux pages et un panneau en un, sur l'unité fictive, à 1 366 × 768.
 *   1. Les mêmes avis qu'avant la fusion, au même niveau : ceux que montraient le panneau « Problèmes », « Prêt à
 *      simuler ? » et « Contrôles détaillés ». Trois colonnes, « Bloquant », « À corriger », « Information ».
 *   2. La ligne d'état : où en est le calcul, le dernier réglage changé et son heure, un lien vers la Synthèse.
 *   3. Chaque avis a un bouton nommé par sa destination, qui mène à la bonne page et au bon endroit.
 *   4. La pastille du menu compte les bloquants et les « à corriger », jamais les informations ; « C'est voulu ».
 *   5. Au-delà de trois, les informations sont repliées ; une colonne vide le dit en une phrase.
 *   6. Le bouton « Problèmes » a quitté le bas du menu ; les noms d'avant mènent à « Contrôles ».
 *   7. La page ne défile pas : chaque colonne défile seule ; texte de 13 px au moins.
 *   8. Ce que le calcul lit des liens entre services se lit avec eux, dans « Liens entre services ».
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const C='#mu-pas';

/* Les avis de l'unité fictive, tels que le panneau « Problèmes » les rangeait avant l'évolution 22 (d) : leur niveau, et
 * le début de leur titre. */
const AVANT=[
  ['bloquant','Chaque commande a quelqu’un pour la préparer'],
  ['corriger','« Réception / Appros » est sur le chemin de 16 commandes préparé'],
  ['corriger','« Dotation » est sur le chemin de 16 commandes préparées dans d’'],
  ['corriger','« Cuisine froide » est sur le chemin de 2 commandes préparées da'],
  ['corriger','« Prépa » est sur le chemin de 1 commande préparée dans d’autres'],
  ['corriger','Montage bis : ZEN · Économie est cochée ici, mais son chemin ne '],
  ['corriger','Vos services et leurs équipes'],
  ['information','Vol ES309 (J-1) dans « Plonge » : le poste se termine avant la f'],
  ['information','Vol NO107 (J-1) dans « Plonge » : le poste se termine avant la f'],
  ['information','Quais : 15 vols chargés après leur départ (le plus en retard : N'],
  ['information','Plonge soir : 2 vols revenus ne sont pas lavés (le poste finit, '],
  ['information','479 u reviennent après la fin du poste de la plonge (20:30) et n']];

/* Les titres portent des espaces et des traits insécables (« J‑1 ») : on les compare sans eux. */
const lisse=t=>String(t).replace(/[\u00a0\u202f]/g,' ').replace(/\u2011/g,'-');

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 const ctx=await browser.newContext({viewport:{width:1366,height:768}});
 const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=300)=>page.waitForTimeout(ms);
 const sous=()=>page.evaluate(()=>document.body.dataset.sous);
 const registre=()=>page.evaluate(()=>Sim.problemes.liste.map(p=>({niveau:p.niveau,titre:p.titre,code:p.code||null,service:p.service||null,equipe:p.equipe||null,classes:p.classes||null,services:p.services||null})));
 const controles=async()=>{await nav.aller(page,'mu-pas');await attendre();};
 const pastille=()=>page.evaluate(()=>[...document.querySelectorAll('#menu [data-sous-onglet]')].filter(b=>b.querySelector('.so-badge')).map(b=>[b.dataset.entree,+b.querySelector('.so-badge').textContent]));
 /** Le point de la page dont le titre commence ainsi, et son bouton. */
 const point=debut=>page.locator(`${C} .ct-point`).filter({has:page.locator('.ct-corps>b',{hasText:debut})}).first();
 try{
  const site=await F.charger(page,nav,URL_V1,{pageId:'mu-pas'});
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.problemes&&Sim.problemes.liste.length>0);
  await attendre(400);

  /* ---- 1. les mêmes avis qu'avant, au même niveau ; trois colonnes ------------------------------------------------- */
  let r=await registre();
  assert.deepEqual(r.map(p=>[p.niveau,lisse(p.titre).slice(0,64)]),AVANT,'les avis de l’unité fictive, et leur niveau, sont ceux d’avant');
  assert.equal(await page.locator('#view-title').textContent(),'Contrôles');
  assert.equal(await page.locator('#ariane-partie').textContent(),'Simulation');
  assert.deepEqual(await page.locator(`${C} .ct-niveau`).evaluateAll(s=>s.map(x=>[x.dataset.ctNiveau,x.querySelector('h3 span').textContent,+x.querySelector('.ct-n').textContent])),
    [['bloquant','Bloquant',1],['corriger','À corriger',6],['information','Information',5]]);
  for(const n of ['bloquant','corriger','information'])
    assert.deepEqual(await page.locator(`${C} .ct-niveau.${n} .ct-point .ct-corps>b`).evaluateAll(bs=>bs.map(b=>b.textContent)),r.filter(p=>p.niveau===n).map(p=>p.titre),n+' : la colonne montre les avis du registre, dans l’ordre');
  assert.equal(await page.locator(`${C} .ct-point`).count(),AVANT.length,'aucun avis de plus, aucun de moins');
  // Ni le pas à pas, ni la page « Contrôles détaillés », ni le panneau : une seule page.
  assert.equal(await page.locator('.mu-pas-liste, #btn-problemes, #problemes, #onglets-internes:not([hidden]) [data-sous-onglet]').count(),0);

  /* ---- 2. la ligne d'état ------------------------------------------------------------------------------------------ */
  const etat=page.locator(`${C} .ct-etat`);
  assert.equal(await etat.getAttribute('data-ct-etat'),'ok');
  assert.match(await etat.locator('.ct-calcul').innerText(),/^Le calcul est à jour$/);
  // Un réglage changé, annoncé : la ligne dit lequel, et son heure ; elle suit sans qu'on recharge.
  const avantGeste=await page.evaluate(()=>{const a=Sim.ateliers.state.ateliers.find(x=>x.type==='manuel');return {id:a.id,personnes:a.personnes};});
  await page.evaluate(x=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id===x.id).personnes=x.personnes+1;},'Une personne de plus, pour le test.'),avantGeste);
  await attendre(400);
  assert.match(await etat.locator('.ct-dernier').innerText(),/^Dernier réglage changé à \d\d:\d\d : Une personne de plus, pour le test\.$/);
  const heure=(await etat.locator('.ct-dernier').innerText()).match(/à (\d\d):(\d\d)/),maintenant=new Date();
  assert.ok(Math.abs((+heure[1]*60+ +heure[2])-(maintenant.getHours()*60+maintenant.getMinutes()))%1439<=2,'son heure est celle du geste : '+heure[0]);
  await page.evaluate(x=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id===x.id).personnes=x.personnes+2;},''),avantGeste);
  await attendre(400);
  assert.match(await etat.locator('.ct-dernier').innerText(),/^Dernier réglage changé à \d\d:\d\d : les équipes et les chemins$/,'sans annonce : ce que le geste règle');
  // « Annuler », deux fois : l'unité revient à ses réglages.
  await page.evaluate(()=>{Sim.ateliers.histoire(false);Sim.ateliers.histoire(false);});await attendre(400);
  assert.equal(await page.evaluate(x=>Sim.ateliers.state.ateliers.find(a=>a.id===x.id).personnes,avantGeste),avantGeste.personnes);
  // C'est une préférence de ce navigateur, hors de la sauvegarde : elle n'entre dans aucun état enregistré.
  assert.match(await page.evaluate(()=>localStorage.getItem('ory-ui-dernier-reglage')),/"domaine":"cases"/);
  assert.equal(await page.evaluate(()=>JSON.stringify(Sim.ateliers.state).includes('dernier')),false);
  // Le lien mène à la Synthèse.
  await etat.locator('.ct-synthese').click();await attendre();
  assert.equal(await sous(),'j-chiffres','« Voir la Synthèse »');
  await controles();
  r=await registre();
  assert.deepEqual(r.map(p=>[p.niveau,lisse(p.titre).slice(0,64)]),AVANT,'revenue à ses réglages, l’unité a les mêmes avis');

  /* ---- 3. chaque bouton mène à la bonne page, au bon endroit ---------------------------------------------------- */
  assert.equal(await page.locator(`${C} .ct-point [data-ct-aller]`).count(),AVANT.length,'un bouton par avis');
  // a. Une étape du chemin que personne ne prépare : « Chemins », le tableau de cette étape, une commande à corriger en évidence.
  for(const p of r.filter(x=>x.code==='parcours-trou')){
    await controles();
    const b=point(p.titre.slice(0,40)).locator('[data-ct-aller]');
    assert.equal(await b.innerText(),'Régler dans Chemins →',p.titre.slice(0,30));
    await b.click();await attendre(400);
    assert.equal(await sous(),'mu-flux',p.service+' : « Chemins »');
    assert.equal(await page.locator('#mu-flux .ch-etape').getAttribute('data-ch-etape'),p.service,p.service+' : le tableau de son étape');
    assert.equal(await page.locator('#mu-flux .ch-etape tr.ch-vise').getAttribute('data-ch-cmd'),p.classes[0],p.service+' : la commande en évidence');
    assert.match(await page.locator('#mu-flux .ch-etape tr.ch-vise').innerText(),/à corriger/,p.service+' : elle y est « à corriger »');
    assert.equal(await page.evaluate(()=>{const t=document.querySelector('#mu-flux .ch-etape tr.ch-vise').getBoundingClientRect();return t.top>=0&&t.bottom<=innerHeight;}),true,p.service+' : à l’écran');
  }
  // b. Un point d'une équipe : sa fiche, dans « Services et équipes ».
  await controles();
  const hors=r.find(x=>x.code==='hors-parcours');
  assert.equal(await point('Montage bis').locator('[data-ct-aller]').innerText(),'Régler dans Services et équipes →');
  await point('Montage bis').locator('[data-ct-aller]').click();await attendre(400);
  assert.deepEqual([await sous(),await page.evaluate(()=>Sim.unite.equipeOuverte)],['mu-services',hors.equipe],'la fiche de l’équipe');
  assert.equal(await page.locator(`#mu-services .mu-equipe[data-at="${hors.equipe}"]`).isVisible(),true);
  // c. « Vos services et leurs équipes » : le premier service à compléter, sa fiche.
  await controles();
  const etape=r.find(x=>x.titre==='Vos services et leurs équipes');
  await point('Vos services et leurs équipes').locator('[data-ct-aller]').click();await attendre(400);
  assert.deepEqual([await sous(),await page.evaluate(()=>Sim.unite.choisi),await page.evaluate(()=>Sim.unite.equipeOuverte||null)],['mu-services',etape.services[0],null],'la fiche du premier service à compléter');
  // d. Le bloquant : « Services et équipes ».
  await controles();
  assert.equal(await point('Chaque commande').locator('[data-ct-aller]').innerText(),'Régler dans Services et équipes →');
  await point('Chaque commande').locator('[data-ct-aller]').click();await attendre(400);
  assert.equal(await sous(),'mu-services');
  // e. Une information : ce que la journée montre se lit dans la Synthèse.
  await controles();
  assert.deepEqual(await page.locator(`${C} .ct-niveau.information [data-ct-aller]`).evaluateAll(bs=>[...new Set(bs.map(b=>b.textContent))]),['Voir dans Synthèse →']);
  await page.locator(`${C} .ct-niveau.information [data-ct-aller]`).first().click();await attendre(400);
  assert.equal(await sous(),'j-chiffres');
  // f. Les avis que l'unité fictive n'a pas : le même geste, sur un avis de chaque sorte.
  const mener=async p=>{await controles();await page.evaluate(p=>Sim.unite.allerAvis(p),p);await attendre(400);};
  const sansTemps=await page.evaluate(()=>Sim.unite.a.services().find(s=>Sim.ateliers.state.ateliers.some(a=>a.service===s.id&&a.type==='manuel')).id);
  await mener({niveau:'corriger',titre:'x',page:'mu-services',code:'bareme',service:sansTemps,equipe:'peu-importe'});
  assert.deepEqual([await sous(),await page.evaluate(()=>Sim.unite.choisi)],['mu-services',sansTemps],'un service sans temps par vol : sa fiche');
  assert.equal(await page.locator('#mu-services details[data-mu-section=temps][open]').count(),1,'ses temps par vol, dépliés');
  await mener({niveau:'corriger',titre:'x',page:'mu-services',fantome:'un-service-supprime'});
  assert.equal(await sous(),'mu-services','un service supprimé encore cité : « Services et équipes »');
  await mener({niveau:'corriger',titre:'x',page:'u-liens',lien:true});
  assert.equal(await sous(),'u-liens','un avis des liens : « Liens entre services »');
  await mener({niveau:'bloquant',titre:'x',page:'v-programme',etape:'vols'});
  assert.equal(await sous(),'v-programme','sans vol : « Programme des vols »');
  await mener({niveau:'bloquant',titre:'x',page:'mu-flux',code:'cycle'});
  assert.equal(await sous(),'mu-flux','un chemin qui tourne en rond : « Chemins »');

  /* ---- 4. la pastille : bloquants et « à corriger », jamais les informations ; « C'est voulu » ----------------------- */
  await controles();
  assert.deepEqual(await pastille(),[['mu-pas',7]],'une seule pastille, sur « Contrôles » : 1 bloquant et 6 à corriger, sans les 5 informations');
  assert.equal(await page.locator('#menu [data-entree="mu-pas"] .so-badge').getAttribute('title'),'1 bloquant · 6 à corriger');
  // Des compagnies qu'aucun handling ne charge : un avis de plus par compagnie, à corriger, chacun avec « C'est voulu ».
  const handling=await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.type==='handling').id);
  await page.evaluate(id=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id===id).compagnies=['NORD'];},''),handling);
  await page.waitForFunction(()=>(Sim.ateliers.resultat.anomalies||[]).filter(a=>a.code==='handling-sans').length>=2);
  await attendre(400);
  const sansHandling=await page.evaluate(()=>Sim.ateliers.resultat.anomalies.filter(a=>a.code==='handling-sans').map(a=>a.compagnie)),k=sansHandling.length;
  const problemes=()=>page.evaluate(()=>OrlyAvis.compte(Sim.problemes.liste));
  const n0=await problemes();
  assert.deepEqual(await pastille(),[['mu-pas',n0]],'la pastille suit le registre');
  assert.ok(n0>=7+k-1,'un avis de plus par compagnie sans handling ('+k+') : '+n0);
  assert.equal(await page.locator(`${C} [data-ct-voulu]`).count(),k,'« C’est voulu » sur ces avis seulement');
  const voulu=page.locator(`${C} .ct-point`).filter({has:page.locator(`[data-ct-voulu="${sansHandling[0]}"]`)});
  assert.match(await voulu.locator('.ct-corps>b').innerText(),/aucun handling ne charge cette compagnie/);
  assert.equal(await voulu.locator('[data-ct-voulu]').innerText(),'C’est voulu');
  assert.equal(await voulu.evaluate(li=>li.closest('.ct-niveau').dataset.ctNiveau),'corriger');
  // Son bouton mène à l'équipe du handling.
  assert.equal(await voulu.locator('[data-ct-aller]').innerText(),'Régler dans Services et équipes →');
  await voulu.locator('[data-ct-aller]').click();await attendre(400);
  assert.deepEqual([await sous(),await page.evaluate(()=>Sim.unite.equipeOuverte)],['mu-services',handling]);
  await controles();
  await page.locator(`${C} [data-ct-voulu="${sansHandling[0]}"]`).click();
  await page.waitForFunction(c=>(Sim.ateliers.state.sansChargement||[]).includes(c),sansHandling[0]);
  await attendre(400);
  assert.equal(await page.locator(`${C} [data-ct-voulu]`).count(),k-1,'l’avis part avec son bouton');
  assert.deepEqual(await pastille(),[['mu-pas',n0-1]]);
  assert.equal(await sous(),'mu-pas','on reste sur la page');
  await page.evaluate(id=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;delete st.ateliers.find(a=>a.id===id).compagnies;delete st.sansChargement;},''),handling);
  await attendre(400);
  assert.deepEqual(await pastille(),[['mu-pas',7]],'le handling charge de nouveau toutes les compagnies');

  /* ---- 5. les informations repliées au-delà de trois ; une colonne vide le dit -------------------------------------- */
  const infos=page.locator(`${C} .ct-niveau.information`);
  assert.equal(await infos.locator('.ct-point:visible').count(),3,'trois informations d’emblée');
  assert.equal(await infos.locator('details.ct-plus').evaluate(d=>d.open),false);
  assert.equal(await infos.locator('details.ct-plus>summary').innerText(),'2 autres informations');
  await infos.locator('details.ct-plus>summary').click();await attendre(150);
  assert.equal(await infos.locator('.ct-point:visible').count(),5,'elles se déplient');
  // Le repli reste comme on l'a laissé quand la page se redessine.
  await page.evaluate(()=>Sim.unite.rendrePas());await attendre(150);
  assert.equal(await infos.locator('details.ct-plus').evaluate(d=>d.open),true);
  // Plus rien de bloquant : la colonne le dit en une phrase, et garde sa place.
  await page.evaluate(()=>{const u=Sim.unite,avis=u.a.avis;u.a.avis=()=>avis().filter(p=>p.niveau!=='bloquant');u.rendrePas();u.a.avis=avis;});await attendre(150);
  assert.equal(await page.locator(`${C} .ct-niveau.bloquant .ct-vide`).innerText(),'Rien de bloquant : le calcul se fait, et chaque commande a une équipe pour la préparer.');
  assert.deepEqual(await page.locator(`${C} .ct-niveau`).evaluateAll(s=>s.map(x=>x.dataset.ctNiveau)),['bloquant','corriger','information']);
  await page.evaluate(()=>Sim.unite.rendrePas());await attendre(150);

  /* ---- 6. le bouton « Problèmes » a quitté le menu ; les noms d'avant mènent ici -------------------------------- */
  assert.equal(await page.locator('#btn-problemes').count(),0);
  assert.deepEqual(await page.locator('.barre-pied button, .barre-pied a').evaluateAll(bs=>bs.map(b=>b.textContent.trim()).filter(Boolean)).catch(()=>[]).then(t=>t.includes('Problèmes')),false,'plus de « Problèmes » au bas du menu');
  for(const nom of ['Prêt à simuler ?','Contrôles détaillés','Problèmes']){
    await nav.aller(page,'j-chiffres');
    await page.keyboard.press('Control+k');await page.waitForSelector('dialog.palette [role=option]');
    await page.keyboard.type(nom);await attendre(200);
    await page.locator('dialog.palette [role=option]').filter({hasText:nom}).first().click();await attendre(300);
    assert.equal(await sous(),'mu-pas','« '+nom+' » mène à « Contrôles »');
    assert.equal(await page.locator(`${C} .ct-cadre`).isVisible(),true);
  }
  // Un lien vers « Contrôles détaillés » (data-page) y mène aussi ; l'état du calcul, en tête, aussi quand il s'arrête.
  await nav.aller(page,'j-chiffres');
  await page.evaluate(()=>{const b=document.createElement('button');b.id='ct-vieux-lien';b.dataset.page='u-lecture';b.textContent='Contrôles détaillés';document.querySelector('#view-title').after(b);});
  await page.locator('#ct-vieux-lien').click();await attendre(300);
  assert.equal(await sous(),'mu-pas');
  await page.evaluate(()=>document.getElementById('ct-vieux-lien').remove());
  assert.equal(await page.locator('#menu [aria-selected=true]').getAttribute('data-entree'),'mu-pas');

  /* ---- 7. la page tient dans l'écran : chaque colonne défile seule ; texte de 13 px au moins --------------------- */
  const m=await page.evaluate(()=>{const v=document.getElementById('view-ateliers'),c=document.querySelector('#mu-pas .ct-cadre').getBoundingClientRect(),cols=[...document.querySelectorAll('#mu-pas .ct-liste')];
    return {ecran:[innerWidth,innerHeight],doc:document.documentElement.scrollHeight-innerHeight,vue:v.scrollHeight-v.clientHeight,bas:Math.round(c.bottom),
      defile:cols.map(l=>getComputedStyle(l).overflowY),deborde:cols.map(l=>l.scrollHeight>l.clientHeight+1),largeurs:[...document.querySelectorAll('#mu-pas .ct-niveau')].map(x=>Math.round(x.getBoundingClientRect().width)),
      texte:Math.min(...[...document.querySelectorAll('#mu-pas *')].filter(e=>e.children.length===0&&e.textContent.trim()&&e.getBoundingClientRect().width>0).map(e=>parseFloat(getComputedStyle(e).fontSize)))};});
  assert.deepEqual(m.ecran,[1366,768]);
  assert.equal(m.doc,0,'la page ne défile pas');
  assert.ok(m.vue<=1,'la vue non plus ('+m.vue+' px)');
  assert.ok(m.bas<=768,'les trois colonnes tiennent dans l’écran ('+m.bas+')');
  assert.deepEqual(m.defile,['auto','auto','auto'],'chaque colonne défile seule');
  assert.equal(m.deborde[1],true,'six avis à corriger : leur colonne défile');
  assert.ok(Math.max(...m.largeurs)-Math.min(...m.largeurs)<=2&&m.largeurs[0]>=300,'trois colonnes égales : '+m.largeurs);
  assert.ok(m.texte>=13,'le texte fait 13 px au moins : '+m.texte+' px');

  /* ---- 8. ce que le calcul lit des liens se lit avec eux ------------------------------------------------------------ */
  await nav.aller(page,'u-liens');await attendre(400);
  // Un repli, sous le diagramme ; toutes les commandes ont un chemin : ces liens ne servent pas, il est fermé.
  assert.equal(await page.locator('#fc-lecture-repli').evaluate(d=>d.open),false);
  assert.equal(await page.locator('#fc-lecture-repli>summary').innerText(),'Ce que le calcul lit de ces liens');
  await page.locator('#fc-lecture-repli>summary').click();await attendre(200);
  assert.equal(await page.locator('#fc-lecture').isVisible(),true,'« Les liens entre services, tels que le calcul les lit », dans « Liens entre services »');
  assert.match(await page.locator('#fc-calcul').innerText(),/^Toutes les commandes ont leur chemin : ces liens ne servent pas au calcul, ils décrivent l’unité\.$/);
  assert.equal(await page.locator('#fc-calcul .fc-alerte').count(),0,'les avis du calcul n’y sont plus : ils sont dans « Contrôles »');
  assert.equal(await page.evaluate(()=>{const l=document.getElementById('fc-lecture'),g=document.querySelector('.fc-graphe-zone');return !!(g.compareDocumentPosition(l)&Node.DOCUMENT_POSITION_FOLLOWING);}),true,'sous le diagramme');
  // Une commande sans chemin : ces liens servent au calcul, leur lecture s'ouvre d'elle-même.
  await page.locator('#fc-lecture-repli>summary').click();await attendre(150);
  const orpheline=await page.evaluate(()=>{const at=Sim.ateliers,c=at.classes.find(x=>!x.categorie&&!(at.state.parcoursClasse||{})[x.id]),avant=at.state.parcoursCabine[c.cabine];
    at.changer(()=>{const p={...at.state.parcoursCabine};delete p[c.cabine];at.state.parcoursCabine=p;},'');return {cabine:c.cabine,avant};});
  await attendre(400);
  assert.equal(await page.locator('#fc-lecture-repli').evaluate(d=>d.open),true);
  assert.match(await page.locator('#fc-calcul').innerText(),/commandes? n’(a|ont) pas de chemin : pour elles, le calcul suit les liens entre services\.$/);
  await page.evaluate(x=>{const at=Sim.ateliers;at.changer(()=>{at.state.parcoursCabine={...at.state.parcoursCabine,[x.cabine]:x.avant};},'');},orpheline);await attendre(300);

  assert.deepEqual(erreurs,[],'aucune erreur de page');
  await site.effacer();
  console.log('controles-page-browser : ok — les mêmes avis qu’avant, au même niveau, en trois colonnes ; la ligne d’état (le calcul, le dernier réglage changé et son heure, la Synthèse) ; un bouton par avis, nommé par sa destination, qui mène à la bonne page et au bon endroit ; la pastille sans les informations, « C’est voulu » ; les informations repliées au-delà de trois ; les noms d’avant ; la page tient dans l’écran ; la lecture des liens, avec les liens');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

/* Évolution 23 (a) — « Plan » sort du menu, et la vue « À plat » sort de « En direct » ; sur l'unité fictive, à
 * 1 366 × 768. Le plan de l'unité ne sert pas : ni la page qui le dessine, ni la vue qui rejoue la journée dessus. Ils
 * quittent l'écran, pas l'application.
 *   1. Le menu : treize entrées (douze sans programme daté) ; dans « L'unité », « Services et équipes » et « Chemins ».
 *   2. « En direct » n'a plus le choix « En relief / À plat », et s'ouvre en relief — y compris après une visite de la vue
 *      à plat, et après un rechargement.
 *   3. « Aller à… » ouvre la vue à plat (« En direct, à plat ») et la page du plan ; l'entrée « En direct » ramène au
 *      relief.
 *   4. La fiche d'un service : un lien discret, en bas des « Réglages avancés », ouvre le plan sur ce service ; « Terminer »
 *      ramène à la fiche.
 *   5. Rien ne mène à une entrée qui n'existe plus : ni l'accueil, ni un lien d'une page du menu, ni « Liens entre
 *      services ».
 *   6. En lecture seule : la page du plan reste verrouillée ; la vue à plat, qui se lit, s'ouvre.
 *   7. Une sauvegarde d'avant se restaure : ses services et son plan intacts, et la même sauvegarde en ressort.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const A_PLAT='En direct, à plat';

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-plan-hors-menu-'));
 const erreurs=[];
 const ctx=await browser.newContext({viewport:{width:1366,height:768},acceptDownloads:true});
 const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=300)=>page.waitForTimeout(ms);
 const ici=()=>page.evaluate(()=>({sous:document.body.dataset.vue==='accueil'?'accueil':document.body.dataset.sous,direct:document.body.dataset.direct,edition:document.body.classList.contains('editing'),titre:document.getElementById('view-title').textContent}));
 const dernierAvis=()=>page.evaluate(()=>{const n=[...document.querySelectorAll('#notifs .notif .notif-texte')];return n.length?n[n.length-1].textContent.replace(/ | /g,' '):'';});
 /** « Aller à… » : taper un nom, lire ce que la palette propose, ouvrir. */
 const allerA=async nom=>{await page.keyboard.press('Control+k');await page.waitForSelector('dialog.palette [role=option]');await page.keyboard.type(nom);await attendre(200);
   const o=page.locator('dialog.palette [role=option]').filter({has:page.locator('.pal-nom',{hasText:new RegExp('^'+nom+'$')})}).first();
   const texte=(await o.innerText()).replace(/\s+/g,' ').trim();await o.click();await attendre(250);return texte;};
 const visible=sel=>page.locator(sel).first().isVisible();
 try{
  const sauvegarde=F.sauvegardeFictive();
  const site=await F.charger(page,nav,URL_V1,{sauvegarde,pageId:'j-chiffres'});
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.onglets&&Sim.direct);
  await attendre(400);

  /* ---- 1. le menu : treize entrées, « Plan » n'y est plus ----------------------------------------------------- */
  const menu=()=>page.evaluate(()=>({espaces:[...document.querySelectorAll('#menu .menu-espace')].map(e=>[(e.querySelector('.menu-espace-titre')||{textContent:'Lire'}).textContent,[...e.querySelectorAll('[data-sous-onglet]')].map(b=>b.textContent.replace(/\d+$/,'').trim())]),
    pied:[...document.querySelectorAll('#barre .barre-pied > button')].map(b=>b.textContent.trim()),entrees:OrlyOnglets.entrees().length}));
  let m=await menu();
  assert.deepEqual(m.espaces,[['Lire',['Synthèse','En direct','Planning','Détails','Comparer']],['Vols',['Programme','Retours']],['L’unité',['Services et équipes','Chemins']],['Simulation',['Réglages','Contrôles']]]);
  assert.deepEqual(m.pied.slice(0,1),['Fichiers']);
  assert.equal(m.entrees,12,'sans programme daté : douze entrées');
  assert.equal(await page.locator('#menu [data-entree="u-plan"], #menu [data-sous-onglet="u-plan"]').count(),0,'« Plan » n’est plus une entrée');
  // Avec un programme daté, « Période » fait la treizième.
  await F.importerVols(page,nav,site.fichier,'vols-dates.csv',F.volsDatesCsv(3));
  await attendre(400);
  m=await menu();
  assert.equal(m.entrees,13,'avec un programme daté : treize entrées, contre quatorze');
  assert.deepEqual(m.espaces[0],['Lire',['Synthèse','En direct','Planning','Période','Détails','Comparer']]);
  assert.deepEqual(m.espaces[2],['L’unité',['Services et équipes','Chemins']]);
  await F.importerVols(page,nav,site.fichier,'vols-fictifs.csv',F.volsCsv());
  await attendre(300);

  /* ---- 2. « En direct » : plus de choix, toujours en relief ---------------------------------------------------- */
  await page.locator('#menu [data-entree="j-plan"]').click();await attendre(500);
  assert.deepEqual([(await ici()).sous,(await ici()).direct,(await ici()).titre],['j-plan','relief','En direct']);
  assert.equal(await page.locator('#direct-choix, [data-direct-mode]').count(),0,'le choix « En relief / À plat » n’est plus sur la page');
  assert.equal(await page.locator('#workspace button:visible, .haut button:visible').filter({hasText:/à plat/i}).count(),0,'aucun bouton ne propose « À plat »');
  assert.equal(await visible('#direct-toile'),true,'la scène en relief');
  assert.equal(await visible('#view-plan'),false,'pas le plan dessiné');
  assert.equal(await visible('#btn-edit'),false,'ni « Modifier le plan »');

  /* ---- 3. « Aller à… » ouvre la vue à plat ; l'entrée du menu ramène au relief --------------------------------- */
  assert.match(await allerA(A_PLAT),/En direct, à plat.*dans En direct/,'« Aller à… » la propose, et dit où elle est');
  assert.deepEqual([(await ici()).sous,(await ici()).direct,(await ici()).titre],['j-plan','plat',A_PLAT]);
  assert.equal(await visible('#view-plan'),true,'le plan dessiné, rejoué');
  assert.equal(await visible('#direct-toile'),false);
  assert.ok(await page.locator('#plan .zone').count()>=9,'ses zones');
  assert.match(await page.locator('#plan-bande-texte').innerText(),/commandes prêtes jusqu’ici|aucune commande/,'ses chiffres jusqu’à l’heure rejouée');
  assert.equal(await page.locator('#menu [data-entree="j-plan"]').getAttribute('aria-selected'),'true','« En direct » reste l’entrée marquée');
  // Ses anciens noms la trouvent aussi.
  await page.keyboard.press('Control+k');await page.waitForSelector('dialog.palette [role=option]');await page.keyboard.type('plan dessiné');await attendre(200);
  assert.ok((await page.locator('dialog.palette [role=option] .pal-nom').allTextContents()).includes(A_PLAT),'« plan dessiné » la trouve');
  await page.keyboard.press('Escape');await attendre(150);
  // Après une visite de la vue à plat : une autre page, puis « En direct » — en relief.
  await nav.aller(page,'j-chiffres');await attendre(200);
  await page.locator('#menu [data-entree="j-plan"]').click();await attendre(400);
  assert.deepEqual([(await ici()).sous,(await ici()).direct,(await ici()).titre],['j-plan','relief','En direct'],'après une visite de la vue à plat, « En direct » s’ouvre en relief');
  // De la vue à plat, l'entrée « En direct » ramène au relief, d'un clic.
  await allerA(A_PLAT);assert.equal((await ici()).direct,'plat');
  await page.locator('#menu [data-entree="j-plan"]').click();await attendre(400);
  assert.equal((await ici()).direct,'relief','un clic sur « En direct » ramène au relief');
  // Un lien d'un résultat vers « En direct » : en relief.
  await allerA(A_PLAT);
  await nav.aller(page,'j-chiffres');await attendre(200);
  await page.locator('#journee-chiffres [data-page=j-plan]:visible').first().click();await attendre(400);
  assert.deepEqual([(await ici()).sous,(await ici()).direct],['j-plan','relief'],'« Voir la journée en direct » : en relief');
  // Après un rechargement où la vue à plat était ouverte : en relief.
  await allerA(A_PLAT);assert.equal((await ici()).direct,'plat');
  await page.reload();await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.onglets&&Sim.direct);await attendre(500);
  await page.locator('#menu [data-entree="j-plan"]').click();await attendre(400);
  assert.deepEqual([(await ici()).sous,(await ici()).direct],['j-plan','relief'],'après un rechargement aussi');
  assert.equal(await page.evaluate(()=>{for(let i=0;i<localStorage.length;i++)if(/plat/.test(localStorage.getItem(localStorage.key(i))||'')&&/^ory-ui-|^ory-menu/.test(localStorage.key(i)))return localStorage.key(i);return null;}),null,'le choix « à plat » n’est retenu nulle part');

  /* ---- la page du plan : par « Aller à… » ---------------------------------------------------------------------- */
  assert.match(await allerA('Plan de l’unité'),/Plan de l’unité.*L’unité/);
  assert.deepEqual([(await ici()).sous,(await ici()).edition,(await ici()).titre],['u-plan',true,'Plan de l’unité'],'la page du plan s’ouvre, en modification');
  assert.equal(await visible('#view-plan'),true);
  await page.locator('#edit-done').click();await attendre(400);
  assert.equal((await ici()).edition,false);
  assert.deepEqual([(await ici()).sous,(await ici()).direct],['j-plan','relief'],'« Terminer » ramène où l’on était');
  // De la vue à plat, « Modifier le plan » y mène, et « Terminer » ramène à la vue à plat.
  await allerA(A_PLAT);
  await page.locator('#btn-edit').click();await attendre(400);
  assert.deepEqual([(await ici()).sous,(await ici()).edition],['u-plan',true]);
  await page.locator('#edit-done').click();await attendre(400);
  assert.deepEqual([(await ici()).sous,(await ici()).direct],['j-plan','plat'],'« Terminer » ramène à la vue à plat, d’où l’on venait');

  /* ---- 4. la fiche d'un service : un lien discret, en bas des « Réglages avancés » ----------------------------- */
  await nav.aller(page,'mu-services');await attendre(300);
  assert.equal(await page.locator('#menu [data-entree="mu-services"]').getAttribute('aria-selected'),'true');
  // (Le service « Montage » de l'unité fictive : son identifiant est « prepa ».)
  await page.locator('#mu-services .se-liste [data-mu-choisir=prepa]').click();await attendre(300);
  const avance=page.locator('#mu-services .se-fiche [data-mu-section=avance]');
  if(!(await avance.evaluate(d=>d.open)))await avance.locator('> summary').click();
  await attendre(200);
  assert.equal(await page.locator('#mu-services [data-mu-action=voir]').count(),0,'« Voir sur le plan » n’est plus là');
  const lien=avance.locator('[data-mu-action=plan]');
  assert.deepEqual([await lien.count(),(await lien.innerText()).trim(),await lien.evaluate(e=>e.classList.contains('lien-discret'))],[1,'Placer ce service sur le plan →',true]);
  assert.equal(await avance.evaluate(d=>d.lastElementChild.contains(d.querySelector('[data-mu-action=plan]'))),true,'tout en bas des « Réglages avancés »');
  await lien.click();await attendre(500);
  assert.deepEqual([(await ici()).sous,(await ici()).edition],['u-plan',true],'le lien ouvre la page du plan');
  assert.equal(await page.evaluate(()=>Sim.editor.selected),'prepa','sur ce service : sa zone est choisie');
  // Pendant la modification du plan, « Services et équipes » est l'entrée marquée ; le menu attend.
  assert.equal(await page.locator('#menu [data-entree="mu-services"]').getAttribute('aria-selected'),'true');
  await page.locator('#edit-done').click();await attendre(400);
  assert.equal((await ici()).sous,'mu-services','« Terminer » ramène à la fiche');

  /* ---- 5. rien ne mène à une entrée qui n'existe plus ---------------------------------------------------------- */
  const pages=await page.evaluate(()=>OrlyOnglets.entrees().flatMap(o=>o.pages||[o.id]));
  for(const id of pages){
    await nav.aller(page,id,{relief:true,panneau:false});await attendre(200);
    const vers=await page.evaluate(()=>[...document.querySelectorAll('#workspace [data-page], .haut [data-page]')].filter(e=>e.getClientRects().length).map(e=>e.dataset.page));
    assert.deepEqual(vers.filter(p=>p==='u-plan'||p==='j-plan:plat'),[],id+' : aucun lien visible vers le plan ou la vue à plat');
    assert.equal(await page.locator('#workspace button:visible').filter({hasText:/sur le plan|à plat/i}).count(),id==='mu-services'?await page.locator('#mu-services [data-mu-action=plan]:visible').count():0,id+' : aucun bouton vers le plan');
  }
  // « Liens entre services » : « Voir sur le plan » n'est plus montré.
  await nav.aller(page,'u-liens');await attendre(300);
  assert.equal(await visible('#fc-show-map'),false,'« Voir sur le plan » (les liens dessinés) n’est plus montré');
  // L'accueil : l'espace « L'unité » ne propose plus « Plan ».
  await page.locator('#btn-accueil').click();await attendre(300);
  assert.deepEqual(await page.locator('#view-accueil .acc-tuile').filter({hasText:'L’unité'}).locator('.acc-page').allTextContents(),['Services et équipes','Chemins']);
  assert.equal(await page.locator('#view-accueil [data-page="u-plan"]').count(),0);

  /* ---- 6. en lecture seule : le plan verrouillé, la vue à plat ouverte ----------------------------------------- */
  await nav.aller(page,'j-chiffres');await attendre(200);
  await page.locator('#btn-lecture-seule').click();await attendre(300);
  await page.evaluate(()=>document.querySelectorAll('#notifs .notif-fermer').forEach(b=>b.click()));
  assert.match(await allerA('Plan de l’unité'),/Paramétrage verrouillé/,'« Aller à… » dit que le plan est verrouillé');
  assert.equal((await ici()).sous,'j-chiffres','la page du plan ne s’ouvre pas');
  assert.equal(await dernierAvis(),'Paramétrage verrouillé : « Plan de l’unité » ne s’ouvre pas en lecture seule.');
  assert.doesNotMatch(await allerA(A_PLAT),/verrouillé/);
  assert.deepEqual([(await ici()).sous,(await ici()).direct],['j-plan','plat'],'la vue à plat, qui se lit, s’ouvre');
  assert.equal(await visible('#view-plan'),true);
  // Elle se lit, sans rien régler : « Modifier le plan » le dit, les stockages et « Ajouter une équipe » ne se montrent pas.
  await page.locator('#zone-picker').selectOption({index:1});await attendre(200);
  assert.equal(await visible('#service-storages'),false);
  assert.equal(await page.locator('[data-svc-action=equipe]:visible').count(),0);
  await page.evaluate(()=>document.querySelectorAll('#notifs .notif-fermer').forEach(b=>b.click()));
  await page.locator('#btn-edit').click();await attendre(200);
  assert.deepEqual([(await ici()).sous,(await ici()).edition],['j-plan',false]);
  assert.equal(await dernierAvis(),'Paramétrage verrouillé : « Plan de l’unité » ne s’ouvre pas en lecture seule.');
  await page.locator('#btn-lecture-seule').click();await attendre(300);

  /* ---- 7. une sauvegarde d'avant se restaure : ses services et son plan intacts -------------------------------- */
  const telecharger=async()=>{await nav.aller(page,'u-sauvegarde');await attendre(200);
    const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#sauvegarde-export').click()]);const f=path.join(dossier,Date.now()+'-'+d.suggestedFilename());await d.saveAs(f);return JSON.parse(fs.readFileSync(f,'utf8')).contenu;};
  const fichier=path.join(dossier,'unite-d-avant.json');fs.writeFileSync(fichier,JSON.stringify(sauvegarde));
  await nav.aller(page,'u-sauvegarde');await attendre(200);
  await page.locator('#sauvegarde-import').setInputFiles(fichier);
  const recharge=page.waitForEvent('load');await nav.repondre(page);await recharge;await page.waitForLoadState('load');
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.onglets&&Sim.editor);await attendre(500);
  const lu=await page.evaluate(()=>({plan:JSON.parse(localStorage.getItem('orly-plan-v3')),services:Sim.ateliers.a.services().map(s=>[s.id,s.nom]),zones:Sim.editor.state.zones.filter(z=>z.kind==='service').map(z=>[z.id,z.x,z.y,z.w,z.h])}));
  assert.deepEqual(lu.plan,sauvegarde.contenu['orly-plan-v3'],'le plan de la sauvegarde est rendu tel quel');
  const attendues=sauvegarde.contenu['orly-plan-v3'].zones.filter(z=>z.kind==='service');
  assert.deepEqual(lu.zones,attendues.map(z=>[z.id,z.x,z.y,z.w,z.h]),'chaque service garde sa place et sa forme');
  for(const z of attendues.filter(z=>z.visible!==false))assert.ok(lu.services.some(s=>s[0]===z.id),z.id+' : un service du plan est un service de l’unité');
  const rendue=await telecharger();
  assert.deepEqual(rendue['orly-plan-v3'],sauvegarde.contenu['orly-plan-v3'],'« Tout sauvegarder » rend le même plan');
  assert.deepEqual(rendue['orly-flows-v1'],sauvegarde.contenu['orly-flows-v1']);
  assert.deepEqual(Object.keys(rendue).sort(),Object.keys(sauvegarde.contenu).sort(),'les mêmes parties');

  assert.deepEqual(erreurs,[],'aucune erreur de page');
  await site.effacer();
  console.log('plan-hors-menu-browser : ok — le menu a treize entrées (douze sans programme daté), « Plan » n’y est plus ; « En direct » n’a plus le choix « À plat » et s’ouvre en relief, y compris après une visite de la vue à plat et après un rechargement ; « Aller à… » ouvre la vue à plat et la page du plan ; la fiche d’un service y mène par un lien discret, en bas des « Réglages avancés » ; aucun lien d’une page du menu, ni l’accueil, ni « Liens entre services », ne mène au plan ; en lecture seule, le plan reste verrouillé et la vue à plat s’ouvre ; une sauvegarde d’avant se restaure, ses services et son plan intacts.');
 }finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});

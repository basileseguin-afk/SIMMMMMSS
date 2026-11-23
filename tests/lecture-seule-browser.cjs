/* « Lecture seule » (version 1, évolution 22 f) — sur l'unité fictive, à 1 366 × 768.
 *
 * Un interrupteur en bas du menu. En marche : le bloc « Régler » se replie en « Paramétrage verrouillé » et ses pages ne
 * s'ouvrent pas ; dans « Fichiers », « Restaurer » et « Importer » sont grisés, avec la raison, et les exports marchent ;
 * les pages de résultats restent intactes ; un lien d'un résultat vers un réglage dit « Paramétrage verrouillé ».
 *
 * Ce que le test tient :
 *   - aucun réglage ne change par l'interface : tout ce qui se clique sur les pages ouvertes est cliqué, les portes des
 *     réglages sont essayées une à une ; les données du navigateur sont les mêmes, à l'octet près ;
 *   - la sauvegarde (« Tout sauvegarder ») est identique avant et après ;
 *   - l'état survit au rechargement ; c'est une préférence d'affichage (`ory-ui-…`), hors de la sauvegarde ;
 *   - à l'arrêt, tout revient.
 *
 * Évolution 23 (d) : « Contrôles » se lit en lecture seule. Ce qui change ici, et rien d'autre : la page n'est plus
 * parmi celles qui se ferment (sept, plus huit) mais parmi celles qui s'ouvrent — et dont tout ce qui se clique est
 * cliqué ; le menu a six entrées sous « Lire » (« Contrôles » à leur suite) ; le nom « Contrôles détaillés » l'ouvre.
 * Le détail de la page en lecture seule : tests/controles-lecture-seule-browser.cjs. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const MOT='Paramétrage verrouillé';
const REGLER=['v-programme','v-planche','mu-services','mu-flux','u-liens','u-plan','rg-simulation'];
const OUVERTES=['j-chiffres','j-plan','at-planning','at-repas','v-departs','j-stocks','j-details','j-comparer','mu-pas','u-sauvegarde'];

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-lecture-seule-'));
 const erreurs=[];
 const ctx=await browser.newContext({viewport:{width:1366,height:768},acceptDownloads:true});
 const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=300)=>page.waitForTimeout(ms);
 const sous=()=>page.evaluate(()=>document.body.dataset.vue==='accueil'?'accueil':document.body.dataset.sous);
 /** Les données du navigateur : toutes les clés du site, hors préférences d'affichage (celles que garde la révision). */
 const donnees=()=>page.evaluate(()=>{const cles=[];for(let i=0;i<localStorage.length;i++)cles.push(localStorage.key(i));
   return JSON.stringify(cles.filter(k=>/^(ory|orly)-/.test(k)&&k!=='ory-revision'
     &&!/^(ory-menu-pages(-vues)?|ory-service-ouvert|ory-graphes-sens|ory-demarrage-en-cours|ory-ui-.*)$/.test(k)).sort().map(k=>[k,localStorage.getItem(k)]));});
 const telecharger=async fn=>{const [d]=await Promise.all([page.waitForEvent('download'),fn()]);const f=path.join(dossier,Date.now()+'-'+d.suggestedFilename());await d.saveAs(f);return {f,nom:d.suggestedFilename()};};
 /** « Tout sauvegarder » : le contenu du fichier (sa date d'écriture mise à part). */
 const sauvegarde=async()=>{await nav.aller(page,'u-sauvegarde');await attendre(200);
   const s=JSON.parse(fs.readFileSync((await telecharger(()=>page.locator('#sauvegarde-export').click())).f,'utf8'));return JSON.stringify(s.contenu);};
 const dernierAvis=()=>page.evaluate(()=>{const n=[...document.querySelectorAll('#notifs .notif .notif-texte')];return n.length?n[n.length-1].textContent.replace(/ | /g,' '):'';});
 const fermerAvis=()=>page.evaluate(()=>document.querySelectorAll('#notifs .notif-fermer').forEach(b=>b.click()));
 const bascule=page.locator('#btn-lecture-seule');
 try{
  const site=await F.charger(page,nav,URL_V1,{pageId:'j-chiffres'});
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.onglets);
  await attendre(400);
  // À son premier rechargement, la page pose dans ses données l'effectif des équipes qu'elle calcule (c'était déjà le cas
  // avant cette évolution, lecture seule ou non) : on part de données posées, pour comparer ensuite à l'octet près.
  await page.reload();
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.onglets);
  await attendre(500);

  /* ---- 1. l'interrupteur, en bas du menu ; une préférence de ce navigateur ------------------------------------------ */
  assert.deepEqual(await page.locator('.barre-pied > button').evaluateAll(bs=>bs.map(b=>b.id)),['btn-sauvegarde','btn-lecture-seule','btn-theme'],'en bas du menu : Fichiers, Lecture seule, le thème');
  assert.deepEqual([await bascule.getAttribute('role'),await bascule.getAttribute('aria-checked'),(await bascule.innerText()).trim()],['switch','false','Lecture seule']);
  assert.equal(await page.evaluate(()=>document.body.dataset.lecture),undefined);
  const sauvegardeAvant=await sauvegarde();
  await nav.aller(page,'j-chiffres');await attendre(200);
  const avant=await donnees(),revision=await page.evaluate(()=>localStorage.getItem('ory-revision'));
  // (Le test lit bien des données : les équipes, les temps par vol, le plan, les liens.)
  for(const cle of ['ory-ateliers-v1','ory-modele-v1','orly-plan-v3','orly-flows-v1'])assert.ok(JSON.parse(avant).some(([k,v])=>k===cle&&v.length>50),cle+' est parmi les données comparées');
  const menuAvant=await page.locator('#menu').innerHTML();

  await bascule.click();await attendre(300);
  assert.deepEqual([await bascule.getAttribute('aria-checked'),await page.evaluate(()=>document.body.dataset.lecture),await page.evaluate(()=>localStorage.getItem('ory-ui-lecture-seule'))],['true','seule','1']);
  assert.match(await bascule.getAttribute('title'),/verrouillé/);
  assert.equal(await dernierAvis(),'Lecture seule : le paramétrage est verrouillé.');
  // Une préférence d'affichage : aucune donnée n'a bougé, la révision des données non plus.
  assert.equal(await donnees(),avant);
  assert.equal(await page.evaluate(()=>localStorage.getItem('ory-revision')),revision,'la bascule n’est pas une écriture de données');
  // Au clavier : c'est un bouton, Espace le bascule.
  await bascule.focus();await page.keyboard.press('Space');await attendre(150);
  assert.equal(await bascule.getAttribute('aria-checked'),'false');
  await page.keyboard.press('Space');await attendre(150);
  assert.equal(await bascule.getAttribute('aria-checked'),'true');

  /* ---- 2. le bloc « Régler » replié en « Paramétrage verrouillé » ; « Lire » et « Fichiers » intacts ---------------- */
  assert.deepEqual(await page.locator('#menu .menu-bloc').evaluateAll(bs=>bs.map(b=>[b.dataset.bloc,b.hasAttribute('data-ferme'),b.querySelectorAll('[data-sous-onglet]').length])),
    [['lire',false,6],['regler',true,0]]);
  assert.equal((await page.locator('#menu [data-bloc=regler] .menu-ferme').innerText()).trim(),MOT);
  assert.equal(await page.locator('#menu [data-bloc=regler] .menu-ferme svg').count(),1,'un cadenas');
  // (Le nom de l'entrée, sans sa pastille : « Contrôles » porte la sienne, évolution 23 d.)
  assert.deepEqual(await page.locator('#menu [data-bloc=lire] [data-sous-onglet]').evaluateAll(bs=>bs.map(b=>b.querySelector('span').textContent.trim())),['Synthèse','En direct','Planning','Détails','Comparer','Contrôles']);
  assert.ok(+(await page.locator('#menu [data-bloc=lire] [data-entree="mu-pas"] .so-badge').innerText())>=1,'« Contrôles », avec sa pastille');
  assert.equal(await page.locator('#btn-sauvegarde').isEnabled(),true);
  assert.equal(await page.evaluate(()=>{const b=document.getElementById('btn-lecture-seule').getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight;}),true,'l’interrupteur tient dans l’écran d’un portable');
  for(const sel of ['#menu .menu-ferme','#btn-lecture-seule'])assert.ok(parseFloat(await page.locator(sel).evaluate(e=>getComputedStyle(e).fontSize))>=13,sel+' : 13 px au moins');

  /* ---- 3. les pages de « Régler » ne s'ouvrent pas, par aucun chemin ------------------------------------------------ */
  for(const id of REGLER){
    await fermerAvis();
    await page.evaluate(i=>{const b=document.createElement('button');b.id='ls-lien';b.dataset.page=i;b.textContent='un lien';document.getElementById('view-title').after(b);},id);
    await page.locator('#ls-lien').click();await attendre(120);
    assert.equal(await sous(),'j-chiffres',id+' ne s’ouvre pas');
    const nom=await page.evaluate(i=>OrlyOnglets.page(i).nom,id);
    assert.equal(await dernierAvis(),MOT+' : « '+nom+' » ne s’ouvre pas en lecture seule.',id+' : la page le dit');
    assert.equal(await page.locator('#ls-lien').evaluate(e=>getComputedStyle(e,'::after').content),'" · '+MOT+'"',id+' : le lien le dit');
    await page.evaluate(()=>document.getElementById('ls-lien').remove());
  }
  // Par « Aller à… » : la page se trouve toujours, dit « Paramétrage verrouillé », et ne s'ouvre pas. De même le nom d'une page d'avant.
  for(const [nom,page0] of [['Services et équipes','Services et équipes'],['Horaires des équipes','Services et équipes'],['Chemin d’une commande','Chemins']]){
    await fermerAvis();
    await page.keyboard.press('Control+k');await page.waitForSelector('dialog.palette [role=option]');
    await page.keyboard.type(nom);await attendre(200);
    const option=page.locator('dialog.palette [role=option]').filter({has:page.locator('.pal-nom',{hasText:new RegExp('^'+nom+'$')})}).first();
    assert.match(await option.innerText(),new RegExp(MOT),nom+' : « Aller à… » dit que la page est verrouillée');
    await option.click();await attendre(150);
    assert.equal(await sous(),'j-chiffres',nom+' ne s’ouvre pas par « Aller à… »');
    assert.equal(await dernierAvis(),MOT+' : « '+page0+' » ne s’ouvre pas en lecture seule.');
  }
  // « Contrôles » se lit (évolution 23 d) : le nom d'une page d'avant qu'elle a reprise l'ouvre, sans « Paramétrage verrouillé ».
  await fermerAvis();
  await page.keyboard.press('Control+k');await page.waitForSelector('dialog.palette [role=option]');
  await page.keyboard.type('Contrôles détaillés');await attendre(200);
  const detailles=page.locator('dialog.palette [role=option]').filter({has:page.locator('.pal-nom',{hasText:/^Contrôles détaillés$/})}).first();
  assert.doesNotMatch(await detailles.innerText(),new RegExp(MOT));
  await detailles.click();await attendre(200);
  assert.equal(await sous(),'mu-pas','« Contrôles détaillés » ouvre « Contrôles »');
  assert.equal(await dernierAvis(),'','aucun refus');
  await nav.aller(page,'j-chiffres');await attendre(200);
  // Depuis l'accueil : le bloc « Régler » y est replié aussi ; « À faire ensuite » le dit.
  await page.locator('#btn-accueil').click();await attendre(300);
  assert.deepEqual(await page.locator('#view-accueil .acc-bloc').evaluateAll(bs=>bs.map(b=>[b.dataset.bloc,b.hasAttribute('data-ferme'),b.querySelectorAll('.acc-tuile').length])),[['lire',false,1],['regler',true,0]]);
  assert.equal((await page.locator('#view-accueil .acc-ferme').innerText()).trim(),MOT);
  assert.equal(await page.locator('#view-accueil [data-vers-partie]:not([data-vers-partie=resultats])').count(),0,'aucune tuile de « Régler »');
  const suite=page.locator('#view-accueil .acc-suite [data-page]');
  if(REGLER.includes(await suite.getAttribute('data-page'))){
    assert.equal(await suite.evaluate(e=>getComputedStyle(e,'::after').content),'" · '+MOT+'"');
    await suite.click();await attendre(150);assert.equal(await sous(),'accueil');
  }
  // Le plan ne se modifie pas : « Modifier le plan » le dit, et l'édition ne s'ouvre pas.
  await nav.aller(page,'j-plan');await attendre(400);await fermerAvis();
  assert.equal(await page.locator('#btn-edit').evaluate(e=>getComputedStyle(e,'::after').content),'" · '+MOT+'"');
  await page.locator('#btn-edit').click();await attendre(200);
  assert.deepEqual([await sous(),await page.evaluate(()=>document.body.classList.contains('editing'))],['j-plan',false]);
  assert.equal(await dernierAvis(),MOT+' : « Plan de l’unité » ne s’ouvre pas en lecture seule.');

  /* ---- 4. un lien d'un résultat vers un réglage dit « Paramétrage verrouillé » -------------------------------------- */
  await nav.aller(page,'j-chiffres');await attendre(300);await fermerAvis();
  const liens=page.locator('#journee-chiffres [data-page]:visible');
  const vers=await liens.evaluateAll(bs=>bs.map(b=>[b.dataset.page,getComputedStyle(b,'::after').content]));
  assert.ok(vers.some(([id])=>id==='mu-services'),'la Synthèse de l’unité fictive a un lien vers « Services et équipes »');
  for(const [id,apres] of vers)assert.equal(apres==='" · '+MOT+'"',REGLER.includes(id),id+' : le mot suit le lien vers un réglage, et lui seul');
  await page.locator('#journee-chiffres [data-page=mu-services]:visible').first().click();await attendre(150);
  assert.equal(await sous(),'j-chiffres');
  assert.equal(await dernierAvis(),MOT+' : « Services et équipes » ne s’ouvre pas en lecture seule.');
  // Un lien entre deux résultats marche comme avant.
  await page.locator('#journee-chiffres [data-page=j-plan]:visible').first().click();await attendre(300);
  assert.equal(await sous(),'j-plan');

  /* ---- 5. « Fichiers » : « Restaurer » et « Importer » grisés, avec la raison ; les exports marchent ----------------- */
  await nav.aller(page,'u-sauvegarde');await attendre(300);
  assert.equal(await page.locator('#sauvegarde-import-btn').isDisabled(),true,'« Restaurer un fichier » est grisé');
  assert.equal(await page.locator('#fi-verrou-restaurer').innerText(),'Lecture seule : paramétrage verrouillé.');
  assert.equal(await page.locator('#sauvegarde-import-btn').getAttribute('aria-describedby'),'fi-verrou-restaurer');
  const cellules=await page.locator('#fi-classeurs td[data-fi-sens=importer]').evaluateAll(tds=>tds.map(td=>({classeur:td.parentElement.dataset.classeur,
    boutons:[...td.querySelectorAll('button')].map(b=>b.disabled),champs:[...td.querySelectorAll('input')].map(i=>i.disabled),raison:(td.querySelector('.fi-verrou')||{textContent:null}).textContent,sans:!!td.querySelector('.fi-sans')})));
  for(const c of cellules){
    if(c.sans){assert.equal(c.raison,null,c.classeur+' : rien à importer, rien à dire');continue;}
    assert.ok(c.boutons.length>=1&&c.boutons.every(Boolean)&&c.champs.every(Boolean),c.classeur+' : « Importer » est grisé');
    assert.equal(c.raison,MOT,c.classeur+' : la raison est dite');
  }
  assert.deepEqual(cellules.filter(c=>!c.sans).map(c=>c.classeur),['vols','retours','equipes-chemins','horaires','equipes','temps','etude','liens']);
  // Les champs de fichier, où qu'ils soient : fermés aussi.
  for(const sel of ['#imp-vols','#sauvegarde-import','#at-import','#rc-import','#rg-recap-import','#rg-import','#fc-import'])assert.equal(await page.locator(sel).isDisabled(),true,sel);
  assert.ok(parseFloat(await page.locator('#fi-verrou-vols').evaluate(e=>getComputedStyle(e).fontSize))>=13);
  // Les exports et les classeurs vides marchent : aucun n'est grisé par la lecture seule, et chacun donne son fichier.
  const exports=page.locator('#fi-classeurs td[data-fi-sens=exporter] button, #fi-classeurs td[data-fi-sens=vide] button');
  assert.deepEqual(await exports.evaluateAll(bs=>bs.filter(b=>b.disabled).map(b=>b.id)),['fi-planche-export','fi-periode'],'seuls restent grisés ceux qui n’ont rien à exporter (la planche vide, la période non simulée)');
  for(const [id,nom] of [['at-export',/^ory-ateliers-.*\.xlsx$/],['rg-export',/^ory-bareme-.*\.xlsx$/],['exp-vols',/\.(xlsx|csv)$/],['fi-journee-json',/\.json$/],['fi-planche-vide',/^ory-planche-retour-vide\.xlsx$/]])
    assert.match((await telecharger(()=>page.locator('#'+id).click())).nom,nom,id+' : l’export marche');

  /* ---- 6. les pages de résultats restent intactes ; aucun réglage ne change par l'interface -------------------------- */
  // (a) Ce que la lecture seule retire des pages de résultats : les gestes qui changent un réglage, et eux seuls.
  await nav.aller(page,'at-repas');await attendre(300);
  assert.ok(await page.locator('#at-classes table tbody tr').count()>=12,'« Détails › Commandes » montre ses commandes');
  for(const sel of ['#at-classes .at-ajout-ouvrir','#at-etapes','#at-classes .at-ligne-actions .at-menu'])assert.equal(await page.locator(sel).first().isVisible(),false,sel+' ne se montre plus');
  await nav.aller(page,'v-departs');await attendre(300);
  assert.equal(await page.locator('[data-vh-action=brancher]:visible').count(),0);
  await nav.aller(page,'j-plan');await attendre(400);
  await page.locator('#zone-picker').selectOption({index:1});await attendre(200);
  assert.equal(await page.locator('#service-storages').isVisible(),false,'les stockages d’un service ne se règlent pas');
  assert.equal(await page.locator('#direct-disposer-btn').isVisible(),false);
  assert.equal(await page.locator('#pv-reel').evaluate(e=>e.inert),true,'le calage sur le réel attend');
  // (b) Les portes des réglages, essayées une à une : rien ne passe.
  const portes=await page.evaluate(()=>{const A=Sim.ateliers,R=Sim.reglages,a=A.state.ateliers.find(x=>x.type==='manuel'),avant=a.personnes;
    const r1=A.changer(()=>{a.personnes=avant+3;},'');const p1=A.state.ateliers.find(x=>x.id===a.id).personnes;
    const r2=R.changer(()=>{R.etat.heuresSup={...(R.etat.heuresSup||{}),actif:!((R.etat.heuresSup||{}).actif)};},'');
    const r3=A.regleDisposition?A.regleDisposition({rangees:[['prepa']]},''):null;
    return {r1,memes:p1===avant,r2,undo:A.undo.length};});
  assert.deepEqual([portes.r1,portes.memes,portes.r2],[false,true,false],'les équipes et les temps par vol ne changent pas');
  assert.equal(await dernierAvis(),MOT+' : rien ne se règle en lecture seule.');
  // Annuler et Rétablir : éteints, au bouton comme au clavier.
  assert.deepEqual([await page.locator('#btn-annuler').isDisabled(),await page.locator('#btn-retablir').isDisabled()],[true,true]);
  await page.locator('#workspace').focus();await page.keyboard.press('Control+z');await page.keyboard.press('Control+y');await attendre(150);
  // Le calage ne garde rien.
  await page.evaluate(()=>{if(Sim.calage&&Sim.calage.enregistrer)Sim.calage.enregistrer();});
  assert.equal(await donnees(),avant,'les portes essayées : les mêmes données, à l’octet près');
  // (c) Tout ce qui se clique sur les pages ouvertes est cliqué (les téléchargements sont laissés tomber).
  let passe=true,clics=0;
  page.on('download',d=>{if(passe)d.cancel().catch(()=>{});});
  const cliquables='#workspace button:not([disabled]), #workspace summary, #workspace [role=tab]';
  for(const id of [...OUVERTES,'accueil']){
    const ouvrir=async()=>{if(id==='accueil')await page.locator('#btn-accueil').click();else if(await sous()!==id)await page.evaluate(i=>Sim.onglets.choisir(i),id);await attendre(150);};
    await ouvrir();
    const zone=id==='accueil'?'#view-accueil button:not([disabled])':cliquables;
    const n=await page.locator(zone).evaluateAll(es=>es.filter(e=>e.getClientRects().length).length);
    for(let i=0;i<n;i++){
      await ouvrir();
      const fait=await page.locator(zone).evaluateAll((es,i)=>{const e=es.filter(x=>x.getClientRects().length)[i];if(!e||e.id==='pg-plein'||e.dataset.pgPlein!==undefined)return false;e.click();return true;},i);
      if(fait)clics++;
      await attendre(25);
      // Une question posée (aucune ne devrait l'être) : refusée.
      await page.evaluate(()=>{const q=document.querySelector('dialog[open]');if(q)q.close();});
    }
  }
  await attendre(600);passe=false;
  assert.ok(clics>=100,'la passe a cliqué '+clics+' boutons');
  assert.equal(await page.evaluate(()=>document.body.dataset.lecture),'seule','la lecture seule ne s’arrête que par son interrupteur');
  assert.equal(REGLER.includes(await sous()),false,'aucun clic n’a ouvert une page de « Régler »');
  assert.equal(await donnees(),avant,'aucun réglage n’a changé : les mêmes données, à l’octet près');
  assert.equal(await page.evaluate(()=>localStorage.getItem('ory-revision')),revision,'rien n’a été écrit');
  await fermerAvis();
  assert.equal(await sauvegarde(),sauvegardeAvant,'la sauvegarde est identique avant et après');

  /* ---- 7. l'état survit au rechargement ----------------------------------------------------------------------------- */
  await page.reload();
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.onglets);await attendre(500);
  assert.deepEqual([await page.evaluate(()=>document.body.dataset.lecture),await bascule.getAttribute('aria-checked'),await page.locator('#menu [data-ferme]').count(),await page.locator('#menu [data-sous-onglet]').count()],['seule','true',1,6]);
  assert.equal(REGLER.includes(await sous()),false,'la page qui s’ouvre n’est pas une page de « Régler »');
  await page.evaluate(()=>Sim.onglets.choisir('mu-services'));await attendre(150);
  assert.equal(REGLER.includes(await sous()),false);
  assert.equal(await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers[0].personnes+=1;},'')),false,'les portes sont gardées dès le rechargement');
  await nav.aller(page,'u-sauvegarde');await attendre(300);
  assert.equal(await page.locator('#sauvegarde-import-btn').isDisabled(),true);
  assert.equal(await page.locator('#at-import-btn').isDisabled(),true);
  assert.equal(await donnees(),avant,'après le rechargement : les mêmes données');
  // Hors de la sauvegarde : le fichier ne porte pas la préférence.
  assert.equal(sauvegardeAvant.includes('lecture'),false);
  assert.equal((await sauvegarde()).includes('ory-ui-'),false);

  /* ---- 8. à l'arrêt, tout revient ----------------------------------------------------------------------------------- */
  await fermerAvis();
  await bascule.click();await attendre(300);
  assert.deepEqual([await bascule.getAttribute('aria-checked'),await page.evaluate(()=>document.body.dataset.lecture),await page.evaluate(()=>localStorage.getItem('ory-ui-lecture-seule'))],['false',undefined,null]);
  assert.equal(await dernierAvis(),'Lecture seule arrêtée : le paramétrage se règle de nouveau.');
  assert.equal(await page.locator('#sauvegarde-import-btn').isEnabled(),true);
  assert.equal(await page.locator('#fi-classeurs .fi-verrou, #fi-verrou-restaurer').count(),0,'plus de raison');
  assert.deepEqual(await page.locator('#fi-classeurs td[data-fi-sens=importer] button').evaluateAll(bs=>bs.filter(b=>b.disabled).map(b=>b.id)),[]);
  for(const sel of ['#imp-vols','#sauvegarde-import','#at-import','#fc-import'])assert.equal(await page.locator(sel).isDisabled(),false,sel);
  await nav.aller(page,'j-chiffres');await attendre(300);
  assert.equal(await page.locator('#menu').innerHTML(),menuAvant,'le menu d’avant, à l’octet près');
  assert.equal(await page.locator('#journee-chiffres [data-page=mu-services]:visible').first().evaluate(e=>getComputedStyle(e,'::after').content),'none');
  for(const id of REGLER.filter(i=>i!=='u-plan')){await page.evaluate(i=>Sim.onglets.choisir(i),id);await attendre(150);assert.equal(await sous(),id,id+' s’ouvre de nouveau');}
  await nav.aller(page,'at-repas');await attendre(300);
  assert.equal(await page.locator('#at-classes .at-ajout-ouvrir').isVisible(),true);
  assert.equal(await page.locator('#at-etapes').isVisible(),true);
  assert.equal(await page.locator('#pv-reel').evaluate(e=>e.inert),false);
  // Un réglage change de nouveau, et se défait.
  const id0=await page.evaluate(()=>Sim.ateliers.state.ateliers.find(x=>x.type==='manuel').id);
  assert.equal(await page.evaluate(i=>Sim.ateliers.changer(()=>{const a=Sim.ateliers.state.ateliers.find(x=>x.id===i);a.nom=a.nom+' bis';},'Une équipe renommée, pour le test.'),id0),true);
  assert.notEqual(await donnees(),avant);
  await nav.aller(page,'mu-services');await attendre(300);
  assert.equal(await page.locator('#btn-annuler').isEnabled(),true);

  assert.deepEqual(erreurs,[],'aucune erreur de page');
  await site.effacer();
  console.log('lecture-seule-browser : ok — l’interrupteur en bas du menu (une préférence « ory-ui-… », hors des données) ; « Régler » replié en « Paramétrage verrouillé », au menu et sur l’accueil ; ses sept pages ne s’ouvrent par aucun chemin (lien, « Aller à… », nom d’une page d’avant, « Modifier le plan ») et la page le dit ; « Contrôles » se lit, sous « Lire » ; un lien d’un résultat vers un réglage le dit ; « Fichiers » : « Restaurer » et les « Importer » grisés avec la raison, les exports marchent ; '+clics+' boutons cliqués sur les pages ouvertes, les portes des réglages essayées : les mêmes données à l’octet près, la même sauvegarde ; l’état survit au rechargement ; à l’arrêt, tout revient.');
 }finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});

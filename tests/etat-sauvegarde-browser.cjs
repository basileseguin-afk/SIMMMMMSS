/* Correction 24 (b) — ne pas perdre son travail (version 1), sur l'unité fictive et un programme daté fictif, à
 * 1 366 × 768. Le constat : tout vit dans le navigateur, rien ne prévient à la fermeture.
 *   1. Une première visite : « Jamais sauvegardé », point ocre ; rien à perdre, donc pas d'écouteur de fermeture, et
 *      pas de question au rechargement.
 *   2. Une sauvegarde restaurée : « Sauvegardé à HH:MM », point vert ; le rechargement que l'outil fait lui-même ne pose
 *      pas de question. Importer des vols, changer de journée, ouvrir des pages : toujours sauvegardé (ce que le calcul
 *      écrit de lui-même dans les équipes n'est pas un réglage).
 *   3. Une préférence d'affichage (le thème, une section repliée, un service ouvert) ne change pas l'état.
 *   4. Un réglage changé : « Non sauvegardé depuis HH:MM », point ocre ; l'écouteur de fermeture est posé ; le
 *      navigateur pose sa question au rechargement, et l'état lui survit. En lecture seule, pas d'écouteur.
 *   5. « Tout sauvegarder » par la barre du haut, sans changer de page, puis par « Fichiers » : « Sauvegardé »,
 *      l'écouteur est retiré, plus de question. Les deux fichiers sont les mêmes, octet pour octet à la date près.
 *   6. Sous un navigateur piloté (les tests), l'écouteur n'est jamais posé : aucune question ne bloque un test.
 *   7. La page de secours rend les mêmes entrées que « Tout sauvegarder », les neuf ; le site sait ensuite que c'est fait.
 *   8. Le bouton : son mot reste à 1 100 px de large (seule l'heure se retire) ; 13 px au moins, 24 px de haut au moins,
 *      4,5:1 pour le mot et 3:1 pour le point, dans les deux thèmes ; la fenêtre ne défile pas.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href,URL_SECOURS=pathToFileURL(path.resolve(__dirname,'../secours.html')).href;
const CSV=F.volsDatesCsv(3,'2031-03-03');
const NEUF=['orly-plan-v3','ory-ateliers-v1','orly-flows-v1','ory-modele-v1','ory-graphes-v1','ory-calage-v1','ory-import-winrest-v1','ory-seuils-v1','ory-couleurs-compagnies-v1'];
const lum=c=>{const [r,g,b]=(c.match(/[\d.]+/g)||[]).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});return 0.2126*r+0.7152*g+0.0722*b;};
const contraste=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05);};

/** Dans la page : ce que la barre du haut dit, ce que le module sait, et le nombre d'écouteurs de fermeture posés. */
const ETAT=()=>{const b=document.getElementById('etat-sauvegarde'),e=OrlyEtatSauvegarde.lireEtat();
  return {etat:b.dataset.etat,texte:b.textContent,titre:b.title,reste:e.reste,ecoute:e.ecoute,poses:window.__fermeture,page:document.body.dataset.sous||document.body.dataset.vue};};
/** Dans la page : l'allure du bouton. */
const ALLURE=()=>{const b=document.getElementById('etat-sauvegarde'),c=getComputedStyle(b),p=getComputedStyle(b.querySelector('.sauve-point')),r=b.getBoundingClientRect();
  const jeton=n=>{const s=document.createElement('span');s.style.color='var('+n+')';document.body.append(s);const v=getComputedStyle(s).color;s.remove();return v;};
  const haut=document.querySelector('.haut');
  return {texte:c.color,taille:parseFloat(c.fontSize),hauteur:Math.round(r.height),point:p.backgroundColor,fond:getComputedStyle(haut).backgroundColor,
    ok:jeton('--ds-ok'),ocre:jeton('--ds-attente'),lu:b.innerText,defile:document.documentElement.scrollWidth>innerWidth,deborde:haut.scrollWidth>haut.clientWidth,
    dansLaBarre:r.left>=haut.getBoundingClientRect().left&&r.right<=haut.getBoundingClientRect().right};};
const HEURE='\\d\\d:\\d\\d';

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[],dossiers=[];
 /** Un navigateur : `humain` cache à la page qu'elle est pilotée, pour que la question se pose comme chez l'utilisateur. */
 const ouvrir=async humain=>{
  const ctx=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce',acceptDownloads:true});
  await ctx.addInitScript(humain=>{
   if(humain)Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true});
   window.__fermeture=0;const poser=window.addEventListener,oter=window.removeEventListener;
   window.addEventListener=function(t){if(t==='beforeunload')window.__fermeture++;return poser.apply(this,arguments);};
   window.removeEventListener=function(t){if(t==='beforeunload')window.__fermeture--;return oter.apply(this,arguments);};
  },humain);
  const page=await ctx.newPage(),questions=[];
  page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>{questions.push(d.type());d.accept();});
  return {ctx,page,questions};
 };
 const lire=page=>page.evaluate(ETAT);
 const pret=async page=>{await nav.pret(page);await page.waitForFunction(()=>window.OrlyEtatSauvegarde&&window.Sim&&Sim.ateliers&&Sim.ateliers.resultat);};
 /** Un geste d'utilisateur (un vrai clic), sans lequel le navigateur ne pose pas sa question ; puis recharger. */
 const recharger=async(page,questions)=>{await page.locator('#view-title').click();questions.length=0;await page.reload();await pret(page);return questions.slice();};
 const regler=page=>page.evaluate(()=>{const e=Sim.ateliers.state.ateliers.find(a=>a.id==='pr');Sim.ateliers.changer(()=>{e.personnes+=1;},'essai');});
 const telecharger=async(page,sel)=>{const dl=page.waitForEvent('download');await page.locator(sel).click();const d=await dl;return {nom:d.suggestedFilename(),texte:fs.readFileSync(await d.path(),'utf8')};};
 try{
  // ---- 1. Une première visite.
  const H=await ouvrir(true),page=H.page;
  await page.goto(URL_V1);await pret(page);
  let e=await lire(page);
  assert.deepEqual([e.etat,e.texte,e.reste,e.ecoute,e.poses],['jamais','Jamais sauvegardé',false,false,0],'première visite : '+JSON.stringify(e));
  assert.match(e.titre,/ne vit que dans ce navigateur.*Cliquer pour tout sauvegarder/,'l’infobulle dit le geste');
  assert.deepEqual(await recharger(page,H.questions),[],'rien à perdre : pas de question au rechargement');
  e=await lire(page);assert.deepEqual([e.etat,e.reste,e.poses],['jamais',false,0],'rechargée, la première visite reste sans changement');
  const allure={};
  allure.jamais=await page.evaluate(ALLURE);

  // ---- 2. Une sauvegarde restaurée, des vols importés.
  H.questions.length=0;
  const site=await F.charger(page,nav,URL_V1,{csv:CSV,pageId:'j-chiffres'});dossiers.push(site);
  await pret(page);
  assert.deepEqual(H.questions,[],'restaurer recharge la page sans question, importer des vols non plus');
  e=await lire(page);
  assert.match(e.texte,new RegExp('^Sauvegardé à '+HEURE+'$'),'restaurée : '+e.texte);
  assert.deepEqual([e.etat,e.reste,e.ecoute,e.poses],['sauvegarde',false,false,0],'restaurée, vols importés : rien à sauvegarder — '+JSON.stringify(e));
  assert.match(e.titre,/^Restauré d’un fichier à /,'l’infobulle dit la restauration');
  const sauve=e.texte;
  await page.locator('#periode-jour').selectOption({index:1});await page.waitForFunction(()=>Sim.jourVols==='2031-03-04');
  for(const id of ['at-planning','at-repas','j-plan','mu-services','j-chiffres'])await nav.aller(page,id);
  e=await lire(page);assert.deepEqual([e.texte,e.reste,e.poses],[sauve,false,0],'un autre jour, des pages ouvertes : toujours sauvegardé');

  // ---- 3. Une préférence d'affichage ne change pas l'état.
  await page.locator('#btn-theme').click();await page.waitForFunction(()=>document.documentElement.dataset.theme==='sombre');
  await page.locator('#workspace details:not([open]) > summary:visible').first().click();
  await nav.aller(page,'mu-services');await page.evaluate(()=>Sim.unite.ouvrir('cuisine'));
  e=await lire(page);assert.deepEqual([e.texte,e.reste,e.poses],[sauve,false,0],'thème, section, service ouvert : des préférences');
  allure.sauvegardeSombre=await page.evaluate(ALLURE);
  await page.locator('#btn-theme').click();await page.waitForFunction(()=>document.documentElement.dataset.theme!=='sombre');
  allure.sauvegarde=await page.evaluate(ALLURE);
  await nav.aller(page,'j-chiffres');

  // ---- 4. Un réglage changé.
  await regler(page);
  e=await lire(page);
  assert.equal(e.texte,sauve.replace('Sauvegardé à ','Non sauvegardé depuis '),'un réglage : « Non sauvegardé depuis » l’heure de la sauvegarde');
  assert.deepEqual([e.etat,e.reste,e.ecoute,e.poses],['non-sauvegarde',true,true,1],'il reste un changement : l’écouteur de fermeture est posé — '+JSON.stringify(e));
  assert.match(e.titre,/Premier changement à \d\d:\d\d\./,'l’infobulle dit depuis quand');
  await regler(page);e=await lire(page);assert.equal(e.poses,1,'un second réglage ne pose pas un second écouteur');
  allure.non=await page.evaluate(ALLURE);
  assert.deepEqual(await recharger(page,H.questions),['beforeunload'],'le navigateur pose sa question au rechargement');
  e=await lire(page);
  assert.deepEqual([e.etat,e.reste,e.ecoute,e.poses],['non-sauvegarde',true,true,1],'rechargée : le changement attend toujours — '+JSON.stringify(e));
  // En lecture seule, pas de question.
  await page.locator('#btn-lecture-seule').click();await page.waitForFunction(()=>document.body.dataset.lecture==='seule');
  await page.waitForFunction(()=>window.__fermeture===0);
  e=await lire(page);assert.deepEqual([e.etat,e.reste,e.ecoute],['non-sauvegarde',true,false],'lecture seule : l’état se dit, l’écouteur est retiré');
  assert.deepEqual(await recharger(page,H.questions),[],'lecture seule : pas de question au rechargement');
  e=await lire(page);assert.equal(e.poses,0,'rechargée en lecture seule : toujours pas d’écouteur');
  await page.locator('#btn-lecture-seule').click();await page.waitForFunction(()=>document.body.dataset.lecture!=='seule'&&window.__fermeture===1);

  // ---- 5. « Tout sauvegarder » : par la barre du haut, sans changer de page ; puis par « Fichiers ».
  await nav.aller(page,'at-planning');
  const parLaBarre=await telecharger(page,'#etat-sauvegarde');
  e=await lire(page);
  assert.match(e.texte,new RegExp('^Sauvegardé à '+HEURE+'$'),'sauvegardé par la barre : '+e.texte);
  assert.deepEqual([e.etat,e.reste,e.ecoute,e.poses,e.page],['sauvegarde',false,false,0,'at-planning'],'par la barre du haut : sauvegardé, écouteur retiré, la page n’a pas changé');
  assert.match(e.titre,/^Tout est dans le fichier téléchargé à /);
  assert.deepEqual(await recharger(page,H.questions),[],'sauvegardé : plus de question');
  await regler(page);e=await lire(page);assert.deepEqual([e.etat,e.poses],['non-sauvegarde',1],'un réglage de plus : non sauvegardé');
  await nav.aller(page,'u-sauvegarde');
  const parFichiers=await telecharger(page,'#sauvegarde-export');
  e=await lire(page);assert.deepEqual([e.etat,e.reste,e.poses],['sauvegarde',false,0],'par « Fichiers » : sauvegardé, écouteur retiré');
  const encore=await telecharger(page,'#etat-sauvegarde');
  const sansDate=t=>t.replace(/^  "date": "[^"]+",$/m,'  "date": "…",');
  assert.notEqual(sansDate(parFichiers.texte),parFichiers.texte,'la sauvegarde porte sa date');
  assert.equal(sansDate(encore.texte),sansDate(parFichiers.texte),'la barre du haut et « Fichiers » rendent le même fichier, octet pour octet à la date près');
  assert.equal(encore.nom,parFichiers.nom,'et le même nom de fichier');
  assert.notEqual(sansDate(parLaBarre.texte),sansDate(encore.texte),'entre les deux, un réglage avait changé : le fichier le porte');
  assert.match(await page.locator('#sauvegarde-date').textContent(),/^Dernière sauvegarde faite depuis ce navigateur : le /,'« Fichiers » dit toujours la date de la dernière sauvegarde');

  // ---- 8. Le bouton (avant la page de secours) : lisible, à sa place, dans les deux thèmes.
  await nav.aller(page,'j-chiffres');
  await regler(page);allure.non=await page.evaluate(ALLURE);
  await page.locator('#btn-theme').click();await page.waitForFunction(()=>document.documentElement.dataset.theme==='sombre');
  allure.nonSombre=await page.evaluate(ALLURE);
  await page.setViewportSize({width:1100,height:768});
  const etroit=await page.evaluate(ALLURE);
  assert.equal(etroit.lu,'Non sauvegardé','à 1 100 px, le mot reste : seule l’heure se retire — « '+etroit.lu+' »');
  assert.deepEqual([etroit.deborde,etroit.dansLaBarre],[false,true],'à 1 100 px, la barre du haut ne déborde pas');
  await page.setViewportSize({width:1366,height:768});
  await page.locator('#btn-theme').click();await page.waitForFunction(()=>document.documentElement.dataset.theme!=='sombre');
  for(const [nom,a] of Object.entries(allure)){
   assert.ok(a.taille>=13,nom+' : 13 px au moins ('+a.taille+')');
   assert.ok(a.hauteur>=24,nom+' : 24 px de haut au moins ('+a.hauteur+')');
   assert.ok(contraste(a.texte,a.fond)>=4.5,nom+' : le mot à 4,5:1 sur la barre ('+contraste(a.texte,a.fond).toFixed(2)+')');
   assert.ok(contraste(a.point,a.fond)>=3,nom+' : le point à 3:1 sur la barre ('+contraste(a.point,a.fond).toFixed(2)+')');
   assert.equal(a.point,/^sauvegarde/.test(nom)?a.ok:a.ocre,nom+' : point '+(/^sauvegarde/.test(nom)?'vert':'ocre'));
   assert.deepEqual([a.defile,a.deborde,a.dansLaBarre],[false,false,true],nom+' : la fenêtre ne défile pas, le bouton tient dans la barre');
  }
  assert.match(allure.non.lu,new RegExp('^Non sauvegardé depuis '+HEURE+'$'));assert.equal(allure.jamais.lu,'Jamais sauvegardé');
  assert.notEqual(allure.sauvegarde.lu.split(' ')[0],allure.non.lu.split(' ')[0],'l’état se dit par le mot, pas par la couleur seule');

  // ---- 7. La page de secours : les mêmes entrées que « Tout sauvegarder », les neuf.
  await page.evaluate(()=>{Sim.winrest.enregistrer(Sim.winrest.regles().regles);Sim.seuils.enregistrer(Sim.seuils.lire().seuils);OrlyPastilles.choisirCouleur('EST',3);
    for(const k of ['ory-graphes-v1','ory-calage-v1'])if(!localStorage.getItem(k))localStorage.setItem(k,'{}');});
  e=await lire(page);assert.deepEqual([e.etat,e.reste],['non-sauvegarde',true],'des règles, des seuils, une couleur : des changements à sauvegarder');
  const complet=JSON.parse((await telecharger(page,'#etat-sauvegarde')).texte);
  assert.deepEqual(Object.keys(complet.contenu),NEUF,'« Tout sauvegarder » rend les neuf entrées');
  await regler(page);e=await lire(page);assert.equal(e.etat,'non-sauvegarde');
  H.questions.length=0;await page.locator('#view-title').click();
  await page.goto(URL_SECOURS);await page.waitForSelector('#telecharger');
  assert.deepEqual(H.questions,['beforeunload'],'quitter le site avec un changement en attente : la question');
  const secours=JSON.parse((await telecharger(page,'#telecharger')).texte);
  assert.deepEqual(Object.keys(secours.contenu),NEUF,'la page de secours rend les neuf entrées, dans le même ordre');
  assert.deepEqual([secours.schema,secours.version],[complet.schema,complet.version]);
  for(const k of NEUF.filter(k=>k!=='ory-ateliers-v1'))assert.deepEqual(secours.contenu[k],complet.contenu[k],'la même entrée « '+k+' »');
  assert.match(await page.locator('#etat').textContent(),/^9 parties téléchargées\.$/);
  await page.goto(URL_V1);await pret(page);
  e=await lire(page);
  assert.deepEqual([e.etat,e.reste,e.poses],['sauvegarde',false,0],'de retour sur le site : il sait que tout est sauvegardé — '+JSON.stringify(e));
  await H.ctx.close();

  // ---- 6. Sous un navigateur piloté : jamais d'écouteur, jamais de question.
  const P=await ouvrir(false),robot=P.page;
  const site2=await F.charger(robot,nav,URL_V1,{csv:CSV,pageId:'j-chiffres'});dossiers.push(site2);
  await pret(robot);await regler(robot);
  e=await lire(robot);
  assert.deepEqual([e.etat,e.reste,e.ecoute,e.poses],['non-sauvegarde',true,false,0],'piloté : l’état se dit, mais l’écouteur n’est pas posé — '+JSON.stringify(e));
  assert.deepEqual(await recharger(robot,P.questions),[],'piloté : aucune question au rechargement');
  e=await lire(robot);assert.deepEqual([e.etat,e.poses],['non-sauvegarde',0]);
  await P.ctx.close();

  assert.deepEqual(erreurs,[],'aucune erreur de script : '+erreurs.join(' | '));
  console.log('OK etat-sauvegarde : première visite « Jamais sauvegardé » sans rien à perdre ; restaurée « Sauvegardé à HH:MM », et le reste après un import de vols, un autre jour, des pages ouvertes, un thème, une section ; un réglage → « Non sauvegardé depuis HH:MM », l’écouteur de fermeture posé une fois, la question du navigateur au rechargement et en quittant le site, pas en lecture seule ; « Tout sauvegarder » par la barre du haut (sans changer de page) et par « Fichiers » → « Sauvegardé », écouteur retiré, même fichier à la date près ; piloté, jamais d’écouteur ; la page de secours rend les neuf entrées ; le bouton lisible dans les deux thèmes et à 1 100 px');
 }finally{for(const s of dossiers)s.effacer();await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

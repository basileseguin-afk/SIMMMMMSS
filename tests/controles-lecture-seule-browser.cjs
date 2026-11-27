/* Évolution 23 (d) — « Contrôles » lisible en lecture seule ; sur l'unité fictive, à 1 366 × 768.
 *
 * Celui qui lit les résultats doit savoir s'il reste des points à corriger. En lecture seule :
 *   1. « Contrôles » reste dans le menu, sous « Lire », avec sa pastille (le même nombre) ; « Régler » est replié ;
 *   2. la page s'ouvre — par le menu, par « Aller à… », par un lien, par l'accueil — et se lit en entier : les mêmes
 *      points, les mêmes textes, sans faire défiler la fenêtre ;
 *   3. ses boutons « Régler dans… » et « C'est voulu » sont grisés, avec leur raison (« Paramétrage verrouillé ») ;
 *      « Voir dans Synthèse », qui mène à un résultat, marche ;
 *   4. aucun de ses boutons ne change un réglage : tous sont cliqués, les grisés aussi (de force) ; les données du
 *      navigateur sont les mêmes à l'octet près, et la sauvegarde est identique avant et après ;
 *   5. hors lecture seule, rien ne change : avant de la mettre en marche, et après l'avoir arrêtée.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const MOT='Paramétrage verrouillé';
const C='#mu-pas';

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-controles-lecture-'));
 const erreurs=[];
 const ctx=await browser.newContext({viewport:{width:1366,height:768},acceptDownloads:true});
 const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=300)=>page.waitForTimeout(ms);
 const sous=()=>page.evaluate(()=>document.body.dataset.vue==='accueil'?'accueil':document.body.dataset.sous);
 /** Les données du navigateur : toutes les clés du site, hors préférences d'affichage (celles que garde la révision). */
 const donnees=()=>page.evaluate(()=>{const cles=[];for(let i=0;i<localStorage.length;i++)cles.push(localStorage.key(i));
   return JSON.stringify(cles.filter(k=>/^(ory|orly)-/.test(k)&&k!=='ory-revision'
     &&!/^(ory-menu-pages(-vues)?|ory-service-ouvert|ory-graphes-sens|ory-demarrage-en-cours|ory-ui-.*)$/.test(k)).sort().map(k=>[k,localStorage.getItem(k)]));});
 const telecharger=async fn=>{const [d]=await Promise.all([page.waitForEvent('download'),fn()]);const f=path.join(dossier,Date.now()+'-'+d.suggestedFilename());await d.saveAs(f);return f;};
 /** « Tout sauvegarder » : le contenu du fichier (sa date d'écriture mise à part). */
 const sauvegarde=async()=>{await nav.aller(page,'u-sauvegarde');await attendre(200);
   return JSON.stringify(JSON.parse(fs.readFileSync(await telecharger(()=>page.locator('#sauvegarde-export').click()),'utf8')).contenu);};
 const dernierAvis=()=>page.evaluate(()=>{const n=[...document.querySelectorAll('#notifs .notif .notif-texte')];return n.length?n[n.length-1].textContent.replace(/ | /g,' '):'';});
 const fermerAvis=()=>page.evaluate(()=>document.querySelectorAll('#notifs .notif-fermer').forEach(b=>b.click()));
 /** La page, telle qu'elle se lit : la ligne d'état, puis chaque point (son niveau, son titre, son détail, ses boutons). */
 const lire=()=>page.evaluate(sel=>{const box=document.querySelector(sel);
   return {etat:box.querySelector('.ct-calcul').textContent.trim(),colonnes:[...box.querySelectorAll('[data-ct-niveau]')].map(c=>[c.dataset.ctNiveau,c.querySelector('h3 .ct-n').textContent,c.querySelector('.ct-dit').textContent]),
     points:[...box.querySelectorAll('.ct-point')].map(p=>({niveau:p.closest('[data-ct-niveau]').dataset.ctNiveau,titre:p.querySelector('.ct-corps>b').textContent,detail:(p.querySelector('.ct-corps>span')||{textContent:''}).textContent,
       boutons:[...p.querySelectorAll('button')].map(b=>b.textContent.trim())}))};},C);
 /** Les boutons des points : où ils mènent, s'ils sont grisés, leur raison. */
 const boutons=()=>page.evaluate(sel=>[...document.querySelectorAll(sel+' .ct-point button')].map(b=>{const r=b.getAttribute('aria-describedby'),n=r?document.getElementById(r):null;
   return {texte:b.textContent.trim(),page:b.dataset.ctPage||null,voulu:b.dataset.ctVoulu||null,gris:b.disabled,raison:n?n.textContent:null,
     raisonVue:!!n&&(n.getClientRects().length>0||!!n.closest('details:not([open])')),taille:n?parseFloat(getComputedStyle(n).fontSize):null,memePoint:!!n&&n.closest('.ct-point')===b.closest('.ct-point')};}),C);
 const pastille=()=>page.evaluate(()=>{const b=document.querySelector('#menu [data-entree="mu-pas"] .so-badge');return b?[b.textContent,b.title,b.closest('[data-bloc]').dataset.bloc]:null;});
 const menu=()=>page.locator('#menu .menu-bloc').evaluateAll(bs=>bs.map(b=>[b.dataset.bloc,b.hasAttribute('data-ferme'),[...b.querySelectorAll('[data-sous-onglet]')].map(e=>e.querySelector('span').textContent)]));
 const tete=()=>page.evaluate(()=>{const a=document.getElementById('ariane-partie');return [document.getElementById('tete-partie').textContent,document.getElementById('tete-titre').textContent,a.textContent,a.dataset.page];});
 const bascule=page.locator('#btn-lecture-seule');
 try{
  const site=await F.charger(page,nav,URL_V1,{pageId:'j-chiffres'});
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.onglets);
  await attendre(400);
  // Des compagnies qu'aucun handling ne charge : autant de points « à corriger », chacun avec « C'est voulu ».
  const handling=await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.type==='handling').id);
  await page.evaluate(id=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id===id).compagnies=['NORD'];},''),handling);
  await page.waitForFunction(()=>(Sim.ateliers.resultat.anomalies||[]).filter(a=>a.code==='handling-sans').length>=2);
  // À son premier rechargement, la page pose dans ses données l'effectif des équipes qu'elle calcule (déjà le cas avant
  // cette évolution, lecture seule ou non) : on part de données posées, pour comparer ensuite à l'octet près.
  await page.reload();
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.onglets);
  await attendre(500);
  const sauvegardeAvant=await sauvegarde();

  /* ---- hors lecture seule : la page d'avant ------------------------------------------------------------------------ */
  await nav.aller(page,'mu-pas');await attendre(400);
  const avant=await donnees(),revision=await page.evaluate(()=>localStorage.getItem('ory-revision'));
  assert.ok(JSON.parse(avant).some(([k,v])=>k==='ory-ateliers-v1'&&v.length>50),'le test lit bien des données');
  const pageAvant=await lire(),boutonsAvant=await boutons(),pastilleAvant=await pastille(),menuAvant=await page.locator('#menu').innerHTML();
  assert.ok(pageAvant.points.length>=10,'l’unité fictive a des points dans chaque colonne : '+pageAvant.points.length);
  assert.deepEqual(pageAvant.colonnes.map(c=>c[0]),['bloquant','corriger','information']);
  for(const c of pageAvant.colonnes)assert.ok(+c[1]>=1,c[0]+' : au moins un point');
  const voulus=boutonsAvant.filter(b=>b.voulu).length;
  assert.ok(voulus>=2,'des « C’est voulu » : '+voulus);
  assert.ok(boutonsAvant.some(b=>b.page==='mu-services')&&boutonsAvant.some(b=>b.page==='mu-flux')&&boutonsAvant.some(b=>b.page==='j-chiffres'),'des boutons vers « Services et équipes », « Chemins » et la Synthèse');
  assert.deepEqual(boutonsAvant.filter(b=>b.gris||b.raison!==null),[],'hors lecture seule : aucun bouton grisé, aucune raison');
  assert.equal(await page.locator(C+' .ct-raison').count(),0);
  assert.deepEqual(await menu(),[['lire',false,['Synthèse','En direct','Planning','Détails','Comparer']],['regler',false,['Commandes','Programme','Retours','Services et équipes','Chemins','Réglages','Contrôles']]]);
  assert.equal(pastilleAvant[2],'regler');
  assert.deepEqual(await tete(),['Simulation','Contrôles','Simulation','rg-simulation']);

  /* ---- 1. en lecture seule : « Contrôles » reste au menu, sous « Lire », avec sa pastille -------------------------- */
  await bascule.click();await attendre(400);
  assert.deepEqual([await page.evaluate(()=>document.body.dataset.lecture),await sous()],['seule','mu-pas'],'la page ouverte reste ouverte');
  assert.deepEqual(await menu(),[['lire',false,['Synthèse','En direct','Planning','Détails','Comparer','Contrôles']],['regler',true,[]]]);
  assert.equal((await page.locator('#menu [data-bloc=regler] .menu-ferme').innerText()).trim(),MOT);
  assert.deepEqual(await pastille(),[pastilleAvant[0],pastilleAvant[1],'lire'],'sa pastille : le même nombre, le même détail');
  assert.ok(+pastilleAvant[0]>=9,'elle compte les points bloquants et à corriger : '+pastilleAvant[0]);
  assert.deepEqual(await page.locator('#menu [data-entree="mu-pas"]').evaluate(e=>[e.classList.contains('actif'),e.getAttribute('aria-selected'),e.disabled]),[true,'true',false],'son entrée est marquée');
  // Le fil d'Ariane et le surtitre suivent le menu : « Lire », qui mène à la Synthèse.
  assert.deepEqual(await tete(),['Lire','Contrôles','Lire','j-chiffres']);
  assert.equal(await page.locator('#ariane-partie').evaluate(e=>getComputedStyle(e,'::after').content),'none','le fil d’Ariane ne dit pas « Paramétrage verrouillé »');

  /* ---- 2. la page se lit en entier ----------------------------------------------------------------------------------- */
  assert.deepEqual(await lire(),pageAvant,'les mêmes points, les mêmes textes, les mêmes boutons qu’avant');
  assert.equal(await page.evaluate(()=>document.scrollingElement.scrollHeight<=innerHeight+1),true,'la page ne fait pas défiler la fenêtre');
  assert.equal(await page.locator(C+' .ct-synthese').isEnabled(),true);
  // Elle s'ouvre par chaque porte : le menu, « Aller à… », un lien, l'accueil.
  await fermerAvis();
  await nav.aller(page,'j-chiffres');await attendre(200);
  await page.locator('#menu [data-entree="mu-pas"]').click();await attendre(300);
  assert.equal(await sous(),'mu-pas','par le menu');
  await nav.aller(page,'j-chiffres');await attendre(200);
  await page.keyboard.press('Control+k');await page.waitForSelector('dialog.palette [role=option]');
  await page.keyboard.type('Contrôles');await attendre(200);
  const option=page.locator('dialog.palette [role=option]').filter({has:page.locator('.pal-nom',{hasText:/^Contrôles$/})}).first();
  assert.doesNotMatch(await option.innerText(),new RegExp(MOT));
  assert.match(await option.innerText(),/Lire/,'« Aller à… » la range sous « Lire »');
  await option.click();await attendre(300);
  assert.equal(await sous(),'mu-pas','par « Aller à… »');
  await nav.aller(page,'j-chiffres');await attendre(200);
  await page.evaluate(()=>{const b=document.createElement('button');b.id='cl-lien';b.dataset.page='mu-pas';b.textContent='un lien';document.getElementById('view-title').after(b);});
  assert.equal(await page.locator('#cl-lien').evaluate(e=>getComputedStyle(e,'::after').content),'none','un lien vers « Contrôles » ne dit pas « Paramétrage verrouillé »');
  await page.locator('#cl-lien').click();await attendre(300);
  assert.equal(await sous(),'mu-pas','par un lien');
  await page.evaluate(()=>document.getElementById('cl-lien').remove());
  await page.locator('#btn-accueil').click();await attendre(300);
  assert.deepEqual(await page.locator('#view-accueil .acc-bloc').evaluateAll(bs=>bs.map(b=>[b.dataset.bloc,b.hasAttribute('data-ferme'),[...b.querySelectorAll('.acc-page')].map(e=>e.textContent)])),
    [['lire',false,['Synthèse','En direct','Planning','Détails','Comparer','Contrôles']],['regler',true,[]]],'l’accueil suit le menu');
  await page.locator('#view-accueil .acc-page[data-page="mu-pas"]').click();await attendre(300);
  assert.equal(await sous(),'mu-pas','par l’accueil');
  assert.equal(await dernierAvis(),'','aucun refus');

  /* ---- 3. « Régler dans… » et « C'est voulu » grisés, avec leur raison ; « Voir dans Synthèse » marche -------------- */
  const etat=await boutons();
  assert.deepEqual(etat.map(b=>b.texte),boutonsAvant.map(b=>b.texte));
  for(const b of etat){
    const regle=!!b.voulu||b.page!=='j-chiffres';
    assert.equal(b.gris,regle,b.texte+(regle?' : grisé':' : un résultat, le bouton marche'));
    if(!regle){assert.equal(b.raison,null);continue;}
    assert.equal(b.raison,MOT,b.texte+' : sa raison');
    assert.ok(b.memePoint&&b.raisonVue,b.texte+' : la raison est dans son point, à l’écran');
    assert.ok(b.taille>=13,b.texte+' : la raison fait 13 px au moins');
  }
  assert.ok(etat.filter(b=>b.gris&&/^Régler dans /.test(b.texte)).length>=7,'les « Régler dans… »');
  assert.equal(etat.filter(b=>b.gris&&b.voulu).length,voulus,'tous les « C’est voulu »');
  assert.ok(etat.filter(b=>!b.gris&&/^Voir dans Synthèse/.test(b.texte)).length>=3);
  // Une raison par point, pas par bouton.
  assert.equal(await page.locator(C+' .ct-point').evaluateAll(ps=>ps.every(p=>p.querySelectorAll('.ct-raison').length===(p.querySelector('button:disabled')?1:0))),true);
  // Grisé se voit : le bouton est estompé.
  assert.ok(parseFloat(await page.locator(C+' .ct-point button:disabled').first().evaluate(e=>getComputedStyle(e).opacity))<=.6);

  /* ---- 4. aucun de ses boutons ne change un réglage ------------------------------------------------------------------ */
  // Tout ce qui se clique sur la page est cliqué, un par un (la page est rouverte entre deux).
  const ouvrir=async()=>{if(await sous()!=='mu-pas'){await page.evaluate(()=>Sim.onglets.choisir('mu-pas'));await attendre(200);}};
  const n=await page.locator(C+' button, '+C+' summary').count();
  let clics=0;
  for(let i=0;i<n;i++){
    await ouvrir();
    const e=page.locator(C+' button, '+C+' summary').nth(i);
    // Un clic comme le ferait une personne ; un bouton grisé ne le reçoit pas (`force` : sans attendre qu'il soit actif).
    if(await e.isVisible()){await e.click({force:true,timeout:2000}).catch(()=>{});clics++;}
    await attendre(60);
  }
  assert.ok(clics>=12,clics+' boutons cliqués');
  await ouvrir();
  // Grisés de force rendus cliquables (ce qu'aucun geste de la page ne fait) : la page ne règle rien quand même.
  await page.evaluate(sel=>{const plus=document.querySelector(sel+' .ct-plus');if(plus)plus.open=true;},C);
  const forces=await page.locator(C+' .ct-point button:disabled').count();
  for(let i=0;i<forces;i++){
    await ouvrir();
    await page.evaluate(([sel,i])=>{const b=[...document.querySelectorAll(sel+' .ct-point button')].filter(x=>x.disabled||x.dataset.clForce)[i];if(!b)return;b.disabled=false;b.dataset.clForce='1';b.click();},[C,i]);
    await attendre(60);
    assert.equal(await sous(),'mu-pas','un bouton grisé, cliqué de force, n’ouvre pas de page de réglage');
    await page.evaluate(()=>Sim.unite.rendrePas());
  }
  assert.ok(forces>=9,forces+' boutons grisés essayés de force');
  assert.deepEqual(await page.evaluate(()=>Sim.ateliers.state.sansChargement||[]),[],'« C’est voulu » n’a rien retenu');
  assert.equal(await page.evaluate(()=>document.body.dataset.lecture),'seule');
  assert.equal(await donnees(),avant,'aucun réglage n’a changé : les mêmes données, à l’octet près');
  assert.equal(await page.evaluate(()=>localStorage.getItem('ory-revision')),revision,'rien n’a été écrit');
  await fermerAvis();
  assert.equal(await sauvegarde(),sauvegardeAvant,'la sauvegarde est identique avant et après');
  // « Voir dans Synthèse » mène à la Synthèse.
  await nav.aller(page,'mu-pas');await attendre(300);
  await page.locator(C+' [data-ct-page="j-chiffres"]:visible').first().click();await attendre(300);
  assert.equal(await sous(),'j-chiffres');

  /* ---- 5. l'état survit au rechargement ; à l'arrêt, la page d'avant ------------------------------------------------- */
  await nav.aller(page,'mu-pas');await attendre(300);
  await page.reload();
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.onglets);await attendre(500);
  await page.locator('#menu [data-entree="mu-pas"]').click();await attendre(300);
  assert.deepEqual([await sous(),(await pastille())[2]],['mu-pas','lire']);
  assert.deepEqual((await boutons()).map(b=>b.gris),etat.map(b=>b.gris),'après le rechargement : les mêmes boutons grisés');
  await fermerAvis();
  await bascule.click();await attendre(400);
  assert.deepEqual([await page.evaluate(()=>document.body.dataset.lecture),await sous()],[undefined,'mu-pas']);
  assert.deepEqual(await lire(),pageAvant);
  assert.deepEqual(await boutons(),boutonsAvant,'arrêtée : aucun bouton grisé, aucune raison');
  assert.equal(await page.locator('#menu').innerHTML(),menuAvant,'le menu d’avant, à l’octet près');
  assert.deepEqual(await tete(),['Simulation','Contrôles','Simulation','rg-simulation']);
  // Les boutons marchent de nouveau : « Régler dans Chemins » y mène, « C'est voulu » retient le choix.
  await page.locator(C+' [data-ct-page="mu-flux"]').first().click();await attendre(400);
  assert.equal(await sous(),'mu-flux');
  await nav.aller(page,'mu-pas');await attendre(300);
  const cie=await page.locator(C+' [data-ct-voulu]').first().getAttribute('data-ct-voulu');
  await page.locator(C+' [data-ct-voulu]').first().click();
  await page.waitForFunction(c=>(Sim.ateliers.state.sansChargement||[]).includes(c),cie);
  assert.notEqual(await donnees(),avant);

  assert.deepEqual(erreurs,[],'aucune erreur de page');
  await site.effacer();
  console.log('controles-lecture-seule-browser : ok — en lecture seule, « Contrôles » reste au menu, sous « Lire », avec sa pastille ('+pastilleAvant[0]+') ; la page s’ouvre par le menu, « Aller à… », un lien et l’accueil, et se lit en entier ('+pageAvant.points.length+' points, les mêmes textes) ; '
    +etat.filter(b=>b.gris).length+' boutons « Régler dans… » et « C’est voulu » grisés, chacun avec « Paramétrage verrouillé » ; « Voir dans Synthèse » marche ; '+clics+' boutons cliqués, '+forces+' grisés essayés de force : les mêmes données à l’octet près, la même sauvegarde ; arrêtée, la page d’avant.');
 }finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});

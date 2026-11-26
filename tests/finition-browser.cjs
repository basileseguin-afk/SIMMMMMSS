/* Correction 24 (h) — finition (version 1), sur l'unité fictive et un programme daté fictif.
 *   1. « Tous les temps par vol », défilé de 500 px vers la droite (à 1 024 × 768, pour que le tableau fictif puisse
 *      défiler d'autant) : seule la colonne des compagnies se fige. L'en-tête « Compagnie · classe », les têtes de rangée
 *      et « Total » restent à gauche ; la première cellule de la deuxième rangée d'en-tête (« h/vol 1 pers. » du premier
 *      service) part avec sa colonne, comme les autres, et ne recouvre plus « Compagnie · classe ».
 *   2. Une valeur inhabituelle se dit : une équipe de plus de 200 personnes, un temps par vol de plus de 24 heures pour
 *      une personne (dans la fiche d'un service, dans le tableau de tous les temps). La notification dit « valeur
 *      inhabituelle, à vérifier » et porte « Annuler », qui défait la saisie. Rien n'est refusé : la valeur est prise.
 *      Au seuil et en dessous, rien ne se dit. Une saisie qui a déjà sa notification la garde, complétée.
 *   3. Aucune cible de moins de 24 px sur les pages du menu, la fiche d'un service et celle d'une équipe, hors cases et
 *      boutons radio. Les deux de « Services et équipes » : « Voir ce service dans les résultats → » et « Régler dans
 *      Chemins › Fournisseurs → ». Le lien d'évitement, caché tant qu'il n'a pas le focus, fait 24 px quand il l'a.
 *   4. « Dans l'ordre », sur la fiche d'une équipe, à 1 366 et à 1 024 px : rien ne dépasse à droite ; un lot trop long
 *      passe à la ligne entre deux commandes, jamais au milieu d'une.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const I=require('../inhabituel.js');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const M='#mu-services',T=M+' .se-fiche[data-se-vue="temps"]';
const MOT='valeur inhabituelle, à vérifier';

/** Dans la page : où sont les en-têtes du tableau des temps, dans son cadre qui défile. */
const ENTETES=()=>{
  const t=document.querySelector('#mu-services .rg-recap-table'),cadre=t.closest('.rg-recap-scroll'),q=cadre.getBoundingClientRect();
  const x=e=>Math.round(e.getBoundingClientRect().left-q.left),y=e=>Math.round(e.getBoundingClientRect().top-q.top);
  const coin=t.querySelector('thead .rg-recap-t1 th:first-child'),t2=[...t.querySelectorAll('thead .rg-recap-t2 th')];
  const rangs=[...t.querySelectorAll('tbody th[scope="row"]')].filter(e=>e.getClientRects().length),pied=t.querySelector('tfoot th');
  const r=coin.getBoundingClientRect();
  // Sous le coin, à la hauteur de la deuxième rangée d'en-tête : c'est là que « h/vol 1 pers. » venait se figer.
  const dessus=p=>{const e=document.elementFromPoint(r.left+r.width*p,r.bottom-6);return e&&e.closest('th')?e.closest('th').textContent.trim().replace(/\s+/g,' ').slice(0,24):String(e&&e.tagName);};
  return {defile:cadre.scrollLeft,max:cadre.scrollWidth-cadre.clientWidth,coin:[coin.textContent.trim(),x(coin),y(coin),Math.round(r.width)],
    t2:t2.slice(0,4).map(e=>[e.textContent.trim().replace(/\s+/g,' '),x(e),y(e)]),t2Fige:t2.filter(e=>getComputedStyle(e).left!=='auto').length,
    rangs:rangs.slice(0,3).map(x),pied:pied?x(pied):null,sousLeCoin:[dessus(0.25),dessus(0.75)]};
};
/** Dans la page : les notifications à l'écran — leur texte, et si elles portent « Annuler ». */
const NOTIFS=()=>[...document.querySelectorAll('#notifs .notif:not(.sort)')].map(n=>({texte:n.querySelector('.notif-texte').textContent.replace(/ /g,' '),annuler:!!n.querySelector('.notif-annuler'),refus:n.classList.contains('retard')}));
/** Dans la page : les cibles visibles de moins de 24 px, hors cases et boutons radio. */
const PETITES=()=>{
  const sel='a[href],button,input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]),select,textarea,summary,[role=button],[role=tab],[role=link],[tabindex]:not([tabindex="-1"])';
  const vues=[];
  for(const e of document.querySelectorAll(sel)){
    if(e.disabled||e.matches('[role=radio],[role=checkbox],[role=switch],.skip-link')||e.closest('[hidden],[inert]'))continue;
    if(e.checkVisibility&&!e.checkVisibility({visibilityProperty:true}))continue;
    const r=e.getBoundingClientRect();
    if(!r.width||!r.height||r.bottom<=0||r.top>=innerHeight||r.right<=0||r.left>=innerWidth)continue;
    if(Math.min(r.width,r.height)<23.5)vues.push((e.id?'#'+e.id:e.tagName.toLowerCase()+(typeof e.className==='string'&&e.className?'.'+e.className.trim().split(/\s+/).join('.'):''))+' '+Math.round(r.width)+'×'+Math.round(r.height)+' « '+(e.textContent||e.getAttribute('aria-label')||'').trim().slice(0,30)+' »');
  }
  return [...new Set(vues)];
};
/** Dans la page : « Dans l'ordre » — ce qui dépasse, les commandes coupées, les lots sur plusieurs lignes. */
const ORDRE=()=>{
  const o=document.querySelector('#mu-services .mu-ordre'),q=o.getBoundingClientRect();
  const lots=[...o.querySelectorAll('.mu-ordre-cmd')];
  const cmds=lots.flatMap(l=>[...l.querySelectorAll(':scope > button, :scope > span')]);
  const milieu=e=>{const r=e.getBoundingClientRect();return r.top+r.height/2;};
  return {lots:lots.length,commandes:cmds.length,
    depassent:lots.filter(l=>{const r=l.getBoundingClientRect();return r.right>q.right+0.5||r.left<q.left-0.5;}).length,
    hors:cmds.filter(c=>{const r=c.getBoundingClientRect(),l=c.closest('.mu-ordre-cmd').getBoundingClientRect();return r.right>l.right+0.5||r.left<l.left-0.5;}).length,
    // Une commande coupée : elle tient sur plus d'une ligne, ou sa pastille et sa classe ne sont pas à la même hauteur.
    coupees:cmds.filter(c=>c.getClientRects().length!==1||c.getBoundingClientRect().height>30||[...c.querySelectorAll('.pa-cie,.pa-classe')].some(x=>Math.abs(milieu(x)-milieu(c))>4)).length,
    surPlusieursLignes:lots.filter(l=>new Set([...l.querySelectorAll(':scope > button, :scope > span')].map(c=>Math.round(milieu(c)))).size>1).length,
    cibles:Math.min(...cmds.filter(c=>c.tagName==='BUTTON').map(c=>Math.round(c.getBoundingClientRect().height))),
    pastilles:o.querySelectorAll('.pa-cie').length};
};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 const ouvrir=async(largeur,options)=>{
  const ctx=await browser.newContext({viewport:{width:largeur,height:768},reducedMotion:'reduce'});
  const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
  const site=await F.charger(page,nav,URL_V1,{pageId:'mu-services',...options});
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.unite&&Sim.reglages&&window.OrlyInhabituel);
  return {page,fermer:async()=>{site.effacer();await ctx.close();}};
 };
 const bilan=[];
 try{
  /* ---- 1. le tableau des temps, défilé de 500 px ------------------------------------------------------------------- */
  let s=await ouvrir(1024),page=s.page;
  const attendre=(ms=400)=>page.waitForTimeout(ms);
  await page.locator(M+' .se-liste [data-se-panneau="temps"]').click();await attendre();
  await page.locator(T+' .rg-recap-table').waitFor();
  const avant=await page.evaluate(ENTETES);
  assert.ok(avant.max>=500,'à 1 024 px, le tableau fictif défile d’au moins 500 px ('+avant.max+')');
  // (« h/vol » et « 1 pers. » sont sur deux lignes dans la cellule : son texte les colle.)
  assert.deepEqual([avant.defile,avant.coin[0],avant.t2[0][0].replace(/\s+/g,'')],[0,'Compagnie · classe','h/vol1pers.'],'le coin du tableau, et la première cellule de la deuxième rangée d’en-tête');
  assert.ok(avant.t2[0][1]>=avant.coin[1]+avant.coin[3],'avant de défiler, « h/vol 1 pers. » est à droite de « Compagnie · classe »');
  assert.equal(avant.t2Fige,0,'aucune cellule de la deuxième rangée d’en-tête ne se fige à gauche');
  await page.evaluate(()=>{document.querySelector('#mu-services .rg-recap-scroll').scrollLeft=500;});await attendre(250);
  const apres=await page.evaluate(ENTETES);
  assert.equal(apres.defile,500,'le tableau a défilé de 500 px');
  assert.deepEqual([apres.coin,apres.rangs,apres.pied],[avant.coin,avant.rangs,avant.pied],'« Compagnie · classe », les têtes de rangée et le total restent où ils étaient');
  assert.deepEqual(apres.t2.map(c=>[c[0],c[1]+500,c[2]]),avant.t2,'chaque cellule de la deuxième rangée d’en-tête part de 500 px vers la gauche, à la même hauteur');
  assert.deepEqual(apres.sousLeCoin,['Compagnie · classe','Compagnie · classe'],'rien ne recouvre « Compagnie · classe »');
  bilan.push('le tableau des temps défilé de 500 px (« h/vol 1 pers. » de '+avant.t2[0][1]+' à '+apres.t2[0][1]+' px, le coin reste à '+apres.coin[1]+' px)');

  /* ---- 4. « Dans l'ordre », à 1 024 px ----------------------------------------------------------------------------- */
  const ordre=async(largeur)=>{
   await nav.aller(page,'mu-services');await nav.equipe(page,'mo');await attendre();
   await page.locator(M+' .mu-ordre').scrollIntoViewIfNeeded();
   const o=await page.evaluate(ORDRE),L=' (à '+largeur+' px)';
   assert.ok(o.lots>=3&&o.commandes>=8&&o.pastilles>=8,'« Dans l’ordre » liste les lots de l’équipe, pastilles comprises'+L+' : '+JSON.stringify(o));
   assert.deepEqual([o.depassent,o.hors],[0,0],'rien ne dépasse à droite'+L);
   assert.equal(o.coupees,0,'aucune commande n’est coupée : sa pastille et sa classe restent sur une ligne'+L);
   assert.ok(o.cibles>=24,'une commande est une cible de 24 px'+L+' : '+o.cibles);
   return o;
  };
  const etroit=await ordre(1024);
  assert.ok(etroit.surPlusieursLignes>=1,'à 1 024 px, un lot trop long passe à la ligne (entre deux commandes)');
  await s.fermer();

  /* ---- la suite à 1 366 × 768, avec un programme daté (la page « Période » est au menu) ----------------------------- */
  s=await ouvrir(1366,{csv:F.volsDatesCsv(3,'2031-03-03')});page=s.page;
  const large=await ordre(1366);
  bilan.push('« Dans l’ordre » : '+large.lots+' lots, '+large.commandes+' commandes, rien de coupé ('+large.surPlusieursLignes+' lot sur deux lignes à 1 366 px, '+etroit.surPlusieursLignes+' à 1 024 px)');

  /* ---- 2. une valeur inhabituelle se dit ---------------------------------------------------------------------------- */
  const notifs=()=>page.evaluate(NOTIFS);
  const avis=async()=>(await notifs()).filter(n=>n.texte.includes(MOT));
  const personnes=()=>page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.id==='mo').personnes);
  const champPers=()=>page.locator(M+' [data-at-champ="personnes"]:visible').first();
  const saisir=async(champ,v)=>{await champ.fill(String(v));await champ.press('Enter');await attendre(600);};
  const effectifAvant=await personnes();
  assert.ok(effectifAvant>0&&effectifAvant<=I.SEUILS.personnes);
  // Au-dessus du seuil : la valeur est prise, la notification le dit et porte « Annuler ».
  await saisir(champPers(),I.SEUILS.personnes+1);
  assert.equal(await personnes(),I.SEUILS.personnes+1,'rien n’est refusé : l’équipe a 201 personnes');
  assert.deepEqual(await avis(),[{texte:'201 personnes dans une équipe : '+MOT+'.',annuler:true,refus:false}],'une équipe de 201 personnes : la notification le dit, avec « Annuler »');
  await page.locator('#notifs .notif-annuler').click();await attendre(500);
  assert.equal(await personnes(),effectifAvant,'« Annuler » défait la saisie');
  assert.deepEqual(await avis(),[],'la notification de l’avis s’en va');
  // Au seuil, puis en dessous : rien ne se dit.
  await saisir(champPers(),I.SEUILS.personnes);
  assert.deepEqual([await personnes(),await avis()],[I.SEUILS.personnes,[]],'200 personnes : prises, sans avis');
  await saisir(champPers(),effectifAvant);
  assert.deepEqual([await personnes(),await avis()],[effectifAvant,[]]);

  // Un temps par vol, dans la fiche d'un service.
  await nav.aller(page,'mu-services');await page.evaluate(()=>Sim.unite.ouvrir('cuisine'));await attendre();await nav.section(page,'temps');
  const champTemps=page.locator(M+' .se-fiche input[data-rg-champ="heures"][data-service="cuisine"]:visible').first();
  const cle=await champTemps.getAttribute('data-cle');
  const leChamp=()=>page.locator(`${M} .se-fiche input[data-rg-champ="heures"][data-service="cuisine"][data-cle="${cle}"]`);
  const minutes=()=>page.evaluate(k=>Sim.reglages.etat.bareme.cuisine[k],cle);
  const minutesAvant=await minutes();
  assert.ok(minutesAvant>0&&minutesAvant<=I.SEUILS.heuresParVol*60);
  await saisir(leChamp(),'24.5');
  assert.equal(await minutes(),1470,'rien n’est refusé : 24,5 h par vol, gardées en minutes');
  assert.deepEqual(await avis(),[{texte:'24,5 h par vol pour une personne : '+MOT+'.',annuler:true,refus:false}],'24,5 h par vol : la notification le dit, avec « Annuler »');
  await page.locator('#notifs .notif-annuler').click();await attendre(500);
  assert.equal(await minutes(),minutesAvant,'« Annuler » défait la saisie');
  await saisir(leChamp(),I.SEUILS.heuresParVol);
  assert.deepEqual([await minutes(),await avis()],[I.SEUILS.heuresParVol*60,[]],'24 h par vol : prises, sans avis');
  await saisir(leChamp(),'23.5');
  assert.deepEqual([await minutes(),await avis()],[1410,[]],'23,5 h par vol : prises, sans avis');

  // Dans le tableau de tous les temps par vol : une commande, puis une compagnie (qui a déjà sa notification).
  await page.locator(M+' .se-liste [data-se-panneau="temps"]').click();await attendre();
  await page.locator(T+' [data-rg-action="recap-tout"][data-ouvrir="1"]').first().click();await attendre(300);
  const cellule=()=>page.locator(`${T} input[data-rg-champ="recap"][data-service="cuisine"][data-classe="NORD/BC"]`);
  await saisir(cellule(),'30');
  assert.equal(await page.evaluate(()=>Sim.reglages.etat.bareme.cuisine['NORD/BC']),1800,'rien n’est refusé : 30 h par vol dans le tableau');
  assert.deepEqual(await avis(),[{texte:'30 h par vol pour une personne : '+MOT+'.',annuler:true,refus:false}]);
  await saisir(cellule(),'0.5');
  assert.deepEqual([await page.evaluate(()=>Sim.reglages.etat.bareme.cuisine['NORD/BC']),await avis()],[30,[]],'une valeur ordinaire ensuite : l’avis d’avant s’en va, aucun autre ne vient');
  const parCompagnie=page.locator(T+' input[data-rg-champ="recap-cie"]:visible').first();
  if(await parCompagnie.count()){
   await saisir(parCompagnie,'26');
   const dits=await avis();
   assert.equal(dits.length,1,'un service par compagnie : un seul avis');
   assert.match(dits[0].texte,/^.+ : 26 h par vol — valeur inhabituelle, à vérifier\.$/,'la notification de la saisie est gardée, complétée : '+dits[0].texte);
   assert.equal(dits[0].annuler,true,'elle garde « Annuler »');
   bilan.push('une saisie qui a sa notification la garde, complétée (« '+dits[0].texte+' »)');
   await page.locator('#notifs .notif-annuler').click();await attendre(500);
  }
  bilan.push('201 personnes, 24,5 h et 30 h par vol : dites, avec « Annuler », sans refus ; 200 personnes, 24 h et 23,5 h : rien');

  /* ---- 3. aucune cible de moins de 24 px ---------------------------------------------------------------------------- */
  const pages=await page.evaluate(()=>OrlyOnglets.entrees().flatMap(o=>o.pages||[o.id]));
  assert.ok(pages.length>=14&&pages.includes('j-periode')&&pages.includes('mu-services'),'les pages du menu : '+pages);
  for(const id of pages){
   await nav.aller(page,id);await attendre(350);
   assert.deepEqual(await page.evaluate(PETITES),[],'aucune cible de moins de 24 px sur la page '+id);
  }
  // « Services et équipes » : la fiche d'un service — ses deux liens —, puis celle d'une équipe.
  await nav.aller(page,'mu-services');await page.evaluate(()=>Sim.unite.ouvrir('prepa'));await attendre();
  const liens=await page.evaluate(()=>[...document.querySelectorAll('#mu-services .se-fiche button.lien-fort')].filter(b=>b.getClientRects().length).map(b=>[b.textContent.trim(),Math.round(b.getBoundingClientRect().height)]));
  assert.ok(liens.some(l=>/^Voir ce service dans les résultats/.test(l[0]))&&liens.every(l=>l[1]>=24),'les liens de la fiche d’un service font 24 px : '+JSON.stringify(liens));
  assert.deepEqual(await page.evaluate(PETITES),[],'aucune cible de moins de 24 px sur la fiche d’un service');
  await page.evaluate(()=>Sim.unite.ouvrir('cuisine'));await attendre();
  const fournisseurs=await page.evaluate(()=>[...document.querySelectorAll('#mu-services .fo-vers button')].filter(b=>b.getClientRects().length).map(b=>[b.textContent.trim(),Math.round(b.getBoundingClientRect().height)]));
  for(const l of fournisseurs)assert.ok(l[1]>=24,'« '+l[0]+' » fait 24 px : '+l[1]);
  assert.deepEqual(await page.evaluate(PETITES),[],'aucune cible de moins de 24 px sur la fiche d’un autre service');
  await nav.equipe(page,'mo');await attendre();
  assert.deepEqual(await page.evaluate(PETITES),[],'aucune cible de moins de 24 px sur la fiche d’une équipe');
  // Le lien d'évitement : caché tant qu'il n'a pas le focus ; 24 px quand il l'a.
  const evitement=await page.evaluate(()=>{const a=document.querySelector('.skip-link');if(!a)return null;const r0=a.getBoundingClientRect();a.focus();const r=a.getBoundingClientRect();a.blur();return [Math.round(Math.min(r0.width,r0.height)),Math.round(r.width),Math.round(r.height)];});
  if(evitement)assert.ok(evitement[0]<=1&&evitement[1]>=24&&evitement[2]>=24,'le lien d’évitement : caché sans focus, 24 px avec ('+evitement+')');
  bilan.push('aucune cible de moins de 24 px sur '+pages.length+' pages du menu, deux fiches de service et une fiche d’équipe');
  await s.fermer();

  assert.deepEqual(erreurs,[],'aucune erreur de page');
  console.log('OK finition : '+bilan.join(' ; ')+'.');
 }finally{await browser.close();}
})().catch(e=>{console.error('ÉCHEC finition :',e&&e.stack||e);process.exit(1);});

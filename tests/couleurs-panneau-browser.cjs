/* Correction 24 (g) — les couleurs des compagnies : douze teintes refaites, un petit panneau pour choisir (version 1),
 * sur l'unité fictive, à 1 366 × 768. Le constat : douze teintes qui se ressemblaient, une carte dépliée en mur de
 * 144 carrés, un aperçu replié coupé au milieu d'un nom.
 *   1. Les vingt-quatre teintes, dans l'ordre de la demande : dans le panneau, chaque teinte a sa couleur, et le texte
 *      d'une pastille posé dessus tient 4,5:1, en clair comme en sombre.
 *   2. La carte dépliée : une rangée par compagnie — sa pastille (un bouton) et « automatique » ou « gardée ». Avec
 *      12 compagnies, au plus 30 boutons visibles, panneau ouvert compris.
 *   3. Le panneau : un clic sur la pastille l'ouvre, ancré à elle, dans la fenêtre ; douze boutons radio dans un groupe,
 *      la teinte du moment cochée, le focus sur elle. Les flèches vont d'une teinte à l'autre sans rien choisir ; Échap
 *      ferme et rend le focus à la pastille. Entrée sur une teinte la choisit : le panneau se ferme, le focus revient à
 *      la pastille. Un clic ailleurs, ou la carte repliée, le ferme aussi.
 *   4. Un choix fait par le panneau, au clavier ou à la souris, écrit l'entrée d'avant cette correction pour le même
 *      rang, octet pour octet ; un choix déjà gardé reste au même rang et prend la nouvelle teinte de ce rang.
 *   5. Repliée, la carte montre les pastilles depuis la gauche, sans jamais en couper une : celles qui ne tiennent pas
 *      se disent « + n ». Avec 3, 12 et 20 compagnies, à 1 366 et à 1 024 px.
 *   6. La pastille se pose aussi sur les compagnies à cocher de la fiche d'une équipe (un service à un seul atelier).
 * L'unité fictive nomme cinq compagnies dans ses réglages : les cartes à 12 et à 20 compagnies viennent de vols
 * importés (7 et 15 noms de plus) ; la carte à 3 compagnies vient de la prise du module (`brancher`), celle de la page.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const CLE='ory-couleurs-compagnies-v1',CARTE='#couleurs-compagnies';
const CLAIR=['#BE3C92','#747914','#2D2DDD','#244451','#DA2F5C','#5A0F1B','#C323CF','#1A8465','#1B57A8','#6B5535','#191687','#3B1650'];
const SOMBRE=['#F87ABA','#BED37A','#9897FA','#26C0F4','#DBABAF','#F18E8F','#F7CFFC','#25F49D','#DDE7EE','#F0C044','#AAAECC','#C98BD9'];
/** Des compagnies fictives de plus (des fruits, des plantes), que l'unité fictive ne nomme pas. */
const DE_PLUS=['ABRICOT','BLEUET','CERISE','DATTE','FIGUE','GROSEILLE','NOISETTE','OLIVE','POIRE','PRUNE','RAISIN','TILLEUL','VANILLE','VERVEINE','YUZU'];
const DE_L_UNITE=['EST','NORD','OUEST','SUD','ZEN'];
/** Les vols fictifs, leurs compagnies remplacées tour à tour par `noms`. */
const csvAvec=noms=>{const l=F.volsCsv().trim().split('\n');return l[0]+'\n'+l.slice(1).map((x,i)=>{const c=x.split(',');c[1]=noms[i%noms.length];return c.join(',');}).join('\n')+'\n';};
const rvb=h=>'rgb('+[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)).join(', ')+')';
const lum=c=>{const [r,g,b]=(c.match(/[\d.]+/g)||[]).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});return 0.2126*r+0.7152*g+0.0722*b;};
const contraste=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05);};
const ENVELOPPE=couleurs=>JSON.stringify({schema:'ory-couleurs-compagnies',version:1,couleurs});

/** Dans la page : la carte repliée — ce qu'elle montre, ce qu'elle tait, ce qui dépasse. */
const REPLIEE=()=>{
  const c=document.getElementById('couleurs-compagnies'),ap=c.querySelector('.pa-apercu'),q=ap.getBoundingClientRect(),plus=ap.querySelector('.pa-plus');
  const noms=[...ap.querySelectorAll(':scope > .pa-nom')],vus=noms.filter(e=>!e.hidden&&e.getClientRects().length);
  const coupe=e=>{const r=e.getBoundingClientRect();return r.left<q.left-0.5||r.right>q.right+0.5||e.scrollWidth>e.clientWidth+1;};
  const tete=[...c.querySelectorAll('.pa-carte-titre,.pa-carte-etat')];
  return {ouverte:c.open,total:noms.length,vus:vus.map(e=>e.textContent),coupes:vus.filter(coupe).map(e=>e.textContent),
    plus:plus.hidden?'':plus.textContent,plusCoupe:!plus.hidden&&coupe(plus),deborde:ap.scrollWidth>ap.clientWidth+1,
    teteCoupee:tete.filter(e=>e.scrollWidth>e.clientWidth+1||e.getBoundingClientRect().right>c.getBoundingClientRect().right).map(e=>e.textContent),
    gauche:vus.length?Math.round(vus[0].getBoundingClientRect().left-q.left):0,
    lignes:new Set(vus.map(e=>Math.round(e.getBoundingClientRect().top))).size};
};
/** Dans la page : les boutons visibles de la carte. */
const BOUTONS=()=>[...document.querySelectorAll('#couleurs-compagnies button')].filter(b=>b.getClientRects().length&&getComputedStyle(b).visibility!=='hidden').length;

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 const ouvrir=async(csv,pageId='v-programme')=>{
  const ctx=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});
  const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
  const site=await F.charger(page,nav,URL_V1,{csv,pageId});
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&window.OrlyPastilles);
  return {page,fermer:async()=>{site.effacer();await ctx.close();}};
 };
 const garde=page=>page.evaluate(k=>localStorage.getItem(k),CLE);
 const theme=(page,t)=>page.evaluate(x=>{if(x==='sombre')document.documentElement.dataset.theme='sombre';else delete document.documentElement.dataset.theme;},t);
 /** La carte repliée, relevée aux deux largeurs : rien n'est coupé, le compte est juste. */
 const verifierRepliee=async(page,n,quoi)=>{
  const releves=[];
  for(const largeur of [1366,1024]){
   await page.setViewportSize({width:largeur,height:768});await page.waitForTimeout(250);
   const r=await page.evaluate(REPLIEE),T=quoi+', à '+largeur+' px';
   assert.equal(r.ouverte,false,T+' : la carte est repliée');
   assert.equal(r.total,n,T+' : '+n+' compagnies');
   assert.ok(r.vus.length>=1,T+' : au moins une pastille se voit');
   assert.deepEqual(r.coupes,[],T+' : aucune pastille coupée');
   assert.deepEqual([r.deborde,r.plusCoupe,r.teteCoupee],[false,false,[]],T+' : rien ne dépasse — ni l’aperçu, ni « + n », ni le titre et l’état');
   assert.equal(r.plus,r.vus.length<n?'+ '+(n-r.vus.length):'',T+' : celles qui ne tiennent pas se disent « + n »');
   assert.deepEqual([r.gauche,r.lignes],[0,1],T+' : les pastilles partent de la gauche, sur une ligne');
   releves.push(largeur+' px : '+r.vus.length+(r.plus?' '+r.plus:''));
  }
  await page.setViewportSize({width:1366,height:768});await page.waitForTimeout(200);
  return releves.join(', ');
 };
 const bilan=[];
 try{
  /* ---- 12 compagnies : la carte repliée, dépliée, le panneau, les choix ------------------------------------------- */
  let s=await ouvrir(csvAvec(DE_PLUS.slice(0,7).concat(DE_L_UNITE)));
  let page=s.page;
  const carte=page.locator(CARTE);
  await carte.waitFor();
  const DOUZE=DE_PLUS.slice(0,7).concat(DE_L_UNITE).sort((a,b)=>a.localeCompare(b,'fr'));
  bilan.push('12 compagnies repliées ('+await verifierRepliee(page,12,'12 compagnies')+')');
  assert.equal(await garde(page),null,'sans choix, rien n’est écrit');

  await carte.locator('summary').click();
  await carte.locator('.pa-rangee').first().waitFor();
  assert.deepEqual(await carte.locator('.pa-rangee').evaluateAll(l=>l.map(e=>e.dataset.paCompagnie)),DOUZE,'une rangée par compagnie, par ordre alphabétique');
  assert.deepEqual(await carte.locator('.pa-rangee').evaluateAll(l=>l.map(e=>[e.querySelectorAll('button').length,e.querySelector('button').matches('[data-pa-ouvrir]'),e.querySelectorAll('.pa-cie').length,e.querySelector('.pa-etat').textContent].join(' '))),
    DOUZE.map(()=>'1 true 1 automatique'),'chaque rangée : un bouton — sa pastille — et « automatique »');
  assert.deepEqual(await carte.locator('.pa-rangee .pa-cie').evaluateAll(l=>l.map(e=>+e.dataset.paRang)),[1,2,3,4,5,6,7,8,9,10,11,12],'sans choix, les douze couleurs dans l’ordre');
  const fermes=await page.evaluate(BOUTONS);
  assert.equal(fermes,14,'la carte dépliée, 12 compagnies : douze pastilles et deux boutons');

  // Le panneau, à la souris.
  const pastille=nom=>carte.locator('[data-pa-compagnie="'+nom+'"] [data-pa-ouvrir]');
  const panneau=carte.locator('.pa-panneau');
  await pastille('NORD').click();await panneau.waitFor();
  const ouverts=await page.evaluate(BOUTONS);
  assert.ok(ouverts<=30,'au plus 30 boutons visibles, panneau ouvert ('+ouverts+')');
  const rangNord=DOUZE.indexOf('NORD')+1;
  const p=await page.evaluate(()=>{
   const c=document.getElementById('couleurs-compagnies'),x=c.querySelector('.pa-panneau'),b=c.querySelector('[data-pa-compagnie="NORD"] [data-pa-ouvrir]');
   const q=x.getBoundingClientRect(),r=b.getBoundingClientRect(),g=x.querySelector('[role=radiogroup]'),t=[...x.querySelectorAll('[data-pa-teinte]')];
   return {nom:x.dataset.paPanneau,groupe:g.getAttribute('aria-label'),radios:t.filter(e=>e.getAttribute('role')==='radio'&&e.tagName==='BUTTON').length,
     coches:t.filter(e=>e.getAttribute('aria-checked')==='true').map(e=>+e.dataset.paTeinte),arrets:t.filter(e=>e.tabIndex===0).map(e=>+e.dataset.paTeinte),
     focus:document.activeElement.dataset.paTeinte,etendu:b.getAttribute('aria-expanded'),popup:b.getAttribute('aria-haspopup'),nomLu:b.getAttribute('aria-label'),
     sous:q.top>=r.bottom-0.5||q.bottom<=r.top+0.5,ecart:Math.round(Math.min(Math.abs(q.top-r.bottom),Math.abs(r.top-q.bottom))),aGauche:Math.round(q.left-r.left),
     dedans:q.left>=0&&q.top>=0&&q.right<=innerWidth&&q.bottom<=innerHeight,tailles:[...new Set(t.map(e=>{const k=e.getBoundingClientRect();return Math.round(k.width)+'×'+Math.round(k.height);}))],
     lignes:new Set(t.map(e=>Math.round(e.getBoundingClientRect().top))).size,defile:document.documentElement.scrollHeight>innerHeight};});
  assert.deepEqual([p.nom,p.groupe,p.radios,p.coches,p.arrets,p.focus],['NORD','Couleur de NORD',12,[rangNord],[rangNord],String(rangNord)],'le panneau de NORD : douze boutons radio dans un groupe, la teinte du moment cochée, le focus sur elle');
  assert.deepEqual([p.etendu,p.popup],['true','true'],'la pastille dit qu’elle ouvre un panneau, et qu’il est ouvert');
  assert.match(p.nomLu,new RegExp('^NORD : couleur '+rangNord+', automatique\\. Choisir sa couleur$'),'le nom lu de la pastille dit la compagnie, sa couleur, son état');
  assert.deepEqual([p.sous,p.ecart<=6,p.aGauche,p.dedans],[true,true,0,true],'le panneau est ancré à sa pastille, dans la fenêtre');
  assert.deepEqual([p.tailles,p.lignes,p.defile],[['24×24'],2,false],'douze teintes de 24 px, sur deux lignes ; la fenêtre ne défile pas');

  // 1. Les vingt-quatre teintes : la couleur de chacune, et le texte d'une pastille posé dessus.
  for(const [t,liste] of [['clair',CLAIR],['sombre',SOMBRE]]){
   await theme(page,t);await page.waitForTimeout(80);
   const lues=await page.evaluate(()=>{const e=document.querySelector('#couleurs-compagnies .pa-rangee .pa-cie'),long=e.classList.contains('pa-long');
     return {encre:getComputedStyle(e,long?'::before':null).color,fonds:[...document.querySelectorAll('#couleurs-compagnies .pa-panneau [data-pa-teinte]')].map(b=>getComputedStyle(b).backgroundColor)};});
   assert.deepEqual(lues.fonds,liste.map(rvb),'les douze teintes du thème '+t+', dans l’ordre de la demande');
   const faibles=liste.map((h,i)=>[i+1,+contraste(rvb(h),lues.encre).toFixed(2)]).filter(x=>x[1]<4.5);
   assert.deepEqual(faibles,[],'le texte d’une pastille tient 4,5:1 sur chaque teinte ('+t+')');
   // La pastille de la page a la teinte de son rang.
   const p9=await page.evaluate(r=>{const e=[...document.querySelectorAll('#couleurs-compagnies .pa-rangee .pa-cie')].find(x=>+x.dataset.paRang===r),long=e.classList.contains('pa-long');return getComputedStyle(e,long?'::before':null).backgroundColor;},rangNord);
   assert.equal(p9,rvb(liste[rangNord-1]),'la pastille du rang '+rangNord+' a sa teinte ('+t+')');
  }
  await theme(page,'clair');

  // 3. Au clavier : les flèches ne choisissent rien ; Échap ferme et rend le focus.
  const actif=()=>page.evaluate(()=>{const a=document.activeElement;return a.dataset.paTeinte||(a.matches('[data-pa-ouvrir]')?'pastille '+a.closest('[data-pa-compagnie]').dataset.paCompagnie:a.tagName);});
  await page.keyboard.press('ArrowRight');assert.equal(await actif(),String(rangNord%12+1),'la flèche droite va à la teinte suivante');
  await page.keyboard.press('ArrowLeft');assert.equal(await actif(),String(rangNord),'la flèche gauche revient');
  await page.keyboard.press('Home');assert.equal(await actif(),'1','Début : la première');
  await page.keyboard.press('ArrowDown');assert.equal(await actif(),'7','la flèche bas descend d’une ligne');
  await page.keyboard.press('ArrowUp');assert.equal(await actif(),'1','la flèche haut remonte');
  await page.keyboard.press('End');assert.equal(await actif(),'12','Fin : la dernière');
  assert.equal(await garde(page),null,'se déplacer ne choisit rien');
  await page.keyboard.press('Escape');
  assert.deepEqual([await panneau.count(),await actif(),await pastille('NORD').getAttribute('aria-expanded')],[0,'pastille NORD','false'],'Échap ferme le panneau et rend le focus à la pastille');
  assert.equal(await garde(page),null,'Échap ne choisit rien');

  // 4. Choisir au clavier : Entrée ouvre, les flèches vont à la teinte, Entrée la choisit.
  await page.keyboard.press('Enter');await panneau.waitFor();
  assert.equal(await actif(),String(rangNord),'Entrée sur la pastille ouvre son panneau, le focus sur la teinte du moment');
  await page.keyboard.press('Home');
  for(let i=1;i<9;i++)await page.keyboard.press('ArrowRight');
  assert.equal(await actif(),'9');
  await page.keyboard.press('Enter');
  await page.waitForFunction(k=>localStorage.getItem(k)!==null,CLE);
  assert.equal(await garde(page),ENVELOPPE({NORD:9}),'un choix au clavier écrit l’entrée d’avant cette correction, octet pour octet');
  assert.deepEqual([await panneau.count(),await actif()],[0,'pastille NORD'],'choisir ferme le panneau et rend le focus à la pastille');
  assert.deepEqual(await carte.locator('[data-pa-compagnie="NORD"]').evaluate(e=>[e.querySelector('.pa-etat').textContent,+e.querySelector('.pa-cie').dataset.paRang,e.querySelector('button').getAttribute('aria-label')]),
    ['gardée',9,'NORD : couleur 9, gardée. Choisir sa couleur'],'la rangée dit « gardée », sa pastille prend le rang 9');
  // La même entrée que par le geste d'avant (la fonction du module, inchangée).
  await page.evaluate(()=>{OrlyPastilles.revenirAuxAutomatiques();});
  await page.waitForFunction(k=>localStorage.getItem(k)===null,CLE);
  await page.evaluate(()=>{OrlyPastilles.choisirCouleur('NORD',9);});
  const parLeModule=await garde(page);
  await page.evaluate(()=>{OrlyPastilles.revenirAuxAutomatiques();});
  await page.waitForFunction(k=>localStorage.getItem(k)===null,CLE);

  // Choisir à la souris : la même entrée.
  await pastille('NORD').click();await panneau.waitFor();
  await panneau.locator('[data-pa-teinte="9"]').click();
  await page.waitForFunction(k=>localStorage.getItem(k)!==null,CLE);
  assert.equal(await garde(page),parLeModule,'un choix à la souris écrit la même entrée que le module');
  assert.equal(parLeModule,ENVELOPPE({NORD:9}));
  assert.deepEqual([await panneau.count(),await actif()],[0,'pastille NORD'],'choisir à la souris ferme le panneau et rend le focus à la pastille');
  await pastille('EST').click();await panneau.waitFor();
  await panneau.locator('[data-pa-teinte="4"]').click();
  await page.waitForFunction(k=>(localStorage.getItem(k)||'').includes('EST'),CLE);
  assert.equal(await garde(page),ENVELOPPE({EST:4,NORD:9}),'un second choix s’ajoute au premier, les compagnies par ordre alphabétique');
  // Un choix déjà gardé reste au même rang : il prend la nouvelle teinte de ce rang, dans les deux thèmes.
  for(const [t,liste] of [['clair',CLAIR],['sombre',SOMBRE]]){
   await theme(page,t);await page.waitForTimeout(80);
   const fonds=await page.evaluate(()=>Object.fromEntries(['NORD','EST'].map(n=>{const e=document.querySelector('#couleurs-compagnies [data-pa-compagnie="'+n+'"] .pa-cie'),long=e.classList.contains('pa-long');return [n,getComputedStyle(e,long?'::before':null).backgroundColor];})));
   assert.deepEqual(fonds,{NORD:rvb(liste[8]),EST:rvb(liste[3])},'un choix gardé au rang 9 (au rang 4) prend la teinte de ce rang ('+t+')');
  }
  await theme(page,'clair');

  // Le panneau se ferme d'un clic ailleurs, et quand la carte se replie ; un second clic sur la pastille le ferme aussi.
  await pastille('SUD').click();await panneau.waitFor();
  await carte.locator('.pa-actions .mini-note').click();
  await panneau.waitFor({state:'detached'});
  await pastille('SUD').click();await panneau.waitFor();
  await pastille('SUD').click();await panneau.waitFor({state:'detached'});
  assert.equal(await actif(),'pastille SUD','un second clic sur la pastille ferme son panneau, le focus reste sur elle');
  await pastille('SUD').click();await panneau.waitFor();
  await pastille('ZEN').click();
  await page.waitForFunction(()=>{const x=document.querySelector('#couleurs-compagnies .pa-panneau');return x&&x.dataset.paPanneau==='ZEN';});
  assert.equal(await panneau.count(),1,'un seul panneau à la fois');
  await carte.locator('summary').click();
  await panneau.waitFor({state:'detached'});
  assert.equal(await garde(page),ENVELOPPE({EST:4,NORD:9}),'ouvrir et fermer un panneau n’écrit rien');
  bilan.push('repliée après deux choix ('+await verifierRepliee(page,12,'12 compagnies, deux gardées')+')');
  bilan.push('dépliée : '+fermes+' boutons, '+ouverts+' panneau ouvert');
  await s.fermer();

  /* ---- 20 compagnies ---------------------------------------------------------------------------------------------- */
  s=await ouvrir(csvAvec(DE_PLUS.concat(DE_L_UNITE)));page=s.page;
  await page.locator(CARTE).waitFor();
  bilan.push('20 compagnies ('+await verifierRepliee(page,20,'20 compagnies')+')');
  // Dépliée : la treizième compagnie reprend la première couleur ; son panneau reste dans la fenêtre.
  await page.locator(CARTE+' summary').click();
  const derniere=page.locator(CARTE+' .pa-rangee').last().locator('[data-pa-ouvrir]');
  await derniere.scrollIntoViewIfNeeded();await derniere.click();await page.locator(CARTE+' .pa-panneau').waitFor();
  assert.deepEqual(await page.evaluate(()=>{const q=document.querySelector('#couleurs-compagnies .pa-panneau').getBoundingClientRect();
    return [q.left>=0&&q.top>=0&&q.right<=innerWidth&&q.bottom<=innerHeight,[...document.querySelectorAll('#couleurs-compagnies .pa-rangee .pa-cie')].map(e=>+e.dataset.paRang).slice(11,14)];}),
    [true,[12,1,2]],'20 compagnies : le panneau de la dernière tient dans la fenêtre ; après la douzième, les couleurs recommencent');
  await page.keyboard.press('Escape');
  await page.locator(CARTE+' summary').click();

  /* ---- 3 compagnies : par la prise du module ---------------------------------------------------------------------- */
  await page.evaluate(()=>OrlyPastilles.brancher({signature:()=>'trois compagnies fictives',compagnies:()=>['EST','NORD','OUEST'],classes:()=>[]}));
  await page.waitForFunction(()=>document.querySelectorAll('#couleurs-compagnies .pa-apercu > .pa-nom').length===3);
  bilan.push('3 compagnies ('+await verifierRepliee(page,3,'3 compagnies')+')');
  await s.fermer();

  /* ---- la fiche d'une équipe : les compagnies à cocher ------------------------------------------------------------ */
  s=await ouvrir(F.volsCsv(),'mu-services');page=s.page;
  const M='#mu-services';
  const service=await page.evaluate(()=>{const a=Sim.ateliers.state.ateliers.find(x=>x.type==='manuel'||!x.type)||Sim.ateliers.state.ateliers[0];return a.service;});
  await page.locator(`${M} [data-mu-choisir="${service}"]`).click();await page.waitForTimeout(300);
  await page.locator(`${M} [data-mu-nature="${service}"]`).selectOption('atelier');await page.waitForTimeout(400);
  await nav.equipe(page,await page.evaluate(x=>Sim.ateliers.state.ateliers.find(a=>a.service===x).id,service));
  await page.locator(`${M} .mu-atelier-cies label`).first().waitFor();
  const cases=await page.evaluate(()=>[...document.querySelectorAll('#mu-services .mu-atelier-cies label')].map(l=>{const e=l.querySelector('b .pa-cie');
    return [l.querySelector('input').dataset.muAtelierCie,e?e.dataset.paCle:null,e?+e.dataset.paRang:null,OrlyPastilles.rang(l.querySelector('input').dataset.muAtelierCie),l.querySelector('b').textContent];}));
  assert.ok(cases.length>=3,'la fiche de l’atelier liste ses compagnies à cocher');
  for(const [nom,cle,rang,attendu,texte] of cases)assert.deepEqual([cle,rang,texte],[nom,attendu,nom],'la compagnie à cocher '+nom+' porte sa pastille, à son rang, et son texte ne change pas');
  bilan.push(cases.length+' compagnies à cocher habillées');
  await s.fermer();

  assert.deepEqual(erreurs,[],'aucune erreur de page');
  console.log('OK couleurs-panneau : les vingt-quatre teintes de la demande, 4,5:1 chacune ; la carte dépliée — une rangée par compagnie, une pastille-bouton, « automatique » ou « gardée » ; le panneau — ancré, douze boutons radio, flèches, Échap, Entrée, clic ailleurs ; un choix au clavier ou à la souris écrit l’entrée d’avant, octet pour octet ; '+bilan.join(' ; ')+'.');
 }finally{await browser.close();}
})().catch(e=>{console.error('ÉCHEC couleurs-panneau :',e&&e.stack||e);process.exit(1);});

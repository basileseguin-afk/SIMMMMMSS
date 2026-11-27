/* Correction 24 (g), évolution 26 (c) — les couleurs des compagnies : douze teintes, choisies dans le panneau d'une
 * compagnie de « Commandes » (version 1), sur l'unité fictive, à 1 366 × 768. Avant l'évolution 26, elles se choisissaient
 * dans une carte du programme des vols ; la carte est partie, le panneau des douze teintes est dans « Commandes ».
 *   1. Les vingt-quatre teintes, dans l'ordre de la demande : dans le panneau, chaque teinte a sa couleur, et le texte
 *      d'une pastille posé dessus tient 4,5:1, en clair comme en sombre.
 *   2. La liste : une compagnie par groupe de rangées, sa pastille à son rang ; sans choix, les douze couleurs dans
 *      l'ordre des noms.
 *   3. Le panneau d'une compagnie : douze boutons radio dans un groupe, la teinte du moment cochée, seule dans l'ordre de
 *      tabulation. Les flèches vont d'une teinte à l'autre sans rien choisir ; Échap ferme le panneau et rend le focus à
 *      la compagnie. Entrée sur une teinte la choisit.
 *   4. Un choix, au clavier ou à la souris, écrit l'entrée d'avant cette évolution pour le même rang, octet pour octet
 *      (la fonction du module, inchangée) ; un choix déjà gardé reste au même rang et prend la teinte de ce rang.
 *   5. Avec 20 compagnies : après la douzième, les couleurs recommencent ; le panneau de la dernière tient dans la fenêtre.
 *   6. La pastille se pose aussi sur les compagnies à cocher de la fiche d'une équipe (un service à un seul atelier).
 * L'unité fictive, sans sa liste, prend ses compagnies dans les vols : les listes à 12 et à 20 compagnies viennent de
 * vols importés (7 et 15 noms de plus).
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const CLE='ory-couleurs-compagnies-v1';
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


(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 const ouvrir=async(csv,pageId='mu-commandes')=>{
  const ctx=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});
  const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
  const site=await F.charger(page,nav,URL_V1,{csv,pageId,sauvegarde:F.sauvegardeFictive({liste:false})});
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&window.OrlyPastilles&&Sim.commandes);
  return {page,fermer:async()=>{site.effacer();await ctx.close();}};
 };
 const garde=page=>page.evaluate(k=>localStorage.getItem(k),CLE);
 const theme=(page,t)=>page.evaluate(x=>{if(x==='sombre')document.documentElement.dataset.theme='sombre';else delete document.documentElement.dataset.theme;},t);
 const bilan=[];
 try{
  /* ---- 12 compagnies : la liste, le panneau, les choix ------------------------------------------------------------- */
  let s=await ouvrir(csvAvec(DE_PLUS.slice(0,7).concat(DE_L_UNITE)));
  let page=s.page;
  const M='#mu-commandes';
  await page.locator(M+' [data-co-ouvrir]').first().waitFor();
  const DOUZE=DE_PLUS.slice(0,7).concat(DE_L_UNITE).sort((a,b)=>a.localeCompare(b,'fr'));
  assert.equal(await garde(page),null,'sans choix, rien n’est écrit');
  // 2. La liste.
  assert.deepEqual(await page.locator(M+' [data-co-ouvrir]').evaluateAll(l=>l.map(e=>e.dataset.coOuvrir)),DOUZE,'une compagnie par groupe, par ordre alphabétique');
  const rangs=()=>page.locator(M+' [data-co-ouvrir] .pa-cie').evaluateAll(l=>l.map(e=>+e.dataset.paRang));
  assert.deepEqual(await rangs(),[1,2,3,4,5,6,7,8,9,10,11,12],'sans choix, les douze couleurs dans l’ordre');

  // 3. Le panneau de NORD.
  const compagnie=nom=>page.locator(M+' [data-co-ouvrir="'+nom+'"]');
  const panneau=page.locator(M+' .co-panneau[data-co-panneau="compagnie"]');
  await compagnie('NORD').click();await panneau.waitFor();
  const rangNord=DOUZE.indexOf('NORD')+1;
  const p=await page.evaluate(()=>{
   const x=document.querySelector('#mu-commandes .co-panneau'),q=x.getBoundingClientRect(),g=x.querySelector('[role=radiogroup]'),t=[...x.querySelectorAll('[data-pa-teinte]')];
   return {nom:x.dataset.coNom,groupe:g.getAttribute('aria-label'),radios:t.filter(e=>e.getAttribute('role')==='radio'&&e.tagName==='BUTTON').length,
     coches:t.filter(e=>e.getAttribute('aria-checked')==='true').map(e=>+e.dataset.paTeinte),arrets:t.filter(e=>e.tabIndex===0).map(e=>+e.dataset.paTeinte),
     dedans:q.left>=0&&q.top>=0&&q.right<=innerWidth&&q.bottom<=innerHeight,tailles:[...new Set(t.map(e=>{const k=e.getBoundingClientRect();return Math.round(k.width)+'×'+Math.round(k.height);}))],
     lignes:new Set(t.map(e=>Math.round(e.getBoundingClientRect().top))).size,defile:document.documentElement.scrollHeight>innerHeight};});
  assert.deepEqual([p.nom,p.groupe,p.radios,p.coches,p.arrets],['NORD','Couleur de NORD',12,[rangNord],[rangNord]],'le panneau de NORD : douze boutons radio dans un groupe, la teinte du moment cochée, seule dans l’ordre de tabulation');
  assert.deepEqual([p.dedans,p.tailles,p.lignes,p.defile],[true,['24×24'],2,false],'douze teintes de 24 px, sur deux lignes, dans la fenêtre ; la page ne défile pas');

  // 1. Les vingt-quatre teintes : la couleur de chacune, et le texte d'une pastille posé dessus.
  for(const [t,liste] of [['clair',CLAIR],['sombre',SOMBRE]]){
   await theme(page,t);await page.waitForTimeout(80);
   const lues=await page.evaluate(()=>{const e=document.querySelector('#mu-commandes [data-co-ouvrir] .pa-cie'),long=e.classList.contains('pa-long');
     return {encre:getComputedStyle(e,long?'::before':null).color,fonds:[...document.querySelectorAll('#mu-commandes .co-panneau [data-pa-teinte]')].map(b=>getComputedStyle(b).backgroundColor)};});
   assert.deepEqual(lues.fonds,liste.map(rvb),'les douze teintes du thème '+t+', dans l’ordre de la demande');
   const faibles=liste.map((h,i)=>[i+1,+contraste(rvb(h),lues.encre).toFixed(2)]).filter(x=>x[1]<4.5);
   assert.deepEqual(faibles,[],'le texte d’une pastille tient 4,5:1 sur chaque teinte ('+t+')');
   const pN=await page.evaluate(()=>{const e=document.querySelector('#mu-commandes [data-co-ouvrir="NORD"] .pa-cie'),long=e.classList.contains('pa-long');return getComputedStyle(e,long?'::before':null).backgroundColor;});
   assert.equal(pN,rvb(liste[rangNord-1]),'la pastille de NORD, au rang '+rangNord+', a sa teinte ('+t+')');
  }
  await theme(page,'clair');

  // 3. Au clavier : les flèches ne choisissent rien ; Échap ferme et rend le focus.
  const actif=()=>page.evaluate(()=>{const a=document.activeElement;return a.dataset.paTeinte||(a.dataset.coOuvrir?'compagnie '+a.dataset.coOuvrir:a.dataset.coChamp||a.tagName);});
  assert.equal(await actif(),'renommer','le panneau ouvert, le clavier est sur le nom');
  await page.locator(M+' .co-panneau [data-pa-teinte][tabindex="0"]').focus();
  assert.equal(await actif(),String(rangNord),'Tab mène à la teinte du moment');
  await page.keyboard.press('ArrowRight');assert.equal(await actif(),String(rangNord%12+1),'la flèche droite va à la teinte suivante');
  await page.keyboard.press('ArrowLeft');assert.equal(await actif(),String(rangNord),'la flèche gauche revient');
  await page.keyboard.press('Home');assert.equal(await actif(),'1','Début : la première');
  await page.keyboard.press('ArrowDown');assert.equal(await actif(),'7','la flèche bas descend d’une ligne');
  await page.keyboard.press('ArrowUp');assert.equal(await actif(),'1','la flèche haut remonte');
  await page.keyboard.press('End');assert.equal(await actif(),'12','Fin : la dernière');
  assert.equal(await garde(page),null,'se déplacer ne choisit rien');
  await page.keyboard.press('Escape');
  assert.deepEqual([await panneau.count(),await actif(),await compagnie('NORD').getAttribute('aria-pressed')],[0,'compagnie NORD','false'],'Échap ferme le panneau et rend le focus à la compagnie');
  assert.equal(await garde(page),null,'Échap ne choisit rien');

  // 4. Choisir au clavier : Entrée ouvre, les flèches vont à la teinte, Entrée la choisit.
  await page.keyboard.press('Enter');await panneau.waitFor();
  await page.locator(M+' .co-panneau [data-pa-teinte][tabindex="0"]').focus();
  await page.keyboard.press('Home');
  for(let i=1;i<9;i++)await page.keyboard.press('ArrowRight');
  assert.equal(await actif(),'9');
  await page.keyboard.press('Enter');
  await page.waitForFunction(k=>localStorage.getItem(k)!==null,CLE);
  assert.equal(await garde(page),ENVELOPPE({NORD:9}),'un choix au clavier écrit l’entrée d’avant, octet pour octet');
  await page.waitForFunction(()=>{const e=document.querySelector('#mu-commandes [data-co-ouvrir="NORD"] .pa-cie');return e&&e.dataset.paRang==='9';});
  assert.deepEqual([await panneau.count(),await actif(),await panneau.locator('[aria-checked="true"]').getAttribute('data-pa-teinte')],[1,'9','9'],'le panneau reste ouvert, la teinte choisie cochée, le clavier sur elle');
  // La même entrée que par la fonction du module.
  await page.evaluate(()=>{OrlyPastilles.revenirAuxAutomatiques();});
  await page.waitForFunction(k=>localStorage.getItem(k)===null,CLE);
  await page.evaluate(()=>{OrlyPastilles.choisirCouleur('NORD',9);});
  const parLeModule=await garde(page);
  await page.evaluate(()=>{OrlyPastilles.revenirAuxAutomatiques();});
  await page.waitForFunction(k=>localStorage.getItem(k)===null,CLE);
  // Choisir à la souris : la même entrée.
  await page.evaluate(()=>Sim.commandes.rendre());
  await panneau.locator('[data-pa-teinte="9"]').click();
  await page.waitForFunction(k=>localStorage.getItem(k)!==null,CLE);
  assert.equal(await garde(page),parLeModule,'un choix à la souris écrit la même entrée que le module');
  assert.equal(parLeModule,ENVELOPPE({NORD:9}));
  await compagnie('EST').click();await page.waitForFunction(()=>(document.querySelector('#mu-commandes .co-panneau')||{}).dataset?.coNom==='EST');
  await panneau.locator('[data-pa-teinte="4"]').click();
  await page.waitForFunction(k=>(localStorage.getItem(k)||'').includes('EST'),CLE);
  assert.equal(await garde(page),ENVELOPPE({EST:4,NORD:9}),'un second choix s’ajoute au premier, les compagnies par ordre alphabétique');
  // Un choix déjà gardé reste au même rang : il prend la teinte de ce rang, dans les deux thèmes.
  for(const [t,liste] of [['clair',CLAIR],['sombre',SOMBRE]]){
   await theme(page,t);await page.waitForTimeout(80);
   const fonds=await page.evaluate(()=>Object.fromEntries(['NORD','EST'].map(n=>{const e=document.querySelector('#mu-commandes [data-co-ouvrir="'+n+'"] .pa-cie'),long=e.classList.contains('pa-long');return [n,getComputedStyle(e,long?'::before':null).backgroundColor];})));
   assert.deepEqual(fonds,{NORD:rvb(liste[8]),EST:rvb(liste[3])},'un choix gardé au rang 9 (au rang 4) prend la teinte de ce rang ('+t+')');
  }
  await theme(page,'clair');
  // Ouvrir et fermer des panneaux n'écrit rien ; un second clic sur la compagnie ferme son panneau.
  await compagnie('SUD').click();await page.waitForFunction(()=>(document.querySelector('#mu-commandes .co-panneau')||{}).dataset?.coNom==='SUD');
  await compagnie('SUD').click();await panneau.waitFor({state:'detached'});
  assert.equal(await actif(),'compagnie SUD','un second clic sur la compagnie ferme son panneau, le focus reste sur elle');
  await compagnie('ZEN').click();await page.waitForFunction(()=>(document.querySelector('#mu-commandes .co-panneau')||{}).dataset?.coNom==='ZEN');
  await compagnie('SUD').click();await page.waitForFunction(()=>(document.querySelector('#mu-commandes .co-panneau')||{}).dataset?.coNom==='SUD');
  assert.equal(await page.locator(M+' .co-panneau').count(),1,'un seul panneau à la fois');
  assert.equal(await garde(page),ENVELOPPE({EST:4,NORD:9}),'ouvrir et fermer un panneau n’écrit rien');
  bilan.push('12 compagnies, deux choix gardés');
  await s.fermer();

  /* ---- 5. 20 compagnies ------------------------------------------------------------------------------------------- */
  s=await ouvrir(csvAvec(DE_PLUS.concat(DE_L_UNITE)));page=s.page;
  await page.locator(M+' [data-co-ouvrir]').first().waitFor();
  // (Les vols fictifs ne donnent un départ qu'à une partie des 20 noms : la liste montre celles qui ont des commandes.)
  const vingt=await page.locator(M+' [data-co-ouvrir]').evaluateAll(l=>l.map(e=>[e.dataset.coOuvrir,+e.querySelector('.pa-cie').dataset.paRang,OrlyPastilles.rang(e.dataset.coOuvrir)]));
  assert.ok(vingt.length>12,'plus de douze compagnies dans la liste ('+vingt.length+')');
  assert.deepEqual(vingt.map(x=>x[1]),vingt.map(x=>x[2]),'chaque pastille de la liste a le rang que le module lui donne');
  assert.ok(new Set(vingt.map(x=>x[1])).size<vingt.length&&vingt.every(x=>x[1]>=1&&x[1]<=12),'après la douzième, les couleurs recommencent');
  const derniere=page.locator(M+' [data-co-ouvrir]').last();
  await derniere.scrollIntoViewIfNeeded();await derniere.click();await page.locator(M+' .co-panneau').waitFor();
  assert.equal(await page.evaluate(()=>{const q=document.querySelector('#mu-commandes .co-panneau').getBoundingClientRect();return q.left>=0&&q.top>=0&&q.right<=innerWidth&&q.bottom<=innerHeight;}),true,
    '20 compagnies : le panneau de la dernière tient dans la fenêtre');
  bilan.push('20 compagnies');
  await s.fermer();

  /* ---- 6. la fiche d'une équipe : les compagnies à cocher ------------------------------------------------------------ */
  s=await ouvrir(F.volsCsv(),'mu-services');page=s.page;
  const S='#mu-services';
  const service=await page.evaluate(()=>{const a=Sim.ateliers.state.ateliers.find(x=>x.type==='manuel'||!x.type)||Sim.ateliers.state.ateliers[0];return a.service;});
  await page.locator(`${S} [data-mu-choisir="${service}"]`).click();await page.waitForTimeout(300);
  await page.locator(`${S} [data-mu-nature="${service}"]`).selectOption('atelier');await page.waitForTimeout(400);
  await nav.equipe(page,await page.evaluate(x=>Sim.ateliers.state.ateliers.find(a=>a.service===x).id,service));
  await page.locator(`${S} .mu-atelier-cies label`).first().waitFor();
  const cases=await page.evaluate(()=>[...document.querySelectorAll('#mu-services .mu-atelier-cies label')].map(l=>{const e=l.querySelector('b .pa-cie');
    return [l.querySelector('input').dataset.muAtelierCie,e?e.dataset.paCle:null,e?+e.dataset.paRang:null,OrlyPastilles.rang(l.querySelector('input').dataset.muAtelierCie),l.querySelector('b').textContent];}));
  assert.ok(cases.length>=3,'la fiche de l’atelier liste ses compagnies à cocher');
  for(const [nom,cle,rang,attendu,texte] of cases)assert.deepEqual([cle,rang,texte],[nom,attendu,nom],'la compagnie à cocher '+nom+' porte sa pastille, à son rang, et son texte ne change pas');
  bilan.push(cases.length+' compagnies à cocher habillées');
  await s.fermer();

  assert.deepEqual(erreurs,[],'aucune erreur de page');
  console.log('OK couleurs-panneau : les vingt-quatre teintes de la demande, 4,5:1 chacune ; dans « Commandes », chaque compagnie porte sa pastille à son rang ; son panneau — douze boutons radio, flèches, Échap, Entrée ; un choix au clavier ou à la souris écrit l’entrée d’avant, octet pour octet ; '+bilan.join(' ; ')+'.');
 }finally{await browser.close();}
})().catch(e=>{console.error('ÉCHEC couleurs-panneau :',e&&e.stack||e);process.exit(1);});

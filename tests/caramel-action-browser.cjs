/* Correction 24 (d) — le caramel pour l'action seule (version 1), sur l'unité fictive et un programme daté fictif, à
 * 1 366 × 768, dans les deux thèmes. Le constat, sur 16 écrans : deux boutons pleins sur 9 d'entre eux ; tous les
 * liens, les noms d'équipe et les flèches « … → » en caramel.
 *   1. Sur chaque page du menu, la fiche d'un service et celle d'une équipe : au plus un bouton au fond de l'accent
 *      (« Contrôles » à part). « Simuler la période » n'est plein que dans « Période », une seule fois ; « Importer des
 *      vols » dans « Programme », « Rejouer » dans « En direct », « + Ajouter une équipe » dans la fiche d'un service ;
 *      « + Ajouter un service » et « + Ajouter un chemin » sont des boutons de carte.
 *   2. « Contrôles » : plein pour un point bloquant, bouton de carte pour un point à corriger ou une information.
 *   3. Aucun lien n'a la couleur de l'accent au repos : l'encre du texte (`--ds-lien`), souligné d'un trait fin
 *      (`--ds-bordure-forte`) ; au survol et au focus, le texte et le trait passent à l'accent.
 *   4. Un bouton de carte a le fond de carte et un trait ; il garde ses 13 px et sa hauteur.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const CSV=F.volsDatesCsv(3,'2031-03-03');

/** Dans la page : les boutons au fond de l'accent, et les liens (leur couleur, leur soulignement). */
const RELEVE=()=>{
  const j=n=>{const s=document.createElement('span');s.style.color='var('+n+')';document.body.append(s);const v=getComputedStyle(s).color;s.remove();return v;};
  const J={accent:j('--ds-accent'),fort:j('--ds-accent-fort'),texte:j('--ds-accent-texte'),lien:j('--ds-lien'),encre:j('--ds-texte-1'),trait:j('--ds-bordure-forte'),carte:j('--ds-surface-1')};
  const vu=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';};
  const dit=e=>(e.textContent||e.getAttribute('aria-label')||'').trim().replace(/\s+/g,' ');
  // Un bouton : ce qui se presse. Plein : son fond est celui de l'accent.
  const pleins=[...document.querySelectorAll('button,summary,label.btn,a.btn,input[type=submit],input[type=button],[role=button]')]
    .filter(e=>vu(e)&&!e.closest('dialog')).filter(e=>{const c=getComputedStyle(e).backgroundColor;return c===J.accent||c===J.fort;})
    .map(e=>({texte:dit(e),niveau:(e.closest('[data-ct-niveau]')||{dataset:{}}).dataset.ctNiveau||null,dansPeriode:!!e.closest('#journee-periode')}));
  // Un lien : une ancre, ou un bouton qui en a l'allure (« lien-fort », « lien-discret », un nom d'équipe, un service).
  const liens=[...document.querySelectorAll('#workspace a[href],#view-accueil a[href],.lien-fort,.lien-discret,.se-eq-nom,.se-afaire-nom,.dq-service')]
    .filter(e=>vu(e)&&!e.matches('[aria-current],[aria-pressed="true"],.danger,.skip-link')&&!e.closest('.dq-critique,.dq-avertissement'))
    .map(e=>{const c=getComputedStyle(e);return {texte:dit(e).slice(0,40),classe:String(e.className).trim()||e.tagName.toLowerCase(),couleur:c.color,ligne:c.textDecorationLine,trait:c.textDecorationColor,epaisseur:c.textDecorationThickness};});
  return {J,pleins,liens};};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 const ctx=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});
 const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
 const site=await F.charger(page,nav,URL_V1,{csv:CSV,pageId:'j-chiffres'});
 await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.unite);
 try{
  const pages=await page.evaluate(()=>OrlyOnglets.entrees().flatMap(o=>o.pages||[o.id]));
  const bilan=[];let liensVus=0;
  for(const theme of ['clair','sombre']){
   const T=' ('+theme+')';
   await page.evaluate(t=>{if(t==='sombre')document.documentElement.dataset.theme='sombre';else delete document.documentElement.dataset.theme;},theme);
   /** Les règles communes à tous les écrans : au plus un bouton plein, des liens à l'encre, soulignés. */
   const ecran=async(nom,{plusieurs=false}={})=>{
    const r=await page.evaluate(RELEVE);
    assert.equal(r.J.lien,r.J.encre,'--ds-lien est l’encre du texte'+T);
    if(!plusieurs)assert.ok(r.pleins.length<=1,nom+T+' : au plus un bouton plein — '+JSON.stringify(r.pleins.map(p=>p.texte)));
    for(const l of r.liens){
     assert.ok(![r.J.accent,r.J.fort,r.J.texte].includes(l.couleur),nom+T+' : le lien « '+l.texte+' » ('+l.classe+') n’a pas la couleur de l’accent au repos');
     assert.equal(l.couleur,r.J.lien,nom+T+' : le lien « '+l.texte+' » ('+l.classe+') a l’encre du texte');
     assert.ok(/underline/.test(l.ligne),nom+T+' : le lien « '+l.texte+' » ('+l.classe+') est souligné');
     assert.equal(l.trait,r.J.trait,nom+T+' : le lien « '+l.texte+' » ('+l.classe+') est souligné du trait fin');
    }
    liensVus+=r.liens.length;
    return r;};
   const pleinsDe=r=>r.pleins.map(p=>p.texte);

   for(const id of pages){
    await nav.aller(page,id,id==='j-plan'?{relief:true,panneau:true}:undefined);
    const r=await ecran('« '+id+' »',{plusieurs:id==='mu-pas'});
    const barre=await page.evaluate(()=>{const b=[...document.querySelectorAll('#workspace button')].find(x=>x.getClientRects().length&&/^(Simuler|Relancer) la période$/.test(x.textContent.trim())&&!x.closest('#journee-periode'));return b?getComputedStyle(b).backgroundColor:null;});
    if(barre)assert.equal(barre,r.J.carte,'« '+id+' »'+T+' : « Simuler la période », dans la barre, est un bouton de carte');
    if(id==='j-periode'){assert.equal(r.pleins.length,1,'« Période »'+T+' : un seul bouton plein');assert.match(r.pleins[0].texte,/^(Simuler|Relancer) la période$/);assert.equal(r.pleins[0].dansPeriode,true,'il est dans la page, pas dans la barre');}
    else assert.ok(!pleinsDe(r).some(t=>/la période$/.test(t)),'« '+id+' »'+T+' : « Simuler la période » n’est plein que dans « Période »');
    if(id==='v-programme')assert.deepEqual(pleinsDe(r),['Importer des vols'],'« Programme »'+T);
    if(id==='j-plan')assert.deepEqual(pleinsDe(r),['Rejouer'],'« En direct »'+T);
    if(id==='mu-flux')assert.deepEqual(pleinsDe(r),[],'« Chemins »'+T+' : « + Ajouter un chemin » est un bouton de carte');
    if(id==='mu-services')assert.ok(!pleinsDe(r).some(t=>/Ajouter un service|Créer/.test(t)),'« Services et équipes »'+T+' : « + Ajouter un service » est un bouton de carte — '+JSON.stringify(pleinsDe(r)));
    if(id==='mu-commandes')assert.deepEqual(pleinsDe(r),['+ Ajouter une compagnie'],'« Commandes »'+T+' : « + Ajouter une compagnie » est le bouton plein');
   }
   await nav.aller(page,'j-plan');
   assert.deepEqual(pleinsDe(await ecran('« En direct » à plat')),['Rejouer'],'« En direct » à plat'+T);

   // La fiche d'un service, puis celle d'une équipe.
   await nav.aller(page,'mu-services');await page.evaluate(()=>Sim.unite.ouvrir('cuisine'));
   await page.waitForFunction(()=>[...document.querySelectorAll('#workspace button')].some(b=>b.getClientRects().length&&/Ajouter une équipe/.test(b.textContent)));
   const fiche=await ecran('la fiche d’un service');
   assert.deepEqual(pleinsDe(fiche),['+ Ajouter une équipe'],'la fiche d’un service'+T+' : « + Ajouter une équipe » est le bouton plein');
   const ajout=await page.evaluate(()=>{const s=[...document.querySelectorAll('#workspace summary')].find(x=>x.getClientRects().length&&/Ajouter un service/.test(x.textContent)),c=getComputedStyle(s);
     return {fond:c.backgroundColor,trait:c.borderTopColor,epais:c.borderTopWidth,taille:parseFloat(c.fontSize),hauteur:Math.round(s.getBoundingClientRect().height)};});
   assert.deepEqual([ajout.fond,ajout.trait,ajout.epais],[fiche.J.carte,fiche.J.trait,'1px'],'« + Ajouter un service » : le fond de carte, un trait'+T);
   assert.ok(ajout.taille>=13&&ajout.hauteur>=24,'« + Ajouter un service » : 13 px, 24 px de haut au moins'+T+' — '+JSON.stringify(ajout));
   assert.ok(fiche.liens.some(l=>/se-eq-nom/.test(l.classe)),'la fiche d’un service montre des noms d’équipe'+T);
   // Un bouton que la règle rétrograde (un script commun le dessine plein) garde l'anneau de focus d'un bouton.
   const anneau=await page.evaluate(async()=>{const jeton=(()=>{const s=document.createElement('span');s.style.boxShadow='var(--ds-focus)';document.body.append(s);const v=getComputedStyle(s).boxShadow;s.remove();return v;})();
     const b=document.createElement('button');b.type='button';b.className='btn btn-sm btn-play';b.textContent='essai';document.querySelector('#mu-services .se-fiche,#mu-services .mu-fiche').append(b);
     b.focus({focusVisible:true});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
     const c=getComputedStyle(b),lu={focus:b.matches(':focus-visible'),ombre:c.boxShadow,fond:c.backgroundColor,jeton};b.remove();return lu;});
   assert.deepEqual([anneau.focus,anneau.ombre,anneau.fond],[true,anneau.jeton,fiche.J.carte],'un bouton rétrogradé garde l’anneau de focus'+T);
   await page.evaluate(()=>Sim.unite.ouvrirEquipe('cu1'));
   await page.waitForFunction(()=>!!document.querySelector('#workspace [data-at-action]'));
   await ecran('la fiche d’une équipe');

   // 2. « Contrôles » : l'unité fictive a un point bloquant, des points à corriger et des informations.
   await nav.aller(page,'mu-pas');
   const controles=await ecran('« Contrôles »',{plusieurs:true});
   const points=await page.evaluate(()=>{const J=getComputedStyle(document.documentElement);return [...document.querySelectorAll('#workspace .ct-point')].filter(p=>p.getClientRects().length).map(p=>({niveau:p.closest('[data-ct-niveau]').dataset.ctNiveau,
     boutons:[...p.querySelectorAll('.ct-gestes button')].map(b=>getComputedStyle(b).backgroundColor)}));});
   assert.ok(points.some(p=>p.niveau==='bloquant')&&points.some(p=>p.niveau==='corriger'&&p.boutons.length),'« Contrôles »'+T+' : un point bloquant et des points à corriger — '+JSON.stringify(points.map(p=>p.niveau)));
   for(const p of points){
    if(p.niveau==='bloquant')assert.equal(p.boutons[0],controles.J.accent,'« Contrôles »'+T+' : le premier bouton d’un point bloquant est plein');
    else for(const b of p.boutons)assert.equal(b,controles.J.carte,'« Contrôles »'+T+' : un point « '+p.niveau+' » n’a que des boutons de carte');
    for(const b of p.boutons.slice(1))assert.equal(b,controles.J.carte,'« Contrôles »'+T+' : les boutons suivants d’un point sont des boutons de carte');
   }
   for(const p of controles.pleins)assert.equal(p.niveau,'bloquant','« Contrôles »'+T+' : un bouton plein est celui d’un point bloquant — « '+p.texte+' »');
   bilan.push(theme+' : '+points.filter(p=>p.niveau==='bloquant').length+' bloquant(s), '+points.filter(p=>p.niveau!=='bloquant').length+' autre(s)');

   // 3. Au survol et au focus, le lien passe à l'accent, texte et trait.
   await nav.aller(page,'j-chiffres');
   const lien=page.locator('#workspace .lien-fort:visible').first();
   await lien.hover();
   await page.waitForFunction(([e,a])=>getComputedStyle(e).color===a,[await lien.elementHandle(),controles.J.texte]);
   let c=await lien.evaluate(e=>{const s=getComputedStyle(e);return [s.color,s.textDecorationColor,s.textDecorationLine];});
   assert.deepEqual(c,[controles.J.texte,controles.J.texte,'underline'],'au survol, le lien passe à l’accent, texte et trait'+T);
   await page.mouse.move(2,2);
   await lien.focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');
   c=await lien.evaluate(e=>{const s=getComputedStyle(e);return [e===document.activeElement,e.matches(':focus-visible'),s.color,s.textDecorationColor];});
   assert.deepEqual(c,[true,true,controles.J.texte,controles.J.texte],'au focus, le lien passe à l’accent, texte et trait'+T);
   await page.evaluate(()=>document.activeElement&&document.activeElement.blur());
  }
  assert.ok(liensVus>=60,'des liens ont été vus sur les pages : '+liensVus);
  assert.deepEqual(erreurs,[],'aucune erreur de script : '+erreurs.join(' | '));
  console.log('OK caramel-action : dans les deux thèmes, sur '+pages.length+' pages du menu, « En direct » à plat, la fiche d’un service et celle d’une équipe — au plus un bouton plein par écran ; « Simuler la période » plein dans « Période » seulement, une fois ; « Importer des vols », « Rejouer », « + Ajouter une équipe » pleins ; « + Ajouter un service », « + Ajouter un chemin » en boutons de carte ; « Contrôles » : plein pour un point bloquant seulement ('+bilan.join(' ; ')+') ; '+liensVus+' liens à l’encre du texte, soulignés du trait fin, à l’accent au survol et au focus');
 }finally{site.effacer();await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

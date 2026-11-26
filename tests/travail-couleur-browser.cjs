/* Correction 24 (c) — un état, une couleur : « au travail » en bleu, partout (version 1), sur l'unité et les vols
 * fictifs, à 1 366 × 768, dans les deux thèmes. Le constat : depuis que l'accent est caramel, « au travail » était
 * caramel dans « En direct » et bleu dans le Planning ; dans « En direct », il touchait l'ocre de « attend ».
 *   1. Le jeton `--ds-travail` vaut `--ds-d1` dans les deux thèmes, et n'est pas l'accent ; son texte, `--ds-sur-travail`,
 *      s'y lit à 4,5:1.
 *   2. « En direct » à plat : la pastille « Au travail » de la légende et le fond d'une zone au travail ont ce bleu ;
 *      « attend » garde l'ocre, « a fini » le gris. Le nom du service tient 4,5:1 sur chaque zone colorée. Les pastilles
 *      du panneau « En ce moment » : « au travail » en bleu, « attend » en ocre, « a fini » en gris.
 *      Avant de relire la journée, « Équipe au travail » a le même bleu, sur le plan et dans sa légende.
 *   3. « En direct » en relief : la légende, le jeton de la scène (les personnages), la courbe du temps, la courbe de
 *      charge d'un service et sa clé.
 *   4. Le Planning : la courbe « au travail », sa clé, les barres des lots, leur clé « travail », le trait d'un lot ;
 *      l'étiquette d'une barre s'y lit à 4,5:1. La Synthèse : sa courbe et sa clé.
 *   5. La même couleur calculée dans le Planning et dans « En direct ». Aucun élément qui dit « au travail » n'a la
 *      couleur de l'accent. L'accent reste à ce qui se choisit : l'onglet choisi du Planning.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const sauvegarde=F.sauvegardeFictive(),CSV=F.volsCsv(),pic=F.heureDuPicAttendue(sauvegarde,CSV);
const lum=c=>{const [r,g,b]=(c.match(/[\d.]+/g)||[]).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});return 0.2126*r+0.7152*g+0.0722*b;};
const contraste=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05);};

/** Dans la page : la couleur calculée d'un jeton. */
const JETONS=noms=>{const j=n=>{const s=document.createElement('span');s.style.color='var('+n+')';document.body.append(s);const v=getComputedStyle(s).color;s.remove();return v;};
  return Object.fromEntries(noms.map(n=>[n,j(n)]));};
/** Dans la page : une propriété calculée du premier élément visible d'un sélecteur — à défaut le premier : une courbe
 *  plate n'a pas de boîte — (« sel::before » : son pseudo-élément). */
const COULEUR=([sel,prop])=>{const [s,pseudo]=sel.split('::'),tous=[...document.querySelectorAll(s)],e=tous.find(x=>x.getClientRects().length>0)||tous[0];
  return e?getComputedStyle(e,pseudo?'::'+pseudo:null)[prop]:null;};
/** Dans la page : tout ce qui dit « au travail » par sa classe (et ce qu'il contient), avec toutes ses couleurs. */
const DIT_TRAVAIL=()=>{const out=[],vu=e=>e.getClientRects().length>0;
  const els=new Set();for(const e of document.querySelectorAll('[class*="travail"]')){els.add(e);for(const x of e.querySelectorAll('*'))els.add(x);}
  for(const e of els){if(!vu(e))continue;
   for(const p of [null,'::before','::after']){const c=getComputedStyle(e,p);if(p&&c.content==='none')continue;
    out.push({qui:(e.tagName.toLowerCase()+'.'+String(e.className.baseVal??e.className).trim().replace(/\s+/g,'.')+(p||'')).slice(0,60),
     couleurs:[c.backgroundColor,c.borderTopColor,c.borderLeftColor,c.fill,c.stroke,c.color,c.outlineColor]});}}
  return out;};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 const ctx=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});
 const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
 const site=await F.charger(page,nav,URL_V1,{sauvegarde,csv:CSV,pageId:'j-plan'});
 try{
  const couleur=(sel,prop)=>page.evaluate(COULEUR,[sel,prop]);
  const bilan=[];
  for(const theme of ['clair','sombre']){
   const T=' ('+theme+')';
   await page.evaluate(t=>{if(t==='sombre')document.documentElement.dataset.theme='sombre';else delete document.documentElement.dataset.theme;},theme);
   const J=await page.evaluate(JETONS,['--ds-travail','--ds-sur-travail','--ds-d1','--ds-accent','--ds-attente','--ds-texte-4','--ds-retard']);
   const travail=J['--ds-travail'],sur=J['--ds-sur-travail'],accent=J['--ds-accent'];
   /** Aucun élément qui dit « au travail » n'a la couleur de l'accent. */
   const sansAccent=async ou=>{const l=await page.evaluate(DIT_TRAVAIL);assert.ok(l.length>0,ou+T+' : des éléments disent « au travail »');
    const fautifs=l.filter(x=>x.couleurs.includes(accent)).map(x=>x.qui);
    assert.deepEqual(fautifs,[],ou+T+' : rien de ce qui dit « au travail » n’a la couleur de l’accent');return l.length;};

   // 1. Le jeton.
   assert.equal(travail,J['--ds-d1'],'--ds-travail vaut --ds-d1'+T);
   assert.notEqual(travail,accent,'--ds-travail n’est pas l’accent'+T);
   assert.ok(contraste(sur,travail)>=4.5,'--ds-sur-travail se lit sur --ds-travail'+T+' : '+contraste(sur,travail).toFixed(2));

   // 2. « En direct » à plat, à l'heure du pic puis à deux autres heures : les états se relaient.
   await nav.aller(page,'j-plan');
   const vus=new Set();
   for(const t of [pic.t,pic.t-150,pic.t+210]){
    await page.evaluate(t=>Sim.vue.allerA(t),t);
    await page.waitForFunction(t=>Sim.vue.t===t&&!!document.querySelector('#plan .zone[class*=" s-"]'),t);
    const zones=await page.evaluate(()=>[...document.querySelectorAll('#plan .zone')].map(z=>{const m=z.className.baseVal.match(/\bs-(travail|attente|fini|avenir)\b/),f=z.querySelector('.fond'),n=z.querySelector('.titre');
      return m&&f&&n&&n.getClientRects().length?{etat:m[1],nom:n.textContent,fond:getComputedStyle(f).fill,titre:getComputedStyle(n).fill,halo:getComputedStyle(n).stroke}:null;}).filter(Boolean));
    for(const z of zones){
     vus.add(z.etat);
     assert.ok(contraste(z.titre,z.fond)>=4.5,'le nom « '+z.nom+' » sur sa zone « '+z.etat+' »'+T+' : '+contraste(z.titre,z.fond).toFixed(2)+':1 ('+z.titre+' sur '+z.fond+')');
     if(z.etat==='travail')assert.deepEqual([z.fond,z.titre,z.halo],[travail,sur,travail],'une zone au travail : le bleu du travail, son texte, son halo'+T);
     if(z.etat==='attente')assert.equal(z.fond,J['--ds-attente'],'une zone qui attend garde l’ocre'+T);
     if(z.etat==='fini')assert.equal(z.fond,J['--ds-texte-4'],'une zone qui a fini garde le gris'+T);
    }
   }
   assert.ok(vus.has('travail')&&vus.has('fini')&&vus.size>=3,'les états vus sur le plan'+T+' : '+[...vus].join(' '));
   await page.evaluate(t=>Sim.vue.allerA(t),pic.t);await page.waitForFunction(t=>Sim.vue.t===t,pic.t);
   const legende=await page.evaluate(()=>[...document.querySelectorAll('#legende-plan .pastille')].map(p=>[p.parentElement.querySelector('.lg-long').textContent,getComputedStyle(p).backgroundColor]));
   assert.deepEqual(legende.slice(0,3),[['Au travail',travail],['Attend le service d’avant',J['--ds-attente']],['A fini',J['--ds-texte-4']]],'la légende du plan'+T);
   // Les pastilles du panneau « En ce moment ».
   const pastilles=await page.evaluate(()=>[...document.querySelectorAll('#workspace .stat-atelier')].filter(b=>b.getClientRects().length).map(b=>{
     const e=b.querySelector('.stat-etat'),i=b.querySelector('.stat-ico'),c=e&&getComputedStyle(e);
     return {etat:(b.className.match(/etat-(\w+)/)||[])[1],mot:e?e.textContent.trim():'',texte:c?c.color:null,fond:c?c.backgroundColor:null,ico:i?getComputedStyle(i).backgroundColor:null,sur:getComputedStyle(b.closest('.card,.panel,aside,section')||document.body).backgroundColor};}));
   const auTravail=pastilles.filter(p=>p.etat==='travail');
   assert.ok(auTravail.length>0,'le panneau a des services au travail'+T+' : '+JSON.stringify(pastilles.map(p=>p.etat)));
   for(const p of auTravail){
    assert.equal(p.ico,travail,'la pastille d’un service au travail : son icône sur le bleu du travail'+T);
    assert.notEqual(p.texte,accent,'le mot « '+p.mot+' » n’a pas la couleur de l’accent'+T);
   }
   for(const p of pastilles.filter(p=>p.etat==='attente'))assert.equal(p.ico,J['--ds-attente'],'« attend » garde l’ocre dans le panneau'+T);
   for(const p of pastilles.filter(p=>p.etat==='fini'))assert.notEqual(p.ico,travail,'« a fini » n’a pas le bleu du travail'+T);
   let n=await sansAccent('« En direct » à plat');
   // Avant de relire la journée (l'horloge à son début) : « Équipe au travail », sur le plan et dans sa légende.
   await page.evaluate(()=>Sim.vue.allerA(Sim.vue.debut));
   await page.waitForFunction(()=>document.body.classList.contains('avant-lancement')&&/Équipe au travail/.test(document.getElementById('legende-plan').textContent));
   const avant=await page.evaluate(()=>{const p=[...document.querySelectorAll('#legende-plan > span')].find(x=>/Équipe au travail/.test(x.textContent)),z=document.querySelector('#plan .zone.p-pret:not(.couleur-perso) .fond');
     return {puce:getComputedStyle(p.querySelector('.pastille')).backgroundColor,trait:z?getComputedStyle(z).stroke:null,fond:z?getComputedStyle(z).fill:null};});
   assert.deepEqual(avant,{puce:travail,trait:travail,fond:travail},'avant de relire : « Équipe au travail » a le bleu du travail'+T);
   await page.evaluate(t=>Sim.vue.allerA(t),pic.t);await page.waitForFunction(t=>Sim.vue.t===t&&!document.body.classList.contains('avant-lancement'),pic.t);

   // 3. « En direct » en relief.
   await nav.aller(page,'j-plan',{relief:true,panneau:true});
   await page.waitForFunction(()=>!!document.querySelector('.direct-legende .dl-travail')&&!!document.querySelector('.dt-aire'));
   assert.equal(await couleur('.direct-legende .dl-travail','backgroundColor'),travail,'la légende de la vue en relief'+T);
   assert.equal(await page.evaluate(()=>{const s=document.createElement('span');s.style.color='var(--dv-travail)';document.getElementById('direct').append(s);const v=getComputedStyle(s).color;s.remove();return v;}),travail,'les personnages au travail : le jeton de la scène'+T);
   assert.equal(await couleur('.dt-aire','stroke'),travail,'la courbe du temps'+T);
   await page.locator('#direct-panneau-corps [data-direct-service]').first().click();
   await page.waitForSelector('#direct-panneau-corps .dp-courbe .dp-aire',{state:'attached'});
   assert.equal(await couleur('#direct-panneau-corps .dp-aire','stroke'),travail,'la courbe de charge d’un service'+T);
   assert.equal(await couleur('#direct-panneau-corps .dp-cle-travail','borderTopColor'),travail,'et sa clé « au travail »'+T);
   n+=await sansAccent('« En direct » en relief');
   await page.keyboard.press('Escape');

   // 4. Le Planning, puis la Synthèse.
   await nav.aller(page,'at-planning');
   await page.locator('#workspace button.btn-sm',{hasText:/^Tout déplier$/}).click();
   await page.waitForSelector('#workspace .pg-lot .pg-seg');
   if(!(await page.locator('#workspace .pg-legende .pg-cle').first().isVisible()))await page.locator('#workspace .pg-legende-bouton').click();
   const planning={courbe:await couleur('#workspace .ch-travail','stroke'),cle:await couleur('#workspace .pg-ex.autravail','borderTopColor'),
     barre:await couleur('#workspace .pg-lot .pg-seg','fill'),cleBarre:await couleur('#workspace .pg-ex.travail','backgroundColor'),
     trait:await couleur('#workspace .pg-trait:not(.retard)','stroke'),etiquette:await couleur('#workspace .pg .at-pl-etiq','fill')};
   assert.deepEqual(planning,{courbe:travail,cle:travail,barre:travail,cleBarre:travail,trait:travail,etiquette:sur},'le Planning'+T);
   assert.notEqual(await couleur('#workspace .pg-onglet[aria-pressed="true"]','color'),travail,'l’onglet choisi garde l’accent'+T);
   n+=await sansAccent('le Planning');
   await nav.aller(page,'j-chiffres');
   await page.waitForSelector('#workspace .sy-l-travail');
   assert.equal(await couleur('#workspace .sy-l-travail::before','borderTopColor'),travail,'la clé de la courbe de la Synthèse'+T);
   assert.equal(await couleur('#workspace .ch-travail','stroke'),travail,'la courbe de la Synthèse'+T);
   n+=await sansAccent('la Synthèse');

   // 5. La même couleur dans le Planning et dans « En direct » : celle du jeton, relevée sur les deux pages.
   assert.equal(planning.courbe,legende[0][1],'la même couleur calculée dans le Planning et dans « En direct »'+T);
   bilan.push(theme+' '+travail+' ('+n+' éléments)');
  }
  assert.deepEqual(erreurs,[],'aucune erreur de script : '+erreurs.join(' | '));
  console.log('OK travail-couleur : dans les deux thèmes — '+bilan.join(' ; ')+' — --ds-travail vaut --ds-d1 et n’est pas l’accent ; à plat : la légende, les zones (nom à 4,5:1 sur chaque zone colorée), les pastilles du panneau ; en relief : la légende, le jeton des personnages, la courbe du temps, la courbe d’un service ; le Planning : la courbe, les barres, leurs clés, le trait d’un lot ; la Synthèse ; la même couleur dans le Planning et « En direct » ; rien de ce qui dit « au travail » n’a la couleur de l’accent');
 }finally{site.effacer();await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

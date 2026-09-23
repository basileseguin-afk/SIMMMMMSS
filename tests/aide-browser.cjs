/* L'aide repliée. Chaque panneau s'ouvrait sur une explication, toutes au même
 * niveau visuel que les champs : 574 mots en permanence sur le seul Centre des
 * réglages, et l'œil ne savait plus où était le geste à faire.
 *
 * Ce parcours tient la règle : ce qui reste visible guide le geste, le reste
 * est à un clic. Sans lui, les paragraphes reviendraient un par un. */
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(160);

 /* Le texte RÉELLEMENT lisible d'une vue. `offsetParent` ne suffit pas : un
  * <details> replié n'est pas en `display:none` dans Chromium, et comptait
  * donc son contenu comme visible. */
 const texte=(vue)=>page.evaluate(n=>{
   const el=document.getElementById('view-'+n);
   const blocs=[...el.querySelectorAll('p,div.mini-note,.at-mat-tete span')]
     .filter(e=>e.checkVisibility&&e.checkVisibility()&&e.getClientRects().length>0);
   // `textContent` ramasse aussi ce qui dort dans une aide repliée : on ôte
   // les corps d'aide avant de compter, sinon on mesure l'inverse de la règle.
   const lisible=b=>{const c=b.cloneNode(true);
     c.querySelectorAll('.aide').forEach(a=>a.remove());
     return (c.textContent||'').trim().replace(/\s+/g,' ');};
   const mots=b=>lisible(b).split(' ').filter(Boolean).length;
   return { mots: blocs.reduce((s,b)=>s+mots(b),0),
            longs: blocs.filter(b=>mots(b)>=25).map(b=>lisible(b).slice(0,60)) };
 },vue);

 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await attendre();

  // 1. Aucune vue n'impose un pavé de texte. Vingt-cinq mots, c'est déjà deux
  //    lignes pleines : au-delà, on ne lit plus, on saute.
  for(const vue of ['ateliers','flux','reglages']){
    await page.locator(`[data-view=${vue}]`).click();await attendre();
    const t=await texte(vue);
    assert.deepEqual(t.longs,[],`« ${vue} » ne doit imposer aucun pavé — trouvé : `+t.longs.join(' / '));
    assert.ok(t.mots<260,`« ${vue} » : ${t.mots} mots visibles, c'est trop`);
  }

  // 2. Rien n'est perdu : l'explication est derrière le « ? », à un clic.
  await page.locator('[data-view=reglages]').click();await attendre();
  const aide=page.locator('#rg-bareme-panneau .aide').first();
  const corps=aide.locator('.aide-corps');
  assert.equal(await corps.isVisible(),false,'repliée au départ');
  await aide.locator('summary').click();await attendre();
  assert.equal(await corps.isVisible(),true,'le « ? » l’ouvre');
  assert.match(await corps.textContent(),/multiplie par le\s+nombre de vols/,'et le texte complet est là');

  // 3. Ouvrir une aide ne déplace RIEN. Dans le fil du texte, le corps
  //    grossissait la ligne qui le portait et faisait sauter tout le panneau.
  const bouger=async(fn)=>{
    const avant=await page.locator('#rg-bareme').boundingBox();
    await fn();await attendre();
    const apres=await page.locator('#rg-bareme').boundingBox();
    return Math.abs(avant.y-apres.y)+Math.abs(avant.x-apres.x);
  };
  await aide.locator('summary').click();await attendre();   // refermer
  assert.equal(await bouger(()=>aide.locator('summary').click()),0,
    'ouvrir l’aide ne doit pas décaler le tableau du barème');
  await aide.locator('summary').click();await attendre();

  // 4. Un <details> ne peut pas vivre dans un <p> : le navigateur refermerait
  //    le paragraphe, et le « ? » tomberait à la ligne.
  const mauvais=await page.evaluate(()=>[...document.querySelectorAll('.aide')]
    .filter(d=>d.parentElement&&['P','H1','H2','H3','H4'].includes(d.parentElement.tagName))
    .map(d=>d.parentElement.tagName+' : '+d.parentElement.textContent.trim().slice(0,40)));
  assert.deepEqual(mauvais,[],'une aide ne doit pas être imbriquée dans un titre ou un paragraphe');

  // 5. Chaque « ? » se nomme pour qui ne voit pas l'écran.
  const anonymes=await page.evaluate(()=>[...document.querySelectorAll('.aide>summary')]
    .filter(s=>!s.getAttribute('aria-label')&&s.textContent.trim().length<3).length);
  assert.equal(anonymes,0,'un « ? » sans libellé ne dit rien à un lecteur d’écran');

  // 6. Rien ne déborde, y compris avec une bulle ouverte sur le plus petit écran visé.
  await page.setViewportSize({width:1024,height:700});await attendre();
  await page.locator('#rg-bareme-panneau .aide').first().locator('summary').click();await attendre();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,
    'une bulle ouverte ne doit pas allonger la page');

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('aide-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

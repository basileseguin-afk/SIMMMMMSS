/* Le focus se voit partout (refonte du 08/10, étape 2) : au clavier, chaque
 * élément atteint par Tab — dans la barre latérale, la barre du haut, les
 * outils de la page et la page elle-même — porte un anneau (un contour, ou
 * une ombre portée de couleur). Toutes les pages, dans les deux thèmes, v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

// Ce que montre l'élément qui a le focus : un contour, ou un anneau en ombre.
// Dans un diagramme, un nœud le montre par son trait, qui s'épaissit, et un
// lien par une bande d'accent derrière lui (graphe.css) : on les lit.
const ANNEAU=()=>{const e=document.activeElement;if(!e||e===document.body)return null;
  const s=getComputedStyle(e),r=e.getBoundingClientRect();
  const contour=s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>=1;
  // Une ombre ne vaut anneau que si elle en a la forme : pleine, autour de l'élément (0 0 0 Npx).
  const ombre=/0px 0px 0px [1-9]/.test(s.boxShadow);
  const trait=sel=>{const t=e.querySelector(sel);return t?parseFloat(getComputedStyle(t).strokeWidth):0;};
  const bande=()=>{const t=e.querySelector('.gr-prise');const c=t&&getComputedStyle(t).stroke;return !!c&&c!=='none'&&!/^(transparent|rgba\([^)]*,\s*0\))$/.test(c);};
  const diagramme=e.matches('.gr-noeud')?trait('.gr-fond')>=3:e.matches('.gr-lien')?bande():false;
  const classes=(e.getAttribute('class')||'').trim().split(/\s+/).filter(Boolean).join('.');
  const nom=(e.id?'#'+e.id:e.tagName.toLowerCase()+(classes?'.'+classes:''))
    +(e.dataset.sousOnglet?'['+e.dataset.sousOnglet+']':'')+(e.dataset.versPartie?'['+e.dataset.versPartie+']':'');
  return {nom,anneau:contour||ombre||diagramme,visible:r.width>0&&r.height>0};};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 // Sans mouvement (le site respecte ce réglage) : l'anneau se lit dès le Tab,
 // pas au milieu d'une transition.
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=120)=>page.waitForTimeout(ms);
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre(300);
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(300);
   const pages=await page.evaluate(()=>OrlyOnglets.PARTIES.flatMap(p=>p.pages.map(x=>x.id)));
   for(const theme of ['clair','sombre']){
    if(theme==='sombre'){await page.locator('#btn-theme').click();await attendre();
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'sombre',version+' : le thème sombre se choisit');}
    const fautes=[];let vus=0;
    for(const id of ['accueil',...pages]){
     if(id==='accueil')await nav.accueil(page);else await nav.aller(page,id);
     // On part du haut de la page, comme au clavier : la barre latérale, puis le reste.
     await page.evaluate(()=>{document.activeElement&&document.activeElement.blur();});
     for(let k=0;k<26;k++){
      await page.keyboard.press('Tab');
      const a=await page.evaluate(ANNEAU);if(!a)continue;vus++;
      if(!a.anneau&&a.visible)fautes.push(id+' : '+a.nom);
     }
     // Échap referme ce qu'un Tab aurait ouvert (une fenêtre de case).
     await page.keyboard.press('Escape');
    }
    assert.ok(vus>pages.length*10,version+' '+theme+' : le parcours au clavier atteint bien les éléments ('+vus+')');
    assert.deepEqual([...new Set(fautes)],[],version+' '+theme+' : un focus sans anneau');
   }
   // Le thème est une préférence : il revient au rechargement, sans rien changer d'autre.
   await page.reload();await attendre(300);
   assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'sombre',version+' : le thème choisi est retenu');
   assert.equal(await page.locator('#btn-theme').getAttribute('aria-pressed'),'true');
   await page.locator('#btn-theme').click();await attendre();
   assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme||'clair'),'clair');
   assert.equal(await page.evaluate(()=>localStorage.getItem('ory-ui-theme')),null,version+' : revenu au clair, la préférence s’efface');
  }
  assert.deepEqual(errors,[],errors.join(' | '));
  console.log('focus-browser : ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

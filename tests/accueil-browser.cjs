/* La page d'entrée (accueil.html, refonte du 12/10) : elle prend le design
 * system du site (ds.css) sans prendre la coquille de l'application.
 *   1. Elle se lit comme un document : elle défile, rien ne déborde à 390 px.
 *   2. Les jetons du système, la police, les deux thèmes (celui choisi dans
 *      l'application, gardé sous ory-ui-theme).
 *   3. Les deux applications au clavier, avec l'anneau de focus du système.
 *   4. Elle n'écrit rien : ni donnée, ni préférence. */
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('requestfailed',r=>errors.push('requête en échec : '+r.url()));
 const url=pathToFileURL(path.resolve(__dirname,'../accueil.html')).href;
 const ouvrir=async(theme,[l,h])=>{
   await page.setViewportSize({width:l,height:h});
   await page.goto(url);
   await page.evaluate(t=>{localStorage.clear();if(t)localStorage.setItem('ory-ui-theme',t);},theme);
   await page.reload();await page.evaluate(()=>document.fonts.ready);
 };
 const mesure=()=>page.evaluate(()=>{
   const d=document.documentElement,b=getComputedStyle(document.body);
   window.scrollTo(0,1e6);const defile=window.scrollY;window.scrollTo(0,0);
   return {theme:d.dataset.theme||'',display:b.display,fond:b.backgroundColor,
     jeton:getComputedStyle(d).getPropertyValue('--ds-fond').trim(),
     police:b.fontFamily,inter:[...document.fonts].some(f=>/Inter/.test(f.family)&&f.status==='loaded'),
     haut:d.scrollHeight,vue:d.clientHeight,large:d.scrollWidth,ecran:d.clientWidth,defile,
     cles:Object.keys(localStorage).sort()};
 });
 /** La luminance relative d'une couleur « rgb(r, g, b) ». */
 const luminance=c=>{const [r,g,b]=c.match(/\d+(\.\d+)?/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;});
   return .2126*r+.7152*g+.0722*b;};
 try{
  // 1 et 2. Clair par défaut, sur un écran de bureau puis de téléphone.
  await ouvrir(null,[1280,800]);
  let m=await mesure();
  assert.equal(m.theme,'','clair par défaut');
  assert.ok(m.jeton,'les jetons du design system sont chargés (ds.css)');
  assert.equal(m.display,'block','un document, pas la grille de l’application');
  assert.ok(luminance(m.fond)>.8,'fond clair '+m.fond);
  assert.match(m.police,/^"Inter Variable"/,'la police du système');
  assert.ok(m.inter,'la police est chargée');
  assert.ok(m.large<=m.ecran,'rien ne déborde en largeur');
  const clair=m.fond;
  await ouvrir(null,[390,640]);
  m=await mesure();
  assert.ok(m.haut>m.vue&&m.defile>0,'la page défile sur un téléphone '+JSON.stringify(m));
  assert.ok(m.large<=m.ecran,'rien ne déborde à 390 px ('+m.large+' > '+m.ecran+')');
  const titre=await page.evaluate(()=>{const r=document.querySelector('h1').getBoundingClientRect();return r.right<=innerWidth&&r.left>=0;});
  assert.ok(titre,'le titre tient dans l’écran');
  assert.deepEqual(m.cles,[],'rien n’est écrit');

  // Le thème sombre choisi dans l'application.
  await ouvrir('sombre',[1280,800]);
  m=await mesure();
  assert.equal(m.theme,'sombre','le thème sombre de l’application');
  assert.notEqual(m.fond,clair,'un autre fond');
  assert.ok(luminance(m.fond)<.05,'fond sombre '+m.fond);
  assert.deepEqual(m.cles,['ory-ui-theme'],'la préférence est lue, rien d’autre n’est écrit');
  assert.equal(await page.evaluate(()=>localStorage.getItem('ory-ui-theme')),'sombre','et elle est gardée telle quelle');

  // 3. Les deux applications, au clavier.
  await ouvrir(null,[1280,800]);
  const liens=await page.$$eval('a.ap-app',a=>a.map(x=>({href:x.getAttribute('href'),titre:x.querySelector('h2').textContent})));
  assert.deepEqual(liens.map(l=>l.href),['./','v2/'],'la version 1 puis la version 2');
  assert.match(liens[0].titre,/Simulateur des flux de production/);
  assert.match(liens[1].titre,/Version 2/);
  await page.keyboard.press('Tab');
  const focus=await page.evaluate(()=>{const a=document.activeElement;return {classe:a.className,ombre:getComputedStyle(a).boxShadow,visible:a.matches(':focus-visible')};});
  assert.equal(focus.classe,'ap-app','Tab arrive sur la première application');
  assert.ok(focus.visible&&focus.ombre!=='none','avec l’anneau de focus '+focus.ombre);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('href')),'v2/','puis la version 2');
  // Les icônes sont décoratives : le nom de l'application suffit.
  assert.equal(await page.$$eval('.ap-ico',x=>x.every(i=>i.getAttribute('aria-hidden')==='true')),true,'les icônes sont muettes');

  assert.deepEqual(errors,[],errors.join(' | '));
  console.log('accueil-browser : ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

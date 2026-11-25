/* La page d'entrée (accueil.html, refonte du 12/10) : elle prend le design
 * system du site (ds.css) sans prendre la coquille de l'application.
 *   1. Elle se lit comme un document : elle défile, rien ne déborde à 390 px.
 *   2. Les jetons du système, la police, les deux thèmes (celui choisi dans
 *      l'application, gardé sous ory-ui-theme).
 *   3. Les deux applications au clavier, avec l'anneau de focus du système.
 *   4. Elle n'écrit rien : ni donnée, ni préférence.
 *   5. Le nouveau visuel (évolution 25 f), dans les deux thèmes : elle charge la feuille de la version 1 (visuel.css) ;
 *      ses cartes (14 px, l'ombre des cartes, élevées au survol si elles se cliquent) et ses titres de bloc (en
 *      minuscules, 13 px) suivent la coquille ; aucun texte sous 13 px ; le titre de l'onglet et les textes ne changent
 *      pas. */
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 // Une requête annulée par un rechargement (le test en fait) n'est pas un fichier
 // manquant : une police encore en route quand la page se recharge le serait.
 page.on('requestfailed',r=>{const f=(r.failure()||{}).errorText;if(f!=='net::ERR_ABORTED')errors.push('requête en échec : '+r.url()+' ('+f+')');});
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


  // 5. Le nouveau visuel (évolution 25 f), dans les deux thèmes : la page charge la feuille de la version 1 ; ses
  // cartes et ses titres suivent la coquille (b) ; le titre de l'onglet et les textes ne changent pas.
  const textes={};
  for(const [theme,fond,encre,accent] of [[null,'rgb(251, 248, 246)','rgb(42, 31, 35)','rgb(185, 91, 15)'],['sombre','rgb(22, 17, 19)','rgb(242, 234, 236)','rgb(240, 138, 75)']]){
    const T=(theme||'clair')+' : ';
    await ouvrir(theme,[1280,800]);
    const v=await page.evaluate(()=>{
      const cs=e=>getComputedStyle(e),s=document.createElement('i');document.body.appendChild(s);
      const jeton=n=>{s.style.color='';s.style.boxShadow='';s.style.color='var(--'+n+')';return cs(s).color;};
      const ombre=n=>{s.style.boxShadow='var(--'+n+')';return cs(s).boxShadow;};
      const carte=document.querySelector('a.ap-app'),bloc=document.querySelector('.ap-bloc'),titre=bloc.querySelector('h3');
      // L'espacement des lettres, rapporté à la taille du texte : celui des titres du système, jamais élargi.
      const em=e=>(Math.round((parseFloat(cs(e).letterSpacing)||0)/parseFloat(cs(e).fontSize)*1000)/1000);
      const out={feuilles:[...document.querySelectorAll('link[rel=stylesheet]')].map(l=>l.getAttribute('href').split('?')[0]),
        fond:cs(document.body).backgroundColor,encre:cs(document.body).color,accent:jeton('ds-accent'),
        carte:{rayon:cs(carte).borderTopLeftRadius,ombre:cs(carte).boxShadow,fond:cs(carte).backgroundColor},
        bloc:{rayon:cs(bloc).borderTopLeftRadius,ombre:cs(bloc).boxShadow},
        titre:{casse:cs(titre).textTransform,taille:cs(titre).fontSize,graisse:cs(titre).fontWeight,espace:em(titre)<=0?'pas d’espacement ajouté':em(titre)+' em',couleur:cs(titre).color},
        jetons:{carte:jeton('ds-surface-1'),gris:jeton('ds-texte-3'),ombre:ombre('ds-ombre-carte'),survol:ombre('ds-ombre-carte-survol')},
        capitales:[...document.querySelectorAll('body *')].filter(e=>e.getClientRects().length&&cs(e).textTransform==='uppercase').map(e=>e.tagName),
        petits:[...document.querySelectorAll('body *')].filter(e=>e.getClientRects().length&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&parseFloat(cs(e).fontSize)<13).map(e=>e.tagName+' '+cs(e).fontSize),
        onglet:document.title,texte:document.body.innerText.replace(/\s+/g,' ').trim()};
      s.remove();return out;});
    assert.deepEqual(v.feuilles,['ds.css','visuel.css'],T+'ds.css, puis la feuille du visuel');
    assert.deepEqual([v.fond,v.encre,v.accent],[fond,encre,accent],T+'le fond, l’encre et l’accent du nouveau visuel');
    assert.deepEqual([v.carte.rayon,v.carte.fond,v.carte.ombre],['14px',v.jetons.carte,v.jetons.ombre],T+'une carte : 14 px, le fond de carte, l’ombre des cartes');
    assert.deepEqual([v.bloc.rayon,v.bloc.ombre],['14px',v.jetons.ombre],T+'un bloc est une carte comme les autres');
    assert.deepEqual([v.titre.casse,v.titre.taille,v.titre.graisse,v.titre.espace,v.titre.couleur],['none','13px','500','pas d’espacement ajouté',v.jetons.gris],T+'un titre de bloc : en minuscules, 13 px, graisse 500, sans lettres espacées, le troisième gris');
    assert.deepEqual(v.capitales,[],T+'aucune capitale forcée');
    assert.deepEqual(v.petits,[],T+'aucun texte sous 13 px');
    // Une carte qui se clique s'élève au survol ; un bloc, non.
    await page.locator('a.ap-app').first().hover();
    // La transition finie (un état attendu, pas un délai : une machine chargée la finit plus tard).
    await page.waitForFunction(o=>getComputedStyle(document.querySelector('a.ap-app')).boxShadow===o,v.jetons.survol,{timeout:5000}).catch(()=>{});
    assert.equal(await page.locator('a.ap-app').first().evaluate(e=>getComputedStyle(e).boxShadow),v.jetons.survol,T+'une application, au survol : l’ombre des cartes survolées');
    await page.locator('.ap-bloc').first().hover();await page.waitForTimeout(400);
    assert.equal(await page.locator('.ap-bloc').first().evaluate(e=>getComputedStyle(e).boxShadow),v.jetons.ombre,T+'un bloc ne s’élève pas');
    await page.mouse.move(0,0);
    assert.equal(v.onglet,'ORY — Applications',T+'le titre de l’onglet ne change pas');
    textes[theme||'clair']=v.texte;
  }
  assert.equal(textes.clair,textes.sombre,'les mêmes textes dans les deux thèmes');
  assert.match(textes.clair,/^ORY — Applications Point d'entrée du projet\. Rien à télécharger : tout s'ouvre dans le navigateur\. Simulateur des flux de production /,'les textes de la page sont ceux d’avant');
  assert.match(textes.clair,/Ouvrir n'importe quel autre fichier .* À savoir Le dépôt est public\./,'les titres des blocs sont écrits comme avant, sans capitales forcées');

  assert.deepEqual(errors,[],errors.join(' | '));
  console.log('accueil-browser : ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

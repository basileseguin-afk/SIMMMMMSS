/* Évolution 25 (a) — les jetons du nouveau visuel, tels que la page les reçoit (version 1), dans les deux thèmes.
 * La feuille neuve (visuel.css) redéfinit les jetons de ds.css sans la modifier : c'est la cascade qui décide, et la
 * force des sélecteurs compte. Ce test lit donc les valeurs calculées, dans le navigateur.
 *   1. index.html, thème clair : le fond chaud, l'encre, l'accent caramel, le menu bordeaux, les rayons.
 *   2. Les classes ont leur couleur dans les deux thèmes : Équipage d1, Économie d2, Premium d3, Business d4, repas
 *      spéciaux d6 ; les retours de matériel gardent leur violet (d3).
 *   3. Thème sombre : ses surfaces, son accent ; la navigation reste branchée sur les surfaces du thème.
 *   4. lisible.css garde le dernier mot : les deux plus petites tailles de texte valent toujours 13 px.
 *   5. accueil.html prend les mêmes jetons ; la version 2 garde les siens.
 * Aucune donnée : la page s'ouvre sur son exemple. */
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const adresse=f=>pathToFileURL(path.resolve(__dirname,'..',f)).href;
const rvb=h=>'rgb('+[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)).join(', ')+')';

/** Dans la page : des jetons, et la couleur calculée de quelques variables posées sur un élément d'essai. */
const LIRE=([jetons,couleurs])=>{
  const cs=getComputedStyle(document.documentElement),sonde=document.createElement('i');document.body.appendChild(sonde);
  const out={theme:document.documentElement.dataset.theme||null,jetons:{},couleurs:{},fond:getComputedStyle(document.body).backgroundColor,texte:getComputedStyle(document.body).color};
  for(const j of jetons)out.jetons[j]=cs.getPropertyValue('--'+j).trim().toUpperCase();
  for(const c of couleurs){sonde.style.color='var(--'+c+')';out.couleurs[c]=getComputedStyle(sonde).color;}
  sonde.remove();
  const barre=document.querySelector('body>.barre');
  if(barre){sonde.style.color='';const b=getComputedStyle(barre);out.barre={fond:b.backgroundColor,image:b.backgroundImage};}
  return out;
};
const JETONS=['ds-fond','ds-surface-1','ds-texte-1','ds-accent','ds-accent-pale','ds-nav-repere','ds-d1','ds-d4','ds-saisi-fond','ds-r-2','ds-r-3','ds-t-11','ds-t-12'];
const COULEURS=['ds-nav-fond','ds-nav-fond-bas','ds-nav-texte-1','cab-CREW','cab-YC','cab-PC','cab-BC','cab-SPML','violet','edge-retour','chaine','accent','ds-d1','ds-d2','ds-d3','ds-d4','ds-d5','ds-d6'];

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 try{
  const page=await browser.newPage({viewport:{width:1366,height:768}});
  page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
  const ouvrir=async(fichier,theme)=>{
    await page.goto(adresse(fichier));
    await page.evaluate(t=>{localStorage.clear();if(t)localStorage.setItem('ory-ui-theme',t);},theme);
    await page.reload();await page.waitForLoadState('load');await page.waitForTimeout(300);
    return page.evaluate(LIRE,[JETONS,COULEURS]);
  };

  /* ---- 1 et 2. index.html, thème clair ------------------------------------------------------------------------------ */
  let m=await ouvrir('index.html',null);
  assert.notEqual(m.theme,'sombre');
  assert.deepEqual([m.jetons['ds-fond'],m.jetons['ds-surface-1'],m.jetons['ds-texte-1'],m.jetons['ds-accent'],m.jetons['ds-accent-pale'],m.jetons['ds-nav-repere'],m.jetons['ds-saisi-fond']],
    ['#FBF8F6','#FFFFFF','#2A1F23','#B95B0F','#FFF1E7','#FF9853','#FFF7F0'],'clair : les jetons de la maquette');
  assert.deepEqual([m.fond,m.texte],[rvb('#FBF8F6'),rvb('#2A1F23')],'clair : le fond chaud de la page, son encre');
  assert.deepEqual([m.jetons['ds-r-2'],m.jetons['ds-r-3']],['8PX','14PX'],'un champ à 8 px, une carte à 14 px');
  assert.deepEqual([m.couleurs['ds-nav-fond'],m.couleurs['ds-nav-fond-bas'],m.couleurs['ds-nav-texte-1']],[rvb('#2E0F1A'),rvb('#2E0F1A'),rvb('#FFFFFF')],'clair : le menu bordeaux, uni');
  assert.equal(m.couleurs.accent,rvb('#B95B0F'),'les variables des vues suivent : --accent');
  const classesClair={'cab-CREW':'#2464A6','cab-YC':'#1B8364','cab-PC':'#5021A1','cab-BC':'#881E31','cab-SPML':'#865D24',violet:'#5021A1','edge-retour':'#5021A1',chaine:'#8A1C69'};
  for(const [k,v] of Object.entries(classesClair))assert.equal(m.couleurs[k],rvb(v),'clair : --'+k);
  // Six couleurs de donnée, toutes différentes.
  assert.equal(new Set(['ds-d1','ds-d2','ds-d3','ds-d4','ds-d5','ds-d6'].map(k=>m.couleurs[k])).size,6);

  /* ---- 4. lisible.css garde le dernier mot ---------------------------------------------------------------------------- */
  assert.deepEqual([m.jetons['ds-t-11'],m.jetons['ds-t-12']],['13PX','13PX'],'les deux plus petites tailles de texte valent toujours 13 px');

  /* ---- 3. index.html, thème sombre ------------------------------------------------------------------------------------ */
  m=await ouvrir('index.html','sombre');
  assert.equal(m.theme,'sombre');
  assert.deepEqual([m.jetons['ds-fond'],m.jetons['ds-surface-1'],m.jetons['ds-texte-1'],m.jetons['ds-accent'],m.jetons['ds-accent-pale'],m.jetons['ds-saisi-fond']],
    ['#161113','#1E1719','#F2EAEC','#F08A4B','#3A261C','#2E2019'],'sombre : les jetons de la maquette');
  assert.deepEqual([m.fond,m.texte],[rvb('#161113'),rvb('#F2EAEC')],'sombre : le fond et l’encre');
  // La navigation reste branchée sur les surfaces du thème, comme dans ds.css : ni bordeaux, ni pêche.
  assert.deepEqual([m.couleurs['ds-nav-fond'],m.couleurs['ds-nav-fond-bas'],m.couleurs['ds-nav-texte-1']],[rvb('#1E1719'),rvb('#1E1719'),rvb('#F2EAEC')],'sombre : la navigation sur la surface du thème');
  const classesSombre={'cab-CREW':'#A7C5EB','cab-YC':'#A9EEE0','cab-PC':'#9463E1','cab-BC':'#CC8596','cab-SPML':'#E1D1A3',violet:'#9463E1','edge-retour':'#9463E1',chaine:'#B666A4'};
  for(const [k,v] of Object.entries(classesSombre))assert.equal(m.couleurs[k],rvb(v),'sombre : --'+k);
  assert.deepEqual([m.jetons['ds-r-2'],m.jetons['ds-r-3'],m.jetons['ds-t-12']],['8PX','14PX','13PX'],'sombre : les mêmes rayons, les mêmes tailles');

  /* ---- 5. accueil.html prend les mêmes jetons ; la version 2 garde les siens ------------------------------------------ */
  m=await ouvrir('accueil.html',null);
  assert.deepEqual([m.fond,m.texte,m.jetons['ds-accent']],[rvb('#FBF8F6'),rvb('#2A1F23'),'#B95B0F'],'accueil.html, clair');
  m=await ouvrir('accueil.html','sombre');
  assert.deepEqual([m.fond,m.texte,m.jetons['ds-accent']],[rvb('#161113'),rvb('#F2EAEC'),'#F08A4B'],'accueil.html, sombre');
  m=await ouvrir('v2/index.html',null);
  assert.deepEqual([m.jetons['ds-fond'],m.jetons['ds-accent'],m.jetons['ds-r-3'],m.couleurs['ds-nav-fond']],['#EDEAE6','#0B6E99','8PX',rvb('#0B1A2E')],'la version 2 garde son visuel');
  assert.equal(m.jetons['ds-saisi-fond'],'','la version 2 ne connaît pas les jetons neufs');

  assert.deepEqual(erreurs,[],'aucune erreur de page : '+erreurs.join(' | '));
  console.log('OK visuel-jetons : les jetons de la maquette dans les deux thèmes (fond, encre, accent, menu, rayons), les classes aux cinq couleurs de donnée dans les deux thèmes, la navigation sombre sur les surfaces du thème, les 13 px de lisible.css, accueil.html comme l’application, la version 2 inchangée');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

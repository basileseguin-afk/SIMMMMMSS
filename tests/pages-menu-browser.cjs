/* Évolution 23 (g) — le parcours automatique des pages du menu, aux deux tailles (1 366 × 768 et 1 920 × 1 080), sur
 * l'unité fictive et un programme daté fictif de trois jours (les treize entrées du menu, « Période » comprise).
 *
 * Chaque page du menu est ouverte — chaque entrée, chaque onglet de « Détails », « Fichiers » — et trois règles y sont
 * vérifiées (docs/DESIGN_SYSTEM.md, « Les trois règles d'une page ») ; le test échoue si l'une manque :
 *
 *   1. LA TAILLE DES TEXTES. Aucun texte sous 13 px. Les textes d'un schéma, d'un graphique ou de la scène en direct
 *      (un dessin : <svg>) : 12 px au moins, à l'écran — leur taille dessinée, une fois l'échelle du dessin appliquée.
 *   2. LE DÉFILEMENT. La fenêtre ne défile pas, ni la page : seules défilent ses zones (une liste, une fiche, un
 *      tableau), une par colonne, jamais l'une dans l'autre.
 *   3. LA LARGEUR. Les colonnes prennent la largeur : le contenu de la page va d'un bord à l'autre, pas dans une
 *      demi-largeur en laissant l'autre vide.
 *
 * Et, avec elles : un champ ne coupe ni sa valeur ni son texte d'attente (dans la fiche d'une équipe aussi : « Postes
 * de travail » montre « sans limite » en entier).
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const TAILLES=[[1366,768],[1920,1080]];
/** Un texte de page : 13 px ; un texte de dessin : 12 px à l'écran. (Au vingtième de pixel près : les arrondis du navigateur.) */
const TEXTE_MIN=13,DESSIN_MIN=12,TOLERANCE=0.05;

/* ---- dans la page : les trois mesures --------------------------------------------------------------------------- */
function mesurer([texteMin,dessinMin,tolerance]){
  const r=e=>e.getBoundingClientRect();
  const vu=e=>{if(!e.getClientRects().length)return false;const b=r(e);if(b.width<1||b.height<1)return false;
    return e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true,contentVisibilityAuto:true});};
  const court=e=>e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(typeof e.className==='string'&&e.className.trim()?'.'+e.className.trim().split(/\s+/).slice(0,2).join('.'):e.className&&e.className.baseVal?'.'+e.className.baseVal.split(/\s+/)[0]:'');
  const ou=e=>{const p=[];for(let x=e;x&&x!==document.body&&p.length<3;x=x.parentElement)p.unshift(court(x));return p.join(' > ');};
  const zonePage=document.getElementById('workspace');
  // Ce qui n'est pas la page : rien. Le menu, la barre du haut et la page sont tous lus.
  /* 1. les textes */
  const petits=[];
  const marche=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  const dejaVus=new Set();
  for(let n=marche.nextNode();n;n=marche.nextNode()){
    const t=n.textContent.trim();if(!t)continue;
    const e=n.parentElement;if(!e||dejaVus.has(e))continue;dejaVus.add(e);
    if(e.closest('script,style,noscript,option,title,desc,[hidden],.sr-only,dialog:not([open]),#notifs'))continue;
    if(!vu(e))continue;
    const b=r(e);if(b.bottom<0||b.right<0)continue;
    // Hors de sa zone qui défile (plus bas dans une liste) : il a la même taille que ses voisins, il compte.
    const dessin=e.closest('svg');
    let taille=parseFloat(getComputedStyle(e).fontSize);
    if(dessin){
      // La taille à l'écran : celle du dessin, à l'échelle où il est montré.
      const m=(e.getScreenCTM&&e.getScreenCTM())||(dessin.getScreenCTM&&dessin.getScreenCTM());
      if(m)taille*=Math.sqrt(Math.abs(m.a*m.d-m.b*m.c));
    }
    // (Une taille nulle : un titre gardé pour les lecteurs d'écran, qui ne se voit pas.)
    if(taille<1)continue;
    const min=dessin?dessinMin:texteMin;
    if(taille<min-tolerance)petits.push({ou:ou(e),texte:t.slice(0,30),taille:Math.round(taille*100)/100,min});
  }
  /* 2. le défilement */
  const fenetre={haut:document.scrollingElement.scrollHeight-innerHeight,large:document.scrollingElement.scrollWidth-innerWidth};
  const defile=e=>/(auto|scroll)/.test(getComputedStyle(e).overflowY)&&e.scrollHeight>e.clientHeight+1;
  const zones=[...zonePage.querySelectorAll('*')].filter(e=>vu(e)&&defile(e)&&!e.closest('svg,dialog,select')&&e.tagName!=='TEXTAREA'&&e.tagName!=='SELECT');
  // La page : la vue ouverte, sous l'en-tête. Elle ne défile pas : ce qui dépasse défile dans une zone.
  const vue=[...document.querySelectorAll('#workspace .col-plan > *')].find(e=>e.id!=='tete-page'&&vu(e)&&!e.classList.contains('workspace-heading'));
  const zonesDites=zones.map(z=>({ou:ou(z),gauche:Math.round(r(z).left),droite:Math.round(r(z).right),haut:Math.round(r(z).top),bas:Math.round(r(z).bottom),depasse:z.scrollHeight-z.clientHeight,page:z===vue}));
  const imbriquees=[];for(const a of zones)for(const b of zones)if(a!==b&&a.contains(b))imbriquees.push(ou(a)+' ⊃ '+ou(b));
  // Deux zones dans la même colonne : l'une au-dessus de l'autre (elles se recouvrent en largeur, pas en hauteur).
  const memeColonne=[];
  for(let i=0;i<zones.length;i++)for(let j=i+1;j<zones.length;j++){const a=r(zones[i]),b=r(zones[j]);if(zones[i].contains(zones[j])||zones[j].contains(zones[i]))continue;
    const large=Math.min(a.right,b.right)-Math.max(a.left,b.left),haut=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
    if(large>0.5*Math.min(a.width,b.width)&&haut<=1)memeColonne.push(ou(zones[i])+' | '+ou(zones[j]));}
  // Rien n'est coupé non plus : ce qui dépasse d'un bloc de la page se voit en défilant, pas du tout sinon.
  const coupees=vue?[vue,...vue.querySelectorAll('*')].filter(e=>vu(e)&&!e.closest('svg')&&/(hidden|clip)/.test(getComputedStyle(e).overflowY)&&e.clientHeight>=100&&e.scrollHeight>e.clientHeight+2)
    .map(e=>ou(e)+' ('+(e.scrollHeight-e.clientHeight)+' px)'):[];
  /* 3. la largeur */
  let largeur=null;
  if(vue){
    const s=getComputedStyle(vue),gauche=r(vue).left+parseFloat(s.paddingLeft),droite=r(vue).right-parseFloat(s.paddingRight);
    // Le contenu : ce que la vue montre, jusqu'à ses feuilles qui portent quelque chose (un texte, un champ, un dessin).
    const blocs=[...vue.querySelectorAll('*')].filter(e=>vu(e)&&!e.closest('svg svg')&&(e.matches('input,select,textarea,button,svg,canvas,img,table,th,td')||[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())));
    // Une boîte qui porte un fond ou un cadre compte aussi : une fiche va jusqu'à son bord.
    const cadres=[...vue.querySelectorAll('*')].filter(e=>{if(!vu(e))return false;const c=getComputedStyle(e);return (parseFloat(c.borderTopWidth)>0||parseFloat(c.borderLeftWidth)>0)&&r(e).width>80&&r(e).height>24;});
    const tous=[...blocs,...cadres].map(r).filter(b=>b.right>gauche&&b.left<droite+1);
    const min=Math.min(...tous.map(b=>b.left)),max=Math.max(...tous.map(b=>Math.min(b.right,droite)));
    largeur={libre:Math.round(droite-gauche),prise:tous.length?Math.round(max-min):0,videADroite:tous.length?Math.round(droite-max):Math.round(droite-gauche),videAGauche:tous.length?Math.round(min-gauche):0,vue:ou(vue)};
  }
  /* un champ ne coupe ni sa valeur ni son texte d'attente */
  const toile=document.createElement('canvas').getContext('2d');
  const coupes=[...zonePage.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=hidden]):not([type=color])')].filter(vu).map(e=>{
    const s=getComputedStyle(e),texte=e.value||e.placeholder||'';if(!texte)return null;
    toile.font=s.font||(s.fontWeight+' '+s.fontSize+' '+s.fontFamily);
    // La place du texte : la largeur du champ, moins ses bords et ses marges ; un champ de nombre garde celle de ses flèches.
    const fleches=e.type==='number'&&s.appearance!=='textfield'?16:0;
    const place=e.getBoundingClientRect().width-parseFloat(s.borderLeftWidth)-parseFloat(s.borderRightWidth)-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)-fleches,besoin=toile.measureText(texte).width;
    return besoin>place+1?{ou:ou(e),texte:texte.slice(0,30),besoin:Math.round(besoin),place:Math.round(place),attente:!e.value}:null;}).filter(Boolean);
  return {petits,fenetre,zones:zonesDites,imbriquees,memeColonne,coupees,pageDefile:vue?vue.scrollHeight-vue.clientHeight:0,pageEstZone:!!vue&&defile(vue),largeur,coupes};
}

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[],manques=[];let pagesVues=0,textesLus=0;
 // Seulement relever (pour mettre au point) : PAGES_MENU_RELEVE=1 liste tout ce qui manque, sans s'arrêter au premier.
 const releve=!!process.env.PAGES_MENU_RELEVE;
 const dire=(ou,quoi)=>{manques.push(ou+' — '+quoi);};
 try{
  for(const [w,h] of TAILLES){
   const T=w+' × '+h;
   const ctx=await browser.newContext({viewport:{width:w,height:h}});
   const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(T+' : '+e.message));page.on('dialog',d=>d.accept());
   const site=await F.charger(page,nav,URL_V1,{csv:F.volsDatesCsv(3,'2031-03-03'),pageId:'j-chiffres'});
   await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.onglets);
   await page.waitForTimeout(500);
   // Les pages du menu : chaque entrée (une page, ou chaque onglet de son groupe), puis « Fichiers ».
   const pages=await page.evaluate(()=>OrlyOnglets.entrees().flatMap(o=>o.pages||[o.id]));
   assert.equal(await page.evaluate(()=>OrlyOnglets.entrees().length),13,T+' : les treize entrées du menu');
   assert.deepEqual(pages,['j-chiffres','j-plan','at-planning','j-periode','at-repas','v-departs','j-stocks','j-details','j-comparer','v-programme','v-planche','mu-services','mu-flux','rg-simulation','mu-pas','u-sauvegarde'],T+' : les pages du menu');
   const verifier=async(nom)=>{
     const m=await page.evaluate(mesurer,[TEXTE_MIN,DESSIN_MIN,TOLERANCE]);
     const ou=T+', '+nom;
     /* 1. la taille des textes */
     if(m.petits.length){const parTaille={};for(const p of m.petits)(parTaille[p.taille+' px (min '+p.min+')']=parTaille[p.taille+' px (min '+p.min+')']||[]).push(p);
       dire(ou,'TEXTES : '+m.petits.length+' sous la taille — '+Object.entries(parTaille).map(([t,l])=>l.length+' à '+t+' : '+[...new Set(l.map(p=>p.ou.split(' > ').slice(-2).join(' > ')))].slice(0,4).join(' ; ')).join(' | '));}
     /* 2. le défilement */
     if(m.fenetre.haut>1||m.fenetre.large>1)dire(ou,'DÉFILEMENT : la fenêtre défile ('+m.fenetre.haut+' px en hauteur, '+m.fenetre.large+' en largeur)');
     if(m.pageEstZone)dire(ou,'DÉFILEMENT : la page défile ('+m.pageDefile+' px de plus que l’écran) — '+m.largeur.vue);
     if(m.imbriquees.length)dire(ou,'DÉFILEMENT : une zone défile dans une autre — '+m.imbriquees.slice(0,3).join(' ; '));
     if(m.memeColonne.length)dire(ou,'DÉFILEMENT : deux zones dans la même colonne — '+m.memeColonne.slice(0,3).join(' ; '));
     if(m.coupees.length)dire(ou,'DÉFILEMENT : un contenu est coupé, sans pouvoir défiler — '+m.coupees.slice(0,3).join(' ; '));
     /* 3. la largeur */
     if(!m.largeur)dire(ou,'LARGEUR : la page ne montre rien');
     else if(m.largeur.videADroite>0.12*m.largeur.libre||m.largeur.prise<0.85*m.largeur.libre)
       dire(ou,'LARGEUR : le contenu prend '+m.largeur.prise+' px sur '+m.largeur.libre+' ('+m.largeur.videADroite+' px vides à droite) — '+m.largeur.vue);
     /* un champ ne coupe ni sa valeur ni son texte d'attente */
     if(m.coupes.length)dire(ou,'CHAMPS : '+m.coupes.length+' coupé(s) — '+m.coupes.slice(0,4).map(c=>c.ou.split(' > ').slice(-2).join(' > ')+' « '+c.texte+' »'+(c.attente?' (texte d’attente)':'')+' : '+c.besoin+' px pour '+c.place).join(' ; '));
     pagesVues++;
     return m;
   };
   for(const id of pages){
     await nav.aller(page,id,{relief:true,panneau:false});await page.waitForTimeout(id==='j-plan'?1200:450);
     assert.equal(await page.evaluate(()=>document.body.dataset.sous),id,T+' : '+id+' s’ouvre');
     const m=await verifier(await page.evaluate(()=>document.getElementById('view-title').textContent+' ('+document.body.dataset.sous+')'));
     if(id==='j-chiffres')textesLus=m.zones.length;
   }
   // « Réglages » : chacune de ses sections.
   await nav.aller(page,'rg-simulation');await page.waitForTimeout(300);
   for(const s of await page.locator('#view-reglages .rs-liste [data-rs-choisir]').evaluateAll(bs=>bs.map(b=>b.dataset.rsChoisir))){
     await page.locator('#view-reglages .rs-liste [data-rs-choisir="'+s+'"]').click();await page.waitForTimeout(150);
     await verifier('Réglages › '+s);
   }
   // Les renforts en marche : « Qui peut aider qui » se montre, et la fiche d'une équipe porte ses « Postes de travail ».
   await page.locator('#view-reglages .rs-liste [data-rs-choisir="renforts"]').click();await page.waitForTimeout(150);
   await page.locator('#rg-sim-renforts [data-rf-actif]').check();await page.waitForTimeout(500);
   await verifier('Réglages › renforts, en marche');
   // « Services et équipes » : la fiche d'un service, puis celle d'une équipe — « Postes de travail » y montre « sans limite ».
   await nav.service(page,'prepa');await page.waitForTimeout(300);
   await verifier('Services et équipes › la fiche d’un service');
   const equipe=await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.type==='manuel'&&a.service==='prepa').id);
   await nav.reglagesEquipe(page,equipe);await page.waitForTimeout(300);
   const postes=page.locator('#mu-services [data-at-champ=personnesMax]').first();
   assert.equal(await postes.getAttribute('placeholder'),'sans limite',T+' : « Postes de travail », vide, dit « sans limite »');
   await verifier('Services et équipes › la fiche d’une équipe');
   // « Chemins » : un chemin choisi.
   await nav.aller(page,'mu-flux');await page.waitForTimeout(400);
   await verifier('Chemins › un chemin');
   await site.effacer();await ctx.close();
  }
  if(releve){console.log(manques.join('\n'));console.log('— '+manques.length+' manque(s) sur '+pagesVues+' pages vues.');}
  else assert.deepEqual(manques,[],'les trois règles tiennent sur chaque page du menu, aux deux tailles :\n'+manques.join('\n'));
  assert.deepEqual(erreurs,[],'aucune erreur de page');
  if(!releve)console.log('pages-menu-browser : ok — '+pagesVues+' pages vues (les seize pages du menu, les dix sections de « Réglages », la fiche d’un service, celle d’une équipe, un chemin), à 1 366 × 768 et à 1 920 × 1 080 : '
    +'aucun texte sous 13 px (12 px à l’écran dans un dessin) ; la fenêtre et la page ne défilent pas, seules défilent des zones, une par colonne, jamais l’une dans l’autre ; le contenu prend la largeur ; aucun champ ne coupe sa valeur ni son texte d’attente.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

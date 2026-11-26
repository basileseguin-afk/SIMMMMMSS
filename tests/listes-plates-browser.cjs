/* Correction 24 (f) — des listes plates, moins de cadres (version 1), sur l'unité et les vols fictifs, à 1 366 × 768.
 * La mesure : 7 cadres ombrés par écran en moyenne, 12 dans « Services et équipes ».
 *   1. « Services et équipes », « Chemins », « Réglages » : au plus 6 cadres ombrés. Leur liste de gauche est plate : un
 *      seul cadre, des rangées qui se touchent, séparées par un trait fin, sans ombre ; la rangée choisie a le fond pâle
 *      de l'accent et un trait d'accent de 3 px à gauche ; chaque rangée garde sa hauteur, son icône, sa pastille d'état.
 *   2. « Stocks et retours » : sur le fond de la page, son tableau dans une carte.
 *   3. Le Planning : les rangées et la colonne des équipes au fond de la carte, séparées par des traits fins.
 *   4. Le menu : « Lire » et « Régler » en titres de bloc (graisse 600), « Vols », « L'unité », « Simulation » en
 *      sous-titres (graisse 400), leurs entrées en retrait ; le numéro de version au bas du menu, sous le thème,
 *      lisible et copiable. Le texte lu du menu ne change pas, hors la place du numéro de version.
 *   5. Le fil du haut ne répète pas un mot : « Fichiers », pas « Fichiers › Fichiers ».
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;

/** Dans la page : la couleur calculée de jetons. */
const JETONS=noms=>{const j=n=>{const s=document.createElement('span');s.style.color='var('+n+')';document.body.append(s);const v=getComputedStyle(s).color;s.remove();return v;};
  return Object.fromEntries(noms.map(n=>[n,j(n)]));};
/** Dans la page : les cadres ombrés visibles de la zone de travail (une ombre portée, pas un trait intérieur), hors boutons et champs. */
const CADRES=()=>{const portee=o=>o!=='none'&&o.split(/,(?![^(]*\))/).some(c=>!/inset/.test(c)&&!/rgba\(0, 0, 0, 0\)/.test(c));
  return [...document.querySelectorAll('#workspace *')].filter(e=>{const q=e.getBoundingClientRect();
    return q.width>40&&q.height>24&&q.bottom>0&&q.top<innerHeight&&getComputedStyle(e).visibility!=='hidden'&&portee(getComputedStyle(e).boxShadow)
      &&!e.matches('.btn,input,select,textarea,label,th,td,[role=switch]')&&!e.closest('svg,dialog');})
    .map(e=>e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+'.'+String(e.className).trim().replace(/\s+/g,'.').slice(0,40));};
/** Dans la page : les rangées d'une liste de gauche, par suites de rangées qui se suivent. */
const LISTE=sel=>{const l=document.querySelector(sel),R=l.getBoundingClientRect(),rangs=[...l.querySelectorAll('.mu-svc')].filter(e=>e.getClientRects().length);
  const portee=o=>o!=='none'&&o.split(/,(?![^(]*\))/).some(c=>!/inset/.test(c)&&!/rgba\(0, 0, 0, 0\)/.test(c));
  return rangs.map(e=>{const c=getComputedStyle(e),q=e.getBoundingClientRect(),suit=e.previousElementSibling&&e.previousElementSibling.matches('.mu-svc'),suivi=e.nextElementSibling&&e.nextElementSibling.matches('.mu-svc');
    return {nom:(e.querySelector('b')||e).textContent.trim().slice(0,24),choisie:e.classList.contains('actif'),courante:e.getAttribute('aria-current'),chaine:e.classList.contains('en-chaine'),suit:!!suit,suivi:!!suivi,
      haut:Math.round(q.top*10)/10,bas:Math.round(q.bottom*10)/10,hauteur:Math.round(q.height),fond:c.backgroundColor,ombre:c.boxShadow,portee:portee(c.boxShadow),
      traitHaut:c.borderTopWidth+' '+c.borderTopColor,traitBas:c.borderBottomColor,marge:c.marginTop,rembourrage:c.paddingTop+' '+c.paddingLeft,
      rayons:[c.borderTopLeftRadius,c.borderBottomLeftRadius],icone:!!e.querySelector('.mu-svc-ico svg, .mu-svc-ico'),pastille:!!e.querySelector('.mu-pastille,.mu-etat,[class*="pastille"]')||/\b(ok|afaire|libre)\b/.test(e.className),
      visible:q.top>=R.top-1&&q.bottom<=R.bottom+1};});};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 const ctx=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});
 const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
 const site=await F.charger(page,nav,URL_V1,{pageId:'j-chiffres'});
 await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.unite);
 try{
  const J=await page.evaluate(JETONS,['--ds-accent','--ds-accent-pale','--ds-surface-1','--ds-surface-2','--ds-bordure','--ds-fond','--ds-nav-texte-3']);
  const bilan=[];

  // 1. Les trois pages à liste : au plus 6 cadres ombrés ; la liste, plate.
  for(const [id,nom,sel,min] of [['mu-services','« Services et équipes »','#mu-services .se-liste',8],['mu-flux','« Chemins »','#mu-flux .ch-liste',2],['rg-simulation','« Réglages »','.rs-liste',6]]){
   await nav.aller(page,id);
   await page.waitForFunction(s=>!!document.querySelector(s+' .mu-svc.actif'),sel);
   const cadres=await page.evaluate(CADRES);
   assert.ok(cadres.length<=6,nom+' : au plus 6 cadres ombrés — '+cadres.length+' : '+cadres.join(' '));
   const rangs=await page.evaluate(LISTE,sel);
   assert.ok(rangs.length>=min,nom+' : sa liste a ses rangées ('+rangs.length+')');
   const choisies=rangs.filter(r=>r.choisie);
   assert.equal(choisies.length,1,nom+' : une rangée choisie');
   const c=choisies[0];
   assert.equal(c.fond,J['--ds-accent-pale'],nom+' : la rangée choisie a le fond pâle de l’accent');
   assert.match(c.ombre,new RegExp('^'+J['--ds-accent'].replace(/[()]/g,'\\$&')+' 3px 0px 0px 0px inset$'),nom+' : la rangée choisie a un trait d’accent de 3 px à gauche — '+c.ombre);
   assert.equal(c.courante,'true',nom+' : elle se dit choisie');
   for(const r of rangs){
    const Q=nom+', rangée « '+r.nom+' »';
    assert.equal(r.portee,false,Q+' : sans ombre');
    if(!r.choisie){assert.equal(r.fond,J['--ds-surface-1'],Q+' : au fond de la carte');
     if(!r.chaine)assert.equal(r.ombre,'none',Q+' : ni ombre ni trait intérieur');}
    assert.equal(r.traitHaut,'1px '+J['--ds-bordure'],Q+' : un trait fin au-dessus');
    assert.equal(r.rembourrage,rangs.find(x=>!x.choisie).rembourrage,Q+' : le même blanc intérieur, choisie ou non');
    assert.equal(r.icone,true,Q+' : son icône');
    // Un seul cadre par suite de rangées : elles se touchent ; les coins ne s'arrondissent qu'aux deux bouts.
    assert.deepEqual(r.rayons,[r.suit?'0px':'14px',r.suivi?'0px':'14px'],Q+' : les coins du cadre aux deux bouts seulement');
    if(r.suivi)assert.equal(r.traitBas,'rgba(0, 0, 0, 0)',Q+' : un seul trait entre deux rangées');
   }
   for(let i=1;i<rangs.length;i++)if(rangs[i].suit)assert.ok(Math.abs(rangs[i].haut-rangs[i-1].bas)<=0.6,nom+' : « '+rangs[i].nom+' » touche la rangée d’avant ('+rangs[i-1].bas+' → '+rangs[i].haut+')');
   if(id==='mu-services'){
    assert.ok(rangs.filter(r=>/\b/.test(r.nom)&&r.pastille).length>=min,nom+' : chaque service garde sa pastille d’état');
    assert.deepEqual([...new Set(rangs.map(r=>r.hauteur))].filter(h=>h!==59&&h!==78),[],nom+' : la hauteur des rangées est celle d’avant (59 px ; 78 px avec une chaîne) — '+rangs.map(r=>r.hauteur).join(' '));
   }
   if(id==='rg-simulation')assert.deepEqual([...new Set(rangs.map(r=>r.hauteur))],[35],nom+' : toutes les rangées à 35 px, la choisie comprise — '+rangs.map(r=>r.hauteur).join(' '));
   // Choisir une autre rangée : le fond et le trait la suivent.
   const autre=rangs.findIndex(r=>!r.choisie&&r.visible&&r.suit);
   await page.locator(sel+' .mu-svc').nth(autre).click();
   await page.waitForFunction(([s,i])=>document.querySelectorAll(s+' .mu-svc')[i].classList.contains('actif'),[sel,autre]);
   const apres=(await page.evaluate(LISTE,sel))[autre];
   assert.deepEqual([apres.fond,/3px 0px 0px 0px inset$/.test(apres.ombre),apres.hauteur],[J['--ds-accent-pale'],true,rangs[autre].hauteur],nom+' : une autre rangée choisie prend le fond et le trait, sans changer de hauteur');
   bilan.push(nom+' '+cadres.length+' cadre(s), '+rangs.length+' rangées');
  }

  // 2. « Stocks et retours » : sur le fond de la page, son tableau dans une carte.
  await nav.aller(page,'j-stocks');
  const stocks=await page.evaluate(()=>{const s=document.getElementById('journee-stocks'),t=s.querySelector('table'),c=t.closest('.tp-sec'),cs=getComputedStyle(c);
    return {page:getComputedStyle(s).backgroundColor,carte:cs.backgroundColor,trait:cs.borderTopWidth+' '+cs.borderTopColor,rayon:cs.borderTopLeftRadius,ombre:cs.boxShadow!=='none',
      cartes:[...s.querySelectorAll('.tp-sec')].filter(e=>e.getClientRects().length).length,defile:document.documentElement.scrollHeight>innerHeight};});
  assert.equal(stocks.page,'rgba(0, 0, 0, 0)','« Stocks et retours » : sur le fond de la page');
  assert.deepEqual([stocks.carte,stocks.trait,stocks.rayon,stocks.ombre],[J['--ds-surface-1'],'1px '+J['--ds-bordure'],'14px',true],'« Stocks et retours » : son tableau dans une carte');
  assert.equal(stocks.defile,false,'« Stocks et retours » : la fenêtre ne défile pas');

  // 3. Le Planning : au fond de la carte, des traits fins ; plus de rangées beiges.
  await nav.aller(page,'at-planning');
  await page.locator('#workspace button.btn-sm',{hasText:/^Tout déplier$/}).click();
  await page.waitForSelector('#workspace .pg-ligne');
  const planning=await page.evaluate(()=>{const f=s=>[...document.querySelectorAll('#workspace '+s)].filter(e=>e.getClientRects().length).map(e=>getComputedStyle(e).backgroundColor);
    const lignes=[...document.querySelectorAll('#workspace .pg-ligne')].filter(e=>e.getClientRects().length);
    return {tetes:[...new Set(f('.pg-groupe-tete'))],noms:[...new Set(f('.pg-groupe-nom').concat(f('.pg-nom')))],barres:[...new Set(f('.pg-barres'))],lignes:lignes.length,
      traits:lignes.filter(l=>l.previousElementSibling&&l.previousElementSibling.matches('.pg-ligne')).map(l=>getComputedStyle(l).boxShadow)};});
  assert.ok(planning.lignes>=5,'le Planning montre ses équipes ('+planning.lignes+')');
  assert.deepEqual([planning.tetes,planning.noms],[[J['--ds-surface-1']],[J['--ds-surface-1']]],'le Planning : les rangées de service et la colonne des équipes au fond de la carte');
  assert.ok(!planning.barres.includes(J['--ds-surface-2']),'le Planning : plus de rangées beiges — '+planning.barres.join(' '));
  assert.ok(planning.traits.length>0&&planning.traits.every(t=>t===J['--ds-bordure']+' 0px 1px 0px 0px inset'),'le Planning : un trait fin entre deux équipes — '+[...new Set(planning.traits)].join(' | '));

  // 4. Le menu.
  const menu=await page.evaluate(()=>{const g=e=>getComputedStyle(e),barre=document.getElementById('barre'),v=barre.querySelector('.marque-version'),theme=document.getElementById('btn-theme');
    const entree=s=>{const e=document.querySelector(s);return e?parseFloat(g(e).paddingLeft):null;};
    const texte=barre.textContent;
    // Avant : le numéro sous la marque. Le même texte, à la place du numéro près.
    const jumeau=barre.cloneNode(true),n=jumeau.querySelector('.marque-version');jumeau.querySelector('.marque-txt').appendChild(n);
    return {blocs:[...document.querySelectorAll('#menu .menu-bloc-titre')].map(e=>[e.textContent,g(e).fontWeight,parseFloat(g(e).fontSize)]),
      sous:[...document.querySelectorAll('#menu .menu-espace-titre')].map(e=>[e.textContent,g(e).fontWeight,g(e).color,parseFloat(g(e).fontSize)]),
      retraits:[entree('#menu [data-bloc="lire"] .menu-entree'),entree('#menu .menu-espace:has(.menu-espace-titre) .menu-entree')],
      air:parseFloat(g(document.querySelectorAll('#menu .menu-bloc')[1]).paddingTop)+parseFloat(g(document.querySelectorAll('#menu .menu-bloc')[1]).marginTop),
      entrees:[...document.querySelectorAll('#menu [role=tab]')].map(e=>e.textContent.replace(/\d+$/,'').trim()),attendues:OrlyOnglets.entrees().map(o=>o.nom||''),
      version:{texte:v.textContent,attendu:'version '+document.querySelector('meta[name="ory-version"]').content,dansLePied:!!v.closest('.barre-pied'),sousLaMarque:!!v.closest('.marque'),
        sousLeTheme:v.getBoundingClientRect().top>=theme.getBoundingClientRect().bottom-1,dernier:v===v.parentElement.lastElementChild,taille:parseFloat(g(v).fontSize),copiable:g(v).userSelect,
        visible:v.getBoundingClientRect().bottom<=innerHeight&&v.getBoundingClientRect().width>60,coupe:v.scrollWidth>v.clientWidth+1,couleur:g(v).color},
      memeTexte:jumeau.textContent.replace(/version [0-9a-f]+/,'')===texte.replace(/version [0-9a-f]+/,''),unSeul:barre.querySelectorAll('.marque-version').length};});
  assert.deepEqual(menu.blocs.map(b=>b[0]),['Lire','Régler'],'le menu : ses deux blocs');
  assert.ok(menu.blocs.every(b=>b[1]==='600'&&b[2]>=13),'le menu : « Lire » et « Régler » en graisse 600 — '+JSON.stringify(menu.blocs));
  assert.deepEqual(menu.sous.map(s=>s[0]),['Vols','L’unité','Simulation'],'le menu : ses trois sous-titres');
  assert.ok(menu.sous.every(s=>s[1]==='400'&&s[2]===J['--ds-nav-texte-3']&&s[3]>=13),'le menu : les sous-titres en graisse 400, à la couleur discrète du menu — '+JSON.stringify(menu.sous));
  assert.ok(menu.retraits[1]>=menu.retraits[0]+8,'le menu : les entrées d’un sous-titre en retrait — '+menu.retraits.join(' → '));
  assert.ok(menu.air>=24,'le menu : plus d’air au-dessus de « Régler » ('+menu.air+' px)');
  assert.deepEqual(menu.version,{...menu.version,texte:menu.version.attendu,dansLePied:true,sousLaMarque:false,sousLeTheme:true,dernier:true,copiable:'text',visible:true,coupe:false},'le numéro de version : au bas du menu, sous le thème, lisible et copiable');
  assert.ok(menu.version.taille>=13,'le numéro de version : 13 px au moins');
  assert.deepEqual([menu.memeTexte,menu.unSeul],[true,1],'le texte lu du menu ne change pas, hors la place du numéro de version');
  assert.deepEqual(menu.entrees,['Synthèse','En direct','Planning','Détails','Comparer','Programme','Retours','Services et équipes','Chemins','Réglages','Contrôles'],'le menu a les entrées d’avant, dans l’ordre');

  // 5. Le fil du haut ne répète pas un mot.
  const fils={};
  for(const id of await page.evaluate(()=>OrlyOnglets.entrees().flatMap(o=>o.pages||[o.id]))){
   await nav.aller(page,id);
   fils[id]=await page.evaluate(()=>[...document.querySelectorAll('#ariane > *')].filter(e=>!e.hidden&&e.getClientRects().length&&e.textContent.trim()).map(e=>e.textContent.trim()));
   assert.equal(new Set(fils[id]).size,fils[id].length,'« '+id+' » : le fil du haut ne répète pas un mot — '+fils[id].join(' › '));
  }
  assert.deepEqual(fils['u-sauvegarde'],['Fichiers'],'« Fichiers », pas « Fichiers › Fichiers »');
  assert.deepEqual(fils['j-chiffres'],['Lire','Synthèse'],'ailleurs, le fil dit toujours la partie puis la page');

  assert.deepEqual(erreurs,[],'aucune erreur de script : '+erreurs.join(' | '));
  console.log('OK listes-plates : '+bilan.join(' ; ')+' — une liste plate (un cadre, des rangées qui se touchent, un trait fin, la rangée choisie au fond pâle avec un trait d’accent de 3 px) ; « Stocks et retours » dans une carte ; le Planning au fond de la carte, '+planning.lignes+' équipes séparées par des traits fins ; le menu : deux titres de bloc en 600, trois sous-titres en 400, leurs entrées en retrait, la version au bas du menu ; le fil du haut sans mot répété');
 }finally{site.effacer();await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

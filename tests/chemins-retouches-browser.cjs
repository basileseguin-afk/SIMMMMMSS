/* Correction 23 (j) — « Chemins » : deux retouches de l'évolution 24 (version 1), sur l'unité fictive
 * (tests/plan-rejoue-fictif.cjs), à 1 366 × 768 et 1 920 × 1 080.
 *   1. LA PASTILLE. Le texte d'une pastille est le nom entier du fournisseur — jamais coupé par « … ». Un nom court
 *      garde sa place (la moitié droite du bord bas de la case) ; un nom plus long prend la largeur de la case ; s'il n'y
 *      tient pas, il passe sur deux lignes. La pastille ne dépasse jamais la largeur de sa case, ni le dessin.
 *      Une étape à deux fournisseurs porte deux pastilles, chacune au nom entier, qui ne se recouvrent pas.
 *      Le rond de l'étape (le geste « tirer un lien ») reste par-dessus.
 *   2. LA LIGNE « Fournisseurs de ce chemin : … », son lien et l'interrupteur sont au-dessus du schéma, avec le compte
 *      du chemin : à 1 366 × 768, à l'ouverture d'un long chemin, l'interrupteur se voit sans défiler.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const M='#mu-flux';
const LONG='Magasin central des produits secs',TRES_LONG='Magasin central des produits secs et des emballages de toute l’unité';
const TAILLES=[[1366,768],[1920,1080]];

/** Les pastilles du schéma, mesurées à l'écran. */
const PASTILLES=()=>{
  const svg=document.querySelector('#mu-flux .gr-svg'),k=svg.getBoundingClientRect().width/svg.viewBox.baseVal.width,dessin=svg.getBoundingClientRect();
  const r=e=>{const q=e.getBoundingClientRect();return {g:q.left,d:q.right,h:q.top,b:q.bottom};};
  return [...svg.querySelectorAll('.ch-pastille')].map(g=>{const n=g.closest('.gr-noeud'),t=g.querySelector('text'),port=n.querySelector('.gr-port'),fond=r(g.querySelector('rect')),ecrit=r(t);
    return {etape:n.dataset.noeud,qui:g.dataset.chPastille,texte:t.textContent,lignes:[...t.querySelectorAll('tspan')].map(s=>s.textContent),survol:g.querySelector('title').textContent,
      fond,ecrit,case:r(n.querySelector('.gr-fond')),haut:(fond.b-fond.h)/k,px:Math.round(parseFloat(getComputedStyle(t).fontSize)*k*10)/10,
      dansLeDessin:fond.g>=dessin.left-1&&fond.d<=dessin.right+1&&fond.h>=dessin.top-1&&fond.b<=dessin.bottom+1,
      sousLeRond:port?!!(g.compareDocumentPosition(port)&Node.DOCUMENT_POSITION_FOLLOWING):null};});
};
/** L'en-tête de la fiche : le compte, la ligne des fournisseurs, son lien, l'interrupteur ; ce qui se voit sans défiler. */
const TETE=()=>{
  const f=document.querySelector('#mu-flux .ch-fiche'),l=f.querySelector('.ch-fournis'),g=f.querySelector('[data-mu-graphe]'),c=f.querySelector('.ch-compte'),cadre=f.getBoundingClientRect();
  const vu=e=>{if(!e)return null;const q=e.getBoundingClientRect(),s=document.elementFromPoint(q.left+q.width/2,q.top+q.height/2);
    return q.width>0&&q.top>=cadre.top-1&&q.bottom<=Math.min(cadre.bottom,innerHeight)+1&&q.left>=cadre.left-1&&q.right<=Math.min(cadre.right,innerWidth)+1&&!!s&&(s===e||e.contains(s));};
  const suit=(a,b)=>!!(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING);
  const i=l&&l.querySelector('[data-ch-fournisseurs]'),lien=l&&l.querySelector('[data-fo-ouvrir]');
  return {defile:Math.round(f.scrollTop),depasse:f.scrollHeight-f.clientHeight,compte:c.textContent.trim(),
    fenetre:[document.documentElement.scrollHeight-innerHeight,document.documentElement.scrollWidth-innerWidth],
    ligne:l?{dit:l.querySelector('.ch-fournis-dit').textContent.trim(),vu:vu(l),px:parseFloat(getComputedStyle(l.querySelector('.ch-fournis-dit')).fontSize),
      apresLeCompte:suit(c,l),avantLeSchema:suit(l,g),auDessus:l.getBoundingClientRect().bottom<=g.getBoundingClientRect().top+1,
      avecLeCompte:!!l.closest('.ch-tete')&&l.closest('.ch-tete').contains(c),
      boutons:[...l.querySelectorAll('button')].map(b=>b.textContent.trim()),lienVu:vu(lien),
      interrupteur:i?{vu:vu(i),marche:i.getAttribute('aria-checked'),role:i.getAttribute('role'),px:parseFloat(getComputedStyle(i).fontSize)}:null}:null};
};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 try{
  for(const [largeur,hauteur] of TAILLES){
   const V=largeur+' × '+hauteur+' : ';
   const ctx=await browser.newContext({viewport:{width:largeur,height:hauteur},reducedMotion:'reduce'});
   const page=await ctx.newPage(),erreurs=[];
   page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
   const attendre=(ms=350)=>page.waitForTimeout(ms);
   const site=await F.charger(page,nav,URL_V1,{pageId:'mu-flux'});
   try{
    await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.unite);
    const choisir=async id=>{await page.locator(`${M} .ch-liste [data-mu-flux-choisir="${id}"]`).click();
      await page.waitForFunction(i=>document.querySelector('#mu-flux .ch-fiche').dataset.muFluxFiche===i&&!!document.querySelector('#mu-flux .gr-svg .gr-noeud'),id);await attendre();};
    const pastilles=()=>page.evaluate(PASTILLES),tete=()=>page.evaluate(TETE);
    /** Ce que toute pastille doit tenir : son nom entier, dans la largeur de sa case, dans le dessin, lisible. */
    const tenir=(p,nom,ou)=>{
      assert.equal(p.texte,nom,V+ou+' : le texte de la pastille est le nom entier du fournisseur');
      assert.ok(!p.texte.includes('…'),V+ou+' : jamais coupé');
      assert.equal(p.survol,'Se fournit chez '+nom);
      assert.ok(p.fond.g>=p.case.g-1&&p.fond.d<=p.case.d+1,V+ou+' : la pastille tient dans la largeur de sa case : '+JSON.stringify([p.fond,p.case]));
      assert.ok(p.ecrit.g>=p.fond.g-1&&p.ecrit.d<=p.fond.d+1&&p.ecrit.h>=p.fond.h-1&&p.ecrit.b<=p.fond.b+1,V+ou+' : le texte tient dans sa pastille : '+JSON.stringify([p.ecrit,p.fond]));
      assert.ok(p.px>=12&&p.dansLeDessin,V+ou+' : 12 px au moins à l’écran, dans le dessin : '+JSON.stringify(p));
      assert.notEqual(p.sousLeRond,false,V+ou+' : le rond de l’étape reste par-dessus la pastille');
    };

    /* ---- 2. la ligne, son lien et l'interrupteur : au-dessus du schéma, avec le compte ------------------------------ */
    await choisir('complet');
    let t=await tete();
    assert.equal(t.compte,'12 commandes · 8 étapes · 2 fournisseurs');
    assert.equal(t.defile,0,V+'à l’ouverture, la fiche n’a pas défilé');
    if(hauteur<=768)assert.ok(t.depasse>100,V+'un long chemin : la fiche défile ('+t.depasse+' px de plus que son cadre)');
    assert.ok(t.ligne,V+'la ligne des fournisseurs');
    assert.equal(t.ligne.dit,'Fournisseurs de ce chemin : Réception / Appros, Magasin',V+'la ligne les nomme');
    assert.deepEqual(t.ligne.boutons,['Régler les clients →','Montrer les fournisseurs sur le schéma'],V+'son lien et l’interrupteur');
    assert.deepEqual([t.ligne.apresLeCompte,t.ligne.avantLeSchema,t.ligne.auDessus],[true,true,true],V+'au-dessus du schéma, après le compte');
    assert.equal(t.ligne.avecLeCompte,true,V+'dans l’en-tête du chemin, avec son compte');
    assert.deepEqual([t.ligne.vu,t.ligne.lienVu,t.ligne.interrupteur.vu],[true,true,true],V+'la ligne, son lien et l’interrupteur se voient sans défiler : '+JSON.stringify(t));
    assert.deepEqual([t.ligne.interrupteur.role,t.ligne.interrupteur.marche],['switch','false']);
    assert.ok(t.ligne.px>=13&&t.ligne.interrupteur.px>=13,V+'texte de 13 px au moins');
    assert.deepEqual(t.fenetre,[0,0],V+'la fenêtre ne défile pas');
    // Le schéma reste à l'écran, sous l'en-tête : sa première étape se voit.
    assert.equal(await page.evaluate(()=>{const n=document.querySelector('#mu-flux .gr-noeud .gr-fond').getBoundingClientRect(),f=document.querySelector('#mu-flux .ch-fiche').getBoundingClientRect();
      return n.top>=f.top&&n.bottom<=Math.min(f.bottom,innerHeight);}),true,V+'la première étape du schéma se voit sans défiler');

    /* ---- 1. la pastille : le nom entier ------------------------------------------------------------------------------ */
    let ps=await pastilles();
    assert.deepEqual(ps.map(p=>[p.etape,p.qui]).sort(),[['decontam','appros'],['prepa','magasin']],V+'une pastille par étape cliente');
    const court=ps.find(p=>p.etape==='prepa'),moyen=ps.find(p=>p.etape==='decontam');
    tenir(court,'Magasin','un nom court');tenir(moyen,'Réception / Appros','un nom plus long');
    // Un nom court garde sa place : la moitié droite du bord bas, sur une ligne.
    assert.ok(court.fond.g>=(court.case.g+court.case.d)/2,V+'un nom court garde sa place, à droite du rond : '+JSON.stringify(court));
    assert.deepEqual([court.lignes.length<=1,Math.round(court.haut)],[true,18],V+'sur une ligne');
    // Un nom plus long prend la largeur de la case : il passe le milieu, sur une ligne.
    assert.ok(moyen.fond.g<(moyen.case.g+moyen.case.d)/2,V+'un nom plus long prend la largeur de la case : '+JSON.stringify(moyen));
    assert.deepEqual([moyen.lignes.length<=1,Math.round(moyen.haut)],[true,18],V+'sur une ligne, puisqu’il y tient');
    for(const p of ps)assert.ok(Math.abs(p.fond.h-(p.case.b-7*(p.fond.b-p.fond.h)/p.haut))<=1.5,V+'à cheval sur le bord bas de la case');

    // Un nom qui ne tient pas dans la largeur de la case : sur deux lignes, entier.
    await page.evaluate(n=>{Sim.unite.a.renommer('magasin',n);Sim.unite.rendreFlux();},LONG);await attendre(500);
    ps=await pastilles();
    const long=ps.find(p=>p.etape==='prepa');
    tenir(long,LONG,'un nom trop long pour la case');
    assert.equal(long.lignes.length,2,V+'il passe sur deux lignes : '+JSON.stringify(long.lignes));
    assert.equal(long.lignes.join(''),LONG,V+'les deux lignes font le nom entier');
    assert.ok(long.lignes.every(l=>l.trim().length>3)&&/ $/.test(long.lignes[0]),V+'coupé entre deux mots : '+JSON.stringify(long.lignes));
    assert.ok(long.haut>18+10,V+'la pastille prend la hauteur de ses deux lignes : '+long.haut);
    t=await tete();
    assert.equal(t.ligne.dit,'Fournisseurs de ce chemin : Réception / Appros, '+LONG,V+'la ligne dit le même nom');
    assert.equal(t.ligne.interrupteur.vu,true,V+'l’interrupteur se voit toujours sans défiler, avec un long nom');
    // Un nom très long, sous la dernière rangée du schéma : autant de lignes qu'il en faut, toujours entier, dans le dessin.
    await page.evaluate(n=>{Sim.unite.a.renommer('magasin',n);Sim.unite.rendreFlux();},TRES_LONG);await attendre(500);
    const tres=(await pastilles()).find(p=>p.etape==='prepa');
    tenir(tres,TRES_LONG,'un nom très long');
    assert.ok(tres.lignes.length>=3&&tres.lignes.join('')===TRES_LONG,V+'il prend les lignes qu’il lui faut, sans rien perdre : '+JSON.stringify(tres.lignes));
    assert.deepEqual((await tete()).fenetre,[0,0],V+'la fenêtre ne défile pas');
    await page.evaluate(()=>{Sim.unite.a.renommer('magasin','Magasin');Sim.unite.rendreFlux();});await attendre(400);

    // Deux fournisseurs pour une même étape : deux pastilles, au nom entier, sans se recouvrir.
    await page.evaluate(()=>Sim.ateliers.changer(()=>{OrlyFournisseurs.regler(Sim.ateliers.state,'magasin','decontam',true);},''));await attendre(500);
    await choisir('complet');
    ps=(await pastilles()).filter(p=>p.etape==='decontam');
    assert.deepEqual(ps.map(p=>p.qui).sort(),['appros','magasin'],V+'une étape à deux fournisseurs : deux pastilles');
    tenir(ps.find(p=>p.qui==='appros'),'Réception / Appros','la première de deux');tenir(ps.find(p=>p.qui==='magasin'),'Magasin','la seconde de deux');
    const [a,b]=ps;
    assert.ok(a.fond.d<=b.fond.g+0.5||b.fond.d<=a.fond.g+0.5||a.fond.b<=b.fond.h+0.5||b.fond.b<=a.fond.h+0.5,V+'les deux pastilles ne se recouvrent pas : '+JSON.stringify([a.fond,b.fond]));
    await page.evaluate(()=>Sim.ateliers.histoire(false));await attendre(500);
    await choisir('complet');
    assert.deepEqual((await pastilles()).map(p=>[p.etape,p.qui,p.texte]).sort(),[['decontam','appros','Réception / Appros'],['prepa','magasin','Magasin']],V+'« Annuler » : les pastilles d’avant');

    /* ---- 2 (suite). le lien et l'interrupteur font ce qu'ils faisaient ----------------------------------------------- */
    const interrupteur=page.locator(`${M} [data-ch-fournisseurs]`);
    await interrupteur.click();await attendre(500);
    t=await tete();
    assert.deepEqual([t.ligne.interrupteur.marche,t.ligne.interrupteur.vu,(await pastilles()).length],['true',true,0],V+'allumé : les fournisseurs sont dessinés, sans pastille ; l’interrupteur reste en vue');
    assert.equal(await page.evaluate(()=>document.querySelectorAll('#mu-flux .gr-svg .gr-noeud[data-noeud="magasin"]').length),1,V+'le fournisseur est sur le schéma');
    assert.equal(await page.evaluate(()=>document.activeElement.hasAttribute('data-ch-fournisseurs')),true,V+'le clavier reste sur l’interrupteur');
    await interrupteur.click();await attendre(500);
    assert.equal((await pastilles()).length,2,V+'éteint : les pastilles reviennent');
    await page.locator(`${M} .ch-fournis [data-fo-ouvrir]`).click();await attendre(500);
    assert.equal(await page.locator(`${M} .ch-fiche`).getAttribute('data-ch-vue'),'fournisseurs',V+'« Régler les clients » ouvre l’entrée « Fournisseurs »');

    assert.deepEqual(erreurs,[],V+'aucune erreur de page : '+erreurs.join(' | '));
   }finally{await site.effacer();await ctx.close();}
  }
  console.log('OK chemins-retouches : le texte d’une pastille est le nom entier du fournisseur (un nom court à sa place, un nom plus long sur la largeur de la case, un nom trop long sur deux lignes ; deux fournisseurs, deux pastilles) ; la ligne « Fournisseurs de ce chemin », son lien et l’interrupteur au-dessus du schéma, avec le compte — à 1 366 × 768, l’interrupteur se voit sans défiler ; aux deux tailles');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

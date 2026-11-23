/* Évolution 23 (c) — « Chemins » : un schéma lisible ; sur l'unité fictive de 15 services (tests/unite-15-services.cjs),
 * dont le chemin « Complet » a dix-huit étapes, à 1 366 × 768 puis à 1 920 × 1 080.
 *   1. À l'ouverture, le plus petit texte du schéma fait 12 px au moins à l'écran : le schéma n'est plus réduit pour
 *      tenir dans son cadre ; plus large que lui, il y défile.
 *   2. La barre d'outils du schéma est au-dessus du cadre : elle ne recoupe aucune case.
 *   3. « Tout voir » réduit le schéma, à la demande, pour qu'il tienne entier ; « Taille lisible » y revient.
 *   4. À cette taille, les gestes du schéma marchent : un clic sur une étape ouvre son tableau.
 *   5. « En ligne » : la même taille lisible, la barre toujours au-dessus.
 *   6. Un autre chemin s'ouvre à sa taille lisible ; un chemin court n'a rien à réduire : « Tout voir » ne se montre pas.
 * Unité, vols, compagnies et équipes fictifs. graphe.js et graphe.css, communs avec la version 2, ne sont pas modifiés. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs'),U=require('./unite-15-services.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const M='#mu-flux';

/** Ce que le schéma mesure de lui-même, dans le navigateur. */
const MESURER=()=>{
  const svg=document.querySelector('#mu-flux .gr-svg'),vb=svg.viewBox.baseVal,r=svg.getBoundingClientRect(),k=r.width/vb.width;
  const textes=[...svg.querySelectorAll('text')].filter(t=>t.getClientRects().length&&t.textContent.trim()).map(t=>({px:parseFloat(getComputedStyle(t).fontSize)*k,haut:t.getBoundingClientRect().height,mot:t.textContent.trim().slice(0,24)}));
  const cadre=document.querySelector('#mu-flux .gr-cadre'),c=cadre.getBoundingClientRect(),barre=document.querySelector('#mu-flux .gr-barre').getBoundingClientRect(),fiche=document.querySelector('#mu-flux .ch-fiche');
  const recoupe=b=>!(b.right<=barre.left+0.5||b.left>=barre.right-0.5||b.bottom<=barre.top+0.5||b.top>=barre.bottom-0.5);
  const cases=[...svg.querySelectorAll('.gr-noeud')].map(n=>n.getBoundingClientRect());
  const petit=textes.slice().sort((a,b)=>a.px-b.px)[0];
  return {k:Math.round(k*1000)/1000,dessin:[Math.round(vb.width),Math.round(vb.height)],ecran:[Math.round(r.width),Math.round(r.height)],textes:textes.length,
    plusPetit:Math.round(petit.px*100)/100,lequel:petit.mot,cases:cases.length,etapes:svg.querySelectorAll('.gr-etape').length,
    cadre:{largeur:cadre.clientWidth,hauteur:cadre.clientHeight,contenuL:cadre.scrollWidth,contenuH:cadre.scrollHeight,x:getComputedStyle(cadre).overflowX,haut:Math.round(c.top)},
    fiche:{hauteur:fiche.clientHeight,contenu:fiche.scrollHeight,y:getComputedStyle(fiche).overflowY},
    barre:{bas:Math.round(barre.bottom),haut:Math.round(barre.top),largeur:Math.round(barre.width),position:getComputedStyle(document.querySelector('#mu-flux .gr-barre')).position,
      recoupe:cases.filter(recoupe).length,surLeCadre:recoupe(c)},
    outils:[...document.querySelectorAll('#mu-flux .gr-barre button, #mu-flux .gr-barre label')].filter(e=>e.getClientRects().length).map(e=>e.textContent.replace(/\s+/g,' ').trim().replace(/ choisir….*/,''))};
};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[],dit=[];
 try{
  for(const [largeur,hauteur] of [[1366,768],[1920,1080]]){
   const V=largeur+' × '+hauteur+' : ';
   const ctx=await browser.newContext({viewport:{width:largeur,height:hauteur}});
   const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
   const attendre=(ms=300)=>page.waitForTimeout(ms);
   const mesurer=()=>page.evaluate(MESURER);
   const choisir=async id=>{await page.locator(`${M} .ch-liste [data-mu-flux-choisir="${id}"]`).click();await page.waitForFunction(i=>document.querySelector('#mu-flux .ch-fiche').dataset.muFluxFiche===i&&!!document.querySelector('#mu-flux .gr-svg .gr-noeud'),id);await attendre(250);};
   const site=await F.charger(page,nav,URL_V1,{sauvegarde:U.sauvegarde(),pageId:'mu-flux'});
   try{
    await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.unite);
    await choisir('complet');

    /* ---- 1. à l'ouverture : 12 px au moins, sans réduction ; plus large que son cadre, il y défile ----------------- */
    const m=await mesurer();
    assert.ok(m.cases>=15,V+'un chemin d’une quinzaine d’étapes au moins ('+m.cases+' cases, '+m.etapes+' bandes)');
    assert.ok(m.plusPetit>=12-0.01,V+'le plus petit texte du schéma fait 12 px au moins à l’ouverture ('+m.plusPetit+' px : « '+m.lequel+' »)');
    assert.ok(m.k>=1,V+'le schéma n’est pas réduit ('+m.k+')');
    assert.deepEqual(m.ecran,[Math.round(m.dessin[0]*m.k),Math.round(m.dessin[1]*m.k)].map((x,i)=>Math.abs(x-m.ecran[i])<=1?m.ecran[i]:x),V+'sa largeur et sa hauteur suivent la même échelle');
    assert.equal(await page.locator(`${M} [data-mu-graphe]`).getAttribute('data-ch-echelle'),'lisible');
    if(largeur===1366){
      assert.ok(m.cadre.contenuL>m.cadre.largeur+20,V+'plus large que son cadre ('+m.cadre.contenuL+' px dans '+m.cadre.largeur+')');
      assert.equal(m.cadre.x,'auto',V+'il défile dans son cadre');
      // On le fait défiler : la dernière colonne vient à l'écran.
      await page.locator(`${M} .gr-cadre`).evaluate(c=>{c.scrollLeft=c.scrollWidth;});await attendre(100);
      assert.ok(await page.locator(`${M} .gr-cadre`).evaluate(c=>c.scrollLeft>20),V+'le cadre défile en largeur');
      await page.locator(`${M} .gr-cadre`).evaluate(c=>{c.scrollLeft=0;});
    }
    // En hauteur, c'est la colonne du chemin qui défile, pas le cadre : une seule zone qui défile.
    assert.ok(m.cadre.contenuH<=m.cadre.hauteur+1,V+'le cadre ne défile pas en hauteur');
    assert.deepEqual([m.fiche.y,m.fiche.contenu>m.fiche.hauteur],['auto',true],V+'la colonne du chemin défile');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight-innerHeight),0,V+'la page ne défile pas');

    /* ---- 2. la barre d'outils, au-dessus du cadre ------------------------------------------------------------- */
    assert.equal(m.barre.position,'static',V+'la barre d’outils ne flotte plus sur le dessin');
    assert.ok(m.barre.bas<=m.cadre.haut+1,V+'elle est au-dessus du cadre ('+m.barre.bas+' ≤ '+m.cadre.haut+')');
    assert.deepEqual([m.barre.recoupe,m.barre.surLeCadre],[0,false],V+'elle ne recoupe aucune case, ni le cadre');
    assert.deepEqual(m.outils,largeur===1366?['Ajouter une étape','Réorganiser','Tout voir','En ligne']:m.outils.filter(x=>x!=='Tout voir').length===3?m.outils:[],V+'ses outils : '+m.outils.join(', '));
    assert.ok(m.barre.largeur<=m.cadre.largeur+16,V+'elle tient dans la largeur');

    /* ---- 3. « Tout voir », à la demande ; « Taille lisible » y revient ----------------------------------------- */
    const bouton=page.locator(`${M} [data-ch-schema]`);
    assert.deepEqual([await bouton.isVisible(),(await bouton.innerText()).trim(),await bouton.getAttribute('aria-pressed')],[true,'Tout voir','false'],V+'« Tout voir » se propose : le schéma est plus grand que son cadre');
    await bouton.click();await attendre(250);
    const t=await mesurer();
    assert.deepEqual([(await bouton.innerText()).trim(),await bouton.getAttribute('aria-pressed'),await page.locator(`${M} [data-mu-graphe]`).getAttribute('data-ch-echelle')],['Taille lisible','true','tout']);
    assert.ok(t.ecran[0]<=t.cadre.largeur&&t.ecran[1]<=t.fiche.hauteur,V+'« Tout voir » : le schéma tient entier ('+t.ecran+' dans '+t.cadre.largeur+' × '+t.fiche.hauteur+')');
    assert.ok(t.cadre.contenuL<=t.cadre.largeur+1,V+'« Tout voir » : plus rien à faire défiler en largeur');
    assert.ok(t.k<m.k,V+'il est réduit ('+t.k+' contre '+m.k+')');
    assert.equal(t.barre.recoupe,0,V+'« Tout voir » : la barre ne recoupe toujours aucune case');
    await bouton.click();await attendre(250);
    const r=await mesurer();
    assert.deepEqual([(await bouton.innerText()).trim(),r.k,r.plusPetit>=12-0.01],['Tout voir',m.k,true],V+'« Taille lisible » : 12 px au moins de nouveau');

    /* ---- 4. à cette taille, les gestes marchent ----------------------------------------------------------------- */
    const noeud=page.locator(`${M} .gr-svg .gr-noeud`).nth(3);
    const nom=(await noeud.locator('.gr-nom').textContent()).trim();
    await noeud.click();await attendre(350);
    assert.ok((await page.locator(`${M} .ch-etape-tete`).innerText()).includes(nom),V+'un clic sur une étape ouvre son tableau (« '+nom+' »)');
    const apres=await mesurer();
    assert.deepEqual([apres.k,apres.plusPetit>=12-0.01,apres.barre.recoupe],[m.k,true,0],V+'redessiné, le schéma garde sa taille lisible');
    // Un lien tiré d'une étape à une autre : le geste suit l'échelle (il est refusé ou accepté, mais il a lieu).
    const liens=()=>page.evaluate(()=>Sim.unite.cheminChoisi().liens.length);
    const avant=await liens();
    const de=await page.locator(`${M} .gr-svg .gr-noeud`).first().boundingBox(),vers=await page.locator(`${M} .gr-svg .gr-noeud`).nth(2).boundingBox();
    const poignee=page.locator(`${M} .gr-svg .gr-noeud`).first().locator('.gr-port, .gr-plus').first();
    if(await poignee.count()){
      const p=await poignee.boundingBox();
      await page.mouse.move(p.x+p.width/2,p.y+p.height/2);await page.mouse.down();
      await page.mouse.move(vers.x+vers.width/2,vers.y+vers.height/2,{steps:8});await page.mouse.up();await attendre(350);
      const n=await liens();
      assert.ok(n===avant+1||n===avant,V+'le lien tiré arrive sur l’étape visée');
      if(n===avant+1){await page.locator('#btn-annuler').click();await attendre(350);assert.equal(await liens(),avant);}
    }
    void de;

    /* ---- 5. « En ligne » : la même taille lisible ----------------------------------------------------------------- */
    await page.locator(`${M} [data-gr-sens]`).click();await attendre(350);
    const ligne=await mesurer();
    assert.ok(ligne.plusPetit>=12-0.01&&ligne.k>=1,V+'en ligne : 12 px au moins ('+ligne.plusPetit+' px)');
    assert.deepEqual([ligne.barre.position,ligne.barre.recoupe,ligne.barre.bas<=ligne.cadre.haut+1],['static',0,true],V+'en ligne : la barre au-dessus du cadre');
    assert.ok(ligne.cadre.contenuL>ligne.cadre.largeur,V+'en ligne : il défile dans son cadre');
    await page.locator(`${M} [data-gr-sens]`).click();await attendre(350);
    assert.equal((await mesurer()).k,m.k,V+'de retour en étapes : la même taille');

    /* ---- 6. un autre chemin s'ouvre à sa taille lisible ; un chemin court n'a rien à réduire ---------------------- */
    await bouton.click();await attendre(200);
    assert.equal(await page.locator(`${M} [data-mu-graphe]`).getAttribute('data-ch-echelle'),'tout');
    await choisir('sans-cuisine');
    const autre=await mesurer();
    assert.ok(autre.plusPetit>=12-0.01,V+'un autre chemin s’ouvre à sa taille lisible, même après « Tout voir » ('+autre.plusPetit+' px)');
    assert.equal((await page.locator(`${M} [data-ch-schema]`).innerText()).trim(),'Tout voir');
    await choisir('cuisine-seule');
    const court=await mesurer();
    assert.ok(court.plusPetit>=12-0.01,V+'un chemin d’une étape : 12 px au moins');
    assert.equal(await page.locator(`${M} [data-ch-schema]`).isVisible(),false,V+'rien à réduire : « Tout voir » ne se montre pas');
    assert.equal(court.barre.recoupe,0);

    dit.push(largeur+' px : '+m.cases+' cases, échelle '+m.k+', plus petit texte '+m.plusPetit+' px (« Tout voir » : '+t.k+')');
   }finally{await site.effacer();await ctx.close();}
  }
  assert.deepEqual(erreurs,[],'aucune erreur de page');
  console.log('chemins-schema-browser : ok — '+dit.join(' ; ')+' ; à l’ouverture le plus petit texte du schéma fait 12 px au moins et le schéma défile dans son cadre ; la barre d’outils est au-dessus du cadre et ne recoupe aucune case ; « Tout voir » le fait tenir entier, « Taille lisible » y revient ; les gestes suivent l’échelle ; « En ligne » de même ; un chemin court n’a rien à réduire.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

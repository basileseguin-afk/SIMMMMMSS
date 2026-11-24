/* Évolution 24 (d) — les captures de contrôle des fournisseurs, sur une unité fictive (tests/plan-rejoue-fictif.cjs), en
 * thème clair et sombre, à 1 366 × 768 et 1 920 × 1 080 :
 *   — « Chemins », le schéma sans les fournisseurs : les étapes seules, une pastille sur chaque étape cliente ;
 *   — « Chemins », la ligne sous le schéma et l'interrupteur ; puis le dessin complet, les liens des fournisseurs en
 *     pointillé ;
 *   — le tableau « Qui se fournit où », avec un client coché, un décoché et un « en partie » ;
 *   — la fiche d'un fournisseur, dans « Services et équipes » : ses clients, et le lien vers le tableau.
 * Chaque capture est vérifiée : sa taille, ce qu'elle doit montrer, la fenêtre qui ne défile pas, aucun texte sous 13 px
 * (12 px à l'écran dans un dessin).
 * Les captures sont gardées hors du dépôt : dans $ORY_CAPTURES s'il est donné, sinon dans un dossier temporaire, dit à la
 * fin. Aucune donnée de l'unité : tout est fictif. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const M='#mu-flux';

const dossier=process.env.ORY_CAPTURES?path.resolve(process.env.ORY_CAPTURES):fs.mkdtempSync(path.join(os.tmpdir(),'ory-captures-24-'));
fs.mkdirSync(dossier,{recursive:true});
/** La largeur et la hauteur d'un PNG, lues dans son en-tête (IHDR). */
const taillePng=f=>{const b=fs.readFileSync(f);assert.equal(b.toString('latin1',1,4),'PNG',f);return [b.readUInt32BE(16),b.readUInt32BE(20)];};
/** Dans la page : les textes sous la taille (13 px ; 12 px à l'écran dans un dessin), et la fenêtre qui défile. */
const LIRE=()=>{
  const petits=[],vus=new Set(),marche=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  for(let n=marche.nextNode();n;n=marche.nextNode()){
    const e=n.parentElement;if(!n.textContent.trim()||!e||vus.has(e))continue;vus.add(e);
    if(e.closest('script,style,option,title,desc,[hidden],.sr-only,dialog:not([open]),#notifs')||!e.getClientRects().length)continue;
    if(!e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true,contentVisibilityAuto:true}))continue;
    const dessin=e.closest('svg');let t=parseFloat(getComputedStyle(e).fontSize);
    if(dessin){const m=(e.getScreenCTM&&e.getScreenCTM())||dessin.getScreenCTM();if(m)t*=Math.sqrt(Math.abs(m.a*m.d-m.b*m.c));}
    if(t>=1&&t<(dessin?12:13)-0.05)petits.push(e.tagName.toLowerCase()+'.'+(e.className.baseVal??e.className)+' '+Math.round(t*10)/10+' px « '+n.textContent.trim().slice(0,24)+' »');
  }
  return {petits,fenetre:[document.scrollingElement.scrollHeight-innerHeight,document.scrollingElement.scrollWidth-innerWidth]};
};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const faites=[];
 try{
  for(const theme of ['clair','sombre'])for(const [largeur,hauteur] of [[1366,768],[1920,1080]]){
   const V=theme+', '+largeur+' × '+hauteur+' : ';
   const ctx=await browser.newContext({viewport:{width:largeur,height:hauteur},colorScheme:theme==='sombre'?'dark':'light',reducedMotion:'reduce'});
   const page=await ctx.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   const attendre=(ms=300)=>page.waitForTimeout(ms);
   /** Le thème de l'application (une préférence d'affichage) ; le fond de la page le confirme. */
   const poserTheme=async()=>{
     await page.evaluate(t=>{if(t==='sombre')document.documentElement.dataset.theme='sombre';else delete document.documentElement.dataset.theme;},theme);
     const fond=await page.evaluate(()=>{const m=getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g).slice(0,3).map(Number);return m[0]+m[1]+m[2];});
     assert.ok(theme==='sombre'?fond<240:fond>600,V+'le fond de la page est '+(theme==='sombre'?'sombre':'clair')+' : '+fond);
   };
   const capturer=async nom=>{
     await page.evaluate(()=>document.querySelectorAll('.notif .notif-fermer').forEach(b=>b.click()));
     await page.waitForFunction(()=>!document.querySelector('.notifs .notif'));
     const m=await page.evaluate(LIRE);
     assert.deepEqual(m.fenetre,[0,0],V+nom+' : la fenêtre ne défile pas');
     assert.deepEqual(m.petits,[],V+nom+' : aucun texte sous 13 px (12 px à l’écran dans un dessin)');
     const f=path.join(dossier,'24-'+theme+'-'+largeur+'-'+nom+'.png');await page.screenshot({path:f});
     assert.deepEqual(taillePng(f),[largeur,hauteur],V+nom+' : la taille de la capture');
     assert.ok(fs.statSync(f).size>20000,V+nom+' : une capture qui montre quelque chose');faites.push(f);};
   const site=await F.charger(page,nav,URL,{pageId:'mu-flux'});
   try{
    await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.unite);
    await poserTheme();
    const choisir=async id=>{await page.locator(`${M} .ch-liste [data-mu-flux-choisir="${id}"]`).click();
      await page.waitForFunction(i=>document.querySelector('#mu-flux .ch-fiche').dataset.muFluxFiche===i&&!!document.querySelector('#mu-flux .gr-svg .gr-noeud'),id);await attendre(300);};
    const schema=()=>page.evaluate(()=>{const svg=document.querySelector('#mu-flux .gr-svg');return {noeuds:[...svg.querySelectorAll('.gr-noeud')].map(n=>n.dataset.noeud),liens:svg.querySelectorAll('.gr-lien').length,
      pointilles:svg.querySelectorAll('.gr-lien.pointille').length,pastilles:[...svg.querySelectorAll('.ch-pastille')].map(g=>g.closest('.gr-noeud').dataset.noeud+' ← '+g.querySelector('text').textContent)};});

    /* ---- « Chemins », sans les fournisseurs sur le schéma ---------------------------------------------------- */
    await choisir('complet');
    const sans=await schema();
    assert.deepEqual([sans.noeuds.includes('appros'),sans.noeuds.includes('magasin'),sans.pointilles],[false,false,0],V+'le schéma ne dessine pas les fournisseurs');
    assert.deepEqual(sans.pastilles.map(x=>x.split(' ← ')[0]).sort(),['decontam','prepa'],V+'une pastille sur chaque étape cliente');
    assert.equal(await page.locator(`${M} .ch-compte`).textContent(),'12 commandes · 8 étapes · 2 fournisseurs',V+'le compte distingue étapes et fournisseurs');
    assert.equal(await page.locator(`${M} .ch-liste [data-ch-panneau="fournisseurs"] b`).textContent(),'Fournisseurs',V+'l’entrée « Fournisseurs », au-dessus des chemins');
    await capturer('chemins-sans-fournisseurs');
    // La ligne sous le schéma, et l'interrupteur.
    await page.locator(`${M} .ch-fournis`).scrollIntoViewIfNeeded();await attendre(200);
    assert.equal(await page.locator(`${M} .ch-fournis-dit`).textContent(),'Fournisseurs de ce chemin : Réception / Appros, Magasin');
    assert.equal(await page.locator(`${M} [data-ch-fournisseurs]`).getAttribute('aria-checked'),'false');
    assert.equal(await page.evaluate(()=>{const l=document.querySelector('#mu-flux .ch-fournis').getBoundingClientRect();return l.top>=0&&l.bottom<=innerHeight;}),true,V+'la ligne est à l’écran');
    await capturer('chemins-ligne-fournisseurs');

    /* ---- « Chemins », avec les fournisseurs sur le schéma ---------------------------------------------------- */
    await page.locator(`${M} [data-ch-fournisseurs]`).click();await attendre(400);
    const avec=await schema();
    assert.deepEqual([avec.noeuds.includes('appros'),avec.noeuds.includes('magasin'),avec.pointilles,avec.pastilles.length],[true,true,2,0],V+'le dessin complet : les fournisseurs, leurs liens en pointillé');
    assert.ok(sans.liens<avec.liens,V+'moins de liens sans les fournisseurs ('+sans.liens+') qu’avec ('+avec.liens+')');
    await page.locator(`${M} .ch-tete`).scrollIntoViewIfNeeded();await page.evaluate(()=>{document.querySelector('#mu-flux .ch-fiche').scrollTop=0;});await attendre(200);
    await capturer('chemins-avec-fournisseurs');
    await page.locator(`${M} [data-ch-fournisseurs]`).click();await attendre(300);
    assert.equal(await page.evaluate(()=>localStorage.getItem('ory-ui-chemins-fournisseurs')),null,V+'l’interrupteur est de nouveau éteint');

    /* ---- le tableau « Qui se fournit où » : un client coché, un décoché, un en partie -------------------------- */
    await page.locator(`${M} .ch-liste [data-ch-panneau="fournisseurs"]`).click();await page.waitForSelector(`${M} .ch-fiche[data-ch-vue="fournisseurs"]`);await attendre(200);
    const tableau=await page.evaluate(()=>{const t=document.querySelector('#mu-flux .fo-table'),c=document.querySelector('#mu-flux .fo-cadre');
      const cellule=(s,f)=>{const col=[...t.querySelectorAll('thead th')].findIndex(th=>th.dataset.foColonne===f),td=t.querySelector(`tr[data-fo-service="${s}"]`).children[col],x=td.querySelector('input');
        return x?(x.checked?'coché':'décoché'):td.querySelector('.fo-dit').textContent.trim();};
      return {titre:document.querySelector('#mu-flux .ch-fiche h2').textContent,colonnes:[...t.querySelectorAll('thead th[data-fo-colonne] b')].map(b=>b.textContent),
        coche:cellule('decontam','appros'),decoche:cellule('cuisine','appros'),partie:cellule('preparation','appros'),boutons:[...t.querySelectorAll('.fo-partie button')].map(b=>b.textContent.trim()),
        defile:c.scrollHeight-c.clientHeight};});
    assert.deepEqual(tableau,{titre:'Qui se fournit où',colonnes:['Réception / Appros','Magasin'],coche:'coché',decoche:'décoché',partie:'en partie : 1 chemin sur 2',boutons:['Partout','Nulle part'],defile:0},V+'un client coché, un décoché, un en partie');
    await capturer('fournisseurs-tableau');

    /* ---- la fiche d'un fournisseur ----------------------------------------------------------------------------- */
    await nav.aller(page,'mu-services');await attendre();
    await page.locator('#mu-services .se-liste [data-mu-choisir="magasin"]').click();await attendre();
    const fiche=await page.evaluate(()=>{const f=document.querySelector('#mu-services .se-fiche'),c=f.querySelector('.fo-clients');
      return {besoins:f.querySelectorAll('[data-mu-besoin]').length,clients:c.querySelector('.fo-clients-liste').textContent.trim(),lien:c.querySelector('[data-fo-ouvrir]').textContent.trim()};});
    assert.deepEqual(fiche,{besoins:0,clients:'Montage',lien:'Régler dans Chemins › Fournisseurs →'},V+'la fiche montre ses clients, et mène au tableau');
    await page.locator('#mu-services .fo-clients').scrollIntoViewIfNeeded();await attendre(200);
    assert.equal(await page.evaluate(()=>{const l=document.querySelector('#mu-services .fo-clients').getBoundingClientRect();return l.top>=0&&l.bottom<=innerHeight;}),true,V+'ses clients sont à l’écran');
    await capturer('fiche-fournisseur');

    assert.deepEqual(errors,[],V+'aucune erreur de page');
   }finally{site.effacer();await ctx.close();}
  }
  assert.equal(faites.length,20,'vingt captures : cinq vues, deux thèmes, deux tailles');
  console.log('OK captures de l’évolution 24 : '+faites.length+' captures dans '+dossier+' — « Chemins » sans et avec les fournisseurs sur le schéma, la ligne sous le schéma, le tableau « Qui se fournit où » (un client coché, un décoché, un en partie), la fiche d’un fournisseur ; clair et sombre, 1 366 × 768 et 1 920 × 1 080');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

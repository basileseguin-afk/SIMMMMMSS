/* Évolution 23 (h) — les captures de contrôle de l'étape C de l'audit (« alléger »), sur une unité fictive
 * (tests/plan-rejoue-fictif.cjs) et un programme daté fictif de trente jours, en thème clair et sombre, à 1 366 × 768 et
 * 1 920 × 1 080 :
 *   — le menu : treize entrées (« Plan » n'y est plus), deux blocs, puis « Fichiers », « Lecture seule » et le thème ;
 *   — « Chemins » : le schéma à une taille lisible, sa barre d'outils au-dessus du cadre ;
 *   — « Réglages » : la liste des sections à gauche, la section choisie à droite ;
 *   — « Programme » : le compte rendu en deux lignes, le tableau des vols du jour dans son cadre ;
 *   — « Contrôles » en lecture seule : la page se lit, sous « Lire » ; ses boutons vers un réglage sont grisés ;
 *   — la Synthèse : ses phrases en tête, le reste dans sa zone.
 * Chaque capture est vérifiée : sa taille, ce qu'elle doit montrer, la fenêtre qui ne défile pas, aucun texte sous 13 px
 * (12 px à l'écran dans un dessin). Aucune ne montre le plan de l'unité.
 * Les captures sont gardées hors du dépôt : dans $ORY_CAPTURES s'il est donné, sinon dans un dossier temporaire, dit à la
 * fin. Aucune donnée de l'unité : tout est fictif. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL=pathToFileURL(path.resolve(__dirname,'../index.html')).href;

const dossier=process.env.ORY_CAPTURES?path.resolve(process.env.ORY_CAPTURES):fs.mkdtempSync(path.join(os.tmpdir(),'ory-captures-23-'));
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
  return {petits,fenetre:[document.scrollingElement.scrollHeight-innerHeight,document.scrollingElement.scrollWidth-innerWidth],plan:!!document.querySelector('#plan-wrap:not([hidden]) svg, .plan-wrap svg')&&document.body.dataset.direct==='plat'&&document.body.dataset.sous==='j-plan'};
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
     assert.equal(m.plan,false,V+nom+' : la capture ne montre pas le plan de l’unité');
     const f=path.join(dossier,'23-'+theme+'-'+largeur+'-'+nom+'.png');await page.screenshot({path:f});
     assert.deepEqual(taillePng(f),[largeur,hauteur],V+nom+' : la taille de la capture');
     assert.ok(fs.statSync(f).size>20000,V+nom+' : une capture qui montre quelque chose');faites.push(f);};
   const site=await F.charger(page,nav,URL,{csv:F.volsDatesCsv(30,'2031-03-03'),pageId:'j-chiffres'});
   try{
    await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.onglets);
    await poserTheme();

    /* ---- le menu ------------------------------------------------------------------------------------------- */
    await nav.aller(page,'j-chiffres');
    const menu=await page.evaluate(()=>({entrees:[...document.querySelectorAll('#menu [data-sous-onglet] > span:not(.so-badge), #btn-sauvegarde > span:last-child')].map(x=>x.textContent.trim()),
      blocs:[...document.querySelectorAll('#menu .menu-bloc:not(.menu-accueil)')].map(b=>b.querySelector('.menu-bloc-titre').textContent.trim()),
      defile:(()=>{const z=document.querySelector('.barre-defile');return z.scrollHeight-z.clientHeight;})()}));
    // (Évolution 26 c : « Commandes » ; 26 f : « Régler » dans l'ordre du travail, chaque entrée au nom de sa page.)
    assert.deepEqual(menu.entrees,['Synthèse','En direct','Planning','Période','Détails','Comparer','Commandes','Services et équipes','Chemins','Programme des vols','Planche retour','Réglages','Contrôles','Fichiers'],V+'les quatorze entrées du menu');
    assert.deepEqual(menu.blocs,['Lire','Régler'],V+'deux blocs');
    assert.ok(menu.defile<=0,V+'le menu ne défile pas');
    assert.equal(await page.locator('#menu [data-entree="u-plan"]').count(),0,V+'« Plan » n’est plus au menu');
    await capturer('1-menu');

    /* ---- « Chemins » : le schéma lisible, la barre d'outils au-dessus du cadre ------------------------------- */
    await nav.aller(page,'mu-flux');
    await page.waitForSelector('#mu-flux [data-mu-graphe] .gr-svg');
    const schema=await page.evaluate(()=>{const svg=document.querySelector('#mu-flux [data-mu-graphe] .gr-svg'),m=svg.getScreenCTM(),k=Math.sqrt(Math.abs(m.a*m.d-m.b*m.c));
      const textes=[...svg.querySelectorAll('text')].filter(t=>t.getClientRects().length).map(t=>parseFloat(getComputedStyle(t).fontSize)*k);
      const barre=document.querySelector('#mu-flux .gr-barre').getBoundingClientRect(),cadre=document.querySelector('#mu-flux .gr-cadre').getBoundingClientRect();
      return {petit:Math.round(Math.min(...textes)*100)/100,barreAuDessus:barre.bottom<=cadre.top+1};});
    assert.ok(schema.petit>=11.95,V+'le plus petit texte du schéma fait '+schema.petit+' px');
    assert.equal(schema.barreAuDessus,true,V+'la barre d’outils est au-dessus du cadre');
    await capturer('2-chemins');

    /* ---- « Réglages » : la liste à gauche, la section choisie à droite ---------------------------------------- */
    await nav.aller(page,'rg-simulation');
    await page.locator('#view-reglages .rs-liste [data-rs-choisir="retours"]').click();
    await page.waitForFunction(()=>document.getElementById('view-reglages').dataset.rs==='retours');
    assert.equal(await page.locator('#view-reglages .rs-liste [data-rs-choisir]').count(),10,V+'les dix sections');
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('#rg-modele>*')].filter(e=>e.getClientRects().length).map(e=>e.id)),['rg-sim-materiel'],V+'la section choisie, seule');
    await capturer('3-reglages');

    /* ---- « Programme » : le compte rendu en deux lignes, le tableau dans son cadre ----------------------------- */
    await F.importerVols(page,nav,site.fichier,'vols-trente-jours.csv',F.volsDatesCsv(30,'2031-03-03'));
    await poserTheme();
    assert.equal(await page.locator('#import-report .vp-cr-ligne').count(),2,V+'le compte rendu : deux lignes');
    const vols=await page.evaluate(()=>{const k=document.querySelector('#vp-tableau .vp-cadre').getBoundingClientRect(),th=document.querySelector('#vp-tableau thead th').getBoundingClientRect();
      return [...document.querySelectorAll('#vp-tableau tbody tr')].filter(t=>{const b=t.getBoundingClientRect();return b.top>=th.bottom-1&&b.bottom<=Math.min(innerHeight,k.bottom)+1;}).length;});
    assert.ok(vols>=6,V+vols+' vols du jour à l’écran, sans défiler');
    await capturer('4-programme');

    /* ---- « Contrôles » en lecture seule ------------------------------------------------------------------------ */
    await nav.aller(page,'mu-pas');
    await page.locator('#btn-lecture-seule').click();
    await page.waitForFunction(()=>document.body.dataset.lecture==='seule'&&!!document.querySelector('#menu [data-bloc=lire] [data-entree="mu-pas"]'));
    assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-pas',V+'« Contrôles » reste ouverte en lecture seule');
    assert.ok(await page.locator('#mu-pas .ct-point button:disabled').count()>=3,V+'ses boutons vers un réglage sont grisés');
    assert.ok(await page.locator('#mu-pas .ct-raison').count()>=3,V+'avec leur raison');
    await capturer('5-controles-lecture-seule');
    await page.locator('#btn-lecture-seule').click();
    await page.waitForFunction(()=>document.body.dataset.lecture===undefined);

    /* ---- la Synthèse ------------------------------------------------------------------------------------------ */
    await nav.aller(page,'j-chiffres');
    await page.waitForSelector('#bilan-journee .sy-zone');
    const sy=await page.evaluate(()=>{const v=document.getElementById('journee-chiffres'),z=v.querySelector('.sy-zone');return {page:v.scrollHeight-v.clientHeight,zone:getComputedStyle(z).overflowY,tete:!!v.querySelector('.sy-tete .bilan-resume')};});
    assert.ok(sy.page<=1&&sy.zone==='auto'&&sy.tete,V+'la Synthèse : ses phrases en tête, le reste dans sa zone, la page ne défile pas');
    await capturer('6-synthese');

    assert.deepEqual(errors,[],V+'aucune erreur de page');
   }finally{await site.effacer();await ctx.close();}
  }
  assert.equal(faites.length,24);
  console.log('captures-evolution-23-browser : ok — '+faites.length+' captures (le menu, « Chemins », « Réglages », « Programme », « Contrôles » en lecture seule, la Synthèse), en clair et en sombre, à 1 366 × 768 et 1 920 × 1 080, dans '+dossier);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

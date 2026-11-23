/* Évolution 22 (g) — les captures de contrôle du regroupement de l'interface, sur une unité fictive
 * (tests/plan-rejoue-fictif.cjs), en thème clair et sombre, à 1 366 × 768 et 1 920 × 1 080 :
 *   — le menu : deux blocs, « Lire » et « Régler », douze entrées, puis « Fichiers », « Lecture seule » et le thème ;
 *   — « Services et équipes » : la liste à gauche, la fiche à droite ;
 *   — « Chemins » : la liste des chemins à gauche, le chemin choisi à droite ;
 *   — « Contrôles » : la ligne d'état, puis trois colonnes ;
 *   — « Fichiers » : la sauvegarde et les limites en haut, le tableau des classeurs dessous ;
 *   — la Synthèse en lecture seule : le bloc « Régler » replié en « Paramétrage verrouillé ».
 * Chaque capture est vérifiée — sa taille, ce qu'elle doit montrer, la page qui tient sur la largeur — et, pour les quatre
 * nouvelles pages : la page ne défile pas, chaque colonne défile seule, aucun texte sous 13 px. Les mesures de l'après
 * sont dites à la fin (le menu, les pages, les champs visibles, la hauteur de chaque nouvelle page en écrans de portable).
 * Les captures sont gardées hors du dépôt : dans $ORY_CAPTURES s'il est donné, sinon dans un dossier temporaire, dit à la
 * fin. Chaque étape attend son effet, pas un délai. Aucune donnée de l'unité : tout est fictif. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL=pathToFileURL(path.resolve(__dirname,'../index.html')).href;

const dossier=process.env.ORY_CAPTURES?path.resolve(process.env.ORY_CAPTURES):fs.mkdtempSync(path.join(os.tmpdir(),'ory-captures-22-'));
fs.mkdirSync(dossier,{recursive:true});
/** La largeur et la hauteur d'un PNG, lues dans son en-tête (IHDR). */
const taillePng=f=>{const b=fs.readFileSync(f);assert.equal(b.toString('latin1',1,4),'PNG',f);return [b.readUInt32BE(16),b.readUInt32BE(20)];};

/* Ce que la page mesure d'elle-même (dans le navigateur) : ses champs et ses boutons visibles, sa hauteur en écrans (le
 * contenu de sa vue, rapporté à ce que l'écran en montre), les zones qui défilent dedans, les textes sous 13 px (hors des
 * diagrammes, dont le texte est en unités du dessin). */
const MESURER=([racine,vue])=>{
  const visibles=sel=>[...document.querySelectorAll(sel)].filter(e=>e.getClientRects().length&&!e.closest('#barre,.haut,#notifs,dialog'));
  const champs=visibles('#workspace input:not([type=hidden]):not([type=file]),#workspace select,#workspace textarea').filter(e=>!e.disabled).length;
  const boutons=visibles('#workspace button,#workspace summary,#workspace label.btn').filter(e=>!e.disabled).length;
  const v=document.querySelector(vue),z={c:v.clientHeight,s:v.scrollHeight};
  const zones=[...v.querySelectorAll('*')].filter(e=>e.getClientRects().length&&/(auto|scroll)/.test(getComputedStyle(e).overflowY))
    .map(e=>({c:e.clientHeight,s:e.scrollHeight})).filter(x=>x.c>=100);
  const petits=[...document.querySelectorAll(racine+' *')].filter(e=>e.getClientRects().length&&!e.children.length&&!e.closest('svg')&&(e.textContent||'').trim().length>1
    &&parseFloat(getComputedStyle(e).fontSize)<12.5).map(e=>e.tagName.toLowerCase()+'.'+e.className+' « '+e.textContent.trim().slice(0,30)+' »');
  return {champs,boutons,ecrans:Math.round(z.s/z.c*100)/100,page:document.documentElement.scrollHeight-innerHeight,zonesQuiDefilent:zones.filter(x=>x.s>x.c+2).length,petits};
};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const faites=[];let mesures=null;
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
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0,V+nom+' : la page tient sur la largeur');
     const f=path.join(dossier,'22-'+theme+'-'+largeur+'-'+nom+'.png');await page.screenshot({path:f});
     assert.deepEqual(taillePng(f),[largeur,hauteur],V+nom+' : la taille de la capture');
     assert.ok(fs.statSync(f).size>20000,V+nom+' : une capture qui montre quelque chose');faites.push(f);};
   /** Une nouvelle page : elle ne défile pas, ses colonnes défilent seules, aucun texte sous 13 px. */
   const nouvellePage=async(nom,racine,vue,colonnes)=>{
     const m=await page.evaluate(MESURER,[racine,vue]);
     assert.equal(m.page,0,V+nom+' : le document ne défile pas');
     assert.equal(m.ecrans,1,V+nom+' : la page tient dans l’écran ('+m.ecrans+' écran)');
     assert.deepEqual(m.petits,[],V+nom+' : aucun texte sous 13 px');
     for(const sel of colonnes){
       const c=await page.locator(sel).first().evaluate(e=>{const r=e.getBoundingClientRect();return {o:getComputedStyle(e).overflowY,bas:Math.round(r.bottom),haut:innerHeight,h:Math.round(r.height)};});
       assert.equal(c.o,'auto',V+nom+' : '+sel+' défile seule');
       assert.ok(c.bas<=c.haut&&c.h>=120,V+nom+' : '+sel+' tient dans l’écran ('+c.bas+' / '+c.haut+', '+c.h+' px de haut)');
     }
     return m;
   };
   let x=null;
   try{
    x=await F.charger(page,nav,URL,{sauvegarde:F.sauvegardeFictive(),csv:F.volsCsv(),pageId:'j-chiffres'});
    await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.onglets);
    const M={};

    /* ---- le menu ------------------------------------------------------------------------------------------ */
    await nav.aller(page,'j-chiffres');await poserTheme();
    await page.waitForSelector('#journee-chiffres .sy-service');
    const menu=await page.evaluate(()=>{const O=OrlyOnglets,z=document.querySelector('#barre .barre-defile');
      return {blocs:[...document.querySelectorAll('#menu .menu-bloc')].map(b=>[b.querySelector('.menu-bloc-titre').textContent,b.querySelectorAll('[data-sous-onglet]').length]),
        entrees:[...document.querySelectorAll('#menu [data-sous-onglet]')].map(b=>b.textContent.replace(/\d+$/,'').trim()),
        pied:[...document.querySelectorAll('#barre .barre-pied > button')].map(b=>b.textContent.trim()),defile:z.scrollHeight-z.clientHeight,
        pages:O.PARTIES.flatMap(p=>p.pages).length,montrees:O.PARTIES.flatMap(p=>p.pages).filter(q=>O.montree(q.id)).length,auMenu:O.entrees().length,anciennes:Object.keys(O.ANCIENNES).length};});
    // (Évolution 23 a : « Plan » n'est plus au menu — onze entrées dans les deux blocs, contre douze.)
    assert.deepEqual(menu.blocs,[['Lire',5],['Régler',6]],V+'deux blocs : cinq entrées pour lire, six pour régler');
    assert.deepEqual(menu.entrees,['Synthèse','En direct','Planning','Détails','Comparer','Programme','Retours','Services et équipes','Chemins','Réglages','Contrôles'],V+'les onze entrées, dans l’ordre');
    assert.deepEqual(menu.pied,['Fichiers','Lecture seule','Thème sombre'],V+'en bas : Fichiers, Lecture seule, le thème');
    assert.ok(menu.defile<=1,V+'le menu ne défile pas ('+menu.defile+' px)');
    // Douze entrées sans programme daté (onze et « Fichiers ») ; « Période » fait la treizième avec un programme daté.
    assert.deepEqual([menu.auMenu,menu.pages,menu.montrees],[12,18,17],V+'douze entrées au menu, dix-huit pages (dix-sept sans « Période »)');
    await capturer('1-menu');

    /* ---- « Services et équipes » : la liste à gauche, la fiche à droite -------------------------------------- */
    await nav.aller(page,'mu-services');
    await page.locator('#mu-services .se-liste .mu-svc').first().waitFor();
    await page.locator('#mu-services .se-liste .mu-svc').filter({hasText:'Montage'}).first().click();
    await page.waitForFunction(()=>/Montage/.test((document.querySelector('#mu-services .se-fiche')||{textContent:''}).textContent));
    M.services=await nouvellePage('Services et équipes','#mu-services','#view-ateliers',['#mu-services .se-liste','#mu-services .se-fiche']);
    assert.ok(await page.evaluate(()=>document.querySelector('#mu-services .se-liste').getBoundingClientRect().right<=document.querySelector('#mu-services .se-fiche').getBoundingClientRect().left+1),V+'la liste est à gauche de la fiche');
    await capturer('2-services-et-equipes');

    /* ---- « Chemins » : la liste des chemins à gauche, le chemin choisi à droite ----------------------------- */
    await nav.aller(page,'mu-flux');
    await page.locator('#mu-flux .ch-liste [data-mu-flux-choisir]').first().waitFor();
    await page.locator('#mu-flux .ch-liste [data-mu-flux-choisir]').first().click();
    await page.locator('#mu-flux .ch-fiche').waitFor();
    await page.waitForFunction(()=>document.querySelectorAll('#mu-flux .ch-fiche [data-mu-graphe] g, #mu-flux .ch-fiche svg g').length>0);
    M.chemins=await nouvellePage('Chemins','#mu-flux','#view-ateliers',['#mu-flux .ch-liste','#mu-flux .ch-fiche']);
    assert.ok(await page.evaluate(()=>document.querySelector('#mu-flux .ch-liste').getBoundingClientRect().right<=document.querySelector('#mu-flux .ch-fiche').getBoundingClientRect().left+1),V+'la liste est à gauche du chemin');
    await capturer('3-chemins');

    /* ---- « Contrôles » : la ligne d'état, trois colonnes --------------------------------------------------- */
    await nav.aller(page,'mu-pas');
    await page.locator('#mu-pas .ct-niveau').first().waitFor();
    assert.deepEqual(await page.locator('#mu-pas .ct-niveau > h3 > span:first-of-type').allTextContents(),['Bloquant','À corriger','Information'],V+'trois colonnes');
    assert.equal(await page.locator('#mu-pas .ct-etat .ct-calcul').count(),1,V+'la ligne d’état');
    M.controles=await nouvellePage('Contrôles','#mu-pas','#view-ateliers',['#mu-pas .ct-niveau.bloquant .ct-liste','#mu-pas .ct-niveau.corriger .ct-liste','#mu-pas .ct-niveau.information .ct-liste']);
    await capturer('4-controles');

    /* ---- « Fichiers » : la sauvegarde et les limites en haut, le tableau dessous ---------------------------- */
    await nav.aller(page,'u-sauvegarde');
    await page.locator('#fi-classeurs tbody tr').first().waitFor();
    assert.equal(await page.locator('#fi-classeurs tbody tr').count(),10,V+'dix classeurs');
    M.fichiers=await nouvellePage('Fichiers','#panel-donnees','#view-flux',['#fi-classeurs']);
    const tableau=await page.evaluate(()=>{const z=document.getElementById('fi-classeurs').getBoundingClientRect(),t=document.getElementById('sauvegarde-export').getBoundingClientRect();
      return {entieres:[...document.querySelectorAll('#fi-classeurs tbody tr')].filter(tr=>{const r=tr.getBoundingClientRect();return r.top>=z.top&&r.bottom<=z.bottom+1;}).length,dessous:t.bottom<=z.top,
        tetes:[...document.querySelectorAll('#fi-classeurs thead th')].map(th=>Math.round(th.getBoundingClientRect().height))};});
    assert.equal(tableau.dessous,true,V+'le tableau est sous la sauvegarde');
    // (Retouche de contrôle : deux lignes seulement se voyaient sur un portable.)
    assert.ok(tableau.entieres>=3,V+'le tableau montre trois classeurs entiers au moins sans défiler ('+tableau.entieres+')');
    assert.ok(Math.max(...tableau.tetes)<=40,V+'ses en-têtes tiennent sur une ligne ('+tableau.tetes+')');
    await capturer('5-fichiers');

    /* ---- la Synthèse en lecture seule ---------------------------------------------------------------------- */
    await nav.aller(page,'j-chiffres');
    await page.locator('#btn-lecture-seule').click();
    await page.waitForFunction(()=>document.body.dataset.lecture==='seule'&&!!document.querySelector('#menu [data-bloc=regler][data-ferme]'));
    assert.equal((await page.locator('#menu [data-bloc=regler] .menu-ferme').innerText()).trim(),'Paramétrage verrouillé',V+'le bloc « Régler » replié');
    assert.equal(await page.locator('#menu [data-sous-onglet]').count(),5,V+'les cinq entrées de « Lire »');
    assert.equal(await page.locator('#btn-lecture-seule').getAttribute('aria-checked'),'true');
    assert.equal(await page.evaluate(()=>document.body.dataset.sous),'j-chiffres');
    assert.ok(await page.locator('#journee-chiffres .sy-service').count()>=5,V+'la Synthèse est intacte');
    await capturer('6-synthese-lecture-seule');
    await page.locator('#btn-lecture-seule').click();
    await page.waitForFunction(()=>document.body.dataset.lecture===undefined&&document.querySelectorAll('#menu [data-sous-onglet]').length===11);

    if(theme==='clair'&&largeur===1366)mesures={menu,pages:M};
    assert.deepEqual(errors,[],V+'aucune erreur de page');
   }finally{if(x)await x.effacer();await ctx.close();}
  }
  assert.equal(faites.length,24,'six captures, en clair et en sombre, à deux tailles');
  const m=mesures.pages,dire=(nom,p)=>nom+' : '+p.champs+' champs et '+p.boutons+' boutons visibles, '+p.ecrans+' écran, '+p.zonesQuiDefilent+' zone(s) qui défilent';
  console.log('captures-evolution-22-browser : ok — '+faites.length+' captures (le menu, « Services et équipes », « Chemins », « Contrôles », « Fichiers », la Synthèse en lecture seule), en clair et en sombre, à 1 366 × 768 et 1 920 × 1 080, dans '+dossier);
  console.log('mesures à 1 366 × 768 — le menu : '+mesures.menu.auMenu+' entrées (onze et « Fichiers » ; treize avec « Période »), '+mesures.menu.pages+' pages, '+mesures.menu.anciennes+' noms de pages d’avant qui mènent aux nouvelles ; '
    +[dire('Services et équipes',m.services),dire('Chemins',m.chemins),dire('Contrôles',m.controles),dire('Fichiers',m.fichiers)].join(' ; ')+'.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

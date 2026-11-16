/* Évolution 19 (e) — les captures de contrôle du nettoyage de l'interface, sur
 * une unité fictive (tests/plan-rejoue-fictif.cjs), en thème clair et sombre,
 * à 1 366 × 768 et 1 920 × 1 080 :
 *   — la page des vols : un seul bouton d'import, le menu des modèles, le
 *     tableau des vols du jour sur la largeur de la page ;
 *   — une fiche de plonge par vol (ses durées par compagnie ; ni débit ni
 *     plafond), puis au débit (ses débits ; plus de durée par compagnie),
 *     chacune avec sa ligne « n réglages ne jouent pas ici » ;
 *   — les temps par vol : « Temps par vol par service » (un service qui
 *     travaille par compagnie montre ses minutes par compagnie ; les mises à
 *     disposition n'y sont pas) et « Temps par vol » ;
 *   — le panneau des problèmes : un avis de chaque niveau, les informations
 *     repliées sous les autres.
 * Chaque capture est vérifiée (sa taille, ce qu'elle doit montrer, la page qui
 * tient sur la largeur) et gardée hors du dépôt : dans $ORY_CAPTURES s'il est
 * donné, sinon dans un dossier temporaire, dit à la fin. Chaque étape attend
 * son effet, pas un délai. Aucune donnée de l'unité : tout est fictif. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL=pathToFileURL(path.resolve(__dirname,'../index.html')).href;

const dossier=process.env.ORY_CAPTURES?path.resolve(process.env.ORY_CAPTURES):fs.mkdtempSync(path.join(os.tmpdir(),'ory-captures-19-'));
fs.mkdirSync(dossier,{recursive:true});
/** La largeur et la hauteur d'un PNG, lues dans son en-tête (IHDR). */
const taillePng=f=>{const b=fs.readFileSync(f);assert.equal(b.toString('latin1',1,4),'PNG',f);return [b.readUInt32BE(16),b.readUInt32BE(20)];};
/* Un avis de chaque niveau, sur l'unité fictive : une commande que plus aucune équipe ne prépare (bloquant) ; une compagnie
 * que le handling ne charge plus (à corriger) ; des commandes d'une compagnie (ZEPHYR, absente du programme fictif) qui ne
 * vole pas ce jour-là (information). */
const AVIS=()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state,repas=Sim.ateliers.classes.filter(c=>!c.categorie&&(c.vols||[]).length);
  const cies=[...new Set(repas.map(c=>c.cie))],sansHandling=cies[0],oubliee=repas.find(c=>c.cie!==sansHandling).id;
  st.ateliers.find(a=>a.type==='handling').compagnies=cies.filter(c=>c!==sansHandling);
  for(const a of st.ateliers)if(Array.isArray(a.lots))a.lots=a.lots.map(l=>l.filter(id=>id!==oubliee)).filter(l=>l.length);
  st.ateliers.find(a=>a.type==='manuel'&&a.lots.length).lots.push(['ZEPHYR/YC'],['ZEPHYR/CREW']);},'');

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
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0,V+nom+' : la page tient sur la largeur');
     const f=path.join(dossier,'19-'+theme+'-'+largeur+'-'+nom+'.png');await page.screenshot({path:f});
     assert.deepEqual(taillePng(f),[largeur,hauteur],V+nom+' : la taille de la capture');
     assert.ok(fs.statSync(f).size>20000,V+nom+' : une capture qui montre quelque chose');faites.push(f);};
   /** Un élément est à l'écran, en entier dans la largeur. */
   const aLEcran=sel=>page.evaluate(s=>{const e=document.querySelector(s);if(!e)return false;const r=e.getBoundingClientRect();
     return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.left>=0&&r.right<=innerWidth+1;},sel);
   let x=null;
   try{
    x=await F.charger(page,nav,URL,{sauvegarde:F.sauvegardeFictive(),csv:F.volsCsv(),pageId:'v-programme'});

    /* ---- la page des vols ---------------------------------------------------------------------------- */
    await nav.aller(page,'v-programme');
    await poserTheme();
    await page.waitForSelector('#vp-tableau table tbody tr');
    const vols=await page.evaluate(()=>{const b=s=>document.querySelector(s).getBoundingClientRect(),vue=document.getElementById('view-vols'),st=getComputedStyle(vue);
      const heures=[...document.querySelectorAll('#vp-tableau tbody .vp-heure')].map(e=>e.textContent);
      return {imports:document.querySelectorAll('#vols-donnees input[type=file]').length,bouton:document.querySelector('label.vp-importer').textContent.trim(),
        menu:document.querySelector('#vp-modeles summary').textContent.trim(),lignes:heures.length,departs:Sim.ateliers.a.vols().filter(v=>v.sens==='DEP').length,
        tri:heures.every((h,i)=>!i||heures[i-1]<=h),tetes:[...document.querySelectorAll('#vp-tableau thead th')].map(e=>e.textContent),
        large:b('#vp-tableau table').width>=vue.clientWidth-parseFloat(st.paddingLeft)-parseFloat(st.paddingRight)-4,sous:b('#vols-jour').top>=b('#vols-donnees').bottom};});
    assert.deepEqual([vols.imports,vols.bouton,vols.menu],[1,'Importer des vols','Modèles'],V+'un seul bouton d’import, et le menu des modèles');
    assert.ok(vols.lignes>0&&vols.lignes===vols.departs&&vols.tri,V+'les départs du jour, triés par heure : '+JSON.stringify(vols));
    assert.deepEqual(vols.tetes,['Départ','Vol','Compagnie','Business','Premium','Économie','Équipage']);
    assert.ok(vols.large&&vols.sous,V+'le tableau, sous l’import, prend la largeur de la page : '+JSON.stringify(vols));
    assert.ok(await aLEcran('label.vp-importer')&&await aLEcran('#vp-tableau thead'),V+'l’import et le haut du tableau sont à l’écran');
    await capturer('vols');

    /* ---- une fiche de plonge, par vol puis au débit ---------------------------------------------------- */
    const ouvrir=async id=>{await nav.aller(page,'at-equipes');await page.evaluate(id=>{Sim.ateliers.ouvert=id;Sim.ateliers.rendre();},id);
      const sel=`#view-ateliers [data-sous~="at-equipes"] article.at-carte.ouverte[data-at="${id}"]`;
      await page.waitForSelector(sel+' > .nj-hote details.nj');
      // On cadre sur « Comment se compte le lavage ? » : le choix, les tunnels, les durées, puis la ligne discrète.
      await page.locator(sel+' [data-at-champ="plonge-mode"]').first().evaluate(e=>{const z=e.closest('.view,#view-ateliers')||document.scrollingElement;
        e.scrollIntoView({block:'start'});for(let p=e.parentElement;p;p=p.parentElement)if(p.scrollTop>0){p.scrollTop=Math.max(0,p.scrollTop-90);break;}});
      return page.locator(sel).first();};
    /** Un champ de la fiche (hors de la ligne discrète) est à l'écran. */
    const champALEcran=(fiche,champ)=>fiche.locator(`[data-at-champ="${champ}"]`).evaluateAll(es=>es.some(e=>{if(e.closest('.nj-hote')||e.offsetParent===null)return false;
      const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));
    const visibles=(fiche,champ)=>fiche.locator(`[data-at-champ="${champ}"]`).evaluateAll(es=>es.filter(e=>!e.closest('.nj-hote')&&e.offsetParent!==null).length);
    const ligne=fiche=>fiche.locator(':scope > .nj-hote details.nj > summary').innerText();
    let fiche=await ouvrir('pl1');
    await poserTheme();
    assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.id==='pl1').parVol),true,V+'la plonge lave par vol');
    assert.ok(await visibles(fiche,'duree')>0,V+'par vol : ses durées par compagnie');
    assert.deepEqual([await visibles(fiche,'tunnel-debit'),await visibles(fiche,'plafond')],[0,0],V+'par vol : ni débit de tunnel ni plafond');
    assert.match(await ligne(fiche),/^\d+ réglages? ne jouen?t pas ici$/,V+'la ligne discrète, sous la fiche');
    assert.ok(await champALEcran(fiche,'plonge-mode')&&await champALEcran(fiche,'duree'),V+'le choix « par vol » et les durées par compagnie sont à l’écran');
    await capturer('plonge-par-vol');
    await fiche.locator('[data-at-champ="plonge-mode"]').selectOption('debit');
    await page.waitForFunction(()=>!Sim.ateliers.state.ateliers.find(a=>a.id==='pl1').parVol);
    fiche=await ouvrir('pl1');
    assert.ok(await visibles(fiche,'tunnel-debit')>0,V+'au débit : le débit de chaque tunnel');
    assert.equal(await visibles(fiche,'duree'),0,V+'au débit : plus de durée par compagnie');
    assert.match(await ligne(fiche),/^\d+ réglages? ne jouen?t pas ici$/,V+'la ligne discrète, sous la fiche');
    assert.ok(await champALEcran(fiche,'plonge-mode')&&await champALEcran(fiche,'tunnel-debit'),V+'le choix « au débit » et le débit des tunnels sont à l’écran');
    await capturer('plonge-au-debit');
    await fiche.locator('[data-at-champ="plonge-mode"]').selectOption('vol');
    await page.waitForFunction(()=>Sim.ateliers.state.ateliers.find(a=>a.id==='pl1').parVol===true);

    /* ---- les temps par vol ---------------------------------------------------------------------------- */
    await nav.aller(page,'rg-minutes');
    await poserTheme();
    await page.waitForSelector('#rg-bareme details.rg-service[data-service="quais"] > .nj-par-cie',{state:'attached'});
    // Le handling, déplié : ses minutes par compagnie, pas des temps par classe.
    const quais=page.locator('#rg-bareme details.rg-service[data-service="quais"]');
    if(!(await quais.evaluate(d=>d.open)))await quais.locator(':scope > summary').click();
    await page.waitForSelector('#rg-bareme details.rg-service[data-service="quais"] > .nj-par-cie .nj-table');
    await quais.evaluate(e=>e.scrollIntoView({block:'center'}));
    assert.ok(await aLEcran('#rg-bareme details.rg-service[data-service="quais"] > .nj-par-cie .nj-table'),V+'les minutes par compagnie du handling sont à l’écran');
    const tv=await page.evaluate(()=>{const cache=e=>!e||e.offsetParent===null;
      const dispos=[...new Set(Sim.ateliers.state.ateliers.filter(a=>a.type==='dispo').map(a=>a.service))]
        .filter(s=>Sim.ateliers.state.ateliers.filter(a=>a.service===s&&a.type!=='appui').every(a=>a.type==='dispo'));
      return {parCie:document.querySelectorAll('#rg-bareme details.rg-service > .nj-par-cie').length,
        dispos:dispos.length,disposCachees:dispos.every(s=>cache(document.querySelector('#rg-bareme details.rg-service[data-service="'+s+'"]'))),
        note:(document.querySelector('#rg-bareme .nj-dispos')||{}).textContent||''};});
    assert.ok(tv.parCie>=1,V+'un service qui travaille par compagnie montre ses minutes par compagnie');
    assert.ok(tv.dispos>=1&&tv.disposCachees,V+'les mises à disposition n’ont pas de ligne : '+JSON.stringify(tv));
    assert.match(tv.note,/mises? à disposition/,V+'la note le dit');
    await capturer('temps-par-vol-par-service');
    await nav.aller(page,'rg-recap');
    await poserTheme();
    await page.waitForSelector('#view-reglages [data-sous~="rg-recap"] table');
    await capturer('temps-par-vol');

    /* ---- le panneau des problèmes ---------------------------------------------------------------------- */
    await page.evaluate(AVIS);
    await page.waitForFunction(()=>['bloquant','corriger','information'].every(n=>Sim.problemes.liste.some(p=>p.niveau===n)));
    await nav.aller(page,'j-chiffres');
    await poserTheme();
    await page.locator('#btn-problemes').click();
    await page.waitForFunction(()=>document.getElementById('problemes').matches(':popover-open'));
    const pb=await page.evaluate(()=>{const l=Sim.problemes.liste,c=document.querySelector('#btn-problemes .pb-compte'),p=document.getElementById('problemes');
      return {groupes:[...p.querySelectorAll('.pb-groupe')].map(g=>g.tagName+' '+g.className),compte:+c.textContent,
        problemes:l.filter(a=>a.niveau!=='information').length,infos:l.filter(a=>a.niveau==='information').length,
        repliees:!p.querySelector('details.pb-groupe.information').open,total:p.querySelector('.pb-total').textContent,
        handling:l.some(a=>a.niveau==='corriger'&&/aucun handling ne charge cette compagnie/.test(a.titre)),
        sansVol:l.some(a=>a.niveau==='information'&&/aucun vol ce jour-là/.test(a.titre)),
        commande:l.some(a=>a.niveau==='bloquant'&&/préparée/.test(a.titre+a.detail))};});
    assert.deepEqual(pb.groupes,['SECTION pb-groupe bloquant','SECTION pb-groupe corriger','DETAILS pb-groupe information'],V+'les trois niveaux, dans l’ordre');
    assert.ok(pb.commande&&pb.handling&&pb.sansVol,V+'un avis de chaque niveau : '+JSON.stringify(pb));
    assert.ok(pb.compte===pb.problemes&&pb.infos>=1&&pb.repliees,V+'le compteur ne compte pas les informations, repliées : '+JSON.stringify(pb));
    assert.match(pb.total,/^\d+ bloquants? · \d+ à corriger$/,V+pb.total);
    assert.ok(await aLEcran('#problemes .pb-tete')&&await aLEcran('#problemes .pb-groupe.bloquant h3'),V+'le panneau est à l’écran');
    await capturer('problemes');
    assert.deepEqual(errors,[],V+'aucune erreur de page');
   }finally{if(x&&x.effacer)x.effacer();await ctx.close();}
  }
  assert.equal(faites.length,24);
  console.log('captures-evolution-19-browser : ok — '+faites.length+' captures (la page des vols ; une fiche de plonge par vol et au débit ; les temps par vol ; le panneau des problèmes), en clair et en sombre, à 1 366 × 768 et 1 920 × 1 080, dans '+dossier);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

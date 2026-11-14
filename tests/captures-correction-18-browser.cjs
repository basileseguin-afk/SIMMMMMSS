/* Correction 18 (c) — les captures de contrôle de la correction 18, sur des
 * données fictives, en thème clair et sombre, à 1 366 × 768 et 1 920 × 1 080 :
 *   — la Synthèse (l'unité et les vols fictifs sans retard de
 *     tests/plan-rejoue-fictif.cjs) : « rien ne coince » ; un goulot dû à une
 *     mise à disposition fermée (le magasin ouvre plus tard : le montage
 *     l'attend, ses commandes partent en retard) ; le tableau « Les services »
 *     avec ses deux nouvelles colonnes, « Personnes sans travail » et
 *     « Attente d'un arrivage » ;
 *   — le planning des équipes (l'unité fictive de 15 services et 50 équipes,
 *     tests/unite-15-services.cjs) : replié, toute l'unité sur un écran ; un
 *     service déplié ; en plein écran.
 * Chaque capture est vérifiée (sa taille, ce qu'elle doit montrer, la page qui
 * tient sur la largeur) et gardée hors du dépôt : dans $ORY_CAPTURES s'il est
 * donné, sinon dans un dossier temporaire, dit à la fin. Chaque étape attend
 * son effet, pas un délai. Aucune donnée de l'unité : tout est fictif. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const U=require('./unite-15-services.cjs');
const {siteSansPlan}=require('./plan-fictif.cjs');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const dossier=process.env.ORY_CAPTURES?path.resolve(process.env.ORY_CAPTURES):fs.mkdtempSync(path.join(os.tmpdir(),'ory-captures-18-'));
fs.mkdirSync(dossier,{recursive:true});
/** La largeur et la hauteur d'un PNG, lues dans son en-tête (IHDR). */
const taillePng=f=>{const b=fs.readFileSync(f);assert.equal(b.toString('latin1',1,4),'PNG',f);return [b.readUInt32BE(16),b.readUInt32BE(20)];};
/** Le magasin fictif ouvre plus tard : l'équipe qui l'attend commence en retard d'autant. */
const OUVERTURE={de:'05:00',a:'23:00'};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const site=siteSansPlan(),faites=[];
 try{
  for(const theme of ['clair','sombre'])for(const [largeur,hauteur] of [[1366,768],[1920,1080]]){
   const V=theme+', '+largeur+' × '+hauteur+' : ';
   const ctx=await browser.newContext({viewport:{width:largeur,height:hauteur},colorScheme:theme==='sombre'?'dark':'light',reducedMotion:'reduce'});
   const page=await ctx.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   const effacer=[];
   /** Le thème de l'application (une préférence d'affichage), posé après chaque chargement ; le fond de la page le confirme. */
   const poserTheme=async()=>{
     await page.evaluate(t=>{if(t==='sombre')document.documentElement.dataset.theme='sombre';else delete document.documentElement.dataset.theme;},theme);
     const fond=await page.evaluate(()=>{const m=getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g).slice(0,3).map(Number);return m[0]+m[1]+m[2];});
     assert.ok(theme==='sombre'?fond<240:fond>600,V+'le fond de la page est '+(theme==='sombre'?'sombre':'clair')+' : '+fond);
   };
   const capturer=async nom=>{
     // Les avis passagers ne masquent rien : fermés avant la capture, et on attend qu'ils soient partis.
     await page.evaluate(()=>document.querySelectorAll('.notif .notif-fermer').forEach(b=>b.click()));
     await page.waitForFunction(()=>!document.querySelector('.notifs .notif'));
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0,V+nom+' : la page tient sur la largeur');
     const f=path.join(dossier,'18-'+theme+'-'+largeur+'-'+nom+'.png');await page.screenshot({path:f});
     assert.deepEqual(taillePng(f),[largeur,hauteur],V+nom+' : la taille de la capture');
     assert.ok(fs.statSync(f).size>20000,V+nom+' : une capture qui montre quelque chose');faites.push(f);};
   const reponses=()=>page.evaluate(()=>{const r=Sim.reponses();return {goulot:r.coince.goulot&&{nom:r.coince.goulot.nom,cause:r.coince.goulot.cause},exceptions:r.exceptions.length};});
   const carte=()=>page.locator('#bilan-journee .sy-carte[aria-label="Où ça coince"]').innerText();
   try{
    /* ---- la Synthèse : l'unité fictive, des vols sans retard ---------------------------------- */
    effacer.push((await F.charger(page,nav,site.url('index.html'),{sauvegarde:F.sauvegardeFictive(),csv:F.volsSansRetardCsv(),pageId:'j-chiffres'})).effacer);
    await page.waitForSelector('#bilan-journee .sy-table tbody tr');
    await poserTheme();

    // 1. « Rien ne coince » : ni dépassement d'un quart d'heure, ni retard. La plonge laisse des vols à laver le lendemain,
    //    que l'équipe du matin lave pendant sa présence : un reste normal, qui ne fait pas coincer (correction 19 b ; avec
    //    l'évolution 18, elle en coinçait, et la capture se faisait sans elle).
    await page.waitForFunction(()=>{const x=Sim.reponses();return !!x&&x.coince.goulots.length===0&&/Rien ne coince/.test(document.getElementById('bilan-journee').innerText);});
    let r=await reponses();
    assert.deepEqual([r.goulot,r.exceptions],[null,0],V+'la journée fictive sans retard');
    assert.match(await carte(),/Rien ne coince\./,V+'la carte le dit');
    assert.match(await page.locator('#bilan-journee').innerText(),/Rien ne coince ; rien ne part en retard\./,V+'la phrase de tête aussi');
    await capturer('synthese-rien-ne-coince');

    // 2. Un goulot dû à une mise à disposition fermée : le magasin ouvre à 05:00, le montage l'attend.
    await page.evaluate(o=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id==='mag').ouverture=o;},''),OUVERTURE);
    await page.waitForFunction(()=>{const g=Sim.reponses().coince.goulot;return !!g&&g.cause.code==='ouverture';});
    await page.waitForFunction(()=>/attend l’ouverture de/.test(document.querySelector('#bilan-journee .sy-carte[aria-label="Où ça coince"]').innerText));
    r=await reponses();
    assert.equal(r.goulot.cause.code,'ouverture',V+JSON.stringify(r));
    assert.ok(r.exceptions>0,V+'des commandes partent en retard');
    const dit=await carte();
    assert.ok(dit.includes(r.goulot.nom),V+'le goulot nommé : '+dit);
    assert.match(dit,/Cause : attend l’ouverture de .+, à 05:00\./,V+'sa cause nomme la mise à disposition et son heure : '+dit);
    await capturer('synthese-goulot-ouverture');

    // 3. Le tableau « Les services » : ses deux nouvelles colonnes, à l'écran.
    await page.locator('#bilan-journee .sy-table').evaluate(t=>t.scrollIntoView({block:'start'}));
    const colonnes=await page.evaluate(()=>{const t=document.querySelector('#bilan-journee .sy-table'),th=[...t.querySelectorAll('thead th')];
      const vu=e=>{const b=e.getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight&&b.left>=0&&b.right<=innerWidth;};
      const col=n=>th.find(x=>x.textContent.trim()===n);
      return {tetes:th.map(x=>x.textContent.trim()),sans:!!col('Personnes sans travail')&&vu(col('Personnes sans travail')),arrivage:!!col('Attente d’un arrivage')&&vu(col('Attente d’un arrivage')),
        attend:[...t.querySelectorAll('.sy-attend')].filter(vu).map(x=>x.innerText),arrivages:[...t.querySelectorAll('.sy-arrivage:not(.sy-vide)')].filter(vu).map(x=>x.innerText.replace(/\s+/g,' ')),
        occupation:(document.querySelector('#bilan-journee .sy-explique-occ')||{}).innerText||''};});
    assert.ok(colonnes.tetes.includes('Personnes sans travail')&&colonnes.tetes.includes('Attente d’un arrivage')&&!colonnes.tetes.includes('File la plus longue'),V+'les colonnes : '+colonnes.tetes);
    assert.ok(colonnes.sans&&colonnes.arrivage,V+'les deux nouvelles colonnes sont à l’écran');
    assert.ok(colonnes.attend.some(x=>/attend l’ouverture de .+, à 05:00/.test(x)),V+'une ligne nomme la mise à disposition attendue : '+colonnes.attend);
    assert.ok(colonnes.arrivages.length>=3&&colonnes.arrivages.every(x=>/^\d+ arrivages?/.test(x)),V+'les arrivages du jour : '+colonnes.arrivages);
    assert.match(colonnes.occupation,/^Occupation : la part du temps de présence couverte par le travail du barème\./,V+'la ligne qui explique l’occupation');
    await capturer('synthese-colonnes');

    /* ---- le planning des équipes : l'unité fictive de 15 services ------------------------------ */
    effacer.push((await U.charger(page,nav,site.url('index.html'),{pageId:'at-planning'})).effacer);
    await page.waitForSelector('#at-planning .pg-cadre .pg-groupe');
    await poserTheme();
    const planning=()=>page.evaluate(()=>{const box=document.getElementById('at-planning'),c=box.querySelector('.pg-cadre'),rc=c.getBoundingClientRect(),b=box.getBoundingClientRect();
      const g=[...c.querySelectorAll('.pg-groupe')].map(x=>{const t=x.querySelector('.pg-groupe-tete').getBoundingClientRect();return {service:x.dataset.service,replie:x.classList.contains('replie'),sansLot:x.classList.contains('pg-sans-lot'),
        vu:t.top>=rc.top-1&&t.bottom<=rc.bottom+1&&t.bottom<=innerHeight,lignes:[...x.querySelectorAll('.pg-ligne')].filter(l=>l.getClientRects().length).length};});
      return {groupes:g,part:rc.height/innerHeight,plein:box.classList.contains('pg-plein'),couvre:b.left<=0&&b.top<=0&&b.right>=innerWidth&&b.bottom>=innerHeight,defile:c.scrollHeight-c.clientHeight};});
    /** Le dessin du planning est posé : le même deux images de suite. */
    const pose=()=>page.waitForFunction(()=>{const c=document.querySelector('#at-planning .pg-cadre');if(!c||!c.querySelector('.pg-groupe'))return false;
      const cle=c.clientHeight+'|'+c.clientWidth+'|'+c.scrollWidth+'|'+c.querySelectorAll('.pg-lignes:not([hidden])').length+'|'+document.getElementById('at-planning').className;
      const stable=window.__pgCle===cle;window.__pgCle=cle;return stable;},null,{polling:100});
    await pose();

    // 4. Replié : toute l'unité sur un écran.
    let p=await planning();
    assert.equal(p.groupes.filter(x=>!x.sansLot).length,15,V+'15 lignes de service');
    assert.ok(p.groupes.every(x=>x.replie&&x.vu),V+'toutes repliées, toutes à l’écran : '+JSON.stringify(p.groupes.filter(x=>!x.vu)));
    assert.ok(p.part>=0.6&&p.defile===0,V+'le planning fait '+Math.round(p.part*100)+' % de la hauteur, sans défilement');
    await capturer('planning-replie');

    // 5. Un service déplié : ses équipes.
    await page.locator('#at-planning .pg-groupe[data-service="prepa"] .pg-replier').click();
    await page.waitForFunction(()=>!document.querySelector('#at-planning .pg-groupe[data-service="prepa"]').classList.contains('replie'));await pose();
    p=await planning();
    const montage=p.groupes.find(x=>x.service==='prepa');
    assert.ok(!montage.replie&&montage.lignes>=2,V+'le montage déplié : '+JSON.stringify(montage));
    assert.equal(await page.locator('#at-planning .pg-groupe[data-service="prepa"] .pg-avant').count()>=1,true,V+'la bande hachurée avant le premier lot');
    await capturer('planning-service-deplie');

    // 6. En plein écran : le menu et l'en-tête recouverts ; Échap en sort.
    await page.locator('#at-planning [data-pg-plein]').click();
    await page.waitForFunction(()=>document.getElementById('at-planning').classList.contains('pg-plein'));await pose();
    p=await planning();
    assert.ok(p.plein&&p.couvre&&p.part>=0.85,V+'le plein écran : '+JSON.stringify({plein:p.plein,couvre:p.couvre,part:p.part}));
    await capturer('planning-plein-ecran');
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.getElementById('at-planning').classList.contains('pg-plein'));

    assert.deepEqual(errors,[],V+errors.join(' | '));
   }finally{for(const f of effacer)f();await ctx.close();}
  }
  assert.equal(faites.length,24,'six captures par thème et par taille');
  console.log('captures-correction-18-browser : ok — '+faites.length+' captures (Synthèse : rien ne coince, un goulot dû à une mise à disposition fermée, les deux nouvelles colonnes ; planning : replié, un service déplié, plein écran ; 1 366 × 768 et 1 920 × 1 080, clair et sombre) dans '+dossier);
 }catch(e){console.error(e);process.exitCode=1;}finally{site.effacer();await browser.close();}
})();

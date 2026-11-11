/* Évolution 14 (e) — les captures de contrôle du plan rejoué et du planning des
 * équipes, sur l'unité et les vols fictifs (tests/plan-rejoue-fictif.cjs), en
 * thème clair et sombre, à 1 280 et 1 920 px de large :
 *   — le plan rejoué : à l'ouverture (le plan entier, au pic de travail), au pic
 *     sur le service le plus chargé (« Cadrer »), puis en lecture (les points
 *     de « Ce qui circule », les camions du handling) ;
 *   — le planning des équipes : ses trois zooms.
 * Chaque capture est vérifiée (sa taille, ce qu'elle doit montrer) et gardée
 * hors du dépôt : dans $ORY_CAPTURES s'il est donné, sinon dans un dossier
 * temporaire, dit à la fin. Aucune donnée de l'unité : tout est fictif. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {siteSansPlan}=require('./plan-fictif.cjs');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const sauvegarde=F.sauvegardeFictive(),CSV=F.volsCsv(),pic=F.heureDuPicAttendue(sauvegarde,CSV);
const dossier=process.env.ORY_CAPTURES?path.resolve(process.env.ORY_CAPTURES):fs.mkdtempSync(path.join(os.tmpdir(),'ory-captures-'));
fs.mkdirSync(dossier,{recursive:true});
/** La largeur et la hauteur d'un PNG, lues dans son en-tête (IHDR). */
const taillePng=f=>{const b=fs.readFileSync(f);assert.equal(b.toString('latin1',1,4),'PNG',f);return [b.readUInt32BE(16),b.readUInt32BE(20)];};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const site=siteSansPlan(),faites=[];
 try{
  for(const theme of ['clair','sombre'])for(const [largeur,hauteur] of [[1280,800],[1920,1080]]){
   const V=theme+', '+largeur+' px : ';
   const ctx=await browser.newContext({viewport:{width:largeur,height:hauteur},colorScheme:theme==='sombre'?'dark':'light',reducedMotion:'no-preference'});
   const page=await ctx.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   const attendre=(ms=250)=>page.waitForTimeout(ms);
   const ch=await F.charger(page,nav,site.url('index.html'),{sauvegarde,csv:CSV});
   const capturer=async nom=>{const f=path.join(dossier,'14-'+theme+'-'+largeur+'-'+nom+'.png');await page.screenshot({path:f});
     assert.deepEqual(taillePng(f),[largeur,hauteur],V+nom+' : la taille de la capture');
     assert.ok(fs.statSync(f).size>20000,V+nom+' : une capture qui montre quelque chose');faites.push(f);};
   try{
    await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);await attendre();
    const fond=await page.evaluate(()=>getComputedStyle(document.getElementById('plan')).backgroundColor);
    assert.equal(fond,theme==='sombre'?'rgb(17, 20, 24)':'rgb(255, 255, 255)',V+'le thème');

    // Le plan rejoué : à l'ouverture.
    assert.equal(await page.evaluate(()=>Sim.vue.t),pic.t,V+'l’ouverture, au pic');
    assert.ok(await page.locator('#plan .zone.s-travail').count()>0,V+'des services au travail');
    assert.ok(await page.locator('#plan-circule .pc-trait').count()>0,V+'ce qui circule');
    await capturer('plan-1-ouverture');
    // Au pic, sur le service où le plus de personnes sont au travail.
    const plusCharge=await page.evaluate(()=>[...document.querySelectorAll('#plan .zone[data-au-travail]')].sort((a,b)=>b.dataset.auTravail-a.dataset.auTravail)[0].dataset.id);
    await page.locator('#zone-picker').selectOption(plusCharge);await page.locator('#zoom-fit').click();await attendre(400);
    assert.match(await page.locator(`#plan .zone[data-id="${plusCharge}"] .zone-charge`).getAttribute('aria-label'),/^\d+ au travail \/ \d+ présents?$/,V+'au centre, au travail / présents');
    await capturer('plan-2-pic');
    // En lecture : quand les camions du handling partent ; les points avancent.
    await page.locator('#zoom-reset').click();await page.locator('#zone-picker').selectOption('');await attendre();
    await page.evaluate(()=>{Sim.vue.allerA(552);Sim.vue.vitesse=4;Sim.vue.lancer();});await attendre(700);
    const lecture=await page.evaluate(()=>({points:document.querySelectorAll('#plan-circule .pc-point').length,camions:document.querySelectorAll('#plan-vehicules .pv-vehicule').length}));
    await capturer('plan-3-lecture');
    await page.evaluate(()=>{Sim.vue.pause();Sim.vue.vitesse=30;});
    assert.ok(lecture.points>0&&lecture.camions>0,V+'en lecture, des points et des camions : '+JSON.stringify(lecture));

    // Le planning des équipes : ses trois zooms.
    await nav.aller(page,'at-planning');await attendre(400);
    for(const zoom of ['chaine','jour','six']){
     await page.locator(`[data-pg-zoom="${zoom}"]`).click();await attendre(300);
     await page.locator('#at-planning .pg-cadre').evaluate(c=>c.scrollIntoView({block:'end'}));await attendre(200);
     assert.equal(await page.locator(`[data-pg-zoom="${zoom}"]`).getAttribute('aria-pressed'),'true');
     assert.ok(await page.locator('#at-planning .pg-lot').count()>20,V+zoom+' : les barres');
     await capturer('planning-'+zoom);
    }
    assert.deepEqual(errors,[],V+errors.join(' | '));
   }finally{ch.effacer();await ctx.close();}
  }
  assert.equal(faites.length,24);
  console.log('captures-browser : ok — '+faites.length+' captures de contrôle dans '+dossier);
 }catch(e){console.error(e);process.exitCode=1;}finally{site.effacer();await browser.close();}
})();

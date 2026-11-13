/* Évolution 17 (d) — les captures de contrôle, sur des données fictives
 * (tests/calage-17-fictif.cjs), en thème clair et sombre, à 1 366 × 768 et
 * 1 920 × 1 080 :
 *   — le rapport du calage, une ligne en « puissance » dépliée : sa formule
 *     en clair, son statut, son nuage de points (la courbe retenue, celle de
 *     « × a », les jours laissés de côté marqués) ;
 *   — le rapport du calage, une ligne « en sur-effectif » dépliée : l'effectif
 *     mis, la borne de son besoin ;
 *   — la Synthèse d'une journée avec la politique gardée : la phrase de tête
 *     et le bloc « Politique d'effectif » (le statut, le besoin « au plus »).
 * Chaque capture est vérifiée (sa taille, ce qu'elle doit montrer, la page qui
 * tient sur la largeur) et gardée hors du dépôt : dans $ORY_CAPTURES s'il est
 * donné, sinon dans un dossier temporaire, dit à la fin. Chaque étape attend
 * son effet, pas un délai. Aucune donnée de l'unité : tout est fictif. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const F=require('./calage-17-fictif.cjs');
const {siteSansPlan}=require('./plan-fictif.cjs');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const dossier=process.env.ORY_CAPTURES?path.resolve(process.env.ORY_CAPTURES):fs.mkdtempSync(path.join(os.tmpdir(),'ory-captures-17-'));
fs.mkdirSync(dossier,{recursive:true});
/** La largeur et la hauteur d'un PNG, lues dans son en-tête (IHDR). */
const taillePng=f=>{const b=fs.readFileSync(f);assert.equal(b.toString('latin1',1,4),'PNG',f);return [b.readUInt32BE(16),b.readUInt32BE(20)];};
const B='#pv-reel';

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const site=siteSansPlan(),faites=[],fichiers=fs.mkdtempSync(path.join(os.tmpdir(),'ory-captures-17-fichiers-'));
 try{
  for(const theme of ['clair','sombre'])for(const [largeur,hauteur] of [[1366,768],[1920,1080]]){
   const V=theme+', '+largeur+' × '+hauteur+' : ';
   const ctx=await browser.newContext({viewport:{width:largeur,height:hauteur},colorScheme:theme==='sombre'?'dark':'light',reducedMotion:'reduce'});
   const page=await ctx.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
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
     const f=path.join(dossier,'17-'+theme+'-'+largeur+'-'+nom+'.png');await page.screenshot({path:f});
     assert.deepEqual(taillePng(f),[largeur,hauteur],V+nom+' : la taille de la capture');
     assert.ok(fs.statSync(f).size>20000,V+nom+' : une capture qui montre quelque chose');faites.push(f);};
   /** Une ligne du rapport, dépliée seule et amenée en haut de l'écran ; rend ce qui s'en voit. */
   const montrer=async nom=>{
     await page.evaluate(([sel,n])=>{
       for(const d of document.querySelectorAll(sel+' [data-cal-rapport] details'))d.open=d.closest('[data-cal-rapport]').dataset.calRapport===n;
       document.querySelector(sel+' [data-cal-rapport="'+n+'"]').scrollIntoView({block:'start'});
     },[B,nom]);
     await page.waitForFunction(([sel,n])=>{const r=document.querySelector(sel+' [data-cal-rapport="'+n+'"]').getBoundingClientRect();return r.top>=0&&r.top<innerHeight/2;},[B,nom]);
     return page.evaluate(([sel,n])=>{
       const li=document.querySelector(sel+' [data-cal-rapport="'+n+'"]'),visible=x=>{if(!x)return false;const r=x.getBoundingClientRect();return r.width>0&&r.top>=0&&r.bottom<=innerHeight;};
       return {formule:li.querySelector('summary [data-cal-formule]').textContent,statut:(li.querySelector('summary [data-cal-statut]')||{}).textContent||null,
         nuage:visible(li.querySelector('.pcn-svg')),points:li.querySelectorAll('circle.pcn-point').length,cote:li.querySelectorAll('circle.pcn-cote').length,
         courbes:li.querySelectorAll('path.pcn-retenue, path.pcn-xa').length,borne:(li.querySelector('[data-cal-borne]')||{}).textContent||null,raison:visible(li.querySelector('[data-cal-statut-raison]'))};
     },[B,nom]);
   };
   try{
    /* ---- le rapport du calage : l'unité fictive, sa période, son réel fabriqué -------------------- */
    await F.charger(page,nav,site.url('index.html'),fichiers);
    await poserTheme();
    await page.locator(`${B} [data-cal=caler]`).click();
    await page.waitForSelector(`${B} [data-cal-rapport="Cuisine"] [data-cal-formule]`);
    // Une forme en puissance : la formule en clair, « à la limite », le nuage, ses deux courbes, les jours laissés de côté marqués.
    const cuisine=await montrer('Cuisine');
    assert.match(cuisine.formule,/^heures réelles ≈ 4,\d+ × \(travail au barème\) puissance 0,4$/,V+cuisine.formule);
    assert.equal(cuisine.statut,'à la limite : besoin',V+'le statut de la cuisine');
    assert.ok(cuisine.nuage&&cuisine.points>=60&&cuisine.cote>=14&&cuisine.courbes===2&&cuisine.raison,V+JSON.stringify(cuisine));
    await capturer('calage-puissance');
    // Une ligne en sur-effectif : l'effectif mis, et la borne de son besoin.
    const plonge=await montrer('Plonge');
    assert.match(plonge.formule,/^heures réelles ≈ 6(,\d+)?, quel que soit le travail au barème$/,V+plonge.formule);
    assert.equal(plonge.statut,'en sur-effectif : effectif mis',V+'le statut de la plonge');
    assert.match(plonge.borne,/^besoin au plus [\d,]+ × le travail au barème du jour, sans dépasser le prévu/,V+plonge.borne);
    assert.ok(plonge.nuage&&plonge.raison,V+JSON.stringify(plonge));
    await capturer('calage-sur-effectif');

    /* ---- la Synthèse d'une journée, la politique gardée ------------------------------------------- */
    await page.locator(`${B} [data-cal=garder]`).click();
    await page.waitForSelector(`${B} tr[data-cal-prevu]`);
    await nav.aller(page,'j-chiffres');
    await page.waitForSelector('#bilan-cale tr[data-cal-jour-ligne="Plonge"]');
    await poserTheme();
    const tete=await page.locator('#bilan-journee .sy-tete p').allTextContents();
    assert.match(tete[2],/^D’après les heures réelles, l’unité mettrait \d+ personnes \(de \d+ à \d+\)\.$/,V+tete[2]);
    await page.evaluate(()=>scrollTo(0,0));
    await capturer('synthese-tete');
    // Le bloc « Politique d'effectif » : par ligne, les ETP au barème, le prévu et sa bande, le statut, le besoin.
    await page.locator('#bilan-cale').scrollIntoViewIfNeeded();
    await page.evaluate(()=>document.getElementById('bilan-cale').scrollIntoView({block:'center'}));
    const bloc=await page.evaluate(()=>{const r=document.querySelector('#bilan-cale table').getBoundingClientRect();
      return {visible:r.top>=0&&r.bottom<=innerHeight&&r.right<=innerWidth,besoin:document.querySelector('#bilan-cale tr[data-cal-jour-ligne="Plonge"] [data-cal-jour-besoin]').textContent,
        statut:document.querySelector('#bilan-cale tr[data-cal-jour-ligne="Plonge"] [data-cal-jour-statut]').textContent.trim()};});
    assert.ok(bloc.visible,V+'le bloc « Politique d’effectif » tient à l’écran');
    assert.match(bloc.besoin,/^au plus [\d,]+$/,V+bloc.besoin);
    assert.equal(bloc.statut,'en sur-effectif effectif mis',V+'le statut de la plonge dans la Synthèse');
    await capturer('synthese-politique');
    assert.deepEqual(errors,[],V+'aucune erreur de page');
   }finally{await ctx.close();}
  }
  assert.equal(faites.length,16);
  console.log('captures-evolution-17-browser : ok — '+faites.length+' captures (le rapport du calage, une forme en puissance et son nuage de points, une ligne en sur-effectif et sa borne ; la Synthèse, sa phrase de tête et le bloc « Politique d’effectif »), en clair et en sombre, à 1 366 × 768 et 1 920 × 1 080, dans '+dossier);
 }finally{await browser.close();site.effacer();fs.rmSync(fichiers,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});

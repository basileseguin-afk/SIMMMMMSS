/* Évolution 15 (e) — les captures de contrôle des résultats, sur l'unité et les
 * vols fictifs (tests/plan-rejoue-fictif.cjs), en thème clair et sombre, à
 * 1 280 et 1 920 px de large :
 *   — la Synthèse, dans ses quatre cas : avec un goulot et des retards, des
 *     retards sans goulot, ni l'un ni l'autre, un goulot sans retard (un goulot,
 *     correction 17 c : un service qui attend plus que le seuil ET qui finit
 *     après son horaire ou fait partir une commande ou un vol en retard) ;
 *   — « Détails » : Commandes (les exceptions d'abord) et Vols ;
 *   — la Période : la colonne « Unité » et la courbe de l'unité.
 * Chaque capture est vérifiée (sa taille, ce qu'elle doit montrer, la page qui
 * tient sur la largeur) et gardée hors du dépôt : dans $ORY_CAPTURES s'il est
 * donné, sinon dans un dossier temporaire, dit à la fin. Aucune donnée de
 * l'unité : tout est fictif. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const PE=require('../moteur/periode.js');
const {siteSansPlan}=require('./plan-fictif.cjs');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const sauvegarde=F.sauvegardeFictive();
const dossier=process.env.ORY_CAPTURES?path.resolve(process.env.ORY_CAPTURES):fs.mkdtempSync(path.join(os.tmpdir(),'ory-captures-15-'));
fs.mkdirSync(dossier,{recursive:true});
/** Une semaine datée fictive : les vols fictifs chaque jour, du 2 au 8 novembre 2026. */
const semaine=()=>{const [tete,...l]=F.volsCsv().trim().split('\n');return 'date,'+tete+'\n'+PE.joursEntre('2026-11-02','2026-11-08').flatMap(d=>l.map(x=>d+','+x)).join('\n')+'\n';};
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
   const ch=await F.charger(page,nav,site.url('index.html'),{sauvegarde,csv:F.volsCsv(),pageId:'j-chiffres'});
   const capturer=async nom=>{
     // Les avis passagers (« Période simulée… ») ne masquent rien : fermés avant la capture.
     await page.evaluate(()=>document.querySelectorAll('.notif .notif-fermer').forEach(b=>b.click()));await attendre(300);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0,V+nom+' : la page tient sur la largeur');
     const f=path.join(dossier,'15-'+theme+'-'+largeur+'-'+nom+'.png');await page.screenshot({path:f});
     assert.deepEqual(taillePng(f),[largeur,hauteur],V+nom+' : la taille de la capture');
     assert.ok(fs.statSync(f).size>20000,V+nom+' : une capture qui montre quelque chose');faites.push(f);};
   const seuils=async s=>{await page.evaluate(s=>{if(s)Sim.seuils.enregistrer(s);else localStorage.removeItem('ory-seuils-v1');Sim.ateliers.changer(()=>{},'');},s);await attendre(400);};
   const reponses=()=>page.evaluate(()=>{const r=Sim.reponses();return {goulot:r.coince.goulot&&r.coince.goulot.nom,exceptions:r.exceptions.length};});
   const synthese=async(nom,goulot,retard)=>{
     await nav.aller(page,'j-chiffres');await attendre(300);
     const r=await reponses();
     assert.equal(!!r.goulot,goulot,V+nom+' : '+JSON.stringify(r));assert.equal(r.exceptions>0,retard,V+nom+' : '+JSON.stringify(r));
     const coince=await page.locator('#bilan-journee .sy-carte[aria-label="Où ça coince"]').innerText();
     if(goulot)assert.ok(coince.includes(r.goulot),V+nom+' : le goulot nommé');else assert.match(coince,/Rien ne coince/,V+nom);
     const part=page.locator('#bilan-journee .sy-carte[aria-label="Ce qui part en retard"]');
     assert.equal(await part.getAttribute('data-ton'),retard?'retard':'ok',V+nom+' : la couleur dit l’état');
     await capturer('synthese-'+nom);
   };
   try{
    await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);await attendre();
    const fond=await page.evaluate(()=>getComputedStyle(document.body).backgroundColor);
    assert.notEqual(fond,'rgba(0, 0, 0, 0)',V+'un fond');

    // La Synthèse : un goulot et des retards — au seuil d'une heure, un service attend plus que le seuil et fait partir des commandes en retard.
    await seuils({attenteLot:60});
    await synthese('goulot-retards',true,true);
    // « Détails » : Commandes, les exceptions d'abord ; Vols.
    await nav.aller(page,'at-repas');await attendre(300);
    assert.equal(await page.locator('#onglets-internes [aria-selected=true]').textContent(),'Commandes',V+'Détails › Commandes');
    assert.ok(await page.locator('#at-classes tbody:first-of-type tr .at-etat').count()>0,V+'des exceptions d’abord');
    await capturer('details-commandes');
    await nav.aller(page,'v-departs');await attendre(300);
    assert.ok(await page.locator('#vols-comptes .sy-comptes').count()===1,V+'les comptes des vols');
    await capturer('details-vols');
    // Des retards, sans goulot : les seuils par défaut (aucun lot n'attend plus de 6 h).
    await seuils(null);
    await synthese('retards',false,true);
    // Ni retard ni goulot : les vols fictifs partis plus tard.
    await F.importerVols(page,nav,ch.fichier,'vols-sans-retard.csv',F.volsSansRetardCsv());
    await synthese('calme',false,false);
    // Un goulot, sans retard : les heures sup permises, la plonge finit après son horaire ; au seuil de 5 min, elle attend plus que le seuil.
    const hs=await page.evaluate(()=>{const avant=Sim.reglages.etat.heuresSup;Sim.reglages.changer(()=>{Sim.reglages.etat.heuresSup={actif:true,plafond:120};},'');return avant||null;});
    await seuils({attenteLot:5});
    await synthese('goulot',true,false);
    assert.match(await page.locator('#bilan-journee .sy-carte[aria-label="Où ça coince"]').innerText(),/après son horaire/,V+'le goulot dit pourquoi');
    await page.evaluate(h=>Sim.reglages.changer(()=>{if(h)Sim.reglages.etat.heuresSup=h;else delete Sim.reglages.etat.heuresSup;},''),hs);
    await seuils(null);

    // La Période : une semaine datée fictive, simulée ; la colonne Unité et la courbe.
    await F.importerVols(page,nav,ch.fichier,'semaine.csv',semaine());
    await nav.aller(page,'j-periode');await page.locator('#journee-periode [data-pv=lancer]').click();
    await page.waitForFunction(()=>Sim.periode.etat()==='a-jour',null,{timeout:120000});await attendre(400);
    assert.equal(await page.locator('#journee-periode .pv-table thead th').last().textContent(),'Unité',V+'la colonne Unité');
    assert.ok(await page.locator('#journee-periode .pvc-point').count()>=7,V+'la courbe');
    await capturer('periode');
    assert.deepEqual(errors,[],V+errors.join(' | '));
   }finally{ch.effacer();await ctx.close();}
  }
  assert.equal(faites.length,28);
  console.log('captures-resultats-browser : ok — '+faites.length+' captures de contrôle dans '+dossier);
 }catch(e){console.error(e);process.exitCode=1;}finally{site.effacer();await browser.close();}
})();

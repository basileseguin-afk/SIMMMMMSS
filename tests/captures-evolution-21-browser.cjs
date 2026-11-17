/* Évolution 21 (d) — les captures de contrôle du relais sur la ligne du robot,
 * sur une unité fictive (tests/robot-relais-fictif.cjs : rien d'une vraie
 * unité), en thème clair et sombre, à 1 366 × 768 et 1 920 × 1 080 :
 *   — le planning des équipes avec un relais de robot : la commande sur les
 *     deux lignes du robot, chacune pour sa part, le repère à la jointure, la
 *     légende ; puis la même vue avec l'infobulle de la part reprise (« Avancé
 *     par … : n vols, de hh:mm à hh:mm ») ;
 *   — la Synthèse d'une journée où le relais ne suffit pas : la ligne du
 *     service du robot (qui avance, combien de vols ; l'équipe qui dépasse
 *     encore), puis la carte « Où ça coince », qui cite toujours le robot.
 * Chaque capture est vérifiée (sa taille, ce qu'elle doit montrer, la page qui
 * tient sur la largeur) et gardée hors du dépôt : dans $ORY_CAPTURES s'il est
 * donné, sinon dans un dossier temporaire, dit à la fin. Chaque étape attend
 * son effet, pas un délai. Aucune donnée de l'unité : tout est fictif. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const X=require('./robot-relais-fictif.cjs');
const {siteSansPlan}=require('./plan-fictif.cjs');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const dossier=process.env.ORY_CAPTURES?path.resolve(process.env.ORY_CAPTURES):fs.mkdtempSync(path.join(os.tmpdir(),'ory-captures-e21-'));
fs.mkdirSync(dossier,{recursive:true});
/** La largeur et la hauteur d'un PNG, lues dans son en-tête (IHDR). */
const taillePng=f=>{const b=fs.readFileSync(f);assert.equal(b.toString('latin1',1,4),'PNG',f);return [b.readUInt32BE(16),b.readUInt32BE(20)];};
const SERVICE='prepa';   // le service du robot, dans l'unité fictive

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const site=siteSansPlan(),faites=[];
 try{
  for(const theme of ['clair','sombre'])for(const [largeur,hauteur] of [[1366,768],[1920,1080]]){
   const V=theme+', '+largeur+' × '+hauteur+' : ';
   const ctx=await browser.newContext({viewport:{width:largeur,height:hauteur},deviceScaleFactor:1,colorScheme:theme==='sombre'?'dark':'light',reducedMotion:'reduce'});
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
     const f=path.join(dossier,'e21-'+theme+'-'+largeur+'-'+nom+'.png');await page.screenshot({path:f});
     assert.deepEqual(taillePng(f),[largeur,hauteur],V+nom+' : la taille de la capture');
     assert.ok(fs.statSync(f).size>20000,V+nom+' : une capture qui montre quelque chose');faites.push(f);};
   /** La journée jouée par la page porte le relais attendu : `n` vols avancés par le matin. */
   const relais=n=>page.waitForFunction(n=>!!(window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.ateliers.resultat.lots.some(l=>l.nom==='SUD/YC'&&Array.isArray(l.parts)&&l.parts.length===2&&l.parts[0].vols.length===n)),n);
   try{
    /* ---- le planning des équipes, avec un relais de robot ------------------------------------------- */
    const ch=await X.charger(page,nav,site.url('index.html'),{sauvegarde:X.suffit(),csv:X.volsCsv(),pageId:'at-planning'});
    await relais(3);
    await poserTheme();
    const groupe=`#at-planning .pg-groupe[data-service="${SERVICE}"]`;
    await page.waitForSelector('#at-planning .pg-cadre '+groupe.slice('#at-planning '.length));
    if(await page.locator(groupe+' .pg-lignes').evaluate(e=>e.hidden))await page.locator(groupe+' .pg-replier').click();
    await page.waitForSelector(groupe+' .pg-ligne[data-equipe="rb2"] g.pg-lot.en-relais');
    await page.evaluate(g=>document.querySelector(g+' .pg-ligne[data-equipe="rb2"]').scrollIntoView({block:'center'}),groupe);
    // La légende est une bande qui défile : on l'amène sur le signe du relais.
    await page.evaluate(()=>document.querySelector('#at-planning .pg-legende .pg-cle[data-signe="relais"]').scrollIntoView({block:'nearest',inline:'nearest'}));
    const lire=()=>page.evaluate(groupe=>{const vu=e=>{if(!e)return false;const r=e.getBoundingClientRect();return r.width>0&&r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;};
      const g=s=>document.querySelector(groupe+' .pg-ligne[data-equipe="'+s+'"] g.pg-lot.en-relais');
      const cle=document.querySelector('#at-planning .pg-legende .pg-cle[data-signe="relais"]');
      return {matin:vu(g('rb')),soir:vu(g('rb2')),passe:vu(document.querySelector(groupe+' .pg-ligne[data-equipe="rb"] path.pg-relais[data-relais="passe"]')),
        repris:vu(document.querySelector(groupe+' .pg-ligne[data-equipe="rb2"] path.pg-relais[data-relais="repris"]')),
        legende:vu(cle),mot:cle.title,parts:[g('rb').dataset.part,g('rb2').dataset.part],jointure:+g('rb2').dataset.x-+g('rb').dataset.x1,
        noms:['rb','rb2'].map(s=>(document.querySelector(groupe+' .pg-ligne[data-equipe="'+s+'"]').textContent.match(/Robot (matin|soir)/)||[])[0]||null)};},groupe);
    const pl=await lire();
    assert.ok(pl.matin&&pl.soir&&pl.passe&&pl.repris&&pl.legende,V+'la commande en relais, ses deux repères et la légende sont à l’écran : '+JSON.stringify(pl));
    assert.deepEqual(pl.parts,['1/2','2/2'],V+'les deux parts');
    assert.ok(pl.jointure>-0.6&&pl.jointure<0.6,V+'la part du soir commence où celle du matin finit : '+pl.jointure);
    assert.deepEqual(pl.noms,['Robot matin','Robot soir'],V+'les deux équipes de la ligne');
    assert.match(pl.mot,/Sur la ligne d’un robot : une équipe a avancé des vols de la suivante/,V+'la légende dit le relais du robot');
    await capturer('planning-relais-robot');
    // L'infobulle de la part reprise, au focus clavier : qui a avancé, combien de vols, de quand à quand.
    await page.locator(groupe+' .pg-ligne[data-equipe="rb2"] g.pg-lot.en-relais').focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');
    await page.waitForFunction(()=>{const b=document.querySelector('.pg-bulle');return !!b&&!b.hidden&&/Avancé par/.test(b.textContent);});
    const bulle=await page.evaluate(()=>{const b=document.querySelector('.pg-bulle'),r=b.getBoundingClientRect();return {texte:b.textContent,vue:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth};});
    assert.match(bulle.texte,/SUD · Économie\n07:26 → 07:54[\s\S]*\nAvancé par Robot matin : 3 vols, de 05:50 à 07:26$/,V+'l’infobulle de la part reprise : '+bulle.texte);
    assert.ok(bulle.vue,V+'l’infobulle est à l’écran');
    await capturer('planning-relais-robot-infobulle');
    await page.evaluate(()=>document.activeElement&&document.activeElement.blur());
    ch.effacer();

    /* ---- la Synthèse d'une journée où le relais ne suffit pas ---------------------------------------- */
    const ch2=await X.charger(page,nav,site.url('index.html'),{sauvegarde:X.insuffisant(),csv:X.volsCsv(),pageId:'j-chiffres'});
    await relais(2);
    await poserTheme();
    const ligne=`#bilan-journee .sy-table tr[data-service="${SERVICE}"]`;
    await page.waitForSelector(ligne+' td.sy-fin .sy-avance');
    await page.evaluate(l=>document.querySelector(l).scrollIntoView({block:'center'}),ligne);
    const sy=await page.evaluate(l=>{const vu=e=>{if(!e)return false;const r=e.getBoundingClientRect();return r.width>0&&r.top>=0&&r.bottom<=innerHeight&&r.right<=innerWidth;};
      const c=document.querySelector(l+' td.sy-fin'),petit=c.querySelector('.sy-avance'),t=document.querySelector('#bilan-journee .sy-table').getBoundingClientRect();
      // Le mot du relais se lit en entier : sa boîte tient dans la case, la case dans la fenêtre.
      return {avance:petit.textContent,visible:vu(petit)&&vu(c)&&petit.getBoundingClientRect().right<=c.getBoundingClientRect().right+1,fin:c.textContent,tableau:t.right<=innerWidth};},ligne);
    assert.equal(sy.avance,'Robot matin avance 2 vols de Robot soir',V+sy.avance);
    assert.match(sy.fin,/l’équipe Robot soir finit à 10:24 pour 08:30/,V+'le soir dépasse encore : '+sy.fin);
    assert.ok(sy.visible&&sy.tableau,V+'la ligne du service du robot se lit en entier : '+JSON.stringify(sy));
    await capturer('synthese-relais-insuffisant');
    // La carte « Où ça coince » : le relais ne suffit pas, la ligne du robot y est encore.
    const carte=page.locator('#bilan-journee .sy-carte',{hasText:'Où ça coince'}).first();
    await carte.scrollIntoViewIfNeeded();
    assert.match(await carte.textContent(),/Robot soir/,V+'la carte « Où ça coince » cite le robot');
    assert.ok(await carte.evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.left>=0&&r.right<=innerWidth&&r.top<innerHeight;}),V+'la carte est à l’écran');
    await capturer('synthese-coince-robot');
    ch2.effacer();
    assert.deepEqual(errors,[],V+'aucune erreur de page');
   }finally{await ctx.close();}
  }
  assert.equal(faites.length,16);
  console.log('captures-evolution-21-browser : ok — '+faites.length+' captures (le planning des équipes avec un relais de robot, et l’infobulle de la part reprise ; la Synthèse d’une journée où le relais ne suffit pas, sa ligne et sa carte « Où ça coince »), en clair et en sombre, à 1 366 × 768 et 1 920 × 1 080, dans '+dossier);
 }finally{site.effacer();await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

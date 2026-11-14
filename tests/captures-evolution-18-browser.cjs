/* Évolution 18 (c) — les captures de contrôle du relais à la plonge, sur une
 * unité fictive, en thème clair et sombre, à 1 366 × 768 et 1 920 × 1 080 :
 *   — le planning des équipes avec un relais : le lot sur les deux lignes de
 *     la plonge, chacune pour sa part, le repère à la jointure, la légende ;
 *   — la Synthèse avec un reste au lendemain que l'équipe du matin ne peut
 *     pas absorber (correction 19 b : un reste normal ne fait pas coincer) :
 *     la ligne de la plonge (« reste à laver le lendemain : n vols (h de
 *     lavage) »), la carte « Où ça coince ».
 * Chaque capture est vérifiée (sa taille, ce qu'elle doit montrer, la page qui
 * tient sur la largeur) et gardée hors du dépôt : dans $ORY_CAPTURES s'il est
 * donné, sinon dans un dossier temporaire, dit à la fin. Chaque étape attend
 * son effet, pas un délai. Aucune donnée de l'unité : tout est fictif. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const dossier=process.env.ORY_CAPTURES?path.resolve(process.env.ORY_CAPTURES):fs.mkdtempSync(path.join(os.tmpdir(),'ory-captures-18-'));
fs.mkdirSync(dossier,{recursive:true});
/** La largeur et la hauteur d'un PNG, lues dans son en-tête (IHDR). */
const taillePng=f=>{const b=fs.readFileSync(f);assert.equal(b.toString('latin1',1,4),'PNG',f);return [b.readUInt32BE(16),b.readUInt32BE(20)];};
const TETE='vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC\n';
// À la plonge, L1 (LONG, 180 min) arrive à 12:00 et passe en relais à 14:00 ; V2 et V3 suivent.
const RELAIS=TETE+'NO1,NORD,MOYEN,DEP,18:00,,0,0,100\nL1,LONG,MOYEN,RET,,11:30,0,0,100\nV2,NORD,MOYEN,RET,,14:00,0,0,100\nV3,SUD,MOYEN,RET,,16:00,0,0,100\n';
// Le soir, W1 arrive à 20:00 (il s'arrêtera à 21:00, 30 min restent) et W2 à 20:30 (il n'est pas commencé) : 2 vols, 2 h de
// lavage. Le matin est plein (M1 et M2, LONG, de 06:00 à 12:00, puis L1) : lavé d'abord le lendemain, ce reste pousserait 2 h
// de son lavage après sa présence — il ne l'absorbe pas, la plonge coince (correction 19 b).
const RESTE=RELAIS+'M1,LONG,MOYEN,RET,,05:30,0,0,100\nM2,LONG,MOYEN,RET,,08:30,0,0,100\nW1,NORD,MOYEN,RET,,19:30,0,0,100\nW2,SUD,MOYEN,RET,,20:00,0,0,100\n';
/* L'unité fictive : la plonge par vol, seule — le matin (06:00–14:00) et l'après-midi (13:00–21:00), sur le même tunnel. */
const UNITE=()=>{
  Sim.reglages.changer(()=>{const e=Sim.reglages.etat;e.regime={seuils:[],presence:480};e.heuresSup={actif:true,plafond:180};},'');
  Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;st.materiel.actif=false;st.materiel.retours='programme';st.materiel.delaiRetour=30;
    const plonge=(id,nom,debut)=>({id,nom,service:'plonge',type:'lavage',debut,jour:0,personnes:2,pauses:[],lots:[],regime:{actif:true,presence:480},
      plafond:0,parVol:true,durees:{'*':90,LONG:180},tunnels:[{nom:'Tunnel 1',debit:300,personnes:1,actif:true}]});
    st.ateliers=[plonge('matin','Plonge matin','06:00'),plonge('apm','Plonge après-midi','13:00')];},'');
};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const faites=[],fichiers=fs.mkdtempSync(path.join(os.tmpdir(),'ory-captures-18-fichiers-'));
 const fichier=(nom,texte)=>{const f=path.join(fichiers,nom);fs.writeFileSync(f,texte);return f;};
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
     const f=path.join(dossier,'18-'+theme+'-'+largeur+'-'+nom+'.png');await page.screenshot({path:f});
     assert.deepEqual(taillePng(f),[largeur,hauteur],V+nom+' : la taille de la capture');
     assert.ok(fs.statSync(f).size>20000,V+nom+' : une capture qui montre quelque chose');faites.push(f);};
   const importer=async(nom,texte,vol)=>{
     await nav.aller(page,'v-programme');
     await page.locator('#imp-vols').setInputFiles(fichier(nom,texte));
     await page.waitForFunction(([n,v])=>document.getElementById('source-label').textContent===n
       &&((Sim.ateliers.resultat||{}).lots||[]).some(l=>l.retourVol&&l.vol===v),[nom,vol]);
   };
   try{
    await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
    await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.reglages);
    await page.evaluate(()=>localStorage.clear());await page.reload();
    await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.reglages);
    await page.evaluate(UNITE);

    /* ---- le planning des équipes, avec un relais ---------------------------------------------------- */
    await importer('vols-relais.csv',RELAIS,'V3');
    await nav.aller(page,'at-planning');
    await poserTheme();
    await page.waitForSelector('#at-planning .pg-cadre .pg-groupe[data-service="plonge"]');
    if(await page.locator('#at-planning .pg-groupe[data-service="plonge"] .pg-lignes').evaluate(e=>e.hidden))await page.locator('#at-planning .pg-groupe[data-service="plonge"] .pg-replier').click();
    await page.waitForSelector('#at-planning .pg-ligne[data-equipe="apm"] g.pg-lot.en-relais');
    await page.locator('#at-planning .pg-groupe[data-service="plonge"]').scrollIntoViewIfNeeded();
    // La légende est une bande qui défile : on l'amène sur le signe du relais.
    await page.evaluate(()=>document.querySelector('#at-planning .pg-legende .pg-cle[data-signe="relais"]').scrollIntoView({block:'nearest',inline:'nearest'}));
    const pl=await page.evaluate(()=>{const vu=e=>{if(!e)return false;const r=e.getBoundingClientRect();return r.width>0&&r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;};
      const g=s=>document.querySelector('#at-planning .pg-ligne[data-equipe="'+s+'"] g.pg-lot.en-relais');
      return {matin:vu(g('matin')),apm:vu(g('apm')),passe:vu(document.querySelector('#at-planning .pg-ligne[data-equipe="matin"] path.pg-relais[data-relais="passe"]')),
        repris:vu(document.querySelector('#at-planning .pg-ligne[data-equipe="apm"] path.pg-relais[data-relais="repris"]')),
        legende:vu(document.querySelector('#at-planning .pg-legende .pg-cle[data-signe="relais"]')),parts:[g('matin').dataset.part,g('apm').dataset.part],
        jointure:Math.abs(+g('matin').dataset.x1-+g('apm').dataset.x)};});
    assert.ok(pl.matin&&pl.apm&&pl.passe&&pl.repris&&pl.legende,V+'le lot en relais, ses deux repères et la légende sont à l’écran : '+JSON.stringify(pl));
    assert.deepEqual(pl.parts,['1/2','2/2'],V+'les deux parts');
    assert.ok(pl.jointure<0.5,V+'les deux parts se joignent : '+pl.jointure);
    await capturer('planning-relais');

    /* ---- la Synthèse, avec un reste au lendemain ---------------------------------------------------- */
    await importer('vols-reste.csv',RESTE,'W1');
    await nav.aller(page,'j-chiffres');
    await poserTheme();
    await page.waitForSelector('#bilan-journee .sy-table tr[data-service="plonge"] .sy-lendemain');
    await page.evaluate(()=>document.querySelector('#bilan-journee .sy-table tr[data-service="plonge"]').scrollIntoView({block:'center'}));
    const sy=await page.evaluate(()=>{const vu=e=>{if(!e)return false;const r=e.getBoundingClientRect();return r.width>0&&r.top>=0&&r.bottom<=innerHeight&&r.right<=innerWidth;};
      const c=document.querySelector('#bilan-journee .sy-table tr[data-service="plonge"] td.sy-fin');
      // Le reste du lendemain se lit en entier : son texte tient dans sa boîte, et la boîte dans la fenêtre.
      const petit=c.querySelector('.sy-lendemain'),entier=petit.scrollWidth<=petit.clientWidth+1&&c.getBoundingClientRect().right<=innerWidth;
      return {reste:petit.textContent,visible:vu(petit)&&entier,ton:c.dataset.ton||null,hs:/heures sup/.test(c.textContent),
        tableau:(()=>{const t=document.querySelector('#bilan-journee .sy-table').getBoundingClientRect();return t.right<=innerWidth;})()};});
    assert.equal(sy.reste,'reste à laver le lendemain : 2 vols (2 h 00 de lavage)',V+sy.reste);
    assert.ok(sy.visible&&sy.tableau&&sy.ton==='attente'&&!sy.hs,V+JSON.stringify(sy));
    await capturer('synthese-reste');
    // La carte « Où ça coince » : la plonge y est, avec ce qu'elle laisse.
    const carte=page.locator('#bilan-journee .sy-carte',{hasText:'Où ça coince'}).first();
    await carte.scrollIntoViewIfNeeded();
    assert.match(await carte.textContent(),/laisse 2 vols à laver le lendemain, plus que l’équipe du matin ne peut en laver pendant sa présence/,V+'la carte « Où ça coince »');
    await capturer('synthese-coince');
    assert.deepEqual(errors,[],V+'aucune erreur de page');
   }finally{await ctx.close();}
  }
  assert.equal(faites.length,12);
  console.log('captures-evolution-18-browser : ok — '+faites.length+' captures (le planning des équipes avec un relais ; la Synthèse avec un reste au lendemain, sa ligne et sa carte « Où ça coince »), en clair et en sombre, à 1 366 × 768 et 1 920 × 1 080, dans '+dossier);
 }finally{await browser.close();fs.rmSync(fichiers,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});

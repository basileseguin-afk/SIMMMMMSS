/* Correction 23 (k) — les captures de contrôle, sur une unité fictive (tests/plan-rejoue-fictif.cjs) et des vols fictifs,
 * à 1 366 × 768 et 1 920 × 1 080 :
 *   — (a) le Planning d'un programme daté : « J−2 », choisi le premier jour, toujours choisi le troisième ;
 *   — (b) « Détails › Heures sup et renforts », avec des heures supplémentaires et des renforts ;
 *   — (c) « Contrôles » avec une commande sans équipe à trois étapes de son chemin (un point, pas trois), puis la fiche
 *     qu'ouvre son bouton « Choisir ses équipes » ;
 *   — (e) la fiche d'un service par compagnie : l'encart « Lié au handling » ;
 *   — (g) « Tous les temps par vol », dans « Services et équipes » ;
 *   — (j) « Chemins » : les pastilles au nom entier, la ligne des fournisseurs et l'interrupteur au-dessus du schéma.
 * Chaque capture est vérifiée : sa taille, ce qu'elle doit montrer, la fenêtre qui ne défile pas, aucun texte sous 13 px
 * (12 px à l'écran dans un dessin).
 * Les captures sont gardées hors du dépôt : dans $ORY_CAPTURES s'il est donné, sinon dans un dossier temporaire, dit à la
 * fin. Aucune donnée de l'unité : tout est fictif. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;

const dossier=process.env.ORY_CAPTURES?path.resolve(process.env.ORY_CAPTURES):fs.mkdtempSync(path.join(os.tmpdir(),'ory-captures-c23-'));
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
/** Un élément se voit en entier dans la fenêtre. */
const A_L_ECRAN=sel=>{const e=document.querySelector(sel);if(!e)return null;const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;};

/* (a) Trois jours de vols ; le deuxième, sans la compagnie EST. Une équipe de la cuisine travaille l'avant-veille pour EST. */
const JOURS=['2031-03-03','2031-03-04','2031-03-05'];
const CSV_JOURS=F.volsDatesCsv(3,JOURS[0]).split('\n').filter(l=>!(l.startsWith(JOURS[1]+',')&&l.split(',')[2]==='EST')).join('\n');
/* (b) Une heure de montage par vol. A : deux vols, présente trois heures. B : six vols, présente cinq heures — elle
 *     déborde ; A l'aide (un renfort), puis B finit en heures supplémentaires. */
const CSV_MONTAGE='vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC\n'
  +'NO1,NORD,MOYEN,DEP,15:00,,0,0,100\nSU1,SUD,MOYEN,DEP,15:10,,0,0,100\n'
  +['ES1','ES2','ES3'].map((v,i)=>v+',EST,MOYEN,DEP,15:'+(2+i)+'0,,0,0,100').join('\n')+'\n'
  +['OU1','OU2','OU3'].map((v,i)=>v+',OUEST,MOYEN,DEP,16:'+i+'0,,0,0,100').join('\n')+'\n';
const UNITE_MONTAGE=()=>{
  Sim.reglages.changer(()=>{const e=Sim.reglages.etat;e.bareme={...e.bareme,prepa:{'*/YC':60}};e.regime={seuils:[],presence:480};e.heuresSup={actif:true,plafond:180};e.renforts={actif:true};},'');
  Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
    st.ateliers.push({id:'ma',nom:'Montage A',service:'prepa',type:'manuel',debut:'08:00',jour:0,personnes:1,pauses:[],lots:[['NORD/YC'],['SUD/YC']],regime:{actif:true,presence:180}});
    st.ateliers.push({id:'mb',nom:'Montage B',service:'prepa',type:'manuel',debut:'08:00',jour:0,personnes:1,pauses:[],lots:[['EST/YC'],['OUEST/YC']],regime:{actif:true,presence:300}});
    st.effectifs={prepa:'impose'};},'');
};
/* (c) Les vols fictifs, plus un vol d'une compagnie de plus. */
const CSV_NEUF=F.volsCsv()+'NE900,NEUF,MOYEN,DEP,18:00,,4,0,90,4,0\n';

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const faites=[];
 try{
  for(const [largeur,hauteur] of [[1366,768],[1920,1080]]){
   const V=largeur+' × '+hauteur+' : ';
   /** Une page neuve, et de quoi la capturer. */
   const ouvrir=async()=>{
     const ctx=await browser.newContext({viewport:{width:largeur,height:hauteur},reducedMotion:'reduce'});
     const page=await ctx.newPage(),erreurs=[];
     page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
     const attendre=(ms=300)=>page.waitForTimeout(ms);
     const capturer=async nom=>{
       await page.evaluate(()=>document.querySelectorAll('.notif .notif-fermer').forEach(b=>b.click()));
       await page.waitForFunction(()=>!document.querySelector('.notifs .notif'));
       const m=await page.evaluate(LIRE);
       assert.deepEqual(m.fenetre,[0,0],V+nom+' : la fenêtre ne défile pas');
       assert.deepEqual(m.petits,[],V+nom+' : aucun texte sous 13 px (12 px à l’écran dans un dessin)');
       const f=path.join(dossier,'c23-'+largeur+'-'+nom+'.png');await page.screenshot({path:f});
       assert.deepEqual(taillePng(f),[largeur,hauteur],V+nom+' : la taille de la capture');
       assert.ok(fs.statSync(f).size>20000,V+nom+' : une capture qui montre quelque chose');faites.push(f);};
     const fermer=async()=>{assert.deepEqual(erreurs,[],V+'aucune erreur de page : '+erreurs.join(' | '));await ctx.close();};
     return {page,attendre,capturer,fermer};
   };

   /* ---- (a) le Planning garde le jour de travail choisi --------------------------------------------------------- */
   {
    const {page,attendre,capturer,fermer}=await ouvrir();
    const site=await F.charger(page,nav,URL_V1,{csv:CSV_JOURS,pageId:'at-planning'});
    try{
     await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.periode);
     await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'cuj2',nom:'Cuisine avant-veille',service:'cuisine',type:'manuel',debut:'09:00',jour:-2,personnes:1,pauses:[],lots:[['EST/CREW']],regime:{actif:true}});},''));
     await attendre(500);
     const journee=async d=>{await page.locator('#periode-jour').selectOption(d);
       await page.waitForFunction(j=>Sim.jourVols===j&&!!Sim.ateliers.resultat&&Sim.ateliers.resultat.ok,d);await attendre(500);};
     const choisi=()=>page.evaluate(()=>({jours:[...document.querySelectorAll('#at-planning .pg-onglet[aria-pressed="true"]')].map(b=>+b.dataset.pgJour),plusCharge:OrlyPlanningEnsemble.jourAOuvrir(Sim.ateliers.resultat),jourVols:Sim.jourVols}));
     await journee(JOURS[0]);
     await page.locator('#at-planning .pg-onglet[data-pg-jour="-2"]').click();await attendre();
     await journee(JOURS[2]);
     const p=await choisi();
     assert.deepEqual([p.jourVols,p.jours],[JOURS[2],[-2]],V+'le troisième jour de vols, l’onglet « J−2 » est toujours choisi');
     assert.notEqual(p.plusCharge,-2,V+'ce n’est pas le jour le plus chargé : c’est le choix qui est gardé');
     await capturer('a-planning-jour-garde');
     await fermer();
    }finally{await site.effacer();}
   }

   /* ---- (b) « Heures sup et renforts », avec des heures sup et des renforts ---------------------------------------- */
   {
    const {page,attendre,capturer,fermer}=await ouvrir();
    const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ory-c23-vols-')),csv=path.join(tmp,'vols-fictifs.csv');fs.writeFileSync(csv,CSV_MONTAGE);
    try{
     await page.goto(URL_V1);await attendre();
     await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(500);
     await page.evaluate(UNITE_MONTAGE);await attendre();
     await nav.aller(page,'v-programme');await page.locator('#imp-vols').setInputFiles(csv);
     await page.waitForFunction(()=>{const r=Sim.ateliers.resultat;return !!r&&r.ok&&(r.renforts||[]).length>0;});
     await nav.aller(page,'j-details');await attendre(500);
     const cartes=await page.evaluate(()=>[...document.querySelectorAll('#journee-details .panneau')].map(c=>({titre:c.querySelector('h3').textContent.trim(),lignes:c.querySelectorAll('tbody tr').length})));
     assert.equal(cartes.length,2,V+'deux cartes : '+JSON.stringify(cartes));
     assert.ok(cartes.every(c=>c.lignes>=1),V+'des heures supplémentaires et des renforts : '+JSON.stringify(cartes));
     assert.equal(await page.evaluate(()=>(document.querySelector('#onglets-internes .oi-onglet.actif')||{}).textContent),'Heures sup et renforts');
     await capturer('b-heures-sup-renforts');
     await fermer();
    }finally{fs.rmSync(tmp,{recursive:true,force:true});}
   }

   /* ---- (c) « Contrôles » : une commande sans équipe à trois étapes, puis la fiche ouverte par son bouton ----------- */
   {
    const {page,attendre,capturer,fermer}=await ouvrir();
    const site=await F.charger(page,nav,URL_V1,{csv:CSV_NEUF,pageId:'mu-pas'});
    try{
     await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.problemes&&Sim.unite);
     // Chaque étape sans équipe reçoit une équipe ; puis la commande ajoutée, cochée dans une seule équipe de la cuisine.
     await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
       for(const a of Sim.ateliers.resultat.anomalies.filter(x=>x.code==='parcours-trou'&&!Sim.unite.estFournisseur(x.service)))
         st.ateliers.push({id:'bouche-'+a.service,nom:'Équipe '+a.service,service:a.service,type:'manuel',debut:'02:00',jour:0,personnes:2,pauses:[],lots:[a.classes.slice()],regime:{actif:true}});},''));
     await attendre(800);
     await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id==='cu1').lots.push(['NEUF/CREW']);},''));
     await attendre(800);
     await nav.aller(page,'mu-pas');await attendre(500);
     const point=page.locator('#mu-pas .ct-point',{hasText:'NEUF · Équipage n’a pas d’équipe à 3 étapes'});
     assert.equal(await point.count(),1,V+'un point pour cette commande, pas trois');
     assert.deepEqual(await point.locator('[data-ct-aller]').evaluateAll(bs=>bs.map(b=>b.textContent)),['Choisir ses équipes →','Lui donner un autre chemin →'],V+'ses deux boutons');
     await point.scrollIntoViewIfNeeded();await attendre(200);
     await capturer('c-controles-trois-etapes');
     // Son bouton : son chemin, sur la première étape en cause, le clavier sur le choix de son équipe.
     await point.locator('[data-ct-aller]').nth(0).click();
     await page.waitForFunction(()=>document.body.dataset.sous==='mu-flux'&&!!document.querySelector('#mu-flux .ch-etape')&&!!document.activeElement&&document.activeElement.matches('select[data-ch-equipe]'));
     await attendre(500);
     const c=await page.evaluate(()=>{const e=document.activeElement,r=e.getBoundingClientRect();return {commande:e.dataset.chEquipe,vise:!!e.closest('.ch-vise'),ecran:r.top>=0&&r.bottom<=innerHeight};});
     assert.deepEqual(c,{commande:'NEUF/CREW',vise:true,ecran:true},V+'la fiche ouverte par le bouton : le choix de l’équipe de la commande, à l’écran');
     await capturer('c-fiche-ouverte-par-le-bouton');
     await fermer();
    }finally{await site.effacer();}
   }

   /* ---- (e), (g), (j) : « Services et équipes » et « Chemins », sur l'unité fictive ---------------------------------- */
   {
    const {page,attendre,capturer,fermer}=await ouvrir();
    const site=await F.charger(page,nav,URL_V1,{pageId:'mu-services'});
    try{
     await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.unite);
     // (e) La fiche d'un service par compagnie : « Lié au handling ».
     await page.locator('#mu-services .se-liste [data-mu-choisir="armement"]').click();await attendre(500);
     const encart=page.locator('#mu-services .mu-lien-handling');
     assert.equal(await encart.count(),1,V+'l’encart « Lié au handling »');
     assert.match((await encart.innerText()).replace(/\s+/g,' '),/Lié au handling\. Le handling attend Armement avant de charger un vol, pour les compagnies qui passent par lui : celles dont un chemin passe par ce service, ou qu’une de ses équipes a cochées\. Il charge les autres sans l’attendre\./,V+'sa phrase');
     assert.equal(await encart.locator('button',{hasText:/relier au seul handling|tous les chemins/}).count(),0,V+'plus de bouton qui relie tous les chemins');
     await encart.scrollIntoViewIfNeeded();await attendre(200);
     assert.equal(await page.evaluate(A_L_ECRAN,'#mu-services .mu-lien-handling'),true,V+'l’encart est à l’écran');
     await capturer('e-fiche-service-par-compagnie');

     // (g) « Tous les temps par vol ».
     await page.locator('#mu-services .se-tous-temps').click();
     await page.waitForSelector('#mu-services .se-fiche[data-se-vue="temps"] .rg-recap-table tbody tr');await attendre(500);
     const t=await page.evaluate(()=>{const f=document.querySelector('#mu-services .se-fiche[data-se-vue="temps"]'),sc=f.querySelector('.rg-recap-scroll');
       return {lignes:f.querySelectorAll('.rg-recap-table tbody tr').length,recherche:!!f.querySelector('#rg-recap-filtre'),cadre:sc.scrollHeight>sc.clientHeight,entree:document.querySelector('#mu-services .se-tous-temps').getAttribute('aria-current')};});
     assert.ok(t.lignes>=5&&t.recherche,V+'le tableau, sa recherche : '+JSON.stringify(t));
     assert.equal(await page.evaluate(A_L_ECRAN,'#mu-services .rg-recap-table thead th'),true,V+'son en-tête est à l’écran');
     await capturer('g-tous-les-temps-par-vol');

     // (j) « Chemins » : les pastilles au nom entier ; la ligne des fournisseurs et l'interrupteur au-dessus du schéma.
     await nav.aller(page,'mu-flux');await attendre();
     await page.locator('#mu-flux .ch-liste [data-mu-flux-choisir="complet"]').click();
     await page.waitForFunction(()=>document.querySelector('#mu-flux .ch-fiche').dataset.muFluxFiche==='complet'&&!!document.querySelector('#mu-flux .gr-svg .gr-noeud'));await attendre(400);
     assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('#mu-flux .gr-svg .ch-pastille text')].map(x=>x.textContent).sort()),['Magasin','Réception / Appros'],V+'les pastilles disent le nom entier');
     assert.equal(await page.evaluate(()=>document.querySelector('#mu-flux .ch-fiche').scrollTop),0);
     assert.equal(await page.evaluate(A_L_ECRAN,'#mu-flux [data-ch-fournisseurs]'),true,V+'l’interrupteur se voit sans défiler');
     assert.equal(await page.evaluate(()=>{const l=document.querySelector('#mu-flux .ch-fournis'),g=document.querySelector('#mu-flux [data-mu-graphe]');return l.getBoundingClientRect().bottom<=g.getBoundingClientRect().top+1;}),true,V+'la ligne est au-dessus du schéma');
     await capturer('j-chemins');
     await fermer();
    }finally{await site.effacer();}
   }
  }
  assert.equal(faites.length,14,'quatorze captures : sept vues, deux tailles');
  console.log('OK captures de la correction 23 : '+faites.length+' captures dans '+dossier+' — le Planning qui garde « J−2 » (a), « Heures sup et renforts » avec des heures sup et des renforts (b), « Contrôles » avec une commande sans équipe à trois étapes puis la fiche ouverte par son bouton (c), la fiche d’un service par compagnie (e), « Tous les temps par vol » (g), « Chemins » (j) ; chacune vérifiée, à 1 366 × 768 et 1 920 × 1 080');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

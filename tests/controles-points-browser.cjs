/* Correction 23 (c) — « Contrôles » : chaque point dit quoi faire, et son bouton mène à l'endroit exact (version 1), sur
 * l'unité fictive et ses vols fictifs, plus un vol d'une compagnie de plus (« NEUF »), à 1 366 × 768.
 *   1. Le point bloquant nomme les commandes et les compagnies (quatre au plus, puis « et n autres ») ; il a un bouton par
 *      service, au nom du service ; chacun ouvre la fiche de ce service.
 *   2. Dans la fiche d'un service, chaque ligne de l'encart « à compléter » nomme les compagnies ou les commandes, et se
 *      clique : chaque nom ouvre l'endroit exact — la case à cocher dans la fiche de l'équipe, le champ du temps par vol ;
 *      une ligne qui n'a qu'un endroit (« Ajouter une équipe ») se clique en entier —, mis en évidence, le clavier dessus.
 *   3. Pour chaque sorte de point qui a un bouton : après le clic, l'élément qui a le clavier est celui qui règle le
 *      point — le choix de l'équipe de la ligne (« Régler dans Chemins »), la case de la commande, le champ du temps par
 *      vol ; pour un lien de fournisseur, le tableau ; pour ce que la journée montre, la ligne du service dans la Synthèse.
 *   4. Une commande sans équipe à trois étapes de son chemin donne un point, pas trois : « <commande> n'a pas d'équipe à
 *      3 étapes du chemin <nom> », avec « Choisir ses équipes » (la première étape en cause) et « Lui donner un autre
 *      chemin » (la section « Qui le suit »). Le niveau ne change pas ; le nombre de points baisse, la pastille suit.
 *   5. « Vos services et leurs équipes » ne s'affiche pas quand tous ses services sont déjà cités par un autre point.
 *   6. Un point sur trois services a trois boutons.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const C='#mu-pas';
/** Un vol d'une compagnie de plus : ses commandes arrivent sans équipe. */
const CSV_NEUF=F.volsCsv()+'NE900,NEUF,MOYEN,DEP,18:00,,4,0,90,4,0\n';

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 /** Une page neuve sur l'unité fictive, avec ces vols. */
 const ouvrir=async csv=>{
   const ctx=await browser.newContext({viewport:{width:1366,height:768}});
   const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
   // Une unité d'avant (sans liste des compagnies) : la compagnie NEUF de l'import crée ses commandes (évolution 26 b).
   const site=await F.charger(page,nav,URL_V1,{csv,sauvegarde:F.sauvegardeFictive({liste:false}),pageId:'mu-pas'});
   await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.problemes&&Sim.problemes.liste.length>0);
   await page.waitForTimeout(400);
   const attendre=(ms=350)=>page.waitForTimeout(ms);
   return {ctx,page,site,attendre,
     sous:()=>page.evaluate(()=>document.body.dataset.sous),
     // « Contrôles », ses informations dépliées (au-delà de trois, elles sont repliées).
     controles:async()=>{await nav.aller(page,'mu-pas');await attendre();await page.evaluate(()=>{const d=document.querySelector('#mu-pas details.ct-plus');if(d)d.open=true;});},
     registre:()=>page.evaluate(()=>Sim.problemes.liste.map(p=>({niveau:p.niveau,titre:p.titre,detail:p.detail,code:p.code||null,service:p.service||null,equipe:p.equipe||null,
       classes:p.classes||null,etape:p.etape||null,services:p.services||null,noms:p.nomsServices||null,etapes:p.etapes||null,groupe:!!p.groupe,fournisseur:!!p.fournisseur,vu:p.vu||null}))),
     /** Le point dont le titre commence ainsi. */
     point:debut=>page.locator(`${C} .ct-point`).filter({has:page.locator('.ct-corps>b',{hasText:debut})}).first(),
     /** Ce qui a le clavier : sa balise, ce qui le désigne, s'il se voit, et s'il est encore dans « Contrôles ». */
     clavier:()=>page.evaluate(()=>{const a=document.activeElement,d=a.dataset||{};
       return {balise:a.tagName.toLowerCase(),id:a.id||'',classe:a.className||'',donnees:{...d},texte:(a.textContent||'').trim().replace(/\s+/g,' ').slice(0,80),
         visible:a.getClientRects().length>0,controles:!!a.closest('#mu-pas'),vise:!!(a.closest('.se-vise, .ch-vise')),ligne:(a.closest('tr')||{dataset:{}}).dataset.chCmd||(a.closest('tr')||{dataset:{}}).dataset.service||null,
         dans:['#mu-services .se-supprimes','#mu-flux .fo-table','#bilan-journee','#mu-flux [data-ch-section="suivi"]','#mu-services [data-mu-section="temps"]','#mu-services [data-mu-section="equipes"]','#mu-services .se-equipe','#mu-services .se-afaire'].filter(s=>a.closest(s)),
         ecran:(()=>{const r=a.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})()};}),
     pastille:()=>page.evaluate(()=>{const b=document.querySelector('#menu [data-entree="mu-pas"] .so-badge');return b?+b.textContent:0;}),
     compte:()=>page.evaluate(()=>OrlyAvis.compte(Sim.problemes.liste))};
 };
 try{
  /* ================================================================================================================
   *  A. L'unité fictive, avec un vol d'une compagnie de plus : ses commandes n'ont personne.
   * ================================================================================================================ */
  let s=await ouvrir(CSV_NEUF),{page,attendre}=s;
  let r=await s.registre();

  /* ---- 1. le point bloquant nomme ce qui est en cause, et a un bouton par service ---------------------------------- */
  const bloquant=r.find(p=>p.etape==='commandes');
  assert.equal(bloquant.niveau,'bloquant');
  assert.equal(bloquant.detail,'NEUF · Business, NEUF · Équipage, NEUF · Économie et ZEN · Économie ne sont préparées par aucune équipe. NEUF et ZEN n’ont personne à « Armement ». Cochez-les dans l’équipe qui les prépare.',
    'le point nomme les commandes, puis les compagnies sans personne à un service par compagnie');
  assert.ok(bloquant.services.length>=3&&bloquant.services.includes('armement'),'ses services : '+bloquant.services);
  const pb=s.point('Chaque commande');
  assert.deepEqual(await pb.locator('[data-ct-aller]').evaluateAll(bs=>bs.map(b=>b.textContent)),bloquant.noms.map(n=>n+' →'),'un bouton par service, au nom du service');
  assert.equal(await pb.locator('.ct-corps>span').innerText(),bloquant.detail);
  // Chacun ouvre la fiche de ce service ; le clavier va sur la première ligne de son encart « à compléter ».
  for(let k=0;k<bloquant.services.length;k++){
    await s.controles();
    await s.point('Chaque commande').locator('[data-ct-aller]').nth(k).click();await attendre();
    assert.deepEqual([await s.sous(),await page.evaluate(()=>Sim.unite.choisi),await page.evaluate(()=>Sim.unite.equipeOuverte||null)],['mu-services',bloquant.services[k],null],bloquant.noms[k]+' : sa fiche');
    const c=await s.clavier();
    assert.deepEqual([c.balise,c.dans.includes('#mu-services .se-afaire'),c.visible,c.controles],['button',true,true,false],bloquant.noms[k]+' : le clavier sur la première ligne de l’encart : '+JSON.stringify(c));
  }
  // Plus de quatre commandes : « et n autres ».
  assert.equal(await page.evaluate(()=>OrlyAvis.lister({etapes:[{id:'commandes',titre:'t',absentes:{commandes:['a','b','c','d','e','f'],parService:[]}}]})[0].detail),
    'a, b, c, d et 2 autres ne sont préparées par aucune équipe. Cochez-les dans l’équipe qui les prépare.');

  /* ---- 2. l'encart « à compléter » : chaque ligne nomme, se clique, et mène à l'endroit exact --------------------- */
  // a. Un service par compagnie : « NEUF : à cocher dans « Armement » » ouvre la fiche de l'équipe, sur la case de NEUF.
  await s.controles();
  await s.point('Chaque commande').locator('[data-ct-aller]',{hasText:'Armement'}).click();await attendre();
  const encart=page.locator('#mu-services .se-fiche .se-afaire');
  assert.deepEqual(await encart.locator('li').evaluateAll(ls=>ls.map(l=>l.innerText.replace(/\s+/g,' ').trim())),['À cocher dans « Armement » : NEUF → ZEN →'],
    'la ligne nomme l’équipe et les compagnies à y cocher');
  assert.equal(await encart.locator('button',{hasText:'NEUF'}).getAttribute('title'),'Ouvrir « Armement », pour y cocher NEUF');
  await encart.locator('button',{hasText:'NEUF'}).click();await attendre();
  let c=await s.clavier();
  assert.equal(await page.evaluate(()=>Sim.unite.equipeOuverte),'ar','la fiche de l’équipe');
  assert.deepEqual([c.balise,c.donnees.muCocher,c.vise,c.visible,c.ecran],['input','NEUF/@ARM',true,true,true],'le clavier sur la case de NEUF, mise en évidence : '+JSON.stringify(c));
  // Espace : la case se coche, la compagnie est préparée, le point bloquant ne la nomme plus à l'armement.
  await page.keyboard.press('Space');await attendre(600);
  assert.ok((await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.id==='ar').lots.flat())).includes('NEUF/@ARM'),'la case est cochée');
  r=await s.registre();
  assert.match(r.find(p=>p.etape==='commandes').detail,/\. ZEN n’a personne à « Armement »\. /,'il ne reste que ZEN à l’armement');
  // b. Ses heures par vol : la ligne nomme la compagnie et mène à son champ, dans « Ses minutes par compagnie ».
  await page.evaluate(()=>{Sim.unite.ouvrirEquipe(null);});await attendre();
  await page.locator('#mu-services details[data-mu-section="temps"]>summary').click();await attendre(200);
  const toutes=page.locator('#mu-services input[data-mu-cat-min][data-cie="*"]');
  const avantToutes=await toutes.inputValue();
  await toutes.fill('');await toutes.press('Enter');await attendre(600);
  await page.evaluate(()=>{const f=document.querySelector('#mu-services .se-fiche');f.scrollTop=0;});
  const ligneTemps=encart.locator('li').filter({hasText:'Heures par vol à remplir'});
  const sansHeures=await ligneTemps.locator('button').evaluateAll(bs=>bs.map(b=>b.textContent));
  assert.ok(sansHeures.length>=2&&sansHeures.length<=5&&sansHeures.slice(0,4).every(t=>/^[A-Z]+ →$/.test(t)),'la ligne nomme les compagnies sans heures par vol, quatre au plus : '+sansHeures);
  if(sansHeures.length===5)assert.match(sansHeures[4],/^et \d+ autres? →$/);
  const cie=sansHeures[0].replace(' →','');
  await page.locator('#mu-services details[data-mu-section="temps"]>summary').click();await attendre(200);     // repliée : le nom la rouvre
  await ligneTemps.locator('button').first().click();await attendre();
  c=await s.clavier();
  assert.deepEqual([c.balise,c.donnees.cie,'muCatMin' in c.donnees,c.vise,c.visible,c.ecran],['input',cie,true,true,true,true],'le clavier sur le champ de '+cie+' : '+JSON.stringify(c));
  assert.equal(await page.locator('#mu-services details[data-mu-section="temps"]').evaluate(d=>d.open),true,'la section des temps, dépliée');
  await toutes.fill(avantToutes);await toutes.press('Enter');await attendre(500);
  // c. Un service à deux équipes : la ligne nomme les commandes ; chacune ouvre sa case dans l'équipe qui prépare déjà
  //    le plus de commandes de sa compagnie — à défaut, la première. Le nom le dit au survol.
  await page.evaluate(()=>Sim.unite.ouvrir('cuisine'));await attendre();
  const cuisine=await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>a.service==='cuisine').map(a=>({id:a.id,nom:a.nom,sud:a.lots.flat().filter(c=>c.startsWith('SUD/')).length})));
  assert.equal(cuisine.length,2);
  const aCocher=encart.locator('li').filter({hasText:'À cocher dans une équipe'});
  assert.match((await aCocher.innerText()).replace(/\s+/g,' ').trim(),/^À cocher dans une équipe : (.+ · .+ → )*NEUF · Business → /,'la ligne nomme les commandes à cocher');
  assert.equal(await aCocher.locator('button',{hasText:'NEUF · Business'}).getAttribute('title'),'Ouvrir « '+cuisine[0].nom+' », pour y cocher NEUF · Business','aucune équipe ne prépare NEUF : la première');
  const pourSud=cuisine.slice().sort((x,y)=>y.sud-x.sud)[0];
  assert.equal(await aCocher.locator('button',{hasText:'SUD · Équipage'}).getAttribute('title'),'Ouvrir « '+pourSud.nom+' », pour y cocher SUD · Équipage','l’équipe qui prépare déjà le plus de commandes de SUD');
  await aCocher.locator('button',{hasText:'NEUF · Business'}).click();await attendre();
  c=await s.clavier();
  assert.equal(await page.evaluate(()=>Sim.unite.equipeOuverte),cuisine[0].id,'la fiche de cette équipe');
  assert.deepEqual([c.balise,c.donnees.muCocher,c.vise,c.ecran],['input','NEUF/BC',true,true],'le clavier sur la case de la commande : '+JSON.stringify(c));
  // d. Un service sans équipe : les commandes qui passent, quatre noms au plus ; la ligne mène au bouton qui lui donne
  //    une équipe (« Mettre ce service en place », pour une mise à disposition).
  await page.evaluate(()=>Sim.unite.ouvrir('appros'));await attendre();
  assert.match((await encart.locator('li').first().innerText()).replace(/\s+/g,' ').trim(),/^([A-Z]+ · [^,]+, ){3}[A-Z]+ · [^,]+ et \d+ autres passent par ici, sans équipe Mettre ce service en place →$/);
  await encart.locator('button').first().click();await attendre();
  c=await s.clavier();
  assert.deepEqual([c.balise,c.donnees.muAction,c.dans.includes('#mu-services [data-mu-section="equipes"]'),c.ecran],['button','equipe',true,true],'le clavier sur le bouton qui ajoute une équipe : '+JSON.stringify(c));
  // e. Une équipe qui ne prépare rien : sa fiche, sur sa première case à cocher.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'cuv',nom:'Cuisine de nuit',service:'cuisine',type:'manuel',debut:'22:00',jour:-1,personnes:1,pauses:[],lots:[],regime:{actif:true}});},''));
  await attendre(600);
  await page.evaluate(()=>Sim.unite.ouvrir('cuisine'));await attendre();
  const vide=encart.locator('li').filter({hasText:'ne prépare rien'});
  assert.equal((await vide.innerText()).replace(/\s+/g,' ').trim(),'« Cuisine de nuit » ne prépare rien Cocher ses commandes →');
  await vide.locator('button').click();await attendre();
  c=await s.clavier();
  assert.equal(await page.evaluate(()=>Sim.unite.equipeOuverte),'cuv');
  assert.deepEqual([c.balise,'muCocher' in c.donnees,c.dans.includes('#mu-services .se-equipe')],['input',true,true],'le clavier sur sa première case : '+JSON.stringify(c));
  await page.evaluate(()=>Sim.ateliers.histoire(false));await attendre(600);
  // f. Des temps par vol à remplir : une ligne par commande, qui mène à son champ.
  const gardes=await page.evaluate(()=>{const e=Sim.reglages.etat,avant=JSON.stringify(e.bareme.cuisine||null);Sim.reglages.changer(()=>{const b={...e.bareme};b.cuisine={};e.bareme=b;},'');return avant;});
  await attendre(700);
  await page.evaluate(()=>Sim.unite.ouvrir('cuisine'));await attendre();
  const ligneSansTemps=encart.locator('li').filter({hasText:'Temps par vol à remplir'});
  const sansTemps=await ligneSansTemps.locator('button').evaluateAll(bs=>bs.map(b=>b.textContent));
  assert.ok(sansTemps.length>=1&&sansTemps.length<=5&&/^[A-Z]+ · .+ →$/.test(sansTemps[0]),'la ligne nomme les commandes sans temps par vol, quatre au plus : '+sansTemps);
  await ligneSansTemps.locator('button').first().click();await attendre();
  c=await s.clavier();
  assert.deepEqual([c.balise,c.donnees.rgChamp,c.donnees.service,c.dans.includes('#mu-services [data-mu-section="temps"]'),c.visible],['input','heures','cuisine',true,true],'le clavier sur le champ du temps par vol : '+JSON.stringify(c));
  // Le même point, depuis « Contrôles » (« aucun temps par vol ») : le même champ.
  await s.controles();
  r=await s.registre();
  const bareme=r.find(p=>/^bareme/.test(p.code||'')&&p.service==='cuisine');
  assert.ok(bareme,'un point « sans temps par vol » pour la cuisine : '+r.filter(p=>p.niveau!=='information').map(p=>p.code||p.etape));
  await s.point(bareme.titre.slice(0,40)).locator('[data-ct-aller]').click();await attendre();
  c=await s.clavier();
  assert.deepEqual([await s.sous(),c.balise,c.donnees.rgChamp,c.donnees.service,c.controles],['mu-services','input','heures','cuisine',false],'« Régler dans Services et équipes » : le champ du temps par vol : '+JSON.stringify(c));
  await page.evaluate(g=>{const e=Sim.reglages.etat;Sim.reglages.changer(()=>{const b={...e.bareme};const v=JSON.parse(g);if(v)b.cuisine=v;else delete b.cuisine;e.bareme=b;},'');},gardes);
  await attendre(700);

  /* ---- 3. pour chaque sorte de point : après le clic, le clavier est sur ce qui le règle -------------------------- */
  await s.controles();
  r=await s.registre();
  // a. Une étape sans équipe : « Régler dans Chemins », le choix de l'équipe de la ligne de la commande.
  const trous=r.filter(p=>p.code==='parcours-trou'&&!p.fournisseur&&!p.groupe);
  assert.ok(trous.length>=2);
  for(const p of trous){
    await s.controles();
    const b=s.point(p.titre.slice(0,40)).locator('[data-ct-aller]');
    assert.equal(await b.innerText(),'Régler dans Chemins →');
    await b.click();await attendre(450);
    c=await s.clavier();
    assert.deepEqual([await s.sous(),c.balise,c.donnees.chEquipe,c.donnees.service,c.ligne,c.vise,c.ecran,c.controles],['mu-flux','select',p.classes[0],p.service,p.classes[0],true,true,false],
      p.service+' : le clavier sur le choix de l’équipe de la ligne : '+JSON.stringify(c));
  }
  // b. Un fournisseur sans équipe : le tableau « Qui se fournit où ».
  await s.controles();
  const fournisseur=r.find(p=>p.fournisseur&&p.code==='parcours-trou');
  await s.point(fournisseur.titre.slice(0,40)).locator('[data-ct-aller]').click();await attendre(450);
  c=await s.clavier();
  assert.deepEqual([await s.sous(),c.balise,c.dans.includes('#mu-flux .fo-table'),c.visible,c.controles],['mu-flux','table',true,true,false],'un lien de fournisseur : le clavier sur le tableau : '+JSON.stringify(c));
  // … et les clients réglés en partie (une information), de même.
  await s.controles();
  await s.point('1 client réglé en partie').locator('[data-ct-aller]').click();await attendre(450);
  c=await s.clavier();
  assert.deepEqual([c.balise,c.dans.includes('#mu-flux .fo-table')],['table',true]);
  // c. Un point d'une équipe (une commande cochée hors de son chemin) : la case de cette commande, dans la fiche de l'équipe.
  await s.controles();
  const hors=r.find(p=>p.code==='hors-parcours');
  await s.point(hors.titre.slice(0,30)).locator('[data-ct-aller]').click();await attendre(450);
  c=await s.clavier();
  assert.deepEqual([await s.sous(),await page.evaluate(()=>Sim.unite.equipeOuverte),c.balise,c.donnees.muCocher,c.vise,c.controles],['mu-services',hors.equipe,'input',hors.classes[0],true,false],
    'une commande cochée hors de son chemin : sa case, dans la fiche de l’équipe : '+JSON.stringify(c));
  // La décocher règle le point.
  await page.keyboard.press('Space');await attendre(700);
  assert.equal((await s.registre()).some(p=>p.code==='hors-parcours'),false,'décochée : le point part');
  await page.evaluate(()=>Sim.ateliers.histoire(false));await attendre(700);
  // d. Ce que la journée montre dans un service : la Synthèse, sur la ligne de ce service.
  await s.controles();
  r=await s.registre();
  const montre=r.find(p=>p.niveau==='information'&&p.vu);
  assert.ok(montre,'une information qui parle d’un service');
  await s.point(montre.titre.slice(0,40)).locator('[data-ct-aller]').click();await attendre(450);
  c=await s.clavier();
  assert.deepEqual([await s.sous(),c.dans.includes('#bilan-journee'),c.ligne,c.visible,c.controles],['j-chiffres',true,montre.vu,true,false],'le clavier sur la ligne du service, dans la Synthèse : '+JSON.stringify(c));
  // … sans service : le clavier va à la page (il ne reste pas sur le bouton quitté).
  await s.controles();
  await page.evaluate(()=>Sim.unite.allerAvis({niveau:'information',titre:'x',page:'j-chiffres'}));await attendre();
  c=await s.clavier();
  assert.deepEqual([await s.sous(),c.id,c.controles],['j-chiffres','workspace',false]);
  // e. Les sortes que l'unité fictive n'a pas : le même geste, sur un avis de chaque sorte.
  const mener=async(p,k)=>{await s.controles();await page.evaluate(([p,k])=>Sim.unite.allerAvis(p,k),[p,k||0]);await attendre(450);return s.clavier();};
  // Sans vol : « Programme des vols », sur le bouton qui importe.
  c=await mener({niveau:'bloquant',titre:'x',page:'v-programme',etape:'vols'});
  assert.deepEqual([await s.sous(),c.id,c.controles],['v-programme','imp-vols',false],'sans vol : le clavier sur l’import : '+JSON.stringify(c));
  // Un chemin à reprendre (une boucle, des commandes sans chemin) : « Chemins », sur la liste des chemins.
  c=await mener({niveau:'bloquant',titre:'x',page:'mu-flux',code:'cycle'});
  assert.deepEqual([await s.sous(),c.balise,/mu-svc/.test(c.classe),c.controles],['mu-flux','button',true,false],'un chemin : le clavier sur la liste des chemins : '+JSON.stringify(c));
  // Un avis des liens : « Liens entre services », le clavier dans la page.
  c=await mener({niveau:'corriger',titre:'x',page:'u-liens',lien:true});
  assert.deepEqual([await s.sous(),c.visible,c.controles],['u-liens',true,false],'un avis des liens : '+JSON.stringify(c));
  // Un service supprimé encore cité : les services supprimés, sur le premier geste du panneau.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'fan',nom:'Équipe d’un service disparu',service:'service-disparu',type:'manuel',debut:'06:00',jour:0,personnes:1,pauses:[],lots:[],regime:{actif:true}});},''));
  await attendre(700);
  await s.controles();
  r=await s.registre();
  const fantome=r.find(p=>/n’existe plus dans l’unité$/.test(p.titre));
  assert.ok(fantome,'un service supprimé encore cité');
  await s.point(fantome.titre.slice(0,30)).locator('[data-ct-aller]').click();await attendre(450);
  c=await s.clavier();
  assert.deepEqual([await s.sous(),c.dans.includes('#mu-services .se-supprimes'),c.visible,c.controles],['mu-services',true,true,false],'un service supprimé : le clavier sur le premier geste du panneau : '+JSON.stringify(c));
  await page.evaluate(()=>Sim.ateliers.histoire(false));await attendre(700);
  // Aucun bouton de la page ne laisse le clavier sur « Contrôles » : chaque avis qui a un bouton, l'un après l'autre.
  await s.controles();
  const n=await page.locator(`${C} [data-ct-aller]`).count();
  assert.ok(n>=10,'des boutons de chaque sorte : '+n);
  for(let i=0;i<n;i++){
    await s.controles();
    const b=page.locator(`${C} [data-ct-aller]`).nth(i),texte=await b.innerText();
    await b.click();await attendre(400);
    c=await s.clavier();
    assert.deepEqual([c.controles,c.visible,await s.sous()!=='mu-pas'],[false,true,true],'« '+texte+' » (bouton '+i+') : le clavier est dans la page ouverte : '+JSON.stringify(c));
  }
  await s.site.effacer();await s.ctx.close();

  /* ================================================================================================================
   *  B. Une commande sans équipe à trois étapes de son chemin : un point, pas trois.
   * ================================================================================================================ */
  s=await ouvrir(CSV_NEUF);({page,attendre}=s);
  // D'abord, chaque étape sans équipe de l'unité fictive reçoit une équipe pour ses commandes : il ne reste aucun trou.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
    for(const a of Sim.ateliers.resultat.anomalies.filter(x=>x.code==='parcours-trou'&&!Sim.unite.estFournisseur(x.service)))
      st.ateliers.push({id:'bouche-'+a.service,nom:'Équipe '+a.service,service:a.service,type:'manuel',debut:'02:00',jour:0,personnes:2,pauses:[],lots:[a.classes.slice()],regime:{actif:true}});},''));
  await attendre(800);
  r=await s.registre();
  assert.deepEqual(r.filter(p=>p.code==='parcours-trou'&&!p.fournisseur),[],'plus aucune étape sans équipe');
  const avant=await s.compte();
  assert.equal(await s.pastille(),avant);
  // La commande ajoutée, cochée dans une seule équipe (la cuisine du matin) : son chemin, celui de sa classe, passe par
  // trois autres étapes où personne ne la prépare.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id==='cu1').lots.push(['NEUF/CREW']);},''));
  await attendre(800);
  await s.controles();
  r=await s.registre();
  const groupes=r.filter(p=>p.groupe);
  assert.equal(groupes.length,1,'un point pour cette commande : '+JSON.stringify(r.filter(p=>p.code==='parcours-trou').map(p=>p.titre)));
  const g=groupes[0];
  assert.deepEqual([g.niveau,g.classes,g.etapes.length],['corriger',['NEUF/CREW'],3],'le niveau ne change pas ; trois étapes : '+g.etapes);
  const chemin=await page.evaluate(()=>{const p=OrlyParcours.fluxDe(Sim.ateliers.state,Sim.ateliers.classes.find(c=>c.id==='NEUF/CREW'));return {id:p.id,nom:p.nom,etapes:MoteurProduction.servicesDuParcours(p)};});
  assert.equal(g.titre,'NEUF · Équipage n’a pas d’équipe à 3 étapes du chemin « '+chemin.nom+' »');
  assert.match(g.detail,/^Étapes sans équipe : .+, .+ et .+\. Elle suit ce chemin par défaut, celui de sa classe : si ce n’est pas le sien, donnez-lui un autre chemin ; sinon, choisissez son équipe à chaque étape\.$/);
  for(const e of g.etapes)assert.ok(chemin.etapes.includes(e),e+' est une étape de son chemin');
  // Un point, pas trois : sans le regroupement, le calcul en dit un par étape. Le nombre de points baisse, la pastille suit.
  const parEtape=await page.evaluate(()=>{const src=Sim.problemes.a.sources();return OrlyAvis.lister({...src,cheminDe:undefined}).filter(p=>p.code==='parcours-trou'&&!p.fournisseur).map(p=>p.service);});
  assert.deepEqual(parEtape,g.etapes,'le calcul dit ces trois étapes, une par une');
  assert.equal(r.filter(p=>p.code==='parcours-trou'&&!p.fournisseur).length,1,'un point, pas trois');
  assert.equal(await s.compte(),avant+1,'un point à corriger de plus qu’avant la commande, pas trois');
  assert.equal(await s.pastille(),avant+1,'la pastille suit');
  assert.equal(await page.locator(`${C} .ct-niveau.corriger .ct-point`).filter({hasText:'NEUF · Équipage'}).count(),1);
  // « Vos services et leurs équipes » : ses services (ces trois étapes) sont déjà cités par ce point — il ne s'affiche pas.
  assert.equal(r.some(p=>p.etape==='services'),false,'« Vos services et leurs équipes » ne s’affiche pas');
  assert.equal(await page.locator(`${C} .ct-point`).filter({hasText:'Vos services et leurs équipes'}).count(),0);
  // Ses deux boutons.
  const pg=s.point('NEUF · Équipage n’a pas');
  assert.deepEqual(await pg.locator('[data-ct-aller]').evaluateAll(bs=>bs.map(b=>b.textContent)),['Choisir ses équipes →','Lui donner un autre chemin →']);
  // « Choisir ses équipes » : la première étape en cause, la ligne de la commande, le clavier sur le choix de son équipe.
  await pg.locator('[data-ct-aller]').nth(0).click();await attendre(450);
  c=await s.clavier();
  assert.deepEqual([await s.sous(),await page.evaluate(()=>Sim.unite.fluxChoisi),await page.locator('#mu-flux .ch-etape').getAttribute('data-ch-etape')],['mu-flux',chemin.id,g.etapes[0]],'son chemin, sur la première étape en cause');
  assert.deepEqual([c.balise,c.donnees.chEquipe,c.donnees.service,c.vise,c.ecran],['select','NEUF/CREW',g.etapes[0],true,true],'le clavier sur le choix de son équipe : '+JSON.stringify(c));
  // « Lui donner un autre chemin » : la section « Qui le suit », le clavier sur le chemin de cette commande.
  await s.controles();
  await s.point('NEUF · Équipage n’a pas').locator('[data-ct-aller]').nth(1).click();await attendre(450);
  c=await s.clavier();
  assert.deepEqual([await s.sous(),await page.evaluate(()=>Sim.unite.fluxChoisi),await page.locator('#mu-flux [data-ch-section="suivi"]').evaluate(d=>d.open)],['mu-flux',chemin.id,true],'son chemin, « Qui le suit » déplié');
  assert.deepEqual([c.balise,c.donnees.muCmdChemin,c.dans.includes('#mu-flux [data-ch-section="suivi"]'),c.vise,c.ecran],['select','NEUF/CREW',true,true,true],'le clavier sur le chemin que suit cette commande : '+JSON.stringify(c));
  // Lui donner un chemin qui ne passe par aucune de ces étapes règle le point.
  const autre=await page.evaluate(g=>{const P=MoteurProduction,sel=document.activeElement;
    const o=[...sel.options].find(o=>{const p=(Sim.ateliers.state.parcours||[]).find(x=>x.id===o.value);return p&&!g.etapes.some(e=>P.servicesDuParcours(p).includes(e));});
    return o?o.value:null;},g);
  if(autre){
    await page.locator('#mu-flux [data-ch-section="suivi"] select[data-mu-cmd-chemin="NEUF/CREW"]').selectOption(autre);await attendre(800);
    assert.equal((await s.registre()).some(p=>p.groupe),false,'un autre chemin : le point part');
    await page.evaluate(()=>Sim.ateliers.histoire(false));await attendre(700);
  }
  // En lecture seule : la page se lit, ses deux boutons sont grisés, leur raison dite une fois.
  await s.controles();
  const bascule=page.locator('#btn-lecture-seule');
  await bascule.click();await attendre(500);
  assert.equal(await page.evaluate(()=>document.body.dataset.lecture),'seule');
  const lu=s.point('NEUF · Équipage n’a pas');
  assert.deepEqual(await lu.locator('[data-ct-aller]').evaluateAll(bs=>bs.map(b=>b.disabled)),[true,true],'en lecture seule, ses deux boutons sont grisés');
  assert.equal(await lu.locator('.ct-raison').count(),1,'leur raison, dite une fois');
  // Un bouton qui mène à un résultat marche toujours : la Synthèse, sur la ligne du service.
  const vu=(await s.registre()).find(p=>p.niveau==='information'&&p.vu);
  await s.point(vu.titre.slice(0,40)).locator('[data-ct-aller]').click();await attendre(450);
  c=await s.clavier();
  assert.deepEqual([await s.sous(),c.ligne,c.controles],['j-chiffres',vu.vu,false],'en lecture seule, « Voir dans Synthèse » ouvre la ligne du service');
  await s.controles();
  await bascule.click();await attendre(500);
  assert.equal(await page.evaluate(()=>document.body.dataset.lecture),undefined);
  await s.site.effacer();await s.ctx.close();

  /* ================================================================================================================
   *  C. Un point sur trois services a trois boutons.
   * ================================================================================================================ */
  s=await ouvrir(F.volsCsv());({page,attendre}=s);
  // La compagnie ZEN a quelqu'un à l'armement : il reste sa commande des repas, attendue dans trois services.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id==='ar').lots.push(['ZEN/@ARM']);},''));
  await attendre(800);
  await s.controles();
  r=await s.registre();
  const trois=r.find(p=>p.etape==='commandes');
  assert.equal(trois.detail,'ZEN · Économie n’est préparée par aucune équipe. Cochez-la dans l’équipe qui la prépare.');
  assert.equal(trois.services.length,3,'elle est attendue dans trois services : '+trois.noms);
  const b3=s.point('Chaque commande').locator('[data-ct-aller]');
  assert.deepEqual(await b3.evaluateAll(bs=>bs.map(b=>b.textContent)),trois.noms.map(x=>x+' →'),'trois services, trois boutons');
  assert.equal(await b3.count(),3);
  let cases=0;
  for(let k=0;k<3;k++){
    await s.controles();
    await s.point('Chaque commande').locator('[data-ct-aller]').nth(k).click();await attendre();
    assert.deepEqual([await s.sous(),await page.evaluate(()=>Sim.unite.choisi)],['mu-services',trois.services[k]],'le bouton « '+trois.noms[k]+' » ouvre sa fiche');
    // Une équipe d'ici prépare des commandes : la ligne nomme la commande et mène à sa case, le clavier dessus.
    const l=page.locator('#mu-services .se-fiche .se-afaire li').filter({has:page.locator('[data-se-viser="cocher"][data-se-commande="ZEN/YC"]')});
    if(await l.count()){
      assert.match((await l.first().innerText()).replace(/\s+/g,' '),/^À cocher dans (une équipe|« .+ ») : .*ZEN · Économie →/);
      await l.first().locator('[data-se-commande="ZEN/YC"]').click();await attendre();
      c=await s.clavier();
      assert.deepEqual([c.balise,c.donnees.muCocher,c.vise],['input','ZEN/YC',true],trois.noms[k]+' : le clavier sur la case de la commande : '+JSON.stringify(c));
      cases++;
    }else{
      // Aucune équipe d'ici ne prépare de commande (une équipe hors tunnel) : la ligne le dit, et mène à « Ajouter une équipe ».
      const a=page.locator('#mu-services .se-fiche .se-afaire [data-se-viser="ajouter"]');
      assert.match((await a.innerText()).replace(/\s+/g,' '),/ : à cocher dans une équipe, et aucune d’ici ne prépare de commande Ajouter une équipe →$/);
      await a.click();await attendre();
      c=await s.clavier();
      assert.deepEqual([c.balise,c.donnees.muAction],['button','equipe'],trois.noms[k]+' : le clavier sur « Ajouter une équipe » : '+JSON.stringify(c));
    }
  }
  assert.ok(cases>=2,'dans deux services au moins, la ligne mène à la case de la commande');
  // La page tient toujours dans l'écran ; aucun texte sous 13 px.
  await s.controles();
  const m=await page.evaluate(()=>({doc:document.documentElement.scrollHeight-innerHeight,
    texte:Math.min(...[...document.querySelectorAll('#mu-pas *')].filter(e=>e.children.length===0&&e.textContent.trim()&&e.getBoundingClientRect().width>0).map(e=>parseFloat(getComputedStyle(e).fontSize))),
    deborde:[...document.querySelectorAll('#mu-pas .ct-gestes .btn')].filter(b=>b.getBoundingClientRect().right>b.closest('.ct-niveau').getBoundingClientRect().right+1).length}));
  assert.deepEqual([m.doc,m.texte>=13,m.deborde],[0,true,0],'la page ne défile pas, texte de 13 px au moins, aucun bouton ne sort de sa colonne : '+JSON.stringify(m));
  await s.site.effacer();await s.ctx.close();

  assert.deepEqual(erreurs,[],'aucune erreur de page : '+erreurs.join(' | '));
  console.log('OK controles-points : le point bloquant nomme les commandes et les compagnies, un bouton par service ; l’encart « à compléter » nomme et mène à l’endroit exact (case, champ, « Ajouter une équipe ») ; après chaque bouton, le clavier est sur ce qui règle le point ; une commande sans équipe à trois étapes donne un point, pas trois, avec ses deux boutons ; « Vos services et leurs équipes » ne se répète pas ; un point sur trois services a trois boutons');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

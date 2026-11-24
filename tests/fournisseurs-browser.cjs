/* Évolution 24 (a) — les clients d'un fournisseur : une liste pour toute l'unité (version 1), sur l'unité fictive.
 *   1. Dans « Chemins », la liste de gauche a une entrée à part, au-dessus des chemins : « Fournisseurs ». Elle ouvre le
 *      tableau « Qui se fournit où » : une ligne par service, une colonne par fournisseur, rien entre un fournisseur et
 *      lui-même ; une phrase dit la règle. Une mise à disposition qui a un amont (la légumerie) n'est pas un fournisseur.
 *   2. Une sauvegarde d'avant, avec un client en partie : la cellule le dit (« en partie : 1 chemin sur 2 », les chemins
 *      au survol, « Partout » et « Nulle part ») ; rien n'est modifié à l'ouverture ni à l'export, et le résultat est le
 *      même champ par champ — comparés à la page d'avant (la même page, sans fournisseurs.js).
 *   3. Cocher un service écrit le lien dans tous les chemins où il est une étape, et dans aucun autre ; décocher
 *      l'enlève partout : la sauvegarde redevient celle d'avant, au caractère près.
 *   4. « Partout » puis « Nulle part » : les liens attendus ; un fournisseur sans client dans un chemin en sort.
 *   5. La liste vaut pour la suite : ajouter le client à un chemin, créer un chemin et l'y mettre, dupliquer un chemin
 *      qui le contient — le lien y est.
 *   6. Une sauvegarde d'après, relue par le code d'avant : la page d'avant donne le même résultat champ par champ ; la
 *      version 2 (gelée) lit les mêmes chemins, et son résultat ne dépend pas de la liste.
 *   7. Dans « Services et équipes », la fiche d'un fournisseur ne règle plus « Quels chemins en ont besoin ? » : elle
 *      montre ses clients, et « Régler dans Chemins › Fournisseurs » y mène.
 *   8. « Contrôles » : l'information « 1 client réglé en partie », tant qu'il en reste ; son bouton mène au tableau.
 *   9. Le tableau tient en un écran à 1 366 × 768 pour quinze services et trois fournisseurs ; au-delà, il défile dans
 *      son cadre, en-têtes figés. Texte de 13 px au moins ; la fenêtre ne défile pas.
 *  10. Dans le schéma, un lien de fournisseur ne se retire pas : il mène au tableau ; un fournisseur ne s'ajoute pas
 *      comme une étape.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs'),U=require('./unite-15-services.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href,URL_V2=pathToFileURL(path.resolve(__dirname,'../v2/index.html')).href;
const M='#mu-flux',CLE='ory-ateliers-v1';
/** La page d'avant : la même page, sans le module des fournisseurs. */
const MODULE=/\/fournisseurs\.js(\?|$)/;

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 const ouvrir=async(url,o={})=>{
  const ctx=await browser.newContext({viewport:{width:o.largeur||1366,height:o.hauteur||768}});
  const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
  if(o.avant)await page.route(MODULE,r=>r.fulfill({status:200,contentType:'application/javascript',body:''}));
  const site=await F.charger(page,nav,url,{...(o.sauvegarde?{sauvegarde:o.sauvegarde}:{}),pageId:o.pageId||'mu-flux'});
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.unite);
  return {page,ctx,site,fermer:async()=>{site.effacer();await ctx.close();}};
 };
 const attendre=(page,ms=300)=>page.waitForTimeout(ms);
 /** L'unité telle que le navigateur la garde (la sauvegarde l'exporte telle quelle). */
 const garde=page=>page.evaluate(c=>localStorage.getItem(c),CLE);
 /** Tout ce que la sauvegarde exporte : les données du navigateur, hors préférences d'affichage (`ory-ui-…`). */
 const donnees=page=>page.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!/^ory-ui-/.test(k))o[k]=localStorage.getItem(k);}return o;});
 const resultat=page=>page.evaluate(()=>JSON.stringify(Sim.ateliers.resultat));
 /** Les liens des chemins, par leur nom : { 'Complet': ['appros>decontam', …] }, et les étapes de chacun. */
 const chemins=page=>page.evaluate(()=>Object.fromEntries(Sim.ateliers.state.parcours.map(p=>[p.nom,{liens:p.liens.map(l=>l.de+'>'+l.vers),noeuds:p.noeuds.slice()}])));
 const aLien=(c,nom,lien)=>c[nom].liens.includes(lien);
 const fournisseurs=async page=>{await page.locator(`${M} .ch-liste [data-ch-panneau="fournisseurs"]`).click();await page.waitForSelector(`${M} .ch-fiche[data-ch-vue="fournisseurs"]`);await attendre(page,150);};
 const coche=(page,s,f)=>page.locator(`${M} input[data-fo-client="${s}"][data-fo-fournisseur="${f}"]`);
 const cellule=(page,s,f)=>page.evaluate(([s,f])=>{
   const t=document.querySelector('#mu-flux .fo-table'),col=[...t.querySelectorAll('thead th')].findIndex(th=>th.dataset.foColonne===f);
   const td=t.querySelector(`tr[data-fo-service="${s}"]`).children[col],c=td.querySelector('input[type=checkbox]'),d=td.querySelector('.fo-dit');
   return {coche:c?c.checked:null,dit:d?d.textContent.trim():null,survol:d?d.title:null,boutons:[...td.querySelectorAll('button')].map(b=>b.textContent.trim()),texte:td.textContent.replace(/\s+/g,' ').trim()};},[s,f]);
 const choisirChemin=async(page,nom)=>{await page.locator(`${M} .ch-liste [data-mu-flux-choisir]`,{hasText:nom}).first().click();await page.waitForSelector(`${M} .ch-fiche[data-ch-vue="chemin"] .gr-svg .gr-noeud`);await attendre(page,200);};

 try{
  /* ---- 1 et 2 : l'entrée, le tableau ; une sauvegarde d'avant ne bouge pas ------------------------------------- */
  const A=await ouvrir(URL_V1),page=A.page;
  const B=await ouvrir(URL_V1,{avant:true});
  assert.equal(await B.page.evaluate(()=>typeof window.OrlyFournisseurs),'undefined','la page d’avant : sans le module');
  assert.equal(await B.page.locator(`${M} [data-ch-panneau="fournisseurs"]`).count(),0,'la page d’avant n’a pas l’entrée');
  const ancienne=await garde(page);
  assert.equal(JSON.parse(ancienne).fournisseurs,undefined,'une sauvegarde d’avant n’a pas de liste');
  const liste=await page.evaluate(()=>{
    const l=document.querySelector('#mu-flux .ch-liste'),e=l.querySelector('[data-ch-panneau="fournisseurs"]'),premier=l.querySelector('[data-mu-flux-choisir]');
    return {nom:e.querySelector('b').textContent,dit:e.querySelector('small').textContent,avantLesChemins:!!(e.compareDocumentPosition(premier)&Node.DOCUMENT_POSITION_FOLLOWING),
      estUnChemin:e.hasAttribute('data-mu-flux-choisir'),groupe:e.previousElementSibling.textContent};});
  assert.deepEqual(liste,{nom:'Fournisseurs',dit:'2 fournisseurs · 1 client en partie',avantLesChemins:true,estUnChemin:false,groupe:'Pour toute l’unité'},'une entrée à part, au-dessus des chemins');
  await fournisseurs(page);
  const t=await page.evaluate(()=>{
    const f=document.querySelector('#mu-flux .ch-fiche'),tb=f.querySelector('.fo-table');
    return {titre:f.querySelector('h2').textContent,regle:f.querySelector('.fo-regle').textContent,legende:tb.querySelector('caption').textContent,
      colonnes:[...tb.querySelectorAll('thead th[data-fo-colonne]')].map(th=>th.querySelector('b').textContent),
      lignes:[...tb.querySelectorAll('tbody tr')].map(tr=>tr.dataset.foService),services:Sim.unite.a.services().map(s=>s.id).sort(),
      soi:[...tb.querySelectorAll('tbody tr')].filter(tr=>['appros','magasin'].includes(tr.dataset.foService)).map(tr=>tr.querySelectorAll('input').length),
      actif:document.querySelector('#mu-flux [data-ch-panneau="fournisseurs"]').getAttribute('aria-current'),cheminActif:document.querySelectorAll('#mu-flux [data-mu-flux-choisir].actif').length,
      schema:!!f.querySelector('.gr-svg')};});
  assert.equal(t.titre,'Qui se fournit où');assert.equal(t.legende,'Qui se fournit où');
  assert.equal(t.regle,'Cochez les clients de chaque fournisseur. Un client l’est dans tous les chemins où il passe.');
  assert.deepEqual(t.colonnes,['Réception / Appros','Magasin'],'une colonne par fournisseur ; la légumerie, qui reçoit de la réception, n’en est pas un');
  assert.deepEqual(t.lignes.slice().sort(),t.services,'une ligne par service de l’unité');
  assert.ok(t.lignes.includes('decontam'),'la légumerie est une ligne, comme les autres étapes');
  assert.deepEqual(t.soi,[1,1],'aucune coche entre un fournisseur et lui-même (une seule : l’autre fournisseur)');
  assert.deepEqual([t.actif,t.cheminActif,t.schema],['true',0,false],'le tableau prend la place du chemin choisi');
  assert.deepEqual(await cellule(page,'decontam','appros'),{coche:true,dit:null,survol:null,boutons:[],texte:''},'client partout où il passe : cochée');
  assert.equal((await cellule(page,'cuisine','appros')).coche,false,'client nulle part : décochée');
  const partie=await cellule(page,'preparation','appros');
  assert.deepEqual([partie.coche,partie.dit,partie.survol,partie.boutons],[null,'en partie : 1 chemin sur 2','Client dans : Sans cuisine. Pas dans : Complet.',['Partout','Nulle part']],'un client en partie le dit');
  // Rien n'a bougé : ni à l'ouverture, ni en ouvrant le tableau ; l'export est celui de la page d'avant, le résultat aussi.
  assert.equal(await garde(page),ancienne,'ouvrir le tableau ne change pas l’unité');
  assert.deepEqual(await donnees(page),await donnees(B.page),'ce que la sauvegarde exporte est identique à la page d’avant');
  const resultatAvant=await resultat(B.page);
  assert.equal(await resultat(page),resultatAvant,'le résultat est identique, champ par champ');
  assert.ok(JSON.parse(resultatAvant).lots.length>10,'une vraie journée');
  const cheminsAvant=await chemins(page);

  /* ---- 3 : cocher, décocher -------------------------------------------------------------------------------------- */
  // La cuisine froide est une étape de « Complet », pas de « Sans cuisine ».
  await coche(page,'cuisine','magasin').check();await attendre(page);
  let c=await chemins(page);
  assert.equal(aLien(c,'Complet','magasin>cuisine'),true,'le lien est écrit là où le service est une étape');
  assert.equal(aLien(c,'Sans cuisine','magasin>cuisine'),false,'et dans aucun autre chemin');
  assert.equal(c['Sans cuisine'].noeuds.includes('cuisine'),false);
  assert.deepEqual(JSON.parse(await garde(page)).fournisseurs,{magasin:['cuisine']},'la liste se garde avec l’unité');
  assert.equal((await cellule(page,'cuisine','magasin')).coche,true);
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.foClient),'cuisine','le clavier reste sur la coche');
  for(const [nom,x] of Object.entries(cheminsAvant))for(const l of x.liens)assert.equal(aLien(c,nom,l),true,nom+' garde '+l);
  await coche(page,'cuisine','magasin').uncheck();await attendre(page);
  assert.equal(await garde(page),ancienne,'décoché : la sauvegarde d’avant, au caractère près');
  // Un service qui est une étape des deux chemins : le lien dans les deux ; décoché, retiré des deux.
  await coche(page,'dotation','magasin').check();await attendre(page);
  c=await chemins(page);
  assert.deepEqual([aLien(c,'Complet','magasin>dotation'),aLien(c,'Sans cuisine','magasin>dotation')],[true,true]);
  await coche(page,'dotation','magasin').uncheck();await attendre(page);
  assert.equal(await garde(page),ancienne);
  // Un service qui n'est dans aucun chemin : coché, il ne reçoit aucun lien — la liste le garde.
  const horsChemin=await page.evaluate(()=>[...document.querySelectorAll('#mu-flux .fo-table tbody tr')].filter(tr=>/dans aucun chemin/.test(tr.querySelector('th').textContent)).map(tr=>tr.dataset.foService));
  assert.ok(horsChemin.length>0,'l’unité fictive a des services hors de tout chemin');
  await coche(page,horsChemin[0],'magasin').check();await attendre(page);
  assert.deepEqual(await chemins(page),cheminsAvant,'aucun lien : il n’est une étape nulle part');
  assert.deepEqual(JSON.parse(await garde(page)).fournisseurs,{magasin:[horsChemin[0]]});
  assert.equal((await cellule(page,horsChemin[0],'magasin')).coche,true,'il reste coché');
  await coche(page,horsChemin[0],'magasin').uncheck();await attendre(page);
  assert.equal(await garde(page),ancienne);

  /* ---- 4 : « Partout », puis « Nulle part » ---------------------------------------------------------------------- */
  await page.locator(`${M} [data-fo-partout="preparation"][data-fo-fournisseur="appros"]`).click();await attendre(page);
  c=await chemins(page);
  assert.deepEqual([aLien(c,'Complet','appros>preparation'),aLien(c,'Sans cuisine','appros>preparation')],[true,true],'« Partout » : le lien dans les deux chemins');
  assert.deepEqual(await cellule(page,'preparation','appros'),{coche:true,dit:null,survol:null,boutons:[],texte:''},'la cellule devient une coche');
  assert.equal(await page.locator(`${M} [data-ch-panneau="fournisseurs"] small`).textContent(),'2 fournisseurs','plus de client en partie');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.foClient),'preparation','le clavier va sur la coche');
  // Revenir en arrière (« Annuler »), puis « Nulle part ».
  await page.locator('#btn-annuler').click();await attendre(page);
  assert.equal(await garde(page),ancienne,'« Annuler » rend la sauvegarde d’avant');
  assert.equal((await cellule(page,'preparation','appros')).dit,'en partie : 1 chemin sur 2');
  await page.locator(`${M} [data-fo-nulle-part="preparation"][data-fo-fournisseur="appros"]`).click();await attendre(page);
  c=await chemins(page);
  assert.deepEqual([aLien(c,'Complet','appros>preparation'),aLien(c,'Sans cuisine','appros>preparation')],[false,false],'« Nulle part » : retiré des deux');
  assert.equal(c['Sans cuisine'].noeuds.includes('appros'),false,'sans client dans « Sans cuisine », la réception en sort');
  assert.equal(aLien(c,'Complet','appros>decontam'),true,'dans « Complet », elle fournit encore la légumerie');
  assert.equal((await cellule(page,'preparation','appros')).coche,false);
  assert.equal(JSON.parse(await garde(page)).fournisseurs,undefined,'rien de coché à garder');

  /* ---- 5 : la liste vaut pour la suite --------------------------------------------------------------------------- */
  await coche(page,'cuisine','magasin').check();await attendre(page);
  // (a) L'étape ajoutée à un chemin.
  await choisirChemin(page,'Sans cuisine');
  assert.equal(await page.locator(`${M} [data-mu-flux-ajout] option[value="cuisine"]`).count(),1);
  await page.locator(`${M} [data-mu-flux-ajout]`).selectOption('cuisine');await attendre(page,400);
  c=await chemins(page);
  assert.equal(c['Sans cuisine'].noeuds.includes('cuisine'),true);
  assert.equal(aLien(c,'Sans cuisine','magasin>cuisine'),true,'l’étape ajoutée reçoit aussitôt le lien de son fournisseur');
  // (b) Un chemin créé, puis son étape.
  await page.locator(`${M} details[data-ch-ajout] > summary`).click();
  await page.locator(`${M} form[data-mu-flux-nouveau] input[name="nom"]`).fill('Essai');
  await page.locator(`${M} form[data-mu-flux-nouveau] select[name="source"]`).selectOption('');
  await page.locator(`${M} form[data-mu-flux-nouveau] button[type="submit"]`).click();await attendre(page,400);
  await choisirCheminVide(page,'Essai');
  await page.locator(`${M} [data-mu-flux-ajout]`).selectOption('cuisine');await attendre(page,400);
  c=await chemins(page);
  assert.deepEqual(c.Essai.liens,['magasin>cuisine'],'un chemin créé : le lien y est, et rien d’autre');
  assert.deepEqual(c.Essai.noeuds.slice().sort(),['cuisine','magasin'],'le fournisseur y entre avec son client');
  // (c) Un chemin dupliqué qui contient le client.
  await choisirChemin(page,'Complet');
  await page.locator(`${M} [data-mu-flux-action="dupliquer"]`).click();await attendre(page,400);
  c=await chemins(page);
  assert.equal(aLien(c,'Complet (copie)','magasin>cuisine'),true,'un chemin dupliqué : le lien y est');
  await fournisseurs(page);
  assert.equal((await cellule(page,'cuisine','magasin')).coche,true,'client dans les quatre chemins où il passe');

  /* ---- 10 : dans le schéma, un lien de fournisseur ne se règle pas ------------------------------------------------ */
  // (Évolution 24 b : le schéma ne dessine les fournisseurs et leurs liens qu'à la demande — l'interrupteur les montre.)
  await choisirChemin(page,'Complet');
  await page.locator(`${M} [data-ch-fournisseurs]`).click();await attendre(page,300);
  const ajout=await page.locator(`${M} [data-mu-flux-ajout] option`).evaluateAll(os=>os.map(o=>o.value));
  assert.equal(ajout.includes('appros')||ajout.includes('magasin'),false,'un fournisseur ne s’ajoute pas comme une étape');
  await page.evaluate(()=>{Sim.unite.fluxSel={type:'lien',id:'magasin>prepa'};Sim.unite.graphe.selection=Sim.unite.fluxSel;Sim.unite.rendreFlux();});await attendre(page,200);
  const lienChoisi=await page.evaluate(()=>{const p=document.querySelector('#mu-flux .ch-lien');return {fournisseur:p.classList.contains('ch-lien-fournisseur'),retirer:!!p.querySelector('[data-mu-flux-action="retirer-lien"]'),bouton:p.querySelector('[data-fo-ouvrir]').textContent.trim()};});
  assert.deepEqual(lienChoisi,{fournisseur:true,retirer:false,bouton:'Régler dans Fournisseurs →'},'le lien d’un fournisseur ne se retire pas du schéma');
  await page.locator(`${M} .ch-lien [data-fo-ouvrir]`).click();await attendre(page);
  assert.equal(await page.locator(`${M} .ch-fiche`).getAttribute('data-ch-vue'),'fournisseurs','il mène au tableau');
  // Un lien entre deux étapes se retire comme avant.
  await choisirChemin(page,'Complet');
  await page.evaluate(()=>{Sim.unite.fluxSel={type:'lien',id:'cuisine>preparation'};Sim.unite.graphe.selection=Sim.unite.fluxSel;Sim.unite.rendreFlux();});await attendre(page,200);
  assert.equal(await page.locator(`${M} .ch-lien [data-mu-flux-action="retirer-lien"]`).count(),1);

  /* ---- 6 : une sauvegarde d'après, relue par le code d'avant ------------------------------------------------------ */
  const apres=JSON.parse(await garde(page)),resultatApres=await resultat(page);
  assert.deepEqual(apres.fournisseurs,{magasin:['cuisine']});
  const sauvegardeApres=F.sauvegardeFictive();sauvegardeApres.contenu[CLE]=apres;
  const sansListe=JSON.parse(JSON.stringify(sauvegardeApres));delete sansListe.contenu[CLE].fournisseurs;
  await B.fermer();
  const C=await ouvrir(URL_V1,{avant:true,sauvegarde:sauvegardeApres});
  assert.deepEqual(JSON.parse(await garde(C.page)).parcours,apres.parcours,'la page d’avant lit les mêmes chemins');
  assert.equal(await resultat(C.page),resultatApres,'la page d’avant donne le même résultat, champ par champ');
  await C.fermer();
  const lireV2=async s=>{const x=await ouvrir(URL_V2,{sauvegarde:s});const r={etat:JSON.parse(await garde(x.page)),resultat:await resultat(x.page)};await x.fermer();return r;};
  const v2=await lireV2(sauvegardeApres),v2Sans=await lireV2(sansListe);
  assert.equal('fournisseurs' in v2.etat,false,'la version 2 ne garde pas la liste');
  assert.deepEqual(v2.etat.parcours.map(p=>[p.nom,p.noeuds,p.liens]),apres.parcours.map(p=>[p.nom,p.noeuds,p.liens]),'elle lit les mêmes chemins, les mêmes liens');
  assert.ok(JSON.parse(v2.resultat).lots.length>10);
  assert.equal(v2.resultat,v2Sans.resultat,'son résultat ne dépend pas de la liste : elle ne lit que les liens');

  /* ---- 7 : la fiche d'un fournisseur ------------------------------------------------------------------------------ */
  await nav.aller(page,'mu-services');await attendre(page);
  await page.locator('#mu-services .se-liste [data-mu-choisir="magasin"]').click();await attendre(page);
  const fiche=await page.evaluate(()=>{const f=document.querySelector('#mu-services .se-fiche'),c=f.querySelector('.fo-clients');
    return {besoins:f.querySelectorAll('[data-mu-besoin]').length,titre:c.querySelector('h4').textContent,clients:c.querySelector('.fo-clients-liste').textContent.replace(/\s+/g,' ').trim(),
      champs:c.querySelectorAll('input,select').length,lien:c.querySelector('[data-fo-ouvrir]').textContent.trim()};});
  assert.deepEqual(fiche,{besoins:0,titre:'Ses clients',clients:'Cuisine froide, Montage',champs:0,lien:'Régler dans Chemins › Fournisseurs →'},'la fiche montre ses clients : rien ne s’y règle');
  // (Évolution 24 d, retouche de contrôle.) La phrase de la fiche ne demande plus « qui en a besoin » : cela se règle ailleurs.
  const phrase=()=>page.evaluate(()=>[...document.querySelectorAll('#mu-services .se-fiche p.mini-note')].map(p=>p.textContent).find(t=>/^Il sert toutes les commandes/.test(t))||'');
  assert.match(await phrase(),/Dites quand il est ouvert et combien de personnes y travaillent sur la journée\.$/);
  assert.doesNotMatch(await phrase(),/qui en a besoin/);
  // La légumerie reçoit de la réception : une étape comme les autres, sa fiche ne change pas.
  await page.locator('#mu-services .se-liste [data-mu-choisir="decontam"]').click();await attendre(page);
  assert.deepEqual(await page.evaluate(()=>{const f=document.querySelector('#mu-services .se-fiche');return [f.querySelectorAll('.fo-clients').length,f.querySelectorAll('[data-mu-besoin]').length>0];}),[0,true]);
  assert.match(await phrase(),/et qui en a besoin\.$/,'sa phrase non plus');
  await page.locator('#mu-services .se-liste [data-mu-choisir="magasin"]').click();await attendre(page);
  await page.locator('#mu-services .fo-clients [data-fo-ouvrir]').click();await attendre(page);
  assert.deepEqual(await page.evaluate(()=>[document.body.dataset.sous,document.querySelector('#mu-flux .ch-fiche').dataset.chVue]),['mu-flux','fournisseurs'],'le lien mène au tableau, dans « Chemins »');

  /* ---- 8 : « Contrôles » ------------------------------------------------------------------------------------------ */
  // On repart d'une sauvegarde d'avant, dans une page neuve.
  await A.fermer();
  const D=await ouvrir(URL_V1,{pageId:'mu-pas'}),p2=D.page;
  const avis=()=>p2.evaluate(()=>[...document.querySelectorAll('#mu-pas .ct-point')].filter(li=>/en partie/.test(li.textContent)).map(li=>({niveau:li.closest('[data-ct-niveau]').dataset.ctNiveau,titre:li.querySelector('b').textContent,bouton:(li.querySelector('[data-ct-aller]')||{}).textContent||''})));
  await p2.evaluate(()=>{const d=document.querySelector('#mu-pas .ct-plus');if(d)d.open=true;});
  assert.deepEqual(await avis(),[{niveau:'information',titre:'1 client réglé en partie',bouton:'Voir dans Chemins › Fournisseurs →'}],'une information, tant qu’il en reste');
  const badge=await p2.evaluate(()=>(document.querySelector('#menu [data-entree="mu-pas"] .badge, #menu [data-entree="mu-pas"] [class*="badge"]')||{}).textContent||'');
  await p2.locator('#mu-pas .ct-point',{hasText:'en partie'}).locator('[data-ct-aller]').click();await attendre(p2);
  assert.deepEqual(await p2.evaluate(()=>[document.body.dataset.sous,document.querySelector('#mu-flux .ch-fiche').dataset.chVue]),['mu-flux','fournisseurs'],'son bouton mène au tableau');
  await p2.locator(`${M} [data-fo-partout="preparation"][data-fo-fournisseur="appros"]`).click();await attendre(p2);
  await nav.aller(p2,'mu-pas');await attendre(p2);
  await p2.evaluate(()=>{const d=document.querySelector('#mu-pas .ct-plus');if(d)d.open=true;});
  assert.deepEqual(await avis(),[],'réglé : l’information part');
  assert.equal(await p2.evaluate(()=>(document.querySelector('#menu [data-entree="mu-pas"] .badge, #menu [data-entree="mu-pas"] [class*="badge"]')||{}).textContent||''),badge,'une information ne compte pas au menu');
  // « Annuler » : le client est de nouveau en partie, et l'information revient.
  await nav.aller(p2,'mu-flux');await attendre(p2,200);
  await p2.locator('#btn-annuler').click();await attendre(p2);
  await nav.aller(p2,'mu-pas');await attendre(p2);
  await p2.evaluate(()=>{const d=document.querySelector('#mu-pas .ct-plus');if(d)d.open=true;});
  assert.equal((await avis()).length,1,'défait : l’information revient');

  /* ---- 9 : le tableau tient en un écran ; au-delà, il défile dans son cadre --------------------------------------- */
  // Quinze services et trois fournisseurs : deux services de plus, dont un de mise à disposition (« Épicerie »).
  const ajouterService=async(nom,dispo)=>{
    await nav.aller(p2,'mu-services');await attendre(p2,200);
    const d=p2.locator('#mu-services details[data-se-ajout]');if(!(await d.evaluate(e=>e.open)))await d.locator('> summary').click();
    await p2.locator('#mu-services form[data-mu-nouveau] input[name="nom"]').fill(nom);
    await p2.locator('#mu-services form[data-mu-nouveau] button[type="submit"]').click();await attendre(p2,500);
    const id=await p2.evaluate(n=>(Sim.unite.a.services().find(s=>s.nom===n)||{}).id,nom);assert.ok(id,'service créé : '+nom);
    if(!dispo)return id;
    await p2.locator(`#mu-services .se-liste [data-mu-choisir="${id}"]`).click();await attendre(p2,200);
    await p2.locator(`#mu-services [data-mu-nature="${id}"]`).selectOption('dispo');await attendre(p2,300);
    // Encore sans équipe, sa nature choisie compte : sa fiche est déjà celle d'un fournisseur.
    assert.equal(await p2.locator('#mu-services .se-fiche .fo-clients').count(),1,'une mise à disposition sans amont, même sans équipe, a la fiche d’un fournisseur');
    await p2.locator('#mu-services .se-fiche [data-mu-action="equipe"]').click();await attendre(p2,500);
    return id;
  };
  const epicerie=await ajouterService('Épicerie',true);await ajouterService('Conditionnement',false);
  await nav.aller(p2,'mu-flux');await attendre(p2);await fournisseurs(p2);
  const MESURER=()=>{
    const f=document.querySelector('#mu-flux .ch-fiche'),c=f.querySelector('.fo-cadre'),tb=c.querySelector('.fo-table'),vue=document.querySelector('#view-ateliers');
    const visibles=[...document.querySelectorAll('#mu-flux *')].filter(e=>e.getClientRects().length&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()));
    const petits=visibles.filter(e=>parseFloat(getComputedStyle(e).fontSize)<13).map(e=>e.tagName+'.'+e.className+' « '+e.textContent.trim().slice(0,30)+' »');
    const defile=e=>/(auto|scroll)/.test(getComputedStyle(e).overflowY)&&e.scrollHeight>e.clientHeight+1;
    const zones=[...document.querySelectorAll('#mu-flux *')].filter(e=>e.getClientRects().length&&defile(e)).map(e=>e.className);
    return {lignes:tb.querySelectorAll('tbody tr').length,colonnes:tb.querySelectorAll('thead th[data-fo-colonne]').length,enPartie:tb.querySelectorAll('.fo-dit').length,
      cadre:[c.clientHeight,c.scrollHeight,c.clientWidth,c.scrollWidth],fiche:[f.clientHeight,f.scrollHeight],fenetre:document.documentElement.scrollHeight-innerHeight,
      vue:vue.scrollHeight-vue.clientHeight,petits,zones,bas:Math.round(c.getBoundingClientRect().bottom),hauteur:innerHeight};};
  let m=await p2.evaluate(MESURER);
  assert.deepEqual([m.lignes,m.colonnes],[15,3],'quinze services, trois fournisseurs : '+JSON.stringify(m));
  assert.ok(await p2.locator(`${M} thead th[data-fo-colonne="${epicerie}"]`).count()===1,'« Épicerie » est un fournisseur');
  // Un client coché, un décoché, un en partie : le cas de la consigne.
  assert.equal(m.enPartie,1,'un client en partie, avec ses deux boutons');
  assert.equal((await cellule(p2,'decontam','appros')).coche,true);assert.equal((await cellule(p2,'cuisine','appros')).coche,false);
  assert.ok(m.cadre[1]<=m.cadre[0]+1,'le tableau tient dans son cadre, sans défiler : '+JSON.stringify(m.cadre));
  assert.ok(m.cadre[3]<=m.cadre[2]+1,'ni en largeur : '+JSON.stringify(m.cadre));
  assert.ok(m.bas<=m.hauteur,'son cadre est dans l’écran');
  assert.deepEqual([m.fenetre,m.vue],[0,0],'ni la fenêtre ni la page ne défilent');
  assert.deepEqual(m.zones,[],'rien ne défile : tout se voit');
  assert.deepEqual(m.petits,[],'texte de 13 px au moins');
  await D.fermer();
  // Au-delà (vingt et un services) : il défile dans son cadre, en-têtes figés.
  const E=await ouvrir(URL_V1,{sauvegarde:U.sauvegarde()}),p3=E.page;
  await fournisseurs(p3);
  m=await p3.evaluate(MESURER);
  assert.ok(m.lignes>15&&m.cadre[1]>m.cadre[0]+20,'plus de quinze services : le tableau dépasse son cadre '+JSON.stringify([m.lignes,m.cadre]));
  assert.deepEqual(m.zones,['fo-cadre page-zone'],'il défile dans son cadre, et lui seul');
  assert.deepEqual([m.fenetre,m.vue,m.fiche[1]-m.fiche[0]],[0,0,0],'ni la fenêtre, ni la page, ni la colonne ne défilent');
  assert.deepEqual(m.petits,[]);
  const fige=await p3.evaluate(()=>{
    const c=document.querySelector('#mu-flux .fo-cadre'),haut=()=>Math.round(c.querySelector('thead th[data-fo-colonne]').getBoundingClientRect().top-c.getBoundingClientRect().top);
    const gauche=()=>Math.round(c.querySelector('tbody th').getBoundingClientRect().left-c.getBoundingClientRect().left);
    const avant=[haut(),gauche()];c.scrollTop=c.scrollHeight;const dernier=c.querySelector('tbody tr:last-child').getBoundingClientRect(),r=c.getBoundingClientRect();
    return {avant,apres:[haut(),gauche()],defile:c.scrollTop>20,dernierVu:dernier.bottom<=r.bottom+1&&dernier.top>=r.top};});
  // Au pixel d'arrondi près (la bordure du cadre).
  assert.ok(Math.abs(fige.apres[0]-fige.avant[0])<=2&&fige.avant[0]<=2,'la ligne des fournisseurs reste en haut du cadre : '+JSON.stringify(fige));
  assert.ok(Math.abs(fige.apres[1]-fige.avant[1])<=2&&fige.avant[1]<=2,'la colonne des services reste à gauche : '+JSON.stringify(fige));
  assert.deepEqual([fige.defile,fige.dernierVu],[true,true],'le dernier service se voit en défilant');
  // Coché plus bas, le tableau reste où il était.
  const dernierService=await p3.evaluate(()=>document.querySelector('#mu-flux .fo-table tbody tr:last-child').dataset.foService);
  const hautAvant=await p3.evaluate(()=>document.querySelector('#mu-flux .fo-cadre').scrollTop);
  await coche(p3,dernierService,'magasin').check();await attendre(p3);
  assert.equal(await p3.evaluate(()=>document.querySelector('#mu-flux .fo-cadre').scrollTop),hautAvant,'redessiné, le cadre garde sa place');
  await E.fermer();

  assert.deepEqual(erreurs,[],'aucune erreur dans les pages : '+erreurs.join(' | '));
  console.log('OK fournisseurs : l’entrée et le tableau « Qui se fournit où » ; une sauvegarde d’avant ne bouge pas ; cocher, décocher, « Partout », « Nulle part » ; la liste vaut pour la suite ; le code d’avant donne le même résultat ; la fiche, « Contrôles », un écran à 1 366 × 768');
 }finally{await browser.close();}

 /** Choisir un chemin qui n'a pas encore d'étape (son schéma est vide). */
 async function choisirCheminVide(page,nom){
  await page.locator(`${M} .ch-liste [data-mu-flux-choisir]`,{hasText:nom}).first().click();
  await page.waitForFunction(n=>{const p=Sim.unite.cheminChoisi();return !!p&&p.nom===n&&document.querySelector('#mu-flux .ch-fiche').dataset.chVue==='chemin';},nom);await page.waitForTimeout(200);
 }
})().catch(e=>{console.error(e);process.exit(1);});

/* Évolution 24 (b) — « Chemins » : le schéma sans les fournisseurs (version 1), sur l'unité fictive, aux deux tailles.
 *   1. L'entrée « Fournisseurs » est dans la liste de « Chemins » et ouvre le tableau « Qui se fournit où ».
 *   2. Le schéma ne dessine plus les fournisseurs ni leurs liens : il compte moins de cases et moins de liens que le
 *      dessin complet. Le compte d'un chemin distingue les deux : « n étapes · n fournisseurs ».
 *   3. Chaque étape cliente porte une pastille au nom de son fournisseur — le nom entier, jamais coupé (correction
 *      23 j ; voir tests/chemins-retouches-browser.cjs) ; une étape qui n'est cliente de personne n'en porte pas. Texte
 *      de 12 px au moins à l'écran, dans le dessin.
 *   4. Au-dessus du schéma (correction 23 j ; elle était dessous), une ligne qui se lit : « Fournisseurs de ce
 *      chemin : … », et « Régler les clients », qui ouvre l'entrée « Fournisseurs ». Rien ne se règle sur cette ligne.
 *      Texte de 13 px au moins.
 *   5. L'interrupteur « Montrer les fournisseurs sur le schéma », éteint par défaut, redonne le dessin complet : leurs
 *      liens s'y lisent (en pointillé), sans pastille. C'est une préférence d'affichage (`ory-ui-…`), hors de la
 *      sauvegarde, gardée d'une visite à l'autre.
 *   6. Aucun geste dans le schéma ne crée ni ne retire un lien de fournisseur : tirer un lien depuis un fournisseur,
 *      Suppr sur un de ses liens, la croix d'un lien choisi, ajouter une étape entre un client et son fournisseur,
 *      retirer une étape cliente — le geste sur un lien de fournisseur mène au tableau.
 *   7. La page ne fait défiler ni la fenêtre ni la vue, à 1 366 × 768 comme à 1 920 × 1 080.
 *   8. Sans fournisseurs.js (la page d'avant) : le schéma d'avant, entier, sans ligne ni pastille.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const M='#mu-flux',Z='#mu-flux [data-mu-graphe]',CLE='ory-ateliers-v1',PREF='ory-ui-chemins-fournisseurs';
const MODULE=/\/fournisseurs\.js(\?|$)/;

/** Ce que la page montre du chemin choisi, mesuré dans le navigateur. */
const MESURER=()=>{
  const svg=document.querySelector('#mu-flux .gr-svg'),k=svg.getBoundingClientRect().width/svg.viewBox.baseVal.width,cadre=svg.getBoundingClientRect();
  const P=MoteurProduction,p=Sim.unite.cheminChoisi(),vue=document.querySelector('#view-ateliers'),ligne=document.querySelector('#mu-flux .ch-fournis');
  const pastilles=[...svg.querySelectorAll('.ch-pastille')].map(g=>{const t=g.querySelector('text'),r=g.getBoundingClientRect();
    return {etape:g.closest('.gr-noeud').dataset.noeud,qui:g.dataset.chPastille,texte:t.textContent,survol:g.querySelector('title').textContent,px:Math.round(parseFloat(getComputedStyle(t).fontSize)*k*10)/10,
      dedans:r.left>=cadre.left-1&&r.right<=cadre.right+1&&r.top>=cadre.top-1&&r.bottom<=cadre.bottom+1};});
  const textes=[...svg.querySelectorAll('text')].filter(t=>t.getClientRects().length&&t.textContent.trim()).map(t=>parseFloat(getComputedStyle(t).fontSize)*k);
  return {noeuds:[...svg.querySelectorAll('.gr-noeud')].map(n=>n.dataset.noeud),liens:[...svg.querySelectorAll('.gr-lien')].map(l=>l.dataset.lien),
    pointilles:[...svg.querySelectorAll('.gr-lien.pointille')].map(l=>l.dataset.lien),pastilles,plusPetit:Math.round(Math.min(...textes)*10)/10,
    services:P.servicesDuParcours(p),arcs:P.arcsDuParcours(p).map(a=>a.from+'>'+a.to),
    compte:document.querySelector('#mu-flux .ch-compte').textContent.trim(),
    ligne:ligne?{dit:ligne.querySelector('.ch-fournis-dit').textContent.trim(),champs:ligne.querySelectorAll('input,select,textarea').length,
      boutons:[...ligne.querySelectorAll('button')].map(b=>b.textContent.trim()),
      px:Math.min(...[ligne,...ligne.querySelectorAll('*')].filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(e=>parseFloat(getComputedStyle(e).fontSize)))}:null,
    interrupteur:(()=>{const b=document.querySelector('#mu-flux [data-ch-fournisseurs]');return b?{role:b.getAttribute('role'),marche:b.getAttribute('aria-checked'),nom:b.textContent.trim()}:null;})(),
    fenetre:document.documentElement.scrollHeight-innerHeight,vue:vue.scrollHeight-vue.clientHeight};
};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 const ouvrir=async(largeur,hauteur,avant)=>{
  const ctx=await browser.newContext({viewport:{width:largeur,height:hauteur}});
  const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
  if(avant)await page.route(MODULE,r=>r.fulfill({status:200,contentType:'application/javascript',body:''}));
  const site=await F.charger(page,nav,URL_V1,{pageId:'mu-flux'});
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.unite);
  return {page,fermer:async()=>{site.effacer();await ctx.close();}};
 };
 try{
  for(const [largeur,hauteur] of [[1366,768],[1920,1080]]){
   const V=largeur+' × '+hauteur+' : ',{page,fermer}=await ouvrir(largeur,hauteur);
   const attendre=(ms=300)=>page.waitForTimeout(ms);
   const mesurer=()=>page.evaluate(MESURER);
   const choisir=async id=>{await page.locator(`${M} .ch-liste [data-mu-flux-choisir="${id}"]`).click();
     await page.waitForFunction(i=>document.querySelector('#mu-flux .ch-fiche').dataset.muFluxFiche===i&&!!document.querySelector('#mu-flux .gr-svg .gr-noeud'),id);await attendre(250);};
   const liens=id=>page.evaluate(id=>Sim.ateliers.state.parcours.find(p=>p.id===id).liens.map(l=>l.de+'>'+l.vers).sort(),id);
   const deFournisseurs=async id=>(await liens(id)).filter(l=>/^(appros|magasin)>/.test(l));
   const interrupteur=page.locator(`${M} [data-ch-fournisseurs]`);
   const vueFiche=()=>page.locator(`${M} .ch-fiche`).getAttribute('data-ch-vue');

   /* ---- 1 : l'entrée « Fournisseurs » ouvre le tableau ----------------------------------------------------------- */
   const entree=page.locator(`${M} .ch-liste [data-ch-panneau="fournisseurs"]`);
   assert.equal(await entree.locator('b').textContent(),'Fournisseurs',V+'l’entrée est dans la liste de « Chemins »');
   await entree.click();await attendre();
   assert.deepEqual([await vueFiche(),await page.locator(`${M} .ch-fiche h2`).textContent(),await page.locator(`${M} .fo-table`).count()],['fournisseurs','Qui se fournit où',1],V+'elle ouvre le tableau');
   await choisir('complet');

   /* ---- 2 et 3 : le schéma sans les fournisseurs ; les pastilles --------------------------------------------------- */
   assert.equal(await page.evaluate(k=>localStorage.getItem(k),PREF),null,V+'aucune préférence : l’interrupteur est éteint');
   const sans=await mesurer();
   assert.deepEqual(sans.interrupteur,{role:'switch',marche:'false',nom:'Montrer les fournisseurs sur le schéma'},V+'l’interrupteur, éteint par défaut');
   assert.deepEqual(sans.services.filter(s=>!sans.noeuds.includes(s)).sort(),['appros','magasin'],V+'le schéma ne dessine pas les fournisseurs');
   assert.deepEqual(sans.arcs.filter(a=>!sans.liens.includes(a)).sort(),['appros>decontam','magasin>prepa'],V+'ni leurs liens');
   assert.deepEqual(sans.pointilles,[]);
   assert.equal(sans.compte,'12 commandes · 8 étapes · 2 fournisseurs',V+'le compte distingue les étapes des fournisseurs');
   assert.match(await page.locator(`${M} .ch-liste [data-mu-flux-choisir="complet"] small`).textContent(),/^12 commandes · 8 étapes · 2 fournisseurs$/,V+'dans la liste aussi');
   // Chaque étape cliente porte sa pastille ; les autres n'en ont pas.
   assert.deepEqual(sans.pastilles.map(x=>[x.etape,x.qui,x.survol]).sort(),[['decontam','appros','Se fournit chez Réception / Appros'],['prepa','magasin','Se fournit chez Magasin']],V+'une pastille par étape cliente');
   assert.equal(sans.pastilles.find(x=>x.etape==='prepa').texte,'Magasin',V+'au nom du fournisseur');
   assert.equal(sans.pastilles.find(x=>x.etape==='decontam').texte,'Réception / Appros',V+'un nom plus long est écrit en entier, jamais coupé (correction 23 j)');
   assert.ok(sans.pastilles.every(x=>x.px>=12&&x.dedans),V+'12 px au moins à l’écran, dans le dessin : '+JSON.stringify(sans.pastilles));
   assert.ok(sans.plusPetit>=12,V+'aucun texte du schéma sous 12 px : '+sans.plusPetit);
   assert.deepEqual([sans.fenetre,sans.vue],[0,0],V+'ni la fenêtre ni la page ne défilent');

   /* ---- 4 : la ligne, au-dessus du schéma (correction 23 j) --------------------------------------------------------- */
   assert.equal(sans.ligne.dit,'Fournisseurs de ce chemin : Réception / Appros, Magasin',V+'la ligne les nomme');
   assert.deepEqual([sans.ligne.champs,sans.ligne.boutons],[0,['Régler les clients →','Montrer les fournisseurs sur le schéma']],V+'rien ne s’y règle : un lien, et l’interrupteur du dessin');
   assert.ok(sans.ligne.px>=13,V+'texte de 13 px au moins : '+sans.ligne.px);
   assert.equal(await page.evaluate(()=>{const g=document.querySelector('#mu-flux [data-mu-graphe]'),l=document.querySelector('#mu-flux .ch-fournis');return !!(g.compareDocumentPosition(l)&Node.DOCUMENT_POSITION_FOLLOWING);}),false,V+'au-dessus du schéma, plus dessous');
   await page.locator(`${M} .ch-fournis [data-fo-ouvrir]`).click();await attendre();
   assert.equal(await vueFiche(),'fournisseurs',V+'« Régler les clients » ouvre l’entrée « Fournisseurs »');
   // Un chemin sans fournisseur : la ligne le dit, le compte ne parle que d'étapes.
   await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.parcours.push({id:'nu',nom:'Chemin nu',type:true,noeuds:['dotation','quais'],liens:[{de:'dotation',vers:'quais'}]});},''));await attendre();
   await choisir('nu');
   const nu=await mesurer();
   assert.deepEqual([nu.compte,nu.ligne.dit,nu.pastilles.length],['0 commande · 2 étapes','Fournisseurs de ce chemin : aucun',0],V+'un chemin sans fournisseur');
   await page.locator('#btn-annuler').click();await attendre();
   await choisir('complet');

   /* ---- 5 : l'interrupteur ------------------------------------------------------------------------------------------ */
   const donneesAvant=await page.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!/^ory-ui-/.test(k))o[k]=localStorage.getItem(k);}return o;});
   await interrupteur.click();await attendre(400);
   const avec=await mesurer();
   assert.equal(avec.interrupteur.marche,'true');
   assert.deepEqual(avec.noeuds.slice().sort(),avec.services.slice().sort(),V+'le dessin complet : toutes les cases');
   assert.deepEqual(avec.liens.slice().sort(),avec.arcs.slice().sort(),V+'tous les liens');
   assert.ok(sans.liens.length<avec.liens.length&&sans.noeuds.length<avec.noeuds.length,V+'le schéma sans fournisseurs compte moins de liens ('+sans.liens.length+') que le complet ('+avec.liens.length+')');
   assert.deepEqual(avec.pointilles.slice().sort(),['appros>decontam','magasin>prepa'],V+'les liens des fournisseurs s’y lisent, en pointillé');
   assert.deepEqual(avec.pastilles,[],V+'leurs liens le disent : pas de pastille');
   assert.ok(avec.plusPetit>=12);assert.deepEqual([avec.fenetre,avec.vue],[0,0]);
   assert.equal(await page.evaluate(()=>document.activeElement.hasAttribute('data-ch-fournisseurs')),true,V+'le clavier reste sur l’interrupteur');
   // Une préférence d'affichage, hors de la sauvegarde ; gardée d'une visite à l'autre.
   assert.equal(await page.evaluate(k=>localStorage.getItem(k),PREF),'1');
   assert.deepEqual(await page.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!/^ory-ui-/.test(k))o[k]=localStorage.getItem(k);}return o;}),donneesAvant,V+'aucune donnée de la sauvegarde ne change');
   await page.reload();await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.unite);await attendre(500);
   await nav.aller(page,'mu-flux');await attendre();await choisir('complet');
   assert.equal((await mesurer()).interrupteur.marche,'true',V+'rechargée, la page garde le dessin complet');

   /* ---- 6 : aucun geste dans le schéma ne crée ni ne retire un lien de fournisseur ------------------------------- */
   const avantGestes=await deFournisseurs('complet'),tousAvant=await liens('complet');
   assert.deepEqual(avantGestes,['appros>decontam','magasin>prepa']);
   // a. Tirer un lien depuis un fournisseur : rien ne se crée, le geste mène au tableau.
   await page.locator(`${Z} .gr-port[data-port=magasin]`).click();await attendre(200);
   await page.locator(`${Z} [data-noeud=cuisine]`).click();await attendre(400);
   assert.deepEqual(await liens('complet'),tousAvant,V+'tirer un lien depuis un fournisseur ne crée rien');
   assert.equal(await vueFiche(),'fournisseurs',V+'le geste mène au tableau');
   await choisir('complet');
   // b. Suppr sur un lien de fournisseur : il reste ; le geste mène au tableau.
   await page.locator(`${Z} .gr-lien[data-lien="magasin>prepa"]`).focus();await page.keyboard.press('Delete');await attendre(400);
   assert.deepEqual(await liens('complet'),tousAvant,V+'Suppr ne retire pas un lien de fournisseur');
   assert.equal(await vueFiche(),'fournisseurs');
   await choisir('complet');
   // c. Le lien choisi (Entrée) : pas de « Retirer ce lien », un bouton vers le tableau ; sa croix n'y touche pas.
   await page.locator(`${Z} .gr-lien[data-lien="appros>decontam"]`).focus();await page.keyboard.press('Enter');await attendre(300);
   assert.deepEqual(await page.evaluate(()=>{const p=document.querySelector('#mu-flux .ch-lien');return [p.classList.contains('ch-lien-fournisseur'),p.querySelectorAll('[data-mu-flux-action="retirer-lien"]').length,p.querySelector('[data-fo-ouvrir]').textContent.trim()];}),
     [true,0,'Régler dans Fournisseurs →'],V+'un lien de fournisseur choisi ne propose pas de le retirer');
   const croix=page.locator(`${Z} .gr-lien[data-lien="appros>decontam"] .gr-retirer`);
   if(await croix.count()){await croix.click();await attendre(400);assert.deepEqual(await liens('complet'),tousAvant,V+'la croix du lien ne le retire pas');await choisir('complet');}
   // d. Le fournisseur choisi : ni « Relier à… » ni « Retirer du chemin ».
   await page.locator(`${Z} [data-noeud=magasin]`).click();await attendre(300);
   assert.deepEqual([await page.locator(`${M} .ch-etape [data-ch-relier]`).count(),await page.locator(`${M} .ch-etape [data-mu-flux-action=retirer-service]`).count(),await page.locator(`${M} .ch-etape [data-fo-ouvrir]`).count()],[0,0,1]);
   // e. Un fournisseur ne s'ajoute pas comme une étape.
   await choisir('sans-cuisine');
   assert.deepEqual((await page.locator(`${M} [data-mu-flux-ajout] option`).evaluateAll(os=>os.map(o=>o.value))).filter(v=>v==='appros'||v==='magasin'),[]);
   // f. Une étape ajoutée entre un client et son fournisseur ne prend pas le lien ; retirée, elle ne le rend à personne d'autre.
   const sansCuisine=await deFournisseurs('sans-cuisine');
   assert.deepEqual(sansCuisine,['appros>preparation','magasin>prepa']);
   await page.locator(`${M} [data-mu-flux-ajout]`).selectOption('cuisine');await attendre(500);
   assert.ok((await liens('sans-cuisine')).includes('cuisine>preparation'),V+'la cuisine entre à sa place, entre deux étapes');
   assert.deepEqual(await deFournisseurs('sans-cuisine'),sansCuisine,V+'ajouter une étape ne déplace aucun lien de fournisseur');
   await page.locator(`${Z} [data-noeud=cuisine]`).click();await attendre(300);
   await page.locator(`${M} .ch-etape [data-mu-flux-action=retirer-service]`).click();await attendre(500);
   assert.deepEqual(await deFournisseurs('sans-cuisine'),sansCuisine,V+'la retirer non plus');
   // g. Une étape cliente retirée : son fournisseur ne passe pas à celle qu'elle livrait ; sans client, il sort du chemin.
   await page.locator(`${Z} [data-noeud=preparation]`).click();await attendre(300);
   await page.locator(`${M} .ch-etape [data-mu-flux-action=retirer-service]`).click();await attendre(500);
   assert.deepEqual(await deFournisseurs('sans-cuisine'),['magasin>prepa'],V+'la prépa retirée : la réception ne fournit pas le montage à sa place');
   assert.equal(await page.evaluate(()=>Sim.ateliers.state.parcours.find(p=>p.id==='sans-cuisine').noeuds.includes('appros')),false,V+'sans client dans ce chemin, la réception en sort');
   assert.deepEqual(await deFournisseurs('complet'),avantGestes,V+'l’autre chemin n’a pas bougé');

   // Éteint de nouveau : la préférence s'en va, le schéma retrouve ses seules étapes.
   await choisir('complet');
   await interrupteur.click();await attendre(400);
   assert.equal(await page.evaluate(k=>localStorage.getItem(k),PREF),null);
   const eteint=await mesurer();
   assert.deepEqual([eteint.interrupteur.marche,eteint.noeuds.includes('magasin'),eteint.pastilles.length],['false',false,2]);
   await fermer();
  }

  /* ---- 8 : la page d'avant, sans le module ------------------------------------------------------------------------ */
  const {page,fermer}=await ouvrir(1366,768,true);
  await page.locator(`${M} .ch-liste [data-mu-flux-choisir="complet"]`).click();await page.waitForTimeout(500);
  const avant=await page.evaluate(MESURER);
  assert.deepEqual(avant.noeuds.slice().sort(),avant.services.slice().sort(),'la page d’avant dessine toutes les cases');
  assert.deepEqual(avant.liens.slice().sort(),avant.arcs.slice().sort(),'et tous les liens');
  assert.deepEqual([avant.pastilles.length,avant.ligne,avant.interrupteur,avant.compte],[0,null,null,'12 commandes · 10 étapes'],'ni pastille, ni ligne, ni interrupteur ; le compte d’avant');
  await fermer();

  assert.deepEqual(erreurs,[],'aucune erreur dans les pages : '+erreurs.join(' | '));
  console.log('OK chemins-fournisseurs : le schéma sans les fournisseurs (moins de cases, moins de liens), une pastille par étape cliente (le nom entier), la ligne au-dessus du schéma, l’interrupteur (préférence d’affichage), aucun geste du schéma ne touche un lien de fournisseur — aux deux tailles');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

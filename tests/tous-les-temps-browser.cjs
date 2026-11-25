/* Correction 23 (g) — le tableau de tous les temps par vol revient (version 1), sur l'unité fictive, à 1 366 × 768.
 *   1. Dans « Services et équipes », la liste de gauche a une entrée à part, au-dessus des services, sous « Pour toute
 *      l'unité » : « Tous les temps par vol ».
 *   2. Elle ouvre à droite le tableau d'avant (l'ancienne page « Temps par vol »), avec sa recherche par compagnie et sa
 *      légende ; annuler et rétablir sont ceux de la barre du haut, comme pour toute la page. L'import et l'export du
 *      classeur restent dans « Fichiers ».
 *   3. Il défile dans son cadre, en-têtes figés, sans faire défiler la fenêtre.
 *   4. C'est une seconde vue des mêmes champs que la section « Ses temps par vol » de chaque fiche : une valeur changée
 *      ici donne la même sauvegarde que la même valeur changée dans la fiche du service ; elle se lit là-bas, et l'inverse.
 *   5. « Aller à… » : « Temps par vol » ouvre cette entrée. En lecture seule, comme le reste de « Régler » : fermée.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const M='#mu-services',T=M+' .se-fiche[data-se-vue="temps"]';
/** Le service et la commande de l'essai : une cellule du tableau, et le même champ dans la fiche du service. */
const SERVICE='cuisine',COMMANDE='NORD/BC',VALEUR='0.75';

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 try{
  const ctx=await browser.newContext({viewport:{width:1366,height:768}});
  const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
  const attendre=(ms=400)=>page.waitForTimeout(ms);
  const sous=()=>page.evaluate(()=>document.body.dataset.sous);
  const site=await F.charger(page,nav,URL_V1,{pageId:'mu-services'});
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.unite&&Sim.reglages);
  await attendre();
  /** La sauvegarde des temps par vol : ce que le navigateur enregistre, et l'état en mémoire. */
  const sauvegarde=()=>page.evaluate(()=>({enregistre:localStorage.getItem('ory-modele-v1'),etat:JSON.stringify(Sim.reglages.etat),equipes:JSON.stringify(Sim.ateliers.state)}));
  const ouvrirEntree=async()=>{await nav.aller(page,'mu-services');await page.locator(M+' .se-liste [data-se-panneau="temps"]').click();await attendre();};

  /* ---- 1. l'entrée, à part, au-dessus des services ------------------------------------------------------------------ */
  const liste=await page.evaluate(sel=>[...document.querySelector(sel+' .se-liste').children].map(e=>e.matches('p.mu-groupe')?'« '+e.textContent.trim()+' »'
    :e.matches('[data-se-panneau="temps"]')?'ENTRÉE '+e.querySelector('b').textContent:e.matches('.se-ajout')?'AJOUTER':e.matches('[data-mu-choisir]')?'service':e.tagName).filter((x,i,l)=>x!=='service'||l[i-1]!=='service'),M);
  assert.deepEqual(liste.slice(0,5),['AJOUTER','« Pour toute l’unité »','ENTRÉE Tous les temps par vol','« Services »','service'],'« Ajouter un service », puis l’entrée à part, puis les services : '+liste);
  const entree=page.locator(M+' .se-liste [data-se-panneau="temps"]');
  assert.equal(await entree.getAttribute('aria-current'),'false');
  assert.equal(await page.locator('#rg-recap-panneau').count(),0,'tant qu’on ne l’ouvre pas, le tableau n’est pas dans la page');

  /* ---- 2. elle ouvre le tableau d'avant : recherche, légende, annuler, rétablir --------------------------------------- */
  await entree.click();await attendre();
  assert.deepEqual([await sous(),await page.evaluate(()=>Sim.unite.panneau),await page.locator(M+' .se-fiche').getAttribute('data-se-vue')],['mu-services','temps','temps']);
  assert.equal(await page.locator(M+' .se-liste [data-se-panneau="temps"]').getAttribute('aria-current'),'true');
  assert.equal(await page.locator(M+' .se-liste [data-mu-choisir].actif').count(),0,'aucun service n’est marqué comme choisi');
  assert.equal(await page.locator(T+' h3').first().innerText(),'Tous les temps par vol, d’un coup d’œil');
  for(const [sel,quoi] of [['#rg-recap-filtre','sa recherche par compagnie'],['.rg-recap-legende','sa légende'],['.rg-recap-table','le tableau'],['[data-rg-action="recap-vue"][data-vue="jour"]','« Sur la journée »']])
    assert.equal(await page.locator(T+' '+sel).isVisible(),true,quoi);
  // Annuler et rétablir : ceux de la barre du haut, comme pour toute la page (un seul Annuler / Rétablir, depuis la
  // refonte ; ceux du tableau restent dans la page, cachés). Rien à annuler pour l'instant.
  assert.deepEqual([await page.locator('#btn-annuler').isVisible(),await page.locator('#btn-retablir').isVisible(),await page.locator(T+' #rg-recap-undo').isVisible()],[true,true,false]);
  assert.equal(await page.locator(T+' #rg-recap-filtre').getAttribute('placeholder'),'Compagnie : AF, TX…');
  // Une colonne par service qui a des temps, un bloc par compagnie.
  const compagnies=await page.locator(T+' .rg-recap-bloc').evaluateAll(bs=>bs.map(b=>b.dataset.compagnie));
  assert.ok(compagnies.length>=4&&compagnies.includes('NORD'),'un bloc par compagnie : '+compagnies);
  // L'import et l'export du classeur restent dans « Fichiers » : ni l'un ni l'autre ici.
  assert.equal(await page.locator(M+' #rg-recap-export, '+M+' #rg-recap-import-btn, '+M+' #rg-recap-import').count(),0,'ni import ni export dans la page');
  assert.match(await page.locator(T).innerText(),/Importer ou exporter ce tableau : Fichiers →/);
  // La page le dit : c'est une seconde vue des champs des fiches.
  assert.match(await page.locator(T+' .se-temps-dit').innerText(),/^Une seconde vue des champs de « Ses temps par vol », dans la fiche de chaque service : une valeur changée ici se lit là-bas, et l’inverse\./);
  // La recherche par compagnie.
  await page.locator(T+' #rg-recap-filtre').fill('nord');await attendre(300);
  assert.deepEqual(await page.locator(T+' .rg-recap-bloc').evaluateAll(bs=>bs.map(b=>b.dataset.compagnie)),['NORD'],'la recherche garde la compagnie cherchée');
  await page.locator(T+' #rg-recap-filtre').fill('');await attendre(300);

  /* ---- 3. il défile dans son cadre, en-têtes figés, sans faire défiler la fenêtre ----------------------------------- */
  // Toutes les compagnies dépliées : le tableau dépasse son cadre.
  await page.locator(T+' [data-rg-action="recap-tout"][data-ouvrir="1"]').first().click();await attendre(300);
  const m=await page.evaluate(sel=>{const f=document.querySelector(sel),c=f.querySelector('.rg-recap-scroll'),vue=document.getElementById('view-ateliers');
    const avant={tete:c.querySelector('thead th').getBoundingClientRect().top,cadre:c.getBoundingClientRect().top};
    c.scrollTop=260;c.scrollLeft=120;
    const th=c.querySelector('thead th:nth-child(3)').getBoundingClientRect(),col=c.querySelector('tbody tr.rg-recap-classe th').getBoundingClientRect(),r=c.getBoundingClientRect();
    const t2=c.querySelector('thead tr.rg-recap-t2 th').getBoundingClientRect();
    return {ecran:[innerWidth,innerHeight],doc:document.documentElement.scrollHeight-innerHeight,vue:vue.scrollHeight-vue.clientHeight,fiche:[getComputedStyle(f).overflowY,f.scrollHeight-f.clientHeight],
      cadre:{defile:getComputedStyle(c).overflowY,depasse:c.scrollHeight-c.clientHeight,large:c.scrollWidth-c.clientWidth,haut:c.scrollTop,gauche:c.scrollLeft,bas:Math.round(r.bottom)},
      avant,tete:Math.round(th.top-r.top),seconde:Math.round(t2.top-th.bottom),colonne:Math.round(col.left-r.left),
      texte:Math.min(...[...f.querySelectorAll('*')].filter(e=>e.children.length===0&&e.textContent.trim()&&e.getBoundingClientRect().width>0).map(e=>parseFloat(getComputedStyle(e).fontSize)))};},T);
  assert.deepEqual(m.ecran,[1366,768]);
  assert.equal(m.doc,0,'la fenêtre ne défile pas');
  assert.ok(m.vue<=1,'la vue non plus ('+m.vue+' px)');
  assert.ok(m.fiche[1]<=1,'la fiche ne défile pas : c’est le cadre du tableau qui défile ('+JSON.stringify(m.fiche)+')');
  assert.equal(m.cadre.defile,'auto');
  assert.ok(m.cadre.depasse>200&&m.cadre.haut===260,'le tableau défile dans son cadre : '+JSON.stringify(m.cadre));
  assert.ok(m.cadre.bas<=768,'le cadre tient dans l’écran ('+m.cadre.bas+')');
  assert.ok(Math.abs(m.tete)<=2,'après un défilement, l’en-tête est toujours en haut du cadre ('+m.tete+' px)');
  assert.ok(Math.abs(m.seconde)<=2,'sa seconde rangée (« h/vol », « équipe », « durée ») reste sous la première, sans la recouvrir ('+m.seconde+' px)');
  if(m.cadre.gauche>0)assert.ok(Math.abs(m.colonne)<=2,'et la première colonne à gauche ('+m.colonne+' px)');
  assert.ok(m.texte>=13,'texte de 13 px au moins : '+m.texte);
  await page.evaluate(sel=>{const c=document.querySelector(sel+' .rg-recap-scroll');c.scrollTop=0;c.scrollLeft=0;},T);

  /* ---- 4. une seconde vue des mêmes champs que la fiche du service ---------------------------------------------------- */
  const depart=await sauvegarde();
  const cellule=page.locator(`${T} input[data-rg-champ="recap"][data-service="${SERVICE}"][data-classe="${COMMANDE}"]`);
  assert.equal(await cellule.count(),1,'la cellule de '+COMMANDE+' à la cuisine');
  const commune=await cellule.getAttribute('placeholder')||await cellule.inputValue();
  // a. La valeur changée dans le tableau.
  await cellule.fill(VALEUR);await cellule.press('Enter');await attendre(700);
  const parTableau=await sauvegarde();
  assert.notEqual(parTableau.enregistre,depart.enregistre,'la valeur est enregistrée');
  assert.equal(parTableau.equipes,depart.equipes,'les équipes et les chemins ne changent pas');
  assert.equal(await page.evaluate(([s,c])=>Sim.reglages.etat.bareme[s][c],[SERVICE,COMMANDE]),45,'gardée en minutes : 0,75 h = 45 min');
  // Le clavier reste dans le tableau, et le tableau à l'écran (la page ne s'est pas redessinée par-dessus).
  assert.deepEqual([await sous(),await page.evaluate(()=>Sim.unite.panneau),await page.evaluate(sel=>!!document.activeElement.closest(sel),T)],['mu-services','temps',true],'on reste dans le tableau');
  // Elle se lit dans la fiche du service, section « Ses temps par vol ».
  await page.evaluate(s=>Sim.unite.ouvrir(s),SERVICE);await attendre();
  await nav.section(page,'temps');
  const champFiche=page.locator(`${M} .se-fiche input[data-rg-champ="heures"][data-service="${SERVICE}"][data-cle="${COMMANDE}"]`);
  assert.equal(await champFiche.inputValue(),VALEUR,'une valeur changée dans le tableau se lit dans la fiche du service');
  // b. « Annuler », devant le tableau : la sauvegarde du départ.
  await ouvrirEntree();
  assert.equal(await page.locator('#btn-annuler').isEnabled(),true,'« Annuler » s’offre après une valeur changée');
  await page.locator('#btn-annuler').click();await attendre(700);
  assert.deepEqual(await sauvegarde(),depart,'« Annuler » rend la sauvegarde du départ');
  // c. La même valeur, changée dans la fiche du service — dans sa grille « par compagnie et par classe », celle que le
  //    tableau montre d'un coup pour tous les services : la même sauvegarde.
  await page.evaluate(s=>Sim.unite.ouvrir(s),SERVICE);await attendre();
  await nav.section(page,'temps');
  await page.locator(`${M} .se-fiche [data-rg-action="mode"][data-mode="compagnie"][data-service="${SERVICE}"]`).click();await attendre(600);
  const neuf=page.locator(`${M} .se-fiche input[data-rg-champ="heures"][data-service="${SERVICE}"][data-cle="${COMMANDE}"]`);
  await neuf.fill(VALEUR);await neuf.press('Enter');await attendre(700);
  const parFiche=await sauvegarde();
  assert.equal(parFiche.enregistre,parTableau.enregistre,'la même valeur changée dans la fiche donne la même sauvegarde que dans le tableau');
  assert.equal(parFiche.etat,parTableau.etat);
  // … et elle se lit dans le tableau : l'inverse.
  await ouvrirEntree();
  assert.equal(await cellule.inputValue(),VALEUR,'une valeur changée dans la fiche se lit dans le tableau');
  assert.ok(await cellule.evaluate(i=>i.closest('td').classList.contains('propre')),'en valeur propre');
  // Vidée dans le tableau, elle reprend la valeur de toutes les compagnies ; « Rétablir » après « Annuler ».
  await cellule.fill('');await cellule.press('Enter');await attendre(700);
  assert.equal(await page.evaluate(([s,c])=>c in Sim.reglages.etat.bareme[s],[SERVICE,COMMANDE]),false,'vidée : la valeur propre disparaît');
  assert.equal(await cellule.getAttribute('placeholder')||await cellule.inputValue(),commune);
  await page.locator('#btn-annuler').click();await attendre(600);
  assert.equal(await cellule.inputValue(),VALEUR,'« Annuler »');
  assert.equal(await page.locator('#btn-retablir').isEnabled(),true);
  await page.locator('#btn-retablir').click();await attendre(600);
  assert.equal(await page.evaluate(([s,c])=>c in Sim.reglages.etat.bareme[s],[SERVICE,COMMANDE]),false,'« Rétablir »');
  // Un service de la liste rouvre sa fiche ; le tableau quitte la page, et y revient tel quel.
  await page.locator(`${M} .se-liste [data-mu-choisir="${SERVICE}"]`).click();await attendre();
  assert.deepEqual([await page.evaluate(()=>Sim.unite.panneau),await page.locator(M+' .se-fiche').getAttribute('data-se-vue'),await page.locator('#rg-recap-panneau').count()],[null,'service',0]);
  await ouvrirEntree();
  assert.equal(await page.locator(T+' .rg-recap-table').isVisible(),true);

  /* ---- 5. « Aller à… » : « Temps par vol » ouvre cette entrée ; la lecture seule la ferme ------------------------------ */
  await nav.aller(page,'j-chiffres');await attendre();
  await page.keyboard.press('Control+k');await page.waitForSelector('dialog.palette [role=option]');
  await page.keyboard.type('Temps par vol');await attendre(250);
  await page.locator('dialog.palette [role=option]').filter({hasText:/^Temps par vol(?! par service)/}).first().click();await attendre(500);
  assert.deepEqual([await sous(),await page.evaluate(()=>Sim.unite.panneau),await page.locator(M+' .se-fiche').getAttribute('data-se-vue')],['mu-services','temps','temps'],'« Temps par vol » ouvre « Tous les temps par vol »');
  assert.equal(await page.locator(T+' .rg-recap-table').isVisible(),true);
  // « Temps par vol par service » mène toujours à la section d'une fiche.
  await page.evaluate(()=>Sim.onglets.choisir('rg-minutes'));await attendre(500);
  assert.deepEqual([await sous(),await page.evaluate(()=>Sim.unite.panneau),await page.locator(M+' details[data-mu-section=temps][open]').count()],['mu-services',null,1]);
  // En lecture seule, comme le reste de « Régler » : la page ne s'ouvre pas.
  await nav.aller(page,'j-chiffres');await attendre();
  await page.locator('#btn-lecture-seule').click();await attendre(500);
  await page.evaluate(()=>Sim.onglets.choisir('rg-recap'));await attendre(300);
  assert.equal(await sous(),'j-chiffres','en lecture seule, « Temps par vol » ne s’ouvre pas');
  await page.locator('#btn-lecture-seule').click();await attendre(400);

  assert.deepEqual(erreurs,[],'aucune erreur de page : '+erreurs.join(' | '));
  await site.effacer();
  console.log('OK tous-les-temps : l’entrée « Tous les temps par vol », à part, au-dessus des services ; le tableau d’avant, sa recherche, sa légende, annuler et rétablir ; il défile dans son cadre, en-têtes figés, sans faire défiler la fenêtre ; une valeur changée dans le tableau donne la même sauvegarde que dans la fiche du service, et se lit des deux côtés ; « Aller à… » y mène ; fermée en lecture seule');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

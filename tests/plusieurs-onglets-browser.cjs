/* Banc d'essai, correction 14 (a) — plusieurs onglets ne s'écrasent plus
 * (stockage.js ; docs/BANC_ESSAI.md § 11). Deux onglets du même site (deux
 * pages du même navigateur) :
 *   1. ouvrir un second onglet, changer de thème : aucun bandeau ;
 *   2. une modification en A : B montre le bandeau tout de suite ; des
 *      modifications en B, resté sur l'ancien état (équipes, plan, liens,
 *      barème) : B n'écrit rien ; après « Recharger », B voit la modification
 *      de A ; sans l'événement (un onglet en veille), B relit la révision
 *      avant d'écrire, et n'écrit rien non plus ;
 *   3. une restauration en A : B montre le bandeau sans attendre, et refuse
 *      de restaurer à son tour tant qu'il n'est pas rechargé ; un autre
 *      onglet qui écrit pendant la question fait refuser la restauration ;
 *   4. la version 2 ouverte à côté écrit dans son tiroir : aucun bandeau ;
 *      la page de secours, elle, augmente la révision quand elle écrit ;
 *   5. un seul onglet : les données écrites sont celles d'avant, champ par
 *      champ (le même parcours sans le garde), plus le numéro de révision.
 * Équipes et noms fictifs. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const URL_V2=pathToFileURL(path.resolve(__dirname,'../v2/index.html')).href;
const TEXTE='Les données ont changé dans un autre onglet. Vos dernières modifications ici ne sont pas enregistrées.';
const BANDEAU='.donnees-changees';
// Les équipes enregistrées, telles qu'un autre onglet les lirait.
const EQUIPES=()=>JSON.parse(localStorage.getItem('ory-ateliers-v1')||'{"ateliers":[]}').ateliers.map(a=>a.nom);
// Les données du site et leur révision, sans les préférences d'affichage (que chaque onglet écrit pour lui).
const DONNEES=()=>{const out={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);
  if(/^(ory|orly)-/.test(k)&&!/^(ory-menu-pages(-vues)?|ory-service-ouvert|ory-graphes-sens|ory-demarrage-en-cours|ory-ui-.*)$/.test(k))out[k]=localStorage.getItem(k);}return out;};
// Des modifications dans les autres modules qui enregistrent : le plan, les liens, le barème.
const AUTRES=()=>{Sim.editor.change(()=>{Sim.editor.state.zones.find(z=>z.id==='cuisine').x+=40;},'');
  Sim.flows.change(()=>{Sim.flows.state.flows[0].enabled=!Sim.flows.state.flows[0].enabled;},'');
  Sim.reglages.changer(()=>{const b=Sim.reglages.etat.bareme;b.cuisine={...(b.cuisine||{}),'*/BC':33};},'');};
// Toutes les clés du navigateur.
const CLES=()=>{const out={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);out[k]=localStorage.getItem(k);}return out;};

/** Une équipe de plus, par la page, nommée `nom`. */
async function nouvelleEquipe(page,nom){
  await nav.vue(page,'ateliers');await nav.aller(page,'at-equipes');
  await page.locator('#at-new').click();await page.waitForTimeout(150);
  const at=await page.evaluate(()=>Sim.ateliers.state.ateliers.at(-1).id);
  await page.selectOption(`[data-at="${at}"] [data-at-champ=service]`,'cuisine');await page.waitForTimeout(150);
  await page.fill(`[data-at="${at}"] [data-at-champ=nom]`,nom);
  await page.dispatchEvent(`[data-at="${at}"] [data-at-champ=nom]`,'change');await page.waitForTimeout(150);
}
/** Le même parcours, geste par geste, dans chaque module qui enregistre : équipes, plan, liens, barème. */
const PARCOURS=()=>{
  const t=(id,nom,service,debut,personnes,lots)=>({id,nom,service,type:'manuel',debut,jour:0,personnes,pauses:[],lots,regime:{actif:true}});
  Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push(t('cu','Cuisine essai','cuisine','03:00',4,[['AF/BC','AF/PC']]),t('pr','Prépa essai','preparation','04:00',3,[['AF/BC']]));},'');
  Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id==='pr').personnes=5;},'');
  Sim.editor.change(()=>{Sim.editor.state.zones.find(z=>z.id==='cuisine').x+=40;},'');
  Sim.flows.change(()=>{Sim.flows.state.flows[0].enabled=false;},'');
  Sim.reglages.changer(()=>{const b=Sim.reglages.etat.bareme;b.cuisine={...(b.cuisine||{}),'*/BC':41.5};},'');
  // Les mêmes valeurs, réécrites : rien ne change.
  Sim.ateliers.enregistrer();Sim.reglages.enregistrer();
};

// Un navigateur par scénario : lancé en un seul processus (CHROMIUM_EXECUTABLE_PATH), il ne tient qu'un contexte.
const lancer=()=>chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
const lances=[];
async function contexte(){const b=await lancer();lances.push(b);return b.newContext({viewport:{width:1440,height:900},acceptDownloads:true});}

(async()=>{
 const errors=[];
 const ouvrir=async(ctx,url=URL_V1)=>{const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await p.waitForTimeout(400);return p;};
 const bandeaux=p=>p.locator(BANDEAU).count();
 try{
  // 1–2. Deux onglets : A modifie, B resté sur l'ancien état.
  const ctx=await contexte();
  const A=await ouvrir(ctx);
  await A.evaluate(()=>localStorage.clear());await A.reload();await A.waitForTimeout(400);
  await nav.effectifSaisi(A);await nouvelleEquipe(A,'Équipe de départ');
  const B=await ouvrir(ctx);
  assert.deepEqual(await B.evaluate(()=>Sim.ateliers.state.ateliers.map(a=>a.nom)),['Équipe de départ'],'B lit l’état enregistré');
  await A.locator('#btn-theme').click();await A.waitForTimeout(300);
  assert.deepEqual([await bandeaux(A),await bandeaux(B)],[0,0],'ouvrir un second onglet, changer de thème : aucun bandeau');

  await nouvelleEquipe(A,'Équipe A');
  await B.waitForSelector(BANDEAU,{timeout:3000});
  assert.equal(await B.locator(BANDEAU+' p').textContent(),TEXTE,'B le dit tout de suite, avant toute modification');
  assert.deepEqual(await B.locator(BANDEAU+' button').allTextContents(),['Recharger'],'un seul bouton, pas de fermeture');
  assert.equal(await B.locator(BANDEAU).getAttribute('role'),'alert');
  assert.equal(await bandeaux(A),0,'A, lui, est à jour');

  const deA=await A.evaluate(EQUIPES),donneesDeA=await A.evaluate(DONNEES);
  assert.deepEqual(deA,['Équipe de départ','Équipe A']);
  await nav.effectifSaisi(B);await nouvelleEquipe(B,'Équipe B');await B.evaluate(AUTRES);
  assert.deepEqual(await B.evaluate(()=>Sim.ateliers.state.ateliers.map(a=>a.nom)),['Équipe de départ','Équipe B'],'B travaille sur son état ancien…');
  assert.equal(await B.evaluate(()=>Sim.reglages.etat.bareme.cuisine['*/BC']),33);
  assert.deepEqual(await B.evaluate(EQUIPES),deA,'… mais n’écrit rien : la modification de A reste');
  assert.deepEqual(await B.evaluate(DONNEES),donneesDeA,'ni le plan, ni les liens, ni le barème, ni la révision');
  assert.equal(await bandeaux(B),1,'le bandeau reste, une seule fois');
  // A continue d'enregistrer.
  await A.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.at(-1).personnes=6;},''));
  assert.equal(await A.evaluate(()=>JSON.parse(localStorage.getItem('ory-ateliers-v1')).ateliers.at(-1).personnes),6);

  const recharge=B.waitForEvent('load');await B.locator(BANDEAU+' button').click();await recharge;await B.waitForTimeout(400);
  assert.equal(await bandeaux(B),0,'rechargé, B est à jour');
  assert.deepEqual(await B.evaluate(()=>Sim.ateliers.state.ateliers.map(a=>[a.nom,a.personnes]).at(-1)),['Équipe A',6],'B voit les modifications de A');
  assert.deepEqual(await B.evaluate(()=>Sim.ateliers.state.ateliers.map(a=>a.nom)),['Équipe de départ','Équipe A']);
  await nouvelleEquipe(B,'Équipe B');
  assert.deepEqual(await A.evaluate(EQUIPES),['Équipe de départ','Équipe A','Équipe B'],'et B enregistre à nouveau');
  await A.waitForSelector(BANDEAU,{timeout:3000});

  // 2 bis. Sans l'événement : B ne l'entend pas (un onglet en veille ne le reçoit pas), rechargé sans écouter
  //        `storage`. A, rechargé, écrit ; B n'en sait rien, puis relit la révision avant d'écrire : il n'écrit
  //        rien et montre le bandeau.
  const rechargeA0=A.waitForEvent('load');await A.locator(BANDEAU+' button').click();await rechargeA0;await A.waitForTimeout(400);
  await B.addInitScript(()=>{const ecouter=window.addEventListener;window.addEventListener=function(type,...x){if(type!=='storage')return ecouter.call(this,type,...x);};});
  await B.reload();await B.waitForTimeout(400);
  await nouvelleEquipe(A,'Équipe A2');await B.waitForTimeout(300);
  assert.equal(await bandeaux(B),0,'B n’a pas reçu l’événement');
  const donneesDeA2=await A.evaluate(DONNEES);
  await B.evaluate(AUTRES);
  assert.deepEqual(await B.evaluate(DONNEES),donneesDeA2,'B n’a rien écrit : la révision enregistrée n’était plus celle qu’il avait lue');
  assert.equal(await B.locator(BANDEAU+' p').textContent(),TEXTE);

  // 3. Une restauration en A : B le montre sans attendre.
  const ctx2=await contexte();
  const A2=await ouvrir(ctx2);
  await A2.evaluate(()=>localStorage.clear());await A2.reload();await A2.waitForTimeout(400);
  await nav.effectifSaisi(A2);await nouvelleEquipe(A2,'Équipe sauvegardée');
  await nav.aller(A2,'u-sauvegarde');
  const dl=A2.waitForEvent('download');await A2.locator('#sauvegarde-export').click();
  const sauvegarde=JSON.parse(fs.readFileSync(await (await dl).path(),'utf8'));
  sauvegarde.contenu['ory-ateliers-v1'].ateliers[0].nom='Équipe restaurée';
  await nouvelleEquipe(A2,'Équipe d’après');
  const B2=await ouvrir(ctx2);
  await nav.aller(B2,'u-sauvegarde');
  assert.equal(await bandeaux(B2),0);
  await nav.aller(A2,'u-sauvegarde');
  await A2.locator('#sauvegarde-import').setInputFiles({name:'ory-sauvegarde.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(sauvegarde))});
  const question=A2.locator('dialog.question[open]');
  await question.waitFor({state:'visible',timeout:3000});
  assert.match(await question.textContent(),/Les autres onglets ouverts du site devront être rechargés\./,'Restaurer avertit');
  const rechargeA=A2.waitForEvent('load');await nav.repondre(A2);await rechargeA;
  await B2.waitForSelector(BANDEAU,{timeout:3000});
  assert.equal(await B2.locator(BANDEAU+' p').textContent(),TEXTE,'B montre le bandeau sans attendre');
  assert.deepEqual(await B2.evaluate(EQUIPES),['Équipe restaurée']);
  // B, en retard, ne restaure pas à son tour : il le dit, sans rien remplacer ni recharger.
  const ancienne={...sauvegarde,contenu:{...sauvegarde.contenu,'ory-ateliers-v1':{...sauvegarde.contenu['ory-ateliers-v1'],ateliers:[{...sauvegarde.contenu['ory-ateliers-v1'].ateliers[0],nom:'Équipe de B'}]}}};
  await B2.locator('#sauvegarde-import').setInputFiles({name:'ory-sauvegarde.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(ancienne))});
  await B2.waitForFunction(()=>document.getElementById('sauvegarde-etat').classList.contains('error'));
  assert.equal(await B2.locator('#sauvegarde-etat').textContent(),
    'Restauration refusée : les données ont changé dans un autre onglet. Rechargez cette page, puis restaurez. Rien n’a été remplacé.');
  assert.equal(await B2.locator('dialog.question[open]').count(),0,'sans question');
  assert.deepEqual(await B2.evaluate(EQUIPES),['Équipe restaurée']);
  const rechargeB=B2.waitForEvent('load');await B2.locator(BANDEAU+' button').click();await rechargeB;await B2.waitForTimeout(400);
  assert.deepEqual(await B2.evaluate(()=>Sim.ateliers.state.ateliers.map(a=>a.nom)),['Équipe restaurée'],'rechargé, B voit la sauvegarde restaurée');

  // 4. La version 2, ouverte à côté, copie la v1 puis écrit dans son tiroir : les onglets de la v1 n'en disent rien.
  const C=await ouvrir(ctx2,URL_V2);
  await C.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers[0].nom='Équipe de la v2';},''));
  await A2.waitForTimeout(400);
  assert.deepEqual([await bandeaux(A2),await bandeaux(B2)],[0,0],'la v2 n’est pas un autre onglet de la v1');
  assert.deepEqual(await A2.evaluate(EQUIPES),['Équipe restaurée']);

  // 3 bis. B restaure ; pendant la question, A écrit : la réponse « oui » ne restaure rien, ne recharge pas, et le dit.
  await nav.aller(B2,'u-sauvegarde');
  await B2.locator('#sauvegarde-import').setInputFiles({name:'ory-sauvegarde.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(ancienne))});
  await B2.locator('dialog.question[open]').waitFor({state:'visible',timeout:3000});
  await A2.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers[0].personnes=7;},''));
  await nav.repondre(B2);
  await B2.waitForFunction(()=>document.getElementById('sauvegarde-etat').classList.contains('error'));
  assert.match(await B2.locator('#sauvegarde-etat').textContent(),/^Restauration refusée : les données ont changé dans un autre onglet\./);
  assert.deepEqual(await A2.evaluate(()=>JSON.parse(localStorage.getItem('ory-ateliers-v1')).ateliers.map(a=>[a.nom,a.personnes])),[['Équipe restaurée',7]]);

  // 4 bis. La page de secours ne liste pas la révision, et l'augmente quand elle écrit : les onglets ouverts le savent.
  const avantSecours=Number(await A2.evaluate(()=>localStorage.getItem('ory-revision')));
  const S=await ouvrir(ctx2,pathToFileURL(path.resolve(__dirname,'../secours.html')).href);
  assert.equal((await S.locator('#liste tbody td:first-child').allTextContents()).includes('ory-revision'),false);
  await S.locator('#cote-cases').click();await S.waitForURL(/index\.html\?continuer=1/);
  await A2.waitForSelector(BANDEAU,{timeout:3000});
  assert.ok(Number(await A2.evaluate(()=>localStorage.getItem('ory-revision')))>avantSecours,'la révision a augmenté');

  // 5. Un seul onglet : le même parcours, avec et sans le garde (posé ou non par stockage.js).
  const parcours=async sansGarde=>{
    const c=await contexte();
    if(sansGarde)await c.addInitScript(()=>{Object.defineProperty(window,'localStorage',{value:window.localStorage,writable:false,configurable:false});});
    const p=await ouvrir(c);
    await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(400);
    assert.equal(await p.evaluate(()=>OrlyStockage.installe),!sansGarde);
    await p.evaluate(PARCOURS);await p.reload();await p.waitForTimeout(400);
    await nav.vue(p,'ateliers');await nav.vue(p,'plan');
    return {cles:await p.evaluate(CLES),bandeaux:await bandeaux(p)};
  };
  const avec=await parcours(false),sans=await parcours(true);
  const {'ory-revision':revision,...donnees}=avec.cles;
  assert.match(revision,/^[1-9]\d*$/,'le numéro de révision');
  assert.equal('ory-revision' in sans.cles,false);
  assert.deepEqual(Object.keys(donnees).sort(),Object.keys(sans.cles).sort(),'les mêmes clés');
  for(const k of Object.keys(sans.cles))assert.equal(donnees[k],sans.cles[k],'« '+k+' », champ par champ');
  assert.ok(['ory-ateliers-v1','orly-plan-v3','orly-flows-v1','ory-modele-v1'].every(k=>k in donnees),'chaque module a enregistré');
  assert.deepEqual([avec.bandeaux,sans.bandeaux],[0,0]);

  assert.deepEqual(errors,[]);
  console.log('Plusieurs onglets browser passed: second tab and theme without banner, stale tab banner at once and no write, reload, restore warning and banner, stale restore refused, v2 drawer ignored, one tab identical field by field.');
 }finally{for(const b of lances)await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

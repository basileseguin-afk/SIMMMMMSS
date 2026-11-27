/* Ajouter une compagnie, ou les classes qui lui manquent (retour d'usage :
 * « je ne peux plus rajouter de compagnie ni de compagnie × classe : on n'a
 * qu'une partie des compagnies »). Depuis « Commandes » (évolution 26 c),
 * plusieurs classes d'un coup ; et dans les tableaux par compagnie du handling
 * et de la plonge, une compagnie absente des vols. Noms fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 const classes=()=>page.evaluate(()=>Sim.ateliers.classes.map(c=>c.id));
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();

  // 1. « Commandes » (évolution 26 c) : une nouvelle compagnie, trois classes d'un coup, à partir de zéro.
  await nav.aller(page,'mu-commandes');await attendre();
  await page.locator('#mu-commandes [data-co-action=ouvrir-ajout]').click();await attendre();
  const form=page.locator('#mu-commandes .co-panneau[data-co-panneau=ajout]');
  assert.equal(await form.count(),1,'le panneau s’ouvre à côté de la liste');
  await form.locator('[data-co-champ=nom]').fill('neuve');
  for(const c of ['BC','CREW'])await form.locator(`[data-co-champ=cabine][value=${c}]`).check();
  await form.locator('[data-co-champ=mode][value=zero]').check();
  await form.locator('[data-co-action=valider]').click();await attendre();
  const apres=await classes();
  for(const id of ['NEUVE/BC','NEUVE/YC','NEUVE/CREW'])assert.ok(apres.includes(id),id+' ajoutée');
  assert.match((await page.locator('.notifs .notif').last().textContent()).replace(/\s+/g,' '),/NEUVE ajoutée : 3 commandes, à partir de zéro\./);
  // NEUVE suit le chemin de sa classe, comme les autres : elle est parmi ses commandes, et dans le tableau de ses étapes.
  await nav.aller(page,'mu-flux');
  const chemin=await page.evaluate(()=>OrlyParcours.fluxDe(Sim.ateliers.state,'NEUVE/BC').id);
  await page.locator(`#mu-flux .ch-liste [data-mu-flux-choisir="${chemin}"]`).click();await attendre();await nav.sectionChemin(page,'suivi');
  assert.equal(await page.locator('#mu-flux [data-mu-cmd-chemin="NEUVE/BC"]').count(),1,'NEUVE apparaît parmi les commandes du chemin');
  await page.locator('#mu-flux [data-mu-graphe] [data-noeud]').first().click();await attendre();
  assert.equal(await page.locator('#mu-flux .ch-table tr[data-ch-cmd="NEUVE/BC"]').count(),1,'et dans le tableau de l’étape');

  // 2. Une compagnie déjà là : son panneau, la classe qui lui manque cochée ; elle seule est ajoutée.
  await nav.aller(page,'mu-commandes');await attendre();
  const cie=await page.evaluate(()=>Sim.ateliers.classes.find(c=>c.origine==='programme').cie);
  const manque=await page.evaluate(cie=>['BC','PC','YC','CREW','SPML'].find(k=>!Sim.ateliers.classes.some(c=>c.id===cie+'/'+k)),cie);
  await page.locator(`#mu-commandes [data-co-ouvrir="${cie}"]`).click();await attendre();
  const avant=(await classes()).length;
  if(manque){await page.locator(`#mu-commandes .co-panneau [data-co-classe=${manque}]`).check();await attendre();}
  const n=(await classes()).length;
  assert.equal(n,avant+(manque?1:0),'seule la classe qui manquait est ajoutée');
  if(manque)assert.match(await page.locator('.notifs .notif').last().textContent(),/ajoutée\./);

  // 3. Le tableau par compagnie du handling : une compagnie absente des vols s'y ajoute.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'ha',nom:'Handling',service:'handling',type:'handling',debut:'04:00',jour:0,
    personnes:0,pauses:[],lots:[],regime:{actif:true},durees:{'*':30},simultanes:1,avance:180,compagnies:[]});},''));
  await nav.reglagesEquipe(page,'ha');await attendre();
  assert.equal(await page.locator('[data-at="ha"] [data-at-champ=duree][data-cie=NEUVE]').count(),1,'NEUVE, ajoutée, a déjà sa ligne');
  await page.locator('[data-at="ha"] [data-at-champ=cie-nouvelle]').fill('loin');
  await page.locator('[data-at="ha"] [data-at-champ=cie-nouvelle]').dispatchEvent('change');await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.id==='ha').durees.LOIN),30);
  assert.equal(await page.locator('[data-at="ha"] select[data-at-champ=categorie][data-cie=LOIN]').count(),1,'LOIN a sa ligne, long ou court');

  // 4. La liste des commandes de « Détails » mène à « Commandes » (évolution 26 c).
  await nav.aller(page,'at-repas');
  await page.locator('#at-classes .at-vers-commandes').click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-commandes');

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('ajout-cie-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

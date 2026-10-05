/* Ajouter une compagnie, ou les classes qui lui manquent (retour d'usage :
 * « je ne peux plus rajouter de compagnie ni de compagnie × classe : on n'a
 * qu'une partie des compagnies »). Depuis la liste des commandes des chemins,
 * plusieurs classes d'un coup ; et dans les tableaux par compagnie du handling
 * et de la plonge, une compagnie absente des vols. */
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

  // 1. Chemins › Chemin d’une commande : le bouton est dans la liste des commandes.
  await nav.aller(page,'at-chemins');
  const liste=page.locator('.pc-cmds');
  await liste.locator('[data-at-action=classe-nouvelle]').click();await attendre();
  const form=liste.locator('.at-ajout[data-lieu=chemins]');
  assert.equal(await form.count(),1,'le formulaire s’ouvre dans la liste');
  // Une nouvelle compagnie, trois classes d'un coup.
  await form.locator('[data-ajout=cie]').fill('ezy');
  for(const c of ['BC','CREW'])await form.locator(`[data-ajout-cab=${c}]`).check();
  await form.locator('[data-at-action=classe-valider]').click();await attendre();
  const apres=await classes();
  for(const id of ['EZY/BC','EZY/YC','EZY/CREW'])assert.ok(apres.includes(id),id+' ajoutée');
  assert.match(await page.locator('#at-status').textContent(),/EZY : Business, Économie, Équipage ajoutées/);
  assert.equal(await liste.locator('.pc-cie[data-cie=EZY]').count(),1,'EZY apparaît dans la liste des commandes');
  // Elle a son chemin à créer, comme les autres.
  await liste.locator('[data-pc-action=cmd][data-classe="EZY/BC"]').click();await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.parcours.cmd),'EZY/BC');

  // 2. Une compagnie déjà là : on lui ajoute la classe qui manque, pas de doublon.
  const cie=await page.evaluate(()=>Sim.ateliers.classes.find(c=>c.origine==='programme').cie);
  const manque=await page.evaluate(cie=>['BC','PC','YC','CREW','SPML'].find(k=>!Sim.ateliers.classes.some(c=>c.id===cie+'/'+k)),cie);
  await liste.locator('[data-at-action=classe-nouvelle]').click();await attendre();
  await form.locator('[data-ajout=cie]').fill(cie);
  if(manque)await form.locator(`[data-ajout-cab=${manque}]`).check();
  const avant=(await classes()).length;
  await form.locator('[data-at-action=classe-valider]').click();await attendre();
  const n=(await classes()).length;
  assert.equal(n,avant+(manque?1:0),'seule la classe qui manquait est ajoutée');
  assert.match(await page.locator('#at-status').textContent(),/déjà/,'celles qui existaient sont dites');

  // 3. Le tableau par compagnie du handling : une compagnie absente des vols s'y ajoute.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'ha',nom:'Handling',service:'handling',type:'handling',debut:'04:00',jour:0,
    personnes:0,pauses:[],lots:[],regime:{actif:true},durees:{'*':30},simultanes:1,avance:180,compagnies:[]});},''));
  await nav.aller(page,'at-equipes');
  await page.evaluate(()=>{Sim.ateliers.ouvert='ha';Sim.ateliers.aDessiner.add('at-equipes');Sim.ateliers.rendre();});await attendre();
  assert.equal(await page.locator('[data-at="ha"] [data-at-champ=duree][data-cie=EZY]').count(),1,'EZY, ajoutée, a déjà sa ligne');
  await page.locator('[data-at="ha"] [data-at-champ=cie-nouvelle]').fill('vy');
  await page.locator('[data-at="ha"] [data-at-champ=cie-nouvelle]').dispatchEvent('change');await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.id==='ha').durees.VY),30);
  assert.equal(await page.locator('[data-at="ha"] select[data-at-champ=categorie][data-cie=VY]').count(),1,'VY a sa ligne, long ou court');

  // 4. La page des commandes (Résultats) garde le même geste.
  await nav.aller(page,'at-repas');
  await page.locator('#at-classes [data-at-action=classe-nouvelle]').click();await attendre();
  assert.equal(await page.locator('.at-ajout[data-lieu=commandes] [data-ajout-cab]').count(),5);

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('ajout-cie-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

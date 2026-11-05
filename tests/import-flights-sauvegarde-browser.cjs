/* Banc d'essai, évolution 13 (b) — les règles d'import Winrest dans « Tout
 * sauvegarder » et « Restaurer » : l'aller-retour identique ; une sauvegarde
 * d'avant (sans la clé) qui rend les règles par défaut ; une règle invalide
 * qui refuse la sauvegarde entière en disant laquelle ; une clé abîmée dans le
 * stockage, lue comme les défauts, l'erreur dite. Règles fictives. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const nav=require('./nav.cjs');
const W=require('../moteur/import-flights.js');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const K='ory-import-winrest-v1';
const REGLES={statutsExclus:['Cancelled','Planned'],icaoExclus:['XXA'],flightNoExclus:['NR 999'],compagnies:{NRD:'NORD'},
  types:{...W.REGLES_DEFAUT.types,PREMIUM:'YC'},motReserve:'SPARE',
  fictifs:[{flightNo:'PROD JOUR',compagnie:'PROD',volId:'PROD1',heure:'10:00',types:['ECONOMY','CREW']}]};
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const garde=()=>page.evaluate(k=>localStorage.getItem(k),K);
 const regles=()=>page.evaluate(()=>Sim.winrest.regles());
 const restaurer=async(nom,contenu)=>{
  await page.locator('#sauvegarde-import').setInputFiles({name:nom,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(contenu))});
  assert.match(await page.locator('dialog.question[open] h2').textContent({timeout:5000}),/Restaurer cette sauvegarde/);
  const recharge=page.waitForEvent('load');await nav.repondre(page);await recharge;await page.waitForLoadState('load');await page.waitForTimeout(200);
 };
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await page.waitForTimeout(200);

  // 0. Sans clé : les règles par défaut.
  assert.equal(await garde(),null);
  assert.deepEqual(await regles(),{regles:W.reglesCompletes(),erreur:null});

  // 1. Des règles réglées, enregistrées comme la page les enregistre : complètes, dans leur enveloppe.
  await page.evaluate(r=>Sim.winrest.enregistrer(r),REGLES);
  const ecrit=await garde();
  assert.deepEqual(JSON.parse(ecrit),W.enveloppe(REGLES));
  // Une partie de plus (les positions des diagrammes), pour qu'une sauvegarde sans les règles reste une sauvegarde.
  await page.evaluate(()=>localStorage.setItem('ory-graphes-v1','{}'));

  // 2. Tout sauvegarder : la clé y est, telle quelle.
  await nav.vue(page,'flux');await nav.aller(page,'u-sauvegarde');
  const dl=page.waitForEvent('download');await page.locator('#sauvegarde-export').click();
  const sauvegarde=JSON.parse(fs.readFileSync(await (await dl).path(),'utf8'));
  assert.deepEqual(sauvegarde.contenu[K],JSON.parse(ecrit));

  // 3. Une règle invalide refuse la sauvegarde entière, en disant laquelle ; rien n'est remplacé.
  const casse=JSON.parse(JSON.stringify(sauvegarde));
  casse.contenu[K].regles.fictifs[0].heure='25:00';
  // Une autre partie, valide et différente de celle du navigateur : elle ne s'écrit pas non plus (tout est validé avant).
  casse.contenu['ory-graphes-v1']={d:{cuisine:{x:1,y:2}}};
  await page.locator('#sauvegarde-import').setInputFiles({name:'casse.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(casse))});
  await page.waitForFunction(()=>document.getElementById('sauvegarde-etat').classList.contains('error'));
  const refus=await page.locator('#sauvegarde-etat').textContent();
  assert.match(refus,/Restauration refusée : règles d’import Winrest, vol fictif 1 : l’heure s’écrit HH:MM\. Rien n’a été remplacé\./);
  assert.deepEqual([await garde(),await page.evaluate(()=>localStorage.getItem('ory-graphes-v1'))],[ecrit,'{}'],'un refus ne touche à rien');
  // Une sauvegarde sans les règles, mais dont une autre partie est invalide : refusée, et les règles ne sont pas retirées.
  const sansEtCasse=JSON.parse(JSON.stringify(sauvegarde));delete sansEtCasse.contenu[K];sansEtCasse.contenu['ory-graphes-v1']=[];
  await page.locator('#sauvegarde-import').setInputFiles({name:'sans-et-casse.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(sansEtCasse))});
  await page.waitForFunction(()=>/disposition des diagrammes — Dispositions invalides/.test(document.getElementById('sauvegarde-etat').textContent));
  assert.equal(await garde(),ecrit,'les règles restent');
  const inconnue=JSON.parse(JSON.stringify(sauvegarde));inconnue.contenu[K].regles.motsReserve='X';
  await page.locator('#sauvegarde-import').setInputFiles({name:'inconnue.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(inconnue))});
  await page.waitForFunction(()=>/règle inconnue « motsReserve »/.test(document.getElementById('sauvegarde-etat').textContent));
  assert.equal(await garde(),ecrit);

  // 4. Tout effacer, puis restaurer : les mêmes règles, à l'identique.
  await page.evaluate(()=>localStorage.clear());await page.reload();await page.waitForTimeout(200);
  assert.deepEqual(await regles(),{regles:W.reglesCompletes(),erreur:null});
  await nav.vue(page,'flux');
  await restaurer('ory-sauvegarde.json',sauvegarde);
  assert.equal(await garde(),ecrit,'la clé revient à l’identique');
  assert.deepEqual(await regles(),{regles:W.reglesCompletes(REGLES),erreur:null});

  // 5. Une sauvegarde d'avant (sans la clé) se restaure et donne les règles par défaut.
  const ancienne=JSON.parse(JSON.stringify(sauvegarde));delete ancienne.contenu[K];
  await nav.vue(page,'flux');
  await page.locator('#sauvegarde-import').setInputFiles({name:'ory-sauvegarde-ancienne.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(ancienne))});
  // La question dit que les règles d'import reviennent aux défauts.
  assert.match(await page.locator('dialog.question[open]').textContent({timeout:5000}),/règles d’import Winrest par défaut/);
  {const recharge=page.waitForEvent('load');await nav.repondre(page);await recharge;await page.waitForLoadState('load');await page.waitForTimeout(200);}
  assert.equal(await garde(),null,'la clé est retirée');
  assert.deepEqual(await regles(),{regles:W.reglesCompletes(),erreur:null});

  // 6. Une clé abîmée dans le stockage (une version inconnue) : lue comme les défauts, l'erreur dite.
  await page.evaluate(k=>localStorage.setItem(k,JSON.stringify({schema:'ory-import-winrest',version:9,regles:{}})),K);
  const abimee=await regles();
  assert.deepEqual(abimee.regles,W.reglesCompletes());
  assert.match(abimee.erreur,/version 9 inconnue/);
  // Une règle invalide ne s'enregistre pas : rien n'est écrit, l'erreur remonte.
  const avant=await garde();
  await assert.rejects(page.evaluate(()=>Sim.winrest.enregistrer({motReserve:''})),/mot des réserves/);
  assert.equal(await garde(),avant);

  assert.deepEqual(errors,[]);
  console.log('Règles Winrest browser passed: defaults, saved envelope, full-save round trip, invalid rule refused, old save gives defaults, damaged key read as defaults.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

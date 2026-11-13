/* Évolution 15 (a) — les seuils d'alerte dans la page, sur l'unité et les vols
 * fictifs (tests/plan-rejoue-fictif.cjs) : les réponses de la page sont celles
 * du module (un seul chemin) ; le réglage dans « Réglages de la simulation »,
 * gardé dans ory-seuils-v1 ; une valeur invalide refusée, en la nommant, sans
 * rien écrire ; « Tout sauvegarder » emporte la clé ; une sauvegarde d'avant
 * (sans la clé) rend les défauts ; une clé abîmée se lit comme les défauts.
 * Correction 17 (c) : les défauts changent (attente d'un lot 6 h, écart
 * 3 personnes), seulement quand rien n'est réglé — un réglage enregistré avant
 * ne change pas. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const R=require('../moteur/reponses.js');
const {siteSansPlan}=require('./plan-fictif.cjs');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const K='ory-seuils-v1';

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const site=siteSansPlan(),page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const sauvegarde=F.sauvegardeFictive(),CSV=F.volsCsv(),attendu=F.heureDuPicAttendue(sauvegarde,CSV);
 const garde=()=>page.evaluate(k=>localStorage.getItem(k),K);
 const champ=k=>page.locator(`#rg-sim-seuils [data-seuil="${k}"]`);
 const ch=await F.charger(page,nav,site.url('index.html'),{sauvegarde,csv:CSV});
 try{
  // 0. Sans clé : les défauts ; les réponses de la page sont celles du module, sur la même journée.
  assert.equal(await garde(),null);
  assert.deepEqual(await page.evaluate(()=>Sim.seuils.lire()),{seuils:R.SEUILS_DEFAUT,erreur:null});
  const dansLaPage=await page.evaluate(()=>JSON.stringify(Sim.reponses()));
  // Les noms des catégories, comme la page les déclare avant le calcul (moteur/journee.js, jouer) : ils nomment les commandes.
  require('../moteur/production.js').declarerCategories(attendu.args.categories);
  assert.equal(dansLaPage,JSON.stringify(R.reponses(attendu.resultat,attendu.args)),'les réponses de la page = celles du module');

  // 1. Le réglage : cinq champs, avec leur unité et leur défaut ; « Attente d’un lot » à 30 min est gardé dans son enveloppe.
  await nav.aller(page,'rg-simulation');
  assert.equal(await page.locator('#rg-sim-seuils [data-seuil]').count(),5);
  assert.equal(await champ('dureeStockMax').inputValue(),'','la durée d’un stock : vide par défaut');
  assert.equal(await champ('occupation').inputValue(),'95');
  // Correction 17 (c) : les défauts — un écart de 3 personnes, une attente de 6 h ; chaque champ dit le sien.
  assert.deepEqual([await champ('ecartPersonnes').inputValue(),await champ('attenteLot').inputValue()],['3','360']);
  assert.match(await page.locator('#seuil-effet-ecartPersonnes').textContent(),/s’il lui manque au moins .*un surplus n’est pas une alerte.* Défaut : 3\u00a0personnes\./);
  assert.match(await page.locator('#seuil-effet-attenteLot').textContent(),/finit après son horaire ou fait partir .* en retard\. Défaut : 360\u00a0min\./);
  assert.equal(await page.locator('#rg-sim-seuils [data-seuils-defaut]').count(),0,'aux défauts : rien à remettre');
  await champ('attenteLot').fill('30');await champ('attenteLot').press('Tab');
  await page.waitForFunction(k=>!!localStorage.getItem(k),K);
  assert.deepEqual(JSON.parse(await garde()),R.enveloppe({attenteLot:30}));
  assert.equal(await page.evaluate(()=>Sim.reponses().seuils.attenteLot),30,'les réponses prennent le seuil gardé');
  await champ('dureeStockMax').fill('1440,5');await champ('dureeStockMax').press('Tab');
  await page.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).seuils.dureeStockMax===1440.5,K);

  // 2. Une valeur invalide est refusée, en la nommant ; rien n'est écrit, le champ reprend la valeur gardée.
  const avant=await garde();
  await champ('occupation').fill('120');await champ('occupation').press('Tab');
  await page.waitForFunction(()=>/Occupation/.test(document.body.innerText)&&/refusé/.test(document.body.innerText));
  assert.equal(await garde(),avant,'rien n’est écrit');
  assert.equal(await champ('occupation').inputValue(),'95','le champ reprend la valeur gardée');
  await champ('retard').fill('vite');await champ('retard').press('Tab');
  await page.waitForFunction(()=>/« Retard » refusé \("vite"\)/.test(document.body.innerText));
  assert.equal(await garde(),avant);
  await assert.rejects(page.evaluate(()=>Sim.seuils.enregistrer({attenteLot:-1})),/Attente d’un lot/);
  assert.equal(await garde(),avant);

  // 3. Tout sauvegarder : la clé y est, telle quelle.
  await nav.aller(page,'u-sauvegarde');
  const dl=page.waitForEvent('download');await page.locator('#sauvegarde-export').click();
  const complete=JSON.parse(fs.readFileSync(await (await dl).path(),'utf8'));
  assert.deepEqual(complete.contenu[K],JSON.parse(avant));

  // 4. Une sauvegarde d'avant (sans la clé) : la question le dit, la clé est retirée, les défauts reviennent.
  const ancienne=JSON.parse(JSON.stringify(complete));delete ancienne.contenu[K];
  await page.locator('#sauvegarde-import').setInputFiles({name:'ancienne.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(ancienne))});
  assert.match(await page.locator('dialog.question[open]').textContent({timeout:5000}),/les seuils par défaut reviennent/);
  {const recharge=page.waitForEvent('load');await nav.repondre(page);await recharge;await page.waitForLoadState('load');await page.waitForTimeout(300);}
  assert.equal(await garde(),null,'la clé est retirée');
  assert.deepEqual(await page.evaluate(()=>Sim.seuils.lire()),{seuils:R.SEUILS_DEFAUT,erreur:null});

  // 5. Restaurer la sauvegarde complète : la clé revient à l'identique ; une clé invalide refuse la sauvegarde entière.
  const casse=JSON.parse(JSON.stringify(complete));casse.contenu[K].seuils.occupation=0;
  await nav.aller(page,'u-sauvegarde');
  await page.locator('#sauvegarde-import').setInputFiles({name:'casse.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(casse))});
  await page.waitForFunction(()=>/Restauration refusée : seuils d’alerte : « Occupation » refusé/.test(document.getElementById('sauvegarde-etat').textContent));
  assert.equal(await garde(),null,'un refus ne touche à rien');
  await page.locator('#sauvegarde-import').setInputFiles({name:'complete.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(complete))});
  {const recharge=page.waitForEvent('load');await nav.repondre(page);await recharge;await page.waitForLoadState('load');await page.waitForTimeout(300);}
  assert.equal(await garde(),avant,'la clé revient à l’identique');

  // 6. Revenir aux défauts ; une clé abîmée : lue comme les défauts, l'erreur dite dans le réglage.
  await nav.aller(page,'rg-simulation');
  await page.locator('#rg-sim-seuils [data-seuils-defaut]').click();
  await page.waitForFunction(k=>localStorage.getItem(k)===null,K);
  await page.evaluate(k=>localStorage.setItem(k,JSON.stringify({schema:'ory-seuils',version:9,seuils:{}})),K);
  const abimee=await page.evaluate(()=>Sim.seuils.lire());
  assert.deepEqual(abimee.seuils,R.SEUILS_DEFAUT);assert.match(abimee.erreur,/version 9 inconnue/);
  await page.reload();await page.waitForTimeout(400);await nav.aller(page,'rg-simulation');
  assert.match(await page.locator('#rg-sim-seuils [role="alert"]').textContent(),/illisibles .*version 9 inconnue.* les défauts s’appliquent/);

  // 7. Un réglage enregistré avant la correction 17 (c), aux défauts d'alors (écart 1, attente 60 min) : il ne change pas.
  const ancien={schema:'ory-seuils',version:1,seuils:{ecartPersonnes:1,attenteLot:60,occupation:95,dureeStockMax:null,retard:1}};
  await page.evaluate(([k,v])=>localStorage.setItem(k,JSON.stringify(v)),[K,ancien]);
  await page.reload();await page.waitForTimeout(400);await nav.aller(page,'rg-simulation');
  assert.deepEqual(await page.evaluate(()=>Sim.seuils.lire()),{seuils:ancien.seuils,erreur:null});
  assert.deepEqual([await champ('ecartPersonnes').inputValue(),await champ('attenteLot').inputValue()],['1','60']);
  assert.deepEqual(JSON.parse(await garde()),ancien,'rien n’est réécrit');
  assert.equal(await page.locator('#rg-sim-seuils [data-seuils-defaut]').count(),1,'un réglage qui n’est plus aux défauts : on peut y revenir');

  assert.deepEqual(errors,[]);
  console.log('seuils-alerte-browser : ok — réponses de la page = module, réglage gardé, refus nommé, sauvegarde et restauration, clé abîmée, un réglage d’avant inchangé.');
 }catch(e){console.error(e);process.exitCode=1;}finally{ch.effacer();site.effacer();await browser.close();}
})();

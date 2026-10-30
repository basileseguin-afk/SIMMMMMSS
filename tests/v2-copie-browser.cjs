/* Banc d'essai, correction 14 (b) — la version 2 dit d'où viennent ses
 * données (v2/stockage-v2.js, v2/sim.js ; docs/V2.md). Un bandeau discret :
 * ses données sont séparées de la version 1, copiées le JJ/MM/AAAA (la date
 * enregistrée par v2/stockage-v2.js à la première ouverture) ; un bouton
 * « Reprendre les données de la version 1 », après confirmation, recopie la
 * version 1 et recharge. La version 1 n'est jamais modifiée par la version 2.
 * Une page de la v1 et une de la v2, ouvertes côte à côte (même stockage).
 * Équipes fictives. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const URL_V2=pathToFileURL(path.resolve(__dirname,'../v2/index.html')).href;
const MARQUE='ory-v2:__copie-de-la-v1',BANDEAU='#v2-copie';
const jjmmaaaa=d=>[d.getDate(),d.getMonth()+1].map(n=>String(n).padStart(2,'0')).join('/')+'/'+d.getFullYear();
// Le vrai stockage, vu de la v1 : toutes les clés qui ne sont pas de la v2.
const DE_LA_V1=()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!k.startsWith('ory-v2:'))o[k]=localStorage.getItem(k);}return o;};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const ctx=await browser.newContext({viewport:{width:1440,height:950}}),errors=[];
 const ouvrir=async url=>{const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await p.waitForTimeout(400);return p;};
 const equipes=p=>p.evaluate(()=>Sim.ateliers.state.ateliers.map(a=>a.nom));
 const ajouter=(p,nom)=>p.evaluate(nom=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'t-'+nom.replace(/\W+/g,'-'),nom,service:'prepa',type:'manuel',debut:'05:00',jour:0,personnes:2,pauses:[],lots:[],regime:{actif:false}});},''),nom);
 try{
  // La v1 : un travail en cours. La v2 n'a encore jamais été ouverte.
  const v1=await ouvrir(URL_V1);
  await v1.evaluate(()=>localStorage.clear());await v1.reload();await v1.waitForTimeout(400);
  await ajouter(v1,'Équipe de la v1');

  // 1. Première ouverture de la v2 : la copie, sa date enregistrée, et le bandeau qui la dit.
  const v2=await ouvrir(URL_V2);
  assert.deepEqual(await equipes(v2),['Équipe de la v1']);
  const le=await v1.evaluate(k=>localStorage.getItem(k),MARQUE);
  assert.match(le,/^\d{4}-\d{2}-\d{2}T/,'la date de la copie, enregistrée à la première ouverture');
  const texte=()=>v2.locator(BANDEAU+' p').textContent();
  assert.equal(await texte(),'Version 2 : ses données sont séparées de celles de la version 1, copiées le '+jjmmaaaa(new Date(le))+'.');
  assert.deepEqual(await v2.locator(BANDEAU+' button').allTextContents(),['Reprendre les données de la version 1']);
  // Discret : une ligne, sans alerte.
  assert.equal(await v2.locator(BANDEAU).getAttribute('role'),null);
  assert.ok((await v2.locator(BANDEAU).boundingBox()).height<=40);
  // La date est celle enregistrée, au format JJ/MM/AAAA.
  await v2.evaluate(k=>localStorage.setItem(k,'2026-03-07T10:00:00.000Z'),MARQUE.slice('ory-v2:'.length));
  await v2.reload();await v2.waitForTimeout(400);
  assert.equal(await texte(),'Version 2 : ses données sont séparées de celles de la version 1, copiées le 07/03/2026.');
  // Elle ne se recopie pas d'elle-même : ce que la v2 fait reste dans la v2, ce que la v1 fait après aussi.
  await ajouter(v2,'Équipe de la v2');await ajouter(v1,'Plus tard dans la v1');
  await v2.reload();await v2.waitForTimeout(400);
  assert.deepEqual(await equipes(v2),['Équipe de la v1','Équipe de la v2']);

  // 2. « Reprendre les données de la version 1 » : une question ; « non » ne change rien.
  await v2.evaluate(()=>localStorage.setItem('ory-budget-v1',JSON.stringify({majoration:1.5})));
  const avant=await v1.evaluate(DE_LA_V1);
  await v2.locator(BANDEAU+' button').click();
  const question=v2.locator('dialog.question[open]');
  await question.waitFor({state:'visible',timeout:3000});
  assert.match(await question.locator('h2').textContent(),/Reprendre les données de la version 1/);
  assert.match(await question.textContent(),/La version 1 n’est pas modifiée\./);
  await nav.repondre(v2,false);
  assert.deepEqual(await equipes(v2),['Équipe de la v1','Équipe de la v2'],'refusée, la reprise ne fait rien');

  // 3. « oui » : la v1 recopiée dans la v2, la page rechargée, la date de la copie à jour.
  await v2.locator(BANDEAU+' button').click();
  const recharge=v2.waitForEvent('load');await nav.repondre(v2);await recharge;await v2.waitForTimeout(400);
  assert.deepEqual(await equipes(v2),['Équipe de la v1','Plus tard dans la v1'],'la v2 reprend les données de la v1');
  assert.equal(await v2.evaluate(()=>JSON.parse(localStorage.getItem('ory-budget-v1')).majoration),1.5,'ce qui n’existe que dans la v2 reste');
  assert.equal(await texte(),'Version 2 : ses données sont séparées de celles de la version 1, copiées le '+jjmmaaaa(new Date())+'.');

  // 4. La v1 n'est jamais modifiée par la v2 : ses clés, à l'octet près ; son onglet ouvert à côté n'a rien vu.
  assert.deepEqual(await v1.evaluate(DE_LA_V1),avant,'la v1, octet pour octet');
  assert.equal(await v1.locator('.donnees-changees').count(),0,'l’onglet de la v1 n’a pas de bandeau');
  assert.deepEqual(await equipes(v1),['Équipe de la v1','Plus tard dans la v1']);
  // Le numéro de révision de la v1 ne passe pas dans la v2.
  assert.equal(await v2.evaluate(()=>localStorage.getItem('ory-revision')),null);

  // 5. La v1 n'a pas ce bandeau.
  assert.equal(await v1.locator(BANDEAU).count(),0);

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('v2-copie-browser : ok (bandeau et date de la copie, reprise refusée puis faite, la v1 intacte)');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

/* Taper une heure, chiffre par chiffre, comme à la main (retour d'usage du
 * 29/09). Un champ d'heure envoie « change » dès le premier chiffre (« 1 »
 * donne 01:00) : enregistrer à ce moment redessinait le tableau, le champ
 * disparaissait et le Récap des cases remontait en haut — on ne pouvait taper
 * que « 1 » au lieu de « 14 ». L'heure s'enregistre en quittant le champ, ou
 * sur Entrée ; le tableau garde son défilement et le champ où l'on est. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 // Chromium sans écran garde parfois le format AM/PM : on tape des heures d'après-midi,
 // qui s'écrivent pareil dans les deux formats.
 const contexte=await browser.newContext({viewport:{width:1280,height:720},locale:'fr-FR'});
 const page=await contexte.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(200);
 const debut=id=>page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).debut,id);
 const taper=async(sel,chiffres)=>{
   await page.locator(sel).click({position:{x:10,y:10}});   // la case des heures
   await page.waitForTimeout(120);                           // le temps d'un geste : l'heure quittée s'enregistre
   for(const k of chiffres){await page.keyboard.press(k);await page.waitForTimeout(80);}
 };
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  // Trente cases : le tableau défile.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{for(let i=0;i<30;i++)Sim.ateliers.state.ateliers.push(
    {id:'c'+i,nom:'Case '+String(i).padStart(2,'0'),service:'cuisine',type:'manuel',debut:'05:00',jour:0,personnes:2,pauses:[],lots:[]});},''));

  // (Évolution 22 b : « Horaires des équipes », le tableau où les heures se tapaient à la suite, a quitté l'écran ; une
  //  heure se tape dans la fiche de son équipe, dans « Services et équipes ». Ce test en garde tout ce qui tient à la
  //  frappe : les quatre chiffres, rien d'enregistré avant de quitter le champ, Entrée, la fiche qui ne bouge pas.)
  const M='#mu-services';
  const ouverte=()=>page.evaluate(()=>Sim.unite.equipeOuverte);
  const ligne=id=>page.locator(`${M} .se-equipes tr[data-se-equipe="${id}"] td`).first().innerText();

  // 1. Dans la fiche d'une équipe, loin dans le tableau de son service (trente équipes) : « 1430 » donne 14:30.
  await nav.service(page,'cuisine');
  await page.locator(`${M} .se-equipes tr[data-se-equipe="c25"]`).scrollIntoViewIfNeeded();
  assert.ok(await page.locator(`${M} .se-fiche`).evaluate(f=>f.scrollTop)>100,'le tableau des équipes a défilé, dans la fiche');
  await nav.equipe(page,'c25');
  const champ=`${M} [data-at="c25"] input[data-at-champ=debut]`;
  assert.equal(await page.locator(champ).count(),1,'la fiche porte l’heure de départ, une seule fois');
  await taper(champ,'1430');
  assert.equal(await page.locator(champ).inputValue(),'14:30','les quatre chiffres sont tous entrés');
  assert.equal(await page.evaluate(()=>document.activeElement.closest('[data-at]')?.dataset.at),'c25','le champ n’a pas été arraché');
  assert.equal(await debut('c25'),'05:00','rien n’est enregistré pendant la frappe');
  // Quitter le champ enregistre ; la fiche reste ouverte.
  await page.locator(`${M} .se-retour b`).click();await attendre();
  assert.equal(await debut('c25'),'14:30');
  assert.equal(await ouverte(),'c25','la fiche ne se referme pas');
  assert.equal(await page.locator(champ).inputValue(),'14:30');

  // 2. Entrée enregistre aussi, et la fiche reste là.
  await taper(champ,'1615');
  await page.keyboard.press('Enter');await attendre();
  assert.equal(await debut('c25'),'16:15');
  assert.equal(await ouverte(),'c25');
  assert.equal(await page.locator(champ).inputValue(),'16:15');

  // 3. Passer d'une équipe à l'autre : la première heure est enregistrée en la quittant, le tableau du service la dit ;
  //    la seconde se tape en entier.
  await taper(champ,'1500');
  await page.locator(`${M} .se-retour b`).click();await attendre();
  assert.equal(await debut('c25'),'15:00','la première heure est enregistrée en la quittant');
  await nav.retour(page);
  assert.equal(await ligne('c25'),'15:00','le tableau « Ses équipes » la dit');
  await nav.equipe(page,'c26');
  const autre=`${M} [data-at="c26"] input[data-at-champ=debut]`;
  await taper(autre,'1305');
  assert.equal(await page.locator(autre).inputValue(),'13:05','la seconde se tape en entier');
  await page.keyboard.press('Enter');await attendre();
  assert.equal(await debut('c26'),'13:05');

  // 4. Une saisie par programme (import, fill) s'enregistre tout de suite, comme avant.
  await nav.equipe(page,'c25');
  await page.locator(champ).fill('07:10');await page.locator(champ).dispatchEvent('change');await attendre();
  assert.equal(await debut('c25'),'07:10');

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('saisie-heure-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

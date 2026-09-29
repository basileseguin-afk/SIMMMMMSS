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

  // 1. Récap des cases, en bas du tableau : « 1430 » donne 14:30.
  await nav.aller(page,'at-recap');
  const champ='tr[data-at="c25"] [data-at-champ=debut]';
  await page.locator(champ).scrollIntoViewIfNeeded();
  const haut=await page.evaluate(()=>document.querySelector('.rc-scroll').scrollTop);
  assert.ok(haut>100,'le tableau a défilé');
  await taper(champ,'1430');
  assert.equal(await page.locator(champ).inputValue(),'14:30','les quatre chiffres sont tous entrés');
  assert.equal(await page.evaluate(()=>document.activeElement.closest('tr')?.dataset.at),'c25','le champ n’a pas été arraché');
  assert.equal(await debut('c25'),'05:00','rien n’est enregistré pendant la frappe');
  // Quitter le champ enregistre ; le tableau reste où il était.
  await page.locator('.rc-legende').click();await attendre();
  assert.equal(await debut('c25'),'14:30');
  assert.ok(Math.abs(await page.evaluate(()=>document.querySelector('.rc-scroll').scrollTop)-haut)<2,'le tableau ne remonte pas en haut');
  assert.equal(await page.locator(champ).inputValue(),'14:30');

  // 2. Entrée enregistre aussi, et le champ garde le focus.
  await taper(champ,'1615');
  await page.keyboard.press('Enter');await attendre();
  assert.equal(await debut('c25'),'16:15');
  assert.equal(await page.evaluate(()=>document.activeElement.closest('tr')?.dataset.at),'c25','on reste dans le champ');
  assert.ok(Math.abs(await page.evaluate(()=>document.querySelector('.rc-scroll').scrollTop)-haut)<2);

  // 3. Passer d'une heure à l'autre : la première est enregistrée, la seconde garde la main.
  const autre='tr[data-at="c26"] [data-at-champ=debut]';
  await taper(champ,'1500');
  await taper(autre,'1305');
  assert.equal(await debut('c25'),'15:00','la première heure est enregistrée en la quittant');
  assert.equal(await page.locator(autre).inputValue(),'13:05','la seconde se tape en entier');
  await page.keyboard.press('Enter');await attendre();
  assert.equal(await debut('c26'),'13:05');

  // 4. Même chose dans la fiche d'une case (Organisation › Cases).
  await nav.aller(page,'at-equipes');
  await page.locator('#at-liste [data-at="c3"] .at-carte-nom').click();await attendre();
  const sel='#at-liste [data-at="c3"] input[data-at-champ=debut]';
  assert.equal(await page.locator(sel).count(),1,'la fiche porte l’heure de départ');
  await taper(sel,'1645');
  assert.equal(await page.locator(sel).inputValue(),'16:45');
  await page.keyboard.press('Enter');await attendre();
  assert.equal(await debut('c3'),'16:45');

  // 5. Une saisie par programme (import, fill) s'enregistre tout de suite, comme avant.
  await nav.aller(page,'at-recap');
  await page.locator(champ).fill('07:10');await page.locator(champ).dispatchEvent('change');await attendre();
  assert.equal(await debut('c25'),'07:10');

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('saisie-heure-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

/* Version 2 — Budget : le chef de service planifie face au budget du jour de
 * son service. Une personne planifiée est payée sa vacation ; les heures sup
 * valent ×1,25 dans un plafond par jour ; « et avec une personne de plus ? »
 * rejoue la journée pour comparer. Montants fictifs. */
const nav=require('./nav.cjs');
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(300);
 const v2=pathToFileURL(path.resolve(__dirname,'../v2/index.html')).href;
 const vue=id=>page.evaluate(id=>Sim.ateliers.resultat.ateliers.find(a=>a.id===id),id);
 try{
  await page.goto(v2);await attendre();
  await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
  await page.waitForTimeout(200);await nav.effectifSaisi(page);   // les personnes se saisissent ici (05/10)
  // Un Montage trop court : trois personnes pour toutes les commandes.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'mo',nom:'Montage matin',service:'prepa',type:'manuel',
    debut:'03:00',jour:0,personnes:3,pauses:[],lots:Sim.ateliers.classes.map(c=>[c.id]),regime:{actif:true}});},''));await attendre();

  // 1. Le menu a une partie Budget, et l'accueil sa tuile.
  assert.ok((await page.locator('#menu [data-vers-partie]').allInnerTexts()).includes('Budget'));
  await page.locator('#menu [data-vers-partie=accueil]').click();await attendre();
  assert.match(await page.locator('.acc-tuile[style*="c-budget"]').innerText(),/Saisissez le budget du mois/);

  // 2. Les heures sup : l'équipe reste, dans le plafond (3 h par défaut).
  const mo=await vue('mo');
  assert.equal(mo.presence,495,'la présence du poste : sa vacation');
  assert.equal(mo.heuresSup,180,'elle reste jusqu’au plafond');

  // 3. Le budget du jour : des budgets d'exemple, puis l'écart.
  await page.locator('#menu [data-vers-partie=budget]').click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'bu-jour');
  assert.match(await page.locator('#bu-jour .bu-note').innerText(),/fictifs/);
  await page.locator('#sous-onglets [data-sous-onglet=bu-param]').click();await attendre();
  await page.locator('[data-bu-exemple]').click();await attendre();
  const budget=await page.locator('#bu-param [data-bu-service=prepa] [data-bu-budget]').inputValue();
  assert.ok(+budget>0,'un budget du mois d’exemple : '+budget);
  await page.locator('#sous-onglets [data-sous-onglet=bu-jour]').click();await attendre();
  const ligne=page.locator('#bu-jour tr[data-bu-svc=prepa]');
  assert.match(await ligne.innerText(),/Montage[\s\S]*€/);

  // 4. Le coût : trois vacations de 8 h 15 à 18 €, plus 3 h sup ×1,25 chacune.
  const attendu=3*18*495/60+3*18*3*1.25;
  const total=await page.evaluate(()=>Sim.budget.bilan().lignes.find(l=>l.id==='prepa').total);
  assert.ok(Math.abs(total-attendu)<0.01,total+' ≈ '+attendu);

  // 5. Une catégorie plus chère dans l'équipe : le coût suit.
  await page.locator('[data-bu-ouvrir=prepa]').click();await attendre();
  const chef=page.locator('#bu-jour tr[data-bu-equipe=mo] [data-bu-compo=chef]');
  await chef.fill('1');await chef.dispatchEvent('change');await attendre();
  const total2=await page.evaluate(()=>Sim.budget.bilan().lignes.find(l=>l.id==='prepa').total);
  assert.ok(Math.abs(total2-(attendu+(25-18)*(495/60+3*1.25)))<0.01,'un chef d’équipe à la place d’un agent');

  // 6. « Et avec une personne de plus ? » : la journée rejouée, comparée.
  await page.locator('[data-bu-essai=mo]').click();await attendre();
  const essai=await page.locator('#bu-jour .bu-essai').innerText();
  assert.match(essai,/telle qu’elle est[\s\S]*Avec une personne de plus[\s\S]*€/);
  assert.equal((await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.id==='mo').personnes)),3,'l’essai ne change pas l’équipe');

  // 7. Sans heures sup : l'équipe part à la fin de sa présence.
  await page.locator('#sous-onglets [data-sous-onglet=bu-param]').click();await attendre();
  await page.locator('[data-bu-sup-actif]').uncheck();await attendre();
  assert.equal((await vue('mo')).heuresSup,0);
  await page.locator('[data-bu-sup-actif]').check();await attendre();
  const plafond=page.locator('[data-bu-sup-plafond]');await plafond.fill('1');await plafond.dispatchEvent('change');await attendre();
  assert.equal((await vue('mo')).heuresSup,60,'le plafond se règle');

  // 8. Tout survit au rechargement, et part dans la sauvegarde.
  await page.reload();await attendre();
  assert.equal((await vue('mo')).heuresSup,60);
  assert.ok(await page.evaluate(()=>!!JSON.parse(localStorage.getItem('ory-budget-v1')).compo.mo));

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('v2-budget-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

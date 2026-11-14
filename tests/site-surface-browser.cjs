/* Évolution 16 (a) — la part de surface d'un service, dans sa fiche (v1).
 * La vue en direct génère un site où chaque service a une part de surface
 * (moteur/site.js). Le réglage se fait dans la fiche du service, section
 * « Avancé » : un champ en %, vide pour la part par défaut. Il se sauvegarde
 * avec les ateliers, revient après un rechargement, et ne change aucun calcul.
 * La fiche est dessinée par un fichier commun aux deux versions : le champ est
 * ajouté par un module de la version 1 ; la version 2 ne l'a pas.
 * Chaque étape attend son effet, pas un délai. Services et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const M='#mu-services';
 const pret=()=>page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.unite&&window.OrlySiteReglages);
 /** La fiche d'un service, sa section « Avancé » ouverte : le champ de la part y est. */
 const fiche=async service=>{
   await nav.aller(page,'mu-services');
   await page.locator(`${M} [data-mu-choisir=${service}]`).click();
   await page.waitForSelector(`${M} [data-mu-encadrement=${service}]`,{state:'attached'});
   if(!(await page.locator(`${M} [data-mu-section=avance]`).evaluate(d=>d.open)))await page.locator(`${M} [data-mu-section=avance] > summary`).click();
   await page.waitForSelector(`${M} [data-site-surface=${service}]`);
   return page.locator(`${M} [data-site-surface=${service}]`);
 };
 const surfaces=()=>page.evaluate(()=>Sim.ateliers.state.surfaces||null);
 const journee=()=>page.evaluate(()=>JSON.stringify(Sim.ateliers.resultat));
 const restaurer=async(nom,contenu)=>{
  await page.locator('#sauvegarde-import').setInputFiles({name:nom,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(contenu))});
  assert.match(await page.locator('dialog.question[open] h2').textContent({timeout:5000}),/Restaurer cette sauvegarde/);
  const recharge=page.waitForEvent('load');await nav.repondre(page);await recharge;await page.waitForLoadState('load');await pret();
 };
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await pret();
  await page.evaluate(()=>localStorage.clear());await page.reload();await pret();
  // Une unité fictive : un magasin, une cuisine, la prépa et le montage.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
    const at=(id,nom,service,type,debut,personnes,lots)=>({id,nom,service,type,debut,jour:0,personnes,pauses:[],lots:lots||[],regime:{actif:false}});
    st.ateliers=[at('mag','Magasin','magasin','dispo','02:00',1),at('cu','Cuisine','cuisine','manuel','04:00',6,[['AF/BC']]),
      at('pr','Prépa','preparation','manuel','04:00',4,[['AF/YC']]),at('mo','Montage','prepa','manuel','05:00',10,[['AF/YC']])];delete st.surfaces;},''));
  await page.waitForFunction(()=>Sim.ateliers.state.ateliers.length===4&&!!Sim.ateliers.resultat);
  // Les effectifs calculés de l'unité se posent au premier changement : la journée de référence est celle d'un
  // changement neutre, et un second la laisse identique. Le réglage de la part se compare à elle.
  const neutre=()=>page.evaluate(()=>{Sim.ateliers.changer(()=>{},'');return JSON.stringify(Sim.ateliers.resultat);});
  const avant=await neutre();
  assert.equal(await neutre(),avant,'un changement neutre laisse la journée identique');
  assert.equal(await surfaces(),null,'aucune part réglée');

  // 1. Le champ est dans la section « Avancé » : vide, il dit la part par défaut. Le magasin : un cinquième, ici 25 % du site
  //    (le magasin 20, la production 20, la cuisine — seul autre service — 40 : 20 sur 80, ramenés à 100 %).
  const champ=await fiche('magasin');
  assert.equal(await champ.inputValue(),'');
  assert.equal(await champ.getAttribute('placeholder'),'auto');
  const mot=await page.locator(`${M} .site-surface small`).textContent();
  assert.match(mot,/Il occupe aujourd’hui 25 % du site\./,mot);
  assert.match(mot,/ne change aucun calcul/);
  // La production réunit la prépa et le montage : la fiche du montage le dit.
  await fiche('prepa');
  assert.match(await page.locator(`${M} .site-surface small`).textContent(),/Avec la zone FOOD, il occupe aujourd’hui 25 % du site\./);

  // 2. Régler la part : elle est gardée avec les ateliers ; le champ revient avec sa valeur ; la journée ne change pas.
  const cuisine=await fiche('cuisine');
  await cuisine.fill('30');await cuisine.press('Tab');
  await page.waitForFunction(()=>(Sim.ateliers.state.surfaces||{}).cuisine===30);
  await page.waitForFunction(()=>{const e=document.querySelector('#mu-services [data-site-surface=cuisine]');return !!e&&e.value==='30';});
  assert.deepEqual(await surfaces(),{cuisine:30});
  assert.equal(await journee(),avant,'la journée est la même, champ par champ');
  // 30 sur 30 + 20 + 20 = 70 : la cuisine occupe 42,9 % du site.
  assert.match(await page.locator(`${M} .site-surface small`).textContent(),/Il occupe aujourd’hui 42,9 % du site\./);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('ory-ateliers-v1')).surfaces),{cuisine:30},'gardée dans ce navigateur');
  // Le site généré la lit.
  const part=await page.evaluate(()=>Sim.ateliers.site().zones.find(z=>z.id==='cuisine').part);
  assert.ok(Math.abs(part-30/70)<1e-9,String(part));

  // 3. Après un rechargement, la part est là.
  await page.reload();await pret();
  assert.deepEqual(await surfaces(),{cuisine:30});
  assert.equal(await (await fiche('cuisine')).inputValue(),'30');

  // 4. « Annuler » la retire ; une valeur à virgule se lit ; vider le champ rend la part par défaut.
  await page.evaluate(()=>Sim.ateliers.regleSurface('cuisine','12,5'));
  await page.waitForFunction(()=>(Sim.ateliers.state.surfaces||{}).cuisine===12.5);
  const c2=await fiche('cuisine');
  await c2.fill('');await c2.press('Tab');
  await page.waitForFunction(()=>!Sim.ateliers.state.surfaces);
  assert.equal(await surfaces(),null);
  assert.equal(await journee(),avant);
  // Une valeur hors bornes est ramenée entre 0,1 et 100 ; une valeur illisible rend le défaut.
  assert.deepEqual(await page.evaluate(()=>{Sim.ateliers.regleSurface('cuisine',250);const a=Sim.ateliers.surface('cuisine');Sim.ateliers.regleSurface('cuisine','abc');return [a,Sim.ateliers.surface('cuisine')];}),[100,null]);

  // 5. « Tout sauvegarder » porte la part, avec les ateliers ; « Restaurer » la rend ; une sauvegarde d'avant, sans elle,
  //    se restaure et rend les parts par défaut.
  await page.evaluate(()=>Sim.ateliers.regleSurface('cuisine',30));
  await nav.vue(page,'flux');await nav.aller(page,'u-sauvegarde');
  const dl=page.waitForEvent('download');await page.locator('#sauvegarde-export').click();
  const sauvegarde=JSON.parse(fs.readFileSync(await (await dl).path(),'utf8'));
  const lu=x=>(typeof x==='string'?JSON.parse(x):x);
  assert.deepEqual(lu(sauvegarde.contenu['ory-ateliers-v1']).surfaces,{cuisine:30},'dans la sauvegarde');
  await page.evaluate(()=>localStorage.clear());await page.reload();await pret();
  assert.equal(await surfaces(),null);
  await nav.vue(page,'flux');
  await restaurer('ory-sauvegarde.json',sauvegarde);
  assert.deepEqual(await surfaces(),{cuisine:30},'restaurée');
  const ancienne=JSON.parse(JSON.stringify(sauvegarde)),texte=typeof ancienne.contenu['ory-ateliers-v1']==='string';
  {const e=lu(ancienne.contenu['ory-ateliers-v1']);delete e.surfaces;ancienne.contenu['ory-ateliers-v1']=texte?JSON.stringify(e):e;}
  await nav.vue(page,'flux');
  await restaurer('ory-sauvegarde-ancienne.json',ancienne);
  assert.equal(await surfaces(),null,'une sauvegarde d’avant : aucune part réglée');
  const defaut=await page.evaluate(()=>Object.fromEntries(Sim.ateliers.site().zones.map(z=>[z.id,Math.round(z.part*1000)/10])));
  assert.deepEqual(defaut,{magasin:25,cuisine:50,food:25},'les parts par défaut');

  // 6. La version 2 n'a pas ce champ : sa fiche est celle d'avant.
  await page.goto(pathToFileURL(path.resolve(__dirname,'../v2/index.html')).href);
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.unite);
  assert.equal(await page.evaluate(()=>typeof window.OrlySiteReglages),'undefined');

  assert.deepEqual(errors,[]);
  console.log('site-surface-browser : ok — le champ dans la fiche du service, la part par défaut dite, la part réglée gardée et relue, la journée inchangée, le rechargement, le retour au défaut, « Tout sauvegarder » et « Restaurer », une sauvegarde d’avant ; la version 2 sans le champ');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

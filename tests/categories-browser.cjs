/* L'armement : une case par compagnie, oui ou non (retour d'usage du 01/10),
 * lié au handling et pas aux chemins des repas (02/10) : chaque vol que le
 * handling charge demande son armement. Le site le propose dans la fiche d'un
 * service Armement ; minutes par vol selon la compagnie ; joué par le calcul.
 * v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 const reglage=()=>page.evaluate(()=>(Sim.ateliers.state.categories||{}).armement);
 const fiche=sel=>page.locator('#mu-services .mu-fiche '+sel);
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   // La version servie se lit dans l'en-tête (02/10).
   assert.equal(await page.locator('header .marque-version').innerText(),'version '+await page.evaluate(()=>document.querySelector('meta[name="ory-version"]').content));
   // Des repas construits pour toutes les compagnies, sauf QR et DL : rien n'est construit pour elles.
   const construites=await page.evaluate(()=>{const cies=[...new Set(Sim.ateliers.classes.map(c=>c.cie))].filter(c=>c!=='QR'&&c!=='DL').sort();
     Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'mo',nom:'Montage',service:'prepa',type:'manuel',debut:'04:00',jour:0,personnes:4,pauses:[],
       lots:Sim.ateliers.classes.filter(c=>cies.includes(c.cie)&&c.cabine==='YC').map(c=>[c.id]),regime:{actif:true}});},'');return cies;});
   await nav.aller(page,'mu-services');
   await page.locator('[data-mu-choisir=armement]').click();await attendre();

   // 1. La fiche de l'armement le propose, à la vue — même réglé en « sert tout le monde ».
   await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'ad',nom:'Armement',service:'armement',type:'dispo',debut:'06:00',jour:0,personnes:0,pauses:[],lots:[],regime:{actif:true},permanent:true});},''));await attendre();
   await page.locator('[data-mu-choisir=armement]').click();await attendre();
   assert.match(await fiche('.mu-par-cie').innerText(),/une case par compagnie/);
   await fiche('[data-mu-action=par-compagnie]').click();await attendre();
   assert.deepEqual(await reglage(),[{id:'ARM',nom:'Armement',minutes:{}}],version+' : un seul réglage, au nom du service');
   assert.equal(await fiche('.mu-par-cie').count(),0);
   assert.equal(await fiche('[data-mu-nature]').inputValue(),'categories');

   // 2. Lié au handling : sans handling, chaque départ ; avec, les vols qu'il charge.
   assert.match(await fiche('.mu-lien-handling').innerText(),/Lié au handling[\s\S]*Pas encore de handling/);
   assert.deepEqual(await page.evaluate(()=>[...new Set(Sim.ateliers.classesDe('armement').map(c=>c.cie))].sort()),construites,version+' : les compagnies construites');
   assert.match(await fiche('').innerText(),/Pas simulées : DL, QR — rien n’est construit pour elles/);
   const sansDL=construites.filter(c=>c!=='FWI');
   await page.evaluate(cies=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'h',nom:'Quais',service:'quais',type:'handling',debut:'04:00',jour:0,personnes:2,pauses:[],lots:[],regime:{actif:true},durees:{'*':20},compagnies:cies});},''),sansDL);await attendre();
   const cies=await page.evaluate(()=>[...new Set(Sim.ateliers.classesDe('armement').map(c=>c.cie))].sort());
   assert.deepEqual(cies,sansDL,version+' : les vols que « Quais » charge');
   const toutes=construites;
   assert.match(await fiche('.mu-lien-handling').innerText(),/Chaque vol que « Quais » charge demande son armement/);
   assert.match(await fiche('').innerText(),/Pas de case pour FWI : aucun handling ne charge leurs vols/);

   // 3. Ses minutes par vol : toutes, puis AF.
   const min=async(cie,v)=>{const c=fiche(`[data-mu-cat-min="ARM"][data-cie="${cie}"]`);await c.fill(String(v));await c.press('Tab');await attendre();};
   await min('*',10);await min('AF',15);
   assert.deepEqual((await reglage())[0].minutes,{'*':10,AF:15});

   // 4. Une équipe : une seule colonne, une case par compagnie.
   await fiche('[data-mu-action=equipe]').click();await attendre();
   const eq=await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>a.service==='armement').pop().id);
   const grille=page.locator(`#mu-services table[data-mu-equipe="${eq}"]`);
   assert.deepEqual((await grille.locator('thead th').allInnerTexts()).map(t=>t.trim().toUpperCase()).filter(Boolean).slice(1),['ARMEMENT']);
   assert.equal(await grille.locator('tbody tr').count(),toutes.length,'les compagnies construites sont listées ; QR et DL non');
   assert.equal(await grille.locator('tbody th',{hasText:/^QR$/}).count(),0);
   assert.equal(await grille.locator('[data-mu-cocher]').count(),cies.length,'une case pour celles dont le chemin passe ici');
   await grille.locator('[data-mu-cocher="AF/@ARM"]').check();await attendre();
   assert.deepEqual(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).lots,eq),[['AF/@ARM']]);

   // 5. Le calcul : 15 min par vol AF.
   const r=await page.evaluate(id=>{const r=Sim.ateliers.resultat,l=r.lots.find(x=>x.atelier===id&&x.classes.includes('AF/@ARM'));
     return {ok:r.ok,minutes:l&&l.hommeMinutes,vols:r.classes.find(c=>c.id==='AF/@ARM').vols.length,lib:MoteurProduction.libelleClasse('AF/@ARM')};},eq);
   assert.ok(r.ok);
   assert.equal(r.minutes,15*r.vols,version+' : minutes par vol × vols');
   assert.equal(r.lib,'AF · Armement');

   // 6. Toutes les pages s'affichent.
   for(const p of ['at-recap','rg-recap','mu-pas','mu-flux','at-chemins','at-equipes']) await nav.aller(page,p);

   // 6 bis. Le handling attend l'armement du vol AF pour le charger.
   const attente=await page.evaluate(()=>{const r=Sim.ateliers.resultat,arm=r.lots.filter(l=>l.classes.includes('AF/@ARM')),h=r.lots.filter(l=>l.handling&&String(l.vol||'').length&&l.classes.includes('AF/@ARM'));
     return {arm:arm.length,h:h.length,ok:h.every(l=>arm.some(a=>a.fin<=l.debut+1e-6))};});
   assert.ok(attente.h>0&&attente.ok,version+' : '+JSON.stringify(attente));

   // 7. Placé au milieu d'un flux (après la Prépa) : la fiche le dit ; un clic l'intègre à tous les chemins, relié au handling.
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const t=Sim.ateliers.state.parcours.find(x=>x.id==='sans-cuisine');t.noeuds.push('armement');t.liens.push({de:'prepa',vers:'armement'});},''));await attendre();
   await nav.aller(page,'mu-services');await page.locator('[data-mu-choisir=armement]').click();await attendre();
   assert.match(await fiche('.mu-lien-handling').innerText(),/pas relié seulement au handling/);
   await fiche('[data-mu-action=integrer-armement]').click();await attendre();
   const parcours=await page.evaluate(()=>Sim.ateliers.state.parcours);
   assert.ok(parcours.every(p=>!p.noeuds.length||(p.noeuds.includes('armement')&&p.liens.filter(l=>l.de==='armement'||l.vers==='armement').every(l=>l.de==='armement'&&l.vers==='quais'))),'dans tous les chemins, relié seulement au handling');
   assert.match(await fiche('.mu-arm-ok').innerText(),/Dans tous les chemins/);
   assert.deepEqual(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).lots,eq),[['AF/@ARM']],version+' : la case AF reste');

   // 8. Revenir à « des équipes préparent les commandes ».
   await fiche('[data-mu-nature]').selectOption('manuel');await attendre();
   assert.equal(await reglage(),undefined);
  }
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('categories-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

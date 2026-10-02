/* Deux étapes à la chaîne (Prépa + Montage pour AF) : l'équipe existe dans les
 * deux services, et se règle dans les deux (retour d'usage du 01/10 : « il faut
 * que l'atelier existe à la fois dans prépa et dans montage, et qu'il soit
 * modifiable dans les 2 services »). v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 const kase=id=>page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id),id);
 const ouvrir=async s=>{await nav.aller(page,'mu-services');await page.locator(`[data-mu-choisir=${s}]`).click();await attendre();};
 const carte=sel=>page.locator(`#mu-services article.mu-equipe[data-at="mo"] ${sel}`);
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
     const ch=id=>({id,nom:'Chaîne '+id,noeuds:['cuisine','preparation','prepa'],liens:[{de:'cuisine',vers:'preparation'},{de:'preparation',vers:'prepa'}]});
     st.parcours.push(ch('ch'),ch('ch2'),{id:'mont',nom:'Montage seul',noeuds:['cuisine','prepa'],liens:[{de:'cuisine',vers:'prepa'}]});
     st.parcoursClasse['AF/YC']='ch';st.parcoursClasse['TX/YC']='ch2';st.parcoursClasse['CRL/YC']='mont';
     const c=(id,nom,service,lots,p)=>({id,nom,service,type:'manuel',debut:'04:00',jour:0,personnes:1,pauses:[],lots,regime:{actif:false},...p});
     st.ateliers.push(c('pr','Prépa eco','preparation',[['TX/YC']]),c('mo','Montage AF','prepa',[['AF/YC']],{personnes:2,fusion:'preparation'}),c('mt','Montage TX','prepa',[['TX/YC']]));},''));

   // 1. Au Montage : l'équipe, avec son badge « + Prépa à la chaîne ».
   await ouvrir('prepa');
   assert.match(await carte('.mu-badge.chaine').innerText(),/\+ PRÉPA à la chaîne/i);
   // Elle fait aussi le Montage seul de CRL YC, dont le flux n'a pas de Prépa.
   const auMontage=c=>page.locator(`#mu-services table[data-mu-equipe="mo"] [data-mu-cocher="${c}"]`);
   await auMontage('CRL/YC').check();await attendre();
   assert.deepEqual((await kase('mo')).lots.flat().sort(),['AF/YC','CRL/YC']);
   assert.equal(await auMontage('AF/YC').evaluate(i=>!!i.closest('td').querySelector('.mu-chez-chaine')),true,version+' : ⛓ sur AF YC');
   assert.equal(await auMontage('CRL/YC').evaluate(i=>!!i.closest('td').querySelector('.mu-chez-chaine')),false,version+' : pas sur CRL YC');
   const lotQR=await page.evaluate(()=>Sim.ateliers.resultat.lots.find(l=>l.atelier==='mo'&&l.classes.includes('CRL/YC')));
   assert.ok(!lotQR.minutesFusion,version+' : pas de minutes de Prépa pour CRL YC');

   // 2. À la Prépa : la même équipe, dite « équipe du Montage », modifiable.
   await ouvrir('preparation');
   assert.equal(await carte('').count(),1,version+' : l’équipe à la chaîne est aussi dans la Prépa');
   assert.match(await page.locator('#mu-services .mu-chainees').innerText(),/cette équipe fait aussi PRÉPA/i);
   assert.match(await carte('.mu-badge.chaine').innerText(),/équipe du MONTAGE · PRÉPA \+ MONTAGE à la chaîne/i);
   const pers=carte('[data-at-champ=personnes]');
   await pers.fill('3');await pers.press('Tab');await attendre();
   assert.equal((await kase('mo')).personnes,3,version+' : modifiée depuis la Prépa');
   // Vue de la Prépa : CRL YC n'y est pas (elle n'en fait que le Montage), ni cochée ni cochable.
   const qr=page.locator('#mu-services table[data-mu-equipe="mo"] [data-mu-cocher="CRL/YC"]');
   assert.equal(await qr.isChecked(),false,version+' : CRL YC pas cochée côté Prépa');
   assert.equal(await qr.isDisabled(),true);
   assert.equal(await page.locator('#mu-services table[data-mu-equipe="mo"] [data-mu-cocher="AF/YC"]').isChecked(),true);
   // Dans la grille de l'équipe de la Prépa, AF YC est faite à la chaîne : pas cochable.
   const cellule=page.locator('#mu-services table[data-mu-equipe="pr"] [data-mu-cocher="AF/YC"]');
   assert.equal(await cellule.isDisabled(),true);
   assert.match(await cellule.evaluate(i=>i.closest('td').className),/chaine/);
   // Ce qu'elle prépare se règle aussi d'ici (ses commandes, pour les deux étapes).
   await page.locator('#mu-services table[data-mu-equipe="mo"] [data-mu-cocher="TX/YC"]').check();await attendre();
   assert.deepEqual((await kase('mo')).lots.flat().sort(),['AF/YC','CRL/YC','TX/YC']);
   // Et le lien ramène au Montage, où l'on retrouve le même réglage.
   await carte('[data-mu-ouvrir=prepa]').click();await attendre();
   assert.equal(await page.locator('.mu-fiche').getAttribute('data-mu-fiche'),'prepa');
   assert.equal(await carte('[data-at-champ=personnes]').inputValue(),'3');

   // 3. Plus à la chaîne : elle ne reste qu'au Montage.
   await carte('[data-at-champ=fusion]').selectOption('');await attendre();
   await ouvrir('preparation');
   assert.equal(await carte('').count(),0);
  }
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('chaine-services-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

/* Choisir le chemin d'une commande dans une liste (retour d'usage du 05/10 :
 * « si je crée un chemin de toute pièce, je veux pouvoir le choisir pour une
 * compagnie × classe, dans une liste déroulante de tous les chemins »).
 *   - Flux de production › « Qui suit quel chemin » : chaque commande, sa liste ;
 *   - Une commande : « Chemin suivi », la même liste ;
 *   - un flux créé de toutes pièces se choisit ; « flux de sa classe » revient en arrière ;
 *   - le chemin à part d'une autre commande, choisi, devient un flux partagé (et c'est dit) ;
 *   - le calcul suit le chemin choisi. v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 const suit=cmd=>page.evaluate(cmd=>{const st=Sim.ateliers.state,p=OrlyParcours.fluxDe(st,cmd);return p?p.nom:null;},cmd);
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   // Évolution 19 (a) : la version 1 dit « chemin » ; la version 2, gelée, dit encore « flux ».
   const mot=version==='v1'?'chemin':'flux';
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   // Un flux créé de toutes pièces, dans Flux de production.
   await nav.aller(page,'mu-flux');await nav.ajouterChemin(page);
   await page.fill('[data-mu-flux-nouveau] input[name=nom]','Économie robot');
   await page.selectOption('[data-mu-flux-nouveau] select[name=source]','');
   await page.locator('[data-mu-flux-nouveau] button[type=submit]').click();await attendre();
   const robot=await page.evaluate(()=>{const st=Sim.ateliers.state,p=st.parcours.find(x=>x.nom==='Économie robot');
     Sim.ateliers.changer(()=>{const q=Sim.ateliers.state.parcours.find(x=>x.id===p.id);q.noeuds=['magasin','prepa'];q.liens=[{de:'magasin',vers:'prepa'}];},'');return p.id;});

   // 1. Qui suit quel chemin : ouvert, une liste par commande, le flux créé y figure.
   //    (Version 1, évolution 22 c : la liste d'une commande est dans la fiche du chemin qu'elle suit, section « Qui le
   //    suit » — `chez` ouvre ce chemin et déplie la section.)
   const v1=version==='v1';
   const chez=async cmd=>{if(!v1)return;
     await page.locator(`#mu-flux .mu-liste [data-mu-flux-choisir="${await page.evaluate(c=>OrlyParcours.fluxDe(Sim.ateliers.state,c).id,cmd)}"]`).click();await attendre();
     await nav.sectionChemin(page,'suivi');};
   await chez('AF/YC');
   const liste=page.locator('[data-mu-cmd-chemin="AF/YC"]');
   if(v1){
    assert.equal(await page.locator('[data-mu-qui-suit]').count(),0,version+' : plus de tableau de toutes les commandes');
    assert.equal(await page.locator('#mu-flux [data-mu-cmd-chemin]').count(),await page.evaluate(()=>OrlyParcours.commandesDuType(Sim.ateliers.state,OrlyParcours.fluxDe(Sim.ateliers.state,'AF/YC').id,Sim.ateliers.classes).length),version+' : une liste par commande du chemin');
   }else{
   assert.equal(await page.locator('[data-mu-qui-suit]').evaluate(d=>d.open),true,version+' : ouvert');
   assert.equal(await page.locator('[data-mu-cmd-chemin]').count(),await page.evaluate(()=>Sim.ateliers.classes.length),'une liste par commande');
   }
   assert.match(await liste.locator('option[value=""]').innerText(),new RegExp('« Sans cuisine » · '+mot+' de sa classe'));
   assert.ok((await liste.locator('option').allInnerTexts()).includes('Économie robot'),version+' : le flux créé est proposé');
   await liste.selectOption(robot);await attendre();
   assert.equal(await suit('AF/YC'),'Économie robot',version+' : AF Économie suit le flux créé');
   const r=await page.evaluate(()=>(Sim.ateliers.resultat.parClasse['AF/YC']||{}).services||[]);
   assert.ok(!r.includes('cuisine')&&!r.includes('decontam'),version+' : le calcul suit le chemin choisi '+r);
   // La liste garde le choix, et « flux de sa classe » revient en arrière.
   await chez('AF/YC');
   assert.equal(await page.locator('[data-mu-cmd-chemin="AF/YC"]').inputValue(),robot);
   await page.locator('[data-mu-cmd-chemin="AF/YC"]').selectOption('');await attendre();
   assert.equal(await suit('AF/YC'),'Sans cuisine');

   // 2. Une commande : « Chemin suivi », la même liste. (Version 1, évolution 22 c : « Chemin d'une commande » n'est
   //    plus une page ; ouvrir le chemin d'une commande mène à « Chemins », où la liste est la même.)
   if(v1){
    await page.evaluate(()=>Sim.unite.chemin('TX/BC'));await attendre();
    assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-flux',version+' : le chemin d’une commande s’ouvre dans « Chemins »');
    assert.equal(await page.evaluate(()=>Sim.ateliers.parcours),undefined,version+' : plus de second éditeur de chemin');
    await nav.sectionChemin(page,'suivi');
    const s2=page.locator('#mu-flux [data-mu-cmd-chemin="TX/BC"]');
    assert.match(await s2.locator('option:checked').innerText(),new RegExp('« Complet » · '+mot+' de sa classe'));
    await s2.selectOption(robot);await attendre();
    assert.equal(await suit('TX/BC'),'Économie robot',version+' : choisi depuis le chemin de la commande');
    assert.match(await page.locator('#at-status').innerText(),/TX BC suit maintenant « Économie robot »/);
   }else{
   await page.evaluate(()=>Sim.ateliers.parcours.ouvrir('TX/BC'));await attendre();
   const s2=page.locator('[data-pc-suit="TX/BC"]');
   assert.match(await s2.locator('option:checked').innerText(),new RegExp('« Complet » · '+mot+' de sa classe'));
   await s2.selectOption(robot);await attendre();
   assert.equal(await suit('TX/BC'),'Économie robot',version+' : choisi depuis Une commande');
   assert.match(await page.locator('#at-status').innerText(),/TX · Business suit maintenant « Économie robot »/);
   }

   // 3. Le chemin à part d'une autre commande, choisi, devient un flux partagé.
   const apart=await page.evaluate(()=>{const st=Sim.ateliers.state,id='propre-fwi';Sim.ateliers.changer(()=>{const s=Sim.ateliers.state;
     s.parcours.push({id,nom:'Chemin de FWI',noeuds:['prepa'],liens:[]});s.parcoursClasse={...s.parcoursClasse,'FWI/BC':id};},'');return id;});
   await nav.aller(page,'mu-flux');await chez('CRL/BC');
   const l3=page.locator('[data-mu-cmd-chemin="CRL/BC"]');
   assert.match(await l3.locator(`option[value="${apart}"]`).innerText(),/Chemin de FWI \(chemin de FWI · Business : il deviendra partagé\)/);
   await l3.selectOption(apart);await attendre();
   assert.equal(await suit('CRL/BC'),'Chemin de FWI');assert.equal(await suit('FWI/BC'),'Chemin de FWI');
   assert.equal(await page.evaluate(id=>!!Sim.ateliers.state.parcours.find(p=>p.id===id).type,apart),true,version+' : devenu un flux');
   assert.match(await page.locator('#at-status').innerText(),new RegExp('c’est maintenant un '+mot+' partagé, le modifier change pour les deux'));
   // Il apparaît maintenant parmi les flux.
   assert.ok(await page.locator('#mu-flux .mu-liste').innerText().then(t=>t.includes('Chemin de FWI')),version+' : dans la liste des flux');
  }
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('chemin-choisi-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

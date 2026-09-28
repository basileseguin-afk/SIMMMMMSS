/* Organisation › Services : la porte d'entrée d'un service. « Il manque une
 * équipe » doit se corriger d'un clic, et un service se renomme sans passer
 * par l'édition du plan. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(200);
 const ligne=id=>page.locator(`.svc-table tr[data-svc=${id}]`);
 const cases=id=>page.evaluate(id=>Sim.ateliers.state.ateliers.filter(a=>a.service===id),id);
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();

  // 1. Une ligne par service de l'unité, dans l'Organisation.
  await nav.aller(page,'u-services');
  assert.equal(await page.evaluate(()=>document.body.dataset.partie),'organisation');
  assert.equal(await page.locator('.svc-table tbody tr').count(),await page.evaluate(()=>Sim.ateliers.a.services().length),'tous les services');
  assert.match(await ligne('plonge').textContent(),/aucune/);
  assert.equal(await page.locator('#fc-export').isVisible(),false,'les outils des liens restent sur leur page');

  // 2. « + Une équipe » : la case naît dans ce service, et s'ouvre pour être réglée.
  await ligne('plonge').locator('[data-svc-action=equipe]').click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'at-equipes','on la règle dans les cases');
  const pl=(await cases('plonge'))[0];
  assert.ok(pl,'une case dans la plonge');
  assert.equal(await page.evaluate(()=>Sim.ateliers.filtre),'plonge','la liste se resserre sur ce service');
  assert.equal(await page.locator(`[data-at="${pl.id}"] [data-at-champ=type]`).isVisible(),true,'sa fiche est ouverte');
  await page.selectOption(`[data-at="${pl.id}"] [data-at-champ=type]`,'lavage');await attendre();

  // 3. Les contrôles : les quais livrent la plonge sans équipe. Le point à
  //    corriger porte son geste, et une plonge n'est plus « une équipe qui ne prépare rien ».
  await nav.aller(page,'u-lecture');
  assert.match(await page.locator('#fc-alertes').textContent(),/Quais · Réception fournit sans avoir d’équipe/);
  assert.doesNotMatch(await page.locator('#fc-alertes').textContent(),/Plonge : une équipe est décrite mais ne prépare rien/,
    'une plonge lave pour tout le monde : pas d’alerte');
  await page.locator('#fc-alertes [data-svc-action=equipe][data-svc=quais]').click();await attendre();
  assert.equal((await cases('quais')).length,1,'l’équipe qui manquait est créée d’un clic');
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'at-equipes');

  // 4. Retour aux services : la ligne dit ce qui a changé.
  await nav.aller(page,'u-services');
  assert.match(await ligne('quais').textContent(),/Quais/,'l’équipe est listée');
  assert.match(await ligne('plonge').locator('.svc-etat').textContent(),/plonge/);
  // Une équipe listée ouvre sa fiche.
  await ligne('plonge').locator('[data-svc-case]').click();await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.ouvert),pl.id);
  await nav.aller(page,'u-services');

  // 5. Renommer un service ici : le plan, les listes et les chemins suivent.
  const champ=page.locator('[data-svc-nom=armement]');
  await champ.fill('Armement EZY/AF');await champ.press('Enter');await attendre();
  assert.equal(await page.evaluate(()=>Sim.editor.state.zones.find(z=>z.id==='armement').nom),'Armement EZY/AF','le plan porte le nouveau nom');
  assert.ok(await page.evaluate(()=>Sim.ateliers.a.services().some(s=>s.id==='armement'&&/EZY\/AF/.test(s.nom))),'les listes aussi');
  assert.match(await page.locator('#zone-picker').textContent(),/EZY\/AF/,'le choix d’un service sur le plan aussi');
  // Un nom vide est refusé.
  await champ.fill('   ');await champ.press('Enter');await attendre();
  assert.equal(await page.evaluate(()=>Sim.editor.state.zones.find(z=>z.id==='armement').nom),'Armement EZY/AF','nom vide refusé');

  // 6. « Voir sur le plan » : le plan rejoué, le service choisi. Sans équipe,
  //    son panneau propose d'en ajouter une.
  await ligne('armement').locator('[data-svc-action=voir]').click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'j-plan');
  assert.equal(await page.locator('#zone-picker').inputValue(),'armement');
  assert.match(await page.locator('#goulot-info').textContent(),/Aucune équipe ici/);
  await page.locator('#goulot-info [data-svc-action=equipe][data-svc=armement]').click();await attendre();
  assert.equal((await cases('armement')).length,1,'depuis le plan aussi');

  // 7. « Modifier le plan de l'unité » ouvre l'édition du plan.
  await nav.aller(page,'u-services');
  await page.locator('.svc-tete [data-svc-action=plan]').click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.classList.contains('plan-editing')),true);
  await page.locator('#edit-done').click();await attendre();

  // 8. Toutes les listes de services disent la même chose (retour d'usage :
  //    « Armement EZY/AF n'apparaît pas dans les chemins »).
  const listes=async id=>{const r={};
    r.services=await page.evaluate(id=>Sim.ateliers.a.services().some(s=>s.id===id),id);
    r.plan=await page.evaluate(id=>[...document.querySelectorAll('#zone-picker option')].some(o=>o.value===id),id);
    r.liens=await page.evaluate(id=>Sim.flows.points.some(x=>x.owner===id),id);
    await nav.aller(page,'u-services');r.page=await page.locator(`tr[data-svc="${id}"]`).count()===1;
    await nav.aller(page,'at-equipes');r.cases=await page.locator(`#at-filtre option[value="${id}"]`).count()===1;
    await nav.aller(page,'at-chemins');await page.locator('[data-pc-action=cmd][data-classe="AF/BC"]').click();await attendre();
    // Sans chemin, on le crée : c'est dans son « Ajouter un service » que le service doit figurer.
    if(await page.locator('[data-pc-action=creer][data-classe="AF/BC"]').count()){await page.locator('[data-pc-action=creer][data-classe="AF/BC"]').click();await attendre();}
    r.chemin=await page.locator(`[data-pc-champ=noeud-ajout] option[value="${id}"], .pc-graphe [data-noeud="${id}"]`).count()>0;
    return r;};
  const partout={services:true,plan:true,liens:true,page:true,cases:true,chemin:true};
  const editer=async fn=>{await nav.aller(page,'j-plan');await page.locator('#btn-edit').click();await attendre();await fn();await page.locator('#edit-done').click();await attendre();};
  //    a. Une zone de production (« Dupliquer » un service) : partout.
  await editer(async()=>{await page.evaluate(()=>Sim.editor.select('dotation'));await page.locator('#pe-duplicate').click();await attendre();
    await page.locator('#pe-name').fill('Dotation EZY');await page.locator('#pe-name').dispatchEvent('change');await attendre();});
  const annexe=await page.evaluate(()=>Sim.editor.state.zones.find(z=>z.nom==='Dotation EZY').id);
  assert.deepEqual(await listes(annexe),partout,'une zone de production est un service partout');
  //    b. Masquée sur le plan : toujours un service (« masquer » ne vaut que pour le dessin).
  await page.evaluate(id=>Sim.ateliers.creer(id),annexe);await attendre();
  await editer(async()=>{await page.evaluate(id=>Sim.editor.change(()=>{Sim.editor.state.zones.find(z=>z.id===id).visible=false;},'x'),annexe);});
  assert.deepEqual(await listes(annexe),partout,'masquée, elle reste dans toutes les listes');
  //    c. Supprimée alors qu'elle porte une équipe : l'équipe passe dans son service parent.
  await editer(async()=>{await page.evaluate(id=>Sim.editor.select(id),annexe);await page.locator('#pe-delete').click();await attendre();});
  assert.equal((await cases(annexe)).length,0,'pas d’équipe orpheline');
  assert.ok((await cases('dotation')).some(a=>/Dotation EZY/.test(a.nom)),'elle travaille maintenant en Dotation');
  //    d. Un local dessiné n'est pas un service : la page des services le dit, et en fait un service.
  await editer(async()=>{await page.evaluate(()=>Sim.editor.change(()=>Sim.editor.addZone({x:300,y:100,w:80,h:60}),'x'));
    await page.locator('#pe-name').fill('Armement EZY/AF 2');await page.locator('#pe-name').dispatchEvent('change');await attendre();
    assert.match(await page.locator('#pe-kind-note').textContent(),/pas un service/,'l’éditeur le dit');});
  const local=await page.evaluate(()=>Sim.editor.state.zones.find(z=>z.nom==='Armement EZY/AF 2').id);
  assert.equal((await listes(local)).chemin,false);
  await nav.aller(page,'u-services');
  assert.match(await page.locator('.svc-bloc').last().textContent(),/Zones du plan qui ne sont pas des services[\s\S]*Armement EZY\/AF 2/);
  assert.equal(await page.locator(`[data-svc-parent="${local}"]`).inputValue(),'armement','rattachée au service dont elle porte le nom');
  await page.locator(`[data-svc-convertir="${local}"]`).click();await attendre();
  assert.deepEqual(await listes(local),partout,'devenu service, il est partout');
  //    e. Une équipe dont le service n'existe plus (ancienne sauvegarde) : signalée, puis rattachée.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'orph1',nom:'Équipe perdue',service:'zone-disparue',
    type:'manuel',debut:'05:00',jour:0,personnes:2,pauses:[],lots:[],regime:{actif:true}});},''));
  await nav.aller(page,'u-lecture');
  assert.match(await page.locator('#fc-alertes').textContent(),/Équipe perdue travaille dans un service qui n’existe plus/);
  await nav.aller(page,'u-services');
  await page.selectOption('[data-svc-orpheline=orph1]','cuisine');await page.locator('[data-svc-rattacher=orph1]').click();await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.id==='orph1').service),'cuisine');
  assert.equal(await page.locator('[data-svc-orpheline]').count(),0);

  // 9. Le cycle de vie d'un service, tout depuis cette page (retour d'usage :
  //    « comment je supprime un service, le renommer etc. »).
  //    a. Créer : un nom, un service de rattachement ; il est partout.
  await nav.aller(page,'u-services');
  await page.fill('[data-svc-nouveau] input[name=nom]','Froid EZY');await page.selectOption('[data-svc-nouveau] select','prepa');
  await page.locator('[data-svc-nouveau] button[type=submit]').click();await attendre();
  const cree=await page.evaluate(()=>(Sim.editor.state.zones.find(z=>z.nom==='Froid EZY')||{}).id);
  assert.ok(cree,'le service est créé');
  assert.equal(await page.evaluate(id=>Sim.editor.state.zones.find(z=>z.id===id).kind,cree),'annexe','une zone de production');
  assert.deepEqual(await listes(cree),partout,'un service créé ici est partout');
  //    b. Un nom déjà pris est refusé.
  await nav.aller(page,'u-services');
  const nZones=await page.evaluate(()=>Sim.editor.state.zones.length);
  await page.fill('[data-svc-nouveau] input[name=nom]','froid ezy');await page.locator('[data-svc-nouveau] button[type=submit]').click();await attendre();
  assert.equal(await page.evaluate(()=>Sim.editor.state.zones.length),nZones,'pas de doublon');
  //    c. Changer de rattachement : il reprend les liens de son nouveau service.
  await page.selectOption(`[data-svc-reparent="${cree}"]`,'cuisine');await attendre();
  assert.equal(await page.evaluate(id=>Sim.editor.state.zones.find(z=>z.id===id).parent,cree),'cuisine');
  assert.ok(await page.evaluate(id=>Sim.ateliers.a.liaisons().some(l=>l.from===id||l.to===id),cree),'il hérite des liens de la cuisine');
  //    d. Supprimer : son équipe passe dans le service de rattachement.
  await page.evaluate(id=>Sim.ateliers.creer(id),cree);await attendre();
  await nav.aller(page,'u-services');
  await page.locator(`[data-svc-supprimer="${cree}"]`).click();await attendre();
  assert.equal(await page.evaluate(id=>Sim.editor.state.zones.some(z=>z.id===id),cree),false,'le service est supprimé');
  assert.equal((await cases(cree)).length,0,'pas d’équipe orpheline');
  assert.equal(await page.locator(`tr[data-svc="${cree}"]`).count(),0,'plus de ligne');
  //    e. Un service du plan d'origine ne se supprime pas : il se retire, et se remet.
  assert.equal(await ligne('bobduty').locator('[data-svc-supprimer]').count(),0);
  assert.ok(await page.evaluate(()=>Sim.ateliers.a.liaisons().some(l=>l.from==='bobduty'||l.to==='bobduty')),'Duty free est relié');
  await ligne('bobduty').locator('[data-svc-retirer]').click();await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.a.services().some(s=>s.id==='bobduty')),false,'hors des listes');
  assert.equal(await page.evaluate(()=>Sim.ateliers.a.liaisons().some(l=>l.from==='bobduty'||l.to==='bobduty')),false,'le calcul ne lit plus ses liens');
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#zone-picker option')].some(o=>o.value==='bobduty')),false,'hors du plan');
  assert.equal(await page.evaluate(()=>Sim.flows.points.some(x=>x.owner==='bobduty')),false,'hors des liens');
  assert.match(await page.locator('.svc-bloc').last().textContent(),/Services retirés[\s\S]*Duty free/);
  await page.locator('[data-svc-remettre=bobduty]').click();await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.a.services().some(s=>s.id==='bobduty')),true,'remis dans l’unité');
  assert.ok(await page.evaluate(()=>Sim.ateliers.a.liaisons().some(l=>l.from==='bobduty'||l.to==='bobduty')),'avec ses liens');

  // 10. Un service renommé : ses cases qui portent son nom le suivent, partout
  //     (retour d'usage : « Armement » d'un côté, « Armement AF Équipage » de l'autre).
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
    st.ateliers.push({id:'dt1',nom:'Dotation',service:'dotation',type:'manuel',debut:'05:00',jour:0,personnes:2,pauses:[],lots:[['AF/BC']],regime:{actif:true}});
    st.ateliers.push({id:'dt2',nom:'Dotation AF CREW',service:'dotation',type:'manuel',debut:'05:00',jour:0,personnes:2,pauses:[],lots:[['AF/CREW']],regime:{actif:true}});
    st.ateliers.push({id:'dt3',nom:'Équipe du matin',service:'dotation',type:'manuel',debut:'05:00',jour:0,personnes:2,pauses:[],lots:[['TX/BC']],regime:{actif:true}});},''));
  await nav.aller(page,'u-services');
  const nomDot=page.locator('[data-svc-nom=dotation]');
  await nomDot.fill('Dotation Sud');await nomDot.press('Enter');await attendre();
  const noms=await page.evaluate(()=>['dt1','dt2','dt3'].map(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).nom));
  assert.deepEqual(noms,['Dotation Sud','Dotation Sud AF CREW','Équipe du matin'],'les cases au nom du service le suivent ; un nom choisi reste');
  assert.match(await ligne('dotation').textContent(),/Dotation Sud AF CREW/,'la page Services le montre');
  // Par l'édition du plan aussi, et « Annuler » du plan les ramène.
  await page.evaluate(()=>Sim.editor.change(()=>{Sim.editor.state.zones.find(z=>z.id==='dotation').nom='Dotation Est';},'x'));await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.id==='dt2').nom),'Dotation Est AF CREW');
  await page.evaluate(()=>Sim.editor.undo());await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.id==='dt2').nom),'Dotation Sud AF CREW');
  // Les pages qui listent les services le disent toutes.
  await nav.aller(page,'at-grille');
  assert.match(await page.locator('#at-grille, .qf').first().innerText(),/Dotation Sud/);
  await nav.aller(page,'rg-minutes');
  assert.match(await page.locator('#rg-bareme').innerText(),/Dotation Sud/,'le barème suit sans attendre');
  assert.doesNotMatch(await page.locator('#rg-bareme').innerText(),/Dotation\b(?! Sud)/);

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('services-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

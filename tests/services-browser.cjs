/* Un service, de bout en bout : la porte d'entrée d'un service. « Il manque une
 * équipe » doit se corriger d'un clic, et un service se renomme sans passer
 * par l'édition du plan.
 *
 * Réécrit pour la version 1 à l'évolution 22 (b) : « Liste des services » n'est
 * plus une page. Tout ce qu'elle réglait se règle dans « Services et équipes » —
 * la liste des services à gauche ; dans la fiche d'un service, son nom en tête,
 * « Ajouter une équipe », et dans ses réglages avancés son rattachement, « Voir
 * sur le plan », « Le déplacer sur le plan », « Supprimer ce service » ;
 * « Ajouter un service » en tête de la liste ; les services supprimés, les
 * équipes sans service et les zones du plan qui ne sont pas des services, par
 * le lien du bas de la liste. Les gestes vérifiés sont ceux d'avant. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(200);
 const M='#mu-services';
 /** Un service dans la liste, à gauche ; sa fiche, ouverte ; ses réglages avancés, dépliés ; le panneau du bas de la liste. */
 const ligne=id=>page.locator(`${M} .se-liste [data-mu-choisir="${id}"]`);
 const fiche=async id=>{await nav.service(page,id);await attendre();};
 const avance=async id=>{await fiche(id);await nav.section(page,'avance');await attendre();};
 const supprimes=async()=>{await nav.aller(page,'mu-services');
   if(await page.evaluate(()=>Sim.unite.panneau!=='supprimes')){await page.locator(`${M} [data-se-panneau=supprimes]`).click();await attendre();}};
 const cases=id=>page.evaluate(id=>Sim.ateliers.state.ateliers.filter(a=>a.service===id),id);
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();

  // 1. Un service par ligne de la liste, dans l'espace « L'unité ».
  await nav.aller(page,'mu-services');
  assert.equal(await page.evaluate(()=>document.body.dataset.partie),'organisation');
  assert.equal(await page.locator(`${M} .se-liste [data-mu-choisir]`).count(),await page.evaluate(()=>Sim.ateliers.a.services().length),'tous les services');
  assert.match(await ligne('plonge').textContent(),/aucune équipe/);
  assert.equal(await page.locator('#fc-export').isVisible(),false,'les outils des liens restent sur leur page');

  // 2. « Ajouter une équipe » : l'équipe naît dans ce service, de sa nature (une
  //    plonge lave), et se règle dans sa fiche, ouverte aussitôt.
  await fiche('plonge');
  await page.locator(`${M} [data-mu-action=equipe]`).first().click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-services','on la règle ici');
  assert.equal(await page.locator('.mu-fiche[data-mu-fiche]').getAttribute('data-mu-fiche'),'plonge');
  const pl=(await cases('plonge'))[0];
  assert.ok(pl,'une case dans la plonge');
  assert.equal(pl.type,'lavage','une plonge lave');
  assert.equal(await page.locator(`.mu-fiche [data-at="${pl.id}"]`).first().isVisible(),true,'sa fiche est ouverte');

  // 3. Les contrôles : les quais livrent la plonge sans équipe. Le point à
  //    corriger porte son geste, et une plonge n'est plus « une équipe qui ne prépare rien ».
  await nav.aller(page,'u-lecture');
  assert.match(await page.locator('#fc-alertes').textContent(),/Quais · Réception fournit sans avoir d’équipe/);
  assert.doesNotMatch(await page.locator('#fc-alertes').textContent(),/Plonge : une équipe est décrite mais ne prépare rien/,
    'une plonge lave pour tout le monde : pas d’alerte');
  // Toutes les commandes ont leur chemin : ces liens ne servent pas au calcul. C'est une information, repliée
  // (évolution 19 d) ; on la déplie pour faire le geste.
  await page.locator('#fc-alertes details.avis-information summary').click();await attendre();
  assert.match(await page.locator('#fc-alertes details.avis-information .fc-gestes',{has:page.locator('[data-svc=quais]')}).first().innerText(),/^Facultatif\s*\+ Une équipe dans Quais/,'le geste d’une information dit « Facultatif »');
  await page.locator('#fc-alertes [data-svc-action=equipe][data-svc=quais]').click();await attendre();
  assert.equal((await cases('quais')).length,1,'l’équipe qui manquait est créée d’un clic');
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-services');

  // 4. Retour aux services : la liste dit ce qui a changé.
  await nav.aller(page,'mu-services');
  assert.match(await ligne('quais').textContent(),/1 équipe/,'l’équipe est comptée');
  assert.match(await ligne('plonge').textContent(),/1 équipe/);
  // Une équipe listée ouvre sa fiche.
  await fiche('plonge');
  await page.locator(`${M} .se-equipes tr[data-se-equipe="${pl.id}"]`).click();await attendre();
  assert.equal(await page.evaluate(()=>Sim.unite.equipeOuverte),pl.id);

  // 5. Renommer un service, en tête de sa fiche : le plan, les listes et les chemins suivent.
  await fiche('armement');
  const champ=page.locator(`${M} [data-mu-nom=armement]`);
  await champ.fill('Armement EZY/AF');await champ.press('Enter');await attendre();
  assert.equal(await page.evaluate(()=>Sim.editor.state.zones.find(z=>z.id==='armement').nom),'Armement EZY/AF','le plan porte le nouveau nom');
  assert.ok(await page.evaluate(()=>Sim.ateliers.a.services().some(s=>s.id==='armement'&&/EZY\/AF/.test(s.nom))),'les listes aussi');
  assert.match(await page.locator('#zone-picker').textContent(),/EZY\/AF/,'le choix d’un service sur le plan aussi');
  assert.match(await ligne('armement').textContent(),/EZY\/AF/,'la liste des services aussi');
  // Un nom vide est refusé.
  await page.locator(`${M} [data-mu-nom=armement]`).fill('   ');await page.locator(`${M} [data-mu-nom=armement]`).press('Enter');await attendre();
  assert.equal(await page.evaluate(()=>Sim.editor.state.zones.find(z=>z.id==='armement').nom),'Armement EZY/AF','nom vide refusé');

  // 6. « Voir sur le plan » (dans ses réglages avancés) : le plan rejoué, le service choisi. Sans équipe,
  //    son panneau propose d'en ajouter une. La page s'ouvre en relief (évolution 16) : un service sans équipe n'est pas
  //    dans la scène, et le panneau de la scène le dit, avec la même action ; à plat, c'est le panneau du plan dessiné.
  await avance('armement');
  await page.locator(`${M} [data-mu-action=voir]`).click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'j-plan');
  assert.equal(await page.locator('#zone-picker').inputValue(),'armement');
  assert.match(await page.locator('#goulot-info').textContent(),/Aucune équipe ici/);
  assert.equal(await page.evaluate(()=>document.body.dataset.direct),'relief','la page s’ouvre en relief');
  const visibles=page.locator('#en-ce-moment [data-svc-action=equipe][data-svc=armement]:visible');
  assert.equal(await visibles.count(),1,'en relief : une seule action « ajouter une équipe » à l’écran');
  assert.match(await page.locator('#direct-panneau-corps').innerText(),/Armement EZY\/AF[\s\S]*Aucune équipe ici/,'le panneau de la scène dit le service et qu’il n’a pas d’équipe');
  await page.locator('#direct-choix [data-direct-mode=plat]').click();await attendre();
  assert.ok(await page.locator('#goulot-info [data-svc-action=equipe][data-svc=armement]').isVisible(),'à plat : le panneau du plan dessiné');
  await page.locator('#direct-choix [data-direct-mode=relief]').click();await attendre();
  // Sans service choisi ni journée à rejouer (aucune commande n'a d'équipe) : le panneau de la scène le dit et mène à la
  // description de l'unité, comme celui du plan dessiné.
  await page.locator('#direct-panneau-corps [data-direct-retour]').click();await attendre();
  assert.match(await page.locator('#direct-panneau-corps').innerText(),/Pas encore de journée à rejouer/);
  assert.ok(await page.locator('#direct-panneau-corps [data-page="mu-pas"]').isVisible(),'« Décrire votre unité → » dans le panneau de la scène');
  await avance('armement');await page.locator(`${M} [data-mu-action=voir]`).click();await attendre();
  await visibles.click();await attendre();
  assert.equal((await cases('armement')).length,1,'depuis le plan aussi');

  // 7. « Le déplacer sur le plan » ouvre l'édition du plan.
  await avance('armement');
  await page.locator(`${M} [data-mu-action=plan]`).click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.classList.contains('plan-editing')),true);
  await page.locator('#edit-done').click();await attendre();

  // 8. Toutes les listes de services disent la même chose (retour d'usage :
  //    « Armement EZY/AF n'apparaît pas dans les chemins »).
  const listes=async id=>{const r={};
    r.services=await page.evaluate(id=>Sim.ateliers.a.services().some(s=>s.id===id),id);
    r.plan=await page.evaluate(id=>[...document.querySelectorAll('#zone-picker option')].some(o=>o.value===id),id);
    r.liens=await page.evaluate(id=>Sim.flows.points.some(x=>x.owner===id),id);
    await nav.aller(page,'mu-services');r.page=await ligne(id).count()===1;
    await nav.aller(page,'at-chemins');await page.locator('[data-pc-action=cmd][data-classe="AF/BC"]').click();await attendre();
    // Sans chemin, on le crée : c'est dans son « Ajouter un service » que le service doit figurer.
    await nav.creerChemin(page,'AF/BC');
    r.chemin=await page.locator(`[data-pc-champ=noeud-ajout] option[value="${id}"], .pc-graphe [data-noeud="${id}"]`).count()>0;
    return r;};
  const partout={services:true,plan:true,liens:true,page:true,chemin:true};
  const editer=async fn=>{await nav.aller(page,'j-plan');await page.locator('#btn-edit').click();await attendre();await fn();await page.locator('#edit-done').click();await attendre();};
  //    a. Une zone de production (« Dupliquer » un service) : partout.
  await editer(async()=>{await page.evaluate(()=>Sim.editor.select('dotation'));await page.locator('#pe-duplicate').click();await attendre();
    await page.locator('#pe-name').fill('Dotation EZY');await page.locator('#pe-name').dispatchEvent('change');await attendre();});
  const annexe=await page.evaluate(()=>Sim.editor.state.zones.find(z=>z.nom==='Dotation EZY').id);
  assert.deepEqual(await listes(annexe),partout,'une zone de production est un service partout');
  //    b. Masquée sur le plan : toujours un service (« masquer » ne vaut que pour le dessin).
  await fiche(annexe);await page.locator(`${M} [data-mu-action=equipe]`).first().click();await attendre();
  assert.equal((await cases(annexe)).length,1,'une équipe y travaille');
  await editer(async()=>{await page.evaluate(id=>Sim.editor.change(()=>{Sim.editor.state.zones.find(z=>z.id===id).visible=false;},'x'),annexe);});
  assert.deepEqual(await listes(annexe),partout,'masquée, elle reste dans toutes les listes');
  //    c. Supprimée alors qu'elle porte une équipe : une question (08/10), puis l'équipe passe dans son service parent.
  await editer(async()=>{await page.evaluate(id=>Sim.editor.select(id),annexe);await page.locator('#pe-delete').click();await attendre();
    assert.match(await page.locator('dialog.question[open]').textContent(),/passeront dans «\s*Dotation\s*»/,'la question dit où va son équipe');
    await nav.repondre(page);});
  assert.equal((await cases(annexe)).length,0,'pas d’équipe orpheline');
  assert.ok((await cases('dotation')).some(a=>/Dotation EZY/.test(a.nom)),'elle travaille maintenant en Dotation');
  //    d. Un local dessiné n'est pas un service : le bas de la liste le dit, et en fait un service.
  await editer(async()=>{await page.evaluate(()=>Sim.editor.change(()=>Sim.editor.addZone({x:300,y:100,w:80,h:60}),'x'));
    await page.locator('#pe-name').fill('Armement EZY/AF 2');await page.locator('#pe-name').dispatchEvent('change');await attendre();
    assert.match(await page.locator('#pe-kind-note').textContent(),/pas un service/,'l’éditeur le dit');});
  const local=await page.evaluate(()=>Sim.editor.state.zones.find(z=>z.nom==='Armement EZY/AF 2').id);
  assert.equal((await listes(local)).chemin,false);
  await supprimes();
  assert.match(await page.locator(`${M} .svc-bloc`).last().textContent(),/Zones du plan qui ne sont pas des services[\s\S]*Armement EZY\/AF 2/);
  assert.equal(await page.locator(`${M} [data-svc-parent="${local}"]`).inputValue(),'armement','rattachée au service dont elle porte le nom');
  await page.locator(`${M} [data-svc-convertir="${local}"]`).click();await attendre();
  assert.deepEqual(await listes(local),partout,'devenu service, il est partout');
  //    e. Une équipe dont le service n'existe plus (ancienne sauvegarde) : signalée, puis rattachée.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'orph1',nom:'Équipe perdue',service:'zone-disparue',
    type:'manuel',debut:'05:00',jour:0,personnes:2,pauses:[],lots:[],regime:{actif:true}});},''));
  await nav.aller(page,'u-lecture');
  assert.match(await page.locator('#fc-alertes').textContent(),/Équipe perdue travaille dans un service qui n’existe plus/);
  await supprimes();
  await page.selectOption(`${M} [data-svc-orpheline=orph1]`,'cuisine');await page.locator(`${M} [data-svc-rattacher=orph1]`).click();await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.id==='orph1').service),'cuisine');
  assert.equal(await page.locator('[data-svc-orpheline]').count(),0);

  // 9. Le cycle de vie d'un service, tout depuis cette page (retour d'usage :
  //    « comment je supprime un service, le renommer etc. »).
  //    a. Créer : un nom, un service de rattachement ; il est partout.
  const creer=async(nom,parent)=>{await nav.aller(page,'mu-services');await nav.ajouterService(page);
    await page.fill(`${M} [data-mu-nouveau] input[name=nom]`,nom);
    if(parent){await page.selectOption(`${M} [data-mu-nouveau] select[name=parent]`,parent);await page.selectOption(`${M} [data-mu-nouveau] select[name=genre]`,'salle');}
    await page.locator(`${M} [data-mu-nouveau] button[type=submit]`).click();await attendre();};
  await creer('Froid EZY','prepa');
  const cree=await page.evaluate(()=>(Sim.editor.state.zones.find(z=>z.nom==='Froid EZY')||{}).id);
  assert.ok(cree,'le service est créé');
  assert.equal(await page.evaluate(id=>Sim.editor.state.zones.find(z=>z.id===id).kind,cree),'annexe','une zone de production');
  assert.equal(await page.evaluate(id=>Sim.editor.state.zones.find(z=>z.id===id).parent,cree),'prepa','une salle de plus de la Prépa');
  assert.deepEqual(await listes(cree),partout,'un service créé ici est partout');
  //    b. Un nom déjà pris est refusé.
  const nZones=await page.evaluate(()=>Sim.editor.state.zones.length);
  await creer('froid ezy');
  assert.equal(await page.evaluate(()=>Sim.editor.state.zones.length),nZones,'pas de doublon');
  //    c. Changer de rattachement, dans ses réglages avancés : il reprend les liens de son nouveau service.
  await avance(cree);
  await page.selectOption(`${M} [data-svc-reparent="${cree}"]`,'cuisine');await attendre();
  assert.equal(await page.evaluate(id=>Sim.editor.state.zones.find(z=>z.id===id).parent,cree),'cuisine');
  assert.ok(await page.evaluate(id=>Sim.ateliers.a.liaisons().some(l=>l.from===id||l.to===id),cree),'il hérite des liens de la cuisine');
  //    d. Supprimer : son équipe part avec lui, après une question.
  await fiche(cree);await page.locator(`${M} [data-mu-action=equipe]`).first().click();await attendre();
  assert.equal((await cases(cree)).length,1);
  await avance(cree);
  await page.locator(`${M} [data-mu-action=supprimer]`).click();await attendre();
  await nav.repondre(page);   // il porte une équipe : la question (08/10)
  assert.equal(await page.evaluate(id=>Sim.editor.state.zones.some(z=>z.id===id),cree),false,'le service est supprimé');
  assert.equal((await cases(cree)).length,0,'pas d’équipe orpheline');
  assert.equal(await ligne(cree).count(),0,'plus de ligne');
  //    e. Un service du plan d'origine ne s'efface pas : il sort de l'unité, et se remet depuis le bas de la liste.
  assert.ok(await page.evaluate(()=>Sim.ateliers.a.liaisons().some(l=>l.from==='bobduty'||l.to==='bobduty')),'Duty free est relié');
  await avance('bobduty');
  await page.locator(`${M} [data-mu-action=supprimer]`).click();await attendre();
  if(await page.locator('dialog.question[open]').count())await nav.repondre(page);
  assert.equal(await page.evaluate(()=>Sim.editor.state.zones.some(z=>z.id==='bobduty')),true,'il reste sur le plan d’origine');
  assert.equal(await page.evaluate(()=>Sim.ateliers.a.services().some(s=>s.id==='bobduty')),false,'hors des listes');
  assert.equal(await page.evaluate(()=>Sim.ateliers.a.liaisons().some(l=>l.from==='bobduty'||l.to==='bobduty')),false,'le calcul ne lit plus ses liens');
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#zone-picker option')].some(o=>o.value==='bobduty')),false,'hors du plan');
  assert.equal(await page.evaluate(()=>Sim.flows.points.some(x=>x.owner==='bobduty')),false,'hors des liens');
  await supprimes();
  assert.match(await page.locator(`${M} .svc-bloc`).last().textContent(),/Services supprimés de l’unité[\s\S]*Duty free/);
  await page.locator(`${M} [data-svc-remettre=bobduty]`).click();await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.a.services().some(s=>s.id==='bobduty')),true,'remis dans l’unité');
  assert.ok(await page.evaluate(()=>Sim.ateliers.a.liaisons().some(l=>l.from==='bobduty'||l.to==='bobduty')),'avec ses liens');

  // 10. Un service renommé : ses cases qui portent son nom le suivent, partout
  //     (retour d'usage : « Armement » d'un côté, « Armement AF Équipage » de l'autre).
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
    st.ateliers.push({id:'dt1',nom:'Dotation',service:'dotation',type:'manuel',debut:'05:00',jour:0,personnes:2,pauses:[],lots:[['AF/BC']],regime:{actif:true}});
    st.ateliers.push({id:'dt2',nom:'Dotation AF CREW',service:'dotation',type:'manuel',debut:'05:00',jour:0,personnes:2,pauses:[],lots:[['AF/CREW']],regime:{actif:true}});
    st.ateliers.push({id:'dt3',nom:'Équipe du matin',service:'dotation',type:'manuel',debut:'05:00',jour:0,personnes:2,pauses:[],lots:[['TX/BC']],regime:{actif:true}});},''));
  await fiche('dotation');
  const nomDot=page.locator(`${M} [data-mu-nom=dotation]`);
  await nomDot.fill('Dotation Sud');await nomDot.press('Enter');await attendre();
  const noms=await page.evaluate(()=>['dt1','dt2','dt3'].map(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).nom));
  assert.deepEqual(noms,['Dotation Sud','Dotation Sud AF CREW','Équipe du matin'],'les cases au nom du service le suivent ; un nom choisi reste');
  assert.match(await page.locator(`${M} .se-equipes`).textContent(),/Dotation Sud AF CREW/,'le tableau de ses équipes le montre');
  // Par l'édition du plan aussi, et « Annuler » du plan les ramène.
  await page.evaluate(()=>Sim.editor.change(()=>{Sim.editor.state.zones.find(z=>z.id==='dotation').nom='Dotation Est';},'x'));await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.id==='dt2').nom),'Dotation Est AF CREW');
  await page.evaluate(()=>Sim.editor.undo());await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.id==='dt2').nom),'Dotation Sud AF CREW');
  // Les pages qui listent les services le disent toutes.
  await nav.aller(page,'at-grille');
  assert.match(await page.locator('#at-grille, .qf').first().innerText(),/Dotation Sud/);
  await nav.aller(page,'mu-services');
  assert.match(await ligne('dotation').innerText(),/Dotation Sud/i,'la liste des services suit sans attendre');
  assert.doesNotMatch(await page.locator(`${M} .se-liste`).innerText(),/Dotation\b(?! Sud)/i);

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('services-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

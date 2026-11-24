/* Mon unité (retour d'usage du 29/09) : « que quelqu'un qui connaît uniquement
 * l'unité puisse paramétrer entièrement la simulation ». Le menu (05/10) :
 * Vols · Chemins · Équipes · Simulation · Résultats ; un service se règle dans sa fiche :
 * ce qu'il fait, ses équipes (heure, personnes), ce que chacune prépare (une
 * grille à cocher) et ses minutes. Les chemins suivent tout seuls. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 const st=()=>page.evaluate(()=>JSON.parse(JSON.stringify(Sim.ateliers.state)));
 const chemin=c=>page.evaluate(c=>{const p=OrlyParcours.fluxDe(Sim.ateliers.state,c);return p?{services:MoteurProduction.servicesDuParcours(p),arcs:MoteurProduction.arcsDuParcours(p).map(a=>a.from+'>'+a.to)}:null;},c);
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  await page.waitForTimeout(200);await nav.effectifSaisi(page);   // les personnes se saisissent ici (05/10)

  // 1. Le menu (évolution 22 a) : deux blocs, trois espaces sous « Régler » ; le chemin d'une commande est dans « Chemins ».
  assert.deepEqual(await page.locator('#menu .menu-bloc-titre, #menu .menu-espace-titre').allInnerTexts().then(t=>t.map(x=>x.toLowerCase())),['lire','régler','vols','l’unité','simulation']);
  assert.deepEqual(await page.locator('#menu [data-espace=organisation] [data-sous-onglet]>span:not(.so-badge)').allInnerTexts(),['Services et équipes','Chemins']);   // (évolution 23 a : « Plan » n'est plus au menu)
  // (Évolution 22 c : « Chemins » est une seule page — la liste des chemins, le chemin choisi — sans onglets internes.)
  await page.locator('#menu [data-entree="mu-flux"]').click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-flux','« Chemins » s’ouvre sur la liste des chemins');
  assert.equal(await page.locator('#onglets-internes').isVisible(),false,'sans onglets internes');
  assert.equal(await page.locator('#mu-flux .ch-liste').isVisible(),true);
  assert.equal(await page.locator('[data-mu-graphe]').count(),1,'un seul éditeur de chemin');
  // (Évolution 22 d : « Contrôles » est une seule page — « Prêt à simuler ? », « Contrôles détaillés » et le panneau « Problèmes » en une.)
  await page.locator('#menu [data-entree="mu-pas"]').click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-pas','« Contrôles »');
  assert.equal(await page.locator('#view-title').textContent(),'Contrôles');

  // 2. « Contrôles » : les vols d'exemple (une information), les services sans équipe (à corriger), les commandes que
  //    personne ne prépare (bloquant).
  const pas=await page.locator('#mu-pas').innerText();
  assert.match(await page.locator('#mu-pas .ct-niveau.information').innerText(),/vols d’exemple[\s\S]*Voir dans Programme des vols/);
  assert.match(await page.locator('#mu-pas .ct-niveau.corriger').innerText(),/Vos services et leurs équipes/);
  assert.match(await page.locator('#mu-pas .ct-niveau.bloquant').innerText(),/ne sont préparées par aucune équipe/);
  assert.match(pas,/vols d’exemple/);
  assert.match(pas,/Vos services et leurs équipes/);
  assert.match(pas,/ne sont préparées par aucune équipe/);

  // 3. « Vos services et leurs équipes » mène à « Services et équipes » ; on y ouvre un service.
  await page.locator('#mu-pas .ct-point',{hasText:'Vos services et leurs équipes'}).locator('[data-ct-aller]').click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-services');
  await nav.service(page,'prepa');await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-services');
  assert.equal(await page.locator('.mu-fiche[data-mu-fiche]').getAttribute('data-mu-fiche'),'prepa');
  assert.equal(await page.locator('[data-mu-nature=prepa]').inputValue(),'manuel');

  // 4. Deux équipes ; la première prépare toute la ligne AF, la seconde toute la colonne YC.
  //    (Évolution 22 b : une équipe ajoutée ouvre sa fiche, à la place de celle du service ; on revient au service pour
  //    ajouter la suivante. La fiche d'une équipe s'ouvre aussi d'un clic sur sa ligne du tableau « Ses équipes ».)
  await page.locator('#mu-services .mu-fiche [data-mu-action=equipe]').click();await attendre();
  assert.equal(await page.locator('#mu-services .mu-fiche').getAttribute('data-se-vue'),'equipe','l’équipe ajoutée ouvre sa fiche');
  await nav.retour(page);
  assert.equal(await page.locator('#mu-services .mu-fiche').getAttribute('data-se-vue'),'service','le retour ramène à la fiche du service');
  await page.locator('#mu-services .mu-fiche [data-mu-action=equipe]').click();await attendre();
  const [e1,e2]=(await st()).ateliers.filter(a=>a.service==='prepa').map(a=>a.id);
  assert.ok(e1&&e2,'deux équipes');
  await nav.retour(page);
  assert.deepEqual(await page.locator('#mu-services .mu-fiche .se-equipes tbody tr').evaluateAll(ls=>ls.map(l=>l.dataset.seEquipe)),[e1,e2],'les deux équipes, dans le tableau du service');
  await nav.equipe(page,e1);
  await page.locator(`table[data-mu-equipe="${e1}"] [data-mu-ligne=AF]`).click();await attendre();
  await nav.equipe(page,e2);
  await page.locator(`table[data-mu-equipe="${e2}"] [data-mu-col=YC]`).click();await attendre();
  let s=await st();
  const lots=id=>s.ateliers.find(a=>a.id===id).lots.flat();
  assert.ok(lots(e1).includes('AF/BC')&&lots(e1).includes('AF/YC'),'la ligne AF');
  assert.ok(!lots(e2).includes('AF/YC'),'tout cocher ne prend rien à l’autre équipe');
  assert.ok(lots(e2).includes('TX/YC')&&lots(e2).includes('FWI/YC'),'la colonne YC');
  // L'ordre suit les départs.
  const ech=await page.evaluate(ids=>ids.map(id=>Sim.ateliers.classes.find(c=>c.id===id).echeance),s.ateliers.find(a=>a.id===e1).lots.map(l=>l[0]));
  assert.deepEqual(ech,[...ech].sort((a,b)=>a-b),'la plus pressée d’abord');
  // Cocher une commande de l'autre équipe la déplace.
  await nav.equipe(page,e1);
  await page.locator(`table[data-mu-equipe="${e1}"] [data-mu-cocher="TX/YC"]`).check();await attendre();
  s=await st();
  assert.ok(lots(e1).includes('TX/YC')&&!lots(e2).includes('TX/YC'));
  // Son flux passe par le Montage : rien à demander.
  assert.ok((await chemin('TX/YC')).services.includes('prepa'));
  assert.equal(await page.locator('.mu-q').count(),0);

  // 5. L'heure (tapée en 24 h, chiffre à chiffre : plus de « PM ») et les personnes, dans la ligne de l'équipe.
  const heure=page.locator(`.mu-equipe[data-at="${e1}"] input[data-at-champ=debut]`);
  await heure.click({position:{x:10,y:10}});await page.waitForTimeout(120);
  for(const k of '1415'){await page.keyboard.press(k);await page.waitForTimeout(80);}
  await heure.press('Tab');await attendre();
  const pers=page.locator(`.mu-equipe[data-at="${e1}"] input[data-at-champ=personnes]`);
  await pers.fill('6');await pers.press('Tab');await attendre();
  s=await st();
  assert.equal(s.ateliers.find(a=>a.id===e1).debut,'14:15');
  assert.equal(s.ateliers.find(a=>a.id===e1).personnes,6);

  // 6. Décocher la dernière équipe d'une commande : le site demande s'il faut
  //    retirer le service de son flux — pour tout le flux, ou pour elle seule.
  await nav.equipe(page,e2);
  await page.locator(`table[data-mu-equipe="${e2}"] [data-mu-cocher="FWI/YC"]`).uncheck();await attendre();
  assert.match(await page.locator('.mu-q').innerText(),/reste sur le chemin de FWI YC/);
  const ecoAvant=(await chemin('AF/YC')).services;
  await page.locator('.mu-q [data-mu-q=seul]').click();await attendre();
  assert.ok(!(await chemin('FWI/YC')).services.includes('prepa'),'FWI YC a sa variante, sans Montage');
  assert.deepEqual((await chemin('AF/YC')).services,ecoAvant,'les autres Économie gardent leur flux');
  // … et la grille dit maintenant qu'elle ne passe plus par là.
  assert.match(await page.locator(`table[data-mu-equipe="${e2}"] [data-mu-cocher="FWI/YC"]`).evaluate(e=>e.closest('td').className),/hors/);

  // 7. Les heures de travail se règlent dans la fiche (en heures depuis le 08/10, gardées en minutes).
  //    (Dans la fiche du service, section « Ses temps par vol », repliée d'abord — évolution 22 b.)
  await nav.service(page,'prepa');await nav.section(page,'temps');
  const min=page.locator('#mu-services .mu-fiche .rg-fiche input[data-rg-champ=heures][data-cle="*/BC"]');
  await min.fill('0.7');await min.press('Tab');await attendre();
  assert.equal(await page.evaluate(()=>Sim.reglages.etat.bareme.prepa['*/BC']),42);

  // 8. Un service qui sert tout le monde : « Quels flux en ont besoin ? ».
  await page.locator('[data-mu-choisir=decontam]').click();await attendre();
  assert.equal(await page.locator('[data-mu-nature=decontam]').inputValue(),'dispo');
  assert.ok((await chemin('AF/BC')).services.includes('decontam'));
  const fluxBC=await page.evaluate(()=>OrlyParcours.fluxDe(Sim.ateliers.state,'AF/BC').id);
  // (Un clic, pas « décocher » : en version 1, la fiche change aussitôt — voir plus bas.)
  await page.locator(`[data-mu-besoin="${fluxBC}"]`).click();await attendre();
  assert.ok(!(await chemin('AF/BC')).services.includes('decontam'),'le flux des Business n’a plus besoin de légumerie');
  assert.ok(!(await chemin('TX/BC')).services.includes('decontam'),'pour toutes ses commandes');
  // Évolution 24 (a), version 1 : sortie de son seul chemin, la légumerie ne reçoit plus de personne — c'est un
  // fournisseur. Sa fiche ne règle plus « Quels chemins en ont besoin ? » : elle montre ses clients (aucun encore) et
  // mène à « Chemins › Fournisseurs ». La réception, qui ne fournissait qu'elle dans ce chemin, en est sortie aussi.
  if(await page.evaluate(()=>!!window.OrlyFournisseurs)){
    assert.deepEqual(await page.evaluate(()=>{const f=document.querySelector('#mu-services .se-fiche');return [f.querySelectorAll('[data-mu-besoin]').length,f.querySelectorAll('.fo-clients').length,f.querySelector('.fo-clients-liste').textContent.trim()];}),
      [0,1,'Aucun client pour l’instant.']);
    assert.ok(!(await chemin('AF/BC')).services.includes('appros'),'la réception n’a plus de client dans ce chemin');
    assert.deepEqual(await page.evaluate(()=>Sim.ateliers.state.fournisseurs),{appros:['decontam']},'la liste retient que la légumerie se fournit à la réception : elle retrouvera ce lien en revenant dans un chemin');
  }

  // 9. Une salle de plus du Montage : elle prend sa place dans le chemin.
  await nav.ajouterService(page);
  await page.locator('[data-mu-nouveau] input[name=nom]').fill('Atelier APM');
  await page.locator('[data-mu-nouveau] select[name=parent]').selectOption('prepa');
  // Une salle de plus du Montage : elle se place dans le chemin comme lui (un service
  // à part entière, le choix par défaut depuis le 05/10, n'hérite de rien).
  await page.locator('[data-mu-nouveau] select[name=genre]').selectOption('salle');
  await page.locator('[data-mu-nouveau] button[type=submit]').click();await attendre();
  const apm=await page.locator('.mu-fiche[data-mu-fiche]').getAttribute('data-mu-fiche');
  assert.ok(apm&&apm!=='prepa','la fiche du nouveau service est ouverte');
  await page.locator('#mu-services .mu-fiche [data-mu-action=equipe]').click();await attendre();
  const e3=(await st()).ateliers.find(a=>a.service===apm).id;
  // Aucun flux n'y passe : ses cases ne se cochent pas. Une variante du flux pour CRL Business seule…
  assert.equal(await page.locator(`table[data-mu-equipe="${e3}"] [data-mu-cocher="CRL/BC"]`).isDisabled(),true,'hors de son flux : pas cochable');
  await page.evaluate(apm=>Sim.ateliers.changer(()=>{OrlyParcours.adapter(Sim.ateliers.state,['CRL/BC'],apm,true,Sim.unite.options());},''),apm);await attendre();
  await page.locator(`table[data-mu-equipe="${e3}"] [data-mu-cocher="CRL/BC"]`).check();await attendre();
  const qr=await chemin('CRL/BC');
  assert.ok(qr.services.includes(apm));
  assert.ok(qr.arcs.some(a=>a.endsWith('>'+apm)),'quelqu’un le livre : '+qr.arcs.join(', '));

  // 10. Le calcul lit tout cela : l'équipe du matin prépare, à son heure.
  const lotAF=await page.evaluate(id=>Sim.ateliers.resultat.lots.find(l=>l.atelier===id&&l.classes.includes('AF/BC')),e1);
  assert.ok(lotAF&&lotAF.debut>=14*60+15,'AF BC préparée par l’équipe, à partir de 14:15');

  // 11. Les flux : CRL Business a sa variante, avec l'Atelier APM ; on la voit, on la renomme.
  await nav.aller(page,'mu-flux');
  const v=await page.evaluate(()=>OrlyParcours.fluxDe(Sim.ateliers.state,'CRL/BC'));
  assert.ok(v.type&&v.auto,'une variante partagée');
  await page.locator(`.mu-liste [data-mu-flux-choisir="${v.id}"]`).click();await attendre();
  assert.ok(await page.locator('#mu-flux .gr-noeud[data-noeud="'+apm+'"]').count(),'le diagramme montre le nouveau service');
  // (Évolution 22 c : « Qui le suit » est une section repliée de la fiche du chemin ; dépliée, elle le reste.)
  await nav.sectionChemin(page,'suivi');
  assert.match(await page.locator('#mu-flux .mu-exceptions').innerText(),/CRL · Business suit ce chemin, alors que les Business suivent « Complet »/);
  await page.locator(`[data-mu-flux-nom="${v.id}"]`).fill('Business APM');await page.locator(`[data-mu-flux-nom="${v.id}"]`).press('Tab');await attendre();
  assert.equal(await page.evaluate(id=>Sim.ateliers.state.parcours.find(p=>p.id===id).nom,v.id),'Business APM');
  // TX Business suit aussi ce flux : on la choisit dans la liste.
  await page.locator('#mu-flux [data-mu-flux-ajouter-cmd]').selectOption('TX/BC');await attendre();
  assert.equal(await page.evaluate(()=>OrlyParcours.fluxDe(Sim.ateliers.state,'TX/BC').nom),'Business APM');
  // Et on défait l'exception d'un clic : elle reprend le flux de sa classe.
  await page.locator('#mu-flux [data-mu-flux-retour="TX/BC"]').click();await attendre();
  assert.equal(await page.evaluate(()=>OrlyParcours.fluxDe(Sim.ateliers.state,'TX/BC').nom),'Complet');
  // Une classe se coche… et se décoche.
  const cf=await page.evaluate(()=>Sim.ateliers.state.parcoursCabine.BC);
  await page.locator('#mu-flux [data-mu-flux-classe="BC"]').check();await attendre();
  assert.equal(await page.evaluate(()=>OrlyParcours.fluxDe(Sim.ateliers.state,'AF/BC').nom),'Business APM','toutes les Business le suivent');
  await page.locator('#mu-flux [data-mu-flux-classe="BC"]').uncheck();await attendre();
  assert.equal(await page.evaluate(()=>OrlyParcours.fluxDe(Sim.ateliers.state,'AF/BC')),null,'décochée : la classe n’a plus de flux');
  await page.locator(`.mu-liste [data-mu-flux-choisir="${cf}"]`).click();await attendre();
  await page.locator('#mu-flux [data-mu-flux-classe="BC"]').check();await attendre();
  assert.equal(await page.evaluate(()=>OrlyParcours.fluxDe(Sim.ateliers.state,'AF/BC').nom),'Complet');

  // 12. Flux, services et chemin d'une commande se répondent.
  const sous=()=>page.evaluate(()=>document.body.dataset.sous);
  await nav.aller(page,'mu-services');
  await page.locator('.mu-liste [data-mu-choisir=prepa]').click();await attendre();
  // La fiche d'un service dit les flux qui y passent, et y mène.
  await page.locator(`.mu-fiche [data-mu-voir-flux="${cf}"]`).click();await attendre();
  assert.equal(await sous(),'mu-flux');
  assert.equal(await page.evaluate(()=>Sim.unite.fluxChoisi),cf,'le flux cliqué est ouvert');
  // Un chemin montre, à chaque étape, l'équipe de chacune de ses commandes (évolution 22 c : le tableau de l'étape)…
  assert.equal(await page.locator('#mu-flux [data-mu-flux-chemin]').count(),0,'plus de liste « voir le chemin d’une de ses commandes »');
  await page.locator('#mu-flux [data-mu-graphe] [data-noeud=prepa]').click();await attendre();
  assert.equal(await page.locator('#mu-flux .ch-etape').getAttribute('data-ch-etape'),'prepa');
  assert.equal(await page.locator('#mu-flux .ch-table tr[data-ch-cmd="AF/BC"]').count(),1,'AF Business, à cette étape');
  // … et mène au service.
  await page.locator('#mu-flux .ch-etape [data-mu-ouvrir-svc=prepa]').click();await attendre();
  assert.equal(await sous(),'mu-services');
  assert.equal(await page.locator('#mu-services .mu-fiche').getAttribute('data-mu-fiche'),'prepa');
  // Dans une équipe, une commande de « Dans l'ordre » ouvre son chemin.
  await nav.equipe(page,e1);
  await page.locator(`.mu-equipe[data-at="${e1}"] [data-mu-chemin="AF/BC"]`).click();await attendre();
  // (Évolution 22 c : dans « Chemins », sur le chemin que suit la commande, à l'étape de l'équipe.)
  assert.equal(await sous(),'mu-flux');
  assert.equal(await page.evaluate(()=>Sim.unite.fluxChoisi),cf,'le chemin de sa classe, « Complet »');
  assert.equal(await page.locator('#mu-flux .ch-etape tr.ch-vise').getAttribute('data-ch-cmd'),'AF/BC','la commande, en évidence à l’étape de l’équipe');
  // Un chemin partagé se modifie ici, pour toutes ses commandes : c'est le seul éditeur.
  assert.equal(await page.locator('#mu-flux [data-mu-flux-ajout]').count(),1);
  // Ou la commande a sa variante, qu'on modifie alors sans toucher aux autres.
  await nav.sectionChemin(page,'suivi');
  await page.locator('#mu-flux [data-ch-variante]').selectOption('AF/BC');await attendre();
  const va=await page.evaluate(()=>OrlyParcours.fluxDe(Sim.ateliers.state,'AF/BC'));
  assert.ok(va.type&&va.id!==cf,'une variante à elle');
  assert.equal(await page.evaluate(()=>OrlyParcours.fluxDe(Sim.ateliers.state,'TX/BC').id),cf,'les autres gardent le chemin');
  assert.equal(await page.evaluate(()=>Sim.unite.fluxChoisi),va.id,'la variante est ouverte');
  await page.locator(`#mu-flux .ch-liste [data-mu-flux-choisir="${cf}"]`).click();await attendre();
  assert.equal(await page.evaluate(()=>Sim.unite.fluxChoisi),cf);
  await nav.sectionChemin(page,'suivi');
  await page.locator('#mu-flux [data-mu-flux-suivre="AF/BC"]').click();await attendre();
  assert.equal(await page.evaluate(()=>OrlyParcours.fluxDe(Sim.ateliers.state,'AF/BC').id),cf,'elle reprend le chemin de sa classe');

  // 13. Les pages d'avant ne sont plus des onglets de « Services et équipes » (évolution 22 b) : la page les a reprises.
  //     Leur nom se cherche toujours par « Aller à… », et mène ici.
  await nav.aller(page,'mu-services');
  assert.equal(await page.locator('#onglets-internes').isVisible(),false,'plus d’onglets internes');
  await nav.aller(page,'j-chiffres');
  await page.keyboard.press('Control+k');await page.waitForSelector('dialog.palette [role=option]');
  await page.keyboard.type('Équipes une par une');await attendre();
  const anciennes=page.locator('dialog.palette [role=option]');
  const rang=(await anciennes.evaluateAll(os=>os.map(o=>(o.querySelector('.pal-nom')||o).textContent.trim()))).indexOf('Équipes une par une');
  assert.ok(rang>=0,'« Aller à… » propose encore « Équipes une par une »');
  await anciennes.nth(rang).click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-services','et mène à « Services et équipes »');
  assert.equal(await page.evaluate(()=>document.body.dataset.partie),'organisation');
  assert.equal(await page.locator('#menu [aria-selected=true]').getAttribute('data-entree'),'mu-services','son entrée est marquée');

  // 14. Tout survit au rechargement.
  await page.reload();await attendre();
  s=await st();
  assert.equal(s.ateliers.find(a=>a.id===e1).personnes,6);
  assert.ok(lots(e1).includes('AF/BC'));

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('mon-unite-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

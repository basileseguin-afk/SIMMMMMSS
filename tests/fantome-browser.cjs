/* Un service qu'on ne retrouve pas (retour d'usage : « le service "armement"
 * tout court crée des alertes, je le cherche mais je n'arrive pas à le
 * supprimer »). Le travail se fait dans « Armement AF Équipage » ; le service
 * « Armement » d'origine n'a pas d'équipe. Il doit se trouver, se supprimer
 * d'où on le voit, et ne plus rien laisser derrière lui. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(200);
 const alertes=()=>page.locator('#fc-alertes').innerText();
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();

  // Le décor : une salle « Armement AF Équipage » rattachée à l'Armement, qui
  // porte l'équipe ; les quais aussi. L'Armement d'origine, lui, n'a personne.
  const salle=await page.evaluate(()=>{const id=Sim.editor.nouveauService('Armement AF Équipage','armement');
    Sim.ateliers.creer(id);Sim.ateliers.creer('quais');return id;});
  await attendre();
  const liensSalle=()=>page.evaluate(id=>Sim.ateliers.a.liaisons().filter(l=>l.from===id||l.to===id).map(l=>l.from+'>'+l.to).sort(),salle);
  const avant=await liensSalle();
  assert.ok(avant.includes(salle+'>quais'),'la salle reprend les liens de l’Armement');

  // 1. Les contrôles ne demandent plus une équipe à l'Armement : son travail
  //    se fait dans sa salle. Ils le disent, avec le geste qui le supprime.
  await nav.aller(page,'u-lecture');
  assert.doesNotMatch(await page.locator('#fc-alertes .grave').innerText().catch(()=>''),/Armement(?! AF)[^.]*fournit sans avoir d’équipe/,
    'pas de point à corriger pour un service dont les salles travaillent');
  assert.match(await alertes(),/Armement n’a pas d’équipe : son travail se fait dans Armement AF Équipage/);
  const bouton=page.locator('#fc-alertes [data-svc-action=supprimer][data-svc=armement]');
  assert.equal(await bouton.count(),1,'le geste « Supprimer Armement » est là');

  // 2. Sur la page des services : on le cherche par son nom, et il se supprime
  //    avec un bouton qui s'appelle « Supprimer ».
  await nav.aller(page,'u-services');
  await page.fill('[data-svc-chercher]','armement');await attendre();
  const visibles=await page.locator('.svc-table tbody tr:not([hidden])').evaluateAll(t=>t.map(r=>r.dataset.svc));
  assert.deepEqual(visibles.sort(),['armement',salle].sort(),'la recherche ne garde que les armements');
  assert.match(await page.locator('.svc-table tr[data-svc=armement] [data-svc-retirer]').innerText(),/Supprimer/);
  await page.fill('[data-svc-chercher]','');await attendre();

  // 3. Supprimé depuis les contrôles : sa salle garde ses liens, et plus
  //    aucune alerte ne le nomme.
  await nav.aller(page,'u-lecture');
  await bouton.click();await attendre();
  assert.equal(await page.evaluate(()=>Sim.editor.state.zones.find(z=>z.id==='armement').retire),true,'supprimé de l’unité');
  assert.deepEqual(await liensSalle(),avant,'la salle garde les liens de l’Armement');
  assert.doesNotMatch(await alertes(),/\bArmement\b(?! AF)/,'plus rien ne le nomme');
  await nav.aller(page,'u-services');
  assert.match(await page.locator('.svc-bloc').last().innerText(),/Services supprimés de l’unité[\s\S]*Armement/,'il se remet en bas de page');
  assert.equal(await page.locator(`[data-svc-reparent="${salle}"]`).inputValue(),'armement','la salle reste rattachée à lui');

  // 4. Un « Annuler » des cases, un vieil import… le remettent dans des cases
  //    et des chemins. Il est nommé lisiblement partout, et s'efface d'un clic.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
    st.ateliers.push({id:'fa1',nom:'Armement',service:'armement',type:'manuel',debut:'05:00',jour:0,personnes:2,pauses:[],lots:[['AF/BC']],regime:{actif:true}});
    st.parcours.push({id:'pfa',nom:'Chemin AF/BC',noeuds:['appros','armement','prepa'],liens:[{de:'appros',vers:'armement'},{de:'armement',vers:'prepa'}]});
    st.parcoursClasse['AF/BC']='pfa';},''));
  await attendre();
  await nav.aller(page,'u-services');
  const fantomes=page.locator('[data-svc-fantomes]');
  assert.match(await fantomes.innerText(),/Armement \(supprimé\)[\s\S]*1 case · 1 chemin/,'la page des services le montre en tête');
  await nav.aller(page,'at-equipes');
  const points=await page.locator('#at-anomalies').innerText();
  assert.match(points,/« Armement \(supprimé\) » n’existe plus dans l’unité/);
  assert.doesNotMatch(points,/« armement »/,'jamais son identifiant brut');
  await page.locator('#at-anomalies [data-at-action=fantome-effacer][data-service=armement]').click();await attendre();
  const reste=await page.evaluate(()=>{const st=Sim.ateliers.state;
    return {cases:st.ateliers.filter(a=>a.service==='armement').length,
      chemins:st.parcours.filter(p=>MoteurProduction.servicesDuParcours(p).includes('armement')).length,
      lien:MoteurProduction.arcsDuParcours(st.parcours.find(p=>p.id==='pfa')).map(a=>a.from+'>'+a.to)};});
  assert.deepEqual(reste,{cases:0,chemins:0,lien:[]},'effacé des cases et des chemins');
  assert.equal(await page.locator('#at-anomalies [data-at-action=fantome-effacer]').count(),0);
  await nav.aller(page,'u-services');
  assert.equal(await fantomes.count(),0,'plus rien à effacer');

  // 5. « Passer dans… » : le travail d'un service supprimé rejoint un autre service.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'fa2',nom:'Armement',service:'armement',type:'manuel',
    debut:'05:00',jour:0,personnes:2,pauses:[],lots:[['AF/PC']],regime:{actif:true}});},''));
  await nav.aller(page,'u-services');
  await page.selectOption('[data-svc-vers=armement]',salle);await page.locator('[data-svc-remplacer=armement]').click();await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.id==='fa2').service),salle,'la case passe dans la salle');

  // 6. Remis dans l'unité : il retrouve sa place, sa salle ses liens.
  await page.locator('[data-svc-remettre=armement]').first().click();await attendre();
  assert.equal(await page.evaluate(()=>Sim.ateliers.a.services().some(s=>s.id==='armement')),true);
  assert.deepEqual(await liensSalle(),avant);

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('fantome-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

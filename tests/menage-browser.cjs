/* Évolution 19 (c) — ce qui se supprime, dans la page (v1), sur une unité
 * fictive (tests/plan-rejoue-fictif.cjs) :
 *   1. les temps par vol d'un service qui est une mise à disposition : sa
 *      ligne quitte « Temps par vol par service » (une note le dit), il n'a
 *      pas de colonne dans « Temps par vol » ; ses valeurs restent gardées ;
 *      le service redevient une ligne dès qu'une équipe y prépare ;
 *   2. les stockages du plan rattachés à aucune zone et sans contenu : la
 *      restauration d'une sauvegarde qui en porte le dit en une ligne
 *      (« n stockages vides retirés du plan ») ; le panneau ne les liste
 *      plus ; ils ne sont plus dans la sauvegarde suivante ; un stockage
 *      rattaché, ou renseigné, ne change pas ;
 *   3. la mention « Version 2, en construction » n'est plus dans le menu de
 *      la version 1 ;
 *   4. plus aucune attente en minutes dans les pages de réglage des équipes ;
 *      l'heure de fin simulée reste, avec un lien vers le planning.
 * Aucune donnée de l'unité : tout est fictif. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL=pathToFileURL(path.resolve(__dirname,'../index.html')).href;

/** Les anciens stockages « à rattacher » du plan fictif : deux vides (dont un contenu d'espaces), un renseigné. */
const A_RATTACHER=[{id:'storage-0',nom:'Chambre froide 1',contenu:''},{id:'storage-1',nom:'Chambre froide 2',contenu:'Laitages'},{id:'storage-2',nom:'Local 3',contenu:'   '}];
/** L'unité fictive, dont le plan porte ces stockages, et un stockage vide rattaché à un service (il ne change pas). */
function sauvegarde(){
  const s=F.sauvegardeFictive(),plan=s.contenu['orly-plan-v3'];
  plan.unassignedStorages=A_RATTACHER.map(x=>({...x}));
  const z=plan.zones.find(z=>z.kind==='service');
  z.storages=[...(z.storages||[]),{id:'stock-fictif-vide',nom:'Étagère',contenu:''}];
  return {s,zone:z.id};
}
/** Une attente d'équipe en minutes, telle que les pages de réglage l'écrivaient. */
const ATTENTE=/\d+\s*min d’attente|\(attente\s*\d+\)|attend\s+\d+\s*min|Attend la ligne\s+\d+/;

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=250)=>page.waitForTimeout(ms);
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-menage-'));
 const fichier=(nom,texte)=>{const f=path.join(dossier,nom);fs.writeFileSync(f,texte);return f;};
 try{
  const {s,zone}=sauvegarde();
  // 2 (d'abord, c'est par là que l'unité arrive). La restauration : l'avis dit, en une ligne, ce qui est retiré du plan.
  await page.goto(URL);await attendre(300);
  await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(400);
  await nav.aller(page,'u-sauvegarde');
  await page.locator('#sauvegarde-import').setInputFiles(fichier('unite-fictive.json',JSON.stringify(s)));
  const question=page.locator('dialog.question[open]');
  await question.waitFor({state:'visible',timeout:3000});
  const avis=(await question.innerText()).replace(/\s+/g,' ');
  assert.match(avis,/ 2 stockages vides retirés du plan/,'l’avis de restauration le dit : '+avis);
  const recharge=page.waitForEvent('load');await nav.repondre(page);await recharge;await page.waitForLoadState('load');await attendre(500);
  await F.importerVols(page,nav,fichier,'vols-fictifs.csv',F.volsCsv());
  // Le plan restauré : le stockage renseigné reste « à rattacher » ; les deux vides n'y sont plus ; le stockage rattaché, même vide, est là.
  const planGarde=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('orly-plan-v3')));
  let plan=await planGarde();
  assert.deepEqual(plan.unassignedStorages,[A_RATTACHER[1]],'seul le stockage renseigné reste à rattacher');
  assert.ok(plan.zones.find(z=>z.id===zone).storages.some(x=>x.id==='stock-fictif-vide'&&x.contenu===''),'un stockage rattaché à une zone ne change pas, même vide');
  assert.deepEqual(await page.evaluate(()=>Sim.editor.state.unassignedStorages.map(x=>x.id)),['storage-1']);
  // Une sauvegarde sans stockage vide : l'avis n'en parle pas.
  await nav.aller(page,'u-sauvegarde');
  const [d1]=await Promise.all([page.waitForEvent('download'),page.locator('#sauvegarde-export').click()]);
  const propre=path.join(dossier,'propre.json');await d1.saveAs(propre);
  assert.deepEqual(JSON.parse(fs.readFileSync(propre,'utf8')).contenu['orly-plan-v3'].unassignedStorages,[A_RATTACHER[1]]);
  await page.locator('#sauvegarde-import').setInputFiles(propre);
  await question.waitFor({state:'visible',timeout:3000});
  assert.doesNotMatch(await question.innerText(),/stockage/,'rien à retirer : l’avis n’en parle pas');
  await nav.repondre(page,false);await attendre();

  // Des stockages vides déjà dans le navigateur (un plan d'avant) : le panneau ne les liste plus, et la sauvegarde suivante part sans eux.
  await page.evaluate(liste=>{const p=JSON.parse(localStorage.getItem('orly-plan-v3'));p.unassignedStorages=liste;localStorage.setItem('orly-plan-v3',JSON.stringify(p));},A_RATTACHER);
  await page.reload();await page.waitForLoadState('load');await attendre(600);
  await F.importerVols(page,nav,fichier,'vols-fictifs.csv',F.volsCsv());
  assert.equal((await planGarde()).unassignedStorages.length,3,'rien n’est écrit à la lecture');
  assert.deepEqual(await page.evaluate(()=>Sim.editor.state.unassignedStorages.map(x=>x.id)),['storage-1'],'le panneau ne lit plus les vides');
  // Le panneau des stockages d'un service : « Anciens stockages à rattacher (1) », et seulement le renseigné.
  await page.evaluate(id=>Sim.editor.showService(id),zone);await attendre();
  const panneau=await page.evaluate(()=>[...document.querySelectorAll('#service-storages, #pe-storages')].map(p=>p.textContent).join(' '));
  assert.match(panneau,/à rattacher \(1\)/,'le panneau compte un seul stockage à rattacher : '+panneau.slice(0,200));
  assert.match(panneau,/Chambre froide 2/);assert.doesNotMatch(panneau,/Chambre froide 1|Local 3/,'les stockages vides ne sont plus listés');
  await nav.aller(page,'u-sauvegarde');
  const [d2]=await Promise.all([page.waitForEvent('download'),page.locator('#sauvegarde-export').click()]);
  const suivante=path.join(dossier,'suivante.json');await d2.saveAs(suivante);
  const lue=JSON.parse(fs.readFileSync(suivante,'utf8')).contenu['orly-plan-v3'];
  assert.deepEqual(lue.unassignedStorages,[A_RATTACHER[1]],'la sauvegarde suivante part sans les stockages vides');
  assert.ok(lue.zones.find(z=>z.id===zone).storages.some(x=>x.id==='stock-fictif-vide'),'le stockage rattaché y est toujours');
  // Un changement du plan l'enregistre sans eux.
  await page.evaluate(id=>{Sim.editor.change(()=>{const z=Sim.editor.state.zones.find(z=>z.id===id);z.storages.push({id:'stock-fictif-2',nom:'Armoire',contenu:'Épices'});},'');},zone);await attendre();
  plan=await planGarde();
  assert.deepEqual(plan.unassignedStorages,[A_RATTACHER[1]],'le plan enregistré n’a plus les stockages vides');
  assert.equal(plan.zones.find(z=>z.id===zone).storages.length,2);

  // 1. Les temps par vol : la Légumerie et le Magasin sont des mises à disposition — leur ligne n'est plus dans la page.
  const dispos=await page.evaluate(()=>{const st=Sim.ateliers.state;return [...new Set(st.ateliers.map(a=>a.service))].filter(s=>OrlyJouent.miseADisposition(s,st));});
  assert.deepEqual(dispos.sort(),['decontam','magasin']);
  const gardes=await page.evaluate(()=>JSON.stringify([Sim.reglages.etat.bareme.decontam,Sim.reglages.etat.bareme.magasin]));
  assert.ok(JSON.parse(gardes).every(x=>x&&Object.keys(x).length>0),'ils ont des temps par classe gardés : '+gardes);
  await nav.aller(page,'rg-minutes');await attendre();
  const lignes=()=>page.locator('#rg-bareme details.rg-service').evaluateAll(ds=>ds.filter(d=>d.offsetParent!==null).map(d=>d.dataset.service));
  let visibles=await lignes();
  assert.ok(visibles.length>=8,'les services qui ont des temps par vol ('+visibles.length+')');
  for(const id of dispos)assert.ok(!visibles.includes(id),id+' n’a plus de ligne dans la page');
  assert.equal((await page.locator('#rg-bareme .nj-dispos').innerText()).trim(),'2 services sont des mises à disposition : on vient s’y servir, pas de temps par vol (Magasin, Légumerie).');
  // « Temps par vol » (le tableau) : pas de colonne pour eux non plus.
  await nav.aller(page,'rg-recap');await attendre();
  const colonnes=await page.locator('#view-reglages [data-sous~="rg-recap"] thead th').evaluateAll(ths=>ths.filter(t=>t.offsetParent!==null).map(t=>t.textContent.trim()));
  assert.ok(colonnes.length>=5,'le tableau des temps par vol a ses colonnes ('+colonnes.length+')');
  assert.ok(!colonnes.some(c=>/^(Légumerie|Magasin)\b/.test(c)),'ni la Légumerie ni le Magasin : '+colonnes.join(' | '));
  // Les valeurs restent dans la sauvegarde.
  assert.equal(await page.evaluate(()=>JSON.stringify([Sim.reglages.etat.bareme.decontam,Sim.reglages.etat.bareme.magasin])),gardes,'ses temps gardés n’ont pas bougé');
  assert.deepEqual(JSON.parse(fs.readFileSync(suivante,'utf8')).contenu['ory-modele-v1'].bareme.magasin,JSON.parse(gardes)[1],'la sauvegarde les porte');
  // Dans l'autre sens : une équipe prépare au Magasin, il retrouve sa ligne ; redevenu mise à disposition, il la quitte.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'mag-prepare',nom:'Magasin prépare',service:'magasin',type:'manuel',debut:'05:00',jour:0,personnes:1,pauses:[],lots:[],regime:{actif:true}});},''));
  await nav.aller(page,'rg-minutes');await attendre(400);
  visibles=await lignes();
  assert.ok(visibles.includes('magasin'),'une équipe y prépare : le Magasin a sa ligne');
  assert.equal((await page.locator('#rg-bareme .nj-dispos').innerText()).trim(),'1 service est une mise à disposition : on vient s’y servir, pas de temps par vol (Légumerie).');
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers=Sim.ateliers.state.ateliers.filter(a=>a.id!=='mag-prepare');},''));
  await nav.aller(page,'rg-minutes');await attendre(400);
  assert.ok(!(await lignes()).includes('magasin'),'de nouveau une mise à disposition : plus de ligne');

  // 3. Le menu de la version 1 : plus de mention « Version 2, en construction ».
  assert.equal(await page.locator('#barre .btn-version').count(),0,'plus de lien « Version 2 » dans la barre');
  // La version servie (« version » + l'empreinte de la page) se lit à part : une empreinte qui commence par 2 n'est pas une mention « Version 2 ».
  const servie=await page.locator('#barre .marque-version').innerText();
  assert.match(servie,/^version [0-9a-f]+$/,'la version servie se lit toujours sous la marque');
  assert.doesNotMatch((await page.locator('#barre').innerText()).replace(servie,''),/Version 2|en construction/i);

  // 4. Plus aucune attente en minutes dans les pages de réglage des équipes ; l'heure de fin reste, avec un lien vers le planning.
  const attentes=await page.evaluate(()=>(Sim.ateliers.resultat.ateliers||[]).filter(a=>a.attente>=1).map(a=>a.id));
  assert.ok(attentes.length>0,'la journée fictive a des équipes qui attendent (le calcul n’a pas changé) : '+attentes.length);
  const texte=sel=>page.locator(sel).evaluateAll(es=>es.filter(e=>e.offsetParent!==null).map(e=>e.innerText).join('\n'));
  // « Équipes une par une » : chaque carte, puis la fiche ouverte d'une équipe qui attend.
  await nav.aller(page,'at-equipes');await attendre();
  let lu=await texte('#view-ateliers [data-sous~="at-equipes"]');
  assert.ok(lu.length>500);assert.doesNotMatch(lu,ATTENTE,'aucune attente en minutes dans les cartes');
  assert.match(lu,/→ fin \d\d:\d\d/,'l’heure de fin simulée reste');
  const equipe=attentes[0];
  await page.evaluate(id=>{Sim.ateliers.ouvert=id;Sim.ateliers.rendre();},equipe);await attendre();
  lu=await texte(`#view-ateliers [data-sous~="at-equipes"] article.at-carte.ouverte[data-at="${equipe}"]`);
  assert.doesNotMatch(lu,ATTENTE,'ni dans la fiche ouverte d’une équipe qui attend');
  assert.match(lu,/\d\d:\d\d → \d\d:\d\d/,'chaque lot garde son heure de début et de fin');
  // Le lien vers le planning, à côté de l'heure de fin : il y mène.
  const lien=page.locator(`#view-ateliers [data-sous~="at-equipes"] article.at-carte[data-at="${equipe}"] .at-vers-planning`).first();
  assert.equal((await lien.innerText()).trim(),'planning →');
  await lien.click();await attendre(300);
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'at-planning','le lien mène au planning des équipes');
  // « Horaires des équipes » (le tableau) et « Services et équipes » (chaque service).
  await nav.aller(page,'at-recap');await attendre();
  lu=await texte('#view-ateliers [data-sous~="at-recap"]');
  assert.ok(lu.length>500);assert.doesNotMatch(lu,ATTENTE,'aucune attente en minutes dans le tableau des horaires');
  assert.match(lu,/\d\d:\d\d–\d\d:\d\d/,'les heures de chaque lot restent');
  assert.equal(await page.locator('#view-ateliers [data-sous~="at-recap"] .rc-vers-planning').count(),1,'le lien vers le planning, sur la colonne « Fin »');
  await nav.aller(page,'mu-services');
  for(const id of await page.evaluate(()=>[...new Set(Sim.ateliers.state.ateliers.map(a=>a.service))])){
    await page.evaluate(id=>Sim.unite.ouvrir(id),id);await attendre(200);
    assert.doesNotMatch(await texte('#mu-services'),ATTENTE,id+' : aucune attente en minutes dans la fiche du service');
  }
  assert.deepEqual(errors,[],errors.join(' | '));
  console.log('menage-browser : ok — les mises à disposition hors des temps par vol, les stockages vides retirés et dits, plus de mention « Version 2 », plus d’attente en minutes dans les pages de réglage');
 }catch(e){console.error(e);process.exitCode=1;}finally{fs.rmSync(dossier,{recursive:true,force:true});await browser.close();}
})();

/* Évolution 19 (b) — un réglage qui ne joue pas ne s'affiche pas, dans la
 * page (v1), sur une unité fictive (tests/plan-rejoue-fictif.cjs) :
 *   1. la plonge : par vol, ni le débit des tunnels ni le plafond — la ligne
 *      « n réglages ne jouent pas ici » les montre grisés, avec leur raison ;
 *      au débit, ils reviennent, et ce sont les durées par compagnie qui ne
 *      jouent pas ;
 *   2. le robot : son débit général ne s'affiche que si une de ses commandes
 *      n'a pas le sien (dans sa fiche et dans « Services et équipes ») ;
 *   3. la mise à disposition : l'heure, le jour et les vagues ne s'affichent
 *      qu'« à heures fixes » ;
 *   4. le handling : « vols en même temps » sans chauffeurs comptés ; les
 *      créneaux, saisis et non calculés ;
 *   5. « Temps par vol par service » : un service qui travaille par compagnie
 *      montre ses minutes par compagnie, pas des temps par classe ;
 *   6. « Liens entre services » n'est au menu que si une commande n'a pas de
 *      chemin ; sinon « Aller à… » y mène encore ;
 *   7. rien n'est calculé autrement : revenue à ses réglages de départ, la
 *      journée est la même, champ par champ ;
 *   8. une valeur masquée n'est pas effacée : elle survit à une sauvegarde et
 *      à une restauration, et rejoue quand la situation revient ;
 *   9. ni par Excel (évolution 19, retouche) : « Équipes et chemins » exporté
 *      puis réimporté, la valeur masquée est toujours là, dans les deux sens
 *      (par vol : les débits et le plafond ; au débit : les durées par
 *      compagnie).
 * Aucune donnée de l'unité : tout est fictif. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL=pathToFileURL(path.resolve(__dirname,'../index.html')).href;

/** L'unité fictive, avec des réglages gardés d'une situation d'avant : un plafond à la plonge par vol, un débit propre à la
 *  commande du robot, « 3 vols à la fois » au handling dont les chauffeurs sont comptés, des temps par classe au handling. */
function sauvegarde(){
  const s=F.sauvegardeFictive(),at=s.contenu['ory-ateliers-v1'],mo=s.contenu['ory-modele-v1'],eq=id=>at.ateliers.find(a=>a.id===id);
  eq('pl1').plafond=400;
  eq('rb').debits=Object.fromEntries(eq('rb').lots.flat().map(c=>[c,450]));
  eq('h').simultanes=3;
  mo.bareme.quais={'*/BC':6,'*/YC':9};
  return s;
}

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=250)=>page.waitForTimeout(ms);
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-jouent-'));
 try{
  const x=await F.charger(page,nav,URL,{sauvegarde:sauvegarde(),csv:F.volsCsv(),pageId:'j-chiffres'});
  const equipe=id=>page.evaluate(id=>JSON.parse(JSON.stringify(Sim.ateliers.state.ateliers.find(a=>a.id===id))),id);
  const changer=(id,fn,...args)=>page.evaluate(([id,fn,args])=>{Sim.ateliers.changer(()=>{(new Function('a','args','('+fn+')(a,...args)'))(Sim.ateliers.state.ateliers.find(a=>a.id===id),args);},'');},[id,fn.toString(),args]);
  const resultat=()=>page.evaluate(()=>JSON.stringify(Sim.ateliers.resultat));
  // La journée de départ, une fois les effectifs calculés reportés dans les équipes (un calcul de plus, sans rien changer).
  await page.evaluate(()=>Sim.ateliers.changer(()=>{},''));await attendre(500);
  const depart=await resultat();
  // La fiche d'une équipe, dans « Services et équipes » (évolution 22 b), tous ses réglages dépliés.
  const ouvrir=async id=>{await nav.reglagesEquipe(page,id);await attendre();
    await page.waitForSelector(`#mu-services .se-equipe > article[data-at="${id}"]`);
    return page.locator(`#mu-services .se-equipe > article[data-at="${id}"]`).first();};
  /** Ce que dit la ligne sous une fiche : { n (le compte annoncé), lignes: [[libellé, valeur, raison, grisé ?]] } ; null sans ligne. */
  const ligne=async fiche=>{
    const d=fiche.locator(':scope > .nj-hote details.nj, :scope > .nj-hote > details.nj').first();
    if(!(await d.count()))return null;
    const titre=(await d.locator('summary').innerText()).trim();
    if(!(await d.evaluate(e=>e.open))){await d.locator('summary').click();await attendre(120);}
    const lignes=await d.locator('li').evaluateAll(ls=>ls.map(li=>{const i=li.querySelector('input');
      return [li.querySelector('.nj-champ').textContent.trim(),i.value,li.querySelector('.nj-raison').textContent.trim(),i.disabled];}));
    return {titre,lignes};
  };
  const visible=(fiche,champ)=>fiche.locator(`[data-at-champ="${champ}"]`).evaluateAll(es=>es.filter(e=>!e.closest('.nj-hote')&&e.offsetParent!==null).length);

  // 1. La plonge. Par vol : ni débit de tunnel ni plafond dans la fiche ; la ligne les montre grisés, avec la raison.
  let fiche=await ouvrir('pl1');
  assert.equal((await equipe('pl1')).parVol,true);
  assert.equal(await visible(fiche,'tunnel-debit'),0,'par vol : pas de débit de tunnel');
  assert.equal(await visible(fiche,'plafond'),0,'par vol : pas de plafond');
  assert.ok(await visible(fiche,'duree')>0,'par vol : les durées par compagnie');
  let l=await ligne(fiche);
  assert.equal(l.titre,'3 réglages ne jouent pas ici');
  assert.deepEqual(l.lignes.map(x=>[x[0],x[1],x[3]]),[['Débit de « T1 »','300 u/h',true],['Débit de « T2 »','300 u/h',true],['Débit maximum de l’ensemble','400 u/h',true]]);
  for(const x of l.lignes)assert.equal(x[2],'La plonge lave par vol : un tunnel lave un vol en un temps donné, compagnie par compagnie ; son débit ne compte pas.');
  // Au débit : les débits et le plafond reviennent, avec leurs valeurs ; les durées par compagnie et la vitesse ne jouent plus.
  await fiche.locator('[data-at-champ="plonge-mode"]').selectOption('debit');await attendre();
  fiche=await ouvrir('pl1');
  assert.equal(await visible(fiche,'tunnel-debit'),2,'au débit : un débit par tunnel');
  assert.equal(await fiche.locator('[data-at-champ="plafond"]').inputValue(),'400','au débit : le plafond, sa valeur gardée');
  assert.equal(await visible(fiche,'duree'),0,'au débit : pas de durée par compagnie');
  l=await ligne(fiche);
  assert.equal(l.titre,'2 réglages ne jouent pas ici');
  assert.deepEqual(l.lignes.map(x=>[x[0],x[1]]),[['Temps pour laver un vol, par compagnie','toutes compagnies : 30 min ; NORD : 45 min'],['Vitesse de « T2 »','× 1,5']]);
  for(const x of l.lignes)assert.equal(x[2],'La plonge lave au débit : ce sont les débits des tunnels et le plafond de l’ensemble qui comptent.');
  // Retour par vol : les durées reviennent telles quelles.
  await fiche.locator('[data-at-champ="plonge-mode"]').selectOption('vol');await attendre();
  assert.deepEqual((await equipe('pl1')).durees,{'*':30,NORD:45},'les durées par compagnie n’ont pas bougé');
  assert.equal((await equipe('pl1')).plafond,400);

  // 2. Le robot : chaque commande a son débit, le débit général ne s'affiche pas ; il revient dès qu'une commande n'a plus le sien.
  fiche=await ouvrir('rb');
  assert.equal(await visible(fiche,'debit'),0,'chaque commande a son débit : pas de débit général');
  l=await ligne(fiche);
  assert.equal(l.titre,'1 réglage ne joue pas ici');
  assert.deepEqual(l.lignes,[['Débit du robot','300 pl/h','Chaque commande de ce robot a son propre débit : le débit général ne sert à aucune.',true]]);
  // Dans « Services et équipes » aussi (la fiche du service, dessinée par le module commun).
  const service=async id=>{await nav.aller(page,'mu-services');await page.evaluate(id=>Sim.unite.ouvrir(id),id);
    await page.waitForFunction(id=>Sim.unite.choisi===id&&!!document.querySelector('#mu-services .mu-fiche'),id);await attendre();};
  // (La fiche de l'équipe s'ouvre d'un clic sur sa ligne du tableau « Ses équipes » — évolution 22 b.)
  await service('prepa');await nav.equipe(page,'rb');
  await page.waitForSelector('#view-ateliers article.mu-equipe[data-at="rb"]');
  const dansService=page.locator('#view-ateliers article.mu-equipe[data-at="rb"]').first();
  assert.equal(await visible(dansService,'debit'),0,'dans le service : pas de débit général non plus');
  assert.equal((await ligne(dansService)).titre,'1 réglage ne joue pas ici');
  assert.equal(await page.locator('#view-ateliers article.mu-equipe[data-at="rb"] .nj-hote').count(),1,'une seule ligne par fiche');
  await changer('rb',a=>{a.debits={};});await attendre();
  await service('prepa');await nav.equipe(page,'rb');
  assert.equal(await visible(page.locator('#view-ateliers article.mu-equipe[data-at="rb"]').first(),'debit'),1,'une commande sans débit propre : le débit général revient');
  assert.equal(await ligne(page.locator('#view-ateliers article.mu-equipe[data-at="rb"]').first()),null,'et la ligne s’en va');
  fiche=await ouvrir('rb');
  assert.equal(await visible(fiche,'debit'),1);assert.equal(await fiche.locator('[data-at-champ="debit"]').inputValue(),'300');
  assert.equal(await ligne(fiche),null);

  // 3. La mise à disposition. Toujours ouverte : ni heure, ni jour, ni vague ; la ligne dit pourquoi.
  fiche=await ouvrir('leg');
  assert.equal(await fiche.locator('[data-at-champ="mode-dispo"]').inputValue(),'toujours');
  for(const c of ['debut','jour','vague-debut','vague-jour'])assert.equal(await visible(fiche,c),0,'toujours ouverte : pas de champ « '+c+' »');
  l=await ligne(fiche);
  assert.equal(l.titre,'3 réglages ne jouent pas ici');
  assert.deepEqual(l.lignes.map(x=>[x[0],x[1]]),[['Heure de début','18:00'],['Jour','J-1'],['Vagues','J-1 18:00']]);
  for(const x of l.lignes)assert.equal(x[2],'Toujours ouverte : on s’y sert à tout moment, personne ne l’attend.');
  // Ouverte de … à … : ses heures d'ouverture s'affichent ; l'heure de début et les vagues ne jouent toujours pas.
  fiche=await ouvrir('mag');
  assert.equal(await fiche.locator('[data-at-champ="mode-dispo"]').inputValue(),'boutique');
  assert.equal(await visible(fiche,'ouverture-de'),1);assert.equal(await visible(fiche,'vague-debut'),0);
  l=await ligne(fiche);
  assert.equal(l.titre,'3 réglages ne jouent pas ici');
  for(const x of l.lignes)assert.equal(x[2],'Ouverte de 02:30 à 14:00, chaque jour : ce sont ses heures d’ouverture qui comptent.');
  // À heures fixes : ses vagues s'affichent (heure et jour), et la ligne s'en va.
  fiche=await ouvrir('leg');
  await fiche.locator('[data-at-champ="mode-dispo"]').selectOption('vagues');await attendre();
  fiche=await ouvrir('leg');
  assert.ok(await visible(fiche,'vague-debut')>=1,'à heures fixes : l’heure de chaque vague');
  assert.ok(await visible(fiche,'vague-jour')>=1,'à heures fixes : son jour');
  assert.equal(await ligne(fiche),null,'à heures fixes : tout joue');
  await fiche.locator('[data-at-champ="mode-dispo"]').selectOption('toujours');await attendre();
  assert.equal((await ligne(await ouvrir('leg'))).titre,'3 réglages ne jouent pas ici','de nouveau toujours ouverte');

  // 4. Le handling. Ses chauffeurs sont comptés (des créneaux) : « vols en même temps » ne s'affiche pas.
  fiche=await ouvrir('h');
  assert.equal(await visible(fiche,'simultanes'),0,'des chauffeurs comptés : pas de « vols en même temps »');
  assert.ok(await visible(fiche,'creneau-n')>=2,'les créneaux saisis s’affichent');
  l=await ligne(fiche);
  assert.deepEqual([l.titre,l.lignes],['1 réglage ne joue pas ici',[['Vols en même temps','3','Les chauffeurs sont comptés : c’est leur nombre qui limite les vols menés en même temps.',true]]]);
  // Sans créneau : « vols en même temps » revient, avec sa valeur ; la ligne s'en va.
  const creneaux=(await equipe('h')).creneaux;
  await changer('h',a=>{a.creneaux=[];});await attendre();
  fiche=await ouvrir('h');
  assert.equal(await visible(fiche,'simultanes'),1);assert.equal(await fiche.locator('[data-at-champ="simultanes"]').inputValue(),'3','sa valeur gardée');
  assert.equal(await ligne(fiche),null);
  // Chauffeurs calculés au plus juste (24 h/24) : les créneaux saisis ne s'affichent plus, ni « vols en même temps ».
  await changer('h',(a,cr)=>{a.creneaux=cr;a.handling24h=true;a.chauffeurs={...a.chauffeurs,mode:'calcules'};},creneaux);await attendre(600);
  fiche=await ouvrir('h');
  assert.equal(await fiche.locator('[data-at-champ="chauffeurs-mode"]').inputValue(),'calcules');
  for(const c of ['creneau-de','creneau-a','creneau-n','simultanes'])assert.equal(await visible(fiche,c),0,'chauffeurs calculés : pas de champ « '+c+' »');
  l=await ligne(fiche);
  assert.equal(l.titre,'2 réglages ne jouent pas ici');
  assert.deepEqual(l.lignes.map(x=>[x[0],x[1]]),[['Tournées en même temps','3'],['Créneaux de chauffeurs','03:30–12:00 : 3 ; 12:00–23:30 : 2']]);
  assert.equal(l.lignes[1][2],'Les chauffeurs sont calculés au plus juste : les créneaux saisis ne comptent pas.');
  // Saisis de nouveau : les créneaux reviennent, tels quels.
  await fiche.locator('[data-at-champ="chauffeurs-mode"]').selectOption('saisis');await attendre(600);
  fiche=await ouvrir('h');
  assert.ok(await visible(fiche,'creneau-n')>=2,'saisis : les créneaux s’affichent');
  assert.deepEqual((await equipe('h')).creneaux,creneaux,'les créneaux n’ont pas bougé');
  await changer('h',a=>{delete a.handling24h;const c={...a.chauffeurs};delete c.mode;a.chauffeurs=c;});await attendre(600);

  // 5. Les temps d'un service, dans sa fiche (évolution 22 b : « Temps par vol par service » n'est plus une page) : le
  // handling, la plonge par vol et l'armement (une équipe par compagnie) montrent leurs minutes par compagnie ; un service
  // qui prépare garde ses temps par classe.
  const TEMPS='#mu-services details[data-mu-section=temps]';
  const lire=async id=>{await nav.service(page,id);await nav.section(page,'temps');await attendre(150);const d=page.locator(TEMPS);
    return {titre:(await d.locator(':scope > summary h3').evaluate(h=>h.firstChild.textContent)).trim(),
      champs:await d.locator('[data-rg-champ="heures"]').evaluateAll(es=>es.filter(e=>e.offsetParent!==null).length),
      table:await d.locator('.se-durees tbody tr').evaluateAll(trs=>trs.map(tr=>[tr.children[0].textContent.trim(),tr.children[1].textContent.trim()])),
      entete:await d.locator('.se-durees thead th').evaluateAll(ths=>ths.map(t=>t.textContent.trim())),
      aRemplir:await d.locator('.rg-zero').evaluateAll(es=>es.filter(e=>e.offsetParent!==null).length)};};
  let s=await lire('quais');
  assert.equal(s.champs,0,'le handling : aucun temps par classe');
  assert.deepEqual([s.titre,s.entete,s.table],['Son temps par vol',['Compagnie','min par vol'],[['Toutes compagnies','25'],['NORD','40'],['OUEST','40']]]);
  assert.equal(s.aRemplir,0,'pas de « à remplir » : rien n’est à remplir ici');
  // Ses temps par classe gardés : sous la ligne, grisés.
  l=await ligne(page.locator(TEMPS));
  assert.equal(l.titre,'2 réglages ne jouent pas ici');
  assert.deepEqual(l.lignes.map(x=>[x[0],x[1],x[3]]),[['BC · toutes compagnies','0,1 h par vol',true],['YC · toutes compagnies','0,15 h par vol',true]]);
  for(const x of l.lignes)assert.equal(x[2],'Ce service travaille par compagnie : ses temps par classe ne sont pas lus.');
  s=await lire('plonge');
  assert.deepEqual([s.titre,s.champs,s.entete,s.table],['Ses durées de lavage',0,['Compagnie','min par vol et par tunnel'],[['Toutes compagnies','30'],['NORD','45']]]);
  // L'armement : ses minutes par compagnie se règlent ici même (le tableau de sa fiche).
  await nav.service(page,'armement');await nav.section(page,'temps');await attendre(150);
  assert.equal((await page.locator(`${TEMPS} > summary h3`).evaluate(h=>h.firstChild.textContent)).trim(),'Ses minutes par compagnie');
  assert.equal(await page.locator(`${TEMPS} [data-rg-champ="heures"]`).count(),0,'l’armement : aucun temps par classe');
  assert.ok(await page.locator(`${TEMPS} .mu-cat-table tbody tr`).count()>=2,'ses minutes, une ligne par compagnie');
  s=await lire('prepa');
  assert.ok(s.champs>=5,'un service qui prépare : ses temps par classe ('+s.champs+')');
  assert.deepEqual([s.titre,s.table],['Ses temps par vol et ses débits',[]]);
  // « Ouvrir la fiche de… » mène à l'équipe qui porte les durées.
  await lire('quais');
  await page.locator(`${TEMPS} .se-vers [data-se-equipe]`).first().click();await attendre(300);
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-services');
  assert.deepEqual(await page.evaluate(()=>[Sim.unite.choisi,Sim.unite.equipeOuverte]),['quais','h']);
  // Dans l'autre sens : la plonge passe au débit, ses temps par classe reviennent dans sa fiche.
  await changer('pl1',a=>{a.parVol=false;});await changer('pl2',a=>{a.parVol=false;});await attendre();
  s=await lire('plonge');
  assert.deepEqual(s.table,[],'au débit : la plonge ne travaille plus par compagnie');
  assert.ok(s.champs>=5,'ses temps par classe sont de retour ('+s.champs+')');
  await changer('pl1',a=>{a.parVol=true;});await changer('pl2',a=>{a.parVol=true;});await attendre();

  // 6. « Liens entre services » : toutes les commandes ont un chemin, la page n'est pas au menu ; « Aller à… » y mène.
  //    (Depuis l'évolution 22 a, « au menu » veut dire : parmi les onglets de l'entrée « Chemins ».)
  const entrees=async()=>{await nav.aller(page,'mu-flux');return page.locator('#onglets-internes [data-sous-onglet]').evaluateAll(bs=>bs.map(b=>b.dataset.sousOnglet));};
  assert.equal(await page.evaluate(()=>OrlyOnglets.conditions.liens()),false,'aucune commande sans chemin');
  assert.ok(!(await entrees()).includes('u-liens'),'pas au menu : '+await entrees());
  await page.keyboard.press('Control+k');await page.keyboard.type('Liens entre services');await attendre(200);
  const options=page.locator('dialog.palette [role=option]');
  const i=(await options.evaluateAll(os=>os.map(o=>o.textContent))).findIndex(t=>t.includes('Liens entre services'));
  assert.ok(i>=0,'« Aller à… » la propose');
  await options.nth(i).click();await attendre(300);
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'u-liens','« Aller à… » y mène');
  assert.ok((await page.locator('#onglets-internes [data-sous-onglet]').evaluateAll(bs=>bs.map(b=>b.dataset.sousOnglet))).includes('u-liens'),'tant qu’on y est, son onglet est là');
  assert.equal(await page.locator('#menu [aria-selected=true]').getAttribute('data-entree'),'groupe:chemins','et « Chemins » est marquée');
  assert.ok(!(await entrees()).includes('u-liens'),'on la quitte : elle quitte le menu');
  // Une commande sans chemin (sa classe n'a plus de chemin, elle n'en a pas à elle) : la page revient au menu.
  const sansChemin=await page.evaluate(()=>{const at=Sim.ateliers,c=at.classes.find(x=>!x.categorie&&!(at.state.parcoursClasse||{})[x.id]),avant=at.state.parcoursCabine[c.cabine];
    at.changer(()=>{const p={...at.state.parcoursCabine};delete p[c.cabine];at.state.parcoursCabine=p;},'');return {id:c.id,cabine:c.cabine,avant};});
  await attendre();
  assert.equal(await page.evaluate(()=>OrlyOnglets.conditions.liens()),true,sansChemin.id+' n’a plus de chemin');
  assert.ok((await entrees()).includes('u-liens'),'une commande sans chemin : au menu');
  await page.evaluate(x=>{const at=Sim.ateliers;at.changer(()=>{at.state.parcoursCabine={...at.state.parcoursCabine,[x.cabine]:x.avant};},'');},sansChemin);await attendre();
  assert.equal(await page.evaluate(()=>OrlyOnglets.conditions.liens()),false);
  assert.ok(!(await entrees()).includes('u-liens'),'toutes ont de nouveau un chemin : hors du menu');

  // 7. Aucun calcul ne change : revenue à ses réglages de départ, la journée est la même, champ par champ.
  await changer('rb',a=>{a.debits=Object.fromEntries(a.lots.flat().map(c=>[c,450]));});await attendre(500);
  const cles=a=>[a.id,a.parVol||null,a.plafond??null,a.creneaux||null,a.handling24h||null,a.permanent??null,a.ouverture||null,a.vagues||null,a.debits||null,a.durees||null,a.simultanes??null];
  assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(Sim.ateliers.state.ateliers))).then(l=>l.map(cles)),sauvegarde().contenu['ory-ateliers-v1'].ateliers.map(cles),'les réglages sont ceux du départ');
  /** Le premier écart entre deux valeurs, par son chemin (pour un message lisible). */
  const ecart=(a,b,chemin='')=>{if(a===b)return null;if(typeof a!=='object'||typeof b!=='object'||!a||!b)return chemin+' : '+JSON.stringify(a)+' ≠ '+JSON.stringify(b);
    for(const k of new Set([...Object.keys(a),...Object.keys(b)])){const e=ecart(a[k],b[k],chemin+'/'+k);if(e)return e;}return null;};
  const fin=await resultat();
  assert.equal(ecart(JSON.parse(fin),JSON.parse(depart)),null,'le résultat de la journée est le même, champ par champ');
  assert.equal(fin,depart,'et dans le même ordre');

  // 8. Une valeur masquée n'est jamais effacée : la sauvegarde la porte, la restauration la rend.
  const masquees=async()=>{const pl=await equipe('pl1'),rb=await equipe('rb'),h=await equipe('h'),leg=await equipe('leg');
    return {plafond:pl.plafond,debits:pl.tunnels.map(t=>t.debit),debit:rb.debit,simultanes:h.simultanes,debut:leg.debut,jour:leg.jour,vagues:leg.vagues,
      classes:await page.evaluate(()=>Sim.reglages.etat.bareme.quais)};};
  const avant=await masquees();
  assert.deepEqual(avant,{plafond:400,debits:[300,300],debit:300,simultanes:3,debut:'18:00',jour:-1,vagues:[{debut:'18:00',jour:-1}],classes:{'*/BC':6,'*/YC':9}});
  await nav.aller(page,'u-sauvegarde');
  const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#sauvegarde-export').click()]);
  const fichier=path.join(dossier,'unite.json');await d.saveAs(fichier);
  const lu=JSON.parse(fs.readFileSync(fichier,'utf8')),ats=lu.contenu['ory-ateliers-v1'].ateliers;
  assert.equal(ats.find(a=>a.id==='pl1').plafond,400,'la sauvegarde porte le plafond masqué');
  assert.deepEqual(ats.find(a=>a.id==='pl1').tunnels.map(t=>t.debit),[300,300]);
  assert.equal(ats.find(a=>a.id==='rb').debit,300);assert.equal(ats.find(a=>a.id==='h').simultanes,3);
  assert.deepEqual(lu.contenu['ory-modele-v1'].bareme.quais,{'*/BC':6,'*/YC':9});
  // On efface tout, puis on restaure : les valeurs masquées sont là, et rejouent quand la situation revient.
  await page.evaluate(()=>{Sim.ateliers.changer(()=>{for(const a of Sim.ateliers.state.ateliers){if(a.id==='pl1')a.plafond=0;if(a.id==='h')a.simultanes=1;}},'');});
  await nav.aller(page,'u-sauvegarde');
  await page.locator('#sauvegarde-import').setInputFiles(fichier);
  const recharge=page.waitForEvent('load');await nav.repondre(page);await recharge;await page.waitForLoadState('load');await attendre(500);
  await F.importerVols(page,nav,x.fichier,'vols-fictifs.csv',F.volsCsv());
  assert.deepEqual(await masquees(),avant,'restaurées telles quelles');
  fiche=await ouvrir('pl1');
  assert.equal((await ligne(fiche)).titre,'3 réglages ne jouent pas ici');
  await fiche.locator('[data-at-champ="plonge-mode"]').selectOption('debit');await attendre();
  assert.equal(await (await ouvrir('pl1')).locator('[data-at-champ="plafond"]').inputValue(),'400','le plafond rejoue, avec sa valeur');
  await (await ouvrir('pl1')).locator('[data-at-champ="plonge-mode"]').selectOption('vol');await attendre();

  // 9. Ni par Excel : « Équipes et chemins » exporté puis réimporté, la valeur masquée est toujours là, dans les deux sens.
  const plonge=async()=>{const a=await equipe('pl1');return {parVol:!!a.parVol,plafond:a.plafond,debits:a.tunnels.map(t=>t.debit),vitesses:a.tunnels.map(t=>t.vitesse||1),durees:a.durees};};
  const parExcel=async nom=>{
    await nav.aller(page,'mu-services');
    const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('#at-export').click()]);
    const f=path.join(dossier,nom);await dl.saveAs(f);
    await page.evaluate(()=>{document.getElementById('at-status').textContent='';});
    await page.locator('#at-import').setInputFiles(f);
    await page.waitForFunction(()=>/Équipes importées|Import refusé/.test(document.getElementById('at-status').textContent));
    return page.locator('#at-status').textContent();};
  //    Par vol : le débit des tunnels et le plafond ne jouent pas ; le classeur les porte, ils reviennent tels quels.
  const parVol=await plonge();
  assert.deepEqual(parVol,{parVol:true,plafond:400,debits:[300,300],vitesses:[1,1.5],durees:{'*':30,NORD:45}});
  let statut=await parExcel('par-vol.xlsx');
  assert.match(statut,/^Équipes importées : \d+ équipes/,statut);
  assert.deepEqual(await plonge(),parVol,'par vol : rien ne se perd par Excel');
  assert.doesNotMatch(statut,/gardés? de la page/,'le classeur porte tout : rien à reprendre de la page');
  //    Au débit : les durées par compagnie ne jouent pas, et le classeur ne les porte pas — l'import garde celles de la page.
  await (await ouvrir('pl1')).locator('[data-at-champ="plonge-mode"]').selectOption('debit');await attendre();
  const auDebit=await plonge();
  assert.deepEqual(auDebit,{...parVol,parVol:false},'au débit, les durées sont gardées dans la page');
  statut=await parExcel('au-debit.xlsx');
  assert.match(statut,/^Équipes importées : \d+ équipes/,statut);
  assert.deepEqual(await plonge(),auDebit,'au débit : les durées masquées sont toujours là après l’import');
  assert.match(statut,/réglages? qui ne jouen?t pas ici (sont gardés|est gardé) de la page, le classeur ne les portant pas \(.*temps pour laver un vol, par compagnie/,statut);
  fiche=await ouvrir('pl1');
  l=await ligne(fiche);
  assert.deepEqual(l.lignes.map(x=>[x[0],x[1]]),[['Temps pour laver un vol, par compagnie','toutes compagnies : 30 min ; NORD : 45 min'],['Vitesse de « T2 »','× 1,5']],'la ligne les montre toujours');
  //    Et elles rejouent : repassée par vol, la plonge retrouve ses durées.
  await fiche.locator('[data-at-champ="plonge-mode"]').selectOption('vol');await attendre();
  assert.deepEqual(await plonge(),parVol);

  assert.deepEqual(errors,[],errors.join(' | '));
  x.effacer();
  console.log('jouent-browser : ok — la plonge, le robot, la mise à disposition, le handling, les temps par vol par service et le menu, dans les deux sens ; la ligne et ses raisons ; les valeurs masquées gardées (sauvegarde, classeur Excel) ; le résultat inchangé');
 }catch(e){console.error(e);process.exitCode=1;}finally{fs.rmSync(dossier,{recursive:true,force:true});await browser.close();}
})();

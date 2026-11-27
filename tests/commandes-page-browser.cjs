/* Évolution 26 (c) — la page « Commandes » (version 1), sur l'unité fictive, à 1 366 × 768.
 *   1. La page, première entrée de « Régler » : le compte (« 17 commandes · 5 compagnies »), une rangée par commande
 *      (sa compagnie, sa classe, son chemin, son état) ; le budget de la charte, panneaux ouverts : un seul bouton plein,
 *      12 boutons au plus (les douze teintes sont un choix, pas des boutons), aucune section à déplier, 4 colonnes.
 *   2. « Comme une autre » : NEUVE comme SUD, en Business, Premium, Économie et Équipage. Le panneau montre par avance,
 *      à part, les 4 commandes qui seront créées ; pour chaque classe commune, NEUVE a le chemin, les équipes à chaque
 *      étape et les temps par vol de SUD.
 *   3. Premium, que SUD n'a pas : « à compléter », et un point de « Contrôles » dont le bouton ouvre son chemin, le
 *      clavier sur le choix de son équipe.
 *   4. « Annuler » retire tout : la sauvegarde exportée revient à l'avant, à l'identique.
 *   5. Renommer SUD en SUDISTE garde ses réglages (équipes, temps, chemin) et sa couleur ; « Annuler » revient, et la
 *      sauvegarde d'avant avec lui.
 *   6. « C'est complet » retire le point de « Contrôles » ; « Annuler » le remet.
 *   7. Les autres pages : plus de carte « Couleurs des compagnies » dans le programme des vols ; plus de « + Ajouter une
 *      compagnie ou une classe » dans « Chemins » ni dans la liste des commandes de « Détails » ; un lien mène à
 *      « Commandes ».
 *   8. Les commandes fixes (évolution 26 d) : CANTINE, « Fixe, sans vol », porte le mot « fixe » ; sans quantité, elle ne
 *      pèse sur aucun jour : un point de « Contrôles », dont le bouton ouvre son panneau. Sa quantité par jour, son heure,
 *      ses jours : chacun s'écrit avec sa notification et « Annuler », et le calcul suit ; une quantité fausse est refusée
 *      sous le champ ; le panneau tient le budget de la charte.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;

/** Dans la page : ce qu'une compagnie a de réglé, classe par classe (chemin, équipes, temps par vol), sous son nom. */
const REGLAGES=([cie,cabines])=>{
  const st=Sim.ateliers.state,b=Sim.reglages.etat.bareme,PC=window.OrlyParcours;
  const equipes=id=>st.ateliers.filter(a=>(a.lots||[]).some(l=>[].concat(l).includes(id))).map(a=>a.id).sort();
  const out={};
  for(const cab of cabines){const id=cie+'/'+cab,c=Sim.ateliers.classes.find(x=>x.id===id);
    const ch=c&&PC?PC.fluxDe(st,c):null;
    out[cab]={chemin:ch?ch.id:null,equipes:equipes(id),temps:Object.keys(b).map(s=>(b[s]||{})[id]??null)};}
  out.armement=equipes(cie+'/@ARM');
  out.compagnie={handling:(st.ateliers.find(a=>a.id==='h')||{}).durees?.[cie]??null};
  return out;
};
/** Le budget de la règle 8 sur la page telle qu'elle se voit : boutons (sans les teintes), sections à déplier, colonnes,
 *  boutons pleins. */
const BUDGET=()=>{
  const z=document.getElementById('mu-commandes'),vu=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight;};
  const boutons=[...z.querySelectorAll('button,summary,[role=button],a.btn,label.btn')].filter(vu);
  const pleins=boutons.filter(b=>getComputedStyle(b).backgroundColor===getComputedStyle(document.documentElement).getPropertyValue('--ds-accent').trim()||b.matches('.btn-play')&&getComputedStyle(b).color===getComputedStyle(document.body).getPropertyValue('--ds-sur-accent').trim());
  return {boutons:boutons.filter(b=>b.getAttribute('role')!=='radio').length,teintes:boutons.filter(b=>b.getAttribute('role')==='radio').length,
    deplier:[...z.querySelectorAll('details,[aria-expanded]')].filter(vu).length,colonnes:Math.max(0,...[...z.querySelectorAll('table')].map(t=>t.rows[0]?t.rows[0].cells.length:0)),
    pleins:boutons.filter(b=>b.matches('.btn-play')).map(b=>b.textContent.trim())};
};
const rangDe=(page,nom)=>page.evaluate(n=>{const e=document.querySelector('#mu-commandes [data-co-compagnie="'+n+'"] [data-pa-rang]');return e?e.dataset.paRang:null;},nom);

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-commandes-'));
 const erreurs=[];
 try{
  const ctx=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce',acceptDownloads:true});
  const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
  const exporter=async nom=>{
    await nav.aller(page,'u-sauvegarde');
    const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#sauvegarde-export').click()]);
    const f=path.join(dossier,nom);await d.saveAs(f);return JSON.parse(fs.readFileSync(f,'utf8'));
  };
  const attendre=ms=>page.waitForTimeout(ms);
  const site=await F.charger(page,nav,URL_V1,{pageId:'mu-commandes'});
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.commandes&&Sim.reglages);await attendre(300);
  const avant=await exporter('avant.json');
  await nav.aller(page,'mu-commandes');await attendre(300);

  /* 1. La page. */
  assert.equal(await page.evaluate(()=>{const e=document.querySelector('#menu [data-bloc="regler"] [data-entree]');return e?e.dataset.entree:null;}),'mu-commandes','« Commandes » : la première entrée de « Régler »');
  assert.equal(await page.locator('#mu-commandes .co-compte').textContent(),'17 commandes · 5 compagnies','le compte');
  const lignes=await page.$$eval('#mu-commandes tbody.co-groupe tr',l=>l.map(t=>[...t.querySelectorAll('td')].map(c=>c.textContent.trim())));
  assert.equal(lignes.length,17,'une rangée par commande');
  assert.deepEqual(await page.$$eval('#mu-commandes [data-co-ouvrir]',l=>l.map(e=>e.dataset.coOuvrir)),['EST','NORD','OUEST','SUD','ZEN'],'les compagnies, dans l’ordre de la liste');
  assert.deepEqual(await page.$$eval('#mu-commandes thead th',l=>l.map(e=>e.textContent)),['Compagnie','Classe','Chemin','État']);
  assert.deepEqual(lignes.find(l=>l[0]==='Économie'&&l[1]==='Sans cuisine'),['Économie','Sans cuisine',lignes.find(l=>l[0]==='Économie')[2]],'une rangée : sa classe, son chemin, son état');
  assert.ok(lignes.every(l=>l[2]==='complète'||/^sans équipe à |cochée hors de son chemin|à voir dans « Contrôles »/.test(l[2])),'l’état : « complète », ou ce qui manque, en peu de mots — '+JSON.stringify(lignes.map(l=>l[2])));
  let b=await page.evaluate(BUDGET);
  assert.deepEqual(b.pleins,['+ Ajouter une compagnie'],'un seul bouton plein : « + Ajouter une compagnie »');
  assert.equal(b.deplier,0,'aucune section à déplier');assert.equal(b.colonnes,4);assert.ok(b.boutons<=12,'12 boutons au plus : '+b.boutons);

  /* 2. « Comme une autre » : NEUVE comme SUD. */
  await page.locator('#mu-commandes [data-co-action="ouvrir-ajout"]').click();await attendre(200);
  const panneau=page.locator('#mu-commandes .co-panneau[data-co-panneau="ajout"]');
  assert.equal(await panneau.count(),1,'le panneau d’ajout s’ouvre à côté de la liste');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.coChamp),'nom','le clavier est sur le nom');
  await page.keyboard.type('neuve');
  assert.equal(await panneau.locator('.co-apercu .pa-cie').textContent(),'NEUVE','la pastille se dessine à la frappe');
  for(const c of ['BC','PC','CREW'])await panneau.locator(`[data-co-champ="cabine"][value="${c}"]`).check();
  await panneau.locator('[data-co-champ="mode"][value="modele"]').check();
  await panneau.locator('[data-co-champ="modele"]').selectOption('SUD');await attendre(200);
  assert.equal(await panneau.locator('.co-bilan').textContent(),'4 commandes seront créées');
  assert.equal(await panneau.locator('[data-co-action="valider"]').textContent(),'Ajouter les 4 commandes');
  assert.deepEqual(await page.$$eval('#mu-commandes tbody.co-prevues tr',l=>l.map(t=>[...t.querySelectorAll('td')].map(c=>c.textContent.trim()))),
    [['Business','Complet','à créer'],['Premium','Complet','à compléter'],['Économie','Sans cuisine','à créer'],['Équipage','Complet','à créer']],'les commandes qui seront créées, montrées à part, par avance');
  b=await page.evaluate(BUDGET);
  assert.deepEqual(b.pleins,['Ajouter les 4 commandes'],'panneau ouvert : le seul bouton plein est le sien');
  assert.equal(b.deplier,0);assert.ok(b.boutons<=12,'panneau ouvert : '+b.boutons+' boutons');
  const sud=await page.evaluate(REGLAGES,['SUD',['BC','YC','CREW']]);
  await panneau.locator('[data-co-action="valider"]').click();await attendre(600);
  assert.equal(await page.locator('#mu-commandes .co-panneau').count(),0,'le panneau se ferme');
  assert.equal(await page.locator('#mu-commandes .co-compte').textContent(),'21 commandes · 6 compagnies');
  const notif=page.locator('.notifs .notif').filter({hasText:'NEUVE ajoutée'});
  assert.match((await notif.textContent()).replace(/\s+/g,' '),/NEUVE ajoutée : 4 commandes, comme SUD\. Premium est à compléter : voir « Contrôles »\./);
  const neuve=await page.evaluate(REGLAGES,['NEUVE',['BC','YC','CREW']]);
  assert.deepEqual(neuve,sud,'« comme une autre » : pour chaque classe commune, le chemin, les équipes de chaque étape et les temps par vol de SUD');
  assert.ok(neuve.BC.equipes.length&&neuve.BC.chemin,'Business a des équipes et un chemin');
  assert.equal(await page.evaluate(()=>Sim.ateliers.resultat.ok),true,'le calcul se fait');
  assert.ok(await page.evaluate(()=>['NEUVE/BC','NEUVE/YC','NEUVE/CREW','NEUVE/PC'].every(id=>Sim.ateliers.classes.some(c=>c.id===id))),'les 4 commandes sont dans la journée');

  /* 3. Premium, que SUD n'a pas : à compléter. */
  const pc=page.locator('#mu-commandes tr[data-co-commande="NEUVE/PC"] .co-etat');
  assert.equal(await pc.textContent(),'à compléter');
  assert.deepEqual(await page.evaluate(REGLAGES,['NEUVE',['PC']]).then(r=>r.PC.equipes),[],'Premium : aucune équipe');
  await nav.aller(page,'mu-pas');await attendre(400);
  const point=page.locator('#mu-pas .ct-point',{hasText:'NEUVE · Premium est à compléter'});
  assert.equal(await point.count(),1,'un point de « Contrôles »');
  assert.deepEqual(await point.locator('[data-ct-aller]').evaluateAll(bs=>bs.map(x=>x.textContent)),['Régler dans Chemins →'],'son bouton mène à « Chemins »');
  await point.locator('[data-ct-aller]').click();
  await page.waitForFunction(()=>document.body.dataset.sous==='mu-flux'&&!!document.activeElement&&document.activeElement.matches('select[data-ch-equipe]'),null,{timeout:5000});
  assert.deepEqual(await page.evaluate(()=>{const e=document.activeElement;return {commande:e.dataset.chEquipe,vise:!!e.closest('.ch-vise')};}),{commande:'NEUVE/PC',vise:true},
    'le bouton ouvre son chemin, le clavier sur le choix de son équipe');
  /* 4. « Annuler » l'ajout retire tout. */
  await nav.aller(page,'mu-commandes');await attendre(300);
  await page.locator('.notifs .notif').filter({hasText:'NEUVE ajoutée'}).getByRole('button',{name:'Annuler'}).click();await attendre(600);
  assert.equal(await page.locator('#mu-commandes .co-compte').textContent(),'17 commandes · 5 compagnies','« Annuler » retire les commandes');
  assert.deepEqual((await exporter('annule.json')).contenu,avant.contenu,'« Annuler » : la sauvegarde revient à l’avant, à l’identique');
  await nav.aller(page,'mu-commandes');await attendre(300);

  /* 5. Renommer garde réglages et couleur. */
  const sudAvant=await page.evaluate(REGLAGES,['SUD',['BC','YC','CREW','SPML']]),rangSud=await rangDe(page,'SUD');
  assert.ok(rangSud,'SUD a une couleur');
  await page.locator('#mu-commandes [data-co-ouvrir="SUD"]').click();await attendre(200);
  const pSud=page.locator('#mu-commandes .co-panneau[data-co-panneau="compagnie"]');
  assert.equal(await pSud.count(),1,'un clic sur une compagnie ouvre son panneau');
  assert.equal(await page.locator('#mu-commandes tbody.co-groupe.choisie').getAttribute('data-co-compagnie'),'SUD','sa rangée est la rangée choisie');
  b=await page.evaluate(BUDGET);
  assert.equal(b.teintes,12,'les douze teintes');assert.deepEqual(b.pleins,['+ Ajouter une compagnie']);assert.ok(b.boutons<=12,'panneau d’une compagnie : '+b.boutons+' boutons');
  await pSud.locator('[data-co-champ="renommer"]').fill('sudiste');await pSud.locator('[data-co-champ="renommer"]').press('Enter');await attendre(600);
  assert.ok(await page.locator('#mu-commandes [data-co-ouvrir="SUDISTE"]').count(),'SUDISTE dans la liste');
  assert.equal(await page.locator('#mu-commandes [data-co-ouvrir="SUD"]').count(),0);
  const sudiste=await page.evaluate(REGLAGES,['SUDISTE',['BC','YC','CREW','SPML']]);
  for(const cab of ['BC','YC','CREW','SPML']){
    assert.deepEqual(sudiste[cab].equipes,sudAvant[cab].equipes,cab+' : ses équipes');
    assert.deepEqual(sudiste[cab].temps,sudAvant[cab].temps,cab+' : ses temps par vol');
  }
  assert.deepEqual(sudiste.armement,sudAvant.armement,'son armement');
  assert.equal(await rangDe(page,'SUDISTE'),rangSud,'sa couleur');
  assert.match((await page.locator('.notifs .notif').filter({hasText:'s’appelle maintenant SUDISTE'}).textContent()).replace(/\s+/g,' '),/SUD s’appelle maintenant SUDISTE : ses réglages et sa couleur suivent\./);
  await page.locator('.notifs .notif').filter({hasText:'s’appelle maintenant SUDISTE'}).getByRole('button',{name:'Annuler'}).click();await attendre(600);
  assert.ok(await page.locator('#mu-commandes [data-co-ouvrir="SUD"]').count(),'« Annuler » : SUD revient');
  assert.equal(await rangDe(page,'SUD'),rangSud,'avec sa couleur');
  assert.deepEqual((await exporter('renomme-annule.json')).contenu,avant.contenu,'renommer puis « Annuler » : la sauvegarde d’avant');

  /* 6. De nouveau NEUVE comme SUD : « C'est complet » retire le point, « Annuler » le remet. */
  await nav.aller(page,'mu-commandes');await attendre(300);
  await page.locator('#mu-commandes [data-co-action="ouvrir-ajout"]').click();await attendre(200);
  await page.keyboard.type('neuve');await panneau.locator('[data-co-champ="cabine"][value="PC"]').check();
  await panneau.locator('[data-co-champ="modele"]').selectOption('SUD');await panneau.locator('[data-co-action="valider"]').click();await attendre(600);
  assert.equal(await pc.textContent(),'à compléter');
  await nav.aller(page,'mu-pas');await attendre(300);
  await page.locator('#mu-pas .ct-point',{hasText:'NEUVE · Premium est à compléter'}).getByRole('button',{name:'C’est complet'}).click();await attendre(400);
  assert.equal(await page.locator('#mu-pas .ct-point',{hasText:'NEUVE · Premium est à compléter'}).count(),0,'« C’est complet » retire le point');
  await nav.aller(page,'mu-commandes');await attendre(300);
  assert.notEqual(await pc.textContent(),'à compléter','plus « à compléter »');
  await page.locator('.notifs .notif').filter({hasText:'est complète'}).getByRole('button',{name:'Annuler'}).click();await attendre(400);
  assert.equal(await pc.textContent(),'à compléter','« Annuler » : de nouveau à compléter');

  /* 7. Les autres pages. */
  await nav.aller(page,'v-programme');await attendre(300);
  assert.equal(await page.locator('#couleurs-compagnies,.pa-carte').count(),0,'plus de carte « Couleurs des compagnies » dans le programme des vols');
  assert.ok(!/Couleurs des compagnies/.test(await page.locator('#workspace').innerText()));
  for(const id of ['mu-flux','at-repas']){
    await nav.aller(page,id);await attendre(300);
    assert.equal(await page.locator('button:visible',{hasText:/^\+ Ajouter une compagnie ou une classe/}).count(),0,id+' : plus de « + Ajouter une compagnie ou une classe »');
    assert.equal(await page.locator('.at-ajout-ouvrir,.at-ajout-form').count(),0,id+' : plus de formulaire d’ajout');
    assert.equal(await page.locator(id==='mu-flux'?'#mu-flux .at-vers-commandes':'.at-vers-commandes:visible').count(),1,id+' : un lien vers « Commandes »');
  }
  await nav.aller(page,'at-repas');await attendre(300);
  const lien=page.locator('.at-vers-commandes:visible');
  assert.equal((await lien.textContent()).trim(),'Ajouter une compagnie ou une classe : Commandes →');
  await lien.click();await attendre(300);
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-commandes','le lien mène à « Commandes »');
  /* 8. Les commandes fixes (évolution 26 d) : CANTINE, « Fixe, sans vol », comme EST, en Économie. */
  const panneauCie=page.locator('#mu-commandes .co-panneau[data-co-panneau="compagnie"]');
  const derniere=async()=>(await page.locator('.notifs .notif').last().textContent()).replace(/\s+/g,' ').replace(/\s*Annuler$/,'');
  const cantine=()=>page.evaluate(()=>{const r=Sim.ateliers.resultat,l=r.lots.find(x=>x.vol==='CANTINE-FIXE'&&x.depart!=null);
    return {pax:(r.parClasse['CANTINE/YC']||{pax:0}).pax,depart:l?l.depart:null};});
  await nav.aller(page,'mu-commandes');await attendre(300);
  await page.locator('#mu-commandes [data-co-action="ouvrir-ajout"]').click();await attendre(200);
  await page.keyboard.type('cantine');await panneau.locator('[data-co-champ="type"][value="fixe"]').check();
  assert.equal(await panneau.locator('[data-co-champ="modele"]').inputValue(),'EST');
  await panneau.locator('[data-co-action="valider"]').click();await attendre(600);
  const rangeeCantine=page.locator('#mu-commandes tbody[data-co-compagnie="CANTINE"] tr');
  assert.deepEqual(await rangeeCantine.evaluateAll(l=>l.map(t=>[...t.querySelectorAll('td')].map(c=>c.textContent.replace(/\s+/g,' ').trim()))),
    [['Économie fixe',(await page.evaluate(()=>Sim.commandes.a.cheminDe('EST/YC').nom)),'ne pèse sur aucun jour']],'le mot « fixe » ; sans quantité, elle ne pèse sur aucun jour');
  assert.deepEqual(await cantine(),{pax:0,depart:null},'aucun départ tant qu’elle n’a pas de quantité');
  // Le point de « Contrôles » ; son bouton ouvre le panneau de CANTINE.
  await nav.aller(page,'mu-pas');await attendre(300);
  const pointFixe=page.locator('#mu-pas .ct-point',{hasText:'CANTINE · Économie ne pèse sur aucun jour'});
  assert.equal(await pointFixe.count(),1,'un point « à corriger » dans « Contrôles »');
  await pointFixe.getByRole('button',{name:/Régler dans Commandes/}).click();await attendre(400);
  assert.deepEqual([await page.evaluate(()=>document.body.dataset.sous),await panneauCie.getAttribute('data-co-nom')],['mu-commandes','CANTINE'],'son bouton ouvre le panneau de CANTINE');
  assert.equal(await panneauCie.locator('[data-co-champ="type-cie"][value="fixe"]').isChecked(),true,'« Fixe, sans vol »');
  const champ=k=>panneauCie.locator('[data-co-fixe="YC"][data-co-fixe-champ="'+k+'"]');
  assert.deepEqual([await champ('quantite').inputValue(),await champ('heure').inputValue(),await panneauCie.locator('[data-co-fixe="YC"][type=checkbox]:checked').count()],['0','12:00',7],'au départ : 0 par jour, 12:00, tous les jours cochés');
  b=await page.evaluate(BUDGET);
  assert.deepEqual([b.pleins,b.deplier,b.colonnes<=7,b.boutons<=12],[['+ Ajouter une compagnie'],0,true,true],'le panneau d’une commande fixe tient le budget : '+JSON.stringify(b));
  // Une quantité fausse est refusée sous le champ ; rien n'est écrit.
  const nNotifs=await page.locator('.notifs .notif').count();
  await champ('quantite').fill('-3');await champ('quantite').press('Tab');await attendre(400);
  assert.match(await panneauCie.locator('.champ-erreur').textContent(),/nombre entier, de 0 à 99 999/,'le refus dit quoi faire');
  assert.deepEqual([await champ('quantite').inputValue(),await page.locator('.notifs .notif').count()],['0',nNotifs],'le champ reprend sa valeur, aucune notification');
  // 80 par jour : un départ à 12:00, 80 en éco ; le point s'en va. Puis 09:30.
  await champ('quantite').fill('80');await champ('quantite').press('Tab');await attendre(600);
  assert.equal(await derniere(),'CANTINE · Économie, commande fixe : 80 par jour.');
  assert.deepEqual(await page.evaluate(()=>document.activeElement.dataset.coFixeChamp),'heure','Tab : le clavier est sur l’heure');
  assert.deepEqual(await cantine(),{pax:80,depart:720},'un départ à 12:00, avec sa quantité');
  assert.equal(await rangeeCantine.locator('td.co-etat').textContent(),await page.locator('#mu-commandes tbody[data-co-compagnie="EST"] tr').first().locator('td.co-etat').textContent(),
    'elle pèse : plus de point, l’état de son modèle');
  assert.equal(await page.evaluate(()=>Sim.problemes.liste.filter(p=>p.cle==='fixe:CANTINE/YC').length),0);
  await champ('heure').fill('930');await champ('heure').press('Enter');await attendre(600);
  assert.equal(await derniere(),'CANTINE · Économie, commande fixe : départ à 09:30.');
  assert.deepEqual(await cantine(),{pax:80,depart:570},'son départ : 09:30');
  await page.locator('.notifs .notif').last().getByRole('button',{name:'Annuler'}).click();await attendre(500);
  assert.deepEqual([await champ('heure').inputValue(),(await cantine()).depart],['12:00',720],'« Annuler » : 12:00');
  // Une saisie validée par un clic sur une case : les deux comptent (le clic n'est pas perdu au nouveau dessin).
  await champ('quantite').fill('81');await panneauCie.locator('[data-co-fixe="YC"][data-co-fixe-champ="jour-7"]').click();await attendre(600);
  assert.deepEqual([await champ('quantite').inputValue(),await panneauCie.locator('[data-co-fixe="YC"][data-co-fixe-champ="jour-7"]').isChecked()],['81',false],'la quantité et la case');
  await panneauCie.locator('[data-co-fixe="YC"][data-co-fixe-champ="jour-7"]').check();await attendre(400);
  await champ('quantite').fill('80');await champ('quantite').press('Enter');await attendre(600);
  // Un jour décoché : la journée type garde son départ (il reste six jours) ; « Avec des vols » retire les réglages fixes.
  await panneauCie.locator('[data-co-fixe="YC"][data-co-fixe-champ="jour-1"]').uncheck();await attendre(500);
  assert.equal(await derniere(),'CANTINE · Économie, commande fixe : plus le lundi.');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.coFixeChamp),'jour-1','le clavier reste sur la case');
  assert.equal((await cantine()).pax,80);
  await panneauCie.locator('[data-co-champ="type-cie"][value="vols"]').check();await attendre(500);
  assert.equal(await derniere(),'CANTINE : des commandes avec des vols. Ses commandes fixes sont retirées.');
  assert.deepEqual([await panneauCie.locator('.co-fixes').count(),await rangeeCantine.locator('.co-fixe').count(),(await cantine()).pax],[0,0,0],'plus de commandes fixes : sans vol, aucune quantité');
  await page.locator('.notifs .notif').last().getByRole('button',{name:'Annuler'}).click();await attendre(500);
  assert.deepEqual([await champ('quantite').inputValue(),await panneauCie.locator('[data-co-fixe="YC"][type=checkbox]:checked').count(),(await cantine()).pax],['80',6,80],'« Annuler » : ses réglages fixes reviennent');

  assert.deepEqual(erreurs,[],'aucune erreur dans la page');
  await site.effacer();
  console.log('OK commandes-page : le compte et une rangée par commande, budget de la charte tenu panneaux ouverts ; « comme une autre » donne à NEUVE le chemin, les équipes et les temps de SUD pour chaque classe commune, '
   +'Premium à compléter avec son point de « Contrôles » qui ouvre son chemin, retiré par « C’est complet » ; « Annuler » rend la sauvegarde d’avant ; renommer garde réglages et couleur ; plus de carte des couleurs ni d’ajout ailleurs, un lien vers « Commandes », première entrée de « Régler » ; une commande fixe : le mot « fixe », son point de « Contrôles » qui ouvre son panneau, sa quantité, son heure et ses jours, chacun avec « Annuler », une quantité fausse refusée');
 }finally{fs.rmSync(dossier,{recursive:true,force:true});await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

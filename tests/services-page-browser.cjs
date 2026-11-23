/* « Services et équipes » (version 1, évolution 22 b) — six pages en une, sur l'unité fictive.
 *   1. À gauche, la liste des services, de l'amont vers l'aval, avec pour chacun son nombre d'équipes ou « toujours
 *      ouvert » ; en tête, « Ajouter un service » ; en bas, les services supprimés.
 *   2. À droite, la fiche du service : son nom et son type en tête, « Voir ce service dans les résultats », « Ses
 *      équipes » en tableau (équipe, début, jour, personnes, ce qu'elle prépare), « Ses temps par vol » (ou ses minutes
 *      par compagnie, ses débits, ses durées de lavage : ce qui joue pour lui), « Réglages avancés », repliés.
 *   3. Un clic sur une ligne ouvre la fiche de l'équipe au même endroit, avec tous ses réglages et un retour.
 *   4. Aucun résultat sur la page : ni heure de fin, ni attente, ni charge, ni effectif calculé — pour chaque service et
 *      chaque équipe.
 *   5. Chaque réglage d'une équipe, d'un service et des temps par vol se modifie depuis cette page et se retrouve dans
 *      la sauvegarde, à l'identique de ce que donnait l'ancienne page : les mêmes gestes sont faits dans la version 2
 *      (gelée), qui porte les pages d'avant, et les deux sauvegardes changent des mêmes champs, aux mêmes valeurs.
 *   6. La page ne défile pas : chaque colonne défile seule.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href,URL_V2=pathToFileURL(path.resolve(__dirname,'../v2/index.html')).href;
const M='#mu-services';
const CLES=['ory-ateliers-v1','ory-modele-v1','orly-plan-v3'];

/** Ce qui a changé d'un état à l'autre : [chemin du champ, sa nouvelle valeur] (absent : `null`), trié. */
function ecarts(avant,apres,chemin='',out=[]){
  if(JSON.stringify(avant)===JSON.stringify(apres))return out;
  const objet=x=>x!==null&&typeof x==='object';
  if(!objet(avant)||!objet(apres)||Array.isArray(avant)!==Array.isArray(apres)){out.push([chemin,apres===undefined?null:apres]);return out;}
  for(const k of new Set([...Object.keys(avant),...Object.keys(apres)]))ecarts(avant[k],apres[k],chemin+'/'+k,out);
  return out.sort((x,y)=>x[0].localeCompare(y[0]));
}

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 const ouvrir=async url=>{
  const ctx=await browser.newContext({viewport:{width:1366,height:768}});
  const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
  const site=await F.charger(page,nav,url,{pageId:'mu-services'});
  return {page,ctx,site};
 };
 const attendre=(page,ms=250)=>page.waitForTimeout(ms);
 /** La sauvegarde, telle que « Tout sauvegarder » l'écrirait : ses parties qui portent les services, les équipes, les temps. */
 const sauvegarde=page=>page.evaluate(cles=>Object.fromEntries(cles.map(k=>[k,JSON.parse(localStorage.getItem(k)||'null')])),CLES);
 const equipeDe=(page,nom)=>page.evaluate(nom=>(Sim.ateliers.state.ateliers.find(a=>a.nom===nom)||{}).id,nom);
 try{
  const v1=await ouvrir(URL_V1),page=v1.page;

  /* ---- 1. la liste : de l'amont vers l'aval ; un nombre d'équipes, ou « toujours ouvert » ------------------------- */
  const attendu=await page.evaluate(()=>Sim.unite.ordre(Sim.ateliers.a.services()).map(s=>{
    const cases=Sim.ateliers.state.ateliers.filter(a=>a.service===s.id);
    return [s.id,s.nom,OrlyServicesPage.sousTitre(OrlyParcours.natureService(Sim.ateliers.state,s.id,s.nom),cases)];}));
  const liste=await page.locator(`${M} .se-liste .mu-svc`).evaluateAll(bs=>bs.map(b=>[b.dataset.muChoisir,b.querySelector('b').textContent,b.querySelector('small').textContent]));
  assert.deepEqual(liste,attendu,'la liste suit l’ordre des chemins, de l’amont vers l’aval, et dit le nombre d’équipes de chacun');
  assert.ok(liste.some(l=>l[2]==='toujours ouvert'),'une mise à disposition toujours ouverte le dit : '+JSON.stringify(liste.map(l=>l[2])));
  assert.ok(liste.some(l=>/^\d+ équipes?$/.test(l[2]))&&liste.some(l=>l[2]==='aucune équipe'),'les autres, leur nombre d’équipes');
  assert.equal(await page.locator(`${M} .se-liste > :first-child`).evaluate(e=>e.matches('details.se-ajout')),true,'« Ajouter un service », en tête de la liste');
  assert.match(await page.locator(`${M} .se-ajout > summary`).innerText(),/Ajouter un service/);
  assert.equal(await page.locator(`${M} .mu-groupe`).count(),0,'plus de groupes « Utilisés » / « Pas utilisés »');
  // À l'ouverture, des sections repliées : « Ses équipes » ouverte, les temps et les réglages avancés repliés.
  await nav.service(page,'cuisine');
  assert.deepEqual(await page.locator(`${M} .se-fiche details.mu-etape`).evaluateAll(ds=>ds.map(d=>[d.dataset.muSection,d.querySelector('h3').firstChild.textContent,d.open])),
    [['equipes','Ses équipes',true],['temps','Ses temps par vol',false],['avance','Réglages avancés',false]],'trois sections ; les temps et l’avancé, repliés');
  // « Ajouter un service » : le formulaire se déplie ; le service créé est choisi.
  assert.equal(await page.locator(`${M} [data-mu-nouveau] [name=nom]`).isVisible(),false,'replié d’abord');
  await nav.ajouterService(page);
  await page.locator(`${M} [data-mu-nouveau] [name=nom]`).fill('Atelier fictif');
  await page.locator(`${M} [data-mu-nouveau] button[type=submit]`).click();await attendre(page);
  const neuf=await page.evaluate(()=>(Sim.editor.state.zones.find(z=>z.nom==='Atelier fictif')||{}).id);
  assert.ok(neuf,'le service est créé');
  assert.equal(await page.locator(`${M} .se-fiche`).getAttribute('data-mu-fiche'),neuf,'sa fiche s’ouvre');
  // Supprimé (depuis ses réglages avancés), il se retrouve par le lien du bas de la liste.
  await nav.section(page,'avance');
  assert.match(await page.locator(`${M} [data-mu-section=avance] .se-rattache`).innerText(),/Rattaché à/,'son rattachement, dans les réglages avancés');
  assert.equal(await page.locator(`${M} [data-mu-section=avance] [data-svc-reparent="${neuf}"]`).count(),1);
  assert.deepEqual(await page.locator(`${M} [data-mu-section=avance] [data-mu-action]`).evaluateAll(bs=>bs.map(b=>b.dataset.muAction)),['supprimer','plan'],'« Supprimer », puis le lien vers le plan, en bas des réglages avancés (évolution 23 a : « Voir sur le plan » n’y est plus)');
  assert.equal((await page.locator(`${M} [data-mu-section=avance] [data-mu-action=plan]`).innerText()).trim(),'Placer ce service sur le plan →');
  assert.equal(await page.locator(`${M} .se-tete [data-mu-action]`).count(),0,'plus de boutons en tête de fiche');
  // Un service du plan d'origine, supprimé : il se retrouve par le lien du bas de la liste, et se remet.
  await nav.service(page,'bobduty');await nav.section(page,'avance');
  await page.locator(`${M} [data-mu-section=avance] [data-mu-action=supprimer]`).click();await nav.repondre(page).catch(()=>{});await attendre(page,400);
  assert.equal(await page.locator(`${M} .se-liste [data-mu-choisir=bobduty]`).count(),0,'supprimé, il quitte la liste');
  const lien=page.locator(`${M} .se-liste [data-se-panneau=supprimes]`);
  assert.equal(await page.locator(`${M} .se-liste > :last-child`).evaluate(e=>e.matches('[data-se-panneau=supprimes]')),true,'le lien des services supprimés, en bas de la liste');
  assert.match(await lien.innerText(),/1 service supprimé/);
  await lien.click();await attendre(page);
  assert.equal(await page.locator(`${M} .se-fiche`).getAttribute('data-se-vue'),'supprimes');
  assert.match(await page.locator(`${M} .se-supprimes`).innerText(),/Services supprimés de l’unité/);
  await page.locator(`${M} .se-supprimes [data-svc-remettre=bobduty]`).click();await attendre(page,400);
  assert.equal(await page.locator(`${M} .se-liste [data-mu-choisir=bobduty]`).count(),1,'« Remettre dans l’unité » le ramène dans la liste');
  await page.locator(`${M} [data-se-retour]`).click();await attendre(page);
  assert.equal(await page.locator(`${M} .se-fiche`).getAttribute('data-se-vue'),'service','le retour ramène à la fiche d’un service');

  /* ---- 2. la fiche d'un service ------------------------------------------------------------------------------------- */
  await nav.service(page,'cuisine');
  assert.equal(await page.locator(`${M} .se-tete [data-mu-nom=cuisine]`).isVisible(),true,'son nom, en tête');
  assert.equal(await page.locator(`${M} .se-tete [data-mu-nature=cuisine]`).inputValue(),'manuel','ce qu’il fait, en tête : son type');
  assert.equal(await page.locator(`${M} [data-mu-nature]`).count(),1,'le type se choisit à un seul endroit');
  // « Ses équipes » : un tableau, une ligne par équipe, ce qu'on a réglé.
  assert.deepEqual(await page.locator(`${M} .se-equipes thead th`).allInnerTexts().then(t=>t.map(x=>x.toLowerCase())),['équipe','début','jour','personnes','ce qu’elle prépare']);
  const lignes=await page.locator(`${M} .se-equipes tbody tr`).evaluateAll(ls=>ls.map(l=>[l.dataset.seEquipe,...[...l.children].map(c=>c.textContent.trim())]));
  const lignesAttendues=await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>a.service==='cuisine').map(a=>{
    const e=OrlyServicesPage.resumeEquipe(a,{calcule:Sim.ateliers.effectifSeCalcule(a),etiquette:c=>OrlyParcours.etiquette(c)});return [a.id,e.nom,e.debut,e.jour,e.personnes,e.prepare];}));
  assert.deepEqual(lignes,lignesAttendues,'une ligne par équipe : son nom, son début, son jour, ses personnes, ce qu’elle prépare');
  assert.equal(lignes.length,2);
  assert.equal(await page.locator(`${M} .se-fiche [data-mu-action=equipe]`).isVisible(),true,'« Ajouter une équipe », sous le tableau');
  // L'effectif du service, sous le tableau : replié, sa ligne dit le choix en cours.
  assert.match(await page.locator(`${M} details.se-effectif > summary`).innerText(),/^Effectif de ses équipes : (calculé, d’après ses temps par vol et les vols|constant : le nombre de personnes saisi|imposé \(essai\))$/);
  assert.equal(await page.locator(`${M} details.se-effectif`).evaluate(d=>d.open),false);
  assert.equal(await page.locator(`${M} .se-fiche article[data-at]`).count(),0,'les fiches des équipes ne sont pas dans celle du service');
  // Ce qui joue pour lui, rien d'autre : la section des temps change de nom et de contenu avec le type du service.
  const sections={},natures={};
  for(const [id] of attendu){await nav.service(page,id);
    natures[id]=await page.locator(`${M} .se-tete [data-mu-nature]`).inputValue();
    sections[id]=await page.locator(`${M} .se-fiche details[data-mu-section=temps] h3`).evaluateAll(hs=>hs.map(h=>h.firstChild.textContent)).then(t=>t[0]||null);}
  for(const [id] of attendu){
   const n=natures[id],t=sections[id];
   if(n==='dispo'||n==='atelier')assert.equal(t,null,id+' : une mise à disposition n’a pas de temps par vol');
   else if(n==='categories')assert.equal(t,'Ses minutes par compagnie',id);
   else if(n==='handling')assert.equal(t,'Son temps par vol',id);
   else if(n==='robot')assert.equal(t,'Ses temps par vol et ses débits',id);
   else if(n==='lavage')assert.match(t,/^Ses durées de lavage$|^Ses temps par classe et ses débits$/,id);
   else assert.equal(t,'Ses temps par vol',id);
  }
  assert.ok(new Set(Object.values(natures)).size>=5&&new Set(Object.values(sections)).size>=5,'les types de l’unité fictive : '+JSON.stringify([natures,sections]));
  // Une mise à disposition où une équipe prépare aussi a ses temps par vol ; redevenue mise à disposition, elle les quitte.
  const dispo=attendu.map(x=>x[0]).find(id=>natures[id]==='dispo');
  assert.ok(dispo,'l’unité fictive a une mise à disposition');
  const aSesTemps=async id=>{await nav.service(page,id);return await page.locator(`${M} .se-fiche details[data-mu-section=temps]`).count()>0;};
  await page.evaluate(svc=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.push({id:'se-prepare',nom:'Équipe qui prépare',service:svc,type:'manuel',debut:'05:00',jour:0,personnes:1,pauses:[],lots:[],regime:{actif:true}});},''),dispo);
  await attendre(page,400);
  assert.equal(await aSesTemps(dispo),true,dispo+' : une équipe y prépare, il a ses temps par vol');
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers=Sim.ateliers.state.ateliers.filter(a=>a.id!=='se-prepare');},''));
  await attendre(page,400);
  assert.equal(await aSesTemps(dispo),false,dispo+' : de nouveau une mise à disposition, plus de temps par vol');
  // « Voir ce service dans les résultats » : la Synthèse, sur sa ligne.
  await nav.service(page,'cuisine');
  await page.locator(`${M} .se-tete [data-se-resultats=cuisine]`).click();await attendre(page,400);
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'j-chiffres','le lien mène aux résultats');
  assert.equal(await page.evaluate(()=>{const l=document.activeElement&&document.activeElement.closest('tr[data-service]');return l?l.dataset.service:null;}),'cuisine','sur la ligne du service');

  /* ---- 3. la fiche d'une équipe, au même endroit, avec un retour ---------------------------------------------------- */
  await nav.service(page,'cuisine');
  const [cu1]=lignes.map(l=>l[0]);
  const boite=await page.locator(`${M} .se-fiche`).boundingBox();
  await page.locator(`${M} .se-equipes tr[data-se-equipe="${cu1}"] td`).nth(1).click();await attendre(page);
  assert.equal(await page.locator(`${M} .se-fiche`).getAttribute('data-se-vue'),'equipe','un clic sur la ligne ouvre la fiche de l’équipe');
  assert.deepEqual(await page.locator(`${M} .se-fiche`).boundingBox(),boite,'au même endroit');
  assert.equal(await page.locator(`${M} .se-fiche article.mu-equipe[data-at="${cu1}"]`).count(),1);
  assert.equal(await page.locator(`${M} .se-fiche article[data-at]`).evaluateAll(as=>new Set(as.map(a=>a.dataset.at)).size),1,'elle seule');
  assert.match(await page.locator(`${M} .se-retour`).innerText(),/←\s*Cuisine froide/i,'un retour au service');
  // Tous ses réglages : ceux de la fiche du service d'avant, et ceux qui ne se réglaient que dans « Équipes une par une ».
  await page.locator(`${M} article.mu-equipe[data-at="${cu1}"] details.mu-plus > summary`).click();await attendre(page);
  const champs=await page.locator(`${M} .se-fiche [data-at-champ]`).evaluateAll(es=>[...new Set(es.filter(e=>e.getBoundingClientRect().width>0).map(e=>e.dataset.atChamp))]);
  for(const c of ['nom','debut','jour','effectif','service','type','ordreSouple','poste','regime','presence-contrat','lot-nouveau'])assert.ok(champs.includes(c),'le champ « '+c+' » : '+champs.join(' '));
  assert.ok(await page.locator(`${M} table[data-mu-equipe="${cu1}"] [data-mu-cocher]`).count()>5,'sa grille : ce qu’elle prépare');
  // Au clavier : le nom de l'équipe, dans le tableau, est un bouton.
  await page.locator(`${M} [data-se-retour]`).click();await attendre(page);
  assert.equal(await page.locator(`${M} .se-fiche`).getAttribute('data-se-vue'),'service','le retour ramène à la fiche du service');
  await page.locator(`${M} .se-eq-nom[data-se-equipe="${cu1}"]`).focus();await page.keyboard.press('Enter');await attendre(page);
  assert.equal(await page.locator(`${M} .se-fiche`).getAttribute('data-se-vue'),'equipe','Entrée sur le nom ouvre la fiche');
  // Choisir un autre service referme la fiche de l'équipe.
  await nav.service(page,'dotation');
  assert.equal(await page.locator(`${M} .se-fiche`).getAttribute('data-se-vue'),'service');
  // Une équipe ajoutée ouvre sa fiche ; « Aller à… » mène à la fiche d'une équipe.
  await page.locator(`${M} .se-fiche [data-mu-action=equipe]`).click();await attendre(page);
  assert.equal(await page.locator(`${M} .se-fiche`).getAttribute('data-se-vue'),'equipe','une équipe ajoutée ouvre sa fiche');
  const ajoutee=await page.evaluate(()=>Sim.unite.equipeOuverte);
  assert.equal(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).service,ajoutee),'dotation');
  await page.evaluate(id=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;st.ateliers=st.ateliers.filter(a=>a.id!==id);},''),ajoutee);await attendre(page);
  assert.equal(await page.locator(`${M} .se-fiche`).getAttribute('data-se-vue'),'service','supprimée, sa fiche se referme');
  await nav.aller(page,'j-chiffres');
  await page.keyboard.press('Control+k');await page.waitForSelector('dialog.palette [role=option]');
  await page.keyboard.type('Plonge soir');await attendre(page,200);
  await page.locator('dialog.palette [role=option]').filter({hasText:'Plonge soir'}).first().click();await attendre(page,300);
  assert.deepEqual(await page.evaluate(()=>[document.body.dataset.sous,document.querySelector('#mu-services .se-fiche').dataset.seVue,Sim.ateliers.state.ateliers.find(a=>a.id===Sim.unite.equipeOuverte).nom]),
    ['mu-services','equipe','Plonge soir'],'« Aller à… » ouvre la fiche de l’équipe');

  /* ---- 4. aucun résultat sur la page ------------------------------------------------------------------------------ */
  assert.ok(await page.evaluate(()=>Sim.ateliers.resultat.ok!==false&&Sim.ateliers.resultat.lots.length>0&&Object.keys(Sim.ateliers.resultat.effectifs||{}).length>0),'la journée se calcule, avec des effectifs calculés');
  const RESULTATS=()=>{const f=document.querySelector('#mu-services .se-fiche'),vu=e=>e.getBoundingClientRect().width>0;
    return {fin:[...f.querySelectorAll('.mu-eq-fin,.at-lot-fin')].map(e=>e.textContent.trim()).filter(Boolean),
      planning:f.querySelectorAll('.at-vers-planning').length,
      calcule:[...f.querySelectorAll('[data-at-calcule],[data-rg-calcule]')].length,
      nombres:[...f.querySelectorAll('.at-pers-calc output')].map(e=>e.textContent.trim()).filter(t=>t!=='calculé'),
      charge:[...f.querySelectorAll('.mu-cat-vols,.mu-cat-jour')].filter(vu).length,
      texte:(f.innerText.match(/finit à \d|→ fin|fin \d\d:\d\d|dernière commande à|\d+ min d’attente|en retard|calculé ·/g)||[])};};
  const vide={fin:[],planning:0,calcule:0,nombres:[],charge:0,texte:[]};
  let fiches=0;
  for(const [id] of attendu){
   await nav.service(page,id);
   for(const cle of ['temps','avance','retours'])await nav.section(page,cle);
   assert.deepEqual(await page.evaluate(RESULTATS),vide,id+' : la fiche du service ne montre aucun résultat');
   const equipes=await page.locator(`${M} .se-equipes tbody tr`).evaluateAll(ls=>ls.map(l=>l.dataset.seEquipe));
   for(const e of equipes){
    await nav.equipe(page,e,id);
    const plus=page.locator(`${M} .se-fiche details.mu-plus`);
    if(await plus.count()&&!(await plus.evaluate(d=>d.open))){await plus.locator('> summary').click();await attendre(page,150);}
    assert.deepEqual(await page.evaluate(RESULTATS),vide,id+' › '+e+' : la fiche de l’équipe ne montre aucun résultat');
    fiches++;
   }
  }
  assert.ok(fiches>=10,fiches+' fiches d’équipe parcourues');
  // Un effectif calculé le dit, sans nombre ; saisi, il se saisit.
  await nav.service(page,'dotation');
  const calculees=await page.locator(`${M} .se-equipes tbody tr td:nth-child(4)`).allInnerTexts();
  assert.ok(calculees.length&&calculees.every(t=>t==='calculé'||/^\d+ pers\.$/.test(t)),'personnes : « calculé » ou un nombre saisi — '+calculees.join(' | '));

  /* ---- 5. chaque réglage se retrouve dans la sauvegarde, à l'identique de l'ancienne page (la version 2) ------------- */
  const v2=await ouvrir(URL_V2);
  // Les mêmes gestes dans les deux versions ; seul le chemin jusqu'au champ diffère (dans la version 2, les pages d'avant).
  const plusDe=async(p,id)=>{const d=p.locator(`${M} article.mu-equipe[data-at="${id}"] details.mu-plus`);
    if(await d.count()&&!(await d.evaluate(x=>x.open))){await d.locator('> summary').click();await attendre(p,150);}};
  const saisir=async(p,sel,v)=>{const c=p.locator(sel).first();await c.fill(String(v));await c.press('Tab');await attendre(p);};
  const ids={};
  for(const nom of ['Montage EST','Plonge matin','Robot','Quais'])ids[nom]=await equipeDe(page,nom);
  const cu=await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(a=>a.service==='cuisine').map(a=>a.id));
  // Une commande que la première équipe de cuisine peut cocher, et qu'elle ne prépare pas encore.
  await nav.equipe(page,cu[0]);
  const libre=await page.locator(`${M} table[data-mu-equipe="${cu[0]}"] [data-mu-cocher]:not(:disabled):not(:checked)`).evaluateAll(cs=>(cs[0]||{dataset:{}}).dataset.muCocher||null);
  const GESTES=[
   ['le nom d’une équipe',async p=>{await nav.equipe(p,ids['Montage EST']);await saisir(p,`${M} [data-at="${ids['Montage EST']}"] [data-at-champ=nom]`,'Montage EST du matin');}],
   ['son heure de début',async p=>{await nav.equipe(p,ids['Montage EST']);await saisir(p,`${M} [data-at="${ids['Montage EST']}"] [data-at-champ=debut]`,'06:30');}],
   ['son jour',async p=>{await nav.equipe(p,ids['Montage EST']);await p.locator(`${M} [data-at="${ids['Montage EST']}"] [data-at-champ=jour]`).first().selectOption('-1');await attendre(p);}],
   ['l’effectif constant du service',async p=>{await nav.effectif(p,'cuisine');await p.locator(`${M} [data-mu-effectif=cuisine]`).check();await attendre(p);}],
   ['les personnes d’une équipe',async p=>{await nav.equipe(p,cu[0]);await saisir(p,`${M} [data-at="${cu[0]}"] [data-at-champ=personnes]`,5);}],
   ['le choix « Effectif » d’une équipe',async p=>{await nav.equipe(p,cu[1]);await p.locator(`${M} [data-at="${cu[1]}"] [data-at-champ=effectif]`).first().selectOption('calcule');await attendre(p);}],
   ...(libre?[['ce qu’elle prépare (une commande cochée)',async p=>{await nav.equipe(p,cu[0]);await p.locator(`${M} table[data-mu-equipe="${cu[0]}"] [data-mu-cocher="${libre}"]`).check();await attendre(p);}]]:[]),
   ['son poste avec pauses',async p=>{await nav.equipe(p,cu[0]);await plusDe(p,cu[0]);await p.locator(`${M} [data-at="${cu[0]}"] [data-at-champ=regime]`).first().setChecked(true);await attendre(p);}],
   ['sa présence',async p=>{await nav.equipe(p,cu[0]);await plusDe(p,cu[0]);await saisir(p,`${M} [data-at="${cu[0]}"] [data-at-champ=presence]`,450);}],
   ['un arrêt programmé de plus',async p=>{await nav.equipe(p,cu[0]);await plusDe(p,cu[0]);
     const d=p.locator(`${M} [data-at="${cu[0]}"] details.at-arrets`).first();if(!(await d.evaluate(x=>x.open))){await d.locator('> summary').click();await attendre(p,150);}
     await p.locator(`${M} [data-at="${cu[0]}"] [data-at-action=pause-ajouter]`).first().click();await attendre(p);}],
   ['les superviseurs du service',async p=>{await nav.service(p,'cuisine');await nav.section(p,'avance');await saisir(p,`${M} [data-mu-encadrement=cuisine]`,2);}],
   ['un temps par vol du service',async p=>{await nav.service(p,'dotation');await nav.section(p,'temps');await saisir(p,`${M} .rg-fiche input[data-rg-champ=heures][data-cle="*/BC"]`,'0.8');}],
   ['le nom du service',async p=>{await nav.service(p,'dotation');await saisir(p,`${M} [data-mu-nom=dotation]`,'Dotation fictive');}],
   ['l’heure d’une équipe de plonge',async p=>{await nav.equipe(p,ids['Plonge matin']);await saisir(p,`${M} [data-at="${ids['Plonge matin']}"] [data-at-champ=debut]`,'04:30');}],
   ['le seuil d’un tunnel',async p=>{await nav.equipe(p,ids['Plonge matin']);await saisir(p,`${M} [data-at="${ids['Plonge matin']}"] [data-at-champ=tunnel-personnes]`,2);}],
   ['le débit d’un robot',async p=>{await nav.equipe(p,ids['Robot']);await saisir(p,`${M} [data-at="${ids['Robot']}"] [data-at-champ=debit]`,350);}],
   ['les minutes par compagnie',async p=>{await nav.service(p,'armement');await nav.section(p,'temps');await saisir(p,`${M} [data-mu-cat-min][data-cie="*"]`,'0.3');}],
   ['les vols en même temps du handling',async p=>{await nav.equipe(p,ids['Quais']);const c=p.locator(`${M} [data-at="${ids['Quais']}"] [data-at-champ=simultanes]`);
     if(await c.count())await saisir(p,`${M} [data-at="${ids['Quais']}"] [data-at-champ=simultanes]`,3);}]
  ];
  let avant1=await sauvegarde(page),avant2=await sauvegarde(v2.page),changes=0;
  for(const [nom,geste] of GESTES){
   await geste(page);await geste(v2.page);
   const apres1=await sauvegarde(page),apres2=await sauvegarde(v2.page);
   const e1=ecarts(avant1,apres1),e2=ecarts(avant2,apres2);
   assert.deepEqual(e1,e2,nom+' : la sauvegarde change des mêmes champs, aux mêmes valeurs, que depuis l’ancienne page');
   if(e1.length)changes++;
   avant1=apres1;avant2=apres2;
  }
  assert.ok(changes>=GESTES.length-2,changes+' réglages sur '+GESTES.length+' ont changé la sauvegarde');
  // Ce qui ne se réglait que dans « Équipes une par une » : le service d'une équipe. La page la suit.
  await nav.equipe(page,ids['Montage EST']);await plusDe(page,ids['Montage EST']);
  await page.locator(`${M} [data-at="${ids['Montage EST']}"] [data-at-champ=service]`).selectOption('dotation');await attendre(page,400);
  assert.equal(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).service,ids['Montage EST']),'dotation','l’équipe change de service');
  assert.deepEqual(await page.evaluate(()=>[Sim.unite.choisi,document.querySelector('#mu-services .se-fiche').dataset.seVue,Sim.unite.equipeOuverte]),['dotation','equipe',ids['Montage EST']],'la page la suit, sa fiche reste ouverte');
  await v2.site.effacer();await v2.ctx.close();

  /* ---- 6. la page ne défile pas : chaque colonne défile seule ---------------------------------------------------- */
  await nav.service(page,'plonge');
  const m=await page.evaluate(()=>{const v=document.getElementById('view-ateliers'),l=document.querySelector('#mu-services .se-liste'),f=document.querySelector('#mu-services .se-fiche'),c=document.querySelector('#mu-services .se-cadre').getBoundingClientRect();
    return {doc:document.documentElement.scrollHeight-innerHeight,vue:v.scrollHeight-v.clientHeight,bas:Math.round(c.bottom),haut:innerHeight,
      colonnes:[getComputedStyle(l).overflowY,getComputedStyle(f).overflowY],texte:Math.min(...[...f.querySelectorAll('td,th,label,button,p,small,summary,input,select')].filter(e=>e.getBoundingClientRect().width>0).map(e=>parseFloat(getComputedStyle(e).fontSize)))};});
  assert.equal(m.doc,0,'la page ne défile pas');
  assert.ok(m.vue<=1,'la vue non plus ('+m.vue+' px)');
  assert.ok(m.bas<=m.haut,'la liste et la fiche tiennent dans l’écran ('+m.bas+' / '+m.haut+')');
  assert.deepEqual(m.colonnes,['auto','auto'],'chaque colonne défile seule');
  assert.ok(m.texte>=13,'le texte fait 13 px au moins : '+m.texte+' px');
  // La fiche garde sa place quand un champ validé la redessine : elle ne remonte pas en tête.
  await nav.equipe(page,ids['Plonge matin']);
  const fiche=page.locator(`${M} .se-fiche`);
  assert.ok(await fiche.evaluate(f=>f.scrollHeight-f.clientHeight)>120,'la fiche d’une équipe de plonge défile dans sa colonne');
  await fiche.evaluate(f=>{f.scrollTop=120;});
  const champSeuil=page.locator(`${M} [data-at="${ids['Plonge matin']}"] [data-at-champ=tunnel-personnes]`).first();
  const seuil=Number(await champSeuil.inputValue());
  await champSeuil.fill(String(seuil+1));await champSeuil.dispatchEvent('change');await attendre(page,400);
  assert.equal(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).tunnels[0].personnes,ids['Plonge matin']),seuil+1,'le réglage est enregistré');
  assert.ok(Math.abs(await page.locator(`${M} .se-fiche`).evaluate(f=>f.scrollTop)-120)<=40,'la fiche est restée à sa place : '+await page.locator(`${M} .se-fiche`).evaluate(f=>f.scrollTop));

  /* ---- 7. un service de quatre équipes tient en un écran, à 1 366 × 768 (évolution 22 b2) ---------------------------- */
  // Quatre équipes à la cuisine, chacune avec ses commandes ; la fiche à l'ouverture : « Ses équipes » dépliée, le reste replié.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state,cu=st.ateliers.filter(a=>a.service==='cuisine');
    const copie=(a,id,nom,lots)=>({...JSON.parse(JSON.stringify(a)),id,nom,lots});
    st.ateliers.push(copie(cu[0],'se-q3','Cuisine équipe 3',cu[0].lots.splice(1,2)),copie(cu[1],'se-q4','Cuisine équipe 4',cu[1].lots.splice(1,2)));},''));
  await attendre(page,400);
  await page.evaluate(()=>{Sim.unite.sections.clear();});
  await nav.service(page,'cuisine');
  const q=await page.evaluate(()=>{const f=document.querySelector('#mu-services .se-fiche'),r=f.getBoundingClientRect();
    return {lignes:f.querySelectorAll('.se-equipes tbody tr').length,deborde:f.scrollHeight-f.clientHeight,doc:document.documentElement.scrollHeight-innerHeight,
      ecran:[innerWidth,innerHeight],bas:Math.round(r.bottom),blocs:[...f.children].map(e=>[e.tagName+'.'+String(e.className).split(' ')[0],Math.round(e.getBoundingClientRect().height)]),
      sections:[...f.querySelectorAll('details[data-mu-section]')].map(d=>[d.dataset.muSection,d.open,Math.round(d.querySelector('summary').getBoundingClientRect().bottom)<=Math.round(r.bottom)])};});
  assert.deepEqual(q.ecran,[1366,768]);
  assert.equal(q.lignes,4,'quatre équipes dans le tableau');
  assert.ok(q.deborde<=1,'la fiche d’un service de quatre équipes tient dans sa colonne, sans défiler ('+q.deborde+' px de trop : '+JSON.stringify(q.blocs)+')');
  assert.equal(q.doc,0,'et la page dans l’écran');assert.ok(q.bas<=768);
  assert.deepEqual(q.sections,[['equipes',true,true],['effectif',false,true],['temps',false,true],['avance',false,true]],'ses sections se voient : « Ses équipes » dépliée, le reste replié');

  /* ---- 8. les cinq pages d'avant n'existent plus : leurs noms et leurs liens mènent ici, au bon endroit ---------------- */
  assert.equal(await page.locator('#at-liste, #at-new, #at-filtre, .recap-cases, #rc-filtre, #rg-recap-panneau, #rg-bareme-panneau, #services-unite, #onglets-internes:not([hidden]) [data-sous-onglet=at-recap]').count(),0,'ni leurs listes, ni leurs tableaux, ni leurs onglets');
  // (Celles que « Services et équipes » a reprises ; « Chemins » a les siennes, évolution 22 c.)
  assert.deepEqual(await page.evaluate(()=>Object.keys(OrlyOnglets.ANCIENNES).filter(id=>OrlyOnglets.resoudre(id)==='mu-services').map(id=>[id,OrlyOnglets.resoudre(id),OrlyOnglets.ANCIENNES[id].lieu])),
    [['at-recap','mu-services','equipes'],['at-equipes','mu-services','equipes'],['rg-recap','mu-services','temps'],['rg-minutes','mu-services','temps'],['u-services','mu-services','liste']]);
  // Un lien vers une page d'avant (data-page) mène à la page nouvelle, au bon endroit : la fiche d'une équipe se referme.
  await nav.equipe(page,ids['Robot']);await nav.aller(page,'j-chiffres');
  await page.evaluate(()=>{const b=document.createElement('button');b.id='se-vieux-lien';b.dataset.page='rg-minutes';b.textContent='Temps par vol par service';document.querySelector('#view-title').after(b);});
  await page.locator('#se-vieux-lien').click();await attendre(page,300);
  assert.deepEqual(await page.evaluate(()=>[document.body.dataset.sous,Sim.unite.equipeOuverte,!!document.querySelector('#mu-services details[data-mu-section=temps][open]')]),['mu-services',null,true],'« Temps par vol par service » : la fiche du service, ses temps dépliés');
  await page.evaluate(()=>document.getElementById('se-vieux-lien').remove());
  // Le service choisi n'a pas de temps par vol (une mise à disposition) : le premier de la liste qui en a.
  await nav.service(page,dispo);
  await page.evaluate(()=>Sim.unite.allerA('temps'));await attendre(page,300);
  assert.notEqual(await page.evaluate(()=>Sim.unite.choisi),dispo);
  assert.equal(await page.locator(`${M} details[data-mu-section=temps][open]`).count(),1,'« Temps par vol » mène à un service qui a des temps');
  // Les services supprimés : le lien du bas de la liste.
  await page.evaluate(()=>Sim.unite.allerA('supprimes'));await attendre(page,300);
  assert.equal(await page.locator(`${M} .se-vers-supprimes.actif`).count(),1);
  await page.evaluate(()=>Sim.unite.allerA('liste'));await attendre(page,300);
  assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#mu-services .se-liste')),true,'« Liste des services » : la liste, à gauche');

  /* ---- 9. « Annuler » défait le dernier geste de la page : une équipe, ou un temps par vol ----------------------------- */
  await nav.equipe(page,cu[0]);
  const heureAvant=await page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).debut,cu[0]);
  await saisir(page,`${M} .se-equipe [data-at-champ=debut]`,'03:15');
  await nav.service(page,'cuisine');await nav.section(page,'temps');
  const cleTemps=await page.locator(`${M} .se-fiche [data-rg-champ=heures][data-service=cuisine]`).first().getAttribute('data-cle');
  const temps=()=>page.evaluate(cle=>(Sim.reglages.etat.bareme.cuisine||{})[cle],cleTemps),heure=()=>page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).debut,cu[0]);
  const tempsAvant=await temps();
  await saisir(page,`${M} .se-fiche [data-rg-champ=heures][data-service=cuisine][data-cle="${cleTemps}"]`,'0.9');
  assert.deepEqual([await heure(),await temps()],['03:15',54]);
  await page.locator('#btn-annuler').click();await attendre(page,300);
  assert.deepEqual([await heure(),await temps()],['03:15',tempsAvant],'« Annuler » défait d’abord le temps par vol, réglé en dernier');
  await page.locator('#btn-annuler').click();await attendre(page,300);
  assert.deepEqual([await heure(),await temps()],[heureAvant,tempsAvant],'puis l’heure de l’équipe');
  await page.locator('#btn-retablir').click();await attendre(page,300);
  assert.deepEqual([await heure(),await temps()],['03:15',tempsAvant],'« Rétablir » refait l’heure');
  await page.locator('#btn-retablir').click();await attendre(page,300);
  assert.deepEqual([await heure(),await temps()],['03:15',54],'puis le temps par vol');

  /* ---- 10. leurs classeurs Excel restent, dans « Fichiers » -------------------------------------------------------- */
  await nav.aller(page,'u-sauvegarde');
  // (Évolution 22 e : le tableau porte tous les classeurs ; ceux des pages d'avant y gardent leur ligne et leurs boutons.)
  assert.deepEqual(await page.locator('#fi-classeurs tbody tr').evaluateAll(ts=>ts.filter(t=>['equipes','temps','etude'].includes(t.dataset.classeur)).map(t=>[t.dataset.classeur,t.querySelector('th').firstChild.textContent,
    [...t.querySelectorAll('td')].map(td=>[...td.querySelectorAll('button')].map(b=>[b.id,b.textContent.trim(),b.getAttribute('aria-label')]))])),[
    ['equipes','Équipes et horaires',[[['rc-import-btn','Importer','Importer : Équipes et horaires']],[['rc-export','Exporter','Exporter : Équipes et horaires']],[]]],
    ['temps','Temps par vol, vue d’ensemble',[[['rg-recap-import-btn','Importer','Importer : Temps par vol, vue d’ensemble']],[['rg-recap-export','Exporter','Exporter : Temps par vol, vue d’ensemble']],[]]],
    ['etude','Temps par vol, service par service',[[['rg-import-btn','Importer','Importer : Temps par vol, service par service']],[['rg-export','Exporter','Exporter : Temps par vol, service par service']],[]]]]);
  for(const [id,nom] of [['rc-export',/^ory-cases-.*\.xlsx$/],['rg-recap-export',/^ory-heures-travail-.*\.xlsx$/],['rg-export',/^ory-bareme-.*\.xlsx$/]]){
    assert.equal(await page.locator('#'+id).count(),1,id+' : un seul bouton, dans « Fichiers »');
    const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('#fi-classeurs #'+id).click()]);
    assert.match(dl.suggestedFilename(),nom,id+' : le même classeur qu’avant');await dl.cancel();
  }

  assert.deepEqual(erreurs,[],'aucune erreur de page');
  await v1.site.effacer();
  console.log('services-page-browser : ok — la liste de l’amont vers l’aval (équipes, « toujours ouvert »), « Ajouter un service » en tête, les services supprimés en bas ; la fiche du service (nom et type en tête, tableau des équipes, temps selon le type, réglages avancés repliés) ; la fiche d’une équipe au même endroit, avec un retour ; aucun résultat sur '+attendu.length+' services et '+fiches+' équipes ; '+GESTES.length+' réglages écrivent la même sauvegarde que l’ancienne page ; la page ne défile pas ; un service de quatre équipes tient en un écran à 1 366 × 768 ; les cinq pages d’avant mènent ici, au bon endroit ; « Annuler » défait le dernier geste, équipe ou temps par vol ; leurs trois classeurs sont dans « Fichiers »');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

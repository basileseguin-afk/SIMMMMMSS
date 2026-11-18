/* Évolution 19 (a) — un seul mot par chose, dans la page (v1), sur une unité
 * fictive (tests/unite-15-services.cjs) :
 *   1. le test parcourt toutes les pages du menu (leurs onglets « Plus » et
 *      ceux de « Détails » compris, la vue en direct en relief et à plat) et
 *      ne trouve aucun des mots bannis dans ce qui s'affiche — le texte, les
 *      bulles (`title`), les libellés lus (`aria-label`), les exemples des
 *      champs : « case », « atelier », « barème », « boutique », « heures de
 *      travail », « temps de travail », « sert tout le monde », « disponible
 *      en permanence », et « flux » hors de ce qui circule sur le plan (la
 *      page « Liens entre services », les liens du plan) ;
 *   2. « Aller à… » trouve encore une page par son ancien nom ;
 *   3. un classeur d'avant (ses feuilles et ses en-têtes d'avant) s'importe.
 * VOCABULAIRE_RAPPORT=1 affiche tout ce qu'il trouve au lieu d'échouer au
 * premier écart. Aucune donnée de l'unité : tout est fictif. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs'),U=require('./unite-15-services.cjs');
const T=require('../tableur.js'),CA=require('../classeurs-anciens.js');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const RAPPORT=!!process.env.VOCABULAIRE_RAPPORT;

/** Dans la page : ce qui s'affiche et porte un mot banni — [{ mot, extrait, ou }], sans doublon. `flux` : chercher aussi « flux ». */
const relever=(page,flux)=>page.evaluate(flux=>{
  const MOTS='cases?|ateliers?|barèmes?|boutiques?|heures? de travail|temps de travail|ser(?:t|vent) tout le monde|disponibles? en permanence'+(flux?'|flux':'');
  const B=new RegExp('(?<![\\wÀ-ÿ])('+MOTS+')(?![\\wÀ-ÿ])','gi'),vus=new Map();
  const noter=(texte,ou,el)=>{if(!texte)return;for(const m of String(texte).matchAll(B)){
    // « Liens entre services » et les liens du plan disent « flux » pour ce qui circule : permis.
    if(/^flux$/i.test(m[1])&&el&&el.closest&&el.closest('#flow-center, #view-flux, .fc-map-filter, [data-sous="mu-liens"], [data-sous="u-flux"]'))continue;
    const a=Math.max(0,m.index-45),extrait=String(texte).slice(a,m.index+m[0].length+45).replace(/\s+/g,' ').trim(),k=ou+'|'+extrait;
    if(!vus.has(k))vus.set(k,{mot:m[1].toLowerCase(),extrait,ou});}};
  const marche=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:n=>(n.parentElement&&/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/.test(n.parentElement.tagName)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT)});
  for(let n=marche.nextNode();n;n=marche.nextNode())noter(n.nodeValue,'texte',n.parentElement);
  for(const el of document.querySelectorAll('[title],[aria-label],[placeholder],[alt],[data-tip]'))for(const a of ['title','aria-label','placeholder','alt','data-tip'])if(el.hasAttribute(a))noter(el.getAttribute(a),a,el);
  return [...vus.values()];
},flux);

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 try{
  const x=await F.charger(page,nav,URL,{sauvegarde:U.sauvegarde(),csv:U.volsCsv(),pageId:'j-chiffres'});
  // Les noms de l'unité fictive ne portent aucun mot banni : ce que le test trouve vient de la page.
  const pages=await page.evaluate(()=>OrlyOnglets.PARTIES.flatMap(p=>p.pages.map(q=>q.id)).filter(id=>OrlyOnglets.montree(id)));
  // (Dix-sept au moins depuis l'évolution 22 : « Chemins » a repris trois pages (c), « Contrôles » une (d).)
  assert.ok(pages.length>=17,'toutes les pages du menu ('+pages.length+')');
  const trouves=new Map();
  const visiter=async(id,options,nom)=>{
    await nav.aller(page,id,options);await page.waitForTimeout(350);
    for(const h of await relever(page,true)){const k=h.ou+'|'+h.extrait;if(!trouves.has(k))trouves.set(k,{...h,page:nom||id});}
  };
  for(const id of pages){
    if(id==='j-plan'){await visiter(id,{relief:true},'j-plan (relief)');await visiter(id,{},'j-plan (à plat)');}
    else await visiter(id);
  }
  // « Chemins » (évolution 22 c) : une étape choisie, son tableau, ses sections dépliées ; et, dans « Détails ›
  // Commandes », le tableau « Étapes de chaque commande », déplié.
  const noter=async nom=>{await page.waitForTimeout(300);for(const h of await relever(page,true)){const k=h.ou+'|'+h.extrait;if(!trouves.has(k))trouves.set(k,{...h,page:nom});}};
  await nav.aller(page,'mu-flux');await page.evaluate(()=>Sim.unite.allerChemins('etapes'));
  await nav.sectionChemin(page,'suivi');await nav.sectionChemin(page,'commandes');await noter('mu-flux (une étape, sections dépliées)');
  await nav.etapesCommandes(page);await noter('at-repas (étapes de chaque commande)');
  // « Contrôles » (évolution 22 d : le panneau des problèmes l'a rejointe), ses informations dépliées.
  await nav.aller(page,'mu-pas');
  if(await page.locator('#mu-pas details.ct-plus').count())await page.locator('#mu-pas details.ct-plus>summary').click();
  await noter('mu-pas (informations dépliées)');
  const liste=[...trouves.values()];
  if(RAPPORT){for(const h of liste)console.log('· ['+h.page+'] ('+h.ou+') '+h.extrait);console.log('## '+liste.length+' écarts sur '+pages.length+' pages');}
  else assert.deepEqual(liste.map(h=>'['+h.page+'] ('+h.ou+') '+h.extrait),[],'aucun mot banni dans ce qui s’affiche');

  // 2. « Aller à… » trouve encore une page par son ancien nom, et y mène ; l'ancien nom ne s'affiche pas.
  // Les trois pages que « Services et équipes » a reprises (évolution 22 b) mènent à cette page.
  for(const [ancien,nom,id] of [['Flux de production','Chemins','mu-flux'],['Barème par service','Temps par vol par service','mu-services'],
    ['Heures de travail','Temps par vol','mu-services'],['Les cases','Équipes une par une','mu-services']]){
    await nav.aller(page,'j-chiffres');
    await page.keyboard.press('Control+k');await page.keyboard.type(ancien);await page.waitForTimeout(200);
    const options=await page.locator('dialog.palette [role=option]').evaluateAll(os=>os.map(o=>o.textContent));
    const i=options.findIndex(o=>o.includes(nom));
    assert.ok(i>=0,'« '+ancien+' » trouve « '+nom+' » : '+options.join(' | '));
    assert.ok(!options.some(o=>o.includes(ancien)),'l’ancien nom ne s’affiche pas : '+options.join(' | '));
    await page.locator('dialog.palette [role=option]').nth(i).click();await page.waitForTimeout(250);
    assert.equal(await page.evaluate(()=>document.body.dataset.sous),id,'« '+ancien+' » mène à '+id);
  }

  // 3. Un classeur d'avant s'importe. La page exporte ses équipes avec les nouveaux mots ; le même classeur, avec ses
  // feuilles et ses en-têtes d'avant et une valeur changée dans Excel, se réimporte : la valeur est lue.
  const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-vocabulaire-'));
  try{
    await nav.aller(page,'mu-services');
    const ici=await page.evaluate(()=>document.body.dataset.sous);
    await nav.versFichiers(page,'#at-export');   // (évolution 22 e)
    const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#at-export').click()]);
    if(ici!==await page.evaluate(()=>document.body.dataset.sous))await nav.aller(page,ici);
    const fichier=path.join(dossier,'equipes.xlsx');await d.saveAs(fichier);
    const feuilles=await T.lireClasseur(fs.readFileSync(fichier));
    assert.ok(feuilles.some(f=>f.nom==='Équipes'),'le classeur d’aujourd’hui : la feuille « Équipes » — '+feuilles.map(f=>f.nom).join(', '));
    assert.ok(!feuilles.some(f=>f.nom==='Ateliers'));
    const equipes=feuilles.find(f=>f.nom==='Équipes');
    assert.equal(equipes.lignes[0][0],'Équipe','sa première colonne : « Équipe »');
    for(const f of feuilles)for(const c of f.nom==='Lisez-moi'?f.lignes.flat():f.lignes[0])if(typeof c==='string')assert.doesNotMatch(c,/(?<![\wÀ-ÿ])(cases?|ateliers?|barèmes?|boutiques?|heures de travail)(?![\wÀ-ÿ])/i,f.nom+' : '+c);
    // Les mots d'avant : le nom des feuilles, les en-têtes.
    const versAvant=Object.fromEntries(Object.entries(CA.FEUILLES).map(([a,n])=>[n,a]));
    // Dans Excel : une équipe commence une demi-heure plus tard (la feuille « Horaires », lue par sa colonne « Atelier »).
    const horaires=feuilles.find(f=>f.nom==='Horaires');
    assert.deepEqual(horaires.lignes[0].slice(0,3),['Équipe','Jour','Début']);
    const cible=horaires.lignes.slice(1).find(l=>/^\d\d:00$/.test(l[2])&&l[4]>0);assert.ok(cible,'une équipe qui commence à l’heure pile');
    const nomCible=cible[0],debut=cible[2].slice(0,3)+'30';
    const avant=feuilles.map(f=>({nom:versAvant[f.nom]||f.nom,lignes:f.lignes.map((l,r)=>r===0&&f.nom!=='Lisez-moi'
      ?l.map(c=>(c==='Équipe'?'Atelier':c==='Heures pour la journée'?'Heures de travail':c))
      :f.nom==='Horaires'&&l[0]===nomCible?Object.assign(l.slice(),{2:debut}):l)}));
    assert.deepEqual(avant.filter(f=>CA.FEUILLES[f.nom]).map(f=>f.nom),['Ateliers'],'le classeur d’avant : la feuille « Ateliers »');
    assert.equal(avant.find(f=>f.nom==='Ateliers').lignes[0][0],'Atelier');assert.equal(avant.find(f=>f.nom==='Horaires').lignes[0][0],'Atelier');
    const neuf=feuilles.map(f=>(f.nom==='Horaires'?{...f,lignes:f.lignes.map(l=>(l[0]===nomCible?Object.assign(l.slice(),{2:debut}):l))}:f));
    const etatDe=()=>page.evaluate(()=>JSON.stringify(Sim.ateliers.state));
    const importer=async(nom,f)=>{
      await page.locator('#at-import').setInputFiles({name:nom,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(T.ecrireClasseur(f))});
      await page.waitForTimeout(600);
      const statut=await page.locator('#at-status').textContent();
      assert.match(statut,/Équipes importées : \d+ équipes/,nom+' s’importe : '+statut);
      return etatDe();
    };
    const depart=await etatDe();
    const parAvant=await importer('equipes-d-avant.xlsx',avant);
    const cle=nomCible.split(' · ')[0];
    assert.equal(JSON.parse(parAvant).ateliers.find(a=>a.nom===cle).debut,debut,'l’heure changée dans Excel est lue ('+nomCible+')');
    assert.equal(JSON.parse(depart).ateliers.find(a=>a.nom===cle).debut,cible[2],'elle n’était pas celle-là');
    // Le même classeur avec les mots d'aujourd'hui, importé depuis le même état : exactement le même résultat.
    await page.locator('#btn-annuler').click();await page.waitForTimeout(300);
    assert.equal(await etatDe(),depart,'l’annulation rend l’état de départ');
    assert.equal(await importer('equipes.xlsx',neuf),parAvant,'le classeur d’avant et celui d’aujourd’hui donnent le même état');
  }finally{fs.rmSync(dossier,{recursive:true,force:true});}
  if(!RAPPORT)assert.deepEqual(errors,[],errors.join(' | '));
  x.effacer();
  console.log('vocabulaire-browser : '+(RAPPORT?'rapport':'ok')+' — '+pages.length+' pages parcourues');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

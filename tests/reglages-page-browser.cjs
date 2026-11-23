/* « Réglages » (version 1, évolution 23 e) — une liste à gauche, une fiche à droite ; sur l'unité fictive.
 *
 *   1. À gauche, la liste des sections, par leur titre d'aujourd'hui ; à droite, la section choisie, seule, sur toute la
 *      largeur. La section choisie se retient (une préférence d'affichage, hors de la sauvegarde).
 *   2. La page tient en un écran, pour chaque section, à 1 366 × 768 (et à 1 920 × 1 080) : ni la fenêtre ni la page ne
 *      défilent ; seules défilent, au besoin, la liste et la fiche.
 *   3. Les réglages rares d'une section sont repliés sous « Réglages avancés » ; dépliés, ils le restent quand le
 *      panneau se redessine.
 *   4. Aucun résultat sur la page : le bilan du matériel (revenu, lavé, reste propre…) y devient un lien vers
 *      « Détails › Stocks et retours », où il se lit, avec les mêmes chiffres qu'avant.
 *   5. Chaque réglage de la page d'avant se modifie depuis la nouvelle, et donne la même sauvegarde.
 *
 * « La page d'avant » : le même site, servi sans le module ni la feuille du rangement (reglages-page.js,
 * reglages-page.css). Les panneaux et leurs champs sont alors écrits comme avant cette évolution, dans une seule colonne
 * (le test le vérifie : ni liste, ni « Réglages avancés », et le bilan du matériel sur la page). Les mêmes gestes sont
 * faits, dans le même ordre, sur les deux pages : chaque champ que la page d'avant montre est retrouvé dans la nouvelle
 * (sa section choisie dans la liste, ses « Réglages avancés » dépliés par leur titre), vu à l'écran, puis changé ; après
 * chaque geste, les données des deux navigateurs sont les mêmes, à l'octet près ; à la fin, les deux sauvegardes aussi.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const RANGEMENT=/\/reglages-page\.(js|css)(\?|$)/;
const TITRES=['Horaires des vols','Retours des vols à la plonge','Matériel en boucle','Rythme de travail','Pauses et présence','Heures supplémentaires','Renforts','Ordre des lots','Repas spéciaux par cabine','Seuils d’alerte'];
const IDS=['horaires','retours','materiel','rythme','pauses','heures-sup','renforts','ordre','spml','seuils'];
const V='#view-reglages';

/* ---- dans la page (les deux) : les champs d'un réglage, leur clé, un changement ------------------------------------- */
/** Installe dans la page de quoi nommer chaque champ de « Réglages » par une clé stable, et de quoi le changer. */
function outils(){
  const champsDe=()=>[...document.querySelectorAll('#view-reglages input, #view-reglages select, #view-reglages textarea')]
    .filter(e=>!['file','hidden','search'].includes(e.type)&&!e.closest('[hidden]'));
  const signature=e=>{
    const donnees=Object.entries(e.dataset).filter(([k])=>!/^(clForce|rs)/.test(k)).sort().map(([k,v])=>k+'='+v).join(',');
    const rang=e.closest('[data-rf-service]'),pause=e.closest('.rg-seuil');
    return [e.tagName,e.type||'',e.id||'',donnees,e.getAttribute('aria-label')||'',rang?'service='+rang.dataset.rfService:'',
      pause?'pause='+[...pause.parentElement.children].indexOf(pause)+'/'+[...pause.querySelectorAll('input')].indexOf(e):''].join('|');
  };
  window.__rs={
    /** Chaque champ : sa clé (sa signature, et son rang parmi les champs de même signature), s'il est grisé, sa sorte. */
    champs(){const vus=new Map();return champsDe().map(e=>{const s=signature(e),n=vus.get(s)||0;vus.set(s,n+1);
      return {cle:s+'#'+n,gris:e.disabled,sorte:e.tagName==='SELECT'?'choix':e.type==='checkbox'?'coche':'valeur',coche:!!e.checked,options:e.tagName==='SELECT'?e.options.length:0};});},
    trouver(cle){const vus=new Map();for(const e of champsDe()){const s=signature(e),n=vus.get(s)||0;vus.set(s,n+1);if(s+'#'+n===cle)return e;}return null;},
    /** Se voit-il à l'écran ? Dessiné, dans une zone qui n'est ni masquée ni repliée. */
    seVoit(e){if(!e)return false;
      // (La mise en page d'abord : un repli tout juste ouvert ne se sait ouvert qu'après elle.)
      const dessine=e.getClientRects().length>0;
      return dessine&&e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true,contentVisibilityAuto:true});},
    /** Le change, comme le ferait une personne : une case cochée ou décochée, le choix suivant d'une liste, une autre valeur. */
    changer(e){
      if(e.type==='checkbox'){e.click();return 'case '+(e.checked?'cochée':'décochée');}
      const dire=()=>{e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};
      if(e.tagName==='SELECT'){e.selectedIndex=(e.selectedIndex+1)%e.options.length;dire();return 'choix '+e.value;}
      const pas=(+e.step||1)*(e.type==='range'?5:1),min=e.min!==''?+e.min:-Infinity,max=e.max!==''?+e.max:Infinity;
      const v0=parseFloat(String(e.value).replace(',','.'));
      let v=Number.isFinite(v0)?v0+pas:7;if(v>max)v=(Number.isFinite(v0)?v0:max)-pas;if(v<min)v=min;
      v=Math.round(v*1000)/1000;
      e.focus();e.value=String(v);dire();e.blur();return 'valeur '+e.value;
    },
    /** Attend que la page ait fini de se redessiner : plus aucun changement dans « Réglages » depuis 70 ms (2 s au plus). */
    calme(){return new Promise(fin=>{const v=document.getElementById('view-reglages');let t=setTimeout(arret,70);const limite=setTimeout(arret,2000);
      const o=new MutationObserver(()=>{clearTimeout(t);t=setTimeout(arret,70);});o.observe(v,{childList:true,subtree:true,attributes:true});
      function arret(){o.disconnect();clearTimeout(t);clearTimeout(limite);fin(true);}});},
    /** Les données du navigateur : toutes les clés du site, hors préférences d'affichage. */
    donnees(){const cles=[];for(let i=0;i<localStorage.length;i++)cles.push(localStorage.key(i));
      return JSON.stringify(cles.filter(k=>/^(ory|orly)-/.test(k)&&k!=='ory-revision'
        &&!/^(ory-menu-pages(-vues)?|ory-service-ouvert|ory-graphes-sens|ory-demarrage-en-cours|ory-ui-.*)$/.test(k)).sort().map(k=>[k,localStorage.getItem(k)]));}
  };
}

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-reglages-page-'));
 const erreurs=[],sites=[];
 /** Ouvre l'unité fictive dans un navigateur à part. `avant` : sans le rangement — la page d'avant. */
 const ouvrir=async(avant,taille={width:1366,height:768})=>{
   const ctx=await browser.newContext({viewport:taille,acceptDownloads:true});
   const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push((avant?'avant : ':'')+e.message));page.on('dialog',d=>d.accept());
   if(avant)await page.route(RANGEMENT,r=>r.fulfill({status:200,contentType:/\.css/.test(r.request().url())?'text/css':'application/javascript',body:''}));
   await page.addInitScript(outils);
   sites.push(await F.charger(page,nav,URL_V1,{pageId:'j-chiffres'}));
   await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.onglets);
   // À son premier rechargement, la page pose dans ses données l'effectif des équipes qu'elle calcule (déjà le cas avant) :
   // on part de données posées, les mêmes des deux côtés.
   await page.reload();
   await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.onglets&&window.__rs);
   await page.waitForTimeout(400);
   await nav.aller(page,'rg-simulation');await page.waitForTimeout(400);
   return page;
 };
 const telecharger=async(page,fn)=>{const [d]=await Promise.all([page.waitForEvent('download'),fn()]);const f=path.join(dossier,Date.now()+'-'+Math.random().toString(16).slice(2)+'-'+d.suggestedFilename());await d.saveAs(f);return f;};
 const sauvegarde=async page=>{await nav.aller(page,'u-sauvegarde');await page.waitForTimeout(200);
   return JSON.stringify(JSON.parse(fs.readFileSync(await telecharger(page,()=>page.locator('#sauvegarde-export').click()),'utf8')).contenu);};
 const donnees=page=>page.evaluate(()=>window.__rs.donnees());
 const mesure=page=>page.evaluate(sel=>{const v=document.querySelector(sel),f=v.querySelector('#rg-modele'),c=v.querySelector('.rs-colonne'),vis=e=>e.getClientRects().length>0;
   const r=e=>e.getBoundingClientRect();
   return {section:v.dataset.rs,fenetre:document.scrollingElement.scrollHeight-innerHeight,page:v.scrollHeight-v.clientHeight,fiche:f.scrollHeight-f.clientHeight,liste:c.scrollHeight-c.clientHeight,
     panneaux:[...f.children].filter(vis).map(e=>e.id),parts:[...f.querySelectorAll('#rg-sim-materiel>*')].filter(vis).map(e=>e.className.split(' ')[0]),
     gauche:Math.round(r(c).left),entre:Math.round(r(f).left-r(c).right),droite:Math.round(innerWidth-r(f).right),largeur:Math.round(r(f).width),libre:Math.round(innerWidth-r(v).left),
     bas:Math.round(innerHeight-r(f).bottom),haut:Math.round(r(f).top-r(c).top)};},V);
 const choisir=async(page,id)=>{await page.locator(V+' .rs-liste [data-rs-choisir="'+id+'"]').click();await page.waitForTimeout(120);};
 try{
  const avant=await ouvrir(true),apres=await ouvrir(false);

  /* ---- la page d'avant est bien celle d'avant : une colonne, tous les panneaux, le bilan du matériel ----------------- */
  const colonne=await avant.evaluate(sel=>{const v=document.querySelector(sel),vis=e=>e.getClientRects().length>0;
    return {module:typeof window.OrlyReglagesPage,liste:v.querySelectorAll('.rs-liste,.rs-colonne,.rs-avance,.rs-vers-details').length,
      titres:[...v.querySelectorAll('#rg-modele h3, #rg-modele .at-mat-tete strong')].filter(vis).map(e=>e.textContent.trim()),
      bilan:[...v.querySelectorAll('.at-mat-bilan .at-mat-chiffre')].map(e=>[e.querySelector('span').textContent,e.querySelector('b').textContent,(e.querySelector('em')||{textContent:''}).textContent]),
      defile:v.scrollHeight-v.clientHeight};},V);
  assert.deepEqual([colonne.module,colonne.liste],['undefined',0],'la page d’avant : ni module, ni liste, ni « Réglages avancés »');
  assert.deepEqual([...colonne.titres].sort(),[...TITRES].sort(),'la page d’avant montre tous ses panneaux à la suite : leurs titres sont ceux de la liste');
  assert.equal(colonne.bilan.length,6,'la page d’avant porte le bilan du matériel');
  assert.ok(colonne.defile>1200,'la page d’avant défile sur plusieurs écrans ('+colonne.defile+' px de plus que l’écran)');
  assert.equal(await donnees(avant),await donnees(apres),'les deux navigateurs partent des mêmes données');

  /* ---- 1. la liste à gauche, la section choisie à droite, seule ---------------------------------------------------- */
  assert.deepEqual(await apres.locator(V+' .rs-liste [data-rs-choisir]').evaluateAll(bs=>bs.map(b=>[b.dataset.rsChoisir,b.textContent.trim()])),IDS.map((id,i)=>[id,TITRES[i]]),'la liste : les sections, par leur titre d’aujourd’hui');
  assert.equal(await apres.locator(V+' .rs-liste').getAttribute('aria-label'),'Les sections des réglages');
  let m=await mesure(apres);
  assert.deepEqual([m.section,m.panneaux],['horaires',['rg-sim-horaires']],'à l’ouverture : la première section, seule');
  assert.deepEqual(await apres.locator(V+' .rs-liste [aria-current=true]').evaluateAll(bs=>bs.map(b=>b.dataset.rsChoisir)),['horaires']);
  const PANNEAUX={horaires:'rg-sim-horaires',retours:'rg-sim-materiel',materiel:'rg-sim-materiel',rythme:'rg-sim-rythme',pauses:'rg-sim-pauses','heures-sup':'rg-sim-heures-sup',renforts:'rg-sim-renforts',ordre:'rg-sim-ordre',spml:'rg-sim-spml',seuils:'rg-sim-seuils'};
  const titresVus=[];
  for(const id of IDS){
    await choisir(apres,id);
    m=await mesure(apres);
    assert.deepEqual([m.section,m.panneaux],[id,[PANNEAUX[id]]],id+' : son panneau, seul dans la fiche');
    if(id==='retours')assert.deepEqual(m.parts,['at-retours'],'les retours, sans le matériel');
    if(id==='materiel')assert.deepEqual(m.parts,['at-mat'],'le matériel, sans les retours');
    assert.deepEqual(await apres.locator(V+' .rs-liste [aria-current=true]').evaluateAll(bs=>bs.map(b=>b.dataset.rsChoisir)),[id],id+' : son entrée est marquée');
    titresVus.push(...await apres.locator(V+' #rg-modele h3, '+V+' #rg-modele .at-mat-tete strong').evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>e.textContent.trim())));
    /* ---- 2. la page tient en un écran, pour chaque section ---------------------------------------------------------- */
    assert.ok(m.fenetre<=0&&m.page<=0,id+' : ni la fenêtre ni la page ne défilent ('+m.fenetre+', '+m.page+')');
    assert.ok(m.fiche<=0&&m.liste<=0,id+' : à 1 366 × 768, sa fiche et la liste tiennent sans défiler ('+m.fiche+', '+m.liste+')');
    // Sur toute la largeur : la liste à gauche, la fiche jusqu'au bord droit, du haut au bas de la page.
    assert.ok(m.droite<=28&&m.entre<=20&&m.largeur>=m.libre-264-24-20-28,id+' : la fiche prend la largeur ('+m.largeur+' px sur '+m.libre+', '+m.droite+' px du bord)');
    assert.ok(m.bas<=16&&Math.abs(m.haut)<=4,id+' : la fiche va du haut au bas de la page');
  }
  assert.deepEqual(titresVus,TITRES,'chaque section porte son titre d’aujourd’hui, et lui seul');
  // Au clavier : les flèches mènent d'une section à l'autre, le clavier reste dans la liste.
  await choisir(apres,'horaires');
  await apres.keyboard.press('ArrowDown');await apres.waitForTimeout(100);
  assert.deepEqual([(await mesure(apres)).section,await apres.evaluate(()=>document.activeElement.dataset.rsChoisir)],['retours','retours']);
  await apres.keyboard.press('End');await apres.waitForTimeout(100);
  assert.equal((await mesure(apres)).section,'seuils');
  // La section choisie se retient : d'une page à l'autre, et au rechargement ; c'est une préférence d'affichage.
  await choisir(apres,'pauses');
  await nav.aller(apres,'j-chiffres');await nav.aller(apres,'rg-simulation');await apres.waitForTimeout(200);
  assert.equal((await mesure(apres)).section,'pauses');
  assert.equal(await apres.evaluate(()=>localStorage.getItem('ory-ui-reglages-section')),'pauses');
  assert.equal(await donnees(avant),await donnees(apres),'choisir une section ne change aucune donnée');
  // Ce qui vaut pour toute la page est sous la liste : où se règle le reste, et la remise aux valeurs d'exemple.
  assert.deepEqual(await apres.locator(V+' .rs-pied').evaluate(p=>[!!p.querySelector('.rg-ailleurs'),!!p.querySelector('#rg-reset'),p.getClientRects().length>0]),[true,true,true]);

  /* ---- 3. « Réglages avancés » : les réglages rares, repliés --------------------------------------------------------- */
  const avances=async()=>apres.locator(V+' .rs-avance').evaluateAll(ds=>ds.map(d=>[d.dataset.rsAvance,d.open,d.querySelector('summary').textContent,[...d.querySelectorAll('input,select')].length]));
  assert.deepEqual(await avances(),[['retours',false,'Réglages avancés',2],['renforts',false,'Réglages avancés',4],['seuils',false,'Réglages avancés',2]],'trois sections ont des réglages rares, repliés');
  await choisir(apres,'retours');
  const rare=apres.locator(V+' [data-at-champ="mat-delai"]');
  assert.equal(await rare.evaluate(e=>window.__rs.seVoit(e)),false,'replié : le délai après atterrissage ne se voit pas');
  await apres.locator(V+' .rs-avance[data-rs-avance=retours]>summary').click();await apres.waitForTimeout(100);
  assert.equal(await rare.evaluate(e=>window.__rs.seVoit(e)),true,'déplié : il se voit');
  // Le panneau se redessine (une autre page, puis retour) : « Réglages avancés » reste déplié.
  await nav.aller(apres,'j-chiffres');await nav.aller(apres,'rg-simulation');await apres.waitForTimeout(200);
  await choisir(apres,'retours');
  assert.deepEqual((await avances()).map(a=>a[1]),[true,false,false]);
  await apres.locator(V+' .rs-avance[data-rs-avance=retours]>summary').click();await apres.waitForTimeout(100);
  assert.deepEqual((await avances()).map(a=>a[1]),[false,false,false]);

  /* ---- 4. aucun résultat sur la page : le bilan du matériel se lit dans « Détails » --------------------------------- */
  await choisir(apres,'materiel');
  assert.equal(await apres.locator(V+' .at-mat-bilan, '+V+' .at-mat-chiffre').count(),0,'plus de bilan du matériel sur la page');
  const lien=apres.locator(V+' .rs-vers-details [data-page="j-stocks"]');
  assert.equal((await lien.innerText()).trim(),'Détails › Stocks et retours →');
  await lien.click();await apres.waitForTimeout(400);
  assert.equal(await apres.evaluate(()=>document.body.dataset.sous),'j-stocks','le lien mène à « Détails › Stocks et retours »');
  const bilan=await apres.locator('#journee-stocks [data-tp-materiel] .tp-tuile').evaluateAll(ts=>ts.map(e=>[e.querySelector('span').textContent,e.querySelector('b').textContent,(e.querySelector('em')||{textContent:''}).textContent]));
  assert.deepEqual(bilan,colonne.bilan,'le bilan s’y lit, avec les mêmes chiffres que sur la page d’avant');
  assert.equal((await apres.locator('#journee-stocks [data-tp-materiel] h3').innerText()).trim(),'Le matériel en boucle');
  assert.deepEqual(bilan.map(b=>b[0]),['Revenu des vols','Lavé','Emporté','Reste propre','Plus bas niveau','Attente de matériel']);
  await nav.aller(apres,'rg-simulation');await apres.waitForTimeout(200);

  /* ---- 5. chaque réglage de la page d'avant se modifie depuis la nouvelle, et donne la même sauvegarde -------------- */
  const sectionsVues=new Set(),faits=new Map(),sansEffet=[];let gestes=0,dernier=await donnees(avant);
  /** Montre un champ dans la nouvelle page, par les gestes d'une personne : sa section dans la liste, ses replis par leur titre. */
  const montrer=async cle=>{
    const id=await apres.evaluate(c=>{const e=window.__rs.trouver(c);return e?Sim.reglagesPage.sectionDe(e):null;},cle);
    assert.ok(id,'la nouvelle page porte ce réglage dans une section : '+cle);
    if((await mesure(apres)).section!==id)await choisir(apres,id);
    sectionsVues.add(id);
    for(let i=0;i<4;i++){
      const ferme=await apres.evaluate(c=>{const e=window.__rs.trouver(c);let d=e&&e.closest('details');while(d&&d.open)d=d.parentElement.closest('details');
        if(!d)return false;d.dataset.clOuvrir='1';return true;},cle);
      if(!ferme)break;
      await apres.locator(V+' details[data-cl-ouvrir]>summary').click();
      await apres.evaluate(()=>document.querySelectorAll('[data-cl-ouvrir]').forEach(d=>delete d.dataset.clOuvrir));
    }
    assert.equal(await apres.evaluate(c=>window.__rs.seVoit(window.__rs.trouver(c)),cle),true,'le réglage se voit dans la nouvelle page : '+cle);
  };
  /** Le même geste des deux côtés, puis les mêmes données. */
  const geste=async(cle,quoi)=>{
    // Page d'avant : ses replis d'avant (une ligne de « Qui peut aider qui ») se déplient ; le champ se voit ; il change.
    const a=await avant.evaluate(c=>{const e=window.__rs.trouver(c);for(let d=e&&e.closest('details');d;d=d.parentElement.closest('details'))d.open=true;
      return window.__rs.seVoit(e)?window.__rs.changer(e):null;},cle);
    assert.ok(a,'la page d’avant montre ce réglage : '+cle);
    await montrer(cle);
    const b=await apres.evaluate(c=>window.__rs.changer(window.__rs.trouver(c)),cle);
    assert.equal(b,a,quoi+' : le même changement des deux côtés ('+cle+')');
    await Promise.all([avant.evaluate(()=>window.__rs.calme()),apres.evaluate(()=>window.__rs.calme())]);
    let [da,db]=[await donnees(avant),await donnees(apres)];
    if(da!==db){await avant.waitForTimeout(400);[da,db]=[await donnees(avant),await donnees(apres)];}
    assert.equal(db,da,quoi+' ('+a+') : les mêmes données qu’avec la page d’avant — '+cle);
    if(da===dernier)sansEffet.push(cle.split('|').slice(0,5).filter(Boolean).join(' '));
    dernier=da;gestes++;
  };
  for(let tour=0;tour<400;tour++){
    const liste=await avant.evaluate(()=>window.__rs.champs());
    const suivant=liste.find(c=>!c.gris&&!faits.has(c.cle));
    if(!suivant)break;
    // Une case finit cochée (ce qu'elle ouvre se règle ensuite) ; une liste fait le tour de ses choix et revient au sien.
    const fois=suivant.sorte==='coche'?(suivant.coche?2:1):suivant.sorte==='choix'?suivant.options:1;
    for(let i=0;i<fois;i++)await geste(suivant.cle,suivant.sorte);
    faits.set(suivant.cle,suivant.sorte);
  }
  const reste=(await avant.evaluate(()=>window.__rs.champs())).filter(c=>!faits.has(c.cle));
  assert.ok(reste.every(c=>c.gris),'ce qui n’a pas été changé est grisé dans la page d’avant aussi (un réglage qui ne joue pas)');
  assert.deepEqual((await apres.evaluate(()=>window.__rs.champs())).map(c=>c.cle).sort(),(await avant.evaluate(()=>window.__rs.champs())).map(c=>c.cle).sort(),'les deux pages portent les mêmes champs');
  assert.ok(faits.size>=50,faits.size+' réglages changés');
  assert.deepEqual([...sectionsVues].sort(),[...IDS].sort(),'des réglages dans chaque section');
  // Les gestes de la page : « + Pause », « Retirer », « Revenir aux défauts », « Revenir au défaut » d'un service.
  const bouton=async(sel,quoi,section)=>{
    await choisir(apres,section);
    for(const p of [avant,apres])await p.evaluate(()=>document.querySelectorAll('#view-reglages details').forEach(d=>{if(d.querySelector('[data-rf-defaut]'))d.open=true;}));
    assert.equal(await apres.locator(V+' '+sel).first().evaluate(e=>window.__rs.seVoit(e)),true,quoi+' se voit dans la nouvelle page');
    for(const p of [avant,apres])await p.locator(V+' '+sel).first().evaluate(e=>e.click());
    await Promise.all([avant.evaluate(()=>window.__rs.calme()),apres.evaluate(()=>window.__rs.calme())]);
    const [da,db]=[await donnees(avant),await donnees(apres)];
    assert.equal(db,da,quoi+' : les mêmes données qu’avec la page d’avant');
    assert.notEqual(da,dernier,quoi+' change les données');
    dernier=da;gestes++;
  };
  await bouton('#rg-seuil-ajouter','« + Pause »','pauses');
  await bouton('#rg-seuils .rg-seuil button','« Retirer » une pause','pauses');
  await bouton('[data-rf-defaut]','« Revenir au défaut » d’un service','renforts');
  await bouton('[data-seuils-defaut]','« Revenir aux défauts » des seuils','seuils');
  // La même sauvegarde, à la fin.
  const [sa,sb]=[await sauvegarde(avant),await sauvegarde(apres)];
  assert.equal(sb,sa,'« Tout sauvegarder » donne le même fichier qu’avec la page d’avant');
  assert.equal(sb.includes('ory-ui-'),false,'la section choisie n’est pas dans la sauvegarde');
  for(const cle of ['modele','ateliers'])assert.ok(sb.includes('ory-'+cle+'-v1'),cle);

  /* ---- 2 (suite). réglages changés — les renforts en marche, leur tableau déplié : la page tient toujours ------------ */
  await nav.aller(apres,'rg-simulation');await apres.waitForTimeout(300);
  for(const id of IDS){
    await choisir(apres,id);
    m=await mesure(apres);
    assert.ok(m.fenetre<=0&&m.page<=0,id+' : ni la fenêtre ni la page ne défilent, réglages changés');
  }
  await apres.setViewportSize({width:1920,height:1080});await apres.waitForTimeout(300);
  for(const id of IDS){
    await choisir(apres,id);
    m=await mesure(apres);
    assert.ok(m.fenetre<=0&&m.page<=0&&m.liste<=0,id+' : à 1 920 × 1 080 non plus');
    assert.ok(m.droite<=28&&m.largeur>=1300,id+' : à 1 920 × 1 080, la fiche prend la largeur ('+m.largeur+' px)');
  }

  assert.deepEqual(erreurs,[],'aucune erreur de page');
  console.log('reglages-page-browser : ok — à gauche, la liste des dix sections, par leur titre d’aujourd’hui ; à droite, la section choisie, seule, sur toute la largeur ; chaque section tient en un écran à 1 366 × 768 et à 1 920 × 1 080 ; '
    +'les réglages rares de trois sections sous « Réglages avancés » ; plus de résultat sur la page : le bilan du matériel se lit dans « Détails › Stocks et retours », avec les mêmes six chiffres ; '
    +faits.size+' réglages de la page d’avant changés depuis la nouvelle, en '+gestes+' gestes faits des deux côtés : les mêmes données après chacun, la même sauvegarde à la fin'
    +(sansEffet.length?' ('+sansEffet.length+' geste(s) sans donnée enregistrée, des deux côtés : '+[...new Set(sansEffet)].slice(0,3).join(' ; ')+')':'')+'.');
 }finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});for(const s of sites)s.effacer();}
})().catch(e=>{console.error(e);process.exit(1);});

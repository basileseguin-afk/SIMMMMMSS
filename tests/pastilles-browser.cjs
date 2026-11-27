/* Évolution 25 (d) — la compagnie et la classe : une pastille et une étiquette, partout les mêmes (version 1), sur
 * l'unité fictive et un programme daté fictif, à 1 366 × 768. Le constat : « les compagnies ont le même texte que le
 * reste de la page ».
 *   1. Le texte lu ne change pas : le `textContent` de chaque page du menu, d'une fiche de service, d'une fiche d'équipe
 *      et du tableau de tous les temps est celui de la page d'avant (la même page, sans pastilles.js) ; ce qu'une
 *      sélection copie d'un nom habillé est son texte.
 *   2. La pastille : rayon 6 px, hauteur 22 px, graisse 700 ; un nom de plus de quatre caractères y laisse ses deux
 *      premières lettres (un pseudo-élément) et suit en graisse 500. L'étiquette : hauteur 22 px, le fond du survol, un
 *      point de 8 px à la couleur de la classe. Une compagnie a la même pastille sur toutes les pages.
 *   3. Sans choix, rien n'est écrit : « Tout sauvegarder » rend la sauvegarde de la page d'avant, octet pour octet.
 *   4. Les douze couleurs d'une compagnie, dans son panneau de « Commandes » (évolution 26 c : la carte « Couleurs des
 *      compagnies » a quitté le programme des vols). Un choix s'écrit dans son entrée, à part ; le résultat de la
 *      simulation et les réponses sont les mêmes ; « Annuler », dans la notification, le défait. « Garder ces couleurs »
 *      (au module) : une compagnie de plus ne déplace plus les autres. « Revenir aux couleurs automatiques » (au module)
 *      efface les choix, avec « Annuler ».
 *   5. Un choix survit à « Tout sauvegarder » puis « Restaurer » ; une sauvegarde sans l'entrée rend les couleurs
 *      automatiques, et la question le dit ; une entrée abîmée refuse la sauvegarde entière. La version 2 (gelée : le
 *      code d'avant) relit la sauvegarde qui porte l'entrée : elle l'ignore, et son résultat est le même.
 *   6. Chaque pastille tient 4,5:1 dans les deux thèmes, aux douze couleurs de la demande, dans l'ordre.
 *   7. En lecture seule, un choix ne s'écrit pas. La fenêtre ne défile pas, panneau ouvert ; aucun texte sous 13 px.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href,URL_V2=pathToFileURL(path.resolve(__dirname,'../v2/index.html')).href;
const CLE='ory-couleurs-compagnies-v1',CARTE='#couleurs-compagnies';
/** La page d'avant : la même page, sans le module des pastilles. */
const MODULE=/\/pastilles\.js(\?|$)/;
// Correction 24 (g) : les douze teintes refaites, dans l'ordre de la demande.
const CLAIR=['#BE3C92','#747914','#2D2DDD','#244451','#DA2F5C','#5A0F1B','#C323CF','#1A8465','#1B57A8','#6B5535','#191687','#3B1650'];
const SOMBRE=['#F87ABA','#BED37A','#9897FA','#26C0F4','#DBABAF','#F18E8F','#F7CFFC','#25F49D','#DDE7EE','#F0C044','#AAAECC','#C98BD9'];
const CSV=F.volsDatesCsv(3,'2031-03-03');
const rvb=h=>'rgb('+[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)).join(', ')+')';
const lum=c=>{const [r,g,b]=(c.match(/[\d.]+/g)||[]).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});return 0.2126*r+0.7152*g+0.0722*b;};
const contraste=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05);};

/** Dans la page : le texte de la zone de travail, sans la carte des couleurs (elle est neuve). « Contrôles » y écrit
 *  l'heure d'horloge du dernier réglage : les deux pages ne s'ouvrent pas à la même minute, elle est donc tue. */
const TEXTE=()=>{const z=document.getElementById('workspace').cloneNode(true);const c=z.querySelector('#couleurs-compagnies');if(c)c.remove();
  return z.textContent.replace(/Dernier réglage changé (le \d\d\/\d\d )?à \d\d:\d\d/g,'Dernier réglage changé à une heure');};
/** Dans la page : chaque pastille visible — sa compagnie, son rang, son fond. */
const PASTILLES=()=>[...document.querySelectorAll('#workspace .pa-cie')].filter(e=>e.getClientRects().length).map(e=>{
  const long=e.classList.contains('pa-long'),c=getComputedStyle(e,long?'::before':null);
  return {cle:e.dataset.paCle,rang:+e.dataset.paRang,fond:c.backgroundColor,texte:c.color,long};});
/** Dans la page : ce que la simulation a calculé, écrit. */
const CALCUL=()=>JSON.stringify([Sim.ateliers.resultat,Sim.reponses()]);

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 const ouvrir=async(avant)=>{
  const ctx=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce',acceptDownloads:true});
  const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
  if(avant)await page.route(MODULE,r=>r.fulfill({status:200,contentType:'application/javascript',body:''}));
  const site=await F.charger(page,nav,URL_V1,{csv:CSV,pageId:'j-chiffres'});
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.unite);
  return {page,site,fermer:async()=>{site.effacer();await ctx.close();}};
 };
 /** Les vues relevées : chaque page du menu, puis des fiches ouvertes. */
 const parcourir=async(page,relever)=>{
  const vues={},pages=await page.evaluate(()=>OrlyOnglets.entrees().flatMap(o=>o.pages||[o.id]));
  /** Une vue relevée quand elle a fini de se dessiner : deux relevés de suite identiques (une machine chargée dessine
   *  plus lentement qu'un délai fixe ne l'attend). */
  const pose=async()=>{let avant=null;
    for(let i=0;i<12;i++){await page.waitForTimeout(250);const r=await page.evaluate(relever),ecrit=JSON.stringify(r);if(ecrit===avant)return r;avant=ecrit;}
    return page.evaluate(relever);};
  for(const id of pages){await nav.aller(page,id);vues[id]=await pose();}
  await nav.aller(page,'mu-services');await page.evaluate(()=>Sim.unite.ouvrir('cuisine'));vues['fiche d’un service']=await pose();
  await page.evaluate(()=>Sim.unite.ouvrirEquipe('cu1'));vues['fiche d’une équipe']=await pose();
  await page.locator('#mu-services .se-tous-temps').click();await page.waitForTimeout(300);
  await page.locator('.rg-cie-btn').first().click();vues['tous les temps']=await pose();
  return {pages,vues};
 };
 const sauvegarder=async page=>{
  await nav.aller(page,'u-sauvegarde');
  const dl=page.waitForEvent('download');await page.locator('#sauvegarde-export').click();
  return JSON.parse(fs.readFileSync(await (await dl).path(),'utf8'));
 };
 const restaurer=async(page,sauvegarde)=>{
  await nav.aller(page,'u-sauvegarde');
  await page.locator('#sauvegarde-import').setInputFiles({name:'unite.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(sauvegarde))});
 };
 const garde=page=>page.evaluate(k=>localStorage.getItem(k),CLE);
 try{
  /* ---- 1. Le texte lu ne change pas ---------------------------------------------------------------------------------- */
  const avant=await ouvrir(true);
  assert.equal(await avant.page.evaluate(()=>typeof window.OrlyPastilles),'undefined','la page d’avant n’a pas le module');
  const textesAvant=await parcourir(avant.page,TEXTE);
  const sauvegardeAvant=await sauvegarder(avant.page);
  const calculAvant=await avant.page.evaluate(CALCUL);
  await avant.fermer();

  const {page,site,fermer}=await ouvrir(false);
  // Le résultat de la page fraîchement ouverte (ouvrir « Planning » y note l'effectif vu : on compare à conditions égales).
  const calculFrais=await page.evaluate(CALCUL);
  /** Une restauration recharge la page sur les vols d'exemple : les vols fictifs reviennent, comme à l'ouverture. */
  const apresRestauration=async()=>{const recharge=page.waitForEvent('load');await nav.repondre(page);await recharge;await nav.pret(page);
    await F.importerVols(page,nav,site.fichier,'vols-fictifs.csv',CSV);await page.waitForFunction(()=>Sim.ateliers&&Sim.ateliers.resultat);};
  const textes=await parcourir(page,TEXTE);
  assert.deepEqual(textes.pages,textesAvant.pages);
  assert.ok(textes.pages.length>=16,'toutes les pages du menu : '+textes.pages.length);
  for(const [vue,texte] of Object.entries(textes.vues)){
    assert.ok(texte.trim().length>100,vue+' : la page a du texte');
    assert.equal(texte,textesAvant.vues[vue],vue+' : le `textContent` est celui de la page d’avant');
  }
  assert.equal(await page.evaluate(CALCUL),calculAvant,'le même résultat et les mêmes réponses que la page d’avant');

  /* ---- 2. La pastille et l'étiquette, partout les mêmes ---------------------------------------------------------------- */
  const pastilles=await parcourir(page,PASTILLES);
  const toutes=Object.values(pastilles.vues).flat(),parCie={};
  for(const p of toutes)(parCie[p.cle]=parCie[p.cle]||new Set()).add(p.rang+' '+p.fond);
  assert.deepEqual(Object.keys(parCie).sort(),['EST','NORD','OUEST','SUD','ZEN'],'les cinq compagnies de l’unité fictive ont leur pastille');
  for(const [cie,vues] of Object.entries(parCie))assert.equal(vues.size,1,cie+' : la même pastille sur toutes les pages ('+[...vues].join(' | ')+')');
  assert.deepEqual(['EST','NORD','OUEST','SUD','ZEN'].map(c=>+[...parCie[c]][0].split(' ')[0]),[1,2,3,4,5],'sans choix : les couleurs dans l’ordre alphabétique');
  assert.equal(new Set(Object.values(parCie).map(s=>[...s][0].replace(/^\d+ /,''))).size,5,'cinq compagnies, cinq couleurs');
  for(const vue of ['at-repas','v-departs','j-stocks','v-programme','fiche d’un service','fiche d’une équipe','tous les temps'])
    assert.ok(pastilles.vues[vue].length>0,vue+' : au moins une pastille');
  // « Commandes » : deux commandes de la même compagnie, la même pastille ; chaque commande a son étiquette.
  await nav.aller(page,'at-repas');await page.waitForTimeout(300);
  const commandes=await page.evaluate(()=>[...document.querySelectorAll('#at-classes tbody th[data-classe]')].map(th=>{
    const p=th.querySelector('.pa-cie'),c=th.querySelector('.pa-classe'),cs=p&&getComputedStyle(p,p.classList.contains('pa-long')?'::before':null),cc=c&&getComputedStyle(c),point=c&&getComputedStyle(c,'::before');
    const sonde=document.createElement('i');document.body.appendChild(sonde);
    const jeton=n=>{sonde.style.color='var(--'+n+')';return getComputedStyle(sonde).color;};
    const out={id:th.dataset.classe,texte:th.textContent.trim(),cie:p&&p.dataset.paCle,rang:p&&p.dataset.paRang,
      pastille:cs&&{rayon:cs.borderTopLeftRadius,haut:cs.height,graisse:cs.fontWeight,fond:cs.backgroundColor,contenu:cs.content},
      nom:p&&{long:p.classList.contains('pa-long'),graisse:getComputedStyle(p).fontWeight,lettres:p.dataset.paCourt||''},
      etiquette:cc&&{haut:cc.height,fond:cc.backgroundColor,texte:cc.color,cab:c.dataset.cab,point:[point.width,point.height,point.backgroundColor,point.borderTopLeftRadius]},
      attendu:c&&{survol:jeton('ds-survol'),encre:jeton('ds-texte-1'),classe:jeton('cab-'+c.dataset.cab)},
      copie:(()=>{const s=getSelection();s.selectAllChildren(th);const t=s.toString();s.removeAllRanges();return t;})()};
    sonde.remove();return out;}));
  assert.ok(commandes.length>=10,'les commandes de la journée');
  for(const c of commandes){
    assert.equal(c.cie,c.id.split('/')[0],c.id+' : la pastille de sa compagnie');
    assert.deepEqual([c.pastille.rayon,c.pastille.haut,c.pastille.graisse],['6px','22px','700'],c.id+' : rayon 6 px, hauteur 22 px, graisse 700');
    assert.deepEqual([c.etiquette.haut,c.etiquette.fond,c.etiquette.texte],['22px',c.attendu.survol,c.attendu.encre],c.id+' : l’étiquette, 22 px, sur le fond du survol');
    assert.deepEqual(c.etiquette.point,['8px','8px',c.attendu.classe,'50%'],c.id+' : un point de 8 px à la couleur de sa classe');
    assert.equal(c.etiquette.cab,c.id.split('/')[1]);
    assert.equal(c.copie.replace(/\s+/g,' ').trim(),c.texte.replace(/\s+/g,' '),c.id+' : la sélection copie le texte de la page');
  }
  const deNord=commandes.filter(c=>c.cie==='NORD'),deOuest=commandes.filter(c=>c.cie==='OUEST');
  assert.ok(deNord.length>=2&&new Set(deNord.map(c=>c.rang+c.pastille.fond)).size===1,'deux commandes de NORD : la même pastille');
  assert.deepEqual([deNord[0].nom.long,deNord[0].nom.lettres,deNord[0].pastille.contenu],[false,'','normal'],'NORD : quatre caractères, la pastille porte le nom');
  assert.deepEqual([deOuest[0].nom.long,deOuest[0].nom.lettres,deOuest[0].nom.graisse],[true,'OU','500'],'OUEST : ses deux premières lettres, puis le nom en graisse 500');
  assert.match(deOuest[0].pastille.contenu,/^"OU"/,'les deux lettres sont un pseudo-élément : '+deOuest[0].pastille.contenu);
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#workspace *')].filter(e=>e.getClientRects().length&&getComputedStyle(e).textTransform==='uppercase').length),0,'aucune capitale forcée : les deux lettres sont écrites en capitales');
  // Pas dans une phrase, pas dans une liste déroulante, pas dans un dessin.
  await nav.aller(page,'mu-pas');await page.waitForTimeout(300);
  assert.equal(await page.locator('#workspace .ct-point .pa').count(),0,'« Contrôles » : des phrases, rien n’y est habillé');
  assert.equal(await page.evaluate(()=>document.querySelectorAll('option .pa, svg .pa, canvas .pa').length),0);

  /* ---- 3. Sans choix, rien n'est écrit --------------------------------------------------------------------------------- */
  assert.equal(await garde(page),null,'aucune entrée de couleurs');
  const sans=await sauvegarder(page);
  assert.equal(JSON.stringify(sans.contenu),JSON.stringify(sauvegardeAvant.contenu),'« Tout sauvegarder » rend la sauvegarde d’avant, octet pour octet');
  assert.equal(CLE in sans.contenu,false);

  /* ---- 4. La couleur d'une compagnie : les douze teintes, dans son panneau de « Commandes » ---------------------------------- */
  // Évolution 26 (c) : la carte « Couleurs des compagnies » quitte le programme des vols ; le petit panneau des douze
  // teintes vient dans le panneau d'une compagnie, sur la page « Commandes ».
  await nav.aller(page,'v-programme');await page.waitForTimeout(300);
  assert.equal(await page.locator(CARTE).count(),0,'plus de carte au bas du programme des vols');
  await nav.aller(page,'mu-commandes');await page.waitForTimeout(300);
  const panneau=page.locator('#mu-commandes .co-panneau[data-co-panneau="compagnie"]');
  const ouvrirPanneau=async nom=>{if(await panneau.count()&&await panneau.getAttribute('data-co-nom')===nom)return;
    await page.locator('#mu-commandes [data-co-ouvrir="'+nom+'"]').click();await page.locator('#mu-commandes .co-panneau[data-co-nom="'+nom+'"]').waitFor();};
  const choisirTeinte=async(nom,rang)=>{await ouvrirPanneau(nom);await panneau.locator('[data-pa-teinte="'+rang+'"]').click();
    await page.locator('#mu-commandes .co-panneau [data-pa-teinte="'+rang+'"][aria-checked="true"]').waitFor();};
  assert.deepEqual(await page.locator('#mu-commandes [data-co-ouvrir]').evaluateAll(l=>l.map(b=>b.dataset.coOuvrir+' '+[...new Set([...b.querySelectorAll('.pa-cie')].map(e=>e.dataset.paRang))].join(','))),
    ['EST 1','NORD 2','OUEST 3','SUD 4','ZEN 5'],'une compagnie par groupe : sa pastille, à la couleur du moment');
  // Au clavier : les douze couleurs d'une compagnie sont un seul arrêt ; les flèches vont de l'une à l'autre.
  await ouvrirPanneau('NORD');
  assert.deepEqual(await panneau.locator('[data-pa-teinte]').evaluateAll(l=>[l.length].concat(l.filter(b=>b.tabIndex===0).map(b=>b.dataset.paTeinte))),[12,'2'],'douze teintes, un seul arrêt : la couleur du moment');
  await panneau.locator('[data-pa-teinte="2"]').focus();
  await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.paTeinte),'4','deux flèches à droite : la couleur 4 a le focus');
  await page.keyboard.press('Home');await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.paTeinte),'12','au bout, la flèche fait le tour');
  assert.equal(await garde(page),null,'se déplacer ne choisit rien');
  await page.keyboard.press('Escape');
  assert.deepEqual(await page.evaluate(()=>[document.querySelectorAll('#mu-commandes .co-panneau').length,document.activeElement.matches('[data-co-ouvrir="NORD"]')]),[0,true],'Échap ferme le panneau et rend le focus à la compagnie');
  // Panneau ouvert : la fenêtre ne défile pas, aucun texte sous 13 px, le panneau tient dans la fenêtre.
  await ouvrirPanneau('NORD');
  assert.deepEqual(await page.evaluate(()=>[document.documentElement.scrollHeight<=innerHeight,document.documentElement.scrollWidth<=innerWidth]),[true,true],'la fenêtre ne défile pas');
  assert.deepEqual(await panneau.evaluate(c=>[...c.querySelectorAll('*')].filter(e=>e.getClientRects().length&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&parseFloat(getComputedStyle(e).fontSize)<13).map(e=>e.className)),[],'aucun texte sous 13 px');
  assert.ok(await panneau.evaluate(c=>c.getBoundingClientRect().bottom<=innerHeight),'le panneau tient dans la fenêtre');

  // Un choix : la couleur 9 pour NORD. Il s'écrit dans son entrée ; les pastilles de NORD suivent ; le calcul ne bouge pas.
  const calcul=await page.evaluate(CALCUL),ateliers=await page.evaluate(()=>localStorage.getItem('ory-ateliers-v1'));
  await choisirTeinte('NORD',9);
  await page.waitForFunction(k=>localStorage.getItem(k)!==null,CLE);
  assert.deepEqual(JSON.parse(await garde(page)),{schema:'ory-couleurs-compagnies',version:1,couleurs:{NORD:9}},'le choix porte un rang, pas une teinte');
  assert.deepEqual(await page.evaluate(()=>[...new Set([...document.querySelectorAll('#workspace .pa-cie[data-pa-cle="NORD"]')].map(e=>e.dataset.paRang))]),['9'],'toutes les pastilles de NORD');
  assert.deepEqual(await page.evaluate(()=>['EST','OUEST','SUD','ZEN'].map(c=>OrlyPastilles.rang(c))),[1,3,4,5],'les autres gardent leur couleur automatique');
  assert.equal(await page.evaluate(CALCUL),calcul,'le résultat et les réponses sont les mêmes avec un choix');
  assert.equal(await page.evaluate(()=>localStorage.getItem('ory-ateliers-v1')),ateliers,'les équipes ne sont pas réécrites');
  assert.match(await page.locator('#notifs .notif').last().textContent(),/NORD\s: couleur 9\./);
  await page.locator('#notifs .notif-annuler').last().click();
  await page.waitForFunction(k=>localStorage.getItem(k)===null,CLE);
  assert.equal(await page.evaluate(()=>OrlyPastilles.rang('NORD')),2,'« Annuler » : la couleur automatique revient, l’entrée disparaît');
  await choisirTeinte('NORD',9);
  await page.waitForFunction(k=>localStorage.getItem(k)!==null,CLE);

  // « Garder ces couleurs » et « Revenir aux couleurs automatiques » n'ont plus de bouton depuis que la carte est partie ;
  // le module les garde. Garder : chacune reçoit sa couleur du moment (une compagnie de plus ne les déplace plus : plus bas).
  await page.evaluate(()=>OrlyPastilles.garderCouleurs());
  await page.waitForFunction(k=>Object.keys(JSON.parse(localStorage.getItem(k)).couleurs).length===5,CLE);
  assert.deepEqual(JSON.parse(await garde(page)).couleurs,{EST:1,NORD:9,OUEST:3,SUD:4,ZEN:5});

  // Revenir : les choix s'effacent ; « Annuler » les rend.
  const gardees=await garde(page);
  await page.evaluate(()=>OrlyPastilles.revenirAuxAutomatiques());
  await page.waitForFunction(k=>localStorage.getItem(k)===null,CLE);
  assert.deepEqual(await page.evaluate(()=>['EST','NORD','OUEST','SUD','ZEN'].map(c=>OrlyPastilles.rang(c))),[1,2,3,4,5]);
  assert.match(await page.locator('#notifs .notif').last().textContent(),/Couleurs automatiques/);
  await page.locator('#notifs .notif-annuler').last().click();
  await page.waitForFunction(k=>localStorage.getItem(k)!==null,CLE);
  assert.equal(await garde(page),gardees,'« Annuler » rend les choix, à l’identique');

  /* ---- 5. Un choix survit à « Tout sauvegarder » puis « Restaurer » ------------------------------------------------------ */
  const avec=await sauvegarder(page);
  assert.deepEqual(avec.contenu[CLE],JSON.parse(gardees),'la sauvegarde porte l’entrée, à part');
  const sansEntree=JSON.parse(JSON.stringify(avec));delete sansEntree.contenu[CLE];
  assert.equal(JSON.stringify(sansEntree.contenu),JSON.stringify(sauvegardeAvant.contenu),'le reste de la sauvegarde est celui d’avant');
  // Une sauvegarde sans l'entrée : la question le dit, les couleurs automatiques reviennent.
  await restaurer(page,sansEntree);
  assert.match(await page.locator('dialog.question[open]').textContent({timeout:5000}),/Elle n’a pas de couleurs de compagnies\s: les couleurs automatiques reviennent\./);
  await apresRestauration();
  assert.equal(await garde(page),null);
  assert.equal(await page.evaluate(()=>OrlyPastilles.rang('NORD')),2);
  // Sans choix dans le navigateur, la même sauvegarde se restaure avec la question d'avant.
  await restaurer(page,sansEntree);
  assert.doesNotMatch(await page.locator('dialog.question[open]').textContent({timeout:5000}),/couleurs/);
  await nav.repondre(page,false);
  // Une entrée abîmée refuse la sauvegarde entière.
  const abimee=JSON.parse(JSON.stringify(avec));abimee.contenu[CLE].couleurs.NORD=13;
  await restaurer(page,abimee);
  await page.waitForFunction(()=>/Restauration refusée : couleurs des compagnies : la couleur de NORD se choisit de 1 à 12\./.test(document.getElementById('sauvegarde-etat').textContent));
  assert.equal(await garde(page),null,'un refus ne touche à rien');
  // La sauvegarde complète : le choix revient.
  await restaurer(page,avec);
  await apresRestauration();
  assert.equal(await garde(page),gardees,'l’entrée revient à l’identique');
  await nav.aller(page,'v-programme');await page.waitForTimeout(300);
  assert.deepEqual(await page.evaluate(()=>[...new Set([...document.querySelectorAll('#vp-tableau .pa-cie[data-pa-cle="NORD"]')].map(e=>e.dataset.paRang))]),['9'],'après la restauration, NORD a sa couleur');
  assert.equal(await page.evaluate(CALCUL),calculFrais,'après la restauration, le résultat est celui de la page fraîchement ouverte, sans choix');

  // Le code d'avant relit la sauvegarde qui porte les couleurs. La version 2, gelée, ne connaît pas cette entrée : elle
  // l'ignore, ne la garde pas, et son résultat est le même, champ par champ, avec ou sans elle.
  const lireV2=async sauvegarde=>{
    const ctx=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'}),p2=await ctx.newPage();
    p2.on('pageerror',e=>erreurs.push('v2 : '+e.message));p2.on('dialog',d=>d.accept());
    const s2=await F.charger(p2,nav,URL_V2,{sauvegarde,pageId:'mu-flux'});
    await p2.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat);
    const r={resultat:await p2.evaluate(()=>JSON.stringify(Sim.ateliers.resultat)),cles:await p2.evaluate(()=>Object.keys(localStorage).filter(k=>/couleurs/.test(k)))};
    s2.effacer();await ctx.close();return r;
  };
  const v2Avec=await lireV2(avec),v2Sans=await lireV2(sansEntree);
  assert.ok(JSON.parse(v2Avec.resultat).lots.length>10,'la version 2 calcule la journée');
  assert.equal(v2Avec.resultat,v2Sans.resultat,'la version 2 : le même résultat avec et sans l’entrée');
  assert.deepEqual(v2Avec.cles,[],'la version 2 ne garde pas l’entrée');

  /* ---- 6. Chaque pastille tient 4,5:1, dans les deux thèmes ---------------------------------------------------------------- */
  for(const [theme,teintes,encre] of [['clair',CLAIR,'#FFFFFF'],['sombre',SOMBRE,'#161113']]){
    await page.evaluate(t=>{if(t==='sombre')document.documentElement.dataset.theme='sombre';else delete document.documentElement.dataset.theme;},theme);
    await page.waitForTimeout(200);
    for(let rang=1;rang<=12;rang++){
      await page.evaluate(r=>OrlyPastilles.choisirCouleur('NORD',r),rang);
      const p=await page.evaluate(()=>{const e=document.querySelector('#vp-tableau .pa-cie[data-pa-cle="NORD"]'),c=getComputedStyle(e);return {rang:e.dataset.paRang,fond:c.backgroundColor,texte:c.color};});
      assert.deepEqual([p.rang,p.fond,p.texte],[String(rang),rvb(teintes[rang-1]),rvb(encre)],theme+' : la couleur '+rang+' est celle de la demande');
      assert.ok(contraste(p.fond,p.texte)>=4.5,theme+' : couleur '+rang+' = '+contraste(p.fond,p.texte).toFixed(2)+':1');
    }
    // La pastille d'un nom long (ses deux lettres) a les mêmes couleurs.
    const long=await page.evaluate(()=>{const e=document.querySelector('#vp-tableau .pa-cie.pa-long'),c=getComputedStyle(e,'::before');return [c.backgroundColor,c.color];});
    assert.ok(contraste(long[0],long[1])>=4.5,theme+' : la pastille de deux lettres');
  }
  await page.evaluate(()=>{delete document.documentElement.dataset.theme;});

  // Les couleurs sont gardées : une compagnie de plus (une commande ajoutée) prend sa couleur automatique, sans déplacer
  // les autres. (En dernier : ce geste d'essai sur les équipes n'a pas à peser sur les résultats comparés plus haut.)
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ajoutees.push({cie:'ALPHA',cabine:'YC'});},''));
  await page.waitForFunction(()=>OrlyPastilles.rang('ALPHA')!==null);
  assert.deepEqual(await page.evaluate(()=>['ALPHA','EST','NORD','OUEST','SUD','ZEN'].map(c=>OrlyPastilles.rang(c))),[1,1,12,3,4,5],'ALPHA prend la première couleur ; les autres ne bougent pas');
  assert.equal(JSON.parse(await garde(page)).couleurs.ALPHA,undefined,'la nouvelle n’est pas écrite tant qu’on ne la garde pas');
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;st.ajoutees=st.ajoutees.filter(c=>c.cie!=='ALPHA');},''));
  await page.waitForFunction(()=>OrlyPastilles.rang('ALPHA')===null);

  /* ---- 7. En lecture seule, un choix ne s'écrit pas ------------------------------------------------------------------------ */
  const avantLecture=await garde(page);
  await page.locator('#btn-lecture-seule').click();await page.waitForFunction(()=>document.body.dataset.lecture==='seule');
  await page.evaluate(()=>{OrlyPastilles.choisirCouleur('SUD',7);OrlyPastilles.revenirAuxAutomatiques();OrlyPastilles.garderCouleurs();});
  assert.equal(await garde(page),avantLecture,'lecture seule : rien n’est écrit');
  await page.locator('#btn-lecture-seule').click();await page.waitForFunction(()=>document.body.dataset.lecture!=='seule');
  // Une entrée abîmée dans le navigateur se lit comme « aucun choix ».
  await page.evaluate(k=>localStorage.setItem(k,'{"schema":"ory-couleurs-compagnies","version":9,"couleurs":{}}'),CLE);
  await page.evaluate(()=>OrlyPastilles.relire());
  assert.deepEqual(await page.evaluate(()=>['EST','NORD','OUEST','SUD','ZEN'].map(c=>OrlyPastilles.rang(c))),[1,2,3,4,5]);

  await fermer();
  assert.deepEqual(erreurs,[],'aucune erreur de page : '+erreurs.join(' | '));
  console.log('OK pastilles : le texte de chaque page du menu est celui d’avant ; la pastille (6 px, 22 px, 700 ; deux lettres pour un nom long) et l’étiquette (22 px, le point de la classe), les mêmes partout ; sans choix la sauvegarde d’avant, octet pour octet ; les douze couleurs dans le panneau d’une compagnie de « Commandes » (un choix, « Garder », « Revenir », « Annuler »), plus de carte au programme des vols ; le même résultat avec et sans choix ; le choix survit à sauvegarder puis restaurer ; douze couleurs à 4,5:1 dans les deux thèmes ; rien en lecture seule');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

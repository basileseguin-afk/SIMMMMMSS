/* Correction 18 (b) — le planning des équipes : d'abord toute l'unité sur un
 * écran. Sur l'unité fictive de 15 services et 50 équipes
 * (tests/unite-15-services.cjs : 15 services qui ont des lots le jour des vols,
 * 3 mises à disposition sans lot), à 1 366 × 768 puis à 1 920 × 1 080 :
 *   1. à l'ouverture, tous les services sont repliés : les 15 lignes de service
 *      (32 px) et la ligne « Sans lot ce jour (n) » se voient sans défilement ;
 *      chaque ligne porte son nom, le nombre de ses équipes, « pic au travail /
 *      présents », sa courbe et un trait fin par lot ;
 *   2. le planning fait au moins 60 % de la hauteur de la fenêtre ; ni texte
 *      d'introduction ni bande « Sur la journée » ; les boutons et la légende
 *      tiennent sur une ligne ; la légende ne montre que les signes à l'écran ;
 *   3. aucun service sans lot dans les premières lignes : ils sont en bas, sous
 *      « Sans lot ce jour (n) » ;
 *   4. « Un jour » : la première heure affichée précède de 30 min le premier
 *      lot ; la fenêtre remplit la largeur, une heure fait au moins 40 px ;
 *   5. les onglets ne listent que les jours de travail qui ont des lots, avec
 *      le nombre d'équipes qui y travaillent ; à l'ouverture, celui qui a le
 *      plus de lots ;
 *   6. déplier un service montre son résumé en entier et ses équipes (leur nom,
 *      leur nombre de personnes, la bande hachurée avant le premier lot) ; la
 *      page se souvient du choix (ce navigateur aussi, après un rechargement) ;
 *      un clic sur un service de la Synthèse l'ouvre ici, sur son jour de
 *      travail ; « Tout déplier », « Tout replier » ;
 *   7. une barre fait au moins 3 px de large, à tous les zooms ; le trait vers
 *      la limite d'une commande ne dépasse pas la fenêtre : au-delà, une
 *      flèche au bord droit, avec la limite au survol ;
 *   8. « Plein écran » recouvre le menu et l'en-tête ; Échap en sort ;
 *   9. aucun nom coupé sans infobulle ; la colonne des noms fait 260 px au plus.
 * Aucune donnée de l'unité : tout est fictif. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const U=require('./unite-15-services.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const E=require('../planning-ensemble.js');
const PV=require('../planning-vue.js');
const P=require('../moteur/production.js');
const {siteSansPlan}=require('./plan-fictif.cjs');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

// La même journée, calculée hors de la page : ce que le planning doit montrer.
const sauvegarde=U.sauvegarde(),CSV=U.volsCsv(),J=F.heureDuPicAttendue(sauvegarde,CSV),R=J.resultat;
const ORDRE=PV.ordreDesServices(R,J.args.parcours),JOUR=E.lignes(R,0,ORDRE,id=>id),VEILLE=E.lignes(R,-1,ORDRE,id=>id),CADRE=E.cadreDuJour(R,0),CADRE_VEILLE=E.cadreDuJour(R,-1);

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const site=siteSansPlan();
 try{
  assert.equal(JOUR.services.length,15,'l’unité fictive : 15 services avec des lots le jour des vols');
  assert.equal(R.ateliers.length,50,'et 50 équipes');
  for(const [largeur,hauteur] of [[1366,768],[1920,1080]]){
   const V=largeur+' × '+hauteur+' : ';
   const page=await browser.newPage({viewport:{width:largeur,height:hauteur}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   const ch=await U.charger(page,nav,site.url('index.html'),{pageId:'at-planning'});
   try{
    await page.waitForSelector('#at-planning .pg-cadre .pg-groupe');
    /** Attendre que le planning ait fini de se dessiner : le même dessin deux images de suite. */
    const pose=()=>page.waitForFunction(()=>{const c=document.querySelector('#at-planning .pg-cadre');if(!c||!c.querySelector('.pg-groupe'))return false;
      const cle=c.querySelectorAll('.pg-groupe').length+'|'+c.clientHeight+'|'+c.scrollWidth+'|'+c.querySelectorAll('.pg-lignes:not([hidden])').length+'|'+document.querySelector('#at-planning').className;
      const stable=window.__pgCle===cle;window.__pgCle=cle;return stable;},null,{polling:100});
    await pose();
    const lire=()=>page.evaluate(()=>{
      const box=document.getElementById('at-planning'),c=box.querySelector('.pg-cadre'),rc=c.getBoundingClientRect(),v=OrlyPlanningVue.etat.vue;
      const r=e=>{const b=e.getBoundingClientRect();return {h:b.top,b:b.bottom,g:b.left,d:b.right,haut:b.height,large:b.width};};
      const groupes=[...c.querySelectorAll('.pg-groupe')].map(g=>{const t=g.querySelector('.pg-groupe-tete'),n=g.querySelector('.pg-service');
        return {service:g.dataset.service,lots:+g.dataset.lots,replie:g.classList.contains('replie'),sansLot:g.classList.contains('pg-sans-lot'),tete:r(t),nom:n.textContent,
          compte:(g.querySelector('.pg-groupe-nom .pg-compte')||{}).textContent||null,pic:(g.querySelector('.pg-pic')||{}).textContent||null,courbe:!!g.querySelector('.pg-groupe-tete .ch-mini'),
          traits:g.querySelectorAll('.pg-groupe-tete .pg-trait').length,lignes:g.querySelector('.pg-lignes').hidden?0:g.querySelectorAll('.pg-ligne').length,titre:g.querySelector('.pg-groupe-nom').title};});
      const barre=box.querySelector('.pg-barre');
      return {fenetre:[innerWidth,innerHeight],cadre:{...r(c),defileV:c.scrollHeight-c.clientHeight,defileH:c.scrollWidth-c.clientWidth,haut:c.scrollTop,gauche:c.scrollLeft},groupes,
        vue:{jour:v.jour,t0:v.t0,t1:v.t1,pxh:v.pxh,L:v.L,noms:v.noms,largeur:v.largeur},zoom:[...box.querySelectorAll('[data-pg-zoom][aria-pressed="true"]')].map(b=>b.dataset.pgZoom),
        onglets:[...box.querySelectorAll('[data-pg-jour]')].map(b=>({jour:+b.dataset.pgJour,mot:b.firstChild.textContent,equipes:+b.querySelector('.pg-compte').textContent,choisi:b.getAttribute('aria-pressed')==='true'})),
        periode:box.querySelector('.pg-periode').textContent,
        barre:{...r(barre),deborde:barre.scrollWidth-barre.clientWidth,hauts:[...barre.children].map(x=>Math.round(x.getBoundingClientRect().top+x.getBoundingClientRect().height/2))},
        legende:box.querySelector('.pg-legende').hidden?null:[...box.querySelectorAll('.pg-legende .pg-cle')].map(x=>x.dataset.signe),
        intro:(()=>{const i=document.getElementById('view-intro');return i?i.getClientRects().length:0;})(),bande:document.getElementById('at-indicateurs').getClientRects().length,
        titres:[...document.querySelectorAll('h3.at-titre')].filter(h=>h.getClientRects().length).length,plein:box.classList.contains('pg-plein'),boite:r(box)};});

    // 1. À l'ouverture : tout est replié ; les 15 lignes de service et « Sans lot ce jour » se voient sans défilement.
    let e=await lire();
    assert.deepEqual(e.fenetre,[largeur,hauteur]);
    const services=e.groupes.filter(g=>!g.sansLot);
    assert.equal(services.length,15,V+'15 lignes de service');
    assert.deepEqual(services.map(g=>g.service),JOUR.services.map(s=>s.service),V+'dans l’ordre des chemins');
    assert.ok(e.groupes.every(g=>g.replie&&g.lignes===0),V+'tous repliés à l’ouverture');
    assert.ok(services.every(g=>Math.abs(g.tete.haut-32)<0.5),V+'une ligne de 32 px par service : '+[...new Set(services.map(g=>g.tete.haut))]);
    assert.deepEqual([e.cadre.haut,e.cadre.defileV],[0,0],V+'sans défilement vertical');
    for(const g of e.groupes)assert.ok(g.tete.h>=e.cadre.h-1&&g.tete.b<=e.cadre.b+1&&g.tete.b<=hauteur,V+g.service+' : sa ligne est à l’écran ('+Math.round(g.tete.h)+'–'+Math.round(g.tete.b)+', fenêtre '+hauteur+')');
    // Chaque ligne : son nom, le nombre de ses équipes, « pic au travail / présents », sa courbe, un trait fin par lot.
    for(const g of services){
     const attendu=JOUR.services.find(s=>s.service===g.service);
     assert.ok(g.nom.length>2,V+g.service+' : son nom');
     assert.equal(+g.compte,attendu.equipes.length,V+g.service+' : le nombre de ses équipes');
     assert.match(g.pic,/^(—|\d+(,\d)?( \/ \d+(,\d)?)?)$/,V+g.service+' : « pic au travail / présents » — '+g.pic);
     assert.equal(g.traits,attendu.lots,V+g.service+' : un trait par lot');
     assert.ok(g.courbe,V+g.service+' : sa courbe de charge');
     assert.match(g.titre,/équipes?\n(pic \d|personne au travail|travail sans objet)/,V+g.service+' : son résumé au survol — '+g.titre);
    }
    assert.ok(services.some(g=>/^\d+(,\d)? \/ \d+/.test(g.pic)),V+'des pics chiffrés');

    // 2. Le planning fait au moins 60 % de la hauteur de la fenêtre ; rien d'autre que lui dans la page ; une ligne de boutons.
    assert.ok(e.cadre.haut===0&&e.cadre.b-e.cadre.h>=0.6*hauteur,V+'le planning fait '+Math.round((e.cadre.b-e.cadre.h)/hauteur*100)+' % de la hauteur');
    assert.ok(e.cadre.b<=hauteur,V+'il tient dans la fenêtre');
    assert.deepEqual([e.intro,e.bande,e.titres],[0,0,0],V+'ni texte d’introduction, ni bande « Sur la journée », ni titre de section');
    assert.ok(e.barre.haut<=36&&e.barre.deborde<=1&&Math.max(...e.barre.hauts)-Math.min(...e.barre.hauts)<=2,V+'les boutons et la légende sur une ligne : '+JSON.stringify(e.barre));
    assert.ok(e.barre.b<=e.cadre.h,V+'au-dessus du planning');
    // La légende : les seuls signes à l'écran — tout replié, ni barre de travail ni limite.
    assert.ok(e.legende.includes('presents')&&e.legende.includes('autravail')&&e.legende.includes('trait'),V+'la légende des lignes repliées : '+e.legende);
    for(const signe of ['travail','pause','motif','chaine','retard','limite','avant'])assert.ok(!e.legende.includes(signe),V+'replié, pas de « '+signe+' » dans la légende');

    // 3. Aucun service sans lot dans les premières lignes : ils sont en bas, sous « Sans lot ce jour (n) ».
    assert.ok(services.every(g=>g.lots>0&&g.traits>0),V+'chaque ligne de service a des lots');
    const dernier=e.groupes[e.groupes.length-1];
    assert.ok(dernier.sansLot&&dernier.replie,V+'la dernière ligne, repliée');
    assert.equal(dernier.nom,'Sans lot ce jour ('+JOUR.sansLot.length+')',V+'« Sans lot ce jour (n) »');
    assert.equal(e.groupes.filter(g=>g.sansLot).length,1);
    for(const s of ['magasin','appros'])assert.ok(!services.some(g=>g.service===s),V+'la mise à disposition '+s+' n’est pas dans les lignes de service');

    // 4. « Un jour » : la première heure affichée précède de 30 min le premier lot ; la fenêtre remplit la largeur.
    assert.deepEqual(e.zoom,['jour'],V+'« Un jour » à l’ouverture');
    const premier=Math.min(...R.ateliers.filter(a=>(a.jour||0)===0).flatMap(E.lotsDe).map(l=>l.debut));
    assert.deepEqual([e.vue.t0,e.vue.t1],[CADRE.t0,CADRE.t1]);
    assert.equal(e.vue.t0,premier-30,V+'30 min avant le premier lot ('+P.hhmm(premier)+')');
    assert.equal(e.periode.split(' → ')[0],'J '+P.hhmm(premier-30),V+'la période visible commence là : '+e.periode);
    assert.ok(e.vue.pxh>=40,V+'une heure fait au moins 40 px : '+e.vue.pxh.toFixed(1));
    const heures=(CADRE.t1-CADRE.t0)/60;
    if(e.vue.largeur/heures>=40){
     assert.ok(Math.abs(e.vue.L-e.vue.largeur)<=1&&e.cadre.defileH<=1,V+'la fenêtre remplit la largeur, sans défilement : '+e.vue.L+' px pour '+e.vue.largeur);
     assert.equal(e.periode,'J '+P.hhmm(CADRE.t0)+' → J '+P.hhmm(CADRE.t1),V+'tout le jour se voit');
    }else assert.equal(e.vue.pxh,40,V+'trop d’heures pour la largeur : 40 px par heure, on défile');

    // 5. Les onglets : les seuls jours de travail qui ont des lots, avec leurs équipes ; celui qui a le plus de lots est ouvert.
    assert.deepEqual(e.onglets,[{jour:-1,mot:'veille',equipes:2,choisi:false},{jour:0,mot:'jour des vols',equipes:35,choisi:true}],V+'les onglets');
    assert.equal(e.vue.jour,0);
    await page.locator('#at-planning [data-pg-jour="-1"]').click();await pose();
    let v=await lire();
    assert.deepEqual(v.onglets.map(o=>o.choisi),[true,false]);
    assert.deepEqual(v.groupes.map(g=>[g.service,g.sansLot]),[...VEILLE.services.map(s=>[s.service,false]),['§sans-lot',true]],V+'la veille : la cuisine, puis « Sans lot ce jour »');
    assert.equal(v.groupes[v.groupes.length-1].nom,'Sans lot ce jour ('+VEILLE.sansLot.length+')');
    assert.deepEqual([v.vue.t0,v.vue.t1],[CADRE_VEILLE.t0,CADRE_VEILLE.t1],V+'le cadre de la veille');
    assert.equal(v.periode.split(' → ')[0],'J-1 '+P.hhmm(CADRE_VEILLE.t0+1440));
    // La limite d'une commande finie la veille tombe le jour des vols, après la fenêtre : le trait s'arrête au bord droit,
    // où une flèche dit son heure au survol.
    await page.locator('#at-planning .pg-groupe[data-service="cuisine"] .pg-replier').click();await pose();
    const traits=()=>page.evaluate(()=>{const vue=OrlyPlanningVue.etat.vue,c=document.querySelector('#at-planning .pg-cadre');
      return {L:vue.L,fleches:[...c.querySelectorAll('.pg-fleche')].map(f=>({t:+f.dataset.limite,info:f.getAttribute('data-info'),droite:f.getBBox().x+f.getBBox().width})),
        limites:[...c.querySelectorAll('.pg-limite')].map(l=>+l.getAttribute('x1')),marges:[...c.querySelectorAll('.pg-marge')].map(l=>Math.max(+l.getAttribute('x1'),+l.getAttribute('x2')))};});
    const echeance=R.parClasse[U.FINIE_LA_VEILLE].echeance,hors=await traits();
    assert.ok(echeance>CADRE_VEILLE.t1,'la commande fictive finie la veille : sa limite est après la fenêtre de la veille');
    assert.deepEqual(hors.fleches.map(f=>f.t),[echeance],V+'une flèche pour la limite hors de la fenêtre');
    assert.equal(hors.fleches[0].info,'Prête avant J '+P.hhmm(echeance)+' : après la fenêtre affichée',V+'la limite au survol');
    assert.ok(hors.fleches[0].droite<=hors.L&&hors.fleches[0].droite>=hors.L-10,V+'au bord droit : '+hors.fleches[0].droite+' / '+hors.L);
    assert.ok(hors.marges.length>=1&&hors.marges.every(x=>x<=hors.L)&&hors.limites.every(x=>x<=hors.L),V+'aucun trait ne dépasse la fenêtre');
    assert.ok((await lire()).legende.includes('fleche'),V+'la légende la nomme');
    await page.locator('#at-planning .pg-groupe[data-service="cuisine"] .pg-replier').click();await pose();
    await page.locator('#at-planning [data-pg-jour="0"]').click();await pose();

    // 6. Déplier un service : son résumé en entier, ses équipes ; la page s'en souvient.
    const montage=page.locator('#at-planning .pg-groupe[data-service="prepa"]');
    await montage.locator('.pg-replier').click();await pose();
    e=await lire();
    const mo=e.groupes.find(g=>g.service==='prepa'),attenduMo=JOUR.services.find(s=>s.service==='prepa');
    assert.equal(mo.replie,false);assert.equal(mo.lignes,attenduMo.equipes.length,V+'ses équipes');
    assert.ok(e.groupes.filter(g=>g.service!=='prepa').every(g=>g.replie),V+'les autres restent repliés');
    const detail=await montage.evaluate(g=>{const p=g.querySelector('.pg-detail-texte'),c=document.querySelector('#at-planning .pg-cadre').getBoundingClientRect(),b=p.getBoundingClientRect();
      return {texte:p.textContent,coupe:p.scrollWidth>p.clientWidth+1,dedans:b.left>=c.left-1&&b.right<=c.right+1,
        equipes:[...g.querySelectorAll('.pg-ligne')].map(l=>({id:l.dataset.equipe,nom:l.querySelector('.pg-nom-texte').textContent,pers:l.querySelector('.pg-pers').textContent,titre:l.querySelector('.pg-nom').title,
          haut:l.getBoundingClientRect().height,avant:(a=>a?{de:+a.dataset.de,a:+a.dataset.a,info:a.getAttribute('data-info'),x:+a.getAttribute('x'),large:+a.getAttribute('width')}:null)(l.querySelector('.pg-avant'))}))};});
    assert.match(detail.texte,/^pic \d+(,\d)? au travail à \d\d:\d\d, \d+(,\d)? présents? · occupation \d+ % · (aucune heure sup|heures sup .+ \(personnes × heures\))$/,V+'le résumé du service : '+detail.texte);
    assert.ok(!detail.coupe&&detail.dedans,V+'en entier, pas coupé');
    assert.deepEqual(detail.equipes.map(q=>q.id),attenduMo.equipes.map(a=>a.id));
    for(const q of detail.equipes){
     const a=R.ateliers.find(x=>x.id===q.id);
     assert.equal(q.pers,E.motsDesPersonnes(a),V+q.id+' : son nombre de personnes');
     assert.ok(q.titre.startsWith(a.nom+' — '+q.pers),V+q.id+' : son nom entier au survol');
     assert.ok(Math.abs(q.haut-28)<0.5,V+'des lignes d’équipe de 28 px');
    }
    // La bande hachurée du montage : de son arrivée à son premier lot ; au survol, sa durée et ce qu'il attendait.
    const avant=E.avantLePremierLot(R,require('../moteur/reponses.js').reponses(R,J.args,{k:J.k})).get('mo');
    assert.ok(avant&&avant.minutes>=60&&avant.attendait,'le montage fictif attend avant son premier lot');
    const bande=detail.equipes.find(q=>q.id==='mo').avant;
    assert.ok(bande,V+'la bande hachurée du montage');
    assert.deepEqual([bande.de,bande.a],[avant.de,avant.a]);
    assert.ok(Math.abs(bande.x-(avant.de-e.vue.t0)/60*e.vue.pxh)<0.1&&Math.abs(bande.large-(avant.a-avant.de)/60*e.vue.pxh)<0.1,V+'de son arrivée à son premier lot');
    assert.equal(bande.info,E.motsDAvant(avant));
    assert.match(bande.info,/^Sans travail avant le premier lot : \d+ h \d\d \(de \d\d:\d\d à \d\d:\d\d\)\nL’équipe attend /);
    // Déplié, la légende montre les signes de ses barres.
    assert.ok(e.legende.includes('travail')&&e.legende.includes('avant'),V+'la légende suit ce qui est à l’écran : '+e.legende);
    // La page s'en souvient : un autre jour puis retour ; une autre page puis retour.
    await page.locator('#at-planning [data-pg-jour="-1"]').click();await pose();
    await page.locator('#at-planning [data-pg-jour="0"]').click();await pose();
    assert.equal((await lire()).groupes.find(g=>g.service==='prepa').replie,false,V+'déplié après un changement de jour');
    await nav.aller(page,'j-chiffres');await page.waitForSelector('#bilan-journee tr[data-service="cuisine"][data-jour="-1"] .sy-service');
    await nav.aller(page,'at-planning');await pose();
    assert.equal((await lire()).groupes.find(g=>g.service==='prepa').replie,false,V+'déplié au retour sur la page');
    assert.deepEqual(JSON.parse(await page.evaluate(()=>localStorage.getItem('ory-ui-planning-deplies'))),['prepa'],V+'ce navigateur retient les services dépliés (une préférence d’affichage)');
    // Depuis la Synthèse : un clic sur la cuisine de la veille l'ouvre ici, sur l'onglet de la veille, dépliée.
    await nav.aller(page,'j-chiffres');
    await page.locator('#bilan-journee tr[data-service="cuisine"][data-jour="-1"] .sy-service').click();
    await page.waitForFunction(()=>document.body.dataset.sous==='at-planning'&&OrlyPlanningVue.etat.vue&&OrlyPlanningVue.etat.vue.jour===-1);await pose();
    e=await lire();
    assert.deepEqual(e.onglets.map(o=>o.choisi),[true,false],V+'la Synthèse ouvre le jour de travail de la ligne');
    assert.equal(e.groupes.find(g=>g.service==='cuisine').replie,false,V+'le service visé est déplié');
    assert.equal(await page.locator('#at-planning .pg-groupe.pg-vise').getAttribute('data-service'),'cuisine');
    await page.locator('#at-planning .pg-groupe[data-service="cuisine"] .pg-replier').click();await pose();
    await page.locator('#at-planning [data-pg-jour="0"]').click();await pose();
    // « Tout déplier », « Tout replier ».
    await page.locator('#at-planning [data-pg-tout="deplier"]').click();await pose();
    e=await lire();
    assert.ok(e.groupes.every(g=>!g.replie&&g.lignes>0),V+'« Tout déplier »');
    assert.equal(e.groupes.reduce((n,g)=>n+g.lignes,0),JOUR.services.reduce((n,s)=>n+s.equipes.length,0)+JOUR.sansLot.length,V+'toutes les équipes du jour');
    // Sous « Sans lot ce jour » : les mises à disposition et les équipes sans commande, avec leur service.
    const sans=await page.locator('#at-planning .pg-sans-lot .pg-ligne').evaluateAll(ls=>ls.map(l=>({id:l.dataset.equipe,service:(l.querySelector('.pg-nom-service')||{}).textContent,lots:l.querySelectorAll('.pg-lot').length})));
    assert.deepEqual(sans.map(x=>x.id),JOUR.sansLot.map(x=>x.equipe.id));
    assert.ok(sans.every(x=>x.lots===0&&x.service),V+'sans barre, avec leur service');
    // Le jour des vols : toutes les limites sont dans la fenêtre — des traits, aucune flèche.
    const dedans=await traits();
    assert.ok(dedans.limites.length>=10&&dedans.fleches.length===0&&dedans.limites.every(x=>x<=dedans.L)&&dedans.marges.every(x=>x<=dedans.L),V+'les limites du jour, dans la fenêtre');

    // 7. Une barre fait au moins 3 px de large, à tous les zooms.
    for(const zoom of ['jour','six','chaine']){
     await page.locator('#at-planning [data-pg-zoom="'+zoom+'"]').click();await pose();
     const larges=await page.locator('#at-planning .pg-lot').evaluateAll(gs=>gs.map(g=>+g.dataset.x1-+g.dataset.x));
     assert.ok(larges.length>=80&&larges.every(w=>w>=3-1e-6),V+zoom+' : la barre la plus fine fait '+Math.min(...larges).toFixed(2)+' px');
     const traits=await page.locator('#at-planning .pg-trait').evaluateAll(ls=>ls.map(l=>+l.getAttribute('x2')-+l.getAttribute('x1')));
     assert.ok(traits.every(w=>w>=3-1e-6),V+zoom+' : le trait le plus fin fait '+Math.min(...traits).toFixed(2)+' px');
    }
    // « Toute la chaîne » : tous les jours à la fois, aucun onglet choisi ; un onglet ramène à « Un jour ».
    e=await lire();
    assert.deepEqual([e.zoom,e.onglets.map(o=>o.choisi),e.vue.jour],[['chaine'],[false,false],null]);
    assert.ok(e.cadre.defileH<=1,V+'toute la chaîne dans la largeur');
    assert.equal(e.groupes.find(g=>g.service==='cuisine').lignes,3,V+'la cuisine de la veille et celle du jour');
    await page.locator('#at-planning [data-pg-jour="0"]').click();await pose();
    e=await lire();
    assert.deepEqual([e.zoom,e.vue.jour],[['jour'],0]);
    await page.locator('#at-planning [data-pg-tout="replier"]').click();await pose();
    e=await lire();
    assert.ok(e.groupes.every(g=>g.replie&&g.lignes===0),V+'« Tout replier »');
    assert.equal(e.cadre.defileV,0);

    // 8. « Plein écran » recouvre le menu et l'en-tête ; Échap en sort.
    const dessus=()=>page.evaluate(()=>[[20,20],[innerWidth-20,20],[20,innerHeight-20]].map(([x,y])=>!!document.elementFromPoint(x,y).closest('#at-planning')));
    assert.deepEqual(await dessus(),[false,false,false],V+'avant : le menu et l’en-tête sont là');
    await page.locator('#at-planning [data-pg-plein]').click();await pose();
    e=await lire();
    assert.equal(e.plein,true);
    assert.ok(e.boite.g<=0&&e.boite.h<=0&&e.boite.d>=largeur&&e.boite.b>=hauteur,V+'le planning prend tout l’écran');
    assert.deepEqual(await dessus(),[true,true,true],V+'le menu et l’en-tête sont recouverts');
    assert.equal(await page.locator('#at-planning [data-pg-plein]').getAttribute('aria-pressed'),'true');
    assert.ok(e.cadre.b-e.cadre.h>=0.85*hauteur&&e.cadre.b<=hauteur,V+'en plein écran : '+Math.round((e.cadre.b-e.cadre.h)/hauteur*100)+' % de la hauteur');
    assert.ok(e.groupes.every(g=>g.tete.b<=e.cadre.b+1),V+'toute l’unité se voit');
    await page.keyboard.press('Escape');await pose();
    e=await lire();
    assert.equal(e.plein,false,V+'Échap en sort');
    assert.deepEqual(await dessus(),[false,false,false]);
    assert.equal(await page.locator('#at-planning [data-pg-plein]').getAttribute('aria-pressed'),'false');
    assert.ok(e.cadre.b-e.cadre.h>=0.6*hauteur,V+'de retour : toujours 60 % de la hauteur');

    // 9. Aucun nom coupé sans infobulle ; la colonne des noms : 260 px au plus, pour le nom le plus long.
    await page.locator('#at-planning [data-pg-tout="deplier"]').click();await pose();
    const noms=await page.evaluate(()=>{const c=document.querySelector('#at-planning .pg-cadre');
      return {colonne:parseFloat(getComputedStyle(c.querySelector('.pg-toile')).getPropertyValue('--pg-noms')),cellules:[...new Set([...c.querySelectorAll('.pg-nom,.pg-groupe-nom,.pg-coin')].map(x=>Math.round(x.getBoundingClientRect().width)))],
        textes:[...c.querySelectorAll('.pg-nom-texte,.pg-nom-service,.pg-service,.pg-pers,.pg-pic,.pg-periode,.pg-detail-texte'),...document.querySelectorAll('#at-planning .pg-barre button')].filter(x=>x.getClientRects().length)
          .map(x=>({texte:x.textContent.trim(),coupe:x.scrollWidth>x.clientWidth+1,bulle:(x.closest('[title]')||{}).title||''}))};});
    assert.ok(noms.colonne<=260&&noms.colonne>=160,V+'la colonne des noms : '+noms.colonne+' px');
    assert.equal(noms.colonne,260,V+'élargie pour le nom le plus long');
    assert.deepEqual(noms.cellules,[260]);
    assert.ok(noms.textes.length>100);
    const coupes=noms.textes.filter(t=>t.coupe);
    for(const t of coupes)assert.ok(t.bulle.includes(t.texte),V+'« '+t.texte+' » est coupé : son infobulle le dit en entier — « '+t.bulle+' »');
    assert.ok(coupes.some(t=>/renfort du samedi/.test(t.texte)),V+'le nom long est coupé, avec son infobulle');
    assert.ok(noms.textes.filter(t=>/ pers\.$/.test(t.texte)).every(t=>!t.coupe),V+'le nombre de personnes n’est jamais coupé');
    // La légende se replie, et reste sur la ligne des boutons.
    await page.locator('#at-planning .pg-legende-bouton').click();await pose();
    assert.equal((await lire()).legende,null,V+'la légende repliée');
    await page.locator('#at-planning .pg-legende-bouton').click();await pose();
    e=await lire();
    assert.ok(e.legende.length>=6&&e.barre.haut<=36,V+'dépliée, sur la même ligne : '+e.legende);
    // Après un rechargement, ce navigateur retrouve les services laissés dépliés ; une préférence abîmée ne casse rien.
    await page.locator('#at-planning [data-pg-tout="replier"]').click();await pose();
    await page.locator('#at-planning .pg-groupe[data-service="quais"] .pg-replier').click();await pose();
    await page.reload();await page.waitForLoadState('load');await nav.aller(page,'at-planning');await page.waitForSelector('#at-planning .pg-cadre .pg-groupe');await pose();
    assert.deepEqual((await lire()).groupes.filter(g=>!g.replie).map(g=>g.service),['quais'],V+'rechargé : le service déplié le reste, les autres repliés');
    await page.evaluate(()=>localStorage.setItem('ory-ui-planning-deplies','{"pas":"une liste"}'));
    await page.reload();await page.waitForLoadState('load');await nav.aller(page,'at-planning');await page.waitForSelector('#at-planning .pg-cadre .pg-groupe');await pose();
    assert.ok((await lire()).groupes.every(g=>g.replie),V+'une préférence illisible : tout replié, sans erreur');

    assert.deepEqual(errors,[],errors.join(' | '));
   }finally{ch.effacer();await page.close();}
  }
  console.log('planning-ensemble-browser : ok — 15 services repliés sur un écran, 60 % de la hauteur, les sans-lot en bas, « Un jour » cadré sur les lots, les onglets des jours, déplier, plein écran, noms entiers (1 366 × 768 et 1 920 × 1 080).');
 }catch(e){console.error(e);process.exitCode=1;}finally{site.effacer();await browser.close();}
})();

/* Évolution 14 (c), correction 18 (b) — le planning des équipes. Sur l'unité et
 * les vols fictifs (tests/plan-rejoue-fictif.cjs), à 1 280 et 1 920 px de
 * large, les services dépliés (le planning s'ouvre replié : la vue d'ensemble
 * est dans tests/planning-ensemble-browser.cjs) :
 *   1. « Un jour » par défaut, sur le jour de travail qui a le plus de lots,
 *      cadré 30 min avant son premier lot : la fenêtre remplit la largeur (une
 *      heure fait au moins 40 px), la période visible dite ; lignes de 28 px,
 *      textes de 12 à 13 px ; la légende sur la ligne des boutons, en haut ;
 *   2. les trois zooms (boutons et Ctrl + molette) donnent la bonne largeur
 *      d'heure ; on se déplace en glissant ;
 *   3. après un défilement, l'axe et les noms sont à la vue ;
 *   4. une ligne par service qui a des lots, dans l'ordre du chemin, sa courbe
 *      de charge sur la même échelle ; les équipes sans lot sous « Sans lot ce
 *      jour » ; replier un service cache ses équipes ; le tableau des équipes,
 *      replié, sous le planning ;
 *   5. la limite d'une commande en retard est à gauche de la fin de sa barre,
 *      celle d'une commande à l'heure à droite ; le lot en retard a son contour ;
 *   6. le clic sur une barre met en évidence les lots de la même commande,
 *      Échap annule ; l'infobulle au focus clavier ;
 *   7. le trait de l'heure rejouée porte l'heure, dans une autre couleur que
 *      les barres. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const PV=require('../planning-vue.js');
const E=require('../planning-ensemble.js');
const P=require('../moteur/production.js');
const {siteSansPlan}=require('./plan-fictif.cjs');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const sauvegarde=F.sauvegardeFictive(),CSV=F.volsCsv(),J=F.heureDuPicAttendue(sauvegarde,CSV),R=J.resultat;
const B=PV.bornes(R),jour=E.jourAOuvrir(R),CADRE=E.cadreDuJour(R,jour),ORDRE=PV.ordreDesServices(R,J.args.parcours),LIGNES=E.lignes(R,jour,ORDRE,id=>id);
/** Les lots des équipes du jour ouvert : ceux que le planning dessine. */
const DU_JOUR=new Set(R.ateliers.filter(a=>(a.jour||0)===jour).flatMap(a=>a.lots));

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const site=siteSansPlan();
 try{
  for(const [largeur,hauteur] of [[1280,800],[1920,1080]]){
   const V=largeur+' px : ';
   const page=await browser.newPage({viewport:{width:largeur,height:hauteur}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   const attendre=(ms=150)=>page.waitForTimeout(ms);
   const ch=await F.charger(page,nav,site.url('index.html'),{sauvegarde,csv:CSV,pageId:'at-planning'});
   try{
    await page.waitForSelector('#at-planning .pg-cadre .pg-groupe');
    // Le planning s'ouvre replié (correction 18 b) : ici, tous les services dépliés, pour lire leurs barres.
    await page.locator('#at-planning [data-pg-tout="deplier"]').click();await attendre();
    /** La largeur d'une heure, lue sur les barres : (fin − début) en pixels, par heure. */
    const pxHeure=()=>page.evaluate(()=>{const g=[...document.querySelectorAll('#at-planning .pg-lot')].find(g=>+g.dataset.fin-+g.dataset.debut>20);
      return (+g.dataset.x1-+g.dataset.x)/((+g.dataset.fin-+g.dataset.debut)/60);});
    const etat=()=>page.evaluate(()=>{const c=document.querySelector('#at-planning .pg-cadre'),v=OrlyPlanningVue.etat.vue;return {gauche:c.scrollLeft,haut:c.scrollTop,largeur:c.clientWidth,max:c.scrollWidth-c.clientWidth,
      periode:document.querySelector('#at-planning .pg-periode').textContent,zoom:[...document.querySelectorAll('[data-pg-zoom][aria-pressed="true"]')].map(b=>b.dataset.pgZoom),
      t0:v.t0,t1:v.t1,pxh:v.pxh,noms:v.noms,L:v.L,jour:v.jour};});

    // 1. « Un jour » par défaut, sur le jour qui a le plus de lots, cadré sur ses lots ; la fenêtre remplit la largeur.
    let e=await etat();
    assert.deepEqual(e.zoom,['jour'],V+'« Un jour » par défaut');
    assert.equal(jour,0,'la journée fictive tourne surtout le jour J');
    assert.deepEqual([e.jour,e.t0,e.t1],[jour,CADRE.t0,CADRE.t1],V+'le jour ouvert, cadré 30 min avant son premier lot et 30 min après le dernier');
    const duJour=E.pxParHeure('jour',e.largeur-e.noms-2,CADRE.t0,CADRE.t1);
    assert.ok(Math.abs(await pxHeure()-duJour)<0.01&&duJour>=40,V+'une heure fait '+duJour.toFixed(1)+' px : la fenêtre remplit la largeur, 40 px au moins');
    assert.ok(e.gauche===0&&(duJour>40?e.max<=1:true),V+'le jour entier, sans défilement quand il tient : '+JSON.stringify(e));
    assert.equal(e.periode.split(' → ')[0],'J '+P.hhmm(CADRE.t0),V+'la période visible : '+e.periode);
    assert.match(e.periode,/^J(-1)? \d\d:\d\d → J(\+1)? \d\d:\d\d$/);
    const tailles=await page.evaluate(()=>{const px=s=>[...document.querySelectorAll(s)].filter(x=>x.getClientRects().length).map(x=>parseFloat(getComputedStyle(x).fontSize));
      return {lignes:[...document.querySelectorAll('#at-planning .pg-ligne')].map(l=>l.getBoundingClientRect().height),services:[...document.querySelectorAll('#at-planning .pg-groupe-tete')].map(l=>l.getBoundingClientRect().height),
        textes:[...px('#at-planning .pg-nom'),...px('#at-planning .pg-pers'),...px('#at-planning .pg-pic'),...px('#at-planning .pg-detail-texte'),...px('#at-planning .pg-axe-svg text'),...px('#at-planning .at-pl-etiq'),
          ...px('#at-planning .pg-legende'),...px('#at-planning .pg-replier'),...px('#at-planning .pg-periode')],
        legende:(()=>{const l=document.querySelector('#at-planning .pg-legende'),c=document.querySelector('#at-planning .pg-cadre'),b=document.querySelector('#at-planning .pg-barre').getBoundingClientRect(),r=l.getBoundingClientRect();
          return {h:r.height,surLaLigne:r.top>=b.top-1&&r.bottom<=b.bottom+1,dessus:r.bottom<=c.getBoundingClientRect().top,signes:l.querySelectorAll('.pg-cle').length};})()};});
    assert.ok(tailles.lignes.length>5&&tailles.lignes.every(h=>Math.abs(h-28)<0.5),V+'des lignes d’équipe de 28 px');
    assert.ok(tailles.services.length>=4&&tailles.services.every(h=>Math.abs(h-32)<0.5),V+'des lignes de service de 32 px');
    assert.ok(tailles.textes.length>20&&tailles.textes.every(t=>t>=12&&t<=13),V+'des textes de 12 à 13 px : '+[...new Set(tailles.textes)]);
    assert.ok(tailles.legende.h<=20&&tailles.legende.surLaLigne&&tailles.legende.dessus&&tailles.legende.signes>=6,V+'la légende sur la ligne des boutons, en haut : '+JSON.stringify(tailles.legende));

    // 2. Les trois zooms : la bonne largeur d'heure ; Ctrl + molette ; glisser.
    await page.locator('[data-pg-zoom="six"]').click();await attendre();
    assert.ok(Math.abs(await pxHeure()-160)<0.01,V+'« 6 h » : 160 px par heure');
    await page.locator('[data-pg-zoom="chaine"]').click();await attendre();
    e=await etat();
    const chaine=(e.largeur-e.noms-2)/((B.t1-B.t0)/60);
    assert.ok(Math.abs(await pxHeure()-chaine)<0.01,V+'« Toute la chaîne » : '+chaine.toFixed(2)+' px par heure');
    assert.equal(e.gauche,0,V+'toute la chaîne se voit');
    assert.equal(e.periode,PV.periode(B.t0,B.t1),V+'de la première à la dernière minute');
    const molette=async(dy)=>{const b=await page.locator('#at-planning .pg-cadre').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);
      await page.keyboard.down('Control');await page.mouse.wheel(0,dy);await page.keyboard.up('Control');await attendre();};
    await molette(-100);
    assert.deepEqual((await etat()).zoom,['jour'],V+'Ctrl + molette : on s’approche');
    assert.ok(Math.abs(await pxHeure()-duJour)<0.01);
    await molette(-100);
    assert.deepEqual((await etat()).zoom,['six']);
    await molette(100);await molette(100);
    assert.deepEqual((await etat()).zoom,['chaine'],V+'et on s’éloigne');
    // Glisser, en « 6 h » (à 1 920 px, « Un jour » tient en entier : rien à faire défiler).
    await page.locator('[data-pg-zoom="six"]').click();await attendre();
    // Un clic sur un bouton de zoom fait remonter la page jusqu'à lui : on redescend jusqu'au cadre.
    await page.evaluate(()=>{const c=document.querySelector('#at-planning .pg-cadre');c.scrollIntoView();c.scrollLeft=0;});await attendre();
    const avant=await etat(),b=await page.locator('#at-planning .pg-cadre').boundingBox();
    await page.mouse.move(b.x+b.width-60,b.y+b.height-20);await page.mouse.down();await page.mouse.move(b.x+b.width-210,b.y+b.height-20,{steps:6});await page.mouse.up();await attendre();
    const apres=await etat();
    assert.ok(Math.abs(apres.gauche-(avant.gauche+150))<2,V+'glisser déplace la période : '+avant.gauche+' → '+apres.gauche);
    assert.notEqual(apres.periode,avant.periode,V+'et la période dite suit');
    assert.equal(await page.locator('#at-planning .pg-toile.choix').count(),0,V+'un glissé n’est pas un clic sur une barre');

    // 3. Après un défilement (jusqu'au bout, dans les deux sens) : l'axe et les noms à la vue.
    await page.locator('[data-pg-zoom="six"]').click();await attendre();
    // Une fenêtre plus basse que d'habitude (le cadre prend la hauteur qui reste) : l'unité fictive tiendrait sinon en hauteur à 1 920 × 1 080.
    await page.setViewportSize({width:largeur,height:520});
    await page.waitForFunction(()=>{const c=document.querySelector('#at-planning .pg-cadre');return c.getBoundingClientRect().bottom<=innerHeight&&c.scrollHeight>c.clientHeight;});
    await page.evaluate(()=>{const c=document.querySelector('#at-planning .pg-cadre');c.scrollLeft=c.scrollWidth;c.scrollTop=c.scrollHeight;});await attendre();
    const vu=await page.evaluate(()=>{
     const c=document.querySelector('#at-planning .pg-cadre');
     const rc=c.getBoundingClientRect(),au=(x,y)=>document.elementFromPoint(x,y),ax=document.querySelector('#at-planning .pg-axe').getBoundingClientRect();
     const ligne=[...document.querySelectorAll('#at-planning .pg-ligne')].map(l=>l.getBoundingClientRect()).find(r=>r.top>ax.bottom+2&&r.bottom<rc.bottom-2);
     return {defile:[c.scrollLeft,c.scrollTop,c.scrollHeight>c.clientHeight],axe:Math.abs(ax.top-rc.top)<2,
      heure:!!au(rc.left+400,ax.top+30)?.closest('.pg-axe'),jour:(()=>{const g=[...document.querySelectorAll('#at-planning .pg-jour')].find(g=>{const r=g.querySelector('rect');return +r.getAttribute('x')<=c.scrollLeft&&c.scrollLeft<+r.getAttribute('x')+ +r.getAttribute('width');});
       const t=g.querySelector('text').getBoundingClientRect();return t.left>=rc.left+OrlyPlanningVue.etat.vue.noms-1&&t.right<=rc.right;})(),
      coin:!!au(rc.left+40,ax.top+20)?.closest('.pg-coin'),nom:!!ligne&&!!au(rc.left+60,ligne.top+14)?.closest('.pg-nom'),
      dansLaFenetre:rc.top>=0&&rc.bottom<=innerHeight+1,periode:document.querySelector('#at-planning .pg-periode').textContent};});
    assert.ok(vu.defile[0]>=1000&&vu.defile[1]>0&&vu.defile[2],V+'le cadre a défilé dans les deux sens : '+vu.defile);
    assert.ok(vu.dansLaFenetre,V+'le cadre tient dans la fenêtre');
    assert.ok(vu.axe&&vu.heure&&vu.coin,V+'l’axe reste en haut');
    assert.ok(vu.jour,V+'le nom du jour reste à la vue');
    assert.ok(vu.nom,V+'les noms des équipes restent à gauche');
    assert.match(vu.periode,/^J \d\d:\d\d → J \d\d:\d\d$/,V+'la période suit : '+vu.periode);
    await page.setViewportSize({width:largeur,height:hauteur});
    await page.waitForFunction(h=>innerHeight===h&&document.querySelector('#at-planning .pg-cadre').getBoundingClientRect().height>300,hauteur);
    await page.locator('[data-pg-zoom="jour"]').click();await attendre();
    e=await etat();

    // 4. Une ligne par service qui a des lots, dans l'ordre du chemin ; sa courbe ; les équipes sans lot à part ; replier.
    const g=await page.evaluate(()=>({ordre:[...document.querySelectorAll('#at-planning .pg-groupe:not(.pg-sans-lot)')].map(x=>x.dataset.service),
      equipes:Object.fromEntries([...document.querySelectorAll('#at-planning .pg-groupe:not(.pg-sans-lot)')].map(x=>[x.dataset.service,[...x.querySelectorAll('.pg-ligne')].map(l=>l.dataset.equipe)])),
      sansLot:[...document.querySelectorAll('#at-planning .pg-sans-lot .pg-ligne')].map(l=>l.dataset.equipe),dernier:[...document.querySelectorAll('#at-planning .pg-groupe')].pop().classList.contains('pg-sans-lot')}));
    // Correction 17 (b) : l'ordre tiré de tous les chemins — celui du module, un service après tous ceux qui l'alimentent.
    const O=require('../moteur/ordre-services.js'),chemins=J.args.parcours;
    assert.deepEqual(g.ordre,O.ordreDesServices(chemins,[...new Set(R.ateliers.map(a=>a.service))]).filter(s=>g.ordre.includes(s)),V+'l’ordre des chemins');
    for(const l of chemins.flatMap(c=>c.liens))if(g.ordre.includes(l.de)&&g.ordre.includes(l.vers))
     assert.ok(g.ordre.indexOf(l.de)<g.ordre.indexOf(l.vers),V+l.de+' avant '+l.vers);
    assert.ok(g.ordre.indexOf('quais')>g.ordre.indexOf('prepa'),V+'le handling après le montage');
    // Correction 18 (b) : les services qui ont des lots ce jour-là, avec ces équipes ; les autres en bas, sous « Sans lot ce jour ».
    assert.deepEqual(g.ordre,LIGNES.services.map(x=>x.service),V+'les services qui ont des lots le jour ouvert');
    for(const x of LIGNES.services){
     assert.deepEqual(g.equipes[x.service],x.equipes.map(a=>a.id),V+x.service+' : ses équipes qui ont des lots');
     assert.equal(await page.locator(`#at-planning .pg-groupe[data-service="${x.service}"] .pg-trait`).count(),x.lots,V+x.service+' : un trait par lot');
    }
    assert.deepEqual([g.sansLot,g.dernier],[LIGNES.sansLot.map(x=>x.equipe.id),true],V+'les équipes sans lot, en bas');
    assert.ok(g.sansLot.includes('do')&&!g.ordre.includes('dotation'),'l’équipe d’appui fictive, sans lot, est sous « Sans lot ce jour »');
    const pic=await page.evaluate(()=>{const d=document.querySelector('#at-planning .pg-groupe[data-service="prepa"] .ch-service');return {pic:d.dataset.pic,cx:+d.querySelector('.ch-pic').getAttribute('cx')};});
    const [, picT]=pic.pic.split('|').map(Number);
    assert.ok(Math.abs(pic.cx-(picT+7.5-e.t0)/60*e.pxh)<0.06,V+'la courbe sur la ligne du service, sur l’échelle des barres');
    const rep=page.locator('#at-planning .pg-groupe[data-service="prepa"] .pg-replier');
    await rep.click();await attendre();
    assert.equal(await rep.getAttribute('aria-expanded'),'false');
    assert.equal(await page.locator('#at-planning .pg-groupe[data-service="prepa"] .pg-ligne').first().isVisible(),false,V+'replié, le groupe cache ses équipes');
    assert.equal(await page.locator('#at-planning .pg-groupe[data-service="prepa"] .ch-mini').isVisible(),true,V+'sa courbe reste');
    assert.equal(await page.locator('#at-planning .pg-groupe[data-service="quais"] .pg-ligne').first().isVisible(),true,V+'les autres services restent ouverts');
    await page.evaluate(()=>{Sim.ateliers.aDessiner.add('at-planning');Sim.ateliers.surOnglet('at-planning');});await attendre();
    assert.equal(await page.locator('#at-planning .pg-groupe[data-service="prepa"]').evaluate(x=>x.classList.contains('replie')),true,V+'redessiné, il reste replié');
    await page.locator('#at-planning .pg-groupe[data-service="prepa"] .pg-replier').click();await attendre();
    assert.equal(await page.locator('#at-planning .pg-groupe[data-service="prepa"] .pg-ligne').first().isVisible(),true,V+'déplié, ses équipes reviennent');
    const sous=await page.evaluate(()=>{const p=document.getElementById('at-planning').getBoundingClientRect(),c=document.getElementById('at-charge');
      return {dessous:c.getBoundingClientRect().top>=p.bottom-1,replie:!c.querySelector('details.ch-tableau').open,grandes:document.querySelectorAll('#at-charge .ch-courbe').length};});
    assert.deepEqual(sous,{dessous:true,replie:true,grandes:0},V+'le tableau des équipes, replié, sous le planning ; plus de grandes courbes');

    // 5. La limite de chaque commande, au bout de la barre de son dernier lot.
    const lim=await page.evaluate(()=>[...document.querySelectorAll('#at-planning .pg-lot')].filter(g=>g.querySelector('.pg-limite')).map(g=>({lot:+g.dataset.lot,retard:g.classList.contains('retard'),
      x1:+g.dataset.x1,limites:[...g.querySelectorAll('.pg-limite')].map(l=>({t:+l.dataset.limite,x:+l.getAttribute('x1')})),contour:!!g.querySelector('.pg-contour')})));
    // Les limites des lots du jour ouvert (une commande finie un autre jour a sa limite sur l'onglet de ce jour).
    const attendues=new Map([...PV.limites(R)].filter(([l])=>DU_JOUR.has(l)));
    assert.ok(attendues.size>=5&&[...attendues.values()].flat().every(t=>t<=CADRE.t1),'les limites du jour fictif sont dans sa fenêtre');
    assert.equal(lim.length,attendues.size,V+'une limite sur le dernier lot de chaque commande');
    let tard=0,tot=0;
    for(const l of lim){
     const lot=R.lots[l.lot];
     assert.deepEqual(l.limites.map(x=>x.t),attendues.get(lot),V+lot.nom+' : ses limites');
     for(const x of l.limites){
      assert.ok(Math.abs(x.x-(x.t-e.t0)/60*e.pxh)<0.06,V+'la limite à son heure');
      if(lot.fin>x.t){tard++;assert.ok(x.x<l.x1,V+lot.nom+' en retard : la limite à gauche de la fin de sa barre');assert.ok(l.retard&&l.contour,V+lot.nom+' : son contour');}
      else{tot++;assert.ok(x.x>=l.x1-0.01,V+lot.nom+' à l’heure : la limite après la barre');}
     }
    }
    assert.ok(tard>0&&tot>0,'la journée fictive a des commandes en retard et à l’heure : '+tard+' / '+tot);

    // 6. Le clic sur une barre : sa commande en évidence ; Échap annule.
    const choisi=lim.find(l=>R.lots[l.lot].classes.length===1&&R.lots.filter(x=>DU_JOUR.has(x)&&x.classes&&x.classes.includes(R.lots[l.lot].classes[0])&&!x.dispo&&x.fin!=null).length>=2).lot;
    await page.locator(`#at-planning .pg-lot[data-lot="${choisi}"]`).scrollIntoViewIfNeeded();
    await page.locator(`#at-planning .pg-lot[data-lot="${choisi}"] .pg-seg`).first().click();await attendre();
    const ev=await page.evaluate(()=>({choix:document.querySelector('#at-planning .pg-toile').classList.contains('choix'),
      nets:[...document.querySelectorAll('#at-planning .pg-lot.net')].map(g=>+g.dataset.lot).sort((a,b)=>a-b),
      pales:[...document.querySelectorAll('#at-planning .pg-lot:not(.net)')].map(g=>+getComputedStyle(g).opacity)}));
    const cmd=R.lots[choisi].classes[0],attendus=R.lots.map((l,i)=>[l,i]).filter(([l])=>DU_JOUR.has(l)&&(l.classes||[]).includes(cmd)&&l.fin!=null&&!l.dispo).map(([,i])=>i).sort((a,b)=>a-b);
    assert.ok(ev.choix,V+'une commande choisie');
    assert.deepEqual(ev.nets,attendus,V+cmd+' : ses lots restent nets');
    assert.ok(attendus.length>=2&&ev.pales.length>0&&ev.pales.every(o=>o<0.5),V+'les autres pâlissent');
    await page.keyboard.press('Escape');await attendre();
    assert.equal(await page.locator('#at-planning .pg-toile.choix').count(),0,V+'Échap annule');
    // L'infobulle au focus clavier : la commande, le début, la fin, la durée, l'attente, la marge.
    await page.locator(`#at-planning .pg-lot[data-lot="${choisi}"]`).focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');await attendre();
    const bulle=await page.evaluate(()=>{const b=document.querySelector('.pg-bulle');return b&&!b.hidden?b.textContent:null;});
    assert.ok(bulle,V+'une bulle au focus clavier');
    // Une seule écriture du temps (évolution 15 c) : « 45 min » sous une heure, « 2 h 30 » au-delà.
    const D='(?:[1-5]?\\d min|\\d+ h \\d\\d)';
    assert.match(bulle,new RegExp('\\n\\d\\d:\\d\\d → \\d\\d:\\d\\d \\('+D+'[^)]*\\)\\nAttente : (aucune|'+D+')\\n(Marge|Retard) : '+D+'$'),V+'la bulle : '+bulle);
    await page.keyboard.press('Enter');await attendre();
    assert.equal(await page.locator('#at-planning .pg-toile.choix').count(),1,V+'Entrée choisit aussi la commande');
    await page.keyboard.press('Escape');

    // 7. Le trait de l'heure rejouée : l'heure, dans une autre couleur que les barres.
    const t=await page.evaluate(()=>{Sim.vue.allerA(420);return Sim.vue.t;});await attendre();
    const tr=await page.evaluate(()=>{const m=document.querySelector('#at-planning .pg-maintenant'),h=document.querySelector('#at-planning .pg-maintenant-heure');
      return {vu:!m.hidden&&!h.hidden,gauche:parseFloat(m.style.left),texte:h.textContent,couleur:getComputedStyle(m).borderLeftColor,barre:getComputedStyle(document.querySelector('#at-planning .pg-seg')).fill};});
    assert.ok(tr.vu,V+'le trait se voit');
    assert.ok(Math.abs(tr.gauche-(e.noms+(t-e.t0)/60*e.pxh))<0.1,V+'à l’heure rejouée');
    assert.equal(tr.texte,'07:00',V+'il porte l’heure');
    assert.notEqual(tr.couleur,tr.barre,V+'dans une autre couleur que les barres');
    await page.evaluate(()=>Sim.vue.auDebut());await attendre();
    assert.equal(await page.locator('#at-planning .pg-maintenant').evaluate(m=>m.hidden),true,V+'au début, pas de trait');

    assert.deepEqual(errors,[],V+errors.join(' | '));
   }finally{ch.effacer();await page.close();}
  }
  console.log('planning-vue-browser : ok (1 280 et 1 920 px)');
 }catch(e){console.error(e);process.exitCode=1;}finally{site.effacer();await browser.close();}
})();

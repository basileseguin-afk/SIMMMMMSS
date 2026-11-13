/* Correction 17 (d) — la page Période se lit sans chercher (v1), sur l'unité et
 * les vols fictifs (tests/plan-rejoue-fictif.cjs), à 1 280 px de large :
 *   — la colonne « Unité » est la première colonne de chiffres, juste après le
 *     jour : elle se voit sans faire défiler, même quand le tableau déborde ;
 *   — les champs de la correspondance (« 7,5 h titulaire », « 7 h intérim »)
 *     montrent leur valeur entière, écrite à la française ; une valeur refusée
 *     est nommée, rien n'est écrit ;
 *   — l'explication des jours incomplets ne s'affiche qu'une fois, en une
 *     phrase ; le détail (comment les jours sont comptés) se déplie, et reste
 *     déplié d'un rendu à l'autre ;
 *   — (correction 18 c) la phrase « Période simulée : n journées de vols ;
 *     n jours complets, n incomplets » ne s'affiche qu'une fois sur la page
 *     Période, dans sa carte : ni dans la bande du haut, ni en notification ;
 *     sur les autres pages, la bande la garde.
 * Aucune donnée de l'unité : tout est fictif. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const PE=require('../moteur/periode.js');
const {siteSansPlan}=require('./plan-fictif.cjs');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

/** Une semaine datée fictive : les vols fictifs chaque jour, du 2 au 8 novembre 2026. */
const semaine=()=>{const [tete,...l]=F.volsCsv().trim().split('\n');return 'date,'+tete+'\n'+PE.joursEntre('2026-11-02','2026-11-08').flatMap(d=>l.map(x=>d+','+x)).join('\n')+'\n';};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const site=siteSansPlan(),page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=300)=>page.waitForTimeout(ms);
 const ch=await F.charger(page,nav,site.url('index.html'),{pageId:'j-chiffres'});
 try{
  await F.importerVols(page,nav,ch.fichier,'semaine.csv',semaine());
  await nav.aller(page,'j-periode');await page.locator('#journee-periode [data-pv=lancer]').click();
  await page.waitForFunction(()=>Sim.periode.etat()==='a-jour',null,{timeout:120000});await attendre(400);

  // 0. « Période simulée : … » : une seule fois sur la page Période, dans sa carte (correction 18 c).
  const phrase18=/Période simulée : \d+ journées? de vols ; \d+ jours? complets?, \d+ incomplets?\./g;
  const lus=await page.evaluate(()=>({carte:document.querySelector('#journee-periode .pv-etat').innerText,page:document.getElementById('journee-periode').innerText,
    bande:document.getElementById('periode-bandeau').innerText,bandeVisible:document.getElementById('periode-bandeau').getClientRects().length>0,
    avis:[...document.querySelectorAll('.notifs .notif-texte')].map(n=>n.innerText).join('\n'),tout:document.body.innerText}));
  assert.equal((lus.carte.match(phrase18)||[]).length,1,'la carte la dit : « '+lus.carte+' »');
  assert.equal((lus.page.match(phrase18)||[]).length,1,'une seule fois dans la page');
  assert.ok(lus.bandeVisible,'la bande du haut est là (le choix de la journée, « Relancer la période »)');
  assert.doesNotMatch(lus.bande,/Période simulée/,'la bande du haut ne la redit pas : « '+lus.bande.replace(/\n/g,' | ')+' »');
  assert.doesNotMatch(lus.avis,/Période simulée/,'pas de notification qui la redit');
  assert.equal((lus.tout.match(/Période simulée :/g)||[]).length,1,'une seule fois à l’écran');
  // Sur une autre page (la Synthèse), la carte n'est pas là : la bande du haut la dit, une fois.
  await nav.aller(page,'j-chiffres');
  await page.waitForFunction(()=>/Période simulée :/.test(document.getElementById('periode-bandeau').innerText));
  assert.equal(((await page.evaluate(()=>document.body.innerText)).match(/Période simulée :/g)||[]).length,1,'ailleurs : une fois, dans la bande');
  await nav.aller(page,'j-periode');await page.waitForSelector('#journee-periode .pv-etat');

  // 1. « Unité » : la première colonne de chiffres, juste après le jour, sur chaque ligne.
  const tetes=await page.locator('#journee-periode .pv-table thead th').allTextContents();
  assert.deepEqual(tetes.slice(0,2),['Jour de travail','Unité'],'la colonne Unité juste après le jour');
  assert.ok(tetes.length>=8,'l’unité fictive a assez de services pour que le tableau soit large : '+tetes.length+' colonnes');
  const rangs=await page.evaluate(()=>[...document.querySelectorAll('#journee-periode .pv-table tbody tr:not(.pv-detail)')].map(tr=>({n:tr.cells.length,unite:tr.cells[1].hasAttribute('data-pv-total'),
    seule:tr.querySelectorAll('[data-pv-total]').length})));
  assert.ok(rangs.length>=8&&rangs.every(r=>r.unite&&r.seule===1&&r.n===tetes.length),'chaque ligne (jours et cumuls) : sa case Unité en deuxième — '+JSON.stringify(rangs.slice(0,3)));
  // Les chiffres : ceux du module, dans la colonne déplacée.
  const chiffres=await page.evaluate(()=>{const b=Sim.periode.resultat.bilan,m=OrlyPeriodeVue.MESURES.find(x=>x.id==='personnes');
    return {lu:[...document.querySelectorAll('#journee-periode tr[data-pv-jour]')].map(tr=>tr.cells[1].innerText),
      attendu:b.joursTravail.map(w=>{const v=OrlyPeriodeVue.valeurUnite(m,[w]);return v==null?'—':m.ecrire(v);})};});
  assert.deepEqual(chiffres.lu,chiffres.attendu,'les valeurs de l’unité');

  // 2. À 1 280 px, elle se voit sans faire défiler : dans le cadre du tableau (qui n'a pas défilé) et dans la fenêtre.
  const vue=await page.evaluate(()=>{const sc=document.querySelector('#journee-periode .pv-tableau .table-scroll');sc.scrollIntoView({block:'center'});
    const cadre=sc.getBoundingClientRect(),r=x=>{const b=x.getBoundingClientRect();return {g:b.left,d:b.right,h:b.top,b:b.bottom};};
    const th=sc.querySelectorAll('thead th'),tr=sc.querySelector('tbody tr[data-pv-jour]');
    return {largeur:innerWidth,defile:sc.scrollLeft,deborde:sc.scrollWidth-sc.clientWidth,cadre:{g:cadre.left,d:cadre.left+sc.clientWidth},jour:r(th[0]),tete:r(th[1]),case:r(tr.cells[1]),
      page:document.documentElement.scrollWidth-innerWidth};});
  assert.equal(vue.largeur,1280);assert.equal(vue.defile,0,'le tableau n’a pas défilé');assert.equal(vue.page,0,'la page tient sur la largeur');
  for(const [nom,x] of [['l’en-tête',vue.tete],['la case du premier jour',vue.case]]){
   assert.ok(x.g>=vue.cadre.g-1&&x.d<=vue.cadre.d+1&&x.d<=vue.largeur,nom+' de la colonne Unité est dans le cadre, sans défiler : '+JSON.stringify(vue));
   assert.ok(x.d-x.g>30,nom+' a une largeur');
  }
  assert.ok(Math.abs(vue.tete.g-vue.jour.d)<=1,'elle touche la colonne des jours');
  assert.ok(vue.tete.d<vue.cadre.g+(vue.cadre.d-vue.cadre.g)/2,'dans la moitié gauche du tableau');

  // 3. Les jours incomplets : comptés dans la ligne d'état, expliqués une seule fois, en une phrase ; le détail se déplie.
  const b=await page.evaluate(()=>({n:Sim.periode.resultat.bilan.joursTravail.filter(w=>!w.complet).length}));
  assert.ok(b.n>=1,'la semaine fictive a des jours incomplets');
  const textes=await page.evaluate(()=>({page:document.getElementById('journee-periode').innerText,bandeau:document.getElementById('periode-bandeau').innerText}));
  const fois=(t,re)=>(t.match(re)||[]).length;
  assert.equal(fois(textes.page+'\n'+textes.bandeau,/manque des vols d’un jour voisin/g),1,'l’explication, une seule fois');
  assert.equal(fois(textes.page+'\n'+textes.bandeau,/sort des totaux et des moyennes/g),1,'et pas redite ailleurs');
  assert.equal(await page.locator('#journee-periode .pv-explique').count(),1);
  const phrase=await page.locator('#journee-periode .pv-explique').innerText();
  assert.equal(fois(phrase,/[.!?](\s|$)/g),1,'en une phrase : « '+phrase+' »');
  assert.match(await page.locator('#journee-periode .pv-etat').innerText(),/jours? complets?, \d+ incomplets?\.$/,'la ligne d’état compte, sans expliquer');
  assert.doesNotMatch(textes.bandeau,/jours? complets?, \d+ incomplets?\./,'sur la page Période, la bande du haut ne redit pas les comptes (correction 18 c)');
  const comment=page.locator('#journee-periode details.pv-comment');
  assert.equal(await comment.count(),1);assert.equal(await comment.evaluate(d=>d.open),false,'le détail, replié');
  assert.doesNotMatch(textes.page,/Chaque équipe compte au/,'le détail ne se lit pas tant qu’il est replié');
  await comment.locator('summary').click();await attendre(150);
  assert.match(await comment.innerText(),/Chaque équipe compte au[\s\S]*incomplet[\s\S]*Passent d’un jour au suivant/,'déplié : comment les jours sont comptés');
  // Il reste déplié d'un rendu à l'autre (une autre mesure redessine la page).
  await page.locator('#periode-mesure').selectOption('charge');await attendre(250);
  assert.equal(await page.locator('#journee-periode details.pv-comment').evaluate(d=>d.open),true,'déplié après un nouveau rendu');
  assert.equal(await page.locator('#journee-periode .pv-explique').count(),1,'la phrase, toujours une seule fois');
  await page.locator('#periode-mesure').selectOption('personnes');await attendre(200);

  // 4. La correspondance : « 7,5 h titulaire », « 7 h intérim » — la valeur entière, à la française.
  const titulaire=page.locator('#journee-periode [data-cal-champ="base-titulaires"]').first(),interim=page.locator('#journee-periode [data-cal-champ="base-interim"]').first();
  await titulaire.scrollIntoViewIfNeeded();
  assert.equal(await titulaire.inputValue(),'7,5','le champ affiche « 7,5 »');
  assert.equal(await interim.inputValue(),'7');
  /** La place du texte dans le champ : sa largeur mesurée avec sa police, face à la largeur intérieure du champ. */
  const place=l=>l.evaluate(el=>{const cs=getComputedStyle(el),c=document.createElement('canvas').getContext('2d');c.font=cs.font;
    return {texte:c.measureText(el.value).width,interieur:el.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight),defile:el.scrollWidth-el.clientWidth};});
  for(const [nom,l] of [['titulaire',titulaire],['intérim',interim]]){
   const p=await place(l);
   assert.ok(p.texte<=p.interieur&&p.defile<=0,'le champ '+nom+' montre sa valeur entière : '+JSON.stringify(p));
  }
  // La plus longue valeur admise tient aussi ; elle s'enregistre, à la virgule.
  await titulaire.fill('23,75');await titulaire.press('Tab');await attendre(300);
  assert.equal(await page.evaluate(()=>Sim.calage.correspondance.bases.defaut.titulaires),23.75);
  const long=page.locator('#journee-periode [data-cal-champ="base-titulaires"]').first();
  assert.equal(await long.inputValue(),'23,75');
  {const p=await place(long);assert.ok(p.texte<=p.interieur&&p.defile<=0,'« 23,75 » tient dans le champ : '+JSON.stringify(p));}
  // Une valeur refusée est nommée ; rien n'est écrit, le champ reprend la valeur gardée.
  await long.fill('beaucoup');await long.press('Tab');await attendre(300);
  assert.match(await page.locator('#journee-periode .pc-refus').innerText(),/Refusé — .*titulaires : des heures, de plus de 0 à 24/);
  assert.equal(await page.evaluate(()=>Sim.calage.correspondance.bases.defaut.titulaires),23.75,'rien n’est écrit');
  assert.equal(await page.locator('#journee-periode [data-cal-champ="base-titulaires"]').first().inputValue(),'23,75');
  // Le point est accepté comme la virgule.
  await page.locator('#journee-periode [data-cal-champ="base-titulaires"]').first().fill('7.5');await page.keyboard.press('Tab');await attendre(300);
  assert.equal(await page.evaluate(()=>Sim.calage.correspondance.bases.defaut.titulaires),7.5);
  assert.equal(await page.locator('#journee-periode [data-cal-champ="base-titulaires"]').first().inputValue(),'7,5');

  assert.deepEqual(errors,[],errors.join(' | '));
  console.log('periode-lisible-browser : ok — la colonne Unité juste après le jour, visible à 1 280 px sans défiler ; « 7,5 » en entier ; les jours incomplets expliqués une fois, le détail dépliable.');
 }catch(e){console.error(e);process.exitCode=1;}finally{ch.effacer();site.effacer();await browser.close();}
})();

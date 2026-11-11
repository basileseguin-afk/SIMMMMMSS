/* Évolution 14 (d) — les autres pages des résultats. Sur l'unité et les vols
 * fictifs (tests/plan-rejoue-fictif.cjs), à 1 280 px :
 *   1. Synthèse : la phrase de résumé en tête ; les libellés « commande la plus
 *      en retard », « vol le plus en retard » ; un retard nul n'a pas la couleur
 *      critique (la journée fictive, puis la même sans aucun retard) ;
 *   2. Heure de chaque commande : la marge (prête avant − prête à), sa barre
 *      (accent positive, critique négative), le tri par défaut de la plus petite
 *      à la plus grande, l'en-tête qui trie ; « Retirer » dans le menu « … » ;
 *   3. Étapes de chaque commande : après un défilement, les en-têtes et la
 *      première colonne restent à la vue ; « sert tout le monde » et « ne passe
 *      pas par là » en texte gris, sans italique ni hachures ;
 *   4. Vols prêts au départ : des points de 10 px de la couleur de leur état ;
 *      un vol en retard garde son numéro écrit, les autres au survol ;
 *   5. Stocks et retours : le plus en stock d'abord, l'échelle dite une fois. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const F=require('./plan-rejoue-fictif.cjs');
const RV=require('../resultats-vue.js');
const {siteSansPlan}=require('./plan-fictif.cjs');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const sauvegarde=F.sauvegardeFictive(),CSV=F.volsCsv(),J=F.heureDuPicAttendue(sauvegarde,CSV),R=J.resultat;

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const site=siteSansPlan();
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=200)=>page.waitForTimeout(ms);
 const ch=await F.charger(page,nav,site.url('index.html'),{sauvegarde,csv:CSV,pageId:'j-chiffres'});
 /** Une couleur de jeton, telle que le navigateur la calcule. */
 const jeton=v=>page.evaluate(v=>{const d=document.createElement('i');d.style.color='var('+v+')';document.body.append(d);const c=getComputedStyle(d).color;d.remove();return c;},v);
 try{
  // 1. La Synthèse de l'évolution 14 (d) : celle de l'évolution 15 (b) la remplace dans la page (synthese-questions-browser) ;
  //    son dessin reste le repli de resultats-vue.js, vérifié ici dans une boîte à part, sous les mêmes styles.
  await page.evaluate(()=>{const d=document.createElement('div');d.id='bilan-14d';document.getElementById('journee-chiffres').append(d);
    OrlyResultatsVue.rendreSynthese(d,Sim.ateliers.resultat.indicateurs,{});});
  const k=await page.evaluate(()=>JSON.parse(JSON.stringify(Sim.ateliers.resultat.indicateurs)));
  assert.equal(await page.locator('#bilan-14d .bilan-resume').textContent(),RV.resume(k),'la phrase de résumé');
  assert.equal(await page.locator('#bilan-14d > *').first().evaluate(e=>e.className),'bilan-resume','en tête de page');
  assert.deepEqual(await page.locator('#bilan-14d .bilan-q').allTextContents(),['Vols chargés à l’heure','Commandes prêtes à l’heure','Commande la plus en retard','Travail fourni']);
  assert.ok((await page.locator('#bilan-14d .bilan-lien').allTextContents()).includes('Vol le plus en retard'));
  const retard=await jeton('--ds-retard'),retardTexte=await jeton('--ds-retard-texte');
  /** Les éléments colorés comme un retard : la marque des lignes, le liseré et le chiffre des cartes. */
  const enRouge=()=>page.evaluate(([r,rt])=>[
    ...[...document.querySelectorAll('#bilan-14d .bilan>div')].filter(d=>getComputedStyle(d.querySelector('dt'),'::before').backgroundColor===r).map(d=>[d.querySelector('dt').textContent.trim(),d.querySelector('dd').textContent.trim()]),
    ...[...document.querySelectorAll('#bilan-14d .bilan-cle')].filter(c=>getComputedStyle(c).borderLeftColor===r||getComputedStyle(c.querySelector('.bilan-v')).color===rt).map(c=>[c.querySelector('.bilan-q').textContent,c.querySelector('.bilan-v').textContent])],[retard,retardTexte]);
  const rouges=await enRouge();
  for(const [q,v] of rouges)assert.ok(!/^(0|aucun|aucune)\b/.test(v),'« '+q+' » : '+v+' n’est pas un retard et ne s’écrit pas en rouge');
  assert.ok(rouges.some(([q])=>q==='Commande la plus en retard'),'la journée fictive a des retards : ils se disent en rouge');
  assert.ok(!rouges.some(([q])=>q==='Vols non chargés'),'0 vol non chargé : pas de rouge');
  // La même Synthèse, sans aucun retard : rien de rouge.
  await page.evaluate(()=>{const k=Sim.ateliers.resultat.indicateurs;OrlyResultatsVue.rendreSynthese(document.getElementById('bilan-14d'),
    {...k,aHeure:k.classesSuivies,enRetard:0,retardMax:0,pasFinies:0,volsCharges:k.volsSuivis,volsAHeure:k.volsSuivis,retardVolMax:0,attenteTotale:0},{});});
  assert.deepEqual(await enRouge(),[],'aucun retard : aucune couleur critique');
  assert.equal(await page.locator('#bilan-14d .bilan-cle').filter({hasText:'Commande la plus en retard'}).locator('.bilan-v').textContent(),'aucune');
  await page.evaluate(()=>document.getElementById('bilan-14d').remove());

  // 2. Heure de chaque commande : la marge et son tri ; « Retirer » dans le menu.
  await nav.aller(page,'at-repas');await attendre();
  const lignes=await page.locator('#at-classes tbody tr').evaluateAll(trs=>trs.map(tr=>({id:tr.querySelector('th').dataset.classe,
    marge:tr.querySelector('.at-marge').dataset.marge,texte:tr.querySelector('.at-marge').textContent.trim(),
    barre:tr.querySelector('.at-marge-barre i')&&getComputedStyle(tr.querySelector('.at-marge-barre i')).backgroundColor})));
  const accent=await jeton('--ds-accent');
  const marges=lignes.map(l=>(l.marge===undefined?null:+l.marge));
  for(const l of lignes){
   const v=R.parClasse[l.id],m=RV.marge(v);
   if(m==null){assert.equal(l.marge,undefined,l.id+' : pas de marge sans heure');continue;}
   assert.ok(Math.abs(+l.marge-(v.echeance-v.fin))<0.06,l.id+' : prête avant − prête à');
   assert.ok(l.texte.startsWith(RV.ecrireMarge(m)),l.id+' : '+l.texte);
   if(Math.abs(m)>=0.5)assert.equal(l.barre,m>0?accent:retard,l.id+' : la barre en '+(m>0?'accent':'critique'));
  }
  const avec=marges.filter(m=>m!=null);
  assert.ok(avec.some(m=>m>0)&&avec.some(m=>m<0),'des marges positives et négatives dans la journée fictive');
  assert.deepEqual(avec,[...avec].sort((a,b)=>a-b),'de la plus petite marge à la plus grande');
  assert.ok(marges.indexOf(null)<0||marges.slice(marges.indexOf(null)).every(m=>m==null),'les commandes sans marge à la fin');
  assert.equal(await page.locator('#at-classes th[aria-sort="ascending"]').textContent().then(t=>t.trim()),'Marge▲');
  await page.locator('#at-classes [data-at-action=classe-trier][data-cle=marge]').click();await attendre();
  const inverse=(await page.locator('#at-classes tbody tr .at-marge').evaluateAll(t=>t.map(x=>x.dataset.marge))).filter(m=>m!==undefined).map(Number);
  assert.deepEqual(inverse,[...avec].sort((a,b)=>b-a),'un second clic : de la plus grande à la plus petite');
  await page.locator('#at-classes [data-at-action=classe-trier][data-cle=marge]').click();await attendre();
  // « Retirer » n'est plus à la vue : il est dans le menu « … » de la ligne.
  const premier=lignes[0].id,retirer=page.locator(`#at-classes [data-at-action=classe-supprimer][data-classe="${premier}"]`);
  assert.equal(await retirer.isVisible(),false,'« Retirer » ne se voit pas d’emblée');
  const menu=page.locator('#at-classes tbody tr',{has:page.locator(`th[data-classe="${premier}"]`)}).locator('.at-menu > summary');
  assert.match(await menu.getAttribute('aria-label'),/^Actions pour /);
  await menu.click();await attendre(100);
  assert.equal(await retirer.isVisible(),true,'le menu « … » l’ouvre');
  await menu.click();

  // 3. Étapes de chaque commande : les en-têtes et la première colonne restent à la vue.
  await nav.aller(page,'at-grille');await attendre(300);
  const vu=await page.evaluate(async()=>{
   const s=document.querySelector('#at-parcours .qf-scroll');s.scrollIntoView();s.scrollTop=400;s.scrollLeft=500;
   await new Promise(r=>setTimeout(r,150));
   const b=s.getBoundingClientRect(),au=(x,y)=>document.elementFromPoint(x,y);
   const tete=s.querySelector('thead tr:nth-child(2) th:nth-child(3)').getBoundingClientRect(),coin=s.querySelector('.qf-coin').getBoundingClientRect();
   return {defile:[s.scrollTop,s.scrollLeft],teteHaut:tete.top-b.top,coinGauche:coin.left-b.left,
    entete:!!au(b.left+coin.width+60,tete.top+tete.height/2)?.closest('thead'),premiere:!!au(b.left+40,b.top+tete.bottom-b.top+40)?.closest('tbody th'),
    auto:(()=>{const c=s.querySelector('.qf-c.auto');return c&&{italique:getComputedStyle(c).fontStyle,couleur:getComputedStyle(c).color};})(),
    hors:(()=>{const c=s.querySelector('.qf-c.hors:empty');return c&&{fond:getComputedStyle(c).backgroundImage,texte:getComputedStyle(c,'::after').content};})()};});
  assert.ok(vu.defile[0]>0&&vu.defile[1]>0,'le tableau a défilé : '+vu.defile);
  assert.ok(vu.teteHaut<60,'les en-têtes restent en haut : '+vu.teteHaut);
  assert.ok(vu.entete,'un en-tête est à la vue après le défilement');
  assert.ok(Math.abs(vu.coinGauche)<2&&vu.premiere,'la première colonne reste à gauche');
  assert.ok(vu.auto,'la journée fictive a des services qui servent tout le monde');
  assert.equal(vu.auto.italique,'normal','sans italique');
  assert.equal(vu.auto.couleur,await jeton('--ds-texte-3'),'en gris');
  if(vu.hors){assert.equal(vu.hors.fond,'none','sans hachures');assert.equal(vu.hors.texte,'"pas par là"');}

  // 4. Vols prêts au départ : des points de 10 px, le numéro d'un vol en retard toujours écrit.
  await nav.aller(page,'v-departs');await attendre(300);
  const pts=await page.locator('#vols-frise .vf-vol').evaluateAll(gs=>gs.map(g=>{const c=g.querySelectorAll('circle')[1],t=g.querySelector('text');
    return {vol:g.dataset.vol,etat:[...g.classList].find(x=>/^vf-(ready|late|overdue|pending|orphan)$/.test(x)),d:c.getBoundingClientRect().width,
      fill:getComputedStyle(c).fill,ecrit:getComputedStyle(t).display!=='none'};}));
  const departs=R.lots.filter(l=>l.handling).length;
  assert.equal(pts.length,departs,'un point par départ');
  assert.ok(pts.every(p=>Math.abs(p.d-10)<0.6),'des points de 10 px : '+[...new Set(pts.map(p=>p.d.toFixed(1)))]);
  const couleurs={ready:await jeton('--ds-ok'),late:await jeton('--ds-attente'),overdue:retard};
  for(const p of pts)if(couleurs[p.etat.slice(3)])assert.equal(p.fill,couleurs[p.etat.slice(3)],p.vol+' : la couleur de son état');
  const tard=pts.filter(p=>RV.EN_RETARD.has(p.etat.slice(3))),aLHeure=pts.filter(p=>!RV.EN_RETARD.has(p.etat.slice(3)));
  assert.ok(tard.length>0&&aLHeure.length>0,'des vols en retard et à l’heure dans la journée fictive');
  assert.ok(tard.every(p=>p.ecrit),'un vol en retard garde son numéro écrit');
  assert.ok(aLHeure.every(p=>!p.ecrit),'les autres, seulement au survol');
  const un=page.locator(`#vols-frise .vf-vol[data-vol="${aLHeure[0].vol}"]`);
  await un.locator('circle').nth(1).hover();await attendre(100);
  assert.equal(await un.locator('text').evaluate(t=>getComputedStyle(t).display!=='none'),true,'au survol, le numéro');
  await page.mouse.move(5,5);
  // Les numéros écrits ne se chevauchent pas.
  const boites=await page.locator('#vols-frise .vf-vol.ecrit text').evaluateAll(ts=>ts.map(t=>{const b=t.getBoundingClientRect();return [b.left,b.top,b.right,b.bottom];}));
  for(let i=0;i<boites.length;i++)for(let j=i+1;j<boites.length;j++){const a=boites[i],b=boites[j];
    assert.ok(a[2]<=b[0]||b[2]<=a[0]||a[3]<=b[1]||b[3]<=a[1],'deux numéros ne se chevauchent pas');}

  // 5. Stocks et retours : le plus en stock d'abord ; l'échelle dite une fois.
  await nav.aller(page,'j-stocks');await attendre(300);
  const st=await page.evaluate(()=>({ordre:[...document.querySelectorAll('#journee-stocks .tp-table tbody tr')].map(tr=>+tr.dataset.lien),
    tri:document.querySelector('#journee-stocks .tp-table th[aria-sort="descending"]').textContent.trim(),
    echelles:document.querySelectorAll('#journee-stocks .tp-echelle').length,echelle:document.querySelector('#journee-stocks .tp-echelle').textContent}));
  assert.deepEqual(st.ordre,RV.ordreStocks(R.stocks.parLien,'stock'),'le plus en stock d’abord');
  assert.equal(st.tri,'Le plus en stock');
  assert.equal(st.echelles,1,'l’échelle des petites courbes, dite une fois');
  assert.match(st.echelle,/hauteur : de 0 à [\d\s ]+ repas/);
  await page.locator('#journee-stocks [data-tp-tri=long]').click();await attendre(100);
  assert.deepEqual(await page.locator('#journee-stocks .tp-table tbody tr').evaluateAll(t=>t.map(x=>+x.dataset.lien)),RV.ordreStocks(R.stocks.parLien,'long'),'ou le plus long');
  assert.equal(await page.locator('#journee-stocks .tp-plus24').count(),R.stocks.parLien.filter(RV.plusDe24h).length,'plus de 24 h : signalé là où il y en a');

  assert.deepEqual(errors,[],errors.join(' | '));
  console.log('resultats-browser : ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{ch.effacer();site.effacer();await browser.close();}
})();

/* Banc d'essai, évolution 18 (b) — le relais à la plonge, dans les pages (v1),
 * sur une unité fictive :
 *   — le planning des équipes : un lot passé en relais se dessine sur les deux
 *     lignes, chacune pour sa part, avec un petit repère à la jointure ; au
 *     survol, « repris par … à hh:mm » et « commencé par … » ; un lavage arrêté
 *     à la fin d'une présence porte un petit carré, et dit ce qu'il en reste ;
 *   — la Synthèse : plus d'heures sup à la plonge ; « reste à laver le
 *     lendemain : n vols (h de lavage) » quand il y en a — sans alerte quand
 *     l'équipe du matin l'absorbe pendant sa présence (correction 19 b : un
 *     reste normal ne fait pas coincer ; tests/plonge-reprise-browser.cjs
 *     montre le reste qui fait coincer) ;
 *   — le plan rejoué : un vol en relais reste dans son tunnel, sans coupure ;
 *     sa phrase ne dit rien d'un reste normal.
 * Chaque étape attend son effet, pas un délai. Vols, compagnies et équipes
 * fictifs ; aucune capture d'écran. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const TETE='vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC\n';
// L1 (LONG, 180 min de lavage) arrive à la plonge à 12:00, V2 (90 min) à 14:30 : un retour y arrive 30 min après son atterrissage.
const RELAIS=TETE+'NO1,NORD,MOYEN,DEP,23:30,,0,0,100\nL1,LONG,MOYEN,RET,,11:30,0,0,100\nV2,NORD,MOYEN,RET,,14:00,0,0,100\n';
// V1 arrive à 13:00 (il s'arrêtera à 14:00, 30 min restent), V2 à 13:30 (il n'est pas commencé).
const RESTE=TETE+'NO1,NORD,MOYEN,DEP,23:30,,0,0,100\nV1,NORD,MOYEN,RET,,12:30,0,0,100\nV2,SUD,MOYEN,RET,,13:00,0,0,100\n';
/* L'unité : la plonge seule, par vol — le matin (06:00–14:00) et, si `deux`, l'après-midi (13:00–21:00), sur le même tunnel. */
const UNITE=deux=>{
  Sim.reglages.changer(()=>{const e=Sim.reglages.etat;e.regime={seuils:[],presence:480};e.heuresSup={actif:true,plafond:180};},'');
  Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;st.materiel.actif=false;st.materiel.retours='programme';st.materiel.delaiRetour=30;
    const plonge=(id,nom,debut)=>({id,nom,service:'plonge',type:'lavage',debut,jour:0,personnes:2,pauses:[],lots:[],regime:{actif:true,presence:480},
      plafond:0,parVol:true,durees:{'*':90,LONG:180},tunnels:[{nom:'Tunnel 1',debit:300,personnes:1,actif:true}]});
    st.ateliers=[plonge('matin','Plonge matin','06:00')].concat(deux?[plonge('apm','Plonge après-midi','13:00')]:[]);},'');
};
const h=s=>{const [a,b]=s.split(':').map(Number);return a*60+b;};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-relais-'));
 const fichier=(nom,texte)=>{const f=path.join(dossier,nom);fs.writeFileSync(f,texte);return f;};
 /** Les vols importés, et la journée recalculée avec eux (le lot attendu est là). */
 const importer=async(nom,texte,vol)=>{
   await nav.aller(page,'v-programme');
   await page.locator('#imp-vols').setInputFiles(fichier(nom,texte));
   await page.waitForFunction(([n,v])=>document.getElementById('source-label').textContent===n
     &&((Sim.ateliers.resultat||{}).lots||[]).some(l=>l.retourVol&&l.vol===v),[nom,vol]);
 };
 /** Le planning des équipes, la plonge dépliée : les barres de chaque équipe. */
 const planning=async()=>{
   await nav.aller(page,'at-planning');
   await page.waitForSelector('#at-planning .pg-cadre .pg-groupe[data-service="plonge"]');
   if(await page.locator('#at-planning .pg-groupe[data-service="plonge"] .pg-lignes').evaluate(e=>e.hidden))await page.locator('#at-planning .pg-groupe[data-service="plonge"] .pg-replier').click();
   await page.waitForSelector('#at-planning .pg-groupe[data-service="plonge"] .pg-ligne[data-equipe="matin"] g.pg-lot');
   return page.evaluate(()=>[...document.querySelectorAll('#at-planning .pg-groupe[data-service="plonge"] .pg-ligne')].map(l=>({equipe:l.dataset.equipe,
     lots:[...l.querySelectorAll('g.pg-lot')].map(g=>({lot:g.dataset.lot,part:g.dataset.part||null,debut:+g.dataset.debut,fin:+g.dataset.fin,x:+g.dataset.x,x1:+g.dataset.x1,info:g.dataset.info,
       relais:[...g.querySelectorAll('path.pg-relais')].map(p=>p.dataset.relais),arrete:g.querySelectorAll('rect.pg-arrete').length,
       visible:(()=>{const r=g.getBoundingClientRect();return r.width>0&&r.height>0;})()}))})));
 };
 /** La Synthèse : ses phrases de tête, la ligne de la plonge, la carte « Où ça coince ». */
 const synthese=async()=>{
   await nav.aller(page,'j-chiffres');
   await page.waitForSelector('#bilan-journee .sy-table tr[data-service="plonge"]');
   return page.evaluate(()=>({tete:[...document.querySelectorAll('#bilan-journee .sy-tete p')].map(p=>p.textContent),
     fin:document.querySelector('#bilan-journee .sy-table tr[data-service="plonge"] td.sy-fin').textContent,
     ton:document.querySelector('#bilan-journee .sy-table tr[data-service="plonge"] td.sy-fin').dataset.ton||null,
     coince:[...document.querySelectorAll('#bilan-journee .sy-carte')].map(c=>c.textContent).find(t=>/^\s*Où ça coince/.test(t))||'',
     nom:document.querySelector('#bilan-journee .sy-table tr[data-service="plonge"] .sy-service').textContent,large:document.documentElement.scrollWidth-innerWidth}));
 };
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.reglages);
  await page.evaluate(()=>localStorage.clear());await page.reload();
  await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.reglages);

  /* ---- deux équipes qui se chevauchent : le relais ----------------------------------------------- */
  await page.evaluate(UNITE,true);
  await importer('vols-relais.csv',RELAIS,'L1');
  const r1=await page.evaluate(()=>{const r=Sim.ateliers.resultat,l=r.lots.find(x=>x.vol==='L1');
    return {parts:l.parts.map(p=>[p.atelier,p.debut,p.fin,p.travail]),fin:l.fin,equipes:r.ateliers.map(a=>[a.id,a.fin,a.heuresSup,a.heuresSupPersonnes]),sale:r.saleFinal};});
  assert.deepEqual(r1,{parts:[['matin',h('12:00'),h('14:00'),120],['apm',h('14:00'),h('15:00'),60]],fin:h('15:00'),
    equipes:[['matin',h('14:00'),0,0],['apm',h('16:30'),0,0]],sale:[]},'le moteur : un seul lot, deux parts, aucune heure sup');

  // Le planning : le lot en relais sur les deux lignes, chacune pour sa part, avec son repère à la jointure.
  const p1=await planning(),matin=p1.find(l=>l.equipe==='matin'),apm=p1.find(l=>l.equipe==='apm');
  assert.equal(matin.lots.length,1);assert.equal(apm.lots.length,2,'l’après-midi : sa part de L1, puis V2');
  const [a,b]=[matin.lots[0],apm.lots[0]];
  assert.deepEqual([a.part,a.debut,a.fin,a.relais,a.arrete],['1/2',h('12:00'),h('14:00'),['passe'],0]);
  assert.deepEqual([b.part,b.debut,b.fin,b.relais,b.arrete],['2/2',h('14:00'),h('15:00'),['repris'],0]);
  assert.equal(a.lot,b.lot,'le même lot, sur les deux lignes');
  assert.ok(a.visible&&b.visible&&Math.abs(a.x1-b.x)<0.5,'les deux parts se joignent à 14:00 : '+a.x1+' / '+b.x);
  assert.match(a.info,/^Vol L1\n12:00 → 14:00 \(2 h 00\)\nAttente : aucune\nEn relais : repris par Plonge après-midi à 14:00\nPropre à 15:00$/);
  assert.match(b.info,/^Vol L1\n14:00 → 15:00 \(1 h 00\)\nAttente : aucune\nEn relais : commencé par Plonge matin\nPropre à 15:00$/);
  assert.deepEqual([apm.lots[1].part,apm.lots[1].relais,apm.lots[1].debut,apm.lots[1].fin],[null,[],h('15:00'),h('16:30')],'V2 : un lot ordinaire');
  // La bulle au survol dit le relais ; la légende le nomme.
  await page.locator('#at-planning .pg-ligne[data-equipe="matin"] g.pg-lot').hover();
  await page.waitForFunction(()=>[...document.querySelectorAll('.ds-bulle,.pg-bulle,[role=tooltip]')].some(e=>/repris par Plonge après-midi à 14:00/.test(e.textContent)&&e.getBoundingClientRect().width>0));
  assert.ok(await page.locator('#at-planning .pg-legende .pg-cle[data-signe="relais"]').count()===1,'la légende : le relais');
  assert.equal(await page.locator('#at-planning .pg-legende .pg-cle[data-signe="arrete"]').count(),0,'pas de lavage arrêté à l’écran');

  // La Synthèse : la plonge finit à 16:30, sans heures sup ; rien pour le lendemain ; rien ne coince.
  const s1=await synthese();
  assert.match(s1.tete[1],/^Rien ne coince ; /,s1.tete[1]);
  assert.match(s1.fin,/^16:30horaire 21:00$/,s1.fin);
  assert.equal(s1.ton,null);
  assert.doesNotMatch(s1.fin+s1.coince,/heures sup|lendemain/);
  assert.match(s1.coince,/Rien ne coince\./);
  assert.ok(!s1.coince.includes(s1.nom),'« Où ça coince » ne cite pas la plonge');
  assert.equal(s1.large,0,'la page tient sur la largeur');

  // Le plan rejoué : L1 reste dans son tunnel, sans coupure, de 12:00 à 15:00 — avant, pendant et après le relais.
  const etats=await page.evaluate(ts=>ts.map(t=>{const e=OrlyReplay.servicesA(Sim.ateliers.resultat,t).plonge;return [e.etat,e.lot&&e.lot.vol];}),[h('12:00'),h('13:59'),h('14:00'),h('14:01'),h('14:59')]);
  assert.deepEqual(etats,Array(5).fill(['travail','L1']));
  await nav.aller(page,'j-plan');
  await page.waitForFunction(()=>document.getElementById('goulot-info')&&!document.querySelector('#goulot-info [data-reste-lendemain]'));

  // « Détails » : aucune heure sup.
  await nav.aller(page,'j-details');
  await page.waitForSelector('#bilan-heures-sup');
  assert.match(await page.locator('#bilan-heures-sup').textContent(),/Aucune : chaque équipe finit dans sa présence\./);

  /* ---- une seule équipe : le lavage s'arrête, le reste passe au lendemain ------------------------- */
  await page.evaluate(UNITE,false);
  await importer('vols-reste.csv',RESTE,'V1');
  const r2=await page.evaluate(()=>{const r=Sim.ateliers.resultat,l=r.lots.find(x=>x.vol==='V1');return {fin:l.fin,fait:l.fait,reste:l.reste,sale:r.saleFinal.map(x=>[x.vol,x.reste||null]),hs:r.ateliers[0].heuresSup};});
  assert.deepEqual(r2,{fin:null,fait:60,reste:30,sale:[['V1',30],['V2',null]],hs:0});

  // La Synthèse : la plonge laisse deux vols au lendemain (30 min restantes + 90 min). Le matin les lavera d'abord, de 06:00 à
  // 08:00, sans retarder son vol de 13:00 : un reste normal (correction 19 b) — sur sa ligne, sans couleur d'alerte ni mot
  // « à signaler » ; rien ne coince. (Évolution 18 : « coince : il laisse 2 vols à laver le lendemain », la case en alerte.)
  const s2=await synthese();
  assert.match(s2.tete[1],/^Rien ne coince ; /,s2.tete[1]);
  assert.match(s2.fin,/^14:00horaire 14:00reste à laver le lendemain : 2 vols \(2 h 00 de lavage\)$/,s2.fin);
  assert.equal(s2.ton,null,'la case n’a pas de statut : le reste est normal');
  assert.doesNotMatch(s2.fin,/heures sup/);
  assert.match(s2.coince,/Rien ne coince\./);
  assert.ok(!s2.coince.includes(s2.nom),'« Où ça coince » ne cite pas la plonge');
  assert.equal(s2.large,0,'la page tient sur la largeur');

  // Le planning : le lavage arrêté se dessine jusqu'à la fin de la présence, avec son petit carré ; il dit ce qu'il en reste.
  const p2=await planning(),seule=p2.find(l=>l.equipe==='matin'),v1=seule.lots.find(l=>l.part==='1/1');
  assert.deepEqual([v1.debut,v1.fin,v1.relais,v1.arrete,v1.visible],[h('13:00'),h('14:00'),[],1,true]);
  assert.match(v1.info,/^Vol V1\n13:00 → 14:00 \(1 h 00\)\nAttente : aucune\nArrêté à 14:00, à la fin de la présence : reste 30 min à laver le lendemain$/);
  assert.ok(await page.locator('#at-planning .pg-legende .pg-cle[data-signe="arrete"]').count()===1,'la légende : le lavage arrêté');

  // Le plan rejoué : un reste que le matin absorbe n'est pas à regarder — sa phrase n'en dit rien (correction 19 b ; avec
  // l'évolution 18 : « … laisse 2 vols à laver le lendemain (2 h 00 de lavage). »).
  await nav.aller(page,'j-plan');
  await page.waitForFunction(()=>document.getElementById('goulot-info')&&!document.querySelector('#goulot-info [data-reste-lendemain]'));

  assert.deepEqual(errors,[]);
  console.log('plonge-relais-browser : ok — le lot en relais sur les deux lignes du planning, avec son repère et ses mots ; la Synthèse sans heures sup à la plonge, avec le reste du lendemain quand il y en a ; un reste que le matin absorbe s’affiche sans alerte ; le plan rejoué sans coupure');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})();

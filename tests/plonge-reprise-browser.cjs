/* Banc d'essai, correction 19 — la reprise à l'arrivée et le reste du
 * lendemain, dans les pages (v1), sur une unité fictive :
 *   — le planning des équipes : un lavage arrêté puis repris se dessine comme
 *     un relais, sur les deux lignes, avec son trou ; au survol, « arrêté à
 *     hh:mm, repris par … à hh:mm » et, sur la part de l'équipe qui reprend,
 *     « commencé par …, arrêté à hh:mm » ;
 *   — la Synthèse : un reste que l'équipe du matin ne peut pas absorber
 *     pendant sa présence fait coincer la plonge, et la phrase dit pourquoi ;
 *     la case porte l'alerte ; le plan rejoué le dit aussi.
 * (Le reste que le matin absorbe, sans alerte : tests/plonge-relais-browser.cjs.)
 * Chaque étape attend son effet, pas un délai. Vols, compagnies et équipes
 * fictifs ; aucune capture d'écran. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const TETE='vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC\n';
// C1 (90 min de lavage) arrive à la plonge à 08:30 ; W1 à 20:00 : un retour y arrive 30 min après son atterrissage.
const REPRISE=TETE+'NO1,NORD,MOYEN,DEP,23:30,,0,0,100\nC1,NORD,MOYEN,RET,,08:00,0,0,100\nW1,NORD,MOYEN,RET,,19:30,0,0,100\n';
// Un matin plein : A1 et A2 (LONG, 180 min) de 06:00 à 12:00, A3 de 12:00 à 13:30 ; V1 arrive à 13:30 (il s'arrêtera à 14:00,
// 60 min restent), V2 à 13:45 (il n'est pas commencé) : 2 vols, 2 h 30 de lavage, que le matin du lendemain n'absorbe pas.
const DEBORDE=TETE+'NO1,NORD,MOYEN,DEP,23:30,,0,0,100\nA1,LONG,MOYEN,RET,,05:30,0,0,100\nA2,LONG,MOYEN,RET,,08:30,0,0,100\nA3,NORD,MOYEN,RET,,11:30,0,0,100\n'
  +'V1,NORD,MOYEN,RET,,13:00,0,0,100\nV2,SUD,MOYEN,RET,,13:15,0,0,100\n';
/* L'unité : la plonge seule, par vol, sur le même tunnel — le matin (06:00–14:00) ; à trois : l'après-midi (13:00–21:00) et
 * la nuit (22:00–06:00), qui arrive une heure après le départ de l'après-midi. */
const UNITE=trois=>{
  Sim.reglages.changer(()=>{const e=Sim.reglages.etat;e.regime={seuils:[],presence:480};e.heuresSup={actif:true,plafond:180};},'');
  Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;st.materiel.actif=false;st.materiel.retours='programme';st.materiel.delaiRetour=30;
    const plonge=(id,nom,debut)=>({id,nom,service:'plonge',type:'lavage',debut,jour:0,personnes:2,pauses:[],lots:[],regime:{actif:true,presence:480},
      plafond:0,parVol:true,durees:{'*':90,LONG:180},tunnels:[{nom:'Tunnel 1',debit:300,personnes:1,actif:true}]});
    st.ateliers=[plonge('matin','Plonge matin','06:00')].concat(trois?[plonge('apm','Plonge après-midi','13:00'),plonge('nuit','Plonge nuit','22:00')]:[]);},'');
};
const h=s=>{const [a,b]=s.split(':').map(Number);return a*60+b;};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-reprise-'));
 const fichier=(nom,texte)=>{const f=path.join(dossier,nom);fs.writeFileSync(f,texte);return f;};
 /** Les vols importés, et la journée recalculée avec eux (le lot attendu est là). */
 const importer=async(nom,texte,vol)=>{
   await nav.aller(page,'v-programme');
   await page.locator('#imp-vols').setInputFiles(fichier(nom,texte));
   await page.waitForFunction(([n,v])=>document.getElementById('source-label').textContent===n
     &&((Sim.ateliers.resultat||{}).lots||[]).some(l=>l.retourVol&&l.vol===v),[nom,vol]);
 };
 /** Le planning des équipes, la plonge dépliée : les barres de chaque équipe. */
 const planning=async equipe=>{
   await nav.aller(page,'at-planning');
   await page.waitForSelector('#at-planning .pg-cadre .pg-groupe[data-service="plonge"]');
   if(await page.locator('#at-planning .pg-groupe[data-service="plonge"] .pg-lignes').evaluate(e=>e.hidden))await page.locator('#at-planning .pg-groupe[data-service="plonge"] .pg-replier').click();
   await page.waitForSelector('#at-planning .pg-groupe[data-service="plonge"] .pg-ligne[data-equipe="'+equipe+'"] g.pg-lot');
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

  /* ---- trois équipes, la nuit arrive une heure après le départ de l'après-midi : la reprise --------- */
  await page.evaluate(UNITE,true);
  await importer('vols-reprise.csv',REPRISE,'W1');
  const r1=await page.evaluate(()=>{const r=Sim.ateliers.resultat,l=r.lots.find(x=>x.vol==='W1');
    return {parts:l.parts.map(p=>[p.atelier,p.debut,p.fin,p.travail,!!p.reprise]),fin:l.fin,duree:l.duree,sale:r.saleFinal,lendemain:Sim.reponses().plonge.lendemain||null};});
  assert.deepEqual(r1,{parts:[['apm',h('20:00'),h('21:00'),60,false],['nuit',h('22:00'),h('22:30'),30,true]],fin:h('22:30'),duree:90,sale:[],lendemain:null},
    'le moteur : un seul lot, deux parts avec un trou, le vol propre à 22:30, rien pour le lendemain');

  // Le planning : comme un relais, sur les deux lignes, chacune pour sa part — avec un trou entre 21:00 et 22:00.
  const p1=await planning('apm'),apm=p1.find(l=>l.equipe==='apm'),nuit=p1.find(l=>l.equipe==='nuit');
  assert.equal(apm.lots.length,1);assert.equal(nuit.lots.length,1);
  const [a,b]=[apm.lots[0],nuit.lots[0]];
  assert.deepEqual([a.part,a.debut,a.fin,a.relais,a.arrete],['1/2',h('20:00'),h('21:00'),['passe'],0]);
  assert.deepEqual([b.part,b.debut,b.fin,b.relais,b.arrete],['2/2',h('22:00'),h('22:30'),['repris'],0]);
  assert.equal(a.lot,b.lot,'le même lot, sur les deux lignes');
  assert.ok(a.visible&&b.visible,'les deux parts sont dessinées');
  // Le trou : une heure entre la fin de la première part et le début de la seconde — la largeur de la première part (1 h).
  assert.ok(Math.abs((b.x-a.x1)-(a.x1-a.x))<1,'le trou d’une heure entre les deux parts : '+JSON.stringify([a.x,a.x1,b.x,b.x1]));
  assert.equal(a.info,'Vol W1\n20:00 → 21:00 (1 h 00)\nAttente : aucune\nArrêté à 21:00, repris par Plonge nuit à 22:00\nPropre à 22:30');
  assert.equal(b.info,'Vol W1\n22:00 → 22:30 (30 min)\nAttente : aucune\nReprise : commencé par Plonge après-midi, arrêté à 21:00\nPropre à 22:30');
  // La bulle au survol le dit ; la légende nomme le relais, pas le lavage arrêté (il est repris).
  await page.locator('#at-planning .pg-ligne[data-equipe="apm"] g.pg-lot').hover();
  await page.waitForFunction(()=>[...document.querySelectorAll('.ds-bulle,.pg-bulle,[role=tooltip]')].some(e=>/Arrêté à 21:00, repris par Plonge nuit à 22:00/.test(e.textContent)&&e.getBoundingClientRect().width>0));
  assert.equal(await page.locator('#at-planning .pg-legende .pg-cle[data-signe="relais"]').count(),1,'la légende : le relais');
  assert.equal(await page.locator('#at-planning .pg-legende .pg-cle[data-signe="arrete"]').count(),0,'pas de lavage arrêté à l’écran');

  // La Synthèse : tout est lavé, rien pour le lendemain, rien ne coince.
  const s1=await synthese();
  assert.match(s1.tete[1],/^Rien ne coince ; /,s1.tete[1]);
  assert.equal(s1.ton,null);
  assert.doesNotMatch(s1.fin+s1.coince,/heures sup|lendemain/);
  assert.match(s1.coince,/Rien ne coince\./);

  /* ---- une seule équipe, un matin plein : un reste qu'il n'absorbe pas fait coincer la plonge ------- */
  await page.evaluate(UNITE,false);
  await importer('vols-deborde.csv',DEBORDE,'V1');
  const r2=await page.evaluate(()=>{const r=Sim.ateliers.resultat,x=Sim.reponses();return {sale:r.saleFinal.map(y=>[y.vol,y.reste||null]),lendemain:x.coince.services.find(s=>s.service==='plonge').lendemain,
    goulots:x.coince.goulots.map(g=>g.service)};});
  assert.deepEqual(r2,{sale:[['V1',60],['V2',null]],lendemain:{vols:2,minutes:150,absorbe:false,equipe:{id:'matin',nom:'Plonge matin'},depassement:150},goulots:['plonge']});
  const s2=await synthese(),pourquoi='laisse 2 vols à laver le lendemain, plus que l’équipe du matin ne peut en laver pendant sa présence';
  assert.equal(s2.tete[1].split(' ; ')[0],s2.nom+' coince : il '+pourquoi);
  // (La case marquée dit d'abord, pour un lecteur d'écran, qu'elle est signalée — sans seuil à dépasser.)
  assert.match(s2.fin,/^à signaler : 14:00horaire 14:00reste à laver le lendemain : 2 vols \(2 h 30 de lavage\)$/,s2.fin);
  assert.equal(s2.ton,'attente','la case porte le statut, avec une icône et des mots');
  assert.ok(s2.coince.includes(pourquoi+'.'),s2.coince);
  assert.match(s2.coince,/Cause : ses équipes partent à la fin de leur présence/);
  assert.ok(s2.coince.includes(s2.nom),'« Où ça coince » cite la plonge');
  assert.equal(s2.large,0,'la page tient sur la largeur');

  // Le plan rejoué : sa phrase le dit, comme la Synthèse.
  await nav.aller(page,'j-plan');
  await page.waitForSelector('#goulot-info [data-reste-lendemain="plonge"]');
  assert.match(await page.locator('#goulot-info [data-reste-lendemain="plonge"]').textContent(),
    / laisse 2 vols à laver le lendemain \(2 h 30 de lavage\), plus que l’équipe du matin ne peut en laver pendant sa présence\.$/);

  assert.deepEqual(errors,[]);
  console.log('plonge-reprise-browser : ok — la reprise sur les deux lignes du planning, avec son trou et ses mots (« arrêté à 21:00, repris par … à 22:00 ») ; un reste que le matin n’absorbe pas fait coincer la plonge, la phrase dit pourquoi, la case porte l’alerte, le plan rejoué le dit');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})();

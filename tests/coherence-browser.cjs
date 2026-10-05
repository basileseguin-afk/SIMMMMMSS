/* Audit de la logique des flux (retour d'usage du 02/10 : « fais un check de
 * tous les flux internes, la logique des flux, pour vérifier qu'on n'a pas de
 * choses absurdes ou contradictoires »). Des unités montées comme la vraie —
 * handling, armement intégré aux chemins, Prépa + Montage à la chaîne, règle
 * ⚡ qui absorbe, chemin à elle, équipe la veille, robot — et des règles qui
 * doivent toujours tenir :
 *   1. aucun nombre impossible ;
 *   2. chaque commande suit SON chemin : aucune étape avant son amont, aucune
 *      étape préparée hors de son chemin ;
 *   3. le handling charge un vol après ses repas ET son armement, jamais un vol
 *      sans repas préparé, et n'oublie aucun vol sans le dire ;
 *   4. une case d'armement pour chaque compagnie dont un chemin y passe, aucune autre ;
 *   5. compteurs et états des commandes cohérents ;
 *   6. une case cochée est une commande connue ;
 *   7. le tableau des minutes dit le même travail que le calcul (chaîne comprise) ;
 *   8. une fiche ne demande pas de cocher hors chemin, ni ce qui est déjà préparé ;
 *   9. aucun message cassé.
 * Et un contrôle de l'audit lui-même : une faute introduite exprès est vue. v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const AUDIT=`(nomScenario)=>{
  const A=Sim.ateliers,st=A.state,P=MoteurProduction,PC=OrlyParcours,r=A.resultat,pb=[];
  const dire=(code,msg)=>pb.push(nomScenario+' · '+code+' : '+msg);
  if(!r||!r.lots){dire('calcul','pas de résultat');return pb;}
  const classes=A.classes, parCie=Object.keys(st.categories||{}).flatMap(s=>A.classesDe(s)||[]);
  const toutes=classes.concat(parCie), parId=new Map(r.classes.map(c=>[c.id,c]));
  const routes=P.routesDesClasses(classes,st);
  const lots=r.lots.filter(l=>!l.dispo&&!l.handling&&!l.retourVol&&l.fin!=null);
  const lotDe=(s,c)=>lots.filter(l=>l.service===s&&(l.classes||[]).includes(c));
  const fusions=new Map();for(const a of st.ateliers)if(a.type==='manuel'&&a.fusion&&a.fusion!==a.service)for(const c of (a.lots||[]).flat())fusions.set(a.fusion+'|'+c,a);
  // 1. Nombres possibles.
  for(const l of r.lots){for(const k of ['debut','fin','duree','attente'])if(l[k]!=null&&!Number.isFinite(l[k]))dire('nombre',l.atelier+' '+k+'='+l[k]);
    if(l.fin!=null&&l.debut!=null&&l.fin<l.debut-1e-6)dire('fin<début',l.atelier+' '+l.nom);}
  // 2. Chaque commande préparée respecte SON chemin : aucune étape ne commence avant son amont.
  for(const c of classes){const rt=routes.get(c.id);if(!rt)continue;
    for(const [s,amonts] of Object.entries(rt.amonts||{}))for(const l of lotDe(s,c.id))for(const u of amonts){
      if(fusions.has(u+'|'+c.id))continue;                // étape faite à la chaîne avec celle-ci
      for(const a of lotDe(u,c.id))if(l.debut<a.fin-1e-6)dire('avant son amont',c.id+' : '+s+' commence '+P.hhmm(l.debut)+', '+u+' finit '+P.hhmm(a.fin));}
    // Une étape préparée hors de son chemin.
    for(const l of lots)if((l.classes||[]).includes(c.id)&&!rt.services.has(l.service)&&!fusions.has(l.service+'|'+c.id))dire('hors chemin',c.id+' préparée dans '+l.service+' que son chemin ne traverse pas');
  }
  // 3. Le handling : un vol se charge après toutes ses commandes préparées ET son armement.
  const prod=new Set(lots.flatMap(l=>l.classes||[]));
  for(const h of r.lots.filter(l=>l.handling&&l.debut!=null)){
    const attend=toutes.filter(c=>(c.vols||[]).some(v=>v.id===h.vol)&&prod.has(c.id));
    for(const c of attend){const f=Math.max(...lots.filter(l=>(l.classes||[]).includes(c.id)).map(l=>l.fin));
      if(h.debut<f-1e-6)dire('chargé trop tôt',h.vol+' chargé à '+P.hhmm(h.debut)+' mais '+c.id+' finit à '+P.hhmm(f));
      if(!(h.classes||[]).includes(c.id))dire('handling n’attend pas',h.vol+' n’attend pas '+c.id+' (préparée)');}
    for(const cid of h.classes||[])if(!prod.has(cid))dire('handling attend du non préparé',h.vol+' attend '+cid+' que personne ne prépare');
    if(!attend.some(c=>!c.categorie))dire('vol chargé sans repas',h.vol+' chargé alors qu’aucune de ses commandes de repas n’est préparée');
    if(h.depart!=null&&h.fin!=null&&h.aHeure&&h.fin>h.depart+1e-6)dire('à l’heure ?',h.vol+' fini '+P.hhmm(h.fin)+' après son départ '+P.hhmm(h.depart));
  }
  // Un vol dont des repas sont préparés doit être chargé (ou signalé).
  const charges=new Set(r.lots.filter(l=>l.handling).map(l=>l.vol));
  if(st.ateliers.some(a=>a.type==='handling'))for(const v of A.a.vols().filter(v=>v.sens==='DEP')){
    const prepares=classes.filter(c=>prod.has(c.id)&&(c.vols||[]).some(x=>x.id===v.id));
    if(prepares.length&&!charges.has(v.id)&&!r.anomalies.some(a=>/handling/.test(a.code)))dire('vol oublié',v.id+' a ses repas préparés mais n’est pas chargé, sans alerte');}
  // 4. Armement : une case par compagnie dont un chemin passe par lui ; aucune autre.
  for(const s of Object.keys(st.categories||{})){
    const attendues=new Set(classes.filter(c=>routes.get(c.id)&&routes.get(c.id).services.has(s)).map(c=>c.cie));
    const vues=new Set((A.classesDe(s)||[]).map(c=>c.cie));
    for(const c of attendues)if(!vues.has(c))dire('armement manquant',s+' : pas de case pour '+c+' alors que son chemin y passe');
    for(const c of vues)if(!attendues.has(c))dire('armement en trop',s+' : une case pour '+c+' dont aucun chemin n’y passe');
    // Les cases d'armement cochées dans une équipe doivent exister.
    for(const a of st.ateliers.filter(a=>a.service===s))for(const id of (a.lots||[]).flat())if(!vues.has(id.split('/')[0]))dire('case fantôme',a.nom+' coche '+id+' qui n’existe pas');
  }
  // 5. Compteurs et états par commande.
  for(const [id,c] of Object.entries(r.parClasse||{})){
    if(c.fin!=null&&c.aHeure&&c.fin>c.echeance+1e-6)dire('à l’heure ?',id+' finit '+P.hhmm(c.fin)+' après son échéance '+P.hhmm(c.echeance));
    if(c.fin!=null&&!c.aHeure&&!(c.retard>0))dire('retard nul',id+' en retard de '+c.retard);}
  const i=r.indicateurs;if(i.enRetard+i.pasFinies+i.aHeure!==i.classesSuivies)dire('compteurs',JSON.stringify(i));
  if(i.classesSuivies+i.classesAbsentes!==r.classes.length&&i.classesSuivies+i.classesAbsentes!==Object.keys(r.parClasse).length)dire('compteurs commandes',i.classesSuivies+'+'+i.classesAbsentes+' ≠ '+r.classes.length+' / '+Object.keys(r.parClasse).length);
  // 6. Une case cochée doit être une commande connue ; une case qui coche hors de son chemin est signalée.
  const connues=new Set(toutes.map(c=>c.id));
  for(const a of st.ateliers)for(const id of (a.lots||[]).flat())if(!connues.has(id)&&!r.anomalies.some(x=>String(x.message).includes(id)))dire('case inconnue',a.nom+' coche '+id+', inconnue, sans alerte');
  // 7. Le tableau des minutes dit le même travail que le calcul (rendement 1).
  const R=OrlyEchanges.recapManMinutes(Sim.reglages.contexteRecap());
  for(const l of lots.filter(l=>Number.isFinite(l.hommeMinutes)&&l.hommeMinutes>0)){
    const a=st.ateliers.find(x=>x.id===l.atelier);if(!a||a.type!=='manuel')continue;
    if(!l.classes.every(cid=>(a.lots||[]).flat().includes(cid)))continue;
    let somme=0,ok=true;
    for(const cid of l.classes){const ligne=R.lignes.find(x=>x.classe.id===cid),lc=(R.lignesCie||[]).find(x=>x.cellules[l.service]&&x.cellules[l.service].classe===cid);
      const cel=ligne?ligne.cellules[l.service]:lc?lc.cellules[l.service]:null;
      if(!cel||cel.jour==null){ok=false;break;}somme+=cel.jour;}
    // Les étapes faites à la chaîne ajoutent les minutes de l'étape absorbée.
    // À la chaîne : les minutes de l'étape absorbée s'ajoutent, pour les commandes qui y passent.
    if(ok&&a.fusion)for(const cid of l.classes){const rt=routes.get(cid);const autre=lots.some(x=>x.service===a.fusion&&x.atelier!==a.id&&(x.classes||[]).includes(cid));if(rt&&rt.services.has(a.fusion)&&!autre){const lg=R.lignes.find(x=>x.classe.id===cid);const c2=lg&&lg.cellules[a.fusion];if(c2&&c2.jour!=null)somme+=c2.jour;
      if(c2&&!c2.equipe)dire('chaîne invisible',cid+' : le tableau dit que personne ne la prépare en '+a.fusion+', alors que « '+a.nom+' » la fait à la chaîne');}}
    if(ok&&Math.abs(somme-l.hommeMinutes)>0.5)dire('tableau ≠ calcul',a.nom+' '+l.classes.join('+')+' : tableau '+somme.toFixed(1)+' min, calcul '+l.hommeMinutes.toFixed(1)+' min');}
  // 8. Pas à pas et fiches : une commande « à cocher » dans un service doit vraiment passer par lui sans équipe.
  if(Sim.unite&&Sim.unite.bilan){for(const s of A.a.services()){let b;try{b=Sim.unite.bilan(s.id,classes,r);}catch(e){dire('bilan',s.id+' : '+e.message);continue;}
    for(const id of (b.attendues||[]).map(x=>x.id||x)){const rt=routes.get(id);const ici=parCie.find(c=>c.id===id);
      if(!ici&&rt&&!rt.services.has(s.id))dire('à cocher hors chemin',s.id+' demande de cocher '+id+' dont le chemin ne passe pas par lui');
      if(lots.some(l=>l.service===s.id&&(l.classes||[]).includes(id)))dire('à cocher mais préparée',s.id+' : '+id+' est déjà préparée');}}}
  // 9. Les messages : pas de phrase qui en contredit une autre.
  const msgs=r.anomalies.map(a=>a.message);
  for(const m of msgs)if(/undefined|NaN|null|\\[object/.test(m))dire('message cassé',m);
  return pb;
}`;
const SCENARIOS={
 'unité vide':()=>{},
 'unité type':()=>{const A=Sim.ateliers;A.changer(()=>{const st=A.state;
   st.ajoutees=[{cie:'EZY',cabine:'YC'},{cie:'RAM',cabine:'YC'}];
   st.categories={armement:[{id:'ARM',nom:'Armement',minutes:{'*':10,AF:15}}]};
   const t=(id,nom,service,debut,personnes,lots,x)=>({id,nom,service,type:'manuel',debut,jour:0,personnes,pauses:[],lots,regime:{actif:true},...x});
   st.ateliers.push(
     {id:'leg',nom:'Légumerie',service:'decontam',type:'dispo',debut:'05:00',jour:-1,personnes:2,pauses:[],lots:[],regime:{actif:true},permanent:true},
     t('cu','Cuisine',"cuisine",'03:00',4,[['AF/BC','AF/PC'],['TX/BC','FWI/BC','CRL/BC','FBU/BC']],{jour:-1}),
     t('pr','Prépa',"preparation",'04:00',3,[['AF/BC','AF/PC','TX/BC']]),
     t('mo','Montage',"prepa",'04:30',5,[['AF/YC','AF/BC','AF/PC','TX/BC','TX/YC','EZY/YC','RAM/YC']],{fusion:'preparation'}),
     t('mo2','Montage 2',"prepa",'05:00',3,[['FWI/YC','CRL/YC','FBU/YC','FWI/BC','CRL/BC','FBU/BC']]),
     t('ar','Armement',"armement",'04:00',2,[['AF/@ARM','TX/@ARM','EZY/@ARM'],['FWI/@ARM','CRL/@ARM']]),
     {id:'h',nom:'Quais',service:'quais',type:'handling',debut:'04:00',jour:0,personnes:3,pauses:[],lots:[],regime:{actif:true},durees:{'*':25},compagnies:[]},
     {id:'pl',nom:'Plonge',service:'plonge',type:'lavage',debut:'06:00',jour:0,personnes:3,pauses:[],lots:[],regime:{actif:true},parVol:true,durees:{'*':30},tunnels:[{nom:'T1',debit:300,personnes:1,actif:true}]});
   OrlyParcours.integrerArmement(st,['armement'],['quais']);},'');},
 'deux handlings à listes':()=>{const A=Sim.ateliers;A.changer(()=>{const st=A.state;const h=st.ateliers.find(a=>a.id==='h');h.compagnies=['AF','TX'];
   st.ateliers.push({...h,id:'h2',nom:'Quais 2',compagnies:['FWI','CRL']});},'');},
 'armement retiré d’un flux':()=>{const A=Sim.ateliers;A.changer(()=>{const st=A.state;const p=st.parcours.find(x=>x.type&&x.noeuds.includes('armement'));
   p.noeuds=p.noeuds.filter(n=>n!=='armement');p.liens=p.liens.filter(l=>l.de!=='armement'&&l.vers!=='armement');},'');},
 'règle ⚡ et absorbe':()=>{const A=Sim.ateliers;A.changer(()=>{const st=A.state;const m=st.ateliers.find(a=>a.id==='mo2');
   m.condition={cie:'FWI',seuil:9,sinon:'mo',absorbe:true};},'');},
 'chemin à elle + chaîne partielle':()=>{const A=Sim.ateliers;A.changer(()=>{const st=A.state;
   OrlyParcours.adapter(st,['RAM/YC'],'prepa',false,Sim.unite.options());},'');},
 'montage la veille, robot':()=>{const A=Sim.ateliers;A.changer(()=>{const st=A.state;const m=st.ateliers.find(a=>a.id==='mo2');m.jour=-1;m.debut='20:00';
   st.ateliers.push({id:'rb',nom:'Robot',service:'prepa',type:'robot',debut:'05:00',jour:0,personnes:2,pauses:[],lots:[['TX/YC']],regime:{actif:true},debit:300,personnesMin:1});
   st.ateliers.find(a=>a.id==='mo').lots=[['AF/YC','AF/BC','AF/PC','TX/BC','EZY/YC','RAM/YC']];},'');}
};
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await page.waitForTimeout(250);
   await page.evaluate(()=>localStorage.clear());await page.reload();await page.waitForTimeout(250);
   await page.waitForTimeout(200);await nav.effectifSaisi(page);   // les personnes se saisissent ici (05/10)
   for(const [nom,fn] of Object.entries(SCENARIOS)){
    await page.evaluate(fn);await page.waitForTimeout(150);
    assert.deepEqual(await page.evaluate(`(${AUDIT})(${JSON.stringify(version+' · '+nom)})`),[],version+' · '+nom);
    assert.ok(nom==='unité vide'||await page.evaluate(()=>Sim.ateliers.resultat.lots.some(l=>l.handling)),version+' · '+nom+' : des vols chargés');
   }
   for(const id of ['mu-pas','mu-services','mu-flux','at-chemins','rg-recap','at-planning','j-chiffres','v-departs'])await nav.aller(page,id);
   // L'audit voit une faute : un vol chargé à minuit, avant ses repas.
   const vu=await page.evaluate(`(()=>{const h=Sim.ateliers.resultat.lots.find(l=>l.handling);h.debut=0;return (${AUDIT})('faute');})()`);
   assert.ok(vu.some(x=>/chargé trop tôt/.test(x)),version+' : l’audit voit la faute');
  }
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('coherence-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

/* Banc d'essai, évolution 10 (d) — la période dans la page (v1). Une unité
 * fictive (celle de la référence de non-régression) et un programme daté
 * fictif de vingt jours, sur deux mois :
 *   — sans programme daté, rien de nouveau ne se montre ;
 *   — le sélecteur de journée de vols, et la journée choisie ;
 *   — « Simuler la période » avance par étapes (« Journée k sur 20 »), Annuler ;
 *   — le bilan de la page est celui du moteur (un seul chemin de calcul) ;
 *   — la journée affichée part du sale que la veille lui laisse dans la période,
 *     au champ près, tant que rien n'a changé ; un réglage modifié la marque
 *     « à relancer », et la journée repart du sale de la veille saisi ;
 *   — la page Période : jours incomplets, totaux et moyennes par mois, un clic
 *     ouvre la journée, le détail par équipe et par compagnie se déplie ;
 *   — (e) « Exporter les résultats » propose le classeur de la période, le même
 *     que celui de l'outil (--xlsx) ; la journée reste en JSON.
 * Données fictives ; aucune capture d'écran (le plan est confidentiel). */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const J=require('../moteur/journee.js'),PE=require('../moteur/periode.js'),UI=require('../ui-model.js'),T=require('../tableur.js');
const {spawnSync}=require('node:child_process');
const OUTIL=path.join(__dirname,'..','outils','simuler-periode.cjs');
const REF=require('./non-regression.attendu.json');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const S=REF.scenarios.find(s=>s.nom==='unite-vol');
const hh=t=>(t==null?'':String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0'));
const LIGNE=v=>[v.id,v.cie,v.avion,v.sens,v.sens==='DEP'?hh(v.std):'',v.sens==='RET'?hh(v.sta):'',v.bc,v.pc,v.yc,v.crew,v.spml].join(',');
const TETE='vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_CREW,nb_SPML';
// Vingt jours fictifs, du 25/10 au 13/11 : les vols de l'unité fictive, un départ de moins un jour sur trois.
const JOURS=PE.joursEntre('2026-10-25','2026-11-13');
const VOLS=JOURS.flatMap((d,i)=>S.args.vols.filter(v=>!(i%3===1&&v.id==='NO101')).map(v=>({...v,date:d})));
const CSV='date,'+TETE+'\n'+VOLS.map(v=>v.date+','+LIGNE(v)).join('\n')+'\n';
const SANS_DATE=TETE+'\n'+S.args.vols.map(LIGNE).join('\n')+'\n';
const json=x=>JSON.parse(JSON.stringify(x));
const parse=t=>UI.parseFlights(t,{eta:true,spmlParCabine:true,date:true});

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const attendre=(ms=250)=>page.waitForTimeout(ms);
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-periode-page-'));
 const fichier=(nom,texte)=>{const f=path.join(dossier,nom);fs.writeFileSync(f,texte);return f;};
 const importer=async(nom,texte)=>{await nav.aller(page,'v-programme');await page.locator('#imp-vols').setInputFiles(fichier(nom,texte));
   await page.waitForFunction(n=>document.getElementById('source-label').textContent===n,nom);await attendre(150);};
 // La journée affichée, une fois l'effectif calculé reporté dans les cases (comme journee-browser.cjs),
 // et la sauvegarde de la page à cet instant (« Tout sauvegarder » : ces clés du navigateur).
 const CLES=['ory-ateliers-v1','ory-modele-v1','orly-plan-v3','orly-flows-v1','ory-graphes-v1'];
 const journee=async()=>JSON.parse(await page.evaluate(cles=>{Sim.ateliers.calculer();const r=Sim.ateliers.calculer(),contenu={};
   for(const k of cles){const v=localStorage.getItem(k);if(v)contenu[k]=JSON.parse(v);}
   return JSON.stringify({r,sv:{schema:'ory-sauvegarde',version:1,contenu}});},CLES));
 // Ce qu'en donne l'outil d'une journée, pour la sauvegarde de la page (options : celles de la période, et ce que la veille laisse).
 const argsDe=(sv,d,entree)=>J.argumentsDeLaJournee(sv,d?PE.volsDuJour(VOLS,d):S.args.vols,entree?PE.optionsDeRejeu(S.options,entree):S.options);
 const seule=({sv},d,entree)=>json(J.jouer(argsDe(sv,d,entree)));
 const verifier=async(d,entree,msg)=>{const j=await journee();assert.deepEqual(j.r,seule(j,d,entree),msg);return j;};
 const etat=()=>page.evaluate(()=>Sim.periode.etat());
 const pagesResultats=()=>page.evaluate(()=>OrlyOnglets.pagesDe('resultats').map(x=>x.id));
 const telecharger=async fn=>{const [d]=await Promise.all([page.waitForEvent('download'),fn()]);const f=path.join(dossier,d.suggestedFilename());await d.saveAs(f);return f;};
 const finir=()=>page.waitForFunction(()=>Sim.periode.etat()==='a-jour',null,{timeout:60000});
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(500);
  // L'unité fictive, restaurée comme à la main.
  await nav.aller(page,'u-sauvegarde');
  await page.locator('#sauvegarde-import').setInputFiles(fichier('unite-fictive.json',JSON.stringify(S.sauvegarde)));
  const recharge=page.waitForEvent('load');await nav.repondre(page);await recharge;await page.waitForLoadState('load');await attendre(600);

  // 1. Sans programme daté : rien de nouveau.
  await importer('vols-fictifs.csv',SANS_DATE);
  assert.equal(await page.locator('#periode-bandeau').isHidden(),true,'sans date : pas de bandeau');
  assert.equal(await etat(),'absente');
  assert.deepEqual(await pagesResultats(),['j-chiffres','j-plan','at-planning','at-repas','at-grille','v-departs','j-stocks','j-comparer']);
  assert.equal(await page.evaluate(()=>Sim.jourVols),null);
  await verifier(null,null,'sans date : la journée d’aujourd’hui');

  // 2. Un programme daté : le bandeau, la journée de vols choisie (la première), la page Période au menu.
  await importer('vols-dates.csv',CSV);
  assert.equal(await page.locator('#periode-bandeau').isVisible(),true);
  assert.equal(await page.evaluate(()=>Sim.jourVols),'2026-10-25');
  assert.equal(await page.locator('#periode-jour option').count(),20);
  assert.match(await page.locator('#periode-jour option:checked').innerText(),/dim\. 25\/10\/2026 — 16 départs, 6 retours/);
  assert.match(await page.locator('#source-count').innerText(),/16 départs · 6 retours · journée du 25\/10\/2026/);
  assert.equal(await etat(),'jamais');
  assert.match(await page.locator('#periode-bandeau .pj-etat').innerText(),/pas encore simulée/);
  assert.deepEqual((await pagesResultats()).slice(0,2),['j-chiffres','j-periode']);
  await verifier('2026-10-25',null,'le premier jour : la journée de ses seuls vols');

  // 3. Une autre journée : ses vols, le sale de la veille saisi (la période n'est pas calculée).
  await page.locator('#periode-jour').selectOption('2026-10-26');await attendre(200);
  assert.equal(await page.evaluate(()=>Sim.jourVols),'2026-10-26');
  assert.equal(await page.evaluate(()=>Sim.ateliers.a.vols().filter(v=>v.sens==='DEP').length),15,'sans NO101 ce jour-là');
  const sans=await verifier('2026-10-26',null),sansPeriode=sans.r;
  await page.locator('#periode-bandeau [data-pv=suivant]').click();await attendre(200);
  assert.equal(await page.evaluate(()=>Sim.jourVols),'2026-10-27');
  await page.locator('#periode-bandeau [data-pv=precedent]').click();await attendre(200);
  assert.equal(await page.evaluate(()=>Sim.jourVols),'2026-10-26');
  assert.equal(await page.locator('#periode-jour').evaluate(e=>e===document.activeElement||!!e.closest('#periode-bandeau')),true);

  // 4. Le calcul avance par étapes, la page vivante ; Annuler l'arrête. L'unité fictive se calcule vite :
  //    chaque journée est ralentie ici de 20 ms, pour voir passer les étapes.
  await page.evaluate(()=>{const creer=OrlyPeriode.creerPeriode;window.__creer=creer;
    OrlyPeriode.creerPeriode=(...x)=>{const p=creer(...x),suivant=p.suivant;p.suivant=()=>{const t=Date.now();while(Date.now()-t<20);return suivant();};return p;};});
  await page.locator('#periode-bandeau [data-pv=lancer]').click();
  await page.waitForFunction(()=>/Journée \d+ sur 20…/.test(document.querySelector('#periode-bandeau .pj-etat').textContent));
  assert.equal(await etat(),'en-cours');
  await page.locator('#periode-bandeau [data-pv=annuler]').click();await attendre(300);
  assert.equal(await etat(),'jamais','annulé : pas de période');
  assert.equal(await page.evaluate(()=>Sim.periode.resultat),null);
  assert.match(await page.evaluate(()=>document.body.innerText),/Calcul de la période annulé/);
  assert.deepEqual((await journee()).r,sansPeriode,'annulé : la journée ne bouge pas');

  // Le calcul jusqu'au bout : on voit passer les journées une à une, la page répond entre deux.
  const vues=new Set();
  await page.locator('#periode-bandeau [data-pv=lancer]').click();
  while(await etat()==='en-cours'){
    const t=await page.evaluate(()=>(document.querySelector('#periode-bandeau .pj-progression')||{}).textContent||'');
    const m=/Journée (\d+) sur 20…/.exec(t);if(m)vues.add(+m[1]);
    await page.waitForTimeout(5);
  }
  await page.evaluate(()=>{OrlyPeriode.creerPeriode=window.__creer;});
  assert.equal(await etat(),'a-jour');
  assert.ok(vues.size>=2&&[...vues].some(k=>k>1&&k<20),'des étapes intermédiaires : '+[...vues].join(','));
  assert.match(await page.locator('#periode-bandeau .pj-etat').innerText(),/Période simulée : 20 journées/);

  // 5. Un seul chemin de calcul : le bilan de la page est celui du moteur, pour la même sauvegarde et les mêmes vols.
  const periode=PE.depuisSauvegarde(S.sauvegarde,parse(CSV),S.options,{detail:true});
  const bilanPage=JSON.parse(await page.evaluate(()=>JSON.stringify(Sim.periode.resultat.bilan)));
  assert.deepEqual(bilanPage,json(periode.bilan),'le bilan de la page = celui du moteur');
  assert.deepEqual(JSON.parse(await page.evaluate(()=>JSON.stringify(Sim.periode.resultat.journees.map(j=>j.entree)))),json(periode.journees.map(j=>j.entree)));

  // 6. La journée affichée part de ce que la veille lui laisse dans la période, au champ près.
  const entree=periode.journees[1].entree;
  assert.ok(entree.saleInitial.length>0,'du sale passe du 25 au 26');
  const avec=await verifier('2026-10-26',entree,'le 26 : celle de l’outil d’une journée avec ses options de rejeu');
  const extrait=(j,d,e)=>json(PE.extraire(j.r,argsDe(j.sv,d,e),d));
  assert.deepEqual(extrait(avec,'2026-10-26',entree),json(periode.journees[1].extrait),'… la journée de la période');
  // Sans la période, le 26 partait du sale de la veille saisi : pas le même.
  assert.notEqual(extrait(sans,'2026-10-26',null).saleInitial,periode.journees[1].extrait.saleInitial);
  assert.notDeepEqual(avec.r,sansPeriode);
  assert.match(await page.locator('#periode-bandeau .pj-etat').innerText(),/part du sale laissé la veille dans la période/);
  await page.locator('#periode-jour').selectOption('2026-11-05');await attendre(200);
  const e11=periode.journees[11].entree;
  assert.deepEqual(extrait(await verifier('2026-11-05',e11,'le 05/11 aussi'),'2026-11-05',e11),json(periode.journees[11].extrait));
  await page.locator('#periode-jour').selectOption('2026-10-25');await attendre(200);
  await verifier('2026-10-25',null,'le premier jour : le sale de la veille saisi');

  // 7. La page Période : le tableau jour de travail × service, les jours incomplets, les totaux et moyennes par mois.
  await page.locator('#periode-bandeau [data-pv=voir]').click();await attendre(200);
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'j-periode');
  const lignes=page.locator('#journee-periode tr[data-pv-jour]');
  assert.equal(await lignes.count(),periode.bilan.joursTravail.length);
  const incomplets=await page.locator('#journee-periode tr.pv-incomplet').evaluateAll(l=>l.map(x=>x.dataset.pvJour));
  assert.deepEqual(incomplets,periode.periode.joursIncomplets);
  assert.equal(await page.locator('#journee-periode tr.pv-incomplet .pv-badge').count(),incomplets.length);
  const cumuls=await page.locator('#journee-periode tr.pv-cumul th').allInnerTexts();
  assert.deepEqual(cumuls.map(t=>t.replace(/\s*\(.*\)/,'')),['Total octobre 2026','Moyenne par jour, octobre 2026','Total novembre 2026','Moyenne par jour, novembre 2026','Total de la période','Moyenne par jour sur la période']);
  // Les personnes d'un jour, service par service : celles du bilan.
  const w=periode.bilan.joursTravail.find(x=>x.date==='2026-10-28');
  const services=periode.bilan.services.filter(s=>periode.bilan.joursTravail.some(x=>x.services[s.id]));
  const cases=await page.locator('#journee-periode tr[data-pv-jour="2026-10-28"] td').allInnerTexts();
  assert.deepEqual(cases,[...services.map(s=>w.services[s.id]?String(w.services[s.id].personnes):'—'),String(w.total.personnes)]);
  const totalPeriode=await page.locator('#journee-periode tr.pv-cumul:not(.pv-moyenne)').last().locator('td[data-pv-total]').innerText();
  assert.equal(totalPeriode,periode.bilan.periode.total.personnes.toLocaleString('fr-FR'));
  // Une autre mesure : les heures sup.
  await page.locator('#periode-mesure').selectOption('heuresSup');await attendre(100);
  assert.equal(await page.locator('#journee-periode table.pv-table').getAttribute('data-mesure'),'heuresSup');

  // 8. Le détail d'un jour se déplie, par équipe et par compagnie, sans quitter la page.
  await page.locator('#journee-periode [data-pv=detail][data-date="2026-10-28"]').click();await attendre(100);
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'j-periode');
  assert.equal(await page.locator('#journee-periode tr.pv-detail').count(),1);
  assert.deepEqual((await page.locator('#journee-periode .pv-equipes tr[data-pv-equipe]').evaluateAll(l=>l.map(x=>x.dataset.pvEquipe))).sort(),Object.keys(w.equipes).sort());
  const cies=Object.entries(w.services).flatMap(([s,x])=>Object.keys(x.compagnies||{}).map(c=>s+'|'+c)).sort();
  assert.ok(cies.length>0);
  assert.deepEqual((await page.locator('#journee-periode .pv-compagnies tr[data-pv-cie]').evaluateAll(l=>l.map(x=>x.dataset.pvCie))).sort(),cies);
  assert.equal(await page.locator('#journee-periode [data-pv=detail][data-date="2026-10-28"]').getAttribute('aria-expanded'),'true');
  // La page tient dans l'écran : c'est la vue qui défile, ni en hauteur ni en largeur la page.
  assert.deepEqual(await page.evaluate(()=>[document.documentElement.scrollHeight-innerHeight,document.documentElement.scrollWidth-innerWidth]),[0,0]);
  assert.equal(await page.locator('#periode-bandeau [data-pv=voir]').isVisible(),false,'sur la page Période, pas de lien vers elle');
  await page.locator('#journee-periode [data-pv=detail][data-date="2026-10-28"]').click();await attendre(100);
  assert.equal(await page.locator('#journee-periode tr.pv-detail').count(),0);

  // 9. Un clic sur un jour ouvre sa journée de vols ; un jour de travail avant la période, la première.
  await page.locator('#journee-periode tr[data-pv-jour="2026-11-03"] td').first().click();await attendre(200);
  assert.deepEqual(await page.evaluate(()=>[Sim.jourVols,document.body.dataset.sous]),['2026-11-03','j-chiffres']);
  await verifier('2026-11-03',periode.journees[9].entree);
  await nav.aller(page,'j-periode');
  await page.locator('#journee-periode [data-pv=ouvrir][data-date="'+incomplets[0]+'"]').click();await attendre(200);
  assert.deepEqual(await page.evaluate(()=>[Sim.jourVols,document.body.dataset.sous]),['2026-10-25','j-chiffres']);

  // 10. Un réglage modifié : « à relancer », et la journée repart du sale de la veille saisi.
  await page.locator('#periode-jour').selectOption('2026-10-26');await attendre(200);
  await verifier('2026-10-26',entree);
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const a=Sim.ateliers.state.ateliers.find(x=>x.id==='pl1');a.debut=a.debut==='05:00'?'05:30':'05:00';},'essai'));await attendre(200);
  assert.equal(await etat(),'a-relancer');
  assert.match(await page.locator('#periode-bandeau .pj-etat').innerText(),/À relancer/);
  assert.equal(await page.evaluate(()=>Sim.periode.entreeDuJour('2026-10-26')),null);
  await verifier('2026-10-26',null,'à relancer : le sale de la veille saisi');
  assert.match(await page.locator('#periode-bandeau [data-pv=lancer]').innerText(),/Relancer la période/);
  // Annuler la modification : la même période redevient à jour.
  await page.evaluate(()=>Sim.ateliers.histoire(false));await attendre(200);
  assert.equal(await etat(),'a-relancer','une version de plus : on relance, même revenu au même réglage');
  await page.locator('#periode-bandeau [data-pv=lancer]').click();await finir();
  assert.deepEqual(JSON.parse(await page.evaluate(()=>JSON.stringify(Sim.periode.resultat.bilan))),json(periode.bilan),'relancée : la même période');
  // Le délai de chargement, puis le décalage (Horaires de vols).
  await nav.aller(page,'rg-simulation');
  await page.locator('#loadDelay').fill('50');await page.locator('#loadDelay').dispatchEvent('change');await attendre(200);
  assert.equal(await etat(),'a-relancer');
  await page.locator('#loadDelay').fill('45');await page.locator('#loadDelay').dispatchEvent('change');await attendre(200);
  assert.equal(await etat(),'a-jour','revenu au même délai : la période calculée vaut de nouveau');

  // 11. « Exporter les résultats » propose le classeur de la période ; la journée reste en JSON.
  await nav.aller(page,'j-chiffres');
  await page.locator('#btn-export').click();await attendre(100);
  assert.equal(await page.locator('#export-choix').isVisible(),true);
  assert.equal(await page.locator('#btn-export').getAttribute('aria-expanded'),'true');
  assert.deepEqual(await page.locator('#export-choix [data-export]').evaluateAll(l=>l.map(x=>x.dataset.export)),['periode','journee']);
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.export),'periode');
  await page.keyboard.press('Escape');await attendre(50);
  assert.deepEqual(await page.evaluate(()=>[document.getElementById('export-choix').hidden,document.activeElement.id]),[true,'btn-export']);
  await page.locator('#btn-export').click();await attendre(100);
  const xlsx=await telecharger(()=>page.locator('#export-choix [data-export=periode]').click());
  assert.equal(path.basename(xlsx),'ory-periode-2026-10-25-au-2026-11-13.xlsx');
  const classeurPage=await T.lireClasseur(fs.readFileSync(xlsx));
  assert.deepEqual(classeurPage.map(f=>f.nom),['Lisez-moi','Période','Équipes','Compagnies','Lots','Vols','Plonge','Jours']);
  // Le même classeur que l'outil, pour la sauvegarde de la page et les mêmes vols (seuls la sauvegarde nommée et l'instant du calcul diffèrent).
  const sv=fichier('unite-page.json',JSON.stringify((await journee()).sv)),sortie=path.join(dossier,'outil.xlsx');
  const r=spawnSync(process.execPath,[OUTIL,sv,fichier('vols-dates.csv',CSV),'--sans-detail','--xlsx',sortie],{encoding:'utf8',maxBuffer:1<<28});
  assert.equal(r.status,0,r.stderr);
  const variable=c=>c.map(f=>({nom:f.nom,lignes:f.lignes.filter(l=>!/^(Calculée le|Sauvegarde) /.test(String(l[0]||'')))}));
  assert.deepEqual(variable(classeurPage),variable(await T.lireClasseur(fs.readFileSync(sortie))),'l’export de la page = celui de l’outil');
  assert.ok(classeurPage[0].lignes.some(l=>/^Sauvegarde : l’unité enregistrée dans ce navigateur ; programme de vols : vols-dates\.csv\.$/.test(l[0])));
  // La journée affichée, en JSON, comme avant.
  await page.locator('#btn-export').click();await attendre(100);
  const jsonJour=await telecharger(()=>page.locator('#export-choix [data-export=journee]').click());
  assert.equal(path.basename(jsonJour),'newrest-orly-journee.json');
  assert.ok(JSON.parse(fs.readFileSync(jsonJour,'utf8')).journal.length>0);
  // Sur la page Période aussi.
  await nav.aller(page,'j-periode');
  assert.match(path.basename(await telecharger(()=>page.locator('#journee-periode [data-pv=exporter]').click())),/^ory-periode-.*\.xlsx$/);
  // Des vols modifiés (un autre programme importé) : à relancer.
  await importer('vols-dates-2.csv',CSV.replace(/,NORD,GROS,DEP,06:10,/g,',NORD,GROS,DEP,06:20,'));
  assert.equal(await etat(),'a-relancer');
  // À relancer : le classeur de la période attend le nouveau calcul.
  await nav.aller(page,'j-chiffres');await page.locator('#btn-export').click();await attendre(100);
  assert.equal(await page.locator('#export-choix [data-export=periode]').isDisabled(),true);
  assert.match(await page.locator('#export-choix [data-export=periode]').innerText(),/À relancer d’abord/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#journee-periode [data-pv=exporter]').count(),0);

  // 12. De nouveau sans date : le bandeau et la page s'en vont (on était sur la Période : la Synthèse s'ouvre).
  await nav.aller(page,'j-periode');
  await page.locator('#imp-vols').setInputFiles(fichier('vols-fictifs.csv',SANS_DATE));
  await page.waitForFunction(()=>document.getElementById('source-label').textContent==='vols-fictifs.csv');await attendre(200);
  assert.equal(await page.locator('#periode-bandeau').isHidden(),true);
  assert.ok(!(await pagesResultats()).includes('j-periode'));
  await verifier(null,null,'sans date : la journée d’aujourd’hui');
  // Sans programme daté, « Exporter les résultats » exporte la journée, comme avant.
  await nav.aller(page,'j-chiffres');
  assert.equal(path.basename(await telecharger(()=>page.locator('#btn-export').click())),'newrest-orly-journee.json');
  assert.equal(await page.locator('#export-choix').isVisible(),false);

  assert.deepEqual(errors,[]);
  console.log('periode-browser : ok — sans date rien de nouveau ; sélecteur ; calcul par étapes et Annuler ; le bilan du moteur ; la veille de la période ; à relancer ; la page Période ; l’export de la période = celui de l’outil');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})();

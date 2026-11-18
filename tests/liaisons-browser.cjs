/* Une donnée, partout la même (retour d'usage du 28/09) : ce qu'on change à
 * un endroit se voit à tous les autres — la fiche du service et celle de
 * l'équipe, le calcul, le chemin, « Qui prépare quoi », les classeurs Excel.
 *
 * Réécrit pour la version 1 à l'évolution 22 (b) : une chose se règle à un seul
 * endroit. Les temps par vol d'un service se règlent dans sa fiche, une équipe
 * dans la sienne ; les deux vues d'ensemble (« Horaires des équipes », « Temps
 * par vol ») et « Temps par vol par service » ont quitté l'écran, et avec
 * elles les liaisons qui allaient de l'une à l'autre. Restent celles-ci :
 * la fiche → le calcul, le tableau « Ses équipes » du service, le chemin,
 * « Qui prépare quoi », et le contenu des classeurs Excel (ce que les vues
 * d'ensemble montraient, et qui s'exporte toujours depuis « Fichiers »). */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[],echecs=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(300);
 const verifier=async(quoi,fn)=>{try{await fn();}catch(e){echecs.push(quoi+' — '+e.message.split('\n')[0]);}};
 const changer=async(sel,v)=>{const l=page.locator(sel).first();await l.fill(String(v));await l.dispatchEvent('change');await attendre();};
 const fiche=async id=>{await nav.reglagesEquipe(page,id);await attendre();return page.locator(`#mu-services .se-equipe`);};
 const lot=(id,cmd)=>page.evaluate(([id,cmd])=>{const r=Sim.ateliers.resultat;const l=r.lots.find(x=>x.atelier===id&&x.classes.includes(cmd));return l?[l.debut,l.fin]:null;},[id,cmd]);
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  await page.waitForTimeout(200);await nav.effectifSaisi(page);   // les personnes se saisissent ici (05/10)
  // Une commande, AF · Business, avec son chemin : Cuisine puis Montage.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
    const p={id:'ch',nom:'Chemin AF BC',noeuds:['cuisine','prepa'],liens:[{de:'cuisine',vers:'prepa'}],cases:true};
    st.parcours.push(p);st.parcoursClasse['AF/BC']=p.id;
    st.ateliers.push({id:'cu',nom:'Cuisine AF BC',service:'cuisine',type:'manuel',debut:'04:00',jour:0,personnes:2,pauses:[],lots:[['AF/BC']],regime:{actif:false}},
      {id:'mo',nom:'Montage AF BC',service:'prepa',type:'manuel',debut:'06:00',jour:0,personnes:4,pauses:[],lots:[['AF/BC']],regime:{actif:false}});},''));
  await page.evaluate(()=>Sim.reglages.changer(()=>{Sim.reglages.etat.bareme.cuisine={'*/BC':30};Sim.reglages.etat.bareme.prepa={'*/BC':40};},''));
  await attendre();
  const vols=await page.evaluate(()=>Sim.ateliers.classes.find(c=>c.id==='AF/BC').vols.length);

  const M='#mu-services';
  /** Le tableau « Ses équipes » d'un service : la ligne d'une équipe (son nom, son début, son jour, ses personnes, ce qu'elle prépare). */
  const ligne=async(service,id)=>{await nav.service(page,service);return page.locator(`${M} .se-equipes tr[data-se-equipe="${id}"]`).locator('th,td').evaluateAll(cs=>cs.map(c=>c.textContent.trim()));};
  /** Ce que le classeur « Temps par vol » écrit pour une commande dans un service : ses heures par vol, et l'équipe qui la prépare. */
  const classeurTemps=(classe,service)=>page.evaluate(([classe,service])=>{const l=OrlyEchanges.recapManMinutes(Sim.reglages.contexteRecap()).lignes.find(x=>x.classe.id===classe);
    const c=l&&l.cellules[service];return c?{source:c.source,parVol:c.parVol,equipe:c.equipe&&c.equipe.id,personnes:c.equipe&&c.equipe.personnes}:null;},[classe,service]);
  /** Les temps par vol d'un service : une section de sa fiche, repliée d'abord. */
  const temps=async service=>{await nav.service(page,service);await nav.section(page,'temps');await attendre();};

  // A. Les temps par vol du service (sa fiche) → le calcul, le classeur « Temps par vol », la fiche de l'équipe.
  await temps('cuisine');
  // Saisies et lues en heures (08/10), gardées en minutes : 1 h = 60 min.
  await changer(`${M} [data-rg-champ=heures][data-service=cuisine][data-cle="*/BC"]`,1);
  await verifier('A1 temps par vol → calcul',async()=>assert.equal(Math.round((await lot('cu','AF/BC'))[1]-240),Math.round(60*vols/2)));
  await verifier('A2 temps par vol → classeur « Temps par vol »',async()=>assert.deepEqual(await classeurTemps('AF/BC','cuisine').then(c=>[c.parVol,c.equipe]),[60,'cu']));
  let f=await fiche('cu');
  await verifier('A3 temps par vol → fiche de l’équipe (pour la journée, en heures)',async()=>assert.equal(await f.locator('[data-at-champ=heures][data-classe="AF/BC"]').getAttribute('placeholder'),String(Math.round(1*vols*100)/100).replace('.',',')));

  // B. Une valeur propre à la compagnie → le calcul, la fiche du service, la fiche de l'équipe.
  await page.evaluate(()=>Sim.reglages.changer(()=>{Sim.reglages.etat.bareme.cuisine['AF/BC']=90;},''));await attendre();
  await verifier('B1 valeur propre → classeur « Temps par vol »',async()=>assert.equal((await classeurTemps('AF/BC','cuisine')).parVol,90));
  await temps('cuisine');
  await verifier('B2 valeur propre → fiche du service',async()=>assert.match(await page.locator(`${M} [data-mu-section=temps]`).innerText(),/AF/));
  await verifier('B3 valeur propre → calcul',async()=>assert.equal(Math.round((await lot('cu','AF/BC'))[1]-240),Math.round(90*vols/2)));
  f=await fiche('cu');
  await verifier('B4 valeur propre → fiche de l’équipe (pour la journée, en heures)',async()=>assert.equal(await f.locator('[data-at-champ=heures][data-classe="AF/BC"]').getAttribute('placeholder'),String(Math.round(1.5*vols*100)/100).replace('.',',')));

  // C. Personnes : la fiche de l'équipe → le calcul, le tableau de son service, le classeur « Temps par vol ».
  f=await fiche('cu');await changer(`${M} [data-at=cu] [data-at-champ=personnes]`,3);
  await verifier('C1 personnes fiche → fiche',async()=>assert.equal(await (await fiche('cu')).locator('[data-at-champ=personnes]').inputValue(),'3'));
  await verifier('C2 personnes fiche → calcul',async()=>assert.equal(Math.round((await lot('cu','AF/BC'))[1]-240),Math.round(90*vols/3)));
  await verifier('C3 personnes fiche → tableau du service',async()=>assert.equal((await ligne('cuisine','cu'))[3],'3 pers.'));
  f=await fiche('cu');await changer(`${M} [data-at=cu] [data-at-champ=personnes]`,5);
  await verifier('C4 personnes fiche → classeur « Temps par vol »',async()=>assert.equal((await classeurTemps('AF/BC','cuisine')).personnes,5));

  // D. Heures propres à une équipe (sa fiche) → le classeur, le calcul : 0,75 h = 45 min pour la journée.
  f=await fiche('cu');await changer(`${M} [data-at=cu] [data-at-champ=heures][data-classe="AF/BC"]`,0.75);
  // 45 man-min pour la journée de l'équipe, ramenées à un vol dans le classeur, comme le calcul les lit.
  await verifier('D1 heures de l’équipe → classeur (par vol)',async()=>assert.deepEqual(await classeurTemps('AF/BC','cuisine').then(c=>[c.source,Math.round(c.parVol*1000)/1000]),['case',Math.round(45/vols*1000)/1000]));
  await verifier('D2 heures de l’équipe → calcul',async()=>assert.equal(Math.round((await lot('cu','AF/BC'))[1]-240),Math.round(45/5)));

  // E. Heure de départ : la fiche de l'équipe → le tableau de son service, le calcul, le chemin, « Qui prépare quoi », Excel Horaires.
  f=await fiche('mo');await changer(`${M} [data-at=mo] [data-at-champ=debut]`,'07:15');
  await verifier('E1 départ fiche → tableau du service',async()=>assert.equal((await ligne('prepa','mo'))[1],'07:15'));
  await verifier('E2 départ fiche → calcul',async()=>assert.ok((await lot('mo','AF/BC'))[0]>=7*60+15));
  await nav.aller(page,'at-chemins');await page.locator('[data-pc-action=cmd][data-classe="AF/BC"]').click();await attendre();
  await verifier('E3 départ fiche → chemin',async()=>assert.match(await page.locator('#at-parcours .pc-graphe [data-noeud=prepa]').textContent(),/07:15/));
  await nav.aller(page,'at-grille');
  await verifier('E4 départ fiche → Qui prépare quoi',async()=>assert.match(await page.locator('[data-qf=aller][data-classe="AF/BC"][data-service=prepa]').textContent(),/07:15/));
  await verifier('E5 départ fiche → Excel Horaires',async()=>assert.ok(await page.evaluate(()=>{const f=OrlyEchanges.horairesVersClasseur(Sim.ateliers.state,{services:Sim.ateliers.a.services()});return f[0].lignes.some(l=>l[0]==='Montage AF BC'&&l[2]==='07:15');})));
  f=await fiche('mo');await changer(`${M} [data-at=mo] [data-at-champ=debut]`,'06:45');
  await verifier('E6 départ fiche, encore → tableau du service',async()=>assert.equal((await ligne('prepa','mo'))[1],'06:45'));
  await verifier('E7 départ fiche → classeur « Équipes et horaires »',async()=>assert.ok(await page.evaluate(()=>JSON.stringify(OrlyEchanges.recapCasesVersClasseur(Sim.ateliers.state,{services:Sim.ateliers.a.services(),classes:Sim.ateliers.classes,resultat:Sim.ateliers.resultat})).includes('06:45'))));

  // F. Deux commandes préparées ensemble → le tableau du service, le classeur « Temps par vol ».
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id==='cu').lots=[['AF/BC','DL/BC']];},''));await attendre();
  await verifier('F1 ensemble → tableau du service',async()=>assert.match((await ligne('cuisine','cu'))[4],/AF BC, DL BC/));
  await verifier('F2 nouvelle commande de l’équipe → classeur « Temps par vol »',async()=>assert.equal((await classeurTemps('DL/BC','cuisine')).equipe,'cu'));

  // G. Un service renommé → la liste des services, le nom de son équipe.
  await page.evaluate(()=>Sim.editor.change(()=>{Sim.editor.state.zones.find(z=>z.id==='cuisine').nom='Cuisine chaude';},'x'));await attendre();
  await nav.service(page,'cuisine');
  await verifier('G1 renommé → liste des services',async()=>assert.match(await page.locator(`${M} .se-liste [data-mu-choisir=cuisine]`).innerText(),/Cuisine chaude/i));
  await verifier('G2 renommé → son équipe, dans le tableau',async()=>assert.equal((await ligne('cuisine','cu'))[0],'Cuisine chaude AF BC'));

  // H. Annuler : le tableau suit.
  f=await fiche('mo');await changer(`${M} [data-at=mo] [data-at-champ=personnes]`,9);
  await page.locator('#btn-annuler').click();await attendre();
  await verifier('H1 annuler un effectif → tableau du service',async()=>assert.equal((await ligne('prepa','mo'))[3],'4 pers.'));

  if(echecs.length){console.error('LIAISONS MANQUANTES :\n - '+echecs.join('\n - '));process.exit(1);}
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('liaisons-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

/* Une donnée, partout la même (retour d'usage du 28/09) : ce qu'on change à
 * un endroit se voit à tous les autres, dans les deux sens — barème, récap
 * des man-minutes, récap des cases, fiches des cases, chemins, « Qui prépare
 * quoi », planning, Excel. */
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
 const fiche=async id=>{await nav.aller(page,'at-equipes');await page.evaluate(id=>{Sim.ateliers.ouvert=id;Sim.ateliers.rendre();},id);await attendre();return page.locator(`#at-liste [data-at="${id}"]`);};
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

  // A. Le barème (Temps de travail) → récap man-minutes, récap des cases, calcul.
  await nav.aller(page,'rg-minutes');
  await page.evaluate(()=>{Sim.reglages.serviceOuvert='cuisine';Sim.reglages.rendre();});await attendre();
  await changer('#rg-bareme [data-service=cuisine][data-cle="*/BC"]',60);
  await verifier('A1 barème → calcul',async()=>assert.equal(Math.round((await lot('cu','AF/BC'))[1]-240),Math.round(60*vols/2)));
  await nav.aller(page,'rg-recap');await nav.deplier(page);
  await verifier('A2 barème → récap man-minutes',async()=>assert.equal(await page.locator('input[data-rg-champ=recap][data-service=cuisine][data-classe="AF/BC"]').inputValue(),'60'));
  await nav.aller(page,'at-recap');
  await verifier('A3 barème → récap des cases (heures)',async()=>assert.match(await page.locator('tr[data-at=cu] .rc-quand').innerText(),new RegExp('04:00–'+(await page.evaluate(t=>MoteurProduction.hhmm(t),(await lot('cu','AF/BC'))[1])))));

  // B. Le récap man-minutes → barème (Temps de travail), récap des cases, fiche.
  await nav.aller(page,'rg-recap');await nav.deplier(page);
  await changer('input[data-rg-champ=recap][data-service=cuisine][data-classe="AF/BC"]',90);
  await verifier('B1 récap man-min → barème',async()=>assert.equal(await page.evaluate(()=>Sim.reglages.etat.bareme.cuisine['AF/BC']),90));
  await nav.aller(page,'rg-minutes');
  await page.evaluate(()=>{Sim.reglages.serviceOuvert='cuisine';Sim.reglages.rendre();});await attendre();
  await verifier('B2 récap man-min → page Temps de travail',async()=>assert.match(await page.locator('#rg-bareme details[data-service=cuisine]').innerText(),/AF\/BC|AF/));
  await verifier('B3 récap man-min → calcul',async()=>assert.equal(Math.round((await lot('cu','AF/BC'))[1]-240),Math.round(90*vols/2)));
  let f=await fiche('cu');
  await verifier('B4 récap man-min → fiche (barème, pour la journée)',async()=>assert.equal(await f.locator('[data-at-champ=minutes][data-classe="AF/BC"]').getAttribute('placeholder'),String(90*vols)));

  // C. Personnes : fiche → calcul, récap des cases, récap man-min (en lecture : on ne
  //    les change plus dans le récap, 07/10 — elles se calculent, ou se saisissent dans la fiche).
  f=await fiche('cu');await changer(`#at-liste [data-at=cu] [data-at-champ=personnes]`,3);
  await verifier('C1 personnes fiche → fiche',async()=>assert.equal(await (await fiche('cu')).locator('[data-at-champ=personnes]').inputValue(),'3'));
  await verifier('C2 personnes fiche → calcul',async()=>assert.equal(Math.round((await lot('cu','AF/BC'))[1]-240),Math.round(90*vols/3)));
  await nav.aller(page,'at-recap');
  await verifier('C3 personnes fiche → récap des cases',async()=>assert.match(await page.locator('tr[data-at=cu] th').innerText(),/3 pers\./));
  f=await fiche('cu');await changer(`#at-liste [data-at=cu] [data-at-champ=personnes]`,5);
  await nav.aller(page,'rg-recap');await nav.deplier(page);
  await verifier('C4 personnes fiche → récap man-min',async()=>assert.equal(await page.locator('[data-rg-equipe=cu]').first().innerText(),'5'));
  await verifier('C5 récap man-min : l’effectif se lit, ne se saisit pas',async()=>assert.equal(await page.locator('#rg-recap input[data-rg-champ=recap-pers]').count(),0));

  // D. Man-minutes propres à une case (fiche) → récap man-min.
  f=await fiche('cu');await changer(`#at-liste [data-at=cu] [data-at-champ=minutes][data-classe="AF/BC"]`,45);
  await nav.aller(page,'rg-recap');await nav.deplier(page);
  // 45 man-min pour la journée de la case, ramenées à un vol dans le récap, comme le calcul les lit.
  await verifier('D1 man-min de la case → récap man-min (par vol)',async()=>assert.equal(await page.locator('tr[data-classe="AF/BC"] td.rgr.case').first().innerText(),String(Math.round(45/vols*10)/10).replace('.',',')));
  await verifier('D2 man-min de la case → calcul',async()=>assert.equal(Math.round((await lot('cu','AF/BC'))[1]-240),Math.round(45/5)));

  // E. Heure de départ : récap des cases → fiche, chemin, « Qui prépare quoi », Excel Horaires ; et fiche → récap des cases.
  await nav.aller(page,'at-recap');
  await changer('tr[data-at=mo] input[data-at-champ=debut]','07:15');
  f=await fiche('mo');
  await verifier('E1 départ récap → fiche',async()=>assert.equal(await f.locator('[data-at-champ=debut]').inputValue(),'07:15'));
  await verifier('E2 départ récap → calcul',async()=>assert.ok((await lot('mo','AF/BC'))[0]>=7*60+15));
  await nav.aller(page,'at-chemins');await page.locator('[data-pc-action=cmd][data-classe="AF/BC"]').click();await attendre();
  await verifier('E3 départ récap → chemin',async()=>assert.match(await page.locator('#at-parcours .pc-graphe [data-noeud=prepa]').textContent(),/07:15/));
  await nav.aller(page,'at-grille');
  await verifier('E4 départ récap → Qui prépare quoi',async()=>assert.match(await page.locator('[data-qf=aller][data-classe="AF/BC"][data-service=prepa]').textContent(),/07:15/));
  await verifier('E5 départ récap → Excel Horaires',async()=>assert.ok(await page.evaluate(()=>{const f=OrlyEchanges.horairesVersClasseur(Sim.ateliers.state,{services:Sim.ateliers.a.services()});return f[0].lignes.some(l=>l[0]==='Montage AF BC'&&l[2]==='07:15');})));
  f=await fiche('mo');await changer(`#at-liste [data-at=mo] [data-at-champ=debut]`,'06:45');
  await nav.aller(page,'at-recap');
  await verifier('E6 départ fiche → récap des cases',async()=>assert.equal(await page.locator('tr[data-at=mo] input[data-at-champ=debut]').inputValue(),'06:45'));
  await verifier('E7 départ fiche → heures du récap des cases',async()=>assert.match(await page.locator('tr[data-at=mo] .rc-quand').innerText(),/06:45|0[7-9]:\d\d/));

  // F. Ordre et « ensemble » changés dans la fiche → récap des cases.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id==='cu').lots=[['AF/BC','DL/BC']];},''));await attendre();
  await nav.aller(page,'at-recap');
  await verifier('F1 ensemble → récap des cases',async()=>assert.equal(await page.locator('tr[data-at=cu] .rc-seq li.ens .rc-cmd').count(),2));
  await nav.aller(page,'rg-recap');await nav.deplier(page);
  await verifier('F2 nouvelle commande de la case → récap man-min (effectif)',async()=>assert.equal(await page.locator('tr[data-classe="DL/BC"] [data-rg-equipe=cu]').count(),1));

  // G. Un service renommé → récap man-min, récap des cases.
  await page.evaluate(()=>Sim.editor.change(()=>{Sim.editor.state.zones.find(z=>z.id==='cuisine').nom='Cuisine chaude';},'x'));await attendre();
  await verifier('G1 renommé → récap man-min',async()=>assert.match(await page.locator('.rg-recap-t1').innerText(),/Cuisine chaude/));
  await nav.aller(page,'at-recap');
  await verifier('G2 renommé → récap des cases',async()=>{const t=await page.locator('.rc-table').innerText();assert.match(t,/Cuisine chaude/);assert.match(t,/Cuisine chaude AF BC/);});

  // H. Annuler : les récaps suivent.
  f=await fiche('mo');await changer(`#at-liste [data-at=mo] [data-at-champ=personnes]`,9);
  await page.locator('#at-undo').click();await attendre();
  await nav.aller(page,'at-recap');
  await verifier('H1 annuler un effectif → récap des cases',async()=>assert.match(await page.locator('tr[data-at=mo] th').innerText(),/4 pers\./));

  if(echecs.length){console.error('LIAISONS MANQUANTES :\n - '+echecs.join('\n - '));process.exit(1);}
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('liaisons-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

/* Banc d'essai, évolution 13 (c) — l'export Winrest dans la page (Vols ›
 * Programme des vols), sur un export fictif (compagnies, vols et livraisons
 * inventés, une colonne de prix) : l'import à côté de celui des vols ; le
 * rapport sous l'import (les totaux, puis les listes repliées) ; un Flight No
 * et un Guest type piégés qui restent du texte ; le classeur du rapport,
 * compressé, sans prix ; les règles d'import (une exclusion, un code
 * compagnie, un vol fictif, un refus sous le champ) ; le réimport, avec la
 * question, et le programme daté chargé ; les refus (une colonne manquante,
 * un fichier de plus de 30 Mo) ; 50 000 lignes en moins de 10 s ; les
 * couleurs du design system, en clair et en sombre. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const nav=require('./nav.cjs');
const T=require('../tableur.js'),Z=require('../classeur-compresse.js');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const K='ory-import-winrest-v1',XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const TETE=['Date','Delivery No','Flight No','ICAO','ETD','Statut','Guest type','Guest qty','Article','Unit price','Amount'];
const PIEGE='<img src=x onerror="window.__piege=1">';
/** Une ligne de prestation : la date en cellule Excel, comme dans un export ; un prix reconnaissable. */
const L=(jour,liv,vol,icao,etd,statut,type,qte,article='Plateau')=>[T.celluleDate(jour),liv,vol,icao,etd,statut,type,qte,article,987.65,4321.09];
const LIGNES=[TETE,
  L('2026-03-02','L1','NR 101','NRD','07:30','Delivered','ECONOMY',120),L('2026-03-02','L1','NR 101','NRD','07:30','Delivered','ECONOMY',120,'Pain'),
  L('2026-03-02','L1','NR 101','NRD','07:30','Delivered','BUSINESS',12),
  L('2026-03-02','L2','NR 101','NRD','18:00','Delivered','ECONOMY',90),
  L('2026-03-02','L3','SU 200','SDX','09:00','Delivered','ECONOMY',80),L('2026-03-02','L3','SU 200','SDX','09:00','Delivered','CREW',6),
  L('2026-03-02','L4','NRD RESERVE','NRD','05:00','Delivered','ECONOMY',4),
  L('2026-03-02','L5','NR 105','NRD','11:00','Cancelled','ECONOMY',50),
  L('2026-03-02','L6',PIEGE,'ZZZ','12:00','Delivered','<b>BÉBÉ</b>',3),
  L('2026-03-02','P1','PROD JOUR','PRD','01:00','Cancelled','ECONOMY',30),
  L('2026-03-03','L7','SU 200','SDX','09:00','Delivered','ECONOMY',70),
  L('2026-03-03','L8','NR 101','NRD','07:30','Delivered','ECONOMY',100)];
const classeur=async lignes=>Buffer.from(await Z.compresser(T.ecrireClasseur([{nom:'Summary',lignes:[['Export fictif']]},{nom:'Flights',lignes}])));
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const garde=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)||'null'),K);
 const vols=()=>page.evaluate(()=>Sim.dataCourante.map(v=>[v.date,v.id,v.cie,v.yc,v.bc,v.crew]));
 const importer=async(nom,octets,type=XLSX)=>{
  await page.locator('#imp-winrest').setInputFiles({name:nom,mimeType:type,buffer:octets});
 };
 const rapport=()=>page.locator('#winrest-rapport').textContent();
 const changer=async(sel,valeur)=>{await page.fill(sel,valeur);await page.dispatchEvent(sel,'change');await page.waitForTimeout(150);};
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await page.waitForTimeout(200);
  await nav.aller(page,'v-programme');

  // 1. L'import, à côté de celui des vols.
  const champ=page.locator('#imp-winrest');
  assert.equal(await champ.getAttribute('accept'),'.xlsx,.csv');
  assert.match(await page.evaluate(()=>document.getElementById('imp-vols').closest('.panneau').textContent),/Export Winrest \(Flights\)/);
  assert.equal(await page.evaluate(()=>!!document.getElementById('imp-vols').closest('.panneau').querySelector('#imp-winrest')),true,'dans le même panneau que l’import des vols');
  assert.equal(await page.locator('#winrest-rapport').isHidden(),true,'pas de rapport avant un import');

  // 2. Un export fictif : le programme daté chargé, le rapport sous l'import (vols de démonstration : pas de question).
  await importer('export-fictif.xlsx',await classeur(LIGNES));
  await page.waitForSelector('#winrest-rapport:not([hidden])');
  assert.deepEqual(await vols(),[['2026-03-02','NR 101','NRD',124,12,0],['2026-03-02','SU 200','SDX',80,0,6],['2026-03-02','NR 101-2','NRD',90,0,0],
    ['2026-03-03','NR 101','NRD',100,0,0],['2026-03-03','SU 200','SDX',70,0,0]]);
  assert.match(await page.locator('#import-report').textContent(),/5 lignes importées[\s\S]*02\/03\/2026|5 lignes importées/);
  const r1=await rapport();
  assert.match(r1,/export-fictif\.xlsx/);
  assert.match(r1,/Période couverte\s*du 02\/03\/2026 au 03\/03\/2026 \(2 jours\)/);
  assert.match(r1,/Lignes lues\s*12/);assert.match(r1,/Livraisons\s*9/);
  assert.match(r1,/Vols gardés \(acceptés\)\s*5/);assert.match(r1,/Livraisons écartées \(rejetées\)\s*3/);
  assert.match(r1,/statut « Cancelled »\s*2/);assert.match(r1,/sans repas\s*1/);
  // Les listes, repliées ; le texte du fichier reste du texte.
  assert.equal(await page.locator('#winrest-rapport details.wr-bloc').count(),7);
  // Ses tableaux ont leur classe : ceux des services (.svc-table), que la page et ses tests parcourent, ne changent pas.
  assert.equal(await page.locator('#winrest-rapport .svc-table, #winrest-regles .svc-table').count(),0);
  assert.equal(await page.locator('#winrest-rapport details.wr-bloc[open]').count(),0,'les listes sont repliées');
  assert.equal(await page.locator('#winrest-rapport img, #winrest-rapport b').count(),0);
  assert.ok(r1.includes(PIEGE)&&r1.includes('<B>BÉBÉ</B>'),'le Flight No et le Guest type piégés se lisent tels quels');
  assert.equal(await page.evaluate(()=>window.__piege),undefined);
  assert.ok(!/987|4321|price|amount|prix|montant/i.test(r1),'aucun prix');
  await page.locator('#winrest-rapport [data-wr-liste-rapport=reserves] > summary').click();
  assert.match(await page.locator('#winrest-rapport [data-wr-liste-rapport=reserves]').textContent(),/NRD RESERVE\s*NR 101\s*YC 4/);

  // 3. Le classeur du rapport : compressé comme ceux de la correction 16 (c), relu, sans prix.
  const dl=page.waitForEvent('download');await page.locator('#winrest-rapport [data-wr-action=rapport-classeur]').click();
  const telecharge=await dl,octets=new Uint8Array(fs.readFileSync(await telecharge.path()));
  assert.match(telecharge.suggestedFilename(),/^ory-import-winrest-2026-03-02-au-2026-03-03\.xlsx$/);
  assert.ok(Z.entrees(octets).some(e=>e.methode===8),'compressé (deflate)');
  const feuilles=await T.lireClasseur(octets);
  assert.deepEqual(feuilles.map(f=>f.nom),['Lisez-moi','Par jour','Écartées','À vérifier','Types ignorés','Réserves fondues','vol_id suffixés','Vols fictifs']);
  assert.equal(feuilles.find(f=>f.nom==='Écartées').lignes.length,4);
  assert.ok(!/987|4321/.test(JSON.stringify(feuilles)),'aucun prix dans le classeur');

  // 4. Les règles d'import : repliées ; une exclusion, un code compagnie, un vol fictif ; un refus sous le champ.
  const regles=page.locator('#winrest-regles');
  assert.equal(await regles.evaluate(d=>d.open),false,'la section est repliée');
  assert.match(await regles.locator('summary').textContent(),/Règles d’import Winrest/);
  await regles.locator('summary').click();
  await changer('#winrest-regles [data-wr-liste=icaoExclus]','SDX');
  assert.deepEqual((await garde()).regles.icaoExclus,['SDX'],'enregistrée');
  await changer('#winrest-regles [data-wr-compagnies]','NRD = NORD');
  assert.deepEqual((await garde()).regles.compagnies,{NRD:'NORD'});
  // Un refus : sous le champ, et le champ reprend la valeur gardée ; rien n'est écrit.
  const avant=await garde();
  await changer('#winrest-regles [data-wr-mot]','');
  assert.match(await page.locator('#winrest-regles .champ-erreur').first().textContent(),/Mot des réserves/);
  assert.equal(await page.inputValue('#winrest-regles [data-wr-mot]'),'RESERVE');
  assert.deepEqual(await garde(),avant);
  await changer('#winrest-regles [data-wr-compagnies]','NRD NORD');
  assert.match(await page.locator('#winrest-regles .champ-erreur').first().textContent(),/ligne 1 : « NRD NORD »/);
  assert.equal(await page.inputValue('#winrest-regles [data-wr-compagnies]'),'NRD = NORD');
  // Un vol fictif, ajouté par la ligne vide du tableau.
  const nouveau=s=>'#winrest-regles [data-wr-fictif-nouveau] [data-wr-nouveau-champ='+s+']';
  await page.fill(nouveau('flightNo'),'PROD JOUR');await page.fill(nouveau('compagnie'),'PROD');await page.fill(nouveau('volId'),'PROD1');
  await page.fill(nouveau('heure'),'10:00');await page.fill(nouveau('types'),'ECONOMY');
  await page.locator('#winrest-regles [data-wr-fictif-nouveau] [data-wr-action=fictif-ajouter]').click();await page.waitForTimeout(150);
  assert.deepEqual((await garde()).regles.fictifs,[{flightNo:'PROD JOUR',compagnie:'PROD',volId:'PROD1',heure:'10:00',types:['ECONOMY'],classe:'YC'}]);
  assert.equal(await page.locator('#winrest-regles [data-wr-fictif]').count(),1);
  // Un vol fictif incomplet : refusé sous son champ.
  await page.fill(nouveau('flightNo'),'PROD NUIT');
  await page.locator('#winrest-regles [data-wr-fictif-nouveau] [data-wr-action=fictif-ajouter]').click();await page.waitForTimeout(150);
  assert.match(await page.locator('#winrest-regles [data-wr-fictif-nouveau] .champ-erreur').first().textContent(),/compagnie manque/);
  assert.equal((await garde()).regles.fictifs.length,1);
  // Un Guest type ajouté à la table, puis retiré.
  await page.fill('#winrest-regles [data-wr-type-nouveau]','bébé');await page.selectOption('#winrest-regles [data-wr-type-nouvelle-classe]','ignoré');
  await page.locator('#winrest-regles .wr-nouveau [data-wr-action=type-ajouter]').click();await page.waitForTimeout(150);
  assert.equal((await garde()).regles.types['BÉBÉ'],'ignoré');
  await page.locator('#winrest-regles [data-wr-type="BÉBÉ"] [data-wr-action=type-retirer]').click();await page.waitForTimeout(150);
  assert.equal((await garde()).regles.types['BÉBÉ'],undefined);
  // Un Guest type piégé (guillemets, chevrons) : du texte dans la table, et son bouton le retire.
  const pieges='BÉBÉ "X" <I>';
  await page.fill('#winrest-regles [data-wr-type-nouveau]','bébé "x" <i>');
  await page.locator('#winrest-regles .wr-nouveau [data-wr-action=type-ajouter]').click();await page.waitForTimeout(150);
  assert.equal((await garde()).regles.types[pieges],'YC');
  assert.equal(await page.locator('#winrest-regles i').count(),0);
  assert.equal(await page.evaluate(t=>[...document.querySelectorAll('#winrest-regles [data-wr-type]')].some(tr=>tr.dataset.wrType===t),pieges),true);
  await page.locator('#winrest-regles [data-wr-type] [data-wr-action=type-retirer][aria-label="Retirer BÉBÉ \\"X\\" <I>"]').click();await page.waitForTimeout(150);
  assert.equal((await garde()).regles.types[pieges],undefined);
  // Deux vols fictifs : un refus sur la deuxième ligne se lit sous son champ, et le champ reprend la valeur gardée.
  await page.fill(nouveau('flightNo'),'PROD NUIT');await page.fill(nouveau('compagnie'),'PROD');await page.fill(nouveau('volId'),'PROD2');
  await page.fill(nouveau('heure'),'22:00');await page.fill(nouveau('types'),'CREW');
  await page.locator('#winrest-regles [data-wr-fictif-nouveau] [data-wr-action=fictif-ajouter]').click();await page.waitForTimeout(150);
  assert.equal((await garde()).regles.fictifs.length,2);
  await changer('#winrest-regles [data-wr-fictif="1"] [data-wr-fictif-champ=types]','');
  assert.match(await page.locator('#winrest-regles [data-wr-fictif="1"] .champ-erreur').textContent(),/Vol fictif 2 : au moins un Guest type/);
  assert.equal(await page.locator('#winrest-regles [data-wr-fictif="0"] .champ-erreur').count(),0);
  assert.equal(await page.inputValue('#winrest-regles [data-wr-fictif="1"] [data-wr-fictif-champ=types]'),'CREW');
  // Une virgule dans la compagnie : le refus sous la compagnie, pas sous le vol_id.
  await changer('#winrest-regles [data-wr-fictif="1"] [data-wr-fictif-champ=compagnie]','PROD,NUIT');
  assert.match(await page.locator('#winrest-regles [data-wr-fictif="1"] .champ-erreur').textContent(),/la compagnie s’écrit sans virgule/);
  assert.equal(await page.evaluate(()=>document.querySelector('#winrest-regles [data-wr-fictif="1"] [data-wr-fictif-champ=compagnie]').getAttribute('aria-invalid')),'true');
  await page.locator('#winrest-regles [data-wr-fictif="1"] [data-wr-action=fictif-retirer]').click();await page.waitForTimeout(150);
  assert.equal((await garde()).regles.fictifs.length,1);

  // 5. Le réimport : la même question qu'avant de remplacer des vols importés ; le programme daté chargé, avec les règles.
  await importer('export-fictif.xlsx',await classeur(LIGNES));
  assert.match(await page.locator('dialog.question[open] h2').textContent({timeout:5000}),/Remplacer le programme de vols/);
  await nav.repondre(page);
  await page.waitForFunction(()=>Sim.dataCourante.some(v=>v.id==='PROD1'));
  assert.deepEqual(await vols(),[['2026-03-02','NR 101','NORD',124,12,0],['2026-03-02','PROD1','PROD',30,0,0],['2026-03-02','NR 101-2','NORD',90,0,0],
    ['2026-03-03','NR 101','NORD',100,0,0]],'le 03, sans ligne de production : le vol fictif à 0 reste au rapport, hors du programme');
  assert.match(await rapport(),/à 0, hors du programme\s*1/);
  assert.deepEqual(await page.evaluate(()=>{const p=OrlyPeriode.decrire(Sim.dataCourante);return [p.debut,p.fin];}),['2026-03-02','2026-03-03']);
  assert.match(await rapport(),/ICAO exclu\s*2/);
  // « Non » à la question : rien ne change.
  const garde1=await vols();
  await importer('autre.xlsx',await classeur(LIGNES.slice(0,4)));
  await page.locator('dialog.question[open]').waitFor();await nav.repondre(page,false);await page.waitForTimeout(200);
  assert.deepEqual(await vols(),garde1);
  assert.match(await page.locator('#import-report').textContent(),/Import annulé : le programme de vols n’a pas changé/);

  // 6. Les refus : une colonne manquante, un fichier de plus de 30 Mo ; rien n'est remplacé.
  await importer('sans-etd.csv',Buffer.from('Date;Delivery No;Flight No;ICAO;Statut;Guest type;Guest qty\n02/03/2026;L1;NR 1;NRD;Delivered;ECONOMY;3\n'),'text/csv');
  await page.waitForFunction(()=>/colonne « ETD » absente/.test(document.getElementById('import-report').textContent));
  assert.deepEqual(await vols(),garde1);
  await importer('gros.csv',Buffer.alloc(31*1024*1024,32),'text/csv');
  await page.waitForFunction(()=>/30 Mo maximum/.test(document.getElementById('import-report').textContent));
  assert.deepEqual(await vols(),garde1);

  // 7. 50 000 lignes (30 jours, 60 vols, 28 prestations) : lues et converties en moins de 10 s.
  await page.evaluate(k=>localStorage.removeItem(k),K);
  const gros=[TETE];
  for(let j=1;j<=30;j++)for(let v=0;v<60;v++)for(let k=0;k<28;k++)
    gros.push(L('2026-03-'+String(j).padStart(2,'0'),'D'+j+'-'+v,'NR '+(100+v),'NRD',String(5+(v%18)).padStart(2,'0')+':'+String((v*7)%60).padStart(2,'0'),'Delivered',['ECONOMY','BUSINESS','CREW','ECO SPML'][k%4],10+(v%5),'Article '+k));
  const t0=Date.now();
  await importer('export-50000.xlsx',await classeur(gros));
  await page.locator('dialog.question[open]').waitFor();
  const lu=Date.now()-t0;await nav.repondre(page);
  await page.waitForFunction(()=>Sim.dataCourante.length===1800,{},{timeout:20000});
  const ms=Date.now()-t0;
  assert.ok(lu<10000,'lu et converti en '+lu+' ms');
  assert.ok(ms<15000,'chargé en '+ms+' ms');
  assert.match(await rapport(),/Lignes lues\s*50\s400/);

  // 8. Les couleurs du design system, en clair et en sombre.
  const couleurs=()=>page.evaluate(()=>{const cs=getComputedStyle(document.documentElement),c=v=>{const d=document.createElement('i');d.style.color=cs.getPropertyValue(v);document.body.append(d);const x=getComputedStyle(d).color;d.remove();return x;};
    return {dd:getComputedStyle(document.querySelector('#winrest-rapport .wr-totaux dd')).color,texte1:c('--ds-texte-1'),
      resume:getComputedStyle(document.querySelector('#winrest-regles > summary')).color,texte2:c('--ds-texte-2')};});
  const clair=await couleurs();
  assert.deepEqual([clair.dd,clair.resume],[clair.texte1,clair.texte2]);
  await page.evaluate(()=>{document.documentElement.dataset.theme='sombre';});await page.waitForTimeout(100);
  const sombre=await couleurs();
  assert.notEqual(sombre.texte1,clair.texte1);
  assert.deepEqual([sombre.dd,sombre.resume],[sombre.texte1,sombre.texte2]);

  // 9. Des règles gardées illisibles (une version inconnue) : l'alerte dans la section, et l'import refusé sans rien remplacer.
  await page.evaluate(()=>{document.documentElement.dataset.theme='';});
  await page.evaluate(k=>localStorage.setItem(k,JSON.stringify({schema:'ory-import-winrest',version:9,regles:{}})),K);
  await page.reload();await page.waitForTimeout(300);await nav.aller(page,'v-programme');
  await page.locator('#winrest-regles > summary').click();
  assert.match(await page.locator('#winrest-regles .wr-alerte').textContent(),/version 9 inconnue/);
  const avantIllisible=await vols();
  await importer('export-fictif.xlsx',await classeur(LIGNES));
  await page.waitForFunction(()=>/règles d’import Winrest gardées sont illisibles/.test(document.getElementById('import-report').textContent));
  assert.deepEqual(await vols(),avantIllisible);
  // Une modification les remplace par des règles valides, et l'alerte s'en va.
  await changer('#winrest-regles [data-wr-mot]','SPARE');
  assert.equal((await garde()).version,1);
  assert.equal(await page.locator('#winrest-regles .wr-alerte').count(),0);

  assert.deepEqual(errors,[]);
  console.log('Import Winrest browser passed: import next to the flights import, report (totals, collapsed lists, escaped text), compressed report workbook, rules (exclusion, airline code, fictive flight, refusals), reimport with question, refusals, 50 000 lines, DS colors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

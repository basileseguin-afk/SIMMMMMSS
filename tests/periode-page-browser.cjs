/* Évolution 15 (d) — la page Période (v1), sur l'unité fictive de la référence
 * de non-régression et deux programmes datés fictifs :
 *   — la colonne « Unité » : le total des services, chaque jour, celui du module ;
 *   — la courbe au-dessus du tableau : un point par jour, la valeur de la
 *     colonne Unité ; la bulle (souris, flèches) ; le réel quand il est importé,
 *     pour une mesure en personnes ;
 *   — la première colonne reste quand le tableau défile sur le côté, et le
 *     défilement se voit (l'ombre, le fondu, la phrase) ;
 *   — les personnes en moyenne par jour seulement, les heures en total et en
 *     moyenne ; un seul bloc quand la période tient dans un mois ;
 *   — les jours complets comptés d'abord, l'incomplet expliqué ;
 *   — aucune durée en minutes au-delà de 60, pas d'heures décimales ;
 *   — la correspondance propose 7,5 h / 7 h quand rien n'est réglé ; un réglage
 *     enregistré ne change pas.
 * Données fictives ; aucune capture d'écran ici (voir l'évolution 15 e). */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const PE=require('../moteur/periode.js');
const REF=require('./non-regression.attendu.json');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

const S=REF.scenarios.find(s=>s.nom==='unite-vol');
const hh=t=>(t==null?'':String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0'));
const LIGNE=v=>[v.id,v.cie,v.avion,v.sens,v.sens==='DEP'?hh(v.std):'',v.sens==='RET'?hh(v.sta):'',v.bc,v.pc,v.yc,v.crew,v.spml].join(',');
const TETE='date,vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC,nb_CREW,nb_SPML';
/** Un programme daté fictif : les vols de l'unité fictive chaque jour, un départ de moins un jour sur trois. */
const programme=(debut,fin)=>TETE+'\n'+PE.joursEntre(debut,fin).flatMap((d,i)=>S.args.vols.filter(v=>!(i%3===1&&v.id==='NO101')).map(v=>d+','+LIGNE(v))).join('\n')+'\n';
const tropDeMinutes=t=>[...String(t).matchAll(/(\d[\d   ]*) ?min\b/g)].map(m=>+m[1].replace(/\D/g,'')).filter(v=>v>=60);

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=250)=>page.waitForTimeout(ms);
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-periode-page15-'));
 const fichier=(nom,texte)=>{const f=path.join(dossier,nom);fs.writeFileSync(f,texte);return f;};
 const importer=async(nom,texte)=>{await nav.aller(page,'v-programme');await page.locator('#imp-vols').setInputFiles(fichier(nom,texte));
   await page.waitForFunction(n=>document.getElementById('source-label').textContent===n,nom);await attendre(150);};
 const simuler=async()=>{await nav.aller(page,'j-periode');await page.locator('#journee-periode [data-pv=lancer]').click();
   await page.waitForFunction(()=>Sim.periode.etat()==='a-jour',null,{timeout:120000});await attendre(300);};
 const mesure=async id=>{await page.locator('#periode-mesure').selectOption(id);await attendre(150);};
 const cumuls=()=>page.locator('#journee-periode tr.pv-cumul th').allInnerTexts();
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(500);
  // La correspondance, rien de réglé : 7,5 h par ETP titulaire, 7 h par ETP intérimaire ; rien n'est enregistré.
  assert.deepEqual(await page.evaluate(()=>Sim.calage.correspondance.bases.defaut),{titulaires:7.5,interim:7});
  assert.equal(await page.evaluate(()=>localStorage.getItem('ory-calage-v1')),null,'une proposition ne s’enregistre pas');
  await nav.aller(page,'u-sauvegarde');
  await page.locator('#sauvegarde-import').setInputFiles(fichier('unite-fictive.json',JSON.stringify(S.sauvegarde)));
  const recharge=page.waitForEvent('load');await nav.repondre(page);await recharge;await page.waitForLoadState('load');await attendre(600);
  await importer('vols-deux-mois.csv',programme('2026-10-25','2026-11-13'));
  await simuler();

  // 1. Les jours complets d'abord ; l'incomplet expliqué une seule fois, en une phrase, sous la ligne d'état (correction 17 d).
  const b=await page.evaluate(()=>JSON.parse(JSON.stringify(Sim.periode.resultat.bilan)));
  const complets=b.joursTravail.filter(w=>w.complet).length,incomplets=b.joursTravail.length-complets;
  assert.ok(complets>1&&incomplets>1);
  assert.match(await page.locator('#journee-periode .pv-etat').innerText(),new RegExp(complets+' jours complets, '+incomplets+' incomplets\\.$'));
  assert.match(await page.locator('#journee-periode .pv-explique').innerText(),/^Un jour incomplet manque des vols d’un jour voisin, hors de la période : il est montré, mais sort des totaux et des moyennes\.$/);
  // Sur la page Période, la bande du haut ne redit pas « Période simulée : … » (correction 18 c) : sa carte la donne, une fois.
  assert.doesNotMatch(await page.locator('#periode-bandeau').innerText(),/Période simulée|jours complets/);

  // 2. La colonne « Unité » : le total des services, chaque jour, celui du module, pour chaque mesure.
  assert.equal(await page.locator('#journee-periode .pv-table thead th').nth(1).textContent(),'Unité','la première colonne de chiffres (correction 17 d)');
  for(const id of ['personnes','charge','heuresSup','hommeMinutes','picAuTravail','occupation']){
   await mesure(id);
   const r=await page.evaluate(id=>{
    const b=Sim.periode.resultat.bilan,m=OrlyPeriodeVue.MESURES.find(x=>x.id===id);
    const lu=[...document.querySelectorAll('#journee-periode tr[data-pv-jour]')].map(tr=>tr.querySelector('td[data-pv-total]').innerText);
    const attendu=b.joursTravail.map(w=>{const v=OrlyPeriodeVue.valeurUnite(m,[w]);return v==null?'—':m.ecrire(v);});
    // Une mesure qui s'additionne : la somme des services, à la main.
    const somme=m.jour?null:b.joursTravail.map(w=>Object.values(w.services).reduce((n,s)=>n+(s[m.id]||0),0)-OrlyPeriodeVue.valeurUnite(m,[w]));
    return {lu,attendu,somme};
   },id);
   assert.deepEqual(r.lu,r.attendu,id+' : la colonne Unité');
   if(r.somme)assert.ok(r.somme.every(d=>Math.abs(d)<1e-9),id+' : la somme des services');
  }

  // 3. La courbe : un point par jour de travail, la valeur de la colonne Unité ; la bulle à la souris et aux flèches.
  await mesure('personnes');
  const courbe=page.locator('#journee-periode .pv-trace svg');
  assert.equal(await courbe.count(),1);
  assert.equal(await page.locator('#journee-periode .pvc-point:not(.pvc-incomplet)').count(),complets);
  assert.equal(await page.locator('#journee-periode .pvc-point.pvc-incomplet').count(),incomplets);
  assert.match(await courbe.getAttribute('aria-label'),/^Personnes de l’unité, jour par jour/);
  assert.equal(await page.locator('#journee-periode .pvc-reel').count(),0,'sans réel, pas de trait du réel');
  const boite=await courbe.boundingBox();
  await page.mouse.move(boite.x+boite.width-30,boite.y+boite.height/2);await attendre(100);
  const derniere=b.joursTravail[b.joursTravail.length-1].date;
  assert.match(await page.locator('#journee-periode .pv-bulle').innerText(),new RegExp(derniere.slice(8,10)+'/'+derniere.slice(5,7)+' : Unité \\d+'));
  await page.locator('#pv-trace').focus();await page.keyboard.press('ArrowLeft');await attendre(100);
  const avant=b.joursTravail[b.joursTravail.length-2].date;
  assert.match(await page.locator('#journee-periode .pv-bulle').innerText(),new RegExp(avant.slice(8,10)+'/'+avant.slice(5,7)+' : '));

  // 4. Les cumuls : pour les personnes, la moyenne par jour seule ; pour les heures, le total et la moyenne.
  const sans=l=>l.map(t=>t.replace(/\s*\(.*\)$/,''));
  assert.deepEqual(sans(await cumuls()),['Moyenne par jour, octobre 2026','Moyenne par jour, novembre 2026','Moyenne par jour sur la période']);
  assert.match((await cumuls()).pop(),new RegExp('\\('+complets+' jours complets\\)$'));
  const moyenne=await page.locator('#journee-periode tr.pv-cumul').last().locator('td[data-pv-total]').innerText();
  assert.equal(moyenne,(Math.round(b.periode.moyenne.personnes)+0).toLocaleString('fr-FR'),'la moyenne des personnes par jour');
  await mesure('hommeMinutes');
  assert.deepEqual(sans(await cumuls()),['Total octobre 2026','Moyenne par jour, octobre 2026','Total novembre 2026','Moyenne par jour, novembre 2026','Total de la période','Moyenne par jour sur la période']);

  // 5. Une seule écriture du temps : jamais plus de 59 minutes, jamais d'heures décimales ; le détail d'un jour aussi.
  await page.locator('#journee-periode [data-pv=detail]').nth(5).click();await attendre(150);
  for(const id of ['heuresSup','retardMax','hommeMinutes']){
   await mesure(id);
   const t=await page.locator('#journee-periode').innerText();
   assert.deepEqual(tropDeMinutes(t),[],id+' : une durée de plus d’une heure s’écrit en heures');
   assert.doesNotMatch(t,/\d,\d+ h\b/,id+' : pas d’heures décimales');
  }
  assert.match(await page.locator('#journee-periode tr[data-pv-jour] td[data-pv-total]').first().innerText(),/^\d[\d   ]* h$/,'des homme-heures en heures entières');
  await page.locator('#journee-periode [data-pv=detail]').nth(5).click();await attendre(150);

  // 6. Le défilement sur le côté : la colonne des jours reste, et le défilement se voit.
  await mesure('personnes');
  await page.setViewportSize({width:760,height:1000});await attendre(400);
  const sc=page.locator('#journee-periode .pv-tableau .table-scroll');
  assert.ok(await sc.evaluate(e=>e.scrollWidth>e.clientWidth+20),'à 760 px, le tableau déborde');
  assert.equal(await page.locator('#journee-periode .pv-tableau').getAttribute('data-defile'),'droite');
  assert.equal(await page.locator('#journee-periode .pv-defile-aide').isVisible(),true,'la phrase dit que le tableau défile');
  assert.ok(await page.evaluate(()=>getComputedStyle(document.querySelector('#journee-periode .pv-defile'),'::after').opacity)==='1','le fondu à droite');
  const premiere=page.locator('#journee-periode tr[data-pv-jour] th').first(),seconde=page.locator('#journee-periode tr[data-pv-jour] td').first();
  const [g0,c0]=[(await premiere.boundingBox()).x,(await seconde.boundingBox()).x];
  await sc.evaluate(e=>{e.scrollLeft=e.scrollWidth;});await attendre(200);
  const [g1,c1]=[(await premiere.boundingBox()).x,(await seconde.boundingBox()).x];
  assert.ok(Math.abs(g1-g0)<1,'la première colonne reste : '+g0+' → '+g1);
  assert.ok(c1<c0-20,'les autres défilent : '+c0+' → '+c1);
  assert.equal(await page.locator('#journee-periode .pv-tableau').getAttribute('data-defile'),'gauche');
  assert.notEqual(await premiere.evaluate(e=>getComputedStyle(e).boxShadow),'none','une ombre borde la colonne des jours');
  await page.setViewportSize({width:1440,height:1000});await attendre(400);
  assert.equal(await page.locator('#journee-periode .pv-tableau').getAttribute('data-defile'),'','à 1 440 px, il tient à quelques pixels près : rien ne le dit');
  assert.equal(await page.locator('#journee-periode .pv-defile-aide').isVisible(),false);

  // 7. Le réel, importé dans « Réel et calage » : sur la courbe, pour une mesure en personnes.
  const services=await page.evaluate(()=>Sim.calage.a.services().map(s=>s.id));
  await page.evaluate(s=>Sim.calage.changerCorrespondance(c=>{c.lignes.push({nom:'Toute l’unité',roles:['Agent fictif'],services:s});}),services);await attendre(200);
  const jours=b.joursTravail.filter(w=>w.complet).slice(0,6).map(w=>w.date);
  const reelCsv='date;role;heures_titulaires;heures_interim;heures_supp\n'+jours.map((d,i)=>d+';Agent fictif;'+(60+i*7.5)+';14;0').join('\n')+'\n';
  await page.locator('#calage-reel').setInputFiles(fichier('reel-fictif.csv',reelCsv));await attendre(500);
  assert.equal(await page.locator('#journee-periode .pvc-reel').count(),1,'le trait du réel');
  assert.equal(await page.locator('#journee-periode .pvc-reel-point').count(),jours.length);
  assert.match(await page.locator('#journee-periode .pvc-legende').innerText(),/réel/);
  const base=await page.evaluate(()=>Sim.calage.correspondance.bases.defaut);
  assert.deepEqual(base,{titulaires:7.5,interim:7},'la proposition, enregistrée avec la correspondance');
  assert.deepEqual(JSON.parse(await page.evaluate(()=>localStorage.getItem('ory-calage-v1'))).correspondance.bases.defaut,{titulaires:7.5,interim:7});
  const r0=await page.evaluate(()=>Sim.calage.reelDeLUnite()[0]);
  assert.equal(r0.date,jours[0]);assert.ok(Math.abs(r0.reel-(60/7.5+14/7))<1e-9,'le réel du jour : 60 h ÷ 7,5 + 14 h ÷ 7');
  await mesure('charge');
  assert.equal(await page.locator('#journee-periode .pvc-reel').count(),1,'le réel sur la charge (ETP)');
  for(const id of ['heuresSup','surplusArrondi','picAuTravail']){
   await mesure(id);
   assert.equal(await page.locator('#journee-periode .pvc-reel').count(),0,'pas de réel sur '+id);
  }
  await mesure('personnes');
  // La bulle d'un dessin d'avant ne reste pas : un autre réel, et elle s'efface.
  // Le premier jour est incomplet, sans réel ; le deuxième, le premier jour complet, en a un.
  await page.locator('#pv-trace').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await attendre(100);
  assert.match(await page.locator('#journee-periode .pv-bulle').innerText(),new RegExp('^\\S+ '+jours[0].slice(8,10)+'/'+jours[0].slice(5,7)+' : Unité \\d+ · réel '));
  await page.evaluate(()=>Sim.calage.changerCorrespondance(c=>{c.bases.defaut.titulaires=8;}));await attendre(300);
  assert.equal(await page.locator('#journee-periode .pv-bulle').innerText(),'','la bulle d’avant s’efface');
  await page.evaluate(()=>Sim.calage.changerCorrespondance(c=>{c.bases.defaut.titulaires=7.5;}));await attendre(300);

  // 8. Un réglage enregistré ne change pas : 7 h et 7 h, gardés, restent après rechargement.
  await page.evaluate(()=>{const r=JSON.parse(localStorage.getItem('ory-calage-v1'));r.correspondance.bases.defaut={titulaires:7,interim:7};localStorage.setItem('ory-calage-v1',JSON.stringify(r));});
  await page.reload();await attendre(600);
  assert.deepEqual(await page.evaluate(()=>Sim.calage.correspondance.bases.defaut),{titulaires:7,interim:7});

  // 9. Une période dans un seul mois : un seul bloc de totaux.
  await importer('vols-un-mois.csv',programme('2026-11-02','2026-11-08'));
  await simuler();
  assert.deepEqual(sans(await cumuls()),['Moyenne par jour sur la période']);
  await mesure('heuresSup');
  assert.deepEqual(sans(await cumuls()),['Total de la période','Moyenne par jour sur la période']);

  assert.deepEqual(errors,[],errors.join(' | '));
  console.log('periode-page-browser : ok — colonne Unité, courbe et réel, première colonne collante, moyennes des personnes, un seul bloc dans un mois, jours complets d’abord, durées en heures, bases de la correspondance.');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})();

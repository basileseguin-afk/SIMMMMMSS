/* Banc d'essai, évolution 6 — la plonge qui ne vient que s'il reste du sale,
 * dans la page (v1) : la case, l'heure et le seuil dans la fiche d'une équipe
 * de plonge, rangés avec l'équipe (ory-ateliers-v1) seulement quand on les
 * saisit ; ce qu'elle a fait ce jour ; le sale de la veille dans « Réglages de
 * la simulation » ; gardés au rechargement et dans « Tout sauvegarder ».
 * Données fictives ; aucune capture d'écran (le plan est confidentiel). */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

// Seize retours, toutes les 20 min à partir de 14:30 (à la plonge 30 min après).
const VOLS_CSV='vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC\n'
  +'NO1,NORD,MOYEN,DEP,12:00,,0,0,100\n'
  +Array.from({length:16},(_,i)=>{const m=14*60+30+i*20;return 'R'+(i+1)+','+(i%2?'SUD':'NORD')+',MOYEN,RET,,'+String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')+',0,0,100';}).join('\n')+'\n';
// Le soir : de 14:00 à 21:00, un tunnel, 30 min par vol. La nuit : de 22:00 à 06:00.
const UNITE=()=>{
  Sim.reglages.changer(()=>{Sim.reglages.etat.regime={seuils:[],presence:480};},'');
  Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;st.materiel.actif=false;st.materiel.retours='programme';st.materiel.delaiRetour=30;
    st.ateliers=st.ateliers.filter(a=>a.service!=='plonge');
    const p=(id,debut,presence)=>({id,nom:id==='soir'?'Plonge soir':'Plonge nuit',service:'plonge',type:'lavage',debut,jour:0,personnes:2,pauses:[],lots:[],
      regime:{actif:true,presence},plafond:0,parVol:true,durees:{'*':30},tunnels:[{nom:'Tunnel '+id,debit:300,personnes:1,actif:true}]});
    st.ateliers.push(p('soir','14:00',420),p('nuit','22:00',480));},'');
};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=250)=>page.waitForTimeout(ms);
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-pn-'));
 const csv=path.join(dossier,'vols-pn.csv');fs.writeFileSync(csv,VOLS_CSV);
 const cases=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ory-ateliers-v1')||'null'));
 const equipe=async()=>(await cases()).ateliers.find(a=>a.id==='nuit');
 const nuit=()=>page.evaluate(()=>{const v=Sim.ateliers.resultat.ateliers.find(a=>a.id==='nuit');return {personnes:v.personnes,cs:v.conditionSale||null};});
 const ouvrir=async()=>{await nav.aller(page,'at-equipes');await page.evaluate(()=>{Sim.ateliers.ouvert='nuit';Sim.ateliers.rendre();});await attendre();};
 const fiche=()=>page.locator('[data-at="nuit"]');
 const saisir=async(sel,val)=>{const l=fiche().locator(sel);await l.fill(val);await l.press('Tab');await attendre();};
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(500);
  await page.evaluate(UNITE);await attendre();
  await nav.aller(page,'v-programme');
  await page.locator('#imp-vols').setInputFiles(csv);
  await page.waitForFunction(()=>document.getElementById('source-label').textContent==='vols-pn.csv');

  // 1. Par défaut, une plonge ordinaire : la case n'est pas cochée, rien d'enregistré, elle travaille.
  await ouvrir();
  const caseSale=fiche().locator('[data-at-champ=sale-condition]');
  assert.equal(await caseSale.isChecked(),false);
  assert.equal(await fiche().locator('[data-at-champ=sale-seuil]').count(),0);
  assert.equal('condition' in (await equipe()),false);
  assert.deepEqual(await nuit(),{personnes:2,cs:null});

  // 2. Cochée : elle ne vient que s'il reste du sale à 22:00 — il en reste, 4 vols.
  await caseSale.check();await attendre();
  assert.deepEqual((await equipe()).condition,{mesure:'sale'});
  let n=await nuit();
  assert.deepEqual([n.personnes,n.cs.ouverte,n.cs.sale,n.cs.lavees],[2,true,760,760]);
  assert.equal(await fiche().locator('[data-at-champ=sale-a]').inputValue(),'22:00','sans heure : à son début');
  assert.equal(await fiche().locator('[data-at-action=sale-a-debut]').count(),0);
  assert.match(await fiche().locator('.at-bilan-sale').innerText(),/Ouverte ce jour : 760 u de sale en attente à 22:00 \(seuil 1 u\) ; elle a lavé 760 u ; reste 0 u/);

  // 3. Un seuil de 1 000 u : fermée, ses personnes ne viennent pas. Un seuil illisible est refusé.
  await saisir('[data-at-champ=sale-seuil]','1000');
  assert.deepEqual((await equipe()).condition,{mesure:'sale',seuil:1000});
  n=await nuit();
  assert.deepEqual([n.personnes,n.cs.ouverte],[0,false]);
  assert.match(await fiche().locator('.at-bilan-sale').innerText(),/Fermée ce jour : 760 u de sale en attente à 22:00 \(seuil 1000 u\) ; ses personnes ne viennent pas ; reste 760 u/);
  await saisir('[data-at-champ=sale-seuil]','-3');
  assert.equal((await equipe()).condition.seuil,1000,'refusé');

  // 4. L'heure : 18:00 (trois vols attendent, 570 u) ; « À son début » la rend à son début.
  await saisir('[data-at-champ=sale-a]','1800');
  await saisir('[data-at-champ=sale-seuil]','500');
  assert.deepEqual((await equipe()).condition,{mesure:'sale',a:'18:00',seuil:500});
  n=await nuit();
  assert.deepEqual([n.cs.heure,n.cs.sale,n.cs.ouverte],[18*60,570,true]);
  await fiche().locator('[data-at-action=sale-a-debut]').click();await attendre();
  assert.equal('a' in (await equipe()).condition,false);
  await saisir('[data-at-champ=sale-a]','22:00');
  assert.equal('a' in (await equipe()).condition,false,'son début : rien d’enregistré');

  // 5. Le sale de la veille, dans « Réglages de la simulation » : lavé en premier par le soir.
  await nav.aller(page,'rg-simulation');
  const veille=page.locator('#rg-sim-materiel [data-at-champ=mat-sale]');
  assert.equal(await veille.inputValue(),'');
  await veille.fill('300');await veille.press('Tab');await attendre();
  assert.equal((await cases()).materiel.saleInitial,300);
  assert.deepEqual(await page.evaluate(()=>Sim.ateliers.resultat.lots.filter(l=>l.retourVol&&/^veille/.test(l.vol)).map(l=>[l.vol,l.atelier])),[['veille 1','soir'],['veille 2','soir']]);

  // 6. Rechargée, tout est là ; dans « Tout sauvegarder » aussi.
  await page.reload();await attendre(600);
  await ouvrir();
  assert.equal(await fiche().locator('[data-at-champ=sale-condition]').isChecked(),true);
  await nav.aller(page,'u-sauvegarde');
  const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#sauvegarde-export').click()]);
  const fichier=path.join(dossier,'sauvegarde.json');await d.saveAs(fichier);
  const sauve=JSON.parse(fs.readFileSync(fichier,'utf8')).contenu['ory-ateliers-v1'],lu=typeof sauve==='string'?JSON.parse(sauve):sauve;
  assert.deepEqual(lu.ateliers.find(a=>a.id==='nuit').condition,{mesure:'sale',seuil:500});
  assert.equal(lu.materiel.saleInitial,300);

  // 7. Décochée : une plonge ordinaire ; « Annuler » revient.
  await ouvrir();
  await fiche().locator('[data-at-champ=sale-condition]').uncheck();await attendre();
  assert.equal('condition' in (await equipe()),false);
  assert.deepEqual(await nuit(),{personnes:2,cs:null});
  await page.evaluate(()=>Sim.ateliers.histoire(false));await attendre();
  assert.deepEqual((await equipe()).condition,{mesure:'sale',seuil:500},'annulé : de nouveau conditionnelle');

  assert.deepEqual(errors,[]);
  console.log('plonge-nuit-browser : ok — case, heure, seuil, bilan, sale de la veille, sauvegarde');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})();

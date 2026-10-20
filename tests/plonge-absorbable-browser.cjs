/* Banc d'essai, correction 3 — dans la page (v1) : une plonge de nuit qui ne
 * vient que si l'équipe du matin ne peut pas absorber le retard. La règle et
 * l'équipe désignée dans la fiche de la plonge, rangées avec l'équipe
 * (ory-ateliers-v1) seulement quand on les règle ; ce qu'elle a décidé ce
 * jour ; gardées au rechargement et dans « Tout sauvegarder ». Données
 * fictives ; aucune capture d'écran (le plan est confidentiel). */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

// Six retours le matin (05:30 à 08:00), puis n l'après-midi, toutes les 20 min à partir de 14:30 (à la plonge 30 min après).
const hm=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const VOLS_CSV=n=>'vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC\n'+'NO1,NORD,MOYEN,DEP,12:00,,0,0,100\n'
  +Array.from({length:6},(_,i)=>'M'+(i+1)+','+(i%2?'SUD':'NORD')+',MOYEN,RET,,'+hm(5*60+30+i*30)+',0,0,100').join('\n')+'\n'
  +Array.from({length:n},(_,i)=>'R'+(i+1)+','+(i%2?'SUD':'NORD')+',MOYEN,RET,,'+hm(14*60+30+i*20)+',0,0,100').join('\n')+'\n';
// Le matin : 05:00 à 13:00 ; le soir : 14:00 à 21:00 ; la nuit : 22:00 à 06:00. Un tunnel chacune, 30 min par vol.
const UNITE=()=>{
  Sim.reglages.changer(()=>{Sim.reglages.etat.regime={seuils:[],presence:480};},'');
  Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;st.materiel.actif=false;st.materiel.retours='programme';st.materiel.delaiRetour=30;
    st.ateliers=st.ateliers.filter(a=>a.service!=='plonge');
    const p=(id,nom,debut,presence)=>({id,nom,service:'plonge',type:'lavage',debut,jour:0,personnes:2,pauses:[],lots:[],
      regime:{actif:true,presence},plafond:0,parVol:true,durees:{'*':30},tunnels:[{nom:'Tunnel '+id,debit:300,personnes:1,actif:true}]});
    st.ateliers.push(p('matin','Plonge matin','05:00',480),p('soir','Plonge soir','14:00',420),p('nuit','Plonge nuit','22:00',480));},'');
};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=250)=>page.waitForTimeout(ms);
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-pa-'));
 const csv=n=>{const f=path.join(dossier,'vols-'+n+'.csv');fs.writeFileSync(f,VOLS_CSV(n));return f;};
 const importer=async n=>{await nav.aller(page,'v-programme');await page.locator('#imp-vols').setInputFiles(csv(n));
   await page.waitForFunction(n=>document.getElementById('source-label').textContent==='vols-'+n+'.csv',n);};
 const cases=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ory-ateliers-v1')||'null'));
 const equipe=async()=>(await cases()).ateliers.find(a=>a.id==='nuit');
 const nuit=()=>page.evaluate(()=>{const v=Sim.ateliers.resultat.ateliers.find(a=>a.id==='nuit');return {personnes:v.personnes,cs:v.conditionSale||null};});
 const ouvrir=async()=>{await nav.aller(page,'at-equipes');await page.evaluate(()=>{Sim.ateliers.ouvert='nuit';Sim.ateliers.rendre();});await attendre();};
 const fiche=()=>page.locator('[data-at="nuit"]');
 const choisir=async(sel,val)=>{await fiche().locator(sel).selectOption(val);await attendre();};
 const bilan=()=>fiche().locator('.at-bilan-sale').innerText();
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(500);
  await page.evaluate(UNITE);await attendre();
  await importer(20);

  // 1. Cochée, la règle par défaut reste celle du sale à une heure (évolution 6).
  await ouvrir();
  await fiche().locator('[data-at-champ=sale-condition]').check();await attendre();
  assert.deepEqual((await equipe()).condition,{mesure:'sale'});
  assert.equal(await fiche().locator('[data-at-champ=sale-mesure]').inputValue(),'sale');
  assert.equal(await fiche().locator('[data-at-champ=sale-equipe]').count(),0);

  // 2. Sur le retard : vingt retours, le soir en laisse huit ; le matin les absorbe le lendemain. Fermée.
  await choisir('[data-at-champ=sale-mesure]','absorbable');
  assert.deepEqual((await equipe()).condition,{mesure:'absorbable'},'ni heure ni seuil : les deux ne se cumulent pas');
  assert.equal(await fiche().locator('[data-at-champ=sale-a]').count(),0);
  assert.equal(await fiche().locator('[data-at-champ=sale-seuil]').count(),0);
  const qui=fiche().locator('[data-at-champ=sale-equipe]');
  assert.equal(await qui.inputValue(),'','par défaut');
  assert.match(await qui.locator('option:checked').innerText(),/la première du matin \(« Plonge matin »\)/);
  let n=await nuit();
  assert.deepEqual([n.personnes,n.cs.mesure,n.cs.ouverte,n.cs.equipe,n.cs.retard,n.cs.absorbe],[0,'absorbable',false,'matin',{vols:8,unites:1520},true]);
  assert.match(await bilan(),/Fermée ce jour : sans elle, il reste 8 vols \(1520 u\) à la fin de la journée ; « Plonge matin » les absorbe le lendemain, avec ses propres retours, avant la fin de sa présence ; ses personnes ne viennent pas/);

  // 3. Vingt-trois retours : onze vols de retard, le matin dépasserait sa présence de 30 min. Ouverte.
  await importer(23);await ouvrir();
  n=await nuit();
  assert.deepEqual([n.personnes,n.cs.ouverte,n.cs.absorbe,n.cs.depassement],[2,true,false,30]);
  assert.match(await bilan(),/Ouverte ce jour : sans elle, il resterait 11 vols \(2090 u\) à la fin de la journée ; « Plonge matin » ne les absorberait pas : elle dépasserait sa présence de 30 min ; elle a lavé 2090 u ; reste 0 u/);

  // 4. L'équipe désignée : le soir. Le retard est propre avant 21:00 (le matin le lave) et le soir lave ses retours à
  // temps (le vol que le matin n'a pas fini l'attend à 14:00, quand il n'a encore rien à laver) : fermée. Rangée avec la condition.
  await choisir('[data-at-champ=sale-equipe]','soir');
  assert.deepEqual((await equipe()).condition,{mesure:'absorbable',equipe:'soir'});
  n=await nuit();
  assert.deepEqual([n.personnes,n.cs.equipe,n.cs.absorbe,n.cs.ouverte],[0,'soir',true,false]);
  assert.match(await bilan(),/Fermée ce jour : sans elle, il reste 11 vols \(2090 u\) à la fin de la journée ; « Plonge soir » les absorbe le lendemain/);

  // 5. Rechargée, tout est là ; dans « Tout sauvegarder » aussi.
  await page.reload();await attendre(600);
  await ouvrir();
  assert.equal(await fiche().locator('[data-at-champ=sale-mesure]').inputValue(),'absorbable');
  assert.equal(await fiche().locator('[data-at-champ=sale-equipe]').inputValue(),'soir');
  await nav.aller(page,'u-sauvegarde');
  const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#sauvegarde-export').click()]);
  const fichier=path.join(dossier,'sauvegarde.json');await d.saveAs(fichier);
  const sauve=JSON.parse(fs.readFileSync(fichier,'utf8')).contenu['ory-ateliers-v1'],lu=typeof sauve==='string'?JSON.parse(sauve):sauve;
  assert.deepEqual(lu.ateliers.find(a=>a.id==='nuit').condition,{mesure:'absorbable',equipe:'soir'});

  // 6. De nouveau la première du matin ; puis le sale à une heure, sans équipe ; « Annuler » revient.
  await ouvrir();
  await choisir('[data-at-champ=sale-equipe]','');
  assert.deepEqual((await equipe()).condition,{mesure:'absorbable'});
  await choisir('[data-at-champ=sale-mesure]','sale');
  assert.deepEqual((await equipe()).condition,{mesure:'sale'});
  assert.equal(await fiche().locator('[data-at-champ=sale-seuil]').count(),1);
  await page.evaluate(()=>Sim.ateliers.histoire(false));await attendre();
  assert.deepEqual((await equipe()).condition,{mesure:'absorbable'},'annulé');

  // 7. Décochée : une plonge ordinaire.
  await ouvrir();
  await fiche().locator('[data-at-champ=sale-condition]').uncheck();await attendre();
  assert.equal('condition' in (await equipe()),false);
  assert.deepEqual(await nuit(),{personnes:2,cs:null});

  assert.deepEqual(errors,[]);
  console.log('plonge-absorbable-browser : ok — règle, équipe désignée, bilan, rechargement, sauvegarde');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})();

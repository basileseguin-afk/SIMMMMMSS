/* Banc d'essai, correction 6 — l'ordre souple dans la page (v1) : la case dans
 * « Réglages de la simulation », rangée avec le barème (ory-modele-v1)
 * seulement une fois réglée ; l'ordre de ses lots dans la fiche d'une équipe
 * (ory-ateliers-v1) ; gardés au rechargement et dans « Tout sauvegarder ».
 * Données fictives ; aucune capture d'écran (le plan est confidentiel). */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');

// Le magasin ouvre à 07:00 ; la cuisine commence à 04:00 : AF/BC passe par le magasin, TX/BC non.
const UNITE=()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
  st.ateliers.push({id:'mg',nom:'Magasin',service:'magasin',type:'dispo',debut:'00:00',jour:0,personnes:0,pauses:[],lots:[],regime:{actif:true},
    permanent:true,ouverture:{de:'07:00',a:'18:00'}},
    {id:'cu',nom:'Cuisine AF TX',service:'cuisine',type:'manuel',debut:'04:00',jour:0,personnes:3,pauses:[],lots:[['AF/BC'],['TX/BC']],regime:{actif:true}});
  st.parcours.push({id:'pa',nom:'AF par le magasin',noeuds:['magasin','cuisine'],liens:[{de:'magasin',vers:'cuisine'}]},{id:'pt',nom:'TX en cuisine',noeuds:['cuisine'],liens:[]});
  st.parcoursClasse={...st.parcoursClasse,'AF/BC':'pa','TX/BC':'pt'};},'');

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=250)=>page.waitForTimeout(ms);
 const dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-os-'));
 const modele=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ory-modele-v1')||'null'));
 const cases=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ory-ateliers-v1')||'null'));
 const ordre=()=>page.evaluate(()=>Sim.ateliers.resultat.lots.filter(l=>l.atelier==='cu'&&!l.impossible).map(l=>l.nom));
 const panneau=()=>page.locator('#rg-sim-ordre');
 const fiche=async()=>{await nav.aller(page,'at-equipes');await page.evaluate(()=>{Sim.ateliers.ouvert='cu';Sim.ateliers.rendre();});await attendre();
   return page.locator('[data-at="cu"] [data-at-champ=ordreSouple]');};
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(500);
  await page.evaluate(UNITE);await attendre();

  // 1. Par défaut : l'ordre strict ; la case n'est pas cochée, rien d'enregistré. AF/BC attend le magasin, TX/BC l'attend aussi.
  await nav.aller(page,'rg-simulation');
  assert.equal(await panneau().locator('[data-os-actif]').isChecked(),false);
  assert.equal('ordreSouple' in ((await modele())||{}),false);
  assert.deepEqual(await ordre(),['AF/BC','TX/BC']);
  let choix=await fiche();
  assert.equal(await choix.inputValue(),'');
  assert.match(await choix.locator('option:checked').innerText(),/le réglage général \(strict\)/);

  // 2. Cochée : TX/BC, prêt, passe d'abord ; AF/BC à l'ouverture du magasin.
  await nav.aller(page,'rg-simulation');
  await panneau().locator('[data-os-actif]').check();await attendre();
  assert.deepEqual((await modele()).ordreSouple,{actif:true});
  assert.deepEqual(await ordre(),['TX/BC','AF/BC']);

  // 3. Strict pour cette équipe : rangé avec elle ; le panneau la nomme.
  choix=await fiche();
  await choix.selectOption('strict');await attendre();
  assert.equal((await cases()).ateliers.find(a=>a.id==='cu').ordreSouple,false);
  assert.deepEqual(await ordre(),['AF/BC','TX/BC']);
  await nav.aller(page,'rg-simulation');
  assert.match(await panneau().innerText(),/Réglée autrement : Cuisine AF TX\./);

  // 4. Rechargée, tout est là ; dans « Tout sauvegarder » aussi.
  await page.reload();await attendre(600);
  await nav.aller(page,'rg-simulation');
  assert.equal(await panneau().locator('[data-os-actif]').isChecked(),true);
  assert.equal(await (await fiche()).inputValue(),'strict');
  await nav.aller(page,'u-sauvegarde');
  const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#sauvegarde-export').click()]);
  const fichier=path.join(dossier,'sauvegarde.json');await d.saveAs(fichier);
  const contenu=JSON.parse(fs.readFileSync(fichier,'utf8')).contenu,lu=x=>(typeof x==='string'?JSON.parse(x):x);
  assert.deepEqual(lu(contenu['ory-modele-v1']).ordreSouple,{actif:true});
  assert.equal(lu(contenu['ory-ateliers-v1']).ateliers.find(a=>a.id==='cu').ordreSouple,false);

  // 5. Le réglage général pour elle ; décochée : de nouveau l'ordre strict partout.
  choix=await fiche();
  await choix.selectOption('');await attendre();
  assert.equal('ordreSouple' in (await cases()).ateliers.find(a=>a.id==='cu'),false);
  assert.deepEqual(await ordre(),['TX/BC','AF/BC']);
  await nav.aller(page,'rg-simulation');
  await panneau().locator('[data-os-actif]').uncheck();await attendre();
  assert.deepEqual((await modele()).ordreSouple,{actif:false});
  assert.deepEqual(await ordre(),['AF/BC','TX/BC']);

  assert.deepEqual(errors,[]);
  console.log('ordre-souple-browser : ok — réglage général, réglage d’une équipe, rechargement, sauvegarde');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})();

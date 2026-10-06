/* Le minimum de personnes pour qu'un tunnel de plonge ou le robot tourne
 * (retour d'usage du 06/10 : « il faut un nombre seuil de personnes pour qu'un
 * tunnel fonctionne, et pareil pour le robot »). Le moteur le faisait déjà ;
 * il se lit et se règle maintenant à la vue : « Minimum pour tourner ». v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 const M='#mu-services';
 const champ=async(sel,v)=>{const c=page.locator(sel).first();await c.fill(String(v));await c.dispatchEvent('change');await attendre();};
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state,cl=Sim.ateliers.classes.map(c=>c.id);
     st.ateliers.push({id:'pl',nom:'Plonge',service:'plonge',type:'lavage',debut:'06:00',jour:0,personnes:1,pauses:[],lots:[],plafond:0,
       tunnels:[{nom:'Tunnel 1',debit:300,personnes:2,actif:true}]});
     st.ateliers.push({id:'ro',nom:'Robot',service:'prepa',type:'robot',debut:'06:00',jour:-1,personnes:1,personnesMin:2,debit:300,pauses:[],lots:cl.slice(0,2).map(c=>[c])});},''));

   // 1. La plonge : un tunnel qui demande 2 personnes, une équipe d'une seule.
   await nav.aller(page,'mu-services');
   await page.locator(`${M} [data-mu-choisir=plonge]`).click();await attendre();
   const t=`${M} [data-at="pl"] .at-tunnel`;
   assert.match(await page.locator(t).first().innerText(),/Minimum pour tourner/,version+' : le seuil du tunnel se lit');
   assert.match(await page.locator(`${t} .at-tunnel-etat`).first().innerText(),/à l’arrêt : pas assez de monde/);
   await champ(`${M} [data-at="pl"] [data-at-champ=personnes]`,2);
   assert.equal(await page.locator(`${t} .at-tunnel-etat`).first().innerText(),'tourne',version+' : à 2, il tourne');
   await champ(`${M} [data-at="pl"] [data-at-champ=tunnel-personnes]`,3);
   assert.match(await page.locator(`${t} .at-tunnel-etat`).first().innerText(),/pas assez de monde/,'seuil relevé à 3 : à l’arrêt');
   assert.equal(await page.evaluate(()=>Sim.ateliers.state.ateliers.find(a=>a.id==='pl').tunnels[0].personnes),3);

   // 2. Le robot : un minimum de 2, une seule personne → à l'arrêt, et ses commandes ne se font pas.
   await page.locator(`${M} [data-mu-choisir=prepa]`).click();await attendre();
   const r=`${M} .mu-equipe[data-at="ro"]`;
   assert.equal(await page.locator(`${r} .mu-equipe-tete [data-at-champ=personnesMin]`).inputValue(),'2',version+' : le minimum du robot, à la vue');
   assert.match(await page.locator(`${r} .mu-equipe-tete`).innerText(),/à l’arrêt : 1 pers\. pour un minimum de 2/);
   assert.ok(await page.evaluate(()=>Sim.ateliers.resultat.lots.filter(l=>l.atelier==='ro').every(l=>l.impossible)),'rien ne sort du robot');
   await champ(`${r} .mu-equipe-tete [data-at-champ=personnesMin]`,1);
   assert.doesNotMatch(await page.locator(`${r} .mu-equipe-tete`).innerText(),/à l’arrêt/,'minimum à 1 : il tourne');
   assert.ok(await page.evaluate(()=>Sim.ateliers.resultat.lots.filter(l=>l.atelier==='ro').some(l=>!l.impossible&&l.fin!=null)),'ses commandes sortent');
  }
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('seuils-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

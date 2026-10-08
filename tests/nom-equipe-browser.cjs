/* Le nom d'une équipe (retour d'usage du 08/10 : « le nom du premier atelier
 * de la dotation est CRL, mais à chaque fois que je rentre le nom ça l'efface,
 * et il me dit qu'il n'y a pas de nom »). Un nom n'est unique que dans son
 * service : « CRL » en Dotation comme en Cuisine. Un nom vide, ou déjà pris dans
 * le service, est refusé et le champ revient au nom gardé — l'écran ne montre
 * jamais ce qui n'est pas retenu. v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(350);
 const nomDe=id=>page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id).nom,id);
 const champ=id=>page.locator(`#mu-services [data-at="${id}"] [data-at-champ=nom]`);
 const saisir=async(id,v)=>{await champ(id).fill(v);await champ(id).press('Tab');await attendre();};
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   // Une équipe « CRL » en Cuisine ; deux équipes en Dotation.
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const s=Sim.ateliers.state;
     s.ateliers.push({id:'cu',nom:'CRL',service:'cuisine',type:'manuel',debut:'04:00',jour:-1,personnes:2,pauses:[],lots:[['CRL/BC']],regime:{actif:true}},
       {id:'d1',nom:'Dotation 1',service:'dotation',type:'manuel',debut:'04:00',jour:0,personnes:2,pauses:[],lots:[['CRL/YC']],regime:{actif:true}},
       {id:'d2',nom:'Dotation 2',service:'dotation',type:'manuel',debut:'05:00',jour:0,personnes:2,pauses:[],lots:[['AF/YC']],regime:{actif:true}});},''));
   await page.reload();await attendre();
   await nav.aller(page,'mu-services');await page.locator('[data-mu-choisir=dotation]').click();await attendre();

   // 1. « CRL » en Dotation, alors que la Cuisine a déjà le sien : accepté.
   await saisir('d1','CRL');
   assert.equal(await nomDe('d1'),'CRL',version+' : le nom d’une équipe d’un autre service ne gêne pas');
   assert.equal(await champ('d1').inputValue(),'CRL');
   // 2. Vide : refusé, le champ revient au nom gardé.
   await saisir('d1','');
   assert.equal(await nomDe('d1'),'CRL',version+' : un nom vide est refusé');
   assert.equal(await champ('d1').inputValue(),'CRL',version+' : le champ revient au nom gardé');
   // 3. Déjà pris dans le même service : refusé, le champ revient.
   await saisir('d2','crl');
   assert.equal(await nomDe('d2'),'Dotation 2',version+' : deux équipes d’un service ne partagent pas un nom');
   assert.equal(await champ('d2').inputValue(),'Dotation 2',version+' : l’écran ne montre pas ce qui n’est pas retenu');
   // 4. Rien à reprendre dans la fiche : pas de « nommez-le ».
   assert.doesNotMatch(await page.locator('#mu-services').innerText(),/nommez-le/);
   assert.deepEqual(errors,[],version+' : '+errors.join(' | '));
  }
  console.log('nom-equipe-browser : ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

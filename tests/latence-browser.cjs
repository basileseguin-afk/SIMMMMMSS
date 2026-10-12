/* La latence d'un changement (refonte du 08/10, étape 10 : « au plus 10 % de
 * plus qu'avant la refonte »). Mesurée le 12/10 contre le commit de l'étape 0 ;
 * ici, ce qui la tient, sans chronomètre (une machine lente ne fait pas échouer) :
 *   1. Le bilan d'un service ne se fait qu'une fois par changement, même quand
 *      la liste des services et « Prêt à simuler ? » le demandent tous deux.
 *   2. Sur une page qui n'en a pas besoin, aucun bilan pendant le changement :
 *      le registre des problèmes se refait juste après, et son compte suit
 *      (barre latérale et onglets).
 *   3. Un recalcul qui ne change pas le menu ne le mesure pas : aucune lecture
 *      de taille ne force la mise en page au milieu du calcul.
 * v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=300)=>page.waitForTimeout(ms);
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   const V=version+' : ';
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
     st.parcours.push({id:'ch',nom:'Chaud',noeuds:['cuisine','prepa','dotation'],liens:[{de:'cuisine',vers:'prepa'},{de:'prepa',vers:'dotation'}]});
     for(const c of ['AF/BC','AF/YC','TX/BC'])st.parcoursClasse[c]='ch';
     const c=(id,nom,service,debut,n)=>({id,nom,service,type:'manuel',debut,jour:0,personnes:n,pauses:[],lots:[['AF/BC'],['AF/YC'],['TX/BC']],regime:{actif:false}});
     st.ateliers.push(c('cu','Cuisine chaud','cuisine','04:00',2),c('mo','Montage','prepa','05:00',2),c('do','Dotation','dotation','06:00',2));},''));
   await attendre();
   /** Un changement, et ce qui s'est fait pendant (dans la même tâche) puis juste après. */
   const changer=quoi=>page.evaluate(async quoi=>{
     const U=Sim.unite,o=U.bilan,c={pendant:0,apres:0,taille:0};let phase='pendant';
     U.bilan=function(...a){c[phase]++;return o.apply(this,a);};
     // Les lectures de taille du menu forcent une mise en page : on les compte.
     const liste=document.querySelector('#sous-onglets .so-liste'),proto=Element.prototype;
     const sw=Object.getOwnPropertyDescriptor(proto,'scrollWidth');
     Object.defineProperty(liste,'scrollWidth',{configurable:true,get(){if(phase==='pendant')c.taille++;return sw.get.call(this);}});
     const avant=Sim.problemes.liste.length;
     const a=Sim.ateliers.state.ateliers.find(x=>x.id==='mo');
     Sim.ateliers.changer(()=>{if(quoi==='vider')a.lots=[[]];else a.debut=a.debut==='05:00'?'05:15':'05:00';},'');
     c.registrePendant=Sim.problemes.liste.length-avant;
     phase='apres';await new Promise(r=>setTimeout(r,60));
     c.registreApres=Sim.problemes.liste.length-avant;
     c.badge=+(document.querySelector('#btn-problemes .pb-compte')||{}).textContent||0;
     c.registre=Sim.problemes.liste.length;
     U.bilan=o;delete liste.scrollWidth;
     c.services=Sim.unite.a.services().length;
     return c;},quoi);

   // 1. La liste des services et « Prêt à simuler ? » : un bilan par service, une fois.
   await nav.aller(page,'mu-services');await attendre();
   let c=await changer('heure');
   assert.ok(c.pendant>0&&c.pendant<=c.services,V+'un bilan par service au plus, pendant le changement '+JSON.stringify(c));
   assert.equal(c.taille,0,V+'le menu n’est pas mesuré quand il ne change pas');

   // 2. Une page sans bilan : aucun pendant le changement ; le registre suit juste après.
   await nav.aller(page,'at-planning');await attendre();
   c=await changer('heure');
   assert.equal(c.pendant,0,V+'aucun bilan pendant le changement, sur le planning');
   assert.ok(c.apres>0,V+'le registre des problèmes se refait juste après');
   assert.equal(c.taille,0,V+'ni mesure du menu');
   // Une équipe qui ne prépare plus rien : un problème de plus, compté juste après.
   c=await changer('vider');
   assert.equal(c.registrePendant,0,V+'pendant le changement, le registre attend');
   assert.ok(c.registreApres>=1,V+'juste après, il compte le nouveau problème '+JSON.stringify(c));
   assert.equal(c.badge,c.registre,V+'et le compte de la barre latérale suit');
   assert.deepEqual(errors,[],V+errors.join(' | '));
  }
  console.log('latence-browser : ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

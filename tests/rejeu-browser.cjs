/* Rejouer la journée (refonte du 08/10, étape 5) : la toile d'abord.
 *   1. Le plan occupe au moins 75 % de la hauteur utile (sous la barre du
 *      haut) ; la barre de lecture court en bas, sous la toile ; les
 *      indicateurs, la légende et le zoom se posent sur la toile.
 *   2. « En ce moment » se replie : le plan prend toute la largeur, et le
 *      choix est retenu (une préférence d'affichage, rien d'autre).
 *   3. Pendant l'édition du plan, son panneau reste, le bouton s'efface.
 *   4. Sans choix retenu, un écran étroit s'ouvre panneau replié.
 *   5. Rien à relire : ni curseur ni vitesse, la barre dit pourquoi.
 * v1 et v2. Aucune capture : le plan de l'unité est confidentiel. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=150)=>page.waitForTimeout(ms);
 const boite=s=>page.evaluate(s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return b.width||b.height?{x:b.x,y:b.y,w:b.width,h:b.height,bas:b.bottom,droite:b.right}:null;},s);
 // Des équipes sur un chemin : une journée à relire.
 const decrire=()=>page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
   st.parcours.push({id:'ch',nom:'Chaud',noeuds:['cuisine','prepa','dotation'],liens:[{de:'cuisine',vers:'prepa'},{de:'prepa',vers:'dotation'}]});
   for(const c of ['AF/BC','AF/YC','TX/BC'])st.parcoursClasse[c]='ch';
   const c=(id,nom,service,debut)=>({id,nom,service,type:'manuel',debut,jour:0,personnes:2,pauses:[],lots:[['AF/BC'],['AF/YC'],['TX/BC']],regime:{actif:false}});
   st.ateliers.push(c('cu','Cuisine chaud','cuisine','04:00'),c('mo','Montage','prepa','05:00'),c('do','Dotation','dotation','06:00'));},''));
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   const V=version+' : ';
   await page.setViewportSize({width:1440,height:900});
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre(300);
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(400);
   await decrire();await attendre(300);
   await nav.aller(page,'j-plan');
   await page.evaluate(()=>Sim.vue.allerA(Sim.vue.debut+(Sim.vue.fin-Sim.vue.debut)/2));await attendre(250);

   // 1. La toile d'abord.
   const haut=await boite('.haut'),plan=await boite('#plan'),lecteur=await boite('#lecteur');
   const part=plan.h/(900-haut.bas);
   assert.ok(part>=0.75,V+'le plan occupe '+Math.round(part*100)+' % de la hauteur utile');
   assert.ok(lecteur.y>=plan.bas-1&&lecteur.bas<=900+1,V+'la barre de lecture court en bas, sous la toile');
   for(const s of ['.plan-kpi','.plan-legende','.plan-zoom']){
     const b=await boite(s);assert.ok(b,V+s+' visible');
     assert.ok(b.x>=plan.x&&b.droite<=plan.droite+1&&b.y>=plan.y&&b.bas<=plan.bas+1,V+s+' se pose sur la toile');
   }
   assert.equal(await page.locator('.kpi-grille').isVisible(),true,V+'les indicateurs à cette heure');
   for(const id of ['#btn-play','#sim-pas','#btn-reset','#sim-curseur','#vitesse','#horloge','#zoom-in','#zoom-out','#zoom-fit','#zoom-reset','#zone-picker','#fond-plan','#btn-edit'])
     assert.equal(await page.locator(id).isVisible(),true,V+id+' reste à portée');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,V+'sans débord');

   // 2. « En ce moment » se replie, et le choix est retenu.
   const bouton=page.locator('#btn-en-ce-moment');
   assert.equal(await bouton.getAttribute('aria-expanded'),'true',V+'ouvert sur un écran large');
   assert.equal(await page.locator('.workbench').isVisible(),true);
   await bouton.click();await attendre();
   assert.equal(await bouton.getAttribute('aria-expanded'),'false');
   assert.equal(await page.locator('.workbench').isVisible(),false,V+'replié');
   const large=await boite('#plan');
   assert.ok(large.w>plan.w+300,V+'le plan prend toute la largeur ('+Math.round(plan.w)+' → '+Math.round(large.w)+')');
   assert.equal(await page.evaluate(()=>localStorage.getItem('ory-ui-en-ce-moment')),'replie',V+'une préférence d’affichage');
   await page.reload();await attendre(400);await nav.aller(page,'j-plan');
   assert.equal(await page.locator('.workbench').isVisible(),false,V+'retenu d’une visite à l’autre');

   // 3. L'édition du plan garde son panneau ; le bouton s'efface.
   await page.locator('#btn-edit').click();await attendre(300);
   assert.equal(await page.locator('#panneau-edition').isVisible(),true,V+'le panneau de l’édition reste');
   assert.equal(await bouton.isVisible(),false,V+'pas de repli pendant l’édition');
   await page.locator('#edit-done').click();await attendre(300);
   await bouton.click();await attendre();
   assert.equal(await page.locator('.workbench').isVisible(),true,V+'déplié');
   assert.equal(await page.evaluate(()=>localStorage.getItem('ory-ui-en-ce-moment')),'ouvert');

   // 4. Sans choix retenu, un écran étroit : le plan d'abord.
   await page.evaluate(()=>localStorage.removeItem('ory-ui-en-ce-moment'));
   await page.setViewportSize({width:1024,height:768});await page.reload();await attendre(400);
   await nav.aller(page,'j-plan');
   assert.equal(await bouton.getAttribute('aria-expanded'),'false',V+'replié sur un écran étroit');
   const etroit=await boite('#plan'),haut2=await boite('.haut');
   assert.ok(etroit.h/(768-haut2.bas)>=0.75,V+'à 1024 px aussi, le plan d’abord');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,V+'sans débord à 1024 px');

   // 5. Rien à relire : la barre dit pourquoi.
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(400);
   await nav.aller(page,'j-plan');
   assert.equal(await page.locator('#btn-play').isDisabled(),true);
   assert.equal(await page.locator('#run-state').isVisible(),true,V+'la raison se lit');
   assert.match(await page.locator('#run-state').innerText(),/Rien à relire/);
   assert.equal(await page.locator('#sim-curseur').isVisible(),false,V+'ni curseur');
   assert.equal(await page.locator('#vitesse').isVisible(),false,V+'ni vitesse');

   assert.deepEqual(errors,[],V+errors.join(' | '));
  }
  console.log('rejeu-browser : ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

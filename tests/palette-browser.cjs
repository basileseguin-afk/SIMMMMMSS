/* Les finitions (refonte du 08/10, étape 10), v1 et v2 :
 *   1. L'état du calcul dans la barre du haut : « Rien à calculer », puis
 *      « Calcul à jour » dès qu'une équipe prépare, son point qui bat ; il mène
 *      à la synthèse.
 *   2. La palette : Ctrl K l'ouvre (et la referme), le focus est dans son champ ;
 *      sans texte, les gestes et les pages ; quelques lettres sans accents
 *      trouvent une équipe, une commande, une page ; les flèches choisissent,
 *      Entrée ouvre et rend le focus à la page ; Échap ferme ; un clic ouvre.
 *      Elle ne s'ouvre pas pendant la modification du plan.
 *   3. La fiche des raccourcis : « ? » l'ouvre, sauf dans un champ.
 *   4. Le plan rejoué : Espace lit la journée et la met en pause, sauf sur un bouton.
 *   5. Les mouvements : une page qui arrive et la palette qui s'ouvre bougent ;
 *      avec « réduire les animations », plus rien ne bouge.
 * Rien n'est enregistré : les données restent celles d'avant. Aucune capture. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 // Une seule page, comme les autres tests : un navigateur en un seul processus n'en tient qu'une.
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(page,ms=250)=>page.waitForTimeout(ms);
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   const V=version+' : ';
   await page.emulateMedia({reducedMotion:'no-preference'});
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre(page);
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(page,400);
   const ouverte=()=>page.evaluate(()=>{const d=document.querySelector('dialog.palette');return !!(d&&d.open);});
   const options=()=>page.locator('dialog.palette [role=option]').evaluateAll(os=>os.map(o=>({nom:o.querySelector('.pal-nom').textContent,
     indice:(o.querySelector('.pal-indice')||{}).textContent||'',choisi:o.getAttribute('aria-selected')==='true'})));
   const groupes=()=>page.locator('dialog.palette .pal-groupe').allTextContents();
   const etatCalcul=()=>page.locator('#calcul-etat').evaluate(b=>({etat:b.dataset.etat,mot:b.textContent.trim(),bat:b.classList.contains('bat')}));
   // Les données, pas les préférences d'affichage (la page retenue par partie, le service ouvert) :
   // la même règle que donnees-intactes-browser.
   const stockage=()=>page.evaluate(()=>{const pref=/^(ory-v2:)?(ory-menu-pages(-vues)?|ory-service-ouvert|ory-graphes-sens|ory-demarrage-en-cours|ory-ui-.*)$/;
     return JSON.stringify(Object.keys(localStorage).filter(k=>!pref.test(k)).sort().map(k=>[k,localStorage.getItem(k)]));});

   // 1. L'état du calcul.
   assert.deepEqual(await etatCalcul(),{etat:'vide',mot:'Rien à calculer',bat:true},V+'rien à calculer sans équipe');
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
     st.parcours.push({id:'ch',nom:'Chaud',noeuds:['cuisine','prepa','dotation'],liens:[{de:'cuisine',vers:'prepa'},{de:'prepa',vers:'dotation'}]});
     for(const c of ['AF/BC','AF/YC','TX/BC'])st.parcoursClasse[c]='ch';
     const c=(id,nom,service,debut,n)=>({id,nom,service,type:'manuel',debut,jour:0,personnes:n,pauses:[],lots:[['AF/BC'],['AF/YC'],['TX/BC']],regime:{actif:false}});
     st.ateliers.push(c('cu','Cuisine chaud','cuisine','04:00',2),c('mo','Montage du chaud','prepa','05:00',2),c('do','Dotation','dotation','06:00',2));},''));
   await attendre(page);
   assert.deepEqual(await etatCalcul(),{etat:'ok',mot:'Calcul à jour',bat:true},V+'calcul à jour, le point bat');
   await page.locator('#calcul-etat').click();await attendre(page);
   assert.equal(await page.evaluate(()=>document.body.dataset.sous),'j-chiffres',V+'il mène à la synthèse');
   const avant=await stockage();

   // 2. La palette.
   await page.keyboard.press('Control+k');await attendre(page,150);
   assert.ok(await ouverte(),V+'Ctrl K ouvre la palette');
   assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('role')),'combobox',V+'le focus est dans son champ');
   assert.deepEqual(await groupes(),['Gestes','Pages'],V+'sans texte : les gestes et les pages');
   const vide=await options();
   assert.equal(vide[0].nom,'Rejouer la journée');
   assert.ok(vide[0].choisi,V+'la première proposition est choisie');
   for(const p of ['Synthèse','Planning des équipes','Horaires des équipes','Programme des vols'])
     assert.ok(vide.some(o=>o.nom===p),V+'la page « '+p+' »');
   // Une équipe, sans accents ni majuscules.
   await page.keyboard.type('MONTAGE DU');await attendre(page,100);
   let o=await options();
   assert.equal(o[0].nom,'Montage du chaud',V+'l’équipe en tête '+JSON.stringify(o));
   assert.equal(await page.locator('dialog.palette [aria-selected=true] mark').first().textContent(),'Montage',V+'ce qui répond est marqué');
   assert.equal(await page.evaluate(()=>{const c=document.activeElement;return document.getElementById(c.getAttribute('aria-activedescendant')).textContent;}),
     o[0].nom+o[0].indice,V+'le champ dit quelle proposition est choisie');
   await page.keyboard.press('Enter');await attendre(page,400);
   assert.equal(await ouverte(),false,V+'Entrée ferme la palette');
   assert.equal(await page.evaluate(()=>document.body.dataset.sous),'mu-services',V+'… et ouvre la fiche du service de l’équipe');
   assert.equal(await page.evaluate(()=>document.activeElement.closest('.mu-equipe')?.dataset.at),'mo',V+'l’équipe a le focus, à l’écran');
   // Une commande : « af eco » → AF · Économie, son chemin.
   await page.keyboard.press('Control+k');await page.keyboard.type('af eco');await attendre(page,100);
   o=await options();
   assert.deepEqual(o.map(x=>x.nom+' '+x.indice),['AF · Économie AF/YC'],V+'une commande, par son nom en clair');
   await page.keyboard.press('Enter');await attendre(page,300);
   assert.deepEqual(await page.evaluate(()=>[document.body.dataset.sous,Sim.ateliers.parcours.cmd,document.activeElement.id]),['at-chemins','AF/YC','workspace'],
     V+'son chemin, et le focus à la page');
   // Une page, aux flèches.
   await page.keyboard.press('Control+k');await page.keyboard.type('planning');await attendre(page,100);
   o=await options();
   assert.equal(o[0].nom,'Planning des équipes');
   await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowUp');
   assert.ok((await options())[0].choisi,V+'les flèches choisissent');
   await page.keyboard.press('Enter');await attendre(page,300);
   assert.equal(await page.evaluate(()=>document.body.dataset.sous),'at-planning',V+'Entrée ouvre la page');
   // Rien ne répond : on le dit.
   await page.keyboard.press('Control+k');await page.keyboard.type('zzzz');await attendre(page,100);
   assert.equal(await page.locator('dialog.palette [role=option]').count(),0);
   assert.match(await page.locator('dialog.palette .pal-vide').textContent(),/Rien ne répond à « zzzz »/,V+'rien ne répond, et c’est dit');
   // Échap ferme ; Ctrl K referme.
   await page.keyboard.press('Escape');await attendre(page,150);
   assert.equal(await ouverte(),false,V+'Échap ferme');
   await page.keyboard.press('Control+k');await attendre(page,100);await page.keyboard.press('Control+k');await attendre(page,100);
   assert.equal(await ouverte(),false,V+'Ctrl K referme');
   // Le bouton de la barre du haut, et un clic sur une proposition.
   await page.locator('#btn-palette').click();await attendre(page,150);
   assert.ok(await ouverte(),V+'le bouton « Aller à… » l’ouvre');
   await page.keyboard.type('stocks');await attendre(page,100);
   await page.locator('dialog.palette [role=option]').first().click();await attendre(page,300);
   assert.equal(await page.evaluate(()=>document.body.dataset.sous),'j-stocks',V+'un clic ouvre');
   // Pas pendant la modification du plan : le menu non plus n'y mène pas.
   await nav.aller(page,'u-plan');await attendre(page,300);
   await page.keyboard.press('Control+k');await attendre(page,150);
   assert.equal(await ouverte(),false,V+'pas de palette pendant la modification du plan');
   await nav.terminerPlan(page);await attendre(page);
   assert.equal(await stockage(),avant,V+'la palette n’a rien enregistré');

   // 3. La fiche des raccourcis.
   await nav.aller(page,'j-chiffres');await attendre(page);
   await page.evaluate(()=>document.activeElement&&document.activeElement.blur());
   await page.keyboard.press('Shift+?');await attendre(page,150);
   assert.ok(await page.evaluate(()=>document.querySelector('dialog.raccourcis').open),V+'« ? » ouvre la fiche');
   assert.match(await page.locator('dialog.raccourcis').textContent(),/Aller à une page[\s\S]*Lire la journée[\s\S]*Dupliquer la zone/,V+'tous les raccourcis, par endroit');
   await page.keyboard.press('Escape');await attendre(page,150);
   assert.equal(await page.evaluate(()=>document.querySelector('dialog.raccourcis').open),false);
   await nav.aller(page,'mu-services');await attendre(page);
   const champ=page.locator('#mu-services input[type=text]').first();
   await champ.click();await page.keyboard.press('Shift+?');await attendre(page,150);
   assert.equal(await page.evaluate(()=>document.querySelector('dialog.raccourcis').open),false,V+'dans un champ, « ? » s’écrit');
   await page.keyboard.press('Escape');

   // 4. Le plan rejoué : Espace lit et met en pause.
   await nav.aller(page,'j-plan');await attendre(page);
   await page.evaluate(()=>{Sim.vue.auDebut();document.activeElement&&document.activeElement.blur();});
   await page.keyboard.press('Space');await attendre(page,300);
   assert.equal(await page.evaluate(()=>Sim.vue.enMarche),true,V+'Espace lit la journée');
   await page.keyboard.press('Space');await attendre(page,100);
   assert.equal(await page.evaluate(()=>Sim.vue.enMarche),false,V+'Espace la met en pause');
   await page.locator('#btn-reset').focus();await page.keyboard.press('Space');await attendre(page,100);
   assert.equal(await page.evaluate(()=>Sim.vue.enMarche),false,V+'sur un bouton, Espace appuie sur le bouton');

   // 5. Les mouvements, et leur réduction (le réglage du système, émulé).
   for(const reduit of [false,true]){
     const p=page;
     await p.emulateMedia({reducedMotion:reduit?'reduce':'no-preference'});
     await p.reload();await p.waitForTimeout(400);
     await nav.aller(p,'j-chiffres');await p.waitForTimeout(400);
     // Juste après le changement de page : ce qui bouge encore.
     await p.locator('#sous-onglets [data-sous-onglet=at-planning]').click();
     const page1=await p.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length);
     await p.keyboard.press('Control+k');
     const pal=await p.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').map(a=>a.animationName||''));
     const ombre=await p.evaluate(()=>getComputedStyle(document.querySelector('.btn')).transitionDuration);
     if(reduit){
       assert.equal(page1,0,V+'animations réduites : la page arrive sans bouger');
       assert.deepEqual(pal,[],V+'… la palette s’ouvre sans bouger');
       assert.ok(ombre.split(',').every(d=>parseFloat(d)===0),V+'… et les boutons n’ont plus de transition '+ombre);
     }else{
       assert.ok(page1>0,V+'une page qui arrive se fond');
       assert.ok(pal.includes('ds-apparait'),V+'la palette apparaît '+JSON.stringify(pal));
     }
     await p.keyboard.press('Escape');
   }
  }
  assert.deepEqual(errors,[],errors.join(' | '));
  console.log('palette-browser : ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

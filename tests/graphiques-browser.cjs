/* Le planning, la frise des vols et les stocks (refonte du 08/10, étape 9).
 *   1. La palette des données : l'équipe en bleu (d1), l'attente et le blocage
 *      gardent les couleurs d'état ; les barres sont celles d'avant (une par
 *      lot, à sa place sur l'axe).
 *   2. L'étiquette dans la barre quand elle y tient — et seulement alors.
 *   3. L'infobulle : tout de suite au survol, ce que la barre porte ; plus de
 *      <title> natif qui viendrait en double une seconde après.
 *   4. Le trait « maintenant » : rien tant que le rejeu n'a pas bougé ; puis
 *      l'heure rejouée sur le planning, la frise et les stocks, qui suit la
 *      lecture ; le repère d'axe qu'il chevauche s'efface ; au début, tout revient.
 *   5. Les stocks : la valeur à l'heure survolée sur chaque petite courbe, et
 *      le trait sur les deux graphiques de la plonge.
 * v1 et v2. Aucune capture : le plan de l'unité ne s'enregistre jamais. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=300)=>page.waitForTimeout(ms);
 const bulle=()=>page.evaluate(()=>{const b=document.querySelector('.ds-infobulle');return b&&!b.hidden?b.textContent:null;});
 /** Le trait d'un graphique : où il est, ce qu'il dit, et où il devrait être d'après l'axe déclaré. */
 const trait=sel=>page.evaluate(sel=>{const svg=document.querySelector(sel);if(!svg)return 'pas de graphique';
   const g=svg.querySelector(':scope>.ds-maintenant');if(!g)return null;
   const [t0,t1,x0,x1]=svg.dataset.axe.split(' ').map(Number),t=OrlyDS.heure;
   return {x:+g.querySelector('line').getAttribute('x1'),attendu:x0+(t-t0)/(t1-t0)*(x1-x0),texte:g.querySelector('text').textContent,t};},sel);
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   const V=version+' : ';
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   // Une journée : trois équipes sur un chemin, puis le handling.
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
     st.parcours.push({id:'ch',nom:'Chaud',noeuds:['cuisine','prepa','dotation'],liens:[{de:'cuisine',vers:'prepa'},{de:'prepa',vers:'dotation'}]});
     for(const c of ['AF/BC','AF/YC','TX/BC'])st.parcoursClasse[c]='ch';
     const c=(id,nom,service,debut,n)=>({id,nom,service,type:'manuel',debut,jour:0,personnes:n,pauses:[],lots:[['AF/BC'],['AF/YC'],['TX/BC']],regime:{actif:false}});
     st.ateliers.push(c('cu','Cuisine chaud','cuisine','04:00',2),c('mo','Montage','prepa','05:00',2),c('do','Dotation','dotation','06:00',2));},''));
   await page.evaluate(()=>Sim.ateliers.brancherHandling());await attendre();
   await page.evaluate(()=>Sim.vue.auDebut());
   await nav.aller(page,'at-planning');await attendre();

   // 1. La palette des données, et les barres d'avant à leur place.
   const pal=await page.evaluate(()=>{const cs=getComputedStyle(document.documentElement),c=v=>{const d=document.createElement('i');d.style.color=cs.getPropertyValue(v);document.body.append(d);const x=getComputedStyle(d).color;d.remove();return x;};
     const lot=document.querySelector('#at-planning .at-pl-lot:not(.robot):not(.chaine)'),att=document.querySelector('#at-planning .at-pl-attente');
     return {lot:getComputedStyle(lot).fill,d1:c('--ds-d1'),att:att&&getComputedStyle(att).fill,attente:c('--ds-attente')};});
   assert.equal(pal.lot,pal.d1,V+'une équipe prépare en bleu, couleur de donnée');
   assert.equal(pal.att,pal.attente,V+'l’attente garde la couleur d’état');
   const place=await page.evaluate(()=>{const svg=document.querySelector('#at-planning svg'),[t0,t1,x0,x1]=svg.dataset.axe.split(' ').map(Number);
     const lots=Sim.ateliers.resultat.lots.filter(l=>!l.dispo&&l.fin!=null);
     const xs=[...svg.querySelectorAll('.at-pl-lot')].map(r=>+r.getAttribute('x')).sort((a,b)=>a-b);
     const attendus=lots.map(l=>x0+(l.debut-t0)/(t1-t0)*(x1-x0)).sort((a,b)=>a-b);
     return {n:xs.length,attendu:lots.length,ecart:Math.max(0,...xs.map((x,i)=>Math.abs(x-attendus[i])))};});
   assert.equal(place.n,place.attendu,V+'une barre par lot fabriqué');
   assert.ok(place.ecart<0.01,V+'chaque barre à l’heure de son lot '+place.ecart);

   // 2. L'étiquette quand elle tient, et seulement alors.
   const etiq=await page.evaluate(()=>[...document.querySelectorAll('#at-planning .at-pl-etiq')].map(t=>{
     const x=+t.getAttribute('x'),bar=[...document.querySelectorAll('#at-planning .at-pl-lot')].find(r=>Math.abs(+r.getAttribute('x')+5-x)<0.01&&Math.abs(+r.getAttribute('y')+12-t.getAttribute('y'))<0.01);
     return {mot:t.textContent,tient:bar?t.getComputedTextLength()+7<=+bar.getAttribute('width'):false};}));
   assert.ok(etiq.length>=3,V+'des barres portent leur étiquette '+etiq.length);
   assert.ok(etiq.every(e=>e.tient),V+'chaque étiquette tient dans sa barre '+JSON.stringify(etiq.filter(e=>!e.tient)));
   assert.ok(etiq.some(e=>/ · /.test(e.mot)),V+'la commande en clair quand la place le permet');

   // 3. L'infobulle, tout de suite.
   assert.equal(await page.locator('#at-planning svg title').count(),0,V+'plus de <title> natif dans le planning');
   const lot=page.locator('#at-planning .at-pl-lot').first();
   await lot.hover();
   const dit=await bulle();
   assert.ok(dit,V+'la bulle s’ouvre au survol, sans attendre');
   assert.equal(dit,await lot.getAttribute('data-info'),V+'elle dit ce que la barre porte');
   assert.match(dit,/^[A-Z0-9]+ · .+\n\d\d:\d\d → \d\d:\d\d \(\d+ min/,V+'la commande en clair, puis ses heures');
   await page.mouse.move(5,5);await attendre(50);
   assert.equal(await bulle(),null,V+'elle se ferme en quittant la barre');

   // 4. Le trait « maintenant ».
   assert.equal(await trait('#at-planning svg.ds-graphique'),null,V+'pas de trait tant que le rejeu n’a pas bougé');
   assert.equal(await page.locator('#at-planning .ds-legende-maintenant').isVisible(),false,V+'ni sa légende');
   const t=await page.evaluate(()=>{const v=Sim.vue;v.allerA(v.debut+(v.fin-v.debut)*0.4);return v.t;});await attendre(100);
   const tp=await trait('#at-planning svg.ds-graphique');
   assert.ok(tp&&Math.abs(tp.x-tp.attendu)<0.01&&tp.t===t,V+'le trait à l’heure rejouée '+JSON.stringify(tp));
   assert.equal(tp.texte,await page.evaluate(t=>MoteurProduction.hhmm(t),t),V+'l’heure écrite au bout du trait');
   assert.equal(await page.locator('#at-planning .ds-legende-maintenant').isVisible(),true,V+'la légende dit ce qu’il marque');
   // Le repère d'axe chevauché s'efface ; aucun repère visible ne touche l'heure du trait.
   const chevauche=await page.evaluate(()=>{const p=document.querySelector('#at-planning .ds-maintenant rect').getBBox();
     return [...document.querySelectorAll('#at-planning .at-pl-heure')].filter(x=>getComputedStyle(x).opacity!=='0').map(x=>({b:x.getBBox(),s:x.textContent}))
       .filter(({b})=>b.x<p.x+p.width&&b.x+b.width>p.x).map(x=>x.s);});
   assert.deepEqual(chevauche,[],V+'aucun repère sous l’heure du trait');
   // La lecture le fait avancer.
   await page.evaluate(()=>Sim.vue.lancer());await attendre(400);await page.evaluate(()=>Sim.vue.pause());
   const tp2=await trait('#at-planning svg.ds-graphique');
   assert.ok(tp2&&tp2.x>tp.x&&Math.abs(tp2.x-tp2.attendu)<0.01,V+'il suit la lecture');
   // Sur la frise des vols aussi, avec l'heure dessous ; l'avion dit son vol au survol.
   await nav.aller(page,'v-departs');await attendre();
   const tf=await trait('#vols-frise svg.vf-svg');
   assert.ok(tf&&Math.abs(tf.x-tf.attendu)<0.01,V+'le trait sur la frise des vols '+JSON.stringify(tf));
   assert.equal(await page.locator('#vols-frise svg.vf-svg title').count(),0,V+'plus de <title> natif sur la frise');
   const avion=page.locator('#vols-frise .vf-vol circle').first();
   await avion.hover();
   assert.match(await bulle()||'',/^\S+ · départ \d\d:\d\d\n\S/,V+'l’avion dit son vol, son départ, son état');
   await page.mouse.move(5,5);

   // 5. Les stocks : la valeur à l'heure survolée, et le trait.
   await nav.aller(page,'j-stocks');await attendre();
   const sp=page.locator('#journee-stocks .tp-spark').first();
   assert.ok(await sp.count(),V+'des petites courbes de stock');
   const b=await sp.boundingBox();
   await page.mouse.move(b.x+b.width*0.5,b.y+b.height/2);await attendre(50);
   const lu=await page.locator('#journee-stocks .tp-bulle').textContent();
   const m=lu.match(/^À (\d\d):(\d\d) : (\d+) repas en stock$/);
   assert.ok(m,V+'la bulle d’une courbe : '+lu);
   const vrai=await page.evaluate(({h,mn})=>{const svg=document.querySelector('#journee-stocks .tp-spark'),l=Sim.ateliers.resultat.stocks.parLien[+svg.dataset.lien];
     const [t0,t1]=svg.dataset.axe.split(' ').map(Number),t=h*60+mn;return Math.round(MoteurProduction.niveauA(l.serie,t+Math.floor(t0/1440)*1440));},{h:+m[1],mn:+m[2]});
   assert.equal(+m[3],vrai,V+'ce qui est en stock à cette heure, d’après le calcul');
   await page.mouse.move(5,5);
   // Au début de la journée, plus de trait nulle part, et les repères reviennent.
   await page.evaluate(()=>Sim.vue.auDebut());await attendre(100);
   assert.equal(await page.locator('.ds-maintenant').count(),0,V+'au début, le trait s’en va');
   assert.equal(await page.locator('.ds-sous-maintenant').count(),0,V+'et les repères reviennent');

   // Les deux graphiques de la plonge portent l'heure rejouée.
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   await nav.effectifSaisi(page);
   await page.evaluate(()=>{const A=Sim.ateliers;A.changer(()=>{const s=A.state;
     OrlyParcours.creerChemin(s,'TX/BC','complet',false,null,{nomDe:x=>x,classes:A.classes});
     for(const a of s.ateliers){a.debut='01:00';a.personnes=4;}
     s.ateliers.find(a=>a.service==='preparation').debut='04:00';
     s.materiel.actif=true;s.materiel.stockInitial=3000;
     const pl=s.ateliers.find(a=>a.service==='plonge');pl.tunnels=[{nom:'T1',debit:150,personnes:1,actif:true}];pl.regime={actif:false};});});
   await attendre();
   await nav.aller(page,'j-stocks');await attendre();
   assert.equal(await page.locator('#journee-stocks .tp-svg').count(),2,V+'les deux graphiques de la plonge');
   const t3=await page.evaluate(()=>{const s=document.querySelector('#journee-stocks .tp-file'),[t0,t1]=s.dataset.axe.split(' ').map(Number);
     const v=Sim.vue,t=Math.max(v.debut+1,Math.min(v.fin,(t0+t1)/2));v.allerA(t);return v.t;});await attendre(100);
   for(const i of [0,1]){
     const r=await page.evaluate(i=>{const svg=document.querySelectorAll('#journee-stocks .tp-svg')[i],g=svg.querySelector(':scope>.ds-maintenant');
       if(!g)return null;const [t0,t1,x0,x1]=svg.dataset.axe.split(' ').map(Number);return {x:+g.querySelector('line').getAttribute('x1'),attendu:x0+(OrlyDS.heure-t0)/(t1-t0)*(x1-x0)};},i);
     assert.ok(r&&Math.abs(r.x-r.attendu)<0.01,V+'le trait sur le graphique '+(i+1)+' de la plonge '+JSON.stringify({r,t3}));
   }
   await page.evaluate(()=>Sim.vue.auDebut());

   assert.deepEqual(errors,[],V+errors.join(' | '));
  }
  console.log('graphiques-browser : ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

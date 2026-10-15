/* Une équipe de plonge en plus (retour d'usage du 15/10 : « l'équipe de plonge
 * actuelle fait l'après-midi, je voudrais ajouter celle du matin »).
 *   1. Une plonge qui a déjà son équipe garde « + Ajouter une équipe de plonge »
 *      (un bouton secondaire) ; la frise dit les retours qui attendent l'après-midi.
 *   2. Un clic : « Plonge matin », au premier retour sans équipe, lave comme la
 *      première (par vol, mêmes temps, mêmes tunnels). Sa fiche vient en haut, le
 *      curseur dans son heure, que la notification ne cache pas ; elle le dit,
 *      avec « Annuler ».
 *   3. Le calcul : le matin lave les retours du matin, chaque vol une fois, et un
 *      tunnel ne lave jamais deux vols à la fois, même quand les postes se chevauchent.
 *   4. La frise suit les règles des graphiques : ds-graphique et data-info (pas de
 *      <title>), l'équipe en couleur de donnée (d1), les retours sans équipe en
 *      attente ; elle dit que les deux équipes se passent leurs tunnels.
 *   5. L'heure se tape au clavier ; le mode de lavage vaut pour toute la plonge ;
 *      « Annuler » retire l'équipe. Rien d'autre n'est écrit. v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=(ms=300)=>page.waitForTimeout(ms);
 const M='#mu-services',F=M+' .mu-retours';
 // Les préférences d'affichage ne sont pas des données (comme donnees-intactes).
 const PREFERENCES=/^(ory-v2:)?(ory-menu-pages(-vues)?|ory-service-ouvert|ory-graphes-sens|ory-demarrage-en-cours|ory-ui-.*)$/;
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   const V=version+' : ';
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   // L'unité : la plonge par vol de l'après-midi, deux tunnels ; les retours de la veille.
   await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;st.materiel.actif=true;st.materiel.retours='j1';
     st.ateliers=st.ateliers.filter(a=>a.service!=='plonge');
     st.ateliers.push({id:'pl-apm',nom:'Plonge',service:'plonge',type:'lavage',debut:'13:00',jour:0,personnes:3,pauses:[],lots:[],regime:{actif:true,presence:480},
       plafond:0,parVol:true,durees:{'*':30,AF:40},tunnels:[{nom:'Tunnel 1',debit:300,personnes:1,actif:true},{nom:'Tunnel 2',debit:300,personnes:2,actif:true}]});},''));
   await attendre();
   const cleAteliers=await page.evaluate(()=>Object.keys(localStorage).find(k=>/ory-ateliers-v1$/.test(k)));
   const autres=()=>page.evaluate(([cle,re])=>Object.fromEntries(Object.keys(localStorage).filter(k=>k!==cle&&!new RegExp(re).test(k)).sort().map(k=>[k,localStorage.getItem(k)])),[cleAteliers,PREFERENCES.source]);
   const avant=await autres();

   // 1. La plonge et son équipe de l'après-midi.
   await nav.aller(page,'mu-services');await page.locator(`${M} [data-mu-choisir=plonge]`).click();await attendre();
   const ajout=page.locator(`${M} [data-mu-action=equipe]`);
   assert.equal(await ajout.count(),1,V+'le bouton reste quand la plonge a son équipe');
   assert.equal(await ajout.innerText(),'+ Ajouter une équipe de plonge');
   assert.equal(await ajout.evaluate(b=>b.classList.contains('btn-play')),false,V+'un bouton secondaire : ce n’est pas le geste attendu de la page');
   assert.match(await page.locator(`${M} .mu-ajout:has([data-mu-action=equipe])`).innerText(),/elle lave comme « Plonge », à ses heures/);
   assert.match(await page.locator(F).innerText(),/retours? arrivent? sans équipe de plonge .* attend(ent)? « Plonge » \(13:00\)\. Une autre équipe les? laverait plus tôt/,V+'la frise dit ce qui attend');

   // 4 (avant l'ajout). Les règles des graphiques.
   const frise=page.locator(`${F} svg.mu-retours-frise`);
   assert.equal(await frise.evaluate(s=>s.classList.contains('ds-graphique')),true,V+'un graphique du système');
   assert.equal(await frise.locator('title').count(),0,V+'plus de <title> natif');
   assert.ok(await frise.locator('.mr-retour.seul[data-info]').count()>0,V+'des retours sans équipe, chacun avec son infobulle');
   const couleurs=await page.evaluate(()=>{
     const jeton=n=>{const d=document.createElement('div');d.style.color='var('+n+')';document.body.appendChild(d);const c=getComputedStyle(d).color;d.remove();return c;};
     const e=document.querySelector('#mu-services .mr-equipe'),s=document.querySelector('#mu-services .mr-retour.seul');
     return {equipe:getComputedStyle(e).stroke,d1:jeton('--ds-d1'),seul:getComputedStyle(s).fill,attente:jeton('--ds-attente')};});
   assert.equal(couleurs.equipe,couleurs.d1,V+'l’équipe à la couleur de donnée de l’équipe');
   assert.equal(couleurs.seul,couleurs.attente,V+'les retours sans équipe à la couleur d’attente');

   // 2. Un clic : l'équipe du matin.
   const premier=await page.evaluate(()=>{const P=MoteurProduction;
     const t=P.retoursDeVols(Sim.ateliers.a.vols(),Sim.ateliers.state.materiel).map(r=>r.t).filter(t=>t<13*60).sort((a,b)=>a-b)[0];
     return P.hhmm(Math.floor(t/15)*15);});
   await ajout.click();await attendre(400);
   const neuve=await page.evaluate(()=>{const l=Sim.ateliers.state.ateliers.filter(a=>a.service==='plonge');return {n:l.length,a:JSON.parse(JSON.stringify(l[1]||null))};});
   assert.equal(neuve.n,2,V+'une deuxième équipe');
   const a=neuve.a;
   assert.deepEqual([a.nom,a.type,a.debut,a.jour],['Plonge matin','lavage',premier,0],V+'au premier retour sans équipe, nommée par son moment');
   assert.deepEqual([a.parVol,a.durees,a.tunnels.map(t=>t.nom),a.personnes,a.regime],[true,{'*':30,AF:40},['Tunnel 1','Tunnel 2'],3,{actif:true,presence:480}],V+'elle lave comme la première');
   const focus=await page.evaluate(()=>{const e=document.activeElement;return {champ:e.dataset.atChamp,valeur:e.value,equipe:(e.closest('[data-at]')||{}).dataset?.at};});
   assert.deepEqual(focus,{champ:'debut',valeur:premier,equipe:a.id},V+'le curseur dans son heure');
   const vue=await page.evaluate(id=>{const c=document.querySelector(`[data-at="${id}"] [data-at-champ="debut"]`).getBoundingClientRect(),n=document.querySelector('#notifs .notif');
     const t=n&&n.getBoundingClientRect();return {haut:c.top,bas:c.bottom,hauteur:innerHeight,cache:!!t&&!(c.right<t.left||c.left>t.right||c.bottom<t.top||c.top>t.bottom)};},a.id);
   assert.ok(vue.haut>0&&vue.bas<vue.hauteur,V+'son heure est à l’écran '+JSON.stringify(vue));
   assert.equal(vue.cache,false,V+'la notification ne la cache pas');
   const notif=page.locator('#notifs .notif').last();
   // La notification met des espaces insécables avant « : » et dans les guillemets.
   const texte=async l=>(await l.innerText()).replace(/\u00a0/g,' ');
   assert.match(await texte(notif.locator('.notif-texte')),/« Plonge matin » ajoutée, de \d\d:\d\d à \d\d:\d\d : elle lave comme « Plonge » \(mêmes tunnels, mêmes temps par vol\)/);
   assert.equal(await notif.locator('.notif-annuler').count(),1,V+'avec « Annuler »');
   assert.match(await page.locator(`[data-at="${a.id}"] .at-relais`).innerText(),/Les tunnels du même nom que ceux de « Plonge » sont les mêmes machines/);

   // 3. Le calcul.
   const calcul=await page.evaluate(id=>{const P=MoteurProduction,r=Sim.ateliers.resultat,st=Sim.ateliers.state;
     const cles=new Map(st.ateliers.filter(x=>x.type==='lavage').map(x=>[x.id,P.machinesDesTunnels(x,P.tunnelsQuiTournent(x).tournent)]));
     const laves=r.lots.filter(l=>l.retourVol&&l.fin!=null);
     const parM=new Map();for(const l of laves){const k=cles.get(l.atelier)[l.tunnel-1];(parM.get(k)||parM.set(k,[]).get(k)).push(l);}
     let doubles=0;for(const ls of parM.values()){ls.sort((x,y)=>x.debut-y.debut);for(let i=1;i<ls.length;i++)if(ls[i].debut<ls[i-1].fin-1e-9)doubles++;}
     return {laves:laves.length,vols:new Set(laves.map(l=>l.vol)).size,matin:laves.filter(l=>l.atelier===id&&l.debut<13*60).length,
       doubles,mixte:(r.anomalies||[]).some(x=>x.code==='plonge-mixte'),tunnels:(r.plonge||{}).tunnels};},a.id);
   assert.equal(calcul.vols,calcul.laves,V+'chaque vol lavé une fois');
   assert.ok(calcul.matin>0,V+'le matin lave les retours du matin '+JSON.stringify(calcul));
   assert.equal(calcul.doubles,0,V+'un tunnel ne lave jamais deux vols à la fois');
   assert.equal(calcul.tunnels,2,V+'deux tunnels, pas quatre');
   assert.equal(calcul.mixte,false);

   // 4. La frise : deux équipes, dans l'ordre des heures, qui se passent leurs tunnels.
   assert.deepEqual(await page.locator(`${F} .mr-equipe`).evaluateAll(l=>l.map(r=>r.getAttribute('data-info').split('\n')[0])),['Plonge matin','Plonge']);
   assert.match(await page.locator(F).innerText(),/« Plonge matin » et « Plonge » sont là ensemble de 13:00 à \d\d:\d\d : elles se passent les tunnels Tunnel 1 et Tunnel 2 ; chacun ne lave qu’un vol à la fois/);
   // L'infobulle se ferme quand la page défile : la frise d'abord à l'écran, puis le survol.
   await page.locator(F).scrollIntoViewIfNeeded();await attendre(150);
   await page.locator(`${F} .mr-equipe`).first().hover();await attendre(150);
   assert.match(await page.evaluate(()=>{const b=document.querySelector('.ds-infobulle');return b&&!b.hidden?b.textContent:'';}),/^Plonge matin\n.*→.*3 personnes\n2 tunnels tournent : Tunnel 1, Tunnel 2 · lave par vol$/,V+'l’infobulle du système');
   await page.mouse.move(5,5);

   // 5. L'heure au clavier, dans le champ où est le curseur.
   const heure=page.locator(`[data-at="${a.id}"] [data-at-champ="debut"]`);
   await heure.fill('0530');await heure.press('Enter');await attendre();
   assert.equal(await page.evaluate(id=>Sim.ateliers.state.ateliers.find(x=>x.id===id).debut,a.id),'05:30',V+'« 0530 » donne 05:30');
   assert.match(await page.locator(F).innerText(),/05:30 → 13:30/);
   // Le mode de lavage vaut pour toute la plonge ; « Annuler » le défait pour les deux.
   await page.locator(`[data-at="pl-apm"] [data-at-champ="plonge-mode"]`).selectOption('debit');await attendre();
   assert.deepEqual(await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(x=>x.service==='plonge').map(x=>!!x.parVol)),[false,false],V+'les deux équipes passent au débit');
   assert.match(await texte(page.locator('#notifs .notif .notif-texte').last()),/Les 2 équipes de la plonge lavent maintenant au débit/);
   await page.locator('#notifs .notif-annuler').last().click();await attendre();
   assert.deepEqual(await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(x=>x.service==='plonge').map(x=>[!!x.parVol,x.durees])),[[true,{'*':30,AF:40}],[true,{'*':30,AF:40}]],V+'Annuler rend la façon de laver et les temps');
   // Annuler deux fois (l'heure, puis l'ajout) : la plonge retrouve sa seule équipe.
   await page.evaluate(()=>{Sim.ateliers.histoire(false);Sim.ateliers.histoire(false);});await attendre();
   assert.deepEqual(await page.evaluate(()=>Sim.ateliers.state.ateliers.filter(x=>x.service==='plonge').map(x=>x.nom)),['Plonge'],V+'retirée par Annuler');

   // Rien d'autre n'est écrit.
   assert.deepEqual(await autres(),avant,V+'aucune autre donnée ne bouge');
   assert.deepEqual(errors,[],V+errors.join(' | '));
  }
  console.log('plonge-equipes-browser : ok');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

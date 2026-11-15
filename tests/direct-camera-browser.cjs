/* Évolution 16 (b) — la caméra de la vue en direct, dans la page (v1).
 * Le plan rejoué s'ouvre « En relief » : le site généré d'après les réglages,
 * vu par une projection orthogonale, à l'angle de la maquette, la scène entière
 * dans la zone visible à 24 px de ses bords. On tourne (360°), on incline (de
 * 25° à 80°), on se déplace et on zoome : à la souris, au clavier, aux boutons,
 * au doigt. Tant qu'on n'a ni déplacé ni zoomé, la scène tient entière à tout
 * angle. Les étiquettes gardent leur taille et ne se recouvrent pas ; les murs
 * dessinés sont ceux du fond. « À plat » montre le plan dessiné, avec les mêmes
 * données ; un plan dont des zones sont à des coordonnées négatives y tient
 * entier sur « Tout voir ». Chaque étape attend son effet, pas un délai.
 * Unité et vols fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const MARGE=24,proche=(a,b,mot,t=1.5)=>assert.ok(Math.abs(a-b)<=t,mot+' : '+a+' ≠ '+b);

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[];
 /** Une page sur l'unité fictive, le plan rejoué ouvert en relief. */
 const ouvrir=async(contexte,sauvegarde)=>{
   const ctx=await browser.newContext(contexte),page=await ctx.newPage();
   page.on('pageerror',e=>erreurs.push(e.message));
   const x=await F.charger(page,nav,URL,{pageId:'j-plan',relief:true,...(sauvegarde?{sauvegarde}:{})});
   await page.waitForFunction(()=>window.Sim&&Sim.direct&&Sim.direct.etatVue().images>0&&Sim.direct.etatVue().zones.length>0);
   return {ctx,page,x};
 };
 try{
  for(const [W,H] of [[1280,800],[1920,1000]]){
   const V=W+' px : ',{ctx,page,x}=await ouvrir({viewport:{width:W,height:H}});
   const etat=()=>page.evaluate(()=>Sim.direct.etatVue());
   const pose=async()=>{await page.waitForFunction(()=>!Sim.direct.etatVue().enMouvement);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));return etat();};
   const toile=page.locator('#direct-toile'),cadre=await toile.boundingBox();
   const bouton=async(nom,n=1)=>{for(let i=0;i<n;i++)await page.locator(`#direct-cmd [data-direct-cmd=${nom}]`).click();return pose();};
   const touche=async(k,n=1)=>{await toile.focus();for(let i=0;i<n;i++)await page.keyboard.press(k);return pose();};
   const auSol=(X,Y)=>page.evaluate(([X,Y])=>{const e=Sim.direct.etatVue();return OrlyDirectCamera.auSol(e.camera,e.ecran,X,Y);},[X,Y]);
   const aLEcran=p=>page.evaluate(p=>Sim.direct.ecranDe(p.x,p.y,0),p);
   /** La scène tient entière dans la zone visible, à 24 px de ses bords. */
   const tient=(e,mot)=>{
     const v={x0:e.ecran.gauche,y0:e.ecran.haut,x1:e.ecran.w-e.ecran.droite,y1:e.ecran.h-e.ecran.bas},b=e.emprise;
     assert.ok(e.tient,mot+' : la scène tient');
     // La marge du cadrage : 24 px, et jamais plus de 4 % du petit côté de la toile (évolution 16, retouches) ; plus aucune
     // bande n'est gardée libre : la scène remplit la toile.
     const M=e.marge;
     assert.ok(M>0&&M<=MARGE&&M<=0.04*Math.min(e.ecran.w,e.ecran.h)+1e-6,mot+' : la marge ('+M+')');
     assert.deepEqual([e.ecran.haut,e.ecran.bas,e.ecran.gauche,e.ecran.droite],[0,0,0,0],mot+' : aucune bande gardée libre');
     assert.ok(b.x0>=v.x0+M-0.6&&b.y0>=v.y0+M-0.6&&b.x1<=v.x1-M+0.6&&b.y1<=v.y1-M+0.6,mot+' : à sa marge des bords ('+[b.x0,b.y0,b.x1,b.y1].map(Math.round)+' dans '+[v.x0,v.y0,v.x1,v.y1]+')');
     assert.ok(Math.min(b.x0-v.x0,v.x1-b.x1,b.y0-v.y0,v.y1-b.y1)<M+1,mot+' : au plus grand');
   };
   const tailles=e=>e.etiquettes.map(l=>[l.id,l.w,l.h]);

   // 1. À l'ouverture : en relief, à l'angle de la maquette ; la toile remplace le plan dessiné ; la scène tient entière.
   const e0=await pose();
   assert.equal(await page.evaluate(()=>document.body.dataset.direct),'relief',V+'la page s’ouvre en relief');
   assert.deepEqual([await toile.isVisible(),await page.locator('#plan').isVisible()],[true,false],V+'la toile à la place du plan dessiné');
   assert.deepEqual(await page.locator('#direct-choix [data-direct-mode]').evaluateAll(l=>l.map(b=>[b.textContent,b.getAttribute('aria-pressed')])),[['En relief','true'],['À plat','false']]);
   assert.deepEqual([e0.camera.cap,Math.round(e0.camera.site*100)/100,e0.ajustee],[45,35.26,true],V+'l’angle de la maquette');
   assert.deepEqual([e0.ecran.w,e0.ecran.h],[Math.round(cadre.width),Math.round(cadre.height)]);
   tient(e0,V+'à l’ouverture');
   // Une zone par service qui a un atelier ; une étiquette par zone : le nom seul, en petit — sauf celle du goulot du
   // moment, qui dit sa phrase puis « n au travail / n présents » et ses lots à faire (évolution 16 e, puis retouches).
   assert.ok(e0.zones.length>=6&&e0.zones.includes('food')&&e0.zones.includes('plonge'),V+e0.zones.join(' '));
   assert.deepEqual(e0.etiquettes.map(l=>l.id),e0.zones);
   const chiffres=l=>l.lignes.find(x=>/^\d+ au travail \/ \d+ présents?$/.test(x))||null,zoneGoulot=e0.goulot.zone;
   for(const l of e0.etiquettes){
     if(l.id===zoneGoulot)assert.ok(chiffres(l)&&!l.compacte,V+l.titre+' : la zone du goulot dit ses chiffres : '+l.lignes.join(' | '));
     else assert.ok(l.compacte&&l.lignes.length===0,V+l.titre+' : le nom seul, en petit : '+l.lignes.join(' | '));
   }
   assert.ok(e0.etiquettes.find(l=>l.id===zoneGoulot).lignes.some(x=>/^\d+ lots? à faire$/.test(x)),V+'des lots à faire devant le goulot');
   assert.deepEqual(e0.recouvrements,[],V+'aucune étiquette n’en recouvre une autre');
   // Les chiffres des étiquettes sont ceux de la journée à l'heure rejouée (direct-etat.js, les indicateurs).
   const lus=await page.evaluate(()=>{const v=Sim.direct,e=OrlyDirectEtat.etatA(v.journee,v.t);return v.site.zones.map(z=>{const n=z.services.reduce((s,id)=>{const x=e.services[id]||{auTravail:0,presents:0,lots:0};return [s[0]+x.auTravail,s[1]+x.presents,s[2]+x.lots];},[0,0,0]);return n[1]||n[2]?n[0]+' au travail / '+n[1]+(n[1]>1?' présents':' présent'):null;});});
   assert.deepEqual(e0.etiquettes.map(chiffres),lus.map((x,i)=>e0.zones[i]===zoneGoulot?x:null));

   // 2. Les murs dessinés sont ceux du fond : à l'écran, plus haut que le milieu de leur zone.
   const mursDerriere=async(e,mot)=>{
     const m=await page.evaluate(()=>{const v=Sim.direct,z=v.site.zones.find(x=>x.id==='food'),Y=(x,y)=>v.ecranDe(x,y,0)[1];
       return {centre:Y(z.x+z.w/2,z.y+z.h/2),x0:Y(z.x,z.y+z.h/2),x1:Y(z.x+z.w,z.y+z.h/2),y0:Y(z.x+z.w/2,z.y),y1:Y(z.x+z.w/2,z.y+z.h)};});
     for(const c of ['x0','x1','y0','y1'])assert.equal(e.murs[c],m[c]<m.centre-0.01,mot+' : le mur '+c+' est dessiné si et seulement s’il est au fond');
     assert.equal(e.murs.x0&&e.murs.x1,false);assert.equal(e.murs.y0&&e.murs.y1,false);
   };
   await mursDerriere(e0,V+'à l’ouverture');
   assert.deepEqual(e0.murs,{x0:true,x1:false,y0:true,y1:false});

   // 3. Tourner et incliner sans déplacer ni zoomer : la scène tient encore entière, à quatre angles ; les étiquettes
   //    gardent leur taille et ne se recouvrent pas ; les murs suivent.
   const angles=[];
   for(const [faire,cap,site] of [[()=>bouton('droite',6),135,35.26],[()=>touche('e',6),225,35.26],[async()=>{await bouton('haut',2);return touche('a',2);},195,55.26],[()=>bouton('gauche',14),345,55.26]]){
     const e=await faire(),mot=V+'cap '+cap+'°';
     assert.deepEqual([e.camera.cap,Math.round(e.camera.site*100)/100,e.ajustee],[cap,site,true],mot);
     tient(e,mot);
     assert.deepEqual(e.recouvrements,[],mot+' : aucune étiquette n’en recouvre une autre');
     assert.deepEqual(tailles(e),tailles(e0),mot+' : les étiquettes gardent leur taille');
     await mursDerriere(e,mot);
     angles.push(e.camera.cap);
   }
   assert.deepEqual(angles,[135,225,195,345]);
   // L'inclinaison s'arrête à 80° et à 25°.
   assert.equal(Math.round((await bouton('haut',6)).camera.site*100)/100,80,V+'80° au plus');tient(await etat(),V+'à 80°');
   assert.equal(Math.round((await touche('PageDown',9)).camera.site*100)/100,25,V+'25° au moins');tient(await etat(),V+'à 25°');
   // « Tout voir » : l'angle de la maquette, la scène entière.
   const tout=await bouton('tout');
   assert.deepEqual([tout.camera.cap,Math.round(tout.camera.site*100)/100,tout.ajustee],[45,35.26,true]);tient(tout,V+'« Tout voir »');
   proche(tout.camera.zoom,e0.camera.zoom,V+'le zoom de l’ouverture',0.01);

   // 4. À la souris. Glisser déplace : le sol suit le pointeur.
   const p0={x:Math.round(cadre.width*0.5),y:Math.round(cadre.height*0.5)},souris=(x,y)=>page.mouse.move(cadre.x+x,cadre.y+y);
   const saisi=await auSol(p0.x,p0.y);
   await souris(p0.x,p0.y);await page.mouse.down();await souris(p0.x+40,p0.y+10);await souris(p0.x+90,p0.y+35);await page.mouse.up();
   const glisse=await pose(),ou=await aLEcran(saisi);
   proche(ou[0],p0.x+90,V+'glisser : X');proche(ou[1],p0.y+35,V+'glisser : Y');
   assert.deepEqual([glisse.camera.cap,glisse.ajustee,glisse.camera.zoom],[45,false,tout.camera.zoom],V+'glisser ne tourne ni ne zoome');
   // Maj + glisser tourne et incline (0,4° et 0,3° par pixel) ; le bouton droit aussi.
   await page.keyboard.down('Shift');await souris(p0.x,p0.y);await page.mouse.down();await souris(p0.x+25,p0.y+10);await souris(p0.x+50,p0.y+20);await page.mouse.up();await page.keyboard.up('Shift');
   const tourne=await pose();
   proche(tourne.camera.cap,45+50*0.4,V+'Maj + glisser tourne',0.01);proche(tourne.camera.site,35.264+20*0.3,V+'Maj + glisser incline',0.01);
   await souris(p0.x,p0.y);await page.mouse.down({button:'right'});await souris(p0.x-30,p0.y);await souris(p0.x-50,p0.y);await page.mouse.up({button:'right'});
   proche((await pose()).camera.cap,45,V+'le bouton droit tourne',0.01);
   assert.equal(await page.evaluate(()=>{const e=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});document.getElementById('direct-toile').dispatchEvent(e);return e.defaultPrevented;}),true,V+'pas de menu au bouton droit');
   // La molette zoome autour du pointeur.
   const avantRoue=await etat(),sous=await auSol(200,150);
   await souris(200,150);await page.mouse.wheel(0,-240);
   const roue=await pose(),ici=await aLEcran(sous);
   assert.ok(roue.camera.zoom>avantRoue.camera.zoom*1.3,V+'la molette zoome');proche(ici[0],200,V+'autour du pointeur : X');proche(ici[1],150,V+'autour du pointeur : Y');
   await page.mouse.wheel(0,240);proche((await pose()).camera.zoom,avantRoue.camera.zoom,V+'la molette dézoome',0.01);

   // 5. Au clavier : les flèches ou ZQSD déplacent (48 px), A et E tournent (15°), + et − zooment, 0 montre tout.
   await bouton('tout');
   const repere=await auSol(p0.x,p0.y);
   for(const [k,dx,dy] of [['ArrowLeft',48,0],['ArrowUp',0,48],['ArrowRight',-48,0],['ArrowDown',0,-48],['q',48,0],['z',0,48],['d',-48,0],['s',0,-48]]){
     const avant=await aLEcran(repere);await touche(k);const apres=await aLEcran(repere);
     proche(apres[0]-avant[0],dx,V+'touche '+k+' : X');proche(apres[1]-avant[1],dy,V+'touche '+k+' : Y');
   }
   assert.equal((await etat()).ajustee,false,V+'se déplacer quitte le cadrage');
   const c1=await etat();
   assert.equal((await touche('a')).camera.cap,30,V+'A tourne à gauche');assert.equal((await touche('e',2)).camera.cap,60,V+'E tourne à droite');
   proche((await touche('+')).camera.zoom,c1.camera.zoom*1.25,V+'+ zoome',0.01);proche((await touche('-',2)).camera.zoom,c1.camera.zoom/1.25,V+'− dézoome',0.01);
   const zero=await touche('0');
   assert.deepEqual([zero.camera.cap,zero.ajustee],[45,true],V+'0 : tout voir');tient(zero,V+'la touche 0');
   // Aux boutons : −, +.
   proche((await bouton('plus')).camera.zoom,zero.camera.zoom*1.25,V+'le bouton +',0.01);proche((await bouton('moins',2)).camera.zoom,zero.camera.zoom/1.25,V+'le bouton −',0.01);

   // 6. Un clic sur une zone choisit son service ; « Cadrer » le fait tenir à 24 px des bords, à l'angle courant.
   await bouton('tout');await bouton('droite',2);
   const cuisine=await page.evaluate(()=>{const v=Sim.direct,z=v.site.zones.find(x=>x.id==='cuisine');return {ecran:v.ecranDe(z.x+z.w/2,z.y+z.h/2,0),boite:OrlyDirectScene.boiteDeZone(z)};});
   await page.mouse.click(cadre.x+cuisine.ecran[0],cadre.y+cuisine.ecran[1]);
   await page.waitForFunction(()=>Sim.direct.etatVue().selection==='cuisine');
   await page.waitForFunction(()=>!!document.querySelector('#direct-panneau-corps .dp-detail[data-service="cuisine"]'));
   assert.equal(await page.locator('#zone-picker').inputValue(),'cuisine',V+'le service choisi est celui de la page (le panneau ouvre son détail)');
   const cadree=await bouton('cadrer'),zb=await page.evaluate(b=>{const e=Sim.direct.etatVue();return OrlyDirectCamera.emprise(e.camera,e.ecran,b);},cuisine.boite);
   assert.deepEqual([cadree.camera.cap,cadree.ajustee],[75,false],V+'« Cadrer » garde l’angle');
   assert.ok(cadree.camera.zoom>tout.camera.zoom*1.5,V+'« Cadrer » s’approche');
   assert.ok(zb.x0>=cadree.marge-0.6&&zb.y0>=cadree.ecran.haut+cadree.marge-0.6&&zb.x1<=cadree.ecran.w-cadree.marge+0.6&&zb.y1<=cadree.ecran.h-cadree.ecran.bas-cadree.marge+0.6,V+'la zone cadrée tient à sa marge des bords');
   // Choisir dans la liste des services du panneau choisit aussi dans la scène (en relief, elle remplace « Voir un
   // service », évolution 16 e) ; sans service choisi, « Cadrer » montre tout.
   await page.locator('#direct-panneau-corps [data-direct-retour]').click();
   await page.waitForFunction(()=>Sim.direct.etatVue().selection===null);
   await page.locator('#direct-panneau-corps .dq-personnes [data-direct-service="plonge"]').click();
   await page.waitForFunction(()=>Sim.direct.etatVue().selection==='plonge');
   await page.locator('#direct-panneau-corps [data-direct-retour]').click();
   await page.waitForFunction(()=>Sim.direct.etatVue().selection===null);
   const sans=await bouton('cadrer');
   assert.deepEqual([sans.camera.cap,sans.ajustee],[45,true]);tient(sans,V+'« Cadrer » sans service choisi');

   // 7. Les deux thèmes : les couleurs de la scène sont celles des jetons ; la toile suit.
   // Des points du sol des zones, loin de leurs îlots, de leurs machines, des personnes et des chariots, hors de toute
   // étiquette (celles des services, des avions, les mots de la scène) : la plupart ont exactement la couleur du jeton.
   const pixel=()=>page.evaluate(()=>{const v=Sim.direct,e=v.etatVue(),r=devicePixelRatio||1,pris=[...e.etiquettes,...e.vols,...e.circule.marques],mobiles=[...e.personnes,...e.circule.chariots],out=[];
     for(const z of v.site.zones){
       const meubles=[...(z.lignes||[]),...(z.tunnels||[]),...(z.rayonnages||[]),...v.ilots.filter(i=>i.zone===z.id)];
       for(const fx of [0.15,0.3,0.5,0.7,0.85])for(const fy of [0.15,0.3,0.5,0.7,0.85]){
         const x=z.x+z.w*fx,y=z.y+z.h*fy,p=v.ecranDe(x,y,0);
         if(p[0]<4||p[1]<4||p[0]>e.ecran.w-4||p[1]>e.ecran.h-4)continue;
         if(pris.some(q=>p[0]>=q.x-3&&p[0]<=q.x+q.w+3&&p[1]>=q.y-3&&p[1]<=q.y+q.h+3))continue;
         if(meubles.some(m=>x>=m.x-1.5&&x<=m.x+m.w+1.5&&y>=m.y-1.5&&y<=m.y+m.h+1.5)||mobiles.some(m=>Math.hypot(m.x-x,m.y-y)<1.5))continue;
         out.push('rgb('+[...v.toile.getContext('2d').getImageData(Math.round(p[0]*r),Math.round(p[1]*r),1,1).data].slice(0,3).join(',')+')');}}
     return out;});
   const duJeton=(l,c)=>l.length>=5&&l.filter(x=>x===c).length>=Math.ceil(l.length*0.6);
   const clair=await pose(),pxClair=await pixel();
   assert.ok(duJeton(pxClair,clair.couleurs.zone),V+'le sol d’une zone a la couleur de son jeton : '+pxClair+' / '+clair.couleurs.zone);
   await page.evaluate(()=>{document.documentElement.dataset.theme='sombre';});
   await page.waitForFunction(c=>Sim.direct.etatVue().couleurs&&Sim.direct.etatVue().couleurs.zone!==c,clair.couleurs.zone);
   const sombre=await pose(),pxSombre=await pixel();
   assert.notEqual(sombre.couleurs.fond,clair.couleurs.fond);assert.notEqual(sombre.couleurs.texte,clair.couleurs.texte);
   assert.ok(duJeton(pxSombre,sombre.couleurs.zone),V+'thème sombre : le sol suit : '+pxSombre+' / '+sombre.couleurs.zone);
   assert.deepEqual(sombre.recouvrements,[]);tient(sombre,V+'thème sombre');
   await page.evaluate(()=>{delete document.documentElement.dataset.theme;});
   await page.waitForFunction(c=>{const k=Sim.direct.etatVue().couleurs;return !!k&&k.zone===c;},clair.couleurs.zone);

   // 8. « À plat » : le plan dessiné, avec les mêmes données et la même heure ; « En relief » retrouve la scène et sa caméra.
   const heure=await page.locator('#horloge').textContent();
   await bouton('droite',1);
   await page.locator('#direct-choix [data-direct-mode=plat]').click();
   await page.waitForFunction(()=>document.body.dataset.direct==='plat');
   assert.deepEqual([await toile.isVisible(),await page.locator('#plan').isVisible(),await page.locator('#direct-cmd').isVisible()],[false,true,false],V+'à plat : le plan dessiné');
   assert.deepEqual(await page.locator('#direct-choix [data-direct-mode]').evaluateAll(l=>l.map(b=>b.getAttribute('aria-pressed'))),['false','true']);
   assert.equal(await page.locator('#horloge').textContent(),heure,V+'la même heure');
   await page.waitForFunction(()=>[...document.querySelectorAll('#plan .zone .fond')].some(f=>f.getBoundingClientRect().width>0));
   await page.locator('#direct-choix [data-direct-mode=relief]').click();
   await page.waitForFunction(()=>document.body.dataset.direct==='relief');
   assert.equal((await pose()).camera.cap,60,V+'en relief : la caméra est restée');
   assert.deepEqual([await toile.isVisible(),await page.locator('#plan').isVisible()],[true,false]);

   assert.deepEqual(erreurs,[],V+'aucune erreur dans la page');
   x.effacer();await ctx.close();
  }

  // 9. Au doigt : un doigt déplace, deux doigts zooment et tournent.
  {
   const {ctx,page,x}=await ouvrir({viewport:{width:1280,height:800},hasTouch:true});
   const cdp=await ctx.newCDPSession(page),cadre=await page.locator('#direct-toile').boundingBox();
   const etat=()=>page.evaluate(()=>Sim.direct.etatVue());
   const pose=async()=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));return etat();};
   const doigts=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(([x,y],id)=>({x:cadre.x+x,y:cadre.y+y,id}))});
   const c=[cadre.width/2,cadre.height/2],e0=await etat();
   const repere=await page.evaluate(([X,Y])=>{const e=Sim.direct.etatVue();return OrlyDirectCamera.auSol(e.camera,e.ecran,X,Y);},c);
   await doigts('touchStart',[[c[0],c[1]]]);await doigts('touchMove',[[c[0]+30,c[1]+10]]);await doigts('touchMove',[[c[0]+60,c[1]+40]]);await doigts('touchEnd',[]);
   const un=await pose(),ou=await page.evaluate(p=>Sim.direct.ecranDe(p.x,p.y,0),repere);
   proche(ou[0],c[0]+60,'un doigt déplace : X',2);proche(ou[1],c[1]+40,'un doigt déplace : Y',2);
   assert.deepEqual([un.camera.cap,un.camera.zoom,un.ajustee],[e0.camera.cap,e0.camera.zoom,false],'un doigt ne tourne ni ne zoome');
   // Deux doigts qui s'écartent du simple au double : le zoom double. Puis ils tournent d'un quart de tour.
   await doigts('touchStart',[[c[0]-50,c[1]],[c[0]+50,c[1]]]);await doigts('touchMove',[[c[0]-75,c[1]],[c[0]+75,c[1]]]);await doigts('touchMove',[[c[0]-100,c[1]],[c[0]+100,c[1]]]);
   const pince=await pose();
   proche(pince.camera.zoom,un.camera.zoom*2,'deux doigts qui s’écartent zooment',un.camera.zoom*0.02);proche(pince.camera.cap,un.camera.cap,'sans tourner',0.5);
   await doigts('touchMove',[[c[0]-71,c[1]-71],[c[0]+71,c[1]+71]]);await doigts('touchMove',[[c[0],c[1]-100],[c[0],c[1]+100]]);await doigts('touchEnd',[]);
   const tourne=await pose();
   proche(tourne.camera.cap,(un.camera.cap+90)%360,'deux doigts qui tournent font tourner la scène',1);proche(tourne.camera.zoom,pince.camera.zoom,'sans zoomer',pince.camera.zoom*0.02);
   x.effacer();await ctx.close();
  }

  // 10. Avec « réduire les animations » : la vue s'ouvre en pause, et la caméra passe d'un angle à l'autre sans animation ;
  //     sans ce réglage, elle glisse.
  {
   const {ctx,page,x}=await ouvrir({viewport:{width:1280,height:800},reducedMotion:'reduce'});
   assert.equal(await page.evaluate(()=>Sim.vue.enMarche),false,'avec « réduire les animations », la vue s’ouvre en pause');
   const tout=await page.evaluate(()=>{document.querySelector('#direct-cmd [data-direct-cmd=droite]').click();const e=Sim.direct.etatVue();return [e.camera.cap,e.enMouvement];});
   assert.deepEqual(tout,[60,false],'sans animation : la caméra est déjà à son nouvel angle');
   assert.equal(await page.evaluate(()=>{Sim.direct.toutVoir(true);const e=Sim.direct.etatVue();return e.camera.cap===45&&!e.enMouvement;}),true,'« Tout voir » d’un coup');
   x.effacer();await ctx.close();
   const b=await ouvrir({viewport:{width:1280,height:800},reducedMotion:'no-preference'});
   const anime=await b.page.evaluate(()=>{document.querySelector('#direct-cmd [data-direct-cmd=droite]').click();const e=Sim.direct.etatVue();return [e.camera.cap,e.enMouvement];});
   assert.deepEqual(anime,[45,true],'avec animation : la caméra glisse vers son nouvel angle');
   await b.page.waitForFunction(()=>{const e=Sim.direct.etatVue();return !e.enMouvement&&e.camera.cap===60;});
   b.x.effacer();await b.ctx.close();
  }

  // 11. À plat, un plan dont des zones sont à des coordonnées négatives : « Tout voir » le montre entier, à 24 px des bords
  //     — les services, et les autres zones dessinées (un local, ici très à gauche et en haut).
  {
   const sauvegarde=F.sauvegardeFictive(),zones=sauvegarde.contenu['orly-plan-v3'].zones,local=zones.find(z=>z.kind==='room');
   Object.assign(local,{x:-2600,y:-900});delete local.pts;
   Object.assign(zones.find(z=>z.id==='cuisine'),{x:-1400,y:300});
   const {ctx,page,x}=await ouvrir({viewport:{width:1280,height:800}},sauvegarde);
   await page.locator('#direct-choix [data-direct-mode=plat]').click();
   await page.waitForFunction(()=>document.body.dataset.direct==='plat'&&document.getElementById('plan').getBoundingClientRect().width>0);
   const mesure=()=>page.evaluate(id=>{const s=document.getElementById('plan').getBoundingClientRect(),r=e=>{const b=e.getBoundingClientRect();return [b.left-s.left,b.top-s.top,s.right-b.right,s.bottom-b.bottom];};
     const formes=[...document.querySelectorAll('#plan .zone .fond'),...document.querySelectorAll('#plan [data-pe-zone] > :first-child')].filter(e=>e.getBoundingClientRect().width>0);
     return {n:formes.length,jeu:Math.min(...formes.flatMap(r)),local:r(document.querySelector('#plan [data-pe-zone="'+id+'"] > :first-child')),cuisine:r(document.querySelector('#plan .zone[data-id=cuisine] .fond'))};},local.id);
   for(const quand of ['à l’ouverture','sur « Tout voir »']){
     if(quand!=='à l’ouverture'){await page.locator('#plan').focus();await page.keyboard.press('+');await page.locator('#zoom-reset').click();}
     await page.waitForFunction(()=>{const s=document.getElementById('plan').getBoundingClientRect();return [...document.querySelectorAll('#plan [data-pe-zone] > :first-child')].every(e=>e.getBoundingClientRect().left>=s.left);});
     const m=await mesure();
     assert.ok(m.n>=15,quand+' : toutes les zones dessinées ('+m.n+')');
     assert.ok(m.jeu>=MARGE-1,quand+' : tout le plan à 24 px des bords (le plus près : '+Math.round(m.jeu)+' px)');
     proche(Math.min(...m.local),MARGE,quand+' : le local des coordonnées négatives touche la marge',1.5);
     assert.ok(m.cuisine[0]>=MARGE-1&&m.local[0]>=MARGE-1,quand+' : rien n’est coupé à gauche');
   }
   x.effacer();await ctx.close();
  }

  assert.deepEqual(erreurs,[]);
  console.log('direct-camera-browser : ok — en relief à l’ouverture, à l’angle de la maquette, la scène entière à sa marge des bords (1 280 et 1 920 px) ; à quatre angles, à 25° et à 80° ; les étiquettes sans recouvrement, à leur taille ; les murs du fond ; la souris, la molette, le clavier, les boutons, les doigts ; « Cadrer » ; les deux thèmes ; « À plat » et retour ; sans animation ; à plat, un plan aux coordonnées négatives entier');
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

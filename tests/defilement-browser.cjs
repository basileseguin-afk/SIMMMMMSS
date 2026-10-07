/* La page entière ne défile jamais (retour d'usage du 05/10 : « bug de
 * scrolling pour le service Plonge »). Seule la vue défile : l'en-tête et le
 * menu restent en place. Un texte pour lecteur d'écran (.sr-only), posé dans
 * une fiche longue, se calait sur la page et l'allongeait (fiche Plonge avec
 * son équipe, Barème par service) : la molette faisait alors remonter l'en-tête.
 * Toutes les pages, et chaque fiche de service, v1 et v2. Aucune page n'a de
 * « piège à molette » (07/10 : une zone qui garde la molette dans une zone qui
 * défile — Firefox et Safari bloquaient la Liste des services).
 * Et l'on n'est jamais « bloqué en bas » (retour d'usage du 05/10 : « quand je
 * scrolle tout en bas, après je ne peux plus remonter ») : la liste collante de
 * gauche (services, commandes) arrêtait la molette même arrivée au bout. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(150);
 const deborde=()=>page.evaluate(()=>document.documentElement.scrollHeight-innerHeight);
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();

   // 1. La plonge, avec son équipe : la fiche est longue, la page ne bouge pas.
   await nav.aller(page,'mu-services');
   await page.locator('#mu-services [data-mu-choisir=plonge]').click();await attendre();
   await page.locator('#mu-services [data-mu-action=equipe]').click();await page.waitForTimeout(300);
   assert.ok(await page.locator('#mu-services [data-at-champ]').count()>0,'l’équipe de plonge est là');
   assert.equal(await deborde(),0,version+' : la fiche de la plonge n’allonge pas la page');
   const vue=page.locator('#view-ateliers');
   assert.ok(await vue.evaluate(v=>v.scrollHeight>v.clientHeight),'c’est la vue qui défile');
   // La molette, sur la fiche puis sur l'en-tête : l'en-tête reste en place.
   await page.mouse.move(800,600);await page.mouse.wheel(0,800);await attendre();
   assert.ok(await vue.evaluate(v=>v.scrollTop)>0,'la fiche défile');
   await page.mouse.move(700,100);await page.mouse.wheel(0,400);await attendre();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollTop),0,version+' : l’en-tête ne remonte pas');
   assert.equal(await page.locator('#menu').evaluate(m=>Math.round(m.getBoundingClientRect().top)>=0),true);

   // 2. Descendu tout en bas sur la fiche, on remonte la molette sur la liste de
   //    gauche : arrivée en haut, la liste rend la main à la page.
   const remonte=async(id,svc)=>{
    await nav.aller(page,id);if(svc){await page.locator(`#mu-services [data-mu-choisir=${svc}]`).click();}await page.waitForTimeout(250);
    const v=page.locator('#view-'+await page.evaluate(()=>[...document.querySelectorAll('[id^="view-"]')].find(x=>x.offsetParent&&x.scrollHeight>x.clientHeight).id.slice(5)));
    await page.mouse.move(900,500);for(let k=0;k<12;k++){await page.mouse.wheel(0,600);await page.waitForTimeout(40);}await attendre();
    assert.ok(await v.evaluate(x=>x.scrollTop)>100,version+' : '+id+' descend');
    await page.mouse.move(160,500);for(let k=0;k<12;k++){await page.mouse.wheel(0,-600);await page.waitForTimeout(40);}await page.waitForTimeout(300);
    assert.equal(await v.evaluate(x=>x.scrollTop),0,version+' : '+id+' remonte, la souris sur la liste de gauche');
   };
   await remonte('mu-services','plonge');
   await remonte('at-chemins');

   // 2 bis. Sur la Liste des services, et sur chaque service de Services et
   //        équipes (retour d'usage du 07/10 : « le scroll ne marche pas sur la
   //        page liste services, vérifie sur tous les services ») : on descend,
   //        on remonte, la souris sur le contenu puis sur la liste de gauche.
   const bout=async(id,x)=>{const v=page.locator('#view-'+id);await v.evaluate(e=>{e.scrollTop=0;});
     await page.mouse.move(x,600);for(let k=0;k<10;k++){await page.mouse.wheel(0,500);await page.waitForTimeout(25);}await page.waitForTimeout(150);
     const bas=await v.evaluate(e=>[e.scrollTop,e.scrollHeight-e.clientHeight]);
     await page.mouse.move(160,600);for(let k=0;k<14;k++){await page.mouse.wheel(0,-500);await page.waitForTimeout(25);}await page.waitForTimeout(150);
     return [bas,await v.evaluate(e=>e.scrollTop)];};
   await nav.aller(page,'u-services');
   {const [bas,haut]=await bout('flux',900);
    assert.ok(bas[1]>0&&bas[0]>=bas[1]-2,version+' : la Liste des services descend jusqu’en bas '+bas);assert.equal(haut,0,version+' : et remonte');}
   await nav.aller(page,'mu-services');
   for(const s of await page.locator('#mu-services [data-mu-choisir]').evaluateAll(bs=>bs.map(x=>x.dataset.muChoisir))){
    await page.locator(`#mu-services [data-mu-choisir="${s}"]`).click();await page.waitForTimeout(150);
    const [bas,haut]=await bout('ateliers',900);
    if(bas[1]>0)assert.ok(bas[0]>=bas[1]-2,version+' : '+s+' descend jusqu’en bas '+bas);
    assert.equal(haut,0,version+' : '+s+' remonte, la souris sur la liste');
   }

   // 2 ter. Minutes de travail : valider un temps ne ramène plus le tableau en haut
   //        (retour d'usage du 07/10 : « dès que je valide un horaire dans les
   //        man-hours, la page remonte »). Le tableau défile à part : sa place est gardée.
   await nav.aller(page,'rg-recap');await nav.deplier(page);await attendre();
   const zone=page.locator('#rg-recap .rg-recap-scroll');
   const maxi=await zone.evaluate(z=>z.scrollHeight-z.clientHeight);
   assert.ok(maxi>100,version+' : le tableau des minutes défile à part');
   await zone.evaluate(z=>{z.scrollTop=Math.round((z.scrollHeight-z.clientHeight)/2);});await attendre();
   const place=await zone.evaluate(z=>z.scrollTop);
   const champ=await page.evaluateHandle(()=>{const z=document.querySelector('#rg-recap .rg-recap-scroll'),q=z.getBoundingClientRect();
     return [...z.querySelectorAll('input[type=number]')].find(i=>{const r=i.getBoundingClientRect();return r.top>q.top+40&&r.bottom<q.bottom-10;});});
   await champ.asElement().fill('17');await champ.asElement().press('Enter');await page.waitForTimeout(400);
   assert.equal(await page.locator('#rg-recap .rg-recap-scroll').evaluate(z=>z.scrollTop),place,version+' : après Entrée, le tableau reste où il était');

   // 3. Toutes les pages du menu.
   const ids=await page.evaluate(()=>Object.values(OrlyOnglets.ONGLETS).flat().map(o=>o.id).filter(id=>OrlyOnglets.partieDe(id)));
   // Et aucun piège à molette (07/10, Liste des services) : une zone qui « sait »
   // défiler et garde la molette (overscroll-behavior contain/none), posée dans
   // une zone qui défile. Chrome passe outre quand elle n'a rien à défiler ;
   // Firefox et Safari, non : la page ne bouge plus.
   const pieges=()=>page.evaluate(()=>{const sc=e=>/(auto|scroll)/.test(getComputedStyle(e).overflowY);
     const nom=e=>(e.id?'#'+e.id:'')+(typeof e.className==='string'&&e.className?'.'+e.className.trim().split(/\s+/)[0]:'')||e.tagName;const out=[];
     for(const e of document.querySelectorAll('body *')){if(e.offsetParent===null)continue;const st=getComputedStyle(e);
       if(!sc(e)||!/(contain|none)/.test(st.overscrollBehaviorY)||st.position==='fixed')continue;
       let x=e.parentElement;while(x&&x!==document.body){if(sc(x)&&x.scrollHeight>x.clientHeight+2){out.push(nom(e)+' dans '+nom(x));break;}x=x.parentElement;}}
     return out;});
   for(const id of ids){await nav.aller(page,id);assert.equal(await deborde(),0,version+' : '+id+' allonge la page');
     assert.deepEqual(await pieges(),[],version+' : '+id+' : une zone garde la molette');}

   // 4. Chaque fiche de service.
   await nav.aller(page,'mu-services');
   for(const s of await page.locator('#mu-services [data-mu-choisir]').evaluateAll(bs=>bs.map(x=>x.dataset.muChoisir))){
    await page.locator(`#mu-services [data-mu-choisir="${s}"]`).click();await attendre();
    assert.equal(await deborde(),0,version+' : la fiche de '+s+' allonge la page');
   }
  }
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('defilement-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

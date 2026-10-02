/* La liste des commandes (Mon unité › Une commande) défile seule et garde sa
 * position (retour d'usage du 02/10 : « bug de scrollage sur la barre de
 * gauche ») : le champ de recherche n'est plus recouvert, un clic en bas de
 * liste ne la ramène plus en haut, et une commande ouverte d'ailleurs y est
 * amenée en vue. v1 et v2. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 const L='.pc-cmds-liste';
 const haut=()=>page.evaluate(L=>document.querySelector(L).scrollTop,L);
 const actifVisible=()=>page.evaluate(L=>{const u=document.querySelector(L),a=u.querySelector('.pc-cmd.actif');if(!a)return false;
   const r=a.getBoundingClientRect(),q=u.getBoundingClientRect();return r.top>=q.top-1&&r.bottom<=q.bottom+1;},L);
 try{
  for(const [fichier,version] of [['../index.html','v1'],['../v2/index.html','v2']]){
   await page.goto(pathToFileURL(path.resolve(__dirname,fichier)).href);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre();
   await nav.aller(page,'at-chemins');await attendre();

   // 1. Chaque bloc à sa place : la liste commence sous la recherche, et c'est elle qui défile.
   const g=await page.evaluate(L=>{const b=s=>document.querySelector(s).getBoundingClientRect();const u=document.querySelector(L);
     return {cherche:b('.pc-cmds-cherche').bottom,liste:b(L).top,cadre:b('.pc-cmds').bottom,listeBas:b(L).bottom,deborde:u.scrollHeight>u.clientHeight};},L);
   assert.ok(g.cherche<=g.liste,version+' : la recherche n’est pas recouverte '+JSON.stringify(g));
   assert.ok(g.listeBas<=g.cadre,version+' : la liste reste dans son cadre');
   assert.ok(g.deborde,version+' : la liste est assez longue pour défiler');

   // 2. Molette, puis clic sur une commande visible : la liste ne bouge pas.
   const box=await page.locator(L).boundingBox();
   await page.mouse.move(box.x+100,box.y+100);await page.mouse.wheel(0,900);await attendre();
   const avant=await haut();assert.ok(avant>0,version+' : la molette fait défiler la liste');
   const i=await page.evaluate(L=>{const u=document.querySelector(L),q=u.getBoundingClientRect();
     return [...u.querySelectorAll('[data-pc-action=cmd]')].findIndex(x=>{const r=x.getBoundingClientRect();return r.top>q.top+20&&r.bottom<q.bottom-20;});},L);
   await page.locator(L+' [data-pc-action=cmd]').nth(i).click();await attendre();
   assert.equal(await haut(),avant,version+' : un clic ne ramène pas la liste en haut');
   assert.ok(await actifVisible(),version+' : la commande cliquée reste en vue');

   // 3. Ouverte d'ailleurs (la première, liste en bas) : la liste l'amène en vue, la page ne bouge pas.
   await page.evaluate(L=>{const u=document.querySelector(L);u.scrollTop=u.scrollHeight;},L);
   const premiere=await page.evaluate(()=>document.querySelector('.pc-cmds-liste [data-pc-action=cmd]').dataset.classe);
   await page.evaluate(c=>Sim.ateliers.parcours.ouvrir(c),premiere);await attendre();
   assert.ok(await actifVisible(),version+' : la commande ouverte est amenée en vue');
  }
  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('liste-commandes-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

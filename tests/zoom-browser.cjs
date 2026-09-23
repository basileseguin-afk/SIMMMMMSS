/* Le zoom doit permettre de s'approcher du carreau, de cadrer un atelier d'un
 * geste, et de ne jamais perdre le plan hors de l'écran. */
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 /* Un point du plan qui ne tombe sur AUCUN atelier. Des coordonnées en dur
  * cassaient dès qu'une bande s'ajoutait au-dessus du plan. */
 const videDuPlan=()=>page.evaluate(()=>{
   const plan=document.getElementById('plan');
   const b=plan.getBoundingClientRect();
   // Test de touche exact : ce que le navigateur trouve sous le point est ce
   // que le double-clic atteindra. Une boîte englobante s'en approcherait mal
   // — les zones sont parfois des polygones.
   for(let y=b.bottom-14;y>b.top+14;y-=7){
     for(let x=b.left+14;x<b.right-14;x+=7){
       const el=document.elementFromPoint(x,y);
       // Le gestionnaire vise `.zone` : c'est donc `.zone` qu'il faut éviter.
       if(el&&plan.contains(el)&&!el.closest('.zone'))return{x,y};
     }
   }
   return null;
 });
 const vue=()=>page.evaluate(()=>{const t=document.getElementById('viewport').getAttribute('transform');const [,x,y,k]=t.match(/translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)/);return{x:+x,y:+y,k:+k};});
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  // Le site s'ouvre sur l'étape à faire ensuite : ce parcours travaille sur le plan.
  const versPlan=async()=>{await page.locator('#etapes [data-view=plan]').click();await page.waitForTimeout(120);};await versPlan();
  assert.equal((await vue()).k,1);

  // 1. Le pas des boutons est fin, et la borne haute est large.
  await page.locator('#zoom-in').click();
  assert.ok(Math.abs((await vue()).k-1.25)<1e-6,'un cran = 1,25×');
  for(let i=0;i<30;i++)await page.locator('#zoom-in').click();
  assert.equal((await vue()).k,16,'borne haute à 16×');
  for(let i=0;i<40;i++)await page.locator('#zoom-out').click();
  assert.equal((await vue()).k,0.5,'borne basse à 0,5×');

  // 2. Double-clic sur un atelier : il est cadré et sélectionné.
  await page.locator('#zoom-reset').click();
  await page.locator('.zone[data-id=cuisine]').dblclick();
  const cadre=await vue();
  assert.ok(cadre.k>1,'le double-clic rapproche');
  assert.equal(await page.locator('#zone-picker').inputValue(),'cuisine');
  // Le centre de l'écran tombe bien sur la cuisine.
  const centre=await page.evaluate(()=>{const z=Sim.editor.state.zones.find(z=>z.id==='cuisine');return{cx:z.x+z.w/2,cy:z.y+z.h/2};});
  const VUE={x:300,y:320,w:4340,h:2140};
  assert.ok(Math.abs((VUE.x+VUE.w/2-cadre.x)/cadre.k-centre.cx)<1,'cuisine centrée en x');
  assert.ok(Math.abs((VUE.y+VUE.h/2-cadre.y)/cadre.k-centre.cy)<1,'cuisine centrée en y');

  // 3. Le bouton de cadrage retrouve le même cadre que le double-clic.
  await page.locator('#zoom-reset').click();
  await page.locator('#zoom-fit').click();
  assert.deepEqual(await vue(),cadre,'« cadrer » = cadrage du service sélectionné');

  // 4. Double-clic hors atelier et touche 0 : retour à l'ensemble.
  const vide=await videDuPlan();
  assert.ok(vide,'le plan doit avoir un endroit sans atelier');
  await page.mouse.dblclick(vide.x,vide.y);
  assert.deepEqual(await vue(),{x:0,y:0,k:1});
  await page.locator('#zoom-in').click();
  await page.locator('#plan').focus();await page.keyboard.press('0');
  assert.deepEqual(await vue(),{x:0,y:0,k:1},'la touche 0 revient à l’ensemble');
  await page.keyboard.press('+');assert.ok((await vue()).k>1,'la touche + zoome');

  // 5. Le plan ne peut pas être poussé hors de l'écran.
  await page.locator('#zoom-reset').click();
  for(let i=0;i<60;i++)await page.keyboard.press('ArrowLeft');
  const derive=await vue();
  const cx=(VUE.x+VUE.w/2-derive.x)/derive.k;
  assert.ok(cx<=VUE.x+VUE.w*1.35+1,'le centre reste à portée du plan');
  await page.keyboard.press('0');

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('zoom-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

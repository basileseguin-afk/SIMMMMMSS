/* Ce qu'on installe sur la grille doit piloter le moteur, comme les personnes :
 * tunnels de la plonge et lignes robot du montage. */
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const click=s=>page.locator(s).click();
 const cfg=()=>page.evaluate(()=>({tunnels:Sim.cfg.tunnels,robotLignes:Sim.cfg.robotLignes}));
 const screen=async(c)=>page.evaluate(c=>{const p=document.getElementById('plan').createSVGPoint();p.x=(c[0]+.5)*Sim.workshops.state.step;p.y=(c[1]+.5)*Sim.workshops.state.step;const q=p.matrixTransform(document.getElementById('workshop-layer').getScreenCTM());return{x:q.x,y:q.y};},c);
 // Pose un équipement d'une case sur la n-ième case libre du service courant.
 const poser=async(outil,rang)=>{
  const c=await page.evaluate(rang=>{const w=Sim.workshops,z=w.zone,s=w.state.step,libres=[];
   for(let y=Math.ceil(z.y/s);y<(z.y+z.h)/s;y++)for(let x=Math.ceil(z.x/s);x<(z.x+z.w)/s;x++)
    if(OrlyWorkshops.cellInside(x+','+y,z,s)&&!w.state.items.some(i=>i.cells.includes(x+','+y)))libres.push([x,y]);
   if(libres.length<=rang)throw Error('Pas assez de cases libres');return libres[rang];},rang);
  await click('[data-wg-tool='+outil+']');
  const p=await screen(c);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x,p.y,{steps:2});await page.mouse.up();
 };
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  assert.deepEqual(await cfg(),{tunnels:3,robotLignes:1},'valeurs par défaut des curseurs');

  // 1. Deux tunnels tracés dans la plonge.
  await click('[data-view=ateliers]');
  await page.locator('.zone[data-id=plonge]').click();
  await poser('tunnel',0);await poser('tunnel',1);

  // 2. Trois lignes robot dans le montage.
  await page.locator('#zoom-reset').click();
  await page.locator('.zone[data-id=prepa]').click();
  await poser('robot',0);await poser('robot',1);await poser('robot',2);

  // 3. Tant que la case n'est pas cochée, les curseurs font foi.
  await click('[data-view=reglages]');
  assert.deepEqual(await cfg(),{tunnels:3,robotLignes:1});
  assert.equal(await page.locator('#tunnels').isDisabled(),false);

  // 4. Cochée, la grille pilote les deux et verrouille les curseurs.
  await click('#grille-effectifs');
  assert.deepEqual(await cfg(),{tunnels:2,robotLignes:3},'le tracé fait foi');
  assert.equal(await page.locator('#tunnels').isDisabled(),true);
  assert.equal(await page.locator('#robot-lignes').isDisabled(),true);
  assert.match(await page.locator('#tunnels-val').textContent(),/grille 2/);
  assert.match(await page.locator('#robot-lignes-val').textContent(),/grille 3/);

  // 5. Le moteur en tient compte : trois lignes, c'est trois places.
  await click('[data-view=plan]');await click('#btn-play');
  await page.waitForFunction(()=>Sim.etat().now>Sim.etat().debut+60,null,{timeout:15000});
  assert.equal(await page.evaluate(()=>Sim.etat().modele.bilan().robot.lignes),3);

  // 6. Décochée, on reprend la main.
  await click('#btn-reset');await click('[data-view=reglages]');
  await click('#grille-effectifs');
  assert.equal(await page.locator('#tunnels').isDisabled(),false);
  assert.equal(await page.locator('#robot-lignes').isDisabled(),false);

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('grille-moteur-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

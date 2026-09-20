/* Vérification ciblée des contrastes et de l’aide clavier, pas un audit WCAG exhaustif. */
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const lum=c=>{const a=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return .2126*a[0]+.7152*a[1]+.0722*a[2]};
const ratio=(a,b)=>{a=lum(a);b=lum(b);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});const page=await browser.newPage({viewport:{width:1440,height:1000}});
try{await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
for(const theme of ['light','dark']){
 if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('#btn-theme').click();await page.waitForTimeout(200);
 for(const view of ['plan','ateliers','flux','vols']){
  await page.locator('[data-view='+view+']').click();if(view==='ateliers')await page.locator('#zone-picker').selectOption('cuisine');await page.waitForTimeout(200);
  for(const selector of ['.view-tabs .active','.panel-tabs .active','#btn-play','#btn-theme','#horloge','#wg-new-item','.wg-tools [aria-pressed=true]','.fc-families [aria-pressed=true]']){
   const el=page.locator(selector);if(!await el.count()||!await el.isVisible()||await el.isDisabled())continue;
   const c=await el.evaluate(e=>{let p=e,b;while(p){b=getComputedStyle(p).backgroundColor;if(b!=='rgba(0, 0, 0, 0)')break;p=p.parentElement}return[getComputedStyle(e).color,b]});assert.ok(ratio(...c)>=4.5,`${theme} ${view} ${selector}: ${ratio(...c)}`);
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(view==='ateliers'){const help=page.getByText('Comment construire ?', {exact:true});await help.focus();await page.keyboard.press('Enter');assert.equal(await help.evaluate(e=>e.parentElement.open),true);await page.keyboard.press('Enter');}
  await page.screenshot({path:'/tmp/ory-review-'+theme+'-'+view+'.png'});
 }
}
await page.setViewportSize({width:390,height:844});for(const view of ['plan','ateliers','flux','vols']){await page.locator('[data-view='+view+']').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,view+' mobile');}console.log('Usability passed: key text contrast ≥ 4.5:1 in both themes, keyboard help, four views without horizontal overflow on desktop/mobile.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});

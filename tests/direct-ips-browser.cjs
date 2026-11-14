/* Évolution 16 (b) — la fluidité de la vue en direct (v1).
 * L'objectif : 60 images par seconde sur une unité de 300 personnes et 500
 * chariots, caméra en mouvement. Ce test dresse une unité fictive de cette
 * taille, pose dans la scène 300 personnages et 500 chariots, fait tourner la
 * caméra à chaque image, et mesure : les images par seconde, et le temps de
 * dessin d'une image. Il affiche la mesure ; il n'échoue que sous un garde-fou
 * large (30 images par seconde), pour ne pas dépendre de la machine.
 * Services, équipes et objets fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const PERSONNES=300,CHARIOTS=500,IMAGES=300,OBJECTIF=60,GARDE_FOU=30;
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1920,height:1000}}),erreurs=[];
 page.on('pageerror',e=>erreurs.push(e.message));
 try{
  const x=await F.charger(page,nav,pathToFileURL(path.resolve(__dirname,'../index.html')).href,{pageId:'j-plan',relief:true});
  await page.waitForFunction(()=>window.Sim&&Sim.direct&&Sim.direct.etatVue().images>0);
  // Une unité fictive de 300 personnes : dix services, trois équipes de dix personnes chacun, à l'effectif saisi.
  await nav.effectifSaisi(page);
  const services=await page.evaluate(n=>{
    const ids=['magasin','cuisine','preparation','prepa','armement','dotation','decontam','bobduty','appros','plonge'],st=Sim.ateliers.state;
    Sim.ateliers.changer(()=>{st.ateliers=ids.flatMap(s=>[0,1,2].map(k=>({id:s+'-'+k,nom:'Équipe '+s+' '+(k+1),service:s,type:s==='magasin'?'dispo':s==='plonge'?'lavage':'manuel',debut:'0'+(4+k)+':00',jour:0,
      personnes:n/30,pauses:[],lots:[],regime:{actif:false},...(s==='plonge'?{parVol:true,tunnels:[{nom:'Tunnel '+(k+1),debit:300,personnes:2,actif:true}]}:{})})));},'');
    return ids;
  },PERSONNES);
  await page.waitForFunction(n=>Sim.direct.site&&Sim.direct.site.zones.reduce((s,z)=>s+z.personnes,0)===n,PERSONNES);
  // 300 personnages et 500 chariots posés dans les zones, en rangs : au prorata des personnes de chaque zone.
  const poses=await page.evaluate(([P,C])=>{
    const zones=Sim.direct.site.zones,total=zones.reduce((s,z)=>s+z.personnes,0),objets=[],TONS=['travail','attente','neutre'],NATURES=['repas','equipement','sale'];
    const parts=(n)=>{const l=zones.map(z=>Math.floor(n*z.personnes/total));let r=n-l.reduce((s,v)=>s+v,0);for(let i=0;r>0;i=(i+1)%l.length,r--)l[i]++;return l;};
    const grille=(z,n,quoi,ton,x0,x1)=>{const w=(x1-x0)*z.w,cols=Math.max(1,Math.ceil(Math.sqrt(n*w/Math.max(1,z.h-2)))),rangs=Math.ceil(n/cols);
      for(let i=0;i<n;i++)objets.push({quoi,ton:ton(i),couche:1,bob:0,x:z.x+x0*z.w+(i%cols+0.5)*w/cols,y:z.y+1+(Math.floor(i/cols)+0.5)*(z.h-2)/rangs});};
    const p=parts(P),c=parts(C);
    zones.forEach((z,k)=>{grille(z,p[k],'personne',i=>TONS[i%3],0.05,0.5);grille(z,c[k],'chariot',i=>NATURES[i%3],0.55,0.95);});
    window.__objets=objets;Sim.direct.extras=()=>window.__objets;
    return {personnes:objets.filter(o=>o.quoi==='personne').length,chariots:objets.filter(o=>o.quoi==='chariot').length,zones:zones.length};
  },[PERSONNES,CHARIOTS]);
  assert.deepEqual([poses.personnes,poses.chariots],[PERSONNES,CHARIOTS],'300 personnages et 500 chariots dans la scène');
  // La caméra en mouvement : un degré et demi par image, un léger zoom, les personnages qui bougent ; chaque image est dessinée.
  const m=await page.evaluate(n=>new Promise(fin=>{
    const v=Sim.direct,temps=[],dessins=[];let i=0,avant=v.stats.images;
    const image=t=>{
      temps.push(t);if(i>0)dessins.push(v.stats.dernier);
      if(++i>n){const duree=temps[temps.length-1]-temps[0];return fin({images:temps.length-1,duree,ips:(temps.length-1)*1000/duree,dessin:dessins.reduce((s,x)=>s+x,0)/dessins.length,pire:Math.max(...dessins),dessinees:v.stats.images-avant});}
      for(const o of window.__objets)if(o.quoi==='personne')o.bob=Math.sin(t/160+o.x)*1.2;
      v.tourner(1.5,false);if(i===100)v.zoomer(1.4,undefined,undefined,false);if(i===200)v.toutVoir(false);
      requestAnimationFrame(image);
    };
    requestAnimationFrame(image);
  }),IMAGES);
  assert.ok(m.dessinees>=IMAGES-2,'chaque image est dessinée ('+m.dessinees+' sur '+IMAGES+')');
  const fr=x=>String(Math.round(x*10)/10).replace('.',','),ips=fr(m.ips),dessin=fr(m.dessin),pire=fr(m.pire);
  assert.ok(m.ips>=GARDE_FOU,'au moins '+GARDE_FOU+' images par seconde ('+ips+')');
  assert.ok(m.dessin<=1000/GARDE_FOU,'le dessin d’une image tient dans '+Math.round(1000/GARDE_FOU)+' ms ('+dessin+' ms)');
  assert.deepEqual(erreurs,[]);
  console.log('direct-ips-browser : ok — '+PERSONNES+' personnes, '+CHARIOTS+' chariots, '+poses.zones+' zones, caméra en mouvement, 1 920 px : '+ips+' images par seconde (objectif '+OBJECTIF+') ; le dessin d’une image : '
    +dessin+' ms en moyenne, '+pire+' ms au pire (16,7 ms pour 60 images par seconde)');
  x.effacer();
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
})();

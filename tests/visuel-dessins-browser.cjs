/* Évolution 25 (e) — les dessins prennent leurs couleurs dans les jetons (version 1) : le plan, « En direct », les
 * graphes, les courbes, le planning. Sur l'unité fictive et un programme daté fictif, à 1 366 × 768, dans les deux thèmes.
 *   1. Plus aucun bleu nuit ni bleu océan : sur chaque page du menu, sur « En direct » à plat et en relief et sur un
 *      chemin ouvert, aucune couleur calculée d'un élément visible — texte, fond, bordure, contour, remplissage, trait,
 *      ombre, dégradé ; pseudo-éléments compris — n'est l'un des anciens bleus (#0B1A2E, #0D2036, #0B6E99, #38BDF8).
 *   2. Un dessin (SVG) prend ses couleurs dans les jetons : chaque remplissage, chaque trait est la valeur d'un jeton, ou
 *      un mélange calculé par la feuille. Seule exception : les zones libres du plan (une pièce, une annexe), dont la
 *      couleur est une donnée du plan, posée par un script commun (plan-editor.js) qui n'est pas modifié.
 *   3. Un texte posé dans un dessin tient 4,5:1 sur le fond réellement dessous.
 *   4. Les classes ont les couleurs de (a) : Équipage d1, Économie d2, Premium d3, Business d4, repas spéciaux d6.
 *   5. La vue en trois dimensions lit ses teintes dans les jetons (`--dv-…`, direct.css) : aucune n'est un ancien bleu ;
 *      sa scène, sa caméra et ses gestes ne sont pas touchés.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const RACINE=path.resolve(__dirname,'..'),URL_V1=pathToFileURL(path.join(RACINE,'index.html')).href;
const ANCIENS_BLEUS={'#0B1A2E':'11, 26, 46','#0D2036':'13, 32, 54','#0B6E99':'11, 110, 153','#38BDF8':'56, 189, 248'};
/** Les noms de tous les jetons (les propriétés `--…` des feuilles de la version 1) : la page dira leur valeur. */
const JETONS=[...new Set(fs.readdirSync(RACINE).filter(f=>f.endsWith('.css')).flatMap(f=>[...fs.readFileSync(path.join(RACINE,f),'utf8').matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map(m=>m[1])))];
/** Les teintes de la scène en relief (direct-dessin.js, `JETONS`). */
const SCENE=['fond','sol','couloir','zone','pause','mur','machine','bras','rayonnage','table','peau','travail','attente','neutre','critique','ok','repas','equipement','sale','texte','texte2','etiquette','bordure','choisi','vehicule','avion'];

/** Dans la page : les éléments visibles dont une couleur calculée est un ancien bleu. */
const BLEUS=anciens=>{
  const PROPS=['color','backgroundColor','borderTopColor','borderRightColor','borderBottomColor','borderLeftColor','outlineColor','fill','stroke','backgroundImage','boxShadow','textDecorationColor','caretColor'];
  const vu=e=>{if(!e.getClientRects().length)return false;const b=e.getBoundingClientRect();return b.width>0&&b.height>0&&e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});};
  const ou=e=>e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.classList&&e.classList.length?'.'+[...e.classList].slice(0,2).join('.'):'');
  const trouves=[];let vus=0;
  for(const e of document.querySelectorAll('body *')){
    if(!vu(e))continue;vus++;
    for(const pseudo of [null,'::before','::after']){
      const cs=getComputedStyle(e,pseudo);
      if(pseudo&&(cs.content==='none'||cs.content==='normal'))continue;
      for(const p of PROPS){const v=cs[p];if(!v||v==='none')continue;
        for(const [nom,rvb] of Object.entries(anciens))if(v.includes('rgb('+rvb+')')||v.includes('rgba('+rvb+','))trouves.push(nom+' : '+ou(e)+(pseudo||'')+' {'+p+'}');}
    }
  }
  return {vus,trouves:[...new Set(trouves)]};
};
/** Dans la page : les remplissages et les traits d'un dessin qui ne sont la valeur d'aucun jeton. */
const HORS_JETONS=noms=>{
  const sonde=document.createElement('i');document.body.appendChild(sonde);
  const jetons=new Set(['rgb(0, 0, 0)','rgb(255, 255, 255)']);
  for(const n of noms){sonde.style.color='';sonde.style.color='var('+n+')';if(sonde.style.color)jetons.add(getComputedStyle(sonde).color);}
  sonde.remove();
  const hors=[];let traits=0;
  for(const e of document.querySelectorAll('#workspace svg *')){
    if(!e.getClientRects().length||!e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})||e.closest('defs,marker,pattern,clipPath'))continue;
    const cs=getComputedStyle(e);
    for(const p of ['fill','stroke']){const v=cs[p];
      if(!v||v==='none'||(p==='stroke'&&parseFloat(cs.strokeWidth)===0))continue;
      traits++;
      // Un mélange calculé par la feuille (color-mix, une transparence) se lit « color(srgb …) » ou « rgba(…) » : il vient d'un jeton.
      if(!/^rgb\(/.test(v)||jetons.has(v))continue;
      hors.push(v+' '+(e.closest('.pe-shape')?'[zone libre du plan] ':'')+e.tagName+'.'+[...e.classList].join('.')+' {'+p+'}');}
  }
  return {traits,hors:[...new Set(hors)]};
};
/** Dans la page : les textes d'un dessin sous 4,5:1, sur le fond réellement dessous (les couches composées jusqu'à l'opaque). */
const TEXTES_FAIBLES=()=>{
  const lire=c=>{let m=c.match(/^rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)$/);if(m)return [+m[1],+m[2],+m[3],m[4]===undefined?1:+m[4]];
    m=c.match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)$/);return m?[m[1]*255,m[2]*255,m[3]*255,m[4]===undefined?1:+m[4]]:null;};
  const lum=([r,g,b])=>{const f=v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);};
  const ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05);};
  const fond=(x,y,texte)=>{const couches=[];
    for(const e of document.elementsFromPoint(x,y)){if(e===texte||texte.contains(e))continue;const cs=getComputedStyle(e);let c=null;
      if(e instanceof SVGElement&&e.tagName!=='svg'){if(e.tagName==='text'||e.tagName==='tspan'||e.tagName==='g')continue;c=cs.fill!=='none'?lire(cs.fill):null;if(c)c=[c[0],c[1],c[2],c[3]*(+cs.fillOpacity)*(+cs.opacity)];}
      else{c=lire(cs.backgroundColor);if(c)c=[c[0],c[1],c[2],c[3]*(+cs.opacity)];}
      if(!c||c[3]<=0.01)continue;couches.push(c);if(c[3]>=0.99)break;}
    let rendu=[255,255,255];for(const c of couches.reverse())rendu=[0,1,2].map(i=>c[i]*c[3]+rendu[i]*(1-c[3]));return rendu;};
  const faibles=[];let textes=0;
  for(const t of document.querySelectorAll('#workspace svg text')){
    const b=t.getBoundingClientRect();
    if(!b.width||!b.height||!t.textContent.trim()||!t.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})||b.bottom<0||b.top>innerHeight||b.right<0||b.left>innerWidth)continue;
    const cs=getComputedStyle(t),c=lire(cs.fill);if(!c)continue;
    const x=b.left+b.width/2,y=b.top+b.height/2;
    // Un texte recouvert (une étiquette sous une autre) ne se lit pas : on ne mesure que ce qui se voit.
    if(!document.elementsFromPoint(x,y).some(e=>e===t||t.contains(e)))continue;
    textes++;
    const f=fond(x,y,t),a=c[3]*(+cs.opacity||1),vu=[0,1,2].map(i=>c[i]*a+f[i]*(1-a)),r=ratio(vu,f);
    if(r<4.5)faibles.push(r.toFixed(2)+':1 « '+t.textContent.trim().slice(0,24)+' » '+cs.fill+' sur rgb('+f.map(Math.round).join(', ')+')');
  }
  return {textes,faibles};
};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[],bilan={};
 try{
  for(const theme of ['clair','sombre']){
   const V='thème '+theme+', ';
   const ctx=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});
   const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
   const site=await F.charger(page,nav,URL_V1,{csv:F.volsDatesCsv(3,'2031-03-03'),pageId:'j-chiffres'});
   try{
    await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.unite);
    if(theme==='sombre'){await page.evaluate(()=>{document.documentElement.dataset.theme='sombre';});await page.waitForTimeout(200);}
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme==='sombre'),theme==='sombre');
    let vus=0,traits=0,textes=0,zonesLibres=0;
    /** Une vue : ses bleus, ses dessins, leurs textes. */
    const voir=async nom=>{
      await page.waitForTimeout(500);
      const b=await page.evaluate(BLEUS,ANCIENS_BLEUS);
      assert.ok(b.vus>50,V+nom+' : la page a des éléments visibles');
      assert.deepEqual(b.trouves,[],V+nom+' : plus aucun ancien bleu');
      const h=await page.evaluate(HORS_JETONS,JETONS);
      const libres=h.hors.filter(x=>x.includes('[zone libre du plan]'));
      assert.deepEqual(h.hors.filter(x=>!libres.includes(x)),[],V+nom+' : un dessin prend ses couleurs dans les jetons');
      const t=await page.evaluate(TEXTES_FAIBLES);
      assert.deepEqual(t.faibles,[],V+nom+' : un texte dans un dessin tient 4,5:1 sur son fond');
      vus+=b.vus;traits+=h.traits;textes+=t.textes;zonesLibres+=libres.length;
      return {dessin:h.traits,textes:t.textes,libres};
    };
    /* ---- 1 à 3. Chaque page du menu -------------------------------------------------------------------------------- */
    const pages=await page.evaluate(()=>OrlyOnglets.entrees().flatMap(o=>o.pages||[o.id]));
    assert.ok(pages.length>=16,'toutes les pages du menu');
    const parPage={};
    for(const id of pages){await nav.aller(page,id);parPage[id]=await voir(id);}
    // Les dessins sont bien là : le plan, le planning, les stocks ont des traits ; le plan et le planning des textes.
    for(const id of ['j-plan','at-planning','j-stocks'])assert.ok(parPage[id].dessin>10,V+id+' : un dessin ('+parPage[id].dessin+' traits)');
    for(const id of ['j-plan','at-planning'])assert.ok(parPage[id].textes>5,V+id+' : des textes dans le dessin ('+parPage[id].textes+')');
    // Les zones libres du plan gardent la couleur que le plan leur donne (plan-editor.js, commun) : elles sont les seules.
    assert.ok(parPage['j-plan'].libres.length>0&&parPage['j-plan'].libres.every(x=>/rgb\((8, 127, 117|14, 138, 168)\)/.test(x)),V+'le plan : seules les zones libres portent une couleur du plan ('+parPage['j-plan'].libres.join(' | ')+')');
    assert.equal(zonesLibres,parPage['j-plan'].libres.length,V+'aucune autre page n’en montre');
    /* ---- Un chemin ouvert, la période simulée, « En direct » en relief ------------------------------------------------- */
    await nav.aller(page,'mu-flux');await page.locator('#mu-flux .ch-liste [data-mu-flux-choisir="complet"]').click();
    const chemin=await voir('un chemin ouvert');
    assert.ok(chemin.dessin>50&&chemin.textes>=1,V+'le schéma d’un chemin ('+chemin.dessin+' traits, '+chemin.textes+' textes mesurés)');
    await nav.aller(page,'j-plan',{relief:true});await page.waitForTimeout(900);
    const relief=await voir('« En direct » en relief');
    assert.ok(relief.dessin>5,V+'la barre du temps de la vue en relief ('+relief.dessin+' traits)');
    /* ---- 5. La vue en trois dimensions lit ses teintes dans les jetons ------------------------------------------------- */
    const scene=await page.evaluate(noms=>{const hote=document.getElementById('direct'),s=document.createElement('i');hote.appendChild(s);
      const out={};for(const n of noms){s.style.color='';s.style.color='var(--dv-'+n+')';out[n]=s.style.color?getComputedStyle(s).color:null;}s.remove();
      return {teintes:out,toile:!!document.getElementById('direct-toile').getClientRects().length};},SCENE);
    assert.ok(scene.toile,V+'la vue en relief est à l’écran');
    for(const [nom,v] of Object.entries(scene.teintes)){
      assert.ok(v,V+'la scène : la teinte « '+nom+' » est définie');
      for(const [bleu,rvb] of Object.entries(ANCIENS_BLEUS))assert.ok(!v.includes('('+rvb+')'),V+'la scène : « '+nom+' » n’est pas '+bleu);
    }
    assert.ok(new Set(Object.values(scene.teintes)).size>=12,V+'la scène a ses teintes : '+new Set(Object.values(scene.teintes)).size+' différentes');
    /* ---- 4. Les classes aux couleurs de (a) ------------------------------------------------------------------------------ */
    await nav.aller(page,'at-repas');await page.waitForTimeout(300);
    const classes=await page.evaluate(()=>{const s=document.createElement('i');document.body.appendChild(s);const jeton=n=>{s.style.color='var(--'+n+')';return getComputedStyle(s).color;};
      const out={};for(const [cab,d] of Object.entries({CREW:'ds-d1',YC:'ds-d2',PC:'ds-d3',BC:'ds-d4',SPML:'ds-d6'})){
        const p=document.createElement('span');p.className='puce-classe';p.dataset.cab=cab;document.body.appendChild(p);
        out[cab]=[getComputedStyle(p).backgroundColor,jeton(d),jeton('cab-'+cab)];p.remove();}
      s.remove();return out;});
    for(const [cab,[point,donnee,jeton]] of Object.entries(classes))assert.deepEqual([point,jeton],[donnee,donnee],V+'la classe '+cab+' a sa couleur de donnée');
    assert.equal(new Set(Object.values(classes).map(c=>c[0])).size,5,V+'cinq classes, cinq couleurs');
    bilan[theme]={pages:pages.length+2,vus,traits,textes};
   }finally{site.effacer();await ctx.close();}
  }
  assert.deepEqual(erreurs,[],'aucune erreur de page : '+erreurs.join(' | '));
  console.log('OK visuel-dessins : dans les deux thèmes, sur '+bilan.clair.pages+' vues (chaque page du menu, un chemin ouvert, « En direct » en relief), aucun ancien bleu ('+bilan.clair.vus+' et '+bilan.sombre.vus+' éléments vus) ; les dessins prennent leurs couleurs dans les jetons ('+bilan.clair.traits+' remplissages et traits), sauf les zones libres du plan ; leurs textes tiennent 4,5:1 ('+bilan.clair.textes+' textes) ; les classes aux cinq couleurs de donnée ; la scène en relief lit ses teintes dans les jetons');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

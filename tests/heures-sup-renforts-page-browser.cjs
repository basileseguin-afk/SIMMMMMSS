/* Correction 23 (b) — « Détails › Heures sup et renforts » : une page mise en forme comme les autres (version 1), à
 * 1 366 × 768 et 1 920 × 1 080, sur une petite unité fictive où une équipe du montage déborde et où une autre l'aide.
 *   1. Le titre de la page (« Détails ») est au-dessus de la rangée d'onglets, comme sur les autres pages — sur les
 *      quatre onglets de « Détails ».
 *   2. Les deux cartes (« Heures supplémentaires », « Renforts ») ont une marge intérieure : aucun texte à moins de
 *      12 px du bord de sa carte ; une bordure fine, le rayon d'une carte (docs/DESIGN_SYSTEM.md) : 14 px depuis le
 *      nouveau visuel (évolution 25 a ; 8 px avant).
 *   3. Un tableau de trois colonnes ne s'étire pas sur toute la largeur : ses colonnes prennent la largeur de leur
 *      contenu ; les nombres sont à droite.
 *   4. Aucun texte sous 13 px ; la fenêtre ne défile pas.
 * Vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const VOLS_CSV='vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC\n'
  +'NO1,NORD,MOYEN,DEP,15:00,,0,0,100\nSU1,SUD,MOYEN,DEP,15:10,,0,0,100\n'
  +['ES1','ES2','ES3'].map((v,i)=>v+',EST,MOYEN,DEP,15:'+(2+i)+'0,,0,0,100').join('\n')+'\n'
  +['OU1','OU2','OU3'].map((v,i)=>v+',OUEST,MOYEN,DEP,16:'+i+'0,,0,0,100').join('\n')+'\n';
/** Une heure de montage par vol. A : deux vols, finis à 10:00, présente jusqu'à 11:00. B : six vols, présente jusqu'à
 *  13:00 — elle déborde ; A l'aide, puis B finit en heures supplémentaires. */
const UNITE=()=>{
  Sim.reglages.changer(()=>{const e=Sim.reglages.etat;e.bareme={...e.bareme,prepa:{'*/YC':60}};e.regime={seuils:[],presence:480};e.heuresSup={actif:true,plafond:180};e.renforts={actif:true};},'');
  Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
    st.ateliers.push({id:'ma',nom:'Montage A',service:'prepa',type:'manuel',debut:'08:00',jour:0,personnes:1,pauses:[],lots:[['NORD/YC'],['SUD/YC']],regime:{actif:true,presence:180}});
    st.ateliers.push({id:'mb',nom:'Montage B',service:'prepa',type:'manuel',debut:'08:00',jour:0,personnes:1,pauses:[],lots:[['EST/YC'],['OUEST/YC']],regime:{actif:true,presence:300}});
    st.effectifs={prepa:'impose'};},'');
};
/** Dans la page : l'en-tête, les cartes de l'onglet et leurs textes. */
const MESURER=()=>{
  const boite=e=>{const r=e.getBoundingClientRect();return {g:r.left,d:r.right,h:r.top,b:r.bottom,l:r.width};};
  const titre=boite(document.getElementById('tete-titre')),onglets=boite(document.getElementById('onglets-internes'));
  const cartes=[...document.querySelectorAll('#journee-details .panneau')].map(c=>{
    const r=boite(c),cs=getComputedStyle(c),pres=[],marche=document.createTreeWalker(c,NodeFilter.SHOW_TEXT);
    for(let n=marche.nextNode();n;n=marche.nextNode()){
      if(!n.textContent.trim()||!n.parentElement.getClientRects().length)continue;
      const z=document.createRange();z.selectNodeContents(n);
      for(const t of z.getClientRects()){if(!t.width||!t.height)continue;
        const marge=Math.min(t.left-r.g,r.d-t.right,t.top-r.h,r.b-t.bottom);
        if(marge<12-0.5)pres.push(Math.round(marge*10)/10+' px « '+n.textContent.trim().slice(0,24)+' »');}
    }
    const t=c.querySelector('table');
    return {id:c.id,titre:c.querySelector('h3').textContent,pres,rayon:cs.borderTopLeftRadius,bordure:cs.borderTopWidth,interieur:r.l-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight),
      table:t?{largeur:t.getBoundingClientRect().width,colonnes:t.querySelectorAll('thead th').length,lignes:t.querySelectorAll('tbody tr').length,
        nombres:[...t.querySelectorAll('td.num')].map(x=>getComputedStyle(x).textAlign),
        // La place perdue dans chaque colonne : sa largeur moins celle de son contenu le plus large.
        vide:[...t.querySelectorAll('thead th')].map((th,i)=>{const cellules=[th,...[...t.querySelectorAll('tbody tr')].map(tr=>tr.children[i])];
          const contenu=Math.max(...cellules.map(x=>{const z=document.createRange();z.selectNodeContents(x);return Math.max(0,...[...z.getClientRects()].map(q=>q.width));}));
          return Math.round(th.getBoundingClientRect().width-contenu);})}:null};});
  const petits=[...document.querySelectorAll('#workspace *')].filter(e=>e.getClientRects().length&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&!e.closest('svg,[hidden]')&&parseFloat(getComputedStyle(e).fontSize)<13)
    .map(e=>e.tagName+'.'+e.className+' « '+e.textContent.trim().slice(0,20)+' »');
  return {titre,onglets,cartes,petits,fenetre:document.documentElement.scrollHeight-innerHeight,actif:(document.querySelector('#onglets-internes .oi-onglet.actif')||{}).textContent};
};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const erreurs=[],dossier=fs.mkdtempSync(path.join(os.tmpdir(),'ory-hs-rf-'));
 const csv=path.join(dossier,'vols-fictifs.csv');fs.writeFileSync(csv,VOLS_CSV);
 try{
  for(const [largeur,hauteur] of [[1366,768],[1920,1080]]){
   const V=largeur+' × '+hauteur+' : ';
   const ctx=await browser.newContext({viewport:{width:largeur,height:hauteur}});
   const page=await ctx.newPage();page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
   const attendre=(ms=300)=>page.waitForTimeout(ms);
   await page.goto(URL_V1);await attendre();
   await page.evaluate(()=>localStorage.clear());await page.reload();await attendre(500);
   await page.evaluate(UNITE);await attendre();
   await nav.aller(page,'v-programme');
   await page.locator('#imp-vols').setInputFiles(csv);
   await page.waitForFunction(()=>document.getElementById('source-label').textContent==='vols-fictifs.csv');
   await page.waitForFunction(()=>{const r=Sim.ateliers.resultat;return !!r&&r.ok&&(r.renforts||[]).length>0&&r.ateliers.some(a=>a.heuresSup>0);});
   await nav.aller(page,'j-details');await attendre(400);

   const m=await page.evaluate(MESURER);
   assert.equal(m.actif,'Heures sup et renforts');
   /* ---- 1. le titre de la page est au-dessus des onglets ------------------------------------------------------- */
   assert.ok(m.titre.b<=m.onglets.h+0.5,V+'le titre « Détails » est au-dessus de la rangée d’onglets : '+JSON.stringify([m.titre.b,m.onglets.h]));
   assert.equal(await page.locator('#tete-titre').textContent(),'Détails');
   for(const id of ['at-repas','v-departs','j-stocks']){
     await nav.aller(page,id);await attendre(200);
     const t=await page.evaluate(()=>[document.getElementById('tete-titre').getBoundingClientRect().bottom,document.getElementById('onglets-internes').getBoundingClientRect().top,
       document.getElementById('view-intro').getBoundingClientRect().bottom]);
     assert.ok(t[0]<=t[1]+0.5&&t[2]<=t[1]+0.5,V+id+' : le titre et sa phrase, puis les onglets : '+JSON.stringify(t));
   }
   await nav.aller(page,'j-details');await attendre(300);

   /* ---- 2. les deux cartes ont leur marge intérieure ------------------------------------------------------------ */
   assert.deepEqual(m.cartes.map(c=>[c.id,c.titre]),[['bilan-heures-sup','Heures supplémentaires'],['bilan-renforts','Renforts']],V+'les deux cartes');
   for(const c of m.cartes){
     assert.deepEqual(c.pres,[],V+c.titre+' : aucun texte à moins de 12 px du bord de sa carte');
     assert.deepEqual([c.rayon,c.bordure],['14px','1px'],V+c.titre+' : une carte du design system (une bordure fine, un rayon de 14 px)');
   }

   /* ---- 3. un tableau de trois colonnes ne s'étire pas ---------------------------------------------------------- */
   for(const c of m.cartes){
     assert.ok(c.table&&c.table.colonnes===3&&c.table.lignes>=1,V+c.titre+' : son tableau de trois colonnes, avec des lignes : '+JSON.stringify(c.table));
     assert.ok(c.table.largeur<c.interieur-40,V+c.titre+' : le tableau ne s’étire pas sur toute la largeur ('+Math.round(c.table.largeur)+' px dans '+Math.round(c.interieur)+')');
     assert.ok(c.table.vide.every(v=>v<=80),V+c.titre+' : chaque colonne a la largeur de son contenu (place perdue : '+c.table.vide.join(', ')+' px)');
     assert.ok(c.table.nombres.length>=1&&c.table.nombres.every(a=>a==='right'),V+c.titre+' : les nombres à droite');
   }

   /* ---- 4. le reste des règles ---------------------------------------------------------------------------------- */
   assert.deepEqual(m.petits,[],V+'aucun texte sous 13 px');
   assert.equal(m.fenetre,0,V+'la fenêtre ne défile pas');
   // Sans heures sup ni renforts permis : la phrase d'avant, dans la marge de la page.
   await page.evaluate(()=>Sim.reglages.changer(()=>{const e=Sim.reglages.etat;e.heuresSup={actif:false,plafond:180};e.renforts={actif:false};},''));await attendre(500);
   assert.deepEqual([await page.locator('#journee-details .panneau').count(),await page.locator('#details-vide').isVisible()],[0,true],V+'rien à détailler : la phrase');
   await ctx.close();
  }
  assert.deepEqual(erreurs,[],'aucune erreur de page : '+erreurs.join(' | '));
  console.log('OK heures-sup-renforts-page : le titre au-dessus des onglets ; deux cartes avec leur marge intérieure (aucun texte à moins de 12 px du bord) ; des tableaux à la largeur de leur contenu — aux deux tailles');
 }finally{await browser.close();fs.rmSync(dossier,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});

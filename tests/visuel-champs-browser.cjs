/* Évolution 25 (c) — saisi, repris, calculé : trois allures, partout (version 1), sur l'unité fictive et un programme
 * daté fictif, à 1 366 × 768, dans les deux thèmes. Le constat : « on ne distingue pas les données rentrées du texte ».
 *   1. Une fiche de service. Un champ qui porte une valeur saisie : le fond et le trait du saisi, graisse 600. Vidé, il
 *      reprend le fond de carte, et son texte d'attente (la valeur reprise) est en italique, au troisième gris, à
 *      4,5:1 au moins. Un champ sans texte d'attente, vidé, reprend aussi le fond de carte.
 *   2. Une liste déroulante : fond de carte quand son choix est celui par défaut (l'option vide) ; allure de champ saisi
 *      pour tout autre choix.
 *   3. Un nombre calculé, qui ne se modifie pas : du texte, sans cadre ni fond. Un champ désactivé : le fond en retrait,
 *      graisse normale, pas de pêche. Une case à cocher : à l'accent.
 *   4. Le tableau de tous les temps par vol : une valeur propre a l'allure du saisi, une valeur reprise celle du texte
 *      d'attente ; sa légende le dit ; sa recherche, qui n'est pas une donnée, reste neutre même remplie.
 *   5. Les commandes d'une vue (le jour affiché, un filtre) ne sont pas des données : elles gardent le fond de carte.
 *   6. En lecture seule, aucun champ n'a le fond du saisi, sur aucune page restée ouverte.
 * Unité, vols, compagnies et équipes fictifs. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs'),F=require('./plan-rejoue-fictif.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const URL_V1=pathToFileURL(path.resolve(__dirname,'../index.html')).href;

const JETON=noms=>{const s=document.createElement('i');document.body.appendChild(s);const out={};
  for(const n of noms){s.style.color='var(--'+n+')';out[n]=getComputedStyle(s).color;}s.remove();return out;};
/** L'allure d'un champ : son fond, son trait, sa graisse ; son texte d'attente (couleur, style). */
const ALLURE=e=>{const c=getComputedStyle(e),p=getComputedStyle(e,'::placeholder');
  return {fond:c.backgroundColor,trait:c.borderTopColor,graisse:c.fontWeight,valeur:e.value,attente:e.getAttribute('placeholder'),attenteCouleur:p.color,attenteStyle:p.fontStyle};};
const rvb=c=>(c.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
const lum=c=>{const [r,g,b]=rvb(c).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});return 0.2126*r+0.7152*g+0.0722*b;};
const contraste=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05);};

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 try{
  for(const theme of ['clair','sombre']){
   const V='thème '+theme+' : ';
   const ctx=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'});
   const page=await ctx.newPage(),erreurs=[];
   page.on('pageerror',e=>erreurs.push(e.message));page.on('dialog',d=>d.accept());
   const attendre=(ms=300)=>page.waitForTimeout(ms);
   const site=await F.charger(page,nav,URL_V1,{csv:F.volsDatesCsv(3,'2031-03-03'),pageId:'mu-services'});
   try{
    await page.waitForFunction(()=>window.Sim&&Sim.ateliers&&Sim.ateliers.resultat&&Sim.unite&&window.OrlyVisuel);
    if(theme==='sombre')await page.evaluate(()=>{document.documentElement.dataset.theme='sombre';});
    await attendre();
    const j=await page.evaluate(JETON,['ds-saisi-fond','ds-saisi-bord','ds-surface-1','ds-surface-2','ds-bordure-forte','ds-texte-3','ds-accent']);
    const SAISI={fond:j['ds-saisi-fond'],trait:j['ds-saisi-bord'],graisse:'600'},CARTE={fond:j['ds-surface-1'],trait:j['ds-bordure-forte'],graisse:'400'};
    const allure=sel=>page.locator(sel).first().evaluate(ALLURE);
    // (Un champ qui a le clavier porte le trait du focus : `auClavier` laisse alors son trait de côté.)
    const estSaisi=(a,quoi,auClavier)=>assert.deepEqual({fond:a.fond,trait:auClavier?SAISI.trait:a.trait,graisse:a.graisse},SAISI,V+quoi+' : le fond et le trait du saisi, graisse 600 — '+JSON.stringify(a));
    const estRepris=(a,quoi,auClavier)=>assert.deepEqual({fond:a.fond,trait:auClavier?CARTE.trait:a.trait,graisse:a.graisse},CARTE,V+quoi+' : le fond de carte, le trait fort, graisse normale — '+JSON.stringify(a));
    const attenteLisible=(a,quoi)=>{
      assert.deepEqual([a.attenteStyle,a.attenteCouleur],['italic',j['ds-texte-3']],V+quoi+' : le texte d’attente en italique, au troisième gris');
      assert.ok(contraste(a.attenteCouleur,a.fond)>=4.5,V+quoi+' : le texte d’attente tient '+contraste(a.attenteCouleur,a.fond).toFixed(2)+':1');
    };
    assert.notEqual(SAISI.fond,CARTE.fond,V+'le fond du saisi n’est pas celui de la carte');

    /* ---- 1. une fiche de service ----------------------------------------------------------------------------------- */
    await nav.service(page,'cuisine');await attendre();
    const NOM='#mu-services .se-fiche [data-mu-nom]';
    estSaisi(await allure(NOM),'le nom du service, saisi');
    // Ses temps par vol : la valeur commune est saisie ; une valeur propre à une commande, pas encore saisie, est reprise.
    await nav.section(page,'temps');await attendre();
    const communs=await page.locator('#mu-services .se-fiche input[data-rg-champ]').evaluateAll((es,A)=>es.filter(e=>e.getClientRects().length).map(e=>{const a=(new Function('return '+A)())(e);a.champ=e.dataset.rgChamp;return a;}),ALLURE.toString());
    assert.ok(communs.length>=1,V+'la fiche a des champs de temps par vol');
    const remplis=communs.filter(a=>a.valeur!==''),vides=communs.filter(a=>a.valeur==='');
    assert.ok(remplis.length>=1,V+'un temps par vol saisi dans la fiche : '+JSON.stringify(communs.map(a=>[a.champ,a.valeur,a.attente])));
    for(const a of remplis)estSaisi(a,'un temps par vol saisi');
    for(const a of vides){estRepris(a,'un temps par vol repris');attenteLisible(a,'un temps par vol repris');}
    // Une valeur propre à une commande : son champ. Rempli, il a l'allure du saisi ; vidé, il montre en texte d'attente
    // la valeur reprise, sur le fond de carte ; dès la frappe, il reprend l'allure du saisi.
    await page.locator('#mu-services .se-fiche select[data-rg-champ=propre-ajout][data-service="cuisine"]').selectOption({index:1});await attendre(400);
    const PROPRE='#mu-services .se-fiche [data-rg-champ=heures][data-service="cuisine"][data-cle]';
    let a=await allure(PROPRE);
    assert.notEqual(a.valeur,'',V+'la valeur propre porte une valeur');
    estSaisi(a,'une valeur propre, remplie');
    await page.locator(PROPRE).first().fill('');
    a=await allure(PROPRE);
    assert.ok(a.attente&&a.attente.trim(),V+'vidé, le champ montre la valeur reprise en texte d’attente : « '+a.attente+' »');
    estRepris(a,'le même champ, vidé',true);attenteLisible(a,'la valeur reprise');
    await page.locator(PROPRE).first().pressSequentially('1.5');
    estSaisi(await allure(PROPRE),'le même champ, dès la frappe',true);
    await page.locator(PROPRE).first().press('Enter');await attendre(400);
    estSaisi(await allure(PROPRE),'le même champ, enregistré');
    // Un champ sans texte d'attente (le nom) : vidé, il reprend aussi le fond de carte ; la page n'en change pas le texte.
    assert.equal((await allure(NOM)).attente.trim(),'',V+'le nom n’a pas de texte d’attente');
    const nom=await page.locator(NOM).inputValue();
    await page.locator(NOM).fill('');
    estRepris(await allure(NOM),'le nom, vidé',true);
    await page.locator(NOM).fill(nom);
    estSaisi(await allure(NOM),'le nom, remis',true);

    /* ---- 2. une liste déroulante --------------------------------------------------------------------------------- */
    await nav.section(page,'avance').catch(()=>{});await page.evaluate(()=>document.querySelectorAll('#mu-services .se-fiche details:not([open])').forEach(d=>{d.open=true;}));await attendre();
    const POSTE='#mu-services .se-fiche label.site-poste select';
    a=await allure(POSTE);
    assert.equal(a.valeur,'',V+'« Postes de travail » : le choix par défaut (l’option vide)');
    estRepris(a,'une liste sur son choix par défaut');
    await page.locator(POSTE).selectOption('tables');await attendre(400);
    estSaisi(await allure(POSTE),'la même liste, sur un autre choix');
    await page.locator(POSTE).selectOption('');await attendre(400);
    estRepris(await allure(POSTE),'la même liste, revenue au choix par défaut');
    // Une liste dont chaque option est une valeur (ce que fait le service) : elle porte toujours une valeur.
    estSaisi(await allure('#mu-services .se-fiche label.mu-nature select'),'une liste sans choix par défaut');

    /* ---- 3. calculé, désactivé, case à cocher ----------------------------------------------------------------------- */
    const equipe=await page.evaluate(()=>Sim.ateliers.state.ateliers.find(x=>x.service==='cuisine').id);
    await nav.reglagesEquipe(page,equipe);await attendre(400);
    const calcule=await page.locator('#mu-services .at-pers-calc output').first().evaluate(e=>{const c=getComputedStyle(e);return {texte:e.textContent.trim(),bord:c.borderTopStyle==='none'||c.borderTopWidth==='0px',fond:c.backgroundColor};});
    assert.deepEqual([calcule.texte,calcule.bord,calcule.fond],['calculé',true,'rgba(0, 0, 0, 0)'],V+'un nombre calculé : du texte, sans cadre ni fond');
    const coche=await page.locator('#mu-services input[type=checkbox]').first().evaluate(e=>getComputedStyle(e).accentColor);
    assert.equal(coche,j['ds-accent'],V+'une case à cocher : à l’accent');
    // Un champ désactivé (un réglage qui ne joue pas) : le fond en retrait, graisse normale.
    await nav.aller(page,'rg-simulation');await attendre();
    await page.locator('#view-reglages .rs-liste [data-rs-choisir="heures-sup"]').click();await attendre();
    const inactif=await page.evaluate(A=>{const e=[...document.querySelectorAll('#view-reglages input:disabled:not([type=checkbox]):not([type=radio])')].find(x=>x.getClientRects().length);return e?(new Function('return '+A)())(e):null;},ALLURE.toString());
    assert.ok(inactif,V+'un champ désactivé dans « Heures supplémentaires »');
    assert.deepEqual([inactif.fond,inactif.graisse],[j['ds-surface-2'],'400'],V+'un champ désactivé : le fond en retrait, graisse normale, pas de pêche');

    /* ---- 4. le tableau de tous les temps par vol -------------------------------------------------------------------- */
    await nav.aller(page,'mu-services');await page.locator('#mu-services .se-tous-temps').click();
    await page.waitForSelector('#mu-services .se-fiche[data-se-vue="temps"] .rg-recap-table tbody tr');await attendre(500);
    const T='#mu-services .se-fiche[data-se-vue="temps"] ';
    estSaisi(await allure(T+'td.rgr.propre input'),'une valeur propre du tableau');
    // Une cellule vide, qui montre en texte d'attente la valeur de toutes les compagnies.
    a=await allure(T+'td.rgr.commun input:placeholder-shown');
    assert.deepEqual([a.valeur,!!a.attente.trim()],['',true],V+'une cellule vide du tableau montre la valeur reprise : « '+a.attente+' »');
    estRepris(a,'une valeur reprise du tableau');attenteLisible(a,'une valeur reprise du tableau');
    // Sa légende reprend ce code : « valeur propre » sur le fond du saisi, « toutes compagnies » en italique gris ; son aide le dit.
    const legende=await page.evaluate(sel=>{const l=document.querySelector(sel+'.rg-recap-legende'),lire=c=>{const e=l.querySelector(c),s=getComputedStyle(e);return [e.textContent.trim(),s.backgroundColor,s.borderTopColor,s.fontWeight,s.fontStyle,s.color];};
      return {propre:lire('.rgr.propre'),commun:lire('.rgr.commun'),aide:document.querySelector(sel+'.aide-corps .se-temps-code').textContent.replace(/\s+/g,' ').trim()};},T);
    assert.deepEqual(legende.propre.slice(0,4),['valeur propre',SAISI.fond,SAISI.trait,'600'],V+'la légende : « valeur propre » sur le fond du saisi');
    assert.deepEqual([legende.commun[0],legende.commun[4],legende.commun[5]],['toutes compagnies','italic',j['ds-texte-3']],V+'la légende : « toutes compagnies » en italique gris');
    assert.match(legende.aide,/^Fond pêche : une valeur saisie ; italique gris : la valeur reprise\./,V+'l’aide du tableau dit ce code');
    // Sa recherche n'est pas une donnée : remplie, elle garde le fond de carte.
    await page.locator('#rg-recap-filtre').fill('NORD');await attendre(300);
    a=await allure('#rg-recap-filtre');
    assert.deepEqual([a.valeur,a.fond,a.graisse],['NORD',j['ds-surface-1'],'400'],V+'une recherche remplie reste neutre');
    await page.locator('#rg-recap-filtre').fill('');await attendre(200);

    /* ---- 5. les commandes d'une vue ---------------------------------------------------------------------------------- */
    await nav.aller(page,'v-departs');await attendre();
    for(const [sel,quoi] of [['#periode-jour','le jour affiché'],['#flight-filter','le filtre des vols']]){
      a=await allure(sel);
      assert.notEqual(a.valeur,'',V+quoi+' porte un choix');
      assert.deepEqual([a.fond,a.graisse],[j['ds-surface-1'],'400'],V+quoi+' n’est pas une donnée : le fond de carte');
    }

    /* ---- 6. en lecture seule : aucun champ n'a le fond du saisi ------------------------------------------------------ */
    await page.locator('#btn-lecture-seule').click();await page.waitForFunction(()=>document.body.dataset.lecture==='seule');await attendre();
    // Les pages restées ouvertes : celles de « Lire », et « Contrôles ».
    const ouvertes=await page.evaluate(()=>OrlyOnglets.entrees().flatMap(o=>o.pages||[o.id]).filter(id=>!OrlyLectureSeule.fermee(OrlyOnglets,id)));
    assert.ok(ouvertes.length>=9&&ouvertes.includes('j-periode'),V+'les pages restées ouvertes : '+ouvertes);
    let lus=0;const fautifs=[];
    for(const id of ouvertes){
      await nav.aller(page,id);await attendre(id==='j-plan'?900:350);
      await page.evaluate(()=>document.querySelectorAll('#workspace details:not([open])').forEach(d=>{d.open=true;}));await attendre(150);
      const champs=await page.evaluate(()=>[...document.querySelectorAll('#workspace :is(input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]),select,textarea)')].filter(e=>e.getClientRects().length)
        .map(e=>({ou:(e.id||e.className||e.tagName)+'',fond:getComputedStyle(e).backgroundColor,graisse:getComputedStyle(e).fontWeight})));
      lus+=champs.length;
      for(const c of champs)if(c.fond===SAISI.fond||c.graisse==='600')fautifs.push(id+' : '+c.ou);
    }
    assert.ok(lus>=4,V+'des champs restent visibles en lecture seule ('+lus+')');
    assert.deepEqual(fautifs,[],V+'en lecture seule, aucun champ n’a le fond du saisi');

    assert.deepEqual(erreurs,[],V+'aucune erreur de page : '+erreurs.join(' | '));
   }finally{await site.effacer();await ctx.close();}
  }
  console.log('OK visuel-champs : dans les deux thèmes — un champ rempli a le fond et le trait du saisi, vidé il reprend le fond de carte et son texte d’attente est en italique, à 4,5:1 au moins ; une liste sur son choix par défaut garde le fond de carte ; un nombre calculé est du texte ; un champ désactivé est en retrait ; le tableau de tous les temps suit le même code et sa légende le dit ; les commandes d’une vue restent neutres ; en lecture seule, aucun champ n’a le fond du saisi');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

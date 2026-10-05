/* Deux étapes fusionnées, à la chaîne (retour d'usage du 29/09) : une case de
 * Montage fait aussi la Prépa pour ses commandes (AF), les autres (TX) gardent
 * leurs deux cases. Réglé dans la fiche de la case ; lu dans le récap, le
 * tableau « Qui prépare quoi », le chemin et le calcul. */
const assert=require('node:assert/strict'),path=require('node:path');
const nav=require('./nav.cjs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu','--disable-software-rasterizer','--no-zygote','--single-process']}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const attendre=()=>page.waitForTimeout(250);
 const kase=id=>page.evaluate(id=>Sim.ateliers.state.ateliers.find(a=>a.id===id),id);
 const lot=(at,c)=>page.evaluate(([at,c])=>Sim.ateliers.resultat.lots.find(l=>l.atelier===at&&(l.classes||[]).includes(c)),[at,c]);
 try{
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await attendre();
  await page.waitForTimeout(200);await nav.effectifSaisi(page);   // les personnes se saisissent ici (05/10)
  // Un chemin Cuisine → Prépa → Montage pour l'économie ; AF et TX y passent.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{const st=Sim.ateliers.state;
    // Un chemin propre à chacune : un chemin partagé serait un flux de production.
    const ch=id=>({id,nom:'Chaîne '+id,noeuds:['cuisine','preparation','prepa'],liens:[{de:'cuisine',vers:'preparation'},{de:'preparation',vers:'prepa'}]});
    st.parcours.push(ch('ch'),ch('ch2'));
    st.parcoursClasse['AF/YC']='ch';st.parcoursClasse['TX/YC']='ch2';
    const c=(id,nom,service,lots,p)=>({id,nom,service,type:'manuel',debut:'04:00',jour:0,personnes:1,pauses:[],lots,regime:{actif:false},...p});
    st.ateliers.push(c('cu','Cuisine eco','cuisine',[['AF/YC'],['TX/YC']],{personnes:4}),c('pr','Prépa eco','preparation',[['AF/YC'],['TX/YC']]),
      c('mo','Montage AF','prepa',[['AF/YC']],{personnes:2}),c('mt','Montage TX','prepa',[['TX/YC']]));},''));

  // 1. Dans la fiche de « Montage AF » : à la chaîne avec la Prépa.
  // La fiche s'ouvre sur le chemin d'une de ses commandes, dans la fenêtre de droite.
  const fiche=sel=>page.locator(`[data-at="mo"] ${sel}:visible`);
  await nav.aller(page,'at-equipes');
  await page.locator('#at-liste [data-at="mo"] .at-carte-nom').click();await attendre();
  const choix=fiche('[data-at-champ=fusion]');
  assert.equal(await choix.inputValue(),'','par défaut, chaque étape a sa case');
  assert.ok((await choix.locator('option').allTextContents()).some(t=>/Oui, avec PRÉPA/i.test(t)),'l’étape d’avant est proposée');
  await choix.selectOption('preparation');await attendre();
  assert.equal((await kase('mo')).fusion,'preparation');
  assert.deepEqual((await kase('pr')).lots,[['TX/YC']],'AF quitte la case de la Prépa : les deux cases n’en font qu’une');
  // Le temps : à deux, le poste le plus lent donne le rythme.
  const bilan=await fiche('.at-fusion-bilan').innerText();
  assert.match(bilan,/1 au PRÉPA, 1 au MONTAGE/i);
  const fu=await lot('mo','AF/YC');
  assert.equal(fu.fusion,'preparation');
  assert.equal(fu.debut,(await lot('cu','AF/YC')).fin,'la case attend la cuisine, pas une prépa');
  assert.ok(Math.abs((fu.fin-fu.debut)-Math.max(fu.minutesFusion,fu.minutesIci))<0.01,'à deux : max(prépa, montage)');
  assert.ok(!(await page.evaluate(()=>Sim.ateliers.resultat.anomalies)).some(a=>a.code==='parcours-trou'&&a.service==='preparation'),'pas de trou');
  // TX garde ses deux cases.
  assert.equal((await lot('mt','TX/YC')).debut,(await lot('pr','TX/YC')).fin);
  // Seule, une personne fait les deux : la somme.
  const pers=fiche('[data-at-champ=personnes]');
  await pers.fill('1');await pers.dispatchEvent('change');await attendre();
  const seul=await lot('mo','AF/YC');
  assert.ok(Math.abs((seul.fin-seul.debut)-(seul.minutesFusion+seul.minutesIci))<0.01);
  assert.match(await fiche('.at-fusion-bilan').innerText(),/seule/);

  // 2. Le récap des cases le dit.
  await nav.aller(page,'at-recap');
  assert.match(await page.locator('tr.rc-case[data-at="mo"] .rc-type').innerText(),/PRÉPA à la chaîne/i);

  // 3. « Qui prépare quoi » : la Prépa d'AF est faite, par la case du Montage.
  await nav.aller(page,'at-grille');
  const cellule=page.locator('tr[data-classe="AF/YC"] .qf-case[data-service="preparation"]');
  assert.match(await cellule.innerText(),/Montage AF[\s\S]*à la chaîne/);
  assert.match(await page.locator('tr[data-classe="TX/YC"] .qf-case[data-service="preparation"]').innerText(),/Prépa eco/);

  // 4. Le chemin d'AF : le nœud Prépa dit qui la fait.
  await cellule.click();await attendre();
  assert.equal(await page.evaluate(()=>document.body.dataset.sous),'at-chemins');
  assert.match(await page.locator('#view-ateliers').innerText(),/à la chaîne · Montage AF/);
  // Et le diagramme les montre d'un bloc : un halo sur chacun, un mot au-dessus.
  assert.equal(await page.locator('#at-parcours .gr-groupe').count(),1,'Prépa et Montage liés');
  assert.equal(await page.locator('#at-parcours .gr-noeud.en-chaine').count(),2);
  assert.match(await page.locator('#at-parcours .gr-groupe').textContent(),/\+ PRÉPA à la chaîne/i);
  assert.equal(await page.locator('#at-parcours .gr-lien.en-chaine[data-lien="preparation>prepa"]').count(),1,'le lien entre eux s’épaissit');
  // TX garde ses deux cases : rien de lié sur son chemin.
  await page.evaluate(()=>Sim.ateliers.parcours.ouvrir('TX/YC'));await attendre();
  assert.equal(await page.locator('#at-parcours .gr-groupe').count(),0);

  // 4 bis. Services et équipes le dit sans rien ouvrir : la liste, les deux fiches, l'équipe.
  await nav.aller(page,'mu-services');
  assert.match(await page.locator('.mu-liste [data-mu-choisir=preparation] .mu-svc-chaine').innerText(),/avec MONTAGE/i);
  assert.match(await page.locator('.mu-liste [data-mu-choisir=prepa] .mu-svc-chaine').innerText(),/\+ PRÉPA/i);
  await page.locator('.mu-liste [data-mu-choisir=preparation]').click();await attendre();
  assert.match(await page.locator('#mu-services .mu-chaine-bloc').innerText(),/est fait par « Montage AF »[\s\S]*pas besoin d’équipe ici/);
  await page.locator('#mu-services .mu-chaine-bloc [data-mu-ouvrir=prepa]').click();await attendre();
  assert.equal(await page.locator('#mu-services .mu-fiche').getAttribute('data-mu-fiche'),'prepa');
  assert.match(await page.locator('#mu-services .mu-equipe[data-at="mo"] .mu-badge.chaine').innerText(),/\+ PRÉPA à la chaîne/i);
  assert.equal(await page.locator('#mu-services .mu-equipe[data-at="mo"] .mu-chaine-reglage [data-at-champ=fusion]').isVisible(),true,'le réglage est à la vue, pas replié');
  // Le planning : la barre de la case a la teinte de la chaîne.
  await nav.aller(page,'at-planning');
  assert.ok(await page.locator('#at-planning .at-pl-lot.chaine').count()>=1);
  assert.match(await page.locator('#at-planning').textContent(),/Montage AF ⛓ \+PRÉPA/i);

  // 5. Revenir à deux cases : la Prépa d'AF est de nouveau « à faire ».
  await nav.aller(page,'at-equipes');
  await page.locator('#at-liste [data-at="mo"] .at-carte-nom').click();await attendre();
  await fiche('[data-at-champ=fusion]').selectOption('');await attendre();
  assert.equal((await kase('mo')).fusion,undefined);
  await nav.aller(page,'at-grille');
  assert.match(await page.locator('tr[data-classe="AF/YC"] .qf-case[data-service="preparation"]').innerText(),/à faire/);

  // 6. Tout survit au rechargement.
  await page.evaluate(()=>Sim.ateliers.changer(()=>{Sim.ateliers.state.ateliers.find(a=>a.id==='mo').fusion='preparation';},''));
  await page.reload();await attendre();
  assert.equal((await kase('mo')).fusion,'preparation');

  assert.deepEqual(errors,[],'aucune erreur de page');
  console.log('fusion-browser : ok');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

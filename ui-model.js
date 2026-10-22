/* Pure presentation rules: shared by the browser and Node regression tests. */
(function (root) {
  'use strict';
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function csvRows(text) {
    text=String(text).replace(/^\uFEFF/,'');
    const first=text.split(/\r?\n/)[0];
    const delimiter=(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length ? ';' : ',';
    // Chaque ligne retenue garde son numéro PHYSIQUE dans le fichier (`row.ligne`),
    // compté avant tout filtrage : une ligne vide sautée ne décale pas les
    // numéros des messages d'erreur (BUG-003).
    const rows=[];let row=[],cell='',quoted=false,closed=false,ligne=1;
    const garder=()=>{if(row.some(Boolean)){row.ligne=ligne;rows.push(row);}row=[];ligne++;};
    for(let i=0;i<text.length;i++) {
      const c=text[i];
      if(quoted) {
        if(c==='"' && text[i+1]==='"'){cell+='"';i++;}
        else if(c==='"'){quoted=false;closed=true;}
        else {if(c==='\n' || (c==='\r' && text[i+1]!=='\n'))ligne++;cell+=c;}
      } else if(c==='"') {
        if(cell.trim() || closed) throw new Error('Guillemets CSV mal placés.');
        cell='';quoted=true;
      } else if(c===delimiter || c==='\n' || c==='\r') {
        row.push(cell.trim());cell='';closed=false;
        if(c!==delimiter){if(c==='\r' && text[i+1]==='\n')i++;garder();}
      } else { if(closed && c.trim())throw new Error('Texte après un champ CSV entre guillemets.');cell+=c; }
    }
    if(quoted)throw new Error('Champ CSV entre guillemets non fermé.');
    row.push(cell.trim());garder();
    return rows;
  }
  function parseFlights(text, options) { return parseFlightRows(csvRows(text), options); }
  /* Une date lue dans un tableur (le programme de vols daté, évolution 10 du banc d'essai de la
   * version 1) : AAAA-MM-JJ, JJ/MM/AAAA (JJ/MM/AA : 20AA), ou une date Excel (des jours depuis le
   * 30/12/1899, l'heure ignorée). Rend « AAAA-MM-JJ », ou null pour une case vide. C'est la convention
   * du classeur de calage de la version 2 (v2/calage.js, dateDe), qui reste tel quel ; une date qui
   * n'existe pas (31/02) est refusée. */
  function dateDe(v) {
    if(v===null||v===undefined||v==='')return null;
    const refus=()=>new Error('date illisible « '+v+' » (attendu AAAA-MM-JJ, JJ/MM/AAAA ou une date Excel)');
    if(typeof v==='number'){
      if(!(v>20000&&v<80000))throw refus();
      return new Date(Date.UTC(1899,11,30)+Math.floor(v)*86400000).toISOString().slice(0,10);
    }
    const s=String(v).trim();
    let a,m,j,x=/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z?)?$/.exec(s);
    if(x){a=+x[1];m=+x[2];j=+x[3];}
    else if((x=/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s))){a=x[3].length===2?2000+(+x[3]):+x[3];m=+x[2];j=+x[1];}
    else throw refus();
    const d=new Date(Date.UTC(a,m-1,j));
    if(d.getUTCFullYear()!==a||d.getUTCMonth()!==m-1||d.getUTCDate()!==j)throw refus();
    return d.toISOString().slice(0,10);
  }
  /* Les lignes d'un tableur : un CSV découpé, ou une feuille Excel. Dans ce
   * second cas, une heure arrive en fraction de jour (06:30 → 0,2708…) et une
   * quantité en nombre : on les accepte tels quels.
   * `options.eta` (banc d'essai de la version 1, docs/BANC_ESSAI.md) : lire aussi
   * la colonne facultative heure_eta d'un départ, l'arrivée estimée de son avion.
   * `options.spmlParCabine` (de même) : lire aussi les colonnes facultatives
   * nb_SPML_BC, nb_SPML_PC, nb_SPML_YC, les repas spéciaux de chaque cabine ; un
   * nb_SPML vide vaut alors leur somme.
   * `options.date` (de même, évolution 10) : lire aussi la colonne facultative date,
   * le jour du vol (celui de son heure_std pour un départ, de son heure_sta pour un
   * retour). Une colonne date remplie : chaque vol a la sienne ; vide partout, le
   * programme n'est pas daté. */
  function parseFlightRows(input, options) {
    const o=options||{};
    const rows=(input||[]).map(r=>{const out=(r||[]).map(v=>v===null||v===undefined?'':typeof v==='number'?v:String(v).trim());out.ligne=r&&r.ligne;return out;})
      .filter(r=>r.some(v=>v!==''));
    rows.forEach((r,i)=>{if(r.ligne===undefined)r.ligne=i+1;});
    if(rows.length<2)throw new Error('Le CSV doit contenir un en-tête et au moins un vol.');
    const headers=rows[0].map(h=>String(h).toLowerCase());
    const required=['vol_id','compagnie','sens','heure_std','heure_sta','nb_bc','nb_pc','nb_yc'];
    const missing=required.filter(h=>!headers.includes(h));
    if(missing.length)throw new Error('Colonnes manquantes : '+missing.join(', ')+'. Téléchargez le modèle CSV.');
    if(new Set(headers).size!==headers.length)throw new Error('Les noms de colonnes doivent être uniques.');
    const errors=[],seen=new Set(),out=[];
    // Le programme daté : la colonne date, remplie sur au moins une ligne. Chaque vol a alors la sienne.
    const iDate=o.date?headers.indexOf('date'):-1;
    const datee=iDate>=0&&rows.slice(1).some(r=>r[iDate]!==undefined&&r[iDate]!==null&&r[iDate]!=='');
    const cabinesSpml=o.spmlParCabine?['BC','PC','YC'].filter(c=>headers.includes('nb_spml_'+c.toLowerCase())):[];
    rows.slice(1).forEach((r,i)=>{
      const line=r.ligne,get=h=>{const v=r[headers.indexOf(h)];return v===undefined||v===null?'':v;};
      try {
        if(r.length>headers.length && r.slice(headers.length).some(v=>v!==''))throw new Error('nombre de colonnes différent de l’en-tête');
        while(r.length<headers.length)r.push('');
        const id=String(get('vol_id')),cie=String(get('compagnie')),sens=String(get('sens')).toUpperCase();
        if(!id || !cie)throw new Error('vol_id et compagnie obligatoires');
        if(!['DEP','RET'].includes(sens))throw new Error('sens attendu : DEP ou RET');
        // Un programme daté : la date du vol (celle de son départ, ou de son arrivée pour un retour).
        const date=datee?dateDe(get('date')):null;
        if(datee&&!date)throw new Error('date manquante : le programme est daté, chaque vol a la sienne');
        const key=sens+'|'+id+(date?'|'+date:'');if(seen.has(key))throw new Error('doublon '+id+' ('+sens+(date?', '+date:'')+')');seen.add(key);
        const quantity=h=>{const v=get(h);if(typeof v==='number'&&Number.isSafeInteger(v)&&v>=0)return v;if(!/^\d+$/.test(v) || !Number.isSafeInteger(+v))throw new Error(h+' : entier positif ou nul requis');return +v;};
        const optionnel=h=>{if(!headers.includes(h))return 0;const v=get(h);if(v===''||v===null)return 0;return quantity(h);};
        const time=h=>{const v=get(h);if(typeof v==='number'&&v>=0&&v<1)return Math.round(v*1440)%1440;if(!/^([01]?\d|2[0-3]):[0-5]\d$/.test(v))throw new Error(h+' : horaire HH:MM requis (00:00 à 23:59)');const [hh,mm]=v.split(':').map(Number);return hh*60+mm;};
        const bc=quantity('nb_bc'),pc=quantity('nb_pc'),yc=quantity('nb_yc');
        // Équipage et repas spéciaux sont FACULTATIFS : un export qui ne les
        // porte pas reste lisible, et vaut zéro plutôt que d'être refusé.
        const crew=optionnel('nb_crew');let spml=optionnel('nb_spml');
        // Les repas spéciaux de chaque cabine, s'ils sont saisis pour ce vol ; nb_SPML vide : leur somme.
        const spmlParCabine=cabinesSpml.some(c=>get('nb_spml_'+c.toLowerCase())!=='')?Object.fromEntries(cabinesSpml.map(c=>[c,optionnel('nb_spml_'+c.toLowerCase())])):null;
        if(spmlParCabine&&get('nb_spml')==='')spml=Object.values(spmlParCabine).reduce((n,x)=>n+x,0);
        if(bc+pc+yc+crew+spml===0)throw new Error('au moins une quantité doit être supérieure à zéro');
        const std=sens==='DEP'?time('heure_std'):get('heure_std')!==''?time('heure_std'):null;
        const sta=sens==='RET'?time('heure_sta'):get('heure_sta')!==''?time('heure_sta'):null;
        // Plus tard que le départ sur l'horloge, l'arrivée estimée est celle de la veille.
        const eta=o.eta&&sens==='DEP'&&headers.includes('heure_eta')&&get('heure_eta')!==''?time('heure_eta'):null;
        out.push({id,cie,sens,avion:String(get('type_avion')||'—'),std,sta,bc,pc,yc,crew,spml,...(eta===null?{}:{eta:eta>std?eta-1440:eta}),...(spmlParCabine?{spmlParCabine}:{}),...(date?{date}:{})});
      } catch(e){errors.push('Ligne '+line+' : '+e.message);}
    });
    if(errors.length)throw new Error(errors.slice(0,8).join('\n')+(errors.length>8?'\n… '+(errors.length-8)+(errors.length-8>1?' autres erreurs.':' autre erreur.'):'')+'\nAucune donnée remplacée.');
    return out;
  }
  const api={escapeHTML,parseFlights,parseFlightRows,dateDe};
  if(typeof module!=='undefined' && module.exports)module.exports=api;
  else root.OrlyUI=api;
})(typeof globalThis!=='undefined'?globalThis:this);

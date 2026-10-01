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
  function parseFlights(text) { return parseFlightRows(csvRows(text)); }
  /* Les lignes d'un tableur : un CSV découpé, ou une feuille Excel. Dans ce
   * second cas, une heure arrive en fraction de jour (06:30 → 0,2708…) et une
   * quantité en nombre : on les accepte tels quels. */
  function parseFlightRows(input) {
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
    rows.slice(1).forEach((r,i)=>{
      const line=r.ligne,get=h=>{const v=r[headers.indexOf(h)];return v===undefined||v===null?'':v;};
      try {
        if(r.length>headers.length && r.slice(headers.length).some(v=>v!==''))throw new Error('nombre de colonnes différent de l’en-tête');
        while(r.length<headers.length)r.push('');
        const id=String(get('vol_id')),cie=String(get('compagnie')),sens=String(get('sens')).toUpperCase();
        if(!id || !cie)throw new Error('vol_id et compagnie obligatoires');
        if(!['DEP','RET'].includes(sens))throw new Error('sens attendu : DEP ou RET');
        const key=sens+'|'+id;if(seen.has(key))throw new Error('doublon '+id+' ('+sens+')');seen.add(key);
        const quantity=h=>{const v=get(h);if(typeof v==='number'&&Number.isSafeInteger(v)&&v>=0)return v;if(!/^\d+$/.test(v) || !Number.isSafeInteger(+v))throw new Error(h+' : entier positif ou nul requis');return +v;};
        const optionnel=h=>{if(!headers.includes(h))return 0;const v=get(h);if(v===''||v===null)return 0;return quantity(h);};
        const time=h=>{const v=get(h);if(typeof v==='number'&&v>=0&&v<1)return Math.round(v*1440)%1440;if(!/^([01]?\d|2[0-3]):[0-5]\d$/.test(v))throw new Error(h+' : horaire HH:MM requis (00:00 à 23:59)');const [hh,mm]=v.split(':').map(Number);return hh*60+mm;};
        const bc=quantity('nb_bc'),pc=quantity('nb_pc'),yc=quantity('nb_yc');
        // Équipage et repas spéciaux sont FACULTATIFS : un export qui ne les
        // porte pas reste lisible, et vaut zéro plutôt que d'être refusé.
        const crew=optionnel('nb_crew'),spml=optionnel('nb_spml');
        if(bc+pc+yc+crew+spml===0)throw new Error('au moins une quantité doit être supérieure à zéro');
        const std=sens==='DEP'?time('heure_std'):get('heure_std')!==''?time('heure_std'):null;
        const sta=sens==='RET'?time('heure_sta'):get('heure_sta')!==''?time('heure_sta'):null;
        out.push({id,cie,sens,avion:String(get('type_avion')||'—'),std,sta,bc,pc,yc,crew,spml});
      } catch(e){errors.push('Ligne '+line+' : '+e.message);}
    });
    if(errors.length)throw new Error(errors.slice(0,8).join('\n')+(errors.length>8?'\n… '+(errors.length-8)+(errors.length-8>1?' autres erreurs.':' autre erreur.'):'')+'\nAucune donnée remplacée.');
    return out;
  }
  const api={escapeHTML,parseFlights,parseFlightRows};
  if(typeof module!=='undefined' && module.exports)module.exports=api;
  else root.OrlyUI=api;
})(typeof globalThis!=='undefined'?globalThis:this);

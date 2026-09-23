const test=require('node:test');
const assert=require('node:assert/strict');
const {parseFlights,escapeHTML}=require('../ui-model.js');
const head='vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC\n';
test('midnight is preserved; missing arrival allowed for departure',()=>{
 const [f]=parseFlights(head+'X,TX,A350,DEP,00:00,,1,2,100');assert.equal(f.std,0);assert.equal(f.sta,null);
});
test('quoted separators and semicolon CSV are supported',()=>{
 assert.equal(parseFlights(head+'X,"Air, Example",A350,DEP,12:00,,1,2,100')[0].cie,'Air, Example');
 assert.equal(parseFlights((head+'X,TX,A350,DEP,12:00,,1,2,100').replaceAll(',',';'))[0].yc,100);
});
test('invalid files are rejected atomically, with actionable diagnostics',()=>{
 for(const row of ['X,TX,A350,DEP,,,1,2,100','X,TX,A350,DEP,25:00,,1,2,100','X,TX,A350,DEP,12:00,,-1,2,100','X,TX,A350,BAD,12:00,,1,2,100'])assert.throws(()=>parseFlights(head+row),/Ligne 2/);
 assert.throws(()=>parseFlights(head+'X,TX,A350,DEP,12:00,,1,2,100\nX,TX,A350,DEP,13:00,,1,2,100'),/doublon/);
 assert.throws(()=>parseFlights('FlightId,Qty\n1,100'),/Colonnes manquantes/);
 assert.throws(()=>parseFlights(head+'X,"Air,Example,A350,DEP,12:00,,1,2,100'),/non fermé/);
});
test('untrusted imported identifiers are escaped for HTML rendering',()=>{
 assert.equal(escapeHTML('<img src=x onerror="alert(1)">'),'&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
test('BUG-003 : le numéro de ligne d’une erreur est le numéro physique, lignes vides comprises',()=>{
 // ligne 1 : en-tête · ligne 2 : vide · ligne 3 : fautive
 assert.throws(()=>parseFlights(head+'\n'+'X,TX,A350,DEP,25:00,,1,2,100'),/Ligne 3 /);
 // deux lignes vides puis une bonne puis une fautive : la fautive est la ligne 5
 assert.throws(()=>parseFlights(head+'\n\n'+'A,TX,A350,DEP,12:00,,1,2,100\n'+'B,TX,A350,DEP,bad,,1,2,100'),/Ligne 5 /);
 // fins de ligne Windows : même numérotation
 assert.throws(()=>parseFlights((head+'\n'+'X,TX,A350,DEP,25:00,,1,2,100').replace(/\n/g,'\r\n')),/Ligne 3 /);
 // sans ligne vide, rien ne change
 assert.throws(()=>parseFlights(head+'X,TX,A350,DEP,25:00,,1,2,100'),/Ligne 2 /);
});

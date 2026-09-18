const test=require('node:test');
const assert=require('node:assert/strict');
const {serviceMetrics,flightStatus,parseFlights,escapeHTML}=require('../ui-model.js');
const head='vol_id,compagnie,type_avion,sens,heure_std,heure_sta,nb_BC,nb_PC,nb_YC\n';
test('no due flights yields no success percentage',()=>{
 assert.equal(serviceMetrics([],300).ontime,null);
 assert.equal(serviceMetrics([{sens:'DEP',due:500,readyTime:400}],450).ontime,null);
});
test('unfinished overdue departures count against punctuality',()=>{
 const f=[{sens:'DEP',due:400,readyTime:390},{sens:'DEP',due:400,readyTime:null},{sens:'DEP',due:400,readyTime:420},{sens:'DEP',due:600,readyTime:null},{sens:'RET',due:0}];
 const k=serviceMetrics(f,450);assert.equal(k.ontime,33);assert.equal(k.overdue,1);assert.equal(k.exigibles,3);assert.equal(k.retardMoy,10);assert.equal(k.retardExigibles,23);
 assert.equal(flightStatus(f[1],400).key,'overdue');
});
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

const test=require('node:test'),assert=require('node:assert/strict');
const {validatePlan,validZone,resize,bounds}=require('../plan-editor.js');
const base=[{id:'cuisine',nom:'Cuisine',kind:'service',x:10,y:20,w:100,h:200,approx:true}];
test('legacy geometry migrates without losing service identity',()=>{
 const p=validatePlan({cuisine:{x:30,y:40,w:50,h:60}},base);assert.equal(p.zones[0].kind,'service');assert.equal(p.zones[0].x,30);assert.equal(p.zones[0].approx,true);
});
test('full plan preserves annotations and rejects loss of a motor service',()=>{
 const room={id:'room1',nom:'Local',kind:'room',x:0,y:0,w:10,h:20};
 const p=validatePlan({schema:'ory-plan',version:2,zones:[...base,room]},base);assert.equal(p.zones.length,2);
 assert.throws(()=>validatePlan({schema:'ory-plan',version:2,zones:[room]},base),/conserver/);
 assert.throws(()=>validatePlan({schema:'ory-plan',version:2,zones:[...base,{...room,kind:'service'}]},base),/ateliers/);
});
test('invalid shapes, duplicate ids and unknown format are refused',()=>{
 assert.throws(()=>validZone({...base[0],w:NaN}),/Dimensions/);
 assert.throws(()=>validZone({...base[0],pts:[[0,0],[1,1],[2,2]]}),/Polygone/);
 assert.throws(()=>validatePlan({schema:'ory-plan',version:2,zones:[...base,...base]},base),/double/);
 assert.throws(()=>validatePlan({schema:'ory-plan',version:99,zones:base},base),/Version/);
});
test('polygon resizing preserves the outline proportions',()=>{
 const z=validZone({...base[0],pts:[[0,0],[20,0],[10,10],[0,10]]});resize(z,{x:100,y:200,w:40,h:30});
 assert.deepEqual(z.pts,[[100,200],[140,200],[120,230],[100,230]]);assert.deepEqual(bounds(z),{x:100,y:200,w:40,h:30});
});
test('storage migration removes only storage shapes and preserves service data',()=>{
 const old={schema:'ory-plan',version:2,zones:[...base,{id:'storage-0',nom:'Froid',kind:'cold',x:0,y:0,w:20,h:20},{id:'storage-23',nom:'Bureau',kind:'room',x:0,y:0,w:20,h:20}]};
 const p=validatePlan(old,base);assert.equal(p.version,3);assert.equal(p.zones.length,2);assert.equal(p.unassignedStorages[0].nom,'Froid');
 p.zones[0].storages.push({id:'s1',nom:'Réserve',contenu:'Familles de produits'});
 assert.deepEqual(validatePlan(JSON.parse(JSON.stringify(p)),base),p);
 assert.equal(validatePlan({cuisine:{x:5,y:5,w:20,h:20}},p.zones.filter(z=>z.kind==='service')).zones[0].storages.length,1);
 p.zones[0].storages.push({...p.zones[0].storages[0]});assert.throws(()=>validatePlan(p,base),/Stockage invalide/);
});

test('une annexe doit nommer un atelier du moteur existant',()=>{
 const annexe={id:'local-1',nom:'Cuisine 2',kind:'annexe',parent:'cuisine',x:0,y:0,w:40,h:40};
 const p=validatePlan({schema:'ory-plan',version:3,zones:[...base,annexe]},base);
 assert.equal(p.zones.length,2);
 assert.equal(p.zones[1].kind,'annexe');
 assert.equal(p.zones[1].parent,'cuisine');
 // Sans rattachement, ou rattachée à un atelier qui n'existe pas, elle est refusée :
 // une seconde salle de rien du tout n'aurait aucun sens pour le moteur.
 assert.throws(()=>validZone({...annexe,parent:''}),/annexe/i);
 assert.throws(()=>validZone({...annexe,parent:undefined}),/annexe/i);
 assert.throws(()=>validatePlan({schema:'ory-plan',version:3,zones:[...base,{...annexe,parent:'plonge'}]},base),/atelier inconnu/);
 // L'annexe n'emporte pas de stockages : ce sont ceux de son atelier.
 assert.equal(p.zones[1].storages,undefined);
});

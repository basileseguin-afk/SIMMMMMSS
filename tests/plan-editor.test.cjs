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

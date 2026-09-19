const test=require('node:test'),assert=require('node:assert/strict');
const {endpoints,endpointId:E,validate,initial,usable,canTravel}=require('../flow-center.js');
const points=endpoints([{id:'a',nom:'A',kind:'service',storages:[{id:'s',nom:'Réserve'}]},{id:'b',nom:'B',kind:'service'},{id:'c',nom:'C',kind:'service'}]);
const flow=(id,type,a,b)=>({id,type,from:E(a),to:E(b),enabled:true,label:''});
const state=flows=>({schema:'ory-flows',version:1,internal:{},flows});
test('multiple origins and destinations are allowed without bijection',()=>{
 const s=validate(state([flow('1','raw','a','b'),flow('2','raw','a','c'),flow('3','raw','c','b'),flow('4','processed','b','a')]));assert.equal(s.flows.length,4);
 assert.throws(()=>validate(state([...s.flows,flow('5','raw','a','b')])),/existe déjà/);
});
test('human movement stays within service except explicitly enabled runner links',()=>{
 const s=validate(state([flow('1','runner','a','b')]));
 assert.equal(canTravel(s,points,E('a'),E('a','s'),'personnel'),true);
 assert.equal(canTravel(s,points,E('a'),E('b'),'personnel'),false);
 assert.equal(canTravel(s,points,E('a'),E('b'),'runner'),true);
 assert.equal(canTravel(s,points,E('b'),E('a'),'runner'),false);
 s.flows[0].enabled=false;assert.equal(canTravel(s,points,E('a'),E('b'),'runner'),false);
 s.internal.a=false;assert.equal(canTravel(s,points,E('a'),E('a','s'),'personnel'),false);
 assert.throws(()=>validate(state([flow('1','personnel','a','b')])),/runners/);
});
test('missing storage is preserved but unusable; undoing deletion restores usability',()=>{
 const f={...flow('1','material','a','b'),from:E('a','s')};const s=validate(state([f]));
 assert.equal(usable(s.flows[0],points),true);assert.equal(usable(s.flows[0],points.filter(p=>p.id!==E('a','s'))),false);
 assert.equal(validate(JSON.parse(JSON.stringify(s))).flows[0].from,E('a','s'));
});
test('information is limited to OF and kanban, unknown input rejected',()=>{
 assert.equal(validate(state([flow('1','of','a','b'),flow('2','kanban','a','b')])).flows.length,2);
 for(const type of ['email','__proto__','unknown'])assert.throws(()=>validate(state([flow('1',type,'a','b')])));
 assert.throws(()=>validate(state([{...flow('1','of','a','b'),from:'broken'}])));
 assert.throws(()=>validate(state([flow('1','of','a','a')])));
});
test('legacy flows await classification and never grant human permissions',()=>{
 const s=initial([['a','b']]);assert.equal(s.flows[0].type,'unclassified');assert.equal(usable(s.flows[0],points),false);assert.equal(canTravel(s,points,E('a'),E('b'),'runner'),false);
});

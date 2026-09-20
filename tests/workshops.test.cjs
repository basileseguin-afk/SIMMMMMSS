const test=require('node:test'),assert=require('node:assert/strict');
const {validate,cellInside,rotate,footprint}=require('../workshop-grid.js');
const state=()=>({schema:'ory-workshops',version:1,step:40,workshops:[{id:'w',service:'cuisine',nom:'Atelier'}],items:[{id:'i',workshop:'w',type:'table',nom:'Table',cells:['1,1','2,1']}]});
test('workshops keep service ownership, cells and independent groups',()=>{const s=state();assert.deepEqual(validate(JSON.parse(JSON.stringify(s))),s);s.workshops.push({id:'w2',service:'cuisine',nom:'Second'});s.items.push({...s.items[0],id:'j',workshop:'w2'});assert.throws(()=>validate(s),/même case/);s.workshops[1].service='prepa';assert.equal(validate(s).items.length,2);});
test('invalid grid, missing group and invalid cells are refused',()=>{const s=state();s.step=0;assert.throws(()=>validate(s));s.step=40;s.items[0].workshop='missing';assert.throws(()=>validate(s));s.items[0].workshop='w';s.items[0].cells=['a,b'];assert.throws(()=>validate(s));});
test('square cells must fit wholly inside service including concave notches',()=>{
 const z={x:0,y:0,w:100,h:100};assert.equal(cellInside('0,0',z,50),true);assert.equal(cellInside('2,0',z,50),false);
 const concave={pts:[[0,0],[100,0],[100,100],[60,100],[60,30],[40,30],[40,100],[0,100]]};assert.equal(cellInside('0,0',concave,100),false);
});
test('rotation and existing library models map to the grid',()=>{
 assert.deepEqual(rotate(['1,1','2,1']),['1,1','1,2']);
 assert.deepEqual(footprint({type:'table',cells:['-1,2','0,2']}),['0,0','1,0']);
 assert.equal(footprint({type:'desserte',dimCm:{l:70,p:50}}).length,2);
 assert.throws(()=>footprint({type:'table',cells:['NaN,0']}));
});

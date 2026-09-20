const test=require('node:test'),assert=require('node:assert/strict');
const {validate,cellInside,rotate,footprint}=require('../workshop-grid.js');
const state=()=>({schema:'ory-workshops',version:1,step:40,workshops:[{id:'w',service:'cuisine',nom:'Atelier'}],items:[{id:'i',workshop:'w',type:'table',nom:'Table',code:'T-001',cells:['1,1','2,1']}]});
test('workshops keep service ownership, cells and independent groups',()=>{const s=state();assert.deepEqual(validate(JSON.parse(JSON.stringify(s))),s);s.workshops.push({id:'w2',service:'cuisine',nom:'Second'});s.items.push({...s.items[0],id:'j',workshop:'w2',code:'T-002'});assert.throws(()=>validate(s),/même case/);s.workshops[1].service='prepa';assert.equal(validate(s).items.length,2);});
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

test('validated workshops preserve codes and reject duplicate codes or empty surfaces',()=>{
 const s=state();s.workshops[0].code='AT-001';s.workshops[0].validated=true;
 assert.deepEqual(validate(s),s);s.workshops.push({id:'w2',service:'prepa',nom:'Autre',code:'AT-001'});assert.throws(()=>validate(s),/Code atelier/);
 s.workshops.pop();s.items=[];assert.throws(()=>validate(s),/vide/);
});
test('surface union removes interior edges and preserves gaps and holes',()=>{
 const {surface,nextCode}=require('../workshop-grid.js');
 assert.equal(surface(['0,0','1,0'],40).outline.split('M').length-1,6);
 assert.equal(surface(['0,0','2,0'],40).outline.split('M').length-1,8);
 const ring=['0,0','1,0','2,0','0,1','2,1','0,2','1,2','2,2'];
 assert.equal(surface(ring,40).outline.split('M').length-1,16);
 assert.equal(nextCode(new Set(['T-001','T-003']),'table'),'T-002');
});

test('equipment codes migrate legacy data and count separately by type',()=>{
 const s=state();delete s.items[0].code;
 s.items.push({...s.items[0],id:'r',type:'robot',cells:['3,1']},{...s.items[0],id:'c',type:'tapis',cells:['4,1']},{...s.items[0],id:'t',code:'T-001',cells:['5,1']});
 const migrated=validate(s);assert.deepEqual(migrated.items.map(i=>i.code),['T-002','R-001','C-001','T-001']);
 assert.deepEqual(validate(migrated),migrated);
 migrated.items[0].nom='Renommée';assert.equal(validate(migrated).items[0].code,'T-002');
 migrated.items[0].code='R-001';assert.throws(()=>validate(migrated),/Code équipement/);
 migrated.items[0].code='T-001';assert.throws(()=>validate(migrated),/Code équipement/);
});

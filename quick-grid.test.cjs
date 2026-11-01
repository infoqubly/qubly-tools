const test=require('node:test'),assert=require('node:assert/strict'),g=require('./quick-grid.js');
test('grid follows contain letterboxes and transformed image bounds',()=>{
 const a=g.imageBox({left:20,top:30,width:600,height:500},1536,1024);assert.equal(a.height,400);assert.equal(a.top,80);assert.equal(g.hit(25,40,a),null);assert.deepEqual(g.hit(20,80,a),{c:0,r:0});
 const b=g.imageBox({left:-100,top:-200,width:1200,height:1000},1536,1024);assert.equal(b.width,1200);assert.equal(b.top,-100);assert.deepEqual(g.hit(0,0,b),{c:1,r:1});
});
test('colors stay local to each image; repaint and erasing do not mutate previous selection',()=>{
 const original=g.paint({},['K3','K4'],1),proposal=g.paint({},['L3','L4'],2),next=g.paint(original,['K3'],5);assert.equal(original.K3,1);assert.equal(proposal.K3,undefined);assert.equal(next.K3,5);assert.deepEqual(g.paint(proposal,['L3'],1,true),{L4:2});assert.equal(g.colors.length,5);
});
test('drag and full row/column use the same address space',()=>{assert.deepEqual(g.rectangle({c:10,r:3},{c:11,r:2}),['K3','L3','K4','L4']);assert.equal(g.rectangle({c:0,r:2},{c:11,r:2}).length,12);assert.equal(g.rectangle({c:10,r:0},{c:10,r:7}).length,8);});


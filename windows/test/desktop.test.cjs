const {test}=require('node:test');
const assert=require('node:assert/strict');
const {clampBounds,petBounds,bubbleBounds,validatePreferences}=require('../src/core/desktop.cjs');
test('lost monitor position returns inside primary work area',()=>{
 assert.deepEqual(clampBounds({x:2500,y:1800,width:200,height:280},[{x:0,y:0,width:1920,height:1040}]),{x:1720,y:760,width:200,height:280});
});
test('negative monitor coordinates are preserved',()=>{
 assert.deepEqual(clampBounds({x:-900,y:100,width:200,height:280},[{x:0,y:0,width:1920,height:1040},{x:-1280,y:0,width:1280,height:984}]),{x:-900,y:100,width:200,height:280});
});
test('pet resize preserves bottom-right anchoring and scales manifest',()=>{
 assert.deepEqual(petBounds({width:300,height:600},300,{x:100,y:100,width:100,height:200}),{x:26,y:-24,width:174,height:324});
});
test('bubble flips to left near right screen edge and stays visible',()=>{
 const r=bubbleBounds({x:1780,y:700,width:140,height:280},{width:300,height:600,speech:{mouth:[150,120],hairLeft:80,hairRight:220}},256,{x:0,y:0,width:1920,height:1040});
 assert.equal(r.side,'left'); assert.ok(r.x+r.width<=1780+12+80*256/600); assert.ok(r.y>=0&&r.y+r.height<=1040);
});
test('preference boundary rejects arbitrary keys and nonfinite dimensions',()=>{
 assert.throws(()=>validatePreferences({height:NaN}));
 assert.throws(()=>validatePreferences({height:900}));
 assert.throws(()=>validatePreferences({style:'../x'}));
 assert.throws(()=>validatePreferences({__arbitrary:true}));
 assert.deepEqual(validatePreferences({height:320,clickThrough:true}),{height:320,clickThrough:true});
});

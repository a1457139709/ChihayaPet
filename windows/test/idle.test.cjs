const {test}=require('node:test');const assert=require('node:assert/strict');
const {IdleSpeech}=require('../src/core/idle.cjs');
test('busy intervals reset idle deadline rather than queueing speech',()=>{
 const idle=new IdleSpeech(()=>0);assert.equal(idle.tick(0,true,'normal'),null);assert.equal(idle.tick(180000,false,'normal'),null);assert.equal(idle.tick(181000,true,'normal'),null);assert.equal(typeof idle.tick(361000,true,'normal'),'string');
});
test('idle lines exclude last eight even with repeated random values',()=>{
 const idle=new IdleSpeech(()=>0);const lines=Array.from({length:9},()=>idle.next(14));assert.equal(new Set(lines).size,9);
});

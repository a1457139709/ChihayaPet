const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'); const os=require('node:os'); const path=require('node:path');
const {MusicLibrary}=require('../src/core/music.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'chihaya-music-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
test('import copies bytes and removal never deletes source or private copy',t=>{
 const root=fixture(t),source=path.join(root,'测试 song.mp3');fs.writeFileSync(source,'music');
 const lib=new MusicLibrary(path.join(root,'data'));const [track]=lib.import([source]);
 assert.equal(lib.tracks().length,1);assert.equal(fs.readFileSync(new URL(track.url),'utf8'),'music');
 lib.remove(track.id);assert.equal(lib.tracks().length,0);assert.equal(fs.readFileSync(source,'utf8'),'music');assert.ok(fs.existsSync(new URL(track.url)));
 assert.deepEqual(new MusicLibrary(path.join(root,'data')).tracks(),[]);
});
test('malformed library is not overwritten',t=>{
 const root=fixture(t);fs.mkdirSync(path.join(root,'Music'));fs.writeFileSync(path.join(root,'Music/library.json'),'broken');
 assert.throws(()=>new MusicLibrary(root));assert.equal(fs.readFileSync(path.join(root,'Music/library.json'),'utf8'),'broken');
});
test('library path traversal cannot become a renderer media URL',t=>{
 const root=fixture(t);fs.mkdirSync(path.join(root,'Music'));fs.writeFileSync(path.join(root,'Music/library.json'),JSON.stringify([{id:'x',name:'x',file:'../../secret.mp3'}]));
 assert.throws(()=>new MusicLibrary(root));
});
test('unsupported files cannot enter the playback library',t=>{
 const root=fixture(t),source=path.join(root,'x.exe');fs.writeFileSync(source,'MZ');
 const lib=new MusicLibrary(path.join(root,'data'));assert.throws(()=>lib.import([source]));assert.equal(lib.tracks().length,0);
});

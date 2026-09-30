const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {safeEntryPath,verifySprites,assertPE}=require('../scripts/package-lib.cjs');
test('ZIP entries cannot escape staging or create symlinks',()=>{
 const root=path.join(os.tmpdir(),'chihaya-stage');
 for(const name of ['../secret','/secret','C:/secret','x\\..\\secret','a/../../secret'])assert.throws(()=>safeEntryPath(root,{fileName:name,externalFileAttributes:0}));
 assert.throws(()=>safeEntryPath(root,{fileName:'symlink',externalFileAttributes:0xa1ff0000}));
 assert.equal(safeEntryPath(root,{fileName:'locales/zh-CN.pak',externalFileAttributes:0}),path.join(root,'locales/zh-CN.pak'));
});
test('PE validation rejects macOS binaries and non-x64 target',()=>{
 assert.throws(()=>assertPE(Buffer.from('not a PE')));
 const b=Buffer.alloc(128);b.write('MZ');b.writeUInt32LE(64,60);b.write('PE\0\0',64,'ascii');b.writeUInt16LE(0x8664,68);assert.doesNotThrow(()=>assertPE(b));b.writeUInt16LE(0xaa64,68);assert.throws(()=>assertPE(b));
});
test('source sprite verification checks actual bytes rather than filenames',()=>{
 const manifest=verifySprites(path.resolve(__dirname,'../../ChihayaPet/Resources/CharacterSprites'));assert.equal(Object.keys(manifest.variants).length,14);
});
test('final ZIP is byte-checked and extraction preserves exact Unicode files',async t=>{
 const {createZip,verifyZip,extract}=require('../scripts/package-lib.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'chihaya-zip-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const runtime=path.join(root,'ChihayaPet-win32-x64');fs.mkdirSync(runtime);
 fs.writeFileSync(path.join(runtime,'说明.txt'),'你好 Windows');const archive=path.join(root,'app.zip');
 await createZip(runtime,archive);await verifyZip(archive,runtime);await extract(archive,path.join(root,'extracted'));
 assert.equal(fs.readFileSync(path.join(root,'extracted/ChihayaPet-win32-x64/说明.txt'),'utf8'),'你好 Windows');
 fs.writeFileSync(path.join(runtime,'说明.txt'),'modified');await assert.rejects(verifyZip(archive,runtime),/content mismatch/);
});

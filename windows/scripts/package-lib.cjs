'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {pipeline}=require('node:stream/promises');
function sha256(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function safeEntryPath(root,entry){
 const name=entry.fileName;
 if(!name||name.includes('\\')||name.includes(':')||name.startsWith('/')||name.split('/').includes('..')||((entry.externalFileAttributes>>>16)&0xf000)===0xa000)throw Error(`Unsafe ZIP entry: ${name}`);
 const target=path.resolve(root,name);if(target!==root&&!target.startsWith(path.resolve(root)+path.sep))throw Error('ZIP path escapes staging');return target;
}
async function extract(zipFile,root){
 const yauzl=require('yauzl');fs.mkdirSync(root,{recursive:true});
 await new Promise((resolve,reject)=>{
  yauzl.open(zipFile,{lazyEntries:true},(err,zip)=>{
   if(err)return reject(err);let total=0;const names=new Set();
   const fail=e=>{zip.close();reject(e);};zip.on('error',fail);zip.on('end',resolve);
   zip.on('entry',entry=>{(async()=>{
    const target=safeEntryPath(root,entry);if(names.has(target))throw Error('Duplicate ZIP entry');names.add(target);
    total+=entry.uncompressedSize;if(total>2*1024**3)throw Error('Runtime archive exceeds 2 GiB');
    if(entry.fileName.endsWith('/'))fs.mkdirSync(target,{recursive:true});else{
     fs.mkdirSync(path.dirname(target),{recursive:true});
     const input=await new Promise((res,rej)=>zip.openReadStream(entry,(e,s)=>e?rej(e):res(s)));
     await pipeline(input,fs.createWriteStream(target,{flags:'wx'}));
    }
    zip.readEntry();
   })().catch(fail);});zip.readEntry();
  });
 });
}
function verifySprites(root){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 if(manifest.version!==1||Object.keys(manifest.variants).length!==14)throw Error('Unexpected sprite manifest');
 const referenced=new Set();
 for(const variant of Object.values(manifest.variants)){
  if(!Number.isFinite(variant.width)||variant.width<=0||!Number.isFinite(variant.height)||variant.height<=0||variant.faceOffset.length!==2||variant.faceSize.length!==2||variant.speech.mouth.length!==2)throw Error('Invalid sprite geometry');
  referenced.add(variant.body);
  for(const expression of ['neutral','serious','smile','surprised'])for(const eye of ['open','half','closed'])for(const mouth of ['closed','small','medium']){
   const file=variant.frames[expression]?.[eye]?.[mouth];if(!file)throw Error('Missing expression frame');referenced.add(file);
  }
 }
 if(referenced.size!==Object.keys(manifest.assetHashes).length)throw Error('Manifest contains unreferenced resources');
 for(const file of referenced){
  if(!/^assets\/[a-zA-Z0-9_.-]+\.png$/.test(file)||!manifest.assetHashes[file])throw Error('Invalid resource path');
  const bytes=fs.readFileSync(path.join(root,file));if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||sha256(bytes)!==manifest.assetHashes[file])throw Error(`Resource hash mismatch: ${file}`);
 }
 return manifest;
}
function assertPE(bytes){
 if(bytes.length<64||bytes.toString('ascii',0,2)!=='MZ')throw Error('Not a Windows PE executable');
 const offset=bytes.readUInt32LE(60);
 if(offset+6>bytes.length||bytes.toString('ascii',offset,offset+4)!=='PE\0\0'||bytes.readUInt16LE(offset+4)!==0x8664)throw Error('Executable is not Windows x64');
}
function walk(root){return fs.readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(root,e.name)):[path.join(root,e.name)]);}
async function createZip(root,destination){
 const {ZipFile}=require('yazl'),zip=new ZipFile();const output=fs.createWriteStream(destination);const done=pipeline(zip.outputStream,output);
 for(const file of walk(root).sort())zip.addFile(file,path.relative(path.dirname(root),file).split(path.sep).join('/'));
 zip.end();await done;
}
module.exports={sha256,safeEntryPath,extract,verifySprites,assertPE,walk,createZip};

async function verifyZip(zipFile,runtime){
 const yauzl=require('yauzl');const expected=new Map(walk(runtime).map(file=>[path.relative(path.dirname(runtime),file).split(path.sep).join('/'),sha256(fs.readFileSync(file))]));
 await new Promise((resolve,reject)=>{
  yauzl.open(zipFile,{lazyEntries:true},(error,zip)=>{
   if(error)return reject(error);const fail=e=>{zip.close();reject(e);};zip.on('error',fail);
   zip.on('end',()=>expected.size?reject(Error('ZIP missing distribution files')):resolve());
   zip.on('entry',entry=>{
    if(!expected.has(entry.fileName))return fail(Error(`Unexpected ZIP entry: ${entry.fileName}`));
    const expectedHash=expected.get(entry.fileName);expected.delete(entry.fileName);
    zip.openReadStream(entry,(e,input)=>{
     if(e)return fail(e);const hash=crypto.createHash('sha256');input.on('data',chunk=>hash.update(chunk));input.on('error',fail);
     input.on('end',()=>{if(hash.digest('hex')!==expectedHash)return fail(Error(`ZIP content mismatch: ${entry.fileName}`));zip.readEntry();});
    });
   });zip.readEntry();
  });
 });
 console.log('Final ZIP reopened: all distribution bytes match the verified output directory.');
}
module.exports.verifyZip=verifyZip;

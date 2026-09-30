'use strict';
const fs=require('node:fs');const path=require('node:path');const {randomUUID}=require('node:crypto');const {pathToFileURL}=require('node:url');
const EXTENSIONS=new Set(['.wav','.mp3','.m4a','.aac','.ogg','.flac']);
class MusicLibrary{
 constructor(root){
  this.root=path.join(root,'Music');this.index=path.join(this.root,'library.json');this.entries=[];
  if(fs.existsSync(this.index)){
   try{
    const entries=JSON.parse(fs.readFileSync(this.index,'utf8'));
    if(!Array.isArray(entries)||entries.length>10000)throw Error();
    const ids=new Set();
    for(const t of entries){
     if(!t||typeof t.id!=='string'||ids.has(t.id)||typeof t.name!=='string'||typeof t.file!=='string'||!/^[-a-zA-Z0-9]+\.(wav|mp3|m4a|aac|ogg|flac)$/.test(t.file))throw Error();
     ids.add(t.id);
    }
    this.entries=entries;
   }catch{throw Error('音乐索引损坏，已保留原文件。请备份数据目录后修复 Music/library.json。');}
  }
 }
 save(entries){
  fs.mkdirSync(this.root,{recursive:true});const tmp=path.join(this.root,`.library-${randomUUID()}.tmp`);
  try{fs.writeFileSync(tmp,JSON.stringify(entries,null,2),{flag:'wx'});fs.renameSync(tmp,this.index);this.entries=entries;}
  finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
 }
 tracks(){return this.entries.filter(t=>fs.existsSync(path.join(this.root,t.file))).map(t=>({id:t.id,name:t.name,url:pathToFileURL(path.join(this.root,t.file)).href}));}
 import(files){
  if(!Array.isArray(files)||files.length>500)throw Error('一次最多导入 500 首音乐。');
  const entries=[...this.entries],created=[];
  try{
   fs.mkdirSync(this.root,{recursive:true});
   for(const source of files){
    const ext=path.extname(source).toLowerCase();if(!EXTENSIONS.has(ext)||!fs.statSync(source).isFile())throw Error('请选择 WAV、MP3、M4A、AAC、OGG 或 FLAC 音乐。');
    const id=randomUUID(),file=id+ext,dest=path.join(this.root,file);
    fs.copyFileSync(source,dest,fs.constants.COPYFILE_EXCL);created.push(dest);entries.push({id,name:path.basename(source),file});
   }
   this.save(entries);
  }catch(e){for(const file of created){try{fs.unlinkSync(file);}catch{}}throw e;}
  return this.tracks();
 }
 remove(id){if(!this.entries.some(t=>t.id===id))throw Error('曲目不存在。');this.save(this.entries.filter(t=>t.id!==id));}
}
module.exports={MusicLibrary,EXTENSIONS};

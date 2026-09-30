'use strict';
const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');const {walk,verifySprites}=require('./package-lib.cjs');
const root=path.resolve(__dirname,'..');
for(const dir of ['src','scripts','test'])for(const file of walk(path.join(root,dir)).filter(f=>/\.(c?js)$/.test(f))){
 const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);
}
const manifest=verifySprites(path.resolve(root,'../ChihayaPet/Resources/CharacterSprites'));
console.log(`Syntax OK; verified ${Object.keys(manifest.variants).length} sprite variants and ${Object.keys(manifest.assetHashes).length} image hashes.`);

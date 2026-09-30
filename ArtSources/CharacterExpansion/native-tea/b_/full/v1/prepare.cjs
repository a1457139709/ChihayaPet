// Prepare a shoulder-to-old-hand crop only. The head and expression never enter imagegen.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const sharp=require('sharp');
const dir=__dirname,root=path.resolve(dir,'../../../../../..');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'ArtSources/CharacterExpansion/native-tea/originals.json'))).variants['b_/full'];
const crop={left:24,top:186,width:264,height:366};
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
(async()=>{
 const original=path.join(root,baseline.body);
 if(hash(original)!==baseline.bodySHA256)throw new Error('Original body has changed');
 await sharp(original).extract(crop).png().toFile(path.join(dir,'torso-source-native.png'));
 await sharp(path.join(dir,'torso-source-native.png')).resize(crop.width*4,crop.height*4,{kernel:'nearest'}).png().toFile(path.join(dir,'torso-edit-input.png'));
 fs.writeFileSync(path.join(dir,'crop.json'),JSON.stringify({variant:'b_/full',source:baseline.body,sourceSHA256:hash(original),nativeCanvas:[310,606],crop,inputPreviewScale:4,note:'Only a shoulder-to-old-hand garment crop is supplied to imagegen. The original head, transparent face opening and all expression PNGs stay outside generation.'},null,2)+'\n');
 console.log(JSON.stringify({crop,input:path.join(dir,'torso-edit-input.png')},null,2));
})();

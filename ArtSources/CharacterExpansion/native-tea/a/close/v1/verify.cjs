// Independent RGBA checks plus native-size/scale/light/dark visual proof images.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const sharp=require('sharp');
const {PNG}=require('pngjs');
const dir=__dirname,root=path.resolve(dir,'../../../../../..');
const read=p=>PNG.sync.read(fs.readFileSync(p));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const local=n=>path.join(dir,n);
const save=(name,png)=>fs.writeFileSync(local(name),PNG.sync.write(png,{colorType:6}));
const baseline=JSON.parse(fs.readFileSync(path.join(root,'ArtSources/CharacterExpansion/native-tea/originals.json'))).variants['a/close'];
const mother=read(local('mother-body.png')),original=read(path.join(root,baseline.body));
const mask=read(local('local-edit-mask.png')),hair=read(local('original-hair-preservation-mask.png'));
const [ox,oy]=baseline.faceOffset,[fw,fh]=baseline.faceSize;
if(hash(path.join(root,baseline.body))!==baseline.bodySHA256)throw new Error('Original winter-close body changed');
for(const layer of [original,mask,hair])if(layer.width!==454||layer.height!==606)throw new Error('Unexpected native layer canvas');
const counts={outsideMaskRGBAMismatches:0,headRGBAMismatches:0,faceRegionRGBAMismatches:0,protectedHairRGBAMismatches:0};
let transparent=0,partial=0,changed=0;
for(let y=0;y<mother.height;y++)for(let x=0;x<mother.width;x++){
 const p=(y*mother.width+x)*4,same=mother.data.subarray(p,p+4).equals(original.data.subarray(p,p+4));
 if(!same)changed++;
 if(!mask.data[p+3]&&!same)counts.outsideMaskRGBAMismatches++;
 if(y<268&&!same)counts.headRGBAMismatches++;
 if(x>=ox&&x<ox+fw&&y>=oy&&y<oy+fh&&!same)counts.faceRegionRGBAMismatches++;
 if(hair.data[p+3]&&!same)counts.protectedHairRGBAMismatches++;
 if(mother.data[p+3]===0)transparent++;
 else if(mother.data[p+3]<255)partial++;
}
if(mother.width!==454||mother.height!==606||!transparent||Object.values(counts).some(Boolean))throw new Error('Native RGBA verification failed: '+JSON.stringify(counts));
const compose=face=>{
 const output=new PNG({width:mother.width,height:mother.height});mother.data.copy(output.data);
 for(let y=0;y<face.height;y++)for(let x=0;x<face.width;x++){
  const s=(y*face.width+x)*4,p=((y+oy)*output.width+x+ox)*4,sa=face.data[s+3],da=output.data[p+3];
  if(!sa)continue;
  if(sa===255||da===0){face.data.copy(output.data,p,s,s+4);continue;}
  const a=sa/255,b=da/255,out=a+b*(1-a);
  for(let c=0;c<3;c++)output.data[p+c]=Math.round((face.data[s+c]*a+output.data[p+c]*b*(1-a))/out);
  output.data[p+3]=Math.round(out*255);
 }
 return output;
};
const faceChecks=[];
for(const source of baseline.faces){
 const fp=path.join(root,source.path);
 if(hash(fp)!==source.sha256)throw new Error('Original face changed: '+source.path);
 const face=read(fp),output=compose(face);
 let outside=0,opaque=0,overTransparent=0;
 for(let y=0;y<output.height;y++)for(let x=0;x<output.width;x++){
  const p=(y*output.width+x)*4;
  if(x<ox||x>=ox+fw||y<oy||y>=oy+fh){
   if(!output.data.subarray(p,p+4).equals(mother.data.subarray(p,p+4)))outside++;
  }else{
   const s=((y-oy)*face.width+x-ox)*4;
   if(face.data[s+3]===255&&!output.data.subarray(p,p+4).equals(face.data.subarray(s,s+4)))opaque++;
   if(mother.data[p+3]===0&&face.data[s+3]>0&&!output.data.subarray(p,p+4).equals(face.data.subarray(s,s+4)))overTransparent++;
  }
 }
 if(outside||opaque||overTransparent)throw new Error('Face compositing drift: '+source.id);
 faceChecks.push({id:source.id,source:source.path,sourceSHA256:source.sha256,faceOffset:baseline.faceOffset,outsideFaceRGBAMismatches:outside,opaqueFaceRGBAMismatches:opaque,faceOverTransparentBodyRGBAMismatches:overTransparent});
 if(['00','04'].includes(source.id))save('qa-face'+source.id+'-native.png',output);
}
const evidence={canvas:[454,606],faceCanvas:[204,154],faceOffset:baseline.faceOffset,originalBodySHA256:hash(path.join(root,baseline.body)),motherSHA256:hash(local('mother-body.png')),changedPixels:changed,transparentPixels:transparent,partialAlphaPixels:partial,checks:counts,faceSwitching:faceChecks,review:'pending',application:'not-integrated'};
fs.writeFileSync(local('qa-verification.json'),JSON.stringify(evidence,null,2)+'\n');
(async()=>{
 const panels=[];
 for(const background of ['#f6f2eb','#242833'])for(const name of ['mother-body.png','qa-face00-native.png','qa-face04-native.png']){
  panels.push(await sharp(local(name)).flatten({background}).png().toBuffer());
 }
 const labels=['独立母图 · 无表情','游戏原脸 00','游戏原脸 04'];
 let svg='<svg width="1390" height="1274" xmlns="http://www.w3.org/2000/svg">';
 for(let row=0;row<2;row++)for(let col=0;col<3;col++)svg+=`<text x="${col*464+14}" y="${row*637+22}" font-size="16" fill="${row?'#ffffff':'#333333'}">${labels[col]} · 454×606</text>`;
 svg+='</svg>';
 await sharp({create:{width:1390,height:1274,channels:4,background:'#eeeae4'}}).composite([...panels.map((input,i)=>({input,left:(i%3)*464,top:Math.floor(i/3)*637+28})),{input:Buffer.from(svg)}]).png().toFile(local('qa-native-layers-light-dark.png'));
 const scalePanels=[];
 let totalWidth=20,top=34;
 for(const height of [240,256,480]){
  const width=Math.round(454*height/606);
  for(const background of ['#f6f2eb','#242833']){
   const input=await sharp(local('qa-face00-native.png')).resize(width,height).flatten({background}).png().toBuffer();
   scalePanels.push({input,left:totalWidth,top});totalWidth+=width+16;
  }
 }
 let scaleSVG=`<svg width="${totalWidth}" height="535" xmlns="http://www.w3.org/2000/svg">`;
 let x=20;
 for(const height of [240,256,480]){
  const width=Math.round(454*height/606);
  scaleSVG+=`<text x="${x}" y="22" font-size="16" fill="#303030">高度 ${height} · 浅 / 深底</text>`;
  x+=(width+16)*2;
 }
 scaleSVG+='</svg>';
 await sharp({create:{width:totalWidth,height:535,channels:4,background:'#ddd9d4'}}).composite([...scalePanels,{input:Buffer.from(scaleSVG)}]).png().toFile(local('qa-light-dark-scales.png'));
 await sharp(local('qa-face00-native.png')).extract({left:35,top:232,width:370,height:337}).resize(740,674,{kernel:'nearest'}).flatten({background:'#242833'}).png().toFile(local('qa-torso-detail-dark.png'));
 console.log(JSON.stringify({checks:counts,facesChecked:faceChecks.length,transparentPixels:transparent,nativeCanvas:'passed',previewOnly:['qa-face00-native.png','qa-face04-native.png']},null,2));
})();

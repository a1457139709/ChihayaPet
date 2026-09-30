// Independent source-pixel, face-layer and native/scale visual verification.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const sharp=require('sharp');const {PNG}=require('pngjs');
const dir=__dirname,root=path.resolve(dir,'../../../../../..');
const local=n=>path.join(dir,n),read=p=>PNG.sync.read(fs.readFileSync(p));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const save=(n,png)=>fs.writeFileSync(local(n),PNG.sync.write(png,{colorType:6}));
const baseline=JSON.parse(fs.readFileSync(path.join(root,'ArtSources/CharacterExpansion/native-tea/originals.json'))).variants['b_/full'];
const original=read(path.join(root,baseline.body)),mother=read(local('mother-body.png'));
const mask=read(local('local-edit-mask.png')),hair=read(local('original-hair-preservation-mask.png'));
const [ox,oy]=baseline.faceOffset,[fw,fh]=baseline.faceSize;
if(hash(path.join(root,baseline.body))!==baseline.bodySHA256)throw new Error('Original body has changed');
const counts={outsideMaskRGBAMismatches:0,headRGBAMismatches:0,faceRegionRGBAMismatches:0,protectedOpaqueHairRGBAMismatches:0};
let changed=0,transparent=0,partialAlpha=0;
for(let y=0;y<mother.height;y++)for(let x=0;x<mother.width;x++){
 const p=(y*mother.width+x)*4,same=mother.data.subarray(p,p+4).equals(original.data.subarray(p,p+4));
 if(!same)changed++;
 if(!same&&!mask.data[p+3])counts.outsideMaskRGBAMismatches++;
 if(!same&&y<247)counts.headRGBAMismatches++;
 if(!same&&x>=ox&&x<ox+fw&&y>=oy&&y<oy+fh)counts.faceRegionRGBAMismatches++;
 if(!same&&hair.data[p+3])counts.protectedOpaqueHairRGBAMismatches++;
 if(!mother.data[p+3])transparent++;else if(mother.data[p+3]<255)partialAlpha++;
}
if(mother.width!==310||mother.height!==606||!transparent||Object.values(counts).some(Boolean))throw new Error('Native pixel verification failed: '+JSON.stringify(counts));
const compose=(body,face)=>{
 const output=new PNG({width:body.width,height:body.height});body.data.copy(output.data);
 for(let y=0;y<face.height;y++)for(let x=0;x<face.width;x++){
  const s=(y*face.width+x)*4,p=((y+oy)*output.width+x+ox)*4,sa=face.data[s+3],da=body.data[p+3];
  if(!sa)continue;
  if(sa===255||da===0){face.data.copy(output.data,p,s,s+4);continue;}
  const a=sa/255,b=da/255,out=a+b*(1-a);
  for(let c=0;c<3;c++)output.data[p+c]=Math.round((face.data[s+c]*a+body.data[p+c]*b*(1-a))/out);
  output.data[p+3]=Math.round(out*255);
 }
 return output;
};
const faces=[];
for(const f of baseline.faces){
 const fp=path.join(root,f.path);if(hash(fp)!==f.sha256)throw new Error('Original face changed: '+f.id);
 const face=read(fp),output=compose(mother,face);
 if(face.width!==fw||face.height!==fh)throw new Error('Paired face size mismatch');
 let outside=0,opaque=0,onTransparent=0;
 for(let y=0;y<output.height;y++)for(let x=0;x<output.width;x++){
  const p=(y*output.width+x)*4;
  if(x<ox||x>=ox+fw||y<oy||y>=oy+fh){
   if(!output.data.subarray(p,p+4).equals(mother.data.subarray(p,p+4)))outside++;
  }else{
   const s=((y-oy)*face.width+x-ox)*4;
   if(face.data[s+3]===255&&!output.data.subarray(p,p+4).equals(face.data.subarray(s,s+4)))opaque++;
   if(mother.data[p+3]===0&&face.data[s+3]>0&&!output.data.subarray(p,p+4).equals(face.data.subarray(s,s+4)))onTransparent++;
  }
 }
 if(outside||opaque||onTransparent)throw new Error('Face compositing drift: '+f.id);
 faces.push({id:f.id,source:f.path,sourceSHA256:f.sha256,offset:[ox,oy],outsideFaceRGBAMismatches:outside,opaqueFaceRGBAMismatches:opaque,faceOverTransparentBodyRGBAMismatches:onTransparent});
 if(['00','04','06'].includes(f.id))save('qa-face'+f.id+'-native.png',output);
 if(f.id==='00')save('qa-source-standing-native.png',compose(original,face));
}
const evidence={date:'2026-09-30',timezone:'Asia/Shanghai',canvas:[310,606],faceSize:[114,100],faceOffset:[ox,oy],sourceBodySHA256:hash(path.join(root,baseline.body)),motherSHA256:hash(local('mother-body.png')),changedPixels:changed,transparentPixels:transparent,partialAlphaPixels:partialAlpha,checks:counts,faceSwitching:faces,previewFaces:['00','04','06'],expressionInventory:'The seven side-facing original expressions do not contain a closed-eye smile. No new expression or blink frame was generated.',offlinePreviewHeights:[240,256,480],backgrounds:['light','dark'],visualInspection:'pending',review:'pending',application:'not-integrated'};
fs.writeFileSync(local('qa-verification.json'),JSON.stringify(evidence,null,2)+'\n');
(async()=>{
 const artNames=['qa-source-standing-native.png','mother-body.png','qa-face00-native.png','qa-face04-native.png'];
 const labels=['游戏原站姿','独立身体层 · 无表情','原脸 00 · 分层效果','原脸 04 · 分层效果'];
 const panels=[];
 for(let row=0;row<2;row++)for(let col=0;col<4;col++){
  const background=row?'#242833':'#f6f2eb';
  const art=await sharp(local(artNames[col])).flatten({background}).png().toBuffer();
  const title=Buffer.from(`<svg width="330" height="30"><rect width="330" height="30" fill="${background}"/><text x="8" y="21" font-family="sans-serif" font-size="14" fill="${row?'#ffffff':'#333333'}">${labels[col]} · 310×606</text></svg>`);
  panels.push({input:title,left:col*330,top:row*647});
  panels.push({input:art,left:col*330+10,top:row*647+32});
 }
 await sharp({create:{width:1320,height:1294,channels:4,background:'#ddd9d4'}}).composite(panels).png().toFile(local('qa-native-layers-light-dark.png'));
 const scalePanels=[];let x=16;
 for(const height of [240,256,480])for(const background of ['#f6f2eb','#242833']){
  const width=Math.round(310*height/606);
  const art=await sharp(local('qa-face00-native.png')).resize(width,height).flatten({background}).png().toBuffer();
  const title=Buffer.from(`<svg width="${width}" height="30"><text x="2" y="20" font-size="14" fill="#333333">${height}px ${background==='#242833'?'深色':'浅色'}</text></svg>`);
  scalePanels.push({input:title,left:x,top:0},{input:art,left:x,top:32});x+=width+16;
 }
 await sharp({create:{width:x,height:530,channels:4,background:'#ddd9d4'}}).composite(scalePanels).png().toFile(local('qa-light-dark-scales.png'));
 await sharp(local('qa-face00-native.png')).extract({left:24,top:216,width:264,height:342}).resize(792,1026,{kernel:'nearest'}).flatten({background:'#242833'}).png().toFile(local('qa-assembly-detail-dark.png'));
 console.log(JSON.stringify({canvas:[310,606],changedPixels:changed,checks:counts,originalFacesVerified:faces.length,previewOnly:evidence.previewFaces,userReview:'pending'},null,2));
})();

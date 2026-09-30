// Verify original RGBA outside the recorded edit mask and every paired expression.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const sharp=require('sharp'),{PNG}=require('pngjs');
const dir=__dirname,root=path.resolve(dir,'../../../../../..');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'ArtSources/CharacterExpansion/native-tea/originals.json'))).variants['b/close'];
const read=p=>PNG.sync.read(fs.readFileSync(p)),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const local=name=>path.join(dir,name),save=(name,png)=>fs.writeFileSync(local(name),PNG.sync.write(png,{colorType:6}));
const original=read(path.join(root,baseline.body)),mother=read(local('mother-body.png')),mask=read(local('local-edit-mask.png')),hair=read(local('original-hair-preservation-mask.png'));
const [ox,oy]=baseline.faceOffset,[fw,fh]=baseline.faceSize,w=mother.width,h=mother.height;
const counts={outsideMaskRGBAMismatches:0,headAndUpperGarmentRGBAMismatches:0,faceRegionRGBAMismatches:0,protectedHairRGBAMismatches:0};
let transparent=0,partial=0,changed=0;
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 const p=(y*w+x)*4,same=mother.data.subarray(p,p+4).equals(original.data.subarray(p,p+4));
 if(!same)changed++;
 if(!mask.data[p+3]&&!same)counts.outsideMaskRGBAMismatches++;
 if(y<326&&!same)counts.headAndUpperGarmentRGBAMismatches++;
 if(x>=ox&&x<ox+fw&&y>=oy&&y<oy+fh&&!same)counts.faceRegionRGBAMismatches++;
 if(hair.data[p+3]&&!same)counts.protectedHairRGBAMismatches++;
 if(mother.data[p+3]===0)transparent++;else if(mother.data[p+3]<255)partial++;
}
if(hash(path.join(root,baseline.body))!==baseline.bodySHA256||w!==508||h!==606||!transparent||Object.values(counts).some(Boolean))throw new Error('Native RGBA preservation failed');
const compose=face=>{
 const out=new PNG({width:w,height:h});mother.data.copy(out.data);
 for(let y=0;y<face.height;y++)for(let x=0;x<face.width;x++){
  const s=(y*face.width+x)*4,p=((y+oy)*w+x+ox)*4,sa=face.data[s+3],da=mother.data[p+3];
  if(!sa)continue;
  if(sa===255||da===0){face.data.copy(out.data,p,s,s+4);continue;}
  const a=sa/255,b=da/255,alpha=a+b*(1-a);
  for(let c=0;c<3;c++)out.data[p+c]=Math.round((face.data[s+c]*a+mother.data[p+c]*b*(1-a))/alpha);
  out.data[p+3]=Math.round(alpha*255);
 }
 return out;
};
const faces=[];
for(const source of baseline.faces){
 const p=path.join(root,source.path);
 if(hash(p)!==source.sha256)throw new Error('Original face changed: '+source.path);
 const face=read(p),out=compose(face);
 if(face.width!==fw||face.height!==fh)throw new Error('Wrong paired face size');
 let outside=0,opaque=0,overTransparent=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=(y*w+x)*4;
  if(x<ox||x>=ox+fw||y<oy||y>=oy+fh){if(!out.data.subarray(p,p+4).equals(mother.data.subarray(p,p+4)))outside++;}
  else{const s=((y-oy)*fw+x-ox)*4;if(face.data[s+3]===255&&!out.data.subarray(p,p+4).equals(face.data.subarray(s,s+4)))opaque++;if(mother.data[p+3]===0&&face.data[s+3]>0&&!out.data.subarray(p,p+4).equals(face.data.subarray(s,s+4)))overTransparent++;}
 }
 if(outside||opaque||overTransparent)throw new Error('Face composition shifted: '+source.id);
 faces.push({...source,faceOffset:baseline.faceOffset,outsideFaceRGBAMismatches:outside,opaqueFaceRGBAMismatches:opaque,faceOverTransparentBodyRGBAMismatches:overTransparent});
 if(['00','04','06'].includes(source.id))save('qa-face'+source.id+'-native.png',out);
}
const evidence={canvas:[w,h],faceCanvas:[fw,fh],faceOffset:baseline.faceOffset,originalBodySHA256:hash(path.join(root,baseline.body)),motherSHA256:hash(local('mother-body.png')),changedPixels:changed,transparentPixels:transparent,partialAlphaPixels:partial,checks:counts,faceSwitching:faces,closedEyeSmile:'Not available among this side-view original face set; 04 is an open-eyed tooth smile, not a blink.',review:'pending',application:'not-integrated'};
fs.writeFileSync(local('qa-verification.json'),JSON.stringify(evidence,null,2)+'\n');
(async()=>{
 const panels=[],names=['mother-body.png','qa-face00-native.png','qa-face04-native.png'];
 for(const background of ['#f6f2eb','#242833'])for(const name of names)panels.push(await sharp(local(name)).flatten({background}).png().toBuffer());
 const labels=['独立母图 · 无表情','原脸 00 · 默认','原脸 04 · 露齿笑'];
 let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1554" height="1274">';
 for(let row=0;row<2;row++)for(let col=0;col<3;col++)svg+=`<text x="${col*518+8}" y="${row*637+22}" font-size="16" fill="${row?'#fff':'#333'}">${labels[col]} · 508×606</text>`;
 svg+='</svg>';
 await sharp({create:{width:1554,height:1274,channels:4,background:'#e9e5df'}}).composite([...panels.map((input,i)=>({input,left:(i%3)*518,top:Math.floor(i/3)*637+28})),{input:Buffer.from(svg)}]).png().toFile(local('qa-native-layers-light-dark.png'));
 const scalePanels=[];let width=16;
 for(const height of [240,256,480])for(const background of ['#f6f2eb','#242833']){
  const scaled=Math.round(w*height/h),input=await sharp(local('qa-face00-native.png')).resize(scaled,height).flatten({background}).png().toBuffer();
  scalePanels.push({input,left:width,top:34});width+=scaled+16;
 }
 let scaleSvg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="535">`,x=16;
 for(const height of [240,256,480]){scaleSvg+=`<text x="${x}" y="22" font-size="16" fill="#333">高度 ${height} · 浅 / 深底</text>`;x+=2*(Math.round(w*height/h)+16);}
 scaleSvg+='</svg>';
 await sharp({create:{width,height:535,channels:4,background:'#ddd9d4'}}).composite([...scalePanels,{input:Buffer.from(scaleSvg)}]).png().toFile(local('qa-light-dark-scales.png'));
 await sharp(local('qa-face00-native.png')).extract({left:52,top:302,width:432,height:288}).resize(864,576,{kernel:'nearest'}).flatten({background:'#242833'}).png().toFile(local('qa-torso-detail-dark.png'));
 await sharp(local('original-hair-preservation-mask.png')).flatten({background:'#242833'}).png().toFile(local('qa-hair-mask.png'));
 console.log(JSON.stringify({canvas:[w,h],facesChecked:faces.length,checks:counts,transparentPixels:transparent,previewOnly:['qa-face00-native.png','qa-face04-native.png','qa-face06-native.png']},null,2));
})();

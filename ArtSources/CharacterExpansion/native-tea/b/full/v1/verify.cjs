// Independent pixel checks and visual proofs; composites here are QA previews only.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),vm=require('vm');
const sharp=require('sharp'),{PNG}=require('pngjs');
const dir=__dirname,root=path.resolve(dir,'../../../../../..');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'ArtSources/CharacterExpansion/native-tea/originals.json'))).variants['b/full'];
const production=JSON.parse(fs.readFileSync(path.join(dir,'production.json')));
const review=production.checks.review;
const previousQA=fs.existsSync(path.join(dir,'qa-verification.json'))?JSON.parse(fs.readFileSync(path.join(dir,'qa-verification.json'))):{};
const read=p=>PNG.sync.read(fs.readFileSync(p)),local=n=>path.join(dir,n);
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const save=(name,png)=>fs.writeFileSync(local(name),PNG.sync.write(png,{colorType:6}));
const original=read(path.join(root,baseline.body)),mother=read(local('mother-body.png'));
const mask=read(local('local-edit-mask.png')),hair=read(local('original-hair-preservation-mask.png'));
const [ox,oy]=baseline.faceOffset,[fw,fh]=baseline.faceSize;
const counts={outsideMaskRGBAMismatches:0,headRGBAMismatches:0,faceRegionRGBAMismatches:0,protectedHairRGBAMismatches:0};
let transparent=0,partial=0,changed=0;
for(let y=0;y<mother.height;y++)for(let x=0;x<mother.width;x++){
  const p=(y*mother.width+x)*4,same=mother.data.subarray(p,p+4).equals(original.data.subarray(p,p+4));
  if(!same)changed++;
  if(!mask.data[p+3]&&!same)counts.outsideMaskRGBAMismatches++;
  if(y<228&&!same)counts.headRGBAMismatches++;
  if(x>=ox&&x<ox+fw&&y>=oy&&y<oy+fh&&!same)counts.faceRegionRGBAMismatches++;
  if(hair.data[p+3]&&!same)counts.protectedHairRGBAMismatches++;
  if(mother.data[p+3]===0)transparent++;
  else if(mother.data[p+3]<255)partial++;
}
if(mother.width!==310||mother.height!==606||!transparent||Object.values(counts).some(Boolean))throw new Error('Native RGBA verification failed: '+JSON.stringify(counts));
if(hash(path.join(root,baseline.body))!==baseline.bodySHA256)throw new Error('Original source changed');
const compose=(body,face)=>{
  const output=new PNG({width:body.width,height:body.height});body.data.copy(output.data);
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
const faceChecks=[],previews=[];
for(const source of baseline.faces){
  const fp=path.join(root,source.path);
  if(hash(fp)!==source.sha256)throw new Error('Original face changed: '+source.path);
  const face=read(fp),output=compose(mother,face);
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
  previews.push(PNG.sync.write(output,{colorType:6}));
  if(['00','04','06'].includes(source.id))save('qa-face'+source.id+'-native.png',output);
}
save('qa-standing-face00.png',compose(original,read(path.join(root,baseline.defaultFace))));
const record={date:'2026-09-30',canvas:[310,606],faceCanvas:[114,100],faceOffset:baseline.faceOffset,originalBodySHA256:hash(path.join(root,baseline.body)),motherSHA256:hash(local('mother-body.png')),changedPixels:changed,transparentPixels:transparent,partialAlphaPixels:partial,checks:counts,faceSwitching:faceChecks,expressionInventory:'b/full has seven paired original faces (00–06), all with open eyes; no closed-eye smile or blink frame is present. Do not borrow a front face or reinterpret 04 as closed eyes.',offlinePreviewHeights:[240,256,480],backgrounds:['light','dark'],review,application:'not-integrated',...(production.approval?{approval:production.approval}:{})};
const label=(text,w)=>Buffer.from(`<svg width="${w}" height="30" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f4f6f9"/><text x="10" y="21" font-family="Arial" font-size="13" fill="#334155">${text}</text></svg>`);
(async()=>{
  const panels=[],names=['Original standing / 00','Tea body / no expression','Tea + original face 00','Tea + original face 04'];
  const inputs=['qa-standing-face00.png','mother-body.png','qa-face00-native.png','qa-face04-native.png'];
  for(let row=0;row<2;row++)for(let col=0;col<4;col++){
    const background=row?'#243044':'#fffaf3',left=col*326,top=row*648;
    panels.push({input:label(names[col],326),left,top});
    panels.push({input:await sharp(local(inputs[col])).flatten({background}).png().toBuffer(),left:left+8,top:top+34});
  }
  await sharp({create:{width:1304,height:1296,channels:4,background:'#f4f6f9'}}).composite(panels).png().toFile(local('qa-native-layers-light-dark.png'));
  const scalePanels=[];let totalWidth=12;
  for(const height of [240,256,480])for(const background of ['#fffaf3','#243044']){
    const width=Math.round(310*height/606),panelWidth=Math.max(width,145);
    scalePanels.push({input:label(`${height}px / ${background==='#243044'?'dark':'light'}`,panelWidth),left:totalWidth,top:0});
    const input=await sharp(local('qa-face00-native.png')).resize(width,height).flatten({background}).png().toBuffer();
    scalePanels.push({input,left:totalWidth+Math.floor((panelWidth-width)/2),top:34});totalWidth+=panelWidth+12;
  }
  await sharp({create:{width:totalWidth,height:528,channels:4,background:'#e8e7e4'}}).composite(scalePanels).png().toFile(local('qa-light-dark-scales.png'));
  const facePanels=[];
  for(let i=0;i<previews.length;i++){
    facePanels.push({input:label(`Original face ${baseline.faces[i].id}`,326),left:i*326,top:0});
    facePanels.push({input:await sharp(previews[i]).flatten({background:'#fffaf3'}).png().toBuffer(),left:i*326+8,top:34});
  }
  await sharp({create:{width:previews.length*326,height:648,channels:4,background:'#fffaf3'}}).composite(facePanels).png().toFile(local('qa-face-switching.png'));
  await sharp(local('qa-face00-native.png')).extract({left:24,top:180,width:268,height:370}).resize(804,1110,{kernel:'nearest'}).flatten({background:'#243044'}).png().toFile(local('qa-torso-detail-dark.png'));
  await sharp(local('qa-face00-native.png')).extract({left:84,top:65,width:144,height:140}).resize(576,560,{kernel:'nearest'}).flatten({background:'#243044'}).png().toFile(local('qa-head-and-face-detail.png'));
  if(process.argv.includes('--report')){
    const html=fs.readFileSync(path.join(root,'docs/reports/chihaya-character-progress.html'),'utf8');
    new vm.Script(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1]);
    const data=JSON.parse(html.match(/<script type="application\/json" id="progress-data">([\s\S]*?)<\/script>/)[1]);
    const result=data.outfits.find(o=>o.id==='b').results.full;
    if(result.mother.sha256!==hash(local('mother-body.png')))throw new Error('Report mother hash is stale');
    if(result.checks.review!==review)throw new Error('Report review state is stale');
    if(review==='passed'){
      const manifest=JSON.parse(fs.readFileSync(local(production.composites)));
      if(manifest.motherSHA256!==record.motherSHA256||result.composites.length!==baseline.faces.length)throw new Error('Incomplete approved export set');
      for(const image of result.composites){
        const exportRecord=manifest.results.find(r=>r.path===image.path);
        if(!exportRecord||image.sha256!==exportRecord.sha256||hash(path.join(root,image.path))!==image.sha256||Object.values(exportRecord.checks).some(Boolean))throw new Error('Approved export differs from manifest: '+image.path);
        const faceIndex=baseline.faces.findIndex(f=>f.id===exportRecord.id);
        const exported=read(path.join(root,image.path)),expected=PNG.sync.read(previews[faceIndex]);
        if(!exported.data.equals(expected.data))throw new Error('Approved export differs from independent composition: '+image.path);
      }
      record.exports={manifest:production.composites,count:result.composites.length,RGBA:'passed; all exports equal independent original-face compositions'};
    }else if(result.composites.length)throw new Error('Unreviewed full composite set was exported');
    let refs=0;
    for(const outfit of data.outfits){
      const images=[...Object.values(outfit.sources).flatMap(s=>[s.body,...s.faces]),...Object.values(outfit.results).flatMap(r=>[r.mother,r.localPart,...r.composites]).filter(Boolean)];
      for(const im of images){if(!fs.existsSync(path.join(root,im.path)))throw new Error('Broken image reference: '+im.path);refs++;}
    }
    record.report={pageJavaScriptSyntax:'passed',pageImageReferences:refs,pageMotherHash:'passed',reviewState:review,pageUI:previousQA.report?.pageUI||'not-run: local file URL is unavailable in browser'};
  }
  fs.writeFileSync(local('qa-verification.json'),JSON.stringify(record,null,2)+'\n');
  console.log(JSON.stringify({checks:counts,facesChecked:faceChecks.length,changedPixels:changed,nativeCanvas:record.canvas,report:record.report||'not yet registered'},null,2));
})();

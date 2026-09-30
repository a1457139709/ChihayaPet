// Independent native-pixel and separate-expression QA for the summer full view.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),vm=require('vm');
const sharp=require('sharp'),{PNG}=require('pngjs');
const dir=__dirname,root=path.resolve(dir,'../../../../../..');
const source=JSON.parse(fs.readFileSync(path.join(root,'ArtSources/CharacterExpansion/native-tea/originals.json'))).variants['a_/full'];
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read=p=>PNG.sync.read(fs.readFileSync(p));
const body=read(path.join(root,source.body)),mother=read(path.join(dir,'mother-body.png'));
const mask=read(path.join(dir,'local-edit-mask.png')),hair=read(path.join(dir,'original-hair-preservation-mask.png'));
let outside=0,head=0,changed=0,protectedHairMismatch=0,face=0,transparent=0,partialAlpha=0;
const [ox,oy]=source.faceOffset,[fw,fh]=source.faceSize;
for(let y=0;y<body.height;y++)for(let x=0;x<body.width;x++) {
  const p=(y*body.width+x)*4,different=!body.data.subarray(p,p+4).equals(mother.data.subarray(p,p+4));
  if(different)changed++;
  if(different&&mask.data[p+3]===0)outside++;
  if(different&&y<194)head++;
  if(different&&hair.data[p+3])protectedHairMismatch++;
  if(different&&x>=ox&&x<ox+fw&&y>=oy&&y<oy+fh)face++;
  if(mother.data[p+3]===0)transparent++;
  else if(mother.data[p+3]<255)partialAlpha++;
}
if(outside||head||face||protectedHairMismatch||mother.width!==268||mother.height!==606||!transparent||!partialAlpha)throw new Error('Independent native-pixel or alpha verification failed');
if(hash(path.join(root,source.body))!==source.bodySHA256)throw new Error('Original summer body changed');
for(const f of source.faces)if(hash(path.join(root,f.path))!==f.sha256)throw new Error('Original summer face changed: '+f.path);
const label=(t,w)=>Buffer.from(`<svg width="${w}" height="30"><rect width="100%" height="100%" fill="#f4f6f9"/><text x="10" y="21" font-family="Arial" font-size="13" fill="#334155">${t}</text></svg>`);
(async()=>{
  const composite=async(bodyPath,id)=>sharp(bodyPath).composite([{input:path.join(root,source.faces.find(f=>f.id===id).path),left:ox,top:oy}]).png().toBuffer();
  const standing=await composite(path.join(root,source.body),'00');
  const face00=await composite(path.join(dir,'mother-body.png'),'00');
  const face04=await composite(path.join(dir,'mother-body.png'),'04');
  fs.writeFileSync(path.join(dir,'qa-face00-native.png'),face00);
  fs.writeFileSync(path.join(dir,'qa-face04-native.png'),face04);
  const views=[standing,path.join(dir,'mother-body.png'),face00,face04];
  const names=['Summer original / face 00','Summer tea / BODY LAYER','Tea + original face 00 / QA','Tea + original face 04 / QA'];
  const layers=[];
  for(let i=0;i<4;i++){layers.push({input:label(names[i],284),left:i*284,top:0});layers.push({input:views[i],left:i*284+8,top:38});}
  await sharp({create:{width:1136,height:660,channels:4,background:'#f4f6f9'}}).composite(layers).png().toFile(path.join(dir,'qa-native-layers.png'));
  const scaled=[],heights=[240,256,480],widths=[150,160,250];let left=0;
  for(const background of ['#ffffff','#243044'])for(let i=0;i<3;i++) {
    const height=heights[i],width=widths[i];
    scaled.push({input:label(`Height ${height} / ${background==='#ffffff'?'light':'dark'}`,width),left,top:0});
    const art=await sharp(face00).resize({height}).flatten({background}).png().toBuffer();
    const panel=await sharp({create:{width,height:500,channels:4,background}}).composite([{input:art,left:Math.round((width-Math.round(268*height/606))/2),top:12}]).png().toBuffer();
    scaled.push({input:panel,left,top:30});left+=width;
  }
  await sharp({create:{width:left,height:530,channels:4,background:'#f4f6f9'}}).composite(scaled).png().toFile(path.join(dir,'qa-light-dark-scales.png'));
  await sharp(path.join(dir,'mother-body.png')).extract({left:24,top:180,width:216,height:192}).resize(864,768,{kernel:'nearest'}).flatten({background:'#243044'}).png().toFile(path.join(dir,'qa-torso-detail-dark.png'));
  const native=[];let i=0;
  for(const f of source.faces) {
    native.push({input:label(`Original summer face ${f.id}`,268),left:(i%4)*268,top:Math.floor(i/4)*636});
    native.push({input:await composite(path.join(dir,'mother-body.png'),f.id),left:(i%4)*268,top:Math.floor(i/4)*636+30});i++;
  }
  await sharp({create:{width:1072,height:1908,channels:4,background:'#f4f6f9'}}).composite(native).png().toFile(path.join(dir,'qa-all-original-faces.png'));
  const record={date:'2026-09-30',timezone:'Asia/Shanghai',canvas:[mother.width,mother.height],changedPixels:changed,outsideRGBAMismatches:outside,headRGBAMismatches:head,faceRegionRGBAMismatches:face,protectedHairRGBAMismatches:protectedHairMismatch,originalBodySHA256:'passed',originalFaceSHA256:'12/12 passed',faceOffset:source.faceOffset,faceSize:source.faceSize,transparentPixels:transparent,partialAlphaPixels:partialAlpha,previewFaces:['00','04'],allOriginalFaces:source.faces.map(f=>f.id),offlinePreviewHeights:[240,256,480],backgrounds:['light','dark'],userReview:'pending',application:'not-integrated'};
  if(process.argv.includes('--report')) {
    const html=fs.readFileSync(path.join(root,'docs/reports/chihaya-character-progress.html'),'utf8');
    new vm.Script(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1]);
    const data=JSON.parse(html.match(/<script type="application\/json" id="progress-data">([\s\S]*?)<\/script>/)[1]);
    const result=data.outfits.find(o=>o.id==='a_').results.full;
    if(result.mother.sha256!==hash(path.join(dir,'mother-body.png')))throw new Error('Report has stale summer mother');
    if(result.composites.length!==0)throw new Error('Mother review should retain original faces as separate layers');
    if(result.checks.review!=='pending')throw new Error('Review incorrectly marked as approved');
    // Other active artwork work can move the shared next pointer. Verify this
    // view's review state instead of constraining other outfits or views.
    let refs=0;
    for(const outfit of data.outfits) {
      const images=[...Object.values(outfit.sources).flatMap(s=>[s.body,...s.faces]),...Object.values(outfit.results).flatMap(r=>[r.mother,r.localPart,...r.composites]).filter(Boolean)];
      for(const im of images){if(!fs.existsSync(path.join(root,im.path))||im.sha256!==hash(path.join(root,im.path)))throw new Error('Missing or stale page image: '+im.path);refs++;}
    }
    record.report={javaScriptSyntax:'passed',imageReferences:refs,motherHash:'passed',separateExpressions:'12 original summer faces; preview only',reviewStatus:'pending'};
  }
  fs.writeFileSync(path.join(dir,'qa-verification.json'),JSON.stringify(record,null,2)+'\n');
  console.log(JSON.stringify(record,null,2));
})();

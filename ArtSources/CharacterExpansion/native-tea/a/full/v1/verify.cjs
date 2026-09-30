const fs=require('fs'),path=require('path'),crypto=require('crypto'),vm=require('vm');
const sharp=require('sharp'); const {PNG}=require('pngjs');
const dir=__dirname,root=path.resolve(dir,'../../../../../..');
const source=JSON.parse(fs.readFileSync(path.join(root,'ArtSources/CharacterExpansion/native-tea/originals.json'))).variants['a/full'];
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read=p=>PNG.sync.read(fs.readFileSync(p));
const body=read(path.join(root,source.body)),mother=read(path.join(dir,'mother-body.png')),mask=read(path.join(dir,'local-edit-mask.png'));
let outside=0,head=0,changed=0;
for(let y=0;y<body.height;y++) for(let x=0;x<body.width;x++) {
 const i=(y*body.width+x)*4,different=!body.data.subarray(i,i+4).equals(mother.data.subarray(i,i+4));
 if(different) changed++;
 if(different&&mask.data[i+3]===0) outside++;
 if(different&&y<194) head++;
}
if(outside||head||mother.width!==268||mother.height!==606) throw new Error('Independent native-pixel verification failed');
for(const f of source.faces) if(hash(path.join(root,f.path))!==f.sha256) throw new Error('Original face changed: '+f.path);
const label=(text,width)=>Buffer.from(`<svg width="${width}" height="30"><rect width="100%" height="100%" fill="#f4f6f9"/><text x="10" y="21" font-family="Arial" font-size="13" fill="#334155">${text}</text></svg>`);
(async()=>{
 const composite=async(bodyPath,faceId)=>sharp(bodyPath).composite([{input:path.join(root,source.faces.find(f=>f.id===faceId).path),left:79,top:76}]).png().toBuffer();
 const standing=await composite(path.join(root,source.body),'00');
 const face00=await composite(path.join(dir,'mother-body.png'),'00');
 const face04=await composite(path.join(dir,'mother-body.png'),'04');
 fs.writeFileSync(path.join(dir,'qa-face00-native.png'),face00);
 fs.writeFileSync(path.join(dir,'qa-face04-native.png'),face04);
 const nativeViews=[standing,path.join(dir,'mother-body.png'),face00,face04];
 const names=['Original standing / face 00','Tea body / separate expression','Tea + original face 00 / preview','Tea + original face 04 / preview'];
 const layers=[];
 for(let i=0;i<4;i++) {layers.push({input:label(names[i],284),left:i*284,top:0});layers.push({input:nativeViews[i],left:i*284+8,top:38});}
 await sharp({create:{width:1136,height:660,channels:4,background:'#f4f6f9'}}).composite(layers).png().toFile(path.join(dir,'qa-layers-native.png'));
 const scaled=[]; const heights=[240,256,480],widths=[150,160,250];let x=0;
 for(const background of ['#ffffff','#243044']) for(let i=0;i<3;i++) {
  const h=heights[i],w=widths[i];
  scaled.push({input:label(`Height ${h} / ${background==='#ffffff'?'light':'dark'}`,w),left:x,top:0});
  const art=await sharp(face00).resize({height:h}).flatten({background}).png().toBuffer();
  const panel=await sharp({create:{width:w,height:500,channels:4,background}}).composite([{input:art,left:Math.round((w-Math.round(268*h/606))/2),top:12}]).png().toBuffer();
  scaled.push({input:panel,left:x,top:30});x+=w;
 }
 await sharp({create:{width:x,height:530,channels:4,background:'#f4f6f9'}}).composite(scaled).png().toFile(path.join(dir,'qa-light-dark-scales.png'));
 const html=fs.readFileSync(path.join(root,'docs/reports/chihaya-character-progress.html'),'utf8');
 new vm.Script(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1]);
 const data=JSON.parse(html.match(/<script type="application\/json" id="progress-data">([\s\S]*?)<\/script>/)[1]);
 const result=data.outfits.find(o=>o.id==='a').results.full;
 if(result.mother.sha256!==hash(path.join(dir,'mother-body.png'))) throw new Error('Report has a stale mother hash');
 if(data.next.stage!=='review') throw new Error('Report advanced before review');
 let refs=0;
 for(const outfit of data.outfits) {
  const images=[...Object.values(outfit.sources).flatMap(s=>[s.body,...s.faces]),...Object.values(outfit.results).flatMap(r=>[r.mother,r.localPart,...r.composites]).filter(Boolean)];
  for(const im of images) {if(!fs.existsSync(path.join(root,im.path))) throw new Error('Broken image reference: '+im.path);refs++;}
 }
 const record={date:'2026-09-30',canvas:[mother.width,mother.height],changedPixels:changed,outsideRGBAMismatches:outside,headAndFaceRGBAMismatches:head,originalFaceSHA256:'12/12 passed',previewFaces:['00','04'],offlinePreviewHeights:[240,256,480],backgrounds:['light','dark'],pageJavaScriptSyntax:'passed',pageImageReferences:refs,pageMotherHash:'passed',pageUI:'not run; browser file URL policy prevents local-page preview',userReview:'pending',application:'not-integrated'};
 fs.writeFileSync(path.join(dir,'qa-verification.json'),JSON.stringify(record,null,2)+'\n');
 console.log(JSON.stringify(record,null,2));
})();

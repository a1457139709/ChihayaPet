// Deterministic composition of a fixed native-size body and paired game faces.
// Usage: node scripts/compose_native_tea_faces.cjs a/full <body.png> <new-output-dir>
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {PNG}=require('pngjs');
const root=path.resolve(__dirname,'..');
const [variant,motherRelative,directoryRelative]=process.argv.slice(2);
if(!variant||!motherRelative||!directoryRelative) throw new Error('Expected variant, mother PNG and new output directory');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'ArtSources/CharacterExpansion/native-tea/originals.json'))).variants[variant];
if(!baseline) throw new Error('Unknown game variant: '+variant);
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const motherPath=path.join(root,motherRelative),mother=PNG.sync.read(fs.readFileSync(motherPath));
if(mother.width!==baseline.width||mother.height!==baseline.height) throw new Error('Mother must use the paired native game canvas');
if(hash(path.join(root,baseline.body))!==baseline.bodySHA256) throw new Error('Original body hash changed');
const output=path.join(root,directoryRelative);
if(fs.existsSync(output)) throw new Error('Refusing to replace an existing composite set');
fs.mkdirSync(output,{recursive:true});
const [ox,oy]=baseline.faceOffset,records=[];
for(const source of baseline.faces) {
 const facePath=path.join(root,source.path);
 if(hash(facePath)!==source.sha256) throw new Error('Original face hash changed: '+source.path);
 const face=PNG.sync.read(fs.readFileSync(facePath));
 if(face.width!==baseline.faceSize[0]||face.height!==baseline.faceSize[1]) throw new Error('Unexpected face size');
 const result=new PNG({width:mother.width,height:mother.height});mother.data.copy(result.data);
 for(let y=0;y<face.height;y++) for(let x=0;x<face.width;x++) {
  const s=(y*face.width+x)*4,d=((y+oy)*result.width+x+ox)*4,sa=face.data[s+3],da=mother.data[d+3];
  if(!sa) continue;
  if(sa===255||da===0) {face.data.copy(result.data,d,s,s+4);continue;}
  const a=sa/255,b=da/255,out=a+b*(1-a);
  for(let c=0;c<3;c++) result.data[d+c]=Math.round((face.data[s+c]*a+mother.data[d+c]*b*(1-a))/out);
  result.data[d+3]=Math.round(out*255);
 }
 const name='tea-'+variant.replace('/','-')+'-face-'+source.id+'.png',file=path.join(output,name);
 fs.writeFileSync(file,PNG.sync.write(result,{colorType:6}));
 const saved=PNG.sync.read(fs.readFileSync(file));let outside=0,opaqueFace=0,transparentBodyFace=0;
 for(let y=0;y<saved.height;y++) for(let x=0;x<saved.width;x++) {
  const d=(y*saved.width+x)*4;
  if(x<ox||x>=ox+face.width||y<oy||y>=oy+face.height) {
   if(!saved.data.subarray(d,d+4).equals(mother.data.subarray(d,d+4))) outside++;
  } else {
   const s=((y-oy)*face.width+x-ox)*4;
   if(face.data[s+3]===255&&!saved.data.subarray(d,d+4).equals(face.data.subarray(s,s+4))) opaqueFace++;
   if(mother.data[d+3]===0&&face.data[s+3]>0&&!saved.data.subarray(d,d+4).equals(face.data.subarray(s,s+4))) transparentBodyFace++;
  }
 }
 if(outside||opaqueFace||transparentBodyFace) throw new Error('Pixel-preserving face composition failed: '+source.id);
 records.push({id:source.id,path:path.relative(root,file).split(path.sep).join('/'),sha256:hash(file),source:source.path,sourceSHA256:source.sha256,faceOffset:baseline.faceOffset,checks:{outsideFaceRGBAMismatches:outside,opaqueFaceRGBAMismatches:opaqueFace,faceOverTransparentBodyRGBAMismatches:transparentBodyFace}});
}
const manifest={variant,mother:motherRelative,motherSHA256:hash(motherPath),canvas:[mother.width,mother.height],faceOffset:baseline.faceOffset,method:'Copy original face RGBA; source-over only where face alpha overlaps body alpha. No image generation or resampling.',results:records};
fs.writeFileSync(path.join(output,'composites.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({variant,count:records.length,allPixelChecks:'passed',manifest:path.relative(root,path.join(output,'composites.json'))},null,2));

// Copy a local imagegen arm/tea patch onto the unresampled game canvas.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const sharp=require('sharp');const {PNG}=require('pngjs');
const dir=__dirname,root=path.resolve(dir,'../../../../../..');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'ArtSources/CharacterExpansion/native-tea/originals.json'))).variants['b_/full'];
const crop=JSON.parse(fs.readFileSync(path.join(dir,'crop.json'))).crop;
const local=n=>path.join(dir,n),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read=p=>PNG.sync.read(fs.readFileSync(p));
const save=(n,png)=>fs.writeFileSync(local(n),PNG.sync.write(png,{colorType:6}));
const inside=(x,y,points)=>{
 let value=false;
 for(let i=0,j=points.length-1;i<points.length;j=i++){
  const [xi,yi]=points[i],[xj,yj]=points[j];
  if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)value=!value;
 }
 return value;
};
const distance=(x,y,points)=>Math.min(...points.map(([ax,ay],i)=>{
 const [bx,by]=points[(i+1)%points.length],dx=bx-ax,dy=by-ay;
 const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));
 return Math.hypot(x-ax-t*dx,y-ay-t*dy);
}));
const posePolygon=[[25,246],[285,246],[287,390],[232,405],[200,376],[115,376],[112,399],[26,399]];
const oldLeftArmPolygon=[[45,352],[101,353],[112,377],[107,418],[103,467],[107,510],[106,550],[48,550],[41,504],[38,445],[47,404]];
const oldRightHandPolygon=[[207,345],[236,355],[243,387],[235,417],[230,440],[205,440],[196,405],[199,375]];
const preservedTorsoPolygon=[[126,329],[207,335],[199,371],[125,369]];
const teaForeground=[[136,261],[206,261],[211,286],[224,300],[224,321],[167,331],[146,322],[133,308],[117,296],[125,274]];
const armForeground=[
 [[98,298],[133,312],[126,341],[107,365],[95,389],[54,389],[43,349],[66,324]],
 [[211,298],[237,312],[258,336],[282,348],[283,377],[259,390],[234,383],[215,361],[207,333]]
];
// The outer left curls and bounded right front lock use color seeding. The
// other front locks use explicit contours, and the old right sleeve outline
// stays outside the hair bounds so it cannot survive as a detached fragment.
const hairRanges=[[0,186,66,385],[160,186,242,302]];
// Original front-lock contours, in original game pixel coordinates. White
// highlights are included only within these traced locks, never whole sleeves.
const frontLocks=[
 [[186,77,101],[196,76,100],[206,75,98],[216,73,97],[226,68,94],[236,59,91],[246,54,89],[256,60,78],[266,64,80],[276,62,80],[286,62,80],[296,62,82],[306,64,87],[316,68,92],[326,77,97],[334,88,104]],
 [[186,106,117],[196,109,120],[206,108,122],[216,104,125],[226,99,124],[236,92,120],[246,89,108],[256,87,103],[266,82,99],[276,80,99],[286,78,98],[296,78,100],[306,79,102],[316,83,106],[326,91,113],[334,104,117]],
 [[186,133,148],[196,139,150],[206,144,157],[216,147,162],[226,148,163],[236,144,159],[246,136,153],[256,129,145],[266,124,139],[276,124,135],[286,128,137],[296,141,145]],
 [[186,164,190],[196,164,188],[206,165,190],[216,171,198],[226,182,209],[236,194,220],[246,208,231],[256,219,236],[266,226,240],[276,226,241],[286,224,238],[296,215,232],[306,208,225],[316,207,225],[326,208,226],[336,211,230],[346,214,232],[356,220,231]]
];
(async()=>{
 const bodyPath=path.join(root,baseline.body);
 if(hash(bodyPath)!==baseline.bodySHA256)throw new Error('Original body has changed');
 const original=read(bodyPath),w=original.width,h=original.height;
 if(w!==310||h!==606)throw new Error('Unexpected original canvas');
 await sharp(local('torso-imagegen-raw.png')).resize(crop.width,crop.height,{kernel:'lanczos3'}).ensureAlpha().png().toFile(local('torso-part-native.png'));
 const part=read(local('torso-part-native.png'));
 const hairSeed=new Uint8Array(w*h),hair=new Uint8Array(w*h);
 const silver=(r,g,b,a)=>a>0&&g>=40&&r>=g-2&&g>=b+1&&r-g<=16&&g-b<=23;
 for(let y=crop.top;y<385;y++)for(let x=0;x<w;x++){
  if(!hairRanges.some(([x0,y0,x1,y1])=>x>=x0&&x<x1&&y>=y0&&y<y1))continue;
  const p=(y*w+x)*4,[r,g,b,a]=original.data.subarray(p,p+4);
  const neutralWhite=Math.min(r,g,b)>240&&Math.max(r,g,b)-Math.min(r,g,b)<7;
  if(silver(r,g,b,a)&&!neutralWhite)hairSeed[y*w+x]=1;
 }
 for(const rows of frontLocks)for(let i=0;i<rows.length-1;i++){
  const [y0,l0,r0]=rows[i],[y1,l1,r1]=rows[i+1];
  for(let y=y0;y<y1;y++){
   const t=(y-y0)/(y1-y0),left=Math.round(l0+(l1-l0)*t),right=Math.round(r0+(r1-r0)*t);
   for(let x=left;x<=right;x++){
    const p=(y*w+x)*4,[r,g,b,a]=original.data.subarray(p,p+4);
    const white=a>0&&Math.min(r,g,b)>239&&Math.max(r,g,b)-Math.min(r,g,b)<10;
    if(silver(r,g,b,a)||white)hairSeed[y*w+x]=1;
   }
  }
 }
 // Recover small enclosed highlight islands bounded by existing silver hair.
 const visited=new Uint8Array(w*h);
 for(let sy=crop.top;sy<385;sy++)for(let sx=0;sx<w;sx++){
  const start=sy*w+sx;if(hairSeed[start]||visited[start])continue;
  const queue=[start];visited[start]=1;let exterior=false;
  for(let i=0;i<queue.length;i++){
   const k=queue[i],x=k%w,y=Math.floor(k/w);
   if(x===0||x===w-1||y===crop.top||y===384)exterior=true;
   for(const [xx,yy] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){
    if(xx<0||xx>=w||yy<crop.top||yy>=385)continue;
    const next=yy*w+xx;
    if(!hairSeed[next]&&!visited[next]){visited[next]=1;queue.push(next);}
   }
  }
  if(!exterior&&queue.length<=160)for(const k of queue)hairSeed[k]=1;
 }
 for(let y=crop.top;y<385;y++)for(let x=0;x<w;x++)if(hairSeed[y*w+x]){
  for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++)if(xx>=0&&xx<w&&yy>=crop.top&&yy<h&&original.data[(yy*w+xx)*4+3]>0)hair[yy*w+xx]=1;
 }
 // New hands and their bent forearms occlude hair; all other visible game locks
 // are copied from the native source without recoloring or resampling.
 for(let y=crop.top;y<crop.top+crop.height;y++)for(let x=crop.left;x<crop.left+crop.width;x++){
  const q=((y-crop.top)*crop.width+x-crop.left)*4,[r,g,b,a]=part.data.subarray(q,q+4);
  const hand=a>0&&r>150&&r-g>=8&&g-b>=8&&r-b>=22;
  if((y>=302&&x>=196)||(y>=315&&x>=58)||a>16&&(hand||inside(x+.5,y+.5,teaForeground)||armForeground.some(poly=>inside(x+.5,y+.5,poly))))hair[y*w+x]=0;
 }
 const leftDressContour=[[360,112],[365,111],[370,109],[375,106],[378,104],[380,103],[385,100],[390,97],[400,92],[410,88],[430,81],[450,76],[480,72],[510,69],[530,67],[544,66],[552,64]];
 const rightDressContour=[[360,201],[365,200],[370,201],[375,203],[380,204],[390,205],[400,206],[420,208],[430,209],[442,210]];
 const interpolate=(y,rows)=>{
  for(let i=0;i<rows.length-1;i++)if(y>=rows[i][0]&&y<=rows[i+1][0])return rows[i][1]+(rows[i+1][1]-rows[i][1])*(y-rows[i][0])/(rows[i+1][0]-rows[i][0]);
  return y<rows[0][0]?rows[0][1]:rows.at(-1)[1];
 };
 // Only narrow newly uncovered dress strips use these row-aligned samples.
 // The visible skirt center, the full lower hem and all original positioning
 // remain native. This removes the old wrist/fist without broad skirt redraw.
 const dressSample=(x,y,side)=>{
  const localY=y-crop.top;let edge=side==='left'?crop.width-1:0;
  if(side==='left'){
   for(let xx=0;xx<crop.width;xx++)if(part.data[(localY*crop.width+xx)*4+3]>128){edge=xx;break;}
  }else{
   for(let xx=crop.width-1;xx>=0;xx--)if(part.data[(localY*crop.width+xx)*4+3]>128){edge=xx;break;}
  }
  let contour=interpolate(y,side==='left'?leftDressContour:rightDressContour);
  if(side==='left'&&y>=544){
   for(let xx=0;xx<w;xx++)if(original.data[(y*w+xx)*4+3]>128){contour=xx;break;}
  }
  const coverage=side==='left'?Math.max(0,Math.min(1,x+.5-contour+.5)):Math.max(0,Math.min(1,contour-x+.5));
  if(!coverage)return [0,0,0,0];
  const sampleX=Math.max(0,Math.min(crop.width-1,Math.round(x-contour+edge))),q=(localY*crop.width+sampleX)*4;
  return [part.data[q],part.data[q+1],part.data[q+2],Math.round(255*coverage)];
 };
 const mother=new PNG({width:w,height:h}),mask=new PNG({width:w,height:h}),hairMask=new PNG({width:w,height:h}),replacement=new PNG({width:w,height:h});
 original.data.copy(mother.data);
 let editable=0,changed=0,protectedHair=0;let bounds=[w,h,0,0];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=(y*w+x)*4;
  if(hair[y*w+x]&&original.data[p+3]===255){hairMask.data.set([255,255,255,255],p);protectedHair++;}
  let weight=0;
  if(y>=247&&x>=crop.left&&x<crop.left+crop.width&&y<crop.top+crop.height){
   const polygons=[posePolygon,oldLeftArmPolygon,oldRightHandPolygon];
   for(const poly of polygons)if(inside(x+.5,y+.5,poly))weight=Math.max(weight,Math.min(1,distance(x+.5,y+.5,poly)/3));
   if(inside(x+.5,y+.5,preservedTorsoPolygon))weight*=Math.max(0,1-distance(x+.5,y+.5,preservedTorsoPolygon)/8);
   // Retain the game's puff shoulder outline, then blend into the bent sleeves.
   if(x<102||x>226)weight*=Math.max(0,Math.min(1,(y-272)/12));
   weight*=Math.min(1,(y-246)/4,(551-y)/6);
   weight=Math.max(0,Math.round(255*weight));
   if(hair[y*w+x]&&original.data[p+3]===255)weight=0;
  }
  if(weight){
   editable++;mask.data.set([255,255,255,weight],p);
   const q=((y-crop.top)*crop.width+x-crop.left)*4;
   let rgba=[...part.data.subarray(q,q+4)];
   if(y<295&&(x<98||x>230))rgba[3]=Math.min(rgba[3],original.data[p+3]);
   if(y>=370&&x<113&&(x>=98||y>=378)){
    rgba=dressSample(x,y,'left');weight=Math.round(255*Math.min(1,(113-x)/8,(551-y)/7));
   }
   if(y>=365&&y<443&&x>=196&&(x<236||y>=390)){
    rgba=dressSample(x,y,'right');weight=Math.round(255*Math.min(1,(x-196)/7));
   }
   if(hair[y*w+x]&&original.data[p+3]<255){
    const a=original.data[p+3]/255,b=rgba[3]/255,out=a+b*(1-a);
    if(out>0){for(let c=0;c<3;c++)rgba[c]=Math.round((original.data[p+c]*a+rgba[c]*b*(1-a))/out);rgba[3]=Math.round(out*255);}
   }
   mask.data.set([255,255,255,weight],p);
   replacement.data.set(rgba,p);
   const a=weight/255,oldA=original.data[p+3]/255,newA=rgba[3]/255,outA=newA*a+oldA*(1-a);
   for(let c=0;c<3;c++)mother.data[p+c]=outA?Math.round((rgba[c]*newA*a+original.data[p+c]*oldA*(1-a))/outA):0;
   mother.data[p+3]=Math.round(outA*255);
   if(y>=360&&y<390&&(x>=97&&x<128||x>=196&&x<236)){
    const isLeft=x<128,contour=interpolate(y,isLeft?leftDressContour:rightDressContour);
    const coverage=isLeft?Math.max(0,Math.min(1,x+1-contour)):Math.max(0,Math.min(1,contour-x+.5));
    const clippedAlpha=Math.min(mother.data[p+3],Math.round(coverage*255));
    if(clippedAlpha!==mother.data[p+3]){
     mother.data[p+3]=clippedAlpha;
     if(!clippedAlpha)mother.data.set([0,0,0,0],p);
     mask.data.set([255,255,255,255],p);
     replacement.data.set(mother.data.subarray(p,p+4),p);
    }
   }
   if(!mother.data.subarray(p,p+4).equals(original.data.subarray(p,p+4))){changed++;bounds=[Math.min(bounds[0],x),Math.min(bounds[1],y),Math.max(bounds[2],x+1),Math.max(bounds[3],y+1)];}
  }
 }
 for(const [n,png] of [['mother-body.png',mother],['local-edit-mask.png',mask],['original-hair-preservation-mask.png',hairMask],['local-replacement-layer.png',replacement]])save(n,png);
 const evidence={
  version:1,outfit:'b_',view:'full',date:'2026-09-30',timezone:'Asia/Shanghai',status:'pending-review',
  production:'Built-in imagegen edits only a shoulder-to-old-hand crop; local arms/tea ware are assembled on the native game canvas. No head, face or complete character was generated.',
  canvas:[w,h],mother:path.relative(root,local('mother-body.png')).split(path.sep).join('/'),
  source:{body:baseline.body,sha256:hash(bodyPath),faceOffset:baseline.faceOffset,faceSize:baseline.faceSize,faces:baseline.faces},
  generation:{tool:'built-in imagegen',target:'torso-edit-input.png',designReference:'ArtSources/CharacterExpansion/native-tea/a/full/v1/torso-part-native.png',raw:'torso-imagegen-raw.png',rawSHA256:hash(local('torso-imagegen-raw.png')),prompt:'imagegen-prompt.txt'},
  assembly:{script:'assemble.cjs',crop,posePolygon,oldLeftArmPolygon,oldRightHandPolygon,preservedTorsoPolygon,frontLocks,teaForeground,armForeground,leftDressContour,rightDressContour,mask:'local-edit-mask.png',maskSHA256:hash(local('local-edit-mask.png')),protectedHairMask:'original-hair-preservation-mask.png',topOriginalRows:247,edgeBlendPixels:3,changedPixels:changed,editablePixels:editable,protectedHairPixels:protectedHair,changedBoundsXYXY:bounds,overlap:'Original opaque silver hair stays in its game coordinates. Antialiased hair edges over newly occupied garment space use source-over within the edit mask. The raised hands, bent forearms, cup and saucer sit in front of the locks.',dressCleanup:'Only the narrow old arm/hand footprints use local generated dress samples, aligned per native row to the adjacent native skirt contour. The visible original skirt center and lower hem are not resampled.'},
  layers:{body:'mother-body.png',localPart:'torso-part-native.png',replacement:'local-replacement-layer.png',expression:'Seven unmodified b_/full game face PNGs remain separate, fixed native offset (101,80).'},
  teaWare:{reference:'ArtSources/CharacterExpansion/native-tea/tea-ware-reference.json',design:'Approved plain white porcelain cup and shallow saucer; image-left hand holds handle, image-right palm supports saucer.'},
  checks:{nativeCanvas:'passed',alpha:'passed',outsideRGBA:'pending',faceRegion:'pending',seams:'pending-visual-review',review:'pending',application:'not-integrated'},
  outputSHA256:hash(local('mother-body.png'))
 };
 fs.writeFileSync(local('production.json'),JSON.stringify(evidence,null,2)+'\n');
 await sharp(local('mother-body.png')).composite([{input:path.join(root,baseline.defaultFace),left:101,top:80}]).png().toFile(local('qa-face00-native.png'));
 await sharp(local('qa-face00-native.png')).extract({left:24,top:216,width:264,height:342}).resize(792,1026,{kernel:'nearest'}).flatten({background:'#242833'}).png().toFile(local('qa-assembly-detail-dark.png'));
 console.log(JSON.stringify({mother:evidence.mother,changedPixels:changed,changedBounds:bounds},null,2));
})();

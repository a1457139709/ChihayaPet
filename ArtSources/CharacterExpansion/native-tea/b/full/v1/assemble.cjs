// Register the generated headless part into the native body using explicit masks.
// All pixels outside the mask, the original head and the face opening are copied.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {PNG}=require('pngjs');
const dir=__dirname,root=path.resolve(dir,'../../../../../..');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'ArtSources/CharacterExpansion/native-tea/originals.json'))).variants['b/full'];
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read=p=>PNG.sync.read(fs.readFileSync(p));
const local=n=>path.join(dir,n),save=(n,p)=>fs.writeFileSync(local(n),PNG.sync.write(p,{colorType:6}));
const crop={left:24,top:180,width:268,height:370};
const inside=(x,y,points)=>{
  let value=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const [xi,yi]=points[i],[xj,yj]=points[j];
    if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)value=!value;
  }
  return value;
};
const distance=(x,y,poly)=>Math.min(...poly.map(([ax,ay],i)=>{
  const [bx,by]=poly[(i+1)%poly.length],dx=bx-ax,dy=by-ay;
  const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));
  return Math.hypot(x-ax-t*dx,y-ay-t*dy);
}));
// Arms, fingers and cup. The original bow, neck and central fitted waist remain.
const actionPolygons=[
  [[24,204],[90,198],[119,234],[125,275],[138,320],[131,345],[120,373],[42,384],[24,340]],
  [[218,204],[274,203],[291,226],[291,385],[239,379],[201,340],[192,302],[207,275],[215,242]],
  [[99,244],[134,237],[200,238],[219,256],[220,275],[245,277],[253,311],[242,336],[213,335],[183,310],[145,312],[126,337],[94,330],[91,294]]
];
// Remove original hanging sleeve/cuff/hand and original hand on the hip.
// Replacement skirt pixels are restricted to the portion occluded by old hands.
const removalPolygons=[
  [[38,344],[105,342],[115,373],[108,404],[101,439],[98,476],[98,491],[102,528],[99,547],[35,547],[30,438]],
  [[205,325],[283,323],[283,434],[197,434],[199,382]]
];
const teaForeground=[[121,246],[175,243],[196,250],[197,270],[216,275],[217,284],[236,290],[245,302],[240,311],[222,312],[191,297],[169,296],[143,301],[126,325],[99,316],[94,295],[100,269],[110,253]];
const cuffForeground=[
  [[95,278],[132,300],[131,321],[119,332],[99,332],[84,321],[82,306],[88,288]],
  [[206,294],[236,295],[256,304],[257,319],[245,335],[231,337],[214,324],[203,308]]
];
const skirtRows=[[374,107,202],[380,103,203],[390,97,205],[400,92,207],[410,88,208],[420,84,209],[430,81,210],[440,78,210],[450,76,211],[460,74,212],[470,73,212],[480,71,213],[490,70,213],[500,69,213],[510,68,214],[520,67,214],[530,66,215],[540,65,215],[550,65,216]];
const rowAt=(rows,y)=>{
  for(let i=0;i<rows.length-1;i++){
    const a=rows[i],b=rows[i+1];
    if(y>=a[0]&&y<=b[0]){const t=(y-a[0])/(b[0]-a[0]);return a.slice(1).map((v,k)=>v+(b[k+1]-v)*t);}
  }
  return rows[rows.length-1].slice(1);
};
const oldLeftArmRows=[[374,91],[400,89],[430,88],[440,91],[450,91],[470,92],[485,91],[490,85],[500,86],[510,90],[520,94],[530,96],[538,92],[543,84],[546,76],[548,64],[550,64]];
const source=path.join(root,baseline.body);
if(hash(source)!==baseline.bodySHA256)throw new Error('Original body source changed');
const original=read(source),part=read(local('torso-part-native.png')),{width:w,height:h}=original;
if(w!==310||h!==606||part.width!==crop.width||part.height!==crop.height)throw new Error('Unexpected canvas');
const seed=new Uint8Array(w*h),hair=new Uint8Array(w*h);
// Warm silver separates from the blue-white bib/cuff and the plum uniform.
const ranges=[[0,180,135,386],[180,180,310,374]];
for(let y=180;y<386;y++)for(let x=0;x<w;x++){
  if(!ranges.some(([l,t,r,b])=>x>=l&&x<r&&y>=t&&y<b))continue;
  const p=(y*w+x)*4,[r,g,b,a]=original.data.subarray(p,p+4);
  const white=Math.min(r,g,b)>240&&Math.max(r,g,b)-Math.min(r,g,b)<7;
  if(a>0&&g>=55&&r>=g-3&&g>=b-7&&r-g<=18&&g-b<=18&&!white)seed[y*w+x]=1;
}
// Fill only small enclosed highlights, not large bib/cuff surfaces.
const seen=new Uint8Array(w*h);
for(let sy=180;sy<386;sy++)for(let sx=0;sx<w;sx++){
  const start=sy*w+sx;
  if(seed[start]||seen[start])continue;
  const queue=[start];seen[start]=1;let exterior=false;
  for(let i=0;i<queue.length;i++){
    const k=queue[i],x=k%w,y=Math.floor(k/w);
    if(x===0||x===w-1||y===180||y===385)exterior=true;
    for(const [xx,yy]of[[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){
      if(xx<0||xx>=w||yy<180||yy>=386)continue;
      const next=yy*w+xx;
      if(!seed[next]&&!seen[next]){seen[next]=1;queue.push(next);}
    }
  }
  if(!exterior&&queue.length<=150)for(const k of queue)seed[k]=1;
}
for(let y=180;y<386;y++)for(let x=0;x<w;x++)if(seed[y*w+x]){
  for(let yy=Math.max(180,y-1);yy<=Math.min(385,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(w-1,x+1);xx++)hair[yy*w+xx]=1;
}
// The gray outline of the old right cuff is not a silver hair lock.
for(let y=356;y<399;y++)for(let x=196;x<260;x++)hair[y*w+x]=0;
for(let y=348;y<356;y++)for(let x=210;x<260;x++)hair[y*w+x]=0;
for(let y=222;y<328;y++)for(let x=242;x<w;x++)hair[y*w+x]=0;
// New hand and tea pixels in the foreground may occlude the hanging locks.
for(let y=crop.top;y<crop.top+crop.height;y++)for(let x=crop.left;x<crop.left+crop.width;x++){
  if(inside(x+.5,y+.5,teaForeground)||cuffForeground.some(poly=>inside(x+.5,y+.5,poly)))hair[y*w+x]=0;
}
const mother=new PNG({width:w,height:h}),mask=new PNG({width:w,height:h}),hairMask=new PNG({width:w,height:h}),replacement=new PNG({width:w,height:h});
original.data.copy(mother.data);
let changed=0,editable=0,protectedHair=0,bounds=[w,h,0,0];
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=(y*w+x)*4;
  if(hair[y*w+x]){hairMask.data.set([255,255,255,255],p);protectedHair++;}
  let weight=0;
  if(x>=crop.left&&x<crop.left+crop.width&&y>=228&&y<550&&!hair[y*w+x]){
    for(const poly of actionPolygons)if(inside(x+.5,y+.5,poly))weight=Math.max(weight,Math.round(255*Math.min(1,distance(x+.5,y+.5,poly)/2.5)));
    weight=Math.round(weight*Math.min(1,(y-228)/10));
    for(const poly of removalPolygons)if(inside(x+.5,y+.5,poly))weight=255;
  }
  if(!weight)continue;
  mask.data.set([255,255,255,weight],p);editable++;
  const q=((y-crop.top)*part.width+(x-crop.left))*4;
  const pixel=Buffer.from(part.data.subarray(q,q+4));
  // Restrict the replacement skirt to the native dress contour, so removing
  // the old arms cannot widen the skirt or shift the original lower body.
  if(y>=374){
    const [left,right]=rowAt(skirtRows,y),[oldArmRight]=rowAt(oldLeftArmRows,y);
    if(x+.5<left||x>right)pixel.fill(0);
    else if(x>oldArmRight&&x<right-2){
      // Visible native skirt is never replaced just to remove the old arm.
      original.data.copy(pixel,0,p,p+4);
    }else if(x<110){
      // Extend the native skirt's clean edge/shadow profile from y=560,
      // aligned to the traced contour and matched to visible cloth at x=105.
      const profileX=Math.max(63,Math.min(140,Math.round(63+x-left)));
      const anchorX=Math.max(63,Math.min(140,Math.round(63+105-left)));
      const s=(560*w+profileX)*4,t=(560*w+anchorX)*4,a=(y*w+105)*4;
      for(let c=0;c<3;c++)pixel[c]=Math.max(0,Math.min(255,original.data[s+c]+original.data[a+c]-original.data[t+c]));
      pixel[3]=Math.round(255*Math.max(0,Math.min(1,x+.5-left)));
      const blend=Math.max(0,Math.min(1,(oldArmRight+3-x)/5));
      if(x>oldArmRight-2&&original.data[p+3]===255){
        for(let c=0;c<3;c++)pixel[c]=Math.round(pixel[c]*blend+original.data[p+c]*(1-blend));
      }
    }
  }
  replacement.data.set(pixel,p);
  for(let c=0;c<4;c++)mother.data[p+c]=Math.round((pixel[c]*weight+original.data[p+c]*(255-weight))/255);
  if(!mother.data.subarray(p,p+4).equals(original.data.subarray(p,p+4))){changed++;bounds=[Math.min(bounds[0],x),Math.min(bounds[1],y),Math.max(bounds[2],x+1),Math.max(bounds[3],y+1)];}
}
for(const[n,p]of[['mother-body.png',mother],['local-edit-mask.png',mask],['original-hair-preservation-mask.png',hairMask],['local-replacement-layer.png',replacement]])save(n,p);
const evidence={
  version:1,outfit:'b',view:'full',date:'2026-09-30',timezone:'Asia/Shanghai',status:'pending-review',
  production:'Built-in imagegen draws only a headless torso action part. Deterministic native-canvas masked assembly; no head, original face or complete character was generated.',
  canvas:[w,h],mother:path.relative(root,local('mother-body.png')),
  source:{body:baseline.body,sha256:hash(source),faceOffset:baseline.faceOffset,faceSize:baseline.faceSize,faces:baseline.faces},
  generation:{tool:'built-in imagegen',inputs:['torso-edit-input.png','ArtSources/CharacterExpansion/native-tea/a/full/v1/torso-imagegen-refined.png'],raw:'torso-imagegen-raw.png',rawSHA256:hash(local('torso-imagegen-raw.png')),prompts:['imagegen-prompt.txt'],nativePart:'torso-part-native.png'},
  assembly:{script:'assemble.cjs',crop,actionPolygons,removalPolygons,teaForeground,cuffForeground,skirtRows,oldLeftArmRows,nativeSkirtRepair:'Copy visible original skirt pixels; erase the old arm outside the traced native skirt; reconstruct the narrow garment area hidden by the removed arm from the clean native edge/shadow profile at y=560, registered to the contour and color-matched to same-row x=105. The AI skirt is not used for this repair.',mask:'local-edit-mask.png',maskSHA256:hash(local('local-edit-mask.png')),protectedHairMask:'original-hair-preservation-mask.png',originalTopRows:228,shoulderBlendPixels:10,edgeBlendPixels:2.5,changedPixels:changed,editablePixels:editable,protectedHairPixels:protectedHair,changedBoundsXYXY:bounds},
  layers:{body:'mother-body.png',localPart:'torso-part-native.png',replacement:'local-replacement-layer.png',expression:'Seven paired game face PNGs remain separate and unmodified; preview uses (101,80).'},
  teaWare:{reference:'ArtSources/CharacterExpansion/native-tea/tea-ware-reference.json',design:'approved plain white porcelain teacup and shallow saucer; screen-left hand grips handle, screen-right palm supports saucer'},
  checks:{nativeCanvas:'pending',alpha:'pending',outsideRGBA:'pending',faceRegion:'pending',hairAndClothingSeams:'pending-visual-review',review:'pending',application:'not-integrated'},
  outputSHA256:hash(local('mother-body.png'))
};
fs.writeFileSync(local('production.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({changedPixels:changed,changedBounds:bounds,protectedHairPixels:protectedHair},null,2));

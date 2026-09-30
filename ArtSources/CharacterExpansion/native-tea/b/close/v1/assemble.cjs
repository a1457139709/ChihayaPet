// Copy the native game canvas, replace local arms/hands/tea, and retain visible game hair.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const sharp=require('sharp'),{PNG}=require('pngjs');
const dir=__dirname,root=path.resolve(dir,'../../../../../..');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'ArtSources/CharacterExpansion/native-tea/originals.json'))).variants['b/close'];
const crop={left:64,top:252,width:420,height:354};
const armPolygons=[
 [[89,340],[137,326],[190,340],[198,385],[216,429],[235,481],[216,517],[151,543],[100,541],[76,490],[65,429],[66,373]],
 [[379,355],[415,359],[434,396],[458,421],[476,455],[483,494],[454,524],[420,533],[387,520],[354,489],[331,458],[349,415],[366,386]]
];
const handsAndTea=[[165,362],[224,357],[261,361],[334,361],[336,404],[356,406],[377,422],[381,479],[342,480],[322,452],[271,454],[240,441],[211,464],[174,469],[152,431]];
const eraseOldArms=[[[86,481],[151,481],[151,606],[86,606]],[[351,514],[429,514],[440,572],[417,606],[338,606],[337,555]]];
const frontLocks=[
 [[252,104,161],[268,99,159],[284,93,153],[300,85,150],[316,77,148],[332,66,148],[348,57,135],[364,36,87],[380,22,77],[396,16,64],[412,7,61]],
 [[252,164,211],[268,168,208],[284,171,208],[300,172,212],[316,171,214],[332,165,210],[348,145,195],[364,141,160],[380,128,149],[396,114,146],[412,100,148],[428,99,132],[444,102,128],[460,104,129],[476,105,133],[492,113,143],[501,129,149]],
 [[252,202,229],[268,211,233],[284,220,243],[300,229,254],[316,240,263],[332,248,266],[348,239,263],[364,221,249],[380,199,239],[396,204,233],[412,204,230],[428,209,224],[435,215,221]],
 [[252,280,310],[268,280,303],[284,280,305],[300,280,307],[316,281,314],[332,290,337],[348,307,360],[364,335,377],[380,347,380],[396,362,380],[412,365,378],[428,359,373],[436,354,366]]
];
const backLocks=[
 [[252,0,106],[300,0,100],[348,0,157],[380,0,151],[428,0,153],[460,0,166],[492,0,186],[524,0,196],[556,0,185],[574,0,175],[583,0,130]],
 [[252,335,508],[284,374,508],[300,376,508],[316,398,508],[332,417,508],[348,434,508]],
 [[428,345,378],[444,345,391],[460,356,398],[476,357,398],[492,347,391],[508,350,381],[524,341,366],[530,339,354]],
 [[460,447,460],[476,446,461],[492,440,456],[508,439,459],[524,445,461],[540,445,458],[550,441,452]]
];
const armForeground=[
 [[143,421],[170,441],[205,468],[221,486],[211,518],[145,546],[100,537],[99,493]],
 [[337,433],[391,430],[420,463],[450,476],[471,473],[475,498],[449,526],[410,527],[378,506],[353,493]]
];
const inside=(x,y,poly)=>{let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)yes=!yes;}return yes;};
const distance=(x,y,poly)=>Math.min(...poly.map(([ax,ay],i)=>{const [bx,by]=poly[(i+1)%poly.length],dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));return Math.hypot(x-ax-t*dx,y-ay-t*dy);}));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const rel=p=>path.relative(root,p).split(path.sep).join('/');
const save=(name,png)=>fs.writeFileSync(path.join(dir,name),PNG.sync.write(png,{colorType:6}));
const skin=(r,g,b,a)=>a>0&&r>150&&r-b>=18&&r-g>=8&&g-b>=8;
const warmHair=(r,g,b,a)=>a>0&&r>80&&g>70&&b>60&&r>=g-2&&g>=b-3&&r-g<28&&g-b<28&&!skin(r,g,b,a);
(async()=>{
 const bodyPath=path.join(root,baseline.body),raw=path.join(dir,'torso-imagegen-raw.png');
 if(hash(bodyPath)!==baseline.bodySHA256)throw new Error('Original game body changed');
 const source=PNG.sync.read(fs.readFileSync(bodyPath)),w=source.width,h=source.height;
 if(w!==508||h!==606)throw new Error('Wrong native canvas');
 await sharp(raw).resize(crop.width,crop.height,{kernel:'lanczos3'}).ensureAlpha().png().toFile(path.join(dir,'torso-part-native.png'));
 const part=PNG.sync.read(fs.readFileSync(path.join(dir,'torso-part-native.png'))),hair=new Uint8Array(w*h),bands=new Uint8Array(w*h);
 for(const rows of [...frontLocks,...backLocks])for(let i=0;i<rows.length-1;i++){
  const [y0,l0,r0]=rows[i],[y1,l1,r1]=rows[i+1];
  for(let y=y0;y<y1;y++){
   const t=(y-y0)/(y1-y0),left=Math.round(l0+(l1-l0)*t),right=Math.round(r0+(r1-r0)*t);
   let start=Math.max(0,left),end=Math.min(w-1,right);
   if(frontLocks.includes(rows)){
    const contours=[];
    for(let x=Math.max(0,left-2);x<=Math.min(w-1,right+2);x++){
     const p=(y*w+x)*4,[r,g,b,a]=source.data.subarray(p,p+4),white=Math.min(r,g,b)>240&&Math.max(r,g,b)-Math.min(r,g,b)<7;
     if(warmHair(r,g,b,a)&&!white)contours.push(x);
    }
    if(!contours.length)continue;
    start=Math.min(...contours);end=Math.max(...contours);
   }
   for(let x=Math.max(0,start-2);x<=Math.min(w-1,end+2);x++){
    const p=(y*w+x)*4;bands[y*w+x]=1;
    if(warmHair(...source.data.subarray(p,p+4)))hair[y*w+x]=1;
   }
  }
 }
 // Restore the complete original antialiased outline beside each bright hair seed.
 // A colour-only mask left pinholes in hair and retained isolated dark clothing lines.
 const seeds=hair.slice();
 for(let y=crop.top;y<h;y++)for(let x=0;x<w;x++){
  const p=(y*w+x)*4;
  if(!bands[y*w+x]||!source.data[p+3]||skin(...source.data.subarray(p,p+4)))continue;
  for(let dy=-2;dy<=2&&!hair[y*w+x];dy++)for(let dx=-2;dx<=2;dx++){
   const nx=x+dx,ny=y+dy;
   if(nx>=0&&nx<w&&ny>=0&&ny<h&&seeds[ny*w+nx]){hair[y*w+x]=1;break;}
  }
 }
 for(let y=crop.top;y<h;y++)for(let x=crop.left;x<crop.left+crop.width;x++){
  const q=((y-crop.top)*crop.width+x-crop.left)*4,[r,g,b,a]=part.data.subarray(q,q+4);
  if(skin(r,g,b,a)||inside(x+.5,y+.5,handsAndTea)||a>80&&armForeground.some(poly=>inside(x+.5,y+.5,poly)))hair[y*w+x]=0;
 }
 const mother=new PNG({width:w,height:h}),mask=new PNG({width:w,height:h}),hairMask=new PNG({width:w,height:h}),replacement=new PNG({width:w,height:h});
 source.data.copy(mother.data);let changed=0,editable=0,protectedHair=0,bounds=[w,h,0,0];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=(y*w+x)*4;
  if(hair[y*w+x]){hairMask.data.set([255,255,255,255],p);protectedHair++;}
  if(y<326||x<crop.left||x>=crop.left+crop.width||hair[y*w+x])continue;
  let weight=0;
  for(const poly of [...armPolygons,handsAndTea])if(inside(x+.5,y+.5,poly))weight=Math.max(weight,Math.round(255*Math.min(1,distance(x+.5,y+.5,poly)/2,(y-325)/6)));
  const erase=eraseOldArms.some(poly=>inside(x+.5,y+.5,poly));
  if(erase)weight=255;
  if(!weight)continue;
  const q=((y-crop.top)*crop.width+x-crop.left)*4;
  const next=erase&&y>=535?Buffer.from([0,0,0,0]):part.data.subarray(q,q+4);
  replacement.data.set(next,p);mask.data.set([255,255,255,weight],p);editable++;
  for(let c=0;c<4;c++)mother.data[p+c]=Math.round((next[c]*weight+source.data[p+c]*(255-weight))/255);
  if(!mother.data.subarray(p,p+4).equals(source.data.subarray(p,p+4))){changed++;bounds=[Math.min(bounds[0],x),Math.min(bounds[1],y),Math.max(bounds[2],x+1),Math.max(bounds[3],y+1)];}
 }
 for(const [name,png]of[['mother-body.png',mother],['local-edit-mask.png',mask],['original-hair-preservation-mask.png',hairMask],['local-replacement-layer.png',replacement]])save(name,png);
 const evidence={version:1,outfit:'b',view:'close',date:'2026-09-30',timezone:'Asia/Shanghai',status:'pending-review',production:'Built-in imagegen draws a head-free local torso component. Deterministic assembly replaces only bent arms, hands and tea ware, removes superseded hanging arms, and copies all remaining native game pixels. No head, expression or full character generated.',canvas:[w,h],mother:rel(path.join(dir,'mother-body.png')),source:{body:baseline.body,sha256:hash(bodyPath),faceOffset:baseline.faceOffset,faceSize:baseline.faceSize,faces:baseline.faces},generation:{tool:'built-in imagegen',inputs:[rel(path.join(dir,'torso-edit-input.png')),'ArtSources/CharacterExpansion/native-tea/a/full/v1/torso-imagegen-refined.png'],raw:'torso-imagegen-raw.png',rawSHA256:hash(raw),prompt:'imagegen-prompt.txt',scope:'head-free local component only'},assembly:{script:'assemble.cjs',crop,armPolygons,handsAndTea,eraseOldArms,frontLockRows:frontLocks,backLockRows:backLocks,armForeground,mask:'local-edit-mask.png',maskSHA256:hash(path.join(dir,'local-edit-mask.png')),protectedHairMask:'original-hair-preservation-mask.png',topOriginalRows:326,edgeBlendPixels:2,changedPixels:changed,editablePixels:editable,protectedHairPixels:protectedHair,changedBoundsXYXY:bounds,overlap:'New hands, cuffs, forearms and tea ware occlude hanging hair. Visible protected hair keeps exact original RGBA.'},layers:{body:'mother-body.png',localPart:'torso-part-native.png',replacement:'local-replacement-layer.png',expression:'Seven unmodified game faces in originals.json, at native offset (163,66). No composite export registered before user review.'},teaWare:{reference:'ArtSources/CharacterExpansion/native-tea/tea-ware-reference.json',design:'Approved plain white porcelain cup and shallow saucer. Image-left hand holds handle; image-right palm supports saucer.'},checks:{nativeCanvas:'pending',alpha:'pending',outsideRGBA:'pending',faceRegion:'pending',seams:'pending-visual-review',review:'pending',application:'not-integrated'},outputSHA256:hash(path.join(dir,'mother-body.png'))};
 fs.writeFileSync(path.join(dir,'production.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({mother:evidence.mother,changedPixels:changed,changedBounds:bounds,protectedHairPixels:protectedHair},null,2));
})();

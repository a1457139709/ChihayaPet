// Deterministic assembly: generated local arms/tea part + untouched native body/hair.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const sharp=require('sharp');
const {PNG}=require('pngjs');
const dir=__dirname,root=path.resolve(dir,'../../../../../..');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'ArtSources/CharacterExpansion/native-tea/originals.json'))).variants['b_/close'];
const {crop}=JSON.parse(fs.readFileSync(path.join(dir,'crop.json')));
const polygon=[[116,299],[205,300],[312,300],[364,302],[395,310],[423,335],[438,368],[433,400],[459,443],[483,487],[488,529],[478,565],[477,579],[450,581],[450,606],[85,606],[75,568],[56,535],[62,478],[61,430],[41,407],[45,373],[70,332]];
const frontLocks=[
 [[252,196,233],[260,201,237],[270,210,243],[280,217,249],[290,224,254],[300,229,255],[310,237,260],[320,244,267],[330,244,268],[340,238,263],[350,229,255],[360,219,247],[370,211,240],[380,204,235],[390,202,233],[400,203,234],[410,208,235],[420,216,236],[430,229,239],[437,235,238]],
 [[252,280,308],[260,281,309],[280,279,311],[300,279,315],[310,281,312],[320,284,311],[330,288,321],[340,291,335],[350,306,351],[360,329,368],[370,341,375],[380,348,377],[390,352,379],[400,354,379],[410,355,378],[420,355,373],[430,349,364],[438,343,351]],
 [[252,154,205],[270,158,208],[290,158,214],[310,154,214],[330,148,207],[340,127,196],[350,105,181],[360,89,162],[370,80,150],[380,75,142],[390,88,145],[400,97,149],[420,99,151],[440,102,161],[460,104,165],[480,109,163],[490,125,173],[500,136,163],[503,143,161]]
];
const sideHair=[
 [[299,20,100],[320,16,96],[340,16,98],[360,14,104],[380,10,107],[400,0,111],[420,0,101],[440,0,109],[460,0,112],[480,0,145],[500,10,157],[520,12,183],[540,25,187],[560,38,183],[580,86,143],[584,98,125]],
 [[299,143,190],[320,140,189],[340,125,191],[360,119,192],[380,111,192],[400,110,198],[420,115,191],[440,135,187],[460,150,192],[480,152,195],[500,143,199],[520,143,200],[540,152,190],[560,156,190],[567,166,178]],
 [[299,366,410],[320,384,422],[340,416,432],[350,424,435]],
 [[430,334,364],[440,334,373],[450,334,383],[460,335,394],[470,335,394],[480,334,392],[490,333,389],[500,332,379],[510,332,371],[520,332,365],[530,332,349],[542,332,340]],
 [[490,420,461],[510,431,464],[530,427,464],[546,420,455],[551,414,445]]
];
// Complete silhouettes below the old sleeve: include white hair highlights and grey contours.
const completeHair=[
 [[390,14,60],[400,9,63],[410,7,64],[420,3,65],[430,1,64],[440,0,65],[450,0,68],[460,2,73],[470,8,78],[480,15,81],[490,20,86],[500,23,90],[510,24,96],[520,29,103],[530,40,105],[540,54,103],[550,66,93],[560,78,93],[568,86,91]],
 [[390,60,109],[400,55,102],[410,53,97],[420,52,95],[430,51,94],[440,50,92],[450,50,92],[460,52,95],[470,56,100],[480,63,107],[490,69,116],[500,77,127],[510,83,128],[520,93,132],[530,105,137],[540,110,136],[550,114,133],[560,114,128],[570,107,121],[577,102,113],[580,106,111]],
 [[390,118,141],[400,106,138],[410,103,135],[420,102,135],[430,101,132],[440,101,131],[450,102,132],[460,104,134],[470,107,139],[480,112,146],[490,123,159],[497,137,169],[501,151,173],[503,164,168]],
 [[430,150,183],[440,152,185],[450,150,186],[460,150,188],[470,153,189],[480,159,193],[490,160,194],[500,155,197],[510,150,198],[520,146,198],[530,148,195],[540,151,188],[550,159,185],[560,166,183],[566,173,181]],
 [[430,334,364],[440,334,373],[450,334,383],[460,335,394],[470,335,394],[480,334,392],[490,333,389],[500,332,379],[510,332,371],[520,332,365],[530,332,349],[542,332,340]]
];
const armForeground=[
 [[165,445],[213,470],[203,501],[167,540],[134,566],[93,547],[87,501],[121,464]],
 [[344,469],[395,470],[451,478],[472,512],[462,557],[414,565],[367,548],[345,522]],
 [[365,419],[416,416],[462,472],[453,501],[407,487],[381,453]]
];
const teaForeground=[[233,406],[319,406],[320,447],[349,451],[350,465],[317,477],[241,479],[216,462],[219,449],[245,446]];
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const relative=p=>path.relative(root,p).split(path.sep).join('/');
const blank=(w,h)=>new PNG({width:w,height:h});
const save=(name,png)=>fs.writeFileSync(path.join(dir,name),PNG.sync.write(png,{colorType:6}));
const inside=(x,y,points)=>{let v=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const[xi,yi]=points[i],[xj,yj]=points[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)v=!v;}return v;};
const edgeDistance=(x,y)=>Math.min(...polygon.map(([ax,ay],i)=>{const[bx,by]=polygon[(i+1)%polygon.length];if(ay===606&&by===606)return Infinity;const dx=bx-ax,dy=by-ay;const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));return Math.hypot(x-ax-t*dx,y-ay-t*dy);}));
const skin=(r,g,b,a)=>a>0&&r>150&&r-b>=18&&r-g>=8&&g-b>=8;
const clamp=x=>Math.max(0,Math.min(1,x));
(async()=>{
 const bodyPath=path.join(root,baseline.body),rawPath=path.join(dir,'torso-imagegen-raw.png');
 if(hash(bodyPath)!==baseline.bodySHA256)throw new Error('Native source changed');
 const original=PNG.sync.read(fs.readFileSync(bodyPath)),w=original.width,h=original.height;
 if(w!==508||h!==606)throw new Error('Unexpected native canvas');
 await sharp(rawPath).resize(crop.width,crop.height,{kernel:'lanczos3'}).ensureAlpha().png().toFile(path.join(dir,'torso-part-native.png'));
 const part=PNG.sync.read(fs.readFileSync(path.join(dir,'torso-part-native.png')));
 const hair=new Uint8Array(w*h),rearHair=new Uint8Array(w*h);
 for(const rows of [...frontLocks,...sideHair])for(let i=0;i<rows.length-1;i++){
  const[y0,l0,r0]=rows[i],[y1,l1,r1]=rows[i+1];
  for(let y=y0;y<y1;y++){
   if(y>=390&&(sideHair.includes(rows)||rows===frontLocks[2]))continue;
   const t=(y-y0)/(y1-y0),left=Math.round(l0+(l1-l0)*t),right=Math.round(r0+(r1-r0)*t),front=frontLocks.includes(rows);
   let start=Math.max(0,left),end=Math.min(w-1,right);
   if(front){
    const contour=[];
    for(let x=Math.max(0,left-2);x<=Math.min(w-1,right+2);x++){
     const p=(y*w+x)*4,[r,g,b,a]=original.data.subarray(p,p+4),white=Math.min(r,g,b)>244&&Math.max(r,g,b)-Math.min(r,g,b)<4;
     if(a>0&&r>=g-2&&g>=b-3&&r-g<25&&g-b<25&&!white&&!skin(r,g,b,a))contour.push(x);
    }
    if(!contour.length)continue;
    start=Math.min(...contour);end=Math.max(...contour);
   }
   for(let x=start;x<=end;x++){
    const p=(y*w+x)*4,[r,g,b,a]=original.data.subarray(p,p+4),coolCloth=b>g+5||g>r+5;
    const warmHair=r>=g-2&&g>=b-3&&r-g<25&&g-b<25;
    const white=Math.min(r,g,b)>244&&Math.max(r,g,b)-Math.min(r,g,b)<4;
    if(a>0&&!skin(r,g,b,a)&&!coolCloth&&(front||warmHair&&!white))hair[y*w+x]=1;
   }
  }
 }
 // Fill complete traced lock silhouettes. No colour threshold is used inside these locks.
 for(const rows of completeHair)for(let i=0;i<rows.length-1;i++){
  const[y0,l0,r0]=rows[i],[y1,l1,r1]=rows[i+1];
  for(let y=y0;y<y1;y++){
   const t=(y-y0)/(y1-y0),left=Math.round(l0+(l1-l0)*t),right=Math.round(r0+(r1-r0)*t);
   for(let x=Math.max(0,left);x<=Math.min(w-1,right);x++){
    const p=(y*w+x)*4,[r,g,b,a]=original.data.subarray(p,p+4);
    if(a>0&&!skin(r,g,b,a)){
     hair[y*w+x]=1;
     if(rows===completeHair[3]||rows===completeHair[4])rearHair[y*w+x]=1;
    }
   }
  }
 }
 // The new hands, cup, saucer and raised forearms pass in front of the old locks.
 for(let y=crop.top;y<h;y++)for(let x=crop.left;x<crop.left+crop.width;x++){
  const q=((y-crop.top)*crop.width+x-crop.left)*4,[r,g,b,a]=part.data.subarray(q,q+4);
  if(y>=385&&skin(r,g,b,a)||a>80&&(rearHair[y*w+x]||inside(x+.5,y+.5,teaForeground)||armForeground.some(p=>inside(x+.5,y+.5,p))))hair[y*w+x]=0;
 }
 const mother=blank(w,h),mask=blank(w,h),hairMask=blank(w,h),replacement=blank(w,h),hairPreview=blank(w,h);
 original.data.copy(mother.data);
 let changed=0,editable=0,protectedHair=0,outsideMismatch=0,faceMismatch=0,bounds=[w,h,0,0];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=(y*w+x)*4;
  if(hair[y*w+x]){hairMask.data.set([255,255,255,255],p);original.data.copy(hairPreview.data,p,p,p+4);protectedHair++;}
  let weight=0;
  if(y>=300&&y<h&&x>=crop.left&&x<crop.left+crop.width&&inside(x+.5,y+.5,polygon)&&!hair[y*w+x]){
   let mix=Math.min(1,edgeDistance(x+.5,y+.5)/4,(y-299)/8);
   // Preserve the native collar, gold clasp, blue ribbon and upper chest, with a soft local transition.
   if(x>=164&&x<=352&&y<404)mix*=clamp((y-389)/15);
   // Keep both native shoulders above the sleeve fold; hands still occlude the foreground locks.
   if(y<416&&(x<164||x>352))mix*=clamp((y-388)/28);
   const q=((y-crop.top)*crop.width+x-crop.left)*4,[r,g,b,a]=part.data.subarray(q,q+4);
   if(y>=385&&skin(r,g,b,a))mix=1;
   if(y>=400&&a===0)mix=1;
   weight=Math.round(255*mix);
  }
  if(weight){
   editable++;mask.data.set([255,255,255,weight],p);
   const q=((y-crop.top)*crop.width+x-crop.left)*4;
   replacement.data.set(part.data.subarray(q,q+4),p);
   const aa=part.data[q+3],ab=original.data[p+3],combined=aa*weight+ab*(255-weight);
   for(let c=0;c<3;c++)mother.data[p+c]=combined?Math.round((part.data[q+c]*aa*weight+original.data[p+c]*ab*(255-weight))/combined):part.data[q+c];
   mother.data[p+3]=Math.round(combined/255);
   if(!mother.data.subarray(p,p+4).equals(original.data.subarray(p,p+4))){changed++;bounds=[Math.min(bounds[0],x),Math.min(bounds[1],y),Math.max(bounds[2],x+1),Math.max(bounds[3],y+1)];}
  }
  if(!weight&&!mother.data.subarray(p,p+4).equals(original.data.subarray(p,p+4)))outsideMismatch++;
  const[ox,oy]=baseline.faceOffset,[fw,fh]=baseline.faceSize;
  if(x>=ox&&x<ox+fw&&y>=oy&&y<oy+fh&&!mother.data.subarray(p,p+4).equals(original.data.subarray(p,p+4)))faceMismatch++;
 }
 if(outsideMismatch||faceMismatch)throw new Error('Native RGBA preservation failed');
 for(const[name,png]of[['mother-body.png',mother],['local-edit-mask.png',mask],['original-hair-preservation-mask.png',hairMask],['local-replacement-layer.png',replacement],['qa-preserved-hair.png',hairPreview]])save(name,png);
 const evidence={
  version:1,outfit:'b_',view:'close',date:'2026-09-30',timezone:'Asia/Shanghai',status:'pending-review',
  production:'Built-in imagegen generated only a headless summer torso/arms/tea part. Original native head, face opening, collar/ribbon and visible hair are retained without resampling. Original expressions stay separate PNG layers.',
  canvas:[w,h],mother:relative(path.join(dir,'mother-body.png')),
  source:{body:baseline.body,sha256:hash(bodyPath),faceOffset:baseline.faceOffset,faceSize:baseline.faceSize,faces:baseline.faces},
  generation:{tool:'built-in imagegen',inputs:[relative(path.join(dir,'torso-edit-input.png')),'ArtSources/CharacterExpansion/native-tea/a/full/v1/torso-imagegen-refined.png'],raw:'torso-imagegen-raw.png',rawSHA256:hash(rawPath),prompt:'imagegen-prompt.txt',scope:'neck-to-waist local part only; no head, face, hair or complete character generated'},
  assembly:{script:'assemble.cjs',crop,editPolygon:polygon,mask:'local-edit-mask.png',maskSHA256:hash(path.join(dir,'local-edit-mask.png')),protectedHairMask:'original-hair-preservation-mask.png',frontLockRows:frontLocks,sideHairRows:sideHair,completeHairRows:completeHair,rearHairBands:[3,4],teaForeground,armForeground,topOriginalRows:389,protectedUpperTorso:{x:[164,352],unchangedThroughY:389,blendToY:404,shouldersOriginalThroughY:388,shoulderBlendToY:416},edgeBlendPixels:4,alphaBlend:'Premultiplied interpolation; canvas bottom is not feathered back to the old lowered sleeves.',changedPixels:changed,editablePixels:editable,protectedHairPixels:protectedHair,changedBoundsXYXY:bounds,overlap:'New hands, tea ware and raised forearms occlude hanging locks. Rear locks are behind the new torso/arms where the generated local part is opaque; other visible hair comes from the native game body.'},
  layers:{body:'mother-body.png',localPart:'torso-part-native.png',replacement:'local-replacement-layer.png',expression:'Seven unmodified assets/chihaya_character/chi00b_@.png through chi06b_@.png; native fixed offset (163,66)'},
  teaWare:{reference:'ArtSources/CharacterExpansion/native-tea/tea-ware-reference.json',design:'Approved plain white porcelain cup and shallow saucer, image-left hand on left handle and image-right palm under saucer.'},
  checks:{nativeCanvas:'passed',alpha:'passed',outsideRGBA:'passed',outsideRGBAMismatches:outsideMismatch,faceRegion:'passed',faceRegionRGBAMismatches:faceMismatch,seams:'pending-visual-review',review:'pending',application:'not-integrated'},
  outputSHA256:hash(path.join(dir,'mother-body.png'))
 };
 fs.writeFileSync(path.join(dir,'production.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({mother:evidence.mother,changedPixels:changed,changedBounds:bounds,outsideMismatch,faceMismatch},null,2));
})();

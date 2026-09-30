// Assemble a generated LOCAL torso into the original 268x606 game canvas.
// Native head, face opening, visible silver hair and pixels outside the mask
// are copied directly. No generated head or expression is used.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const sharp=require('sharp'),{PNG}=require('pngjs');
const dir=__dirname,root=path.resolve(dir,'../../../../../..');
const originals=JSON.parse(fs.readFileSync(path.join(root,'ArtSources/CharacterExpansion/native-tea/originals.json'))).variants;
const baseline=originals['a_/full'];
const crop={left:24,top:180,width:216,height:192};
const polygon=[[57,190],[79,181],[198,181],[217,206],[228,243],[217,289],[218,334],[204,355],[194,371],[72,371],[63,359],[44,334],[40,294],[31,247],[45,214]];
const frontLocks=[
  [[180,74,101],[185,75,103],[190,75,102],[195,76,100],[200,78,99],[205,80,100],[210,83,105],[215,88,108],[220,90,100],[225,92,101],[230,90,100],[235,86,96],[240,82,91],[245,79,87],[250,77,84],[255,77,85],[260,79,89],[265,82,96],[270,87,104],[274,95,102]],
  [[180,103,114],[185,104,116],[190,108,119],[195,110,121],[200,113,123],[205,114,125],[210,115,126],[215,116,126],[220,115,126],[225,114,124],[230,111,120],[235,108,116],[240,104,113],[245,100,109],[250,97,105],[255,94,104],[260,94,107],[265,98,109],[269,104,109]],
  [[180,150,177],[185,151,176],[190,152,171],[195,152,165],[200,153,165],[205,154,166],[210,157,169],[215,160,173],[220,162,175],[225,164,179],[230,167,181],[235,171,184],[240,175,189],[245,179,192],[250,181,194],[255,180,194],[260,177,189],[265,173,183],[270,169,177],[275,167,175],[279,171,178]],
  [[255,189,194],[260,189,194],[265,186,193],[270,183,192],[275,178,189],[279,174,183]]
];
const sideHair=[
  [[180,0,64],[190,0,63],[200,0,62],[210,0,60],[220,0,57],[230,0,52],[240,0,44],[250,0,36],[260,0,28],[270,0,40],[280,0,53],[290,0,56],[300,0,58],[310,0,61],[320,0,69],[330,0,80],[340,0,88],[350,0,86],[360,0,80],[371,0,76]],
  [[180,195,267],[190,194,267],[200,194,267],[210,200,267],[220,203,267],[230,211,267],[240,220,267],[250,230,267],[260,233,267],[270,212,267],[280,209,267],[290,211,267],[300,214,267],[310,215,267],[320,216,267],[330,213,267],[340,210,267],[350,202,267],[360,196,267],[371,194,267]]
];
const teaForeground=[[107,237],[162,237],[163,257],[155,266],[176,268],[175,275],[113,279],[99,274],[101,257],[103,241]];
const armForeground=[[[62,281],[88,292],[100,311],[79,339],[67,357],[56,357],[43,341],[50,306]],[[161,289],[189,303],[212,327],[209,352],[193,354],[175,335]]];
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const relative=p=>path.relative(root,p).split(path.sep).join('/');
const blank=(w,h)=>new PNG({width:w,height:h});
const save=(n,p)=>fs.writeFileSync(path.join(dir,n),PNG.sync.write(p,{colorType:6}));
const inside=(x,y,points)=>{
  let v=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const [xi,yi]=points[i],[xj,yj]=points[j];
    if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)v=!v;
  }
  return v;
};
const edgeDistance=(x,y)=>Math.min(...polygon.map(([ax,ay],i)=>{
  const [bx,by]=polygon[(i+1)%polygon.length],dx=bx-ax,dy=by-ay;
  const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));
  return Math.hypot(x-ax-t*dx,y-ay-t*dy);
}));
const oldHand=(r,g,b,a)=>a>0&&r-b>=36&&r-g>=12&&g-b>=14;
const newHand=(r,g,b,a)=>a>0&&r>150&&r-b>=18&&r-g>=8&&g-b>=8;
(async()=>{
  const bodyPath=path.join(root,baseline.body),rawPath=path.join(dir,'torso-imagegen-refined.png');
  if(hash(bodyPath)!==baseline.bodySHA256)throw new Error('Native summer body hash changed');
  const original=PNG.sync.read(fs.readFileSync(bodyPath)),w=original.width,h=original.height;
  if(w!==268||h!==606)throw new Error('Unexpected native game canvas');
  await sharp(rawPath).resize(crop.width,crop.height,{kernel:'lanczos3'}).ensureAlpha().png().toFile(path.join(dir,'torso-part-native.png'));
  const part=PNG.sync.read(fs.readFileSync(path.join(dir,'torso-part-native.png')));
  const hair=new Uint8Array(w*h);
  // Trace continuous lock boundaries on the original SUMMER pixels. Complete
  // bands include native white highlights and all antialiased hair contours;
  // selecting disconnected equal-colour pixels caused shoulder flecks.
  for(const rows of [...frontLocks,...sideHair])for(let i=0;i<rows.length-1;i++) {
    const [y0,l0,r0]=rows[i],[y1,l1,r1]=rows[i+1];
    for(let y=y0;y<y1;y++) {
      const t=(y-y0)/(y1-y0),left=Math.round(l0+(l1-l0)*t),right=Math.round(r0+(r1-r0)*t);
      for(let x=left;x<=right;x++) {
        const p=(y*w+x)*4,[r,g,b,a]=original.data.subarray(p,p+4);
        if(!oldHand(r,g,b,a))hair[y*w+x]=1;
      }
    }
  }
  // Hands and tea ware occupy the foreground. Sleeves can cover rear locks.
  for(let y=180;y<372;y++)for(let x=crop.left;x<crop.left+crop.width;x++) {
    const q=((y-crop.top)*crop.width+x-crop.left)*4,[r,g,b,a]=part.data.subarray(q,q+4);
    if(newHand(r,g,b,a)||inside(x+.5,y+.5,teaForeground)||a>80&&armForeground.some(poly=>inside(x+.5,y+.5,poly)))hair[y*w+x]=0;
  }
  const mother=blank(w,h),mask=blank(w,h),hairMask=blank(w,h),replacement=blank(w,h);
  original.data.copy(mother.data);
  let changed=0,editable=0,protectedHair=0,outsideMismatch=0,faceMismatch=0;
  let bounds=[w,h,0,0];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const p=(y*w+x)*4;
    if(hair[y*w+x]){hairMask.data.set([255,255,255,255],p);protectedHair++;}
    let weight=0;
    if(y>=194&&y<372&&x>=crop.left&&x<crop.left+crop.width&&inside(x+.5,y+.5,polygon)&&!hair[y*w+x]) {
      weight=Math.max(0,Math.round(255*Math.min(1,edgeDistance(x+.5,y+.5)/3,(y-193)/4,(371-y)/8)));
    }
    if(weight) {
      editable++;
      mask.data.set([255,255,255,weight],p);
      const q=((y-crop.top)*crop.width+x-crop.left)*4;
      replacement.data.set(part.data.subarray(q,q+4),p);
      for(let c=0;c<4;c++)mother.data[p+c]=Math.round((part.data[q+c]*weight+original.data[p+c]*(255-weight))/255);
      if(!mother.data.subarray(p,p+4).equals(original.data.subarray(p,p+4))) {
        changed++;bounds=[Math.min(bounds[0],x),Math.min(bounds[1],y),Math.max(bounds[2],x+1),Math.max(bounds[3],y+1)];
      }
    }
    if(!weight&&!mother.data.subarray(p,p+4).equals(original.data.subarray(p,p+4)))outsideMismatch++;
    const [ox,oy]=baseline.faceOffset,[fw,fh]=baseline.faceSize;
    if(x>=ox&&x<ox+fw&&y>=oy&&y<oy+fh&&!mother.data.subarray(p,p+4).equals(original.data.subarray(p,p+4)))faceMismatch++;
  }
  if(outsideMismatch||faceMismatch)throw new Error('Native pixel preservation failed');
  for(const [n,p]of [['mother-body.png',mother],['local-edit-mask.png',mask],['original-hair-preservation-mask.png',hairMask],['local-replacement-layer.png',replacement]])save(n,p);
  const evidence={
    version:1,outfit:'a_',view:'full',date:'2026-09-30',timezone:'Asia/Shanghai',status:'pending-review',
    production:'Built-in imagegen edits only the local torso/arms/tea crop. A second local edit removes generated alignment hair. The native game head, face opening and visible silver hair are preserved during deterministic masked assembly; no complete character or expression is generated.',
    canvas:[w,h],mother:relative(path.join(dir,'mother-body.png')),
    source:{body:baseline.body,sha256:hash(bodyPath),faceOffset:baseline.faceOffset,faceSize:baseline.faceSize,faces:baseline.faces},
    generation:{tool:'built-in imagegen',inputs:['torso-edit-input.png','ArtSources/CharacterExpansion/native-tea/a/full/v1/torso-imagegen-refined.png'],raw:'torso-imagegen-raw.png',refined:'torso-imagegen-refined.png',prompts:['imagegen-prompt.txt','imagegen-refine-prompt.txt'],rawSHA256:hash(path.join(dir,'torso-imagegen-raw.png')),refinedSHA256:hash(rawPath),scope:'torso-only crop; no head, face or complete person'},
    assembly:{script:'assemble.cjs',crop,editPolygon:polygon,mask:'local-edit-mask.png',maskSHA256:hash(path.join(dir,'local-edit-mask.png')),protectedHairMask:'original-hair-preservation-mask.png',hairPreservationMethod:'Continuous front and side lock bands traced on native summer body pixels; old skin is excluded.',sourceHairInspection:'qa-source-hair-grid.png',frontLockRows:frontLocks,sideHairRows:sideHair,teaForeground,armForeground,topOriginalRows:194,edgeBlendPixels:3,waistBlendPixels:8,changedPixels:changed,editablePixels:editable,protectedHairPixels:protectedHair,changedBoundsXYXY:bounds,overlap:'Hands, cup, saucer and bent forearms occlude rear hair; remaining visible locks are native summer body pixels.'},
    layers:{body:'mother-body.png',localPart:'torso-part-native.png',replacement:'local-replacement-layer.png',expression:'Original summer face PNGs remain separate and unmodified, with native offset (79,76).'},
    teaWare:{reference:'ArtSources/CharacterExpansion/native-tea/tea-ware-reference.json',design:'Approved plain white porcelain cup and shallow saucer; image-left hand holds left handle, image-right palm supports saucer.'},
    checks:{nativeCanvas:'passed',alpha:'passed',outsideRGBA:'passed',outsideRGBAMismatches:outsideMismatch,faceRegion:'passed',faceRegionRGBAMismatches:faceMismatch,seams:'pending-visual-review',review:'pending',application:'not-integrated'},
    outputSHA256:hash(path.join(dir,'mother-body.png'))
  };
  fs.writeFileSync(path.join(dir,'production.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({mother:evidence.mother,changedPixels:changed,changedBounds:bounds,outsideMismatch,faceMismatch},null,2));
})();

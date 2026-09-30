// Assemble the generated torso part into the immutable native summer-close canvas.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { PNG } = require('pngjs');
const dir = __dirname;
const root = path.resolve(dir, '../../../../../..');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'ArtSources/CharacterExpansion/native-tea/originals.json'))).variants['a_/close'];
const crop = { left:24, top:240, width:392, height:366 };
const polygon = [[120,267],[320,267],[354,300],[388,360],[393,425],[378,500],[356,555],[316,579],[315,606],[126,606],[130,563],[111,550],[73,513],[60,455],[45,395],[47,350],[84,306]];
const frontLocks = [
  [[240,113,157],[250,115,151],[260,120,142],[270,121,146],[280,124,151],[290,127,158],[300,131,160],[310,141,168],[320,151,171],[330,151,164],[340,143,157],[350,136,149],[360,132,145],[370,128,142],[380,128,139],[390,130,141],[400,138,150],[406,144,148]],
  [[240,156,187],[250,165,193],[260,173,197],[270,179,203],[280,186,207],[290,191,209],[300,194,210],[310,195,210],[320,192,209],[330,187,205],[340,180,199],[350,173,191],[360,165,183],[370,159,175],[380,153,169],[390,151,162],[398,154,167],[404,163,175],[409,172,178]],
  [[369,177,182],[380,177,183],[390,181,186],[397,188,194],[400,189,193]],
  [[240,258,286],[250,255,280],[260,255,277],[270,266,278],[280,257,279],[290,262,279],[300,270,284],[310,273,288],[320,275,292],[330,281,296],[340,290,302],[350,292,307],[360,296,319],[365,298,320],[370,298,322],[375,298,323],[380,297,321],[385,297,321],[390,296,321],[395,295,320],[400,294,318],[405,291,315],[410,289,311],[415,283,291],[418,286,289]],
  [[260,319,325],[270,312,318],[280,303,309],[290,294,300],[300,284,291],[310,275,281],[318,270,275]],
  [[281,301,304],[300,299,302],[320,298,301],[332,300,303]],
  [[332,305,310],[350,311,316],[370,318,322],[390,316,320],[407,306,311],[418,297,303]]
];
const sideHair = [
  [[240,0,111],[260,0,109],[280,0,109],[300,0,108],[310,0,105],[320,0,102],[330,0,96],[340,0,87],[350,0,75],[360,0,62],[370,0,49],[380,0,44],[390,0,52],[400,0,64],[410,0,86],[420,0,103],[440,0,110],[460,0,116],[470,0,99],[480,0,96],[490,0,99],[500,0,102],[510,0,113],[520,0,121],[530,0,133],[540,0,134],[550,0,121],[560,0,115],[564,0,112]],
  [[240,326,454],[260,325,454],[270,328,454],[280,330,454],[290,333,454],[300,336,454],[310,341,454],[320,349,454],[330,357,454],[340,365,454],[350,373,454],[360,385,454],[370,396,454],[380,389,454],[390,378,454],[400,367,454],[410,353,454],[420,349,454],[440,349,454],[460,350,454],[470,343,454],[480,340,454],[500,340,454],[520,313,454],[540,306,454],[560,302,454],[566,306,454]]
];
const armForeground = [
  [[108,433],[155,448],[169,474],[143,520],[120,557],[109,569],[55,553],[68,491]],
  [[280,444],[328,462],[366,514],[365,555],[335,565],[304,543]]
];
// This upper-right collar/trim area is unaffected by the arm pose. Keeping its
// complete native pixels also keeps the fine diagonal strands with their native
// cloth background, instead of attempting to isolate subpixel hair edges.
const nativeCollar = {left:278,top:268,right:454,bottom:398};
const teaForeground = [[197,353],[278,353],[279,407],[305,412],[306,426],[272,435],[177,435],[174,412],[190,405]];
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const relative = p => path.relative(root,p).split(path.sep).join('/');
const blank = (w,h) => new PNG({width:w,height:h});
const save = (name,png) => fs.writeFileSync(path.join(dir,name), PNG.sync.write(png,{colorType:6}));
const inside = (x,y,points) => {
  let v=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const [xi,yi]=points[i], [xj,yj]=points[j];
    if((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) v=!v;
  }
  return v;
};
const edgeDistance = (x,y) => Math.min(...polygon.map(([ax,ay],i)=>{
  const [bx,by]=polygon[(i+1)%polygon.length], dx=bx-ax,dy=by-ay;
  const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));
  return Math.hypot(x-ax-t*dx,y-ay-t*dy);
}));
const skin = (r,g,b,a) => a>0 && r>150 && r-b>=18 && r-g>=8 && g-b>=8;
const oldHand = (r,g,b,a) => a>0 && r-b>=36 && r-g>=12 && g-b>=14;
(async()=>{
  const bodyPath=path.join(root,baseline.body), rawPath=path.join(dir,'torso-imagegen-raw.png');
  if(hash(bodyPath)!==baseline.bodySHA256) throw new Error('Native source hash changed');
  const original=PNG.sync.read(fs.readFileSync(bodyPath)), w=original.width,h=original.height;
  if(w!==454||h!==606) throw new Error('Unexpected game canvas');
  await sharp(rawPath).resize(crop.width,crop.height,{kernel:'lanczos3'}).ensureAlpha().png().toFile(path.join(dir,'torso-part-native.png'));
  const part=PNG.sync.read(fs.readFileSync(path.join(dir,'torso-part-native.png')));
  const hair=new Uint8Array(w*h);
  // Trace complete native lock bands, including white highlights and edge pixels.
  // Colour-only segmentation left small pieces of old clothing in the first draft.
  for(const rows of [...frontLocks,...sideHair]) for(let i=0;i<rows.length-1;i++) {
    const [y0,l0,r0]=rows[i],[y1,l1,r1]=rows[i+1];
    for(let y=y0;y<y1;y++) {
      const t=(y-y0)/(y1-y0),left=Math.round(l0+(l1-l0)*t),right=Math.round(r0+(r1-r0)*t);
      const thin=frontLocks.indexOf(rows)>=4;
      let start=Math.max(0,left),end=Math.min(w-1,right);
      if(thin) {
        // Locate the actual native warm-grey contours inside each traced band.
        // This excludes the original blue/white cloth beside a very thin lock.
        const contour=[];
        for(let x=Math.max(0,left-2);x<=Math.min(w-1,right+2);x++) {
          const p=(y*w+x)*4,[r,g,b,a]=original.data.subarray(p,p+4);
          const white=Math.min(r,g,b)>240&&Math.max(r,g,b)-Math.min(r,g,b)<7;
          if(a>0&&r>=g-2&&g>=b-3&&r-g<25&&g-b<25&&!white&&!oldHand(r,g,b,a)) contour.push(x);
        }
        const center=(left+right)/2;
        const chosen=contour.length?contour.reduce((best,x)=>Math.abs(x-center)<Math.abs(best-center)?x:best,contour[0]):Math.round(center);
        start=chosen-1;end=chosen+1;
      }
      for(let x=start;x<=end;x++) {
        const p=(y*w+x)*4,[r,g,b,a]=original.data.subarray(p,p+4);
        if(!oldHand(r,g,b,a)) hair[y*w+x]=1;
      }
    }
  }
  for(let y=crop.top;y<h;y++) for(let x=crop.left;x<crop.left+crop.width;x++) {
    const q=((y-crop.top)*crop.width+x-crop.left)*4;
    const [r,g,b,a]=part.data.subarray(q,q+4);
    if(skin(r,g,b,a)||inside(x+.5,y+.5,teaForeground)||a>80&&armForeground.some(poly=>inside(x+.5,y+.5,poly))) hair[y*w+x]=0;
  }
  const mother=blank(w,h),mask=blank(w,h),hairMask=blank(w,h),replacement=blank(w,h);
  original.data.copy(mother.data);
  let changed=0,editable=0,protectedHair=0,outsideMismatch=0,faceMismatch=0;
  let bounds=[w,h,0,0];
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const p=(y*w+x)*4;
    if(hair[y*w+x]) {hairMask.data.set([255,255,255,255],p);protectedHair++;}
    let weight=0;
    if(y>=268&&y<h&&x>=crop.left&&x<crop.left+crop.width&&inside(x+.5,y+.5,polygon)&&!hair[y*w+x]) {
      weight=Math.max(0,Math.round(255*Math.min(1,edgeDistance(x+.5,y+.5)/3,(y-267)/4,(605-y)/8)));
    }
    const collarDistance=Math.max(nativeCollar.left-x,x-nativeCollar.right+1,nativeCollar.top-y,y-nativeCollar.bottom+1);
    if(collarDistance<=0)weight=0;
    else if(collarDistance<8)weight=Math.round(weight*collarDistance/8);
    if(weight) {
      editable++;
      mask.data.set([255,255,255,weight],p);
      const q=((y-crop.top)*crop.width+x-crop.left)*4;
      replacement.data.set(part.data.subarray(q,q+4),p);
      for(let c=0;c<4;c++) mother.data[p+c]=Math.round((part.data[q+c]*weight+original.data[p+c]*(255-weight))/255);
      if(!mother.data.subarray(p,p+4).equals(original.data.subarray(p,p+4))) {
        changed++; bounds=[Math.min(bounds[0],x),Math.min(bounds[1],y),Math.max(bounds[2],x+1),Math.max(bounds[3],y+1)];
      }
    }
    if(!weight&&!mother.data.subarray(p,p+4).equals(original.data.subarray(p,p+4))) outsideMismatch++;
    const [ox,oy]=baseline.faceOffset,[fw,fh]=baseline.faceSize;
    if(x>=ox&&x<ox+fw&&y>=oy&&y<oy+fh&&!mother.data.subarray(p,p+4).equals(original.data.subarray(p,p+4))) faceMismatch++;
  }
  if(outsideMismatch||faceMismatch) throw new Error('Native pixel preservation failed');
  for(const [name,png] of [['mother-body.png',mother],['local-edit-mask.png',mask],['original-hair-preservation-mask.png',hairMask],['local-replacement-layer.png',replacement]]) save(name,png);
  const evidence={
    version:1,outfit:'a_',view:'close',date:'2026-09-30',timezone:'Asia/Shanghai',status:'pending-review',
    production:'Built-in imagegen generated only a neck-to-waist torso/arms/tea part. The original native head, face opening and visible hair are copied without resampling. Expressions remain original separate PNG layers.',
    canvas:[w,h],mother:relative(path.join(dir,'mother-body.png')),
    source:{body:baseline.body,sha256:hash(bodyPath),faceOffset:baseline.faceOffset,faceSize:baseline.faceSize,faces:baseline.faces},
    generation:{tool:'built-in imagegen',inputs:[relative(path.join(dir,'torso-edit-input.png')),'ArtSources/CharacterExpansion/native-tea/a/full/v1/torso-imagegen-refined.png'],raw:'torso-imagegen-raw.png',rawSHA256:hash(rawPath),prompt:'imagegen-prompt.txt',scope:'torso part only; no face, head, hair or complete character generated'},
    assembly:{script:'assemble.cjs',crop,editPolygon:polygon,mask:'local-edit-mask.png',maskSHA256:hash(path.join(dir,'local-edit-mask.png')),protectedHairMask:'original-hair-preservation-mask.png',frontLockRows:frontLocks,sideHairRows:sideHair,teaForeground,armForeground,nativeCollarRegion:nativeCollar,nativeCollarBoundaryBlendPixels:8,topOriginalRows:268,edgeBlendPixels:3,waistBlendPixels:8,changedPixels:changed,editablePixels:editable,protectedHairPixels:protectedHair,changedBoundsXYXY:bounds,overlap:'The two new hands, forearms and tea ware are in front of the hanging locks. Other visible lock pixels and the unaffected right collar/shoulder come directly from the game body.'},
    layers:{body:'mother-body.png',localPart:'torso-part-native.png',replacement:'local-replacement-layer.png',expression:'Unmodified assets/chihaya_character/chi00a_@.png through chi11a_@.png, fixed native offset (120,85)'},
    teaWare:{reference:'ArtSources/CharacterExpansion/native-tea/tea-ware-reference.json',design:'Approved plain white porcelain cup and shallow saucer; image-left hand holds left handle, image-right palm supports saucer.'},
    checks:{nativeCanvas:'passed',alpha:'passed',outsideRGBA:'passed',outsideRGBAMismatches:outsideMismatch,faceRegion:'passed',faceRegionRGBAMismatches:faceMismatch,seams:'pending-visual-review',review:'pending',application:'not-integrated'},
    outputSHA256:hash(path.join(dir,'mother-body.png'))
  };
  fs.writeFileSync(path.join(dir,'production.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({mother:evidence.mother,changedPixels:changed,changedBounds:bounds,outsideMismatch,faceMismatch},null,2));
})();

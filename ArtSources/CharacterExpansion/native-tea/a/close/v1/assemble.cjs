// Assemble the generated torso part into the immutable native winter-close canvas.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { PNG } = require('pngjs');
const dir = __dirname;
const root = path.resolve(dir, '../../../../../..');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'ArtSources/CharacterExpansion/native-tea/originals.json'))).variants['a/close'];
const crop = { left:24, top:240, width:392, height:366 };
const polygon = [[120,267],[320,267],[354,300],[388,360],[393,425],[378,500],[356,555],[316,579],[315,606],[126,606],[130,563],[111,550],[73,513],[60,455],[45,395],[47,350],[84,306]];
const frontLocks = [
  [[240,113,139],[250,115,141],[260,117,144],[270,119,147],[280,122,155],[290,127,156],[300,133,160],[310,141,168],[320,151,169],[330,151,161],[340,140,155],[350,131,146],[360,128,139],[370,126,139],[380,126,138],[390,128,140],[397,133,144]],
  [[240,106,114],[250,108,115],[260,109,116],[270,109,116],[280,109,117],[290,110,122],[300,115,130],[310,123,149],[316,139,154]],
  [[240,148,163],[250,150,157],[260,152,161],[270,153,164],[280,144,157],[284,144,152]],
  [[240,156,187],[250,171,193],[260,177,204],[270,180,209],[280,186,207],[290,189,210],[300,191,212],[310,192,211],[320,191,207],[330,189,201],[340,183,197],[350,175,189],[360,164,184],[370,155,176],[380,151,174],[390,150,172],[398,153,171],[406,159,174],[409,169,178]],
  [[369,177,182],[380,177,183],[390,181,186],[397,188,194],[400,189,193]],
  [[240,258,286],[250,255,281],[260,255,280],[270,256,279],[280,257,279],[290,260,279],[300,267,285],[310,271,291],[320,276,295],[330,282,299],[340,288,305],[350,293,310],[360,297,315],[370,298,316],[380,297,315],[390,295,312],[400,285,308],[406,276,301],[410,271,296],[414,267,288],[417,274,281]],
  [[240,327,333],[250,320,327],[260,313,322],[270,307,317],[280,299,307],[290,298,306],[300,298,305],[310,296,303],[320,296,304],[330,298,305],[338,303,308]],
  [[348,309,312],[360,311,319],[370,314,322],[380,317,325],[390,312,324],[400,307,320],[410,300,312],[415,295,303]]
];
const sideHair = [
  [[240,0,111],[260,0,109],[280,0,109],[300,0,108],[310,0,105],[320,0,102],[330,0,96],[340,0,87],[350,0,75],[360,0,62],[370,0,49],[380,0,44],[390,0,52],[400,0,64],[410,0,86],[420,0,103],[440,0,110],[460,0,116],[470,0,99],[480,0,96],[490,0,99],[500,0,102],[510,0,113],[520,0,121],[530,0,133],[540,0,134],[550,0,121],[560,0,115],[564,0,112]],
  [[240,326,454],[250,326,454],[260,324,454],[270,326,454],[280,328,454],[290,330,454],[300,319,454],[310,323,454],[320,328,454],[330,333,454],[340,340,454],[350,347,454],[360,357,454],[370,376,454],[380,385,454],[390,378,454],[400,367,454],[410,353,454],[420,349,454],[440,349,454],[460,350,454],[470,343,454],[480,340,454],[500,340,454],[520,313,454],[540,306,454],[560,302,454],[566,306,454]]
];
const armForeground = [
  [[121,364],[162,355],[189,369],[193,414],[157,462],[115,452],[104,425],[113,393]],
  [[96,410],[159,432],[179,477],[142,544],[100,568],[58,546],[63,472]],
  [[280,432],[335,448],[393,550],[343,575],[291,515]]
];
const teaForeground = [[168,355],[272,355],[273,412],[301,412],[302,435],[173,435],[160,413],[169,406]];
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
      const front=frontLocks.includes(rows);
      let start=Math.max(0,left),end=Math.min(w-1,right);
      // Front locks use continuous geometric bands so a cool antialiased edge
      // or a pure-white highlight cannot cut holes through a native strand.
      for(let x=start;x<=end;x++) {
        const p=(y*w+x)*4,[r,g,b,a]=original.data.subarray(p,p+4);
        const coolCloth=b>g+7||g>r+7;
        const silverBand=r-g<=25&&g-b<=25&&b-g<=18&&g-r<=18;
        if(!skin(r,g,b,a)&&(front?silverBand:!coolCloth)) hair[y*w+x]=1;
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
    version:1,outfit:'a',view:'close',date:'2026-09-30',timezone:'Asia/Shanghai',status:'pending-review',
    production:'Built-in imagegen generated only a neck-to-waist torso/arms/tea part. The original native head, face opening and visible hair are copied without resampling. Expressions remain original separate PNG layers.',
    canvas:[w,h],mother:relative(path.join(dir,'mother-body.png')),
    source:{body:baseline.body,sha256:hash(bodyPath),faceOffset:baseline.faceOffset,faceSize:baseline.faceSize,faces:baseline.faces},
    generation:{tool:'built-in imagegen',inputs:[relative(path.join(dir,'torso-edit-input.png')),'ArtSources/CharacterExpansion/native-tea/a/full/v1/torso-imagegen-refined.png'],raw:'torso-imagegen-raw.png',rawSHA256:hash(rawPath),prompt:'imagegen-prompt.txt',scope:'torso part only; no face, head, hair or complete character generated'},
    assembly:{script:'assemble.cjs',crop,editPolygon:polygon,mask:'local-edit-mask.png',maskSHA256:hash(path.join(dir,'local-edit-mask.png')),protectedHairMask:'original-hair-preservation-mask.png',protectedHairMaskSHA256:hash(path.join(dir,'original-hair-preservation-mask.png')),frontLockRows:frontLocks,sideHairRows:sideHair,hairColourSelection:'Exclude original warm skin and saturated ribbon/garment colours from the traced front bands; exclude cool cloth from the broad side bands. Retained RGBA values are copied exactly from the winter-close body.',teaForeground,armForeground,topOriginalRows:268,edgeBlendPixels:3,waistBlendPixels:8,changedPixels:changed,editablePixels:editable,protectedHairPixels:protectedHair,changedBoundsXYXY:bounds,overlap:'The two new hands, forearms and tea ware are in front of the hanging locks. Other visible lock pixels come directly from the game body.'},
    layers:{body:'mother-body.png',localPart:'torso-part-native.png',replacement:'local-replacement-layer.png',expression:'Unmodified assets/chihaya_character/chi00a@.png through chi11a@.png, fixed native offset (120,85)'},
    teaWare:{reference:'ArtSources/CharacterExpansion/native-tea/tea-ware-reference.json',design:'Approved plain white porcelain cup and shallow saucer; image-left hand holds left handle, image-right palm supports saucer.'},
    checks:{nativeCanvas:'passed',alpha:'passed',outsideRGBA:'passed',outsideRGBAMismatches:outsideMismatch,faceRegion:'passed',faceRegionRGBAMismatches:faceMismatch,seams:'pending-visual-review',review:'pending',application:'not-integrated'},
    outputSHA256:hash(path.join(dir,'mother-body.png'))
  };
  fs.writeFileSync(path.join(dir,'production.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({mother:evidence.mother,changedPixels:changed,changedBounds:bounds,outsideMismatch,faceMismatch},null,2));
})();

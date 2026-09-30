// Run with the bundled Node runtime and NODE_PATH from load_workspace_dependencies.
// This only assembles a generated local part; the game head, face opening and
// every RGBA value outside the saved mask are copied without resampling.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { PNG } = require('pngjs');
const dir = __dirname;
const root = path.resolve(dir, '../../../../../..');
const bodyPath = path.join(root, 'assets/chihaya_character/chi_a.png');
const originals = JSON.parse(fs.readFileSync(path.join(root, 'ArtSources/CharacterExpansion/native-tea/originals.json')));
const baseline = originals.variants['a/full'];
const hash = filename => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const crop = { left:24, top:180, width:216, height:192 };
const editPolygon = [[57,190],[79,181],[198,181],[217,206],[228,243],[217,289],[218,334],[204,355],[194,371],[72,371],[63,359],[44,334],[40,294],[31,247],[45,214]];
const inside = (x,y,points) => {
  let value=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const [xi,yi]=points[i], [xj,yj]=points[j];
    if((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) value=!value;
  }
  return value;
};
const edgeDistance = (x,y) => Math.min(...editPolygon.map(([ax,ay],i)=>{
  const [bx,by]=editPolygon[(i+1)%editPolygon.length], dx=bx-ax,dy=by-ay;
  const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));
  return Math.hypot(x-ax-t*dx,y-ay-t*dy);
}));
const save = (name, png) => fs.writeFileSync(path.join(dir,name),PNG.sync.write(png,{colorType:6}));
const blank = (w,h) => new PNG({width:w,height:h});
const relative = filename => path.relative(root,filename).split(path.sep).join('/');

(async()=>{
  if(hash(bodyPath)!==baseline.bodySHA256) throw new Error('Original body hash changed');
  const original=PNG.sync.read(fs.readFileSync(bodyPath));
  const {width:w,height:h}=original;
  if(w!==268||h!==606) throw new Error('Unexpected native canvas');
  const rawPath=path.join(dir,'torso-imagegen-refined.png');
  await sharp(rawPath).resize(crop.width,crop.height,{kernel:'lanczos3'}).ensureAlpha().png().toFile(path.join(dir,'torso-part-native.png'));
  const part=PNG.sync.read(fs.readFileSync(path.join(dir,'torso-part-native.png')));
  const hairSeed=new Uint8Array(w*h),hair=new Uint8Array(w*h);
  // These ranges isolate the existing silver locks from cuffs and bare hands.
  const hairRanges=[[0,180,76,372],[194,180,268,372]];
  for(let y=crop.top;y<crop.top+crop.height;y++) for(let x=0;x<w;x++) {
    if(!hairRanges.some(([x0,y0,x1,y1])=>x>=x0&&x<x1&&y>=y0&&y<y1)) continue;
    const p=(y*w+x)*4,[r,g,b,a]=original.data.subarray(p,p+4);
    const neutralWhite=Math.min(r,g,b)>240&&Math.max(r,g,b)-Math.min(r,g,b)<7;
    if(a>0&&g>=55&&r>=g-3&&g>=b-7&&r-g<=14&&g-b<=14&&!neutralWhite) hairSeed[y*w+x]=1;
  }
  // Recover small enclosed white hair highlights, without capturing the much
  // larger pure-white area of the old raised cuff beside the front lock.
  const visited=new Uint8Array(w*h);
  for(let sy=crop.top;sy<crop.top+crop.height;sy++) for(let sx=0;sx<w;sx++) {
    const start=sy*w+sx;
    if(hairSeed[start]||visited[start]) continue;
    const queue=[start]; visited[start]=1; let exterior=false;
    for(let i=0;i<queue.length;i++) {
      const k=queue[i],x=k%w,y=Math.floor(k/w);
      if(x===0||x===w-1||y===crop.top||y===crop.top+crop.height-1) exterior=true;
      for(const [xx,yy] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) {
        if(xx<0||xx>=w||yy<crop.top||yy>=crop.top+crop.height) continue;
        const next=yy*w+xx;
        if(!hairSeed[next]&&!visited[next]) {visited[next]=1;queue.push(next);}
      }
    }
    if(!exterior&&queue.length<=120) for(const k of queue) hairSeed[k]=1;
  }
  // Include the original antialiased hair edge. Its pixels are also immutable.
  for(let y=crop.top;y<crop.top+crop.height;y++) for(let x=0;x<w;x++) if(hairSeed[y*w+x]) {
    for(let yy=Math.max(crop.top,y-1);yy<=Math.min(h-1,y+1);yy++) for(let xx=Math.max(0,x-1);xx<=Math.min(w-1,x+1);xx++) hair[yy*w+xx]=1;
  }
  // Native front-lock contours, traced separately so the white cuff/bib inside
  // each curl is not mistaken for hair. Row coordinates use original pixels.
  const frontLocks=[
    [[180,74,101],[185,75,103],[190,75,102],[195,76,100],[200,78,99],[205,80,100],[210,83,105],[215,88,108],[220,90,100],[225,92,101],[230,90,100],[235,86,96],[240,82,91],[245,79,87],[250,77,84],[255,77,85],[260,79,89],[265,82,96],[270,87,104],[274,95,102]],
    [[180,103,114],[185,104,116],[190,108,119],[195,110,121],[200,113,123],[205,114,125],[210,115,126],[215,116,126],[220,115,126],[225,114,124],[230,111,120],[235,108,116],[240,104,113],[245,100,109],[250,97,105],[255,94,104],[260,94,107],[265,98,109],[269,104,109]],
    [[180,150,177],[185,151,176],[190,152,171],[195,152,165],[200,153,165],[205,154,166],[210,157,169],[215,160,173],[220,162,175],[225,164,179],[230,167,181],[235,171,184],[240,175,189],[245,179,192],[250,181,194],[255,180,194],[260,177,189],[265,173,183],[270,169,177],[275,167,175],[279,171,178]],
    [[255,189,194],[260,189,194],[265,186,193],[270,183,192],[275,178,189],[279,174,183]]
  ];
  for(const rows of frontLocks) for(let i=0;i<rows.length-1;i++) {
    const [y0,l0,r0]=rows[i],[y1,l1,r1]=rows[i+1];
    for(let y=y0;y<y1;y++) {
      const t=(y-y0)/(y1-y0),left=Math.round(l0+(l1-l0)*t),right=Math.round(r0+(r1-r0)*t);
      for(let x=left;x<=right;x++) {
        const p=(y*w+x)*4,[r,g,b]=original.data.subarray(p,p+3);
        const oldHand=r-b>=36&&r-g>=12&&g-b>=14;
        if(!oldHand) hair[y*w+x]=1;
      }
    }
  }
  // The new fingers, cup and saucer sit in front of the hanging front locks.
  // This removes any old cuff at their shared edge and gives a natural overlap.
  const teaForeground=[[107,237],[162,237],[163,257],[155,266],[176,268],[175,275],[113,279],[99,274],[101,257],[103,241]];
  for(let y=crop.top;y<crop.top+crop.height;y++) for(let x=crop.left;x<crop.left+crop.width;x++) {
    const q=((y-crop.top)*crop.width+(x-crop.left))*4,[r,g,b,a]=part.data.subarray(q,q+4);
    const newHand=a>0&&r>150&&r-b>=18&&r-g>=8&&g-b>=8;
    if(newHand||inside(x+.5,y+.5,teaForeground)) hair[y*w+x]=0;
  }
  const mother=blank(w,h),mask=blank(w,h),hairMask=blank(w,h),replacement=blank(w,h);
  original.data.copy(mother.data);
  let changed=0,editable=0,protectedHair=0,outsideMismatch=0,faceMismatch=0;
  let bounds=[w,h,0,0];
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const p=(y*w+x)*4;
    if(hair[y*w+x]) { hairMask.data.set([255,255,255,255],p); protectedHair++; }
    let weight=0;
    if(y>=194&&y<crop.top+crop.height&&x>=crop.left&&x<crop.left+crop.width&&inside(x+.5,y+.5,editPolygon)&&!hair[y*w+x]) {
      weight=Math.round(255*Math.min(1,edgeDistance(x+.5,y+.5)/3,(371-y)/8));
      weight=Math.max(0,weight);
    }
    if(weight) {
      editable++;
      mask.data.set([255,255,255,weight],p);
      const q=((y-crop.top)*crop.width+(x-crop.left))*4;
      replacement.data.set(part.data.subarray(q,q+4),p);
      for(let c=0;c<4;c++) mother.data[p+c]=Math.round((part.data[q+c]*weight+original.data[p+c]*(255-weight))/255);
      if(!mother.data.subarray(p,p+4).equals(original.data.subarray(p,p+4))) {
        changed++; bounds=[Math.min(bounds[0],x),Math.min(bounds[1],y),Math.max(bounds[2],x+1),Math.max(bounds[3],y+1)];
      }
    }
    if(!weight&&!mother.data.subarray(p,p+4).equals(original.data.subarray(p,p+4))) outsideMismatch++;
    if(x>=79&&x<201&&y>=76&&y<180&&!mother.data.subarray(p,p+4).equals(original.data.subarray(p,p+4))) faceMismatch++;
  }
  if(outsideMismatch||faceMismatch) throw new Error('Native pixel preservation failed');
  for(const [name,png] of [['mother-body.png',mother],['local-edit-mask.png',mask],['original-hair-preservation-mask.png',hairMask],['local-replacement-layer.png',replacement]]) save(name,png);
  const evidence={
    version:1, outfit:'a', view:'full', date:'2026-09-30', timezone:'Asia/Shanghai', status:'pending-review',
    production:'Built-in imagegen draws only the cropped torso part; deterministic native-canvas assembly. No face or complete character was generated.',
    canvas:[w,h], mother:relative(path.join(dir,'mother-body.png')),
    source:{body:baseline.body,sha256:hash(bodyPath),faceOffset:baseline.faceOffset,faceSize:baseline.faceSize,faces:baseline.faces},
    generation:{tool:'built-in imagegen',inputs:['torso-edit-input.png','torso-imagegen-raw.png'],raw:'torso-imagegen-raw.png',refined:'torso-imagegen-refined.png',prompts:['imagegen-prompt.txt','imagegen-refine-prompt.txt'],rawSHA256:hash(path.join(dir,'torso-imagegen-raw.png')),refinedSHA256:hash(rawPath)},
    assembly:{script:'assemble.cjs',crop,editPolygon,mask:'local-edit-mask.png',maskSHA256:hash(path.join(dir,'local-edit-mask.png')),protectedHairMask:'original-hair-preservation-mask.png',frontLockRows:frontLocks,teaForeground,topOriginalRows:194,overlap:'New hands and tea ware occlude hanging locks; the original lock pixels remain unchanged where visible.',edgeBlendPixels:3,waistBlendPixels:8,changedPixels:changed,editablePixels:editable,protectedHairPixels:protectedHair,changedBoundsXYXY:bounds},
    layers:{body:'mother-body.png',localPart:'torso-part-native.png',replacement:'local-replacement-layer.png',expression:'Game face PNGs remain separate and unmodified; the HTML previews them at faceOffset.'},
    teaWare:{design:'plain white porcelain cup and saucer, no decoration',status:'pending-user-review; not yet frozen for other outfits'},
    checks:{nativeCanvas:'passed',alpha:'passed',outsideRGBA:outsideMismatch===0?'passed':'failed',outsideRGBAMismatches:outsideMismatch,faceRegion:faceMismatch===0?'passed':'failed',faceRegionRGBAMismatches:faceMismatch,originalFaceFiles:'source hashes verified by the progress-page builder',hairAndClothingSeams:'pending-visual-review',review:'pending',application:'not-integrated'},
    outputSHA256:hash(path.join(dir,'mother-body.png'))
  };
  fs.writeFileSync(path.join(dir,'production.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({mother:evidence.mother,changedPixels:changed,changedBounds:bounds,outsideMismatch,faceMismatch},null,2));
})();

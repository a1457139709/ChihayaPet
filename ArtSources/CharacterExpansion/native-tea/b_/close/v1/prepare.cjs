// Only a native neck-to-waist crop is provided to imagegen. Game assets stay read-only.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const dir = __dirname;
const root = path.resolve(dir, '../../../../../..');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'ArtSources/CharacterExpansion/native-tea/originals.json'))).variants['b_/close'];
const crop = {left:30, top:252, width:460, height:354};
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
(async () => {
  const body = path.join(root, baseline.body);
  if (hash(body) !== baseline.bodySHA256) throw new Error('Native body source changed');
  await sharp(body).extract(crop).png().toFile(path.join(dir, 'torso-source-native.png'));
  await sharp(path.join(dir, 'torso-source-native.png')).resize(crop.width*3,crop.height*3,{kernel:'nearest'}).png().toFile(path.join(dir,'torso-edit-input.png'));
  fs.writeFileSync(path.join(dir,'crop.json'), JSON.stringify({variant:'b_/close',source:baseline.body,sourceSHA256:hash(body),nativeCanvas:[508,606],crop,inputPreviewScale:3,note:'Only the cropped garment/arm part is sent to imagegen. Original head, face opening and separate expressions are never generated or resampled.'},null,2)+'\n');
  const gridCrop={left:0,top:240,width:508,height:366};
  const grid=await sharp(body).extract(gridCrop).resize(1016,732,{kernel:'nearest'}).flatten({background:'#f3f0ec'}).png().toBuffer();
  let svg='<svg width="1016" height="732" xmlns="http://www.w3.org/2000/svg">';
  for(let x=0;x<508;x+=20)svg+=`<path d="M ${x*2} 0 V 732" stroke="#008b87" stroke-opacity=".3"/><text x="${x*2+2}" y="15" font-size="12" fill="#007b69">${x}</text>`;
  for(let y=240;y<606;y+=20)svg+=`<path d="M 0 ${(y-240)*2} H 732" stroke="#008b87" stroke-opacity=".3"/><text x="2" y="${(y-240)*2+15}" font-size="12" fill="#007b69">${y}</text>`;
  svg+='</svg>';
  await sharp(grid).composite([{input:Buffer.from(svg)}]).png().toFile(path.join(dir,'qa-source-hair-grid.png'));
  console.log(JSON.stringify({crop,input:path.join(dir,'torso-edit-input.png')},null,2));
})();

// Prepare a torso-only edit target. No head, face or complete sprite is generated.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { PNG } = require('pngjs');
const dir = __dirname;
const root = path.resolve(dir, '../../../../../..');
const sources = JSON.parse(fs.readFileSync(path.join(root, 'ArtSources/CharacterExpansion/native-tea/originals.json'))).variants;
const baseline = sources['a_/full'];
const crop = { left:24, top:180, width:216, height:192 };
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
(async () => {
  const body = path.join(root, baseline.body);
  if (hash(body) !== baseline.bodySHA256) throw new Error('Native summer source changed');
  await sharp(body).extract(crop).png().toFile(path.join(dir, 'torso-source-native.png'));
  await sharp(path.join(dir, 'torso-source-native.png')).resize(864, 768, { kernel:'nearest' }).png().toFile(path.join(dir, 'torso-edit-input.png'));
  fs.writeFileSync(path.join(dir, 'crop.json'), JSON.stringify({variant:'a_/full', source:baseline.body, sourceSHA256:hash(body), nativeCanvas:[268,606], crop, inputPreviewScale:4, note:'Only the torso crop is submitted for generation; native head and face opening are immutable.'}, null, 2)+'\n');
  const summer = PNG.sync.read(fs.readFileSync(body));
  const winter = PNG.sync.read(fs.readFileSync(path.join(root, sources['a/full'].body)));
  const winterHair = PNG.sync.read(fs.readFileSync(path.join(root, 'ArtSources/CharacterExpansion/native-tea/a/full/v1/original-hair-preservation-mask.png')));
  let topDifferent=0,hairDifferent=0,hairPixels=0;
  for(let y=0;y<summer.height;y++) for(let x=0;x<summer.width;x++) {
    const p=(y*summer.width+x)*4;
    const different=!summer.data.subarray(p,p+4).equals(winter.data.subarray(p,p+4));
    if(y<180&&different) topDifferent++;
    if(winterHair.data[p+3]) {hairPixels++; if(different) hairDifferent++;}
  }
  console.log(JSON.stringify({crop,input:path.join(dir,'torso-edit-input.png'),comparisonWithWinter:{topDifferent,hairPixels,hairDifferent}},null,2));
})();

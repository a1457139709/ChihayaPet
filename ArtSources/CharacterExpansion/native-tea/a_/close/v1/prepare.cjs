// Prepare only a native torso crop for built-in imagegen. Original assets stay read-only.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const dir = __dirname;
const root = path.resolve(dir, '../../../../../..');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'ArtSources/CharacterExpansion/native-tea/originals.json'))).variants['a_/close'];
const crop = { left:24, top:240, width:392, height:366 };
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
(async () => {
  const body = path.join(root, baseline.body);
  if (hash(body) !== baseline.bodySHA256) throw new Error('Native body source changed');
  await sharp(body).extract(crop).png().toFile(path.join(dir, 'torso-source-native.png'));
  await sharp(path.join(dir, 'torso-source-native.png')).resize(crop.width*3, crop.height*3, { kernel:'nearest' }).png().toFile(path.join(dir, 'torso-edit-input.png'));
  fs.writeFileSync(path.join(dir, 'crop.json'), JSON.stringify({ variant:'a_/close', source:baseline.body, sourceSHA256:hash(body), nativeCanvas:[454,606], crop, inputPreviewScale:3, note:'Only the cropped garment/arm part is sent to imagegen. Preview enlargement does not change the native body, head or face.' }, null, 2)+'\n');
  console.log(JSON.stringify({crop, input:path.join(dir,'torso-edit-input.png')},null,2));
})();

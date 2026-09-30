// Make a head-free torso input; the native game body is never resized or edited.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const sharp = require('sharp');
const root = path.resolve(__dirname, '../../../../../..');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'ArtSources/CharacterExpansion/native-tea/originals.json'))).variants['b/close'];
const crop = { left:64, top:252, width:420, height:354 };
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
(async () => {
  const source = path.join(root, baseline.body);
  if (hash(source) !== baseline.bodySHA256) throw new Error('Original game body changed');
  await sharp(source).extract(crop).png().toFile(path.join(__dirname, 'torso-source-native.png'));
  await sharp(path.join(__dirname, 'torso-source-native.png')).resize(crop.width * 3, crop.height * 3, { kernel:'nearest' }).png().toFile(path.join(__dirname, 'torso-edit-input.png'));
  fs.writeFileSync(path.join(__dirname, 'crop.json'), JSON.stringify({ variant:'b/close', source:baseline.body, sourceSHA256:baseline.bodySHA256, nativeCanvas:[508,606], crop, inputPreviewScale:3, note:'Only the head-free neck-to-waist crop is sent to imagegen. The native head, face opening and original face layers are not generation inputs.' }, null, 2) + '\n');
  console.log(JSON.stringify({ crop, input:path.join(__dirname, 'torso-edit-input.png') }, null, 2));
})();

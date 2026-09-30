// Prepare a headless native crop only; never send a complete character or face to imagegen.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const sharp = require('sharp');
const dir = __dirname, root = path.resolve(dir, '../../../../../..');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'ArtSources/CharacterExpansion/native-tea/originals.json'))).variants['b/full'];
const crop = {left:24, top:180, width:268, height:370};
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
(async () => {
  const source = path.join(root, baseline.body);
  if (hash(source) !== baseline.bodySHA256) throw new Error('Original source changed');
  await sharp(source).extract(crop).png().toFile(path.join(dir, 'torso-source-native.png'));
  await sharp(path.join(dir, 'torso-source-native.png')).resize(crop.width*4, crop.height*4, {kernel:'nearest'}).png().toFile(path.join(dir, 'torso-edit-input.png'));
  fs.writeFileSync(path.join(dir, 'crop.json'), JSON.stringify({variant:'b/full', source:baseline.body, sourceSHA256:hash(source), nativeCanvas:[310,606], crop, inputPreviewScale:4, note:'Only a headless torso crop is sent to imagegen. Native head and original faces remain separate and unmodified.'}, null, 2)+'\n');
  console.log(JSON.stringify({crop, input:path.join(dir,'torso-edit-input.png')},null,2));
})();

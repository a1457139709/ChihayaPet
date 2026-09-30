// Send only the winter torso crop to imagegen; keep the game originals read-only.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const dir = __dirname;
const root = path.resolve(dir, '../../../../../..');
const source = JSON.parse(fs.readFileSync(path.join(root, 'ArtSources/CharacterExpansion/native-tea/originals.json'))).variants['a/close'];
const crop = { left: 24, top: 240, width: 392, height: 366 };
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
(async () => {
  const body = path.join(root, source.body);
  if (hash(body) !== source.bodySHA256) throw new Error('Original winter body changed');
  await sharp(body).extract(crop).png().toFile(path.join(dir, 'torso-source-native.png'));
  await sharp(path.join(dir, 'torso-source-native.png')).resize(crop.width * 3, crop.height * 3, { kernel: 'nearest' }).png().toFile(path.join(dir, 'torso-edit-input.png'));
  fs.writeFileSync(path.join(dir, 'crop.json'), JSON.stringify({
    variant: 'a/close', source: source.body, sourceSHA256: hash(body),
    nativeCanvas: [454, 606], crop, inputPreviewScale: 3,
    note: 'Only this torso crop is generated. Native head, face opening, hair and canvas are never rescaled.'
  }, null, 2) + '\n');
  console.log(JSON.stringify({ crop, input: path.join(dir, 'torso-edit-input.png') }));
})();

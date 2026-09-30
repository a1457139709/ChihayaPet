#!/usr/bin/env python3
"""Import an explicitly supplied reviewed preview. Normal builds use bundled PNGs."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--preview', type=Path, required=True,
                    help='Reviewed preview archive containing manifest.json and its PNGs')
args = parser.parse_args()
source = args.preview.resolve()
target = root / 'ChihayaPet/Resources/CharacterSprites'
if (target / 'manifest.json').exists():
    installed = json.loads((target / 'manifest.json').read_text())
    if installed.get('provenance', {}).get('hairRepair'):
        raise SystemExit('Refusing to replace repaired runtime sprites with the older preview. Preserve and reapply the approved hair repair when importing new artwork.')
from PIL import Image
manifest = json.loads((source / 'manifest.json').read_text())
files = set()
for key, variant in manifest['variants'].items():
    files.add(variant['body'])
    for expression in variant['frames'].values():
        for eye in expression.values():
            files.update(eye.values())
    variant.pop('portrait', None)
    side = key.split('/')[0] in ('b', 'b_')
    close = key.endswith('/close')
    mouth = ([267, 203] if close else [160, 159]) if side else ([224, 209] if close else [133, 160])
    # Extents at the mouth row, including both the source body and overlaid face.
    body = Image.open(source / variant['body']).convert('RGBA')
    face = Image.open(source / variant['frames']['neutral']['open']['closed']).convert('RGBA')
    ox, oy = variant['faceOffset']
    row = mouth[1]
    opaque = []
    for x in range(body.width):
        a = body.getpixel((x, row))[3]
        if 0 <= x - ox < face.width and 0 <= row - oy < face.height:
            a = max(a, face.getpixel((x - ox, row - oy))[3])
        if a >= 230:
            opaque.append(x)
    variant['speech'] = {'mouth': mouth, 'hairLeft': min(opaque), 'hairRight': max(opaque) + 1}
manifest['assetHashes'] = {}
manifest['provenance']['previewManifestSHA256'] = hashlib.sha256((source / 'manifest.json').read_bytes()).hexdigest()
manifest['provenance']['aiSheets'] = [Path(p).name for p in manifest['provenance']['aiSheets']]
manifest['provenance']['prompts'] = 'Prompts retained in the reviewed preview source archive; not required at runtime.'
for name in sorted(files):
    path = source / name
    dest = target / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(path, dest)
    manifest['assetHashes'][name] = hashlib.sha256(path.read_bytes()).hexdigest()
(target / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
assert len(files) == 326
print(f'Packaged {len(files)} images, {sum((target / p).stat().st_size for p in files):,} bytes')

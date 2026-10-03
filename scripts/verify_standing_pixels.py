#!/usr/bin/env python3
"""Optional independent art QA with Pillow/numpy; never modifies source PNGs."""
from pathlib import Path
import hashlib
import json
import math

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RESOURCE = ROOT / 'ChihayaPet/Resources/StandingCharacterSprites'


def verify():
    manifest = json.loads((RESOURCE / 'manifest.json').read_text())
    handoff = json.loads((ROOT / 'docs/reports/issue-31-resource-handoff.json').read_text())
    records = []
    for key, variant in manifest['variants'].items():
        baseline = np.array(Image.open(RESOURCE / variant['results'][0]['path']))
        x, y, width, height = variant['faceRect']
        outside = np.ones(baseline.shape[:2], dtype=bool)
        outside[max(0, math.floor(y)):math.ceil(y + height),
                max(0, math.floor(x)):math.ceil(x + width)] = False
        sources = {r['id']: r for r in handoff['variants'][key]['images']}
        for result in variant['results']:
            path = RESOURCE / result['path']
            source = ROOT / sources[result['id']]['sourcePath']
            data = path.read_bytes()
            assert data == source.read_bytes(), path
            assert hashlib.sha256(data).hexdigest() == result['sha256'], path
            with Image.open(path) as image:
                assert image.mode == 'RGBA' and list(image.size) == variant['canvas'], path
                pixels = np.array(image)
            differences = int(np.count_nonzero(pixels[outside] != baseline[outside]))
            assert differences == 0, (path, differences)
            alpha = pixels[:, :, 3]
            assert np.any(alpha == 0) and np.any(alpha == 255), path
            records.append({'variant': key, 'id': result['id'], 'sha256': result['sha256'],
                            'sourcePath': str(source.relative_to(ROOT)), 'sourceByteDifferences': 0,
                            'outsideFaceRGBADifferences': differences,
                            'transparentPixels': int(np.count_nonzero(alpha == 0)),
                            'partialAlphaPixels': int(np.count_nonzero((alpha > 0) & (alpha < 255))),
                            'opaquePixels': int(np.count_nonzero(alpha == 255)),
                            'review': result['review']['status']})
    assert len(records) == 292
    report = {'imageCount': len(records), 'approvedCount': sum(r['review'] == 'approved' for r in records),
              'status': 'passed',
              'comparison': 'Actual archived PNG bytes and decoded RGBA; all expressions compared outside the native/registered affine face bounds',
              'images': records}
    (ROOT / 'docs/reports/issue-31-pixel-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print('Verified 292 source-identical RGBA PNGs; all fixed body pixels remain identical outside their face bounds.')


if __name__ == '__main__':
    verify()

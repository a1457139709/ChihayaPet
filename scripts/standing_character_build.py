#!/usr/bin/env python3
"""Archive the current review gallery as a self-contained numbered PNG library."""
from pathlib import Path
import argparse
import ast
import hashlib
import json
import re
import shutil
import struct
import zlib

ROOT = Path(__file__).resolve().parent.parent
RESOURCE = Path('ChihayaPet/Resources/StandingCharacterSprites')
GALLERY = Path('ArtSources/CharacterExpansion/original-standing/v2')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def png_size(path):
    """Check PNG chunks, RGBA encoding and decompressed scanline length."""
    data = path.read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', path
    offset, compressed, size = 8, bytearray(), None
    while offset < len(data):
        length = struct.unpack('>I', data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        payload = data[offset + 8:offset + 8 + length]
        crc = data[offset + 8 + length:offset + 12 + length]
        assert len(crc) == 4 and zlib.crc32(kind + payload) == struct.unpack('>I', crc)[0], path
        if kind == b'IHDR':
            width, height, depth, color, compression, filtering, interlace = struct.unpack('>IIBBBBB', payload)
            assert 0 < width <= 16384 and 0 < height <= 16384, path
            assert (depth, color, compression, filtering, interlace) == (8, 6, 0, 0, 0), path
            size = (width, height)
        elif kind == b'IDAT':
            compressed.extend(payload)
        offset += length + 12
        if kind == b'IEND':
            assert offset == len(data), path
            break
    assert size and kind == b'IEND', path
    pixels = zlib.decompress(compressed)
    stride = size[0] * 4 + 1
    assert len(pixels) == stride * size[1] and all(pixels[y * stride] <= 4 for y in range(size[1])), path
    return size


def safe_file(root, relative):
    assert isinstance(relative, str) and relative and '\\' not in relative, relative
    assert all(p and p not in ('.', '..') for p in relative.split('/')), relative
    path = (root / relative).resolve()
    assert path.is_relative_to(root.resolve()), relative
    return path


def mouth_row_span(path, y):
    """Read the visible alpha span at the mouth from an existing RGBA PNG."""
    data = path.read_bytes()
    offset, compressed = 8, bytearray()
    while offset < len(data):
        length = struct.unpack('>I', data[offset:offset + 4])[0]
        kind, payload = data[offset + 4:offset + 8], data[offset + 8:offset + 8 + length]
        if kind == b'IHDR':
            width, height = struct.unpack('>II', payload[:8])
        elif kind == b'IDAT':
            compressed.extend(payload)
        offset += length + 12
    row_index = min(height - 1, max(0, int(y)))
    pixels, stride = zlib.decompress(compressed), width * 4
    previous = bytearray(stride)
    for row in range(row_index + 1):
        start = row * (stride + 1)
        filtering = pixels[start]
        current = bytearray(pixels[start + 1:start + 1 + stride])
        if filtering:
            for x in range(stride):
                left, above = (current[x - 4] if x >= 4 else 0), previous[x]
                corner = previous[x - 4] if x >= 4 else 0
                if filtering == 1:
                    predictor = left
                elif filtering == 2:
                    predictor = above
                elif filtering == 3:
                    predictor = (left + above) // 2
                else:
                    p = left + above - corner
                    distances = [abs(p - left), abs(p - above), abs(p - corner)]
                    predictor = [left, above, corner][distances.index(min(distances))]
                current[x] = (current[x] + predictor) & 255
        previous = current
    visible = [x for x in range(width) if previous[x * 4 + 3] > 0]
    assert visible, f'No visible mouth row: {path}'
    return [min(visible), max(visible) + 1]


def gallery_source(path):
    path = (ROOT / GALLERY / path).resolve()
    assert path.is_relative_to(ROOT), path
    return path


def gallery_catalog():
    page = ROOT / GALLERY / 'review.html'
    html = page.read_text()
    def embedded(identifier):
        return json.loads(re.search(r'<script id="' + identifier + r'"[^>]*>(.*?)</script>', html, re.S)[1])
    originals, additions = embedded('data'), embedded('showcase-data')
    visible = ast.literal_eval(re.search(r'const visibleOutfits=new Set\((\[.*?\])\)', html)[1])
    names = {'loose-long-shirt-experiment-v1': '体检服', 'loose-long-shirt-experiment-v4': '体检服-里'}
    variants = dict(originals['variants'])
    variants.update({k: v for k, v in additions['variants'].items() if v['outfit'] in visible})
    outfits = dict((v['outfit'], names.get(v['outfit'], v['name'])) for v in variants.values())
    assert len(outfits) == 13 and len(variants) == 26
    return variants, outfits, page


def geometry(v, legacy):
    """Retain native coordinates; derived anchors follow their registered affine."""
    framing = v['view']
    paired = f"{v['outfit']}/{framing}" if v['outfit'] in {'a', 'a_', 'b', 'b_', 'c', 'd', 'e'} else f'c/{framing}'
    original = legacy['variants'][paired]
    binding = v.get('faceBinding', {})
    derived = v.get('faceBindingType') == 'derived-game-features' or v['outfit'] == 'loose-long-shirt-experiment-v1' and framing == 'full'
    if derived and not binding:
        binding = json.loads((gallery_source(v['bodyLayer']).parent.parent / 'binding.json').read_text())
    width, height = v['canvas']
    if derived:
        matrix, translation = binding['forwardMatrix'], binding['translation']
        def transform(point):
            return [sum(a * b for a, b in zip(row, point)) + t for row, t in zip(matrix, translation)]
        local = [a - b for a, b in zip(original['speech']['mouth'], original['faceOffset'])]
        mouth = transform(local)
        fw, fh = binding.get('sourceFaceSize', v['originalFaceSize'])
        corners = [transform(p) for p in [(0, 0), (fw, 0), (0, fh), (fw, fh)]]
        left, top = [min(p[i] for p in corners) for i in (0, 1)]
        right, bottom = [max(p[i] for p in corners) for i in (0, 1)]
        face = [left, top, right - left, bottom - top]
    else:
        mouth = original['speech']['mouth']
        face = v['faceOffset'] + v['faceSize']
    # Current poses can move their hair independently of the registered face.
    # Take the silhouette from the saved 00 composite rather than a paired outfit.
    source = gallery_source(next(r['path'] for r in v['results'] if r['id'] == '00'))
    png_size(source)
    hair_left, hair_right = mouth_row_span(source, mouth[1])
    speech = {'mouth': mouth, 'hairLeft': hair_left, 'hairRight': hair_right}
    head = [max(0, face[0] - face[2] * .35), max(0, face[1] - face[3]),
            min(width, face[2] * 1.7), min(height, face[3] * 2)]
    head[2] = min(head[2], width - head[0])
    head[3] = min(head[3], height - head[1])
    return face, head, speech, ('derived-game-features' if derived else 'native-original'), binding


def archive():
    variants, outfits, page = gallery_catalog()
    legacy = json.loads((ROOT / 'ChihayaPet/Resources/CharacterSprites/manifest.json').read_text())
    approval_path = ROOT / 'docs/reports/2026-10-03-issue-31-human-review.json'
    approvals = json.loads(approval_path.read_text()) if approval_path.exists() else {'images': []}
    approved_images = {(r['variant'], r['faceID'], r['sha256']): r for r in approvals['images']}
    manifest = {'version': 1, 'outfits': [{'id': k, 'name': v} for k, v in outfits.items()], 'variants': {},
                'provenance': {'gallerySHA256': sha(page),
                               'approvalLedgerSHA256': sha(approval_path) if approval_path.exists() else None}}
    handoff = {'issue': 31, 'gallery': str(page.relative_to(ROOT)), 'gallerySHA256': sha(page),
               'variants': {}, 'excluded': ['loose-long-shirt (hidden history)', 'mother images', 'independent action references']}
    resource = ROOT / RESOURCE
    for key, v in variants.items():
        face, head, speech, method, binding = geometry(v, legacy)
        results = []
        records = []
        for r in v['results']:
            if not re.fullmatch(r'\d{2}', r['id']):
                continue
            r = dict(r)
            approval = approved_images.get((key, r['id'], r['sha256']))
            if approval and approval['status'] == 'approved':
                r.update(humanReview='approved', reviewedSHA256=r['sha256'],
                         approvalMessage=approval['message'], approvalRecordedAt=approval['recordedAt'],
                         reviewSource=approval['source'], approvalEvidence=str(approval_path.relative_to(ROOT)))
            source = gallery_source(r['path'])
            digest = sha(source)
            assert digest == r['sha256'], f'Changed gallery image: {source}'
            assert png_size(source) == tuple(v['canvas']), source
            approved = (r.get('humanReview') == 'approved' and r.get('reviewedSHA256') == digest
                        and bool(r.get('approvalMessage')) and bool(r.get('approvalRecordedAt')))
            relative = f"sprites/{key}/{r['id']}.png"
            output = resource / relative
            output.parent.mkdir(parents=True, exist_ok=True)
            if not output.exists() or sha(output) != digest:
                shutil.copyfile(source, output)
            results.append({'id': r['id'], 'path': relative, 'sha256': digest,
                            'review': {'status': 'approved' if approved else 'pending',
                                       'sha256': digest if approved else None,
                                       'message': r.get('approvalMessage') if approved else None,
                                       'recordedAt': r.get('approvalRecordedAt') if approved else None}})
            record = dict(r, sourcePath=str(source.relative_to(ROOT)), runtimePath=relative)
            if r.get('faceLayer'):
                record['faceLayerSHA256'] = sha(gallery_source(r['faceLayer']))
            records.append(record)
        results.sort(key=lambda r: r['id'])
        manifest['variants'][key] = {'outfit': v['outfit'], 'framing': v['view'], 'canvas': v['canvas'],
                                     'defaultFaceID': '00', 'faceRect': face, 'headRect': head,
                                     'speech': speech, 'bindingMethod': method,
                                     'automaticMappings': {}, 'results': results}
        handoff['variants'][key] = {'name': outfits[v['outfit']], 'source': v,
                                    'bindingMethod': method, 'binding': binding,
                                    'bodyLayerSHA256': sha(gallery_source(v['bodyLayer'])), 'images': records}
    (resource / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    report = ROOT / 'docs/reports/issue-31-resource-handoff.json'
    report.write_text(json.dumps(handoff, ensure_ascii=False, indent=2) + '\n')
    return validate_standing(ROOT, source_only=True)


def validate_standing(project_root, bundle=None, source_only=False, require_approved=False):
    project_root = Path(project_root)
    source = project_root / RESOURCE
    assert source.is_dir() and not source.is_symlink(), f'Missing numbered standing resources: {source}'
    manifest = json.loads((source / 'manifest.json').read_text())
    assert manifest['version'] == 1
    outfits = {o['id'] for o in manifest['outfits']}
    assert len(outfits) == len(manifest['outfits']) == 13
    assert set(manifest['variants']) == {f'{o}/{f}' for o in outfits for f in ('full', 'close')}
    paths, count, approved = {'manifest.json'}, 0, 0
    for key, v in manifest['variants'].items():
        assert key == f"{v['outfit']}/{v['framing']}" and v['defaultFaceID'] == '00'
        assert v['canvas'][1] == (606 if v['framing'] == 'full' else 670)
        expected_ids = [f'{i:02}' for i in range(7 if v['outfit'] in ('b', 'b_') else 12)]
        assert [r['id'] for r in v['results']] == expected_ids, key
        w, h = v['canvas']
        for rect in (v['faceRect'], v['headRect']):
            x, y, rw, rh = rect
            assert 0 <= x < x + rw <= w and 0 <= y < y + rh <= h, key
        speech = v['speech']; mx, my = speech['mouth']
        assert 0 <= speech['hairLeft'] < mx < speech['hairRight'] <= w and 0 <= my <= h, key
        for r in v['results']:
            path = safe_file(source, r['path'])
            assert r['path'] not in paths, r['path']
            paths.add(r['path'])
            assert sha(path) == r['sha256'], path
            assert png_size(path) == tuple(v['canvas']), path
            review = r['review']
            if review['status'] == 'approved':
                assert review['sha256'] == r['sha256'] and review['message'] and review['recordedAt'], path
                approved += 1
            else:
                assert review['status'] == 'pending', path
            count += 1
        for face_id in v['automaticMappings'].values():
            assert any(r['id'] == face_id and r['review']['status'] == 'approved' for r in v['results']), key
    assert count == 292
    assert {p.relative_to(source).as_posix() for p in source.rglob('*') if p.is_file()} == paths, 'Unexpected standing runtime files'
    if require_approved:
        assert approved == count, f'{count - approved} current PNGs still require explicit human approval'
    if not source_only:
        bundled = Path(bundle or project_root / 'build/ChihayaPet.app') / 'Contents/Resources/StandingCharacterSprites'
        assert {p.relative_to(bundled).as_posix() for p in bundled.rglob('*') if p.is_file()} == paths, 'Standing bundle whitelist mismatch'
        for relative in paths:
            assert sha(bundled / relative) == sha(source / relative), relative
    return f'Validated 13 outfits, 26 views, {count} numbered RGBA PNGs; {approved} approved, {count - approved} pending; exact runtime whitelist and SHA-256.'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', action='store_true')
    args = parser.parse_args()
    print(archive() if args.archive else validate_standing(ROOT, source_only=True))

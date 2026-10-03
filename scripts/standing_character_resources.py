#!/usr/bin/env python3
"""Validate the self-contained numbered PNG library shipped with the app."""
from pathlib import Path
import hashlib
import json
import struct
import zlib

RESOURCE = Path('ChihayaPet/Resources/Characters/Standing')


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
        bundled = Path(bundle or project_root / 'build/ChihayaPet.app') / 'Contents/Resources/Characters/Standing'
        assert {p.relative_to(bundled).as_posix() for p in bundled.rglob('*') if p.is_file()} == paths, 'Standing bundle whitelist mismatch'
        for relative in paths:
            assert sha(bundled / relative) == sha(source / relative), relative
    return f'Validated 13 outfits, 26 views, {count} numbered RGBA PNGs; {approved} approved, {count - approved} pending; exact runtime whitelist and SHA-256.'

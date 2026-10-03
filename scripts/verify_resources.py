#!/usr/bin/env python3
"""Validate all runtime resources; optional preview comparison is import QA only."""
from pathlib import Path
import argparse
import hashlib
import json
import struct

from character_expansion_build import validate_expansion
from standing_character_build import validate_standing

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--source-only', action='store_true')
parser.add_argument('--bundle', type=Path, default=root / 'build/ChihayaPet.app')
parser.add_argument('--preview', type=Path)
parser.add_argument('--repair', type=Path, help='Optionally compare approved hair-repair exports')
parser.add_argument('--require-expansion', action='store_true')
parser.add_argument('--require-approved-standing', action='store_true')
args = parser.parse_args()
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
expected = {
    'chihaya-summer.png': '56a1f650616eb45380c8317cac274c29ae4f276b417250db8c203a60feb4028f',
    'chihaya-winter.png': 'ad3e8465fc3d25fb7dcfc3ecca2006d3578eab795a3ce406985ca5daaeb805d0',
    'fansitekit-notice-original.txt': '42f7ebd87ff6689b50a92ece48039bf191267964e82f5b635b25bf6dfd28021c',
}
for name, digest in expected.items():
    original = root / 'assets' / name
    copied = root / 'ChihayaPet/Resources' / name
    if name.endswith('.png'):
        copied = root / 'ChihayaPet/Resources/Assets.xcassets' / (original.stem + '.imageset') / name
    for path in (original, copied):
        assert sha(path) == digest, f'Resource mismatch: {path}'

source = root / 'ChihayaPet/Resources/CharacterSprites'
m = json.loads((source / 'manifest.json').read_text())
hair_repair = m['provenance'].get('hairRepair')
repaired_assets = hair_repair['assets'] if hair_repair else {}
styles, framings = {'a', 'a_', 'b', 'b_', 'c', 'd', 'e'}, {'full', 'close'}
assert m['version'] == 1
assert set(m['variants']) == {f'{s}/{f}' for s in styles for f in framings}
assert {s['id'] for s in m['styles']} == styles
refs = set()
def dimensions(path):
    data = path.read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', f'Not PNG: {path}'
    return struct.unpack('>II', data[16:24])
for key, v in m['variants'].items():
    assert dimensions(source / v['body']) == (v['width'], v['height']), key
    refs.add(v['body'])
    assert set(v['frames']) == {'neutral', 'serious', 'smile', 'surprised'}, key
    for expression in v['frames'].values():
        assert set(expression) == {'open', 'half', 'closed'}, key
        for eye in expression.values():
            assert set(eye) == {'closed', 'small', 'medium'}, key
            for path in eye.values():
                assert dimensions(source / path) == tuple(v['faceSize']), path
                refs.add(path)
    ox, oy = v['faceOffset']; fw, fh = v['faceSize']
    assert 0 <= ox < ox + fw <= v['width'] and 0 <= oy < oy + fh <= v['height'], key
    speech = v['speech']; mx, my = speech['mouth']
    assert 0 <= speech['hairLeft'] <= mx <= speech['hairRight'] <= v['width'], key
    assert 0 <= my <= v['height'], key
assert refs == set(m['assetHashes']) and len(refs) == 326
assert {p.relative_to(source).as_posix() for p in source.rglob('*') if p.is_file()} == refs | {'manifest.json'}
for path, digest in m['assetHashes'].items():
    assert sha(source / path) == digest, f'Runtime hash mismatch: {path}'
    if args.preview:
        original_digest = repaired_assets[path]['originalSHA256'] if path in repaired_assets else digest
        assert sha(args.preview / path) == original_digest, f'Preview mismatch: {path}'
if hair_repair:
    assert set(repaired_assets) == {m['variants'][f'{s}/close']['body'] for s in styles}, 'Incomplete hair repair'
    archive = root / hair_repair['originalArchive']
    for path, record in repaired_assets.items():
        assert sha(archive / path) == record['originalSHA256'], f'Original backup mismatch: {path}'
        old = record['originalGeometry']; current = m['variants'][record['variant']]
        assert record['originalOffset'] == [0, 64] and current['body'] == path
        assert dimensions(archive / path) == (old['width'], old['height'])
        assert current['width'] == old['width'] and current['height'] == old['height'] + 64
        assert current['faceOffset'] == [old['faceOffset'][0], old['faceOffset'][1] + 64]
        assert current['speech'] == {**old['speech'], 'mouth': [old['speech']['mouth'][0], old['speech']['mouth'][1] + 64]}
        if args.repair:
            assert sha(args.repair / record['repairedAsset']) == m['assetHashes'][path], f'Repair mismatch: {path}'
    if args.repair:
        assert sha(args.repair / 'repair-manifest.json') == hair_repair['repairManifestSHA256'], 'Repair manifest mismatch'
        assert sha(args.repair / 'prompts.json') == hair_repair['promptSetSHA256'], 'Repair prompt mismatch'
elif args.repair:
    raise AssertionError('Hair repair has not been installed')
for name, digest in m['provenance']['sources'].items():
    assert len(digest) == 64 and all(c in '0123456789abcdef' for c in digest), f'Invalid source hash: {name}'
    if args.preview:
        assert sha(root / 'assets/chihaya_character' / name) == digest, f'Source provenance mismatch: {name}'
expansion_summary = validate_expansion(
    root,
    bundle=args.bundle,
    source_only=args.source_only,
    require_expansion=args.require_expansion,
)
standing_summary = validate_standing(root, bundle=args.bundle, source_only=args.source_only,
                                    require_approved=args.require_approved_standing)
if not args.source_only:
    resources = args.bundle / 'Contents/Resources'
    assert resources.is_dir(), f'Bundle missing: {args.bundle}'
    expected_resources = {'Assets.car', 'fansitekit-notice-original.txt', 'CharacterSprites', 'StandingCharacterSprites'}
    if (root / 'ChihayaPet/Resources/CharacterExpansion').is_dir():
        expected_resources.add('CharacterExpansion')
    assert {p.name for p in resources.iterdir()} == expected_resources, 'Unexpected bundled resources'
    assert sha(resources / 'fansitekit-notice-original.txt') == expected['fansitekit-notice-original.txt']
    bundled = resources / 'CharacterSprites'
    assert {p.relative_to(bundled).as_posix() for p in bundled.rglob('*') if p.is_file()} == refs | {'manifest.json'}
    for name in refs | {'manifest.json'}:
        assert sha(bundled / name) == sha(source / name), f'Bundle mismatch: {name}'
print(f'Validated 14 variants, 504 eye/mouth combinations, {len(refs)} PNGs ({sum((source / p).stat().st_size for p in refs):,} bytes), source provenance records and resource whitelist.')
if expansion_summary:
    print(expansion_summary)
print(standing_summary)

#!/usr/bin/env python3
"""Validate numbered runtime images, approvals and the exact bundle whitelist."""
from pathlib import Path
import argparse
import hashlib
import subprocess

from character_expansion_build import validate_expansion
from standing_character_resources import validate_standing

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--source-only', action='store_true')
parser.add_argument('--bundle', type=Path)
parser.add_argument('--require-expansion', action='store_true')
parser.add_argument('--require-approved-standing', action='store_true')
args = parser.parse_args()

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

notice = 'fansitekit-notice-original.txt'
expected_notice = '42f7ebd87ff6689b50a92ece48039bf191267964e82f5b635b25bf6dfd28021c'
assert sha(root / 'ChihayaPet/Resources' / notice) == expected_notice, 'Original resource notice mismatch'

expansion_summary = validate_expansion(root, source_only=True,
                                     require_expansion=args.require_expansion)
standing_summary = validate_standing(root, source_only=True,
                                    require_approved=args.require_approved_standing)
expected_resources = {notice, 'Characters'}
if (root / 'ChihayaPet/Resources/CharacterExpansion').is_dir():
    expected_resources.add('CharacterExpansion')
for resources in [root / 'ChihayaPet/Resources']:
    assert resources.is_dir(), f'Resources missing: {resources}'
    assert {p.name for p in resources.iterdir()} == expected_resources, f'Unexpected resources: {resources}'
    assert {p.name for p in (resources / 'Characters').iterdir()} == {'Standing'}, 'Unexpected character resources'
    assert sha(resources / notice) == expected_notice, f'Notice mismatch: {resources}'

if expansion_summary:
    print(expansion_summary)
print(standing_summary)
print('Validated runtime resource whitelist: numbered Standing PNGs and original notice; no static fallback assets.')
if not args.source_only:
    command = ['node', str(root / 'scripts/verify-package.mjs')]
    if args.bundle: command.append(str(args.bundle))
    subprocess.run(command, cwd=root, check=True)

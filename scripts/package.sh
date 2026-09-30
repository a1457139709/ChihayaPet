#!/bin/bash
# Drag-to-Applications DMG with a marker for safe post-install ejection.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUTPUT="${CHIHAYA_DMG_OUTPUT:-$ROOT/build/ChihayaPet.dmg}"
./scripts/build.sh
WORK="$(mktemp -d "$ROOT/build/dmg.XXXXXX")"
MOUNT="$WORK/mounted"
cleanup() {
    if mount | grep -Fq " on $MOUNT ("; then
        hdiutil detach "$MOUNT" || return
    fi
    rm -rf "$WORK"
}
trap cleanup EXIT
mkdir "$WORK/staging" "$MOUNT"
ditto build/ChihayaPet.app "$WORK/staging/ChihayaPet.app"
ln -s /Applications "$WORK/staging/Applications"
printf 'local.ChihayaPet.installer.v1\n' > "$WORK/staging/.chihaya-installer"

verify_package() {
    python3 scripts/verify_resources.py --bundle "$1/ChihayaPet.app"
    codesign --verify --deep --strict "$1/ChihayaPet.app"
    python3 - "$1" <<'PY'
from pathlib import Path
import os
import sys

root = Path(sys.argv[1])
if (root / '.chihaya-installer').read_text() != 'local.ChihayaPet.installer.v1\n':
    raise SystemExit('Invalid installer marker')
if not (root / 'Applications').is_symlink() or os.readlink(root / 'Applications') != '/Applications':
    raise SystemExit('Invalid Applications shortcut')
# Never follow the Applications shortcut into the user's installed apps.
for directory, folders, files in os.walk(root, followlinks=False):
    if any(name.lower() == 'config.json' for name in folders + files):
        raise SystemExit('config.json must not be packaged')
if (root / 'assets').exists() or (root / 'Music').exists() or (root / '.chihaya-root').exists():
    raise SystemExit('Development or personal data must not be packaged')
print('Verified: no config.json, development assets or personal music in package.')
PY
}

verify_package "$WORK/staging"
hdiutil create -volname ChihayaPet -srcfolder "$WORK/staging" -format UDZO "$WORK/ChihayaPet.dmg"
hdiutil verify "$WORK/ChihayaPet.dmg"
hdiutil attach -readonly -nobrowse -mountpoint "$MOUNT" "$WORK/ChihayaPet.dmg"
verify_package "$MOUNT"
hdiutil detach "$MOUNT"
mv -f "$WORK/ChihayaPet.dmg" "$OUTPUT"
printf 'DMG: %s\n' "$OUTPUT"

#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
cd "$ROOT"
python3 scripts/verify_resources.py --source-only --require-expansion
python3 scripts/generate_project.py
xcodebuild -project ChihayaPet.xcodeproj -scheme ChihayaPet -configuration Release -destination 'platform=macOS,arch=arm64' -derivedDataPath build/DerivedData build
# Replace the generated copy so removed resources cannot survive a previous build.
rm -rf "$ROOT/build/ChihayaPet.app"
ditto build/DerivedData/Build/Products/Release/ChihayaPet.app build/ChihayaPet.app
codesign --verify --deep --strict build/ChihayaPet.app
python3 scripts/verify_resources.py --require-expansion
printf 'Built: %s/build/ChihayaPet.app\n' "$ROOT"

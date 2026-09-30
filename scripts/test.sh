#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
cd "$ROOT"
python3 scripts/generate_project.py
xcodebuild -project ChihayaPet.xcodeproj -scheme ChihayaPet -configuration Debug -destination 'platform=macOS,arch=arm64' -derivedDataPath build/DerivedData test "$@"

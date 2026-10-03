#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="${CHIHAYA_VALIDATOR_BUILD_DIR:-${DERIVED_FILE_DIR:-$ROOT/build/tooling}}"
TOOL="$BUILD_DIR/CharacterExpansionValidator"
MODULE_CACHE="$BUILD_DIR/module-cache"
SOURCES=(
    "$ROOT/ChihayaPet/Desktop/CharacterAppearance.swift"
    "$ROOT/ChihayaPet/Desktop/CharacterInteractionState.swift"
    "$ROOT/ChihayaPet/Desktop/CharacterExpansionResources.swift"
    "$ROOT/scripts/CharacterExpansionValidator.swift"
)

rebuild=false
if [[ ! -x "$TOOL" ]]; then
    rebuild=true
else
    for source in "${SOURCES[@]}"; do
        if [[ "$source" -nt "$TOOL" ]]; then
            rebuild=true
            break
        fi
    done
fi

if [[ "$rebuild" == true ]]; then
    mkdir -p "$BUILD_DIR" "$MODULE_CACHE"
    temporary="$TOOL.tmp.$$"
    trap 'rm -f "$temporary"' EXIT
    export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
    export CLANG_MODULE_CACHE_PATH="$MODULE_CACHE"
    export SWIFT_MODULECACHE_PATH="$MODULE_CACHE"
    xcrun swiftc -parse-as-library -module-cache-path "$MODULE_CACHE" "${SOURCES[@]}" -o "$temporary"
    chmod +x "$temporary"
    mv -f "$temporary" "$TOOL"
    trap - EXIT
fi

exec "$TOOL" "$@"

#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
npm test -- "$@"
python3 -m unittest discover -s scripts -p 'test_*.py'

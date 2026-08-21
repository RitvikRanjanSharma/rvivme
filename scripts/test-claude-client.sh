#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=$(mktemp -d); trap 'rm -rf "$OUT"' EXIT
npx tsc -p scripts/tests/tsconfig.claudeclient.json --outDir "$OUT"
find "$OUT/lib"     -name '*.js' -exec sed -i 's#require("@/lib/#require("./#g' {} + 2>/dev/null || true
find "$OUT/scripts" -name '*.js' -exec sed -i 's#require("@/lib/#require("../../lib/#g' {} +
node "$OUT/scripts/tests/claude-client.test.js"

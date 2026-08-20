#!/usr/bin/env bash
# Run the ai-tasks unit tests. Same arrangement as the sibling runners.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=$(mktemp -d); trap 'rm -rf "$OUT"' EXIT
npx tsc -p scripts/tests/tsconfig.aitasks.json --outDir "$OUT"
find "$OUT/scripts" -name '*.js' -exec sed -i 's#require("@/lib/#require("../../lib/#g' {} +
node "$OUT/scripts/tests/ai-tasks.test.js"

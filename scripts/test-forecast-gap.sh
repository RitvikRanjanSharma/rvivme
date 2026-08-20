#!/usr/bin/env bash
# Run the forecast + content-gap unit tests. Same arrangement as the sibling
# runners: no test framework is installable from this sandbox, so we compile
# with the project's own TypeScript and run the output on plain Node.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=$(mktemp -d); trap 'rm -rf "$OUT"' EXIT
npx tsc -p scripts/tests/tsconfig.forecast.json --outDir "$OUT"
find "$OUT/lib"     -name '*.js' -exec sed -i 's#require("@/lib/#require("./#g' {} + 2>/dev/null || true
find "$OUT/scripts" -name '*.js' -exec sed -i 's#require("@/lib/#require("../../lib/#g' {} +
node "$OUT/scripts/tests/forecast-gap.test.js"

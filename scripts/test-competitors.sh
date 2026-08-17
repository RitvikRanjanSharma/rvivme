#!/usr/bin/env bash
# Run the competitor-compare unit tests.
#
# Same arrangement as test-crawler-view.sh: no test framework is installable
# from this sandbox, so we compile with the TypeScript already in the project
# and run the output on plain Node. The sed step rewrites "@/lib/..." path
# aliases, which tsc type-checks but emits verbatim and Node cannot resolve.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT

npx tsc -p scripts/tests/tsconfig.competitors.json --outDir "$OUT"

find "$OUT/lib"     -name '*.js' -exec sed -i 's#require("@/lib/#require("./#g' {} +
find "$OUT/scripts" -name '*.js' -exec sed -i 's#require("@/lib/#require("../../lib/#g' {} +

node "$OUT/scripts/tests/competitor-compare.test.js"

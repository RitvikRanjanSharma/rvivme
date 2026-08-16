#!/usr/bin/env bash
# Run the ai-crawler-view unit tests.
#
# There is no test framework in this project: the npm registry is unreachable
# from the build sandbox, so vitest/jest cannot be installed. We compile with
# the TypeScript that is already a dependency and run the result on plain Node.
#
# The sed step exists because TypeScript path aliases ("@/lib/...") are a
# compile-time convenience only — tsc type-checks through them but emits them
# verbatim, and Node cannot resolve them at runtime. Rewriting them to relative
# requires in the compiled output is the smallest fix that keeps the source
# consistent with the rest of the codebase.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT

npx tsc -p scripts/tests/tsconfig.json --outDir "$OUT"

# "@/lib/x" -> a path relative to the emitted file's own directory.
# lib/*.js sits at $OUT/lib, the test at $OUT/scripts/tests.
find "$OUT/lib" -name '*.js' -exec sed -i 's#require("@/lib/#require("./#g' {} +
find "$OUT/scripts" -name '*.js' -exec sed -i 's#require("@/lib/#require("../../lib/#g' {} +

node "$OUT/scripts/tests/crawler-view.test.js"

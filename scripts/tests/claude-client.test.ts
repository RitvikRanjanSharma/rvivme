// scripts/tests/claude-client.test.ts
// =============================================================================
// Tests for parseJsonArray in lib/claude-client.ts.
//
// askClaude itself needs a running route to test end-to-end, so what is covered
// here is the parsing half — the part that produced "the suggestion came back
// in a format we couldn't read" for five failures that had nothing to do with
// format. The type system covers the other half: the failure branch of
// ClaudeResult has no `text` field, so the original bug will not compile.
// =============================================================================

import assert from "node:assert";
import { parseJsonArray } from "../../lib/claude-client";

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void) {
  try { fn(); passed++; process.stdout.write("."); }
  catch (e) { failures.push(`${name}\n    ${(e as Error).message}`); process.stdout.write("F"); }
}

test("plain JSON parses", () => {
  const r = parseJsonArray<{ a: number }>('[{"a":1},{"a":2}]');
  assert.ok(r.ok);
  assert.strictEqual(r.ok && r.value.length, 2);
});

test("code fences are stripped", () => {
  // Models wrap JSON in fences roughly as often as not.
  const r = parseJsonArray<number>('```json\n[1,2,3]\n```');
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && r.value, [1, 2, 3]);

  const bare = parseJsonArray<number>('```\n[4]\n```');
  assert.ok(bare.ok, "an unlabelled fence is still a fence");
});

test("an empty string fails with a readable snippet, not a crash", () => {
  // This is the exact input the old code handed to JSON.parse when the proxy
  // had refused the request: String(undefined ?? "") === "".
  const r = parseJsonArray("");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(!r.ok && r.snippet, "(empty)");
});

test("a non-array JSON value is rejected and named", () => {
  // {"error": "..."} parses fine and is not what the caller asked for.
  const r = parseJsonArray('{"error":"nope"}');
  assert.strictEqual(r.ok, false);
  assert.ok(!r.ok && r.snippet.includes("expected an array"));
});

test("prose comes back as a snippet the reader can act on", () => {
  // "We couldn't read it" is a dead end. What it actually said is not.
  const r = parseJsonArray("I'm sorry, I can't help with that request.");
  assert.strictEqual(r.ok, false);
  assert.ok(!r.ok && r.snippet.includes("I'm sorry"));
});

test("the snippet is bounded", () => {
  const r = parseJsonArray("x".repeat(5000));
  assert.strictEqual(r.ok, false);
  assert.ok(!r.ok && r.snippet.length <= 200, "an error message is not a place for 5kB");
});

process.stdout.write("\n\n");
if (failures.length) {
  console.log(`${failures.length} failed, ${passed} passed\n`);
  for (const f of failures) console.log("  ✗ " + f + "\n");
  process.exit(1);
}
console.log(`${passed} passed`);

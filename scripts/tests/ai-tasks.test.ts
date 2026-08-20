// scripts/tests/ai-tasks.test.ts
// =============================================================================
// Tests for lib/ai-tasks.ts. Run with scripts/test-ai-tasks.sh.
//
// These are about refusal and clamping. The hole this module closes was that
// /api/claude accepted `model` and `max_tokens` from the request body, so the
// assertions that matter are the ones proving a caller cannot get more than
// its task allows.
// =============================================================================

import assert from "node:assert";
import {
  TASKS, SONNET, HAIKU, isAiTask, resolveTask, approxTokens,
  MAX_PROMPT_CHARS, type AiTask,
} from "../../lib/ai-tasks";

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void) {
  try { fn(); passed++; process.stdout.write("."); }
  catch (e) { failures.push(`${name}\n    ${(e as Error).message}`); process.stdout.write("F"); }
}

test("an unknown task is refused, not defaulted", () => {
  // Defaulting a typo would quietly bill the most expensive model in the map.
  assert.strictEqual(isAiTask("audit_fix"), true);
  assert.strictEqual(isAiTask("audit_fixx"), false);
  assert.strictEqual(isAiTask("claude-opus-5"), false);
  assert.strictEqual(isAiTask(""), false);
  assert.strictEqual(isAiTask(undefined), false);
  assert.strictEqual(isAiTask(99), false);
});

test("a caller cannot ask for more tokens than its task allows", () => {
  // The original request body accepted max_tokens: 64000.
  const r = resolveTask("summarise", 64_000);
  assert.strictEqual(r.maxTokens, TASKS.summarise.maxTokens);
  assert.ok(r.maxTokens <= 400);
});

test("a caller can ask for fewer", () => {
  assert.strictEqual(resolveTask("audit_fix", 200).maxTokens, 200);
});

test("nonsense budgets fall back to the ceiling rather than to zero", () => {
  for (const bad of [0, -1, NaN, Infinity, undefined]) {
    const r = resolveTask("audit_fix", bad as number | undefined);
    assert.strictEqual(r.maxTokens, TASKS.audit_fix.maxTokens, String(bad));
  }
});

test("a fractional budget is floored, never rounded up", () => {
  assert.strictEqual(resolveTask("audit_fix", 199.9).maxTokens, 199);
});

test("no task can reach an Opus model", () => {
  // Opus is 2.5x Sonnet 5 on input and output. Nothing in this product needs
  // it, and the point of the map is that a caller cannot reach for it.
  for (const [name, spec] of Object.entries(TASKS)) {
    assert.ok(!/opus|fable|mythos/i.test(spec.model), `${name} resolves to ${spec.model}`);
  }
});

test("customer-facing writing runs on Sonnet, mechanical work on Haiku", () => {
  // The split is by what the output is FOR. Anything the customer pastes onto
  // their own site is Sonnet; classification and compression are Haiku.
  const sonnetTasks: AiTask[] = ["audit_fix", "audit_plan", "strategy", "insight", "competitor_names"];
  const haikuTasks:  AiTask[] = ["classify", "summarise", "citation"];
  for (const t of sonnetTasks) assert.strictEqual(TASKS[t].model, SONNET, t);
  for (const t of haikuTasks)  assert.strictEqual(TASKS[t].model, HAIKU, t);
});

test("we are on Sonnet 5, not the pricier 4.6", () => {
  // Sonnet 5 is $2/$10 per MTok against 4.6's $3/$15, for a newer model.
  assert.strictEqual(SONNET, "claude-sonnet-5");
  assert.ok(!SONNET.includes("4-6"));
});

test("every task carries a note explaining the model choice", () => {
  for (const [name, spec] of Object.entries(TASKS)) {
    assert.ok(spec.note.length > 30, `${name} needs a real justification, not a label`);
    assert.ok(spec.maxTokens > 0 && spec.maxTokens <= 2000, `${name} budget looks wrong`);
  }
});

test("the prompt ceiling is enforceable and generous enough for real callers", () => {
  // Every legitimate caller in the codebase sends well under 4k tokens; the
  // cap exists so a bug cannot turn one request into a six-figure bill.
  assert.ok(approxTokens("x".repeat(MAX_PROMPT_CHARS)) > 20_000);
  assert.ok(approxTokens("x".repeat(MAX_PROMPT_CHARS)) < 40_000);
  assert.strictEqual(approxTokens(""), 0);
  assert.strictEqual(approxTokens("abcd"), 1);
});

process.stdout.write("\n\n");
if (failures.length) {
  console.log(`${failures.length} failed, ${passed} passed\n`);
  for (const f of failures) console.log("  ✗ " + f + "\n");
  process.exit(1);
}
console.log(`${passed} passed`);

import test from "node:test";
import assert from "node:assert/strict";
import { validateAction, actionConfig, validRange } from "../src/lib/voting/admin.mjs";
import { validateCondition, conditionSql, claimStatement } from "../src/lib/voting/conditions.mjs";

const condition = { type: "all", rules: [
  { type: "min_distinct_polls", count: 3 },
  { type: "voted_poll", pollId: "food" },
] };

test("admin action kinds are constrained and HTTPS links are validated", () => {
  assert.equal(validateAction("claim", condition), true);
  assert.equal(validateAction("notice", condition), true);
  assert.equal(validateAction("link", condition, { url: "https://example.com/path" }), true);
  assert.equal(validateAction("link", condition, { url: "javascript:alert(1)" }), false);
  assert.equal(validateAction("link", condition, { url: "http://example.com" }), false);
  assert.equal(validateAction("script", condition), false);
  assert.deepEqual(actionConfig("notice", { url: "x" }), {});
  assert.deepEqual(actionConfig("link", { url: "https://example.com/" }), { url: "https://example.com/" });
  // Button wording and confirmation messages.
  assert.equal(validateAction("claim", condition, { claimLabel: "もらう", claimConfirm: "委員が押してください" }), true);
  assert.equal(validateAction("claim", condition, { claimLabel: "x".repeat(31) }), false);
  assert.equal(validateAction("claim", condition, { claimConfirm: 3 }), false);
  assert.deepEqual(actionConfig("claim", { claimLabel: " もらう ", claimConfirm: "委員が押してください", url: "https://x.example/" }),
    { claimLabel: "もらう", claimConfirm: "委員が押してください" });
  assert.deepEqual(actionConfig("link", { url: "https://example.com/", buttonLabel: "地図を見る" }),
    { url: "https://example.com/", buttonLabel: "地図を見る" });
});

test("UTC date range accepts only canonical ISO timestamps", () => {
  assert.equal(validRange("2026-11-13T00:00:00.000Z", "2026-11-16T00:00:00.000Z"), true);
  assert.equal(validRange("2026-11-13", "2026-11-16"), false);
  assert.equal(validRange("2026-11-16T00:00:00.000Z", "2026-11-13T00:00:00.000Z"), false);
});

test("conditions build parameterized SQL, not user code", () => {
  assert.equal(validateCondition(condition), true);
  assert.equal(validateCondition({ type: "all", rules: [] }), false);
  assert.equal(validateCondition({ type: "voted_poll", pollId: "x' OR 1=1" }), false);
  assert.equal(validateCondition({ type: "evil", sql: "DROP TABLE" }), false);
  const sql = conditionSql(condition, "voter");
  assert.ok(sql.sql.includes("COUNT(DISTINCT poll_id)"));
  assert.equal(sql.args.length, 4);
  assert.equal(sql.args[0], "voter");
  const stmt = claimStatement({ id: "prize", condition_json: JSON.stringify(condition) },
    "voter", "2026-11-14T00:00:00.000Z");
  assert.ok(stmt.sql.includes("INSERT INTO action_claims"));
  assert.ok(stmt.sql.includes("ON CONFLICT(action_id, voter_hash) DO NOTHING"));
});


import test from "node:test";
import assert from "node:assert/strict";
import {
  createSession, readSession, hmac, cookieName, getClientIp, canonicalDeviceSignal,
} from "../src/lib/voting/security.mjs";
import { validId, groupPolls, newVoteStatement } from "../src/lib/voting/logic.mjs";
import { tursoHttpUrl, encodeArg, query } from "../src/lib/voting/turso.mjs";

const secret = "this-is-a-long-test-only-secret-123456789";

test("signed cookie is stable, unforgeable and scoped", () => {
  const cookie = createSession(secret);
  const id = readSession(cookie, secret);
  assert.equal(typeof id, "string");
  assert.equal(id.length, 43);
  const [idPart, signature] = cookie.split(".");
  const modified = idPart + "." + (signature[0] === "a" ? "b" : "a") + signature.slice(1);
  assert.equal(readSession(modified, secret), null);
  assert.equal(readSession(cookie, secret + "-other"), null);
  assert.equal(cookieName(true), "__Host-festival-voter");
});

test("HMAC separates identifiers and avoids raw IP storage", () => {
  const ip = hmac(secret, "ip", "203.0.113.1");
  assert.equal(ip.length, 64);
  assert.equal(ip, hmac(secret, "ip", "203.0.113.1"));
  assert.notEqual(ip, hmac(secret, "fingerprint", "203.0.113.1"));
  assert.ok(!ip.includes("203.0.113.1"));
});

test("use provider-owned IP headers, never general forwarded-for", () => {
  const headers = new Headers({
    "x-forwarded-for": "1.2.3.4", "x-vercel-forwarded-for": "203.0.113.2",
    "cf-connecting-ip": "2001:DB8::1",
  });
  assert.equal(getClientIp(headers, false), "2001:db8::1");
  assert.equal(getClientIp(headers, true), "203.0.113.2");
  assert.equal(getClientIp(new Headers({ "x-forwarded-for": "1.2.3.4" }), false), null);
  assert.equal(getClientIp(new Headers({ "x-vercel-forwarded-for": "fake" }), true), null);
  assert.equal(getClientIp(new Headers({ "cf-connecting-ip": "not-an-ip" }), false), null);
});

test("cross-browser device signal ignores User-Agent and orientation but validates size", () => {
  const input = {
    language: "ja-JP", timezone: "Asia/Tokyo", platform: "MacIntel",
    screenWidth: 1440, screenHeight: 900, pixelRatio: 2, touchPoints: 0,
  };
  const first = canonicalDeviceSignal(input);
  assert.equal(first, canonicalDeviceSignal({ ...input, screenWidth: 900, screenHeight: 1440 }));
  assert.equal(canonicalDeviceSignal({ ...input, screenWidth: 0 }), null);
  assert.equal(canonicalDeviceSignal({}), null);
  assert.notEqual(first, canonicalDeviceSignal({ ...input, screenWidth: 1441 }));
  assert.ok(!first.includes("TestBrowser"));
  assert.ok(!first.includes("Chrome") && !first.includes("Safari"));
});

test("poll identifiers are constrained", () => {
  assert.equal(validId("best-booth_2026"), true);
  assert.equal(validId("bad?candidate"), false);
  assert.equal(validId(""), false);
});

test("one atomic statement classifies strict duplicates without follow-up writes", () => {
  const base = { pollId: "poll", candidateId: "c", voterHash: "hash",
    ipHash: "ip", fingerprintHash: "fp", now: "2026-11-13T00:00:00.000Z" };
  const monitor = newVoteStatement({ ...base, matchMode: "monitor" });
  const block = newVoteStatement({ ...base, matchMode: "block" });
  assert.equal(block.sql, monitor.sql);
  assert.equal(block.args.length, monitor.args.length);
  assert.equal(block.args[9], 1);
  assert.equal(monitor.args[9], 0);
  assert.ok(block.sql.includes("RETURNING is_official,signal_match"));
  assert.ok(block.sql.includes("ON CONFLICT(poll_id,voter_hash,candidate_id) DO NOTHING"));
  assert.ok(block.sql.includes("v.is_official=1"));
  assert.ok(block.sql.includes("p.max_votes"));
  assert.ok(!block.sql.includes("condition_votes"));
  assert.equal((block.sql.match(/\\?/g) ?? []).length, block.args.length);
});

test("poll grouping preserves candidate order and vote status", () => {
  const polls = groupPolls([
    { poll_id: "p", title: "Test", description: "", candidate_id: "a", candidate_name: "A" },
    { poll_id: "p", title: "Test", description: "", candidate_id: "b", candidate_name: "B" },
  ], [{ poll_id: "p", candidate_id: "a", is_official: 1 }]);
  assert.equal(polls.length, 1);
  assert.equal(polls[0].candidates.length, 2);
  assert.equal(polls[0].voted, true);
  const blocked = groupPolls([
    { poll_id: "p", title: "Test", description: "", candidate_id: "a", candidate_name: "A", max_votes: 2 },
  ], [{ poll_id: "p", candidate_id: "a", is_official: 0 }]);
  assert.equal(blocked[0].voted, true);
  assert.deepEqual(blocked[0].selectedIds, []);
  assert.deepEqual(blocked[0].conditionIds, ["a"]);
});

test("Hrana encodes parameters and parses database results", async () => {
  assert.equal(tursoHttpUrl("libsql://vote-org.turso.io"), "https://vote-org.turso.io/v3/pipeline");
  assert.deepEqual(encodeArg(3), { type: "integer", value: "3" });
  let body;
  const result = await query("SELECT ?", ["hello"], {
    url: "libsql://vote-org.turso.io", token: "test",
    fetcher: async (_url, init) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({
        results: [
          { type: "ok", response: { type: "execute", result: {
            cols: [{ name: "message" }], rows: [[{ type: "text", value: "hello" }]],
            affected_row_count: 0,
          } } },
        ],
      }), { status: 200 });
    },
  });
  assert.equal(body.requests[0].stmt.args[0].value, "hello");
  assert.deepEqual(result.rows, [{ message: "hello" }]);
  assert.equal(result.rowsAffected, 0);
});

test("multi-vote grouping reports selected candidates and limits", () => {
  const rows = ["a","b","c"].map((id) => ({
    poll_id: "p", title: "Test", description: "", max_votes: 2,
    candidate_id: id, candidate_name: id,
  }));
  const selected = [{ poll_id: "p", candidate_id: "a", is_official: 1 }];
  const result = groupPolls(rows, selected);
  assert.equal(result[0].maxVotes, 2);
  assert.equal(result[0].voted, false);
  assert.deepEqual(result[0].selectedIds, ["a"]);
  selected.push({ poll_id: "p", candidate_id: "c", is_official: 1 });
  assert.equal(groupPolls(rows, selected)[0].voted, true);
});

test("conditional actions validate an explicit and/or rule language", async () => {
  const { validateCondition, conditionSql, claimStatement } =
    await import("../src/lib/voting/conditions.mjs");
  const rule = { type: "all", rules: [
    { type: "min_distinct_polls", count: 3 },
    { type: "any", rules: [
      { type: "voted_poll", pollId: "food" },
      { type: "min_total_votes", count: 5 },
    ] },
  ] };
  assert.equal(validateCondition(rule), true);
  assert.equal(validateCondition({ type: "eval", code: "process.exit()" }), false);
  assert.equal(validateCondition({ type: "voted_poll", pollId: "';DROP TABLE votes;--" }), false);
  assert.equal(validateCondition({ type: "all", rules: [] }), false);
  assert.equal(validateCondition({ type: "min_total_votes", count: -1 }), false);
  const compiled = conditionSql(rule, "voter-key");
  assert.equal(compiled.args.length, 5);
  assert.ok(compiled.sql.includes("COUNT(DISTINCT poll_id)"));
  assert.ok(compiled.sql.includes(" OR "));
  assert.ok(compiled.sql.includes("WITH progress AS MATERIALIZED"));
  assert.equal((compiled.sql.match(/\\?/g) ?? []).length, compiled.args.length);
  const claim = claimStatement({
    id: "prize", condition_json: JSON.stringify(rule),
  }, "voter-key", "f".repeat(32), "2026-11-13T00:00:00.000Z");
  assert.ok(claim.sql.includes("INSERT INTO action_claims"));
  assert.ok(claim.sql.includes("ON CONFLICT(action_id, voter_hash) DO NOTHING"));
});


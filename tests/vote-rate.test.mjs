import test from "node:test";
import assert from "node:assert/strict";
import { voteLimitKeys, checkVoteRate } from "../src/lib/voting/vote-rate.mjs";

const secret = "this-is-a-sufficiently-long-test-only-secret";
const input = { secret, voterHash: "voter-A", ipHash: "network-A", fingerprintHash: "browser-A" };

test("network-browser rate key survives voter cookie rotation but not a different browser", () => {
  const keys = voteLimitKeys(input);
  const rotated = voteLimitKeys({ ...input, voterHash: "voter-B" });
  assert.equal(keys.length, 2);
  assert.equal(keys[0].key, "voter-A");
  assert.equal(keys[1].key, rotated[1].key);
  assert.notEqual(keys[1].key, voteLimitKeys({ ...input, fingerprintHash: "browser-B" })[1].key);
  assert.equal(voteLimitKeys({ ...input, fingerprintHash: null }).length, 1);
  assert.ok(!keys[1].key.includes("network-A"));
});

test("atomic pre-Turnstile limits stop repeated requests even after rotating cookie", async () => {
  const counts = new Map();
  let requests = 0;
  const dbQuery = async (sql, args) => {
    requests++;
    assert.match(sql, /ON CONFLICT/);
    const rows = [];
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i] + ":" + args[i + 1];
      const attempts = (counts.get(key) || 0) + 1;
      counts.set(key, attempts);
      rows.push({ voter_hash: args[i], attempts });
    }
    return { rows };
  };
  let result;
  for (let i = 0; i < 41; i++) {
    result = await checkVoteRate({ ...input, voterHash: "session-" + i, now: 0, dbQuery });
  }
  assert.deepEqual(result, { allowed: false, scope: "network-browser" });
  assert.equal(requests, 41);
});

test("same IP with a different browser signal does not inherit another rate key", () => {
  const first = voteLimitKeys(input)[1].key;
  const second = voteLimitKeys({ ...input, fingerprintHash: "other" })[1].key;
  assert.notEqual(first, second);
});

test("expired rate buckets can be pruned using a range on the primary key", async () => {
  const { pruneRateLimits } = await import("../scripts/prune-db.mjs");
  let command;
  const removed = await pruneRateLimits({ now: 10 * 300000, dbQuery: async (sql, args) => {
    command = { sql, args };
    return { rowsAffected: 5 };
  } });
  assert.equal(removed, 5);
  assert.equal(command.sql, "DELETE FROM vote_request_limits WHERE bucket<?");
  assert.deepEqual(command.args, [8]);
});

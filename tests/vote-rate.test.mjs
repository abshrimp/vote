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
    const count = (args.length / 2);
    assert.match(sql, /WHERE attempts < CASE voter_hash/);
    for (let i = 0; i < count; i += 2) {
      const key = args[i] + ":" + args[i + 1];
      const cap = args[count + i + 1];
      const previous = counts.get(key) || 0;
      if (previous >= cap) continue; // A saturated upsert returns no row.
      const attempts = previous + 1;
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

test("rate-limit counters stop writing after saturation without relaxing block decisions", async t => {
  let DatabaseSync;
  try { ({ DatabaseSync } = await import("node:sqlite")); }
  catch { t.skip("node:sqlite is unavailable"); return; }
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec("CREATE TABLE vote_request_limits(bucket INTEGER NOT NULL, voter_hash TEXT NOT NULL, " +
    "attempts INTEGER NOT NULL CHECK(attempts>=1), PRIMARY KEY(bucket,voter_hash)) WITHOUT ROWID");
  let writes = 0;
  const dbQuery = async (sql, args) => {
    const result = db.prepare(sql).all(...args);
    writes += result.length;
    return { rows: result };
  };
  for (let n = 0; n < 12; n++) {
    assert.deepEqual(await checkVoteRate({ ...input, now: 0, dbQuery }), { allowed: true });
  }
  assert.equal(writes, 24);
  assert.deepEqual(await checkVoteRate({ ...input, now: 0, dbQuery }),
    { allowed: false, scope: "session" });
  assert.equal(writes, 25); // Signal continues to count attempted abuse.
  for (let n = 0; n < 27; n++) {
    await checkVoteRate({ ...input, now: 0, dbQuery });
  }
  assert.equal(writes, 52); // Session 12 + signal 40; both counters saturated.
  for (let n = 0; n < 100; n++) {
    assert.deepEqual(await checkVoteRate({ ...input, now: 0, dbQuery }),
      { allowed: false, scope: "session" });
  }
  assert.equal(writes, 52); // Further abusive attempts cause zero writes.
  assert.deepEqual(db.prepare("SELECT attempts FROM vote_request_limits WHERE voter_hash=?").get(input.voterHash),
    { attempts: 12 });
  const rotated = await checkVoteRate({ ...input, voterHash: "other-session", now: 0, dbQuery });
  assert.deepEqual(rotated, { allowed: false, scope: "network-browser" });
  assert.equal(writes, 53); // The new session is recorded; the shared signal remains blocked.
  assert.deepEqual(await checkVoteRate({ ...input, now: 300000, dbQuery }), { allowed: true });
});

test("a missing RETURNING row is rejected even when only one rate key exists", async () => {
  const oneKey = { ...input, ipHash: null, fingerprintHash: null };
  const dbQuery = async () => ({ rows: [] });
  assert.deepEqual(await checkVoteRate({ ...oneKey, dbQuery }),
    { allowed: false, scope: "session" });
});

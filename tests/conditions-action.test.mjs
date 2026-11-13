import test from "node:test";
import assert from "node:assert/strict";
import { validateCondition, conditionSql } from "../src/lib/voting/conditions.mjs";

test("action status conditions reference only parameterized identifiers", () => {
  const condition = {type:"all",rules:[
    {type:"action_used",actionId:"prize_1"},
    {type:"action_used",actionId:"prize_2"},
  ]};
  assert.equal(validateCondition(condition), true);
  const statement=conditionSql(condition,"voter-hash");
  assert.ok(statement.sql.includes("FROM action_claims"));
  assert.ok(!statement.sql.includes("status = 'used'"));
  assert.deepEqual(statement.args,["voter-hash","prize_1","voter-hash","prize_2"]);
});

test("action condition rejects dangerous identifiers", () => {
  assert.equal(validateCondition({type:"action_used",actionId:"' OR 1=1 --"}),false);
  assert.equal(validateCondition({type:"action_used",actionId:""}),false);
});

test("conditions give the same answers on a real database and use the voter indexes", async t => {
  let DatabaseSync;
  try { ({ DatabaseSync } = await import("node:sqlite")); }
  catch { t.skip("node:sqlite is unavailable"); return; }
  const { readFileSync } = await import("node:fs");
  const { splitStatements } = await import("../scripts/setup-db.mjs");
  const db = new DatabaseSync(":memory:");
  for (const sql of splitStatements(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"))) db.exec(sql);
  db.exec("INSERT INTO polls(id,title,starts_at,ends_at,is_published) VALUES('p1','A','2026-01-01T00:00:00.000Z','2027-01-01T00:00:00.000Z',1),('p2','B','2026-01-01T00:00:00.000Z','2027-01-01T00:00:00.000Z',1)");
  db.exec("INSERT INTO candidates(poll_id,id,name) VALUES('p1','a','A'),('p1','b','B'),('p2','c','C')");
  db.exec("INSERT INTO votes(poll_id,voter_hash,candidate_id) VALUES('p1','me','a'),('p2','other','c')");
  db.exec("INSERT INTO votes(poll_id,voter_hash,candidate_id) VALUES('p1','me','b')");
  const check = (rule, voter = "me") => {
    const { sql, args } = conditionSql(rule, voter);
    return db.prepare("SELECT 1 AS yes WHERE " + sql).all(...args).length === 1;
  };
  assert.equal(check({ type: "min_distinct_polls", count: 1 }), true);
  assert.equal(check({ type: "min_distinct_polls", count: 2 }), false);
  assert.equal(check({ type: "min_total_votes", count: 2 }), true);
  assert.equal(check({ type: "min_total_votes", count: 3 }), false);
  assert.equal(check({ type: "voted_poll", pollId: "p1" }), true);
  assert.equal(check({ type: "voted_poll", pollId: "p2" }), false);
  assert.equal(check({ type: "voted_poll", pollId: "p2" }, "other"), true);
  const { sql, args } = conditionSql({ type: "min_total_votes", count: 1 }, "me");
  const plan = db.prepare("EXPLAIN QUERY PLAN SELECT 1 WHERE " + sql).all(...args).map(r => r.detail).join("\n");
  assert.ok(!/SCAN votes/.test(plan), plan);
});

test("one press records the claim as already used, once per visitor", async t => {
  let DatabaseSync;
  try { ({ DatabaseSync } = await import("node:sqlite")); }
  catch { t.skip("node:sqlite is unavailable"); return; }
  const { readFileSync } = await import("node:fs");
  const { splitStatements } = await import("../scripts/setup-db.mjs");
  const { claimStatement } = await import("../src/lib/voting/conditions.mjs");
  const db = new DatabaseSync(":memory:");
  for (const sql of splitStatements(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"))) db.exec(sql);
  const condition = { type: "all", rules: [{ type: "min_total_votes", count: 1 }] };
  db.exec("INSERT INTO actions(id,title,kind,condition_json,starts_at,ends_at,is_published) VALUES('gift','記念品','claim','" +
    JSON.stringify(condition) + "','2026-01-01T00:00:00.000Z','2027-01-01T00:00:00.000Z',1)");
  db.exec("INSERT INTO polls(id,title,starts_at,ends_at,is_published) VALUES('p','P','2026-01-01T00:00:00.000Z','2027-01-01T00:00:00.000Z',1)");
  db.exec("INSERT INTO candidates(poll_id,id,name) VALUES('p','c','C')");
  const now = "2026-11-21T03:00:00.000Z";
  const press = voter => {
    const { sql, args } = claimStatement({ id: "gift", condition_json: JSON.stringify(condition) }, voter, now);
    return db.prepare(sql).run(...args).changes;
  };
  assert.equal(press("me"), 0); // not eligible before voting
  db.exec("INSERT INTO votes(poll_id,voter_hash,candidate_id) VALUES('p','me','c')");
  assert.equal(press("me"), 1);
  assert.equal(press("me"), 0); // only once
  const row = db.prepare("SELECT redeemed_at FROM action_claims WHERE voter_hash='me'").get();
  assert.equal(row.redeemed_at, now);
  // A cached condition must not authorize a redemption after admin rule changes.
  db.exec("INSERT INTO votes(poll_id,voter_hash,candidate_id) VALUES('p','other','c')");
  db.prepare("UPDATE actions SET condition_json=? WHERE id='gift'").run(
    JSON.stringify({ type: "min_total_votes", count: 2 }),
  );
  assert.equal(press("other"), 0);
});

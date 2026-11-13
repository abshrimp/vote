import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { splitStatements } from "../scripts/setup-db.mjs";
import { resetStatements } from "../src/lib/voting/reset.mjs";
import { deletePollStatements, deleteActionStatements } from "../src/lib/voting/delete-statements.mjs";

test("reset avoids counter-update amplification without changing any results", async t => {
  let DatabaseSync;
  try { ({ DatabaseSync } = await import("node:sqlite")); }
  catch { t.skip("node:sqlite is unavailable"); return; }
  const schema = splitStatements(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  const setup = () => {
    const db = new DatabaseSync(":memory:");
    for (const statement of schema) db.exec(statement);
    db.exec("INSERT INTO polls(id,title,starts_at,ends_at) VALUES " +
      "('p','Poll','2026-01-01T00:00:00.000Z','2027-01-01T00:00:00.000Z')");
    db.exec("INSERT INTO candidates(poll_id,id,name) VALUES('p','a','A'),('p','b','B')");
    db.exec("INSERT INTO votes(poll_id,voter_hash,candidate_id) VALUES " +
      "('p','v1','a'),('p','v2','a'),('p','v3','a'),('p','v4','b')");
    db.exec("INSERT INTO actions(id,title,kind,condition_json,starts_at,ends_at) VALUES " +
      "('reward','Gift','claim','{\"type\":\"min_total_votes\",\"count\":1}'," +
      "'2026-01-01T00:00:00.000Z','2027-01-01T00:00:00.000Z')");
    db.exec("INSERT INTO action_claims(action_id,voter_hash) VALUES('reward','v1'),('reward','v2')");
    db.exec("INSERT INTO vote_request_limits(bucket,voter_hash,attempts) VALUES (1,'v1',4),(1,'v2',3)");
    return db;
  };
  const old = setup(), optimized = setup();
  t.after(() => { old.close(); optimized.close(); });
  const base = db => Number(db.prepare("SELECT total_changes() AS n").get().n);
  const run = (db, statements) => {
    const before = base(db);
    db.exec("BEGIN");
    for (const { sql } of statements) db.exec(sql);
    db.exec("COMMIT");
    return base(db) - before;
  };
  const formerWrites = run(old, [
    {sql:"DELETE FROM votes"}, {sql:"DELETE FROM vote_request_limits"},
    {sql:"DELETE FROM action_claims"},
  ]);
  const optimizedWrites = run(optimized, resetStatements());
  assert.ok(optimizedWrites < formerWrites, `${optimizedWrites} < ${formerWrites}`);
  for (const table of ["votes", "candidate_totals", "vote_request_limits", "action_claims", "action_totals"]) {
    assert.equal(optimized.prepare("SELECT COUNT(*) AS count FROM " + table).get().count, 0);
  }
  assert.equal(optimized.prepare("SELECT COUNT(*) AS count FROM candidates").get().count, 2);
  assert.equal(optimized.prepare("SELECT COUNT(*) AS count FROM actions").get().count, 1);
  // Triggers must remain active after the reset and rebuild exact totals.
  optimized.exec("INSERT INTO votes(poll_id,voter_hash,candidate_id) VALUES('p','fresh','a')");
  optimized.exec("INSERT INTO action_claims(action_id,voter_hash) VALUES('reward','fresh')");
  assert.equal(optimized.prepare("SELECT total FROM candidate_totals").get().total, 1);
  assert.equal(optimized.prepare("SELECT total FROM action_totals").get().total, 1);
});

test("poll/action deletion leaves other data intact and clears counters first", async t => {
  let DatabaseSync;
  try { ({ DatabaseSync } = await import("node:sqlite")); }
  catch { t.skip("node:sqlite is unavailable"); return; }
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const schema = splitStatements(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  for (const statement of schema) db.exec(statement);
  db.exec("INSERT INTO polls(id,title,starts_at,ends_at) VALUES " +
    "('remove','Old','2026-01-01T00:00:00.000Z','2027-01-01T00:00:00.000Z')," +
    "('keep','Other','2026-01-01T00:00:00.000Z','2027-01-01T00:00:00.000Z')");
  db.exec("INSERT INTO candidates(poll_id,id,name) VALUES " +
    "('remove','a','A'),('keep','b','B')");
  db.exec("INSERT INTO votes(poll_id,voter_hash,candidate_id) VALUES " +
    "('remove','v1','a'),('remove','v2','a'),('keep','v1','b')");
  db.exec("INSERT INTO actions(id,title,kind,condition_json,starts_at,ends_at) VALUES " +
    "('remove_action','X','claim','{\"type\":\"min_total_votes\",\"count\":1}'," +
    "'2026-01-01T00:00:00.000Z','2027-01-01T00:00:00.000Z')," +
    "('keep_action','Y','claim','{\"type\":\"min_total_votes\",\"count\":1}'," +
    "'2026-01-01T00:00:00.000Z','2027-01-01T00:00:00.000Z')");
  db.exec("INSERT INTO action_claims(action_id,voter_hash) VALUES " +
    "('remove_action','v1'),('remove_action','v2'),('keep_action','v1')");
  const execute = actions => {
    db.exec("BEGIN");
    for (const { sql, args } of actions) db.prepare(sql).run(...args);
    db.exec("COMMIT");
  };
  execute(deletePollStatements("remove"));
  execute(deleteActionStatements("remove_action"));
  for (const [table, where] of [
    ["polls", "id='remove'"], ["candidates", "poll_id='remove'"],
    ["votes", "poll_id='remove'"], ["candidate_totals", "poll_id='remove'"],
    ["actions", "id='remove_action'"], ["action_claims", "action_id='remove_action'"],
    ["action_totals", "action_id='remove_action'"],
  ]) assert.equal(db.prepare("SELECT COUNT(*) AS count FROM " + table + " WHERE " + where).get().count, 0);
  assert.equal(db.prepare("SELECT total FROM candidate_totals WHERE poll_id='keep'").get().total, 1);
  assert.equal(db.prepare("SELECT total FROM action_totals WHERE action_id='keep_action'").get().total, 1);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { splitStatements } from "../scripts/setup-db.mjs";
import { updatePollStatement } from "../src/lib/voting/admin-update.mjs";

test("poll editing avoids aggregation unless lowering the limit and never lowers below actual votes", async t => {
  let DatabaseSync;
  try { ({ DatabaseSync } = await import("node:sqlite")); }
  catch { t.skip("node:sqlite is unavailable"); return; }
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  for (const statement of splitStatements(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"))) {
    db.exec(statement);
  }
  db.exec("INSERT INTO polls(id,title,max_votes,starts_at,ends_at) " +
    "VALUES('p','Before',3,'2026-01-01T00:00:00.000Z','2027-01-01T00:00:00.000Z')");
  db.exec("INSERT INTO candidates(poll_id,id,name) VALUES('p','a','A'),('p','b','B')");
  db.exec("INSERT INTO votes(poll_id,voter_hash,candidate_id) VALUES('p','voter','a'),('p','voter','b')");

  const params = { id: "p", title: "After", description: "", maxVotes: 3,
    startsAt: "2026-01-01T00:00:00.000Z", endsAt: "2027-01-01T00:00:00.000Z", isPublished: 1 };
  const update = (override = {}) => {
    const { sql, args } = updatePollStatement({ ...params, ...override });
    return db.prepare(sql).all(...args);
  };
  assert.equal(update().length, 1); // unchanged limit: no aggregation is needed.
  assert.equal(update({ maxVotes: 4 }).length, 1);
  assert.equal(update({ maxVotes: 2 }).length, 1); // reducing to the actual count is safe.
  assert.equal(update({ maxVotes: 1 }).length, 0); // cannot invalidate existing votes.
  assert.equal(db.prepare("SELECT max_votes FROM polls WHERE id='p'").get().max_votes, 2);
  assert.equal(update({ id: "unknown" }).length, 0);

  const { sql, args } = updatePollStatement(params);
  const plan = db.prepare("EXPLAIN QUERY PLAN " + sql).all(...args)
    .map(row => row.detail).join("\n");
  assert.match(plan, /SEARCH polls USING PRIMARY KEY/);
  assert.match(plan, /SEARCH votes USING PRIMARY KEY/);
});

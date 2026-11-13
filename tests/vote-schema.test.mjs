import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { splitStatements } from "../scripts/setup-db.mjs";
import { newVoteStatement } from "../src/lib/voting/logic.mjs";

function seededDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  const schema=readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
  for (const sql of splitStatements(schema)) db.exec(sql);
  db.exec("INSERT INTO polls(id,title,starts_at,ends_at,is_published,max_votes) " +
    "VALUES('p','Example','2026-11-01T00:00:00.000Z','2026-11-30T00:00:00.000Z',1,2)");
  db.exec("INSERT INTO candidates(poll_id,id,name) VALUES('p','a','A'),('p','b','B'),('p','c','C')");
  return db;
}
const now="2026-11-13T00:00:00.000Z";
function cast(db, voterHash, candidateId, ipHash="ip", fingerprintHash="fp", matchMode="block") {
  const {sql,args}=newVoteStatement({pollId:"p",candidateId,voterHash,ipHash,fingerprintHash,now,matchMode});
  const row=db.prepare(sql).get(...args);
  return row ? { official: Number(row.is_official), matched: Number(row.signal_match) } : null;
}

test("one INSERT RETURNING distinguishes official votes from condition-only progress", () => {
  const db=seededDb();
  assert.deepEqual(cast(db,"alice","a"),{official:1,matched:0});
  assert.deepEqual(cast(db,"alice","b"),{official:1,matched:0});
  assert.equal(cast(db,"alice","b"),null);
  assert.equal(cast(db,"alice","c"),null);
  assert.deepEqual(cast(db,"bob","a"),{official:0,matched:1});
  assert.equal(cast(db,"bob","b"),null); // locked after a collision
  assert.equal(cast(db,"bob","a","ip","different"),null);
  assert.deepEqual(cast(db,"carol","c","ip","different"),{official:1,matched:0});
  assert.deepEqual(cast(db,"dora","a","ip","fp","monitor"),{official:1,matched:1});
  const records=db.prepare(
    "SELECT voter_hash,candidate_id,is_official,signal_match FROM votes ORDER BY voter_hash,candidate_id"
  ).all();
  assert.deepEqual(records.map(row=>row.voter_hash+":"+row.candidate_id+":"+row.is_official),
    ["alice:a:1","alice:b:1","bob:a:0","carol:c:1","dora:a:1"]);
  assert.deepEqual(db.prepare("SELECT candidate_id,total FROM candidate_totals ORDER BY candidate_id").all()
    .map(row=>[row.candidate_id,row.total]),[["a",2],["b",1],["c",1]]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM votes WHERE signal_match=1").get().n,2);
  db.exec("DELETE FROM votes");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM candidate_totals").get().n,0);
  db.close();
});

test("visitor progress, signal matching, and candidate order use covering indexes", () => {
  const db=seededDb();
  const plan=(sql,args)=>db.prepare("EXPLAIN QUERY PLAN "+sql).all(...args).map(row=>row.detail).join(" ");
  assert.match(plan("SELECT candidate_id,is_official FROM votes WHERE voter_hash=?",["alice"]),/votes_voter/);
  assert.match(plan("SELECT 1 FROM votes WHERE poll_id=? AND is_official=1 AND ip_hash=? AND fingerprint_hash=? AND voter_hash<>?",
    ["p","ip","fp","new"]),/votes_signal_match/);
  assert.match(plan("SELECT poll_id,COUNT(*) FROM votes WHERE signal_match=1 GROUP BY poll_id",[]),/votes_flagged/);
  assert.match(plan("SELECT id FROM candidates WHERE poll_id=? ORDER BY sort_order,id",["p"]),/candidates_order/);
  db.close();
});

test("schema enforces foreign keys and one claim per voter", () => {
  const db=seededDb();
  assert.throws(()=>db.exec("INSERT INTO votes(poll_id,voter_hash,candidate_id) VALUES('p','any','missing')"),/FOREIGN KEY/);
  db.exec("INSERT INTO actions(id,title,kind,condition_json,starts_at,ends_at,is_published) VALUES("+
    "'reward','Gift','claim','{}','2026-11-01T00:00:00.000Z','2026-11-30T00:00:00.000Z',1)");
  db.exec("INSERT INTO action_claims(action_id,voter_hash) VALUES('reward','alice')");
  assert.equal(db.prepare("SELECT total FROM action_totals WHERE action_id='reward'").get().total,1);
  assert.throws(()=>db.exec("INSERT INTO action_claims(action_id,voter_hash) VALUES('reward','alice')"),/UNIQUE/);
  db.close();
});

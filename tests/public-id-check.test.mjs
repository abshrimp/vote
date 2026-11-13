import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { splitStatements } from "../scripts/setup-db.mjs";
import { publicIdCheckPlan, projectPublicIds } from "../src/lib/voting/public-id-check.mjs";
import { findPublicIdConflict } from "../src/lib/voting/links.mjs";

test("single candidate alias edits use an indexed poll-scoped read instead of all candidates", async t => {
  let DatabaseSync;
  try { ({ DatabaseSync } = await import("node:sqlite")); }
  catch { t.skip("node:sqlite is unavailable"); return; }
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
  for (const sql of splitStatements(schema)) db.exec(sql);
  const addPoll = db.prepare("INSERT INTO polls(id,public_id,title,starts_at,ends_at) VALUES(?,?,?,'2026-01-01T00:00:00.000Z','2027-01-01T00:00:00.000Z')");
  const addCandidate = db.prepare("INSERT INTO candidates(poll_id,id,name,public_id) VALUES(?,?,?,?)");
  for (let p = 0, number = 0; p < 5; p++) {
    const poll = "p" + p;
    addPoll.run(poll, "poll_" + p, poll);
    for (let i = 0; i < (p === 0 ? 40 : 39); i++) {
      const id = "c" + number++;
      addCandidate.run(poll, id, id, String(i + 1).padStart(3, "0"));
    }
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM candidates").get().n, 196);
  const allPolls = db.prepare("SELECT id,public_id FROM polls").all();
  const allCandidates = db.prepare("SELECT poll_id,id,public_id FROM candidates").all();

  const evaluate = ops => {
    const plan = publicIdCheckPlan(ops);
    if (plan?.skip) return { plan, conflict: null, candidateRows: 0 };
    const [polls, candidates] = (plan?.statements ?? [
      { sql: "SELECT id,public_id FROM polls" },
      { sql: "SELECT poll_id,id,public_id FROM candidates" },
    ]).map(({ sql, args = [] }) => db.prepare(sql).all(...args));
    const projected = projectPublicIds(polls, candidates, ops);
    return { plan, conflict: findPublicIdConflict(projected.polls, projected.candidates),
      candidateRows: candidates.length };
  };
  const candidate = (publicId, pollId = "p0", candidateId = "c0") =>
    [{ type: "public_id", pollId, candidateId, publicId }];

  for (const [value, expected] of [
    ["fresh", null],
    ["002", "同じ部門"],
    ["poll_4", "部門の公開ID"],
    ["c12", "内部ID"],
    ["041", null], // Candidate alias from another poll is allowed.
  ]) {
    const ops = candidate(value);
    const scoped = evaluate(ops);
    const full = projectPublicIds(allPolls, allCandidates, ops);
    const fullConflict = findPublicIdConflict(full.polls, full.candidates);
    assert.equal(scoped.conflict, fullConflict, value);
    if (expected) assert.match(scoped.conflict, new RegExp(expected));
    else assert.equal(scoped.conflict, null);
    assert.equal(scoped.candidateRows, 40);
  }
  const plan = publicIdCheckPlan(candidate("new-id"));
  assert.match(db.prepare("EXPLAIN QUERY PLAN " + plan.statements[1].sql)
    .all(...plan.statements[1].args).map(r => r.detail).join("\n"),
  /SEARCH candidates USING PRIMARY KEY/);

  assert.equal(evaluate(candidate(null)).candidateRows, 0);
  assert.equal(evaluate(candidate(null)).plan.skip, true);
  assert.equal(publicIdCheckPlan(candidate("a,b")), null);
  assert.equal(publicIdCheckPlan([...candidate("a"), ...candidate("b", "p1", "c40")]), null);

  const deletedAliasOps = [
    { type: "candidate_delete", pollId: "p0", ids: ["c0"] },
    { type: "public_id", pollId: "p0", candidateId: "c1", publicId: "001" },
  ];
  assert.equal(publicIdCheckPlan(deletedAliasOps), null);
  assert.equal(evaluate(deletedAliasOps).conflict, null);
  const projectedDeletion = projectPublicIds(allPolls, allCandidates, deletedAliasOps);
  assert.equal(projectedDeletion.candidates.some(row => row.poll_id === "p0" && row.id === "c0"), false);
  assert.equal(projectedDeletion.candidates.find(row => row.poll_id === "p0" && row.id === "c1").public_id, "001");

  // A candidate alias must not equal any internal candidate ID globally.
  // That global invariant is enforced atomically by the canonical trigger.
  assert.throws(() => db.exec("UPDATE candidates SET public_id='c40' WHERE poll_id='p0' AND id='c0'"), /conflict/i);

  const pollOps = [{ type: "public_id", pollId: "p0", candidateId: null, publicId: "001" }];
  assert.equal(evaluate(pollOps).candidateRows, 5);
  assert.match(evaluate(pollOps).conflict, /部門の公開ID/);
  assert.equal(evaluate([{ ...pollOps[0], publicId: "fresh-poll" }]).conflict, null);
});

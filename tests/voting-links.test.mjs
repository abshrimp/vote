import test from "node:test";
import assert from "node:assert/strict";
import { validPublicId, resolveTarget, resolveTargets, normalizePublicIds, findPublicIdConflict } from "../src/lib/voting/links.mjs";

test("public IDs resolve directly from poll and candidate columns", () => {
  const polls = [{ id: "p1", publicId: "food", candidates: [
    { id: "c1", publicId: "takoyaki" }, { id: "c2", publicId: null },
  ] }];
  assert.equal(validPublicId("food-booth_03"), true);
  assert.equal(validPublicId("../admin"), false);
  assert.equal(validPublicId("vote-categories:飲食"), true);
  assert.equal(validPublicId("飲食・屋台"), false);
  assert.equal(validPublicId("001"), true);
  assert.deepEqual(resolveTarget("takoyaki", polls), { pollId: "p1", candidateId: "c1" });
  assert.deepEqual(resolveTarget("food", polls), { pollId: "p1", candidateId: null });
  assert.deepEqual(resolveTarget("c2", polls), { pollId: "p1", candidateId: "c2" });
  assert.equal(resolveTarget("unknown", polls), null);
});

test("Hrana batch guards each step and rolls back on failure", async () => {
  const { transaction } = await import("../src/lib/voting/turso.mjs");
  let request;
  await transaction([{ sql: "UPDATE candidates SET name=? WHERE id=?", args: ["A", "one"] }], {
    url: "libsql://example.turso.io", token: "test",
    fetcher: async (_url, init) => {
      request = JSON.parse(init.body);
      return new Response(JSON.stringify({
        results: [{ type: "ok", response: { type: "batch", result: {
          step_results: [{}, {}, {}, null], step_errors: [null, null, null, null],
        } } }],
      }), { status: 200 });
    },
  });
  const steps = request.requests[0].batch.steps;
  assert.equal(steps[0].stmt.sql, "BEGIN");
  assert.equal(steps[1].condition.step, 0);
  assert.equal(steps[2].stmt.sql, "COMMIT");
  assert.equal(steps[3].stmt.sql, "ROLLBACK");
});

test("candidate IDs may repeat across departments; ?category= narrows the target", () => {
  const polls = [
    { id: "p1", publicId: "food", candidates: [{ id: "c1", publicId: "club" }, { id: "c2", publicId: null }] },
    { id: "p2", publicId: "stage", candidates: [{ id: "d1", publicId: "club" }] },
  ];
  assert.deepEqual(resolveTargets("club", polls), [
    { pollId: "p1", candidateId: "c1" }, { pollId: "p2", candidateId: "d1" },
  ]);
  assert.deepEqual(resolveTargets("club", polls, "stage"), [{ pollId: "p2", candidateId: "d1" }]);
  assert.deepEqual(resolveTargets("club", polls, "p1"), [{ pollId: "p1", candidateId: "c1" }]);
  assert.deepEqual(resolveTargets("club", polls, "unknown"), []);
  assert.deepEqual(resolveTargets("food", polls), [{ pollId: "p1", candidateId: null }]);
  assert.deepEqual(resolveTargets("nothing", polls, "food"), []);
  assert.deepEqual(resolveTargets("unknown", polls), []);
  assert.deepEqual(resolveTargets("club", polls, "../stage"), []);
  assert.deepEqual(resolveTargets("notfound", polls, "stage"), []);
});

test("fresh schema permits shared candidate IDs across departments but protects conflicts", async t => {
  let DatabaseSync;
  try { ({ DatabaseSync } = await import("node:sqlite")); }
  catch { t.skip("node:sqlite is unavailable"); return; }
  const { readFileSync } = await import("node:fs");
  const { splitStatements } = await import("../scripts/setup-db.mjs");
  const db = new DatabaseSync(":memory:");
  const source = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
  for (const sql of splitStatements(source)) db.exec(sql);
  db.exec("INSERT INTO polls(id,public_id,title,starts_at,ends_at) VALUES " +
    "('p1','food','Food','2026-11-01T00:00:00.000Z','2026-11-30T00:00:00.000Z')," +
    "('p2','stage','Stage','2026-11-01T00:00:00.000Z','2026-11-30T00:00:00.000Z')");
  db.exec("INSERT INTO candidates(poll_id,id,public_id,name) VALUES " +
    "('p1','c1','club','A'),('p1','c2',NULL,'B'),('p2','d1','club','C')");
  assert.throws(() => db.exec("UPDATE candidates SET public_id='club' WHERE poll_id='p1' AND id='c2'"), /conflict|UNIQUE/i);
  assert.throws(() => db.exec("INSERT INTO candidates(poll_id,id,public_id,name) VALUES('p2','d2','food','D')"), /conflict/i);
  assert.throws(() => db.exec("UPDATE polls SET public_id='stage' WHERE id='p1'"), /conflict/i);
  assert.throws(() => db.exec("UPDATE polls SET public_id='club' WHERE id='p1'"), /conflict/i);
  db.exec("UPDATE candidates SET public_id='solo' WHERE poll_id='p1' AND id='c2'");
  db.close();
});

test("public ID fields accept comma-separated lists", () => {
  assert.equal(normalizePublicIds(" yakisoba, noodle ,yakisoba"), "yakisoba,noodle");
  assert.equal(normalizePublicIds("a、b"), "a,b");
  assert.equal(normalizePublicIds("vote-categories:飲食,stage:演奏"), "vote-categories:飲食,stage:演奏");
  assert.equal(normalizePublicIds(""), null);
  assert.equal(normalizePublicIds("ok,../bad"), undefined);
  const polls = [
    { id: "p1", publicId: "food,yatai", candidates: [{ id: "c1", publicId: "club,band" }] },
    { id: "p2", publicId: "stage", candidates: [{ id: "d1", publicId: "band" }] },
  ];
  assert.deepEqual(resolveTargets("yatai", polls), [{ pollId: "p1", candidateId: null }]);
  assert.deepEqual(resolveTargets("club", polls), [{ pollId: "p1", candidateId: "c1" }]);
  assert.equal(resolveTargets("band", polls).length, 2);
  assert.deepEqual(resolveTargets("band", polls, "yatai"), [{ pollId: "p1", candidateId: "c1" }]);
  const localized = [{ id: "p3", publicId: "vote-categories:飲食", candidates: [{ id: "c3", publicId: "001" }] }];
  assert.deepEqual(resolveTargets("001", localized, "vote-categories:飲食"), [{ pollId: "p3", candidateId: "c3" }]);
  assert.deepEqual(resolveTargets("vote-categories:飲食", localized), [{ pollId: "p3", candidateId: null }]);
  const rows = [{ id: "p1", public_id: "food,yatai" }, { id: "p2", public_id: "stage" }];
  const cands = [{ poll_id: "p1", id: "c1", public_id: "club,band" }, { poll_id: "p2", id: "d1", public_id: "band" }];
  assert.equal(findPublicIdConflict(rows, cands), null);
  assert.match(findPublicIdConflict([...rows, { id: "p3", public_id: "x,yatai" }], cands), /部門の公開ID「yatai」/);
  assert.match(findPublicIdConflict(rows, [...cands, { poll_id: "p1", id: "c2", public_id: "band" }]), /同じ部門/);
  assert.match(findPublicIdConflict(rows, [...cands, { poll_id: "p2", id: "d2", public_id: "food" }]), /部門の公開ID/);
  assert.match(findPublicIdConflict(rows, [...cands, { poll_id: "p2", id: "d3", public_id: "c1" }]), /内部ID/);
});

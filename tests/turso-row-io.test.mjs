import test from "node:test";
import assert from "node:assert/strict";
import { groupPolls, applySelections } from "../src/lib/voting/logic.mjs";
import { visitorActions } from "../src/lib/voting/visitor-actions.mjs";
import {
  PUBLIC_POLLS_SQL, PUBLIC_ACTIONS_SQL, PUBLIC_BLOCKS_SQL, PUBLIC_SETTINGS_SQL, SITE_METADATA_SQL,
} from "../src/lib/voting/public-snapshot.mjs";

test("private selection overlay exactly matches the original combined page response", () => {
  const rows = [
    { poll_id: "food", title: "Food", max_votes: 2, candidate_id: "a", candidate_name: "A" },
    { poll_id: "food", title: "Food", max_votes: 2, candidate_id: "b", candidate_name: "B" },
    { poll_id: "drink", title: "Drink", max_votes: 1, candidate_id: "c", candidate_name: "C" },
  ];
  const cached = groupPolls(rows);
  for (const selections of [
    [],
    [{ poll_id: "food", candidate_id: "a", is_official: 1 }],
    [{ poll_id: "food", candidate_id: "a", is_official: 1 },
      { poll_id: "food", candidate_id: "b", is_official: 1 },
      { poll_id: "drink", candidate_id: "c", is_official: 0 }],
  ]) {
    assert.deepEqual(applySelections(cached, selections), groupPolls(rows, selections));
  }
  // Overlays must not contaminate the shared public definition.
  assert.deepEqual(cached[0].selectedIds, []);
  assert.equal(cached[0].voted, false);
});

test("public query is indexed and metadata/settings never read the candidate list or image payloads", async t => {
  let DatabaseSync;
  try { ({ DatabaseSync } = await import("node:sqlite")); }
  catch { t.skip("node:sqlite is unavailable"); return; }
  const { readFileSync } = await import("node:fs");
  const { splitStatements } = await import("../scripts/setup-db.mjs");
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  for (const sql of splitStatements(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"))) db.exec(sql);

  db.exec("INSERT INTO polls(id,title,is_published,starts_at,ends_at) VALUES('p','P',1,'2026-01-01T00:00:00.000Z','2027-01-01T00:00:00.000Z')");
  const insert = db.prepare("INSERT INTO candidates(poll_id,id,name,sort_order) VALUES('p',?,?,?)");
  for (let i = 0; i < 196; i++) insert.run("c" + i, "Candidate " + i, i);
  db.exec("INSERT INTO page_blocks(id,kind,title,sort_order) VALUES('header','heading','投票タイトル',1)");
  const set = db.prepare("INSERT INTO form_settings(key,value) VALUES(?,?)");
  set.run("logo", "data:image/png;base64,AA==");
  set.run("ogp", "data:image/jpeg;base64," + "a".repeat(120000));
  set.run("favicon", "data:image/x-icon;base64," + "a".repeat(2800));
  set.run("organizerName", "Example");

  const now = "2026-11-14T00:00:00.000Z";
  const publicRows = db.prepare(PUBLIC_POLLS_SQL).all(now, now);
  assert.equal(publicRows.length, 196);
  assert.match(db.prepare("EXPLAIN QUERY PLAN " + PUBLIC_POLLS_SQL)
    .all(now, now).map(row => row.detail).join("\n"), /SEARCH c USING (PRIMARY KEY|INDEX candidates_order)/);

  const settings = db.prepare(PUBLIC_SETTINGS_SQL).all();
  assert.deepEqual(settings.map(row => row.key).sort(), ["logo", "organizerName"]);
  const settingsPlan = db.prepare("EXPLAIN QUERY PLAN " + PUBLIC_SETTINGS_SQL)
    .all().map(row => row.detail).join("\n");
  assert.match(settingsPlan, /SEARCH form_settings USING PRIMARY KEY/);

  const meta = db.prepare(SITE_METADATA_SQL).get();
  assert.equal(meta.title, "投票タイトル");
  assert.equal(meta.favicon, 1);
  assert.equal(meta.ogp, 1);
  const plan = db.prepare("EXPLAIN QUERY PLAN " + SITE_METADATA_SQL)
    .all().map(row => row.detail).join("\n");
  assert.doesNotMatch(plan, /candidates/);
  assert.match(plan, /SEARCH form_settings USING PRIMARY KEY/);
});

test("public definitions respect hidden layout blocks and include unplaced sections", async t => {
  let DatabaseSync;
  try { ({ DatabaseSync } = await import("node:sqlite")); }
  catch { t.skip("node:sqlite is unavailable"); return; }
  const { readFileSync } = await import("node:fs");
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));

  const addPoll = db.prepare("INSERT INTO polls(id,title,starts_at,ends_at,is_published) VALUES(?,?,'2000','2100',1)");
  const addAction = db.prepare("INSERT INTO actions(id,title,kind,condition_json,starts_at,ends_at,is_published) VALUES(?,?,'notice',?,'2000','2100',1)");
  const addBlock = db.prepare("INSERT INTO page_blocks(id,kind,reference_id,is_published) VALUES(?,?,?,?)");
  // The two kinds have independent internal-ID namespaces.
  for (const id of ["first", "second", "unplaced"]) {
    addPoll.run(id, id);
    addAction.run(id, id, JSON.stringify({ type: "min_total_votes", count: 1 }));
  }
  addBlock.run("first-poll", "poll", "first", 0);
  addBlock.run("first-notice", "action", "first", 1);
  addBlock.run("second-poll", "poll", "second", 1);
  addBlock.run("second-notice", "action", "second", 0);

  db.exec("INSERT INTO page_blocks(id,kind,title,is_published,sort_order) VALUES " +
    "('private-heading','heading','準備中',0,-2),('public-heading','heading','公開タイトル',1,-1)");

  const blocks = db.prepare(PUBLIC_BLOCKS_SQL).all();
  assert.equal(blocks.find(row => row.kind === "heading").id, "public-heading");
  assert.equal(blocks.find(row => row.id === "second-notice").is_published, 0);
  assert.deepEqual(db.prepare(PUBLIC_POLLS_SQL).all("2026", "2026").map(row => row.poll_id), ["second", "unplaced"]);
  const definitions = db.prepare(PUBLIC_ACTIONS_SQL).all("2026", "2026");
  assert.deepEqual(visitorActions(definitions, [], []).map(action => action.id), ["first", "unplaced"]);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { splitStatements, schemaObjects, setup } from "../scripts/setup-db.mjs";

const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
function database() { const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys=ON"); return db; }
function apply(db, statements) {
  db.exec("BEGIN");
  try {
    for (const sql of statements) db.exec(sql);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

test("split SQL statements outside strings, comments and trigger bodies", () => {
  const examples = "-- comment;\nCREATE TABLE t (a TEXT DEFAULT ';');" +
    "/* ignore ; */ SELECT 'text;with;semicolon', 'it''s ok'; -- tail;\nSELECT 3;";
  const stmts = splitStatements(examples);
  assert.equal(stmts.length, 3);
  assert.ok(stmts[0].includes("DEFAULT ';'"));
  assert.ok(stmts[1].includes("'it''s ok'"));
  assert.equal(stmts[2], "SELECT 3");
  assert.equal(splitStatements(schema).filter(s => /^CREATE\s+TRIGGER/i.test(s)).length, 8);
  assert.ok(splitStatements(schema).every(s => !/^END\b/i.test(s)));
  assert.throws(() => splitStatements("SELECT 'unterminated"), /Unterminated/);
});

test("one canonical schema defines nine tables and all indexes and triggers", () => {
  const objects = schemaObjects(splitStatements(schema));
  assert.equal(objects.filter(o => o.type === "table").length, 10);
  assert.equal(objects.filter(o => o.type === "index").length, 9);
  assert.equal(objects.filter(o => o.type === "trigger").length, 8);
  assert.equal(new Set(objects.map(o => o.name)).size, objects.length);
  assert.equal(schema.includes("condition_votes"), false);
  assert.equal(schema.includes("vote_flags"), false);
  assert.equal(schema.includes("vote_selections"), false);
  assert.equal(schema.includes("claim_code"), false);
  const db = database();
  apply(db, splitStatements(schema));
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  assert.equal(names.length, 10);
  const keys = db.prepare("PRAGMA table_info(votes)").all();
  assert.equal(keys.find(c => c.name === "candidate_id").pk, 3);
  assert.ok(db.prepare("PRAGMA table_info(polls)").all().some(c => c.name === "max_votes"));
  db.close();
});

test("setup accepts only empty databases and check mode validates the canonical schema", async () => {
  const db = database();
  const oldEnv = { url: process.env.TURSO_DATABASE_URL, token: process.env.TURSO_AUTH_TOKEN };
  process.env.TURSO_DATABASE_URL = "libsql://unit-test.example";
  process.env.TURSO_AUTH_TOKEN = "unit-test-token";
  const adapter = {
    dbQuery: async (sql, args=[]) => ({ rows: db.prepare(sql).all(...args) }),
    dbTransaction: async steps => apply(db, steps.map(s => s.sql)),
    readSql: async () => schema,
  };
  try {
    assert.equal(await setup(adapter), 10);
    assert.equal(await setup({ ...adapter, checkOnly: true }), 10);
    await assert.rejects(() => setup(adapter), /fresh, empty Turso database/);
  } finally {
    db.close();
    if (oldEnv.url === undefined) delete process.env.TURSO_DATABASE_URL;
    else process.env.TURSO_DATABASE_URL = oldEnv.url;
    if (oldEnv.token === undefined) delete process.env.TURSO_AUTH_TOKEN;
    else process.env.TURSO_AUTH_TOKEN = oldEnv.token;
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_EMAILS_KEY, normalizeAdminEmail, parseAdminEmails,
  readExtraAdminEmails, emailMayAdmin, saveExtraAdminEmails,
} from "../src/lib/voting/admin-emails.mjs";

test("email normalization rejects malformed input and removes duplicates", () => {
  assert.equal(normalizeAdminEmail(" Owner@Example.COM "), "owner@example.com");
  assert.equal(normalizeAdminEmail("no-at"), null);
  assert.equal(normalizeAdminEmail("user@example"), null);
  assert.deepEqual(parseAdminEmails('["OWNER@example.com","owner@example.com","staff@example.org"]'),
    ["owner@example.com", "staff@example.org"]);
  assert.deepEqual(parseAdminEmails('{"emails":["x@example.com"]}'), []);
  assert.deepEqual(parseAdminEmails("not-json"), []);
});

test("env owners bypass DB, but added email access depends on the current allowlist", async () => {
  const config = { allowed: ["root@example.com"] };
  let reads = 0;
  const dbQuery = async (sql, args) => {
    reads++;
    assert.match(sql, /WHERE key=\?/);
    assert.deepEqual(args, [ADMIN_EMAILS_KEY]);
    return { rows: [{value:'["staff@example.com"]'}] };
  };
  assert.equal(await emailMayAdmin("root@example.com", config, dbQuery), true);
  assert.equal(reads, 0);
  assert.equal(await emailMayAdmin("staff@example.com", config, dbQuery), true);
  assert.equal(await emailMayAdmin("removed@example.com", config, dbQuery), false);
  assert.equal(reads, 2);
});

test("saving the additional allowlist uses one indexed upsert and no new table", async () => {
  let statement;
  const dbQuery = async (sql, args) => {
    statement = { sql, args };
    return {rows:[]};
  };
  assert.deepEqual(await saveExtraAdminEmails(["Staff@EXAMPLE.com", "staff@example.com"], dbQuery),
    ["staff@example.com"]);
  assert.match(statement.sql, /ON CONFLICT\(key\) DO UPDATE/);
  assert.deepEqual(statement.args, [ADMIN_EMAILS_KEY, '["staff@example.com"]']);
  assert.deepEqual(await readExtraAdminEmails(async () => ({
    rows: [{value:'["staff@example.com"]'}],
  })), ["staff@example.com"]);
  await assert.rejects(() => saveExtraAdminEmails(["invalid"], dbQuery), /Invalid administrator email/);
});

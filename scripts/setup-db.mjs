import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, dirname, resolve } from "node:path";
import { query, transaction } from "../src/lib/voting/turso.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Split SQLite statements without cutting semicolons inside quotes or comments.
export function splitStatements(source) {
  const statements = [];
  let current = "";
  let quote = "";
  let lineComment = false;
  let blockComment = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    if (lineComment) {
      if (ch === "\n") { lineComment = false; current += "\n"; }
      continue;
    }
    if (blockComment) {
      if (ch === "*" && next === "/") { blockComment = false; i++; }
      continue;
    }
    if (quote) {
      current += ch;
      if (ch === quote && next === quote) { current += next; i++; }
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === "-" && next === "-") { lineComment = true; i++; continue; }
    if (ch === "/" && next === "*") { blockComment = true; i++; continue; }
    if (ch === "'" || ch === '"') { quote = ch; current += ch; continue; }
    if (ch === ";") {
      // A trigger contains a semicolon inside BEGIN ... END.
      if (/^\s*CREATE\s+TRIGGER\b/i.test(current) && !/\bEND\s*$/i.test(current)) {
        current += ch;
        continue;
      }
      if (current.trim()) statements.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (quote || blockComment) throw new Error("Unterminated SQL quote or comment");
  if (current.trim()) statements.push(current.trim());
  return statements;
}

const SCHEMA = "schema.sql";
const requiredColumns = {
  polls: ["id", "public_id", "max_votes", "name_font_size", "columns_json"],
  candidates: ["poll_id", "id", "public_id", "extra_json"],
  votes: ["poll_id", "voter_hash", "candidate_id", "ip_hash", "fingerprint_hash", "is_official", "signal_match", "created_at"],
  action_claims: ["action_id", "voter_hash", "redeemed_at"],
  candidate_totals: ["poll_id", "candidate_id", "total"],
  action_totals: ["action_id", "total"],
};

export function schemaObjects(statements) {
  return statements.map(statement => {
    const match = /^CREATE\s+(?:UNIQUE\s+)?(TABLE|INDEX|TRIGGER)\s+IF\s+NOT\s+EXISTS\s+([A-Za-z_][A-Za-z0-9_]*)\b/i.exec(statement);
    if (!match) throw new Error("Unsupported schema statement: " + statement.slice(0, 80));
    return { type: match[1].toLowerCase(), name: match[2] };
  });
}

export async function setup({
  dbQuery = query, dbTransaction = transaction,
  readSql = () => readFile(join(root, "db", SCHEMA), "utf8"),
  checkOnly = false,
} = {}) {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required");
  }
  const statements = splitStatements(await readSql());
  const expected = schemaObjects(statements);
  const names = new Set(expected.map(entry => entry.name));
  if (names.size !== expected.length) throw new Error("Duplicate schema object names");
  if (!checkOnly) {
    const existing = await dbQuery(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    if (existing.rows.length) {
      throw new Error("A fresh, empty Turso database is required. This command does not migrate or modify existing databases.");
    }
    // A single transaction ensures a partial schema is never left behind.
    await dbTransaction(statements.map(sql => ({ sql, args: [] })));
  }
  const found = await dbQuery(
    "SELECT type,name FROM sqlite_master WHERE type IN ('table','index','trigger') AND name NOT LIKE 'sqlite_%'");
  const actual = new Map(found.rows.map(row => [String(row.name), String(row.type)]));
  const missing = expected.filter(entry => actual.get(entry.name) !== entry.type);
  const unexpected = [...actual.keys()].filter(name => !names.has(name));
  if (missing.length || unexpected.length) {
    throw new Error("Turso schema does not match db/schema.sql: " +
      [...missing.map(x => x.name), ...unexpected.map(x => "unexpected " + x)].join(", "));
  }
  for (const [table, columns] of Object.entries(requiredColumns)) {
    const info = await dbQuery("PRAGMA table_info(" + table + ")");
    const present = new Map(info.rows.map(row => [row.name, row]));
    const absent = columns.filter(column => !present.has(column));
    if (absent.length) throw new Error("Turso schema is missing " + table + ": " + absent.join(", "));
    if (table === "votes" && ["poll_id", "voter_hash", "candidate_id"].some((column, i) =>
      Number(present.get(column).pk) !== i + 1)) {
      throw new Error("votes must have a three-column primary key");
    }
  }
  return expected.filter(entry => entry.type === "table").length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const checkOnly = process.argv.includes("--check");
  try {
    const n = await setup({ checkOnly });
    process.stdout.write("Turso schema " + (checkOnly ? "verified" : "initialized") +
      ": " + n + " tables OK\n");
  } catch (error) {
    console.error("Turso setup failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

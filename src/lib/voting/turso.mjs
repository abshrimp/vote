// Minimal Hrana v3 HTTP adapter. No native SQLite dependency is required on Vercel.
// https://github.com/tursodatabase/turso/blob/main/serverless/PROTOCOL.md
export function tursoHttpUrl(raw) {
  if (typeof raw !== "string" || !raw) throw new Error("TURSO_DATABASE_URL is missing");
  const url = new URL(raw.replace(/^libsql:\/\//, "https://"));
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("TURSO_DATABASE_URL must be a secure libsql:// or https:// URL");
  }
  return url.origin + "/v3/pipeline";
}

export function encodeArg(value) {
  if (value === null || value === undefined) return { type: "null" };
  if (typeof value === "string") return { type: "text", value };
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return { type: "integer", value: String(value) };
  }
  throw new TypeError("Unsupported SQL argument");
}

function decodeCell(cell) {
  if (cell.type === "null") return null;
  if (cell.type === "text") return cell.value;
  if (cell.type === "integer") return Number(cell.value);
  if (cell.type === "float") return Number(cell.value);
  throw new Error("Unexpected SQL result type");
}

export async function query(sql, args = [], options = {}) {
  const url = tursoHttpUrl(options.url ?? process.env.TURSO_DATABASE_URL);
  const token = options.token ?? process.env.TURSO_AUTH_TOKEN;
  if (!token) throw new Error("TURSO_AUTH_TOKEN is missing");
  const fetcher = options.fetcher ?? fetch;
  const res = await fetcher(url, {
    method: "POST",
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({
      baton: null,
      requests: [
        { type: "execute", stmt: { sql, args: args.map(encodeArg), want_rows: true } },
        { type: "close" },
      ],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error("Turso request failed (HTTP " + res.status + ")");
  const payload = await res.json();
  const execution = payload?.results?.[0];
  if (execution?.type !== "ok" || execution?.response?.type !== "execute") {
    throw new Error("Turso SQL execution failed");
  }
  const result = execution.response.result;
  const columns = result.cols.map((column) => column.name);
  return {
    rowsAffected: result.affected_row_count ?? 0,
    rows: result.rows.map((row) =>
      Object.fromEntries(row.map((value, i) => [columns[i], decodeCell(value)]))),
  };
}



// Execute independent SELECTs in one Hrana HTTP request. This reduces network
// overhead without changing their row-read cost or opening a write transaction.
export async function readBatch(statements, options = {}) {
  if (!Array.isArray(statements) || statements.length === 0) return [];
  const url = tursoHttpUrl(options.url ?? process.env.TURSO_DATABASE_URL);
  const token = options.token ?? process.env.TURSO_AUTH_TOKEN;
  if (!token) throw new Error("TURSO_AUTH_TOKEN is missing");
  if (statements.some(({ sql }) => typeof sql !== "string" || !/^\s*(?:SELECT|WITH|PRAGMA)\b/i.test(sql))) {
    throw new Error("Only read-only SQL statements are supported");
  }
  const response = await (options.fetcher ?? fetch)(url, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({
      baton: null,
      requests: [{
        type: "batch",
        batch: { steps: statements.map(({ sql, args = [] }) => ({
          stmt: { sql, args: args.map(encodeArg), want_rows: true },
        })) },
      }, { type: "close" }],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Turso batch read failed (HTTP " + response.status + ")");
  const payload = await response.json();
  const execution = payload?.results?.[0];
  if (execution?.type !== "ok" || execution.response?.type !== "batch") {
    throw new Error("Turso batch read failed");
  }
  const batch = execution.response.result;
  if (batch.step_errors?.some(Boolean) || batch.step_results?.length !== statements.length ||
      batch.step_results.some(result => !result || !Array.isArray(result.cols) || !Array.isArray(result.rows))) {
    throw new Error("Turso batch read failed");
  }
  return batch.step_results.map(result => {
    const columns = result.cols.map(column => column.name);
    return {
      rowsAffected: result.affected_row_count ?? 0,
      rows: result.rows.map(row =>
        Object.fromEntries(row.map((value, index) => [columns[index], decodeCell(value)]))),
    };
  });
}

// Executes a group of statements in one Hrana request and one SQLite
// transaction. Later steps run only if the previous step succeeded.
export async function transaction(statements, options = {}) {
  if (!Array.isArray(statements) || statements.length === 0) return;
  const url = tursoHttpUrl(options.url ?? process.env.TURSO_DATABASE_URL);
  const token = options.token ?? process.env.TURSO_AUTH_TOKEN;
  if (!token) throw new Error("TURSO_AUTH_TOKEN is missing");
  const steps = [
    { stmt: { sql: "BEGIN", args: [] } },
    ...statements.map(({ sql, args = [] }, index) => ({
      stmt: { sql, args: args.map(encodeArg) },
      condition: { type: "ok", step: index },
    })),
    {
      stmt: { sql: "COMMIT", args: [] },
      condition: { type: "ok", step: statements.length },
    },
    {
      stmt: { sql: "ROLLBACK", args: [] },
      condition: {
        type: "not", cond: { type: "ok", step: statements.length },
      },
    },
  ];
  const response = await (options.fetcher ?? fetch)(url, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({
      baton: null,
      requests: [{ type: "batch", batch: { steps } }, { type: "close" }],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error("Turso batch request failed (HTTP " + response.status + ")");
  const payload = await response.json();
  const execution = payload?.results?.[0];
  if (execution?.type !== "ok" || execution?.response?.type !== "batch") {
    throw new Error("Turso transaction failed");
  }
  const results = execution.response.result;
  const failed = results.step_errors?.some(Boolean);
  if (failed || !results.step_results?.[statements.length + 1]) {
    const cause = results.step_errors?.find(Boolean)?.message;
    throw new Error("Turso transaction rolled back" + (cause ? ": " + cause : ""));
  }
}

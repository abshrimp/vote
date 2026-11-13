import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { query } from "../src/lib/voting/turso.mjs";

const WINDOW_MS = 5 * 60 * 1000;

/** Delete expired rate-limit buckets without scanning individual voter keys. */
export async function pruneRateLimits({ now = Date.now(), dbQuery = query } = {}) {
  const cutoff = Math.floor(now / WINDOW_MS) - 2;
  const result = await dbQuery("DELETE FROM vote_request_limits WHERE bucket<?", [cutoff]);
  return Number(result.rowsAffected ?? 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const removed = await pruneRateLimits();
    process.stdout.write("Expired rate-limit rows deleted: " + removed + "\n");
  } catch (error) {
    console.error("Rate-limit pruning failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

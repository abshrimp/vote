import { hmac } from "./security.mjs";
import { query } from "./turso.mjs";

const WINDOW_MS = 5 * 60 * 1000;
const SESSION_LIMIT = 12;
const SIGNAL_LIMIT = 40;

// These are pre-Turnstile request limits, not assertions of personhood.
// The combined network/browser signal remains bounded across cookie resets;
// a shared IP address alone never becomes a rejection key.
export function voteLimitKeys({ secret, voterHash, ipHash, fingerprintHash }) {
  const result = [{ key: voterHash, max: SESSION_LIMIT, scope: "session" }];
  if (ipHash && fingerprintHash) {
    result.push({
      key: hmac(secret, "vote-limit-network-browser", ipHash + "\0" + fingerprintHash),
      max: SIGNAL_LIMIT, scope: "network-browser",
    });
  }
  return result;
}

export async function checkVoteRate({ secret, voterHash, ipHash, fingerprintHash, now = Date.now(), dbQuery = query }) {
  const bucket = Math.floor(now / WINDOW_MS);
  const keys = voteLimitKeys({ secret, voterHash, ipHash, fingerprintHash });
  // One SQL statement (and one network request) for all current limits.
  // SQLite serializes the upsert, preserving concurrency protection.
  const placeholders = keys.map(() => "(?,?,1)").join(",");
  // Stop writing an exhausted counter. SQLite still evaluates each upsert
  // atomically, so concurrent requests cannot slip through. A missing
  // RETURNING row means the counter was at its limit and this request must
  // be rejected, not retried or accepted.
  const capCases = keys.map(() => "WHEN ? THEN ?").join(" ");
  const args = [
    ...keys.flatMap(({ key }) => [key, bucket]),
    ...keys.flatMap(({ key, max }) => [key, max]),
  ];
  const result = await dbQuery(
    "INSERT INTO vote_request_limits(voter_hash,bucket,attempts) VALUES " + placeholders + " " +
    "ON CONFLICT(voter_hash,bucket) DO UPDATE SET attempts=attempts+1 " +
    "WHERE attempts < CASE voter_hash " + capCases + " ELSE 0 END " +
    "RETURNING voter_hash, attempts",
    args,
  );
  const attempts = new Map(result.rows.map(row => [row.voter_hash, Number(row.attempts)]));
  for (const { key, max, scope } of keys) {
    if (!attempts.has(key) || (attempts.get(key) ?? Infinity) > max) {
      return { allowed: false, scope };
    }
  }
  return { allowed: true };
}

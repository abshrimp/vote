export const RESET_PHRASE = "リセット";

/**
 * Reset the complete voter state in one transaction. Clear materialized
 * counters before their source rows: deletion triggers still run, but perform
 * zero-row updates rather than rewriting a counter for every historical vote
 * or claim. This preserves all foreign-key and trigger invariants.
 */
export function resetStatements() {
  return [
    "candidate_totals", "action_totals",
    "votes", "action_claims", "vote_request_limits",
  ].map(table => ({ sql: "DELETE FROM " + table, args: [] }));
}

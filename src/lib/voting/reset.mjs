export const RESET_PHRASE = "リセット";

/**
 * Statements that clear all vote records (including condition-only entries),
 * per-browser request limits and action claims. Departments, candidates, actions,
 * the page layout and settings are kept. Visitors' cookies stay valid but no longer
 * match any vote, so everyone can vote again.
 */
export function resetStatements() {
  return ["votes", "vote_request_limits", "action_claims"]
    .map(table => ({ sql: "DELETE FROM " + table, args: [] }));
}

// Remove aggregate counters before their source events so row-delete triggers
// do not rewrite a running total for every historical vote or claim.
export function deletePollStatements(pollId) {
  return [
    "DELETE FROM candidate_totals WHERE poll_id=?",
    "DELETE FROM votes WHERE poll_id=?",
    "DELETE FROM candidates WHERE poll_id=?",
    "DELETE FROM page_blocks WHERE kind='poll' AND reference_id=?",
    "DELETE FROM polls WHERE id=?",
  ].map(sql => ({ sql, args: [pollId] }));
}

export function deleteActionStatements(actionId) {
  return [
    "DELETE FROM action_totals WHERE action_id=?",
    "DELETE FROM action_claims WHERE action_id=?",
    "DELETE FROM page_blocks WHERE kind='action' AND reference_id=?",
    "DELETE FROM actions WHERE id=?",
  ].map(sql => ({ sql, args: [actionId] }));
}

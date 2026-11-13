/**
 * One atomic update replaces a preliminary poll lookup, a full per-voter
 * aggregation, and a third write request. The aggregation runs only when
 * lowering the current limit; unchanged/increased limits require one indexed
 * row lookup. A rejected update returns no rows so the caller can distinguish
 * a missing poll from a too-low limit with a rare follow-up indexed read.
 */
export function updatePollStatement({ id, title, description, startsAt, endsAt, isPublished, maxVotes }) {
  return {
    sql: "UPDATE polls SET title=?,description=?,starts_at=?,ends_at=?,is_published=?,max_votes=? " +
      "WHERE id=? AND (max_votes<=? OR NOT EXISTS (" +
      "SELECT 1 FROM votes WHERE poll_id=? GROUP BY voter_hash HAVING COUNT(*)>? LIMIT 1" +
      ")) RETURNING id",
    args: [title, description, startsAt, endsAt, Number(isPublished), maxVotes,
      id, maxVotes, id, maxVotes],
  };
}

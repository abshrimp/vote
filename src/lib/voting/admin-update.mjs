const votesFitLimit = "NOT EXISTS (SELECT 1 FROM votes WHERE poll_id=? " +
  "GROUP BY voter_hash HAVING COUNT(*)>? LIMIT 1)";

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
      "WHERE id=? AND (max_votes<=? OR " + votesFitLimit + ") RETURNING id",
    args: [title, description, startsAt, endsAt, Number(isPublished), maxVotes,
      id, maxVotes, id, maxVotes],
  };
}

export function updateStudioPollStatement({
  id, title, description, maxVotes, nameFontSize, columnsJson, startsAt, endsAt, isPublished,
}) {
  const styleAndSchedule = [nameFontSize, columnsJson, startsAt, endsAt, Number(isPublished)];
  // An invalid decrease must abort the entire save. NULL trips the existing
  // max_votes constraint; SQLite skips the vote lookup on equal or higher limits.
  return {
    sql: "UPDATE polls SET title=?,description=?," +
      "max_votes=CASE WHEN max_votes<=? THEN ? WHEN " + votesFitLimit + " THEN ? ELSE NULL END," +
      "name_font_size=?,columns_json=?,starts_at=?,ends_at=?,is_published=? " +
      "WHERE id=? AND (title IS NOT ? OR description IS NOT ? OR max_votes IS NOT ? OR name_font_size IS NOT ? " +
      "OR columns_json IS NOT ? OR starts_at IS NOT ? OR ends_at IS NOT ? OR is_published IS NOT ?)",
    args: [title, description, maxVotes, maxVotes, id, maxVotes, maxVotes, ...styleAndSchedule,
      id, title, description, maxVotes, ...styleAndSchedule],
  };
}

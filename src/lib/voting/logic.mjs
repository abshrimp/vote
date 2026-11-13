import { parseColumns, parseCells, parseNameStyle } from "./columns.mjs";
export function validId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

// One atomic insert classifies each valid selection as official or condition-only.
// RETURNING removes the need for a follow-up query on both success paths.
export function newVoteStatement({
  pollId, candidateId, voterHash, ipHash, fingerprintHash, now, matchMode,
}) {
  const sql = [
    "WITH signal AS (SELECT EXISTS(SELECT 1 FROM votes v WHERE v.poll_id=?",
    "AND v.is_official=1 AND v.voter_hash<>? AND v.ip_hash=? AND v.fingerprint_hash=?) AS matched)",
    "INSERT INTO votes(poll_id,voter_hash,candidate_id,ip_hash,fingerprint_hash,is_official,signal_match)",
    "SELECT ?,?,?,?,? ,CASE WHEN ?=1 AND signal.matched=1 THEN 0 ELSE 1 END,signal.matched",
    "FROM polls p JOIN candidates c ON c.poll_id=p.id AND c.id=? CROSS JOIN signal",
    "WHERE p.id=? AND p.is_published=1 AND p.starts_at<=? AND p.ends_at>?",
    "AND (SELECT COUNT(*) FROM votes v WHERE v.poll_id=? AND v.voter_hash=?) < p.max_votes",
    "AND NOT EXISTS (SELECT 1 FROM votes v WHERE v.poll_id=? AND v.voter_hash=? AND v.is_official=0)",
    "ON CONFLICT(poll_id,voter_hash,candidate_id) DO NOTHING",
    "RETURNING is_official,signal_match",
  ].join(" ");
  const args = [
    pollId,voterHash,ipHash,fingerprintHash,
    pollId,voterHash,candidateId,ipHash,fingerprintHash,matchMode === "block" ? 1 : 0,
    candidateId,pollId,now,now,pollId,voterHash,pollId,voterHash,
  ];
  return { sql,args };
}

export function pollVoteLimit(poll) {
  return Math.min(poll.maxVotes, poll.candidates.length);
}

export function withPollSelections(poll, selectedIds, conditionIds) {
  const limit = pollVoteLimit(poll);
  return {
    ...poll, selectedIds, conditionIds,
    voted: conditionIds.length > 0 || (limit > 0 && selectedIds.length >= limit),
  };
}

export function groupPolls(rows, selections = []) {
  const polls = new Map();
  for (const row of rows) {
    if (!polls.has(row.poll_id)) {
      polls.set(row.poll_id, {
        id: row.poll_id,
        publicId: row.poll_public_id ?? null,
        title: row.title,
        description: row.description,
        maxVotes: Number(row.max_votes ?? 1),
        nameFontSize: Number(row.name_font_size ?? 16),
        columns: parseColumns(row.columns_json),
        nameStyle: parseNameStyle(row.columns_json),
        candidates: [],
      });
    }
    if (row.candidate_id !== null) {
      polls.get(row.poll_id).candidates.push({
        id: row.candidate_id,
        publicId: row.candidate_public_id ?? null,
        name: row.candidate_name,
        extra: parseCells(row.candidate_extra_json, polls.get(row.poll_id).columns),
      });
    }
  }
  return applySelections(Array.from(polls.values()), selections);
}

/** Apply only private voter rows to already cached public polls. */
export function applySelections(polls, selections = []) {
  const official = new Map();
  const conditional = new Map();
  for (const selection of selections) {
    const byPoll = Number(selection.is_official) === 1 ? official : conditional;
    if (!byPoll.has(selection.poll_id)) byPoll.set(selection.poll_id, new Set());
    byPoll.get(selection.poll_id).add(selection.candidate_id);
  }
  return polls.map(poll => {
    const selectedIds = [...(official.get(poll.id) ?? [])];
    const conditionIds = [...(conditional.get(poll.id) ?? [])];
    return withPollSelections(poll, selectedIds, conditionIds);
  });
}

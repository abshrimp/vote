// Fixed, deliberately small rule language. No arbitrary SQL or JavaScript is accepted.
export function validateCondition(node, depth = 0) {
  if (!node || typeof node !== "object" || Array.isArray(node) || depth > 6) return false;
  const kind = node.type;
  if (kind === "all" || kind === "any") {
    return Array.isArray(node.rules) && node.rules.length >= 1 && node.rules.length <= 12 &&
      node.rules.every((r) => validateCondition(r, depth + 1));
  }
  if (kind === "min_distinct_polls" || kind === "min_total_votes") {
    return Number.isInteger(node.count) && node.count >= 1 && node.count <= 1000;
  }
  if (kind === "voted_poll") {
    return typeof node.pollId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(node.pollId);
  }
  if (kind === "action_used") {
    return typeof node.actionId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(node.actionId);
  }
  return false;
}


/** Does an action's eligibility depend on this particular redemption? */
export function referencesUsedAction(node, actionId) {
  if (!node || typeof node !== "object") return false;
  if (node.type === "action_used") return node.actionId === actionId;
  if (node.type === "all" || node.type === "any") {
    return Array.isArray(node.rules) && node.rules.some(rule => referencesUsedAction(rule, actionId));
  }
  return false;
}

// A conditional action is checked AT INSERT TIME in one SQLite statement.
// All identifiers come from fixed SQL templates; user values are bound parameters.
export function conditionSql(condition, voterHash) {
  if (!validateCondition(condition)) throw new Error("Invalid condition");
  let needsTotals = false;
  function build(node) {
    switch (node.type) {
      case "all":
      case "any": {
        const parts = node.rules.map(build);
        return {
          sql: "(" + parts.map(p => p.sql).join(node.type === "all" ? " AND " : " OR ") + ")",
          args: parts.flatMap(p => p.args),
        };
      }
      case "min_distinct_polls":
        needsTotals = true;
        return { sql: "progress.distinct_polls >= ?", args: [node.count] };
      case "min_total_votes":
        needsTotals = true;
        return { sql: "progress.total_votes >= ?", args: [node.count] };
      case "voted_poll":
        return {
          sql: "EXISTS(SELECT 1 FROM votes WHERE poll_id=? AND voter_hash=?)",
          args: [node.pollId,voterHash],
        };
      case "action_used":
        return {
          sql: "EXISTS(SELECT 1 FROM action_claims WHERE voter_hash=? AND action_id=?)",
          args: [voterHash,node.actionId],
        };
      default: throw new Error("Unsupported condition");
    }
  }
  const rule = build(condition);
  if (!needsTotals) return rule;
  // One covering-index scan produces both counts even for nested rules.
  return {
    sql: "(WITH progress AS MATERIALIZED (" +
      "SELECT COUNT(*) AS total_votes,COUNT(DISTINCT poll_id) AS distinct_polls " +
      "FROM votes WHERE voter_hash=?) SELECT " + rule.sql + " FROM progress)",
    args: [voterHash,...rule.args],
  };
}

export function claimStatement(action, voterHash, now) {
  const rule = conditionSql(JSON.parse(action.condition_json), voterHash);
  return {
    // One press at the desk completes the exchange: the record is stored as used.
    sql: "INSERT INTO action_claims(action_id, voter_hash, redeemed_at) " +
      "SELECT ?, ?, ? WHERE EXISTS " +
      "(SELECT 1 FROM actions a WHERE a.id = ? AND a.kind = 'claim' " +
      "AND a.is_published = 1 AND a.starts_at <= ? AND a.ends_at > ? " +
      "AND a.condition_json = ?) " +
      "AND (" + rule.sql + ") ON CONFLICT(action_id, voter_hash) DO NOTHING",
    args: [action.id, voterHash, now, action.id, now, now, action.condition_json, ...rule.args],
  };
}

// Evaluate visibility from one indexed fetch of this visitor's votes and claims.
// Claim issuance still uses conditionSql atomically to prevent TOCTOU changes.
export function evaluateCondition(condition, facts) {
  if (!validateCondition(condition)) throw new Error("Invalid condition");
  const votedPolls = facts.votedPolls;
  const claims = facts.claims;
  function check(node) {
    switch (node.type) {
      case "all": return node.rules.every(check);
      case "any": return node.rules.some(check);
      case "min_distinct_polls": return votedPolls.size >= node.count;
      case "min_total_votes": return facts.totalVotes >= node.count;
      case "voted_poll": return votedPolls.has(node.pollId);
      case "action_used": return claims.has(node.actionId);
      default: return false;
    }
  }
  return check(condition);
}

export function visitorFacts(voteRows, claimRows) {
  return {
    votedPolls: new Set(voteRows.map(row => row.poll_id)),
    totalVotes: voteRows.length,
    claims: new Set(claimRows.map(row => row.action_id)),
  };
}

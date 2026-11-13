import { normalizePublicIds, splitPublicIds } from "./links.mjs";

/**
 * A single alias change cannot create conflicts between unrelated records.
 * For candidate aliases, only candidates in the same poll may collide;
 * other candidate IDs are globally protected by the existing INSERT/UPDATE
 * triggers. Poll aliases must additionally be checked against candidate
 * aliases in every poll, including comma-separated aliases.
 *
 * A multi-alias or multi-entity edit uses the complete projected-state check
 * because swaps and combinations may involve several records at once.
 */
export function publicIdCheckPlan(operations) {
  const updates = operations.filter(operation => operation.type === "public_id");
  if (updates.length !== 1 || operations.some(operation =>
    ["poll_new", "candidate_new", "poll_delete"].includes(operation.type))) return null;

  const change = updates[0];
  const value = normalizePublicIds(change.publicId);
  if (value === undefined) return null; // The batch validator reports malformed IDs.
  if (value === null) return { skip: true, statements: [] }; // Removing an alias cannot create a collision.
  const aliases = splitPublicIds(value);
  if (aliases.length !== 1) return null;

  if (change.candidateId === null) {
    const alias = aliases[0];
    return { skip: false, statements: [
      { sql: "SELECT id,public_id FROM polls" },
      {
        sql: "SELECT poll_id,id,public_id FROM candidates " +
          "WHERE id=? OR public_id=? OR instr(',' || public_id || ',', ',' || ? || ',')>0",
        args: [alias, alias, alias],
      },
    ] };
  }

  return { skip: false, statements: [
    { sql: "SELECT id,public_id FROM polls" },
    { sql: "SELECT poll_id,id,public_id FROM candidates WHERE poll_id=?",
      args: [change.pollId] },
  ] };
}

/** Apply the pending batch to the rows participating in the ID check. */
export function projectPublicIds(pollRows, candidateRows, operations) {
  let polls = pollRows.map(row => ({ ...row }));
  let candidates = candidateRows.map(row => ({ ...row }));
  for (const op of operations) {
    if (op.type === "poll_new") polls.push({ id: op.id, public_id: null });
    if (op.type === "candidate_new") candidates.push({
      poll_id: op.pollId, id: op.id, public_id: null,
    });
    if (op.type === "poll_delete") {
      polls = polls.filter(p => p.id !== op.id);
      candidates = candidates.filter(c => c.poll_id !== op.id);
    }
    if (op.type === "public_id") {
      const value = normalizePublicIds(op.publicId) ?? null;
      if (op.candidateId === null) polls = polls.map(p =>
        p.id === op.pollId ? { ...p, public_id: value } : p);
      else candidates = candidates.map(c =>
        c.poll_id === op.pollId && c.id === op.candidateId
          ? { ...c, public_id: value } : c);
    }
  }
  return { polls, candidates };
}

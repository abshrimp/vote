export function validPublicId(value) {
  return typeof value === "string" && /^[\p{L}\p{N}_:-]{1,64}$/u.test(value);
}

/** Return the decoded section/public ID of a URL fragment, including localized IDs. */
export function publicIdFromHash(hash) {
  if (!hash.startsWith("#")) return null;
  try {
    const id = decodeURIComponent(hash.slice(1));
    return validPublicId(id) ? id : null;
  } catch {
    return null;
  }
}

// Internal IDs may repeat across polls and never contain a colon.
export function candidateElementId(pollId, candidateId) {
  return "candidate-" + pollId + ":" + candidateId;
}

/** A public ID field may hold several IDs separated by commas ("food,yatai"). */
export function splitPublicIds(value) {
  return typeof value === "string" ? value.split(/[,、，\s]+/).map(v => v.trim()).filter(Boolean) : [];
}
/** Normalised "a,b" form, null for empty, or undefined when the input is invalid. */
export function normalizePublicIds(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > 1000) return undefined;
  const ids = [...new Set(splitPublicIds(value))];
  if (ids.length > 20 || !ids.every(validPublicId)) return undefined;
  return ids.length ? ids.join(",") : null;
}
const hasId = (field, id) => splitPublicIds(field).includes(id);

const findPoll = (key, polls) =>
  polls.find(poll => hasId(poll.publicId, key)) ?? polls.find(poll => poll.id === key) ?? null;

/**
 * Every place an ?id= value can point to. Department IDs are unique, but the same
 * candidate ID may be used in several departments (e.g. one group entering several
 * categories). Passing the department as `categoryKey` (?category=) narrows it to one target.
 * @param {string} id
 * @param {{ id: string, publicId?: string | null, candidates: { id: string, publicId?: string | null }[] }[]} polls
 * @param {string | null} [categoryKey]
 * @returns {{ pollId: string, candidateId: string | null }[]}
 */
export function resolveTargets(id, polls, categoryKey = null) {
  if (!validPublicId(id)) return [];
  if (categoryKey !== null) {
    if (!validPublicId(categoryKey)) return [];
    const poll = findPoll(categoryKey, polls);
    if (!poll) return [];
    if (hasId(poll.publicId, id) || poll.id === id) return [{ pollId: poll.id, candidateId: null }];
    const candidate = poll.candidates.find(c => hasId(c.publicId, id)) ?? poll.candidates.find(c => c.id === id);
    return candidate ? [{ pollId: poll.id, candidateId: candidate.id }] : [];
  }
  const byPublic = [];
  for (const poll of polls) {
    if (hasId(poll.publicId, id)) byPublic.push({ pollId: poll.id, candidateId: null });
    for (const candidate of poll.candidates)
      if (hasId(candidate.publicId, id)) byPublic.push({ pollId: poll.id, candidateId: candidate.id });
  }
  if (byPublic.length) return byPublic;
  const byInternal = [];
  for (const poll of polls) {
    if (poll.id === id) byInternal.push({ pollId: poll.id, candidateId: null });
    for (const candidate of poll.candidates)
      if (candidate.id === id) byInternal.push({ pollId: poll.id, candidateId: candidate.id });
  }
  return byInternal;
}

/**
 * Checks the ID rules over the whole site (after pending changes are applied):
 * department IDs are unique and never reused by candidates; a candidate ID is unique
 * inside its department; no public ID equals an internal ID. Returns an error or null.
 * @param {{ id: string, public_id?: string | null }[]} polls
 * @param {{ poll_id: string, id: string, public_id?: string | null }[]} candidates
 */
export function findPublicIdConflict(polls, candidates) {
  const internal = new Set([...polls.map(p => p.id), ...candidates.map(c => c.id)]);
  const pollOwner = new Map();
  for (const poll of polls) for (const id of splitPublicIds(poll.public_id)) {
    if (internal.has(id)) return "「" + id + "」は内部IDと重なるため使えません。";
    if (pollOwner.has(id) && pollOwner.get(id) !== poll.id) return "部門の公開ID「" + id + "」が複数の部門で使われています。";
    pollOwner.set(id, poll.id);
  }
  const perPoll = new Set();
  for (const candidate of candidates) for (const id of splitPublicIds(candidate.public_id)) {
    if (internal.has(id)) return "「" + id + "」は内部IDと重なるため使えません。";
    if (pollOwner.has(id)) return "「" + id + "」は部門の公開IDとして使われているため、候補の公開IDにできません。";
    const key = candidate.poll_id + "\u0000" + id;
    if (perPoll.has(key)) return "候補の公開ID「" + id + "」が同じ部門の中で重複しています。";
    perPoll.add(key);
  }
  return null;
}

/**
 * First match only (kept for callers that need a single target).
 * @param {string} id
 * @param {{ id: string, publicId?: string | null, candidates: { id: string, publicId?: string | null }[] }[]} polls
 * @param {string | null} [pollKey]
 */
export function resolveTarget(id, polls, categoryKey = null) {
  return resolveTargets(id, polls, categoryKey)[0] ?? null;
}

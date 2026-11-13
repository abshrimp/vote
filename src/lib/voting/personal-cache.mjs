// A short-lived, browser-only optimization. The signed HttpOnly session
// remains authoritative for all votes, redemptions and anti-abuse checks.
export const PERSONAL_CACHE_MAX_AGE_MS = 60 * 60 * 1000;
const STORAGE_KEY = "festival-vote-personal-v1";

function validPersonal(personal) {
  return personal && typeof personal === "object" && !Array.isArray(personal) &&
    Array.isArray(personal.selections) && Array.isArray(personal.actions) &&
    personal.selections.every(row =>
      row && typeof row.poll_id === "string" && typeof row.candidate_id === "string" &&
      (row.is_official === 0 || row.is_official === 1)) &&
    personal.actions.every(action =>
      action && typeof action.id === "string" && typeof action.title === "string" &&
      typeof action.description === "string" && typeof action.kind === "string" &&
      typeof action.eligible === "boolean" &&
      (action.status === null || typeof action.status === "string") &&
      action.config && typeof action.config === "object" && !Array.isArray(action.config));
}

export function readPersonalCache(storage, sessionKey, now = Date.now()) {
  if (!sessionKey) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw || raw.length > 250_000) return null;
    const entry = JSON.parse(raw);
    if (entry.version !== 1 || entry.sessionKey !== sessionKey ||
        !Number.isFinite(entry.savedAt) || entry.savedAt > now ||
        now - entry.savedAt >= PERSONAL_CACHE_MAX_AGE_MS ||
        !validPersonal(entry.personal)) return null;
    return entry.personal;
  } catch {
    return null; // Storage can be unavailable in private browsing.
  }
}

export function writePersonalCache(storage, sessionKey, personal, now = Date.now()) {
  if (!sessionKey || !validPersonal(personal)) return;
  try {
    const raw = JSON.stringify({ version: 1, sessionKey, savedAt: now, personal });
    if (raw.length <= 250_000) storage.setItem(STORAGE_KEY, raw);
  } catch {
    // A full/disabled storage quota must never block voting.
  }
}

export function clearPersonalCache(storage) {
  try { storage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
}

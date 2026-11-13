import { adminSession, googleConfig } from "./google-admin.mjs";
import { emailMayAdmin } from "./admin-emails.mjs";
import { validateCondition } from "./conditions.mjs";

export async function isAdmin(request) {
  const identity = adminSession(request);
  if (!identity) return false;
  try { return await emailMayAdmin(identity.email, googleConfig()); }
  catch { return false; } // If the allowlist DB is unavailable, do not grant access.
}

export function sameOrigin(request) {
  return request.headers.get("origin") === request.nextUrl.origin &&
    request.headers.get("content-type")?.startsWith("application/json");
}

export function cleanText(v, max = 200) {
  return typeof v === "string" && v.trim().length > 0 && v.trim().length <= max
    ? v.trim() : null;
}
export function validDate(v) {
  return typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) &&
    Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
}
export function validRange(start, end) {
  return validDate(start) && validDate(end) && start < end;
}
// Button wording and the optional confirmation shown when a visitor presses it.
const TEXT_FIELDS = {
  claim: { claimLabel: 30, lockedLabel: 30, usedLabel: 30, claimConfirm: 300 },
  link: { buttonLabel: 30, confirm: 300 },
  notice: {},
};
const validText = (value, max) => value === undefined ||
  (typeof value === "string" && value.trim().length <= max);

export function validateAction(kind, condition, config = {}) {
  if (!validateCondition(condition)) return false;
  if (!Object.hasOwn(TEXT_FIELDS, kind)) return false;
  if (!config || typeof config !== "object" || Array.isArray(config)) return false;
  if (!Object.entries(TEXT_FIELDS[kind]).every(([key, max]) => validText(config[key], max))) return false;
  if (kind !== "link") return true;
  try {
    const url = new URL(config.url);
    return url.protocol === "https:" && !url.username && !url.password &&
      !url.hash && url.href.length <= 2048;
  } catch { return false; }
}

export function actionConfig(kind, config) {
  const out = {};
  if (kind === "link") out.url = new URL(config.url).href;
  for (const key of Object.keys(TEXT_FIELDS[kind] ?? {})) {
    const value = typeof config?.[key] === "string" ? config[key].trim() : "";
    if (value) out[key] = value;
  }
  return out;
}

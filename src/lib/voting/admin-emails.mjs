import { query } from "./turso.mjs";

export const ADMIN_EMAILS_KEY = "adminAllowedEmails";

export function normalizeAdminEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email)) return null;
  return email;
}

export function parseAdminEmails(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    if (!Array.isArray(parsed) || parsed.length > 100) return [];
    const emails = parsed.map(normalizeAdminEmail);
    return emails.every(Boolean) ? [...new Set(emails)] : [];
  } catch { return []; }
}

export async function readExtraAdminEmails(dbQuery = query) {
  const rows = (await dbQuery("SELECT value FROM form_settings WHERE key=?", [ADMIN_EMAILS_KEY])).rows;
  return parseAdminEmails(rows[0]?.value);
}

export async function emailMayAdmin(email, config, dbQuery = query) {
  const normalized = normalizeAdminEmail(email);
  if (!normalized || !config) return false;
  if (config.allowed.includes(normalized)) return true;
  return (await readExtraAdminEmails(dbQuery)).includes(normalized);
}

export async function saveExtraAdminEmails(emails, dbQuery = query) {
  if (!Array.isArray(emails) || emails.length > 100) throw new TypeError("Invalid administrator list");
  const normalized = emails.map(normalizeAdminEmail);
  if (normalized.some(email => !email)) throw new TypeError("Invalid administrator email");
  const unique = [...new Set(normalized)];
  await dbQuery(
    "INSERT INTO form_settings(key,value) VALUES(?,?) " +
    "ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE value<>excluded.value",
    [ADMIN_EMAILS_KEY, JSON.stringify(unique)],
  );
  return unique;
}

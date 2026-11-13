import { query } from "./turso.mjs";
import { validFont } from "./fonts.mjs";

const HEX = /^#[0-9a-fA-F]{6}$/;
const color = value => typeof value === "string" && HEX.test(value);
// Uploaded logo as a data URL. Rendered only through <img>, where SVG scripts never run.
const LOGO = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+=*$/;
export const MAX_LOGO_LENGTH = 200000;
const logo = value => value === "" || (typeof value === "string" && value.length <= MAX_LOGO_LENGTH && LOGO.test(value));
const organizerName = value => typeof value === "string" && value.length <= 120 && !/[\x00-\x1f\x7f]/.test(value);
const officialUrl = value => {
  if (value === "") return true;
  if (typeof value !== "string" || value.length > 500 || /[\x00-\x20\x7f]/.test(value)) return false;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
};
const contactEmail = value => typeof value === "string" &&
  (value === "" || (value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)));

/** Settings an administrator may change, with their validators. An empty logo means the default mark. */
export const SETTING_RULES = {
  themeColor: color, accentColor: color, highlightColor: color, textColor: color, backgroundColor: color,
  logo, headingFont: validFont, bodyFont: validFont,
  organizerName, officialUrl, contactEmail,
};

export function cleanSettings(rows) {
  const out = {};
  for (const { key, value } of rows ?? []) {
    if (!Object.hasOwn(SETTING_RULES, key) || !SETTING_RULES[key](value) || value === "") continue;
    out[key] = key === "logo" || key.endsWith("Font") || key === "organizerName" || key === "officialUrl" || key === "contactEmail"
      ? value : value.toLowerCase();
  }
  return out;
}

/** Reads form-wide settings from the required schema. */
export async function readSettings(run = query) {
  return cleanSettings((await run("SELECT key,value FROM form_settings")).rows);
}

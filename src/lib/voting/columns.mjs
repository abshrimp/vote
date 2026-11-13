const validKey = value => typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(value);
export const validFontSize = value => Number.isInteger(value) && value >= 10 && value <= 36;

// Optional text style shared by the candidate name and custom columns.
// `_name` is stored in columns_json to keep the name style without a DB migration;
// it can never collide with a custom column because custom keys must start with a letter.
const NAME_KEY = "_name";
const STYLE_FLAGS = ["bold", "italic", "underline"];
export function validStyle(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (value.color !== undefined && !(typeof value.color === "string" && /^#[0-9a-fA-F]{6}$/.test(value.color))) return false;
  return STYLE_FLAGS.every(flag => value[flag] === undefined || typeof value[flag] === "boolean");
}
export function cleanStyle(value) {
  const style = {};
  if (typeof value?.color === "string" && /^#[0-9a-fA-F]{6}$/.test(value.color)) style.color = value.color.toLowerCase();
  for (const flag of STYLE_FLAGS) if (value?.[flag] === true) style[flag] = true;
  return style;
}

export function validColumns(value) {
  return Array.isArray(value) && value.length <= 12 &&
    new Set(value.map(c => c?.key)).size === value.length &&
    value.every(c => c && typeof c === "object" && !Array.isArray(c) &&
      validKey(c.key) && !["name","id","public_id"].includes(c.key) &&
      typeof c.label === "string" && c.label.trim().length > 0 && c.label.length <= 40 &&
      validFontSize(c.fontSize) && validStyle(c) &&
      (c.hideLabel === undefined || typeof c.hideLabel === "boolean"));
}
export function validCells(value, columns) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).every(k => columns.some(c => c.key === k)) &&
    Object.values(value).every(v => typeof v === "string" && v.length <= 500));
}

/** Normalised columns + name style → the JSON stored in polls.columns_json. */
export function serializeColumns(columns, nameStyle = {}) {
  const stored = columns.map(c => ({
    key: c.key, label: c.label, fontSize: c.fontSize, ...cleanStyle(c),
    ...(c.hideLabel === true ? { hideLabel: true } : {}),
  }));
  const name = cleanStyle(nameStyle);
  return JSON.stringify(Object.keys(name).length ? [{ key: NAME_KEY, ...name }, ...stored] : stored);
}

function parseStored(raw) {
  try { const parsed = JSON.parse(raw || "[]"); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}
export function parseColumns(raw) {
  const columns = parseStored(raw).filter(c => c?.key !== NAME_KEY);
  return validColumns(columns) ? columns : [];
}
export function parseNameStyle(raw) {
  return cleanStyle(parseStored(raw).find(c => c?.key === NAME_KEY));
}
export function parseCells(raw, columns) {
  try {
    const value = JSON.parse(raw || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const filtered = Object.fromEntries(Object.entries(value).filter(([key, v]) =>
      columns.some(c => c.key === key) && typeof v === "string" && v.length <= 500));
    return filtered;
  } catch { return {}; }
}

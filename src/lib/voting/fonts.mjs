// Fonts an administrator can pick for headings and body text. "system" uses the
// default stack; the others are loaded from Google Fonts only when selected.
export const FONTS = {
  system: { label: "システム標準", family: null, google: null },
  "noto-sans": { label: "Noto Sans JP（ゴシック）", family: '"Noto Sans JP"', google: "Noto+Sans+JP:wght@400;500;700" },
  "zen-kaku": { label: "Zen Kaku Gothic New（すっきり）", family: '"Zen Kaku Gothic New"', google: "Zen+Kaku+Gothic+New:wght@400;500;700" },
  "biz-ud": { label: "BIZ UDPゴシック（読みやすさ重視）", family: '"BIZ UDPGothic"', google: "BIZ+UDPGothic:wght@400;700" },
  "zen-maru": { label: "Zen Maru Gothic（丸ゴシック）", family: '"Zen Maru Gothic"', google: "Zen+Maru+Gothic:wght@400;500;700" },
  "m-plus-rounded": { label: "M PLUS Rounded 1c（やわらか丸ゴシック）", family: '"M PLUS Rounded 1c"', google: "M+PLUS+Rounded+1c:wght@400;500;700" },
  "kosugi-maru": { label: "小杉丸ゴシック", family: '"Kosugi Maru"', google: "Kosugi+Maru" },
  "noto-serif": { label: "Noto Serif JP（明朝）", family: '"Noto Serif JP"', google: "Noto+Serif+JP:wght@400;500;700" },
  shippori: { label: "しっぽり明朝", family: '"Shippori Mincho"', google: "Shippori+Mincho:wght@400;500;700" },
  "dela-gothic": { label: "Dela Gothic One（極太・見出し向け）", family: '"Dela Gothic One"', google: "Dela+Gothic+One" },
  yusei: { label: "Yusei Magic（手書き風）", family: '"Yusei Magic"', google: "Yusei+Magic" },
};

export const customGoogleFont = value => typeof value === "string" &&
  /^google:[A-Za-z][A-Za-z0-9 ]{0,79}$/.test(value) && !value.endsWith(" ");
export const validFont = value => typeof value === "string" &&
  (Object.hasOwn(FONTS, value) || customGoogleFont(value));
export const googleFontUrl = value => "https://fonts.googleapis.com/css2?family=" +
  encodeURIComponent(value.slice(7)).replace(/%20/g, "+") + "&display=swap";

/** Verify custom names against the actual Google Fonts stylesheet before saving. */
export async function verifyGoogleFont(value) {
  if (!customGoogleFont(value)) return false;
  try {
    const response = await fetch(googleFontUrl(value), {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    return response.ok && (await response.text()).includes("@font-face");
  } catch { return false; }
}

/** One Google Fonts stylesheet URL for the selected fonts, or null when none is needed. */
export function fontStylesheet(keys) {
  const families = [...new Set(keys)].map(key => FONTS[key]?.google ?? (customGoogleFont(key) ? encodeURIComponent(key.slice(7)).replace(/%20/g, "+") : null)).filter(Boolean);
  return families.length
    ? "https://fonts.googleapis.com/css2?" + families.map(f => "family=" + f).join("&") + "&display=swap"
    : null;
}

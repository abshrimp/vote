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

export const validFont = value => typeof value === "string" && Object.hasOwn(FONTS, value);

/** One Google Fonts stylesheet URL for the selected fonts, or null when none is needed. */
export function fontStylesheet(keys) {
  const families = [...new Set(keys)].map(key => FONTS[key]?.google).filter(Boolean);
  return families.length
    ? "https://fonts.googleapis.com/css2?" + families.map(f => "family=" + f).join("&") + "&display=swap"
    : null;
}

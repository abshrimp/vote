import { useEffect, type CSSProperties } from "react";
import { FONTS, fontStylesheet } from "@/lib/voting/fonts.mjs";

export type ThemeSettings = {
  themeColor?: string; accentColor?: string; highlightColor?: string;
  textColor?: string; backgroundColor?: string; logo?: string; favicon?: string; ogp?: string;
  headingFont?: string; bodyFont?: string;
  organizerName?: string; officialUrl?: string; contactEmail?: string;
};

const BASE_STACK = '"Google Sans Text", "Google Sans", Roboto, "Noto Sans JP", -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", Meiryo, sans-serif';
export const fontOptions = Object.entries(FONTS).map(([value, font]) => ({ value, label: font.label }));
/** CSS font-family for a font key (falls back to the default stack). */
export function fontFamily(key: string | undefined) {
  const family = key?.startsWith("google:") ? JSON.stringify(key.slice(7)) : key ? (FONTS as Record<string, { family: string | null }>)[key]?.family : null;
  return family ? family + ", " + BASE_STACK : BASE_STACK;
}

/** Adds the Google Fonts stylesheet for the given fonts (only once per set of fonts). */
export function useWebFonts(keys: (string | undefined)[]) {
  const href = fontStylesheet(keys.filter(Boolean) as string[]);
  useEffect(() => {
    if (!href || document.querySelector('link[data-web-fonts="' + href + '"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.webFonts = href;
    document.head.appendChild(link);
  }, [href]);
}
export type ColorKey = "themeColor" | "accentColor" | "highlightColor" | "textColor" | "backgroundColor";

export const DEFAULT_THEME = "#4a743d";
/** Every colour the pages use, with its default and where it appears. */
export const themeRoles: { key: ColorKey; label: string; hint: string; fallback: string }[] = [
  { key: "themeColor", label: "メインカラー", hint: "ボタン、選択中の表示、進捗バー", fallback: "#4a743d" },
  { key: "accentColor", label: "アクセントカラー", hint: "引換権カードの上の線、リストの記号", fallback: "#d0a266" },
  { key: "highlightColor", label: "ハイライト", hint: "引き換え状況の背景、リンクで開いた候補の強調", fallback: "#f7ead5" },
  { key: "textColor", label: "文字色", hint: "本文・見出し（補足の文字や線はこの色から自動で作られます）", fallback: "#2b211d" },
  { key: "backgroundColor", label: "背景色", hint: "ページ全体の背景", fallback: "#faf7f2" },
];
export const themeColors: { value: string; label: string }[] = [
  { value: "#4a743d", label: "グリーン" },
  { value: "#60473e", label: "ブラウン" },
  { value: "#a8742f", label: "ゴールド" },
  { value: "#b3261e", label: "レッド" },
  { value: "#c2185b", label: "ピンク" },
  { value: "#7b3f98", label: "パープル" },
  { value: "#3949ab", label: "インディゴ" },
  { value: "#1a5fb4", label: "ブルー" },
  { value: "#00796b", label: "ティール" },
  { value: "#5f6368", label: "グレー" },
];

const valid = (value: string | undefined): value is string => Boolean(value && /^#[0-9a-f]{6}$/i.test(value));

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** CSS variables for the configured colours. Unset colours keep the stylesheet defaults. */
export function themeVars(settings: ThemeSettings | string | undefined): CSSProperties {
  const s: ThemeSettings = typeof settings === "string" ? { themeColor: settings } : settings ?? {};
  const base = valid(s.themeColor) ? s.themeColor : DEFAULT_THEME;
  const vars: Record<string, string> = {
    "--green": base,
    "--green-hover": `color-mix(in srgb, ${base} 86%, black)`,
    "--green-container": `color-mix(in srgb, ${base} 15%, white)`,
    "--on-green-container": `color-mix(in srgb, ${base} 55%, black)`,
    "--on-green": luminance(base) > 0.4 ? "#1f1a17" : "#ffffff",
  };
  if (s.bodyFont && s.bodyFont !== "system") vars["--font-body"] = fontFamily(s.bodyFont);
  if (s.headingFont && s.headingFont !== "system") vars["--font-heading"] = fontFamily(s.headingFont);
  if (valid(s.accentColor)) vars["--gold"] = s.accentColor;
  if (valid(s.highlightColor)) vars["--cream"] = s.highlightColor;
  if (valid(s.backgroundColor)) vars["--bg"] = s.backgroundColor;
  if (valid(s.textColor)) {
    const t = s.textColor;
    Object.assign(vars, {
      "--ink": t,
      "--ink-2": `color-mix(in srgb, ${t} 74%, white)`,
      "--ink-3": `color-mix(in srgb, ${t} 52%, white)`,
      "--brown": `color-mix(in srgb, ${t} 80%, white)`,
      "--line": `color-mix(in srgb, ${t} 11%, white)`,
      "--line-strong": `color-mix(in srgb, ${t} 20%, white)`,
    });
  }
  return vars as CSSProperties;
}

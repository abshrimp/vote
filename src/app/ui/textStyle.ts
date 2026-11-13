import type { CSSProperties } from "react";

export type TextStyle = { color?: string; bold?: boolean; italic?: boolean; underline?: boolean };

export const textColors: { value: string | undefined; label: string }[] = [
  { value: undefined, label: "既定" },
  { value: "#60473e", label: "ブラウン" },
  { value: "#4a743d", label: "グリーン" },
  { value: "#a8742f", label: "ゴールド" },
  { value: "#8a7b73", label: "グレー" },
  { value: "#b3261e", label: "レッド" },
  { value: "#1a5fb4", label: "ブルー" },
  { value: "#7b3f98", label: "パープル" },
];

export function textStyle(fontSize: number | undefined, style: TextStyle | undefined): CSSProperties {
  return {
    fontSize,
    color: style?.color,
    fontWeight: style?.bold ? 700 : undefined,
    fontStyle: style?.italic ? "italic" : undefined,
    textDecoration: style?.underline ? "underline" : undefined,
    textUnderlineOffset: style?.underline ? "0.18em" : undefined,
  };
}

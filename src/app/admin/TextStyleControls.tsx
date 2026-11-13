"use client";

import { useEffect, useRef, useState } from "react";
import { textColors, type TextStyle } from "../ui/textStyle";
import styles from "./textStyle.module.css";

const fontSizes = [12, 14, 16, 18, 20, 24, 28, 32, 36];
const paths = {
  bold: "M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z",
  italic: "M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z",
  underline: "M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2z",
  check: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
};
const Svg = ({ d }: { d: string }) =>
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d={d} /></svg>;

export default function TextStyleControls({ label, fontSize, style, onFontSize, onStyle }: {
  label: string;
  fontSize: number;
  style: TextStyle;
  onFontSize: (size: number) => void;
  onStyle: (style: TextStyle) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!wrap.current?.contains(event.target as Node)) setOpen(false); };
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const flag = (key: "bold" | "italic" | "underline", name: string) =>
    <button type="button" className={style[key] ? `${styles.toggle} ${styles.on}` : styles.toggle}
      aria-pressed={Boolean(style[key])} aria-label={label + "を" + name} data-tip={name}
      onClick={() => onStyle({ ...style, [key]: !style[key] || undefined })}>
      <Svg d={paths[key]} />
    </button>;

  return <div className={styles.controls} role="group" aria-label={label + "の文字スタイル"}>
    <select className={styles.size} aria-label={label + "の文字サイズ"} value={fontSize}
      onChange={event => onFontSize(Number(event.target.value))}>
      {fontSizes.map(size => <option key={size} value={size}>{size}</option>)}
    </select>
    <span className={styles.divider} aria-hidden="true" />
    {flag("bold", "太字")}
    {flag("italic", "斜体")}
    {flag("underline", "下線")}
    <div className={styles.colorWrap} ref={wrap}>
      <button type="button" className={open ? `${styles.toggle} ${styles.on}` : styles.toggle}
        aria-haspopup="true" aria-expanded={open} aria-label={label + "の文字色"} data-tip="文字色"
        onClick={() => setOpen(v => !v)}>
        <span className={styles.colorA} aria-hidden="true">A
          <span className={styles.colorBar} style={{ background: style.color ?? "var(--ink)" }} />
        </span>
      </button>
      {open && <div className={styles.palette} role="menu" aria-label="文字色">
        {textColors.map(color => {
          const selected = (style.color ?? undefined) === color.value;
          return <button key={color.label} type="button" role="menuitemradio" aria-checked={selected}
            className={styles.swatch} title={color.label} aria-label={color.label}
            style={{ background: color.value ?? "var(--ink)" }}
            onClick={() => { onStyle({ ...style, color: color.value }); setOpen(false); }}>
            {selected && <Svg d={paths.check} />}
          </button>;
        })}
        <label className={styles.custom}>
          <input type="color" value={style.color ?? "#2b211d"}
            onChange={event => onStyle({ ...style, color: event.target.value.toLowerCase() })} />
          その他の色
        </label>
      </div>}
    </div>
  </div>;
}

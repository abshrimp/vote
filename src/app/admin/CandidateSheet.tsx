"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import styles from "./sheet.module.css";

export type SheetColumn = { key: string; label: string; fontSize?: number; maxLength: number; mono?: boolean; minWidth?: number };
export type SheetRow = { id: string; votes: number; href: string };
type Cell = { r: number; c: number };
export type CellUpdate = { row: number; key: string; value: string };

/** Spreadsheet text (TSV, quoted cells allowed) → rows of cells. */
export function parseTsv(text: string): string[][] {
  let source = text.replace(/\r\n?/g, "\n");
  if (source.endsWith("\n")) source = source.slice(0, -1);
  const rows: string[][] = [[]];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === "\t") { rows[rows.length - 1].push(cell); cell = ""; }
    else if (ch === "\n") { rows[rows.length - 1].push(cell); rows.push([]); cell = ""; }
    else cell += ch;
  }
  rows[rows.length - 1].push(cell);
  return rows;
}

export function toTsv(rows: string[][]) {
  return rows.map(row => row.map(value =>
    /[\t\n"]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value).join("\t")).join("\n");
}

const clean = (value: string, max: number) => value.replace(/[\r\n\t]+/g, " ").slice(0, max);

export default function CandidateSheet({ columns, rows, getValue, onChange, onAddRows, disabled }: {
  columns: SheetColumn[];
  rows: SheetRow[];
  getValue: (row: number, key: string) => string;
  onChange: (updates: CellUpdate[]) => void;
  onAddRows: (rows: Record<string, string>[]) => number;
  disabled?: boolean;
}) {
  const draftIndex = rows.length;
  const [anchor, setAnchor] = useState<Cell | null>(null);
  const [focus, setFocus] = useState<Cell | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState("");
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const pendingFocus = useRef<Cell | null>(null);
  const lastCol = columns.length - 1;

  const range = anchor && focus ? {
    r0: Math.min(anchor.r, focus.r), r1: Math.max(anchor.r, focus.r),
    c0: Math.min(anchor.c, focus.c), c1: Math.max(anchor.c, focus.c),
  } : null;
  const multi = Boolean(range && (range.r0 !== range.r1 || range.c0 !== range.c1));
  const inRange = (r: number, c: number) =>
    Boolean(range && r >= range.r0 && r <= range.r1 && c >= range.c0 && c <= range.c1);

  useEffect(() => {
    if (!dragging) return;
    const stop = () => setDragging(false);
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, [dragging]);

  // Focus a cell that only exists after the next render (e.g. a freshly added row).
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    inputs.current.get(target.r + ":" + target.c)?.focus();
  });

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(""), 4000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const valueAt = (r: number, c: number) =>
    r === draftIndex ? draft[columns[c].key] ?? "" : getValue(r, columns[c].key);

  function moveTo(r: number, c: number, extend = false) {
    const next = { r: Math.max(0, Math.min(draftIndex, r)), c: Math.max(0, Math.min(lastCol, c)) };
    setFocus(next);
    if (!extend) setAnchor(next);
    const input = inputs.current.get(next.r + ":" + next.c);
    if (input) {
      input.focus();
      if (!extend) input.select();
    } else pendingFocus.current = next;
  }

  function commitDraft(): boolean {
    if (!Object.values(draft).some(v => v.trim())) return false;
    if (!(draft[columns[0].key] ?? "").trim()) {
      setStatus("名前を入力すると候補として追加されます");
      return false;
    }
    onAddRows([draft]);
    setDraft({});
    return true;
  }

  function writeRange(values: (r: number, c: number) => string | null) {
    if (!range) return;
    const updates: CellUpdate[] = [];
    for (let r = range.r0; r <= Math.min(range.r1, draftIndex - 1); r++)
      for (let c = range.c0; c <= range.c1; c++) {
        const value = values(r, c);
        if (value !== null) updates.push({ row: r, key: columns[c].key, value: clean(value, columns[c].maxLength) });
      }
    if (updates.length) onChange(updates);
  }

  function selectedTsv() {
    if (!range) return "";
    const out: string[][] = [];
    for (let r = range.r0; r <= range.r1; r++) {
      const row: string[] = [];
      for (let c = range.c0; c <= range.c1; c++) row.push(valueAt(r, c));
      out.push(row);
    }
    return toTsv(out);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>, r: number, c: number) {
    const input = event.currentTarget;
    const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
    const atEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
    const extend = event.shiftKey;
    const from = focus ?? { r, c };
    switch (event.key) {
      case "Enter":
        event.preventDefault();
        if (r === draftIndex) { if (commitDraft()) moveTo(draftIndex + 1, 0); return; }
        moveTo(r + (extend ? -1 : 1), c);
        return;
      case "ArrowDown":
        event.preventDefault();
        if (!extend && r === draftIndex) return;
        moveTo(from.r + 1, from.c, extend);
        return;
      case "ArrowUp":
        event.preventDefault();
        moveTo(from.r - 1, from.c, extend);
        return;
      case "ArrowLeft":
        if (extend && multi) { event.preventDefault(); moveTo(from.r, from.c - 1, true); }
        else if (!extend && atStart && c > 0) { event.preventDefault(); moveTo(r, c - 1); }
        return;
      case "ArrowRight":
        if (extend && multi) { event.preventDefault(); moveTo(from.r, from.c + 1, true); }
        else if (!extend && atEnd && c < lastCol) { event.preventDefault(); moveTo(r, c + 1); }
        return;
      case "Escape":
        if (multi) { event.preventDefault(); setAnchor({ r, c }); setFocus({ r, c }); }
        return;
      case "Delete":
      case "Backspace":
        if (multi) { event.preventDefault(); writeRange(() => ""); }
        return;
      case "a":
        if ((event.ctrlKey || event.metaKey) && input.selectionStart === 0 && input.selectionEnd === input.value.length) {
          event.preventDefault();
          setAnchor({ r: 0, c: 0 });
          setFocus({ r: Math.max(0, draftIndex - 1), c: lastCol });
        }
        return;
    }
  }

  function onCopy(event: ClipboardEvent<HTMLTableElement>, cut = false) {
    const input = event.target as HTMLInputElement;
    const hasTextSelection = input.selectionStart !== input.selectionEnd &&
      !(input.selectionStart === 0 && input.selectionEnd === input.value.length);
    if (!range || (!multi && hasTextSelection)) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", selectedTsv());
    if (cut) writeRange(() => "");
    const count = (range.r1 - range.r0 + 1) * (range.c1 - range.c0 + 1);
    if (count > 1) setStatus(count + "セルを" + (cut ? "切り取りました" : "コピーしました"));
  }

  function onPaste(event: ClipboardEvent<HTMLTableElement>) {
    if (!range) return;
    const matrix = parseTsv(event.clipboardData.getData("text/plain"));
    const single = matrix.length === 1 && matrix[0].length === 1;
    if (single && !multi) {
      if (focus?.r === draftIndex) return; // let the input handle it natively
      event.preventDefault();
      writeRange(() => matrix[0][0]);
      return;
    }
    event.preventDefault();
    if (single) { writeRange(() => matrix[0][0]); setStatus("選択範囲に貼り付けました"); return; }

    const updates: CellUpdate[] = [];
    const created: Record<string, string>[] = [];
    let skipped = 0;
    matrix.forEach((cells, i) => {
      const r = range.r0 + i;
      const record: Record<string, string> = r === draftIndex ? { ...draft } : {};
      cells.forEach((raw, j) => {
        const c = range.c0 + j;
        if (c > lastCol) return;
        const value = clean(raw, columns[c].maxLength);
        if (r < draftIndex) updates.push({ row: r, key: columns[c].key, value });
        else record[columns[c].key] = value;
      });
      if (r >= draftIndex) {
        if ((record[columns[0].key] ?? "").trim()) created.push(record);
        else skipped++;
      }
    });
    if (updates.length) onChange(updates);
    const added = created.length ? onAddRows(created) : 0;
    if (range.r0 <= draftIndex && created.length) setDraft({});
    const width = Math.min(lastCol, range.c0 + Math.max(...matrix.map(m => m.length)) - 1);
    setAnchor({ r: range.r0, c: range.c0 });
    setFocus({ r: Math.max(range.r0, Math.min(range.r0 + matrix.length - 1, draftIndex + added - 1)), c: width });
    setStatus([
      updates.length && updates.length + "セルを更新",
      added && added + "件の候補を追加",
      skipped && "名前が空の" + skipped + "行は追加しませんでした",
    ].filter(Boolean).join("・"));
  }

  const cellClass = (r: number, c: number) => [
    styles.cell,
    inRange(r, c) && multi ? styles.inRange : "",
    focus?.r === r && focus?.c === c ? styles.focused : "",
  ].join(" ");

  return <div className={styles.wrap}>
    <div className={styles.scroller}>
      <table className={dragging && multi ? `${styles.sheet} ${styles.noSelect}` : styles.sheet}
        onCopy={e => onCopy(e)} onCut={e => onCopy(e, true)} onPaste={onPaste}>
        <thead>
          <tr>
            <th className={styles.corner} aria-hidden="true" />
            {columns.map((column, c) => <th key={column.key} scope="col" style={{ minWidth: column.minWidth ?? 160 }}
              className={range && c >= range.c0 && c <= range.c1 ? styles.headActive : undefined}
              onMouseDown={event => {
                event.preventDefault();
                setAnchor({ r: 0, c });
                setFocus({ r: Math.max(0, draftIndex - 1), c });
                inputs.current.get("0:" + c)?.focus({ preventScroll: true });
              }}>{column.label}</th>)}
            <th scope="col" className={styles.readonlyHead}>票数</th>
            <th scope="col" className={styles.readonlyHead}><span className={styles.visuallyHidden}>リンク</span></th>
          </tr>
        </thead>
        <tbody>
          {[...rows, null].map((row, r) => <tr key={row?.id ?? "draft"} className={row ? undefined : styles.draftRow}
            onBlur={event => {
              if (row || event.currentTarget.contains(event.relatedTarget as Node)) return;
              commitDraft();
            }}>
            <th scope="row" className={range && r >= range.r0 && r <= range.r1 ? `${styles.rowHead} ${styles.headActive}` : styles.rowHead}
              onMouseDown={event => {
                event.preventDefault();
                setAnchor({ r, c: 0 });
                setFocus({ r, c: lastCol });
                inputs.current.get(r + ":0")?.focus({ preventScroll: true });
              }}>{row ? r + 1 : "+"}</th>
            {columns.map((column, c) => <td key={column.key} className={cellClass(r, c)}
              onMouseDown={event => {
                if (event.shiftKey && anchor) {
                  event.preventDefault();
                  setFocus({ r, c });
                  return;
                }
                setAnchor({ r, c }); setFocus({ r, c }); setDragging(true);
              }}
              onMouseEnter={event => {
                if (!dragging || event.buttons !== 1) return;
                setFocus({ r, c });
                if (anchor && (anchor.r !== r || anchor.c !== c)) {
                  const active = document.activeElement;
                  if (active instanceof HTMLInputElement) active.setSelectionRange(active.selectionEnd, active.selectionEnd);
                }
              }}>
              <input
                ref={node => { if (node) inputs.current.set(r + ":" + c, node); else inputs.current.delete(r + ":" + c); }}
                aria-label={(row ? (r + 1) + "行目の" : "新しい候補の") + column.label}
                className={column.mono ? styles.mono : undefined}
                style={column.fontSize ? { fontSize: column.fontSize } : undefined}
                maxLength={column.maxLength}
                size={1}
                disabled={disabled}
                placeholder={!row && c === 0 ? "候補を追加…" : undefined}
                value={valueAt(r, c)}
                onFocus={() => {
                  if (focus?.r === r && focus?.c === c) return;
                  if (!multi || !inRange(r, c)) { setAnchor({ r, c }); setFocus({ r, c }); }
                }}
                onKeyDown={event => onKeyDown(event, r, c)}
                onChange={event => {
                  const value = clean(event.target.value, column.maxLength);
                  if (row) onChange([{ row: r, key: column.key, value }]);
                  else setDraft(d => ({ ...d, [column.key]: value }));
                }} />
            </td>)}
            <td className={styles.readonly}>{row ? row.votes : ""}</td>
            <td className={styles.readonly}>{row && <a href={row.href} target="_blank" rel="noopener noreferrer"
              aria-label={(r + 1) + "行目の投票ページを開く"} className={styles.openLink}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor"
                d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3z"/></svg>
            </a>}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <p className={styles.status} aria-live="polite">
      {status || "スプレッドシートからコピーして貼り付けられます。ドラッグや Shift+クリックで範囲を選択し、コピーもできます。"}
    </p>
  </div>;
}

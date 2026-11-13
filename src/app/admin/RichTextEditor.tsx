"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseRich, safeHref, sanitizeRich, serializeRich } from "@/lib/voting/richtext.mjs";
import styles from "./richEditor.module.css";
import uiStyles from "../ui/ui.module.css";
import { Dialog } from "../ui/Dialog";

const icons = {
  bold: "M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z",
  italic: "M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z",
  underline: "M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2z",
  link: "M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z",
  ol: "M2 17h2v.5H3v1h1v.5H2v1h3v-4H2zm1-9h1V4H2v1h1zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2zm5-6v2h14V5zm0 14h14v-2H7zm0-6h14v-2H7z",
  ul: "M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7zm0-6h14v-2H7zm0-8v2h14V5z",
  clear: "M3.27 5 2 6.27l6.97 6.97L6.5 19h3l1.57-3.66L16.73 21 18 19.73 3.55 5.27zM6 5v.18L8.82 8h2.4l-.72 1.68 2.1 2.1L14.21 8H20V5z",
};
const Icon = ({ d }: { d: string }) =>
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d={d} /></svg>;
const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Command = "bold" | "italic" | "underline" | "insertOrderedList" | "insertUnorderedList";
const TOOLS: { command: Command; label: string; icon: string }[] = [
  { command: "bold", label: "太字", icon: icons.bold },
  { command: "italic", label: "斜体", icon: icons.italic },
  { command: "underline", label: "下線", icon: icons.underline },
];
const LISTS: { command: Command; label: string; icon: string }[] = [
  { command: "insertOrderedList", label: "番号付きリスト", icon: icons.ol },
  { command: "insertUnorderedList", label: "箇条書き", icon: icons.ul },
];

/**
 * A one-line field that grows with its text, with a formatting toolbar (bold, italic,
 * underline, link, numbered list, bulleted list, clear) shown while it is being edited.
 * The DOM is only ever filled from the sanitised subset; output is sanitised again.
 */
export type LinkSection = { id: string; label: string; kind: string };

export default function RichTextEditor({ value, onChange, placeholder, label, className, sections = [] }: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
  className?: string;
  /** Sections of the page that a link can jump to. */
  sections?: LinkSection[];
}) {
  const editor = useRef<HTMLDivElement>(null);
  const emitted = useRef<string | null>(null);
  const range = useRef<Range | null>(null);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [linkError, setLinkError] = useState(false);
  const editing = useRef<HTMLAnchorElement | null>(null);
  const textInput = useRef<HTMLInputElement>(null);
  const urlInput = useRef<HTMLInputElement>(null);

  // Value from outside (initial load, switching blocks) → editor contents.
  useEffect(() => {
    const element = editor.current;
    if (!element || value === emitted.current) return;
    element.innerHTML = serializeRich(parseRich(value));
    emitted.current = value;
  }, [value]);

  const emit = useCallback(() => {
    const element = editor.current;
    if (!element) return;
    const clean = sanitizeRich(element.innerHTML);
    if (!clean && element.innerHTML) element.innerHTML = ""; // show the placeholder again
    emitted.current = clean;
    onChange(clean);
  }, [onChange]);

  const linkAt = () => {
    const node = window.getSelection()?.anchorNode;
    const element = node instanceof Element ? node : node?.parentElement;
    const link = element?.closest("a");
    return link && editor.current?.contains(link) ? link : null;
  };
  const refresh = useCallback(() => {
    if (!editor.current?.contains(window.getSelection()?.anchorNode ?? null)) return;
    const state: Record<string, boolean> = { link: Boolean(linkAt()) };
    for (const tool of [...TOOLS, ...LISTS]) {
      try { state[tool.command] = document.queryCommandState(tool.command); } catch { state[tool.command] = false; }
    }
    setActive(state);
  }, []);
  useEffect(() => {
    if (!focused) return;
    document.addEventListener("selectionchange", refresh);
    return () => document.removeEventListener("selectionchange", refresh);
  }, [focused, refresh]);

  const run = (command: string, argument?: string) => {
    editor.current?.focus();
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(command, false, argument);
    emit();
    refresh();
  };

  // The link dialog: text to show, where it goes (URL, #公開ID or a section of the page).
  const openLink = () => {
    const selection = window.getSelection();
    const inside = selection?.rangeCount ? editor.current?.contains(selection.anchorNode) : false;
    range.current = inside && selection ? selection.getRangeAt(0).cloneRange() : null;
    editing.current = inside ? linkAt() : null;
    setLinkText(editing.current?.textContent ?? (inside ? selection?.toString() ?? "" : ""));
    setLinkUrl(editing.current?.getAttribute("href") ?? "");
    setLinkError(false);
    setLinkOpen(true);
  };
  useEffect(() => {
    if (!linkOpen) return;
    const timer = window.setTimeout(() => (linkText ? urlInput : textInput).current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [linkOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // The page behind an open modal is inert, so edits wait until the dialog has closed.
  const afterClose = useRef<(() => void) | null>(null);
  const dialogClosed = () => {
    const action = afterClose.current;
    afterClose.current = null;
    action?.();
  };

  /** Puts the caret back where it was (or around the link being edited) before changing the text. */
  const restoreSelection = () => {
    editor.current?.focus();
    const selection = window.getSelection();
    if (!selection) return;
    const target = document.createRange();
    if (editing.current && editor.current?.contains(editing.current)) target.selectNode(editing.current);
    else if (range.current) { target.setStart(range.current.startContainer, range.current.startOffset); target.setEnd(range.current.endContainer, range.current.endOffset); }
    else { target.selectNodeContents(editor.current!); target.collapse(false); }
    selection.removeAllRanges();
    selection.addRange(target);
  };
  const applyLink = () => {
    const href = safeHref(linkUrl);
    if (!href) { setLinkError(true); return; }
    const section = sections.find(item => "#" + item.id === href);
    const text = linkText.trim() || section?.label || linkUrl.trim();
    afterClose.current = () => {
      restoreSelection();
      run("insertHTML", '<a href="' + escapeHtml(href) + '">' + escapeHtml(text) + "</a>");
    };
    setLinkOpen(false);
  };
  const removeLink = () => {
    afterClose.current = () => { restoreSelection(); run("unlink"); };
    setLinkOpen(false);
  };

  const tool = (item: { command: string; label: string; icon: string }, onPress: () => void, on: boolean) =>
    <button key={item.label} type="button" className={on ? `${styles.tool} ${styles.on}` : styles.tool}
      aria-label={item.label} aria-pressed={on} data-tip={item.label}
      onMouseDown={event => event.preventDefault()} onClick={onPress}>
      <Icon d={item.icon} />
    </button>;

  return <div className={styles.wrap}>
    <div ref={editor} className={className ? `${styles.editor} ${className}` : styles.editor}
      contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={label}
      data-placeholder={placeholder}
      onFocus={() => { setFocused(true); refresh(); }}
      onBlur={() => setFocused(false)}
      onInput={emit}
      onKeyDown={event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openLink(); }
      }}
      onPaste={event => {
        // Pasted content is reduced to the supported formats before it enters the editor.
        event.preventDefault();
        const html = event.clipboardData.getData("text/html");
        const text = event.clipboardData.getData("text/plain");
        const clean = serializeRich(parseRich(html || text));
        if (clean) run("insertHTML", clean);
      }} />
    {(focused || linkOpen) && <div className={styles.toolbar} role="toolbar" aria-label={label + "の書式"}>
      {TOOLS.map(item => tool(item, () => run(item.command), Boolean(active[item.command])))}
      {tool({ command: "link", label: "リンク", icon: icons.link }, openLink, Boolean(active.link) || linkOpen)}
      {LISTS.map(item => tool(item, () => run(item.command), Boolean(active[item.command])))}
      {tool({ command: "clear", label: "書式をクリア", icon: icons.clear }, () => { run("removeFormat"); run("unlink"); }, false)}
    </div>}
    <Dialog open={linkOpen} onClose={() => setLinkOpen(false)} onClosed={dialogClosed} size="large"
      title={editing.current ? "リンクを編集" : "リンクを追加"}
      actions={<>
        {editing.current && <button type="button" className={uiStyles.textButton + " " + styles.unlink} onClick={removeLink}>リンクを解除</button>}
        <button type="button" className={uiStyles.textButton} onClick={() => setLinkOpen(false)}>キャンセル</button>
        <button type="button" className={styles.linkApply} disabled={!linkUrl.trim()} onClick={applyLink}>適用</button>
      </>}>
      <form className={styles.linkForm} onSubmit={event => { event.preventDefault(); applyLink(); }}>
        <label>表示するテキスト
          <input ref={textInput} value={linkText} placeholder="（空欄ならリンク先を表示）" maxLength={200}
            onChange={event => setLinkText(event.target.value)} />
        </label>
        <label>リンク先
          <input ref={urlInput} value={linkUrl} placeholder="https://… または #公開ID" inputMode="url"
            className={linkError ? styles.linkError : undefined} aria-invalid={linkError}
            onChange={event => { setLinkUrl(event.target.value); setLinkError(false); }} />
          {linkError && <span className={styles.linkHint}>https:// から始まるURLか、#公開ID のように入力してください</span>}
        </label>
        <button type="submit" hidden />
      </form>
      {sections.length > 0 && <div className={styles.sectionList}>
        <span className={styles.sectionHead}>ページ内のセクションにリンク</span>
        <ul role="listbox" aria-label="リンク先のセクション">
          {sections.map(section => <li key={section.id}>
            <button type="button" role="option" aria-selected={linkUrl === "#" + section.id}
              className={linkUrl === "#" + section.id ? styles.sectionOn : undefined}
              onClick={() => { setLinkUrl("#" + section.id); setLinkError(false); if (!linkText.trim()) setLinkText(section.label); }}
              onDoubleClick={() => applyLink()}>
              <span className={styles.sectionKind}>{section.kind}</span>
              <span className={styles.sectionLabel}>{section.label}</span>
              {linkUrl === "#" + section.id && <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className={styles.sectionCheck}>
                <path fill="currentColor" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>}
            </button>
          </li>)}
        </ul>
      </div>}
    </Dialog>
  </div>;
}

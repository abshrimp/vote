"use client";

import { useEffect, useState } from "react";
import VoteBoard, { type Action as VoteAction, type LayoutBlock, type Poll as VotePoll } from "../vote/VoteBoard";
import voteStyles from "../vote/vote.module.css";
import styles from "./preview.module.css";
import Mark from "../Mark";
import RichText from "../ui/RichText";
import { themeVars, useWebFonts, type ThemeSettings } from "../ui/theme";
import type { TextStyle } from "../ui/textStyle";

type AdminPoll = {
  id: string; title: string; description: string; max_votes: number; is_published: number;
  nameFontSize: number; nameStyle?: TextStyle;
  columns: ({ key: string; label: string; fontSize: number; hideLabel?: boolean } & TextStyle)[];
  candidates: { id: string; name: string; extra?: Record<string, string> }[];
};
type AdminAction = {
  id: string; title: string; description: string; kind: "claim" | "link" | "notice";
  config: VoteAction["config"]; is_published: number;
};

/**
 * Shows the current, unsaved editor state the way visitors will see it.
 * Everything is read-only; unpublished sections are included and labelled.
 */
export default function PreviewPane({ open, onClose, polls, actions, blocks, title, description, theme }: {
  open: boolean;
  onClose: () => void;
  polls: AdminPoll[];
  actions: AdminAction[];
  blocks: LayoutBlock[];
  title: string;
  description: string;
  theme: ThemeSettings;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  useWebFonts(open ? [theme.headingFont, theme.bodyFont] : []);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", close);
    document.documentElement.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", close); document.documentElement.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;

  const header = blocks.find(block => block.kind === "heading");
  const hidden = (published: number) => published === 1 ? "" : "（非公開）";
  const votePolls: VotePoll[] = polls.map(poll => ({
    id: poll.id, title: poll.title + hidden(poll.is_published), description: poll.description,
    candidates: poll.candidates.map(c => ({ id: c.id, name: c.name, extra: c.extra })),
    nameFontSize: poll.nameFontSize, nameStyle: poll.nameStyle, columns: poll.columns,
    voted: false, maxVotes: poll.max_votes, selectedIds: [], conditionIds: [],
  }));
  const voteActions: VoteAction[] = actions.map(action => ({
    id: action.id, title: action.title + hidden(action.is_published), description: action.description,
    kind: action.kind, config: action.config, eligible: true, status: null, usedAt: null,
  }));
  const noop = async () => {};

  return <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="プレビュー">
    <header className={styles.bar}>
      <strong>プレビュー</strong>
      <span className={styles.note}>保存前の内容です。投票やボタンは動作しません</span>
      <div className={styles.devices} role="radiogroup" aria-label="表示幅">
        {(["desktop", "mobile"] as const).map(kind => <button key={kind} type="button" role="radio"
          aria-checked={device === kind} className={device === kind ? styles.deviceOn : undefined}
          onClick={() => setDevice(kind)}>{kind === "desktop" ? "PC" : "スマホ"}</button>)}
      </div>
      <button type="button" className={styles.close} onClick={onClose} aria-label="プレビューを閉じる">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor"
          d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>
    </header>
    <div className={styles.stage}>
      <div className={device === "mobile" ? `${styles.frame} ${styles.mobile}` : styles.frame}>
        <main className={voteStyles.main} style={themeVars(theme)} inert>
          <header className={voteStyles.appbar}>
            {theme.logo ? <img src={theme.logo} alt="" className={voteStyles.mark}/> : <Mark className={voteStyles.mark}/>}
            <span className={voteStyles.appbarTitle}>{title || "投票フォーム"}</span>
          </header>
          <div className={voteStyles.container}>
            <header className={voteStyles.header}>
              <h1>{title || "投票フォーム"}</h1>
              {description && <RichText className={voteStyles.lead} value={description}/>}
            </header>
            <VoteBoard polls={votePolls} actions={voteActions}
              blocks={header ? blocks.filter(block => block.id !== header.id) : blocks}
              selected={{}} setSelected={() => {}} saving={null} token="" siteKey="preview"
              submit={noop} claimAction={noop} openLink={noop} />
          </div>
          <footer className={voteStyles.footer}>
            {theme.organizerName && <span>© {theme.organizerName}</span>}
          </footer>
        </main>
      </div>
    </div>
  </div>;
}

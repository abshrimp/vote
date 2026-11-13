"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import styles from "./vote.module.css";
import RichText from "../ui/RichText";
import { textStyle, type TextStyle } from "../ui/textStyle";
import { composeLayout } from "@/lib/voting/layout.mjs";

export type Poll = {
  id: string;
  title: string;
  description: string;
  candidates: { id: string; name: string; extra?: Record<string,string> }[];
  nameFontSize: number;
  nameStyle?: TextStyle;
  columns: ({key:string;label:string;fontSize:number;hideLabel?:boolean} & TextStyle)[];
  voted: boolean;
  maxVotes: number;
  selectedIds: string[];
  conditionIds: string[];
};
export type Action = {
  id: string;
  title: string;
  description: string;
  kind: "claim" | "link" | "notice";
  config: {
    url?: string; buttonLabel?: string; confirm?: string;
    claimLabel?: string; lockedLabel?: string; usedLabel?: string; claimConfirm?: string;
  };
  eligible: boolean;
  status: string | null;
  usedAt?: string | null;
};
export type LayoutBlock = {
  id: string;
  kind: "heading" | "text" | "poll" | "action";
  reference_id: string | null;
  title: string;
  body: string;
  is_published: number;
};

export default function VoteBoard({
  polls, actions, blocks, selected, setSelected, saving, token, siteKey, submit, claimAction, openLink,
}: {
  polls: Poll[];
  actions: Action[];
  blocks: LayoutBlock[];
  selected: Record<string,string>;
  setSelected: Dispatch<SetStateAction<Record<string,string>>>;
  saving: string | null;
  token: string;
  siteKey: string;
  submit: (poll: Poll, candidateId: string) => Promise<void>;
  claimAction: (action: Action) => Promise<void>;
  openLink: (action: Action) => Promise<void>;
}) {
  const [filters, setFilters] = useState<Record<string,string>>({});
  const pollMap = new Map(polls.map(p => [p.id, p]));
  const actionMap = new Map(actions.map(a => [a.id, a]));
  return <div className={styles.board}>
    {composeLayout(blocks, polls, actions).map((item: {
      id: string; kind: string; title?: string; body?: string; pollId?: string; actionId?: string;
    }) => {
      if (item.kind === "heading") return <section key={item.id} data-section={item.id} className={styles.layoutHeading}>
        <h2>{item.title}</h2>
        {item.body && <RichText className={styles.blockBody} value={item.body}/>}
      </section>;

      if (item.kind === "text") return <section key={item.id} data-section={item.id} className={styles.layoutText}>
        {item.title && <h2>{item.title}</h2>}
        <RichText className={styles.blockBody} value={item.body ?? ""}/>
      </section>;

      if (item.kind === "poll") {
        const poll = pollMap.get(item.pollId ?? "");
        if (!poll) return null;
        const done = poll.voted || poll.conditionIds.length > 0 || poll.selectedIds.length >= poll.maxVotes;
        return <section key={item.id} id={"poll-" + poll.id} data-section={item.id} className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <h2>{poll.title}</h2>
              {poll.description && <RichText className={styles.description} value={poll.description}/>}
            </div>
            <span className={done ? `${styles.counter} ${styles.counterDone}` : styles.counter}
              aria-label={`この部門は${poll.maxVotes}票中${poll.selectedIds.length}票が正式投票、${poll.conditionIds.length}件が条件判定用`}>
              {poll.selectedIds.length + poll.conditionIds.length} / {poll.maxVotes} 件
            </span>
          </div>
          {poll.conditionIds.length > 0 && <p className={styles.description}>既に投票済みの可能性があります。この部門は追加投票できません。条件判定には反映されています。</p>}
          {poll.candidates.length > 15 && <input className={styles.candidateSearch}
            type="search" placeholder="候補名で検索" aria-label={poll.title+"の候補を検索"}
            value={filters[poll.id]??""} onChange={event=>setFilters(old=>({...old,[poll.id]:event.target.value}))}/>}
          <div className={styles.choices} role="group" aria-label={poll.title + " の候補"}>
            {poll.candidates.filter(candidate=>candidate.name.toLowerCase().includes((filters[poll.id]??"").toLowerCase())).map(candidate => {
              const already = poll.selectedIds.includes(candidate.id);
              return <div className={styles.candidateVote} key={candidate.id}
                id={"candidate-" + candidate.id}>
                <div className={styles.candidateDetails}>
                  <span className={styles.candidateName} style={textStyle(poll.nameFontSize, poll.nameStyle)}>{candidate.name}</span>
                  {poll.columns.filter(col=>(candidate.extra?.[col.key]??"").trim()).map(col=><div className={styles.candidateExtra} key={col.key} style={{fontSize:col.fontSize}}>
                    {!col.hideLabel && <span className={styles.extraLabel}>{col.label}</span>}<span style={textStyle(col.fontSize, col)}>{candidate.extra?.[col.key]??""}</span>
                  </div>)}
                </div>
                <button type="button"
                  className={already ? `${styles.candidateButton} ${styles.voted}` : styles.candidateButton}
                  disabled={already || done || saving !== null || !token || !siteKey}
                  onClick={() => void submit(poll, candidate.id)}>
                  {already && <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor"
                    d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>}
                  {already ? "投票済み" : saving === poll.id ? "送信中…" : "投票する"}
                </button>
              </div>;
            })}
          </div>
        </section>;
      }

      if (item.kind === "action") {
        const action = actionMap.get(item.actionId ?? "");
        if (!action) return null;
        return <section key={item.id} data-section={item.id} className={styles.verification}>
          <article className={styles.actionItem}>
            <h2>{action.title}</h2>
            <RichText className={styles.actionText} value={action.description}/>
            {action.kind === "claim" && action.status === "used" && <div className={`${styles.claimStatus} ${styles.claimUsed}`}>
              <span className={styles.claimState}>{action.config.usedLabel || "引換済み"}</span>
              {action.usedAt && <dl><dt>引き換え</dt>
                <dd>{new Date(action.usedAt).toLocaleString("ja-JP")}</dd></dl>}
            </div>}
            {action.kind === "claim" ? (action.status === "used" ? null :
              <button className={styles.submit} type="button"
                disabled={!action.eligible || !token || saving !== null}
                onClick={() => void claimAction(action)}>
                {saving === action.id ? "処理中…"
                  : action.eligible ? action.config.claimLabel || "引き換える"
                  : action.config.lockedLabel || "条件を満たすと引き換えられます"}
              </button>)
              : action.kind === "link" && action.eligible && action.config.url ? (action.config.confirm
                ? <button type="button" className={styles.actionLink} onClick={() => void openLink(action)}>
                  {action.config.buttonLabel || "リンクを開く"}</button>
                : <a className={styles.actionLink} href={action.config.url}
                  target="_blank" rel="noopener noreferrer">{action.config.buttonLabel || "リンクを開く"}</a>)
              : action.kind === "notice" && action.eligible ? null
              : <p className={styles.actionHint}>条件を満たすと表示・利用できるようになります。</p>}
          </article>
        </section>;
      }
      return null;
    })}
  </div>;
}

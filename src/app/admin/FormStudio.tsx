"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./studio.module.css";
import AbuseReport from "./AbuseReport";
import Mark from "../Mark";
import CandidateSheet from "./CandidateSheet";
import PreviewPane from "./PreviewPane";
import RichTextEditor from "./RichTextEditor";
import AdminEmails from "./AdminEmails";
import { useEditorHistory } from "./useEditorHistory";
import { parseRich, plainText } from "@/lib/voting/richtext.mjs";
import RichText from "../ui/RichText";
import AutoTextarea from "../ui/AutoTextarea";
import TextStyleControls from "./TextStyleControls";
import { textStyle, type TextStyle } from "../ui/textStyle";
import { fontFamily, fontOptions, themeRoles, themeVars, useWebFonts, type ColorKey, type ThemeSettings } from "../ui/theme";
import { Dialog } from "../ui/Dialog";
import { Snackbar, useConfirm } from "../ui/Dialog";

const Icon = ({ d }: { d: string }) =>
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d={d}/></svg>;
const icons = {
  add: "M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm-1-9V7h2v4h4v2h-4v4h-2v-4H7v-2z",
  title: "M5 4v3h5.5v12h3V7H19V4z",
  text: "M3 5h18v2H3zm0 4h18v2H3zm0 4h18v2H3zm0 4h12v2H3z",
  action: "M20 12c0-1.1.9-2 2-2V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v4a2 2 0 0 1 0 4v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 1-2-2zm-2-1.46a4 4 0 0 0 0 6.92V18H6v-1.54a4 4 0 0 0 0-6.92V6h12zM11 15h2v2h-2zm0-4h2v2h-2zm0-4h2v2h-2z",
  up: "M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z",
  down: "M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z",
  delete: "M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM8 9h8v10H8zm7.5-5-1-1h-5l-1 1H5v2h14V4z",
  close: "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  preview: "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  undo: "M12.5 8c-4.4 0-8 2.7-9.5 7 2.2-2.2 5-3.5 9.5-3.5 3.7 0 6 1.5 8.5 4.5-.7-4.9-3.6-8-8.5-8zM9 4 2 10l7 6V4z",
  redo: "M11.5 8c4.4 0 8 2.7 9.5 7-2.2-2.2-5-3.5-9.5-3.5-3.7 0-6 1.5-8.5 4.5.7-4.9 3.6-8 8.5-8zM15 4l7 6-7 6V4z",
  refresh: "M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z",
  logout: "M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8v-2H4z",
  label: "M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12zM16 17H5V7h11l3.55 5z",
  labelOff: "M3.25 2.75 2 4l1.53 1.53C3.2 5.88 3 6.42 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.21 0 .42-.04.61-.1L19.75 22 21 20.75zM5 17V7.01L14.99 17zm11.63-11.16L22 12l-2.48 3.49-1.43-1.43L19.55 12 16 7H9.94l-2-2H16c.67 0 1.27.33 1.63.84z",
  open: "M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3z",
  addSmall: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z",
  check: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  drag: "M11 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm-2-8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0-6a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
};

type Column = { key: string; label: string; fontSize: number; hideLabel?: boolean } & TextStyle;
type Candidate = { id: string; name: string; votes: number; publicId?: string; extra?: Record<string,string> };
type Poll = {
  id: string; title: string; description: string; max_votes: number;
  starts_at: string; ends_at: string; is_published: number; candidates: Candidate[]; publicId?: string; nameFontSize: number; nameStyle?: TextStyle; columns: Column[];
};
type Rule = {
  type: "min_distinct_polls" | "min_total_votes" | "voted_poll" | "action_used";
  count?: number; pollId?: string; actionId?: string;
};
type Condition = { type: "all" | "any"; rules: Rule[] };
type Action = {
  id: string; title: string; description: string; kind: "claim" | "link" | "notice";
  condition: Condition; config: ActionConfig; starts_at: string; ends_at: string;
  is_published: number; claims: { status: string; count: number }[];
};
type AdminData = { polls: Poll[]; actions: Action[] };
type Block = {
  id: string; kind: "heading" | "text" | "poll" | "action"; reference_id: string | null;
  title: string; body: string; sort_order: number; is_published: number;
};
type PollDraft = { title: string; description: string; maxVotes: number; startsAt: string; endsAt: string; isPublished: boolean; publicId: string; nameFontSize: number; nameStyle: TextStyle; columns: Column[] };
type ActionConfig = {
  url?: string; buttonLabel?: string; confirm?: string;
  claimLabel?: string; lockedLabel?: string; usedLabel?: string; claimConfirm?: string;
};
type ActionDraft = {
  title: string; description: string; kind: Action["kind"]; url: string; condition: Condition;
  startsAt: string; endsAt: string; isPublished: boolean;
  // Button wording and confirmation messages (an empty message = no confirmation).
  buttonLabel: string; claimLabel: string; lockedLabel: string; usedLabel: string;
  confirmOn: boolean; confirm: string; claimConfirmOn: boolean; claimConfirm: string;
};
const DEFAULT_CONFIRM = "このボタンは運営スタッフが押してください。";
const configOf = (d: ActionDraft): ActionConfig =>
  d.kind === "link" ? { url: d.url, buttonLabel: d.buttonLabel, confirm: d.confirmOn ? d.confirm : "" }
    : d.kind === "claim" ? { claimLabel: d.claimLabel, lockedLabel: d.lockedLabel, usedLabel: d.usedLabel,
      claimConfirm: d.claimConfirmOn ? d.claimConfirm : "" }
      : {};
type Item = { id: string; kind: Block["kind"]; block?: Block; poll?: Poll; action?: Action; virtual?: boolean };

function localDate(iso: string) {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function dates() {
  return { startsAt: localDate(new Date().toISOString()), endsAt: localDate(new Date(Date.now() + 3 * 86400000).toISOString()) };
}
const fromPoll = (p: Poll): PollDraft => ({
  title: p.title, description: p.description, maxVotes: p.max_votes,
  startsAt: localDate(p.starts_at), endsAt: localDate(p.ends_at), isPublished: p.is_published === 1, publicId: p.publicId ?? "",
  nameFontSize: p.nameFontSize ?? 16, nameStyle: structuredClone(p.nameStyle ?? {}), columns: structuredClone(p.columns ?? []),
});
const fromAction = (a: Action): ActionDraft => ({
  title: a.title, description: a.description, kind: a.kind, url: a.config.url ?? "",
  condition: structuredClone(a.condition), startsAt: localDate(a.starts_at),
  endsAt: localDate(a.ends_at), isPublished: a.is_published === 1,
  buttonLabel: a.config.buttonLabel ?? "", claimLabel: a.config.claimLabel ?? "", lockedLabel: a.config.lockedLabel ?? "",
  usedLabel: a.config.usedLabel ?? "",
  confirmOn: Boolean(a.config.confirm), confirm: a.config.confirm ?? DEFAULT_CONFIRM,
  // The earlier two-step flow kept its desk-side settings on the second button.
  claimConfirmOn: Boolean(a.config.claimConfirm),
  claimConfirm: a.config.claimConfirm || DEFAULT_CONFIRM,
});
type Op = { type: string; [key: string]: unknown };
const firstId = (value: string | undefined | null) => (value ?? "").split(/[,、，\s]+/).find(Boolean) ?? "";
const newId = (prefix: string) => prefix + "_" + crypto.randomUUID().replaceAll("-", "");
// New rows must exist before they are updated, removed blocks go before reordering.
const opRank = (type: string) =>
  ({ poll_new: 0, action_new: 0, block_new: 1, candidate_new: 2, block_delete: 4, poll_delete: 4, action_delete: 4, layout_order: 5 } as Record<string, number>)[type] ?? 3;
/** Reads an uploaded logo. Bitmaps are scaled down to 128px so the stored setting stays small. */
async function logoDataUrl(file: File): Promise<string> {
  const read = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error("画像を読み込めませんでした。"));
    reader.readAsDataURL(blob);
  });
  if (file.type === "image/svg+xml") {
    if (file.size > 140000) throw Error("SVGは140KB以下にしてください。");
    return read(file);
  }
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw Error("SVG・PNG・JPEG・WebPの画像を選んでください。");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 128 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}
const plainSummary = (rich: string) => plainText(parseRich(rich)).replace(/\s+/g, " ").trim().slice(0, 40);
const DEFAULT_TITLE = "投票フォーム";
const DEFAULT_DESCRIPTION = "各部門で候補を選んで投票してください。";
const ruleNames: Record<Rule["type"], string> = {
  min_distinct_polls: "投票した部門数",
  min_total_votes: "投票した合計票数",
  voted_poll: "特定の部門に投票",
  action_used: "別の権利が使用済み",
};
const itemName = (item: Item) =>
  item.poll?.title ?? item.action?.title ?? item.block?.title ?? "無題の項目";

export default function FormStudio({ initialData, onLogout }: {
  initialData: AdminData; onLogout: () => Promise<void>;
}) {
  const [data, setData] = useState(initialData);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [tab, setTab] = useState<"questions" | "responses" | "settings">("questions");
  const [selected, setSelected] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const dragHandleRef = useRef<string | null>(null);
  const [pollDraft, setPollDraft] = useState<PollDraft | null>(null);
  const [actionDraft, setActionDraft] = useState<ActionDraft | null>(null);
  const [blockTitle, setBlockTitle] = useState("");
  const [blockBody, setBlockBody] = useState("");
  const [blockPublished, setBlockPublished] = useState(true);
  const [candidateEdits, setCandidateEdits] = useState<Record<string, string>>({});
  const [publicIdEdits, setPublicIdEdits] = useState<Record<string, string>>({});
  const [extraEdits, setExtraEdits] = useState<Record<string, Record<string,string>>>({});
  const [newColumnName, setNewColumnName] = useState("");
  const [pending, setPending] = useState<Record<string, {type:string;[key:string]:unknown}>>({});
  const [notice, setNotice] = useState("");
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [theme, setTheme] = useState<ThemeSettings>({});
  const [resetOpen, setResetOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [resetText, setResetText] = useState("");
  const [confirm, confirmDialog] = useConfirm();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [historyResetKey, setHistoryResetKey] = useState(0);

  const editorSnapshot = {
    data, blocks, theme, pending, layoutDirty, selected,
    pollDraft, actionDraft, blockTitle, blockBody, blockPublished,
    candidateEdits, publicIdEdits, extraEdits, newColumnName,
    formTitle, formDescription,
  };
  const { undo, redo, canUndo, canRedo } = useEditorHistory(editorSnapshot, state => {
    setData(state.data);
    setBlocks(state.blocks);
    setTheme(state.theme);
    setPending(state.pending);
    setLayoutDirty(state.layoutDirty);
    setSelected(state.selected);
    setPollDraft(state.pollDraft);
    setActionDraft(state.actionDraft);
    setBlockTitle(state.blockTitle);
    setBlockBody(state.blockBody);
    setBlockPublished(state.blockPublished);
    setCandidateEdits(state.candidateEdits);
    setPublicIdEdits(state.publicIdEdits);
    setExtraEdits(state.extraEdits);
    setNewColumnName(state.newColumnName);
    setFormTitle(state.formTitle);
    setFormDescription(state.formDescription);
  }, ready, historyResetKey);

  useEffect(() => {
    const onHistoryKey = (event: KeyboardEvent) => {
      if (event.isComposing || !(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const backwards = key === "z" && !event.shiftKey;
      const forwards = key === "y" || (key === "z" && event.shiftKey);
      if ((backwards && canUndo) || (forwards && canRedo)) {
        event.preventDefault();
        event.stopPropagation();
        if (backwards) undo(); else redo();
      }
    };
    window.addEventListener("keydown", onHistoryKey, true);
    return () => window.removeEventListener("keydown", onHistoryKey, true);
  }, [undo, redo, canUndo, canRedo]);


  const reload = useCallback(async () => {
    const [adminResponse, layoutResponse] = await Promise.all([
      fetch("/api/admin", { cache: "no-store" }),
      fetch("/api/admin/layout", { cache: "no-store" }),
    ]);
    const admin = await adminResponse.json();
    const layout = await layoutResponse.json();
    if (!adminResponse.ok) throw Error(admin.error || "管理情報を取得できません。");
    if (!layoutResponse.ok) throw Error(layout.error || "フォーム構成を取得できません。");
    setData(admin);
    setBlocks(layout.blocks ?? []);
    setTheme(layout.settings ?? {});
    setPending({});
    setLayoutDirty(false);
    setHistoryResetKey(key => key + 1);
    return { admin: admin as AdminData, blocks: (layout.blocks ?? []) as Block[] };
  }, []);

  useEffect(() => {
    // AdminClient already fetched /api/admin. Fetching it again on mount
    // used to duplicate all voting aggregate reads before the first edit.
    let active = true;
    void (async () => {
      const response = await fetch("/api/admin/layout", { cache: "no-store" });
      const layout = await response.json();
      if (!response.ok) throw Error(layout.error || "フォーム構成を取得できません。");
      if (!active) return;
      const nextBlocks = (layout.blocks ?? []) as Block[];
      setBlocks(nextBlocks);
      setTheme(layout.settings ?? {});
      const heading = nextBlocks.find(block => block.kind === "heading");
      setFormTitle(heading?.title || DEFAULT_TITLE);
      setFormDescription(heading?.body || DEFAULT_DESCRIPTION);
      setReady(true);
    })().catch(e => { if (active) setNotice(e instanceof Error ? e.message : "通信エラー"); });
    return () => { active = false; };
  }, []);

  const items = useMemo(() => {
    const list: Item[] = [];
    const referencedPolls = new Set<string>();
    const referencedActions = new Set<string>();
    for (const block of blocks) {
      if (block.kind === "heading" && block.id === blocks.find(b => b.kind === "heading")?.id) continue;
      const poll = data.polls.find(p => p.id === block.reference_id);
      const action = data.actions.find(a => a.id === block.reference_id);
      if (block.kind === "poll" && block.reference_id) referencedPolls.add(block.reference_id);
      if (block.kind === "action" && block.reference_id) referencedActions.add(block.reference_id);
      list.push({ id: block.id, kind: block.kind, block,
        poll: block.kind === "poll" ? poll : undefined,
        action: block.kind === "action" ? action : undefined });
    }
    for (const poll of data.polls) if (!referencedPolls.has(poll.id))
      list.push({ id: "virtual-poll-" + poll.id, kind: "poll", poll, virtual: true });
    for (const action of data.actions) if (!referencedActions.has(action.id))
      list.push({ id: "virtual-action-" + action.id, kind: "action", action, virtual: true });
    return list;
  }, [blocks, data]);

  function stageCurrent() {
    const ops: Record<string, {type:string;[key:string]:unknown}> = {};
    const current = items.find(i => i.id === selected);
    if (current?.poll && pollDraft) {
      const p = current.poll;
      // Only rows that actually changed are written (Turso bills rows written).
      if (JSON.stringify({ ...pollDraft, publicId: "" }) !== JSON.stringify({ ...fromPoll(p), publicId: "" }))
      ops["poll:" + p.id] = { type:"poll", id:p.id, title:pollDraft.title,
        description:pollDraft.description, maxVotes:pollDraft.maxVotes,
        nameFontSize:pollDraft.nameFontSize, nameStyle:pollDraft.nameStyle, columns:pollDraft.columns,
        startsAt:new Date(pollDraft.startsAt).toISOString(), endsAt:new Date(pollDraft.endsAt).toISOString(),
        isPublished:pollDraft.isPublished };
      if (pollDraft.publicId !== (p.publicId??""))
        ops["public_id:poll:" + p.id] = { type:"public_id",pollId:p.id,candidateId:null,publicId:pollDraft.publicId || null };
      // Changing a column's label, font or order only updates polls.columns_json.
      // Candidate rows need rewriting solely if their values actually changed,
      // or if a removed column left data to discard.
      const visibleKeys = new Set(pollDraft.columns.map(column => column.key));
      const removedKeys = p.columns.map(column => column.key).filter(key => !visibleKeys.has(key));
      for (const candidate of p.candidates) {
        if (candidateEdits[candidate.id] !== candidate.name ||
            JSON.stringify(extraEdits[candidate.id] ?? {}) !== JSON.stringify(candidate.extra ?? {}) ||
            removedKeys.some(key => Object.hasOwn(candidate.extra ?? {}, key)))
          ops["candidate:" + candidate.id] = { type:"candidate",pollId:p.id,id:candidate.id,
            name:candidateEdits[candidate.id] ?? candidate.name,extra:Object.fromEntries(Object.entries(extraEdits[candidate.id] ?? {}).filter(([key])=>pollDraft.columns.some(c=>c.key===key))),columns:pollDraft.columns };
        if (publicIdEdits[candidate.id] !== undefined && publicIdEdits[candidate.id] !== (candidate.publicId??""))
          ops["public_id:candidate:" + candidate.id] = { type:"public_id",pollId:p.id,candidateId:candidate.id,publicId:publicIdEdits[candidate.id] || null };
      }
    }
    if (current?.action && actionDraft) {
      const a=current.action;
      if (JSON.stringify(actionDraft) !== JSON.stringify(fromAction(a)))
      ops["action:"+a.id]={type:"action",id:a.id,title:actionDraft.title,description:actionDraft.description,
        kind:actionDraft.kind,config:configOf(actionDraft),
        condition:actionDraft.condition,startsAt:new Date(actionDraft.startsAt).toISOString(),
        endsAt:new Date(actionDraft.endsAt).toISOString(),isPublished:actionDraft.isPublished};
    }
    if (current?.block && (current.kind==="heading"||current.kind==="text")) {
      const b=current.block;
      if (b.title !== blockTitle || b.body !== blockBody || b.is_published !== Number(blockPublished))
      ops["block:"+b.id]={type:"block",block:{id:b.id,kind:b.kind,referenceId:"",
        title:blockTitle,body:blockBody,isPublished:blockPublished}};
    }
    return ops;
  }
  function stage() {
    try {
      const ops=stageCurrent();
      setPending(old=>({...old,...ops}));
      const current=items.find(i=>i.id===selected);
      if(current?.poll&&pollDraft) {
        setData(d=>({...d,polls:d.polls.map(p=>p.id===current.poll?.id?{
          ...p,title:pollDraft.title,description:pollDraft.description,max_votes:pollDraft.maxVotes,
          starts_at:new Date(pollDraft.startsAt).toISOString(),ends_at:new Date(pollDraft.endsAt).toISOString(),
          is_published:Number(pollDraft.isPublished),publicId:pollDraft.publicId,
          nameFontSize:pollDraft.nameFontSize,nameStyle:pollDraft.nameStyle,columns:pollDraft.columns,
          candidates:p.candidates.map(c=>({...c,name:candidateEdits[c.id]??c.name,publicId:publicIdEdits[c.id]??c.publicId,
            extra:Object.fromEntries(Object.entries(extraEdits[c.id]??c.extra??{}).filter(([key])=>pollDraft.columns.some(col=>col.key===key)))})),
        }:p)}));
      }
      if(current?.action&&actionDraft) {
        setData(d=>({...d,actions:d.actions.map(a=>a.id===current.action?.id?{
          ...a,title:actionDraft.title,description:actionDraft.description,kind:actionDraft.kind,
          config:Object.fromEntries(Object.entries(configOf(actionDraft)).filter(([,v])=>v)),condition:actionDraft.condition,
          starts_at:new Date(actionDraft.startsAt).toISOString(),ends_at:new Date(actionDraft.endsAt).toISOString(),
          is_published:Number(actionDraft.isPublished),
        }:a)}));
      }
      if(current?.block&&(current.kind==="heading"||current.kind==="text"))
        setBlocks(b=>b.map(x=>x.id===current.block?.id?{...x,title:blockTitle,body:blockBody,is_published:Number(blockPublished)}:x));
      return ops;
    } catch { setNotice("日時などの入力を確認してください。"); return {}; }
  }
  async function saveAll() {
    let staged: ReturnType<typeof stageCurrent>;
    try { staged=stageCurrent(); } catch { setNotice("入力を確認してください。"); return; }
    const ops: Record<string, Op> = {...pending,...staged};
    const order = blocks.map(block => block.id);
    let reorder = layoutDirty;
    const header=blocks.find(block=>block.kind==="heading");
    if(header && (header.title!==formTitle || header.body!==formDescription)) {
      ops["block:"+header.id]={type:"block",block:{
        id:header.id,kind:"heading",referenceId:"",
        title:formTitle||"無題のフォーム",body:formDescription,isPublished:true,
      }};
    }
    if(!header && (formTitle!==DEFAULT_TITLE || formDescription!==DEFAULT_DESCRIPTION)) {
      const id = newId("block");
      ops["new:block:"+id] = headerOp(id);
      order.unshift(id);
      reorder = true;
    }
    if (reorder) ops["layout"] = { type: "layout_order", ids: order };
    const operations = Object.values(ops).sort((a, b) => opRank(a.type) - opRank(b.type));
    if (!operations.length) {setNotice("保存する変更はありません");return;}
    setBusy(true);setNotice("");
    try {
      const response=await fetch("/api/admin/batch",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({operations})});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||"保存できませんでした。");
      setSelected(null);setPollDraft(null);setActionDraft(null);
      const layoutOnly = operations.every(op =>
        ["setting", "block", "block_new", "block_delete", "layout_order"].includes(op.type));
      if (!layoutOnly) {
        await reload();
      } else if (operations.some(op => op.type !== "setting")) {
        // A page-layout edit does not change polls or candidates. Avoid the
        // 196-row admin fetch; only reload the seven layout rows and settings.
        const layoutResponse = await fetch("/api/admin/layout", { cache: "no-store" });
        const layout = await layoutResponse.json();
        if (!layoutResponse.ok) throw Error(layout.error || "フォーム構成を取得できません。");
        setBlocks(layout.blocks ?? []);
        setTheme(layout.settings ?? {});
        setPending({});
        setLayoutDirty(false);
      } else {
        // Settings are already reflected in local state, and the transaction
        // succeeded: no Turso SELECT is needed just to confirm their values.
        setPending({});
        setLayoutDirty(false);
      }
      setNotice("変更を保存しました");
    }catch(e){setNotice(e instanceof Error?e.message:"保存できませんでした。");}
    finally{setBusy(false);}
  }
  function select(item: Item) {
    stage();
    setSelected(item.id);
    setNotice("");
    if (item.poll) {
      setPollDraft(fromPoll(item.poll));
      setCandidateEdits(Object.fromEntries(item.poll.candidates.map(c => [c.id, c.name])));
      setPublicIdEdits(Object.fromEntries(item.poll.candidates.map(c => [c.id, c.publicId ?? ""])));
      setExtraEdits(Object.fromEntries(item.poll.candidates.map(c => [c.id, structuredClone(c.extra ?? {})])));
    } else setPollDraft(null);
    setActionDraft(item.action ? fromAction(item.action) : null);
    setBlockTitle(item.block?.title ?? "");
    setBlockBody(item.block?.body ?? "");
    setBlockPublished(item.block?.is_published !== 0);
  }

  const headerOp = (id: string): Op => ({ type: "block_new", block: {
    id, kind: "heading", referenceId: "", title: formTitle || "無題のフォーム", body: formDescription, isPublished: true,
  } });

  /** Adds a section right after the selected one. Nothing is sent until 「保存」. */
  function addBlock(kind: Block["kind"]) {
    stage();
    const ops: Record<string, Op> = {};
    const blockId = newId("block");
    const now = dates();
    const startsAt = new Date(now.startsAt).toISOString();
    const endsAt = new Date(now.endsAt).toISOString();
    let referenceId: string | null = null;
    let title = "";
    let body = "";

    // The first heading doubles as the form title; create it with the first section.
    const headerId = blocks.some(b => b.kind === "heading") ? null : newId("block");
    if (headerId) ops["new:block:" + headerId] = headerOp(headerId);

    if (kind === "poll") {
      const poll: Poll = { id: newId("poll"), title: "無題の部門", description: "", max_votes: 1,
        starts_at: startsAt, ends_at: endsAt, is_published: 0, publicId: "",
        nameFontSize: 16, nameStyle: {}, columns: [], candidates: [] };
      const candidateId = newId("item");
      poll.candidates = [{ id: candidateId, name: "候補 1", votes: 0, extra: {} }];
      referenceId = poll.id;
      ops["new:poll:" + poll.id] = { type: "poll_new", id: poll.id, title: poll.title, description: "",
        maxVotes: 1, startsAt, endsAt, isPublished: false };
      ops["new:" + candidateId] = { type: "candidate_new", pollId: poll.id, id: candidateId, name: "候補 1", extra: {}, columns: [] };
      setData(d => ({ ...d, polls: [...d.polls, poll] }));
      setPollDraft(fromPoll(poll));
      setCandidateEdits({ [candidateId]: "候補 1" });
      setPublicIdEdits({ [candidateId]: "" });
      setExtraEdits({ [candidateId]: {} });
      setActionDraft(null);
    } else if (kind === "action") {
      const action: Action = { id: newId("action"), title: "新しいアクション", description: "", kind: "claim",
        condition: { type: "all", rules: [{ type: "min_distinct_polls", count: 3 }] }, config: { claimConfirm: DEFAULT_CONFIRM },
        starts_at: startsAt, ends_at: endsAt, is_published: 0, claims: [] };
      referenceId = action.id;
      ops["new:action:" + action.id] = { type: "action_new", id: action.id, title: action.title, description: "",
        kind: action.kind, config: action.config, condition: action.condition, startsAt, endsAt, isPublished: false };
      setData(d => ({ ...d, actions: [...d.actions, action] }));
      setActionDraft(fromAction(action));
      setPollDraft(null);
    } else {
      title = kind === "heading" ? "新しい見出し" : "";
      body = kind === "text" ? "説明を入力してください。" : "";
      setPollDraft(null);
      setActionDraft(null);
    }
    setBlockTitle(title);
    setBlockBody(body);
    setBlockPublished(true);
    ops["new:block:" + blockId] = { type: "block_new", block: {
      id: blockId, kind, referenceId: referenceId ?? "", title, body, isPublished: true } };

    const block: Block = { id: blockId, kind, reference_id: referenceId, title, body, sort_order: 0, is_published: 1 };
    const selectedIndex = items.findIndex(item => item.id === selected);
    const afterHeader = selected === "form-header";
    const selectedBlockId = selectedIndex >= 0 ? items[selectedIndex].block?.id : null;
    const nextBlockId = selectedIndex >= 0
      ? items.slice(selectedIndex + 1).find(item => item.block)?.block?.id
      : null;
    setBlocks(old => {
      const list = [...old];
      if (headerId) list.unshift({ id: headerId, kind: "heading", reference_id: null,
        title: formTitle || "無題のフォーム", body: formDescription, sort_order: 0, is_published: 1 });
      const afterIndex = selectedBlockId ? list.findIndex(b => b.id === selectedBlockId) : -1;
      const beforeIndex = nextBlockId ? list.findIndex(b => b.id === nextBlockId) : -1;
      const insertIndex = afterHeader ? (list.findIndex(b => b.kind === "heading") + 1)
        : afterIndex >= 0 ? afterIndex + 1
        : beforeIndex >= 0 ? beforeIndex : list.length;
      list.splice(insertIndex, 0, block);
      return list;
    });
    setPending(old => ({ ...old, ...ops }));
    setLayoutDirty(true);
    setSelected(blockId);
    setNotice("");
    window.requestAnimationFrame(() => document.getElementById("item-" + blockId)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  async function changeBlockVisibility(block: Block, visible: boolean) {
    setPending(old=>({...old,["block:"+block.id]:{type:"block",block:{
      id:block.id,kind:block.kind,referenceId:block.reference_id??"",
      title:block.title,body:block.body,isPublished:visible,
    }}}));
    setBlocks(old=>old.map(b=>b.id===block.id?{...b,is_published:Number(visible)}:b));
    setBlockPublished(visible);
  }
  /** Sections not yet placed on the page (older data) get a layout block when first moved. */
  function placeVirtual(item: Item, list: Block[]): Block | null {
    const ref = item.poll?.id ?? item.action?.id;
    if (item.block || !ref) return null;
    const block: Block = { id: newId("block"), kind: item.kind, reference_id: ref, title: "", body: "", sort_order: 0, is_published: 1 };
    list.push(block);
    setPending(old => ({ ...old, ["new:block:" + block.id]: { type: "block_new", block: {
      id: block.id, kind: block.kind, referenceId: ref, title: "", body: "", isPublished: true } } }));
    return block;
  }
  function move(item: Item, direction: -1 | 1) {
    const list = [...blocks];
    const block = item.block ?? placeVirtual(item, list);
    if (!block) return;
    const header = list.findIndex(b => b.kind === "heading");
    const from = list.findIndex(b => b.id === block.id);
    let to = from + direction;
    if (to === header) to += direction; // the form header always stays on top
    if (from >= 0 && to >= 0 && to < list.length) [list[from], list[to]] = [list[to], list[from]];
    setBlocks(list);
    setLayoutDirty(true);
    if (!item.block) setSelected(block.id);
  }
  function dropSection(target: Item) {
    if (!draggedId || draggedId === target.id) return;
    const source = items.find(item => item.id === draggedId);
    if (!source) return;
    stage();
    const list = [...blocks];
    const sourceBlock = source.block ?? placeVirtual(source, list);
    const targetBlock = target.block ?? placeVirtual(target, list);
    if (!sourceBlock || !targetBlock) return;
    const from = list.findIndex(block => block.id === sourceBlock.id);
    const to = list.findIndex(block => block.id === targetBlock.id);
    if (from < 0 || to < 0) return;
    list.splice(from, 1);
    list.splice(to, 0, sourceBlock);
    setBlocks(list);
    setLayoutDirty(true);
    setSelected(sourceBlock.id);
  }
  async function remove(item: Item) {
    const block = item.block;
    const ref = item.poll?.id ?? item.action?.id ?? null;
    const isNew = Boolean((block && pending["new:block:" + block.id]) || (ref && (pending["new:poll:" + ref] || pending["new:action:" + ref])));
    const name = itemName(item);
    const votes = item.poll ? item.poll.candidates.reduce((n, c) => n + Number(c.votes), 0) : 0;
    const claims = item.action ? item.action.claims.reduce((n, c) => n + Number(c.count), 0) : 0;
    const body = isNew ? "まだ保存していないため、そのまま破棄されます。"
      : item.poll ? (votes ? "この部門の候補と投票データ（" + votes + "票）もすべて削除されます。" : "この部門と候補を削除します。") +
        "「保存」で反映され、元に戻せません。投票ページに出したくないだけなら「ページに表示」をオフにしてください。"
      : item.action ? (claims ? "引き換えの記録（" + claims + "件）もすべて削除されます。" : "このアクションを削除します。") + "「保存」で反映され、元に戻せません。"
      : "このセクションを削除します。「保存」で反映されます。";
    if (!await confirm({ title: "「" + name + "」を削除しますか？", body, confirmLabel: "削除", danger: true })) return;
    setPending(old => {
      const next = { ...old };
      if (block) { delete next["block:" + block.id]; delete next["new:block:" + block.id]; }
      if (ref) for (const [key, op] of Object.entries(next))
        if (op.id === ref || op.pollId === ref || (op.block as { referenceId?: string } | undefined)?.referenceId === ref) delete next[key];
      if (!isNew) {
        if (item.poll) next["delete:poll:" + item.poll.id] = { type: "poll_delete", id: item.poll.id };
        else if (item.action) next["delete:action:" + item.action.id] = { type: "action_delete", id: item.action.id };
        else if (block) next["delete:block:" + block.id] = { type: "block_delete", id: block.id };
      }
      return next;
    });
    if (ref) setData(d => ({ ...d, polls: d.polls.filter(p => p.id !== ref), actions: d.actions.filter(a => a.id !== ref) }));
    if (block) setBlocks(old => old.filter(b => b.id !== block.id));
    setLayoutDirty(true);
    setSelected(null); setPollDraft(null); setActionDraft(null);
  }
  type TextKey = "buttonLabel" | "claimLabel" | "lockedLabel" | "usedLabel";
  type ConfirmKey = "confirm" | "claimConfirm";
  const textSetting = (label: string, key: TextKey, fallback: string, hint?: string) =>
    <label className={styles.settingRow}>
      <span className={styles.settingLabel}>{label}{hint && <small>{hint}</small>}</span>
      <span className={styles.settingControl}>
        <input className={styles.labelInput} maxLength={30} placeholder={fallback}
          value={actionDraft?.[key] ?? ""} onChange={e => setActionDraft(d => d && ({ ...d, [key]: e.target.value }))}/>
      </span>
    </label>;
  const confirmSetting = (label: string, onKey: `${ConfirmKey}On`, key: ConfirmKey, hint?: string) =>
    <div className={styles.settingRow + " " + styles.confirmRow}>
      <label className={styles.confirmToggle}>
        <span className={styles.settingLabel}>{label}{hint && <small>{hint}</small>}</span>
        <span className={styles.toggle}><input type="checkbox" checked={Boolean(actionDraft?.[onKey])}
          onChange={e => setActionDraft(d => d && ({ ...d, [onKey]: e.target.checked }))}/></span>
      </label>
      {actionDraft?.[onKey] && <AutoTextarea className={styles.confirmText} maxLength={300}
        aria-label={label + "のメッセージ"} placeholder={DEFAULT_CONFIRM} value={actionDraft[key]}
        onChange={e => setActionDraft(d => d && ({ ...d, [key]: e.target.value }))}/>}
    </div>;

  // Sections an in-page link can point to (the block ID survives renames).
  const linkSections = items.flatMap(item => {
    const id = item.block?.id ?? item.poll?.id;
    if (!id) return [];
    const kind = item.kind === "poll" ? "投票部門" : item.kind === "action" ? "アクション" : item.kind === "heading" ? "見出し" : "説明文";
    const label = item.id === selected && pollDraft && item.poll ? pollDraft.title
      : item.id === selected && actionDraft && item.action ? actionDraft.title
      : item.id === selected && item.block && !item.poll && !item.action ? blockTitle || plainSummary(blockBody)
      : item.poll?.title ?? item.action?.title ?? (item.block?.title || plainSummary(item.block?.body ?? ""));
    return [{ id, kind, label: label || "（無題）" }];
  });

  const cellValue = (candidate: Candidate, key: string) =>
    key === "name" ? candidateEdits[candidate.id] ?? candidate.name
      : key === "publicId" ? publicIdEdits[candidate.id] ?? candidate.publicId ?? ""
        : extraEdits[candidate.id]?.[key] ?? "";

  function setCells(updates: { id: string; key: string; value: string }[]) {
    const names: Record<string, string> = {};
    const ids: Record<string, string> = {};
    const extras: { id: string; key: string; value: string }[] = [];
    for (const update of updates) {
      if (update.key === "name") names[update.id] = update.value;
      else if (update.key === "publicId") ids[update.id] = update.value;
      else extras.push(update);
    }
    if (Object.keys(names).length) setCandidateEdits(d => ({ ...d, ...names }));
    if (Object.keys(ids).length) setPublicIdEdits(d => ({ ...d, ...ids }));
    if (extras.length) setExtraEdits(d => {
      const next = { ...d };
      for (const { id, key, value } of extras) next[id] = { ...next[id], [key]: value };
      return next;
    });
  }

  function addCandidates(poll: Poll, rows: Record<string, string>[]) {
    if (!pollDraft) return 0;
    const columns = pollDraft.columns;
    const created = rows
      .map((row): Record<string, string> => ({ ...row, name: (row.name ?? "").trim() }))
      .filter(row => row.name)
      .map(row => ({ id: "item_" + crypto.randomUUID().replaceAll("-", ""), row }));
    if (!created.length) return 0;
    setPending(old => ({ ...old, ...Object.fromEntries(created.map(({ id, row }) =>
      ["new:" + id, { type: "candidate_new", pollId: poll.id, id, name: row.name, extra: {}, columns }])) }));
    setData(d => ({ ...d, polls: d.polls.map(p => p.id === poll.id ? {
      ...p, candidates: [...p.candidates, ...created.map(({ id, row }) => ({ id, name: row.name, votes: 0, extra: {} }))],
    } : p) }));
    setCandidateEdits(d => ({ ...d, ...Object.fromEntries(created.map(({ id, row }) => [id, row.name])) }));
    setPublicIdEdits(d => ({ ...d, ...Object.fromEntries(created.map(({ id, row }) => [id, row.publicId ?? ""])) }));
    setExtraEdits(d => ({ ...d, ...Object.fromEntries(created.map(({ id, row }) => [id,
      Object.fromEntries(columns.filter(c => row[c.key]).map(c => [c.key, row[c.key]]))])) }));
    return created.length;
  }

  function changeRule(index: number, rule: Rule) {
    setActionDraft(d => d ? { ...d, condition: {
      ...d.condition, rules: d.condition.rules.map((r, i) => i === index ? rule : r),
    } } : d);
  }
  const totalVotes = data.polls.reduce((n, p) => n + p.candidates.reduce((v, c) => v + Number(c.votes), 0), 0);
  const totalClaims = data.actions.reduce((n, a) => n + a.claims.reduce((v, c) => v + Number(c.count), 0), 0);
  const selectedItem = items.find(i => i.id === selected);
  const unsaved = layoutDirty || Object.keys(pending).length > 0 ||
    Boolean(selectedItem?.poll && pollDraft && JSON.stringify(pollDraft) !== JSON.stringify(fromPoll(selectedItem.poll))) ||
    Boolean(selectedItem?.action && actionDraft && JSON.stringify(actionDraft) !== JSON.stringify(fromAction(selectedItem.action))) ||
    Boolean(selectedItem?.block && (blockTitle !== selectedItem.block.title || blockBody !== selectedItem.block.body)) ||
    Boolean(selectedItem?.poll?.candidates.some(candidate =>
      candidateEdits[candidate.id] !== candidate.name ||
      JSON.stringify(extraEdits[candidate.id]??{}) !== JSON.stringify(candidate.extra??{}) ||
      (publicIdEdits[candidate.id] ?? "") !== (candidate.publicId ?? ""))) ||
    Boolean(blocks.find(block=>block.kind==="heading") &&
      (formTitle !== blocks.find(block=>block.kind==="heading")?.title ||
       formDescription !== blocks.find(block=>block.kind==="heading")?.body));
  const noticeMessage = useMemo(() => notice ? { text: notice, id: Date.now() } : null, [notice]);
  const dismissNotice = useCallback(() => setNotice(""), []);
  const saveRef = useRef(saveAll);
  saveRef.current = async () => { if (!busy) await saveAll(); };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!unsaved) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [unsaved]);


  const changeSetting = (key: keyof ThemeSettings, value: string | undefined) => {
    setTheme(old => ({ ...old, [key]: value || undefined }));
    setPending(old => ({ ...old, ["setting:" + key]: { type: "setting", key, value: value ?? "" } }));
  };
  // Fonts are fetched only while the settings tab shows them.
  useWebFonts(tab === "settings" ? [theme.headingFont, theme.bodyFont] : []);
  const roleValue = (key: ColorKey) => theme[key] ?? themeRoles.find(r => r.key === key)!.fallback;

  async function chooseLogo(file: File | undefined) {
    if (!file) return;
    try {
      const logo = await logoDataUrl(file);
      const url = URL.createObjectURL(file);
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 32;
        canvas.getContext("2d")!.drawImage(img, 0, 0, 32, 32);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(b => b ? resolve(b) : reject(Error("ICO変換に失敗しました。")), "image/png"));
        const png = new Uint8Array(await blob.arrayBuffer());
        const ico = new Uint8Array(22 + png.length);
        const view = new DataView(ico.buffer);
        view.setUint16(2, 1, true);
        view.setUint16(4, 1, true);
        ico[6] = ico[7] = 32;
        view.setUint16(10, 1, true);
        view.setUint16(12, 32, true);
        view.setUint32(14, png.length, true);
        view.setUint32(18, 22, true);
        ico.set(png, 22);
        const bytes = Array.from(ico, byte => String.fromCharCode(byte)).join("");
        changeSetting("logo", logo);
        changeSetting("favicon", "data:image/x-icon;base64," + btoa(bytes));
      } finally { URL.revokeObjectURL(url); }
    } catch (error) { setNotice(error instanceof Error ? error.message : "画像を読み込めませんでした。"); }
  }

  async function chooseOgp(file: File | undefined) {
    if (!file) return;
    try {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 10_000_000)
        throw Error("10MB以下のPNG・JPEG・WebPを選んでください。");
      const image = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 630;
      const scale = Math.max(1200 / image.width, 630 / image.height);
      canvas.getContext("2d")!.drawImage(image, (1200 - scale * image.width) / 2,
        (630 - scale * image.height) / 2, scale * image.width, scale * image.height);
      image.close();
      const data = canvas.toDataURL("image/jpeg", 0.78);
      if (data.length > 450000) throw Error("画像が大きすぎます。");
      changeSetting("ogp", data);
    } catch (error) { setNotice(error instanceof Error ? error.message : "OGP画像を読み込めませんでした。"); }
  }

  async function resetResults() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/reset", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: resetText }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "リセットできませんでした。");
      setResetOpen(false); setResetText("");
      await reload();
      setHistoryResetKey(key => key + 1);
      setNotice("集計をリセットしました");
    } catch (error) { setNotice(error instanceof Error ? error.message : "リセットできませんでした。"); }
    finally { setBusy(false); }
  }

  return <main className={styles.studio} style={themeVars(theme)}>
    <header className={styles.topbar}>
      <div className={styles.brand}>{ready && (theme.logo ? <img src={theme.logo} alt="" className={styles.brandLogo}/> : <Mark className={styles.brandIcon} size={36}/>)}
        <div><div className={styles.brandName}>{formTitle || "投票フォーム"}</div><span className={unsaved ? `${styles.saved} ${styles.dirty}` : styles.saved}>{unsaved ? "未保存の変更があります" : "すべての変更を保存済み"}</span></div>
      </div>
      <div className={styles.topActions}>
        <button type="button" className={styles.iconButton} aria-label="元に戻す" data-tip="元に戻す (⌘/Ctrl+Z)"
          disabled={!canUndo || busy} onClick={undo}><Icon d={icons.undo}/></button>
        <button type="button" className={styles.iconButton} aria-label="やり直す" data-tip="やり直す (⌘/Ctrl+Shift+Z)"
          disabled={!canRedo || busy} onClick={redo}><Icon d={icons.redo}/></button>
        <button type="button" className={styles.iconButton} data-tip="プレビュー" aria-label="プレビュー" onClick={() => { stage(); setPreviewOpen(true); }}><Icon d={icons.preview}/></button>
        <button className={styles.iconButton} type="button" data-tip="再読み込み" aria-label="再読み込み" onClick={() => void (async () => {if(Object.keys(pending).length||!await confirm({ title: "再読み込みしますか？", body: "保存していない編集内容は失われます。", confirmLabel: "再読み込み", danger: true }))return;await reload().catch(e => setNotice(String(e)));})()}><Icon d={icons.refresh}/></button>
        <button className={styles.publishButton} type="button" disabled={busy} data-tip="Ctrl+S" onClick={() => void saveAll()}>{busy ? "保存中…" : "保存"}</button>
        <button className={styles.iconButton} type="button" onClick={() => void onLogout()} data-tip="ログアウト" aria-label="ログアウト"><Icon d={icons.logout}/></button>
      </div>
    </header>
    <nav className={styles.tabs} aria-label="編集モード">
      <button className={tab === "questions" ? styles.currentTab : ""} onClick={() => setTab("questions")}>質問</button>
      <button className={tab === "responses" ? styles.currentTab : ""} onClick={() => setTab("responses")}>集計</button>
      <button className={tab === "settings" ? styles.currentTab : ""} onClick={() => setTab("settings")}>設定</button>
    </nav>
    <Snackbar message={noticeMessage} onDismiss={dismissNotice} className={styles.snackbarLift} />
    {confirmDialog}
    <PreviewPane open={previewOpen} onClose={() => setPreviewOpen(false)} polls={data.polls} actions={data.actions}
      blocks={blocks.map(b => b.kind === "heading" && b.id === blocks.find(x => x.kind === "heading")?.id
        ? { ...b, title: formTitle, body: formDescription } : b)}
      title={formTitle} description={formDescription} theme={theme} />
    {tab === "questions" && <div className={styles.canvasWrap}>
      <div className={styles.canvas}>
        <section className={styles.formHeader} onClick={() => { if (selected !== "form-header") { stage(); setSelected("form-header"); } }}>
          <div className={styles.purpleLine} />
          <input aria-label="フォームタイトル" className={styles.formTitle} value={formTitle}
            onChange={e => setFormTitle(e.target.value)} placeholder="無題のフォーム" maxLength={120}/>
          <RichTextEditor sections={linkSections} label="フォームの説明" className={styles.formDescription} value={formDescription}
            onChange={setFormDescription} placeholder="フォームの説明"/>
        </section>
        {!ready && <p className={styles.statusText}>フォームを読み込んでいます。</p>}
        {ready && items.length === 0 && <section className={styles.blank}>
          項目はまだありません。右のツールバーから質問や文章を追加してください。
        </section>}
        {items.map((item, index) => {
          const active = selected === item.id;
          const poll = item.poll;
          const action = item.action;
          const block = item.block;
          return <section key={item.id} id={"item-" + item.id}
            className={`${active ? styles.activeCard : styles.questionCard} ${draggedId === item.id ? styles.draggingCard : ""}`}
            draggable={false}
            onPointerDownCapture={e => {
              const handle = (e.target as Element).closest("[data-drag-handle]");
              dragHandleRef.current = handle ? item.id : null;
              // Only arm native HTML drag when the pointer starts on the handle.
              // Inputs and rich text remain freely selectable/editable.
              e.currentTarget.draggable = Boolean(handle);
            }}
            onPointerUpCapture={e => { e.currentTarget.draggable = false; }}
            onPointerCancelCapture={e => { e.currentTarget.draggable = false; }}
            onDragStart={e => {
              if (dragHandleRef.current !== item.id) { e.preventDefault(); return; }
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", item.id);
              setDraggedId(item.id);
            }}
            onDragEnd={e => {
              e.currentTarget.draggable = false;
              setDraggedId(null);
              dragHandleRef.current = null;
            }}
            onDragOver={e => { if (draggedId && draggedId !== item.id) e.preventDefault(); }}
            onDrop={e => { e.preventDefault(); dropSection(item); setDraggedId(null); }}
            onClick={() => { if (!active) select(item); }}>
            {active && <div className={styles.selectionAccent}/>}
            <div className={styles.cardHead}>
              <span className={styles.dragHandle} data-drag-handle aria-label="ドラッグして並び替え">
                <Icon d={icons.drag}/></span>
              <span className={styles.cardKind}>{item.kind === "poll" ? "投票部門" : item.kind === "action" ? "条件付きアクション" : item.kind === "heading" ? "見出し" : "説明文"}</span>
            </div>
            {poll && (active && pollDraft ? <>
              <input className={styles.questionInput} aria-label="部門名" placeholder="部門名" value={pollDraft.title}
                onChange={e => setPollDraft(d => d && ({ ...d, title: e.target.value }))}/>
              <RichTextEditor sections={linkSections} className={styles.descriptionField} label="部門の説明"
                placeholder="説明（省略可）" value={pollDraft.description}
                onChange={value => setPollDraft(d => d && ({ ...d, description: value }))}/>

              <section className={styles.editorSection}>
                <div className={styles.sectionHead}>
                  <h3>候補</h3><span className={styles.countChip}>{poll.candidates.length}</span>
                </div>
                <CandidateSheet
                  disabled={busy}
                  columns={[
                    { key: "name", label: "名前", maxLength: 200, minWidth: 200 },
                    { key: "publicId", label: "公開ID（カンマ区切りで複数可）", maxLength: 400, mono: true, minWidth: 200 },
                    ...pollDraft.columns.map(column => ({ key: column.key, label: column.label || "（無題の項目）", maxLength: 500 })),
                  ]}
                  rows={poll.candidates.map(candidate => ({ id: candidate.id, votes: Number(candidate.votes),
                    href: "/?id=" + encodeURIComponent(firstId(publicIdEdits[candidate.id] || candidate.publicId) || candidate.id) +
                      "&category=" + encodeURIComponent(firstId(pollDraft.publicId) || poll.id) }))}
                  getValue={(row, key) => cellValue(poll.candidates[row], key)}
                  onChange={updates => setCells(updates.map(u => ({ id: poll.candidates[u.row].id, key: u.key, value: u.value })))}
                  onAddRows={rows => addCandidates(poll, rows)}
                />
              </section>

              <section className={styles.editorSection}>
                <div className={styles.sectionHead}><h3>表示する項目</h3>
                  <span className={styles.sectionHint}>投票ページでの見え方を設定します</span></div>
                <div className={styles.columnList}>
                  <div className={styles.columnRow}>
                    <span className={styles.columnFixed}>名前</span>
                    <TextStyleControls label="名前" fontSize={pollDraft.nameFontSize} style={pollDraft.nameStyle}
                      onFontSize={size=>setPollDraft(d=>d&&({...d,nameFontSize:size}))}
                      onStyle={style=>setPollDraft(d=>d&&({...d,nameStyle:style}))}/>
                    <span className={styles.columnActions}/>
                  </div>
                  {pollDraft.columns.map(column => {
                    const update = (patch: Partial<Column>) =>
                      setPollDraft(d=>d&&({...d,columns:d.columns.map(c=>c.key===column.key?{...c,...patch}:c)}));
                    return <div className={styles.columnRow} key={column.key}>
                      <input aria-label="項目名" value={column.label} maxLength={40} placeholder="項目名"
                        onChange={e=>update({label:e.target.value})}/>
                      <TextStyleControls label={column.label||"項目"} fontSize={column.fontSize}
                        style={{color:column.color,bold:column.bold,italic:column.italic,underline:column.underline}}
                        onFontSize={size=>update({fontSize:size})}
                        onStyle={style=>update({color:style.color,bold:style.bold,italic:style.italic,underline:style.underline})}/>
                      <span className={styles.columnActions}>
                        <button type="button" className={column.hideLabel ? styles.iconButton : `${styles.iconButton} ${styles.iconOn}`}
                          aria-pressed={!column.hideLabel} aria-label={(column.label||"項目")+"の項目名を表示"}
                          data-tip={column.hideLabel ? "項目名を表示しない" : "項目名を表示する"}
                          onClick={()=>update({hideLabel:column.hideLabel ? undefined : true})}>
                          <Icon d={column.hideLabel ? icons.labelOff : icons.label}/></button>
                        <button type="button" className={styles.iconButton} data-tip="項目を削除" aria-label={(column.label||"項目")+"を削除"}
                          onClick={()=>setPollDraft(d=>d&&({...d,columns:d.columns.filter(c=>c.key!==column.key)}))}><Icon d={icons.delete}/></button>
                      </span>
                    </div>;
                  })}
                  <form className={styles.columnAdd} onSubmit={e=>{e.preventDefault();const label=newColumnName.trim();
                    if(!label||pollDraft.columns.length>=12)return;
                    const key="col_"+crypto.randomUUID().replaceAll("-","").slice(0,20);
                    setPollDraft(d=>d&&({...d,columns:[...d.columns,{key,label,fontSize:14}]}));
                    setNewColumnName("");
                  }}>
                    <input aria-label="追加する項目名" maxLength={40} placeholder="項目を追加（例：場所、団体名）"
                      value={newColumnName} onChange={e=>setNewColumnName(e.target.value)}/>
                    <button type="submit" className={styles.tonalButton} disabled={!newColumnName.trim()||pollDraft.columns.length>=12}>追加</button>
                  </form>
                </div>
                {(() => {
                  const sample = poll.candidates[0];
                  const name = sample ? cellValue(sample, "name") : "候補名";
                  return <div className={styles.stylePreview} aria-label="表示のプレビュー">
                    <span className={styles.previewTag}>プレビュー</span>
                    <div className={styles.previewRow}>
                      <div className={styles.previewText}>
                        <span style={textStyle(pollDraft.nameFontSize, pollDraft.nameStyle)}>{name || "候補名"}</span>
                        {pollDraft.columns.map(column => {
                          const value = sample ? cellValue(sample, column.key) : "";
                          return <div key={column.key} className={styles.previewExtra} style={{ fontSize: column.fontSize }}>
                            {!column.hideLabel && <span className={styles.previewLabel}>{column.label}</span>}
                            <span style={textStyle(column.fontSize, column)}>{value || column.label + "の内容"}</span>
                          </div>;
                        })}
                      </div>
                      <span className={styles.previewButton}>投票する</span>
                    </div>
                  </div>;
                })()}
              </section>

              <section className={styles.editorSection}>
                <div className={styles.sectionHead}><h3>受付設定</h3></div>
                <div className={styles.settingList}>
                  <label className={styles.settingRow}>
                    <span className={styles.settingLabel}>公開する<small>オンにすると、受付期間中に投票ページへ表示されます</small></span>
                    <span className={styles.toggle}><input type="checkbox" checked={pollDraft.isPublished}
                      onChange={e => setPollDraft(d => d && ({ ...d, isPublished: e.target.checked }))}/></span>
                  </label>
                  <div className={styles.settingRow}>
                    <span className={styles.settingLabel}>受付期間</span>
                    <span className={styles.settingControl}>
                      <input type="datetime-local" aria-label="受付開始" value={pollDraft.startsAt}
                        onChange={e => setPollDraft(d => d && ({ ...d, startsAt: e.target.value }))}/>
                      <span className={styles.rangeSep}>〜</span>
                      <input type="datetime-local" aria-label="受付終了" value={pollDraft.endsAt}
                        onChange={e => setPollDraft(d => d && ({ ...d, endsAt: e.target.value }))}/>
                    </span>
                  </div>
                  <label className={styles.settingRow}>
                    <span className={styles.settingLabel}>1人あたりの票数<small>この部門で投票できる候補の数</small></span>
                    <span className={styles.settingControl}>
                      <input className={styles.numberInput} type="number" min={1} max={20} value={pollDraft.maxVotes}
                        onChange={e => setPollDraft(d => d && ({ ...d, maxVotes: Number(e.target.value) }))}/>
                    </span>
                  </label>
                  <div className={styles.settingRow}>
                    <span className={styles.settingLabel}>部門の公開ID<small>投票ページのURLに ?category=（この値）を付けると、この部門を直接開けます。カンマ区切りで複数指定できます</small></span>
                    <span className={styles.settingControl}>
                      <input className={styles.monoInput} aria-label="部門の公開ID" value={pollDraft.publicId} placeholder={poll.id} maxLength={400}
                        onChange={e=>setPollDraft(d=>d&&({...d,publicId:e.target.value}))}/>
                      <a className={styles.iconButton} data-tip="リンクを開く" aria-label="部門のリンクを開く"
                        href={"/?category="+encodeURIComponent(firstId(pollDraft.publicId)||poll.id)} target="_blank" rel="noopener noreferrer"><Icon d={icons.open}/></a>
                    </span>
                  </div>
                </div>
              </section>
            </> : <>
              <h2 className={styles.questionTitle}>{poll.title}</h2><RichText className={styles.description} value={poll.description}/>
              <p className={styles.smallHint}>候補 {poll.candidates.length} 件・最大 {poll.max_votes} 候補まで選択</p>
            </>)}
            {action && (active && actionDraft ? <>
              <div className={styles.fieldRow}><input className={styles.questionInput} value={actionDraft.title}
                onChange={e => setActionDraft(d => d && ({ ...d, title: e.target.value }))} aria-label="アクション名" placeholder="アクション名"/>
                <select className={styles.questionType} value={actionDraft.kind} aria-label="アクションの種類"
                  onChange={e => setActionDraft(d => d && ({ ...d, kind: e.target.value as Action["kind"] }))}>
                  <option value="claim">1回限りの引換権</option><option value="link">条件付きリンク</option>
                  <option value="notice">条件付き案内</option>
                </select></div>
              <RichTextEditor sections={linkSections} className={styles.descriptionField} value={actionDraft.description} label="アクションの説明"
                placeholder="説明（省略可）"
                onChange={value => setActionDraft(d => d && ({ ...d, description: value }))}/>

              <section className={styles.editorSection}>
                <div className={styles.sectionHead}><h3>利用できる条件</h3>
                  <select className={styles.inlineSelect} aria-label="条件の組み合わせ" value={actionDraft.condition.type}
                    onChange={e => setActionDraft(d => d && ({ ...d, condition: { ...d.condition, type: e.target.value as Condition["type"] } }))}>
                    <option value="all">すべて満たす</option><option value="any">いずれかを満たす</option>
                  </select>
                </div>
                <div className={styles.rulesPanel}>
                {actionDraft.condition.rules.map((rule, i) => <div className={styles.ruleRow} key={i}>
                  <select aria-label={"条件" + (i+1)} value={rule.type} onChange={e => {
                    const type = e.target.value as Rule["type"];
                    changeRule(i, type === "voted_poll" ? { type, pollId: data.polls[0]?.id ?? "" } :
                      type === "action_used"
                        ? { type, actionId: data.actions.find(a => a.kind === "claim" && a.id !== action.id)?.id ?? "" }
                        : { type, count: 1 });
                  }}>
                    {Object.entries(ruleNames).map(([value,label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                  {rule.type === "voted_poll" ? <select value={rule.pollId ?? ""}
                    onChange={e => changeRule(i, { ...rule, pollId: e.target.value })}>
                    <option value="">部門を選択</option>{data.polls.map(p => <option value={p.id} key={p.id}>{p.title}</option>)}
                  </select> : rule.type === "action_used"
                  ? <select value={rule.actionId ?? ""} onChange={e => changeRule(i, { ...rule, actionId: e.target.value })}>
                    <option value="">引換権を選択</option>{data.actions.filter(a => a.kind === "claim" && a.id !== action.id)
                      .map(a => <option value={a.id} key={a.id}>{a.title}</option>)}</select>
                  : <input aria-label="必要数" type="number" min={1} max={1000} value={rule.count ?? 1}
                    onChange={e => changeRule(i, { ...rule, count: Number(e.target.value) })}/>}
                  <button type="button" className={styles.iconButton} data-tip="条件を削除" aria-label="条件を削除" disabled={actionDraft.condition.rules.length === 1}
                    onClick={() => setActionDraft(d => d && ({ ...d, condition: {
                      ...d.condition, rules: d.condition.rules.filter((_, j) => i !== j),
                    } }))}><Icon d={icons.delete}/></button>
                </div>)}
                <button type="button" className={styles.addRule} disabled={actionDraft.condition.rules.length >= 12}
                  onClick={() => setActionDraft(d => d && ({ ...d, condition: {
                    ...d.condition, rules: [...d.condition.rules, { type: "min_distinct_polls", count: 1 }],
                  } }))}><Icon d={icons.addSmall}/>条件を追加</button>
                </div>
              </section>

              {actionDraft.kind !== "notice" && <section className={styles.editorSection}>
                <div className={styles.sectionHead}><h3>ボタン</h3>
                  <span className={styles.sectionHint}>空欄のときは（ ）内の文言になります</span></div>
                <div className={styles.settingList}>
                  {actionDraft.kind === "link" ? <>
                    <label className={styles.settingRow}>
                      <span className={styles.settingLabel}>リンク先<small>https:// から始まるURL</small></span>
                      <span className={styles.settingControl}>
                        <input className={styles.wideInput} type="url" placeholder="https://" value={actionDraft.url}
                          onChange={e => setActionDraft(d => d && ({ ...d, url: e.target.value }))}/>
                      </span>
                    </label>
                    {textSetting("ボタンの文言", "buttonLabel", "リンクを開く")}
                    {confirmSetting("開く前に確認を表示", "confirmOn", "confirm")}
                  </> : <>
                    {textSetting("ボタンの文言", "claimLabel", "引き換える", "運営スタッフが来場者の画面のボタンを押すと引き換え完了です")}
                    {textSetting("条件未達成時の文言", "lockedLabel", "条件を満たすと引き換えられます")}
                    {confirmSetting("押す前に確認を表示", "claimConfirmOn", "claimConfirm", "例：「このボタンは運営スタッフが押してください。」")}
                    {textSetting("押した後の表示", "usedLabel", "引換済み")}
                  </>}
                </div>
              </section>}

              <section className={styles.editorSection}>
                <div className={styles.sectionHead}><h3>受付設定</h3></div>
                <div className={styles.settingList}>
                  <label className={styles.settingRow}>
                    <span className={styles.settingLabel}>公開する<small>オンにすると、受付期間中に投票ページへ表示されます</small></span>
                    <span className={styles.toggle}><input type="checkbox" checked={actionDraft.isPublished}
                      onChange={e => setActionDraft(d => d && ({ ...d, isPublished: e.target.checked }))}/></span>
                  </label>
                  <div className={styles.settingRow}>
                    <span className={styles.settingLabel}>受付期間</span>
                    <span className={styles.settingControl}>
                      <input type="datetime-local" aria-label="受付開始" value={actionDraft.startsAt}
                        onChange={e => setActionDraft(d => d && ({ ...d, startsAt: e.target.value }))}/>
                      <span className={styles.rangeSep}>〜</span>
                      <input type="datetime-local" aria-label="受付終了" value={actionDraft.endsAt}
                        onChange={e => setActionDraft(d => d && ({ ...d, endsAt: e.target.value }))}/>
                    </span>
                  </div>
                </div>
              </section>
            </> : <><h2 className={styles.questionTitle}>{action.title}</h2>
              <RichText className={styles.description} value={action.description}/><button className={styles.mockAction} disabled>
                {action.kind === "claim" ? action.config.claimLabel || "引き換える" : action.kind === "link" ? action.config.buttonLabel || "リンクを開く" : "案内を見る"}</button>
            </>)}
            {(item.kind === "heading" || item.kind === "text") && block && (active ? <>
              <input className={styles.questionInput} value={blockTitle} aria-label="見出し"
                onChange={e => setBlockTitle(e.target.value)} placeholder={item.kind === "heading" ? "見出し" : "タイトル（省略可）"}/>
              <RichTextEditor sections={linkSections} className={styles.descriptionField} value={blockBody} label="本文"
                onChange={setBlockBody} placeholder={item.kind === "heading" ? "説明（省略可）" : "文章を入力"}/>
              <div className={styles.settingList}>
                <label className={styles.settingRow}>
                  <span className={styles.settingLabel}>ページに表示</span>
                  <span className={styles.toggle}><input type="checkbox" checked={blockPublished}
                    onChange={e => setBlockPublished(e.target.checked)}/></span>
                </label>
              </div>
            </> : <><h2 className={styles.questionTitle}>{block.title}</h2>
              <RichText className={styles.description} value={block.body}/></>)}
            {active && <footer className={styles.itemActions}>
              {block && (item.kind === "poll" || item.kind === "action") && <label className={styles.toggle}>
                <input type="checkbox" checked={Boolean(block.is_published)} disabled={busy}
                  onChange={e => void changeBlockVisibility(block, e.target.checked)}/>ページに表示
              </label>}
              <button type="button" onClick={() => move(item,-1)} disabled={busy || index === 0} data-tip="上へ移動" aria-label="上へ移動"><Icon d={icons.up}/></button>
              <button type="button" onClick={() => move(item,1)} disabled={busy || index === items.length-1} data-tip="下へ移動" aria-label="下へ移動"><Icon d={icons.down}/></button>
              <button type="button" onClick={() => void remove(item)} disabled={busy} data-tip="削除" aria-label="削除"><Icon d={icons.delete}/></button>
              <span className={styles.spacer}/>
              <button type="button" onClick={() => { stage(); setSelected(null); }} data-tip="編集を閉じる" aria-label="編集を閉じる"><Icon d={icons.close}/></button>
            </footer>}
          </section>;
        })}
      </div>
      <aside className={styles.toolbar} aria-label="項目を追加">
        <button disabled={busy} data-tip="投票部門を追加" aria-label="投票部門を追加" onClick={() => void addBlock("poll")}><Icon d={icons.add}/></button>
        <button disabled={busy} data-tip="見出しを追加" aria-label="見出しを追加" onClick={() => void addBlock("heading")}><Icon d={icons.title}/></button>
        <button disabled={busy} data-tip="文章を追加" aria-label="文章を追加" onClick={() => void addBlock("text")}><Icon d={icons.text}/></button>
        <button disabled={busy} data-tip="条件付きアクションを追加" aria-label="条件付きアクションを追加" onClick={() => void addBlock("action")}><Icon d={icons.action}/></button>
      </aside>
    </div>}
    {tab === "responses" && <div className={styles.detailsPage}>
      <AbuseReport polls={data.polls.map(p => ({ id: p.id, title: p.title }))} />
      <div className={styles.panel}><h2>集計</h2>
        <div className={styles.metrics}>
          <div><strong>{totalVotes}</strong><span>投票数（候補別合計）</span></div>
          <div><strong>{data.polls.length}</strong><span>部門数</span></div>
          <div><strong>{totalClaims}</strong><span>引き換え数</span></div>
        </div>
      </div>
      {data.polls.map(p => <section className={styles.panel} key={p.id}><h3>{p.title}</h3>
        {p.candidates.map(c => <div key={c.id} className={styles.resultsRow}>
          <span>{c.name}</span><div className={styles.resultTrack}><div className={styles.resultBar}
            style={{ width: (p.candidates.reduce((n,x) => n+Number(x.votes),0)
              ? (Number(c.votes)/p.candidates.reduce((n,x)=>n+Number(x.votes),0))*100 : 0)+"%" }}/></div>
          <strong>{c.votes}票</strong>
        </div>)}</section>)}
      {data.actions.some(a => a.kind === "claim") && <section className={styles.panel}>
        <h3>引換権</h3>
        <p className={styles.subtle}>来場者が運営スタッフの前で自分の画面のボタンを押すと引き換え完了です。ここでは件数を確認できます。</p>
        {data.actions.filter(a => a.kind === "claim").map(a => {
          const count = (status: string) => Number(a.claims.find(c => c.status === status)?.count ?? 0);
          const used = count("used");
          return <div key={a.id} className={styles.claimRow}>
            <div className={styles.claimInfo}><div className={styles.claimTitle}><strong>{a.title}</strong></div>
              <p>引き換え {used}件</p></div>

          </div>;
        })}
      </section>}
      <section className={styles.panel + " " + styles.dangerPanel}>
        <h3>集計をリセット</h3>
        <p className={styles.subtle}>すべての投票、引き換えの記録、重複投票の防止データ（不審な投票の記録・送信回数の制限）を削除します。部門・候補・ページの構成と設定はそのまま残ります。本番前のテスト投票を消すときなどに使います。</p>
        <button type="button" className={styles.dangerButton} disabled={busy} onClick={() => { setResetText(""); setResetOpen(true); }}>集計をリセット</button>
      </section>
      <Dialog open={resetOpen} onClose={() => setResetOpen(false)} title="集計をリセットしますか？"
        actions={<>
          <button type="button" className={styles.dialogText} onClick={() => setResetOpen(false)}>キャンセル</button>
          <button type="button" className={styles.dialogDanger} disabled={busy || resetText !== "リセット"}
            onClick={() => void resetResults()}>{busy ? "リセット中…" : "リセット"}</button>
        </>}>
        <p>投票 {totalVotes}票と引換権の記録 {totalClaims}件、重複投票の防止データがすべて削除されます。<strong>元に戻せません。</strong></p>
        <label className={styles.resetConfirm}>確認のため「リセット」と入力してください
          <input value={resetText} onChange={e => setResetText(e.target.value)} autoComplete="off" aria-label="確認の入力"/>
        </label>
      </Dialog>
    </div>}
    {tab === "settings" && <div className={styles.detailsPage}><section className={styles.panel}>
      <h2>デザイン</h2>
      <p className={styles.subtle}>投票ページで使う色とロゴを変えられます。「保存」で反映されます。</p>
      <h3 className={styles.designHeading}>色の設定</h3>
      <div className={styles.settingList}>
        {themeRoles.map(role => <div className={styles.settingRow} key={role.key}>
          <span className={styles.settingLabel}>{role.label}<small>{role.hint}</small></span>
          <span className={styles.settingControl}>
            <label className={styles.colorField}>
              <span className={styles.colorDot} style={{ background: roleValue(role.key) }}/>
              <input type="color" aria-label={role.label} value={roleValue(role.key)}
                onChange={e => changeSetting(role.key, e.target.value.toLowerCase())}/>
              <span className={styles.colorHex}>{roleValue(role.key).toUpperCase()}</span>
            </label>
            <button type="button" className={styles.iconButton} data-tip="既定に戻す" aria-label={role.label + "を既定に戻す"}
              disabled={!theme[role.key]} onClick={() => changeSetting(role.key, undefined)}><Icon d={icons.refresh}/></button>
          </span>
        </div>)}
      </div>
      <h3 className={styles.designHeading}>フォント</h3>
      <div className={styles.settingList}>
        {([["headingFont", "見出し", "タイトル・部門名・見出し", "イベント投票フォーム"],
          ["bodyFont", "本文", "説明文・候補名・ボタン", "候補を選んで投票してください 123"]] as const).map(([key, label, hint, sample]) =>
          <div className={styles.settingRow} key={key}>
            <span className={styles.settingLabel}>{label}<small>{hint}</small>
              <span className={styles.fontSample} style={{ fontFamily: fontFamily(theme[key]) }}>{sample}</span></span>
            <span className={styles.settingControl}>
              <select className={styles.fontSelect} aria-label={label + "のフォント"} value={theme[key]?.startsWith("google:") ? "custom" : (theme[key] ?? "system")}
                onChange={e => changeSetting(key, e.target.value === "system" ? undefined : e.target.value === "custom" ? "google:" : e.target.value)}>
                {fontOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                 <option value="custom">Google Fonts から指定</option>
              </select>
               {theme[key]?.startsWith("google:") && <input className={styles.wideInput}
                 aria-label={label + "のGoogle Fonts名"} placeholder="例：Roboto"
                 value={theme[key].slice(7)} onChange={e => changeSetting(key, "google:" + e.target.value)} />}
            </span>
          </div>)}
      </div>
      <p className={styles.subtle + " " + styles.fontNote}>システム標準以外のフォントは、投票ページを開いたときに Google Fonts から読み込みます。</p>
      <h3 className={styles.designHeading}>ロゴ</h3>
      <div className={styles.settingList}>
        <div className={styles.settingRow}>
          <span className={styles.logoPreview}>
            {theme.logo ? <img src={theme.logo} alt="" /> : <Mark size={36}/>}
            <span className={styles.settingLabel}>左上のロゴとページアイコン<small>SVG・PNG・JPEG・WebP。アップロード時にICOに変換します</small></span>
          </span>
          <span className={styles.settingControl}>
            <label className={styles.tonalButton + " " + styles.fileButton}>画像を選択
              <input type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp"
                onChange={e => { void chooseLogo(e.target.files?.[0]); e.target.value = ""; }}/>
            </label>
            <button type="button" className={styles.iconButton} data-tip="既定に戻す" aria-label="ロゴを既定に戻す"
              disabled={!theme.logo} onClick={() => { changeSetting("logo", undefined); changeSetting("favicon", undefined); }}><Icon d={icons.refresh}/></button>
          </span>
        </div>
      </div>
      <div className={styles.settingList}>
        <div className={styles.settingRow}>
          <span className={styles.logoPreview}>
            {theme.ogp && <img src={theme.ogp} alt="" />}
            <span className={styles.settingLabel}>OGP画像<small>1200×630。PNG・JPEG・WebP</small></span>
          </span>
          <span className={styles.settingControl}>
            <label className={styles.tonalButton + " " + styles.fileButton}>画像を選択
              <input type="file" accept="image/png,image/jpeg,image/webp"
                onChange={e => { void chooseOgp(e.target.files?.[0]); e.target.value = ""; }}/>
            </label>
            <button type="button" className={styles.iconButton} aria-label="OGPを既定に戻す"
              disabled={!theme.ogp} onClick={() => changeSetting("ogp", undefined)}><Icon d={icons.refresh}/></button>
          </span>
        </div>
      </div>
      <div className={styles.themePreview} aria-hidden="true" style={{ background: roleValue("backgroundColor"), fontFamily: fontFamily(theme.bodyFont) }}>
        <span className={styles.themePreviewBar}/>
        {theme.logo ? <img src={theme.logo} alt="" className={styles.previewLogo}/> : <Mark size={28}/>}
        <span className={styles.themePreviewText} style={{ fontFamily: fontFamily(theme.headingFont ?? theme.bodyFont) }}>{formTitle || "投票フォーム"}</span>
        <span className={styles.themePreviewChip}>1 / 2 票</span>
        <span className={styles.themePreviewTonal}>✓ 投票済み</span>
        <span className={styles.themePreviewHighlight}>引換済み</span>
        <span className={styles.themePreviewButton}>受け取る</span>
      </div>
    </section><section className={styles.panel}>
      <h2>フォームの設定</h2>
      <p className={styles.subtle}>イベントごとの運営情報を設定できます。未入力の項目は投票ページに表示されません。</p>
      <div className={styles.settingList}>
        <label className={styles.settingRow}>
          <span className={styles.settingLabel}>運営団体名<small>投票ページのフッターとプライバシーポリシーに表示</small></span>
          <span className={styles.settingControl}>
            <input className={styles.wideInput} maxLength={120} placeholder="例：イベント運営事務局"
              value={theme.organizerName ?? ""} onChange={e => changeSetting("organizerName", e.target.value)}/>
          </span>
        </label>
        <label className={styles.settingRow}>
          <span className={styles.settingLabel}>公式サイトのURL<small>設定すると投票画面に公式サイトへのリンクを表示</small></span>
          <span className={styles.settingControl}>
            <input className={styles.wideInput} type="url" maxLength={500} placeholder="https://example.org"
              value={theme.officialUrl ?? ""} onChange={e => changeSetting("officialUrl", e.target.value)}/>
          </span>
        </label>
        <label className={styles.settingRow}>
          <span className={styles.settingLabel}>問い合わせ先メールアドレス<small>プライバシーポリシーに表示</small></span>
          <span className={styles.settingControl}>
            <input className={styles.wideInput} type="email" maxLength={254} placeholder="contact@example.org"
              value={theme.contactEmail ?? ""} onChange={e => changeSetting("contactEmail", e.target.value)}/>
          </span>
        </label>
      </div>
      <div className={styles.settingsGrid}>
        <div><strong>公開先</strong><p>来場者向け投票画面</p>
          <a href="/" target="_blank" rel="noopener noreferrer">投票ページを開く</a></div>
        <div><strong>公開中の部門</strong><p>{data.polls.filter(p=>p.is_published===1).length} / {data.polls.length} 件</p></div>
        <div><strong>公開中のアクション</strong><p>{data.actions.filter(a=>a.is_published===1).length} / {data.actions.length} 件</p></div>
        <div><strong>不正投票防止</strong><p>Turnstileと署名付きCookieによる保護を維持しています。</p></div>
      </div>
    </section><AdminEmails /></div>}
  </main>;
}

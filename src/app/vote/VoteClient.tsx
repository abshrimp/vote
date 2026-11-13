"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { resolveTargets } from "@/lib/voting/links.mjs";
import { applySelections } from "@/lib/voting/logic.mjs";
import styles from "./vote.module.css";
import Mark from "../Mark";
import { Dialog, Snackbar, useConfirm } from "../ui/Dialog";
import PrivacyPolicy from "./PrivacyPolicy";
import RichText from "../ui/RichText";
import { themeVars, useWebFonts, type ThemeSettings } from "../ui/theme";
import VoteBoard, { type Poll, type Action, type LayoutBlock } from "./VoteBoard";

type Turnstile = {
  render: (element: HTMLElement, options: {
    sitekey: string;
    action: string;
    theme: string;
    appearance: "interaction-only";
    callback: (value: string) => void;
    "expired-callback": () => void;
    "error-callback": () => void;
  }) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window { turnstile?: Turnstile }
}

const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
type Target = { pollId: string; candidateId: string | null };
type VoteSelection = { poll_id: string; candidate_id: string; is_official: number };

function fingerprint() {
  return {
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    platform: navigator.platform || "",
    screenWidth: screen.width,
    screenHeight: screen.height,
    pixelRatio: window.devicePixelRatio || 1,
    touchPoints: navigator.maxTouchPoints || 0,
  };
}

export default function VoteClient() {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [blocks, setBlocks] = useState<LayoutBlock[]>([]);
  const [settings, setSettings] = useState<ThemeSettings>({});
  useWebFonts([settings.headingFont, settings.bodyFont]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [choices, setChoices] = useState<Target[] | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const notify = useCallback((text: string) => setToast({ text, id: Date.now() }), []);
  const dismissToast = useCallback(() => setToast(null), []);
  const [saving, setSaving] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [token, setToken] = useState("");
  const widgetElement = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [session, pageResponse] = await Promise.all([
          fetch("/api/vote/session", { credentials: "same-origin", cache: "no-store" }),
          fetch("/api/vote/public", { credentials: "omit" }),
        ]);
        if (!session.ok) throw new Error("投票セッションを開始できませんでした。");
        if (!pageResponse.ok) throw new Error("公開フォームを取得できませんでした。");
        const personalResponse = await fetch("/api/vote/polls", {
          credentials: "same-origin", cache: "no-store",
        });
        if (!personalResponse.ok) throw new Error("投票情報を取得できませんでした。");
        const page: { polls?: Poll[]; blocks?: LayoutBlock[]; settings?: ThemeSettings } = await pageResponse.json();
        const personal: { selections?: VoteSelection[]; actions?: Action[] } = await personalResponse.json();
        if (mounted) {
          setPolls(applySelections(page.polls ?? [], personal.selections ?? []));
          setActions(personal.actions ?? []);
          setBlocks(page.blocks ?? []);
          setSettings(page.settings ?? {});
        }
      } catch (error) {
        if (mounted) setLoadError(error instanceof Error ? error.message : "通信に失敗しました。");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!scriptReady || !siteKey || !widgetElement.current || !window.turnstile) return;
    const id = window.turnstile.render(widgetElement.current, {
      sitekey: siteKey,
      action: "festival_vote",
      theme: "light",
      appearance: "interaction-only",
      callback: (value) => setToken(value),
      "expired-callback": () => {
        setToken("");
        window.turnstile?.reset(id);
      },
      "error-callback": () => setToken(""),
    });
    widgetId.current = id;
    return () => {
      window.turnstile?.remove(id);
      widgetId.current = null;
    };
  }, [scriptReady]);

  async function refreshActions() {
    const response = await fetch("/api/vote/actions", { cache: "no-store" });
    if (response.ok) setActions((await response.json()).actions ?? []);
  }

  async function refresh() {
    const [publicResponse, personalResponse] = await Promise.all([
      fetch("/api/vote/public", { credentials: "omit" }),
      fetch("/api/vote/polls", { cache: "no-store" }),
    ]);
    if (!publicResponse.ok || !personalResponse.ok) return;
    const page: { polls?: Poll[]; blocks?: LayoutBlock[]; settings?: ThemeSettings } = await publicResponse.json();
    const personal: { selections?: VoteSelection[]; actions?: Action[] } = await personalResponse.json();
    setPolls(applySelections(page.polls ?? [], personal.selections ?? []));
    setBlocks(page.blocks ?? []);
    setSettings(page.settings ?? {});
    setActions(personal.actions ?? []);
  }

  // One press (in front of the committee) completes the exchange on the visitor's device.
  async function claimAction(action: Action) {
    if (action.status || !token || saving || !action.eligible) return;
    const label = action.config.claimLabel || "引き換える";
    const message = action.config.claimConfirm;
    if (message && !await confirm({ title: message, confirmLabel: label })) return;
    setSaving(action.id);
    try {
      const response = await fetch("/api/vote/actions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: action.id, token, operation: "claim" }),
      });
      const body: { ok?: boolean; error?: string; redeemedAt?: string; refreshRequired?: boolean } = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "操作できませんでした。");
      setActions(old => old.map(item => item.id === action.id
        ? { ...item, status: "used", eligible: true, usedAt: body.redeemedAt ?? null }
        : item));
      if (body.refreshRequired !== false) await refreshActions();
      notify("「" + action.title + "」を引き換えました");
    } catch (error) {
      notify(error instanceof Error ? error.message : "エラーが発生しました。");
    } finally {
      setToken("");
      if (widgetId.current) window.turnstile?.reset(widgetId.current);
      setSaving(null);
    }
  }

  async function openLink(action: Action) {
    if (!action.config.url) return;
    if (action.config.confirm && !await confirm({ title: action.config.confirm, confirmLabel: action.config.buttonLabel || "開く" })) return;
    window.open(action.config.url, "_blank", "noopener,noreferrer");
  }

  async function submit(poll: Poll, candidateId: string) {
    if (!candidateId || !token || saving || poll.voted) return;
    const candidate = poll.candidates.find(c => c.id === candidateId);
    const ok = await confirm({
      title: "「" + (candidate?.name ?? "この候補") + "」に投票しますか？",
      body: <>{poll.title}への投票です。投票後に取り消すことはできません。</>,
      confirmLabel: "投票する",
    });
    if (!ok) return;
    setSaving(poll.id);
    try {
      const response = await fetch("/api/vote/cast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          pollId: poll.id,
          candidateId,
          token,
          fingerprint: fingerprint(),
        }),
      });
      const data: { ok?: boolean; code?: string; message?: string } = await response.json();
      if (response.ok && data.ok) {
        // Update locally instead of re-reading every poll and candidate (saves Turso rows read).
        setPolls(old => old.map(p => p.id !== poll.id ? p : {
          ...p, selectedIds: [...p.selectedIds, candidateId], voted: p.selectedIds.length + 1 >= p.maxVotes,
        }));
        if (actions.length) await refreshActions();
        setSelected(old => ({ ...old, [poll.id]: "" }));
        notify("「" + (candidate?.name ?? "") + "」に投票しました");
      } else {
        if (data.code === "ALREADY_VOTED" || data.code === "ALREADY_SELECTED" || data.code === "POSSIBLE_DUPLICATE") await refresh();
        notify(data.message ?? "投票に失敗しました。");
      }
    } catch {
      notify("通信に失敗しました。再読み込みして投票状況を確認してください。");
    } finally {
      setToken("");
      if (widgetId.current) window.turnstile?.reset(widgetId.current);
      setSaving(null);
    }
  }

  const jumpTo = useCallback((target: Target) => {
    const elementId = target.candidateId ? "candidate-" + target.candidateId : "poll-" + target.pollId;
    const node = document.getElementById(elementId);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    node.classList.remove(styles.flash);
    void node.offsetWidth; // restart the highlight animation
    node.classList.add(styles.flash);
  }, []);

  // In-page links ("#section" from the editor, or "#公開ID" of a department/candidate) scroll inside the page.
  const jumpToAnchor = useCallback((anchor: string) => {
    const section = document.querySelector<HTMLElement>('[data-section="' + CSS.escape(anchor) + '"]');
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      section.classList.remove(styles.flash);
      void section.offsetWidth;
      section.classList.add(styles.flash);
      return true;
    }
    const targets: Target[] = resolveTargets(anchor, polls);
    if (targets.length === 1) jumpTo(targets[0]);
    else if (targets.length > 1) setChoices(targets);
    return targets.length > 0;
  }, [polls, jumpTo]);
  useEffect(() => {
    if (loading) return;
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash && !new URLSearchParams(window.location.search).get("id")) jumpToAnchor(hash);
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ?id= jumps to a candidate; ?category= selects a department.
  // Repeated candidate IDs open the department chooser.
  const linkHandled = useRef(false);
  useEffect(() => {
    if (loading || !polls.length || linkHandled.current) return;
    linkHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const category = params.get("category");
    if (!id && !category) return;
    const targets: Target[] = id
      ? resolveTargets(id, polls, category)
      : resolveTargets(category!, polls).filter(target => target.candidateId === null);
    if (targets.length === 1) jumpTo(targets[0]);
    else if (targets.length > 1) setChoices(targets);
    else notify("指定された部門または候補が見つかりませんでした。");
  }, [loading, polls, jumpTo, notify]);

  // The first heading block is the form title set in the admin editor.
  const formHeader = blocks.find(block => block.kind === "heading");
  const pageTitle = formHeader?.title || "投票フォーム";
  const pageDescription = formHeader ? formHeader.body : "部門ごとに設定された数の候補へ投票できます。";
  const bodyBlocks = formHeader ? blocks.filter(block => block.id !== formHeader.id) : blocks;
  useEffect(() => {
    if (!loading) document.title = pageTitle;
  }, [loading, pageTitle]);
  // A custom logo also replaces the browser tab icon.
  useEffect(() => {
    if (!settings.logo) return;
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
    link.href = settings.logo;
  }, [settings.logo]);

  const completed = polls.filter(poll => poll.voted || poll.selectedIds.length >= poll.maxVotes).length;
  const progress = polls.length ? completed / polls.length : 0;

  return (
    <main className={styles.main} style={themeVars(settings)} onClick={event => {
      const link = (event.target as Element).closest?.("a[data-section-link]");
      if (!link) return;
      event.preventDefault();
      jumpToAnchor((link.getAttribute("href") ?? "").slice(1));
    }}>
      <header className={styles.appbar}>
        {settings.officialUrl && <button type="button" className={styles.appbarIcon} aria-label="前のページに戻る" title="戻る"
          onClick={() => {
            if (document.referrer && window.history.length > 1) window.history.back();
            else window.location.href = settings.officialUrl!;
          }}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor"
            d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20z"/></svg>
        </button>}
        {settings.logo ? <img src={settings.logo} alt="" className={styles.mark} /> : <Mark className={styles.mark} />}
        <span className={styles.appbarTitle}>{loading ? "" : pageTitle}</span>
        <span className={styles.appbarSpacer} />
        {!loading && polls.length > 0 && <span className={styles.appbarProgress}>
          {completed} / {polls.length} 部門
        </span>}
        {settings.officialUrl && <a className={styles.homeLink} href={settings.officialUrl} aria-label="公式サイト">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor"
            d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
          <span>公式サイト</span>
        </a>}
        {!loading && polls.length > 0 && <div className={styles.progressTrack} role="progressbar"
          aria-label="投票済みの部門" aria-valuemin={0} aria-valuemax={polls.length} aria-valuenow={completed}>
          <div className={styles.progressBar} style={{ transform: `scaleX(${progress})` }} />
        </div>}
      </header>
      <div className={styles.container}>
        <header className={styles.header}>
          {loading ? <>
            <span className={`${styles.skeletonTitle} ${styles.skeletonHeading}`} aria-hidden="true" />
            <span className={styles.skeletonLine} aria-hidden="true" />
          </> : <>
            <h1>{pageTitle}</h1>
            {pageDescription && <RichText className={styles.lead} value={pageDescription}/>}
          </>}
        </header>
        {loading && <div className={styles.board} role="status" aria-label="投票情報を読み込んでいます">
          {[0, 1].map(n => <div key={n} className={styles.skeletonCard} aria-hidden="true">
            <span className={styles.skeletonTitle} />
            <span className={styles.skeletonLine} />
            {[0, 1, 2].map(r => <span key={r} className={styles.skeletonRow}><span /><span /></span>)}
          </div>)}
        </div>}
        {loadError && <p role="alert" className={styles.error}>{loadError}</p>}
        {!loading && !loadError && polls.length === 0 && actions.length === 0 && (
          <div className={styles.empty}>
            <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true"><path fill="currentColor"
              d="M18 13h-.68l-2 2h1.91L19 17H5l1.78-2h2.05l-2-2H6l-3 3v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4zm1 7H5v-1h14zm-7.66-4.98a1 1 0 0 0 1.41 0l6.36-6.36a1 1 0 0 0 0-1.41L14.16 2.3a1 1 0 0 0-1.4-.01L6.39 8.66a1 1 0 0 0 0 1.41zm2.12-10.61L17.99 8.9 13.04 13.85 9.5 10.32z"/></svg>
            <p>現在受付中の投票はありません</p>
          </div>
        )}
        {!loading && !loadError && <VoteBoard
          polls={polls} actions={actions} blocks={bodyBlocks}
          selected={selected} setSelected={setSelected}
          saving={saving} token={token} siteKey={siteKey}
          submit={submit} claimAction={claimAction} openLink={openLink}
        />}
        {!loading && (polls.some((poll) => !poll.voted) || actions.some(action => action.kind === "claim" && action.eligible && !action.status)) && (
          <section className={styles.turnstileArea} aria-label="不正投票防止認証">
            {siteKey ? (
              <>
                <Script
                  src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
                  strategy="afterInteractive"
                  onReady={() => setScriptReady(true)}
                />
                <div ref={widgetElement} className={styles.turnstileWidget} />
              </>
            ) : (
              <p role="alert" className={styles.error}>Turnstileの設定がありません。</p>
            )}
          </section>
        )}
      </div>
      <footer className={styles.footer}>
        {settings.organizerName && <span>© {settings.organizerName}</span>}
        <button type="button" className={styles.footerLink} onClick={() => setPolicyOpen(true)}>
          プライバシーポリシー
        </button>
      </footer>
      <Dialog open={policyOpen} onClose={() => setPolicyOpen(false)} title="プライバシーポリシー" size="large">
        <PrivacyPolicy organizerName={settings.organizerName} contactEmail={settings.contactEmail} />
      </Dialog>
      <Dialog open={choices !== null} onClose={() => setChoices(null)} title="どの部門に投票しますか？" focusDialog>
        <p className={styles.choiceLead}>この候補は複数の部門にエントリーしています。</p>
        <ul className={styles.choiceList}>
          {(choices ?? []).map(target => {
            const poll = polls.find(p => p.id === target.pollId);
            const candidate = poll?.candidates.find(c => c.id === target.candidateId);
            if (!poll) return null;
            const done = poll.voted || poll.selectedIds.length >= poll.maxVotes;
            const already = candidate ? poll.selectedIds.includes(candidate.id) : false;
            return <li key={target.pollId + ":" + target.candidateId}>
              <button type="button" className={styles.choiceItem} onClick={() => {
                setChoices(null);
                window.setTimeout(() => jumpTo(target), 120);
              }}>
                <span className={styles.choiceText}>
                  <strong>{poll.title}</strong>
                  {candidate && <span>{candidate.name}</span>}
                </span>
                {(already || done) && <span className={styles.choiceState}>{already ? "投票済み" : "受付終了"}</span>}
                <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor"
                  d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
              </button>
            </li>;
          })}
        </ul>
      </Dialog>
      {confirmDialog}
      <Snackbar message={toast} onDismiss={dismissToast} />
    </main>
  );
}

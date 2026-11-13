"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { candidateElementId, publicIdFromHash, resolveTargets } from "@/lib/voting/links.mjs";
import { applySelections, withPollSelections } from "@/lib/voting/logic.mjs";
import { clearPersonalCache, readPersonalCache, writePersonalCache } from "@/lib/voting/personal-cache.mjs";
import styles from "./vote.module.css";
import Mark from "../Mark";
import { Dialog, Snackbar, useConfirm } from "../ui/Dialog";
import PrivacyPolicy from "./PrivacyPolicy";
import RichText from "../ui/RichText";
import { themeVars, useWebFonts, type ThemeSettings } from "../ui/theme";
import VoteBoard, { type Poll, type Action, type LayoutBlock } from "./VoteBoard";
import BackToTop from "./BackToTop";

type Turnstile = {
  render: (element: HTMLElement, options: {
    sitekey: string;
    action: string;
    theme: string;
    appearance: "interaction-only";
    callback: (value: string) => void;
    "expired-callback": () => void;
    "error-callback": () => void;
    "before-interactive-callback": () => void;
    "after-interactive-callback": () => void;
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
type PersonalState = { selections: VoteSelection[]; actions: Action[] };

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
  const [filters, setFilters] = useState(new Map<string, string>());
  const [target, setTarget] = useState<Target | null>(null);
  const chosenTarget = useRef<Target | null>(null);
  const onFilter = useCallback((pollId: string, filter: string) => {
    setFilters(previous => new Map(previous).set(pollId, filter));
  }, []);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [choices, setChoices] = useState<Target[] | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const notify = useCallback((text: string) => setToast({ text, id: Date.now() }), []);
  const dismissToast = useCallback(() => setToast(null), []);
  const [saving, setSaving] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptFailed, setScriptFailed] = useState(false);
  const [token, setToken] = useState("");
  const currentToken = useRef("");
  const updateToken = useCallback((value: string) => {
    currentToken.current = value;
    setToken(value);
  }, []);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [challengeError, setChallengeError] = useState(false);
  const challengeDialog = useRef<HTMLDialogElement>(null);
  const widgetElement = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const sessionCacheKey = useRef("");
  const personalState = useRef<PersonalState | null>(null);

  function rememberPersonal(personal: PersonalState) {
    personalState.current = personal;
    if (!sessionCacheKey.current) return;
    try { writePersonalCache(window.localStorage, sessionCacheKey.current, personal); }
    catch { /* Browser storage may be disabled. */ }
  }

  function discardPersonalCache() {
    personalState.current = null;
    try { clearPersonalCache(window.localStorage); }
    catch { /* Browser storage may be disabled. */ }
  }

  const needsVerification = saving !== null ||
    polls.some(poll => !poll.voted && poll.candidates.length > 0) ||
    actions.some(action => action.kind === "claim" && action.eligible && !action.status);

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
        const sessionData: { cacheKey?: string } = await session.json();
        if (!sessionData.cacheKey) throw new Error("投票セッションを確認できませんでした。");
        sessionCacheKey.current = sessionData.cacheKey;
        let cached: PersonalState | null = null;
        try { cached = readPersonalCache(window.localStorage, sessionData.cacheKey); }
        catch { /* Browser storage may be disabled. */ }
        const [page, personal]: [
          { polls?: Poll[]; blocks?: LayoutBlock[]; settings?: ThemeSettings },
          PersonalState,
        ] = await Promise.all([
          pageResponse.json(),
          cached ? Promise.resolve(cached) : (async () => {
            const response = await fetch("/api/vote/polls", {
              credentials: "same-origin", cache: "no-store",
            });
            if (!response.ok) throw new Error("投票情報を取得できませんでした。");
            return response.json() as Promise<PersonalState>;
          })(),
        ]);
        // Reusing a snapshot must not extend its TTL indefinitely.
        if (cached) personalState.current = personal;
        else rememberPersonal(personal);
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

  // A challenge may start while a native vote confirmation is still open.
  useEffect(() => {
    const dialog = challengeDialog.current;
    if (dialog && challengeOpen && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, [challengeOpen]);

  useEffect(() => {
    if (!needsVerification || !scriptReady || !siteKey || !widgetElement.current || !window.turnstile) return;
    const id = window.turnstile.render(widgetElement.current, {
      sitekey: siteKey,
      action: "festival_vote",
      theme: "light",
      appearance: "interaction-only",
      callback: (value) => {
        updateToken(value);
        setChallengeOpen(false);
        setChallengeError(false);
      },
      "before-interactive-callback": () => {
        setChallengeError(false);
        setChallengeOpen(true);
      },
      "after-interactive-callback": () => setChallengeOpen(false),
      "expired-callback": () => {
        updateToken("");
        setChallengeOpen(false);
        window.turnstile?.reset(id);
      },
      "error-callback": () => {
        updateToken("");
        setChallengeError(true);
        setChallengeOpen(true);
      },
    });
    widgetId.current = id;
    return () => {
      window.turnstile?.remove(id);
      widgetId.current = null;
      updateToken("");
      setChallengeOpen(false);
      setChallengeError(false);
    };
  }, [needsVerification, scriptReady, updateToken]);

  async function showSuccess(message: string, refreshActions: boolean) {
    notify(message);
    if (!refreshActions) return;
    try {
      const response = await fetch("/api/vote/actions", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const updated: { actions?: Action[] } = await response.json();
      const nextActions = updated.actions ?? [];
      setActions(nextActions);
      if (personalState.current) rememberPersonal({ ...personalState.current, actions: nextActions });
    } catch {
      discardPersonalCache();
      notify(message + "。追加機能の状態を更新できませんでした。ページを再読み込みしてください。");
    }
  }

  async function refresh(includePublic = false) {
    // Duplicate rejection changes only personal state. Fetch public candidate
    // data again only when the server signals an exhausted poll limit.
    const [personalResponse, publicResponse] = await Promise.all([
      fetch("/api/vote/polls", { cache: "no-store" }),
      includePublic ? fetch("/api/vote/public", { credentials: "omit" }) : null,
    ]);
    if (!personalResponse.ok || (publicResponse && !publicResponse.ok)) throw new Error();
    const personal: PersonalState = await personalResponse.json();
    rememberPersonal(personal);
    if (publicResponse) {
      const page: { polls?: Poll[]; blocks?: LayoutBlock[]; settings?: ThemeSettings } = await publicResponse.json();
      setPolls(applySelections(page.polls ?? [], personal.selections ?? []));
      setBlocks(page.blocks ?? []);
      setSettings(page.settings ?? {});
    } else {
      setPolls(current => applySelections(current, personal.selections ?? []));
    }
    setActions(personal.actions ?? []);
  }

  // One press (in front of the committee) completes the exchange on the visitor's device.
  async function claimAction(action: Action) {
    if (action.status || !token || saving || !action.eligible) return;
    const label = action.config.claimLabel || "引き換える";
    const message = action.config.claimConfirm;
    if (message && !await confirm({ title: message, confirmLabel: label })) return;
    const verifiedToken = currentToken.current;
    if (!verifiedToken) { notify("本人確認の完了後にもう一度お試しください。"); return; }
    // A Turnstile token is single-use. Disable all action buttons immediately,
    // before the request or any subsequent eligibility refresh can render.
    updateToken("");
    setSaving(action.id);
    try {
      const response = await fetch("/api/vote/actions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: action.id, token: verifiedToken, operation: "claim" }),
      });
      const body: { ok?: boolean; error?: string; redeemedAt?: string; refreshRequired?: boolean } = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "操作できませんでした。");
      const updatedActions = (personalState.current?.actions ?? actions).map(item => item.id === action.id
        ? { ...item, status: "used", eligible: true, usedAt: body.redeemedAt ?? null }
        : item);
      setActions(updatedActions);
      if (personalState.current) rememberPersonal({ ...personalState.current, actions: updatedActions });
      await showSuccess("「" + action.title + "」を引き換えました", body.refreshRequired !== false);
    } catch (error) {
      discardPersonalCache();
      notify(error instanceof Error ? error.message : "エラーが発生しました。");
    } finally {
      updateToken("");
      setChallengeOpen(false);
      setChallengeError(false);
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
    const verifiedToken = currentToken.current;
    if (!verifiedToken) { notify("本人確認の完了後にもう一度お試しください。"); return; }
    // The cast consumes this token. The action list may become eligible while
    // showSuccess() is refreshing it, but must never expose the consumed token.
    updateToken("");
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
          token: verifiedToken,
          fingerprint: fingerprint(),
        }),
      });
      const data: { ok?: boolean; code?: string; message?: string } = await response.json();
      if (response.ok && data.ok) {
        // Update locally instead of re-reading every poll and candidate (saves Turso rows read).
        setPolls(old => old.map(p => p.id === poll.id
          ? withPollSelections(p, [...p.selectedIds, candidateId], p.conditionIds) : p));
        if (personalState.current) rememberPersonal({
          ...personalState.current,
          selections: [...personalState.current.selections,
            { poll_id: poll.id, candidate_id: candidateId, is_official: 1 }],
        });
        await showSuccess("「" + (candidate?.name ?? "") + "」に投票しました", actions.length > 0);
      } else {
        const message = data.message ?? "投票に失敗しました。";
        try {
          if (data.code === "ALREADY_VOTED") await refresh(true);
          else if (data.code === "ALREADY_SELECTED" || data.code === "POSSIBLE_DUPLICATE") await refresh();
          else discardPersonalCache();
          notify(message);
        } catch {
          discardPersonalCache();
          notify(message + " ページを再読み込みして投票状況を確認してください。");
        }
      }
    } catch {
      discardPersonalCache();
      notify("通信に失敗しました。再読み込みして投票状況を確認してください。");
    } finally {
      updateToken("");
      setChallengeOpen(false);
      setChallengeError(false);
      if (widgetId.current) window.turnstile?.reset(widgetId.current);
      setSaving(null);
    }
  }

  const jumpTo = useCallback((target: Target) => {
    if (target.candidateId && !document.getElementById(candidateElementId(target.pollId, target.candidateId))) {
      onFilter(target.pollId, "");
    }
    setTarget(target);
  }, [onFilter]);

  // A filtered-out candidate returns to the DOM after the filter update commits.
  useEffect(() => {
    if (!target) return;
    const elementId = target.candidateId ? candidateElementId(target.pollId, target.candidateId) : "poll-" + target.pollId;
    const node = document.getElementById(elementId);
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      node.classList.remove(styles.flash);
      void node.offsetWidth;
      node.classList.add(styles.flash);
    }
  }, [target]);

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
    if (loading || loadError) return;
    const followHash = () => {
      const id = publicIdFromHash(window.location.hash);
      if (id) jumpToAnchor(id);
    };
    window.addEventListener("hashchange", followHash);
    return () => window.removeEventListener("hashchange", followHash);
  }, [loading, loadError, jumpToAnchor]);

  // ?id= jumps to a candidate; ?category= selects a department.
  // Repeated candidate IDs open the department chooser.
  const linkHandled = useRef(false);
  useEffect(() => {
    if (loading || loadError || linkHandled.current) return;
    linkHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const category = params.get("category");
    if (!id && !category) {
      const anchor = publicIdFromHash(window.location.hash);
      if (anchor) jumpToAnchor(anchor);
      return;
    }
    const targets: Target[] = id
      ? resolveTargets(id, polls, category)
      : resolveTargets(category!, polls).filter(target => target.candidateId === null);
    if (targets.length === 1) jumpTo(targets[0]);
    else if (targets.length > 1) setChoices(targets);
    else notify("指定された部門または候補が見つかりませんでした。");
  }, [loading, loadError, polls, jumpTo, jumpToAnchor, notify]);

  // The first heading block is the form title set in the admin editor.
  const formHeader = blocks.find(block => block.kind === "heading");
  const pageTitle = formHeader?.title || "投票フォーム";
  const pageDescription = formHeader ? formHeader.body : "部門ごとに設定された数の候補へ投票できます。";
  const bodyBlocks = formHeader ? blocks.filter(block => block.id !== formHeader.id) : blocks;
  useEffect(() => {
    if (!loading) document.title = pageTitle;
  }, [loading, pageTitle]);
  useEffect(() => {
    if (!settings.logo) return;
    const defaultIcon = document.querySelector<HTMLLinkElement>('link[rel~="icon"][href="/default-icon.svg"]');
    if (!defaultIcon) return;
    defaultIcon.href = settings.logo;
    return () => { defaultIcon.href = "/default-icon.svg"; };
  }, [settings.logo]);

  const availablePolls = polls.filter(poll => poll.candidates.length > 0);
  const completed = availablePolls.filter(poll => poll.voted).length;
  const progress = availablePolls.length ? completed / availablePolls.length : 0;

  return (
    <main className={styles.main} style={themeVars(settings)} onClick={event => {
      const link = (event.target as Element).closest?.("a[data-section-link]");
      if (!link) return;
      event.preventDefault();
      const id = publicIdFromHash(link.getAttribute("href") ?? "");
      if (id) jumpToAnchor(id);
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
        {!loading && (settings.logo ? <img src={settings.logo} alt="" className={styles.mark} /> : <Mark className={styles.mark} />)}
        <span className={styles.appbarTitle}>{loading ? "" : pageTitle}</span>
        <span className={styles.appbarSpacer} />
        {availablePolls.length > 0 && <span className={styles.appbarProgress}>
          {completed} / {availablePolls.length} 部門
        </span>}
        {settings.officialUrl && <a className={styles.homeLink} href={settings.officialUrl} aria-label="公式サイト">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor"
            d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
          <span>公式サイト</span>
        </a>}
        {availablePolls.length > 0 && <div className={styles.progressTrack} role="progressbar"
          aria-label="投票済みの部門" aria-valuemin={0} aria-valuemax={availablePolls.length} aria-valuenow={completed}>
          <div className={styles.progressBar} style={{ transform: `scaleX(${progress})` }} />
        </div>}
      </header>
      <div className={styles.container}>
        <header className={styles.header} data-section={formHeader?.id}>
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
          filters={filters} onFilter={onFilter}
          saving={saving} token={token} siteKey={siteKey}
          verificationError={scriptFailed || challengeError}
          submit={submit} claimAction={claimAction} openLink={openLink}
        />}
        {needsVerification && (
          siteKey ? (
            <>
              <Script
                src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
                strategy="afterInteractive"
                onReady={() => { setScriptReady(true); setScriptFailed(false); }}
                onError={() => setScriptFailed(true)}
              />
              {scriptFailed && <section className={styles.turnstileArea}>
                <p className={styles.error} role="alert">本人確認を読み込めませんでした。通信環境を確認して再読み込みしてください。</p>
                <button type="button" className={styles.turnstileRetry} onClick={() => window.location.reload()}>再読み込み</button>
              </section>}
              {/* Keep the widget mounted for background verification, but hide its
                  completed success UI until the next token reset. */}
              <dialog
                ref={challengeDialog}
                className={`${styles.turnstileHost} ${challengeOpen ? styles.turnstileDialog : styles.turnstileIdle} ${token ? styles.turnstileVerified : ""}`}
                aria-labelledby="turnstile-dialog-title"
                onCancel={event => event.preventDefault()}
                tabIndex={-1}
              >
                <div hidden={!challengeOpen}>
                  <h2 id="turnstile-dialog-title" className={styles.turnstileTitle}>本人確認</h2>
                  <p className={styles.turnstileHelp}>投票を続けるために、以下の確認を完了してください。</p>
                </div>
                <div ref={widgetElement} className={styles.turnstileWidget} />
                {challengeOpen && challengeError && <>
                  <p role="alert" className={styles.turnstileError}>認証に失敗しました。通信環境を確認して再試行してください。</p>
                  <button type="button" className={styles.turnstileRetry} onClick={() => {
                    setChallengeError(false);
                    setChallengeOpen(false);
                    if (widgetId.current) window.turnstile?.reset(widgetId.current);
                  }}>再試行する</button>
                </>}
              </dialog>
            </>
          ) : (
            <section className={styles.turnstileArea} aria-label="不正投票防止認証">
              <p role="alert" className={styles.error}>Turnstileの設定がありません。</p>
            </section>
          )
        )}
      </div>
      <BackToTop />
      <footer className={styles.footer}>
        {settings.organizerName && <span>© {settings.organizerName}</span>}
        <button type="button" className={styles.footerLink} onClick={() => setPolicyOpen(true)}>
          プライバシーポリシー
        </button>
      </footer>
      <Dialog open={policyOpen} onClose={() => setPolicyOpen(false)} title="プライバシーポリシー" size="large">
        <PrivacyPolicy organizerName={settings.organizerName} contactEmail={settings.contactEmail} />
      </Dialog>
      <Dialog open={choices !== null} onClose={() => setChoices(null)} title="どの部門に投票しますか？" focusDialog
        onClosed={() => {
          if (chosenTarget.current) jumpTo(chosenTarget.current);
          chosenTarget.current = null;
        }}>
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
                chosenTarget.current = target;
                setChoices(null);
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

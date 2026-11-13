"use client";

import { useEffect, useState } from "react";
import styles from "./admin.module.css";
import FormStudio from "./FormStudio";
import Mark from "../Mark";

type Candidate = { id: string; name: string; votes: number; publicId?: string; extra?: Record<string,string> };
type Poll = {
  id: string; title: string; description: string; max_votes: number;
  starts_at: string; ends_at: string; is_published: number; candidates: Candidate[];
  publicId?: string; nameFontSize: number; columns: {key:string;label:string;fontSize:number}[];
};
type Condition = { type: "all" | "any"; rules: Array<{
  type: "min_distinct_polls" | "min_total_votes" | "voted_poll" | "action_used";
  count?: number; pollId?: string; actionId?: string;
}> };
type Action = {
  id: string; title: string; description: string; kind: "claim" | "link" | "notice";
  condition: Condition; config: { url?: string }; starts_at: string; ends_at: string;
  is_published: number; claims: { status: string; count: number }[];
};

export default function AdminClient() {
  const [authenticated, setAuthenticated] = useState<{ polls: Poll[]; actions: Action[] } | null>(null);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/admin/session", { cache: "no-store" });
        const session = await response.json();
        if (!session.authenticated) return;
        const adminResponse = await fetch("/api/admin", { cache: "no-store" });
        if (!adminResponse.ok) throw Error("管理情報を読み込めませんでした。");
        const data = await adminResponse.json();
        if (active) setAuthenticated(data);
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "通信エラー");
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => { active = false; };
  }, []);

  async function logout() {
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "logout" }),
      });
      if (!response.ok) throw Error("ログアウトに失敗しました。");
      setAuthenticated(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "通信エラー");
    }
  }

  if (authenticated) return <FormStudio initialData={authenticated} onLogout={logout} />;
  const error = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("auth_error") : null;
  return <main className={styles.main}>
    <div className={styles.login}>
      <Mark size={40} />
      <h1>管理画面にログイン</h1>
      <p className={styles.lead}>投票フォームの管理</p>
      {checking ? <div className={styles.progress} aria-hidden="true"><span /></div> : <>
        {(message || error) && <p role="alert" className={styles.errorBox}>
          {message || "Google認証に失敗したか、このアカウントには管理権限がありません。"}
        </p>}
        <a href="/api/admin/google/start" className={styles.googleLogin}>
          <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Googleでログイン
        </a>
        <p className={styles.muted}>管理者として許可されたアカウントのみ編集できます。ログイン状態は8時間有効です。</p>
      </>}
    </div>
  </main>;
}

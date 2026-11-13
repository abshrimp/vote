"use client";

import { useEffect, useState } from "react";
import styles from "./adminEmails.module.css";

type List = { emails: string[]; owners: string[] };

export default function AdminEmails() {
  const [list, setList] = useState<List | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/emails", { cache: "no-store" }).then(async response => {
      if (response.status === 403) return;
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "管理者一覧を取得できませんでした。");
      if (active) setList(data);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : "通信エラー"); });
    return () => { active = false; };
  }, []);

  async function update(operation: "add" | "remove", target: string) {
    if (busy) return;
    setBusy(true);
    setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/emails", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation, email: target }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "管理者を更新できませんでした。");
      setList({ emails: result.emails, owners: result.owners });
      setEmail("");
      setMessage(operation === "add" ? "ログインを許可しました。" : "ログイン許可を取り消しました。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "通信エラー");
    } finally { setBusy(false); }
  }

  if (!list) return error ? <p role="alert">{error}</p> : null;

  return <section className={styles.panel}>
    <h2>管理画面へのログイン許可</h2>
    <p className={styles.hint}>追加したメールアドレスのGoogleアカウントで管理画面にログインできます。追加・削除はオーナーのみ操作できます。</p>
    <form className={styles.add} onSubmit={e => {
      e.preventDefault(); void update("add", email);
    }}>
      <input type="email" required aria-label="追加するメールアドレス" placeholder="example@gmail.com"
        autoComplete="email" value={email} maxLength={254}
        onChange={e => setEmail(e.target.value)} disabled={busy}/>
      <button type="submit" disabled={busy || !email.trim()}>追加</button>
    </form>
    <ul className={styles.list}>
      {list.owners.map(owner => <li key={"owner:" + owner}>
        <span>{owner} <small>オーナー</small></span><span className={styles.fixed}>固定</span>
      </li>)}
      {list.emails.filter(mail => !list.owners.includes(mail)).map(mail => <li key={mail}>
        <span>{mail}</span>
        <button type="button" className={styles.remove} disabled={busy}
          onClick={() => { if (window.confirm(mail + " のログイン許可を取り消しますか？")) void update("remove", mail); }}>削除</button>
      </li>)}
    </ul>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {message && <p role="status" className={styles.message}>{message}</p>}
    <p className={styles.hint}>この設定は即時反映されます。削除されたアカウントの既存セッションも、次の管理操作から利用できなくなります。</p>
  </section>;
}

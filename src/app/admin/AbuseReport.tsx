"use client";

import { useEffect, useState } from "react";
import styles from "./studio.module.css";

type FlagRow = { poll_id: string; reason: string; count: number };
type PollLabel = { id: string; title: string };

export default function AbuseReport({ polls }: { polls: PollLabel[] }) {
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/vote/admin/stats", {
          cache: "no-store", credentials: "same-origin", signal: controller.signal,
        });
        if (!response.ok) throw new Error("不正投票の検知状況を取得できませんでした。");
        const data: { flagged?: FlagRow[] } = await response.json();
        if (!controller.signal.aborted) setFlags(data.flagged ?? []);
      } catch {
        if (!controller.signal.aborted) setError("不正投票の検知状況を取得できませんでした。");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const total = flags.reduce((sum, row) => sum + Number(row.count), 0);
  return <section className={styles.panel}>
    <h3>重複投票の検知</h3>
    <p className={styles.subtle}>
      既に投票済みの可能性があります
    </p>
    {loading && <p role="status">集計中です。</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && <>
      <p><strong>{total}件</strong> を検知</p>
      {flags.map(flag => <p key={flag.poll_id + flag.reason}>
        {polls.find(p => p.id === flag.poll_id)?.title ?? flag.poll_id}：
        {flag.count}件
      </p>)}
      {flags.length === 0 && <p className={styles.subtle}>現在、記録された疑いはありません。</p>}
    </>}
  </section>;
}

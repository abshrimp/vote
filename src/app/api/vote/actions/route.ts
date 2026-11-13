import { NextRequest, NextResponse } from "next/server";
import { cookieName, getClientIp, hmac, readSession, requireSecret } from "@/lib/voting/security.mjs";
import { query, readBatch } from "@/lib/voting/turso.mjs";
import { validId } from "@/lib/voting/logic.mjs";
import { claimStatement } from "@/lib/voting/conditions.mjs";
import { visitorActions } from "@/lib/voting/visitor-actions.mjs";
import { verifyTurnstile } from "@/lib/voting/turnstile.mjs";
import { publicActions } from "@/lib/voting/public-snapshot.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };
function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers });
}
function voter(request: NextRequest) {
  const secret = requireSecret();
  const id = readSession(request.cookies.get(cookieName())?.value, secret);
  return id ? hmac(secret, "voter", id) : null;
}

export async function GET(request: NextRequest) {
  try {
    const hash = voter(request);
    if (!hash) return json({ error: "セッションがありません。" }, 403);
    // Public action definitions are cached for 30 seconds; visitor state is never cached.
    // The sensitive per-visitor facts never enter a shared cache.
    const [definitions, personal] = await Promise.all([
      publicActions(),
      readBatch([
        { sql: "SELECT poll_id FROM votes WHERE voter_hash=?", args: [hash] },
        { sql: "SELECT action_id,redeemed_at FROM action_claims WHERE voter_hash=?", args: [hash] },
      ]),
    ]);
    const [votes, claims] = personal;
    const actions = visitorActions(definitions, votes.rows, claims.rows);
    return json({ actions });
  } catch {
    return json({ error: "追加機能を取得できませんでした。" }, 503);
  }
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin ||
      !request.headers.get("content-type")?.startsWith("application/json")) {
    return json({ error: "送信元を確認してください。" }, 403);
  }
  let data: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > 8192) return json({ error: "送信内容が大きすぎます。" }, 413);
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error();
    data = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "入力を確認してください。" }, 400);
  }
  if (!validId(data.actionId) || typeof data.token !== "string" || data.operation !== "claim") {
    return json({ error: "操作を確認してください。" }, 400);
  }
  let hash: string | null;
  try {
    hash = voter(request);
    if (!hash) return json({ error: "ページを再読み込みしてください。" }, 403);
  } catch {
    return json({ error: "設定が完了していません。" }, 503);
  }
  try {
    if (!(await verifyTurnstile(data.token, request.nextUrl.hostname.toLowerCase(),
      getClientIp(request.headers)))) {
      return json({ error: "認証に失敗しました。" }, 403);
    }
  } catch {
    return json({ error: "認証サービスを利用できません。" }, 503);
  }
  try {
    // Shared browser-session rate limit with voting.
    const bucket = Math.floor(Date.now() / 300000);
    const attempts = await query(
      "INSERT INTO vote_request_limits(voter_hash,bucket,attempts) VALUES(?,?,1) " +
      "ON CONFLICT(voter_hash,bucket) DO UPDATE SET attempts=attempts+1 " +
      "WHERE attempts<12 RETURNING attempts",
      [hash, bucket],
    );
    // No RETURNING row means the counter is already at the limit. Subsequent
    // attempts remain blocked without writing to Turso.
    if (!attempts.rows.length || Number(attempts.rows[0]?.attempts) > 12) {
      return json({ error: "操作が多すぎます。時間をおいてください。" }, 429);
    }
    const definitions = await publicActions();
    const action = definitions.find(
      (row: Record<string, unknown>) => row.id === data.actionId && row.kind === "claim",
    );
    if (!action) return json({ error: "機能が見つかりません。" }, 404);
    // The INSERT compares the cached condition_json with the current DB value;
    // changed rules fail closed instead of allowing a stale redemption.
    const statement = claimStatement(action, hash, new Date().toISOString());
    const inserted = await query(statement.sql, statement.args);
    if (inserted.rowsAffected !== 1) {
      const prior = await query(
        "SELECT 1 AS used FROM action_claims WHERE action_id=? AND voter_hash=?",
        [data.actionId, hash],
      );
      return json({
        error: prior.rows.length
          ? "すでに引き換え済みです。"
          : "利用条件を満たしていないか、受付期間外です。",
      }, 409);
    }
    return json({ ok: true });
  } catch {
    return json({ error: "操作に失敗しました。" }, 503);
  }
}

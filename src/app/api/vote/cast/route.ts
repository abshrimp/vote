import { NextRequest, NextResponse } from "next/server";
import {
  cookieName, getClientIp, hmac, canonicalDeviceSignal, readSession, requireSecret,
} from "@/lib/voting/security.mjs";
import { validId, newVoteStatement } from "@/lib/voting/logic.mjs";
import { verifyTurnstile } from "@/lib/voting/turnstile.mjs";
import { query } from "@/lib/voting/turso.mjs";
import { checkVoteRate } from "@/lib/voting/vote-rate.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin ||
      !request.headers.get("content-type")?.startsWith("application/json")) {
    return fail(403, "INVALID_ORIGIN", "このページから投票してください。");
  }

  let secret: string;
  try {
    secret = requireSecret();
    if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
      throw new Error("Database not configured");
    }
  } catch {
    return fail(503, "CONFIGURATION_ERROR", "投票システムは現在利用できません。");
  }

  const session = readSession(request.cookies.get(cookieName())?.value, secret);
  if (!session) return fail(403, "SESSION_REQUIRED", "ページを再読み込みしてから投票してください。");

  let body: Record<string, unknown>;
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 8192) {
      return fail(413, "TOO_LARGE", "送信内容が大きすぎます。");
    }
    const text = await request.text();
    if (text.length > 8192) return fail(413, "TOO_LARGE", "送信内容が大きすぎます。");
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid JSON");
    body = parsed as Record<string, unknown>;
  } catch {
    return fail(400, "INVALID_JSON", "送信内容を確認してください。");
  }
  const { pollId, candidateId, token, fingerprint } = body;
  if (!validId(pollId) || !validId(candidateId) ||
      typeof token !== "string" || token.length < 1 || token.length > 2048) {
    return fail(400, "INVALID_VOTE", "投票内容を確認してください。");
  }

  const ip = getClientIp(request.headers);
  const voterHash = hmac(secret, "voter", session);
  const ipHash = ip ? hmac(secret, "ip", ip) : null;
  const fingerprintText = canonicalDeviceSignal(fingerprint);
  const fingerprintHash = fingerprintText ? hmac(secret, "fingerprint", fingerprintText) : null;

  // In strict mode, missing network/browser signals must not quietly bypass
  // the atomic duplicate check. An opt-in monitor mode is available for testing.
  const mode = process.env.VOTE_MATCH_MODE === "monitor" ? "monitor" : "block";
  if (mode === "block" && (!ipHash || !fingerprintHash)) {
    return fail(403, "SIGNALS_REQUIRED", "投票端末の認証情報を確認できません。ブラウザの設定を確認してください。");
  }
  try {
    const limit = await checkVoteRate({ secret, voterHash, ipHash, fingerprintHash });
    if (!limit.allowed) {
      return fail(429, "RATE_LIMITED", "操作が多すぎます。時間をおいてからお試しください。");
    }
  } catch {
    return fail(503, "RATE_LIMIT_UNAVAILABLE", "投票の安全確認ができません。時間をおいてお試しください。");
  }

  try {
    const hostname = request.nextUrl.hostname.toLowerCase();
    if (!(await verifyTurnstile(token, hostname, ip))) {
      return fail(403, "TURNSTILE_FAILED", "認証に失敗しました。もう一度お試しください。");
    }
  } catch {
    return fail(503, "TURNSTILE_UNAVAILABLE", "認証サービスに接続できません。");
  }

  try {
    const statement = newVoteStatement({
      pollId, candidateId, voterHash, ipHash, fingerprintHash,
      now: new Date().toISOString(), matchMode: mode,
    });
    const inserted = await query(statement.sql, statement.args);
    if (inserted.rows.length === 1) {
      if (Number(inserted.rows[0]?.is_official) === 0) {
        return NextResponse.json({
          ok: false, code: "POSSIBLE_DUPLICATE", conditionCounted: true,
          message: "この端末では既に投票済みの可能性があります。",
        }, { status: 409, headers: { "Cache-Control": "no-store" } });
      }
      return NextResponse.json({ ok: true }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    // Rejections are uncommon: diagnose with a single indexed read instead
    // of issuing up to four sequential queries on every unsuccessful attempt.
    const now = new Date().toISOString();
    const status = await query(
      "SELECT EXISTS(SELECT 1 FROM votes WHERE poll_id=? AND voter_hash=? AND candidate_id=?) AS chosen, " +
      "EXISTS(SELECT 1 FROM polls p JOIN candidates c ON c.poll_id=p.id AND c.id=? " +
      "WHERE p.id=? AND p.is_published=1 AND p.starts_at<=? AND p.ends_at>?) AS is_open, " +
      "EXISTS(SELECT 1 FROM votes WHERE poll_id=? AND voter_hash=? AND is_official=0) AS blocked, " +
      "(SELECT COUNT(*) FROM votes WHERE poll_id=? AND voter_hash=?) AS used, " +
      "(SELECT max_votes FROM polls WHERE id=?) AS max_votes",
      [pollId, voterHash, candidateId, candidateId, pollId, now, now,
        pollId, voterHash, pollId, voterHash, pollId],
    );
    const state = status.rows[0] ?? {};
    if (state.chosen) return fail(409, "ALREADY_SELECTED", "この候補には投票済みです。");
    if (!state.is_open) return fail(409, "NOT_OPEN", "この投票は現在受け付けていません。");
    if (state.blocked) return fail(409, "POSSIBLE_DUPLICATE", "この端末では既に投票済みの可能性があります。");
    if (Number(state.used) >= Number(state.max_votes)) {
      return fail(409, "ALREADY_VOTED", "この部門の投票可能数に達しています。");
    }
    return fail(409, "VOTE_FAILED", "投票を受け付けられませんでした。");
  } catch {
    console.error("Voting database request failed");
    return fail(503, "DATABASE_ERROR", "投票処理に失敗しました。再読み込みして状態を確認してください。");
  }
}

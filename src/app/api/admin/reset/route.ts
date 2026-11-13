import { NextRequest, NextResponse } from "next/server";
import { isAdmin, sameOrigin } from "@/lib/voting/admin.mjs";
import { transaction } from "@/lib/voting/turso.mjs";
import { RESET_PHRASE, resetStatements } from "@/lib/voting/reset.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const answer = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });

/** Clears every vote, claim and duplicate-vote signal. Polls, candidates and settings stay. */
export async function POST(request: NextRequest) {
  if (!isAdmin(request)) return answer({ error: "管理者認証が必要です。" }, 401);
  if (!sameOrigin(request)) return answer({ error: "送信元を確認してください。" }, 403);
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 256) return answer({ error: "入力が大きすぎます。" }, 413);
    body = JSON.parse(raw);
  } catch { return answer({ error: "入力が正しくありません。" }, 400); }
  if (body?.confirm !== RESET_PHRASE) return answer({ error: "確認の文字が一致しません。" }, 400);
  try {
    await transaction(resetStatements());
    return answer({ ok: true });
  } catch {
    return answer({ error: "リセットに失敗しました。データは変更されていません。" }, 503);
  }
}

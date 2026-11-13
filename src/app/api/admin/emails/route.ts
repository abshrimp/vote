import { NextRequest, NextResponse } from "next/server";
import { adminSession, googleConfig } from "@/lib/voting/google-admin.mjs";
import { sameOrigin } from "@/lib/voting/admin.mjs";
import {
  normalizeAdminEmail, readExtraAdminEmails, saveExtraAdminEmails,
} from "@/lib/voting/admin-emails.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });

// Only deployment-configured owners may grant or revoke administrator access.
// A newly invited editor cannot elevate other accounts, even with a signed session.
function isOwner(request: NextRequest) {
  const owner = adminSession(request);
  const config = googleConfig();
  return Boolean(owner && config?.allowed.includes(owner.email));
}

export async function GET(request: NextRequest) {
  if (!isOwner(request)) return reply({ error: "管理者の追加・削除はオーナーのみ操作できます。" }, 403);
  try {
    return reply({ emails: await readExtraAdminEmails(), owners: googleConfig()!.allowed });
  } catch {
    return reply({ error: "管理者一覧の取得に失敗しました。" }, 503);
  }
}

export async function POST(request: NextRequest) {
  if (!isOwner(request)) return reply({ error: "管理者の追加・削除はオーナーのみ操作できます。" }, 403);
  if (!sameOrigin(request)) return reply({ error: "送信元を確認してください。" }, 403);
  let payload: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return reply({ error: "入力が大きすぎます。" }, 413);
    payload = JSON.parse(raw);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw Error();
  } catch { return reply({ error: "入力内容を確認してください。" }, 400); }

  const email = normalizeAdminEmail(payload.email);
  const operation = payload.operation;
  if (!email || (operation !== "add" && operation !== "remove")) {
    return reply({ error: "メールアドレスを確認してください。" }, 400);
  }
  if (googleConfig()!.allowed.includes(email)) {
    return reply({ error: "環境変数で指定したオーナーはこの画面では変更できません。" }, 409);
  }
  try {
    const current = await readExtraAdminEmails();
    const next = operation === "add" ? [...new Set([...current, email])]
      : current.filter(item => item !== email);
    if (next.length > 100) return reply({ error: "追加できる管理者は100件までです。" }, 400);
    if (next.length !== current.length) await saveExtraAdminEmails(next);
    return reply({ ok: true, emails: next, owners: googleConfig()!.allowed });
  } catch {
    return reply({ error: "管理者の更新に失敗しました。" }, 503);
  }
}

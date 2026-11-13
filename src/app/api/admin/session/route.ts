import { NextRequest, NextResponse } from "next/server";
import { isAdmin, sameOrigin } from "@/lib/voting/admin.mjs";
import { adminCookieName, adminSession } from "@/lib/voting/google-admin.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authenticated = await isAdmin(request);
  return NextResponse.json({
    authenticated,
    email: authenticated ? adminSession(request)?.email ?? null : null,
  }, { headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "送信元を確認してください。" }, { status: 403 });
  }
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "入力を確認してください。" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("operation" in body) || body.operation !== "logout") {
    return NextResponse.json({ error: "対応していない操作です。" }, { status: 400 });
  }
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.delete(adminCookieName());
  return response;
}

import { NextRequest, NextResponse } from "next/server";
import { cookieName, createSession, hmac, readSession, requireSecret } from "@/lib/voting/security.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const secret = requireSecret();
    const name = cookieName();
    const current = request.cookies.get(name)?.value;
    const existing = readSession(current, secret);
    const created = existing ? null : createSession(secret);
    const sessionId = existing ?? readSession(created, secret);
    if (!sessionId) throw Error("Failed to establish a voting session");
    // Opaque identifier lets the browser cache only this HttpOnly cookie's state.
    // It is not an authentication token and cannot submit votes.
    const response = NextResponse.json({ ok: true, cacheKey: hmac(secret, "client-cache", sessionId) }, {
      headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" },
    });
    if (created) {
      response.cookies.set({
        name,
        value: created,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 90,
      });
    }
    return response;
  } catch {
    return NextResponse.json({ error: "投票システムの設定が完了していません。" }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}

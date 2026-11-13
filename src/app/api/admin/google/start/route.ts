import { NextRequest, NextResponse } from "next/server";
import { requireSecret } from "@/lib/voting/security.mjs";
import { googleConfig, googleAuthUrl, oauthCookieName, startGoogleLogin } from "@/lib/voting/google-admin.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const config = googleConfig();
  if (!config) return NextResponse.json({ error: "Google管理者ログインが未設定です。" }, { status: 503 });
  const login = startGoogleLogin(requireSecret());
  const response = NextResponse.redirect(googleAuthUrl(config, request.nextUrl.origin,
    login.state, login.nonce, login.challenge));
  response.cookies.set({
    name: oauthCookieName(), value: login.cookie, httpOnly: true,
    secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", maxAge: 600,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

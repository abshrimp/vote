import { NextRequest, NextResponse } from "next/server";
import { requireSecret } from "@/lib/voting/security.mjs";
import {
  adminCookieName, oauthCookieName, googleConfig, readGoogleLogin,
  verifyGoogleIdToken, createGoogleAdminSession, ADMIN_TTL,
} from "@/lib/voting/google-admin.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const config = googleConfig();
  const origin = request.nextUrl.origin;
  const fail = (reason: string) => {
    const response = NextResponse.redirect(origin + "/admin?auth_error=" + encodeURIComponent(reason));
    response.cookies.delete(oauthCookieName());
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  if (!config) return fail("config");
  if (request.nextUrl.searchParams.has("error")) return fail("denied");
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const pending = readGoogleLogin(request.cookies.get(oauthCookieName())?.value,
    requireSecret(), state);
  if (!pending || !code || code.length > 2048) return fail("state");
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: config.clientId, client_secret: config.clientSecret,
        redirect_uri: origin + "/api/admin/google/callback",
        grant_type: "authorization_code", code_verifier: pending.verifier,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return fail("exchange");
    const tokens = await response.json();
    const identity = await verifyGoogleIdToken(tokens.id_token, config.clientId, pending.nonce);
    if (!config.allowed.includes(identity.email)) return fail("forbidden");
    const success = NextResponse.redirect(origin + "/admin");
    success.cookies.delete(oauthCookieName());
    success.cookies.set({
      name: adminCookieName(),
      value: createGoogleAdminSession(identity.email, identity.sub, requireSecret()),
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "lax", path: "/", maxAge: ADMIN_TTL,
    });
    success.headers.set("Cache-Control", "no-store");
    return success;
  } catch {
    return fail("verification");
  }
}

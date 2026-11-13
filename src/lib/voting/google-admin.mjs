import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";
import { requireSecret } from "./security.mjs";

const EIGHT_HOURS = 8 * 3600;
const OAUTH_TTL = 600;
const b64 = value => Buffer.from(value).toString("base64url");
const unb64 = value => Buffer.from(value, "base64url").toString("utf8");
const random = () => randomBytes(32).toString("base64url");

export function googleConfig(env = process.env) {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  const allowed = (env.GOOGLE_ADMIN_EMAILS ?? "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  if (!clientId || !clientSecret || !allowed.length || !env.VOTE_HMAC_SECRET ||
    env.VOTE_HMAC_SECRET.length < 32) return null;
  return { clientId, clientSecret, allowed };
}

export function adminCookieName(production = process.env.NODE_ENV === "production") {
  return production ? "__Host-festival-admin" : "festival-admin";
}
export function oauthCookieName(production = process.env.NODE_ENV === "production") {
  return production ? "__Host-festival-oauth" : "festival-oauth";
}

function mac(body, secret) {
  return createHmac("sha256", secret).update("festival-admin-google\0").update(body).digest("base64url");
}
function signed(payload, secret) {
  const body = b64(JSON.stringify(payload));
  return body + "." + mac(body, secret);
}
function unsign(cookie, secret) {
  if (typeof cookie !== "string" || cookie.length > 4096) return null;
  const parts = cookie.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return null;
  const expected = Buffer.from(mac(parts[0], secret));
  const actual = Buffer.from(parts[1]);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try { return JSON.parse(unb64(parts[0])); } catch { return null; }
}

export function startGoogleLogin(secret, now = Date.now()) {
  const state = random(), nonce = random(), verifier = random();
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const cookie = signed({ state, nonce, verifier, issued: Math.floor(now / 1000) }, secret);
  return { state, nonce, verifier, challenge, cookie };
}
export function readGoogleLogin(cookie, secret, state, now = Date.now()) {
  const payload = unsign(cookie, secret);
  if (!payload || typeof state !== "string" || state.length > 100 || payload.state !== state ||
    !/^[A-Za-z0-9_-]{43}$/.test(payload.verifier) ||
    !/^[A-Za-z0-9_-]{43}$/.test(payload.nonce) ||
    !Number.isInteger(payload.issued) || Math.floor(now / 1000) - payload.issued < 0 ||
    Math.floor(now / 1000) - payload.issued >= OAUTH_TTL) return null;
  return payload;
}
export function createGoogleAdminSession(email, sub, secret, now = Date.now()) {
  return signed({ email, sub, issued: Math.floor(now / 1000) }, secret);
}
export function readGoogleAdminSession(cookie, config, now = Date.now()) {
  if (!config) return null;
  const payload = unsign(cookie, requireSecret());
  if (!payload || typeof payload.email !== "string" || typeof payload.sub !== "string" ||
    !/^[0-9]{10,32}$/.test(payload.sub) || !Number.isInteger(payload.issued) ||
    Math.floor(now / 1000) - payload.issued < 0 ||
    Math.floor(now / 1000) - payload.issued >= EIGHT_HOURS ||
    !config.allowed.includes(payload.email.toLowerCase())) return null;
  return { email: payload.email, sub: payload.sub };
}
export function adminSession(request) {
  return readGoogleAdminSession(request.cookies?.get(adminCookieName())?.value, googleConfig());
}
export function googleAuthUrl(config, origin, state, nonce, challenge) {
  const params = new URLSearchParams({
    client_id: config.clientId, redirect_uri: origin + "/api/admin/google/callback",
    response_type: "code", scope: "openid email", state, nonce,
    code_challenge: challenge, code_challenge_method: "S256",
    prompt: "select_account",
  });
  return "https://accounts.google.com/o/oauth2/v2/auth?" + params;
}

export async function verifyGoogleIdToken(jwt, clientId, nonce, fetcher = fetch, now = Date.now()) {
  if (typeof jwt !== "string" || jwt.length > 12000) throw Error("Invalid Google token");
  const parts = jwt.split(".");
  if (parts.length !== 3) throw Error("Invalid Google token");
  const header = JSON.parse(unb64(parts[0]));
  const claims = JSON.parse(unb64(parts[1]));
  if (header.alg !== "RS256" || typeof header.kid !== "string" ||
    claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com" ||
    claims.aud !== clientId || claims.nonce !== nonce || claims.email_verified !== true ||
    typeof claims.email !== "string" || !/^[0-9]{10,32}$/.test(claims.sub) ||
    !Number.isInteger(claims.exp) || claims.exp <= Math.floor(now / 1000) ||
    !Number.isInteger(claims.iat) || claims.iat > Math.floor(now / 1000) + 60) throw Error("Invalid Google identity");
  const response = await fetcher("https://www.googleapis.com/oauth2/v3/certs", { cache: "no-store" });
  if (!response.ok) throw Error("Google signing keys unavailable");
  const keys = await response.json();
  const jwk = keys.keys?.find(k => k.kid === header.kid && k.kty === "RSA" && k.use === "sig" && k.alg === "RS256");
  if (!jwk || !verify("RSA-SHA256", Buffer.from(parts[0] + "." + parts[1]),
    createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(parts[2], "base64url"))) {
    throw Error("Invalid Google token signature");
  }
  return { email: claims.email.toLowerCase(), sub: claims.sub };
}
export const ADMIN_TTL = EIGHT_HOURS;

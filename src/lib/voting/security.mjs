import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

const SESSION_ID = /^[A-Za-z0-9_-]{43}$/;
const SESSION_MAC = /^[A-Za-z0-9_-]{43}$/;

export function cookieName(production = process.env.NODE_ENV === "production") {
  return production ? "__Host-festival-voter" : "festival-voter";
}

export function requireSecret(env = process.env) {
  const secret = env.VOTE_HMAC_SECRET;
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("VOTE_HMAC_SECRET must be at least 32 characters");
  }
  return secret;
}

export function hmac(secret, purpose, value) {
  return createHmac("sha256", secret)
    .update(purpose)
    .update("\0")
    .update(value)
    .digest("hex");
}

function sign(secret, id) {
  return createHmac("sha256", secret)
    .update("voter-session\0")
    .update(id)
    .digest("base64url");
}

export function createSession(secret) {
  const id = randomBytes(32).toString("base64url");
  return id + "." + sign(secret, id);
}

export function readSession(cookie, secret) {
  if (typeof cookie !== "string" || cookie.length > 100) return null;
  const parts = cookie.split(".");
  if (parts.length !== 2 || !SESSION_ID.test(parts[0]) || !SESSION_MAC.test(parts[1])) {
    return null;
  }
  const supplied = Buffer.from(parts[1]);
  const expected = Buffer.from(sign(secret, parts[0]));
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
    ? parts[0]
    : null;
}

// Trust only the IP header populated by the deployment platform. Never
// accept generic x-forwarded-for or an IP sent in the request body.
// On Cloudflare Workers, Cloudflare sets CF-Connecting-IP on incoming requests.
export function getClientIp(headers, isVercel = Boolean(process.env.VERCEL)) {
  const value = isVercel
    ? headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    : headers.get("cf-connecting-ip")?.trim();
  return value && isIP(value) ? value.toLowerCase() : null;
}

// Browser-independent, deliberately low-entropy hints for duplicate detection.
// User-Agent is omitted because it changes between browsers on one device.
// This is NOT a unique device identifier: different devices may still collide.
export function canonicalDeviceSignal(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { language, timezone, platform, screenWidth, screenHeight, pixelRatio, touchPoints } = raw;
  if (
    typeof language !== "string" || language.length < 2 || language.length > 50 ||
    typeof timezone !== "string" || timezone.length < 1 || timezone.length > 80 ||
    typeof platform !== "string" || platform.length > 80 ||
    !Number.isInteger(screenWidth) || screenWidth < 100 || screenWidth > 20000 ||
    !Number.isInteger(screenHeight) || screenHeight < 100 || screenHeight > 20000 ||
    typeof pixelRatio !== "number" || !Number.isFinite(pixelRatio) ||
    pixelRatio < 0.5 || pixelRatio > 10 ||
    !Number.isInteger(touchPoints) || touchPoints < 0 || touchPoints > 32
  ) return null;
  const [short, long] = [screenWidth, screenHeight].sort((a, b) => a - b);
  return JSON.stringify([
    language, timezone, platform, short, long,
    Math.round(pixelRatio * 10) / 10, touchPoints,
  ]);
}

export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const first = Buffer.from(a);
  const second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}

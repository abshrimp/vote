import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { isAdmin } from "../src/lib/voting/admin.mjs";
import {
  adminCookieName, googleConfig, startGoogleLogin, readGoogleLogin,
  createGoogleAdminSession, readGoogleAdminSession, verifiedGoogleAdminSession, verifyGoogleIdToken,
} from "../src/lib/voting/google-admin.mjs";

const secret = "test-secret-for-admin-google-session-123456789";
const config = { clientId: "client.apps.googleusercontent.com", clientSecret: "test",
  allowed: ["admin@example.com"] };
const now = Date.parse("2026-11-13T00:00:00Z");

test("OAuth state is signed, PKCE-bound, expires, and rejects tampering", () => {
  const login = startGoogleLogin(secret, now);
  assert.equal(readGoogleLogin(login.cookie, secret, login.state, now)?.nonce, login.nonce);
  assert.equal(readGoogleLogin(login.cookie, secret, "other", now), null);
  assert.equal(readGoogleLogin(login.cookie, secret, login.state, now + 600000), null);
  assert.equal(readGoogleLogin(login.cookie, secret + "wrong", login.state, now), null);
  assert.equal(login.challenge.length, 43);
});

test("Google admin cookie is signed, allowlisted, and expires in eight hours", () => {
  const old = process.env.VOTE_HMAC_SECRET;
  process.env.VOTE_HMAC_SECRET = secret;
  try {
    const cookie = createGoogleAdminSession("admin@example.com", "123456789012", secret, now);
    assert.deepEqual(readGoogleAdminSession(cookie, config, now)?.email, "admin@example.com");
    assert.equal(readGoogleAdminSession(cookie, config, now + 8*3600*1000), null);
    assert.equal(readGoogleAdminSession(cookie, { ...config, allowed: ["other@example.com"] }, now), null);
    assert.equal(verifiedGoogleAdminSession(cookie, now)?.email, "admin@example.com");
    assert.equal(readGoogleAdminSession(cookie.slice(0, -1) + "x", config, now), null);
    assert.equal(adminCookieName(true), "__Host-festival-admin");
  } finally {
    if (old === undefined) delete process.env.VOTE_HMAC_SECRET;
    else process.env.VOTE_HMAC_SECRET = old;
  }
});

test("Google admin authentication rejects old Bearer tokens", async () => {
  const old = { secret: process.env.VOTE_HMAC_SECRET, id: process.env.GOOGLE_CLIENT_ID,
    client: process.env.GOOGLE_CLIENT_SECRET, emails: process.env.GOOGLE_ADMIN_EMAILS };
  process.env.VOTE_HMAC_SECRET = secret;
  process.env.GOOGLE_CLIENT_ID = config.clientId;
  process.env.GOOGLE_CLIENT_SECRET = config.clientSecret;
  process.env.GOOGLE_ADMIN_EMAILS = "admin@example.com";
  try {
    const cookie = createGoogleAdminSession("admin@example.com", "123456789012", secret);
    const request = {
      cookies: { get(name) { return name === adminCookieName() ? { value: cookie } : undefined; } },
      headers: new Headers(),
    };
    assert.equal(await isAdmin(request), true);
    assert.equal(await isAdmin({ cookies: { get() { return undefined; } },
      headers: new Headers({ authorization: "Bearer old-admin-secret" }) }), false);
    assert.equal(googleConfig().allowed[0], "admin@example.com");
  } finally {
    for (const [key,value] of Object.entries({
      VOTE_HMAC_SECRET: old.secret, GOOGLE_CLIENT_ID: old.id,
      GOOGLE_CLIENT_SECRET: old.client, GOOGLE_ADMIN_EMAILS: old.emails,
    })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("Google ID token requires a valid RSA signature and verified email", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const encode = obj => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const header = encode({ alg: "RS256", kid: "test-key" });
  const claims = { iss: "https://accounts.google.com", aud: config.clientId,
    nonce: "nonce", email_verified: true, email: "admin@example.com",
    sub: "123456789012", iat: Math.floor(now / 1000) - 30,
    exp: Math.floor(now / 1000) + 3600 };
  const jwt = data => {
    const body = header + "." + encode(data);
    return body + "." + sign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url");
  };
  const fetcher = async () => ({ ok: true, json: async () => ({
    keys: [{ ...jwk, kid: "test-key", alg: "RS256", use: "sig" }],
  }) });
  assert.equal((await verifyGoogleIdToken(jwt(claims), config.clientId, "nonce", fetcher, now)).email,
    "admin@example.com");
  await assert.rejects(() => verifyGoogleIdToken(jwt({ ...claims, email_verified: false }),
    config.clientId, "nonce", fetcher, now), /Invalid Google identity/);
  await assert.rejects(() => verifyGoogleIdToken(jwt(claims), config.clientId,
    "other", fetcher, now), /Invalid Google identity/);
});

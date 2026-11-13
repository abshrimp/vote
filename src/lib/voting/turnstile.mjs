export async function verifyTurnstile(token, hostname, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const allowed = (process.env.TURNSTILE_ALLOWED_HOSTNAMES ?? "")
    .split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
  if (!secret || !allowed.includes(hostname)) throw new Error("Turnstile not configured");
  if (typeof token !== "string" || token.length < 1 || token.length > 2048) return false;
  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form, cache: "no-store", signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error("Turnstile unavailable");
  const data = await res.json();
  return data.success === true && data.hostname === hostname && data.action === "festival_vote";
}

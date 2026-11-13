/**
 * Cache only deliberately public, session-independent GET responses.
 * Cloudflare's Cache API is per data center. On Vercel the same responses
 * are cached by the CDN via s-maxage; on other hosts this is a no-op.
 */
export async function withPublicEdgeCache(request: Request, generate: () => Promise<Response>): Promise<Response> {
  const cfCache = (globalThis as typeof globalThis & {
    caches?: CacheStorage & { default?: Cache };
  }).caches?.default;
  if (!cfCache) return generate();

  // Query strings are irrelevant to these endpoints; a canonical key also
  // prevents unlimited cache-key proliferation from arbitrary search params.
  const url = new URL(request.url);
  url.search = "";
  url.hash = "";
  const key = new Request(url.toString(), { method: "GET" });
  try {
    const cached = await cfCache.match(key);
    if (cached) return cached;
  } catch {
    // Missing Cache API support must never make the public page unavailable.
  }
  const response = await generate();
  if (response.ok && !response.headers.has("set-cookie")) {
    try { await cfCache.put(key, response.clone()); }
    catch { /* The response remains usable even when the cache is unavailable. */ }
  }
  return response;
}

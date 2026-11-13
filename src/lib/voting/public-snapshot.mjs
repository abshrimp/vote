import { query, readBatch } from "./turso.mjs";
import { cleanSettings } from "./settings.mjs";

// Process-local de-duplication is only a fallback. The shared public API also
// advertises a short CDN TTL; nothing personalized enters either cache.
export function createTtlCache(loader, ttlMs = 30_000, now = Date.now) {
  let entry = null;
  return async () => {
    const current = now();
    if (entry && current < entry.expiresAt) return entry.promise;
    const promise = Promise.resolve().then(loader);
    entry = { expiresAt: current + ttlMs, promise };
    try { return await promise; }
    catch (error) {
      if (entry?.promise === promise) entry = null;
      throw error;
    }
  };
}

/** Public page structure only: no votes, claim state, or 120 KB OGP payload. */
async function loadPublicSnapshot() {
  const now = new Date().toISOString();
  const [polls, layout, settings] = await readBatch([
    {
      sql: "SELECT p.id AS poll_id,p.public_id AS poll_public_id,p.title,p.description,p.max_votes,p.name_font_size,p.columns_json," +
        "c.id AS candidate_id,c.public_id AS candidate_public_id,c.name AS candidate_name,c.extra_json AS candidate_extra_json " +
        "FROM polls p LEFT JOIN candidates c ON c.poll_id=p.id " +
        "WHERE p.is_published=1 AND p.starts_at<=? AND p.ends_at>? " +
        "ORDER BY p.id,c.sort_order,c.id",
      args: [now, now],
    },
    {
      sql: "SELECT id,kind,reference_id," +
        "CASE WHEN is_published=1 THEN title ELSE '' END AS title," +
        "CASE WHEN is_published=1 THEN body ELSE '' END AS body," +
        "is_published FROM page_blocks ORDER BY sort_order,id",
    },
    // Favicon and OGP are served independently; never load them for page JSON.
    { sql: "SELECT key,value FROM form_settings WHERE key NOT IN ('favicon','ogp')" },
  ]);
  return { pollRows: polls.rows, blocks: layout.rows, settings: cleanSettings(settings.rows) };
}

export const publicSnapshot = createTtlCache(loadPublicSnapshot);

/** Action conditions are small and remain server-side (links can be private). */
export const publicActions = createTtlCache(async () => {
  const now = new Date().toISOString();
  const result = await query(
    "SELECT id,title,description,kind,config_json,condition_json FROM actions " +
    "WHERE is_published=1 AND starts_at<=? AND ends_at>? ORDER BY id", [now, now],
  );
  return result.rows;
});

/** Server metadata must not read the full 196-candidate public snapshot. */
export const siteMetadata = createTtlCache(async () => {
  const result = await query(
    "SELECT COALESCE((SELECT title FROM page_blocks WHERE kind='heading' " +
      "AND is_published=1 AND title<>'' ORDER BY sort_order,id LIMIT 1),'投票フォーム') AS title," +
      "EXISTS(SELECT 1 FROM form_settings WHERE key='favicon' AND value<>'') AS favicon," +
      "EXISTS(SELECT 1 FROM form_settings WHERE key='ogp' AND value<>'') AS ogp",
  );
  return result.rows[0] ?? { title: "投票フォーム", favicon: 0, ogp: 0 };
});

const iconData = createTtlCache(async () =>
  (await query("SELECT value FROM form_settings WHERE key='favicon'")).rows[0]?.value ?? null);
const ogpData = createTtlCache(async () =>
  (await query("SELECT value FROM form_settings WHERE key='ogp'")).rows[0]?.value ?? null);

export function siteImage(key) {
  if (key === "favicon") return iconData();
  if (key === "ogp") return ogpData();
  throw new TypeError("Unsupported site image");
}

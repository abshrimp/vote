import { readBatch } from "./turso.mjs";
import { cleanSettings } from "./settings.mjs";

// Short-lived cache of PUBLIC page content only. Never cache voter state.
// A shared in-flight promise also avoids thundering-herd DB reads per isolate.
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

async function loadPublicSnapshot() {
  const now = new Date().toISOString();
  const [polls, layout, settings, actions] = await readBatch([
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
    { sql: "SELECT key,value FROM form_settings" },
    { sql: "SELECT id,title,description,kind,config_json,condition_json FROM actions " +
      "WHERE is_published=1 AND starts_at<=? AND ends_at>? ORDER BY id", args: [now, now] },
  ]);
  return { pollRows: polls.rows, blocks: layout.rows,
    settings: cleanSettings(settings.rows), activeActions: actions.rows, hasActions: actions.rows.length > 0 };
}

export const publicSnapshot = createTtlCache(loadPublicSnapshot);

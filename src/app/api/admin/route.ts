import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdmin, sameOrigin, cleanText, validRange, validateAction, actionConfig } from "@/lib/voting/admin.mjs";
import { validId } from "@/lib/voting/logic.mjs";
import { parseColumns, parseCells, parseNameStyle } from "@/lib/voting/columns.mjs";
import { query, readBatch } from "@/lib/voting/turso.mjs";
import { updatePollStatement } from "@/lib/voting/admin-update.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}
function invalid(message = "入力内容を確認してください。") {
  return response({ error: message }, 400);
}
function id() {
  return randomUUID().replaceAll("-", "_");
}
const bool = (value: unknown) => value === true ? 1 : 0;

export async function GET(request: NextRequest) {
  if (!isAdmin(request)) return response({ error: "認証が必要です。" }, 401);
  try {
    // All independent SELECTs share one Turso HTTP request.
    const [polls, candidates, actions, claims] = await readBatch([
      { sql: "SELECT id,public_id,title,description,starts_at,ends_at,is_published,max_votes,name_font_size,columns_json FROM polls ORDER BY id" },
      { sql: "SELECT c.poll_id,c.id,c.public_id,c.name,c.sort_order,c.extra_json," +
        "COALESCE(t.total,0) AS votes FROM candidates c LEFT JOIN candidate_totals t " +
        "ON t.poll_id=c.poll_id AND t.candidate_id=c.id ORDER BY c.poll_id,c.sort_order,c.id" },
      { sql: "SELECT id,title,description,kind,config_json,condition_json,starts_at,ends_at,is_published FROM actions ORDER BY id" },
      { sql: "SELECT action_id,'used' AS status,total AS count FROM action_totals ORDER BY action_id" },
    ]);
    const candidatesByPoll = new Map<string, Record<string, unknown>[]>();
    for (const candidate of candidates.rows) {
      const pollId = String(candidate.poll_id);
      const collection = candidatesByPoll.get(pollId) ?? [];
      collection.push(candidate);
      candidatesByPoll.set(pollId, collection);
    }
    const claimsByAction = new Map<string, Record<string, unknown>[]>();
    for (const claim of claims.rows) {
      const actionId = String(claim.action_id);
      const collection = claimsByAction.get(actionId) ?? [];
      collection.push(claim);
      claimsByAction.set(actionId, collection);
    }

    return response({
      polls: polls.rows.map((p: Record<string, unknown>) => ({
        ...p,
        publicId: p.public_id ?? "",
        nameFontSize: p.name_font_size,
        columns: parseColumns(p.columns_json),
        nameStyle: parseNameStyle(p.columns_json),
        candidates: (candidatesByPoll.get(String(p.id)) ?? []).map((c: Record<string, unknown>) => ({
            ...c,
            publicId: c.public_id ?? "",
            extra: parseCells(c.extra_json, parseColumns(p.columns_json)),
            votes: Number(c.votes),
          })),
      })),
      actions: actions.rows.map((a: Record<string, unknown>) => ({
        ...a,
        condition: JSON.parse(String(a.condition_json)),
        config: JSON.parse(String(a.config_json)),
        claims: claimsByAction.get(String(a.id)) ?? [],
      })),
    });
  } catch {
    return response({ error: "管理データを取得できませんでした。DB初期化を確認してください。" }, 503);
  }
}

export async function POST(request: NextRequest) {
  if (!isAdmin(request)) return response({ error: "認証が必要です。" }, 401);
  if (!sameOrigin(request)) return response({ error: "不正な送信元です。" }, 403);
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 16384) return invalid("送信内容が大きすぎます。");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return invalid();
    body = parsed as Record<string, unknown>;
  } catch {
    return invalid();
  }
  const operation = body.operation;
  try {
    switch (operation) {
      case "create_poll": {
        const title = cleanText(body.title);
        const description = typeof body.description === "string" &&
          body.description.length <= 2000 ? body.description : null;
        const maxVotes = Number(body.maxVotes);
        if (!title || description === null || !validRange(body.startsAt, body.endsAt) ||
          !Number.isInteger(maxVotes) || maxVotes < 1 || maxVotes > 20) return invalid();
        const pollId = id();
        await query(
          "INSERT INTO polls(id,title,description,starts_at,ends_at,is_published,max_votes) VALUES(?,?,?,?,?,?,?)",
          [pollId, title, description, body.startsAt, body.endsAt, bool(body.isPublished), maxVotes],
        );
        return response({ ok: true, id: pollId });
      }
      case "update_poll": {
        const title = cleanText(body.title);
        const description = typeof body.description === "string" &&
          body.description.length <= 2000 ? body.description : null;
        const maxVotes = Number(body.maxVotes);
        if (!validId(body.id) || !title || description === null ||
          !validRange(body.startsAt, body.endsAt) ||
          !Number.isInteger(maxVotes) || maxVotes < 1 || maxVotes > 20) return invalid();
        const update = updatePollStatement({
          id: body.id, title, description, startsAt: body.startsAt, endsAt: body.endsAt,
          isPublished: bool(body.isPublished), maxVotes,
        });
        const updated = await query(update.sql, update.args);
        if (!updated.rows.length) {
          // Only the unusual missing/rejected path needs an extra indexed read.
          const found = await query("SELECT 1 AS found FROM polls WHERE id=?", [body.id]);
          if (!found.rows.length) return response({ error: "部門が見つかりません。" }, 404);
          return invalid("既存の投票数より少ない上限には変更できません。");
        }
        return response({ ok: true });
      }
      case "create_candidate": {
        if (!validId(body.pollId) || !cleanText(body.name)) return invalid();
        const candidateId = id();
        await query("INSERT INTO candidates(poll_id,id,name,sort_order) " +
          "SELECT ?,?,?,COALESCE((SELECT MAX(sort_order)+1 FROM candidates WHERE poll_id=?),0) " +
          "WHERE EXISTS(SELECT 1 FROM polls WHERE id=?)",
          [body.pollId, candidateId, cleanText(body.name), body.pollId, body.pollId]);
        return response({ ok: true, id: candidateId });
      }
      case "rename_candidate": {
        if (!validId(body.pollId) || !validId(body.id) || !cleanText(body.name)) return invalid();
        await query("UPDATE candidates SET name=? WHERE poll_id=? AND id=?",
          [cleanText(body.name), body.pollId, body.id]);
        return response({ ok: true });
      }
      case "create_action": {
        const title = cleanText(body.title);
        const description = typeof body.description === "string" &&
          body.description.length <= 2000 ? body.description : null;
        if (!title || description === null || !validRange(body.startsAt, body.endsAt) ||
          !validateAction(body.kind, body.condition, (body.config ?? {}) as Record<string, unknown>)) return invalid();
        const actionId = id();
        await query(
          "INSERT INTO actions(id,title,description,kind,config_json,condition_json,starts_at,ends_at,is_published) " +
          "VALUES(?,?,?,?,?,?,?,?,?)",
          [actionId, title, description, body.kind, JSON.stringify(actionConfig(body.kind, (body.config ?? {}) as Record<string, unknown>)), JSON.stringify(body.condition),
            body.startsAt, body.endsAt, bool(body.isPublished)],
        );
        return response({ ok: true, id: actionId });
      }
      case "update_action": {
        const title = cleanText(body.title);
        const description = typeof body.description === "string" &&
          body.description.length <= 2000 ? body.description : null;
        if (!validId(body.id) || !title || description === null ||
          !validRange(body.startsAt, body.endsAt) ||
          !validateAction(body.kind, body.condition, (body.config ?? {}) as Record<string, unknown>)) return invalid();
        await query(
          "UPDATE actions SET title=?,description=?,kind=?,config_json=?,condition_json=?,starts_at=?,ends_at=?,is_published=? " +
          "WHERE id=?",
          [title, description, body.kind, JSON.stringify(actionConfig(body.kind, (body.config ?? {}) as Record<string, unknown>)),
            JSON.stringify(body.condition), body.startsAt, body.endsAt,
            bool(body.isPublished), body.id],
        );
        return response({ ok: true });
      }
      default:
        return invalid("対応していない操作です。");
    }
  } catch {
    return response({ error: "保存に失敗しました。DB接続とスキーマを確認してください。" }, 503);
  }
}

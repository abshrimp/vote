import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdmin, sameOrigin } from "@/lib/voting/admin.mjs";
import { validId } from "@/lib/voting/logic.mjs";
import { validateBlock } from "@/lib/voting/layout.mjs";
import { query } from "@/lib/voting/turso.mjs";
import { readSettings } from "@/lib/voting/settings.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function answer(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status, headers: { "Cache-Control": "private, no-store" },
  });
}

async function list() {
  return query("SELECT id,kind,reference_id,title,body,sort_order,is_published " +
    "FROM page_blocks ORDER BY sort_order,id");
}

export async function GET(request: NextRequest) {
  if (!isAdmin(request)) return answer({ error: "認証が必要です。" }, 401);
  try {
    if (request.nextUrl.searchParams.get("blocksOnly") === "1") {
      return answer({ blocks: (await list()).rows });
    }
    return answer({ blocks: (await list()).rows, settings: await readSettings() });
  } catch {
    return answer({ error: "ページ構成を取得できません。新規DBの初期化を確認してください。" }, 503);
  }
}

export async function POST(request: NextRequest) {
  if (!isAdmin(request)) return answer({ error: "認証が必要です。" }, 401);
  if (!sameOrigin(request)) return answer({ error: "送信元を確認してください。" }, 403);
  let data: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 12000) return answer({ error: "入力が大きすぎます。" }, 413);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("invalid");
    data = parsed as Record<string, unknown>;
  } catch {
    return answer({ error: "入力を確認してください。" }, 400);
  }

  try {
    if (data.operation === "save") {
      const block = validateBlock(data.block);
      if (!block) return answer({ error: "ブロックの設定が正しくありません。" }, 400);
      const input = data.block as Record<string, unknown>;
      const blockId = input.id === "" || input.id === undefined
        ? "block_" + randomUUID().replaceAll("-", "")
        : input.id;
      if (!validId(blockId)) return answer({ error: "ブロックIDが正しくありません。" }, 400);
      if (block.referenceId) {
        const table = block.kind === "poll" ? "polls" : "actions";
        const ref = await query("SELECT 1 AS found FROM " + table + " WHERE id=? LIMIT 1",
          [block.referenceId]);
        if (!ref.rows.length) return answer({ error: "参照先が存在しません。" }, 400);
      }
      // One statement retains the position on edit, and obtains the last position
      // from page_blocks_order only when inserting a new block.
      await query(
        "INSERT INTO page_blocks(id,kind,reference_id,title,body,sort_order,is_published) " +
        "SELECT ?,?,?,?,?,COALESCE((SELECT MAX(sort_order) FROM page_blocks),0)+10,? WHERE 1 " +
        "ON CONFLICT(id) DO UPDATE SET kind=excluded.kind," +
        "reference_id=excluded.reference_id,title=excluded.title,body=excluded.body," +
        "is_published=excluded.is_published",
        [blockId,block.kind,block.referenceId,block.title,block.body,block.isPublished],
      );
      return answer({ ok: true, id: blockId });
    }
    if (data.operation === "delete") {
      if (!validId(data.id)) return answer({ error: "IDが正しくありません。" }, 400);
      await query("DELETE FROM page_blocks WHERE id=?", [data.id]);
      return answer({ ok: true });
    }
    if (data.operation === "move") {
      if (!validId(data.id) || (data.direction !== -1 && data.direction !== 1)) {
        return answer({ error: "並べ替えの指定が正しくありません。" }, 400);
      }
      const ordered = (await list()).rows as { id: string; sort_order: number }[];
      const index = ordered.findIndex(x => x.id === data.id);
      const target = index + Number(data.direction);
      if (index < 0 || target < 0 || target >= ordered.length) {
        return answer({ error: "これ以上移動できません。" }, 409);
      }
      // Reindex all positions once, to handle records with equal sort_order.
      const next = ordered.map(x => x.id);
      [next[index], next[target]] = [next[target], next[index]];
      const sql = "UPDATE page_blocks SET sort_order=CASE id " +
        next.map(() => "WHEN ? THEN ?").join(" ") + " END WHERE id IN (" +
        next.map(() => "?").join(",") + ")";
      await query(sql, [...next.flatMap((id,i) => [id,(i+1)*10]),...next]);
      return answer({ ok: true });
    }
    return answer({ error: "未対応の操作です。" }, 400);
  } catch {
    return answer({ error: "保存に失敗しました。重複した配置やDBの状態を確認してください。" }, 503);
  }
}

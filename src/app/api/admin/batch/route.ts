import { NextRequest, NextResponse } from "next/server";
import { isAdmin, sameOrigin, cleanText, validRange, validateAction, actionConfig } from "@/lib/voting/admin.mjs";
import { validId } from "@/lib/voting/logic.mjs";
import { validColumns, validCells, validFontSize, validStyle, serializeColumns } from "@/lib/voting/columns.mjs";
import { normalizePublicIds, findPublicIdConflict } from "@/lib/voting/links.mjs";
import { publicIdCheckPlan, projectPublicIds } from "@/lib/voting/public-id-check.mjs";
import { deletePollStatements, deleteActionStatements } from "@/lib/voting/delete-statements.mjs";
import { SETTING_RULES } from "@/lib/voting/settings.mjs";
import { customGoogleFont, verifyGoogleFont } from "@/lib/voting/fonts.mjs";
import { validateBlock } from "@/lib/voting/layout.mjs";
import { readBatch, transaction } from "@/lib/voting/turso.mjs";
import { sanitizeRich } from "@/lib/voting/richtext.mjs";

// Descriptions are rich text: cleaned to the allowed subset before they are stored.
const richDescription = (value: unknown) =>
  typeof value === "string" && value.length <= 20000 && sanitizeRich(value).length <= 8000 ? sanitizeRich(value) : null;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Operation = { type: string; [key: string]: unknown };
const fail = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

function prepare(operations: Operation[]) {
  const steps: { sql: string; args: (string | number | null)[] }[] = [];
  const publicIdUpdates: { sql: string; args: (string | number | null)[] }[] = [];
  const layoutOrder: { sql: string; args: (string | number | null)[] }[] = [];
  for (const op of operations) {
    switch (op.type) {
      case "poll": {
        const title = cleanText(op.title);
        const description = richDescription(op.description);
        const max = Number(op.maxVotes);
        if (!validId(op.id) || !title || description === null || !validRange(op.startsAt, op.endsAt) ||
          !Number.isInteger(max) || max < 1 || max > 20 ||
          !validFontSize(op.nameFontSize) || !validColumns(op.columns) ||
          (op.nameStyle !== undefined && !validStyle(op.nameStyle)) || typeof op.isPublished !== "boolean") throw Error("部門の入力が正しくありません。");
        const values = [title, description, max, op.nameFontSize as number,
          serializeColumns(op.columns as Parameters<typeof serializeColumns>[0], (op.nameStyle ?? {}) as Record<string, unknown>),
          op.startsAt as string, op.endsAt as string, Number(op.isPublished)];
        steps.push({ sql: "UPDATE polls SET title=?,description=?,max_votes=?,name_font_size=?,columns_json=?,starts_at=?,ends_at=?,is_published=? " +
          "WHERE id=? AND (title IS NOT ? OR description IS NOT ? OR max_votes IS NOT ? OR name_font_size IS NOT ? " +
          "OR columns_json IS NOT ? OR starts_at IS NOT ? OR ends_at IS NOT ? OR is_published IS NOT ?)",
          args: [...values, op.id as string, ...values] });
        break;
      }
      case "poll_new": {
        // A poll created in the editor and saved together with its candidates and layout.
        const title = cleanText(op.title);
        const description = richDescription(op.description);
        const max = Number(op.maxVotes);
        if (!validId(op.id) || !title || description === null || !validRange(op.startsAt, op.endsAt) ||
          !Number.isInteger(max) || max < 1 || max > 20 || typeof op.isPublished !== "boolean") throw Error("部門の入力が正しくありません。");
        steps.push({ sql: "INSERT INTO polls(id,title,description,starts_at,ends_at,is_published,max_votes) VALUES(?,?,?,?,?,?,?)",
          args: [op.id as string, title, description, op.startsAt as string, op.endsAt as string, Number(op.isPublished), max] });
        break;
      }
      case "action_new": {
        const title = cleanText(op.title);
        const description = richDescription(op.description);
        if (!validId(op.id) || !title || description === null || !validRange(op.startsAt, op.endsAt) ||
          !validateAction(op.kind, op.condition, (op.config ?? {}) as Record<string, unknown>) ||
          typeof op.isPublished !== "boolean") throw Error("アクションの入力が正しくありません。");
        steps.push({ sql: "INSERT INTO actions(id,title,description,kind,config_json,condition_json,starts_at,ends_at,is_published) VALUES(?,?,?,?,?,?,?,?,?)",
          args: [op.id as string, title, description, op.kind as string, JSON.stringify(actionConfig(op.kind, (op.config ?? {}) as Record<string, unknown>)),
            JSON.stringify(op.condition), op.startsAt as string, op.endsAt as string, Number(op.isPublished)] });
        break;
      }
      case "block_new": {
        const block = validateBlock(op.block);
        const input = op.block as Record<string, unknown>;
        if (!block || !validId(input.id)) throw Error("ページ項目の入力が正しくありません。");
        steps.push({ sql: "INSERT INTO page_blocks(id,kind,reference_id,title,body,sort_order,is_published) " +
          "SELECT ?,?,?,?,?,COALESCE(MAX(sort_order),0)+10,? FROM page_blocks",
          args: [input.id as string, block.kind, block.referenceId, block.title, block.body, block.isPublished] });
        break;
      }
      case "block_delete": {
        if (!validId(op.id)) throw Error("削除する項目が正しくありません。");
        steps.push({ sql: "DELETE FROM page_blocks WHERE id=?", args: [op.id as string] });
        break;
      }
      case "setting": {
        const key = op.key as string;
        if (typeof key !== "string" || !Object.hasOwn(SETTING_RULES, key) ||
          !SETTING_RULES[key as keyof typeof SETTING_RULES](op.value)) throw Error("設定の値が正しくありません。");
        steps.push({ sql: "INSERT INTO form_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value " +
          "WHERE form_settings.value<>excluded.value",
          args: [key, String(op.value)] });
        break;
      }
      case "poll_delete": {
        // Removes the department with its candidates and every vote cast in it.
        if (!validId(op.id)) throw Error("削除する部門が正しくありません。");
        steps.push(...deletePollStatements(op.id as string));
        break;
      }
      case "action_delete": {
        if (!validId(op.id)) throw Error("削除するアクションが正しくありません。");
        steps.push(...deleteActionStatements(op.id as string));
        break;
      }
      case "layout_order": {
        const ids = op.ids;
        if (!Array.isArray(ids) || ids.length > 500 || !ids.every(validId) || new Set(ids).size !== ids.length)
          throw Error("並び順の指定が正しくありません。");
        // Rows already in place are skipped so only moved blocks count as written.
        const position = "CASE id " + ids.map(() => "WHEN ? THEN ?").join(" ") + " END";
        const pairs = ids.flatMap((id, i) => [id as string, (i + 1) * 10]);
        if (ids.length) layoutOrder.push({ sql: "UPDATE page_blocks SET sort_order=" + position +
          " WHERE id IN (" + ids.map(() => "?").join(",") + ") AND sort_order IS NOT " + position,
          args: [...pairs, ...(ids as string[]), ...pairs] });
        break;
      }
      case "candidate": {
        const name = cleanText(op.name);
        if (!validId(op.pollId) || !validId(op.id) || !name || !validColumns(op.columns) || !validCells(op.extra, op.columns)) throw Error("候補の入力が正しくありません。");
        const extra = JSON.stringify(op.extra);
        steps.push({ sql: "UPDATE candidates SET name=?,extra_json=? WHERE poll_id=? AND id=? " +
          "AND (name IS NOT ? OR extra_json IS NOT ?)",
          args: [name, extra, op.pollId as string, op.id as string, name, extra] });
        break;
      }
      case "candidate_new": {
        const name = cleanText(op.name);
        if (!validId(op.pollId) || !validId(op.id) || !name || !validColumns(op.columns) || !validCells(op.extra, op.columns)) throw Error("候補の入力が正しくありません。");
        steps.push({ sql: "INSERT INTO candidates(poll_id,id,name,extra_json,sort_order) SELECT ?,?,?,?,COALESCE(MAX(sort_order),0)+10 FROM candidates WHERE poll_id=?",
          args: [op.pollId as string, op.id as string, name, JSON.stringify(op.extra ?? {}), op.pollId as string] });
        break;
      }
      case "action": {
        const title = cleanText(op.title);
        const description = richDescription(op.description);
        if (!validId(op.id) || !title || description === null || !validRange(op.startsAt, op.endsAt) ||
          !validateAction(op.kind, op.condition, (op.config ?? {}) as Record<string, unknown>) ||
          typeof op.isPublished !== "boolean") throw Error("アクションの入力が正しくありません。");
        const values = [title, description, op.kind as string,
          JSON.stringify(actionConfig(op.kind, (op.config ?? {}) as Record<string, unknown>)),
          JSON.stringify(op.condition), op.startsAt as string, op.endsAt as string, Number(op.isPublished)];
        steps.push({ sql: "UPDATE actions SET title=?,description=?,kind=?,config_json=?,condition_json=?,starts_at=?,ends_at=?,is_published=? " +
          "WHERE id=? AND (title IS NOT ? OR description IS NOT ? OR kind IS NOT ? OR config_json IS NOT ? " +
          "OR condition_json IS NOT ? OR starts_at IS NOT ? OR ends_at IS NOT ? OR is_published IS NOT ?)",
          args: [...values, op.id as string, ...values] });
        break;
      }
      case "block": {
        const block = validateBlock(op.block);
        const input = op.block as Record<string, unknown>;
        if (!block || !validId(input.id)) throw Error("ページ項目の入力が正しくありません。");
        steps.push({ sql: "UPDATE page_blocks SET title=?,body=?,is_published=? WHERE id=? " +
          "AND (title IS NOT ? OR body IS NOT ? OR is_published IS NOT ?)",
          args: [block.title, block.body, block.isPublished, input.id as string,
            block.title, block.body, block.isPublished] });
        break;
      }
      case "public_id": {
        const value = normalizePublicIds(op.publicId);
        if (!validId(op.pollId) || (op.candidateId !== null && !validId(op.candidateId)) || value === undefined) {
          throw Error("IDは日本語・英数字・_・-・: が使えます。複数のときはカンマで区切ってください。");
        }
        if (op.candidateId === null) {
          publicIdUpdates.push({ sql: "UPDATE polls SET public_id=? WHERE id=?",
            args: [value as string | null, op.pollId as string] });
        } else {
          publicIdUpdates.push({ sql: "UPDATE candidates SET public_id=? WHERE poll_id=? AND id=?",
            args: [value as string | null, op.pollId as string, op.candidateId as string] });
        }
        break;
      }
      default: throw Error("対応していない変更が含まれます。");
    }
  }
  if (publicIdUpdates.length === 1) {
    // An unchanged ID is a zero-row update, including repeated clears.
    const update = publicIdUpdates[0];
    steps.push({ sql: update.sql + " AND public_id IS NOT ?",
      args: [...update.args, update.args[0]] });
  } else {
    // Multi-entity swaps require releasing old aliases first. Skip an
    // already-null row and avoid a redundant second write for clear requests.
    for (const update of publicIdUpdates) {
      steps.push({ sql: update.sql + " AND public_id IS NOT NULL",
        args: [null, ...update.args.slice(1)] });
    }
    for (const update of publicIdUpdates) {
      if (update.args[0] !== null) {
        steps.push({ sql: update.sql + " AND public_id IS NOT ?",
          args: [...update.args, update.args[0]] });
      }
    }
  }
  // Positions are applied last, after every new block exists.
  steps.push(...layoutOrder);
  return steps;
}

async function publicIdConflict(operations: Operation[]) {
  const plan = publicIdCheckPlan(operations);
  if (plan?.skip) return null;
  const [pollRows, candidateRows] = await readBatch(plan?.statements ?? [
    { sql: "SELECT id,public_id FROM polls" },
    { sql: "SELECT poll_id,id,public_id FROM candidates" },
  ]);
  const projected = projectPublicIds(
    pollRows.rows as { id: string; public_id: string | null }[],
    candidateRows.rows as { poll_id: string; id: string; public_id: string | null }[],
    operations,
  );
  return findPublicIdConflict(projected.polls, projected.candidates);
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin(request))) return fail("管理者認証が必要です。", 401);
  if (!sameOrigin(request)) return fail("送信元が正しくありません。", 403);
  let operations: Operation[];
  try {
    const raw = await request.text();
    if (raw.length > 600000) return fail("送信データが大きすぎます。", 413);
    const payload = JSON.parse(raw);
    if (!payload || !Array.isArray(payload.operations) || payload.operations.length > 500 ||
      payload.operations.some((o: unknown) => !o || typeof o !== "object" || Array.isArray(o))) {
      return fail("変更データが正しくありません。");
    }
    operations = payload.operations;
  } catch { return fail("変更データを確認してください。"); }
  let steps: ReturnType<typeof prepare>;
  try { steps = prepare(operations); }
  catch (e) { return fail(e instanceof Error ? e.message : "入力が正しくありません。"); }
  if (!steps.length) return NextResponse.json({ ok: true, saved: 0 });
  for (const value of new Set(operations.filter(op => op.type === "setting" &&
    (op.key === "headingFont" || op.key === "bodyFont")).map(op => op.value))) {
    if (customGoogleFont(value) && !(await verifyGoogleFont(value))) {
      return fail("Google Fonts に存在するフォント名を入力してください。");
    }
  }
  if (operations.some(op => op.type === "public_id")) {
    // IDs may be comma-separated lists, so the rules are checked here rather than by SQL.
    try {
      const conflict = await publicIdConflict(operations);
      if (conflict) return fail(conflict, 409);
    } catch { return fail("IDを確認できませんでした。時間をおいて再度お試しください。", 503); }
  }
  try {
    // A single Hrana batch executes every statement atomically.
    await transaction(steps);
    return NextResponse.json({ ok: true, saved: operations.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && /Public ID conflict|UNIQUE constraint failed: (polls|candidates)\.public_id/i.test(error.message)) {
      return fail("公開IDが重複しています。部門の公開IDはほかの部門・候補と、候補の公開IDは同じ部門の中で重ならないようにしてください。", 409);
    }
    return fail("保存中にエラーが発生しました。内容を再読み込みして確認してください。", 503);
  }
}

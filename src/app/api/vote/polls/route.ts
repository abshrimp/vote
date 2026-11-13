import { NextRequest, NextResponse } from "next/server";
import { cookieName, hmac, readSession, requireSecret } from "@/lib/voting/security.mjs";
import { readBatch } from "@/lib/voting/turso.mjs";
import { visitorActions } from "@/lib/voting/visitor-actions.mjs";
import { publicActions } from "@/lib/voting/public-snapshot.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const secret = requireSecret();
    const session = readSession(request.cookies.get(cookieName())?.value, secret);
    const personalRequest = session ? readBatch([
      { sql: "SELECT poll_id,candidate_id,is_official FROM votes WHERE voter_hash=?",
        args: [hmac(secret, "voter", session)] },
      { sql: "SELECT action_id,redeemed_at FROM action_claims WHERE voter_hash=?",
        args: [hmac(secret, "voter", session)] },
    ]) : Promise.resolve([{ rows: [] }, { rows: [] }]);
    const [definitions, personal] = await Promise.all([publicActions(), personalRequest]);
    const [selected, claims] = personal;
    return NextResponse.json({
      selections: selected.rows,
      actions: visitorActions(definitions, selected.rows, claims.rows),
    }, {
      headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" },
    });
  } catch {
    return NextResponse.json({ error: "投票状態を取得できませんでした。" }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}

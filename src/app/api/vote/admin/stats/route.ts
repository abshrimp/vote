import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/voting/admin.mjs";
import { query } from "@/lib/voting/turso.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "管理者認証が必要です。" }, {
      status: 401, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" },
    });
  }
  try {
    const flagged = await query(
      "SELECT poll_id,\'ip_fingerprint_match\' AS reason,COUNT(*) AS count FROM votes " +
      "WHERE signal_match=1 GROUP BY poll_id ORDER BY poll_id",
    );
    return NextResponse.json({ flagged: flagged.rows }, {
      headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" },
    });
  } catch {
    return NextResponse.json({ error: "Statistics unavailable" }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}

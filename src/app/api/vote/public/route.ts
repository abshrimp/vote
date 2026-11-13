import { withPublicEdgeCache } from "@/lib/voting/edge-cache";
import { NextResponse } from "next/server";
import { groupPolls } from "@/lib/voting/logic.mjs";
import { publicSnapshot } from "@/lib/voting/public-snapshot.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withPublicEdgeCache(request, async () => {
  try {
    const snapshot = await publicSnapshot();
    // The response has no voter state, cookies, secret action URLs or admin data.
    // Shared caching works on CDNs honoring s-maxage (process cache is a fallback).
    return NextResponse.json({
      polls: groupPolls(snapshot.pollRows),
      blocks: snapshot.blocks,
      settings: snapshot.settings,
    }, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=30" },
    });
  } catch {
    return NextResponse.json({ error: "公開フォームを取得できませんでした。" }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
  });
}

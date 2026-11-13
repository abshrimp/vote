import { NextResponse } from "next/server";
import { siteImage } from "@/lib/voting/public-snapshot.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const image = await siteImage("favicon");
    if (!image || !image.startsWith("data:image/x-icon;base64,")) {
      return new NextResponse(null, { status: 404 });
    }
    const bytes = Buffer.from(image.slice("data:image/x-icon;base64,".length), "base64");
    return new NextResponse(new Blob([new Uint8Array(bytes)]), {
      headers: { "Content-Type": "image/x-icon", "Cache-Control": "public, max-age=0, s-maxage=30" },
    });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}

import { NextResponse } from "next/server";
import { publicSnapshot } from "@/lib/voting/public-snapshot.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { settings } = await publicSnapshot();
    const image = settings.favicon;
    if (!image || !image.startsWith("data:image/x-icon;base64,")) {
      return new NextResponse(null, { status: 404 });
    }
    const bytes = Buffer.from(image.slice("data:image/x-icon;base64,".length), "base64");
    return new NextResponse(bytes, {
      headers: { "Content-Type": "image/x-icon", "Cache-Control": "public, max-age=30" },
    });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}

import type { Metadata } from "next";
import VoteClient from "./vote/VoteClient";
import { publicSnapshot } from "@/lib/voting/public-snapshot.mjs";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const snapshot = await publicSnapshot();
    const title = String(snapshot.blocks.find((block: {kind: string; title: string}) =>
      block.kind === "heading" && block.title)?.title || "投票フォーム");
    const description = `${title}のページです。`;
    return {
      title: { absolute: title }, description,
      alternates: { canonical: "/" }, robots: { index: false, follow: false },
      icons: { icon: snapshot.settings.favicon ? "/api/site/icon" : "/default-icon.svg" },
      openGraph: { title, description, images: snapshot.settings.ogp ? [{ url: "/api/site/ogp", width: 1200, height: 630 }] : [] },
    };
  } catch {
    return { title: { absolute: "投票フォーム" }, description: "投票フォームのページです。", robots: {index: false,follow: false} };
  }
}

export default function Home() {
  return <VoteClient />;
}

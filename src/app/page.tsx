import type { Metadata } from "next";
import VoteClient from "./vote/VoteClient";
import { siteMetadata } from "@/lib/voting/public-snapshot.mjs";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const site = await siteMetadata();
    const title = String(site.title || "投票フォーム");
    const description = `${title}のページです。`;
    return {
      title: { absolute: title }, description,
      alternates: { canonical: "/" }, robots: { index: false, follow: false },
      icons: { icon: site.favicon ? "/api/site/icon" : "/default-icon.svg" },
      openGraph: { title, description, images: site.ogp ? [{ url: "/api/site/ogp", width: 1200, height: 630 }] : [] },
    };
  } catch {
    return { title: { absolute: "投票フォーム" }, description: "投票フォームのページです。", robots: {index: false,follow: false} };
  }
}

export default function Home() {
  return <VoteClient />;
}

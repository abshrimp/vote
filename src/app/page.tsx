import type { Metadata } from "next";
import { headers } from "next/headers";
import VoteClient from "./vote/VoteClient";
import { siteMetadata } from "@/lib/voting/public-snapshot.mjs";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const [site, requestHeaders] = await Promise.all([siteMetadata(), headers()]);
    const host = requestHeaders.get("host");
    const protocol = requestHeaders.get("x-forwarded-proto") === "http" ? "http" : "https";
    const title = String(site.title || "投票フォーム");
    const description = `${title}のページです。`;
    return {
      metadataBase: host ? new URL(`${protocol}://${host}`) : undefined,
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

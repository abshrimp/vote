import type { Metadata } from "next";
import VoteClient from "./vote/VoteClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "投票フォーム" },
  description: "イベント用のオンライン投票ページです。",
  alternates: { canonical: "/" },
  robots: { index: false, follow: false },
};

export default function Home() {
  return <VoteClient />;
}

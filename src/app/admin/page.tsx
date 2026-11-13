import type { Metadata } from "next";
import AdminClient from "./AdminClient";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "投票管理", robots: { index: false, follow: false } };
export default function AdminPage() { return <AdminClient />; }

import type { Metadata } from "next";
import { PrintSheet, type Sheet } from "@/components/admin/Print";

export const metadata: Metadata = { title: "Crypto Hunt · Print" };

const SHEETS: Sheet[] = ["qr", "master", "codes"];

export default async function AdminPrintPage({ searchParams }: { searchParams: Promise<{ sheet?: string }> }) {
  const { sheet } = await searchParams;
  return <PrintSheet sheet={SHEETS.includes(sheet as Sheet) ? (sheet as Sheet) : "qr"} />;
}

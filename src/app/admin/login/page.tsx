import type { Metadata } from "next";
import { AdminLogin } from "@/components/admin/Login";

export const metadata: Metadata = { title: "Crypto Hunt · Captain's sign-in" };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string; next?: string }>;
}) {
  const { denied, next } = await searchParams;
  return <AdminLogin denied={denied === "1"} next={next ?? null} />;
}

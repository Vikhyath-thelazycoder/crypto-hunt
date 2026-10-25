import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { adminGate } from "@/lib/admin/gate";
import { getServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Crypto Hunt · Captain's table" };

/** Every /admin page except the login (T-401, SECURITY.md T10, T17): only the captain gets past here. */
export default async function GuardedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: isAdmin } = user ? await supabase.rpc("is_admin") : { data: false };
  const to = adminGate(user, isAdmin === true);
  if (to) redirect(to);
  return <>{children}</>;
}

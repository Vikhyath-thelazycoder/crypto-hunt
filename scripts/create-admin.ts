// Admin account bootstrap (T-209, D-006): creates the admin's auth account (admin name + passcode) and adds
// it to `admins`. Run once per Supabase project:
//
//   npx tsx --env-file=.env.local scripts/create-admin.ts --name "Captain" --passcode "..." [--target test|prod]
//
// test (default) uses TEST_SUPABASE_URL + TEST_SUPABASE_SERVICE_ROLE_KEY. prod uses NEXT_PUBLIC_SUPABASE_URL +
// PROD_SUPABASE_SERVICE_ROLE_KEY, which is never stored in .env.local: pass it inline for this one command.
import { createClient } from "@supabase/supabase-js";
import { adminEmail } from "../src/lib/admin-email";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const name = arg("name")?.trim();
const passcode = arg("passcode");
const target = arg("target") ?? "test";

if (!name || name.length < 2 || name.length > 40) throw new Error("--name must be 2–40 characters");
if (!passcode || passcode.length < 10)
  throw new Error("--passcode must be at least 10 characters (SECURITY.md)");

const url = target === "prod" ? process.env.NEXT_PUBLIC_SUPABASE_URL : process.env.TEST_SUPABASE_URL;
const key =
  target === "prod" ? process.env.PROD_SUPABASE_SERVICE_ROLE_KEY : process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error(`Missing URL or service-role key for target "${target}"`);

const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const email = adminEmail(name);

const { data, error } = await service.auth.admin.createUser({
  email,
  password: passcode,
  email_confirm: true,
});
if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
const { error: insertError } = await service.from("admins").insert({ user_id: data.user.id, name });
if (insertError) {
  await service.auth.admin.deleteUser(data.user.id);
  throw new Error(`admins insert failed: ${insertError.message}`);
}
console.log(`Admin "${name}" created on ${target}. Log in at /admin/login with this name and passcode.`);

// Makes the printed QR sheet for a throwaway course and saves it as a PDF, to check the layout; New Game clears it after.
//   CHECK_ADMIN=… CHECK_PASS=… CHECK_NAME=Captain CHECK_SITE=… CHECK_PDF=… npx tsx --env-file=.env.local scripts/sim/print-check.mts
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { generatePlan } from "../../src/lib/generator";

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is required`);
  return v;
};
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const url = env("NEXT_PUBLIC_SUPABASE_URL");
const service = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), opts);
const admin = createClient(url, env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), opts);
const { error } = await admin.auth.signInWithPassword({ email: env("CHECK_ADMIN"), password: env("CHECK_PASS") });
if (error) throw error;
const rpc = async (fn: string, args: Record<string, unknown> = {}) => {
  const { data, error: e } = await admin.rpc(fn, args);
  if (e) throw new Error(`${fn}: ${e.message}`);
  return data;
};
await rpc("set_team_count", { p_count: 3 });
const { data: teams } = await service.from("teams").select("id");
const { data: locs } = await service.from("locations").select("id, area");
await rpc("apply_game_plan", { p_plan: generatePlan({ teamIds: teams!.map((t) => t.id), locationIds: locs!.map((l) => l.id), seed: 9, areas: Object.fromEntries(locs!.map((l) => [l.id, l.area])) }) });
const browser = await chromium.launch();
const page = await browser.newPage();
try {
  await page.goto(`${env("CHECK_SITE")}/admin`);
  await page.getByLabel(/name/i).first().fill(env("CHECK_NAME"));
  await page.getByLabel(/passcode/i).fill(env("CHECK_PASS"));
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/admin/, { timeout: 20_000 });
  await page.waitForTimeout(1500);
  await page.goto(`${env("CHECK_SITE")}/admin/print?sheet=qr`);
  await page.getByTestId("qr-card").first().waitFor({ timeout: 30_000 });
  const cards = await page.getByTestId("qr-card").count();
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: env("CHECK_PDF"), preferCSSPageSize: true, printBackground: true });
  console.log("cards", cards);
} finally {
  await browser.close();
  await rpc("start_new_game", { p_confirm: "NEW GAME", p_regenerate_qr: false });
}

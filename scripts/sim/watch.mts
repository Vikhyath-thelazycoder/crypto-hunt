// Watches a bot run in real browsers (T-801 / T-803: "dashboard and projector stay live"): the admin dashboard and the
// projector, against the TEST project, from the start of the hunt to the Game over. Every 30 s a screenshot of each;
// at the end, how long each took to show the game was over, and every console error.
//   npx tsx --env-file=.env.local scripts/sim/watch.mts <run folder>      (started by run_all.py beside simulate.py)
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { adminEmail } from "../../src/lib/admin-email";

const out = process.argv[2] ?? "screens-out/watch";
mkdirSync(out, { recursive: true });
const url = process.env.TEST_SUPABASE_URL!;
const anonKey = process.env.TEST_SUPABASE_ANON_KEY!;
if (!url || url === process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error("watch runs against the TEST project only");
const service = createClient(url, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const PORT = 3344;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const status = async () => (await service.from("public_state").select("data").single()).data?.data?.status as string | undefined;

const server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
  env: { ...process.env, NEXT_DIST_DIR: ".next-watch", NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey },
  stdio: "ignore",
});
const report: Record<string, unknown> = { console: [] as string[] };
let userId = "";
try {
  for (let i = 0; i < 120 && !(await fetch(`${BASE}/screen`).then((r) => r.ok, () => false)); i++) await sleep(1000);
  // Wait for the bot run to start the hunt (world.build wipes the admins table first).
  for (let i = 0; i < 900 && (await status()) !== "RUNNING"; i++) await sleep(1000);
  const name = `Watch Captain ${randomUUID().slice(0, 6)}`;
  const pass = `pw-${randomUUID()}`;
  const { data } = await service.auth.admin.createUser({ email: adminEmail(name), password: pass, email_confirm: true });
  userId = data.user!.id;
  await service.from("admins").insert({ user_id: userId, name });

  const browser = await chromium.launch();
  const errors = report.console as string[];
  const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const screen = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  for (const [label, p] of [["admin", admin], ["screen", screen]] as const) {
    p.on("console", (m) => m.type() === "error" && errors.push(`${label}: ${m.text().slice(0, 200)}`));
    p.on("pageerror", (e) => errors.push(`${label}: ${e.message.slice(0, 200)}`));
  }
  await admin.goto(`${BASE}/admin/login`);
  await admin.getByLabel("ADMIN NAME").fill(name);
  await admin.getByLabel("PASSCODE").fill(pass);
  await admin.getByRole("button", { name: "Sign in" }).click();
  await admin.waitForURL(`${BASE}/admin`);
  await screen.goto(`${BASE}/screen`);
  const t0 = Date.now();
  let n = 0;
  while ((await status()) !== "FINISHED" && Date.now() - t0 < 50 * 60_000) {
    if ((Date.now() - t0) / 30_000 >= n) {
      await admin.screenshot({ path: `${out}/admin-${String(n).padStart(2, "0")}.png` });
      await screen.screenshot({ path: `${out}/screen-${String(n).padStart(2, "0")}.png` });
      n++;
    }
    await sleep(1000);
  }
  const over = Date.now();
  const seen = async (p: typeof admin, text: RegExp) => {
    try {
      await p.getByText(text).first().waitFor({ timeout: 20_000 });
      return Date.now() - over;
    } catch {
      return null;
    }
  };
  report.screen_game_over_ms = await seen(screen, /Game over|The treasure is claimed/);
  report.admin_game_over_ms = await seen(admin, /HUNT OVER/);
  await admin.screenshot({ path: `${out}/admin-final.png` });
  await screen.screenshot({ path: `${out}/screen-final.png` });
  report.screenshots = n;
  await browser.close();
} catch (e) {
  report.error = e instanceof Error ? e.message : String(e);
} finally {
  if (userId) {
    await service.from("admins").delete().eq("user_id", userId);
    await service.auth.admin.deleteUser(userId);
  }
  server.kill();
  writeFileSync(`${out}/watch.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}

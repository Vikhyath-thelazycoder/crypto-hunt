// One crew through one short game in a real phone-sized browser against the project in SMOKE_* (T-1502): the join form,
// the question appearing by itself at Start Hunt (live ping), the riddle, a typed code, the final seal code, the win.
//   SMOKE_URL=… SMOKE_ANON=… SMOKE_SERVICE=… SMOKE_ADMIN=… SMOKE_PASS=… SMOKE_SITE=http://localhost:3100 npx tsx scripts/sim/browser-smoke.mts
import { chromium, devices } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { generatePlan } from "../../src/lib/generator";

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is required`);
  return v;
};
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(env("SMOKE_URL"), env("SMOKE_SERVICE"), opts);
const admin = createClient(env("SMOKE_URL"), env("SMOKE_ANON"), opts);
const { error: signIn } = await admin.auth.signInWithPassword({ email: env("SMOKE_ADMIN"), password: env("SMOKE_PASS") });
if (signIn) throw signIn;
const rpc = async (fn: string, args: Record<string, unknown> = {}) => {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
};

await rpc("set_team_count", { p_count: 1 });
const { data: team } = await service.from("teams").select("id, code").single();
const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices["iPhone 13"] })).newPage();
const problems: string[] = [];
page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
page.on("pageerror", (e) => problems.push(String(e)));
const say = (t: string) => console.log(`ok: ${t}`);
try {
  await page.goto(`${env("SMOKE_SITE")}/play`);
  await page.getByLabel(/YOUR NAME/).fill("Smoke Lead");
  await page.getByLabel("Team code character 1").click();
  await page.keyboard.type(team!.code);
  await page.getByLabel("TEAM NAME").fill("Browser Crew");
  for (const [i, n] of ["Asha Rao", "Bo Lin", "Chitra K"].entries()) await page.getByLabel(`TEAMMATE ${i + 1}`).fill(n);
  await page.getByRole("button", { name: "Join the hunt" }).click();
  await page.getByRole("button", { name: /Waiting for Start Hunt/ }).waitFor({ timeout: 30_000 });
  say("joined; lobby shows the crew");
  const { data: locs } = await service.from("locations").select("id, area");
  const plan = generatePlan({ teamIds: [team!.id], locationIds: locs!.map((l) => l.id), seed: 5, areas: Object.fromEntries(locs!.map((l) => [l.id, l.area])) });
  await rpc("apply_game_plan", { p_plan: plan });
  await page.waitForTimeout(3000); // the phone's live channels are up
  const t0 = Date.now();
  await rpc("start_game");
  await page.getByText("YOUR QUESTION").waitFor({ timeout: 25_000 });
  say(`question appeared by itself ${((Date.now() - t0) / 1000).toFixed(1)} s after Start Hunt`);
  for (let round = 1; round <= plan.rounds.length; round++) {
    const final = round === plan.rounds.length;
    const { data: t } = await service.from("tasks").select("id, option_order, questions(answer, format)").eq("team_id", team!.id).eq("round", round).single();
    const q = t!.questions as unknown as { answer: string; format: string };
    if (q.format === "mcq") await page.getByRole("group", { name: "Choices" }).getByRole("button").nth((t!.option_order as number[]).indexOf(Number(q.answer))).click();
    else {
      await page.getByLabel("Your answer").fill(q.answer);
      await page.getByRole("button", { name: "Submit answer" }).click();
    }
    await page.getByRole("button", { name: /Found it/ }).click({ timeout: 15_000 });
    say(`round ${round}: answer took, riddle showed`);
    const { data: a } = await service.from("assignments").select("qr_codes(key)").eq("team_id", team!.id).eq("round", round).single();
    await page.getByLabel("Code on the card character 1").click();
    await page.keyboard.type((a!.qr_codes as unknown as { key: string }).key);
    await page.getByRole("button", { name: "Check in", exact: true }).click();
    if (!final) await page.getByText("YOUR QUESTION").waitFor({ timeout: 15_000 });
    say(`round ${round}: typed code accepted`);
  }
  await page.waitForFunction(() => /1st|first|winner|place/i.test(document.body.innerText), undefined, { timeout: 15_000 });
  const { data: done } = await service.from("teams").select("status, final_rank, name, members").single();
  console.log("result:", JSON.stringify(done));
  await page.screenshot({ path: process.env.SMOKE_SHOT ?? "/dev/null" });
} catch (e) {
  console.log("FAILED:", String(e).slice(0, 400));
  await page.screenshot({ path: process.env.SMOKE_SHOT ?? "/dev/null" });
  process.exitCode = 1;
} finally {
  console.log("browser errors:", JSON.stringify([...new Set(problems)].slice(0, 8)).slice(0, 900));
  await browser.close();
  await rpc("start_new_game", { p_confirm: "NEW GAME", p_regenerate_qr: false });
}

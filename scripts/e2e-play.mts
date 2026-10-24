// End-to-end: a real browser plays /play against the crypto-hunt-test project, with three bot teammates.
// Proves the wiring the unit and integration tests can't: the join function from a browser, the one-time
// login, CSP, realtime updates on screen, scans, key entry and round progress.
//
//   npm run e2e        (starts its own dev server on :3321 pointed at the TEST project)
//
// Never runs against production: the dev server and every client use TEST_* variables.
import { chromium, type Page } from "playwright";
import { spawn } from "node:child_process";
import {
  account,
  applyPlan,
  call,
  getAdmin,
  join,
  qrByLabel,
  qrFor,
  resetWorld,
  seedVenue,
  service,
  solveAll,
  status,
  universalToken,
  cleanupAccounts,
  type Player,
} from "../integration/harness";

const PORT = 3321;
const BASE = `http://127.0.0.1:${PORT}`;
const step = (msg: string) => console.log(`✓ ${msg}`);

async function startServer() {
  const child = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    env: {
      ...process.env,
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_PUBLIC_SUPABASE_URL: process.env.TEST_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.TEST_SUPABASE_ANON_KEY,
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(`${BASE}/play`)).ok) return child;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  child.kill();
  throw new Error("dev server did not start");
}

const text = (page: Page, t: string | RegExp, timeout = 15000) =>
  page.getByText(t).first().waitFor({ timeout });
const scan = (page: Page, token: string) =>
  page.evaluate((t) => (window as unknown as { __chScan: (t: string) => Promise<void> }).__chScan(t), token);

const server = await startServer();
const browser = await chromium.launch({
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const errors: string[] = [];
try {
  // World: one crew with three bot members already aboard.
  await resetWorld();
  const locations = await seedVenue(20, 60);
  const admin = await getAdmin();
  const [team] = await call<{ id: string; code: string; name: string }[]>(admin.client, "create_teams", {
    p_count: 1,
  });
  const bots: Player[] = [];
  for (let i = 0; i < 3; i++) bots.push(await join(await account(40 + i), `Bot ${i + 1}`, team!.code));

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  // Join through the real Edge Function and one-time login.
  await page.goto(`${BASE}/play`);
  await text(page, "Join the crew");
  await page.getByLabel("YOUR NAME").fill("Ravi");
  await page.getByLabel("Team code character 1").click();
  await page.keyboard.type(team!.code);
  await text(page, "Crew found · 3 of 4 aboard");
  step("Join previews the crew");
  await page.getByRole("button", { name: "Join the crew" }).click();
  await text(page, "THE CREW IS SEALED");
  step("joined; Lobby shows 4/4");

  // The admin starts: the phone moves to Solve on its own (realtime).
  const me = { teamId: team!.id } as Player;
  await applyPlan([team!.id], locations, { counts: [2, 1], advance: [1, 1] });
  await call(admin.client, "start_game");
  await text(page, "Scan the start mark");
  step("start reached the phone live; round 1 waits for the start mark");

  await scan(page, await universalToken());
  await text(page, /YOUR QUESTION · PIECE/);
  step("universal QR opened the question");

  // A later-round mark is sealed: no clue, no key box.
  await scan(page, (await qrByLabel("F-01")).token);
  await text(page, "This mark belongs");
  if (await page.getByLabel("Secret key character 1").count())
    throw new Error("key box shown on a sealed mark");
  await page.getByRole("button", { name: "Back to my clue" }).click();
  step("final QR in round 1 shows the Sealed screen");

  // Answer my own question in the UI; bots answer theirs.
  const { data: task } = await service
    .from("tasks")
    .select("id, questions(answer)")
    .eq("team_id", team!.id)
    .eq("round", 1)
    .not("player_id", "in", `(${bots.map((b) => b.playerId).join(",")})`)
    .single();
  await page.getByPlaceholder("Your answer").fill((task!.questions as unknown as { answer: string }).answer);
  await page.getByRole("button", { name: "Submit answer" }).click();
  await text(page, "YOUR PIECE · ");
  await solveAll(bots);
  await text(page, "Seek the mark");
  step("all four pieces → Seek with the full clue (live)");

  // At the mark: scan, type the key, press the seal; bots check in.
  await page.getByRole("button", { name: /Found it/ }).click();
  const qr = await qrFor(team!.id, 1);
  await scan(page, qr.token);
  await text(page, "Now type the key printed on it.");
  await page.getByLabel("Secret key character 1").click();
  await page.keyboard.type(qr.key);
  await page.getByRole("button", { name: "Press my seal" }).click();
  await text(page, "Your seal is pressed");
  for (const b of bots) {
    await call(b.client, "scan_qr", { p_token: qr.token });
    await call(b.client, "submit_key", { p_token: qr.token, p_key: qr.key });
  }
  await text(page, /Seek the final mark|YOUR QUESTION · PIECE/);
  const s = await status(bots[0]!);
  if (s.round?.number !== 2) throw new Error(`expected round 2, got ${s.round?.number}`);
  step("round 1 complete; the phone moved to round 2 on its own");
  void me;

  const csp = errors.filter((e) => /Content Security Policy|Refused to/i.test(e));
  if (csp.length) throw new Error(`CSP violations:\n${csp.join("\n")}`);
  step(`no CSP violations (${errors.length} other console errors)`);
  if (errors.length) console.log(errors.map((e) => `  · ${e.slice(0, 160)}`).join("\n"));
  console.log("E2E PASSED");
} finally {
  await browser.close();
  server.kill();
  await cleanupAccounts();
}

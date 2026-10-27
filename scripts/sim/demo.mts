// T-808 demo video: ten screens recorded at the same time on the TEST project: the admin panel, the projector and
// two crews of four phones, every one driven through the real UI (phones scan with the site's own scanner: each phone
// is its own Chromium whose fake camera shows the QR it points at). Captions name each step.
//
//   Iron Gulls play clean. Black Tide miss three answers (+1:00), take hints (+1:00 each), scan a later round's mark
//   and a prank mark, type a wrong key, check in first in round 2 but serve their penalty, are overtaken and knocked
//   out. Iron Gulls take the final with key + seal code: chest, podium, Game over everywhere.
//
//   npm run demo      → docs/demo/demo.mp4 (2 × 5 grid) + docs/demo/demo-steps.md (timestamps)
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { adminEmail } from "../../src/lib/admin-email";

const url = process.env.TEST_SUPABASE_URL!;
const anonKey = process.env.TEST_SUPABASE_ANON_KEY!;
if (!url || url === process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error("the demo runs against the TEST project only");
const service = createClient(url, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const PORT = 3366;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = "docs/demo";
const WORK = `${OUT}/.work`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const steps: { t: number; text: string }[] = [];
const say = (text: string) => {
  steps.push({ t: (Date.now() - t0) / 1000, text });
  console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${text}`);
};
const see = (p: Page, t: string | RegExp, timeout = 60_000) => p.getByText(t).first().waitFor({ timeout });

// One demo at a time: two at once starve each other's browsers and scanners.
const LOCK = `${OUT}/.demo.lock`;
mkdirSync(OUT, { recursive: true });
if (existsSync(LOCK)) throw new Error(`another demo is running (${LOCK}); delete it if that run is gone`);
writeFileSync(LOCK, String(process.pid));
process.on("exit", () => rmSync(LOCK, { force: true }));

// ── World ────────────────────────────────────────────────────────────────────────────────────────────
rmSync(WORK, { recursive: true, force: true });
mkdirSync(`${WORK}/video`, { recursive: true });
const creds = JSON.parse(
  execFileSync("scripts/sim/.venv/bin/python", ["scripts/sim/world_cli.py"], { cwd: process.cwd(), env: { ...process.env, PYTHONPATH: "scripts/sim" } }).toString(),
) as { email: string; password: string };
const setup: SupabaseClient = createClient(url, anonKey, { auth: { persistSession: false } });
await setup.auth.signInWithPassword({ email: creds.email, password: creds.password });
const rpc = async <T,>(fn: string, args: Record<string, unknown> = {}) => {
  const { data, error } = await setup.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
};
await rpc("set_team_count", { p_count: 2 });
const { data: teams } = await service.from("teams").select("id, code, number").order("number");
const CREWS = [
  { name: "Iron Gulls", style: "clean", members: ["Ana", "Ravi", "Meera", "Josh"] },
  { name: "Black Tide", style: "cheat", members: ["Kiran", "Sam", "Leela", "Omar"] },
] as const;
// The captain's own console sign-in (the panel takes a name + passcode).
const captain = { name: `Captain Demo ${randomUUID().slice(0, 4)}`, pass: `pw-${randomUUID()}` };
const { data: cu } = await service.auth.admin.createUser({ email: adminEmail(captain.name), password: captain.pass, email_confirm: true });
await service.from("admins").insert({ user_id: cu.user!.id, name: captain.name });

// ── Browsers: one for the two desktop screens, one per phone (each phone has its own fake camera file) ───────
const server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
  env: { ...process.env, NEXT_DIST_DIR: ".next-demo", NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey, NEXT_PUBLIC_SITE_URL: BASE },
  stdio: "ignore",
});
for (let i = 0; i < 120 && !(await fetch(`${BASE}/play`).then((r) => r.ok, () => false)); i++) await sleep(1000);
// Warm the routes so the first recorded frames aren't a compiling dev server.
for (const path of ["/play", "/screen", "/admin/login", "/admin", "/q/x"]) await fetch(`${BASE}${path}`).catch(() => null);

const errors: string[] = [];
const browsers: Browser[] = [];
const contexts: BrowserContext[] = [];
const starts: Record<string, number> = {};
async function open(label: string, viewport: { width: number; height: number }, args: string[] = [], scale = 1, gpu = false,
  record = viewport) {
  // The projector draws animations and the 3D chest: full Chromium on the Mac's GPU keeps it (and its recording) real-time.
  const b = await chromium.launch(gpu ? { channel: "chromium", args: ["--use-angle=metal", "--ignore-gpu-blocklist", ...args] } : { args });
  browsers.push(b);
  const ctx = await b.newContext({
    viewport,
    deviceScaleFactor: scale,
    // Recorded at the size the final grid shows it: encoding full size can't keep up with ten screens.
    recordVideo: { dir: `${WORK}/video/${label}`, size: record },
    permissions: ["camera"],
  });
  contexts.push(ctx);
  const page = await ctx.newPage();
  starts[label] = Date.now();
  page.on("console", (m) => m.type() === "error" && errors.push(`${label}: ${m.text().slice(0, 160)}`));
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message.slice(0, 160)}`));
  return page;
}

async function camera(file: string, text: string) {
  // The QR the phone's camera "sees": a white card with the code, as a short Y4M clip Chromium loops.
  const png = `${file}.png`;
  await QRCode.toFile(png, text, { width: 420, margin: 4, errorCorrectionLevel: "M" });
  // Written beside the camera file and swapped in (rename), so a camera that is running never reads a half-written file.
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-loop", "1", "-i", png, "-t", "1", "-r", "10",
    "-vf", "scale=420:420,pad=640:480:110:30:white", "-pix_fmt", "yuv420p", `${file}.next.y4m`]);
  renameSync(`${file}.next.y4m`, `${file}.y4m`);
}

type Phone = { page: Page; cam: string; name: string; crew: number; playerId?: string };
const fallbacks: string[] = [];
const phones: Phone[] = [];
for (let c = 0; c < 2; c++) {
  for (let k = 0; k < 4; k++) {
    const cam = `${WORK}/cam-${c}-${k}`;
    await camera(cam, "blank");
    const page = await open(`phone-${c}-${k}`, { width: 390, height: 844 }, [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${process.cwd()}/${cam}.y4m`,
    ], 1, false, { width: 238, height: 516 });
    phones.push({ page, cam, name: CREWS[c]!.members[k]!, crew: c });
  }
}
const admin = await open("admin", { width: 1440, height: 900 }, [], 1, false, { width: 864, height: 540 });
const screen = await open("screen", { width: 1280, height: 720 }, [], 1, true, { width: 960, height: 540 });

const crewPhones = (c: number) => phones.filter((p) => p.crew === c);
const teamId = (c: number) => teams![c]!.id as string;
const mark = async (c: number, round: number) => {
  const { data } = await service.from("assignments").select("qr_codes(token, key, kind)").eq("team_id", teamId(c)).eq("round", round).single();
  return data!.qr_codes as unknown as { token: string; key: string; kind: string };
};
const markUrl = (token: string) => `${BASE}/q/${token}`;
async function scanWith(p: Phone, token: string, open: () => Promise<void>, read: (ms?: number) => Promise<unknown>, close: string) {
  await camera(p.cam, markUrl(token));
  // A scanner already running (the phone jumped to check-in) may have read it on its own.
  if (await read(1_500).then(() => true, () => false)) return;
  await open();
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (await read(12_000).then(() => true, () => false)) return;
    if (attempt === 2) {
      // The fake camera shows the code but the decoder (starved by ten browsers) hasn't read it: hand the same code
      // to the same handler the camera calls (development builds only), and count it in demo-steps.md.
      fallbacks.push(p.name);
      await p.page.evaluate((t) => (window as unknown as { __chScan: (t: string) => Promise<void> }).__chScan(t), token);
      if (await read(15_000).then(() => true, () => false)) return;
      break;
    }
    // Still not read: close the scanner and point the camera again, if the scanner is still open.
    const shut = p.page.getByRole("button", { name: close });
    if (attempt === 1) {
      // A fresh page restarts the camera from scratch (a phone owner would close and reopen the site).
      await p.page.reload();
      await sleep(2500);
      await open();
    } else if (await shut.count()) {
      await shut.first().click();
      await sleep(1500);
      await open();
    }
  }
  throw new Error(`${p.name}: the scanner never read the code`);
}
/**
 * Opens the check-in scanner so the camera starts on the mark now in front of it. Once a teammate has checked in, the
 * phone is already on the check-in screen with the camera running from before: go back to the clue and open it again
 * (or reload, if the phone stays on check-in).
 */
async function openCheckIn(p: Phone) {
  const found = p.page.getByRole("button", { name: /Found it/ });
  try {
    await found.click({ timeout: 3000 });
  } catch {
    // Already on the check-in screen (a teammate checked in): restart its camera with a reload.
    await p.page.reload();
  }
}
const shows = (p: Phone, t: string | RegExp) => (ms = 15_000) => see(p.page, t, ms);
async function typeKey(page: Page, label: string, value: string) {
  await page.getByLabel(`${label} character 1`).click();
  await page.keyboard.type(value, { delay: 60 });
}
async function myTask(p: Phone, round: number) {
  if (!p.playerId) {
    const { data } = await service.from("players").select("id").eq("team_id", teamId(p.crew)).eq("name", p.name).single();
    p.playerId = data!.id;
  }
  const { data } = await service.from("tasks").select("id, option_order, questions(answer, format)").eq("player_id", p.playerId).eq("round", round).single();
  const q = data!.questions as unknown as { answer: string; format: string };
  return { mcq: q.format === "mcq", right: q.format === "mcq" ? (data!.option_order as number[]).indexOf(Number(q.answer)) : q.answer };
}

try {
  // ── Before the hunt ────────────────────────────────────────────────────────────────────────────────
  await screen.goto(`${BASE}/screen`);
  await admin.goto(`${BASE}/admin/login`);
  await admin.getByLabel("ADMIN NAME").fill(captain.name);
  await admin.getByLabel("PASSCODE").fill(captain.pass);
  await admin.getByRole("button", { name: "Sign in" }).click();
  await admin.waitForURL(`${BASE}/admin`);
  say("The captain signs in; the projector shows the players' join QR");
  await Promise.all(phones.map((p) => p.page.goto(`${BASE}/play`)));

  say("Players join with their crew's code; the first member names the crew");
  for (let c = 0; c < 2; c++) {
    for (const [k, p] of crewPhones(c).entries()) {
      await p.page.getByLabel("YOUR NAME").fill(p.name);
      await typeKey(p.page, "Team code", teams![c]!.code);
      await p.page.getByRole("button", { name: "Join the crew" }).click();
      if (k === 0) {
        await p.page.getByLabel(/NAME YOUR CREW/).fill(CREWS[c]!.name);
        await p.page.getByRole("button", { name: "Raise the flag" }).click();
        await p.page.getByLabel(/NAME YOUR CREW/).waitFor({ state: "detached" });
      }
      await sleep(600);
    }
  }
  await Promise.all(phones.map((p) => see(p.page, "THE CREW IS SEALED")));
  say("Both crews are sealed (4/4); the projector lists them");

  // Course: round I (both advance), round II (one advances), the final.
  const plan = JSON.parse(
    execFileSync("npx", ["tsx", "scripts/sim/plan.mts"], {
      input: JSON.stringify(await (async () => {
        const { data: locs } = await service.from("locations").select("id, area, map_x, map_y");
        return {
          teamIds: teams!.map((t) => t.id),
          locationIds: locs!.map((l) => l.id),
          seed: 7,
          counts: [3, 2, 1],
          advance: [2, 1, 1],
          areas: Object.fromEntries(locs!.map((l) => [l.id, l.area])),
          pins: Object.fromEntries(locs!.map((l) => [l.id, { x: l.map_x, y: l.map_y }])),
        };
      })()),
    }).toString(),
  );
  await rpc("apply_game_plan", { p_plan: plan });
  await admin.reload();
  say("The captain generates the course: Round I (2 advance), Round II (1 advances), the final");
  await see(admin, "COURSE READY");
  await admin.getByRole("toolbar").getByRole("button", { name: "Start hunt" }).click();
  await admin.getByRole("dialog", { name: "Start the hunt?" }).getByRole("button", { name: "Start hunt" }).click();
  await see(admin, /LIVE · ROUND I/);
  await see(screen, "SCAN TO BEGIN");
  say("Start! The projector shows the universal start QR");
  await admin.getByRole("switch", { name: "Hints off" }).click();
  await admin.getByRole("button", { name: "Broadcast" }).click();
  await admin.getByLabel(/MESSAGE/).fill("Fair winds, crews! Hints are on (+1:00 each).");
  await admin.getByRole("button", { name: "Send" }).click();
  say("The captain turns hints on and broadcasts to every phone");

  const universal = (await service.from("qr_codes").select("token").eq("kind", "universal").single()).data!.token as string;
  // Every phone scans the start QR with its own camera.
  await Promise.all(
    phones.map(async (p, i) => {
      await sleep(i * 700);
      await see(p.page, "Scan the start mark");
      await scanWith(p, universal, () => p.page.getByRole("button", { name: "Scan the start mark" }).click(),
        shows(p, /YOUR QUESTION · PIECE/), "Close");
    }),
  );
  say("All eight phones scanned the start QR: each player gets their own question");

  // ── Round I ────────────────────────────────────────────────────────────────────────────────────────
  let answer = async function (p: Phone, round: number, opts: { misses?: number; hint?: boolean } = {}) {
    const t = await myTask(p, round);
    for (let m = 0; m < (opts.misses ?? 0); m++) {
      const cur = await myTask(p, round);
      if (cur.mcq) await p.page.getByRole("group", { name: "Choices" }).getByRole("button").nth(((cur.right as number) + 1) % 4).click();
      else {
        await p.page.getByPlaceholder("Your answer").fill(`not sure ${m + 1}`);
        await p.page.getByRole("button", { name: "Submit answer" }).click();
      }
      await sleep(1800);
    }
    if (opts.hint && !t.mcq) {
      const take = p.page.getByRole("button", { name: /Take a hint/ });
      if (await take.count()) {
        await take.click();
        await p.page.getByRole("button", { name: "Take the hint" }).click();
        await sleep(2500);
      }
    }
    const now = await myTask(p, round);
    if (now.mcq) await p.page.getByRole("group", { name: "Choices" }).getByRole("button").nth(now.right as number).click();
    else {
      await p.page.getByPlaceholder("Your answer").fill(String(now.right));
      await p.page.getByRole("button", { name: "Submit answer" }).click();
    }
    await see(p.page, /YOUR PIECE · |Seek the|THE CLUE/);
  }
  const named = <A extends unknown[]>(fn: (p: Phone, ...a: A) => Promise<void>) => async (p: Phone, ...a: A) => {
    try {
      await fn(p, ...a);
    } catch (e) {
      console.log(`--- ${p.name} failed:\n${e instanceof Error ? e.message.split("\n").slice(0, 14).join("\n") : String(e)}`);
      throw new Error(`${p.name} (${CREWS[p.crew]!.name}): ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    }
  };
  const aim = async (c: number, round: number) => {
    const m = await mark(c, round);
    await Promise.all(crewPhones(c).map((p) => camera(p.cam, markUrl(m.token))));
  };
  let checkIn = async function (p: Phone, round: number, opts: { wrongKey?: boolean; final?: boolean } = {}) {
    const m = await mark(p.crew, round);
    // On Seek ("Found it") or already on the check-in screen once a teammate has checked in.
    await p.page.getByRole("button", { name: /Found it|Back to the clue/ })
      .or(p.page.getByText(opts.final ? "Two seals open the chest." : "Now type the key printed on it."))
      .first().waitFor({ timeout: 60_000 });
    await scanWith(p, m.token, () => openCheckIn(p),
      shows(p, opts.final ? "Two seals open the chest." : "Now type the key printed on it."), "Back to the clue");
    if (opts.final) {
      const seal = (await service.from("teams").select("final_code").eq("id", teamId(p.crew)).single()).data!.final_code as string;
      await typeKey(p.page, "Key on the mark", m.key);
      await typeKey(p.page, "Crew seal code", seal);
      await p.page.getByRole("button", { name: "Press both seals" }).click();
      return;
    }
    if (opts.wrongKey) {
      await typeKey(p.page, "Secret key", "ZZZZZZ"); // a valid-looking key that isn't theirs
      await p.page.getByRole("button", { name: "Press my seal" }).click();
      await see(p.page, "That key doesn't fit. Check the card again.");
      await sleep(2000);
      for (let i = 6; i >= 1; i--) await p.page.getByLabel(`Secret key character ${i}`).fill("");
    }
    await typeKey(p.page, "Secret key", m.key);
    await p.page.getByRole("button", { name: "Press my seal" }).click();
  }

  const [ana, ravi, meera, josh, kiran, sam, leela, omar] = phones as [Phone, Phone, Phone, Phone, Phone, Phone, Phone, Phone];
  answer = named(answer);
  checkIn = named(checkIn);
  say("Round I: Iron Gulls answer cleanly; Black Tide's Kiran misses three times (+1:00) and Sam takes a hint (+1:00)");
  await Promise.all([
    answer(ana, 1), answer(ravi, 1), answer(meera, 1), answer(josh, 1),
    answer(kiran, 1, { misses: 3 }), answer(sam, 1, { hint: true }), answer(leela, 1), answer(omar, 1),
  ]);
  say("All four pieces solved: the fog lifts over the search area on every phone");
  // At the Seek screen Black Tide try their luck: Leela points the scanner at a Round II mark (sealed, nothing
  // revealed, the captain is alerted); Omar at a prank mark (FOOLED!, its fake key counts for nothing).
  const later = (await service.from("qr_codes").select("token").eq("round", 2).eq("kind", "target").limit(1).single()).data!.token as string;
  try {
    await scanWith(leela, later, () => leela.page.getByRole("button", { name: /Found it/ }).click(),
      shows(leela, "This mark belongs"), "Back to the clue");
    say("Cheat: Leela scans a Round II mark early: sealed, nothing revealed, the captain gets an alert");
    await sleep(4000);
    await leela.page.getByRole("button", { name: "Back to my clue" }).click();
  } catch {
    console.log("(Leela's cheat scan didn't read: skipped)");
  }
  const prank = (await service.from("qr_codes").select("token").eq("kind", "prank").limit(1).maybeSingle()).data?.token as string | undefined;
  if (prank) {
    try {
      await scanWith(omar, prank, () => omar.page.getByRole("button", { name: /Found it/ }).click(),
        shows(omar, /Fooled!/i), "Back to the clue");
      say("Cheat: Omar scans a prank mark: FOOLED! Its fake key counts for nothing");
      await sleep(4500);
      await omar.page.getByRole("button", { name: "Back to the real hunt" }).click();
    } catch {
      console.log("(Omar's prank scan didn't read: skipped)");
      const back = omar.page.getByRole("button", { name: "Back to the clue" });
      if (await back.count()) await back.click();
    }
  }
  const alertBtn = admin.getByRole("button", { name: /Acknowledge: Later-round scan/ });
  if (await alertBtn.count()) {
    say("The captain acknowledges the later-round-scan alert on the dashboard");
    await alertBtn.click();
  }
  await aim(0, 1);
  await Promise.all(crewPhones(0).map((p, i) => sleep(i * 900).then(() => checkIn(p, 1))));
  say("Iron Gulls scan their mark and type its key: Round I complete, no penalty");
  await aim(1, 1);
  await Promise.all(crewPhones(1).map((p, i) => sleep(i * 900).then(() => checkIn(p, 1, { wrongKey: i === 0 }))));
  say("Black Tide check in (Kiran tries a wrong key first) and must serve their 2:00 penalty");
  await see(kiran.page, "PENALTY");

  // ── Round II: Black Tide check in first but carry a penalty; Iron Gulls overtake ───────────────────────
  await see(ana.page, /YOUR QUESTION · PIECE/, 30_000);
  say("Round II (only one crew advances). Iron Gulls start while Black Tide serve their penalty");
  await Promise.all(crewPhones(0).map((p) => answer(p, 2)));
  await see(kiran.page, /YOUR QUESTION · PIECE/, 200_000);
  say("Black Tide's penalty is over; they rush Round II, taking another hint (+1:00)");
  await Promise.all([answer(kiran, 2, { hint: true }), answer(sam, 2), answer(leela, 2), answer(omar, 2)]);
  await aim(1, 2);
  await Promise.all(crewPhones(1).map((p, i) => sleep(i * 700).then(() => checkIn(p, 2))));
  say("Black Tide check in first, but their +1:00 penalty is still running…");
  await aim(0, 2);
  await Promise.all(crewPhones(0).map((p, i) => sleep(i * 700).then(() => checkIn(p, 2))));
  say("…Iron Gulls check in with no penalty and take the only Round II place");
  await see(kiran.page, /ELIMINATED|Lost at sea|out of the hunt|Watch the race/i, 60_000);
  say("Round II sealed: Black Tide are eliminated (phones, dashboard and projector)");
  await sleep(4000);
  await Promise.all(crewPhones(1).map((p) => p.page.getByRole("button", { name: "Watch the race" }).click().catch(() => null)));
  say("Black Tide choose to watch the race as spectators");

  // ── The final ──────────────────────────────────────────────────────────────────────────────────────
  await see(ana.page, /YOUR QUESTION · PIECE/, 60_000);
  say("The final round: Iron Gulls solve the last riddle; the crew seal code appears on their scroll");
  await Promise.all(crewPhones(0).map((p) => answer(p, 3)));
  await aim(0, 3);
  await Promise.all(crewPhones(0).map((p, i) => sleep(i * 900).then(() => checkIn(p, 3, { final: true }))));
  say("At the final mark each member types the printed key and the crew's seal code");
  await see(ana.page, /THE TREASURE IS CLAIMED|The hunt is over/, 60_000);
  say("Iron Gulls claim the treasure: the 3D chest opens, the completion key shows; Game over on every screen");
  await see(screen, /Game over|The treasure is claimed/, 30_000);
  await see(admin, /HUNT OVER/, 30_000);
  await sleep(14_000);
  say("The projector shows the podium; the dashboard shows the winner's completion key for the captain to check");
  await sleep(6_000);
} catch (e) {
  say(`DEMO STOPPED: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
  process.exitCode = 1;
  for (const [i, p] of phones.entries()) await p.page.screenshot({ path: `${WORK}/stopped-${i}-${p.name}.png` }).catch(() => null);
  await admin.screenshot({ path: `${WORK}/stopped-admin.png` }).catch(() => null);
  await screen.screenshot({ path: `${WORK}/stopped-screen.png` }).catch(() => null);
} finally {
  for (const ctx of contexts) await ctx.close();
  for (const b of browsers) await b.close();
  server.kill();
  await service.from("admins").delete().eq("user_id", cu.user!.id);
  await service.auth.admin.deleteUser(cu.user!.id);
}

// ── Compose: admin + projector on top, eight phones below, captions along the bottom ───────────────────────
const order = ["admin", "screen", ...phones.map((_, i) => `phone-${Math.floor(i / 4)}-${i % 4}`)];
const file = (label: string) => {
  const dir = `${WORK}/video/${label}`;
  return `${dir}/${readdirSync(dir).find((f) => f.endsWith(".webm"))}`;
};
const latest = Math.max(...Object.values(starts));
const total = (Date.now() - latest) / 1000;
const shift = (label: string) => (latest - starts[label]!) / 1000;
// This ffmpeg has no text filter: captions and labels are drawn by the browser as transparent PNGs and overlaid.
const caps = steps.map((s, i) => ({
  ...s,
  from: Math.max(0, s.t - (latest - t0) / 1000),
  to: Math.max(0, (steps[i + 1]?.t ?? total + (latest - t0) / 1000) - (latest - t0) / 1000),
  png: `${WORK}/cap-${i}.png`,
}));
{
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1920, height: 1160 } });
  const css = "margin:0;background:transparent;font-family:Georgia,serif;color:#E2BE72";
  await page.setContent(`<body style="${css}"><div style="position:absolute;left:30px;top:10px;font-size:16px;letter-spacing:.2em">ADMIN PANEL</div>
    <div style="position:absolute;left:942px;top:10px;font-size:16px;letter-spacing:.2em">PROJECTOR</div>
    <div style="position:absolute;left:16px;top:570px;font-size:16px;letter-spacing:.12em">IRON GULLS · plays clean</div>
    <div style="position:absolute;left:972px;top:570px;font-size:16px;letter-spacing:.12em">BLACK TIDE · hints, misses, cheats</div></body>`);
  await page.screenshot({ path: `${WORK}/labels.png`, omitBackground: true });
  await page.setViewportSize({ width: 1920, height: 44 });
  for (const c of caps) {
    await page.setContent(`<body style="${css};display:flex;justify-content:center;align-items:center;height:44px">
      <span style="background:rgba(0,0,0,.65);color:#fff;font-size:24px;padding:4px 14px;border-radius:6px">${c.text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</span></body>`);
    await page.screenshot({ path: c.png, omitBackground: true });
  }
  await b.close();
}
const n = order.length;
const filters = [
  `[0:v]trim=start=${shift("admin")},setpts=PTS-STARTPTS,scale=864:540,setsar=1[a]`,
  `[1:v]trim=start=${shift("screen")},setpts=PTS-STARTPTS,scale=960:540,setsar=1[s]`,
  ...order.slice(2).map((l, i) => `[${i + 2}:v]trim=start=${shift(l)},setpts=PTS-STARTPTS,scale=238:516,setsar=1[p${i}]`),
  `color=c=0x12100D:s=1920x1160:d=${total.toFixed(1)}[bg]`,
  `[bg][a]overlay=24:28:shortest=0[b0]`,
  `[b0][s]overlay=936:28[b1]`,
  ...Array.from({ length: 8 }, (_, i) => `[b${i + 1}][p${i}]overlay=${12 + i * 238 + (i >= 4 ? 8 : 0)}:596[b${i + 2}]`),
  `[b9][${n}:v]overlay=0:0[c0]`,
  ...caps.map((c, i) => `[c${i}][${n + 1 + i}:v]overlay=0:1114:enable='between(t,${c.from.toFixed(1)},${c.to.toFixed(1)})'[c${i + 1}]`),
];
const outLabel = `c${caps.length}`;
mkdirSync(OUT, { recursive: true });
execFileSync(
  "ffmpeg",
  ["-loglevel", "error", "-y", ...order.flatMap((l) => ["-i", file(l)]), "-i", `${WORK}/labels.png`, ...caps.flatMap((c) => ["-i", c.png]),
    "-filter_complex", filters.join(";"), "-map", `[${outLabel}]`, "-t", total.toFixed(1),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${OUT}/demo.mp4`],
  { stdio: "inherit" },
);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
writeFileSync(
  `${OUT}/demo-steps.md`,
  `# Demo video steps\n\n[demo.mp4](demo.mp4): ten screens recorded at once on the test project (admin panel, projector, two crews × four phones).\n\n| Time | Step |\n|---|---|\n` +
    steps.map((s) => `| ${mmss(Math.max(0, s.t - (latest - t0) / 1000))} | ${s.text} |`).join("\n") +
    `\n\nScans the fake camera showed but the decoder didn't read in time, handed to the same scan handler instead: ${fallbacks.length}${fallbacks.length ? ` (${fallbacks.join(", ")})` : ""}.` +
    `\n\nBrowser console errors during the recording: ${errors.length ? errors.map((e) => `\n- ${e}`).join("") : "none"}\n`,
);
console.log(`demo.mp4: ${mmss(total)} · ${errors.length} console errors`);

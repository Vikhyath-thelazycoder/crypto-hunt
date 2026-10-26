// End-to-end: a real browser runs a whole hunt from /admin against the crypto-hunt-test project, with bot crews
// playing through the real RPCs. Proves P4 (T-401…T-409): login guard, crews, venue map + pins, Generate, print
// sheets, Start, live dashboard (timed against the 2 s goal), alerts, controls, overrides, podium, export, New Game.
//
//   npm run e2e:admin     (starts its own dev server on :3322 pointed at the TEST project)
//
// Never runs against production: the dev server and every client use TEST_* variables.
import { chromium, type Page } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { adminEmail } from "../src/lib/admin-email";
import { placeLine } from "../src/lib/admin/place";
import {
  account,
  call,
  cleanupAccounts,
  join,
  playRound,
  qrByLabel,
  resetWorld,
  seedVenue,
  service,
  solveAll,
  status,
  type Player,
} from "../integration/harness";

const PORT = 3322;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = "screens-out";
const step = (msg: string) => console.log(`✓ ${msg}`);
const fail = (msg: string): never => {
  throw new Error(msg);
};

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
      if ((await fetch(`${BASE}/admin/login`)).ok) return child;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  child.kill();
  throw new Error("dev server did not start");
}

const see = (page: Page, t: string | RegExp, timeout = 15000) => page.getByText(t).first().waitFor({ timeout });
/** Time from an action until the dashboard shows its result (goal: ≤ 2 s, PRD › Goals). */
async function timed(page: Page, action: () => Promise<unknown>, shows: string | RegExp, label: string) {
  const t0 = Date.now();
  await action();
  const acted = Date.now();
  await see(page, shows, 10_000);
  const ms = Date.now() - acted;
  step(`${label}: on the dashboard ${ms} ms after the server answered (${acted - t0} ms action)`);
  if (ms > 2000) fail(`${label} took ${ms} ms to reach the dashboard (goal ≤ 2 s)`);
  return ms;
}
const nav = (page: Page, section: string) =>
  page.getByRole("navigation", { name: "Admin sections" }).getByRole("link", { name: section, exact: true }).click();
async function adminAudit(action: string) {
  const { data } = await service.from("admin_audit").select("*").eq("action", action).order("id", { ascending: false }).limit(1);
  return data?.[0] as { reason: string | null; target: string | null; data: Record<string, unknown> } | undefined;
}
async function dialogButton(page: Page, dialog: string | RegExp, button: string | RegExp) {
  return page.getByRole("dialog", { name: dialog }).getByRole("button", { name: button });
}

mkdirSync(OUT, { recursive: true });
const server = await startServer();
const browser = await chromium.launch();
const errors: string[] = [];
const captain = { name: `E2E Captain ${randomUUID().slice(0, 4)}`, pass: `pass-${randomUUID()}` };
const outsider = { name: `E2E Outsider ${randomUUID().slice(0, 4)}`, pass: `pass-${randomUUID()}` };
const userIds: string[] = [];
const latencies: number[] = [];

try {
  // ── World: venue places and questions exist (P5 content); no crews, no course. ─────────────────────
  await resetWorld();
  await seedVenue(24, 80);
  for (const who of [captain, outsider]) {
    const { data, error } = await service.auth.admin.createUser({ email: adminEmail(who.name), password: who.pass, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("createUser");
    userIds.push(data.user.id);
    if (who === captain) await service.from("admins").insert({ user_id: data.user.id, name: who.name });
  }

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  // Expected: the deliberate wrong-passcode sign-in answers 400. Anything else fails the run.
  const failed: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.request().method()} ${r.url().replace(/\?.*$/, "")}`);
  });

  // ── T-401: guard + login ────────────────────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/admin`);
  await page.waitForURL(/\/admin\/login/);
  step("signed out: /admin redirects to the login page");
  await page.goto(`${BASE}/admin/print?sheet=master`);
  await page.waitForURL(/\/admin\/login/);
  step("signed out: the print sheet redirects too (T17)");
  await page.getByLabel("ADMIN NAME").fill(outsider.name);
  await page.getByLabel("PASSCODE").fill(outsider.pass);
  await page.getByRole("button", { name: "Sign in" }).click();
  await see(page, "That account isn't the captain.");
  step("an account that isn't in admins is refused");
  await page.getByLabel("ADMIN NAME").fill(captain.name);
  await page.getByLabel("PASSCODE").fill("wrong passcode!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await see(page, /don't match/);
  await page.getByLabel("PASSCODE").fill(captain.pass);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${BASE}/admin`);
  await see(page, "BEFORE THE HUNT");
  await see(page, "No crews yet.");
  step("captain signs in with name + passcode; Live shows the empty state");

  // ── T-501: question bank ────────────────────────────────────────────────────────────────────────────
  await nav(page, "Questions");
  await see(page, "80 enabled · 80 in the bank");
  const { csvTemplate } = await import("../src/lib/admin/questions");
  const bankCsv = `${csvTemplate()}\r\n9,text,A broken row?,x,,,,,,,`;
  await page.getByLabel("CSV file").setInputFiles({ name: "bank.csv", mimeType: "text/csv", buffer: Buffer.from(bankCsv) });
  await see(page, "3 ready");
  await see(page, /Difficulty must be a whole number/);
  await page.screenshot({ path: `${OUT}/admin-questions-import.png` });
  await page.getByRole("button", { name: "Import 3 questions" }).click();
  await see(page, "Imported 3 questions; 1 row skipped.");
  await see(page, "83 enabled · 83 in the bank");
  step("questions: CSV import reports the bad row by line and imports the 3 good ones");
  await page.getByRole("button", { name: "Edit: Which planet is called the Red Planet?" }).click();
  const editor = page.getByRole("dialog", { name: "Edit question" });
  if ((await editor.getByLabel("ANSWER", { exact: true }).inputValue()) !== "Mars") fail("the editor should load the answer");
  await editor.getByLabel("OTHER ANSWERS · USE |").fill("the red planet");
  await page.screenshot({ path: `${OUT}/admin-questions-editor.png` });
  await editor.getByRole("button", { name: "Save" }).click();
  await see(page, "Question saved.");
  const { data: mars } = await service.from("questions").select("alternatives").eq("text", "Which planet is called the Red Planet?").single();
  if (mars?.alternatives?.[0] !== "the red planet") fail("the edit should reach the database");
  step("questions: the editor loads the answer and saves an edit");

  // ── T-402: crews ────────────────────────────────────────────────────────────────────────────────────
  await nav(page, "Crews");
  await page.getByRole("textbox", { name: "CREWS", exact: true }).fill("3");
  await page.getByRole("button", { name: "Create 3 crews" }).click();
  await see(page, "3 crews created. Hand each its code.");
  const { data: teams } = await service.from("teams").select("id, name, code, number").order("number");
  if (teams?.length !== 3) fail("3 crews expected");
  for (const t of teams!) await see(page, t.code);
  step("created 3 crews; their codes show on the Crews page");
  const crews: Player[][] = [];
  let acc = 0;
  for (const t of teams!) {
    const crew: Player[] = [];
    for (let m = 0; m < 4; m++) {
      const name = `${t.name.split(" ")[0]} ${m + 1}`;
      if (t.number === 1 && m === 0) {
        const p = await account(acc++);
        const t0 = Date.now();
        crew.push(await join(p, name, t.code));
        await see(page, name, 5000);
        latencies.push(Date.now() - t0);
        step(`a member joining appears on the Crews page live (${Date.now() - t0} ms incl. the join)`);
      } else crew.push(await join(await account(acc++), name, t.code));
    }
    crews.push(crew);
  }
  const [A, B, C] = crews as [Player[], Player[], Player[]];
  await page.screenshot({ path: `${OUT}/admin-crews.png`, fullPage: true });

  // Rename one crew in the UI.
  const cCard = page.getByRole("article", { name: teams![2]!.name });
  await cCard.getByRole("button", { name: "Rename" }).click();
  await cCard.getByLabel("Crew name").fill("Lantern Crew E2E");
  await cCard.getByRole("button", { name: "Save" }).click();
  await see(page, "Renamed to Lantern Crew E2E.");
  step("renamed a crew");

  // Code slips print view.
  const slips = await ctx.newPage();
  await slips.goto(`${BASE}/admin/print?sheet=codes`);
  await slips.locator(".ch-print-slip").first().waitFor();
  if ((await slips.locator(".ch-print-slip").count()) !== 3) fail("3 code slips expected");
  await slips.close();
  step("code slips: one per crew");

  // The players' join QR (F2): a big code for this site's /play.
  await page.getByRole("button", { name: "Show the join QR" }).click();
  const joinQr = page.getByTestId("join-qr");
  await joinQr.waitFor();
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || BASE;
  if ((await joinQr.getAttribute("data-url")) !== `${site}/play`) fail(`join QR points at ${await joinQr.getAttribute("data-url")}`);
  if (!(await joinQr.getAttribute("src"))?.startsWith("data:image/png;base64,")) fail("join QR is not an image");
  await page.screenshot({ path: `${OUT}/admin-join-qr.png` });
  await page.keyboard.press("Escape");
  step(`join QR: opens from Crews and encodes ${site}/play`);

  // ── T-403: venue map + locations ───────────────────────────────────────────────────────────────────
  await nav(page, "Locations");
  await see(page, "24 locations · 13 needed");
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1000;
    c.height = 700;
    const g = c.getContext("2d")!;
    g.fillStyle = "#e4d0a2";
    g.fillRect(0, 0, 1000, 700);
    g.strokeStyle = "#2a1d12";
    g.lineWidth = 6;
    g.strokeRect(120, 100, 300, 200);
    g.strokeRect(560, 380, 280, 200);
    return c.toDataURL("image/png").split(",")[1]!;
  });
  writeFileSync(`${OUT}/e2e-venue.png`, Buffer.from(png, "base64"));
  await page.getByLabel("Venue map image").setInputFiles(`${OUT}/e2e-venue.png`);
  await see(page, "Venue map updated.");
  const { data: vm } = await service.from("venue_map").select("*").eq("id", 1).single();
  if (vm?.width !== 1000 || vm?.height !== 700) fail(`venue map size ${vm?.width}x${vm?.height}`);
  await page.locator("svg image").first().waitFor();
  step("uploaded the venue map (1000×700) to Storage; it renders behind the pins");

  await page.getByRole("button", { name: "Add location" }).click();
  await page.getByRole("textbox", { name: "NAME", exact: true }).fill("Clock Tower E2E");
  await page.getByLabel("WHERE TO HIDE IT").fill("Behind the third brick");
  await page.getByLabel("PLACE #").fill("99");
  await page.getByLabel("BUILDING").fill("Tower Block");
  await page.getByLabel("FLOOR").fill("Outdoor");
  await page.getByLabel("LANDMARK").fill("Next to the old gate");
  for (let i = 1; i <= 4; i++) await page.getByLabel(`Clue piece ${i}`).fill(`piece ${i} of the tower`);
  await page.getByLabel("HINT · CLUE 1").fill("Look up");
  // T-507: a second clue set on its own tab.
  await page.getByRole("tab", { name: /Clue 2/ }).click();
  for (let i = 1; i <= 4; i++) await page.getByLabel(`Clue piece ${i}`).fill(`second ${i}`);
  await page.getByLabel("HINT · CLUE 2").fill("Look down");
  const map = page.getByRole("img", { name: /Venue map/ });
  await map.scrollIntoViewIfNeeded();
  const box = (await map.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.3);
  await page.getByRole("button", { name: "Add location" }).last().click();
  await see(page, "Clock Tower E2E saved.");
  const { data: tower } = await service.from("locations").select("*").eq("name", "Clock Tower E2E").single();
  if (!tower || Math.abs(tower.map_x - 0.25) > 0.02 || Math.abs(tower.map_y - 0.3) > 0.02) fail(`pin at ${tower?.map_x},${tower?.map_y}`);
  const { data: towerSets } = await service.from("clue_sets").select("set_no, pieces, hint").eq("location_id", tower.id).order("set_no");
  if (towerSets?.[0]?.pieces.join("|") !== "piece 1 of the tower|piece 2 of the tower|piece 3 of the tower|piece 4 of the tower") fail("clue pieces");
  if (towerSets?.[1]?.pieces.join("|") !== "second 1|second 2|second 3|second 4" || towerSets[1].hint !== "Look down") fail(`clue set 2: ${JSON.stringify(towerSets)}`);
  if (towerSets.length !== 2) fail("an empty clue tab was saved");
  if (`${tower.place_no}|${tower.building}|${tower.floor}|${tower.landmark}` !== "99|Tower Block|Outdoor|Next to the old gate") fail(`place details: ${JSON.stringify(tower)}`);
  await see(page, "Tower Block · Outdoor");
  step(`added a location with number, building, floor, landmark (D-043), two clue sets on tabs (T-507) and a pin (${tower.map_x}, ${tower.map_y})`);
  // Drag its pin (measure the map again: saving can change the layout around it).
  await map.scrollIntoViewIfNeeded();
  const after = (await map.boundingBox())!;
  if (Math.abs(after.y - box.y) > 2) console.log(`  map moved ${Math.round(after.y - box.y)} px after saving`);
  await page.screenshot({ path: `${OUT}/admin-locations-saved.png`, fullPage: true });
  const pinAt = { x: after.x + after.width * 0.25, y: after.y + after.height * 0.3 - 20 };
  await page.mouse.move(pinAt.x, pinAt.y);
  await page.mouse.down();
  await page.mouse.move(pinAt.x + after.width * 0.2, pinAt.y + after.height * 0.2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  const { data: moved } = await service.from("locations").select("map_x, map_y").eq("id", tower.id).single();
  if (!(moved!.map_x > 0.4 && moved!.map_y > 0.45)) fail(`drag didn't move the pin: ${JSON.stringify(moved)}`);
  step(`dragged the pin; it saved on drop (${moved!.map_x}, ${moved!.map_y})`);
  await page.screenshot({ path: `${OUT}/admin-locations.png`, fullPage: true });

  // ── T-404: generate ─────────────────────────────────────────────────────────────────────────────────
  await nav(page, "Generator");
  await see(page, "4 ROUNDS · 11 MARKS · 2 DECOYS · 1 START = 14 SPOTS");
  await see(page, "All 3 crews have exactly 4 members");
  await see(page, "Every crew has a path to the final");
  await page.getByLabel("Round 1 advance").fill("3");
  await page.getByLabel("Round 2 advance").fill("2");
  await page.getByLabel("Round 3 advance").fill("2");
  await page.getByLabel("Final round advance").fill("2");
  await page.screenshot({ path: `${OUT}/admin-generator.png`, fullPage: true });
  await page.getByRole("button", { name: "Generate game" }).click();
  await see(page, /Course set\. \d+ places are new: print the QR sheet/);
  await see(page, "current course");
  const { data: rounds } = await service.from("rounds").select("number, qr_count, advance_count").order("number");
  if (rounds?.map((r) => `${r.qr_count}/${r.advance_count}`).join(" ") !== "5/3 3/2 2/2 1/2") fail(`course ${JSON.stringify(rounds)}`);
  step("generated: 5 → 3 → 2 → 1 marks with X 3, 2, 2, 2; the server re-validated and applied it");
  // Generating again asks first (the printed sheet would stop working).
  await page.getByRole("button", { name: "Generate game" }).click();
  await (await dialogButton(page, "Replace the current course?", "Cancel")).click();
  step("generating again asks before replacing the printed course");

  // ── T-405: print ────────────────────────────────────────────────────────────────────────────────────
  const { data: allQr } = await service
    .from("qr_codes")
    .select("label, key, kind, locations(name, place_no, building, floor, notes, landmark)");
  const sheet = await ctx.newPage();
  await sheet.goto(`${BASE}/admin/print?sheet=qr`);
  await sheet.getByTestId("qr-card").first().waitFor();
  const labels = await sheet.getByTestId("qr-card").evaluateAll((els) => els.map((e) => e.getAttribute("data-label")));
  if (labels.length !== allQr!.length || new Set(labels).size !== labels.length) fail(`QR sheet: ${labels.length} cards for ${allQr!.length} QRs`);
  for (const q of allQr!) if (!labels.includes(q.label)) fail(`QR ${q.label} missing from the sheet`);
  const cardText = await sheet.locator(".ch-print-card").allInnerTexts();
  if (cardText.some((t) => /R\d-|F-01|P-\d|DECOY|Round/i.test(t))) fail("a hidden card shows its label, round or decoy");
  // D-043: the part that is hidden names no place; the cut-off stub names exactly where it goes.
  if (cardText.some((t) => /Spot \d|Test Block|Outdoor Yard|Tower Block|#\d|marker|stone/i.test(t))) fail("a hidden card shows its place");
  const stubs = await sheet.getByTestId("qr-card").evaluateAll((els) =>
    els.map((e) => ({ label: e.getAttribute("data-label"), text: (e.querySelector("[data-testid=qr-stub]") as HTMLElement | null)?.innerText ?? "" })),
  );
  for (const q of allQr!) {
    const stub = stubs.find((x) => x.label === q.label)?.text ?? "";
    const l = q.locations as unknown as { name: string; place_no: number | null; building: string | null; floor: string | null; notes: string | null; landmark: string | null } | null;
    if (!/Cut this strip off and throw it away/.test(stub)) fail(`stub of ${q.label} lacks the cut-off line`);
    if (q.kind === "universal" || !l) continue;
    if (!stub.includes(placeLine(l))) fail(`stub of ${q.label} lacks "${placeLine(l)}": ${stub}`);
    if (l.notes && !stub.includes(`Hide it here: ${l.notes}`)) fail(`stub of ${q.label} lacks its hiding spot`);
    if (l.landmark && !stub.includes(`Landmark: ${l.landmark}`)) fail(`stub of ${q.label} lacks its landmark`);
  }
  // Each stub stays inside its own half page, so cutting between cards never cuts through a stub.
  const spill = await sheet.getByTestId("qr-card").evaluateAll((els) =>
    els.filter((e) => {
      const stub = e.querySelector("[data-testid=qr-stub]")!.getBoundingClientRect();
      return stub.bottom > e.getBoundingClientRect().bottom + 0.5;
    }).length,
  );
  if (spill) fail(`${spill} placement stubs spill out of their half page`);
  const pdf = await sheet.pdf({ format: "A4", printBackground: true });
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  if (pages !== Math.ceil(allQr!.length / 2)) fail(`print: ${pages} A4 pages for ${allQr!.length} QRs`);
  writeFileSync(`${OUT}/qr-sheet.pdf`, pdf);
  await sheet.screenshot({ path: `${OUT}/admin-print.png` });
  step(`QR sheet: every QR exactly once (${labels.length}), 2 per A4 (${pages} pages); cards hide label/round/decoy/place; every stub names # · building · floor · place, hiding spot and landmark (D-043)`);
  await sheet.goto(`${BASE}/admin/print?sheet=master`);
  await sheet.getByTestId("master-row").first().waitFor();
  const rows = await sheet.getByTestId("master-row").allInnerTexts();
  if (rows.length !== allQr!.length) fail("master list rows");
  for (const q of allQr!) if (!rows.some((r) => r.includes(q.label) && r.includes(q.key))) fail(`master list lacks ${q.label}`);
  for (const q of allQr!) {
    const l = q.locations as unknown as Parameters<typeof placeLine>[0] | null;
    if (l && !rows.some((r) => r.includes(q.label) && r.includes(placeLine(l)))) fail(`master list lacks the place of ${q.label}`);
  }
  await sheet.close();
  step("master list: every mark with its key and its place (D-043)");

  // ── T-406/T-407: start and run ──────────────────────────────────────────────────────────────────────
  await nav(page, "Live");
  await see(page, "COURSE READY");
  await page.getByRole("toolbar").getByRole("button", { name: "Start hunt" }).click();
  await (await dialogButton(page, "Start the hunt?", "Start hunt")).click();
  await see(page, /LIVE · ROUND I OF IV/);
  step("started from the dashboard");

  // ── P7: the projector, signed out, in its own window ──────────────────────────────────────────────
  const hall = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  hall.on("console", (m) => m.type() === "error" && errors.push(`screen: ${m.text()}`));
  hall.on("pageerror", (e) => errors.push(`screen: ${e.message}`));
  await hall.goto(`${BASE}/screen`);
  await hall.getByText("SCAN TO BEGIN").waitFor();
  const universal = (await service.from("qr_codes").select("token").eq("kind", "universal").single()).data!.token;
  if (!(await hall.getByTestId("screen-qr").getAttribute("data-url"))?.endsWith(`/q/${universal}`)) fail("projector: universal QR");
  await hall.screenshot({ path: `${OUT}/screen-start.png` });
  // A string, so tsx doesn't wrap the frame counter in a helper the page doesn't have.
  const fps = await hall.evaluate<number>(`new Promise((done) => {
    let n = 0;
    const t0 = performance.now();
    const tick = () => (performance.now() - t0 < 2000 ? (n++, requestAnimationFrame(tick)) : done(n / 2));
    requestAnimationFrame(tick);
  })`);
  step(`projector: the universal QR fills the screen at the start (T-703); ${Math.round(fps)} fps`);

  // Live updates, timed.
  latencies.push(await timed(page, () => solveAll(A), "Seek", "a crew solving all four pieces"));
  latencies.push(
    await timed(
      page,
      async () => {
        const qr = await service.from("assignments").select("qr_codes(token, key)").eq("team_id", A[0]!.teamId).eq("round", 1).single();
        const q = qr.data!.qr_codes as unknown as { token: string; key: string };
        await call(A[0]!.client, "scan_qr", { p_token: q.token });
        await call(A[0]!.client, "submit_key", { p_token: q.token, p_key: q.key });
      },
      "Check in 1/4",
      "a member checking in",
    ),
  );
  const final = await qrByLabel("F-01");
  latencies.push(await timed(page, () => call(B[0]!.client, "scan_qr", { p_token: final.token }), "Later-round scan", "a later-round scan alert"));
  await see(page, /F-01 .* of Round IV while in Round I/);
  await page.getByRole("button", { name: "Acknowledge: Later-round scan" }).click();
  await page.getByText("Later-round scan").waitFor({ state: "detached" });
  const { data: acked } = await service.from("alerts").select("acknowledged").eq("kind", "locked_scan").single();
  if (!acked?.acknowledged) fail("alert not acknowledged");
  step("acknowledged the alert: gone from the rail, saved on the server");

  // Controls.
  await page.getByRole("switch", { name: "Hints off" }).click();
  await see(page, "Hints on (never on multiple choice).");
  await page.getByRole("button", { name: "Broadcast" }).click();
  await page.getByLabel(/MESSAGE/).fill("Round two opens at the fountain");
  await page.getByRole("button", { name: "Send" }).click();
  await see(page, "Sent to every phone.");
  const { data: g1 } = await service.from("games").select("hints_enabled, broadcast").single();
  if (!g1?.hints_enabled || g1.broadcast !== "Round two opens at the fountain") fail(`controls: ${JSON.stringify(g1)}`);
  await hall.getByText("FROM THE CAPTAIN").waitFor();
  await hall.getByText("Round two opens at the fountain").waitFor();
  await page.getByRole("button", { name: /Pause/ }).click();
  await see(page, /PAUSED · ROUND I OF IV/);
  await hall.getByText("Every clock is stopped").waitFor();
  const paused = await call(C[0]!.client, "scan_qr", { p_token: final.token });
  if (paused.code !== "PAUSED") fail("players not paused");
  await page.getByRole("button", { name: /Resume/ }).click();
  await see(page, /LIVE · ROUND I OF IV/);
  step("hints on, broadcast, pause (players blocked) and resume, all from the bar; the projector shows the broadcast and Paused");

  // ── T-408: overrides from a crew card ───────────────────────────────────────────────────────────────
  const bName = teams![1]!.name;
  await page.getByRole("button", { name: `${bName}: open crew` }).click();
  const drawer = page.getByRole("dialog", { name: bName });
  await drawer.getByTestId("target-place").waitFor();
  if (!/Current mark is at #\d+ · /.test(await drawer.getByTestId("target-place").innerText())) fail("crew drawer doesn't say where its mark is");
  await drawer.getByRole("button", { name: "Mark inactive" }).first().click();
  await page.getByRole("dialog", { name: /inactive\?/ }).getByLabel(/REASON/).fill("phone died");
  await (await dialogButton(page, /inactive\?/, "Mark inactive")).click();
  await see(page, /is inactive\./);
  const inactive = await adminAudit("set_member_inactive");
  if (inactive?.reason !== "phone died") fail("inactive audit");
  await drawer.getByRole("button", { name: "Re-point" }).click();
  await page.getByRole("dialog", { name: /^Re-point/ }).getByLabel(/REASON/).fill("card torn off");
  await (await dialogButton(page, /^Re-point/, "Re-point")).click();
  await see(page, /now seeks/);
  if ((await adminAudit("repoint_team"))?.reason !== "card torn off") fail("repoint audit");
  await page.keyboard.press("Escape");
  step("overrides from the crew card: member inactive and re-point, each with a reason in the audit log");

  // Crew A finishes round 1; then X is lowered so round 1 seals at once.
  for (const p of A.slice(1)) {
    const qr = await service.from("assignments").select("qr_codes(token, key)").eq("team_id", p.teamId).eq("round", 1).single();
    const q = qr.data!.qr_codes as unknown as { token: string; key: string };
    await call(p.client, "scan_qr", { p_token: q.token });
    await call(p.client, "submit_key", { p_token: q.token, p_key: q.key });
  }
  await see(page, /sealed I · /);
  await page.getByRole("button", { name: "Fewer crews advance" }).click();
  await see(page, "Round I: 2 crews advance.");
  await page.getByRole("toolbar").locator('span[aria-live="polite"]', { hasText: /^2$/ }).waitFor();
  await page.getByRole("button", { name: "Fewer crews advance" }).click();
  const seal = page.getByRole("dialog", { name: "Seal Round I now?" });
  await seal.getByText(/eliminates 2 crews/).waitFor();
  await seal.getByLabel("TYPE SEAL TO CONFIRM").fill("SEAL");
  await seal.getByRole("button", { name: "Seal and eliminate 2" }).click();
  await see(page, "Eliminated");
  const { data: out } = await service.from("teams").select("status").neq("id", A[0]!.teamId);
  if (!out?.every((t) => t.status === "eliminated")) fail(`expected 2 eliminated: ${JSON.stringify(out)}`);
  step("set X from the bar; lowering it to the crews sealed asks first, then eliminates the rest at once");
  const splash = hall.locator(".sc-splash[role=alert]");
  await splash.getByText("Round I sealed").waitFor();
  if (!(await splash.innerText()).includes(teams![1]!.name)) fail("projector: round splash names the crews out");
  await hall.screenshot({ path: `${OUT}/screen-round.png` });
  step("projector: Round I sealed splash, with the crews out (T-703)");

  // Crew A plays to the end.
  for (let r = 2; r <= 4; r++) await playRound(A);
  await see(page, "1st place");
  await see(page, "HUNT OVER");
  const { data: winner } = await service.from("teams").select("completion_key, final_rank").eq("id", A[0]!.teamId).single();
  const shown = winner!.completion_key!.match(/.{1,3}/g)!.join("·");
  await see(page, shown);
  step(`the winner shows 1st place with its completion key ${shown}; the game finished`);
  await hall.locator(".sc-splash[role=alert]").getByText("Game over").waitFor();
  await hall.locator(".sc-splash[role=alert]").getByText("Return to the starting point").waitFor();
  await hall.getByRole("heading", { name: "The treasure is claimed" }).waitFor();
  if (!(await hall.getByTestId("podium-1").innerText()).includes(teams![0]!.name)) fail("projector: podium");
  await hall.waitForTimeout(3000);
  await hall.screenshot({ path: `${OUT}/screen-over.png` });
  step("projector: Game over with the top 3, then the chest and podium (T-703, T-704)");
  await page.screenshot({ path: `${OUT}/admin-dashboard.png`, fullPage: true });

  // Export.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV" }).click()]);
  const csv = readFileSync((await download.path())!, "utf8");
  if (!csv.includes(teams![0]!.name) || !csv.includes("ADMIN AUDIT") || !csv.includes("phone died")) fail("CSV export content");
  step(`exported the CSV (${download.suggestedFilename()}): teams, round times, log and audit`);

  // Log page.
  await nav(page, "Log");
  await see(page, "Captain marked");
  await see(page, /reason: card torn off/);
  step("the full log lists the captain's actions with their reasons");

  // ── T-409: new game ─────────────────────────────────────────────────────────────────────────────────
  await nav(page, "Live");
  await page.getByRole("toolbar").getByRole("button", { name: "New game" }).click();
  const ng = page.getByRole("dialog", { name: "Start a new game" });
  await ng.getByLabel("TYPE NEW GAME TO CONFIRM").fill("NEW GAME");
  await ng.getByRole("button", { name: "Wipe and start a new game" }).click();
  await see(page, /New game ready/);
  await see(page, "JOINING OPEN");
  const { count: players } = await service.from("players").select("id", { count: "exact", head: true });
  const { data: codes } = await service.from("teams").select("code").order("number");
  if (players !== 0) fail("players remain after New Game");
  if (codes!.some((c, i) => c.code === teams![i]!.code)) fail("team codes not regenerated");
  const old = await A[0]!.client.rpc("my_status");
  if (old.error?.message !== "NOT_REGISTERED") fail(`old phone: ${old.error?.message ?? "still registered"}`);
  step("New Game: players wiped, new crew codes, an old phone gets NOT_REGISTERED (back to Join)");
  void status;

  // Sign out.
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/admin\/login/);
  await page.goto(`${BASE}/admin/crews`);
  await page.waitForURL(/\/admin\/login/);
  step("signed out; the console is closed again");

  const unexpected = failed.filter((f) => !/^400 POST .*\/auth\/v1\/token$/.test(f));
  console.log(`failed requests: ${failed.join(" | ") || "none"}`);
  if (unexpected.length || failed.length !== 1) fail(`unexpected failed requests: ${failed.join(", ")}`);
  step("the only failed request was the deliberate wrong-passcode sign-in");
  const csp = errors.filter((e) => /Content Security Policy|Refused to/i.test(e));
  if (csp.length) fail(`CSP violations:\n${csp.join("\n")}`);
  step(`no CSP violations (${errors.length} other console errors)`);
  if (errors.length) console.log(errors.map((e) => `  · ${e.slice(0, 200)}`).join("\n"));
  console.log(`Dashboard latency (ms): ${latencies.join(", ")}`);
  console.log("ADMIN E2E PASSED");
} finally {
  await browser.close();
  server.kill();
  for (const id of userIds) await service.auth.admin.deleteUser(id);
  await cleanupAccounts();
}

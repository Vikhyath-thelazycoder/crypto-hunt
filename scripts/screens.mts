// Screenshots every player screen from the dev preview (/dev/screens) at phone size, plus the laptop layout,
// for side-by-side checks against docs/design/screens. Needs `npm run dev` (or BASE=http://host:port).
//   npx tsx scripts/screens.mts [outDir]
import { chromium } from "playwright";

const base = process.env.BASE ?? "http://127.0.0.1:3000";
const out = process.argv[2] ?? "screens-out";
const screens = [
  "join",
  "lobby",
  "solve",
  "solve-venue",
  "seek",
  "seek-venue",
  "checkin",
  "final",
  "penalty",
  "prank",
  "sealed",
  "eliminated",
  "spectator",
  "victory",
];

const browser = await chromium.launch();
const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
for (const s of screens) {
  await phone.goto(`${base}/dev/screens?s=${s}`, { waitUntil: "networkidle" });
  // Let the screen's entrance motion finish (T-605: up to ~2.4 s).
  await phone.waitForTimeout(2600);
  await phone.screenshot({ path: `${out}/${s}.png` });
}
const laptop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await laptop.goto(`${base}/dev/screens?s=sealed`, { waitUntil: "networkidle" });
await laptop.waitForTimeout(700);
await laptop.screenshot({ path: `${out}/desktop-sealed.png` });
// The projector (P7) at its own 1920 × 1080.
const projector = ["live", "sketch", "late", "paused", "gather", "start", "round", "first", "finale", "over"];
const hall = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
for (const s of projector) {
  await hall.goto(`${base}/dev/screens?s=screen-${s}`, { waitUntil: "networkidle" });
  await hall.waitForTimeout(s === "first" || s === "finale" || s === "over" ? 7500 : 2000);
  await hall.screenshot({ path: `${out}/screen-${s}.png` });
}
await browser.close();
console.log(`${screens.length + 1 + projector.length} screenshots in ${out}`);

// The real venue as JSON for the bot tests (P8): the 59 places (docs/venue/locations.md, D-043), their route areas
// (D-042) and pins (migration 0023), the clue sets (docs/venue/clues.md) and the seed question bank, parsed with the
// app's own import rules. Read by scripts/sim/world.py, which loads it into the TEST project.
//   npx tsx scripts/sim/venue.mts < /dev/null > venue.json
import { readFileSync } from "node:fs";
import { importQuestions } from "../../src/lib/admin/questions";

const AREA: Record<string, string> = {
  "Main Engineering Block": "Main Block",
  "MBA Block": "MBA area",
  Canteen: "MBA area",
  Park: "MBA area",
  "Basketball Court": "MBA area",
  "Main Ground": "North",
  "SVIT Cafe": "North",
  "Girls' Hostel": "North",
  "Boys' Hostel": "Boys' Hostel",
};
const none = (v: string) => (v === "—" || v === "" ? null : v);

const pins = new Map<number, { x: number; y: number; r: number }>();
for (const m of readFileSync("supabase/migrations/0023_venue_map.sql", "utf8").matchAll(/^\((\d+), '.*?', ([\d.]+), ([\d.]+), ([\d.]+)\)/gm)) {
  pins.set(Number(m[1]), { x: Number(m[2]), y: Number(m[3]), r: Number(m[4]) });
}

const places = readFileSync("docs/venue/locations.md", "utf8")
  .split("\n")
  .filter((l) => /^\| \d+ \|/.test(l))
  .map((l) => {
    const [no, building, floor, name, hide, , , landmark] = l.split("|").slice(1, -1).map((c) => c.trim());
    const pin = pins.get(Number(no));
    return {
      place_no: Number(no),
      building,
      floor,
      name,
      notes: none(hide!),
      landmark: none(landmark!),
      area: AREA[building!] ?? null,
      map_x: pin?.x ?? null,
      map_y: pin?.y ?? null,
      reveal_radius: pin?.r ?? 0.06,
    };
  });

const clues: { place_no: number; set_no: number; pieces: string[]; hint: string }[] = [];
let place: number | null = null;
for (const line of readFileSync("docs/venue/clues.md", "utf8").split("\n")) {
  const head = line.match(/^## #(\d+) · /);
  if (head) place = Number(head[1]);
  const row = line.match(/^\| (\d) \| (.+) \|$/);
  if (!row || place === null) continue;
  const [a, b, c, d, hint] = row[2]!.split(" | ").map((x) => x.trim());
  clues.push({ place_no: place, set_no: Number(row[1]), pieces: [a!, b!, c!, d!], hint: hint! });
}

const questions = importQuestions(readFileSync("supabase/seed/questions.csv", "utf8")).valid;
process.stdout.write(JSON.stringify({ places, clues, questions }));

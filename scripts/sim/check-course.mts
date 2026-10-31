// Generates courses on docs/venue/locations.md's groups, read from the database's place list passed on stdin as [{id, area}].
import { readFileSync } from "node:fs";
import { generatePlan, validatePlan } from "../../src/lib/generator";

const places = JSON.parse(readFileSync(0, "utf8")) as { id: string; area: string }[];
const areas = Object.fromEntries(places.map((p) => [p.id, p.area]));
const ids = places.map((p) => p.id);
for (const n of [5, 10, 43, 80, 100]) {
  const teamIds = Array.from({ length: n }, (_, i) => `t${i}`);
  let bad = 0;
  let last = generatePlan({ teamIds, locationIds: ids, seed: 1, areas });
  for (let seed = 1; seed <= 100; seed++) {
    last = generatePlan({ teamIds, locationIds: ids, seed, areas });
    if (validatePlan(last, teamIds, ids, areas).length) bad++;
  }
  const where = new Map(last.qrs.map((q) => [q.ref, areas[q.location_id]]));
  const start: Record<string, number> = {};
  for (const a of last.assignments.filter((x) => x.round === 1)) start[where.get(a.qr)!] = (start[where.get(a.qr)!] ?? 0) + 1;
  console.log(`${n} crews: cards ${last.rounds.map((r) => r.qr_count).join(">")} = ${last.qrs.length}; bad ${bad}/100; round 1 crews per group ${JSON.stringify(start)}`);
}

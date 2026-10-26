// Routes far apart (P5 · T-510, D-042): with route areas set, apply_game_plan refuses any link that keeps a crew in
// the same area, and accepts the generator's plan, in which every step of every route changes area.
import { beforeAll, describe, expect, it } from "vitest";
import { generatePlan } from "@/lib/generator";
import { call, getAdmin, raises, resetWorld, seedVenue, service, setupTeams } from "./harness";

let locations: string[];
let teamIds: string[];
const areas: Record<string, string> = {};
const admin = async () => (await getAdmin()).client;

beforeAll(async () => {
  await resetWorld();
  locations = await seedVenue(16, 40);
  // 10 places in one building, 6 outside in two areas.
  for (const [i, id] of locations.entries()) {
    areas[id] = i < 10 ? "Main Block" : i < 13 ? "MBA area" : "North";
    await service.from("locations").update({ area: areas[id] }).eq("id", id);
  }
  teamIds = (await setupTeams(2)).teams.map((t) => t.id);
});

describe("route areas on the server (D-042)", () => {
  it("refuses a plan whose link stays in one area", async () => {
    // Without areas the generator links at random: find a seed whose plan keeps a crew in one area.
    let plan = generatePlan({ teamIds, locationIds: locations, seed: 1, counts: [3, 2, 1], advance: [2, 2, 2] });
    for (let seed = 2; !plan.links.some((l) => sameArea(plan, l)); seed++)
      plan = generatePlan({ teamIds, locationIds: locations, seed, counts: [3, 2, 1], advance: [2, 2, 2] });
    expect(await raises(await admin(), "apply_game_plan", { p_plan: plan })).toMatch(
      /BAD_PLAN: a link keeps crews in (Main Block|MBA area|North); the next place must be in another area/,
    );
  });

  it("accepts the generator's plan with areas: every step changes area", async () => {
    const plan = generatePlan({ teamIds, locationIds: locations, seed: 1, counts: [3, 2, 1], advance: [2, 2, 2], areas });
    await call(await admin(), "apply_game_plan", { p_plan: plan });
    const { data } = await service
      .from("assignments")
      .select("team_id, round, qr_codes(locations(area))")
      .order("round");
    const area = (r: { qr_codes: unknown }) => (r.qr_codes as { locations: { area: string } }).locations.area;
    for (const t of teamIds) {
      const path = data!.filter((r) => r.team_id === t);
      expect(path).toHaveLength(3);
      for (let i = 1; i < path.length; i++) expect(area(path[i]!)).not.toBe(area(path[i - 1]!));
    }
  });
});

function sameArea(plan: ReturnType<typeof generatePlan>, l: { from: string; to: string }) {
  const at = new Map(plan.qrs.map((q) => [q.ref, areas[q.location_id]]));
  return at.get(l.from) === at.get(l.to);
}

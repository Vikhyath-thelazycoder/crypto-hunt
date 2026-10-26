// The treasure map on the phone (P6 · T-601, T-602): my_status carries the venue map image and, after a round, the
// region of the round just done (it stays lifted). Regions only: never a place's exact pin.
import { beforeAll, describe, expect, it } from "vitest";
import { applyPlan, call, checkInAll, getAdmin, resetWorld, seedVenue, service, setupTeams, solveAll, status, type Player } from "./harness";

let crew: Player[];
type MapStatus = {
  map: { path: string; w: number; h: number } | null;
  visited: { x: number; y: number; r: number }[];
  region: { x: number; y: number; r: number } | null;
  round: { number: number } | null;
};
const mine = async () => (await status(crew[0]!)) as unknown as MapStatus;

beforeAll(async () => {
  await resetWorld();
  const locations = await seedVenue(12, 40);
  await service.from("venue_map").upsert({ id: 1, image_path: "campus-map.jpg", width: 1800, height: 792 });
  const { teams, players } = await setupTeams(1);
  crew = players[0]!;
  await applyPlan([teams[0]!.id], locations, { counts: [2, 1], advance: [1, 1] });
  await call((await getAdmin()).client, "start_game");
});

describe("map on the phone (T-601, T-602)", () => {
  it("sends the venue map image, and no region until the clue is complete", async () => {
    const s = await mine();
    expect(s.map).toEqual({ path: "campus-map.jpg", w: 1800, h: 792 });
    expect(s.region).toBeNull();
    expect(s.visited).toEqual([]);
  });

  it("after round 1 its region stays lifted in round 2, and no pin is ever sent", async () => {
    await solveAll(crew);
    const r1 = (await mine()).region!;
    expect(r1).not.toBeNull();
    await checkInAll(crew);
    const s = await mine();
    expect(s.round!.number).toBe(2);
    expect(s.visited).toEqual([r1]);
    expect(JSON.stringify(await status(crew[0]!))).not.toMatch(/map_x|map_y|place_no|"notes"/);
  });
});

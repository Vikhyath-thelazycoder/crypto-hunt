// The projector (P7 · T-701 … T-704, D-045): everything /screen draws comes from public_state, read signed out.
// Ships sit only at rounds that are closed (never a mark someone is still seeking); finished crews carry their time
// and members for the podium; the ticker lists public happenings. No pins, keys or codes, ever.
import { beforeAll, describe, expect, it } from "vitest";
import { anon, applyPlan, call, getAdmin, playRound, resetWorld, seedVenue, service, setupTeams, status, type Player } from "./harness";

type Ship = { x: number; y: number; round: number } | null;
type Team = { id: string; name: string; status: string; ship: Ship; finish_ms: number | null; crew: string[] | null };
type Pub = {
  status: string;
  map: { path: string; w: number; h: number } | null;
  teams: Team[];
  latest: { kind: string; team: string | null; round: number | null; rank: number | null }[];
};

let crews: Player[][];
let ids: string[];
const read = async () => {
  const { data, error } = await anon().from("public_state").select("data").single();
  if (error) throw error;
  return data.data as Pub;
};
const teamOf = (p: Pub, i: number) => p.teams.find((t) => t.id === ids[i])!;

beforeAll(async () => {
  await resetWorld();
  const locations = await seedVenue(12, 60);
  await service.from("venue_map").upsert({ id: 1, image_path: "campus-map.jpg", width: 1800, height: 792 });
  const { teams, players } = await setupTeams(3);
  crews = players;
  ids = teams.map((t) => t.id);
  await applyPlan(ids, locations, { counts: [3, 1], advance: [2, 1] });
  await call((await getAdmin()).client, "start_game");
});

describe("projector public state (T-701 … T-704)", () => {
  it("anyone can read it: the venue map, every crew, ships in the harbour at the start", async () => {
    const p = await read();
    expect(p.status).toBe("RUNNING");
    expect(p.map).toEqual({ path: "campus-map.jpg", w: 1800, h: 792 });
    expect(p.teams).toHaveLength(3);
    expect(p.teams.every((t) => t.ship === null)).toBe(true);
    expect(p.latest[0]!.kind).toBe("game_started");
  });

  it("a crew that completes an open round keeps its ship docked: the round's marks are still being sought", async () => {
    await playRound(crews[0]!);
    const p = await read();
    expect(teamOf(p, 0).ship).toBeNull();
    expect(p.latest.some((e) => e.kind === "round_completed" && e.team === teamOf(p, 0).name && e.round === 1)).toBe(true);
  });

  it("once the round closes, ships sail to the region of the round they completed (the phone's visited region)", async () => {
    await playRound(crews[1]!);
    const p = await read();
    for (const i of [0, 1]) {
      const ship = teamOf(p, i).ship!;
      expect(ship.round).toBe(1);
      const visited = ((await status(crews[i]![0]!)) as unknown as { visited: { x: number; y: number }[] }).visited;
      expect({ x: ship.x, y: ship.y }).toEqual({ x: visited[0]!.x, y: visited[0]!.y });
    }
    expect(teamOf(p, 2).status).toBe("eliminated");
    expect(teamOf(p, 2).ship).toBeNull();
  });

  it("the winner carries its time and members for the podium; the game is over", async () => {
    await playRound(crews[0]!);
    const p = await read();
    expect(p.status).toBe("FINISHED");
    const w = teamOf(p, 0);
    expect(w.status).toBe("finished");
    expect(w.finish_ms).toBeGreaterThan(0);
    expect(w.crew).toEqual(crews[0]!.map((m) => m.name));
    expect(teamOf(p, 1).crew).toBeNull();
    expect(p.latest.some((e) => e.kind === "finished" && e.rank === 1)).toBe(true);
  });

  it("never carries a pin, a place, a key or a code", async () => {
    const raw = JSON.stringify(await read());
    expect(raw).not.toMatch(/map_x|map_y|place_no|"notes"|landmark|completion_key|final_code|"key"|Spot \d/);
  });
});

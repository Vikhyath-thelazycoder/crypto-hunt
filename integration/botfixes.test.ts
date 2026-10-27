// Fixes from the P8 bot runs (docs/reports/flaws.md). F-02: when a later round fills first, the crews still in an
// earlier round are out in the round they were actually in, and every earlier round closes with it (the projector
// and dashboard then show the live round). F-01: a crowd joining from one address is not turned away.
import { beforeAll, describe, expect, it } from "vitest";
import { applyPlan, call, getAdmin, playRound, resetWorld, seedVenue, service, setupTeams, type Player } from "./harness";

let crews: Player[][];
let ids: string[];

beforeAll(async () => {
  await resetWorld();
  const locations = await seedVenue(12, 60);
  const { teams, players } = await setupTeams(3);
  crews = players;
  ids = teams.map((t) => t.id);
  // Round 1 waits for all three crews; round 2 takes one: the leader closes round 2 while the others are in round 1.
  await applyPlan(ids, locations, { counts: [3, 2, 1], advance: [3, 1, 1] });
  await call((await getAdmin()).client, "start_game");
});

describe("a later round filling first (F-02)", () => {
  it("knocks out the crews still in round 1 as out in round 1, and closes round 1 with round 2", async () => {
    await playRound(crews[0]!);
    await playRound(crews[0]!);
    const { data: rounds } = await service.from("rounds").select("number, closed_at").order("number");
    expect(rounds!.slice(0, 2).every((r) => r.closed_at)).toBe(true);
    expect(rounds![2]!.closed_at).toBeNull();
    const { data: teams } = await service.from("teams").select("id, status, eliminated_in_round");
    const out = teams!.filter((t) => t.id !== ids[0]);
    expect(out.every((t) => t.status === "eliminated" && t.eliminated_in_round === 1)).toBe(true);
    const { data } = await service.from("public_state").select("data").single();
    const pub = data!.data as { rounds: { number: number; closed: boolean }[] };
    expect(pub.rounds.find((r) => !r.closed)!.number).toBe(3);
  });
});

describe("join limit for a crowd on one address (F-01)", () => {
  it("allows 200 lookups and joins a minute from one address, and still stops a flood", async () => {
    const hits = [];
    for (let i = 0; i < 200; i++) hits.push(call(service, "team_preview", { p_code: "ZZZZZZ", p_ip: "203.0.113.9" }));
    const res = (await Promise.all(hits)) as { code?: string }[];
    expect(res.filter((r) => r.code === "RATE_LIMITED")).toHaveLength(0);
    const more = [];
    for (let i = 0; i < 420; i++) more.push(call(service, "team_preview", { p_code: "ZZZZZZ", p_ip: "203.0.113.9" }));
    const flood = (await Promise.all(more)) as { code?: string }[];
    expect(flood.filter((r) => r.code === "RATE_LIMITED").length).toBeGreaterThan(0);
  });
});

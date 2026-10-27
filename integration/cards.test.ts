// A new pyramid every game, same printed cards (P5 · T-506, D-033, migration 0017). Each place keeps one card
// (token + key) across games; New Game clears the course; the next course re-uses the cards and makes new ones
// only for places new to the venue; a card whose place sits out this game answers UNUSED_MARK with no alert;
// "Regenerate" gives every place a new card.
import { beforeAll, describe, expect, it } from "vitest";
import { generatePlan } from "@/lib/generator";
import { account, call, getAdmin, join, resetWorld, seedVenue, service, setupTeams, type Player } from "./harness";

type Card = { token: string; key: string; round: number | null; kind: string };
const admin = async () => (await getAdmin()).client;
let places: string[];
let teamId: string;
let first: Map<string, Card>;

async function course() {
  const { data } = await service.from("qr_codes").select("location_id, token, key, round, kind").not("location_id", "is", null);
  return new Map((data ?? []).map((q) => [q.location_id as string, q as Card]));
}
async function generate(locationIds: string[], seed: number) {
  const plan = generatePlan({ teamIds: [teamId], locationIds, seed, counts: [4, 3, 2, 1], advance: [1, 1, 1, 1] });
  return call<{ new_cards: number }>(await admin(), "apply_game_plan", { p_plan: plan });
}
const newGame = async (regenerate = false) =>
  call(await admin(), "start_new_game", { p_confirm: "NEW GAME", p_regenerate_qr: regenerate, p_keep_crews: true });

beforeAll(async () => {
  await resetWorld();
  places = await seedVenue(20, 60);
  const { teams } = await setupTeams(1);
  teamId = teams[0]!.id;
});

describe("cards belong to places", () => {
  it("the first course makes a card for every place it uses", async () => {
    const r = await generate(places.slice(0, 14), 1);
    first = await course();
    expect(r.new_cards).toBe(first.size);
  });

  it("New Game + Generate: a new pyramid, but every place already used keeps its exact card", async () => {
    await newGame();
    const r = await generate(places, 2);
    const next = await course();
    const kept = [...next].filter(([place]) => first.has(place));
    expect(kept.length).toBeGreaterThan(0);
    for (const [place, card] of kept) expect([card.token, card.key]).toEqual([first.get(place)!.token, first.get(place)!.key]);
    // Places new to the course got new cards; at least one kept card now belongs to another round or kind.
    expect(r.new_cards).toBe([...next.keys()].filter((p) => !first.has(p)).length);
    expect(kept.some(([place, card]) => card.round !== first.get(place)!.round || card.kind !== first.get(place)!.kind)).toBe(true);
  });
});

describe("a card whose place sits out this game", () => {
  let crew: Player[];

  beforeAll(async () => {
    // This game uses only the last 12 places, so some cards from the first course sit out.
    await newGame();
    await generate(places.slice(8), 3);
    const { data: team } = await service.from("teams").select("code").eq("id", teamId).single();
    crew = [];
    for (let i = 0; i < 4; i++) crew.push(await join(await account(4 + i), `Card ${i + 1}`, team!.code));
    await call(await admin(), "start_game");
  });

  it("answers UNUSED_MARK and raises no alert", async () => {
    const now = await course();
    const idle = [...first].find(([place]) => !now.has(place))!;
    const r = await call(crew[0]!.client, "scan_qr", { p_token: idle[1].token });
    expect(r).toMatchObject({ ok: false, code: "UNUSED_MARK" });
    const { count } = await service.from("alerts").select("*", { count: "exact", head: true });
    expect(count).toBe(0);
  });

  it("a made-up code is still BAD_QR", async () => {
    expect(await call(crew[0]!.client, "scan_qr", { p_token: "not-a-real-card" })).toMatchObject({ ok: false, code: "BAD_QR" });
  });
});

describe("Regenerate", () => {
  it("gives every place a new card and the universal QR a new code", async () => {
    const { data: cards } = await service.from("cards").select("location_id, token");
    const { data: u } = await service.from("qr_codes").select("token").eq("kind", "universal").single();
    await newGame(true);
    const { data: after } = await service.from("cards").select("location_id, token");
    const was = new Map(cards!.map((c) => [c.location_id, c.token]));
    expect(after!.length).toBe(cards!.length);
    expect(after!.every((c) => c.token !== was.get(c.location_id))).toBe(true);
    const { data: u2 } = await service.from("qr_codes").select("token").eq("kind", "universal").single();
    expect(u2!.token).not.toBe(u!.token);
  });

  it("clients can't read the cards table", async () => {
    const { data: team } = await service.from("teams").select("code").eq("id", teamId).single();
    const p = await join(await account(8), "Snoop", team!.code);
    const { data } = await p.client.from("cards").select("token").limit(1);
    expect(data ?? []).toEqual([]);
  });
});

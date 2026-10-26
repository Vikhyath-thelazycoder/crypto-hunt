// Clue sets per place (P5 · T-507, D-033, D-039): each place keeps up to 3 clues. Crews sharing a mark in one round
// get different clues, the next game draws the next clue at every place, players see only the pieces they solved,
// and only the admin reads or writes clue sets.
import { beforeAll, describe, expect, it } from "vitest";
import { generatePlan } from "@/lib/generator";
import {
  call,
  getAdmin,
  resetWorld,
  seedVenue,
  service,
  setupTeams,
  solveAll,
  status,
  type Player,
} from "./harness";

let crews: Player[][];
let ids: string[];
let locations: string[];
const admin = async () => (await getAdmin()).client;
const drawn = async () =>
  (await service.from("assignments").select("team_id, round, qr_id, clue_set, qr_codes(location_id)")).data! as unknown as {
    team_id: string;
    round: number;
    qr_id: string;
    clue_set: number | null;
    qr_codes: { location_id: string };
  }[];

beforeAll(async () => {
  await resetWorld();
  locations = await seedVenue(10, 40, { sets: 2 });
  const { teams, players } = await setupTeams(3);
  crews = players;
  ids = teams.map((t) => t.id);
  // 3 crews on 2 round-1 marks: one mark carries two crews (D-039).
  const plan = generatePlan({ teamIds: ids, locationIds: locations, seed: 11, counts: [2, 1], advance: [3, 3] });
  await call(await admin(), "apply_game_plan", { p_plan: plan });
});

describe("drawing a clue set (T-507)", () => {
  it("every route gets a set, and crews sharing a mark get different sets", async () => {
    const rows = await drawn();
    expect(rows.every((r) => r.clue_set === 1 || r.clue_set === 2)).toBe(true);
    const r1 = rows.filter((r) => r.round === 1);
    const byMark = new Map<string, number[]>();
    for (const r of r1) byMark.set(r.qr_id, [...(byMark.get(r.qr_id) ?? []), r.clue_set!]);
    const shared = [...byMark.values()].find((v) => v.length === 2)!;
    expect(new Set(shared).size).toBe(2);
  });

  it("a player sees the pieces of the set drawn for their crew", async () => {
    const rows = await drawn();
    const crew = crews.find((c) => rows.some((r) => r.team_id === c[0]!.teamId && r.round === 1 && r.clue_set === 2))!;
    await call(await admin(), "start_game");
    await solveAll(crew);
    const s = await status(crew[0]!);
    expect(s.pieces.map((p) => p.text)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^spot\d+-s2-a$/), expect.stringMatching(/^spot\d+-s2-d$/)]),
    );
  });

  it("re-pointing a crew draws a set at its new mark", async () => {
    const rows = await drawn();
    const mine = rows.find((r) => r.team_id === ids[0] && r.round === 2)!;
    const other = (await service.from("qr_codes").select("id").eq("round", 1).neq("id", rows.find((r) => r.team_id === ids[0] && r.round === 1)!.qr_id))
      .data![0]!.id;
    await service.from("assignments").update({ qr_id: other }).eq("team_id", ids[0]!).eq("round", 2);
    const after = (await drawn()).find((r) => r.team_id === ids[0] && r.round === 2)!;
    expect(after.clue_set).not.toBeNull();
    await service.from("assignments").update({ qr_id: mine.qr_id }).eq("team_id", ids[0]!).eq("round", 2);
  });
});

describe("the next game draws the next set (D-033)", () => {
  it("a crew alone at a mark gets set 1 in game 1 and set 2 in game 2", async () => {
    const solo = (rows: Awaited<ReturnType<typeof drawn>>) =>
      rows.filter((r) => rows.filter((x) => x.qr_id === r.qr_id && x.round === r.round).length === 1);
    expect(solo(await drawn()).every((r) => r.clue_set === 1)).toBe(true);

    await call(await admin(), "start_new_game", { p_confirm: "NEW GAME", p_regenerate_qr: false });
    // New Game keeps the crews (D-020); each now starts alone on its own round-1 mark.
    const plan = generatePlan({ teamIds: ids, locationIds: locations, seed: 12, counts: [3, 1], advance: [3, 3] });
    await call(await admin(), "apply_game_plan", { p_plan: plan });
    const next = solo(await drawn());
    expect(next.length).toBeGreaterThan(0);
    expect(next.every((r) => r.clue_set === 2)).toBe(true);
  });
});

describe("who can touch clue sets", () => {
  it("players and anonymous callers can't read or write them; the admin can", async () => {
    const p = crews[0]![0]!.client;
    expect((await p.from("clue_sets").select("pieces")).data ?? []).toHaveLength(0);
    const ins = await p.from("clue_sets").insert({ location_id: locations[0], set_no: 3, pieces: ["a", "b", "c", "d"] }).select("set_no");
    expect(ins.error ?? (ins.data?.length === 0 ? "none" : null)).toBeTruthy();
    const mine = await (await admin()).from("clue_sets").select("set_no").eq("location_id", locations[0]!);
    expect(mine.data).toHaveLength(2);
  });
});

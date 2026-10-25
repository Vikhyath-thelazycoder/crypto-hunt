// Shared round-1 QRs (P5 · T-508, D-039): with more crews than round-1 QRs, crews share a mark. The server
// accepts an even spread and refuses a lopsided one, each crew still sees only its own clue there, both crews
// check in at the same card, and a crew not routed to it is still turned away.
import { beforeAll, describe, expect, it } from "vitest";
import { generatePlan, type Plan } from "@/lib/generator";
import {
  call,
  checkInAll,
  getAdmin,
  qrFor,
  raises,
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
let plan: Plan;
const admin = async () => (await getAdmin()).client;

beforeAll(async () => {
  await resetWorld();
  locations = await seedVenue(10, 40);
  const { teams, players } = await setupTeams(3);
  crews = players;
  ids = teams.map((t) => t.id);
  // 3 crews on 2 round-1 marks: one mark carries two crews.
  plan = generatePlan({ teamIds: ids, locationIds: locations, seed: 11, counts: [2, 1], advance: [3, 3] });
});

describe("apply_game_plan with shared round-1 marks", () => {
  it("refuses a plan that piles every crew onto one round-1 mark", async () => {
    const r1 = plan.qrs.find((q) => q.round === 1)!.ref;
    const final = plan.qrs.find((q) => q.kind === "final")!.ref;
    const lopsided: Plan = {
      ...plan,
      assignments: plan.assignments.map((a) => ({ ...a, qr: a.round === 1 ? r1 : final })),
    };
    expect(await raises(await admin(), "apply_game_plan", { p_plan: lopsided })).toMatch(/too many teams start on one QR/);
  });

  it("accepts the even spread: no round-1 mark has more than two crews", async () => {
    await call(await admin(), "apply_game_plan", { p_plan: plan });
    const { data } = await service.from("assignments").select("qr_id").eq("round", 1);
    const per = new Map<string, number>();
    for (const a of data!) per.set(a.qr_id, (per.get(a.qr_id) ?? 0) + 1);
    expect([...per.values()].sort()).toEqual([1, 2]);
  });
});

describe("playing a shared mark", () => {
  let pair: [Player[], Player[]];
  let alone: Player[];

  beforeAll(async () => {
    await call(await admin(), "start_game");
    const marks = await Promise.all(crews.map(async (c) => (await qrFor(c[0]!.teamId, 1)).id));
    const shared = marks.find((m, i) => marks.indexOf(m) !== i)!;
    const together = crews.filter((_, i) => marks[i] === shared);
    pair = [together[0]!, together[1]!];
    alone = crews.find((_, i) => marks[i] !== shared)!;
  });

  it("each crew sees only its own clue pieces at the shared mark", async () => {
    await solveAll(pair[0]);
    const mine = await status(pair[0][0]!);
    const theirs = await status(pair[1][0]!);
    expect(mine.pieces.every((p) => p.solved && p.text)).toBe(true);
    expect(theirs.pieces.some((p) => p.solved || p.text)).toBe(false);
  });

  it("a crew routed elsewhere is turned away from the shared mark", async () => {
    const card = await qrFor(pair[0][0]!.teamId, 1);
    await solveAll(alone);
    const r = await call(alone[0]!.client, "scan_qr", { p_token: card.token });
    expect(r).toMatchObject({ ok: false, code: "NOT_YOURS" });
  });

  it("both crews check in at the same card and move on", async () => {
    await solveAll(pair[1]);
    await checkInAll(pair[0]);
    await checkInAll(pair[1]);
    for (const c of pair) expect((await status(c[0]!)).round?.number).toBe(2);
  });
});

describe("routing at Start after New Game (_assign_paths)", () => {
  it("shares the least-used round-1 marks instead of refusing", async () => {
    await resetWorld();
    const locs = await seedVenue(10, 40);
    const { teams } = await setupTeams(3, { firstAccount: 12 });
    const teamIds = teams.map((t) => t.id);
    await call(await admin(), "apply_game_plan", {
      p_plan: generatePlan({ teamIds, locationIds: locs, seed: 5, counts: [2, 1], advance: [3, 3] }),
    });
    // As after New Game: the course stays, the crews have no routes yet.
    await service.from("assignments").delete().in("team_id", teamIds);
    await call(await admin(), "start_game");
    const { data } = await service.from("assignments").select("team_id, qr_id").eq("round", 1);
    expect(data).toHaveLength(3);
    const per = new Map<string, number>();
    for (const a of data!) per.set(a.qr_id, (per.get(a.qr_id) ?? 0) + 1);
    expect([...per.values()].sort()).toEqual([1, 2]);
  });
});

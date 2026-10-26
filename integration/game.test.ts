// A full hunt on the real database: 3 crews, 4 rounds (5 → 3 → 2 → 1 QRs), X = 3, 2, 2, 2.
// Covers the scan resolution table, the round lock (D-025), hints and penalties, pause, instant
// elimination, the final seal code (D-026), the podium and New Game.
import { beforeAll, describe, expect, it } from "vitest";
import {
  account,
  anon,
  alerts,
  applyPlan,
  call,
  checkInAll,
  getAdmin,
  join,
  playRound,
  qrByLabel,
  qrFor,
  raises,
  resetWorld,
  seedVenue,
  service,
  setupTeams,
  solveAll,
  status,
  universalToken,
  type Player,
} from "./harness";

let A: Player[];
let B: Player[];
let C: Player[];
let ids: string[];
let codes: string[];
const admin = async () => (await getAdmin()).client;

async function otherQr(round: number, notTeam: string) {
  const own = await qrFor(notTeam, round);
  const { data } = await service
    .from("qr_codes")
    .select("id, token, key, label")
    .eq("round", round)
    .neq("id", own.id)
    .limit(1)
    .single();
  return data!;
}

beforeAll(async () => {
  await resetWorld();
  const locations = await seedVenue(20, 80);
  const { teams, players } = await setupTeams(3);
  [A, B, C] = players as [Player[], Player[], Player[]];
  ids = teams.map((t) => t.id);
  codes = teams.map((t) => t.code);
  await applyPlan(ids, locations, { counts: [5, 3, 2, 1], advance: [3, 2, 2, 2] });
});

describe("start", () => {
  it("won't start without enough questions, then starts", async () => {
    await service.from("questions").update({ is_enabled: false }).gt("difficulty", 0);
    expect(await raises(await admin(), "start_game")).toBe("NOT_ENOUGH_QUESTIONS");
    await service.from("questions").update({ is_enabled: true }).gt("difficulty", 0);
    await call(await admin(), "start_game");
    const { data } = await service.from("public_state").select("data").single();
    expect(data!.data.status).toBe("RUNNING");
    expect(data!.data.universal_token).toBe(await universalToken());
  });

  it("round 1 questions stay hidden until the member scans the universal QR", async () => {
    const s = await status(A[0]!);
    expect(s.phase).toBe("SOLVING");
    expect(s.task!.opened).toBe(false);
    expect(s.task!.text).toBeNull();
    expect((await call(A[0]!.client, "submit_answer", { p_task_id: s.task!.id, p_answer: "x" })).code).toBe(
      "NOT_OPEN",
    );
    expect((await call(A[0]!.client, "scan_qr", { p_token: await universalToken() })).result).toBe(
      "QUESTION",
    );
    expect((await status(A[0]!)).task!.text).toMatch(/^Question \d+\?$/);
  });
});

describe("round lock (D-025)", () => {
  it("a later round's QR is sealed the same way whether or not it's on the team's path", async () => {
    const own3 = await qrFor(ids[0]!, 3);
    const other2 = await otherQr(2, ids[0]!);
    const final = await qrByLabel("F-01");
    const p = A[1]!;
    const results = [];
    for (const qr of [own3, other2, final])
      results.push(await call(p.client, "scan_qr", { p_token: qr.token }));
    for (const r of results) expect(r).toEqual({ ok: false, code: "LOCKED_MARK", round: 1 });
  });

  it("alerts the admin on every locked scan, flags the team's own future mark, and a sweep at 3", async () => {
    const locked = (await alerts("locked_scan")).filter((a) => a.team_id === ids[0]);
    expect(locked).toHaveLength(3);
    expect(locked.map((a) => a.data.own_future)).toEqual([true, false, true]);
    expect((await alerts("possible_sweep")).filter((a) => a.team_id === ids[0])).toHaveLength(1);
  });

  it("refuses the correct printed key of a later-round QR and alerts", async () => {
    const own3 = await qrFor(ids[0]!, 3);
    const r = await call(A[1]!.client, "submit_key", { p_token: own3.token, p_key: own3.key });
    expect(r).toEqual({ ok: false, code: "LOCKED_MARK", round: 1 });
    expect((await alerts("locked_key")).some((a) => a.team_id === ids[0] && a.data.own_future === true)).toBe(
      true,
    );
  });

  it("stores nothing for a locked scan: no ticket, no check-in", async () => {
    const { data: tickets } = await service.from("scan_tickets").select("*").eq("player_id", A[1]!.playerId);
    const { data: checkins } = await service.from("checkins").select("*").eq("player_id", A[1]!.playerId);
    expect(tickets).toEqual([]);
    expect(checkins).toEqual([]);
  });
});

describe("the rest of the scan table", () => {
  it("own mark before solving → SOLVE_FIRST; key without a scan → NOT_SCANNED", async () => {
    const own1 = await qrFor(ids[0]!, 1);
    expect((await call(A[2]!.client, "scan_qr", { p_token: own1.token })).code).toBe("SOLVE_FIRST");
    expect((await call(A[2]!.client, "submit_key", { p_token: own1.token, p_key: own1.key })).code).toBe(
      "NOT_SCANNED",
    );
  });

  it("another crew's current mark and a spare are NOT_YOURS, with an alert naming the owners", async () => {
    const theirs = await qrFor(ids[1]!, 1);
    expect((await call(A[2]!.client, "scan_qr", { p_token: theirs.token })).code).toBe("NOT_YOURS");
    const { data: spare } = await service
      .from("qr_codes")
      .select("token")
      .eq("round", 1)
      .eq("is_spare", true)
      .limit(1)
      .single();
    expect((await call(A[2]!.client, "scan_qr", { p_token: spare!.token })).code).toBe("NOT_YOURS");
    const wrong = (await alerts("wrong_team")).filter((a) => a.team_id === ids[0]);
    expect(wrong[0]!.data.owners).toHaveLength(1);
    expect(wrong[1]!.data.spare).toBe(true);
  });

  it("a prank shows a fake key and alerts; an unknown token is BAD_QR", async () => {
    const r = await call(A[2]!.client, "scan_qr", { p_token: (await qrByLabel("P-01")).token });
    expect(r.result).toBe("PRANK");
    expect(r.fake_key).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect((await alerts("prank")).length).toBeGreaterThan(0);
    expect((await call(A[2]!.client, "scan_qr", { p_token: "not-a-token" })).code).toBe("BAD_QR");
  });
});

describe("solving and checking in", () => {
  it("matches answers ignoring case, spaces and accents, and accepts alternatives", async () => {
    const p = A[2]!;
    await call(p.client, "scan_qr", { p_token: await universalToken() });
    const task = (await status(p)).task!;
    const { data } = await service
      .from("tasks")
      .select("questions(answer, alternatives)")
      .eq("id", task.id)
      .single();
    const q = data!.questions as unknown as { answer: string; alternatives: string[] };
    expect((await call(p.client, "submit_answer", { p_task_id: task.id, p_answer: "wrong" })).correct).toBe(
      false,
    );
    const messy = `  ${q.answer.toUpperCase().replace(" ", "   ")} `;
    expect((await call(p.client, "submit_answer", { p_task_id: task.id, p_answer: messy })).correct).toBe(
      true,
    );
  });

  it("all four pieces reveal the clue and the map region, never the exact pin", async () => {
    await solveAll(A);
    const s = await status(A[0]!);
    expect(s.phase).toBe("SEEKING");
    expect(s.pieces.map((x) => x.text)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^spot\d+-a$/)]),
    );
    const { data } = await service
      .from("assignments")
      .select("qr_codes(locations(map_x, map_y))")
      .eq("team_id", ids[0]!)
      .eq("round", 1)
      .single();
    const pin = (data!.qr_codes as unknown as { locations: { map_x: number; map_y: number } }).locations;
    expect(s.region).not.toBeNull();
    expect(Math.abs(s.region!.x - pin.map_x) + Math.abs(s.region!.y - pin.map_y)).toBeGreaterThan(0);
    expect(s.region!.r).toBeGreaterThan(0);
    expect((await status(A[0]!)).region).toEqual(s.region); // stable between refreshes
  });

  it("a wrong key is BAD_KEY; the round completes only when all four are in", async () => {
    const qr = await qrFor(ids[0]!, 1);
    await call(A[0]!.client, "scan_qr", { p_token: qr.token });
    expect((await call(A[0]!.client, "submit_key", { p_token: qr.token, p_key: "AAAAAA" })).code).toBe(
      "BAD_KEY",
    );
    const last = await checkInAll(A);
    expect(last.phase).toBe("COMPLETED");
    const s = await status(A[0]!);
    expect(s.round!.number).toBe(2);
    expect(s.phase).toBe("SOLVING");
    expect(s.task!.opened).toBe(true); // rounds after 1 open at once
  });

  it("the early locked scan of round 3 never counts later", async () => {
    const { data } = await service
      .from("checkins")
      .select("*")
      .eq("player_id", A[1]!.playerId)
      .eq("round", 3);
    expect(data).toEqual([]);
  });
});

describe("what a phone sees (P3 screens)", () => {
  it("my_status carries the crew code, the question's difficulty, and who holds each piece", async () => {
    const s = (await status(B[1]!)) as unknown as {
      team: { code: string };
      task: { difficulty: number; piece_index: number };
      pieces: { index: number; by: string | null; mine: boolean; hint: boolean }[];
    };
    expect(s.team.code).toBe(codes[1]);
    expect(s.task.difficulty).toBeGreaterThanOrEqual(1);
    const mine = s.pieces.filter((p) => p.mine);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.index).toBe(s.task.piece_index);
    expect(s.pieces.every((p) => typeof p.by === "string" && p.hint === false)).toBe(true);
  });
});

describe("hints and penalty (D-013), pause", () => {
  it("hints are off until the admin enables them; each adds 1 minute (D-041)", async () => {
    const p = B[0]!;
    await call(p.client, "scan_qr", { p_token: await universalToken() });
    const task = (await status(p)).task!;
    expect((await call(p.client, "use_hint", { p_task_id: task.id })).code).toBe("HINTS_OFF");
    await call(await admin(), "set_hints", { p_enabled: true });
    const r = await call(p.client, "use_hint", { p_task_id: task.id });
    expect(r.hint).toBe("starts with A");
    expect(r.penalty_ms).toBe(60000);
    expect((await call(p.client, "use_hint", { p_task_id: task.id })).code).toBe("ALREADY_USED");
  });

  it("the penalty is served after check-in; the round counts only when it runs out", async () => {
    const last = await playRound(B);
    expect(last.phase).toBe("PENALTY");
    expect((await call(B[0]!.client, "complete_round")).code).toBe("PENALTY_RUNNING");
    await service
      .from("team_state")
      .update({ penalty_until: new Date(Date.now() - 1000).toISOString() })
      .eq("team_id", ids[1]!);
    const done = await call(B[0]!.client, "complete_round");
    expect(done.round).toBe(2);
  });

  it("pause blocks every player action and freezes penalties", async () => {
    await call(await admin(), "pause_game");
    expect((await call(C[0]!.client, "scan_qr", { p_token: await universalToken() })).code).toBe("PAUSED");
    await call(await admin(), "resume_game");
    expect((await call(C[0]!.client, "scan_qr", { p_token: await universalToken() })).result).toBe(
      "QUESTION",
    );
  });
});

describe("instant elimination (D-012)", () => {
  it("round 1 stays open with X = 3 until the third crew completes", async () => {
    await playRound(C);
    expect((await status(C[0]!)).round!.number).toBe(2);
  });

  it("when 2 crews complete round 2 the third is eliminated at once", async () => {
    await playRound(A);
    await playRound(B);
    const c = await status(C[0]!);
    expect(c.team.status).toBe("eliminated");
    expect(c.phase).toBe("ELIMINATED");
    expect((await call(C[0]!.client, "set_eliminated_view", { p_view: "spectator" })).ok).toBe(true);
    const { data } = await service
      .from("round_results")
      .select("team_id, completion_order")
      .eq("round", 2)
      .order("completion_order");
    expect(data!.map((r) => r.team_id)).toEqual([ids[0], ids[1]]);
  });

  it("round 3", async () => {
    await playRound(A);
    await playRound(B);
    expect((await status(A[0]!)).round).toMatchObject({ number: 4, is_final: true });
  });
});

describe("final mark (D-026)", () => {
  // Rounds 1–3 ran within seconds; at the venue they're minutes apart. Let the 5-keys-per-minute window pass.
  beforeAll(async () => {
    await service.from("rate_limits").delete().not("subject", "is", null);
  });

  it("the seal code appears only after the final clue is solved, and differs per crew", async () => {
    expect((await status(A[0]!)).seal_code).toBeNull();
    await solveAll(A);
    await solveAll(B);
    const a = (await status(A[0]!)).seal_code;
    const b = (await status(B[0]!)).seal_code;
    expect(a).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(b).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(a).not.toBe(b);
  });

  it("asks for key and seal; the printed key alone or another crew's code is refused", async () => {
    const final = await qrByLabel("F-01");
    const p = A[0]!;
    expect((await call(p.client, "scan_qr", { p_token: final.token })).result).toBe("ASK_KEY_AND_SEAL");
    expect((await call(p.client, "submit_key", { p_token: final.token, p_key: final.key })).code).toBe(
      "BAD_SEAL",
    );
    const bCode = (await status(B[0]!)).seal_code;
    expect(
      (await call(p.client, "submit_key", { p_token: final.token, p_key: final.key, p_seal_code: bCode }))
        .code,
    ).toBe("BAD_SEAL");
    expect((await alerts("foreign_seal")).some((x) => x.team_id === ids[0])).toBe(true);
  });

  it("the first two crews to seal the final take 1st and 2nd, then the game ends", async () => {
    const last = await checkInAll(A);
    expect(last.phase).toBe("COMPLETED");
    const a = await status(A[0]!);
    expect(a.team).toMatchObject({ status: "finished", final_rank: 1 });
    expect(a.team.completion_key).toMatch(/^[A-HJ-NP-Z2-9]{9}$/);
    await checkInAll(B);
    expect((await status(B[0]!)).team.final_rank).toBe(2);
    const { data } = await service.from("games").select("status").single();
    expect(data!.status).toBe("FINISHED");
  });

  it("every phone's public state says the hunt is over, with the winners first (D-040)", async () => {
    const { data } = await anon().from("public_state").select("data").single();
    const pub = data!.data as { status: string; finished_at: string | null; teams: { id: string; final_rank: number | null }[] };
    expect(pub.status).toBe("FINISHED");
    expect(pub.finished_at).toBeTruthy();
    expect(pub.teams.slice(0, 2).map((t) => [t.id, t.final_rank])).toEqual([
      [ids[0], 1],
      [ids[1], 2],
    ]);
  });

  it("the admin can export the results", async () => {
    const r = await call<{ teams: { name: string; final_rank: number | null }[] }>(
      await admin(),
      "export_results",
    );
    expect(r.teams.filter((t) => t.final_rank).map((t) => t.final_rank)).toEqual([1, 2]);
  });
});

describe("new game (D-020, D-033)", () => {
  it("needs the typed confirmation", async () => {
    expect(
      await raises(await admin(), "start_new_game", { p_confirm: "new game", p_regenerate_qr: false }),
    ).toBe("CONFIRM_REQUIRED");
  });

  it("logs everyone out, regenerates team codes and clears the course for a fresh pyramid (D-033)", async () => {
    await call(await admin(), "start_new_game", { p_confirm: "NEW GAME", p_regenerate_qr: false });
    expect(await raises(A[0]!.client, "my_status")).toBe("NOT_REGISTERED");
    const { data: teams } = await service.from("teams").select("code, status");
    expect(teams!.map((t) => t.code).sort()).not.toEqual([...codes].sort());
    expect(teams!.every((t) => t.status === "forming")).toBe(true);
    const { count } = await service.from("events").select("*", { count: "exact", head: true });
    expect(count).toBe(0);
    const { count: marks } = await service.from("qr_codes").select("*", { count: "exact", head: true }).neq("kind", "universal");
    expect(marks).toBe(0);
    expect(await raises(await admin(), "start_game")).toBe("NO_PLAN");
  });

  it("D-046: the Crews count is the total (27 → 27 adds nothing), and New Game can start from zero crews", async () => {
    const count = async () => (await service.from("teams").select("*", { count: "exact", head: true })).count;
    const have = (await count())!;
    expect(await call(await admin(), "set_team_count", { p_count: have + 2 })).toMatchObject({ before: have, after: have + 2 });
    expect(await call(await admin(), "set_team_count", { p_count: have + 2 })).toMatchObject({ after: have + 2 });
    expect(await call(await admin(), "set_team_count", { p_count: have })).toMatchObject({ after: have });
    await call(await admin(), "start_new_game", { p_confirm: "NEW GAME", p_regenerate_qr: false, p_keep_crews: false });
    expect(await count()).toBe(0);
    expect((await service.from("games").select("status").single()).data!.status).toBe("SETUP");
    expect(await call(await admin(), "set_team_count", { p_count: 27 })).toMatchObject({ before: 0, after: 27 });
    const { data: nums } = await service.from("teams").select("number").order("number");
    expect(nums!.map((t) => t.number)).toEqual(Array.from({ length: 27 }, (_, i) => i + 1));
  });

  it("D-046: crews that players have joined are never removed by the count", async () => {
    const { data: t } = await service.from("teams").select("id, code").order("number").limit(1).single();
    await join(await account(30), "Kept Player", t!.code);
    expect(await raises(await admin(), "set_team_count", { p_count: 0 })).toBe("CREWS_HAVE_PLAYERS");
    expect(await call(await admin(), "set_team_count", { p_count: 1 })).toMatchObject({ after: 1 });
    const { data: left } = await service.from("teams").select("id");
    expect(left!.map((x) => x.id)).toEqual([t!.id]);
  });
});

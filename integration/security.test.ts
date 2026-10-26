// SECURITY.md threats T1–T12 as negative tests against the real database.
import { beforeAll, describe, expect, it } from "vitest";
import { generatePlan, type Plan } from "@/lib/generator";
import {
  account,
  alerts,
  anon,
  applyPlan,
  call,
  getAdmin,
  playRound,
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

let crews: Player[][];
let teamIds: string[];
let locationIds: string[];
let codes: string[];

beforeAll(async () => {
  await resetWorld();
  locationIds = await seedVenue(20, 60);
  const { teams, players } = await setupTeams(2);
  crews = players;
  teamIds = teams.map((t) => t.id);
  codes = teams.map((t) => t.code);
});

describe("plan validation (T12)", () => {
  it("rejects a forged plan that sends a team straight to the final", async () => {
    const plan = generatePlan({ teamIds, locationIds, seed: 1 });
    const forged: Plan = {
      ...plan,
      assignments: plan.assignments.map((a) =>
        a.team_id === teamIds[0] && a.round === 2 ? { ...a, qr: "F-01" } : a,
      ),
    };
    const admin = await getAdmin();
    expect(await raises(admin.client, "apply_game_plan", { p_plan: forged })).toMatch(/^BAD_PLAN/);
  });

  it("rejects a plan that reuses one location twice", async () => {
    const plan = generatePlan({ teamIds, locationIds, seed: 1 });
    const forged: Plan = {
      ...plan,
      qrs: plan.qrs.map((q, i) => (i === 1 ? { ...q, location_id: plan.qrs[0]!.location_id } : q)),
    };
    expect(await raises((await getAdmin()).client, "apply_game_plan", { p_plan: forged })).toMatch(
      /share one location/,
    );
  });

  it("accepts the generated plan and starts", async () => {
    await applyPlan(teamIds, locationIds);
    await call((await getAdmin()).client, "start_game");
    const { data } = await service.from("games").select("status").single();
    expect(data!.status).toBe("RUNNING");
  });
});

describe("players read nothing secret (T1)", () => {
  const secretTables = [
    "questions",
    "qr_codes",
    "qr_links",
    "assignments",
    "locations",
    "teams",
    "players",
    "tasks",
    "checkins",
    "scan_tickets",
    "games",
    "events",
    "alerts",
    "admin_audit",
    "rounds",
    "round_results",
    "rate_limits",
    "admins",
  ];

  it.each(secretTables)("%s returns no rows to a player", async (table) => {
    const { data } = await crews[0]![0]!.client.from(table).select("*");
    expect(data ?? []).toEqual([]);
  });

  it("team_state shows only the player's own team", async () => {
    const { data } = await crews[0]![0]!.client.from("team_state").select("team_id");
    expect(data).toEqual([{ team_id: teamIds[0] }]);
  });

  it("anyone can read the public state, which holds no codes, keys or places", async () => {
    const { data } = await anon().from("public_state").select("data").single();
    const text = JSON.stringify(data);
    expect(text).toContain("RUNNING");
    for (const code of codes) expect(text).not.toContain(code);
    const { data: qrs } = await service.from("qr_codes").select("token, key").neq("kind", "universal");
    for (const q of qrs!) {
      expect(text).not.toContain(q.token);
      expect(text).not.toContain(`"${q.key}"`);
    }
    expect(text).not.toMatch(/Spot \d|spot\d+-/);
  });

  it("my_status never carries an answer, a QR token or key, or another team's clue", async () => {
    const p = crews[0]![0]!;
    await call(p.client, "scan_qr", { p_token: await universalToken() });
    const text = JSON.stringify(await status(p));
    expect(text).not.toMatch(/Ans \d|answer\d/);
    const { data: qrs } = await service.from("qr_codes").select("token, key");
    for (const q of qrs!) expect(text).not.toContain(q.token);
    expect(text).not.toContain(codes[1]!);
  });

  it("players cannot write game tables directly", async () => {
    const p = crews[0]![0]!;
    const ins = await p.client
      .from("round_results")
      .insert({ team_id: teamIds[0], round: 1, completion_order: 1 });
    expect(ins.error).not.toBeNull();
    await p.client.from("team_state").update({ round: 4 }).eq("team_id", teamIds[0]!);
    const { data } = await service.from("team_state").select("round").eq("team_id", teamIds[0]!).single();
    expect(data!.round).toBe(1);
    const q = await p.client
      .from("questions")
      .insert({ text: "x?x", format: "text", answer: "a", difficulty: 1 });
    expect(q.error).not.toBeNull();
  });
});

describe("authentication and authorization (T2, T10, T11)", () => {
  it("an anonymous caller can't scan or call player RPCs", async () => {
    const { error } = await anon().rpc("scan_qr", { p_token: "x" });
    expect(error).not.toBeNull();
  });

  it("a signed-in account that never joined is NOT_REGISTERED", async () => {
    const stranger = await account(20);
    expect(await raises(stranger.client, "my_status")).toBe("NOT_REGISTERED");
  });

  it.each([
    ["create_teams", { p_count: 1 }],
    ["start_game", {}],
    ["pause_game", {}],
    ["end_game", { p_reason: "x" }],
    ["set_hints", { p_enabled: true }],
    ["export_results", {}],
    ["start_new_game", { p_confirm: "NEW GAME", p_regenerate_qr: false }],
    ["set_team_count", { p_count: 0 }],
    ["force_complete", { p_team: "00000000-0000-0000-0000-000000000000", p_reason: "cheat" }],
  ])("%s as a player → NOT_ADMIN", async (fn, args) => {
    expect(await raises(crews[0]![0]!.client, fn, args)).toBe("NOT_ADMIN");
  });

  it("join functions are not callable by players", async () => {
    const { error } = await crews[0]![0]!.client.rpc("join_commit", {
      p_user_id: crews[0]![0]!.userId,
      p_name: "x y",
      p_code: codes[0],
    });
    expect(error).not.toBeNull();
  });

  // Regression: Supabase's default privileges once made every helper callable by clients.
  it.each([
    ["_complete_round", { p_team: "00000000-0000-0000-0000-000000000000" }],
    ["_eliminate", { p_team: "00000000-0000-0000-0000-000000000000", p_round: 1 }],
    ["_refresh_public", {}],
    ["_random_code", { p_len: 6 }],
    ["join_preflight", { p_name: "x y", p_code: "AAAAAA", p_ip: "x" }],
  ])("internal %s is not callable by players or anonymous callers", async (fn, args) => {
    for (const client of [crews[0]![0]!.client, anon()]) {
      const { error } = await client.rpc(fn, args);
      expect(error?.message ?? "").toMatch(/permission denied|Could not find/);
    }
  });

  it("a 5th member is refused (TEAM_FULL) and a wrong code is BAD_CODE", async () => {
    const fifth = await account(21);
    const full = await call(service, "join_preflight", { p_name: "Fifth Mate", p_code: codes[0], p_ip: "t" });
    expect(full.code).toBe("REGISTRATION_CLOSED"); // registration closes at Start
    await service.from("games").update({ registration_open: true }).eq("id", 1);
    expect(
      (
        await call(service, "join_commit", {
          p_user_id: fifth.userId,
          p_name: "Fifth Mate",
          p_code: codes[0],
        })
      ).code,
    ).toBe("TEAM_FULL");
    expect(
      (await call(service, "join_preflight", { p_name: "Fifth Mate", p_code: "ZZZZZZ", p_ip: "t" })).code,
    ).toBe("BAD_CODE");
    await service.from("games").update({ registration_open: false }).eq("id", 1);
  });
});

describe("brute force (T5, T6)", () => {
  it("the 11th answer in a minute is RATE_LIMITED and alerts the admin", async () => {
    const p = crews[1]![0]!;
    await call(p.client, "scan_qr", { p_token: await universalToken() });
    const task = (await status(p)).task!;
    for (let i = 0; i < 10; i++) {
      const r = await call(p.client, "submit_answer", { p_task_id: task.id, p_answer: `guess ${i}` });
      expect(r.correct).toBe(false);
      // D-041: typed answers too — every 3rd miss adds a minute to the crew's penalty.
      expect(r).toMatchObject({ strikes: (i + 1) % 3, penalized: (i + 1) % 3 === 0 });
    }
    expect(
      (await service.from("team_state").select("penalty_ms").eq("team_id", p.teamId).single()).data!
        .penalty_ms,
    ).toBe(180000);
    expect((await call(p.client, "submit_answer", { p_task_id: task.id, p_answer: "guess" })).code).toBe(
      "RATE_LIMITED",
    );
    expect((await alerts("answer_spam")).some((a) => a.player_id === p.playerId)).toBe(true);
  });

  it("the 6th key try in a minute is RATE_LIMITED and alerts the admin", async () => {
    const p = crews[1]![1]!;
    for (let i = 0; i < 5; i++) await call(p.client, "submit_key", { p_token: "nope", p_key: "AAAAAA" });
    expect((await call(p.client, "submit_key", { p_token: "nope", p_key: "AAAAAA" })).code).toBe(
      "RATE_LIMITED",
    );
    expect((await alerts("key_spam")).some((a) => a.player_id === p.playerId)).toBe(true);
  });
});

describe("check-in is per member (T7) and X closes rounds (T9)", () => {
  it("one member checking in twice counts once", async () => {
    const crew = crews[0]!;
    await solveAll(crew);
    const qr = await qrFor(teamIds[0]!, 1);
    const p = crew[0]!;
    await call(p.client, "scan_qr", { p_token: qr.token });
    expect((await call(p.client, "submit_key", { p_token: qr.token, p_key: qr.key })).team_count).toBe(1);
    expect((await call(p.client, "scan_qr", { p_token: qr.token })).code).toBe("ALREADY_CHECKED_IN");
    expect((await call(p.client, "submit_key", { p_token: qr.token, p_key: qr.key })).code).toBe(
      "NOT_SCANNED",
    );
    expect((await status(p)).phase).toBe("CHECKING_IN");
  });

  it("lowering X to the completions so far closes the round and eliminates the rest instantly", async () => {
    await playRound(crews[0]!); // remaining members check in → team 1 completes round 1
    expect((await status(crews[0]![0]!)).round!.number).toBe(2);
    await call((await getAdmin()).client, "set_advance_count", { p_round: 1, p_x: 1 });
    const loser = await status(crews[1]![0]!);
    expect(loser.team.status).toBe("eliminated");
    expect((await call(crews[1]![0]!.client, "scan_qr", { p_token: "x" })).code).toBe("ELIMINATED");
    expect(await raises((await getAdmin()).client, "set_advance_count", { p_round: 1, p_x: 2 })).toBe(
      "ROUND_CLOSED",
    );
  });
});

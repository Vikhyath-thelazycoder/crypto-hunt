import { describe, expect, it } from "vitest";
import { generatePlan } from "@/lib/generator";
import { toAdminError } from "./api";
import { courseChecks, courseFromDb, layoutPyramid, pathOf, sparesOf, VIEW } from "./course";
import { csvCell, exportCsv, toCsv } from "./csv";
import { placeLine, placeTag } from "./place";
import {
  cardFor,
  cards,
  closesNow,
  focusRound,
  hms,
  huntClock,
  penaltyLeft,
  sortTeams,
  stamp,
  startBlocker,
  STUCK_MS,
  stuckFor,
} from "./dashboard";
import { describeAlert, describeLog, kindSummary } from "./describe";
import { iso, member, snapshot, team, T0 } from "./fixtures";
import { adminGate, safeNext } from "./gate";
import { adminMessage } from "./messages";
import type { LogEntry } from "./types";

describe("login gate (T-401)", () => {
  it("sends the signed-out to the login page and a non-admin to login with a notice", () => {
    expect(adminGate(null, false)).toBe("/admin/login");
    expect(adminGate({ id: "u" }, false)).toBe("/admin/login?denied=1");
    expect(adminGate({ id: "u" }, true)).toBeNull();
  });
  it("only returns to /admin pages after signing in", () => {
    expect(safeNext("/admin/generator")).toBe("/admin/generator");
    expect(safeNext("https://evil.example")).toBe("/admin");
    expect(safeNext("//evil.example/admin")).toBe("/admin");
    expect(safeNext("/admin/login?next=x")).toBe("/admin");
    expect(safeNext(null)).toBe("/admin");
  });
});

describe("server errors in words", () => {
  it("reads raised codes, the BAD_PLAN reason and constraint errors", () => {
    expect(toAdminError("TEAMS_INCOMPLETE").code).toBe("TEAMS_INCOMPLETE");
    const plan = toAdminError("BAD_PLAN: two teams start on one QR");
    expect([plan.code, plan.detail]).toEqual(["BAD_PLAN", "two teams start on one QR"]);
    expect(toAdminError('duplicate key value violates unique constraint "teams_name_key"').code).toBe("DUPLICATE");
    expect(toAdminError('update or delete on table "locations" violates foreign key constraint').code).toBe("IN_USE");
    expect(toAdminError('new row for relation "teams" violates check constraint').code).toBe("INVALID");
    expect(toAdminError("fetch failed").code).toBe("SERVER");
    expect(adminMessage("BAD_PLAN", "a team path breaks")).toMatch(/refused.*a team path breaks/);
    expect(adminMessage("NOPE")).toMatch(/Something went wrong/);
  });
});

describe("alerts in words (F13)", () => {
  const base = { team: "Rust Anchors", player: "Dev", place: "Library" };
  it("a wrong crew's mark names its owners or says spare", () => {
    expect(describeAlert({ ...base, kind: "wrong_team", data: { qr: "R4-02", owners: ["Copper Owls"] } }).body).toBe(
      "Rust Anchors · Dev scanned R4-02 (Library), Copper Owls’s mark.",
    );
    expect(describeAlert({ ...base, kind: "wrong_team", data: { qr: "R1-05", owners: [], spare: true } }).body).toMatch(/a spare/);
  });
  it("a later-round scan shows the QR, its round and whether it is the crew's own future mark (D-025)", () => {
    const own = describeAlert({ ...base, kind: "locked_scan", data: { qr: "R3-01", qr_round: 3, team_round: 1, own_future: true } });
    expect(own.title).toBe("Later-round scan");
    expect(own.body).toMatch(/R3-01 \(Library\) of Round III while in Round I: their own future mark/);
    const other = describeAlert({ ...base, kind: "locked_key", data: { qr: "F-01", qr_round: 4, team_round: 2, own_future: false } });
    expect(other.body).toMatch(/typed the key of F-01.*Round IV.*Round II: not on their path\. Refused/);
    expect(describeAlert({ ...base, kind: "possible_sweep", data: { round: 2, count: 3 } }).body).toBe(
      "Rust Anchors has scanned 3 later-round marks in Round II.",
    );
  });
  it("prank, left site, seal code and unknown kinds", () => {
    const prank = describeAlert({ ...base, place: "Clock Tower", kind: "prank", data: { qr: "P-05" } });
    expect([prank.tone, prank.body]).toEqual(["gold", "Rust Anchors · Dev scanned decoy P-05 (Clock Tower)."]);
    expect(describeAlert({ ...base, kind: "left_site", data: { away_ms: 34_200 } }).body).toBe("Rust Anchors · Dev was away 34 s.");
    expect(describeAlert({ ...base, kind: "foreign_seal", data: { code_of_team: "Iron Gulls" } }).body).toMatch(/Iron Gulls’s seal code/);
    expect(describeAlert({ ...base, kind: "session_moved", data: {} }).tone).toBe("sea");
    expect(describeAlert({ team: null, player: null, place: null, kind: "odd_thing", data: {} }).title).toBe("odd thing");
  });
  it("summarises the open alerts by kind", () => {
    expect(kindSummary({ wrong_team: 2, left_site: 1, prank: 1 })).toBe("2 wrong-mark scans · 1 left site");
    expect(kindSummary({})).toBe("");
  });
});

const entry = (over: Partial<LogEntry>): LogEntry => ({
  src: "event",
  id: 1,
  kind: "scanned",
  data: {},
  at: iso(0),
  team: "Iron Gulls",
  player: "Josh",
  reason: null,
  target: null,
  place: null,
  ...over,
});

describe("ship's log lines", () => {
  it("events read like the mockup", () => {
    expect(describeLog(entry({ kind: "checked_in", data: { qr: "R4-06", round: 4 }, place: "Library" }))).toBe(
      "Iron Gulls · Josh sealed check-in at R4-06 (Library)",
    );
    expect(describeLog(entry({ kind: "round_completed", player: null, data: { round: 4, order: 2 } }), [{ number: 4, advance: 4 }])).toBe(
      "Iron Gulls sealed Round IV · 2 of 4",
    );
    expect(describeLog(entry({ kind: "penalty_started", player: null, data: { ms: 240_000 } }))).toBe(
      "Iron Gulls all sealed · penalty 4:00 started",
    );
    expect(describeLog(entry({ kind: "finished", player: null, data: { rank: 1 } }))).toBe("Iron Gulls claimed 1st place");
    expect(describeLog(entry({ kind: "round_started" }))).toBeNull();
  });
  it("the captain's actions carry their reason; start/pause are left to their own events", () => {
    expect(
      describeLog(entry({ src: "audit", kind: "set_member_inactive", team: "Rust Anchors", player: "Wren", data: { inactive: true }, reason: "phone died" })),
    ).toBe("Captain marked Wren (Rust Anchors) inactive · reason: phone died");
    expect(describeLog(entry({ src: "audit", kind: "set_advance_count", target: "4", data: { x: 3 } }))).toBe("Captain set Round IV advance to 3");
    expect(describeLog(entry({ src: "audit", kind: "start_game" }))).toBeNull();
  });
});

describe("dashboard view (T-406)", () => {
  const now = T0 + 60_000;
  it("clock and stamps run on the hunt clock and freeze while paused", () => {
    expect(hms(2_832_000)).toBe("00:47:12");
    const s = snapshot();
    expect(huntClock(s.game, T0 + 90_000)).toBe(90_000);
    expect(huntClock({ ...s.game, status: "PAUSED", paused_at: iso(30_000) }, T0 + 90_000)).toBe(30_000);
    expect(huntClock({ ...s.game, status: "REGISTRATION", started_at: null }, now)).toBeNull();
    expect(stamp(iso(2_818_000), s.game)).toBe("00:46:58");
  });
  it("focuses the lowest round not yet sealed", () => {
    const s = snapshot();
    expect(focusRound(s.rounds)?.number).toBe(1);
    s.rounds[0]!.closed_at = iso(1);
    expect(focusRound(s.rounds)?.number).toBe(2);
    s.rounds.forEach((r) => (r.closed_at = iso(2)));
    expect(focusRound(s.rounds)?.number).toBe(3);
  });
  it("sorts by progress: podium, race (rounds, phase, pieces, time), eliminated, disqualified", () => {
    const sorted = sortTeams([
      team(1, { status: "disqualified" }),
      team(2, { status: "eliminated", eliminated_in_round: 1 }),
      team(3, { status: "eliminated", eliminated_in_round: 2 }),
      team(4, { rounds_completed: 1, round: 2, last_completed_at: iso(500) }),
      team(5, { rounds_completed: 1, round: 2, last_completed_at: iso(400) }),
      team(6, { rounds_completed: 1, round: 2, phase: "SEEKING", last_completed_at: iso(900) }),
      team(7, { status: "finished", final_rank: 2 }),
      team(8, { status: "finished", final_rank: 1 }),
    ]);
    expect(sorted.map((t) => t.number)).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
  });
  it("flags a crew stuck 10 minutes in one phase, counting from the last resume, only while running", () => {
    const t = team(1, { phase_since: iso(0) });
    const g = snapshot().game;
    expect(stuckFor(t, g, T0 + STUCK_MS - 1)).toBe(0);
    expect(stuckFor(t, g, T0 + STUCK_MS + 5)).toBe(STUCK_MS + 5);
    expect(stuckFor(t, { ...g, resumed_at: iso(300_000) }, T0 + STUCK_MS + 5)).toBe(0);
    expect(stuckFor(t, { ...g, status: "PAUSED" }, T0 + 2 * STUCK_MS)).toBe(0);
    expect(stuckFor({ ...t, phase: "PENALTY" }, g, T0 + 2 * STUCK_MS)).toBe(0);
  });
  it("cards show the phase chip, meta and member marks like the mockup", () => {
    const s = snapshot();
    const solve = cardFor(team(4, { pieces_solved: 2, members: [member("Ana", { solved: true }), member("Ben"), member("Wren", { is_active: false }), member("Yu", { solved: true })] }), s, now);
    expect(solve.chip).toEqual({ label: "Solve 2/4", tone: "solve" });
    expect(solve.code).toBe("T04 · HX7RMK");
    expect(solve.members.map((m) => m.state)).toEqual(["done", "wait", "off", "done"]);
    const check = cardFor(
      team(7, { phase: "CHECKING_IN", target: "R4-06", round: 4, members: [member("A", { checked_in: true }), member("M", { checked_in: true }), member("J", { checked_in: true }), member("R")] }),
      s,
      now,
    );
    expect([check.chip.label, check.meta, check.round]).toEqual(["Check in 3/4", "at R4-06", "IV"]);
    const pen = cardFor(team(9, { phase: "PENALTY", hints_round: 2, penalty_until: iso(60_000 + 72_000) }), s, now);
    expect([pen.chip.label, pen.meta]).toEqual(["Penalty 1:12", "2 hints"]);
    const won = cardFor(team(2, { status: "finished", final_rank: 1, completion_key: "7QX4MDKP2" }), s, now);
    expect([won.chip.label, won.meta]).toEqual(["1st place", "7QX·4MD·KP2"]);
    const out = cardFor(team(10, { status: "eliminated", eliminated_at: iso(1_900_000), round: 3 }), s, now);
    expect([out.chip.label, out.meta, out.out, out.members[0]!.state]).toEqual(["Eliminated", "out at 00:31:40", true, "gone"]);
    const stuck = cardFor(team(5), s, T0 + 14 * 60_000);
    expect(stuck.meta).toBe("stuck 14m");
  });
  it("before the hunt, cards show who is aboard with empty seats", () => {
    const s = snapshot({}, { status: "REGISTRATION", started_at: null });
    const c = cardFor(team(1, { status: "forming", phase: null, round: null, members: [member("Ana"), member("Ben")] }), s, now);
    expect([c.chip.label, c.meta]).toEqual(["Mustering", "2/4 aboard"]);
    expect(c.members.map((m) => m.state)).toEqual(["done", "done", "wait", "wait"]);
    expect(cards(s, now).some((x) => x.lead)).toBe(false);
  });
  it("marks the leading crew once the hunt runs", () => {
    const s = snapshot({ teams: [team(1), team(2, { rounds_completed: 1, round: 2 })] });
    expect(cards(s, now).filter((c) => c.lead).map((c) => c.team.number)).toEqual([2]);
  });
  it("penalty countdown freezes while paused", () => {
    const t = team(1, { phase: "PENALTY", penalty_until: iso(200_000) });
    const g = snapshot().game;
    expect(penaltyLeft(t, g, T0 + 100_000)).toBe(100_000);
    expect(penaltyLeft(t, { ...g, status: "PAUSED", paused_at: iso(50_000) }, T0 + 190_000)).toBe(150_000);
  });
  it("Start is only offered when the server would accept it", () => {
    const pre = (over: Parameters<typeof snapshot>[0], game = {}) =>
      startBlocker(snapshot(over, { status: "READY", started_at: null, ...game }));
    expect(pre({ teams: [] })).toMatch(/Create the crews/);
    expect(pre({ rounds: [] })).toMatch(/Generate the course/);
    expect(pre({ teams: [team(1, { status: "locked" }), team(2, { status: "forming", name: "Salt Wolves" })] })).toBe(
      "1 crew isn't full yet (Salt Wolves).",
    );
    expect(pre({ teams: [team(1, { status: "locked" })], questions: { enabled: 11, by_difficulty: {} } })).toMatch(/at least 12/);
    expect(pre({ teams: [team(1, { status: "locked" })] })).toBeNull();
    expect(startBlocker(snapshot())).toBeNull();
  });
  it("lowering X to the crews already sealed warns how many it eliminates (D-012)", () => {
    const s = snapshot({
      teams: [team(1, { round: 2, rounds_completed: 1 }), team(2), team(3), team(4, { status: "eliminated" })],
    });
    const r1 = { ...s.rounds[0]!, completed: 1 };
    expect(closesNow(s, r1, 2)).toBe(0);
    expect(closesNow(s, r1, 1)).toBe(2);
    expect(closesNow({ ...s, game: { ...s.game, status: "FINISHED" } }, r1, 1)).toBe(0);
  });
});

describe("course (T-404)", () => {
  const teams = ["a", "b", "c"];
  const locs = Array.from({ length: 12 }, (_, i) => `l${i}`);
  const plan = generatePlan({ teamIds: teams, locationIds: locs, seed: 7, counts: [5, 3, 1], advance: [3, 2, 2] });
  const locations = locs.map((id, i) => ({
    id,
    name: `Place ${i}`,
    area: null,
    clue_sets: i === 0 ? [{ pieces: ["a", "", "", ""] }] : [{ pieces: ["a", "b", "c", "d"] }],
    map_x: i === 1 ? null : 0.5,
    map_y: i === 1 ? null : 0.5,
  }));
  const crew = (id: string) => ({ id, name: `Crew ${id}`, status: "locked", members: 4 });

  it("spares are the round-1 marks no crew starts on", () => {
    expect(sparesOf(plan)).toHaveLength(2);
    expect(pathOf(plan, "a")).toHaveLength(3);
  });
  it("reads the applied course back from the database rows", () => {
    const qrs = plan.qrs.map((q, i) => ({ id: `q${i}`, label: q.ref, round: q.round, kind: q.kind, is_spare: false, location_id: q.location_id }));
    const id = new Map(qrs.map((q) => [q.label, q.id]));
    const course = courseFromDb(
      plan.rounds,
      [...qrs, { id: "u", label: "U", round: null, kind: "universal", is_spare: false, location_id: null }],
      plan.links.map((l) => ({ from_qr: id.get(l.from)!, to_qr: id.get(l.to)! })),
      plan.assignments.map((a) => ({ team_id: a.team_id, round: a.round, qr_id: id.get(a.qr)! })),
    )!;
    expect(course.qrs).toHaveLength(plan.qrs.length);
    expect(course.links).toEqual(plan.links);
    expect(courseFromDb([], [], [], [])).toBeNull();
  });
  it("checks: full crews, enough places, paths, clue pieces, pins and questions", () => {
    const checks = courseChecks({
      plan,
      planError: null,
      teams: teams.map(crew),
      locations,
      questionsByDifficulty: { "2": 4, "4": 4, "5": 4 },
    });
    const text = checks.map((c) => `${c.level}: ${c.text}`);
    expect(text).toContain("ok: All 3 crews have exactly 4 members");
    expect(text).toContain("ok: Every crew has a path to the final");
    expect(text).toContain("ok: No dead ends between rounds");
    const placesUsed = new Set(plan.qrs.filter((q) => q.kind !== "prank").map((q) => q.location_id));
    if (placesUsed.has("l0")) expect(text.some((t) => /without all 4 clue pieces: Place 0/.test(t))).toBe(true);
    if (placesUsed.has("l1")) expect(text.some((t) => /no map pin/.test(t))).toBe(true);
    expect(checks.some((c) => c.level === "error")).toBe(false);
  });
  it("a missing location count blocks Generate; short questions only warn", () => {
    const blocked = courseChecks({ plan: null, planError: "This game needs 11 locations", teams: teams.map(crew), locations, questionsByDifficulty: {} });
    expect(blocked.some((c) => c.level === "error")).toBe(true);
    const few = courseChecks({ plan, planError: null, teams: teams.map(crew), locations, questionsByDifficulty: { "2": 3 } });
    expect(few.find((c) => /Start needs at least 12/.test(c.text))?.level).toBe("warn");
  });
  it("routes drawn at Start (New Game) and crews added after generating are not errors", () => {
    const kept = { ...plan, assignments: [] };
    const atStart = courseChecks({ plan: kept, planError: null, teams: teams.map(crew), locations, questionsByDifficulty: {} });
    expect(atStart.map((c) => c.text)).toContain("Every crew gets a new random route at Start");
    expect(atStart.some((c) => c.level === "error")).toBe(false);
    const late = courseChecks({ plan, planError: null, teams: [...teams, "d"].map(crew), locations, questionsByDifficulty: {} });
    expect(late.find((c) => /Crew d joined after/.test(c.text))?.level).toBe("warn");
  });
  it("lays the pyramid out bottom-up inside the drawing", () => {
    const l = layoutPyramid(plan);
    expect(l.nodes).toHaveLength(9);
    for (const n of l.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(VIEW.left - 1);
      expect(n.x).toBeLessThanOrEqual(VIEW.right + 1);
    }
    expect(l.rowY(1)).toBe(VIEW.bottom);
    expect(l.rowY(3)).toBe(VIEW.top);
    expect(l.nodes.find((n) => n.final)?.ref).toBe("F-01");
    const big = generatePlan({ teamIds: Array.from({ length: 30 }, (_, i) => `t${i}`), locationIds: Array.from({ length: 200 }, (_, i) => `p${i}`), seed: 1, counts: [45, 27, 17, 11, 7, 5, 3, 2, 1] });
    const lb = layoutPyramid(big);
    expect(lb.scale).toBeLessThan(1);
    expect(Math.max(...lb.nodes.map((n) => n.x))).toBeLessThanOrEqual(VIEW.right + 1);
  });
});

describe("CSV export (F16)", () => {
  it("quotes commas, quotes and newlines, and defuses formulas", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(null)).toBe("");
    expect(toCsv([["a", 1], ["b\nc", true]])).toBe('a,1\r\n"b\nc",true');
  });
  it("writes teams with round times, the log and the audit", () => {
    const csv = exportCsv({
      game: { status: "FINISHED", started_at: "s", finished_at: "f" },
      teams: [
        { number: 1, name: "Iron Gulls", status: "finished", final_rank: 1, eliminated_in_round: null, members: ["Ana", "Ben"], rounds: [{ round: 1, completed_at: "t1", order: 1 }, { round: 2, completed_at: "t2", order: 1 }] },
        { number: 2, name: "Salt Wolves", status: "eliminated", final_rank: null, eliminated_in_round: 1, members: [], rounds: [] },
      ],
      events: [{ at: "e", team: "Iron Gulls", kind: "finished", data: { rank: 1 } }],
      audit: [{ id: 1, admin_id: null, action: "end_game", target: null, reason: "time, sorry", data: {}, at: "a" }],
    });
    expect(csv).toContain("Number,Name,Status,Final rank,Eliminated in round,Members,Rounds sealed,Round 1 sealed at,Round 2 sealed at");
    expect(csv).toContain("1,Iron Gulls,finished,1,,Ana; Ben,2,t1 (#1),t2 (#1)");
    expect(csv).toContain("2,Salt Wolves,eliminated,,1,,0,,");
    expect(csv).toContain('e,Iron Gulls,finished,"{""rank"":1}"');
    expect(csv).toContain('a,end_game,,"time, sorry",');
  });
});

describe("printed marks (T-405)", () => {
  it("a printed QR decodes to the /q landing, and the in-site scanner reads the token back", async () => {
    const { markUrl } = await import("@/components/admin/Print");
    const { tokenFromScan } = await import("@/lib/player/format");
    // _token(): 24 random bytes, base64url without padding (32 characters).
    const token = "q9X_-a3Bc4De5Fg6Hi7Jk8Lm9No0Pq1r";
    const url = markUrl("https://hunt.example", token);
    expect(url).toBe(`https://hunt.example/q/${token}`);
    expect(tokenFromScan(url)).toBe(token);
  });
});

describe("place names on stubs and in the panel (D-043)", () => {
  it("joins number, building, floor and place, skipping what's missing", () => {
    expect(placeLine({ place_no: 12, building: "Main Engineering Block", floor: "Ground floor", name: "Library — magazine rack" })).toBe(
      "#12 · Main Engineering Block · Ground floor · Library — magazine rack",
    );
    expect(placeLine({ place_no: null, building: " ", floor: null, name: "Spot 3" })).toBe("Spot 3");
    expect(placeTag(7)).toBe("#07");
    expect(placeTag(null)).toBeNull();
  });
});

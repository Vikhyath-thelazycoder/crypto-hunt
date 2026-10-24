import { describe, expect, it } from "vitest";
import { groupKey, initials, mmss, ordinal, roman, tokenFromScan } from "./format";
import { messageFor } from "./messages";
import { screenFor } from "./screen";
import type { MyStatus } from "./types";

describe("format", () => {
  it("writes rounds in Roman numerals", () => {
    expect([1, 3, 4, 7, 9, 12, 14, 19].map(roman)).toEqual([
      "I",
      "III",
      "IV",
      "VII",
      "IX",
      "XII",
      "XIV",
      "XIX",
    ]);
  });

  it("ordinals, initials, grouped keys, countdowns", () => {
    expect([1, 2, 3, 4, 11, 12, 21].map((n) => ordinal(n).suffix)).toEqual([
      "st",
      "nd",
      "rd",
      "th",
      "th",
      "th",
      "st",
    ]);
    expect(initials("Iron Gulls")).toBe("IG");
    expect(initials("ana")).toBe("A");
    expect(groupKey("7QX4MDKP2")).toBe("7QX·4MD·KP2");
    expect(mmss(102_000)).toBe("1:42");
    expect(mmss(-5)).toBe("0:00");
  });

  it("reads a token from the printed URL or a bare token, and nothing else", () => {
    const t = "Ab3_-defGHIJklmnOPQRstuvWXyz0123";
    expect(tokenFromScan(`https://cryptohunt.app/q/${t}`)).toBe(t);
    expect(tokenFromScan(`https://cryptohunt.app/q/${t}/?utm=x`)).toBe(t);
    expect(tokenFromScan(t)).toBe(t);
    expect(tokenFromScan("https://example.com/hello")).toBeNull();
    expect(tokenFromScan("<script>")).toBeNull();
  });
});

describe("messages", () => {
  it("speaks for every code and falls back politely", () => {
    expect(messageFor("NOT_YOURS")).toMatch(/isn't yours/);
    expect(messageFor("WHO_KNOWS")).toMatch(/Something went wrong/);
  });
});

const base: MyStatus = {
  ok: true,
  player: { id: "p", name: "Ravi", is_active: true },
  team: {
    id: "t",
    number: 7,
    name: "Iron Gulls",
    code: "HX7RMK",
    status: "active",
    final_rank: null,
    eliminated_in_round: null,
    eliminated_view: null,
    completion_key: null,
  },
  game: {
    status: "RUNNING",
    hints_enabled: false,
    broadcast: null,
    broadcast_at: null,
    hint_penalty_ms: 120000,
    mcq_lockout_ms: 120000,
  },
  members: [],
  round: { number: 3, total: 7, is_final: false, difficulty: 2 },
  phase: "SOLVING",
  penalty: { ms: 0, until: null },
  task: null,
  pieces: [],
  region: null,
  seal_code: null,
};

describe("screenFor", () => {
  it.each<[Partial<MyStatus>, string]>([
    [{ game: { ...base.game, status: "REGISTRATION" }, round: null, phase: null }, "lobby"],
    [{}, "solve"],
    [{ phase: "SEEKING" }, "seek"],
    [{ phase: "CHECKING_IN" }, "checkin"],
    [{ phase: "PENALTY" }, "penalty"],
    [{ phase: "CHECKING_IN", round: { number: 7, total: 7, is_final: true, difficulty: 5 } }, "final"],
    [{ team: { ...base.team, status: "finished", final_rank: 1 } }, "victory"],
    [{ team: { ...base.team, status: "eliminated" } }, "eliminated"],
    [{ team: { ...base.team, status: "eliminated", eliminated_view: "spectator" } }, "spectator"],
    [{ team: { ...base.team, status: "eliminated", eliminated_view: "game_over" } }, "game_over"],
    [{ game: { ...base.game, status: "FINISHED" } }, "hunt_over"],
  ])("%o → %s", (patch, expected) => {
    expect(screenFor({ ...base, ...patch }, null, false)).toBe(expected);
  });

  it("opens the check-in camera from Seek, and shows scan results over the hunt", () => {
    expect(screenFor({ ...base, phase: "SEEKING" }, null, true)).toBe("checkin");
    expect(screenFor(base, { kind: "prank", fakeKey: "ABCDEF", round: 3 }, false)).toBe("prank");
    expect(screenFor(base, { kind: "sealed", round: 3 }, false)).toBe("sealed");
  });
});

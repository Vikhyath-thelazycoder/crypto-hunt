import { describe, expect, it } from "vitest";
import {
  checkinOutcome,
  defaultAdvance,
  difficultyFor,
  prankCount,
  pyramidCounts,
  rankTeams,
  resolveScan,
  roundClose,
  type ScanContext,
} from "./engine";

describe("pyramidCounts (D-009)", () => {
  it("matches the PRD example for 10 teams", () => {
    const counts = pyramidCounts(10);
    expect(counts).toEqual([15, 9, 6, 4, 3, 2, 1]);
    expect(counts.reduce((s, c) => s + c, 0)).toBe(40);
  });

  it.each([1, 2, 3, 5, 10, 17, 25, 30, 40])(
    "for %i teams: a round-1 QR per team up to 15, never more than 15, strictly shrinking, one final",
    (n) => {
      const counts = pyramidCounts(n);
      expect(counts[0]).toBe(Math.min(15, Math.ceil(n * 1.5)));
      if (n <= 15) expect(counts[0]).toBeGreaterThanOrEqual(n);
      expect(counts.at(-1)).toBe(1);
      for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThan(counts[i - 1]!);
    },
  );

  it("keeps the 10-team pyramid for more teams (D-039): 48 places whatever the turnout", () => {
    for (const n of [11, 15, 20, 25, 40]) expect(pyramidCounts(n)).toEqual([15, 9, 6, 4, 3, 2, 1]);
  });

  it("refuses zero teams", () => {
    expect(() => pyramidCounts(0)).toThrow();
  });
});

describe("pranks, difficulty, advance", () => {
  it("adds about 20% pranks (8 for 40 QRs)", () => {
    expect(prankCount(40)).toBe(8);
  });

  it("raises difficulty from 1 to 5 across the rounds", () => {
    const d = [1, 2, 3, 4, 5, 6, 7].map((r) => difficultyFor(r, 7));
    expect(d[0]).toBe(1);
    expect(d.at(-1)).toBe(5);
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThanOrEqual(d[i - 1]!);
  });

  it("suggests X from the team count down to a podium of 3, never growing", () => {
    const x = defaultAdvance(10, 7);
    expect(x.at(-1)).toBe(3);
    expect(x[0]).toBeLessThanOrEqual(10);
    for (let i = 1; i < x.length; i++) expect(x[i]).toBeLessThanOrEqual(x[i - 1]!);
    expect(Math.min(...x)).toBe(3);
  });

  it("uses a smaller podium when fewer than 3 teams play", () => {
    expect(defaultAdvance(2, 3)).toEqual([2, 2, 2]);
  });
});

const base: ScanContext = {
  gameStatus: "RUNNING",
  teamStatus: "active",
  teamRound: 1,
  phase: "SEEKING",
  qr: { kind: "target", round: 1, assignedToTeam: true },
  alreadyCheckedIn: false,
};

describe("resolveScan (SYSTEM_WORKFLOW › Scan resolution)", () => {
  it("asks for the key at the team's own current mark", () => {
    expect(resolveScan(base)).toBe("ASK_KEY");
  });

  it("asks for key and seal code at the final mark (D-026)", () => {
    expect(
      resolveScan({ ...base, teamRound: 7, qr: { kind: "final", round: 7, assignedToTeam: true } }),
    ).toBe("ASK_KEY_AND_SEAL");
  });

  it("locks any later-round mark the same way, own path or not (D-025)", () => {
    const own = resolveScan({ ...base, qr: { kind: "target", round: 3, assignedToTeam: true } });
    const other = resolveScan({ ...base, qr: { kind: "target", round: 3, assignedToTeam: false } });
    const final = resolveScan({ ...base, qr: { kind: "final", round: 7, assignedToTeam: true } });
    expect([own, other, final]).toEqual(["LOCKED_MARK", "LOCKED_MARK", "LOCKED_MARK"]);
  });

  it.each<[Partial<ScanContext>, string]>([
    [{ qr: { kind: "target", round: 1, assignedToTeam: false } }, "NOT_YOURS"],
    [{ teamRound: 2, qr: { kind: "target", round: 1, assignedToTeam: true } }, "ALREADY_DONE"],
    [{ phase: "SOLVING" }, "SOLVE_FIRST"],
    [{ alreadyCheckedIn: true }, "ALREADY_CHECKED_IN"],
    [{ qr: { kind: "prank", round: null, assignedToTeam: false } }, "PRANK"],
    [{ qr: { kind: "universal", round: null, assignedToTeam: false } }, "QUESTION"],
    [{ teamRound: 2, qr: { kind: "universal", round: null, assignedToTeam: false } }, "ALREADY_DONE"],
    [{ qr: null }, "BAD_QR"],
    [{ gameStatus: "PAUSED" }, "PAUSED"],
    [{ gameStatus: "READY" }, "NOT_RUNNING"],
    [{ teamStatus: "eliminated" }, "ELIMINATED"],
    [{ teamStatus: "finished" }, "FINISHED"],
  ])("%o → %s", (patch, expected) => {
    expect(resolveScan({ ...base, ...patch })).toBe(expected);
  });
});

describe("check-in, round close, ranking", () => {
  it("waits for every active member, then serves the penalty or completes", () => {
    expect(checkinOutcome(4, 3, 0)).toBe("WAITING");
    expect(checkinOutcome(4, 4, 120_000)).toBe("PENALTY");
    expect(checkinOutcome(3, 3, 0)).toBe("COMPLETE");
  });

  it("closes the round at X completions and eliminates exactly the rest", () => {
    expect(roundClose(2, ["a"], ["a", "b", "c"])).toEqual({ closed: false, eliminated: [] });
    expect(roundClose(2, ["c", "a"], ["a", "b", "c", "d"])).toEqual({ closed: true, eliminated: ["b", "d"] });
  });

  it("ranks by rounds completed, then earliest completion (D-014)", () => {
    expect(
      rankTeams([
        { id: "a", roundsCompleted: 3, lastCompletedAt: 500 },
        { id: "b", roundsCompleted: 4, lastCompletedAt: 900 },
        { id: "c", roundsCompleted: 3, lastCompletedAt: 400 },
        { id: "d", roundsCompleted: 0, lastCompletedAt: null },
      ]),
    ).toEqual(["b", "c", "a", "d"]);
  });
});

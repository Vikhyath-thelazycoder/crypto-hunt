import { describe, expect, it } from "vitest";
import { generatePlan, GeneratorError, validatePlan, type Plan } from "./generator";

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

function plan(teams: number, seed = 7, extraPlaces = 0): { plan: Plan; teamIds: string[]; places: string[] } {
  const teamIds = ids("team", teams);
  const places = ids("loc", 200 + extraPlaces);
  return { plan: generatePlan({ teamIds, locationIds: places, seed }), teamIds, places };
}

describe("generatePlan", () => {
  it("builds the 10-team pyramid: 7 rounds, 40 QRs, 8 pranks", () => {
    const { plan: p } = plan(10);
    expect(p.rounds.map((r) => r.qr_count)).toEqual([15, 9, 6, 4, 3, 2, 1]);
    expect(p.qrs.filter((q) => q.kind !== "prank")).toHaveLength(40);
    expect(p.qrs.filter((q) => q.kind === "prank")).toHaveLength(8);
    expect(p.qrs.filter((q) => q.kind === "final").map((q) => q.ref)).toEqual(["F-01"]);
    expect(p.rounds.at(-1)!.advance_count).toBe(3);
  });

  it("is deterministic for a seed and differs across seeds", () => {
    expect(plan(10, 42).plan).toEqual(plan(10, 42).plan);
    expect(plan(10, 42).plan.assignments).not.toEqual(plan(10, 43).plan.assignments);
  });

  // Property check across team counts and seeds: every invariant SQL enforces holds.
  it.each([1, 2, 3, 4, 7, 10, 16, 25, 40])(
    "produces a valid plan for %i teams across many seeds",
    (teams) => {
      for (let seed = 1; seed <= 25; seed++) {
        const { plan: p, teamIds, places } = plan(teams, seed);
        expect(validatePlan(p, teamIds, places)).toEqual([]);
        // Every team reaches the final.
        for (const t of teamIds) {
          expect(p.assignments.find((a) => a.team_id === t && a.round === p.rounds.length)?.qr).toBe("F-01");
        }
      }
    },
  );

  it("leaves unassigned round-1 QRs as spares", () => {
    const { plan: p } = plan(10);
    const used = new Set(p.assignments.filter((a) => a.round === 1).map((a) => a.qr));
    expect(used.size).toBe(10);
    expect(p.qrs.filter((q) => q.round === 1 && !used.has(q.ref))).toHaveLength(5);
  });

  it("says how many locations are missing", () => {
    expect(() => generatePlan({ teamIds: ids("t", 10), locationIds: ids("l", 20), seed: 1 })).toThrow(
      /needs 48 locations/,
    );
    try {
      generatePlan({ teamIds: ids("t", 10), locationIds: ids("l", 20), seed: 1 });
    } catch (e) {
      expect((e as GeneratorError).code).toBe("NOT_ENOUGH_LOCATIONS");
    }
  });

  it("rejects counts that don't shrink or don't end at one final QR", () => {
    const base = { teamIds: ids("t", 4), locationIds: ids("l", 50), seed: 1 };
    expect(() => generatePlan({ ...base, counts: [6, 6, 1] })).toThrow(/fewer QRs/);
    expect(() => generatePlan({ ...base, counts: [6, 3, 2] })).toThrow(/exactly 1 QR/);
    expect(() => generatePlan({ ...base, counts: [3, 2, 1] })).toThrow(/one QR per team/);
  });

  it("rejects an X that grows or exceeds the teams", () => {
    const base = { teamIds: ids("t", 4), locationIds: ids("l", 50), seed: 1, counts: [6, 4, 1] };
    expect(() => generatePlan({ ...base, advance: [3, 4, 2] })).toThrow(/can't grow/);
    expect(() => generatePlan({ ...base, advance: [5, 4, 2] })).toThrow(/can't exceed/);
  });
});

describe("validatePlan catches a forged plan (SECURITY T12)", () => {
  it("flags a team sent straight to the final", () => {
    const { plan: p, teamIds, places } = plan(4);
    const forged: Plan = {
      ...p,
      assignments: p.assignments.map((a) =>
        a.team_id === "team1" && a.round === 2 ? { ...a, qr: "F-01" } : a,
      ),
    };
    expect(validatePlan(forged, teamIds, places).join(" ")).toMatch(/path breaks/);
  });

  it("flags two teams on one start, shared locations and dead ends", () => {
    const { plan: p, teamIds, places } = plan(4);
    const r1 = p.assignments.find((a) => a.team_id === "team1" && a.round === 1)!.qr;
    const twoStarts: Plan = {
      ...p,
      assignments: p.assignments.map((a) => (a.team_id === "team2" && a.round === 1 ? { ...a, qr: r1 } : a)),
    };
    expect(validatePlan(twoStarts, teamIds, places).join(" ")).toMatch(/Two teams start/);

    const sharedPlace: Plan = {
      ...p,
      qrs: p.qrs.map((q, i) => (i === 1 ? { ...q, location_id: p.qrs[0]!.location_id } : q)),
    };
    expect(validatePlan(sharedPlace, teamIds, places).join(" ")).toMatch(/share one location/);

    const deadEnd: Plan = { ...p, links: p.links.slice(1) };
    expect(validatePlan(deadEnd, teamIds, places).join(" ")).toMatch(/dead end/);
  });
});

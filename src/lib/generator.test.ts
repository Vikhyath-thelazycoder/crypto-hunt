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

  it("shares round-1 QRs evenly beyond 15 teams and keeps 48 places (D-039)", () => {
    const teamIds = ids("team", 25);
    const p = generatePlan({ teamIds, locationIds: ids("loc", 48), seed: 3 });
    expect(p.qrs).toHaveLength(48);
    const perStart = new Map<string, number>();
    for (const a of p.assignments.filter((x) => x.round === 1)) perStart.set(a.qr, (perStart.get(a.qr) ?? 0) + 1);
    expect(perStart.size).toBe(15);
    expect([...perStart.values()].sort()).toEqual([...Array(10).fill(2), ...Array(5).fill(1)].sort());
    expect(validatePlan(p, teamIds, ids("loc", 48))).toEqual([]);
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
    expect(validatePlan(twoStarts, teamIds, places).join(" ")).toMatch(/Too many teams start/);

    const sharedPlace: Plan = {
      ...p,
      qrs: p.qrs.map((q, i) => (i === 1 ? { ...q, location_id: p.qrs[0]!.location_id } : q)),
    };
    expect(validatePlan(sharedPlace, teamIds, places).join(" ")).toMatch(/share one location/);

    const deadEnd: Plan = { ...p, links: p.links.slice(1) };
    expect(validatePlan(deadEnd, teamIds, places).join(" ")).toMatch(/dead end/);
  });
});

describe("routes far apart (D-042)", () => {
  // The real venue's shape: 43 places in the Main Block, 16 spread over three other areas.
  const ids = Array.from({ length: 59 }, (_, i) => `loc${i}`);
  const areas = Object.fromEntries(
    ids.map((id, i) => [id, i < 43 ? "Main Block" : i < 53 ? "MBA area" : i < 57 ? "North" : "Boys' Hostel"]),
  );
  const pins = Object.fromEntries(ids.map((id, i) => [id, { x: (i % 10) / 10, y: Math.floor(i / 10) / 6 }]));
  const teamIds = Array.from({ length: 10 }, (_, i) => `t${i}`);

  it("100 courses: no route ever has two places in a row in the same area", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const plan = generatePlan({ teamIds, locationIds: ids, seed, areas, pins });
      expect(validatePlan(plan, teamIds, ids, areas)).toEqual([]);
      const where = new Map(plan.qrs.map((q) => [q.ref, areas[q.location_id]]));
      for (const team of teamIds) {
        const path = plan.assignments.filter((a) => a.team_id === team).sort((a, b) => a.round - b.round);
        for (let i = 1; i < path.length; i++) expect(where.get(path[i]!.qr)).not.toBe(where.get(path[i - 1]!.qr));
      }
    }
  });

  it("links prefer the farthest next place", () => {
    const plan = generatePlan({ teamIds, locationIds: ids, seed: 3, areas, pins });
    const at = new Map(plan.qrs.map((q) => [q.ref, pins[q.location_id]!]));
    // Round-1 links on average reach farther with pins than the same course linked at random.
    const r1 = plan.links.filter((l) => l.from.startsWith("R1-"));
    const random = generatePlan({ teamIds, locationIds: ids, seed: 3, areas });
    const at2 = new Map(random.qrs.map((q) => [q.ref, pins[q.location_id]!]));
    const avg = (links: typeof r1, m: typeof at) =>
      links.reduce((s, l) => s + Math.hypot(m.get(l.from)!.x - m.get(l.to)!.x, m.get(l.from)!.y - m.get(l.to)!.y), 0) / links.length;
    expect(avg(r1, at)).toBeGreaterThan(avg(random.links.filter((l) => l.from.startsWith("R1-")), at2));
  });

  it("refuses a course the areas can't carry, and says which area is short", () => {
    const lopsided = Object.fromEntries(ids.map((id, i) => [id, i < 55 ? "Main Block" : "Outside"]));
    expect(() => generatePlan({ teamIds, locationIds: ids, seed: 1, areas: lopsided })).toThrow(
      /needs 25 places in Main Block and 15 elsewhere, but there are 55 and 4/,
    );
  });

  it("validatePlan flags a link that stays in one area", () => {
    const plan = generatePlan({ teamIds, locationIds: ids, seed: 5 });
    const same = Object.fromEntries(ids.map((id) => [id, "Main Block"]));
    expect(validatePlan(plan, teamIds, ids, same).some((p) => /stays in Main Block/.test(p))).toBe(true);
  });
});

// One-click game generator (D-009, F10): builds the pyramid of rounds, the QR set, the links between rounds,
// each team's path and the prank QRs. The output is untrusted input to SQL: `apply_game_plan` re-validates
// every rule below and creates all tokens and keys on the server. No secret is ever generated here.

import { defaultAdvance, difficultyFor, prankCount, pyramidCounts, PRANK_SHARE } from "./engine";

export type PlanRound = { number: number; qr_count: number; advance_count: number; difficulty: number };
export type PlanQr = {
  ref: string;
  round: number | null;
  kind: "target" | "final" | "prank";
  location_id: string;
};
export type PlanLink = { from: string; to: string };
export type PlanAssignment = { team_id: string; round: number; qr: string };
export type Plan = { rounds: PlanRound[]; qrs: PlanQr[]; links: PlanLink[]; assignments: PlanAssignment[] };

export type GenerateInput = {
  teamIds: string[];
  locationIds: string[];
  seed: number;
  /** Override the QR count per round (must shrink by at least one each round, ending at 1). */
  counts?: number[];
  /** Override X per round. */
  advance?: number[];
  prankShare?: number;
};

export class GeneratorError extends Error {
  constructor(
    readonly code: "NO_TEAMS" | "BAD_COUNTS" | "BAD_ADVANCE" | "NOT_ENOUGH_LOCATIONS",
    message: string,
  ) {
    super(message);
  }
}

/** Small seeded PRNG (mulberry32): the same seed always gives the same plan. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const qrRef = (round: number, index: number, final: boolean) =>
  final ? "F-01" : `R${round}-${pad(index + 1)}`;

export function generatePlan(input: GenerateInput): Plan {
  const teams = input.teamIds.length;
  if (teams < 1) throw new GeneratorError("NO_TEAMS", "Create at least one team before generating.");
  const counts = input.counts ?? pyramidCounts(teams);
  const countProblem = checkCounts(counts, teams);
  if (countProblem) throw new GeneratorError("BAD_COUNTS", countProblem);
  const rounds = counts.length;
  const advance = input.advance ?? defaultAdvance(teams, rounds);
  const advanceProblem = checkAdvance(advance, rounds, teams);
  if (advanceProblem) throw new GeneratorError("BAD_ADVANCE", advanceProblem);

  const pyramid = counts.reduce((s, c) => s + c, 0);
  const pranks = prankCount(pyramid, input.prankShare ?? PRANK_SHARE);
  if (input.locationIds.length < pyramid + pranks) {
    throw new GeneratorError(
      "NOT_ENOUGH_LOCATIONS",
      `This game needs ${pyramid + pranks} locations (${pyramid} QRs + ${pranks} pranks); only ${input.locationIds.length} exist. Add locations or lower the QR counts.`,
    );
  }

  const rand = rng(input.seed);
  const places = shuffle(input.locationIds, rand);
  let nextPlace = 0;

  const byRound: string[][] = [];
  const qrs: PlanQr[] = [];
  counts.forEach((count, i) => {
    const round = i + 1;
    const final = round === rounds;
    const refs: string[] = [];
    for (let k = 0; k < count; k++) {
      const ref = qrRef(round, k, final);
      refs.push(ref);
      qrs.push({ ref, round, kind: final ? "final" : "target", location_id: places[nextPlace++]! });
    }
    byRound.push(refs);
  });
  for (let k = 0; k < pranks; k++) {
    qrs.push({ ref: `P-${pad(k + 1)}`, round: null, kind: "prank", location_id: places[nextPlace++]! });
  }

  // Every QR links to one QR of the next round; every next-round QR gets at least one incoming link.
  const links: PlanLink[] = [];
  const next = new Map<string, string>();
  for (let r = 0; r < rounds - 1; r++) {
    const from = shuffle(byRound[r]!, rand);
    const to = shuffle(byRound[r + 1]!, rand);
    from.forEach((ref, i) => {
      const target = i < to.length ? to[i]! : to[Math.floor(rand() * to.length)]!;
      links.push({ from: ref, to: target });
      next.set(ref, target);
    });
  }

  // Each team gets its own random round-1 QR; after that its path follows the links.
  const starts = shuffle(byRound[0]!, rand);
  const assignments: PlanAssignment[] = [];
  input.teamIds.forEach((team_id, i) => {
    let qr = starts[i]!;
    for (let round = 1; round <= rounds; round++) {
      assignments.push({ team_id, round, qr });
      if (round < rounds) qr = next.get(qr)!;
    }
  });

  return {
    rounds: counts.map((qr_count, i) => ({
      number: i + 1,
      qr_count,
      advance_count: advance[i]!,
      difficulty: difficultyFor(i + 1, rounds),
    })),
    qrs,
    links,
    assignments,
  };
}

function checkCounts(counts: number[], teams: number): string | null {
  if (counts.length < 1 || counts.some((c) => !Number.isInteger(c) || c < 1))
    return "QR counts must be whole numbers ≥ 1.";
  if (counts[0]! < teams) return `Round 1 needs at least one QR per team (${teams}).`;
  if (counts[counts.length - 1] !== 1) return "The last round must have exactly 1 QR (the final).";
  for (let i = 1; i < counts.length; i++) {
    if (counts[i]! >= counts[i - 1]!) return `Round ${i + 1} must have fewer QRs than round ${i}.`;
  }
  return null;
}

function checkAdvance(advance: number[], rounds: number, teams: number): string | null {
  if (advance.length !== rounds) return `Give an X for each of the ${rounds} rounds.`;
  if (advance.some((x) => !Number.isInteger(x) || x < 1)) return "Every X must be a whole number ≥ 1.";
  if (advance[0]! > teams) return `Round 1 X can't exceed the ${teams} teams.`;
  for (let i = 1; i < rounds; i++) {
    if (advance[i]! > advance[i - 1]!) return `X can't grow: round ${i + 1} is bigger than round ${i}.`;
  }
  return null;
}

/** Every invariant `apply_game_plan` enforces, so the admin sees problems before sending. */
export function validatePlan(plan: Plan, teamIds: string[], locationIds: string[]): string[] {
  const problems: string[] = [];
  const rounds = plan.rounds.length;
  const counts = plan.rounds.map((r) => r.qr_count);
  plan.rounds.forEach((r, i) => {
    if (r.number !== i + 1) problems.push("Rounds must be numbered 1, 2, 3… in order.");
  });
  const c = checkCounts(counts, teamIds.length);
  if (c) problems.push(c);
  const a = checkAdvance(
    plan.rounds.map((r) => r.advance_count),
    rounds,
    teamIds.length,
  );
  if (a) problems.push(a);

  const qrByRef = new Map(plan.qrs.map((q) => [q.ref, q]));
  if (qrByRef.size !== plan.qrs.length) problems.push("QR refs must be unique.");
  const known = new Set(locationIds);
  const usedPlaces = new Set<string>();
  for (const q of plan.qrs) {
    if (!known.has(q.location_id)) problems.push(`${q.ref}: unknown location.`);
    if (usedPlaces.has(q.location_id)) problems.push(`${q.ref}: two QRs share one location.`);
    usedPlaces.add(q.location_id);
  }
  plan.rounds.forEach((r) => {
    const inRound = plan.qrs.filter((q) => q.round === r.number);
    if (inRound.length !== r.qr_count)
      problems.push(`Round ${r.number}: expected ${r.qr_count} QRs, got ${inRound.length}.`);
    const wantKind = r.number === rounds ? "final" : "target";
    if (inRound.some((q) => q.kind !== wantKind))
      problems.push(`Round ${r.number}: every QR must be a ${wantKind} QR.`);
  });

  const next = new Map<string, string>();
  for (const l of plan.links) {
    const from = qrByRef.get(l.from);
    const to = qrByRef.get(l.to);
    if (!from || !to || from.round === null || to.round !== from.round + 1) {
      problems.push(`Link ${l.from} → ${l.to} must join a QR to one in the next round.`);
      continue;
    }
    if (next.has(l.from)) problems.push(`${l.from} links twice.`);
    next.set(l.from, l.to);
  }
  for (const q of plan.qrs) {
    if (q.kind === "target" && !next.has(q.ref))
      problems.push(`${q.ref} has no link to the next round (dead end).`);
  }
  const incoming = new Set(next.values());
  for (const q of plan.qrs) {
    if (q.round !== null && q.round > 1 && !incoming.has(q.ref))
      problems.push(`${q.ref} can never be reached.`);
  }

  const starts = new Set<string>();
  for (const team of teamIds) {
    const path = plan.assignments.filter((x) => x.team_id === team).sort((x, y) => x.round - y.round);
    if (path.length !== rounds || path.some((x, i) => x.round !== i + 1)) {
      problems.push(`Team ${team} needs exactly one QR per round.`);
      continue;
    }
    if (qrByRef.get(path[0]!.qr)?.round !== 1) problems.push(`Team ${team} must start on a round-1 QR.`);
    if (starts.has(path[0]!.qr)) problems.push(`Two teams start on ${path[0]!.qr}.`);
    starts.add(path[0]!.qr);
    for (let i = 1; i < path.length; i++) {
      if (next.get(path[i - 1]!.qr) !== path[i]!.qr)
        problems.push(`Team ${team}'s path breaks at round ${i + 1}.`);
    }
  }
  if (plan.assignments.some((x) => !teamIds.includes(x.team_id)))
    problems.push("Plan assigns an unknown team.");
  return [...new Set(problems)];
}

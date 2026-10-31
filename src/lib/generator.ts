// One-click game generator (D-009, F10): builds the pyramid of rounds, the QR set, the links between rounds,
// each team's path. The output is untrusted input to SQL: `apply_game_plan` re-validates
// every rule below and creates all tokens and keys on the server. No secret is ever generated here.

import { defaultAdvance, difficultyFor, pyramidCounts } from "./engine";

export type PlanRound = { number: number; qr_count: number; advance_count: number; difficulty: number };
export type PlanQr = {
  ref: string;
  round: number | null;
  kind: "target" | "final";
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
  /** D-042: each place's area (Main Block, MBA area, …). Consecutive places on a route never share one. */
  areas?: Record<string, string | null | undefined>;
  /** Map pins (0–1), so a link prefers the farthest next place. */
  pins?: Record<string, { x: number; y: number } | null | undefined>;
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

/** Most crews one round-1 QR may carry (apply_game_plan checks the same), a little above an even share for uneven buildings. */
const startLimit = (teams: number, qrs: number) => Math.ceil(teams / qrs) + 2;

export function generatePlan(input: GenerateInput): Plan {
  const teams = input.teamIds.length;
  if (teams < 1) throw new GeneratorError("NO_TEAMS", "Create at least one team before generating.");
  const counts = input.counts ?? pyramidCounts(teams);
  const countProblem = checkCounts(counts);
  if (countProblem) throw new GeneratorError("BAD_COUNTS", countProblem);
  const rounds = counts.length;
  const advance = input.advance ?? defaultAdvance(teams, rounds);
  const advanceProblem = checkAdvance(advance, rounds, teams);
  if (advanceProblem) throw new GeneratorError("BAD_ADVANCE", advanceProblem);

  const pyramid = counts.reduce((s, c) => s + c, 0);
  if (input.locationIds.length < pyramid) {
    throw new GeneratorError(
      "NOT_ENOUGH_LOCATIONS",
      `This game needs ${pyramid} locations; only ${input.locationIds.length} exist. Add locations or lower the QR counts.`,
    );
  }

  const rand = rng(input.seed);
  const places = shuffle(input.locationIds, rand);
  const perRound = placeRounds(places, counts, input.areas, rand);
  const areaOf = (id: string) => input.areas?.[id]?.trim() || null;

  const byRound: string[][] = [];
  const qrs: PlanQr[] = [];
  const placeOf = new Map<string, string>();
  counts.forEach((count, i) => {
    const round = i + 1;
    const final = round === rounds;
    const refs: string[] = [];
    for (let k = 0; k < count; k++) {
      const ref = qrRef(round, k, final);
      refs.push(ref);
      qrs.push({ ref, round, kind: final ? "final" : "target", location_id: perRound[i]![k]! });
      placeOf.set(ref, perRound[i]![k]!);
    }
    byRound.push(refs);
  });

  // Every QR links to one QR of the next round; every next-round QR gets at least one incoming link. Among the
  // choices, the farthest next place by map pin wins (D-042); without pins the pick is random.
  const far = (a: string, b: string) => {
    const p = input.pins?.[placeOf.get(a)!];
    const q = input.pins?.[placeOf.get(b)!];
    return p && q ? Math.hypot(p.x - q.x, p.y - q.y) + rand() * 1e-6 : rand();
  };
  const farthest = (from: string, options: string[]) =>
    options.reduce((best, o) => (far(from, o) > far(from, best) ? o : best), options[0]!);
  const differs = (a: string, b: string) => {
    const x = areaOf(placeOf.get(a)!);
    return !x || x !== areaOf(placeOf.get(b)!);
  };
  // A few shuffles can paint the last link into a corner; another shuffle finds a way.
  let links: PlanLink[] = [];
  const next = new Map<string, string>();
  for (let attempt = 0; ; attempt++) {
    links = [];
    next.clear();
    if (linkRounds()) break;
    if (attempt === 50)
      throw new GeneratorError("NOT_ENOUGH_LOCATIONS", "No route keeps every crew moving to another building. Add places in more buildings.");
  }
  function linkRounds(): boolean {
    for (let r = 0; r < rounds - 1; r++) {
      const left = shuffle(byRound[r]!, rand);
      const to = shuffle(byRound[r + 1]!, rand);
      const incoming = new Map(to.map((t) => [t, 0]));
      const join = (from: string, target: string) => {
        links.push({ from, to: target });
        next.set(from, target);
        incoming.set(target, incoming.get(target)! + 1);
        left.splice(left.indexOf(from), 1);
      };
      // Cover every next-round QR first, each with the farthest QR still free…
      for (const target of to) {
        const sources = left.filter((f) => differs(f, target));
        if (!left.length) break;
        if (!sources.length) return false;
        join(farthest(target, sources), target);
      }
      // …then the rest go to the least-used next QRs in another building, farthest first.
      while (left.length) {
        const from = left[0]!;
        const options = to.filter((t) => differs(from, t));
        if (!options.length) return false;
        const least = Math.min(...options.map((t) => incoming.get(t)!));
        join(from, farthest(from, options.filter((t) => incoming.get(t) === least)));
      }
    }
    return true;
  }

  // Each crew starts in the building with the fewest crews so far, on its least-used round-1 QR, so buildings get equal
  // crews. A building short of QRs stops at the per-QR limit and the others take the rest. After that the path follows
  // the links.
  const startGroups = new Map<string, string[]>();
  for (const ref of shuffle(byRound[0]!, rand)) {
    const key = areaOf(placeOf.get(ref)!) ?? "";
    startGroups.set(key, [...(startGroups.get(key) ?? []), ref]);
  }
  const perQr = startLimit(teams, counts[0]!);
  const onQr = new Map(byRound[0]!.map((ref) => [ref, 0]));
  const inGroup = new Map([...startGroups.keys()].map((key) => [key, 0]));
  const assignments: PlanAssignment[] = [];
  input.teamIds.forEach((team_id) => {
    const open = [...startGroups.entries()].filter(([, refs]) => refs.some((ref) => onQr.get(ref)! < perQr));
    const [key, refs] = open.reduce((best, g) => (inGroup.get(g[0])! < inGroup.get(best[0])! ? g : best));
    let qr = refs.reduce((best, ref) => (onQr.get(ref)! < onQr.get(best)! ? ref : best));
    inGroup.set(key, inGroup.get(key)! + 1);
    onQr.set(qr, onQr.get(qr)! + 1);
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

/**
 * Which places hold each round's QRs. With buildings (locations.area), each round takes from every building in
 * proportion to the places it has left, and always from at least two when it can. Working back from the final, a
 * building may only hold as many QRs as leaves enough elsewhere to lead into the next round's QRs in that building, so
 * every crew always has another building to go to.
 */
export function placeRounds(
  places: string[],
  counts: number[],
  areas: GenerateInput["areas"],
  rand: () => number,
): string[][] {
  const areaOf = (id: string) => areas?.[id]?.trim() || null;
  const pools = new Map<string, string[]>();
  for (const id of places) {
    const a = areaOf(id);
    if (a) pools.set(a, [...(pools.get(a) ?? []), id]);
  }
  if (pools.size < 2) {
    let k = 0;
    return counts.map((c) => places.slice(k, (k += c)));
  }
  const buildings = shuffle([...pools.keys()], rand);
  const left = (b: string) => pools.get(b)!.length;

  const fill = (count: number, after: Map<string, number>, nextTotal: number) => {
    const ids: string[] = [];
    const inRound = new Map(buildings.map((b) => [b, 0]));
    for (let k = 0; k < count; k++) {
      const open = buildings.filter(
        (b) => left(b) > 0 && inRound.get(b)! < count - (after.get(b) ?? 0) && (after.get(b) ?? 0) < Math.max(nextTotal, 1),
      );
      if (!open.length) {
        throw new GeneratorError(
          "NOT_ENOUGH_LOCATIONS",
          "Crews must change building every round: this course needs more places in the smaller buildings. Add places or lower the QR counts.",
        );
      }
      const fresh = open.filter((b) => inRound.get(b) === 0);
      const from = k === 1 && fresh.length ? fresh : open;
      const pick = from.reduce((best, b) =>
        left(b) / (inRound.get(b)! + 1) > left(best) / (inRound.get(best)! + 1) ? b : best,
      );
      inRound.set(pick, inRound.get(pick)! + 1);
      ids.push(pools.get(pick)!.pop()!);
    }
    return { ids, used: inRound };
  };

  const perRound: string[][] = counts.map(() => []);
  let after = new Map<string, number>();
  for (let r = counts.length - 1; r >= 0; r--) {
    const { ids, used } = fill(counts[r]!, after, counts[r + 1] ?? 0);
    perRound[r] = ids;
    after = used;
  }
  return perRound;
}

function checkCounts(counts: number[]): string | null {
  if (counts.length < 1 || counts.some((c) => !Number.isInteger(c) || c < 1))
    return "QR counts must be whole numbers ≥ 1.";
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
export function validatePlan(
  plan: Plan,
  teamIds: string[],
  locationIds: string[],
  areas?: GenerateInput["areas"],
): string[] {
  const problems: string[] = [];
  const rounds = plan.rounds.length;
  const counts = plan.rounds.map((r) => r.qr_count);
  plan.rounds.forEach((r, i) => {
    if (r.number !== i + 1) problems.push("Rounds must be numbered 1, 2, 3… in order.");
  });
  const c = checkCounts(counts);
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
    // D-042: the next place is never in the same area.
    const a = areas?.[from.location_id]?.trim();
    if (a && a === areas?.[to.location_id]?.trim()) problems.push(`${l.from} → ${l.to} stays in ${a}: the next place must be in another area.`);
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

  const perStart = new Map<string, number>();
  const maxPerStart = startLimit(teamIds.length, Math.max(1, counts[0] ?? 1));
  for (const team of teamIds) {
    const path = plan.assignments.filter((x) => x.team_id === team).sort((x, y) => x.round - y.round);
    if (path.length !== rounds || path.some((x, i) => x.round !== i + 1)) {
      problems.push(`Team ${team} needs exactly one QR per round.`);
      continue;
    }
    if (qrByRef.get(path[0]!.qr)?.round !== 1) problems.push(`Team ${team} must start on a round-1 QR.`);
    const n = (perStart.get(path[0]!.qr) ?? 0) + 1;
    perStart.set(path[0]!.qr, n);
    if (n > maxPerStart) problems.push(`Too many teams start on ${path[0]!.qr} (at most ${maxPerStart}).`);
    for (let i = 1; i < path.length; i++) {
      if (next.get(path[i - 1]!.qr) !== path[i]!.qr)
        problems.push(`Team ${team}'s path breaks at round ${i + 1}.`);
    }
  }
  if (plan.assignments.some((x) => !teamIds.includes(x.team_id)))
    problems.push("Plan assigns an unknown team.");
  return [...new Set(problems)];
}

// The generator page (Generator.dc.html, T-404): the applied course read back from the database, the checks
// before generating, and the pyramid drawing's layout. Pure: unit-tested in admin.test.ts.
import { difficultyFor, TEAM_SIZE } from "@/lib/engine";
import { validatePlan, type Plan } from "@/lib/generator";
import { roman } from "@/lib/player/format";
import type { CourseQr, Location } from "./types";

export type CourseRound = { number: number; qr_count: number; advance_count: number; difficulty: number };
export type Course = Plan & { spares: string[] };

/** The applied course as a Plan (refs = printed labels), or null when nothing is generated yet. */
export function courseFromDb(
  rounds: CourseRound[],
  qrs: CourseQr[],
  links: { from_qr: string; to_qr: string }[],
  assignments: { team_id: string; round: number; qr_id: string }[],
): Course | null {
  if (!rounds.length) return null;
  const label = new Map(qrs.map((q) => [q.id, q.label]));
  return {
    rounds: [...rounds].sort((a, b) => a.number - b.number),
    qrs: qrs
      .filter((q) => q.kind !== "universal")
      .map((q) => ({
        ref: q.label,
        round: q.round,
        kind: q.kind as "target" | "final" | "prank",
        location_id: q.location_id ?? "",
      })),
    links: links
      .filter((l) => label.has(l.from_qr) && label.has(l.to_qr))
      .map((l) => ({ from: label.get(l.from_qr)!, to: label.get(l.to_qr)! })),
    assignments: assignments
      .filter((a) => label.has(a.qr_id))
      .map((a) => ({ team_id: a.team_id, round: a.round, qr: label.get(a.qr_id)! })),
    spares: qrs.filter((q) => q.is_spare).map((q) => q.label),
  };
}

/** Round-1 marks no crew starts on (D-009): the admin can re-point a crew to one. */
export function sparesOf(plan: Plan): string[] {
  const starts = new Set(plan.assignments.filter((a) => a.round === 1).map((a) => a.qr));
  return plan.qrs.filter((q) => q.round === 1 && !starts.has(q.ref)).map((q) => q.ref);
}

export type Check = { level: "ok" | "warn" | "error"; text: string; link?: { href: string; label: string } };

export type CheckInput = {
  plan: Plan | null;
  planError: string | null;
  teams: { id: string; name: string; status: string; members: number; has_route?: boolean }[];
  locations: CourseLocation[];
  questionsByDifficulty: Record<string, number>;
};

/** A place as the course checks see it: its pin and its clue sets (T-507). */
export type CourseLocation = Pick<Location, "id" | "name" | "map_x" | "map_y" | "area"> & {
  clue_sets: { pieces: string[] }[];
};

/** What the generator needs from the places: areas and pins (D-042). */
export const placeInputs = (locations: Pick<CourseLocation, "id" | "area" | "map_x" | "map_y">[]) => ({
  locationIds: locations.map((l) => l.id),
  areas: Object.fromEntries(locations.map((l) => [l.id, l.area])),
  pins: Object.fromEntries(
    locations.map((l) => [l.id, l.map_x === null || l.map_y === null ? null : { x: l.map_x, y: l.map_y }]),
  ),
});

const fullSet = (pieces: string[]) => pieces.length === 4 && pieces.every((p) => p.trim().length > 0);
/** Complete clue sets of a place: each game draws one of them (D-033). */
const fullSets = (l: Pick<CourseLocation, "clue_sets">) => l.clue_sets.filter((s) => fullSet(s.pieces)).length;
const list = (names: string[], max = 3) =>
  names.slice(0, max).join(", ") + (names.length > max ? ` and ${names.length - max} more` : "");

/** The Checks panel. "error" blocks Generate; "warn" doesn't (the content can be finished later). */
export function courseChecks(x: CheckInput): Check[] {
  const out: Check[] = [];
  const n = x.teams.length;
  if (n === 0) {
    out.push({ level: "error", text: "No crews yet.", link: { href: "/admin/crews", label: "Create crews" } });
    return out;
  }
  const full = x.teams.filter((t) => t.members === TEAM_SIZE).length;
  out.push(
    full === n
      ? { level: "ok", text: `All ${n} crews have exactly 4 members` }
      : { level: "warn", text: `${full} of ${n} crews have 4 members. Start needs every crew full.` },
  );

  if (x.planError) {
    out.push({ level: "error", text: x.planError, link: { href: "/admin/locations", label: "Locations" } });
    return out;
  }
  if (!x.plan) return out;

  const spots = x.plan.qrs.length;
  out.push({ level: "ok", text: `${x.locations.length} locations for ${spots} marks` });

  // Routes: New Game keeps the printed course but draws new routes at Start (D-027); crews created after
  // generating get a spare round-I mark at Start. Either way the server assigns them, so only check the rest.
  const routed = new Set(x.plan.assignments.map((a) => a.team_id));
  const unrouted = x.teams.filter((t) => !routed.has(t.id));
  const problems = validatePlan(
    x.plan,
    x.teams.map((t) => t.id),
    x.locations.map((l) => l.id),
    Object.fromEntries(x.locations.map((l) => [l.id, l.area])),
  )
    .filter((p) => !unrouted.some((t) => p.includes(t.id)))
    .map((p) => x.teams.reduce((s, t) => s.split(t.id).join(t.name), p));
  const pathProblem = problems.find((p) => /path|start|QR per round/i.test(p));
  const linkProblem = problems.find((p) => /dead end|never be reached|links|Link/.test(p));
  if (pathProblem) out.push({ level: "error", text: pathProblem });
  else if (routed.size === 0) out.push({ level: "ok", text: "Every crew gets a new random route at Start" });
  else if (unrouted.length) {
    const free = sparesOf(x.plan).length;
    out.push(
      unrouted.length <= free
        ? {
            level: "warn",
            text: `${list(unrouted.map((t) => t.name))} joined after this course was made; Start gives ${unrouted.length === 1 ? "it a spare" : "them spare"} round-I marks.`,
          }
        : {
            level: "error",
            text: `${unrouted.length} crews have no route and only ${free} spare round-I marks are left. Generate again.`,
          },
    );
  } else out.push({ level: "ok", text: "Every crew has a path to the final" });
  out.push(linkProblem ? { level: "error", text: linkProblem } : { level: "ok", text: "No dead ends between rounds" });
  for (const p of problems.filter((p) => p !== pathProblem && p !== linkProblem).slice(0, 3))
    out.push({ level: "error", text: p });

  const byId = new Map(x.locations.map((l) => [l.id, l]));
  const marks = x.plan.qrs.filter((q) => q.kind !== "prank");
  const noClue = marks.filter((q) => fullSets(byId.get(q.location_id) ?? { clue_sets: [] }) === 0);
  if (noClue.length)
    out.push({
      level: "warn",
      text: `${noClue.length} mark${noClue.length === 1 ? " sits" : "s sit"} at places without all 4 clue pieces: ${list(noClue.map((q) => byId.get(q.location_id)?.name ?? q.ref))}.`,
      link: { href: "/admin/locations", label: "Write clues" },
    });
  else {
    const several = marks.filter((q) => fullSets(byId.get(q.location_id) ?? { clue_sets: [] }) >= 2).length;
    out.push({
      level: "ok",
      text: `${several} of ${marks.length} marks have 2 or more clue sets: a different clue each game and for crews sharing a mark`,
    });
  }
  const noPin = marks.filter((q) => {
    const l = byId.get(q.location_id);
    return !l || l.map_x === null || l.map_y === null;
  });
  if (noPin.length)
    out.push({
      level: "warn",
      text: `${noPin.length} mark${noPin.length === 1 ? " has" : "s have"} no map pin, so the fog can't lift over ${noPin.length === 1 ? "it" : "them"}.`,
      link: { href: "/admin/locations", label: "Pin them" },
    });

  // A crew needs 4 unseen questions per round; teams may share questions, so each difficulty needs
  // 4 × (rounds at that difficulty). The server falls back to the nearest difficulty when short.
  const rounds = x.plan.rounds;
  const need = new Map<number, number[]>();
  rounds.forEach((r) => need.set(r.difficulty, [...(need.get(r.difficulty) ?? []), r.number]));
  const short: string[] = [];
  for (const [d, rs] of need) {
    const missing = 4 * rs.length - (x.questionsByDifficulty[String(d)] ?? 0);
    if (missing > 0)
      short.push(
        `Round${rs.length > 1 ? "s" : ""} ${rs.map((r) => roman(r)).join(", ")} need${rs.length > 1 ? "" : "s"} ${missing} more difficulty-${d} question${missing === 1 ? "" : "s"}`,
      );
  }
  const total = Object.values(x.questionsByDifficulty).reduce((a, b) => a + b, 0);
  if (total < 4 * rounds.length)
    out.push({
      level: "warn",
      text: `Only ${total} enabled questions; Start needs at least ${4 * rounds.length}.`,
      link: { href: "/admin/questions", label: "Questions" },
    });
  else if (short.length)
    out.push({
      level: "warn",
      text: `${short.slice(0, 2).join("; ")}.${short.length > 2 ? ` (+${short.length - 2} more)` : ""} Nearby difficulties fill in.`,
      link: { href: "/admin/questions", label: "Questions" },
    });
  else out.push({ level: "ok", text: "Enough questions for every round" });
  return out;
}

/** Difficulty per round as the generator assigns it. */
export const difficulties = (rounds: number) => Array.from({ length: rounds }, (_, i) => difficultyFor(i + 1, rounds));

// ── Pyramid drawing (viewBox 0 0 840 510, as in Generator.dc.html) ────────────────────────────────────
export type Node = { ref: string; round: number; x: number; y: number; final: boolean; spare: boolean };
export type Layout = { nodes: Node[]; byRef: Map<string, Node>; rowY: (round: number) => number; scale: number };

export const VIEW = { w: 840, h: 510, left: 108, right: 752, top: 62, bottom: 470 };

/**
 * Rows from round I (bottom) to the final (top). Round I keeps label order; each later round is ordered by
 * the mean position of the marks that lead to it, so links mostly run straight up.
 */
export function layoutPyramid(plan: Plan, spares: string[] = sparesOf(plan)): Layout {
  const rounds = plan.rounds.length;
  const gap = rounds > 1 ? (VIEW.bottom - VIEW.top) / (rounds - 1) : 0;
  const rowY = (r: number) => (rounds > 1 ? VIEW.bottom - (r - 1) * gap : (VIEW.top + VIEW.bottom) / 2);
  const widest = Math.max(1, ...plan.rounds.map((r) => r.qr_count));
  const spacing = Math.min(46, (VIEW.right - VIEW.left) / Math.max(1, widest - 1));
  const scale = Math.min(1, spacing / 26);
  const spare = new Set(spares);
  const center = (VIEW.left + VIEW.right) / 2;
  const byRef = new Map<string, Node>();
  const incoming = new Map<string, string[]>();
  for (const l of plan.links) incoming.set(l.to, [...(incoming.get(l.to) ?? []), l.from]);

  for (let r = 1; r <= rounds; r++) {
    let refs = plan.qrs.filter((q) => q.round === r).map((q) => q.ref);
    if (r === 1) refs.sort();
    else {
      const mean = (ref: string) => {
        const xs = (incoming.get(ref) ?? []).map((f) => byRef.get(f)?.x ?? center);
        return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : center;
      };
      refs = refs.map((ref) => [ref, mean(ref)] as const).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([ref]) => ref);
    }
    const width = (refs.length - 1) * spacing;
    refs.forEach((ref, i) =>
      byRef.set(ref, {
        ref,
        round: r,
        x: center - width / 2 + i * spacing,
        y: rowY(r),
        final: r === rounds,
        spare: spare.has(ref),
      }),
    );
  }
  return { nodes: [...byRef.values()], byRef, rowY, scale };
}

/** The labels a crew visits, round by round. */
export function pathOf(plan: Plan, teamId: string): string[] {
  return plan.assignments
    .filter((a) => a.team_id === teamId)
    .sort((a, b) => a.round - b.round)
    .map((a) => a.qr);
}

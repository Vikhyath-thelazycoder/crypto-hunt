// Pure mirror of the game rules (PRD › Game rules, SYSTEM_WORKFLOW.md). The SQL engine is the authority;
// this module drives UI enablement, the generator and the bot simulation, and is tested on the same cases.

export const FIRST_ROUND_FACTOR = 1.5;
/** Round 1 never has more than 15 QRs (D-039): the venue is sized for 10 teams; more teams share. */
export const MAX_FIRST_ROUND = 15;
export const SHRINK_FACTOR = 0.6;
export const PODIUM = 3;
export const MAX_DIFFICULTY = 5;
/** One phone per crew (T-1101): only the lead has an account; the 3 teammates are names on the crew. */
export const TEAM_SIZE = 1;

export type GameStatus = "SETUP" | "REGISTRATION" | "READY" | "RUNNING" | "PAUSED" | "FINISHED";
export type Phase =
  "SOLVING" | "SEEKING" | "CHECKING_IN" | "PENALTY" | "COMPLETED" | "FINISHED" | "ELIMINATED";
export type TeamStatus = "forming" | "locked" | "active" | "eliminated" | "finished" | "disqualified";

/**
 * QR count per round (D-009, D-039): round 1 = ⌈1.5 × teams⌉ capped at 15, then ⌈0.6 × previous⌉ but always
 * at least one fewer, down to a single final QR. 10 teams or more → 15, 9, 6, 4, 3, 2, 1.
 */
export function pyramidCounts(teams: number): number[] {
  if (!Number.isInteger(teams) || teams < 1) throw new Error("teams must be a positive integer");
  const counts = [Math.min(MAX_FIRST_ROUND, Math.ceil(teams * FIRST_ROUND_FACTOR))];
  while (counts[counts.length - 1]! > 1) {
    const prev = counts[counts.length - 1]!;
    counts.push(Math.min(prev - 1, Math.ceil(prev * SHRINK_FACTOR)));
  }
  return counts;
}

/** Question difficulty for a round, rising from 1 to 5 across the hunt. */
export function difficultyFor(round: number, rounds: number): number {
  return Math.max(1, Math.min(MAX_DIFFICULTY, Math.ceil((round * MAX_DIFFICULTY) / rounds)));
}

/**
 * Suggested X (teams that advance) per round (D-012): shrinks geometrically from the team count to the
 * podium, never increases, and the final round is the podium (3, or fewer if fewer teams play).
 */
export function defaultAdvance(teams: number, rounds: number): number[] {
  const podium = Math.min(PODIUM, teams);
  const out: number[] = [];
  for (let r = 1; r <= rounds; r++) {
    const ideal = Math.round(teams * (podium / teams) ** (r / rounds));
    const prev = out[r - 2] ?? teams;
    out.push(r === rounds ? podium : Math.max(podium, Math.min(prev, ideal)));
  }
  return out;
}

// ── Scan resolution (SYSTEM_WORKFLOW.md › Scan resolution, D-025) ─────────────────────────────────────

export type QrKind = "target" | "final";

export type ScanContext = {
  gameStatus: GameStatus;
  teamStatus: TeamStatus;
  teamRound: number;
  phase: Phase;
  qr: { kind: QrKind; round: number | null; assignedToTeam: boolean } | null;
  alreadyCheckedIn: boolean;
};

export type ScanResult =
  | "NOT_RUNNING"
  | "PAUSED"
  | "ELIMINATED"
  | "FINISHED"
  | "BAD_QR"
  | "QUESTION"
  | "PRANK"
  | "ALREADY_DONE"
  | "LOCKED_MARK"
  | "NOT_YOURS"
  | "SOLVE_FIRST"
  | "ALREADY_CHECKED_IN"
  | "ASK_KEY"
  | "ASK_KEY_AND_SEAL";

export function resolveScan(c: ScanContext): ScanResult {
  if (c.gameStatus === "PAUSED") return "PAUSED";
  if (c.gameStatus !== "RUNNING") return "NOT_RUNNING";
  if (c.teamStatus === "eliminated" || c.teamStatus === "disqualified") return "ELIMINATED";
  if (c.teamStatus === "finished") return "FINISHED";
  if (!c.qr) return "BAD_QR";
  const round = c.qr.round ?? 0;
  if (round < c.teamRound) return "ALREADY_DONE";
  // A later round's mark: same answer whether or not it is on the team's path, and nothing is stored.
  if (round > c.teamRound) return "LOCKED_MARK";
  if (!c.qr.assignedToTeam) return "NOT_YOURS";
  if (c.phase === "SOLVING") return "SOLVE_FIRST";
  if (c.phase !== "SEEKING" && c.phase !== "CHECKING_IN") return "ALREADY_DONE";
  if (c.alreadyCheckedIn) return "ALREADY_CHECKED_IN";
  return c.qr.kind === "final" ? "ASK_KEY_AND_SEAL" : "ASK_KEY";
}

// ── Check-in, round close, ranking ──────────────────────────────────────────────────────────────────

/** After a member's key is accepted: wait for the rest, serve the hint penalty, or complete. */
export function checkinOutcome(activeMembers: number, checkedIn: number, penaltyMs: number) {
  if (checkedIn < activeMembers) return "WAITING" as const;
  return penaltyMs > 0 ? ("PENALTY" as const) : ("COMPLETE" as const);
}

/**
 * Round close (D-012): the moment `advance` teams have completed the round it closes, and every team
 * still racing that hasn't completed it is eliminated.
 */
export function roundClose(advance: number, completedInOrder: string[], racing: string[]) {
  if (completedInOrder.length < advance) return { closed: false, eliminated: [] as string[] };
  const done = new Set(completedInOrder);
  return { closed: true, eliminated: racing.filter((t) => !done.has(t)) };
}

export type RankInput = { id: string; roundsCompleted: number; lastCompletedAt: number | null };

/** End-game ranking (D-014): most rounds completed, then the earliest completion of the last one. */
export function rankTeams(teams: RankInput[]): string[] {
  return [...teams]
    .sort(
      (a, b) =>
        b.roundsCompleted - a.roundsCompleted ||
        (a.lastCompletedAt ?? Infinity) - (b.lastCompletedAt ?? Infinity) ||
        a.id.localeCompare(b.id),
    )
    .map((t) => t.id);
}

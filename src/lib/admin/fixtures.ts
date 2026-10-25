// Sample snapshots for the admin unit and component tests, shaped like admin_snapshot() (migration 0013).
import type { SnapMember, SnapTeam, Snapshot } from "./types";

export const T0 = Date.parse("2026-10-25T10:00:00Z");
export const iso = (msAfterStart: number) => new Date(T0 + msAfterStart).toISOString();

export function member(name: string, over: Partial<SnapMember> = {}): SnapMember {
  return {
    id: `p-${name}`,
    name,
    is_active: true,
    joined_at: iso(-600_000),
    opened: true,
    solved: false,
    scanned: false,
    checked_in: false,
    ...over,
  };
}

export function team(n: number, over: Partial<SnapTeam> = {}): SnapTeam {
  return {
    id: `t${n}`,
    number: n,
    name: `Crew ${n}`,
    code: "HX7RMK",
    status: "active",
    final_rank: null,
    completion_key: null,
    eliminated_in_round: null,
    eliminated_at: null,
    has_route: true,
    round: 1,
    phase: "SOLVING",
    penalty_ms: 0,
    penalty_until: null,
    round_started_at: iso(0),
    phase_since: iso(0),
    locked_scans: 0,
    target: "R1-01",
    pieces_solved: 0,
    hints_round: 0,
    hints_total: 0,
    rounds_completed: 0,
    last_completed_at: null,
    members: ["Ana", "Ben", "Cy", "Dev"].map((m) => member(m)),
    ...over,
  };
}

export function snapshot(over: Partial<Snapshot> = {}, game: Partial<Snapshot["game"]> = {}): Snapshot {
  return {
    now: iso(60_000),
    game: {
      status: "RUNNING",
      registration_open: false,
      hints_enabled: false,
      hint_penalty_ms: 120_000,
      mcq_lockout_ms: 120_000,
      paused_at: null,
      broadcast: null,
      broadcast_at: null,
      started_at: iso(0),
      finished_at: null,
      end_reason: null,
      resumed_at: null,
      ...game,
    },
    rounds: [
      { number: 1, qr_count: 5, advance: 3, difficulty: 2, is_final: false, closed_at: null, completed: 0 },
      { number: 2, qr_count: 3, advance: 2, difficulty: 4, is_final: false, closed_at: null, completed: 0 },
      { number: 3, qr_count: 1, advance: 2, difficulty: 5, is_final: true, closed_at: null, completed: 0 },
    ],
    teams: [team(1), team(2), team(3)],
    alerts: [],
    open_alerts: 0,
    open_by_kind: {},
    pranks: { total: 0, top_team: null, top_count: null },
    log: [],
    course: { marks: 9, pranks: 2, spares: 2, universal: true },
    questions: { enabled: 40, by_difficulty: { "2": 10, "4": 10, "5": 10, "1": 10 } },
    locations: 12,
    ...over,
  };
}

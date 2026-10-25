// Shapes the admin console reads (admin_snapshot in migration 0013, plus admin-only tables through RLS).
import type { GameStatus, Phase, TeamStatus } from "@/lib/engine";

export type { GameStatus, Phase, TeamStatus };

export type SnapMember = {
  id: string;
  name: string;
  is_active: boolean;
  joined_at: string;
  opened: boolean;
  solved: boolean;
  scanned: boolean;
  checked_in: boolean;
};

export type SnapTeam = {
  id: string;
  number: number;
  name: string;
  code: string;
  status: TeamStatus;
  final_rank: number | null;
  completion_key: string | null;
  eliminated_in_round: number | null;
  eliminated_at: string | null;
  has_route: boolean;
  round: number | null;
  phase: Phase | null;
  penalty_ms: number | null;
  penalty_until: string | null;
  round_started_at: string | null;
  phase_since: string | null;
  locked_scans: number | null;
  target: string | null;
  pieces_solved: number;
  hints_round: number;
  hints_total: number;
  rounds_completed: number;
  last_completed_at: string | null;
  members: SnapMember[];
};

export type SnapRound = {
  number: number;
  qr_count: number;
  advance: number;
  difficulty: number;
  is_final: boolean;
  closed_at: string | null;
  completed: number;
};

export type SnapAlert = {
  id: number;
  kind: string;
  data: Record<string, unknown>;
  at: string;
  team_id: string | null;
  team: string | null;
  player: string | null;
  place: string | null;
};

export type LogEntry = {
  src: "event" | "audit";
  id: number;
  kind: string;
  data: Record<string, unknown>;
  at: string;
  team: string | null;
  player: string | null;
  reason: string | null;
  /** Audit only: the round, team or player id the action targeted. */
  target: string | null;
  place: string | null;
};

export type Snapshot = {
  now: string;
  game: {
    status: GameStatus;
    registration_open: boolean;
    hints_enabled: boolean;
    hint_penalty_ms: number;
    mcq_lockout_ms: number;
    paused_at: string | null;
    broadcast: string | null;
    broadcast_at: string | null;
    started_at: string | null;
    finished_at: string | null;
    end_reason: string | null;
    resumed_at: string | null;
  };
  rounds: SnapRound[];
  teams: SnapTeam[];
  alerts: SnapAlert[];
  open_alerts: number;
  open_by_kind: Record<string, number>;
  pranks: { total: number; top_team: string | null; top_count: number | null };
  log: LogEntry[];
  course: { marks: number; pranks: number; spares: number; universal: boolean };
  questions: { enabled: number; by_difficulty: Record<string, number> };
  locations: number;
};

export type Location = {
  id: string;
  name: string;
  notes: string | null;
  map_x: number | null;
  map_y: number | null;
  reveal_radius: number;
  clue_pieces: string[];
  hint: string | null;
  created_at: string;
};

export type VenueMap = { id: number; image_path: string | null; width: number | null; height: number | null };

/** A QR of the applied course (admin only: qr_codes is never readable by players). */
export type CourseQr = {
  id: string;
  label: string;
  round: number | null;
  kind: "universal" | "target" | "final" | "prank";
  is_spare: boolean;
  location_id: string | null;
};

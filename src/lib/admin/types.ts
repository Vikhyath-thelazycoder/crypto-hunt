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
  /** The 3 teammates (names only; the lead is the one member with a phone). */
  crew?: string[];
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
    wrong_penalty_ms: number;
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
  /** D-043: the place's number (as in docs/venue/locations.md), building, floor and landmark. */
  place_no: number | null;
  building: string | null;
  floor: string | null;
  landmark: string | null;
  /** D-042: route area (e.g. Main Block, MBA area); a crew's next place is never in the same one. */
  area: string | null;
  /** Where to hide the card (big places only). */
  notes: string | null;
  map_x: number | null;
  map_y: number | null;
  reveal_radius: number;
  created_at: string;
};

/** One of a place's up to 3 clues (T-507, D-033): 4 pieces, one per member, and a hint. */
export type ClueSet = { location_id: string; set_no: number; pieces: string[]; riddle: string | null; hint: string | null };

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

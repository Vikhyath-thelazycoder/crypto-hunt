// Shapes returned by the player RPCs (supabase/migrations 0004, 0009). Answers and secrets never appear here.

export type GameStatus = "SETUP" | "REGISTRATION" | "READY" | "RUNNING" | "PAUSED" | "FINISHED";
export type Phase =
  "SOLVING" | "SEEKING" | "CHECKING_IN" | "PENALTY" | "COMPLETED" | "FINISHED" | "ELIMINATED";
export type TeamStatus = "forming" | "locked" | "active" | "eliminated" | "finished" | "disqualified";

export type Member = {
  id: string;
  name: string;
  is_active: boolean;
  me: boolean;
  solved: boolean;
  checked_in: boolean;
};

export type Task = {
  id: string;
  opened: boolean;
  solved: boolean;
  hint_used: boolean;
  has_hint: boolean;
  text: string | null;
  format: "mcq" | "text" | "number" | null;
  options: string[] | null;
  hint: string | null;
  category: string | null;
  difficulty: number;
  piece_index: number;
  /** Misses since the last penalty (0–2); every 3rd adds the wrong-answer penalty (D-041). */
  strikes: number;
};

export type Piece = {
  index: number;
  solved: boolean;
  text: string | null;
  by: string | null;
  mine: boolean;
  hint: boolean;
};

export type MyStatus = {
  ok: true;
  player: { id: string; name: string; is_active: boolean };
  team: {
    id: string;
    number: number;
    name: string;
    code: string;
    status: TeamStatus;
    final_rank: number | null;
    eliminated_in_round: number | null;
    eliminated_view: "game_over" | "spectator" | null;
    completion_key: string | null;
  };
  game: {
    status: GameStatus;
    hints_enabled: boolean;
    broadcast: string | null;
    broadcast_at: string | null;
    hint_penalty_ms: number;
    wrong_penalty_ms: number;
  };
  members: Member[];
  round: { number: number; total: number; is_final: boolean; difficulty: number } | null;
  phase: Phase | null;
  penalty: { ms: number; until: string | null } | null;
  task: Task | null;
  pieces: Piece[];
  region: { x: number; y: number; r: number } | null;
  seal_code: string | null;
};

export type PublicTeam = {
  id: string;
  number: number;
  name: string;
  status: TeamStatus;
  final_rank: number | null;
  eliminated_in_round: number | null;
  round: number | null;
  phase: Phase | null;
  members: number;
  rounds_completed: number;
  checked_in: number;
};

export type PublicState = {
  status: GameStatus;
  paused: boolean;
  broadcast: string | null;
  broadcast_at: string | null;
  finished_at: string | null;
  universal_token: string | null;
  total_rounds: number;
  rounds: { number: number; advance: number; is_final: boolean; closed: boolean; completed: number }[];
  teams: PublicTeam[];
};

/** What scan_qr can answer (SYSTEM_WORKFLOW › Scan resolution). */
export type ScanReply =
  | { ok: true; result: "QUESTION" }
  | { ok: true; result: "PRANK"; round: number; fake_key: string }
  | { ok: true; result: "ASK_KEY" | "ASK_KEY_AND_SEAL"; qr: string }
  | { ok: false; code: string; round?: number };

export type Reply = { ok: boolean; code?: string; [k: string]: unknown };

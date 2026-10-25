"use client";

import { adminEmail } from "@/lib/admin-email";
import type { Plan } from "@/lib/generator";
import type { QuestionInput } from "./questions";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { Snapshot } from "./types";

/** An admin RPC or table write the server refused. `detail` carries e.g. the BAD_PLAN reason. */
export class AdminError extends Error {
  constructor(
    readonly code: string,
    readonly detail: string | null = null,
  ) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

/** Server messages → a code: raised codes (`BAD_PLAN: …`), then Postgres constraint errors. */
export function toAdminError(message: string | undefined | null): AdminError {
  const m = (message ?? "").trim();
  const raised = m.match(/^([A-Z][A-Z_]+)(?::\s*(.+))?$/);
  if (raised) return new AdminError(raised[1]!, raised[2] ?? null);
  if (/duplicate key/i.test(m)) return new AdminError("DUPLICATE");
  if (/foreign key/i.test(m)) return new AdminError("IN_USE");
  if (/check constraint|violates not-null|invalid input/i.test(m)) return new AdminError("INVALID");
  return new AdminError("SERVER");
}

async function rpc<T = void>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await getBrowserSupabase().rpc(fn, args);
  if (error) throw toAdminError(error.message);
  return data as T;
}

/** Throws AdminError for a failed table read or write. */
export function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw toAdminError(res.error.message);
  return res.data;
}

// ── Session (D-006: admin name + passcode) ─────────────────────────────────────────────────────────

export async function signInAdmin(name: string, passcode: string): Promise<"ok" | "wrong" | "not_admin"> {
  const supabase = getBrowserSupabase();
  let email: string;
  try {
    email = adminEmail(name);
  } catch {
    return "wrong";
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password: passcode });
  if (error) {
    if (/rate/i.test(error.message)) throw new AdminError("RATE_LIMITED");
    return "wrong";
  }
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) {
    await supabase.auth.signOut({ scope: "local" });
    return "not_admin";
  }
  return "ok";
}

export async function signOutAdmin() {
  await getBrowserSupabase().auth.signOut({ scope: "local" });
}

// ── Reads ───────────────────────────────────────────────────────────────────────────────────────────
export const adminSnapshot = () => rpc<Snapshot>("admin_snapshot");

// ── Setup ───────────────────────────────────────────────────────────────────────────────────────────
export const createTeams = (count: number) =>
  rpc<{ id: string; number: number; name: string; code: string }[]>("create_teams", { p_count: count });
export const renameTeam = (team: string, name: string) => rpc("rename_team", { p_team: team, p_name: name });
export const deleteTeam = (team: string, reason: string) =>
  rpc("delete_team", { p_team: team, p_reason: reason });
export const setRegistration = (open: boolean) => rpc("set_registration", { p_open: open });
export const applyGamePlan = (plan: Plan) =>
  rpc<{ rounds: number; qrs: number }>("apply_game_plan", { p_plan: plan });

// ── Running the hunt ────────────────────────────────────────────────────────────────────────────────
export const startGame = () => rpc("start_game");
export const pauseGame = () => rpc("pause_game");
export const resumeGame = () => rpc("resume_game");
export const broadcast = (text: string) => rpc("broadcast", { p_text: text });
export const setHints = (enabled: boolean) => rpc("set_hints", { p_enabled: enabled });
export const setMcqLockout = (ms: number) => rpc("set_mcq_lockout", { p_ms: ms });
export const setAdvanceCount = (round: number, x: number) =>
  rpc("set_advance_count", { p_round: round, p_x: x });
export const endGame = (reason: string) => rpc("end_game", { p_reason: reason });
export const startNewGame = (confirm: string, regenerateQr: boolean) =>
  rpc("start_new_game", { p_confirm: confirm, p_regenerate_qr: regenerateQr });

// ── Overrides (reason required, audited) ────────────────────────────────────────────────────────────
export const moveTeam = (team: string, round: number, reason: string) =>
  rpc("move_team", { p_team: team, p_round: round, p_reason: reason });
export const setMemberInactive = (player: string, inactive: boolean, reason: string) =>
  rpc("set_member_inactive", { p_player: player, p_inactive: inactive, p_reason: reason });
export const repointTeam = (team: string, qr: string, reason: string) =>
  rpc("repoint_team", { p_team: team, p_qr: qr, p_reason: reason });
export const kickPlayer = (player: string, reason: string) =>
  rpc("kick_player", { p_player: player, p_reason: reason });
export const disqualifyTeam = (team: string, reason: string) =>
  rpc("disqualify_team", { p_team: team, p_reason: reason });
export const forceComplete = (team: string, reason: string) =>
  rpc<Record<string, unknown>>("force_complete", { p_team: team, p_reason: reason });

// ── Alerts and export ───────────────────────────────────────────────────────────────────────────────
export const ackAlert = (id: number) => rpc("ack_alert", { p_id: id });
export const ackAllAlerts = () => rpc<number>("ack_all_alerts");
export const exportResults = () => rpc<ExportData>("export_results");

export type ExportData = {
  game: Record<string, unknown> | null;
  teams: {
    number: number;
    name: string;
    status: string;
    final_rank: number | null;
    eliminated_in_round: number | null;
    members: string[];
    rounds: { round: number; completed_at: string; order: number }[];
  }[];
  events: { at: string; team: string | null; kind: string; data: Record<string, unknown> }[];
  audit: {
    id: number;
    admin_id: string | null;
    action: string;
    target: string | null;
    reason: string | null;
    data: Record<string, unknown>;
    at: string;
  }[];
};

// ── Question bank (T-501) ───────────────────────────────────────────────────────────────────────────
// Table writes under the admin_write policy; the shape is checked first by checkQuestion (lib/admin/questions).
export type QuestionRow = {
  id: string;
  text: string;
  format: QuestionInput["format"];
  difficulty: number;
  category: string | null;
  is_enabled: boolean;
};

const db = () => getBrowserSupabase().from("questions");

/** The bank for the list: no answers, no options. */
export const listQuestions = async () =>
  check(
    await db().select("id, text, format, difficulty, category, is_enabled").order("difficulty").order("created_at").limit(5000),
  ) as QuestionRow[];

/** One question with its answer, for the editor only. */
export const getQuestion = async (id: string) =>
  check(
    await db().select("text, format, options, answer, alternatives, hint, difficulty, category").eq("id", id).single(),
  ) as QuestionInput;

export const saveQuestion = async (id: string | null, q: QuestionInput) => {
  check(id ? await db().update(q).eq("id", id) : await db().insert(q));
};

export const setQuestionEnabled = async (id: string, on: boolean) => {
  check(await db().update({ is_enabled: on }).eq("id", id));
};

export const deleteQuestion = async (id: string) => {
  check(await db().delete().eq("id", id));
};

/** Inserts in batches of 200; returns how many went in before any refusal. */
export async function insertQuestions(qs: QuestionInput[], onProgress?: (done: number) => void): Promise<number> {
  let done = 0;
  for (let i = 0; i < qs.length; i += 200) {
    const batch = qs.slice(i, i + 200);
    check(await db().insert(batch));
    done += batch.length;
    onProgress?.(done);
  }
  return done;
}

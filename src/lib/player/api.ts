"use client";

import { publicEnv } from "@/lib/env";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { CheckInReply, MyStatus, Reply } from "./types";

/** A guard failure the server raised (NOT_REGISTERED, SESSION_MOVED, …) or a network failure. */
export class PlayerError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await getBrowserSupabase().rpc(fn, args);
  if (error) throw new PlayerError(/^[A-Z_]+$/.test(error.message) ? error.message : "SERVER");
  return data as T;
}

export const myStatus = () => rpc<MyStatus>("my_status");
/** T-1104: one request a round, with the token from the QR or the code typed from the card. */
export const checkIn = (code: string, sealCode?: string) =>
  rpc<CheckInReply>("check_in", { p_code: code, p_seal_code: sealCode ?? null });
export const submitAnswer = (taskId: string, answer: string) =>
  rpc<
    Reply & {
      correct?: boolean;
      pieces?: number;
      replaced?: boolean;
      strikes?: number;
      penalized?: boolean;
      penalty_ms?: number;
    }
  >("submit_answer", {
    p_task_id: taskId,
    p_answer: answer,
  });
export const takeHint = (taskId: string) =>
  rpc<Reply & { hint?: string; penalty_ms?: number }>("use_hint", { p_task_id: taskId });
export const completeRound = () => rpc<Reply>("complete_round");
export const reportFocusEvent = (taskId: string, kind: "hidden" | "blur" | "pagehide", awayMs: number) =>
  rpc<Reply>("report_focus_event", { p_task_id: taskId, p_kind: kind, p_away_ms: Math.round(awayMs) });
/** T-1101: the lead's crew form: team name and the 3 teammates, until the hunt starts. */
export const setupCrew = (name: string, members: string[]) =>
  rpc<Reply & { name?: string }>("setup_crew", { p_name: name, p_members: members });
export const setEliminatedView = (view: "game_over" | "spectator") =>
  rpc<Reply>("set_eliminated_view", { p_view: view });

// ── Join (player-join Edge Function, D-005) ─────────────────────────────────────────────────────────

async function callJoin<T>(body: Record<string, unknown>): Promise<T & { ok: boolean; code?: string }> {
  const env = publicEnv();
  // The function can fail to boot when a whole hall joins at once (P8 bot run, F-04): try once more before asking
  // the player to.
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/player-join`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
        body: JSON.stringify(body),
      });
      if (res.status >= 500 && attempt === 0) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T & { ok: boolean; code?: string };
    } catch {
      if (attempt > 0) return { ok: false, code: "SERVER" } as T & { ok: boolean; code?: string };
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
}

export type CrewPreview = { name: string; number: number; status: string; members: string[] };

export async function previewCrew(code: string) {
  return callJoin<{ team?: CrewPreview }>({ team_code: code, preview: true });
}

/** Joins a crew: the function returns a one-time login; this phone verifies it and claims the session. */
export async function joinCrew(name: string, code: string): Promise<Reply> {
  const r = await callJoin<{ token_hash?: string; claim_nonce?: string }>({ name, team_code: code });
  if (!r.ok || !r.token_hash || !r.claim_nonce) return { ok: false, code: r.code ?? "SERVER" };
  const supabase = getBrowserSupabase();
  const verified = await supabase.auth.verifyOtp({ token_hash: r.token_hash, type: "magiclink" });
  if (verified.error)
    return { ok: false, code: /rate/i.test(verified.error.message) ? "RATE_LIMITED" : "SERVER" };
  return rpc<Reply>("claim_session", { p_nonce: r.claim_nonce });
}

export async function signOut() {
  await getBrowserSupabase().auth.signOut({ scope: "local" });
}

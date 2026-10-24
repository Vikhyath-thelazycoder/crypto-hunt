"use client";

import { publicEnv } from "@/lib/env";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { MyStatus, Reply, ScanReply } from "./types";

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
export const scanQr = (token: string) => rpc<ScanReply>("scan_qr", { p_token: token });
export const submitAnswer = (taskId: string, answer: string) =>
  rpc<
    Reply & {
      correct?: boolean;
      pieces?: number;
      replaced?: boolean;
      strikes?: number;
      locked_until?: string | null;
    }
  >("submit_answer", {
    p_task_id: taskId,
    p_answer: answer,
  });
export const takeHint = (taskId: string) =>
  rpc<Reply & { hint?: string; penalty_ms?: number }>("use_hint", { p_task_id: taskId });
export const submitKey = (token: string, key: string, sealCode?: string) =>
  rpc<Reply & { team_count?: number; phase?: string }>("submit_key", {
    p_token: token,
    p_key: key,
    p_seal_code: sealCode ?? null,
  });
export const completeRound = () => rpc<Reply>("complete_round");
export const reportFocusEvent = (taskId: string, kind: "hidden" | "blur" | "pagehide", awayMs: number) =>
  rpc<Reply>("report_focus_event", { p_task_id: taskId, p_kind: kind, p_away_ms: Math.round(awayMs) });
export const setEliminatedView = (view: "game_over" | "spectator") =>
  rpc<Reply>("set_eliminated_view", { p_view: view });

// ── Join (player-join Edge Function, D-005) ─────────────────────────────────────────────────────────

async function callJoin<T>(body: Record<string, unknown>): Promise<T & { ok: boolean; code?: string }> {
  const env = publicEnv();
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/player-join`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
      body: JSON.stringify(body),
    });
    return (await res.json()) as T & { ok: boolean; code?: string };
  } catch {
    return { ok: false, code: "SERVER" } as T & { ok: boolean; code?: string };
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

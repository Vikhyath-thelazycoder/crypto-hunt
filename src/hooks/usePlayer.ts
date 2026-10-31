"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { myStatus, PlayerError } from "@/lib/player/api";
import { SIGNED_OUT } from "@/lib/player/messages";
import type { MyStatus, PublicState } from "@/lib/player/types";

const GAME_SPREAD_MS = 3_000;
const RECONNECT_SPREAD_MS = 5_000;
const SPECTATOR_MS = 30_000;

/** Between backup checks, with ±30 % so phones never line up: 60 s when live, 30 s when not, 5 s doubling to 60 s on failures. */
export function backupDelay(fails: number, live: boolean, random = Math.random()): number {
  const base = fails > 0 ? Math.min(60_000, 5_000 * 2 ** (fails - 1)) : live ? 60_000 : 30_000;
  return base * (0.7 + random * 0.6);
}

export type PlayerState =
  | { kind: "loading" }
  | { kind: "signed_out"; reason: string | null }
  | { kind: "ready"; status: MyStatus }
  | { kind: "offline"; status: MyStatus | null };

/**
 * The phone's view of the hunt: my_status, refreshed when the server pings this crew or the whole game (private
 * Realtime channels, empty messages), when the phone comes back, and on a slow backup timer. Failures wait longer each
 * time, at random moments, so a slow server is never hit harder by the phones waiting on it.
 */
export function usePlayer() {
  const [state, setState] = useState<PlayerState>({ kind: "loading" });
  const [pub, setPub] = useState<PublicState | null>(null);
  const last = useRef<MyStatus | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fails = useRef(0);
  const live = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const { data } = await getBrowserSupabase().auth.getSession();
      if (!data.session) {
        last.current = null;
        setState({ kind: "signed_out", reason: null });
        return;
      }
      const s = await myStatus();
      fails.current = 0;
      last.current = s;
      setState({ kind: "ready", status: s });
    } catch (e) {
      const code = e instanceof PlayerError ? e.code : "SERVER";
      if (SIGNED_OUT.has(code)) {
        last.current = null;
        setState({ kind: "signed_out", reason: code === "NOT_REGISTERED" ? null : code });
      } else {
        fails.current += 1;
        setState({ kind: "offline", status: last.current });
      }
    }
  }, []);

  // Several changes often land together: refetch once.
  const soon = useCallback(
    (delay = 150) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(refresh, delay);
    },
    [refresh],
  );

  const teamId = state.kind === "ready" ? state.status.team.id : null;
  const gameStatus = state.kind === "ready" ? state.status.game.status : null;
  const teamStatus = state.kind === "ready" ? state.status.team.status : null;

  useEffect(() => {
    void refresh();
    const onVisible = () => document.visibilityState === "visible" && soon();
    const onOnline = () => soon(Math.random() * RECONNECT_SPREAD_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    const { data: auth } = getBrowserSupabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") soon();
    });

    let backup: ReturnType<typeof setTimeout>;
    const schedule = () => {
      backup = setTimeout(async () => {
        if (document.visibilityState === "visible") await refresh();
        schedule();
      }, backupDelay(fails.current, live.current));
    };
    schedule();

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      clearTimeout(backup);
      auth.subscription.unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh, soon]);

  // Own crew's changes at once; a game-wide change is spread out so every phone doesn't ask in the same instant.
  useEffect(() => {
    if (!teamId) return;
    const supabase = getBrowserSupabase();
    const team = supabase
      .channel(`team:${teamId}`, { config: { private: true } })
      .on("broadcast", { event: "changed" }, () => soon())
      .subscribe((status) => {
        live.current = status === "SUBSCRIBED";
      });
    const game = supabase
      .channel("game", { config: { private: true } })
      .on("broadcast", { event: "changed" }, () => soon(Math.random() * GAME_SPREAD_MS))
      .subscribe();
    return () => {
      void supabase.removeChannel(team);
      void supabase.removeChannel(game);
    };
  }, [teamId, soon]);

  // The leaderboard is only read for the endings: when this crew is out, and when the game ends.
  useEffect(() => {
    if (!gameStatus || gameStatus !== "FINISHED" && (teamStatus === "active" || teamStatus === "forming" || teamStatus === "locked")) return;
    const read = async () => {
      const { data } = await getBrowserSupabase().from("public_state").select("data").single();
      if (data) setPub(data.data as PublicState);
    };
    void read();
    if (gameStatus === "FINISHED") return;
    const id = setInterval(read, SPECTATOR_MS);
    return () => clearInterval(id);
  }, [gameStatus, teamStatus]);

  return { state, pub, refresh };
}

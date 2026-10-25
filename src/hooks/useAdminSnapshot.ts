"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminError, adminSnapshot } from "@/lib/admin/api";
import type { Snapshot } from "@/lib/admin/types";
import { getBrowserSupabase } from "@/lib/supabase/client";

export type SnapshotState =
  | { kind: "loading" }
  | { kind: "error"; code: string }
  | { kind: "ready"; snap: Snapshot; live: boolean };

/** Tables whose changes reach the admin through Realtime (migration 0005 publication + admin RLS). */
const TABLES = ["events", "alerts", "teams", "players", "team_state", "round_results", "public_state"];

/**
 * The live dashboard (T-406, goal ≤ 2 s): admin_snapshot, refetched on any realtime change (debounced so a
 * crew checking in together costs one read), on reconnect, when the tab comes back, and every 10 s.
 * `offset` is server time minus this laptop's clock, so countdowns use the database clock.
 */
export function useAdminSnapshot() {
  const [state, setState] = useState<SnapshotState>({ kind: "loading" });
  const [offset, setOffset] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef(false);
  const busy = useRef(false);
  const again = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    try {
      const sent = Date.now();
      const snap = await adminSnapshot();
      const got = Date.now();
      setOffset(Date.parse(snap.now) - (sent + got) / 2);
      setState({ kind: "ready", snap, live: live.current });
    } catch (e) {
      const code = e instanceof AdminError ? e.code : "SERVER";
      setState((prev) =>
        prev.kind === "ready" && code === "SERVER" ? { ...prev, live: false } : { kind: "error", code },
      );
    } finally {
      busy.current = false;
      if (again.current) {
        again.current = false;
        void refresh();
      }
    }
  }, []);

  const soon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(refresh, 200);
  }, [refresh]);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    void refresh();
    let channel = supabase.channel("admin");
    for (const table of TABLES) channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, soon);
    channel.subscribe((status) => {
      live.current = status === "SUBSCRIBED";
      setState((prev) => (prev.kind === "ready" ? { ...prev, live: live.current } : prev));
      if (status === "SUBSCRIBED") soon();
    });
    const onVisible = () => document.visibilityState === "visible" && soon();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", soon);
    const poll = setInterval(soon, 10_000);
    return () => {
      void supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", soon);
      clearInterval(poll);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh, soon]);

  return { state, offset, refresh };
}

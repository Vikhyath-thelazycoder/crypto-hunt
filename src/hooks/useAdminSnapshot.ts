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
const POLL_MS = 5_000;

/**
 * The live dashboard (T-1009): admin_snapshot, read every 5 s and when the page comes back. Nothing here
 * reloads on each change, so the page costs the same however busy the game is.
 */
export function useAdminSnapshot() {
  const [state, setState] = useState<SnapshotState>({ kind: "loading" });
  const [offset, setOffset] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);
  const again = useRef(false);
  // Signing out stops the dashboard at once, so no refresh goes out without a session (it would only get a 401).
  const stopped = useRef(false);

  const refresh = useCallback(async () => {
    if (stopped.current) return;
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
      setState({ kind: "ready", snap, live: true });
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
    if (stopped.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(refresh, 200);
  }, [refresh]);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    void refresh();
    const onVisible = () => document.visibilityState === "visible" && soon();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", soon);
    const poll = setInterval(soon, POLL_MS);
    const { data: auth } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT") return;
      stopped.current = true;
      clearInterval(poll);
      if (timer.current) clearTimeout(timer.current);
    });
    return () => {
      auth.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", soon);
      clearInterval(poll);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh, soon]);

  return { state, offset, refresh };
}

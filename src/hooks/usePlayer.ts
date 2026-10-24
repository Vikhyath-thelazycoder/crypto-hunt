"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { myStatus, PlayerError } from "@/lib/player/api";
import { SIGNED_OUT } from "@/lib/player/messages";
import type { MyStatus, PublicState } from "@/lib/player/types";

export type PlayerState =
  | { kind: "loading" }
  | { kind: "signed_out"; reason: string | null }
  | { kind: "ready"; status: MyStatus }
  | { kind: "offline"; status: MyStatus | null };

/**
 * The phone's view of the hunt: my_status, refreshed whenever the team's progress row or the public state
 * changes (Supabase Realtime, ARCHITECTURE › Data flow), on reconnect, and every 15 s as a fallback.
 */
export function usePlayer() {
  const [state, setState] = useState<PlayerState>({ kind: "loading" });
  const [pub, setPub] = useState<PublicState | null>(null);
  const last = useRef<MyStatus | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await myStatus();
      last.current = s;
      setState({ kind: "ready", status: s });
    } catch (e) {
      const code = e instanceof PlayerError ? e.code : "SERVER";
      if (SIGNED_OUT.has(code)) {
        last.current = null;
        setState({ kind: "signed_out", reason: code === "NOT_REGISTERED" ? null : code });
      } else {
        setState({ kind: "offline", status: last.current });
      }
    }
  }, []);

  // Several changes often land together (a whole crew checking in): refetch once.
  const soon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(refresh, 150);
  }, [refresh]);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) setState({ kind: "signed_out", reason: null });
      else await refresh();
      const { data: p } = await supabase.from("public_state").select("data").single();
      if (!cancelled && p) setPub(p.data as PublicState);
    })();

    const channel = supabase
      .channel("player")
      .on("postgres_changes", { event: "*", schema: "public", table: "team_state" }, soon)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "public_state" }, (payload) => {
        const next = (payload.new as { data: PublicState }).data;
        setPub((prev) => {
          const mine = last.current?.team.id;
          const team = (st: PublicState | null) => st?.teams.find((t) => t.id === mine);
          if (
            !prev ||
            prev.status !== next.status ||
            prev.broadcast_at !== next.broadcast_at ||
            team(prev)?.members !== team(next)?.members ||
            team(prev)?.status !== team(next)?.status ||
            team(prev)?.checked_in !== team(next)?.checked_in
          ) {
            soon();
          }
          return next;
        });
      })
      .subscribe();

    const onVisible = () => document.visibilityState === "visible" && soon();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", soon);
    const poll = setInterval(soon, 15_000);
    const { data: auth } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") soon();
    });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", soon);
      clearInterval(poll);
      auth.subscription.unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh, soon]);

  return { state, pub, refresh };
}

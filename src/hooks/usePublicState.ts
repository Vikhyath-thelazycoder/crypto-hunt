"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { PublicState } from "@/lib/player/types";

/**
 * The projector's view of the hunt (T-701): the public state only, signed out, read every 5 s and on reconnect. The
 * server rebuilds it every 5 s, so the screen is never more than a few seconds behind.
 * `seq` (public_state.event_seq) lets an older read never overwrite a newer one.
 */
export function usePublicState(every = 5_000) {
  const [pub, setPub] = useState<PublicState | null>(null);
  const [online, setOnline] = useState(true);
  const seq = useRef(-1);

  const take = useCallback((data: PublicState, n: number) => {
    if (n < seq.current) return;
    seq.current = n;
    setPub(data);
  }, []);

  const read = useCallback(async () => {
    const { data, error } = await getBrowserSupabase().from("public_state").select("data, event_seq").single();
    setOnline(!error);
    if (data) take(data.data as PublicState, Number(data.event_seq));
  }, [take]);

  useEffect(() => {
    void read();
    const onVisible = () => document.visibilityState === "visible" && void read();
    const onOnline = () => void read();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    const poll = setInterval(() => void read(), every);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      clearInterval(poll);
    };
  }, [read, take, every]);

  return { pub, online };
}

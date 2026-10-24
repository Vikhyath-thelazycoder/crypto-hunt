"use client";

import { useEffect, useRef, useState } from "react";
import { reportFocusEvent } from "@/lib/player/api";

/**
 * Anti-cheat (D-017, F9): while a question is open, leaving the site is reported to the admin, and the
 * player sees a warning when they come back. Nothing is blocked.
 */
export function useFocusGuard(taskId: string | null) {
  const [warned, setWarned] = useState(false);
  const leftAt = useRef<{ at: number; kind: "hidden" | "blur" | "pagehide" } | null>(null);

  useEffect(() => {
    if (!taskId) return;
    const leave = (kind: "hidden" | "blur" | "pagehide") => {
      if (!leftAt.current) leftAt.current = { at: Date.now(), kind };
      // pagehide may be the last chance to report.
      if (kind === "pagehide") void reportFocusEvent(taskId, kind, 0).catch(() => {});
    };
    const back = () => {
      const left = leftAt.current;
      leftAt.current = null;
      if (!left || left.kind === "pagehide") return;
      const away = Date.now() - left.at;
      if (away < 1500) return; // a notification shade flick isn't leaving
      setWarned(true);
      void reportFocusEvent(taskId, left.kind, away).catch(() => {});
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? leave("hidden") : back());
    const onBlur = () => leave("blur");
    const onPageHide = () => leave("pagehide");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", back);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", back);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [taskId]);

  return { warned, dismiss: () => setWarned(false) };
}

"use client";

import { useEffect, useRef, useState } from "react";
import { roman } from "@/lib/player/format";

/**
 * Round complete (DESIGN.md › Motion, T-605): the map scroll rolls up on the round just sealed and unrolls on the next.
 * Shown for a moment whenever the crew's round goes up; reduced motion keeps the words without the movement.
 */
export function RoundTransition({ round, total }: { round: number | null; total: number | null }) {
  const last = useRef(round);
  const [shown, setShown] = useState<{ from: number; to: number } | null>(null);
  useEffect(() => {
    const prev = last.current;
    last.current = round;
    if (prev !== null && round !== null && round > prev) {
      setShown({ from: prev, to: round });
      const id = setTimeout(() => setShown(null), 2600);
      return () => clearTimeout(id);
    }
  }, [round]);
  if (!shown) return null;
  const final = total !== null && shown.to === total;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-[rgba(14,10,6,.55)]"
    >
      <div className="ch-scroll-swap relative w-[min(86vw,340px)]">
        <div className="ch-scroll-face ch-roll-up absolute inset-0 flex flex-col items-center justify-center rounded-[10px] px-6 py-8 text-center">
          <span className="font-display text-sm tracking-[.3em] text-[#3C5A2D]">SEALED</span>
          <span className="mt-1 font-display text-[40px] leading-none">Round {roman(shown.from)}</span>
        </div>
        <div className="ch-scroll-face ch-unroll flex flex-col items-center justify-center rounded-[10px] px-6 py-8 text-center">
          <span className="font-display text-sm tracking-[.3em] text-wax">{final ? "THE FINAL ROUND" : "NOW BEGINS"}</span>
          <span className="mt-1 font-display text-[40px] leading-none">Round {roman(shown.to)}</span>
          <span className="sr-only">
            Round {shown.from} sealed. Round {shown.to} begins.
          </span>
        </div>
      </div>
    </div>
  );
}

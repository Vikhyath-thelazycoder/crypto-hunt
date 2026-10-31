"use client";

import { useEffect, useRef } from "react";
import { useNow } from "@/hooks/useNow";
import { completeRound } from "@/lib/player/api";
import { mmss, roman } from "@/lib/player/format";
import type { MyStatus } from "@/lib/player/types";
import { CrewHeader, Paper, RoundMark } from "../parts";

/** 06 · Penalty (Penalty.dc.html, T-304): hints and wrong answers; the round counts when the sand runs out. */
export function PenaltyScreen({
  s,
  onChanged,
  paused,
}: {
  s: MyStatus;
  onChanged: () => void;
  paused: boolean;
}) {
  const now = useNow(250);
  const until = s.penalty?.until ? Date.parse(s.penalty.until) : now;
  const total = s.penalty?.ms ?? 0;
  const left = Math.max(0, until - now);
  const share = total > 0 ? left / total : 0;
  // D-041: whatever the hints don't explain came from every 3rd wrong answer.
  const hintMs = s.pieces.filter((p) => p.hint).length * s.game.hint_penalty_ms;
  const wrongMs = Math.max(0, total - hintMs);
  const asked = useRef(false);

  // When the sand runs out, ask the server to count the round (it checks the time itself).
  useEffect(() => {
    if (left > 0 || paused || asked.current) return;
    asked.current = true;
    void completeRound()
      .catch(() => null)
      .finally(() => {
        asked.current = false;
        onChanged();
      });
  }, [left, paused, onChanged]);

  return (
    <Paper>
      <CrewHeader
        team={s.team.name}
        sub="CHECKED IN"
        right={<RoundMark round={s.round!.number} total={s.round!.total} />}
      />
      <div className="flex flex-1 flex-col items-center gap-3.5">
        <p className="mt-3 mb-0 font-display text-base tracking-[.34em] text-wax">PENALTY</p>
        <Hourglass share={share} />
        <div
          role="timer"
          aria-live="off"
          aria-label={`${mmss(left)} left`}
          className="font-display text-8xl leading-[.9] tracking-[.02em]"
          style={{ textShadow: "0 2px 0 rgba(255,255,255,.5), 0 10px 22px rgba(42,29,18,.2)" }}
        >
          {mmss(left)}
        </div>
        <div
          className="h-2.5 w-[260px] max-w-full overflow-hidden rounded-[5px]"
          style={{ background: "rgba(110,74,42,.2)", boxShadow: "inset 0 1px 2px rgba(42,29,18,.35)" }}
        >
          <div
            className="h-full rounded-[5px]"
            style={{
              width: `${(1 - share) * 100}%`,
              background: "linear-gradient(180deg, #F4DE9C, #B88A1E 60%, #7A5A12)",
            }}
          />
        </div>
        <p className="m-0 text-center text-base text-sepia-ink">
          {paused
            ? "The captain paused the hunt. The sand is frozen."
            : "Your crew is sealed in. The round counts when the sand runs out."}
        </p>
        <div className="flex-1" />
        <section aria-label="Penalties" className="ch-panel self-stretch rounded-2xl px-4 py-1.5">
          {s.pieces
            .filter((p) => p.hint)
            .map((p) => (
              <div
                key={p.index}
                className="flex items-center justify-between border-b border-[rgba(110,74,42,.22)] py-3"
              >
                <span className="text-base">
                  <b>{p.mine ? "You" : (p.by ?? "A crewmate")}</b> took a hint · Round{" "}
                  {roman(s.round!.number)}
                </span>
                <span className="font-mono text-[15px] font-semibold text-wax">
                  +{mmss(s.game.hint_penalty_ms)}
                </span>
              </div>
            ))}
          {wrongMs > 0 && (
            <div className="flex items-center justify-between border-b border-[rgba(110,74,42,.22)] py-3">
              <span className="text-base">
                Wrong answers · every 3rd miss · Round {roman(s.round!.number)}
              </span>
              <span className="font-mono text-[15px] font-semibold text-wax">+{mmss(wrongMs)}</span>
            </div>
          )}
          <div className="flex items-center justify-between py-3">
            <span className="font-display text-base tracking-[.1em]">Total this round</span>
            <span className="font-mono text-[17px] font-semibold">{mmss(total)}</span>
          </div>
        </section>
      </div>
    </Paper>
  );
}

function Hourglass({ share }: { share: number }) {
  // Top sand shrinks and bottom sand grows with the time left.
  const top = 82 + (1 - share) * 46;
  return (
    <svg
      viewBox="0 0 200 280"
      width="176"
      height="246"
      role="img"
      aria-label={`Hourglass, ${Math.round(share * 100)} percent of the sand left`}
      style={{ filter: "drop-shadow(0 22px 18px rgba(42,20,10,.45))" }}
    >
      <defs>
        <linearGradient id="ch-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#C08A4E" />
          <stop offset=".45" stopColor="#7A4A22" />
          <stop offset="1" stopColor="#3C220E" />
        </linearGradient>
        <linearGradient id="ch-woodtop" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5A3417" />
          <stop offset=".35" stopColor="#C79358" />
          <stop offset=".55" stopColor="#E2B57A" />
          <stop offset="1" stopColor="#4A2A12" />
        </linearGradient>
        <linearGradient id="ch-post" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#4E370A" />
          <stop offset=".35" stopColor="#F4DE9C" />
          <stop offset=".6" stopColor="#B88A1E" />
          <stop offset="1" stopColor="#4E370A" />
        </linearGradient>
        <linearGradient id="ch-glass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity=".1" />
          <stop offset=".22" stopColor="#FFFFFF" stopOpacity=".55" />
          <stop offset=".4" stopColor="#FFFFFF" stopOpacity=".08" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity=".22" />
        </linearGradient>
        <linearGradient id="ch-sand" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#A9782C" />
          <stop offset=".4" stopColor="#E6BC68" />
          <stop offset="1" stopColor="#9A6A22" />
        </linearGradient>
        <clipPath id="ch-topbulb">
          <rect x="0" y={top} width="200" height={132 - top} />
        </clipPath>
        <clipPath id="ch-botbulb">
          <rect x="0" y={246 - (1 - share) * 48} width="200" height="60" />
        </clipPath>
      </defs>
      <ellipse cx="100" cy="262" rx="88" ry="12" fill="url(#ch-wood)" />
      <rect x="12" y="246" width="176" height="16" fill="url(#ch-woodtop)" />
      <ellipse cx="100" cy="246" rx="88" ry="12" fill="#D9A86C" />
      <rect x="28" y="30" width="9" height="216" rx="4" fill="url(#ch-post)" />
      <rect x="163" y="30" width="9" height="216" rx="4" fill="url(#ch-post)" />
      <path
        d="M50,32 C50,90 92,112 96,140 C92,168 50,190 50,246 L150,246 C150,190 108,168 104,140 C108,112 150,90 150,32 Z"
        fill="#F7EBD0"
        fillOpacity=".35"
        stroke="#6E4A2A"
        strokeOpacity=".5"
        strokeWidth="1.2"
      />
      <path
        d="M58,40 C60,94 94,112 98,132 L102,132 C106,112 140,94 142,40 Z"
        fill="url(#ch-sand)"
        clipPath="url(#ch-topbulb)"
      />
      {share > 0 && <path d="M99.2,132 L100.8,132 L100.8,218 L99.2,218 Z" fill="#C99A48" />}
      <path
        d="M56,246 C58,218 84,200 100,198 C116,200 142,218 144,246 Z"
        fill="url(#ch-sand)"
        clipPath="url(#ch-botbulb)"
      />
      <path
        d="M50,32 C50,90 92,112 96,140 C92,168 50,190 50,246 L150,246 C150,190 108,168 104,140 C108,112 150,90 150,32 Z"
        fill="url(#ch-glass)"
      />
      <path
        d="M60,44 C60,80 76,98 86,110"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity=".7"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M60,236 C62,206 74,190 84,180"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity=".5"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <ellipse cx="100" cy="30" rx="88" ry="12" fill="url(#ch-wood)" />
      <rect x="12" y="14" width="176" height="16" fill="url(#ch-woodtop)" />
      <ellipse cx="100" cy="14" rx="88" ry="12" fill="#D9A86C" />
      <ellipse cx="100" cy="14" rx="70" ry="8" fill="none" stroke="#7A4A22" strokeWidth="1" />
    </svg>
  );
}

"use client";

import { roman } from "@/lib/player/format";
import type { MyStatus } from "@/lib/player/types";
import { CrewHeader, Paper, RoundMark } from "../parts";

/** 10 · Sealed mark (SealedMark.dc.html, D-025, T-308): a later round's QR. No clue, no key box. */
export function SealedScreen({
  s,
  onBack,
  onRescan,
}: {
  s: MyStatus;
  onBack: () => void;
  onRescan: () => void;
}) {
  const solved = s.pieces.filter((p) => p.solved).length;
  return (
    <Paper gap={12}>
      <CrewHeader
        team={s.team.name}
        sub={s.phase === "SOLVING" ? `SOLVING · ${solved}/4 PIECES` : "4 / 4 PIECES"}
        right={<RoundMark round={s.round!.number} total={s.round!.total} />}
      />
      <div className="flex flex-1 flex-col items-center gap-3">
        <p role="status" className="mt-3.5 mb-0 font-display text-base tracking-[.34em] text-wax">
          SEALED
        </p>
        <SealedLetter />
        <h1 className="mt-2 mb-0 text-center font-display text-[34px] leading-[1.02] font-normal">
          This mark belongs
          <br />
          to a later round
        </h1>
        <p className="m-0 max-w-[320px] text-center text-[17px] leading-[1.45] text-[#4A2F18]">
          You&apos;re in <b>Round {roman(s.round!.number)}</b>. Leave it where it is. It won&apos;t open until
          a crew reaches its round, and scanning it now saves nothing.
        </p>
        <section aria-label="What happened" className="ch-panel mt-1.5 self-stretch rounded-2xl px-4 py-1">
          <div className="flex items-center gap-3 border-b border-[rgba(110,74,42,.22)] py-3">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#8E1B1B"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            <span className="text-[15px] leading-[1.3]">No clue, question or key here for you</span>
          </div>
          <div className="flex items-center gap-3 py-3">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#6E4A2A"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
              <path d="M12 8v5M12 16h.01" />
            </svg>
            <span className="text-[15px] leading-[1.3]">The captain sees this scan. No penalty.</span>
          </div>
        </section>
        <div className="flex-1" />
        <button
          className="ch-wax h-[62px] self-stretch rounded-[14px] text-[22px]"
          type="button"
          onClick={onBack}
        >
          Back to my clue
        </button>
        <button className="ch-ghost h-12 self-stretch rounded-xl text-base" type="button" onClick={onRescan}>
          Scan a different mark
        </button>
      </div>
    </Paper>
  );
}

function SealedLetter() {
  return (
    <svg
      viewBox="0 0 240 200"
      width="240"
      height="200"
      role="img"
      aria-label="A folded parchment letter held shut by a red wax seal with a keyhole"
      style={{ filter: "drop-shadow(0 20px 16px rgba(42,20,10,.4))" }}
    >
      <defs>
        <linearGradient id="ch-env" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F6ECD2" />
          <stop offset="1" stopColor="#D8C190" />
        </linearGradient>
        <linearGradient id="ch-flap" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E9D9B2" />
          <stop offset="1" stopColor="#CDB27C" />
        </linearGradient>
        <radialGradient id="ch-wx" cx=".35" cy=".3" r=".75">
          <stop offset="0" stopColor="#D2544A" />
          <stop offset=".5" stopColor="#8E1B1B" />
          <stop offset="1" stopColor="#4E0B0B" />
        </radialGradient>
        <linearGradient id="ch-cord" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6E4A2A" />
          <stop offset=".5" stopColor="#A97A44" />
          <stop offset="1" stopColor="#6E4A2A" />
        </linearGradient>
      </defs>
      <rect
        x="20"
        y="40"
        width="200"
        height="140"
        rx="6"
        fill="url(#ch-env)"
        stroke="#8A6A44"
        strokeOpacity=".5"
      />
      <path d="M20,46 L120,120 L220,46" fill="none" stroke="#8A6A44" strokeOpacity=".45" strokeWidth="1.4" />
      <path d="M20,40 L120,112 L220,40 Z" fill="url(#ch-flap)" stroke="#8A6A44" strokeOpacity=".5" />
      <path d="M20,180 L96,118 M220,180 L144,118" stroke="#8A6A44" strokeOpacity=".3" strokeWidth="1.2" />
      <rect x="114" y="34" width="12" height="152" fill="url(#ch-cord)" opacity=".9" />
      <path
        d="M86,118 C92,96 148,96 154,118 C160,138 146,152 120,152 C94,152 80,138 86,118 Z"
        fill="url(#ch-wx)"
      />
      <circle cx="120" cy="124" r="23" fill="none" stroke="#5A0E0E" strokeWidth="2" strokeOpacity=".6" />
      <circle cx="120" cy="119" r="6" fill="#2A0606" />
      <path d="M116,122 L124,122 L126,136 L114,136 Z" fill="#2A0606" />
      <path
        d="M100,104 C106,98 114,96 122,96"
        fill="none"
        stroke="#FFD2C4"
        strokeOpacity=".45"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

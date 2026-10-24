"use client";

import { useState } from "react";
import { initials } from "@/lib/player/format";
import type { MyStatus } from "@/lib/player/types";
import { CaptainNote, CrewHeader, LockIcon, Paper } from "../parts";

/** 02 · Lobby (Lobby.dc.html, T-301): the crew musters until the hunt starts. */
export function LobbyScreen({ s }: { s: MyStatus }) {
  const [copied, setCopied] = useState(false);
  const count = s.members.length;
  const ready = s.game.status === "READY" || count === 4;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(s.team.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Paper gap={14}>
      <CrewHeader
        team={s.team.name}
        sub={`TEAM ${String(s.team.number).padStart(2, "0")}`}
        right={
          <div className="text-right font-display text-[13px] tracking-[.18em] text-sepia-ink">
            BEFORE
            <br />
            THE HUNT
          </div>
        }
      />

      <section className="pt-1.5 text-center">
        <p className="m-0 font-display text-[15px] tracking-[.3em] text-sepia-ink">
          {count === 4 ? "THE CREW IS SEALED" : "MUSTERING THE CREW"}
        </p>
        <div
          className="mt-1 font-display text-[104px] leading-[.95]"
          style={{ textShadow: "0 2px 0 rgba(255,255,255,.5), 0 8px 18px rgba(42,29,18,.18)" }}
          aria-label={`${count} of 4 aboard`}
        >
          {count}
          <span className="text-[#8A6A44]">/</span>4
        </div>
        <p className="mt-1.5 mb-0 text-base text-sepia-ink">
          {count === 4
            ? "All four aboard. Wait for the captain's signal."
            : count === 3
              ? "One more hand and the crew is sealed."
              : `${4 - count} more hands to seal the crew.`}
        </p>
      </section>

      <section className="ch-sheet rounded-2xl px-4 py-1.5" aria-label="Crew members">
        {[0, 1, 2, 3].map((i) => {
          const m = s.members[i];
          const last = i === 3;
          const row = `flex items-center gap-3.5 py-3 ${last ? "" : "border-b border-[rgba(110,74,42,.22)]"}`;
          if (!m) {
            return (
              <div key={i} className={row}>
                <div className="ch-slot" style={{ width: 44, height: 44 }}>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#6E4A2A"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </div>
                <div className="flex-1 text-[17px] text-sepia-ink italic">
                  {i === count ? "Waiting for the next hand…" : "An empty bench"}
                </div>
              </div>
            );
          }
          return (
            <div key={m.id} className={row}>
              <div
                className="ch-seal"
                style={{
                  width: 44,
                  height: 44,
                  fontSize: 19,
                  boxShadow: m.me
                    ? "inset 0 0 0 3px rgba(60,6,6,.35), inset 0 -3px 6px rgba(0,0,0,.4), 0 0 0 3px #F1E6CA, 0 0 0 5px #B88A1E, 0 4px 8px rgba(42,20,10,.45)"
                    : undefined,
                }}
              >
                {initials(m.name, 1)}
              </div>
              <div className="flex-1 text-[19px] font-semibold">
                {m.name}
                {m.me && <span className="ml-1 font-display text-[13px] tracking-[.14em] text-wax">YOU</span>}
              </div>
              <div className="text-sm font-semibold text-[#3C5A2D]">Aboard</div>
            </div>
          );
        })}
      </section>

      {count < 4 && (
        <section className="ch-panel flex items-center gap-3 rounded-[14px] px-4 py-3.5">
          <div className="flex-1">
            <div className="font-display text-[13px] tracking-[.18em] text-sepia-ink">SHARE THIS CODE</div>
            <div className="mt-0.5 font-mono text-[28px] font-semibold tracking-[.22em]">{s.team.code}</div>
          </div>
          <button
            type="button"
            onClick={copy}
            className="ch-brass flex h-12 items-center gap-2 rounded-[11px] px-[18px] text-base"
            aria-live="polite"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#2A1D12"
              strokeWidth="1.8"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="8" y="8" width="12" height="12" rx="2" />
              <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
            </svg>
            {copied ? "Copied" : "Copy"}
          </button>
        </section>
      )}

      <CaptainNote
        text={s.game.broadcast ?? "Gather at the main stage. The hunt begins when every crew has four."}
      />

      <div className="flex-1" />
      <button
        className="ch-locked flex h-[60px] items-center justify-center gap-2.5 rounded-[14px] font-display text-xl tracking-[.06em]"
        type="button"
        disabled
      >
        <LockIcon />
        {ready ? "The scanner opens at the start" : "Scanner opens at the start"}
      </button>
    </Paper>
  );
}

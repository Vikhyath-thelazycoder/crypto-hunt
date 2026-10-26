"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { groupKey, initials, ordinal, roman } from "@/lib/player/format";
import { podium } from "@/lib/player/podium";
import type { MyStatus, PublicState, PublicTeam } from "@/lib/player/types";

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const word = (n: number) => WORDS[n] ?? String(n);
const crewNames = (s: MyStatus) => s.members.map((m) => m.name).join(" · ");
const placeOf = (s: MyStatus, pub: PublicState | null) => {
  const i = pub?.teams.findIndex((t) => t.id === s.team.id) ?? -1;
  return { place: i >= 0 ? i + 1 : null, of: pub?.teams.length ?? null };
};

/** 08 · Eliminated (Eliminated.dc.html, T-307): the map chars; the crew picks Game Over or Spectator (D-019). */
export function EliminatedScreen({
  s,
  pub,
  onChoose,
}: {
  s: MyStatus;
  pub: PublicState | null;
  onChoose: (view: "game_over" | "spectator") => void;
}) {
  const r = s.team.eliminated_in_round ?? s.round?.number ?? 1;
  const advance = pub?.rounds.find((x) => x.number === r)?.advance ?? null;
  const { place, of } = placeOf(s, pub);
  const disqualified = s.team.status === "disqualified";
  return (
    <main
      className="relative flex min-h-full flex-col overflow-hidden text-ink"
      style={{ background: "#0E0703" }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(64% 46% at 50% 40%, #EEDFBD 0%, #E3CE9E 48%, #C9A262 66%, #8A5422 74%, #3A1A08 82%, #120803 92%)",
        }}
      />
      {/* The map chars in from the edges (T-605). */}
      <div
        aria-hidden="true"
        className="ch-char absolute inset-0"
        style={{
          background:
            "radial-gradient(64% 46% at 50% 40%, transparent 68%, rgba(255,124,32,.55) 73%, rgba(255,80,10,.18) 77%, transparent 82%)",
          mixBlendMode: "screen",
        }}
      />
      {[
        [15, 76, 4],
        [82, 71, 3],
        [77, 11, 3],
      ].map(([x, y, d], i) => (
        <div
          key={i}
          aria-hidden="true"
          className="absolute rounded-full"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: d,
            height: d,
            background: "#FFB25A",
            boxShadow: "0 0 8px 3px rgba(255,140,40,.8)",
          }}
        />
      ))}

      <section
        aria-live="assertive"
        className="relative flex flex-col items-center px-10 pt-[min(120px,14vh)] text-center"
      >
        <div className="relative h-[84px] w-[84px]">
          <div
            className="flex h-[84px] w-[84px] items-center justify-center rounded-full font-display text-[32px] text-[#E9DCC4]"
            style={{
              background: "radial-gradient(circle at 32% 28%, #7A6A5A 0%, #4A3B2E 50%, #241A12 100%)",
              boxShadow:
                "inset 0 0 0 4px rgba(0,0,0,.3), inset 0 -4px 8px rgba(0,0,0,.5), 0 6px 12px rgba(42,20,10,.5)",
            }}
          >
            {initials(s.team.name)}
          </div>
          <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true" className="absolute inset-0">
            <path d="M14 14 L70 70 M70 14 L14 70" stroke="#8E1B1B" strokeWidth="5" strokeLinecap="round" />
          </svg>
        </div>
        <p className="mt-[22px] mb-0 font-display text-[15px] tracking-[.28em] text-sepia-ink">
          {disqualified ? "BY THE CAPTAIN'S ORDER" : `ROUND ${roman(r)} HAS CLOSED`}
        </p>
        <h1
          className="mt-1.5 mb-0 font-display text-[54px] leading-[.95] font-normal text-[#5A0E0E]"
          style={{ textShadow: "0 1px 0 rgba(255,240,210,.5)" }}
        >
          {disqualified ? "Disqualified" : "Eliminated"}
        </h1>
        <p className="mt-3.5 mb-0 text-lg leading-[1.4]">
          {disqualified
            ? `The captain has ended the ${s.team.name}' hunt.`
            : `${advance ? `${word(advance)} crew${advance === 1 ? "" : "s"}` : "Faster crews"} sealed Round ${roman(r)} before you. The ${s.team.name}' hunt ends here.`}
        </p>
        <div className="mt-[22px] flex justify-center gap-7">
          <div>
            <div className="font-display text-[44px] leading-none">{roman(r)}</div>
            <div className="text-sm text-sepia-ink">furthest round</div>
          </div>
          {place && (
            <>
              <div className="w-px" style={{ background: "rgba(110,74,42,.4)" }} />
              <div>
                <div className="font-display text-[44px] leading-none">
                  {place}
                  <span className="text-[22px]">{ordinal(place).suffix}</span>
                </div>
                <div className="text-sm text-sepia-ink">of {of} crews</div>
              </div>
            </>
          )}
        </div>
        <p className="mt-4 mb-0 text-[15px] text-sepia-ink italic">{crewNames(s)}</p>
      </section>

      <div className="flex-1" />
      <section className="relative flex flex-col gap-3 px-5 pt-6 pb-7">
        <button
          className="ch-brass flex h-[60px] items-center justify-center gap-2.5 rounded-[14px] font-display text-[22px] tracking-[.06em]"
          type="button"
          onClick={() => onChoose("spectator")}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#2A1D12"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Watch the race
        </button>
        <button
          className="ch-ghost-dark h-[54px] rounded-[14px] text-[17px] font-semibold"
          type="button"
          onClick={() => onChoose("game_over")}
        >
          End my hunt
        </button>
      </section>
    </main>
  );
}

const PHASE: Record<string, string> = {
  SOLVING: "Solving",
  SEEKING: "Seeking",
  CHECKING_IN: "Checking in",
  PENALTY: "Penalty",
  FINISHED: "Finished",
  ELIMINATED: "Out",
};

/** Spectator view (D-019, F19): the live leaderboard on a dark chart table. */
export function SpectatorScreen({
  s,
  pub,
  onLeave,
}: {
  s: MyStatus;
  pub: PublicState | null;
  onLeave?: () => void;
}) {
  const teams = pub?.teams ?? [];
  return (
    <main className="ch-table relative flex min-h-full flex-col overflow-hidden px-4 pt-5 pb-6 text-[#EADBB8]">
      <p className="m-0 font-display text-sm tracking-[.3em] text-[#E2BE72]">THE RACE</p>
      <h1 className="mt-1 mb-0 font-display text-[40px] leading-none font-normal text-[#F3E6C8]">
        Leaderboard
      </h1>
      <p className="mt-1.5 mb-0 text-sm text-[#BFA77F]">
        {pub?.status === "FINISHED"
          ? "The hunt is over."
          : `Round ${roman(Math.max(1, ...teams.map((t) => t.round ?? 1)))} under way · updates live`}
      </p>
      <ol className="mt-4 flex flex-col gap-2 p-0" aria-label="Crews by place">
        {teams.map((t, i) => (
          <Row key={t.id} t={t} place={i + 1} mine={t.id === s.team.id} />
        ))}
      </ol>
      <div className="flex-1" />
      {onLeave && (
        <button
          className="ch-ghost-dark mt-5 h-12 rounded-xl text-base font-semibold"
          type="button"
          onClick={onLeave}
        >
          End my hunt
        </button>
      )}
    </main>
  );
}

function Row({ t, place, mine }: { t: PublicTeam; place: number; mine: boolean }) {
  const out = t.status === "eliminated" || t.status === "disqualified";
  return (
    <li
      className="flex items-center gap-3 rounded-xl px-3 py-2.5"
      style={{
        listStyle: "none",
        opacity: out ? 0.6 : 1,
        background: mine
          ? "linear-gradient(180deg, rgba(226,190,114,.22), rgba(226,190,114,.08))"
          : "rgba(255,235,190,.05)",
        boxShadow: mine ? "inset 0 0 0 1px rgba(226,190,114,.7)" : "inset 0 0 0 1px rgba(226,190,114,.18)",
      }}
    >
      <span className="w-8 text-center font-display text-2xl text-[#FBE3A0]">{t.final_rank ?? place}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-lg text-[#F3E6C8]">
          {t.name}
          {mine && <span className="ml-1.5 font-display text-xs tracking-[.14em] text-[#E9A99A]">YOU</span>}
        </span>
        <span className="text-[13px] text-[#BFA77F]">
          {out
            ? `Out in round ${roman(t.eliminated_in_round ?? t.round ?? 1)}`
            : t.status === "finished"
              ? "Claimed the treasure"
              : (PHASE[t.phase ?? ""] ?? "Waiting")}
        </span>
      </span>
      <span className="font-display text-xl text-[#F3E6C8]">{roman(t.round ?? 1)}</span>
    </li>
  );
}

/** Game over: the crew chose to end their hunt (D-019). */
export function GameOverScreen({ s, onWatch }: { s: MyStatus; onWatch: () => void }) {
  return (
    <main
      className="relative flex min-h-full flex-col items-center justify-center overflow-hidden px-8 text-center text-[#EADBB8]"
      style={{ background: "radial-gradient(70% 50% at 50% 40%, #2A1D12 0%, #120B05 70%, #070402 100%)" }}
    >
      <p className="m-0 font-display text-sm tracking-[.3em] text-[#BFA77F]">
        THE {s.team.name.toUpperCase()}
      </p>
      <h1 className="mt-2 mb-0 font-display text-[52px] leading-none font-normal text-[#F3E6C8]">
        Hunt over
      </h1>
      <p className="mt-4 mb-0 max-w-[300px] text-lg leading-[1.4] text-[#D9C39A]">
        Thank you for sailing. Hand your phone back to the shore.
      </p>
      <button
        className="ch-ghost-dark mt-8 h-12 rounded-xl px-6 text-base font-semibold"
        type="button"
        onClick={onWatch}
      >
        Watch the race instead
      </button>
    </main>
  );
}

/** The game ended before the crew finished (End game or the podium filled): final standing. */
export function HuntOverScreen({ s, pub }: { s: MyStatus; pub: PublicState | null }) {
  const { place, of } = placeOf(s, pub);
  return (
    <main
      className="relative flex min-h-full flex-col items-center justify-center overflow-hidden px-8 text-center text-[#EADBB8]"
      style={{ background: "radial-gradient(70% 50% at 50% 40%, #3A2A1A 0%, #1C140C 70%, #0E0A06 100%)" }}
    >
      <p className="m-0 font-display text-sm tracking-[.3em] text-[#E2BE72]">THE CAPTAIN HAS CALLED IT</p>
      <h1 className="mt-2 mb-0 font-display text-[52px] leading-none font-normal text-[#FBE7B0]">
        The hunt is over
      </h1>
      {place && (
        <p className="mt-5 mb-0 font-display text-[40px] leading-none text-[#F3E6C8]">
          {place}
          <span className="text-xl">{ordinal(place).suffix}</span>
          <span className="block pt-1 font-body text-sm text-[#BFA77F]">of {of} crews</span>
        </p>
      )}
      <p className="mt-4 mb-0 text-[15px] text-[#D9C39A] italic">{crewNames(s)}</p>
    </main>
  );
}

/** 09 · Victory (Victory.dc.html, T-307): rank, crew and the completion key. The 3D chest arrives in P6. */
export function VictoryScreen({ s }: { s: MyStatus }) {
  const rank = s.team.final_rank ?? 1;
  const place = ["first", "second", "third"][rank - 1] ?? `${rank}${ordinal(rank).suffix}`;
  return (
    <main
      className="relative flex min-h-full flex-col overflow-hidden text-[#F3E6C8]"
      style={{
        background: "radial-gradient(90% 60% at 50% 44%, #4A3418 0%, #24180C 45%, #100B06 80%, #080503 100%)",
      }}
    >
      <div
        aria-hidden="true"
        className="ch-rays absolute"
        style={{ left: "-66%", top: -60, width: "233%", aspectRatio: "1" }}
      />
      <div
        aria-hidden="true"
        className="absolute"
        style={{
          left: "12%",
          top: 250,
          width: "76%",
          height: 200,
          borderRadius: "50%",
          background:
            "radial-gradient(closest-side, rgba(255,214,120,.55), rgba(255,170,60,.18) 60%, transparent)",
        }}
      />
      <section className="relative flex flex-col items-center px-5 pt-9">
        <p className="m-0 font-display text-sm tracking-[.32em] text-[#E2BE72]">THE TREASURE IS CLAIMED</p>
        <div className="relative mt-3.5 h-[120px] w-[104px]">
          <svg
            viewBox="0 0 104 120"
            width="104"
            height="120"
            aria-hidden="true"
            className="absolute inset-0"
            style={{ filter: "drop-shadow(0 10px 12px rgba(0,0,0,.6))" }}
          >
            <defs>
              <radialGradient id="ch-coin" cx="36%" cy="30%" r="80%">
                <stop offset="0" stopColor="#FFF4C4" />
                <stop offset=".35" stopColor="#EBC35A" />
                <stop offset=".75" stopColor="#A9781C" />
                <stop offset="1" stopColor="#5E420C" />
              </radialGradient>
              <linearGradient id="ch-rib" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#B83226" />
                <stop offset="1" stopColor="#5A0E0E" />
              </linearGradient>
            </defs>
            <path d="M30 74 L18 118 L34 108 L44 120 L52 80Z" fill="url(#ch-rib)" />
            <path d="M74 74 L86 118 L70 108 L60 120 L52 80Z" fill="url(#ch-rib)" />
            <circle cx="52" cy="48" r="46" fill="url(#ch-coin)" />
            <circle cx="52" cy="48" r="37" fill="none" stroke="#7A5A12" strokeWidth="1.5" opacity=".7" />
            <circle
              cx="52"
              cy="48"
              r="40"
              fill="none"
              stroke="#FFF1B8"
              strokeWidth="1"
              opacity=".5"
              strokeDasharray="2 3"
            />
          </svg>
          <div
            className="absolute inset-x-0 top-[22px] text-center font-display text-[38px] leading-none text-[#4A3208]"
            style={{ textShadow: "0 1px 0 rgba(255,244,196,.7)" }}
          >
            {rank}
            <span className="text-xl">{ordinal(rank).suffix}</span>
          </div>
        </div>
        <h1
          className="mt-2 mb-0 text-center font-display text-[42px] leading-none font-normal text-[#FBE7B0]"
          style={{ textShadow: "0 0 24px rgba(255,190,80,.45), 0 2px 0 rgba(0,0,0,.6)" }}
        >
          {s.team.name}
        </h1>
        <p className="mt-1.5 mb-0 text-[15px] text-[#D9C39A]">{crewNames(s)}</p>
      </section>

      <div className="relative flex flex-1 items-center justify-center px-5">
        <ChestStage />
      </div>

      <section className="relative flex flex-col items-center gap-2.5 px-5 pb-[26px]">
        <div
          className="self-stretch rounded-[14px] px-4 py-3.5 text-center"
          style={{
            background: "linear-gradient(180deg, rgba(255,226,150,.14), rgba(255,226,150,.04))",
            boxShadow: "inset 0 0 0 1px rgba(226,190,114,.55), 0 10px 26px -10px rgba(0,0,0,.8)",
          }}
        >
          <div className="font-display text-[13px] tracking-[.24em] text-[#E2BE72]">COMPLETION KEY</div>
          <div className="mt-0.5 font-mono text-[30px] font-semibold tracking-[.16em] text-[#FFF0C4]">
            {groupKey(s.team.completion_key ?? "")}
          </div>
        </div>
        <p className="m-0 text-center text-[15px] text-[#D9C39A]">
          Show this key to the admin to claim {place} place.
        </p>
      </section>
    </main>
  );
}

/**
 * The finale chest (T-604): the 3D scene where the phone can run it, the rendered still otherwise (reduced motion,
 * no WebGL, or while the model loads).
 */
function ChestStage() {
  const [three, setThree] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let gl = false;
    try {
      const c = document.createElement("canvas");
      gl = !!(c.getContext("webgl2") ?? c.getContext("webgl"));
    } catch {
      gl = false;
    }
    setThree(!reduce && gl);
  }, []);
  return (
    <div
      role="img"
      aria-label="An open treasure chest overflowing with gold coins"
      className="relative aspect-[4/3] w-full max-w-[380px]"
      style={{ maskImage: "radial-gradient(closest-side, #000 72%, transparent)" }}
    >
      {three ? <ChestFinale /> : <ChestStill />}
    </div>
  );
}

const ChestStill = () => (
  // eslint-disable-next-line @next/next/no-img-element -- a small static render shipped with the app
  <img src="/models/chest-open.webp" alt="" className="h-full w-full object-contain" />
);

const ChestFinale = dynamic(() => import("@/components/three/ChestFinale"), { ssr: false, loading: ChestStill });

const MEDAL = ["#E2BE72", "#C9CED6", "#C08A57"];

/** Game over pop-up (D-040, T-509): on every phone when the hunt ends, the top 3 and where to go next. */
export function GameOverNotice({ pub, mine, onClose }: { pub: PublicState | null; mine: string; onClose: () => void }) {
  const top = podium(pub);
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="The hunt is over"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(14,10,6,.86)] p-6"
    >
      <div className="ch-sheet ch-unroll w-full max-w-[380px] rounded-2xl px-6 py-7 text-center text-ink">
        <p className="m-0 font-display text-[15px] tracking-[.3em] text-wax">GAME OVER</p>
        <h2 className="mt-2 mb-0 font-display text-[34px] leading-none font-normal">The hunt is over</h2>
        {top.length > 0 && (
          <ol className="mt-5 mb-0 list-none space-y-2 p-0 text-left" aria-label="Winners">
            {top.map((t) => (
              <li
                key={t.id}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 ${t.id === mine ? "bg-[rgba(184,138,30,.18)]" : ""}`}
              >
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-lg text-[#2A1A0F]"
                  style={{ background: MEDAL[t.rank - 1] }}
                >
                  {t.rank}
                </span>
                <span className="font-display text-xl">
                  {t.rank}
                  {ordinal(t.rank).suffix} · {t.name}
                  {t.id === mine && <span className="text-base text-sepia-ink"> (your crew)</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-5 mb-0 text-lg leading-[1.4]">Return to the starting point.</p>
        <button type="button" className="ch-wax mt-5 h-14 w-full rounded-[14px] text-xl" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

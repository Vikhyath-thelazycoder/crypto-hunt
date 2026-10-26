"use client";

import { roman } from "@/lib/player/format";
import type { MyStatus } from "@/lib/player/types";
import { ClueText, CrewHeader, Paper, RoundMark } from "../parts";

const clueOf = (s: MyStatus) =>
  s.pieces
    .map((p) => p.text?.trim())
    .filter(Boolean)
    .join(" ");

const FLAKES: [number, number, number, number][] = [
  [10, 8, 28, 1],
  [77, 6, -40, 1],
  [87, 21, 70, 0.8],
  [6, 27, -15, 1.1],
  [31, 4, 52, 0.7],
  [65, 36, 10, 0.9],
  [18, 39, -62, 0.75],
  [50, 51, 35, 1],
  [85, 50, -20, 0.8],
];

/** 07 · Prank QR (Prank.dc.html, T-305): fake final → fake key → "Fooled!" → back to the real clue. */
export function PrankScreen({ s, fakeKey, onBack }: { s: MyStatus; fakeKey: string; onBack: () => void }) {
  const clue = clueOf(s);
  return (
    <main
      className="relative flex min-h-full flex-col overflow-hidden text-ink"
      style={{ background: "radial-gradient(80% 50% at 50% 46%, #3A2A1A 0%, #1C140C 70%, #0E0A06 100%)" }}
    >
      <div className="relative" style={{ height: "clamp(380px, 52vh, 440px)" }}>
        <div
          aria-hidden="true"
          className="absolute -inset-x-2.5 top-0 bottom-0"
          style={{
            transform: "rotate(-2.4deg)",
            transformOrigin: "0 100%",
            filter: "drop-shadow(0 18px 18px rgba(0,0,0,.7))",
          }}
        >
          <div
            className="h-full"
            style={{
              background: "radial-gradient(120% 90% at 50% 20%, #FBF0CF 0%, #EEDCAE 55%, #D6B97E 100%)",
              clipPath:
                "polygon(0 0, 100% 0, 100% 86%, 94% 91%, 88% 87%, 81% 94%, 73% 89%, 66% 96%, 58% 90%, 51% 97%, 44% 91%, 36% 98%, 29% 92%, 21% 99%, 14% 93%, 7% 98%, 0 94%)",
            }}
          />
        </div>
        {FLAKES.map(([x, y, r, k], i) => (
          <span
            key={i}
            aria-hidden="true"
            className="ch-flake"
            style={{ left: `${x}%`, top: `${y}%`, transform: `rotate(${r}deg) scale(${k})` }}
          />
        ))}
        <section
          className="relative flex flex-col items-center px-7 pt-14"
          style={{ transform: "rotate(-2.4deg)", transformOrigin: "0 100%" }}
        >
          <svg
            width="72"
            height="72"
            viewBox="0 0 64 64"
            aria-hidden="true"
            style={{ filter: "drop-shadow(0 6px 6px rgba(42,20,10,.4))" }}
          >
            <defs>
              <linearGradient id="ch-cup" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#7A5A12" />
                <stop offset=".35" stopColor="#F6DE8E" />
                <stop offset=".6" stopColor="#C99A2E" />
                <stop offset="1" stopColor="#6B4C0E" />
              </linearGradient>
            </defs>
            <path
              d="M18 8h28v10c0 10-6 18-14 18S18 28 18 18z"
              fill="url(#ch-cup)"
              stroke="#5A400B"
              strokeWidth="1.2"
            />
            <path
              d="M18 12H9c0 8 4 12 10 13M46 12h9c0 8-4 12-10 13"
              fill="none"
              stroke="url(#ch-cup)"
              strokeWidth="3.5"
            />
            <rect x="29" y="36" width="6" height="10" fill="url(#ch-cup)" />
            <rect
              x="20"
              y="46"
              width="24"
              height="8"
              rx="2"
              fill="url(#ch-cup)"
              stroke="#5A400B"
              strokeWidth="1"
            />
          </svg>
          <p
            className="mt-3.5 mb-0 text-center font-display text-[30px] leading-[1.05] text-[#7A5A12]"
            style={{
              textDecoration: "line-through",
              textDecorationColor: "rgba(142,27,27,.8)",
              textDecorationThickness: 2,
            }}
          >
            You reached the final!
          </p>
          <div
            className="mt-4 rounded-lg px-[18px] py-2.5"
            style={{ border: "1.5px dashed rgba(110,74,42,.6)" }}
          >
            <div className="text-center font-display text-xs tracking-[.2em] text-sepia-ink">
              YOUR SECRET KEY
            </div>
            <div className="font-mono text-[26px] font-semibold tracking-[.14em] text-sepia-ink">
              {fakeKey}
            </div>
          </div>
        </section>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
          <div
            className="rounded-[10px] px-[22px] pt-1.5 pb-0.5"
            style={{
              transform: "rotate(-9deg)",
              border: "5px double #9A2420",
              background: "rgba(250,236,210,.15)",
            }}
          >
            <h1
              className="m-0 font-display text-[82px] leading-none font-normal tracking-[.04em] text-[#9A2420]"
              style={{ textShadow: "0 2px 0 rgba(255,220,200,.35), 0 0 1px #5A0E0E" }}
            >
              Fooled!
            </h1>
          </div>
        </div>
      </div>

      <div
        className="relative -mx-2.5 mt-7 flex flex-1"
        style={{
          transform: "rotate(1.8deg)",
          transformOrigin: "100% 0",
          filter: "drop-shadow(0 -10px 16px rgba(0,0,0,.6))",
        }}
      >
        <div
          className="flex-1"
          style={{
            background: "radial-gradient(120% 90% at 50% 70%, #F6EBCF 0%, #EADBB8 50%, #CFB27C 100%)",
            clipPath:
              "polygon(0 6%, 6% 2%, 13% 7%, 20% 1%, 28% 6%, 35% 0, 43% 5%, 50% 1%, 57% 7%, 65% 2%, 72% 6%, 80% 0, 87% 5%, 94% 1%, 100% 4%, 100% 100%, 0 100%)",
          }}
        >
          <section
            aria-live="assertive"
            className="flex h-full flex-col gap-3.5 px-[30px] pt-[34px] pb-6"
            style={{ transform: "rotate(-1.8deg)" }}
          >
            <p className="m-0 text-center text-xl leading-[1.35] font-semibold">
              That mark was a decoy.
              <br />
              You&apos;re still in{" "}
              <span className="font-display text-2xl text-wax">Round {roman(s.round?.number ?? 1)}</span>.
            </p>
            {clue && (
              <blockquote className="ch-quote m-0 mt-1 px-4 py-3">
                <div className="font-display text-xs tracking-[.2em] text-sepia-ink">YOUR REAL CLUE</div>
                <p className="mt-1 mb-0 text-base leading-[1.35] italic">
                  <ClueText text={clue} />
                </p>
              </blockquote>
            )}
            <div className="min-h-4 flex-1" />
            <button
              className="ch-brass h-[58px] rounded-[14px] font-display text-[21px] tracking-[.06em]"
              type="button"
              onClick={onBack}
            >
              Back to the real hunt
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}

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

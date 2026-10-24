"use client";

import { groupKey } from "@/lib/player/format";
import type { MyStatus } from "@/lib/player/types";
import { CrewHeader, Paper, RoundMark, ScanIcon } from "../parts";

/** 04 · Seek (Seek.dc.html): the full clue, the map with fog lifted over the region, then scan the mark. */
export function SeekScreen({ s, onScan }: { s: MyStatus; onScan: () => void }) {
  const clue = s.pieces
    .map((p) => p.text?.trim())
    .filter(Boolean)
    .join(" ");
  return (
    <Paper gap={12}>
      <CrewHeader
        team={s.team.name}
        sub="4 / 4 PIECES"
        right={<RoundMark round={s.round!.number} total={s.round!.total} />}
      />
      <h1
        className="m-0 font-display text-[44px] leading-[.95] font-normal tracking-[.03em]"
        style={{ textShadow: "0 1px 0 rgba(255,255,255,.55)" }}
      >
        {s.round!.is_final ? "Seek the final mark" : "Seek the mark"}
      </h1>
      <blockquote aria-live="polite" className="ch-quote m-0 px-4 py-3">
        <p className="ch-ink m-0 text-lg leading-[1.35] italic">{clue}</p>
      </blockquote>

      {s.round!.is_final && s.seal_code && (
        <section
          aria-label="Crew seal code"
          className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
          style={{
            background: "linear-gradient(180deg, #E9D49A 0%, #F8EBC4 45%, #FDF6E0 100%)",
            boxShadow: "inset 0 0 0 1px rgba(184,138,30,.7), 0 8px 16px -10px rgba(42,29,18,.6)",
          }}
        >
          <div>
            <div className="font-display text-[13px] tracking-[.18em] text-[#7A5A12]">CREW SEAL CODE</div>
            <div className="text-[13px] text-sepia-ink">
              Only your crew has it. Type it at the final mark.
            </div>
          </div>
          <div className="font-mono text-[26px] font-semibold tracking-[.12em]">{groupKey(s.seal_code)}</div>
        </section>
      )}

      <TreasureMap region={s.region} />

      <button
        className="ch-wax flex h-[62px] items-center justify-center gap-3 rounded-[14px] text-[22px]"
        type="button"
        onClick={onScan}
      >
        <ScanIcon />
        Found it — scan the mark
      </button>
    </Paper>
  );
}

// The map's world is 800 × 600; the server gives the region as fractions of the venue map.
const W = 800;
const H = 600;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const COAST =
  "M60,70 C200,40 420,55 560,48 C660,44 740,70 752,140 C764,260 748,400 738,500 C730,548 640,566 520,560 L240,562 C130,566 62,540 52,460 C40,340 46,190 60,70 Z";

/** The rolled treasure map with fog (Seek mockup). The real venue drawing arrives in P6 (T-601/T-602). */
export function TreasureMap({ region }: { region: MyStatus["region"] }) {
  const cx = region ? region.x * W : W / 2;
  const cy = region ? region.y * H : H / 2;
  const r = region ? Math.max(40, region.r * W) : 0;
  const label = region ? "Fog lifted over the area where your mark is hidden." : "The map is still in fog.";
  return (
    <section
      aria-label="Treasure map"
      className="flex flex-1 flex-col justify-center"
      style={{ perspective: 900 }}
    >
      <div style={{ transform: "rotateX(9deg)", transformOrigin: "50% 100%", transformStyle: "preserve-3d" }}>
        <Roller />
        <div
          className="relative mx-1 -my-2 overflow-hidden"
          style={{
            height: "min(410px, 46vh)",
            minHeight: 260,
            boxShadow:
              "0 30px 40px -24px rgba(42,20,10,.75), inset 0 14px 18px -10px rgba(42,20,10,.45), inset 0 -14px 18px -10px rgba(42,20,10,.45)",
          }}
        >
          <svg
            viewBox={`${clamp(cx - 230, 0, W - 460)} ${clamp(cy - 257, 0, H - 514)} 460 514`}
            preserveAspectRatio="xMidYMid slice"
            className="block h-full w-full"
            role="img"
            aria-label={label}
          >
            <defs>
              <radialGradient id="ch-land" cx="50%" cy="45%" r="70%">
                <stop offset="0" stopColor="#F3E7C6" />
                <stop offset=".7" stopColor="#E4D0A2" />
                <stop offset="1" stopColor="#C9AA70" />
              </radialGradient>
              <filter id="ch-cloud" x="0" y="0" width="100%" height="100%">
                <feTurbulence type="fractalNoise" baseFrequency=".011 .016" numOctaves={4} seed={11} />
                <feColorMatrix values="0 0 0 0 .62  0 0 0 0 .52  0 0 0 0 .38  0 0 0 1.5 -.5" />
              </filter>
              <filter id="ch-soft" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="16" />
              </filter>
              <filter id="ch-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" />
              </filter>
              <mask id="ch-fog" maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
                <rect width={W} height={H} fill="#fff" />
                {region && <circle cx={cx} cy={cy} r={r + 18} fill="#000" filter="url(#ch-soft)" />}
              </mask>
            </defs>
            <rect width={W} height={H} fill="#CDB07A" />
            <path d={COAST} fill="url(#ch-land)" stroke="#2A1D12" strokeWidth="2.4" />
            <path
              d={COAST}
              fill="none"
              stroke="#2A1D12"
              strokeWidth=".8"
              transform="translate(6 6) scale(.985)"
              opacity=".5"
            />
            <g mask="url(#ch-fog)">
              <rect width={W} height={H} fill="#DCCBA5" opacity=".94" />
              <rect width={W} height={H} filter="url(#ch-cloud)" />
            </g>
            <g stroke="#6E4A2A" strokeWidth=".7" opacity=".35">
              <path d="M740,560 L280,60 M740,560 L420,40 M740,560 L560,40 M740,560 L280,250 M740,560 L280,420 M740,560 L740,40" />
            </g>
            {region && (
              <>
                <circle cx={cx} cy={cy} r={r + 6} fill="#E8B84A" opacity=".18" filter="url(#ch-glow)" />
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke="#8E1B1B"
                  strokeWidth="2.4"
                  strokeDasharray="10 6"
                />
                <g transform={`translate(${cx} ${Math.max(24, cy - r - 12)})`}>
                  <rect x="-64" y="-14" width="128" height="24" rx="12" fill="#8E1B1B" />
                  <text
                    y="3"
                    textAnchor="middle"
                    fontFamily="var(--font-fell), serif"
                    fontSize="14"
                    fill="#F7E9C8"
                    letterSpacing="1.2"
                  >
                    SEARCH HERE
                  </text>
                </g>
              </>
            )}
          </svg>
          <MapCompass />
        </div>
        <Roller />
      </div>
    </section>
  );
}

const Roller = () => (
  <div className="relative z-[2] -mx-1.5 flex items-center">
    <div className="ch-cap" />
    <div className="ch-roller flex-1" />
    <div className="ch-cap" />
  </div>
);

const MapCompass = () => (
  <div
    aria-hidden="true"
    className="absolute top-3.5 left-3 flex h-16 w-16 items-center justify-center rounded-full"
    style={{
      background: "radial-gradient(circle at 36% 28%, #FBEAB4 0%, #D2A443 38%, #8A6414 74%, #4E370A 100%)",
      boxShadow: "0 8px 14px -4px rgba(42,20,10,.7), inset 0 -3px 5px rgba(0,0,0,.35)",
    }}
  >
    <div
      className="relative h-[50px] w-[50px] rounded-full"
      style={{
        background: "radial-gradient(circle at 45% 35%, #FDF7E6, #D9C08E)",
        boxShadow: "inset 0 3px 6px rgba(42,20,10,.45)",
      }}
    >
      <svg
        viewBox="-25 -25 50 50"
        width="50"
        height="50"
        className="absolute inset-0"
        style={{ transform: "rotate(58deg)" }}
      >
        <path d="M0,-20 L4,0 L0,3 L-4,0Z" fill="#8E1B1B" />
        <path d="M0,20 L4,0 L0,-3 L-4,0Z" fill="#2A1D12" />
        <circle r="2.4" fill="#B88A1E" />
      </svg>
      <span className="absolute inset-x-0 top-px text-center font-display text-[9px]">N</span>
    </div>
  </div>
);

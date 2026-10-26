"use client";

import { useId } from "react";
import type { MyStatus } from "@/lib/player/types";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { roman } from "@/lib/player/format";

type Region = { x: number; y: number; r: number };

/** The venue map image's public URL (the image has no pins, D-034). */
export const venueMapUrl = (path: string) => getBrowserSupabase().storage.from("venue").getPublicUrl(path).data.publicUrl;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
// The placeholder drawing used until a venue map is uploaded (an 800 × 600 world).
const COAST =
  "M60,70 C200,40 420,55 560,48 C660,44 740,70 752,140 C764,260 748,400 738,500 C730,548 640,566 520,560 L240,562 C130,566 62,540 52,460 C40,340 46,190 60,70 Z";

/**
 * The rolled treasure map (Seek mockup, T-601/T-602): the campus in ink on parchment under fog. The fog has lifted
 * over the rounds already done (marked ✗ I, II … with a dotted trail) and lifts over the current search region
 * when the clue is complete. Positions are fractions of the map image; the server sends regions, never pins.
 */
export function TreasureMap({
  region,
  visited = [],
  map,
}: {
  region: MyStatus["region"];
  visited?: Region[];
  map?: MyStatus["map"];
}) {
  const uid = useId().replace(/:/g, "");
  const W = map?.w || 800;
  const H = map?.h || 600;
  const k = W / 800;
  const url = map?.path ? venueMapUrl(map.path) : null;
  const at = (g: Region) => ({ x: g.x * W, y: g.y * H, r: Math.max(40 * k, g.r * W) });
  const done = visited.map(at);
  const now = region ? at(region) : null;
  const focus = now ?? done.at(-1) ?? { x: W / 2, y: H / 2, r: 0 };
  // A portrait window over the map, slid to the focus (the mockup's 460 × 514 view of an 800 × 600 world).
  const vh = Math.min(H, (514 / 600) * H);
  const vw = Math.min(W, (vh * 460) / 514);
  const vx = clamp(focus.x - vw / 2, 0, W - vw);
  const vy = clamp(focus.y - vh / 2, 0, H - vh);
  const trail = [...done, ...(now ? [now] : [])];
  const label = now
    ? `Venue map. ${done.length ? `${done.length} earlier round${done.length === 1 ? " is" : "s are"} revealed; ` : ""}the fog has lifted over the area where your mark is hidden.`
    : "The map is still in fog.";
  const id = (name: string) => `${name}-${uid}`;

  return (
    <section aria-label="Treasure map" className="flex flex-1 flex-col justify-center" style={{ perspective: 900 }}>
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
            viewBox={`${vx} ${vy} ${vw} ${vh}`}
            preserveAspectRatio="xMidYMid slice"
            className="block h-full w-full"
            role="img"
            aria-label={label}
          >
            <defs>
              <radialGradient id={id("land")} cx="50%" cy="45%" r="70%">
                <stop offset="0" stopColor="#F3E7C6" />
                <stop offset=".7" stopColor="#E4D0A2" />
                <stop offset="1" stopColor="#C9AA70" />
              </radialGradient>
              <filter id={id("cloud")} x="0" y="0" width="100%" height="100%">
                <feTurbulence type="fractalNoise" baseFrequency={`${0.011 / k} ${0.016 / k}`} numOctaves={4} seed={11} />
                <feColorMatrix values="0 0 0 0 .62  0 0 0 0 .52  0 0 0 0 .38  0 0 0 1.5 -.5" />
              </filter>
              <filter id={id("soft")} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation={16 * k} />
              </filter>
              <filter id={id("glow")} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation={6 * k} />
              </filter>
              <mask id={id("fog")} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
                <rect width={W} height={H} fill="#fff" />
                {done.map((g, i) => (
                  <circle key={i} cx={g.x} cy={g.y} r={g.r} fill="#000" filter={`url(#${id("soft")})`} />
                ))}
                {now && (
                  // The fog burns away over the region (instant with reduced motion).
                  <circle
                    className="ch-fog-lift"
                    cx={now.x}
                    cy={now.y}
                    r={now.r + 18 * k}
                    fill="#000"
                    filter={`url(#${id("soft")})`}
                  />
                )}
              </mask>
            </defs>
            {url ? (
              <image href={url} x="0" y="0" width={W} height={H} preserveAspectRatio="none" />
            ) : (
              <>
                <rect width={W} height={H} fill="#CDB07A" />
                <path d={COAST} fill={`url(#${id("land")})`} stroke="#2A1D12" strokeWidth="2.4" />
                <path d={COAST} fill="none" stroke="#2A1D12" strokeWidth=".8" transform="translate(6 6) scale(.985)" opacity=".5" />
              </>
            )}
            <g mask={`url(#${id("fog")})`}>
              <rect width={W} height={H} fill="#DCCBA5" opacity=".94" />
              <rect width={W} height={H} filter={`url(#${id("cloud")})`} />
            </g>
            <g stroke="#6E4A2A" strokeWidth={0.7 * k} opacity=".35">
              <path
                d={`M${W * 0.92},${H * 0.93} L${W * 0.35},${H * 0.1} M${W * 0.92},${H * 0.93} L${W * 0.52},${H * 0.07} M${W * 0.92},${H * 0.93} L${W * 0.7},${H * 0.07} M${W * 0.92},${H * 0.93} L${W * 0.35},${H * 0.42} M${W * 0.92},${H * 0.93} L${W * 0.35},${H * 0.7} M${W * 0.92},${H * 0.93} L${W * 0.92},${H * 0.07}`}
              />
            </g>
            {trail.length > 1 && (
              <path
                d={trail.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="#8E1B1B"
                strokeWidth={2.4 * k}
                strokeDasharray={`${1 * k} ${6 * k}`}
                strokeLinecap="round"
              />
            )}
            {done.map((g, i) => (
              <g key={i} stroke="#8E1B1B" strokeWidth={3 * k} strokeLinecap="round">
                <path d={`M${g.x - 8 * k},${g.y - 8 * k} l${16 * k},${16 * k} M${g.x + 8 * k},${g.y - 8 * k} l${-16 * k},${16 * k}`} />
                <text
                  x={g.x + 13 * k}
                  y={g.y - 8 * k}
                  stroke="none"
                  fill="#8E1B1B"
                  fontFamily="var(--font-fell), serif"
                  fontSize={13 * k}
                >
                  {roman(i + 1)}
                </text>
              </g>
            ))}
            {now && (
              <>
                <circle cx={now.x} cy={now.y} r={now.r + 6 * k} fill="#E8B84A" opacity=".18" filter={`url(#${id("glow")})`} />
                <circle
                  cx={now.x}
                  cy={now.y}
                  r={now.r}
                  fill="none"
                  stroke="#8E1B1B"
                  strokeWidth={2.4 * k}
                  strokeDasharray={`${10 * k} ${6 * k}`}
                />
                <g transform={`translate(${now.x} ${Math.max(vy + 24 * k, now.y - now.r - 12 * k)}) scale(${k})`}>
                  <rect x="-64" y="-14" width="128" height="24" rx="12" fill="#8E1B1B" />
                  <text y="3" textAnchor="middle" fontFamily="var(--font-fell), serif" fontSize="14" fill="#F7E9C8" letterSpacing="1.2">
                    SEARCH HERE
                  </text>
                </g>
              </>
            )}
          </svg>
          <MapCompass swing={!!now} />
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

/** Brass compass; its needle swings when the fog lifts (T-602). */
const MapCompass = ({ swing }: { swing: boolean }) => (
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
        className={`absolute inset-0 ${swing ? "ch-needle" : ""}`}
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

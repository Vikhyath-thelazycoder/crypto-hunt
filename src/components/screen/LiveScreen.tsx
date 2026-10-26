"use client";

import { useLayoutEffect, useRef } from "react";
import { useNow } from "@/hooks/useNow";
import { venueMapUrl } from "@/components/map/TreasureMap";
import type { PublicState } from "@/lib/player/types";
import { header, phaseText, rows, ships, ticker, type Row, type Ship } from "@/lib/screen/board";
import { QrCard } from "./QrCard";

/**
 * The live race on the projector (ScreenLive mockup; T-701, T-702): the round being decided and its seals, the venue
 * map tilted on the chart table with a ship per crew, the leaderboard, and the LATEST ticker. Public state only.
 */
export function LiveScreen({
  pub,
  qr,
  joinUrl,
  online = true,
}: {
  pub: PublicState;
  qr: { url: string; mode: "corner" } | null;
  joinUrl?: string;
  online?: boolean;
}) {
  const now = useNow(500);
  const h = header(pub);
  const news = pub.broadcast && pub.broadcast_at && now - Date.parse(pub.broadcast_at) < 5 * 60_000 ? pub.broadcast : null;
  const latest = ticker(pub.latest);
  const gathering = pub.status === "SETUP" || pub.status === "REGISTRATION" || pub.status === "READY";

  return (
    <main
      className="relative h-[1080px] w-[1920px] overflow-hidden text-[#F3E6C8]"
      style={{
        fontFamily: "var(--font-body)",
        background: "radial-gradient(900px 700px at 30% 60%, #3A2814 0%, #1A120A 55%, #0B0805 100%)",
      }}
    >
      <div
        aria-hidden="true"
        className="absolute rounded-full"
        style={{ left: -200, top: -200, width: 700, height: 700, background: "radial-gradient(closest-side, rgba(255,170,70,.18), transparent)" }}
      />
      <div
        aria-hidden="true"
        className="absolute rounded-full"
        style={{ right: -150, bottom: -250, width: 800, height: 800, background: "radial-gradient(closest-side, rgba(255,170,70,.12), transparent)" }}
      />

      <header className="absolute flex items-end justify-between" style={{ left: 80, top: 54, right: 80 }}>
        <div>
          <div className="font-display text-[30px] tracking-[.3em] text-[#E2BE72]">{h.kicker}</div>
          <h1
            className="m-0 font-display text-[132px] leading-[.9] font-normal text-[#FBE7B0]"
            style={{ textShadow: "0 0 40px rgba(255,180,80,.35), 0 4px 0 rgba(0,0,0,.6)" }}
          >
            {h.title}
          </h1>
        </div>
        <div className="text-right">
          <div className="text-[40px] text-[#E8D6B0]">{h.line}</div>
          {h.seals && h.seals.total <= 12 && (
            <div className="mt-3 flex justify-end gap-[18px]" aria-label={`${h.seals.filled} of ${h.seals.total} places taken`}>
              {Array.from({ length: h.seals.total }, (_, i) => (i < h.seals!.filled ? <Seal key={i} /> : <EmptySeal key={i} />))}
            </div>
          )}
        </div>
      </header>

      <RaceMap pub={pub} />

      <Leaderboard rows={rows(pub)} now={now} />

      {qr && (
        <div className="absolute" style={{ left: 60, top: 300 }}>
          <QrCard url={qr.url} size={220} title="LATE? SCAN TO START" note="with the Crypto Hunt scanner" />
        </div>
      )}
      {gathering && joinUrl && (
        <div className="absolute" style={{ left: 60, top: 300 }}>
          <QrCard url={joinUrl} size={260} title="SCAN TO JOIN" note={joinUrl.replace(/^https?:\/\//, "")} />
        </div>
      )}

      {pub.paused && (
        <div
          role="status"
          className="sc-fade absolute flex flex-col items-center justify-center text-center"
          style={{ left: 40, top: 300, width: 1060, height: 700, background: "rgba(11,8,5,.55)" }}
        >
          <div className="font-display text-[96px] leading-none text-[#FBE7B0]">Paused</div>
          <div className="mt-3 text-[36px] text-[#E8D6B0]">Every clock is stopped</div>
        </div>
      )}

      <footer
        className="absolute right-0 bottom-0 left-0 flex items-center gap-[30px] text-[#2A1D12]"
        style={{
          height: 66,
          padding: "0 80px",
          background: "linear-gradient(180deg, #F6E6B0 0%, #C99A2E 45%, #8A6414 100%)",
          boxShadow: "0 -10px 30px rgba(0,0,0,.6)",
        }}
      >
        <span className="font-display text-[30px] tracking-[.14em] text-[#5A0E0E]">{news ? "FROM THE CAPTAIN" : "LATEST"}</span>
        <span className="min-w-0 flex-1 truncate text-[32px] font-semibold" aria-live="polite">
          {news ?? (latest || (gathering ? "Crews are gathering at the start" : "The race is on"))}
        </span>
        {!online && <span className="text-[24px] text-[#5A0E0E]">Reconnecting…</span>}
      </footer>
    </main>
  );
}

const Seal = () => (
  <div
    className="h-[66px] w-[66px] rounded-full"
    style={{
      background: "radial-gradient(circle at 32% 28%, #D2564A, #8E1B1B 50%, #4E0B0B)",
      boxShadow: "inset 0 -4px 8px rgba(0,0,0,.5), 0 6px 14px rgba(0,0,0,.6)",
    }}
  />
);
const EmptySeal = () => (
  <div className="box-border h-[66px] w-[66px] rounded-full" style={{ border: "3px dashed rgba(226,190,114,.55)" }} />
);

/** The leaderboard (T-701). Rows reorder with a FLIP spring: each row slides from where it was to its new place. */
function Leaderboard({ rows, now }: { rows: Row[]; now: number }) {
  const refs = useRef(new Map<string, HTMLDivElement>());
  const last = useRef(new Map<string, number>());
  const order = rows.map((r) => r.id).join("|");

  useLayoutEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const next = new Map<string, number>();
    refs.current.forEach((el, id) => {
      // offsetTop is in the stage's own pixels (unaffected by its scale).
      next.set(id, el.offsetTop);
      const before = last.current.get(id);
      if (!reduce && before !== undefined && before !== el.offsetTop && el.animate) {
        el.animate([{ transform: `translateY(${before - el.offsetTop}px)` }, { transform: "none" }], {
          duration: 800,
          easing: "cubic-bezier(.2,1.25,.4,1)",
        });
      }
    });
    last.current = next;
  }, [order]);

  return (
    <section aria-label="Leaderboard" className="absolute flex flex-col gap-3" style={{ right: 80, top: 300, width: 700 }}>
      {rows.map((r) => (
        <div
          key={r.id}
          ref={(el) => {
            if (el) refs.current.set(r.id, el);
            else refs.current.delete(r.id);
          }}
          className={`sc-row${r.kind === "crew" && r.top ? " top" : ""}${r.kind === "out" ? " out" : ""}${r.kind === "more" ? " more" : ""}`}
          data-testid="board-row"
        >
          <span className="w-[54px] font-display text-[52px] leading-none text-[#E2BE72]">{r.kind === "crew" ? r.rank : ""}</span>
          <span
            className="min-w-0 flex-1 truncate font-display leading-none whitespace-nowrap text-[#FBF0D2]"
            style={{ fontSize: r.kind === "crew" ? 48 : 36 }}
          >
            {r.name}
          </span>
          <div className="flex flex-col items-end gap-2">
            {r.kind === "crew" && r.total > 0 && (
              <div className="flex gap-[9px]" aria-label={`${r.pips} of ${r.total} rounds`}>
                {Array.from({ length: r.total }, (_, i) => (
                  <span key={i} className={i < r.pips ? "sc-pip on" : "sc-pip"} />
                ))}
              </div>
            )}
            <span className="text-[26px] whitespace-nowrap text-[#D9C39A]">{r.kind === "crew" ? phaseText(r.team, now) : r.phase}</span>
          </div>
        </div>
      ))}
    </section>
  );
}

// The placeholder drawing used until a venue map is uploaded (an 800 × 600 world, as on the phones).
const COAST =
  "M60,70 C200,40 420,55 560,48 C660,44 740,70 752,140 C764,260 748,400 738,500 C730,548 640,566 520,560 L240,562 C130,566 62,540 52,460 C40,340 46,190 60,70 Z";

/** The venue map on the chart table, tilted, with a ship per crew (T-702). No pins, no targets: only ships. */
function RaceMap({ pub }: { pub: PublicState }) {
  const W = pub.map?.w || 800;
  const H = pub.map?.h || 600;
  // The mockup's 960 × 720 board tilted 40°; a wide campus map keeps its shape at up to 1040 px across, tilted less.
  const w = Math.min(1040, (720 * W) / H);
  const h = (w * H) / W;
  const tilt = H / W < 0.6 ? 30 : 40;
  const url = pub.map?.path ? venueMapUrl(pub.map.path) : null;
  const fleet = ships(pub);
  const flag = fleet.length <= 8 ? 26 : fleet.length <= 14 ? 20 : 16;

  return (
    <section
      aria-label="Map of the venue with each crew's ship"
      className="absolute"
      style={{ left: 40, top: 300, width: 1060, height: 700, perspective: 1500, perspectiveOrigin: "50% 0%" }}
    >
      <div
        className="absolute"
        style={{
          left: (1060 - w) / 2,
          top: Math.max(10, 680 - h),
          width: w,
          height: h,
          transform: `rotateX(${tilt}deg)`,
          ["--sc-tilt" as string]: `${tilt}deg`,
          transformOrigin: "50% 100%",
          transformStyle: "preserve-3d",
        }}
      >
        <div
          className="absolute inset-0 rounded-md"
          style={{ boxShadow: "0 6px 0 #6E4A2A, 0 12px 0 #3E2510, 0 60px 80px rgba(0,0,0,.85)" }}
        />
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          width={w}
          height={h}
          aria-hidden="true"
          className="absolute inset-0 rounded-md"
        >
          <defs>
            <radialGradient id="sc-land" cx="50%" cy="45%" r="70%">
              <stop offset="0" stopColor="#F3E7C6" />
              <stop offset=".7" stopColor="#E4D0A2" />
              <stop offset="1" stopColor="#C9AA70" />
            </radialGradient>
            <radialGradient id="sc-edge" cx="50%" cy="50%" r="72%">
              <stop offset=".6" stopColor="#000" stopOpacity="0" />
              <stop offset="1" stopColor="#2A1408" stopOpacity=".55" />
            </radialGradient>
          </defs>
          {url ? (
            <image href={url} x="0" y="0" width={W} height={H} preserveAspectRatio="none" />
          ) : (
            <>
              <rect width={W} height={H} fill="#CDB07A" />
              <path d={COAST} fill="url(#sc-land)" stroke="#2A1D12" strokeWidth="2.4" />
            </>
          )}
          <rect width={W} height={H} fill="url(#sc-edge)" />
        </svg>
        {fleet.map((s) => (
          <ShipMark key={s.id} s={s} flag={flag} />
        ))}
      </div>
    </section>
  );
}

function ShipMark({ s, flag }: { s: Ship; flag: number }) {
  const size = flag >= 26 ? 70 : flag >= 20 ? 56 : 44;
  return (
    <div className="sc-ship" style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%` }} data-testid="ship" data-crew={s.name}>
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ filter: "drop-shadow(0 10px 6px rgba(0,0,0,.55))" }}>
        <path d="M31 6 V44" stroke="#3E2510" strokeWidth="2.5" />
        <path d="M31 9 C42 14 46 26 44 38 L31 38 Z" fill={s.sealed ? "#FFF1B8" : "#F6EBD0"} stroke="#6E4A2A" strokeWidth="1" />
        <path d="M29 12 C21 18 19 28 21 36 L29 36 Z" fill="#E4D2A8" stroke="#6E4A2A" strokeWidth="1" />
        <path d="M31 6 L42 9 L31 12 Z" fill={s.colour} />
        <path d="M8 42 H56 L50 54 C40 58 24 58 14 54 Z" fill="#5A3417" stroke="#2A160A" strokeWidth="1.2" />
        <path d="M12 46 H52" stroke="#8A5428" strokeWidth="1.4" />
      </svg>
      <span className="sc-flag" style={{ fontSize: flag, borderBottom: `4px solid ${s.colour}` }}>
        {s.name}
      </span>
    </div>
  );
}

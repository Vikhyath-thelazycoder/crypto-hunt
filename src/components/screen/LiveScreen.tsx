"use client";

import { useLayoutEffect, useRef } from "react";
import { useNow } from "@/hooks/useNow";
import type { PublicState } from "@/lib/player/types";
import { header, phaseText, rows, ticker, type Row } from "@/lib/screen/board";
import { QrCard } from "./QrCard";

/**
 * The live race on the projector (ScreenLive mockup; T-701, T-702): the round being decided and its seals, the venue
 * map tilted on the chart table with a ship per crew, the leaderboard, and the LATEST ticker. Public state only.
 */
export function LiveScreen({
  pub,
  joinUrl,
  online = true,
}: {
  pub: PublicState;
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

      <Leaderboard rows={rows(pub)} now={now} />

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
    <section aria-label="Leaderboard" className="absolute flex flex-col gap-3" style={{ left: 120, right: 120, top: 300 }}>
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

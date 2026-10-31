"use client";

import { roman } from "@/lib/player/format";
import type { PublicState } from "@/lib/player/types";
import { podium, type Splash } from "@/lib/screen/board";
import { QrCard } from "./QrCard";

const MEDAL = ["#E2BE72", "#C9CED6", "#C08A57"];
const names = (list: string[], max = 10) =>
  list.length > max ? `${list.slice(0, max).join(" · ")} and ${list.length - max} more` : list.join(" · ");

/** A splash over the whole projector (T-703): round sealed, crews out, game over (D-040). */
export function SplashCard({ splash, pub }: { splash: Exclude<Splash, { kind: "finish" }>; pub: PublicState }) {
  return (
    <Veil>
      <div
        role="alert"
        className="sc-splash flex max-w-[1500px] flex-col items-center rounded-[28px] px-24 py-16 text-center"
        style={{
          background: "linear-gradient(180deg, #F6EBD0, #E4D2A8)",
          color: "#2A1D12",
          boxShadow: "0 0 0 3px rgba(226,190,114,.85), 0 40px 90px rgba(0,0,0,.8)",
        }}
      >
        {splash.kind === "round" && (
          <>
            <div className="font-display text-[34px] tracking-[.3em] text-[#8E1B1B]">ROUND CLOSED</div>
            <h2 className="m-0 font-display text-[150px] leading-none font-normal">Round {roman(splash.round)} sealed</h2>
            {splash.advanced.length > 0 && (
              <p className="m-0 mt-8 text-[44px] leading-tight">
                <span className="font-display text-[#4B6B3A]">Advance · </span>
                {names(splash.advanced)}
              </p>
            )}
            {splash.out.length > 0 && (
              <p className="m-0 mt-4 text-[40px] leading-tight text-[#5E3D20]">
                <span className="font-display text-[#8E1B1B]">Out · </span>
                {names(splash.out)}
              </p>
            )}
          </>
        )}
        {splash.kind === "out" && (
          <>
            <div className="font-display text-[34px] tracking-[.3em] text-[#8E1B1B]">LOST AT SEA</div>
            <h2 className="m-0 mt-2 font-display text-[110px] leading-none font-normal">{names(splash.names, 6)}</h2>
            <p className="m-0 mt-6 text-[44px]">{splash.names.length === 1 ? "is out of the hunt" : "are out of the hunt"}</p>
          </>
        )}
        {splash.kind === "over" && (
          <>
            <div className="font-display text-[34px] tracking-[.3em] text-[#8E1B1B]">THE HUNT IS OVER</div>
            <h2 className="m-0 font-display text-[150px] leading-none font-normal">Game over</h2>
            <ol className="m-0 mt-8 flex list-none flex-col gap-3 p-0">
              {podium(pub).map((p) => (
                <li key={p.id} className="flex items-center justify-center gap-5 text-[52px]">
                  <span
                    className="flex h-[70px] w-[70px] items-center justify-center rounded-full font-display text-[34px]"
                    style={{ background: MEDAL[p.rank - 1], color: "#3A2606" }}
                  >
                    {roman(p.rank)}
                  </span>
                  <span className="font-display">{p.name}</span>
                </li>
              ))}
            </ol>
            <p className="m-0 mt-8 text-[48px] font-semibold text-[#8E1B1B]">Come back to the venue</p>
          </>
        )}
      </div>
    </Veil>
  );
}

/** The universal start QR, full screen for the first minutes of the hunt (T-703, D-021). */
export function StartSplash({ url }: { url: string }) {
  return (
    <Veil>
      <div className="sc-splash flex items-center gap-24">
        <QrCard url={url} size={620} title="SCAN TO BEGIN" note="Open Crypto Hunt and scan this mark" />
        <div className="max-w-[640px] text-[#F3E6C8]">
          <div className="font-display text-[34px] tracking-[.3em] text-[#E2BE72]">THE HUNT HAS BEGUN</div>
          <h2 className="m-0 font-display text-[120px] leading-[.95] font-normal text-[#FBE7B0]">Round I</h2>
          <p className="m-0 mt-6 text-[44px] leading-snug">
            Every player scans this mark with the scanner inside Crypto Hunt to receive their first riddle.
          </p>
        </div>
      </div>
    </Veil>
  );
}

const Veil = ({ children }: { children: React.ReactNode }) => (
  <div
    className="sc-fade absolute inset-0 z-20 flex items-center justify-center"
    style={{ background: "radial-gradient(circle at 50% 45%, rgba(26,18,10,.82), rgba(8,5,3,.96))" }}
  >
    {children}
  </div>
);

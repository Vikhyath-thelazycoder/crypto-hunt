"use client";

import { useState } from "react";
import { KeyInput } from "@/components/ui";
import { submitKey } from "@/lib/player/api";
import { groupKey, roman } from "@/lib/player/format";
import { messageFor } from "@/lib/player/messages";
import type { MyStatus } from "@/lib/player/types";
import { CrewSeals, Grain } from "../parts";
import { FoundBanner, Scanner } from "../Scanner";

export type Mark = { token: string; label: string };

type Props = {
  s: MyStatus;
  mark: Mark | null;
  scanning: boolean;
  onToken: (token: string) => void;
  onMarkLost: () => void;
  onChanged: () => void;
  onBack: () => void;
  say: (text: string, tone?: "ink" | "wax" | "moss") => void;
};

/**
 * 05 · Check in (CheckIn.dc.html) and 11 · Final mark (FinalMark.dc.html), T-304 / T-308. Each member scans
 * the crew's mark and types the key printed on it; at the final mark also the crew's seal code (D-026).
 */
export function CheckInScreen({ s, mark, scanning, onToken, onMarkLost, onChanged, onBack, say }: Props) {
  const final = s.round!.is_final;
  const me = s.members.find((m) => m.me);
  const sealed = me?.checked_in ?? false;
  const active = s.members.filter((m) => m.is_active);
  const done = active.filter((m) => m.checked_in).length;
  const [key, setKey] = useState("");
  const [seal, setSeal] = useState("");
  const [showScroll, setShowScroll] = useState(false);
  const [busy, setBusy] = useState(false);
  const ready = !!mark && key.length === 6 && (!final || seal.length === 6);

  const press = async () => {
    if (!mark || !ready || busy) return;
    setBusy(true);
    try {
      const r = await submitKey(mark.token, key, final ? seal : undefined);
      if (r.ok) {
        say(r.phase === "PENALTY" ? "All sealed. Serve the hint penalty." : "Your seal is pressed.", "moss");
        onChanged();
      } else {
        if (r.code === "NOT_SCANNED") onMarkLost();
        if (r.code === "BAD_KEY") setKey("");
        if (r.code === "BAD_SEAL") setSeal("");
        say(messageFor(r.code), "wax");
      }
    } catch {
      say(messageFor("SERVER"), "wax");
    } finally {
      setBusy(false);
    }
  };

  const banner = sealed ? (
    <FoundBanner
      title="Your seal is pressed"
      note={`Waiting for ${active.length - done} more of your crew.`}
    />
  ) : mark ? (
    <FoundBanner
      title={final ? "Final mark found" : "Your mark"}
      label={mark.label}
      note={final ? "Two seals open the chest." : "Now type the key printed on it."}
    />
  ) : null;

  return (
    <main className="ch-paper relative flex min-h-full flex-col overflow-hidden text-ink">
      <Grain />
      <div className="relative flex flex-1 flex-col gap-3.5 px-4 pt-[18px] pb-5">
        <header className="flex items-end justify-between">
          <div>
            <div
              className="font-display text-[13px] tracking-[.2em]"
              style={{ color: final ? "#7A5A12" : "#5E3D20" }}
            >
              {final
                ? `FINAL ROUND · ${roman(s.round!.number)}`
                : `ROUND ${roman(s.round!.number)} · AT THE MARK`}
            </div>
            <h1
              className="mt-0.5 mb-0 font-display font-normal"
              style={{ fontSize: final ? 44 : 46, lineHeight: 0.95 }}
            >
              {final ? "The final mark" : "Check in"}
            </h1>
          </div>
          <div
            className="font-display leading-[.85] text-wax"
            style={{ fontSize: final ? 60 : 64, textShadow: "0 2px 0 rgba(255,255,255,.4)" }}
            aria-label={`${done} of ${active.length} checked in`}
          >
            {done}
            <span className="text-[#8A6A44]" style={{ fontSize: final ? 38 : 40 }}>
              /{active.length}
            </span>
          </div>
        </header>

        {final && (mark || sealed) ? (
          banner
        ) : (
          <Scanner onToken={onToken} busy={scanning} paused={!!mark || sealed} banner={banner} />
        )}

        {!sealed && (
          <>
            <section>
              {final && <Step n={1} done={key.length === 6} />}
              <KeyInput
                label={final ? "Key on the mark" : "Secret key"}
                value={key}
                onChange={setKey}
                disabled={!mark}
              />
            </section>
            {final && (
              <section>
                <Step n={2} done={seal.length === 6} gold />
                <KeyInput
                  label="Crew seal code"
                  value={seal}
                  onChange={setSeal}
                  tone="gold"
                  disabled={!mark}
                  describedBy="sealhelp"
                />
                <p id="sealhelp" className="mt-2 mb-0 text-sm leading-[1.35] text-sepia-ink">
                  Only your crew has it. It appeared in your final clue scroll when all four pieces were
                  solved.{" "}
                  <button
                    type="button"
                    className="text-wax underline"
                    onClick={() => setShowScroll((v) => !v)}
                  >
                    {showScroll ? "Hide my scroll" : "Show my scroll"}
                  </button>
                  {showScroll && s.seal_code && (
                    <span className="mt-1 block font-mono text-lg font-semibold tracking-[.12em] text-ink">
                      {groupKey(s.seal_code)}
                    </span>
                  )}
                </p>
              </section>
            )}
          </>
        )}

        <CrewSeals members={s.members} size={final ? 50 : 54} />

        <div className="flex-1" />
        {sealed ? (
          <p className="m-0 text-center text-sm text-sepia-ink">
            The round counts when every active member has pressed their seal.
          </p>
        ) : (
          <>
            {!final && (
              <p className="m-0 text-center text-sm text-sepia-ink">
                Your seal completes the round for the whole crew.
              </p>
            )}
            <button
              className="ch-wax h-[62px] rounded-[14px] text-[22px]"
              type="button"
              onClick={press}
              disabled={!ready || busy}
            >
              {busy ? "Pressing…" : final ? "Press both seals" : "Press my seal"}
            </button>
            {!mark && (
              <button type="button" onClick={onBack} className="ch-ghost h-12 rounded-xl text-base">
                Back to the clue
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Step({ n, done, gold }: { n: number; done: boolean; gold?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="mb-2 flex h-6 w-6 items-center justify-center rounded-full font-display text-sm"
      style={{
        background: done ? "#4B6B3A" : gold ? "#B88A1E" : "#8E1B1B",
        color: done || !gold ? "#F1F4E4" : "#2A1D12",
      }}
    >
      {n}
    </span>
  );
}

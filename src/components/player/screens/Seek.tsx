"use client";

import { groupKey } from "@/lib/player/format";
import type { MyStatus } from "@/lib/player/types";
import { ClueText, CrewHeader, Paper, RoundMark, ScanIcon } from "../parts";

/** 04 · Seek (T-1202): the riddle to the crew's next place, then scan the QR or type the code on the card. */
export function SeekScreen({ s, onScan }: { s: MyStatus; onScan: () => void }) {
  const riddle = s.pieces
    .map((p) => p.text?.trim())
    .filter(Boolean)
    .join("\n");
  return (
    <Paper gap={12}>
      <CrewHeader
        team={s.team.name}
        sub={`CREW ${s.team.number}`}
        right={<RoundMark round={s.round!.number} total={s.round!.total} />}
      />
      <h1
        className="m-0 font-display text-[44px] leading-[.95] font-normal tracking-[.03em]"
        style={{ textShadow: "0 1px 0 rgba(255,255,255,.55)" }}
      >
        {s.round!.is_final ? "The final riddle" : "Your riddle"}
      </h1>
      <blockquote aria-live="polite" className="ch-quote m-0 px-4 py-3">
        <p className="ch-ink m-0 text-lg leading-[1.35] whitespace-pre-line italic">
          <ClueText text={riddle} />
        </p>
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
            <div className="text-[13px] text-sepia-ink">Only your crew has it. You need it at the final mark.</div>
          </div>
          <div className="font-mono text-[26px] font-semibold tracking-[.12em]">{groupKey(s.seal_code)}</div>
        </section>
      )}

      <div className="flex-1" />
      <button
        className="ch-wax flex h-[62px] items-center justify-center gap-3 rounded-[14px] text-[22px]"
        type="button"
        onClick={onScan}
      >
        <ScanIcon />
        Found it — scan or type the code
      </button>
    </Paper>
  );
}

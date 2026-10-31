"use client";

import { useState } from "react";
import { KeyInput } from "@/components/ui";
import { roman } from "@/lib/player/format";
import type { MyStatus } from "@/lib/player/types";
import { Grain } from "../parts";
import { Scanner } from "../Scanner";

type Props = {
  s: MyStatus;
  busy: boolean;
  /** A scanned token or a typed code, with the seal code at the final mark. */
  onCode: (code: string, seal?: string) => void;
  onBack: () => void;
};

/**
 * 05 · At the mark (T-1202): the camera or the code printed on the card, whichever works; both send the same single
 * request. At the final mark the crew's seal code goes with it (D-026).
 */
export function CheckInScreen({ s, busy, onCode, onBack }: Props) {
  const final = s.round!.is_final;
  const [code, setCode] = useState("");
  const [seal, setSeal] = useState(s.seal_code ?? "");
  const ready = code.length === 6 && (!final || seal.length === 6);

  return (
    <main className="ch-paper relative flex min-h-full flex-col overflow-hidden text-ink">
      <Grain />
      <div className="relative flex flex-1 flex-col gap-3.5 px-4 pt-[18px] pb-5">
        <header>
          <div className="font-display text-[13px] tracking-[.2em]" style={{ color: final ? "#7A5A12" : "#5E3D20" }}>
            {final ? `FINAL ROUND · ${roman(s.round!.number)}` : `ROUND ${roman(s.round!.number)} · AT THE MARK`}
          </div>
          <h1 className="mt-0.5 mb-0 font-display font-normal" style={{ fontSize: final ? 44 : 46, lineHeight: 0.95 }}>
            {final ? "The final mark" : "Check in"}
          </h1>
        </header>

        <Scanner onToken={(token) => onCode(token, final ? seal : undefined)} busy={busy} />

        <p className="m-0 text-center font-display text-[15px] tracking-[.2em] text-sepia-ink">OR TYPE THE CODE ON THE CARD</p>
        <KeyInput label="Code on the card" value={code} onChange={setCode} />
        {final && <KeyInput label="Crew seal code" value={seal} onChange={setSeal} tone="gold" />}

        <div className="flex-1" />
        <button
          className="ch-wax h-[62px] rounded-[14px] text-[22px]"
          type="button"
          onClick={() => onCode(code, final ? seal : undefined)}
          disabled={!ready || busy}
        >
          {busy ? "Checking…" : "Check in"}
        </button>
        <button type="button" onClick={onBack} className="ch-ghost h-12 rounded-xl text-base">
          Back to the riddle
        </button>
      </div>
    </main>
  );
}

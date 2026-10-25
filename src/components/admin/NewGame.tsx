"use client";

import { useId, useState } from "react";
import * as api from "@/lib/admin/api";
import { download, exportCsv, exportFilename } from "@/lib/admin/csv";
import { attempt, Modal, type Say } from "./parts";

/**
 * New Game (T-409, D-027): offers the CSV export, then wipes players, progress and logs. Crews are kept with new
 * codes and new routes at Start; the printed QRs are kept unless "regenerate" is ticked (then reprint).
 */
export function NewGameDialog({ say, onClose, onChanged }: { say: Say; onClose: () => void; onChanged: () => void }) {
  const [word, setWord] = useState("");
  const [regen, setRegen] = useState(false);
  const [exported, setExported] = useState(false);
  const [busy, setBusy] = useState(false);
  const typedId = useId();

  const exportNow = async () => {
    const ok = await attempt(async () => {
      const data = await api.exportResults();
      download(exportFilename(), exportCsv(data));
    }, say);
    if (ok) setExported(true);
  };
  const confirm = async () => {
    setBusy(true);
    const ok = await attempt(
      () => api.startNewGame(word.trim().toUpperCase(), regen),
      say,
      regen
        ? "New game ready. Every QR has a new token and key: print and hide the new sheet."
        : "New game ready. Hand out the new crew codes; the printed QRs stay where they are.",
    );
    setBusy(false);
    onChanged();
    if (ok) onClose();
  };

  return (
    <Modal title="Start a new game" onClose={onClose} width={520}>
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (word.trim().toUpperCase() === "NEW GAME") void confirm();
        }}
      >
        <div className="text-[15px] leading-normal text-[#4A2F18]">
          Everyone is signed out. Players, progress, the ship&apos;s log and alerts are deleted. Crews stay with{" "}
          <b>new codes</b> and get new random routes at Start. Locations, the map, clues and questions are kept.
        </div>
        <div className="flex items-center justify-between gap-3 rounded-[10px] bg-[rgba(42,29,18,.06)] px-3 py-2.5">
          <span className="text-[15px]">{exported ? "Results saved." : "Save this game's results first?"}</span>
          <button type="button" className="ch-brass h-9 rounded-[9px] px-3 text-[14px]" onClick={exportNow}>
            {exported ? "Download again" : "Download CSV"}
          </button>
        </div>
        <label className="flex cursor-pointer items-start gap-2.5 text-[15px] leading-snug">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-[#8E1B1B]"
            checked={regen}
            onChange={(e) => setRegen(e.target.checked)}
          />
          <span>
            Regenerate every QR code and key. <b>The whole sheet must then be reprinted and hidden again.</b> Use it when the
            same people play again.
          </span>
        </label>
        <div>
          <label htmlFor={typedId} className="ch-lbl mb-1.5">
            TYPE NEW GAME TO CONFIRM
          </label>
          <input
            id={typedId}
            className="ch-inp font-mono"
            value={word}
            autoComplete="off"
            onChange={(e) => setWord(e.target.value)}
          />
        </div>
        <div className="flex gap-2.5">
          <button
            type="submit"
            className="ch-awax h-[46px] flex-1 rounded-[11px] text-base"
            disabled={busy || word.trim().toUpperCase() !== "NEW GAME"}
          >
            {busy ? "Clearing the decks…" : "Wipe and start a new game"}
          </button>
          <button type="button" className="ch-plain h-[46px] rounded-[11px] px-4" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

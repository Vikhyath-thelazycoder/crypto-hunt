"use client";

import { useId, useState } from "react";
import * as api from "@/lib/admin/api";
import { download, exportCsv, exportFilename } from "@/lib/admin/csv";
import { closesNow, focusRound, openRounds, startBlocker, started } from "@/lib/admin/dashboard";
import type { Snapshot } from "@/lib/admin/types";
import { roman } from "@/lib/player/format";
import { attempt, ConfirmDialog, Modal, Toggle, type Say } from "./parts";
import { JoinQrButton } from "./JoinQr";
import { NewGameDialog } from "./NewGame";

/** The control bar pinned on top of the Live page (AdminDashboard.dc.html, T-407, F14). */
export function ControlBar({ s, say, onChanged }: { s: Snapshot; say: Say; onChanged: () => void }) {
  const g = s.game;
  const [dialog, setDialog] = useState<null | "broadcast" | "end" | "new" | "start">(null);
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    const ok = await attempt(action, say, done);
    setBusy(false);
    onChanged();
    return ok;
  };

  const running = g.status === "RUNNING" || g.status === "PAUSED";
  const before = g.status === "SETUP" || g.status === "REGISTRATION" || g.status === "READY";
  const blocker = startBlocker(s);

  const exportNow = async () => {
    await attempt(async () => {
      const data = await api.exportResults();
      download(exportFilename(), exportCsv(data));
    }, say);
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2.5" aria-label="Game controls" role="toolbar">
      {before && (
        <label className="flex h-10 items-center gap-2.5 rounded-[10px] border border-[rgba(226,190,114,.35)] px-3 text-[15px] font-semibold">
          Joining
          <Toggle
            on={g.registration_open}
            label={g.registration_open ? "Joining open" : "Joining closed"}
            disabled={busy}
            onChange={(open) => run(() => api.setRegistration(open), open ? "Joining is open." : "Joining is closed.")}
          />
        </label>
      )}
      {before && (
        <JoinQrButton className="h-10 rounded-[10px] border border-[rgba(226,190,114,.35)] px-3 text-[15px] font-semibold" />
      )}
      {g.status === "RUNNING" && (
        <IronButton disabled={busy} onClick={() => run(api.pauseGame, "Paused. Every phone shows the pause.")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EADBB8" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M9 5v14M15 5v14" />
          </svg>
          Pause
        </IronButton>
      )}
      {g.status === "PAUSED" && (
        <button
          type="button"
          className="ch-brass flex h-10 items-center gap-2 rounded-[10px] px-3.5 text-[15px]"
          disabled={busy}
          onClick={() => run(api.resumeGame, "Resumed. Penalties carry on from where they froze.")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#2A1D12" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
          Resume
        </button>
      )}
      {g.status !== "SETUP" && (
        <IronButton disabled={busy} onClick={() => setDialog("broadcast")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EADBB8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" />
            <path d="M15 9a4 4 0 0 1 0 6" />
          </svg>
          Broadcast
        </IronButton>
      )}
      {g.status !== "FINISHED" && (
        <label className="flex h-10 items-center gap-2.5 rounded-[10px] border border-[rgba(226,190,114,.35)] px-3 text-[15px] font-semibold">
          Hints
          <Toggle
            on={g.hints_enabled}
            label={g.hints_enabled ? "Hints on" : "Hints off"}
            disabled={busy}
            onChange={(on) =>
              run(() => api.setHints(on), on ? "Hints on (never on multiple choice)." : "Hints off.")
            }
          />
        </label>
      )}
      {running && <Advance s={s} busy={busy} run={run} />}
      {before && (
        <button
          type="button"
          className="ch-awax h-10 rounded-[10px] px-4 text-[15px]"
          disabled={busy || !!blocker}
          title={blocker ?? undefined}
          aria-describedby={blocker ? "start-blocker" : undefined}
          onClick={() => setDialog("start")}
        >
          Start Hunt
        </button>
      )}
      {started(g) && (
        <button type="button" className="ch-brass h-10 rounded-[10px] px-3.5 text-[15px]" onClick={exportNow}>
          Export CSV
        </button>
      )}
      {running && (
        <button type="button" className="ch-awax h-10 rounded-[10px] px-4 text-[15px]" disabled={busy} onClick={() => setDialog("end")}>
          End game
        </button>
      )}
      {g.status === "FINISHED" && (
        <button type="button" className="ch-awax h-10 rounded-[10px] px-4 text-[15px]" onClick={() => setDialog("new")}>
          New game
        </button>
      )}
      {before && blocker && (
        <p id="start-blocker" className="m-0 basis-full text-right text-sm text-[#E9C2B6]">
          Start: {blocker}
        </p>
      )}

      {dialog === "broadcast" && <BroadcastDialog s={s} say={say} onClose={() => setDialog(null)} onChanged={onChanged} />}
      {dialog === "start" && (
        <ConfirmDialog
          title="Start the hunt?"
          body={
            <>
              Every phone moves to Round I. Joining closes, and the start mark is shown on the projector. The course is
              fixed from now on.
            </>
          }
          confirmLabel="Start Hunt"
          onConfirm={() => run(api.startGame, "The hunt has begun.")}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "end" && (
        <ConfirmDialog
          title="End the game now?"
          body="Every crew stops where it is. Ranking: highest round sealed, then the earliest time (penalties included)."
          confirmLabel="End game"
          reason
          reasonLabel="REASON (SHOWN IN THE LOG)"
          typed="END"
          onConfirm={(reason) => run(() => api.endGame(reason), "The hunt is over.")}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "new" && <NewGameDialog say={say} onClose={() => setDialog(null)} onChanged={onChanged} />}
    </div>
  );
}

function IronButton({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="ch-iron flex h-10 items-center gap-2 rounded-[10px] px-3.5 text-[15px]" {...rest}>
      {children}
    </button>
  );
}

type Run = (action: () => Promise<unknown>, done?: string) => Promise<boolean>;

/** X for the round being decided (or any later open round): live, D-012. */
function Advance({ s, busy, run }: { s: Snapshot; busy: boolean; run: Run }) {
  const open = openRounds(s.rounds);
  const focus = focusRound(s.rounds);
  const [pick, setPick] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{ x: number; out: number; done: number } | null>(null);
  const [checking, setChecking] = useState(false);
  const round = open.find((r) => r.number === pick) ?? (focus && !focus.closed_at ? focus : open[0]);
  if (!round) return null;
  // Whether this X seals the round is decided on fresh numbers: the dashboard may be a moment behind, and a
  // sealed round eliminates crews at once.
  const set = async (x: number) => {
    if (x < 1 || x > Math.max(1, s.teams.length) || checking) return;
    setChecking(true);
    let out = 0;
    let done = round.completed;
    try {
      const fresh = await api.adminSnapshot();
      const now = fresh.rounds.find((r) => r.number === round.number);
      out = now ? closesNow(fresh, now, x) : 0;
      done = now?.completed ?? done;
    } catch {
      out = closesNow(s, round, x);
    }
    setChecking(false);
    if (out > 0) setConfirm({ x, out, done });
    else void run(() => api.setAdvanceCount(round.number, x), `Round ${roman(round.number)}: ${x} crews advance.`);
  };
  return (
    <div className="flex h-10 items-center overflow-hidden rounded-[10px] border border-[rgba(226,190,114,.35)]">
      {open.length > 1 ? (
        <select
          aria-label="Round to set"
          value={round.number}
          onChange={(e) => setPick(Number(e.target.value))}
          className="h-10 cursor-pointer border-0 bg-transparent pr-1 pl-3 font-body text-[15px] font-semibold text-[#EADBB8]"
        >
          {open.map((r) => (
            <option key={r.number} value={r.number} className="text-ink">
              Round {roman(r.number)} advance
            </option>
          ))}
        </select>
      ) : (
        <span className="px-3 text-[15px] font-semibold">Round {roman(round.number)} advance</span>
      )}
      <button
        type="button"
        className="ch-iron h-10 w-9 rounded-none border-0 border-l border-[rgba(226,190,114,.35)] text-lg"
        aria-label="Fewer crews advance"
        disabled={busy || checking || round.advance <= 1}
        onClick={() => void set(round.advance - 1)}
      >
        −
      </button>
      <span className="w-[34px] text-center font-mono text-lg font-semibold text-[#FBE3A0]" aria-live="polite">
        {round.advance}
      </span>
      <button
        type="button"
        className="ch-iron h-10 w-9 rounded-none border-0 text-lg"
        aria-label="More crews advance"
        disabled={busy || checking || round.advance >= s.teams.length}
        onClick={() => void set(round.advance + 1)}
      >
        +
      </button>
      {confirm && (
        <ConfirmDialog
          title={`Seal Round ${roman(round.number)} now?`}
          body={
            <>
              {confirm.done} crew{confirm.done === 1 ? " has" : "s have"} sealed Round {roman(round.number)}. Setting
              advance to {confirm.x} closes the round at once and <b>eliminates {confirm.out} crew{confirm.out === 1 ? "" : "s"}</b>{" "}
              still in it.
            </>
          }
          confirmLabel={`Seal and eliminate ${confirm.out}`}
          typed="SEAL"
          onConfirm={() => run(() => api.setAdvanceCount(round.number, confirm.x), `Round ${roman(round.number)} sealed.`)}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function BroadcastDialog({
  s,
  say,
  onClose,
  onChanged,
}: {
  s: Snapshot;
  say: Say;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [text, setText] = useState(s.game.broadcast ?? "");
  const [busy, setBusy] = useState(false);
  const id = useId();
  const send = async (value: string) => {
    setBusy(true);
    const ok = await attempt(
      () => api.broadcast(value),
      say,
      value.trim() ? "Sent to every phone." : "Broadcast cleared.",
    );
    setBusy(false);
    onChanged();
    if (ok) onClose();
  };
  return (
    <Modal title="Broadcast to every phone" onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <label htmlFor={id} className="ch-lbl">
          MESSAGE · {200 - text.length} LEFT
        </label>
        <textarea id={id} className="ch-inp" rows={3} maxLength={200} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex gap-2.5">
          <button type="submit" className="ch-awax h-[46px] flex-1 rounded-[11px] text-base" disabled={busy || !text.trim()}>
            Send
          </button>
          {s.game.broadcast && (
            <button type="button" className="ch-plain h-[46px] rounded-[11px] px-4" disabled={busy} onClick={() => send("")}>
              Clear current
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

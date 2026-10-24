"use client";

import { useState, type FormEvent } from "react";
import { submitAnswer, takeHint } from "@/lib/player/api";
import { initials, mmss, roman } from "@/lib/player/format";
import { messageFor } from "@/lib/player/messages";
import type { MyStatus, Piece } from "@/lib/player/types";
import { CrewHeader, Paper, PhaseNav, RoundMark, ScanIcon } from "../parts";

type Props = {
  s: MyStatus;
  onChanged: () => void;
  onScanStart: () => void;
  say: (text: string, tone?: "ink" | "wax" | "moss") => void;
};

const FORMAT_NOTE = { text: "Type your answer.", number: "Answer with a number.", mcq: "Pick one." } as const;

/** 03 · Solve (Solve.dc.html, T-303): each member's own question unlocks one piece of the clue. */
export function SolveScreen({ s, onChanged, onScanStart, say }: Props) {
  const task = s.task;
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [askHint, setAskHint] = useState(false);
  const solved = s.pieces.filter((p) => p.solved).length;

  const send = async (value: string, e?: FormEvent) => {
    e?.preventDefault();
    if (!task || busy || !value.trim()) return;
    setBusy(true);
    try {
      const r = await submitAnswer(task.id, value);
      if (!r.ok) say(messageFor(r.code), "wax");
      else if (r.correct) {
        setAnswer("");
        say("Right! Your piece is inked onto the clue.", "moss");
        onChanged();
      } else say("Not quite. Try again — there's no penalty.", "ink");
    } catch {
      say(messageFor("SERVER"), "wax");
    } finally {
      setBusy(false);
    }
  };

  const hint = async () => {
    if (!task) return;
    setAskHint(false);
    const r = await takeHint(task.id).catch(() => ({ ok: false, code: "SERVER" }));
    if (!r.ok) say(messageFor(r.code), "wax");
    onChanged();
  };

  return (
    <Paper>
      <CrewHeader
        team={s.team.name}
        sub={`TEAM ${String(s.team.number).padStart(2, "0")} · ${s.player.name.toUpperCase()}`}
        right={<RoundMark round={s.round!.number} total={s.round!.total} />}
      />
      <PhaseNav step={0} />
      <h1
        className="mt-0.5 mb-0 font-display text-[58px] leading-[.9] font-normal tracking-[.04em]"
        style={{ textShadow: "0 1px 0 rgba(255,255,255,.55)" }}
      >
        Solve
      </h1>

      {!task ? (
        <p className="m-0 text-base text-sepia-ink">Your crew&apos;s pieces are being solved.</p>
      ) : !task.opened ? (
        <article
          style={{
            filter: "drop-shadow(0 14px 14px rgba(42,29,18,.3)) drop-shadow(0 1px 1px rgba(42,29,18,.3))",
          }}
        >
          <div className="ch-torn ch-piece-on px-5 pt-[22px] pb-5">
            <span className="font-display text-[13px] tracking-[.18em] text-wax">THE HUNT HAS BEGUN</span>
            <p className="mt-2.5 mb-0 text-[22px] leading-[1.3] font-medium">
              Scan the start mark on the big screen to open your question.
            </p>
          </div>
        </article>
      ) : task.solved ? (
        <article style={{ filter: "drop-shadow(0 14px 14px rgba(42,29,18,.3))" }}>
          <div className="ch-torn ch-piece-on px-5 pt-[22px] pb-5">
            <span className="font-display text-[13px] tracking-[.18em] text-[#3C5A2D]">
              YOUR PIECE · {roman(task.piece_index + 1)} IS IN
            </span>
            <p className="mt-2.5 mb-0 text-xl leading-[1.3] font-medium">
              Help your crew: {4 - solved} piece{4 - solved === 1 ? "" : "s"} still sealed.
            </p>
          </div>
        </article>
      ) : (
        <>
          <article
            style={{
              filter: "drop-shadow(0 14px 14px rgba(42,29,18,.3)) drop-shadow(0 1px 1px rgba(42,29,18,.3))",
            }}
          >
            <div className="ch-torn ch-piece-on px-5 pt-[22px] pb-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                <span className="font-display text-[13px] tracking-[.18em] whitespace-nowrap text-wax">
                  YOUR QUESTION · PIECE {roman(task.piece_index + 1)}
                </span>
                <span
                  className="font-mono text-xs whitespace-nowrap text-sepia-ink"
                  aria-label={`Difficulty ${task.difficulty} of 5`}
                >
                  {task.category ? `${task.category.toUpperCase()} · ` : ""}
                  {"●".repeat(task.difficulty)}
                  {"○".repeat(5 - task.difficulty)}
                </span>
              </div>
              <p className="mt-2.5 mb-0 text-[22px] leading-[1.3] font-medium">{task.text}</p>
              <p className="mt-2 mb-0 text-[15px] text-sepia-ink italic">
                {FORMAT_NOTE[task.format ?? "text"]}
              </p>
              {task.hint && (
                <p className="mt-2 mb-0 text-[15px] text-ink">
                  <b className="font-display tracking-[.1em] text-wax">HINT ·</b> {task.hint}
                </p>
              )}
            </div>
          </article>

          {task.format === "mcq" && task.options ? (
            <div className="grid gap-2" role="group" aria-label="Choices">
              {task.options.map((opt, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={busy}
                  onClick={() => send(String(i))}
                  className="ch-field flex h-auto min-h-[52px] items-center gap-3 py-2 text-left text-lg"
                >
                  <span className="font-display text-wax">{String.fromCharCode(65 + i)}</span>
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <form className="flex gap-2.5" onSubmit={(e) => send(answer, e)}>
              <label htmlFor="ans" className="sr-only">
                Your answer
              </label>
              <input
                id="ans"
                className="ch-field min-w-0 flex-1"
                style={{ height: 56, borderRadius: 12, fontSize: 20 }}
                placeholder="Your answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                inputMode={task.format === "number" ? "decimal" : "text"}
                autoComplete="off"
                autoCapitalize="off"
                enterKeyHint="send"
              />
              <button
                className="ch-wax flex h-14 w-16 items-center justify-center rounded-xl"
                type="submit"
                aria-label="Submit answer"
                disabled={busy}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#F7E9C8"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </form>
          )}
          <span className="text-sm text-sepia-ink">
            Unlimited tries. Your crew sees the piece the moment you&apos;re right.
          </span>
          {s.game.hints_enabled && task.has_hint && !task.hint_used && !askHint && (
            <button
              type="button"
              onClick={() => setAskHint(true)}
              className="ch-brass flex h-11 items-center gap-2 self-start rounded-[22px] px-4 text-[15px]"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#2A1D12"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5V16h8v-2.5A6 6 0 0 0 12 3z" />
              </svg>
              Take a hint · +{mmss(s.game.hint_penalty_ms)}
            </button>
          )}
          {askHint && (
            <div
              className="ch-panel flex flex-col gap-2 rounded-xl px-4 py-3"
              role="alertdialog"
              aria-label="Take a hint?"
            >
              <p className="m-0 text-[15px]">
                Your crew serves <b>+{mmss(s.game.hint_penalty_ms)}</b> at the next check-in before the round
                counts.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="ch-brass h-10 rounded-[10px] px-4 text-[15px]"
                  onClick={hint}
                >
                  Take the hint
                </button>
                <button
                  type="button"
                  className="ch-ghost h-10 rounded-[10px] px-4 text-[15px]"
                  onClick={() => setAskHint(false)}
                >
                  Not now
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex-1" />
      {task && !task.opened && (
        <button
          className="ch-wax flex h-[62px] items-center justify-center gap-3 rounded-[14px] text-[22px]"
          type="button"
          onClick={onScanStart}
        >
          <ScanIcon />
          Scan the start mark
        </button>
      )}
      <ClueGrid pieces={s.pieces} solved={solved} me={s.player.name} />
    </Paper>
  );
}

function ClueGrid({ pieces, solved, me }: { pieces: Piece[]; solved: number; me: string }) {
  return (
    <section aria-label={`Clue pieces, ${solved} of 4 unlocked`}>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="m-0 font-display text-[17px] font-normal tracking-[.14em]">THE CLUE</h2>
        <span className="font-mono text-[13px] font-semibold text-wax">{solved} / 4 PIECES</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {pieces.map((p) => {
          const who = p.mine ? "YOU" : (p.by ?? "MERGED").toUpperCase();
          return p.solved ? (
            <div key={p.index} style={{ filter: "drop-shadow(0 5px 6px rgba(42,29,18,.3))" }}>
              <div className="ch-torn ch-piece-on box-border h-[86px] px-3 pt-3 pb-2.5">
                <div className="font-mono text-[11px] text-sepia-ink">
                  {roman(p.index + 1)} · {who}
                </div>
                <div className="ch-ink mt-1 text-base leading-[1.25] italic">{p.text}</div>
              </div>
            </div>
          ) : (
            <div key={p.index} style={{ filter: "drop-shadow(0 5px 6px rgba(42,29,18,.25))" }}>
              <div
                className="ch-torn ch-piece-off box-border flex h-[86px] items-center gap-2.5 p-3"
                style={p.mine ? { boxShadow: "inset 0 0 0 2px #8E1B1B" } : undefined}
              >
                <div className="ch-seal flex-none" style={{ width: 38, height: 38, fontSize: 15 }}>
                  {initials(p.mine ? me : (p.by ?? "?"), 1)}
                </div>
                <div>
                  <div className="font-mono text-[11px] text-[#4A2F18]">
                    {roman(p.index + 1)} · {who}
                  </div>
                  <div className="text-sm text-[#3A2716]" style={{ fontWeight: p.mine ? 600 : 400 }}>
                    {p.mine ? "Sealed until you answer" : "Still solving…"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

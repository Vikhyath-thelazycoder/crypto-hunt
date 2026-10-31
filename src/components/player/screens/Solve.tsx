"use client";

import { useState, type FormEvent } from "react";
import { submitAnswer, takeHint } from "@/lib/player/api";
import { mmss } from "@/lib/player/format";
import { messageFor } from "@/lib/player/messages";
import type { MyStatus } from "@/lib/player/types";
import { CrewHeader, Paper, PhaseNav, RoundMark } from "../parts";

type Props = {
  s: MyStatus;
  onChanged: () => void;
  say: (text: string, tone?: "ink" | "wax" | "moss") => void;
};

const FORMAT_NOTE = {
  text: "Type your answer.",
  number: "Answer with a number.",
  mcq: "Pick one of the four.",
} as const;

/** 03 · Solve (T-1103): the crew's question for this round; the right answer shows the riddle. */
export function SolveScreen({ s, onChanged, say }: Props) {
  const task = s.task;
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [askHint, setAskHint] = useState(false);

  const send = async (value: string, e?: FormEvent) => {
    e?.preventDefault();
    if (!task || busy || !value.trim()) return;
    setBusy(true);
    try {
      const r = await submitAnswer(task.id, value);
      if (!r.ok) say(messageFor(r.code), "wax");
      else if (r.correct) {
        setAnswer("");
        say("Right! Here is your riddle.", "moss");
        onChanged();
      } else {
        // D-029: a wrong pick on multiple choice deals a different question. D-041: every 3rd wrong, either
        // format, adds the wrong-answer penalty to the crew's check-in.
        const wrong = r.replaced ? "Wrong pick. Here's a new question" : "Not quite";
        const left = 3 - (r.strikes ?? 0);
        if (r.penalized)
          say(`${wrong}. Third miss: your crew serves +${mmss(s.game.wrong_penalty_ms)}.`, "wax");
        else
          say(
            `${wrong} — ${left} more miss${left === 1 ? "" : "es"} before +${mmss(s.game.wrong_penalty_ms)}.`,
            r.replaced ? "wax" : "ink",
          );
        onChanged();
      }
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
        sub={`CREW ${s.team.number}`}
        right={<RoundMark round={s.round!.number} total={s.round!.total} />}
      />
      <PhaseNav step={0} />
      <h1
        className="mt-0.5 mb-0 font-display text-[58px] leading-[.9] font-normal tracking-[.04em]"
        style={{ textShadow: "0 1px 0 rgba(255,255,255,.55)" }}
      >
        Solve
      </h1>

      {!task || task.solved ? (
        <p className="m-0 text-base text-sepia-ink">Opening your riddle…</p>
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
                  YOUR QUESTION
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
              <QuestionText text={task.text ?? ""} />
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
          <div
            className="flex items-center gap-2"
            aria-label={`${3 - task.strikes} of 3 misses left before a penalty`}
          >
            <span className="font-display text-[13px] tracking-[.18em] text-sepia-ink">MISSES LEFT</span>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                aria-hidden="true"
                className="h-3 w-3 rounded-full"
                style={
                  i < 3 - task.strikes
                    ? { background: "radial-gradient(circle at 35% 30%, #C9493C, #6E1010)" }
                    : { border: "1.5px solid #6E4A2A" }
                }
              />
            ))}
          </div>
          <span className="text-sm text-sepia-ink">
            {task.format === "mcq"
              ? `One pick per question: a wrong pick swaps in a new one. Every 3rd miss adds +${mmss(s.game.wrong_penalty_ms)} at check-in.`
              : `Unlimited tries, but every 3rd miss adds +${mmss(s.game.wrong_penalty_ms)} at check-in.`}
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

    </Paper>
  );
}

/**
 * The question: its first line in big type; any further lines are code, kept exactly as written (indentation
 * matters in Python) in a monospaced block that scrolls sideways instead of wrapping.
 */
export function QuestionText({ text }: { text: string }) {
  const [lead, ...code] = text.replace(/\r\n?/g, "\n").split("\n");
  const block = code.join("\n").replace(/\s+$/, "");
  return (
    <>
      <p className="mt-2.5 mb-0 text-[22px] leading-[1.3] font-medium">{lead}</p>
      {block && (
        <pre
          className="mt-3 mb-0 overflow-x-auto rounded-[10px] bg-[rgba(42,29,18,.08)] px-3.5 py-3 font-mono text-[16px] leading-[1.45] whitespace-pre text-ink"
          aria-label="Code"
        >
          {block}
        </pre>
      )}
    </>
  );
}

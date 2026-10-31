"use client";

import { useState, type FormEvent } from "react";
import { setupCrew } from "@/lib/player/api";
import { messageFor } from "@/lib/player/messages";
import type { MyStatus } from "@/lib/player/types";
import { CaptainNote, CrewHeader, LockIcon, Paper } from "../parts";

/** 02 · Lobby (T-1201): the crew is in and waits for Start Hunt, when its first question appears here. */
export function LobbyScreen({
  s,
  onChanged = () => {},
  say = () => {},
}: {
  s: MyStatus;
  onChanged?: () => void;
  say?: (text: string, tone?: "ink" | "wax" | "moss") => void;
}) {
  const crew = [s.player.name, ...(s.team.crew ?? [])];
  return (
    <Paper gap={14}>
      <CrewHeader
        team={s.team.name}
        sub={`CREW ${s.team.number}`}
        right={
          <div className="text-right font-display text-[13px] tracking-[.18em] text-sepia-ink">
            BEFORE
            <br />
            THE HUNT
          </div>
        }
      />

      <section className="pt-1.5 text-center">
        <p className="m-0 font-display text-[15px] tracking-[.3em] text-sepia-ink">YOUR CREW IS IN</p>
        <p className="mt-2 mb-0 text-lg text-sepia-ink">
          Keep this page open. Your first question appears here when the captain starts the hunt.
        </p>
      </section>

      {s.team.can_name && <CrewForm current={s.team.name} onDone={onChanged} say={say} />}

      <section className="ch-sheet rounded-2xl px-4 py-1.5" aria-label="Crew members">
        {crew.map((name, i) => (
          <div
            key={`${name}-${i}`}
            className={`flex items-center justify-between py-3 text-[19px] ${i === crew.length - 1 ? "" : "border-b border-[rgba(110,74,42,.22)]"}`}
          >
            <span className="font-semibold">{name}</span>
            {i === 0 && <span className="font-display text-[13px] tracking-[.14em] text-wax">TEAM LEAD · THIS PHONE</span>}
          </div>
        ))}
      </section>

      <CaptainNote text={s.game.broadcast ?? "Only this phone plays for your crew. Your teammates help you in person."} />

      <div className="flex-1" />
      <button
        className="ch-locked flex h-[60px] items-center justify-center gap-2.5 rounded-[14px] font-display text-xl tracking-[.06em]"
        type="button"
        disabled
      >
        <LockIcon />
        Waiting for Start Hunt
      </button>
    </Paper>
  );
}

/** Only when the join form didn't finish, e.g. the team name was taken and the page was reloaded. */
function CrewForm({
  current,
  onDone,
  say,
}: {
  current: string;
  onDone: () => void;
  say: (text: string, tone?: "ink" | "wax" | "moss") => void;
}) {
  const [name, setName] = useState("");
  const [mates, setMates] = useState(["", "", ""]);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const r = await setupCrew(name.trim(), mates.map((m) => m.trim()));
      if (r.ok) onDone();
      else say(messageFor(r.code), "wax");
    } catch {
      say(messageFor("SERVER"), "wax");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="ch-panel flex flex-col gap-2.5 rounded-[14px] px-4 py-3.5" aria-label="Finish your crew">
      <label htmlFor="crew-name" className="font-display text-[13px] tracking-[.18em] text-wax">
        FINISH YOUR CREW
      </label>
      <input
        id="crew-name"
        className="ch-field"
        placeholder={current}
        aria-label="Team name"
        value={name}
        maxLength={24}
        autoComplete="off"
        onChange={(e) => setName(e.target.value)}
      />
      {mates.map((m, i) => (
        <input
          key={i}
          className="ch-field"
          placeholder={`Teammate ${i + 1}`}
          aria-label={`Teammate ${i + 1}`}
          value={m}
          maxLength={40}
          autoComplete="off"
          onChange={(e) => setMates((all) => all.map((x, k) => (k === i ? e.target.value : x)))}
        />
      ))}
      <button type="submit" className="ch-wax h-[50px] rounded-[11px] px-4 font-display text-base" disabled={busy}>
        {busy ? "…" : "Save the crew"}
      </button>
    </form>
  );
}

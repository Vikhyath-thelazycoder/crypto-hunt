"use client";

import { useEffect, useState, type FormEvent } from "react";
import { KeyInput } from "@/components/ui";
import { joinCrew, previewCrew, setupCrew, type CrewPreview } from "@/lib/player/api";
import { messageFor } from "@/lib/player/messages";
import { Compass, Grain } from "../parts";

/**
 * 01 · Join (T-1201): one phone per crew. The lead types the crew code, their name, the team name and the 3 teammates.
 * If the crew already has a lead, the same code and lead name log back in on this phone.
 */
export function JoinScreen({ reason, onJoined }: { reason: string | null; onJoined: () => void }) {
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [mates, setMates] = useState(["", "", ""]);
  const [joined, setJoined] = useState(false);
  const [code, setCode] = useState("");
  const [crew, setCrew] = useState<CrewPreview | null>(null);
  const [error, setError] = useState<string | null>(reason ? messageFor(reason) : null);
  const [busy, setBusy] = useState(false);

  // Once six characters are in, show which crew that is (rate-limited on the server).
  useEffect(() => {
    setCrew(null);
    if (code.length !== 6) return;
    let live = true;
    const id = setTimeout(async () => {
      const r = await previewCrew(code);
      if (!live) return;
      if (r.ok && r.team) {
        setCrew(r.team);
        setError(null);
      } else setError(messageFor(r.code));
    }, 250);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [code]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    const returning = (crew?.members.length ?? 0) > 0;
    if (name.trim().length < 2) return setError(messageFor("BAD_NAME"));
    if (code.length !== 6) return setError("Type your crew's 6-character code.");
    if (!returning) {
      if (team.trim().length < 2) return setError(messageFor("BAD_CREW_NAME"));
      if (mates.some((m) => m.trim().length < 2)) return setError(messageFor("BAD_MEMBERS"));
    }
    setBusy(true);
    setError(null);
    // A taken team name must not cost the crew its seat: once joined, only the form is sent again.
    if (!joined) {
      const r = await joinCrew(name.trim(), code);
      if (!r.ok) {
        setBusy(false);
        return setError(messageFor(r.code));
      }
      setJoined(true);
    }
    if (!returning) {
      const r = await setupCrew(team.trim(), mates.map((m) => m.trim())).catch(() => ({ ok: false, code: "SERVER" }));
      if (!r.ok && r.code !== "GAME_STARTED") {
        setBusy(false);
        return setError(messageFor(r.code));
      }
    }
    setBusy(false);
    onJoined();
  };

  const returning = (crew?.members.length ?? 0) > 0;

  return (
    <main className="ch-paper relative flex min-h-full flex-col overflow-hidden text-ink">
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ mixBlendMode: "multiply", opacity: 0.38 }}
      >
        <ellipse cx="85%" cy="90%" rx="120" ry="70" fill="#9C7A45" opacity=".18" />
        <ellipse cx="10%" cy="14%" rx="80" ry="50" fill="#9C7A45" opacity=".12" />
      </svg>
      <Grain />
      <form onSubmit={submit} className="relative flex flex-1 flex-col items-center px-5 pt-10 pb-7">
        <Compass />
        <p className="mt-[22px] mb-0 font-display text-[13px] tracking-[.22em] whitespace-nowrap text-sepia-ink">
          ONE CREW · ONE PHONE
        </p>
        <h1
          className="mt-1 mb-0 font-display text-[56px] leading-none font-normal"
          style={{ textShadow: "0 1px 0 rgba(255,255,255,.55), 0 -1px 0 rgba(42,29,18,.15)" }}
        >
          Crypto Hunt
        </h1>
        <svg width="220" height="14" viewBox="0 0 220 14" aria-hidden="true" className="mt-3">
          <path d="M0 7 H92 M128 7 H220" stroke="#6E4A2A" strokeWidth="1" />
          <path d="M110 1 L117 7 L110 13 L103 7Z" fill="#8E1B1B" />
          <circle cx="96" cy="7" r="2" fill="#6E4A2A" />
          <circle cx="124" cy="7" r="2" fill="#6E4A2A" />
        </svg>

        <div className="ch-sheet mt-[26px] flex w-full flex-col gap-[18px] rounded-2xl px-[18px] pt-[22px] pb-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="nm" className="font-display text-[15px] tracking-[.14em] text-sepia-ink">
              {returning ? "TEAM LEAD'S NAME" : "YOUR NAME (TEAM LEAD)"}
            </label>
            <input
              id="nm"
              className="ch-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="nickname"
              maxLength={40}
              enterKeyHint="next"
            />
          </div>
          <KeyInput label="Team code" value={code} onChange={setCode} size="sm" />

          {crew && (
            <div aria-live="polite" className="text-sm font-semibold text-[#3C5A2D]">
              {returning ? `${crew.name} already has its lead. Type that name to log back in.` : `${crew.name} found. Fill in your crew.`}
            </div>
          )}
          {!returning && (
            <>
              <div className="flex flex-col gap-2">
                <label htmlFor="team" className="font-display text-[15px] tracking-[.14em] text-sepia-ink">
                  TEAM NAME
                </label>
                <input
                  id="team"
                  className="ch-field"
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  autoComplete="off"
                  maxLength={24}
                  enterKeyHint="next"
                />
              </div>
              {mates.map((m, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <label htmlFor={`mate-${i}`} className="font-display text-[15px] tracking-[.14em] text-sepia-ink">
                    TEAMMATE {i + 1}
                  </label>
                  <input
                    id={`mate-${i}`}
                    className="ch-field"
                    value={m}
                    onChange={(e) => setMates((all) => all.map((x, k) => (k === i ? e.target.value : x)))}
                    autoComplete="off"
                    maxLength={40}
                    enterKeyHint="next"
                  />
                </div>
              ))}
            </>
          )}
          {error && (
            <p role="alert" className="m-0 text-[15px] font-semibold text-wax">
              {error}
            </p>
          )}
        </div>

        <div className="min-h-6 flex-1" />
        <button className="ch-wax h-[62px] w-full rounded-[14px] text-2xl" type="submit" disabled={busy}>
          {busy ? "Signing the roll…" : returning ? "Log back in" : "Join the hunt"}
        </button>
        <p className="mx-2 mt-4 mb-0 text-center text-sm leading-[1.45] text-sepia-ink">
          Only this phone plays for your crew. Your teammates help you in person.
        </p>
      </form>
    </main>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { KeyInput } from "@/components/ui";
import { joinCrew, previewCrew, type CrewPreview } from "@/lib/player/api";
import { messageFor } from "@/lib/player/messages";
import { Compass, Grain } from "../parts";

/** 01 · Join (docs/design/screens/Main.dc.html, T-301). */
export function JoinScreen({ reason, onJoined }: { reason: string | null; onJoined: () => void }) {
  const [name, setName] = useState("");
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
    if (name.trim().length < 2) return setError(messageFor("BAD_NAME"));
    if (code.length !== 6) return setError("Type your crew's 6-character code.");
    setBusy(true);
    setError(null);
    const r = await joinCrew(name.trim(), code);
    setBusy(false);
    if (r.ok) onJoined();
    else setError(messageFor(r.code));
  };

  const aboard = crew?.members ?? [];
  const mine = name.trim() ? name.trim()[0]!.toUpperCase() : "";

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
          A LIVE HUNT FOR CREWS OF FOUR
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
              YOUR NAME
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
            <div
              aria-live="polite"
              className="flex items-center gap-3 rounded-xl px-3.5 py-3"
              style={{
                background: "linear-gradient(180deg, rgba(75,107,58,.14), rgba(75,107,58,.06))",
                boxShadow: "inset 0 0 0 1px rgba(75,107,58,.4)",
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="font-display text-xl leading-[1.1]">{crew.name}</div>
                <div className="text-sm font-semibold text-[#3C5A2D]">
                  Crew found · {aboard.length} of 4 aboard
                </div>
              </div>
              <div className="flex gap-[5px]">
                {[0, 1, 2, 3].map((i) =>
                  i < aboard.length ? (
                    <div key={i} className="ch-seal" style={{ width: 30, height: 30, fontSize: 13 }}>
                      {aboard[i]}
                    </div>
                  ) : (
                    <div
                      key={i}
                      className="ch-slot"
                      data-me={i === aboard.length ? "" : undefined}
                      style={{ width: 30, height: 30, fontSize: 12 }}
                    >
                      {i === aboard.length ? mine : ""}
                    </div>
                  ),
                )}
              </div>
            </div>
          )}
          {error && (
            <p role="alert" className="m-0 text-[15px] font-semibold text-wax">
              {error}
            </p>
          )}
        </div>

        <div className="min-h-6 flex-1" />
        <button className="ch-wax h-[62px] w-full rounded-[14px] text-2xl" type="submit" disabled={busy}>
          {busy ? "Signing the roll…" : "Join the crew"}
        </button>
        <p className="mx-2 mt-4 mb-0 text-center text-sm leading-[1.45] text-sepia-ink">
          The crew locks when the fourth hand signs. You&apos;ll stay signed in on this phone.
        </p>
      </form>
    </main>
  );
}

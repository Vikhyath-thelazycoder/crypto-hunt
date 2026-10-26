// Pieces shared by the player screens, drawn as in docs/design/screens.
import type { CSSProperties, ReactNode } from "react";
import { initials, roman } from "@/lib/player/format";
import type { Member } from "@/lib/player/types";

/** Paper grain over parchment grounds. */
export function Grain({ opacity = 0.38 }: { opacity?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ mixBlendMode: "multiply", opacity }}
    >
      <filter id="ch-grain">
        <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves={2} stitchTiles="stitch" />
        <feColorMatrix values="0 0 0 0 .42  0 0 0 0 .29  0 0 0 0 .16  0 0 0 .5 0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#ch-grain)" />
    </svg>
  );
}

/** Parchment screen frame: grain + a padded column filling the phone. */
export function Paper({
  children,
  gap = 14,
  style,
}: {
  children: ReactNode;
  gap?: number;
  style?: CSSProperties;
}) {
  return (
    <main className="ch-paper relative flex min-h-full flex-col overflow-hidden text-ink" style={style}>
      <Grain />
      <div className="relative flex flex-1 flex-col px-4 pt-[18px] pb-5" style={{ gap }}>
        {children}
      </div>
    </main>
  );
}

export function CrewSeal({ name, size = 42, font = 17 }: { name: string; size?: number; font?: number }) {
  return (
    <div className="ch-seal flex-none" style={{ width: size, height: size, fontSize: font }}>
      {initials(name)}
    </div>
  );
}

export function RoundMark({ round, total }: { round: number; total: number }) {
  return (
    <div className="text-right">
      <div className="font-display text-xs tracking-[.2em] text-sepia-ink">ROUND</div>
      <div className="font-display text-[30px] leading-[.9]">
        {roman(round)}
        <span className="text-base text-sepia"> / {roman(total)}</span>
      </div>
    </div>
  );
}

export function CrewHeader({ team, sub, right }: { team: string; sub: string; right?: ReactNode }) {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <CrewSeal name={team} />
        <div>
          <div className="font-display text-[19px] leading-[1.1]">{team}</div>
          <div className="font-mono text-xs tracking-[.08em] text-sepia-ink">{sub}</div>
        </div>
      </div>
      {right}
    </header>
  );
}

const STEPS = ["Solve", "Seek", "Check in"] as const;

/** Solve — Seek — Check in, with the current step lit (Solve mockup). */
export function PhaseNav({ step }: { step: 0 | 1 | 2 }) {
  return (
    <nav aria-label="Round phase" className="flex items-center gap-2">
      {STEPS.map((label, i) => (
        <span key={label} className="contents">
          {i > 0 && (
            <span
              className="h-px flex-1"
              style={{ background: "repeating-linear-gradient(90deg, #6E4A2A 0 4px, transparent 4px 8px)" }}
            />
          )}
          <span className="flex items-center gap-1.5" aria-current={i === step ? "step" : undefined}>
            {i === step ? (
              <span
                className="h-3 w-3 rounded-full"
                style={{
                  background: "radial-gradient(circle at 35% 30%, #C9493C, #6E1010)",
                  boxShadow: "0 0 0 3px rgba(142,27,27,.18)",
                }}
              />
            ) : (
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  border: "1.5px solid #6E4A2A",
                  background: i < step ? "#6E4A2A" : undefined,
                }}
              />
            )}
            <span
              className="font-display text-[15px]"
              style={{
                color: i === step ? "#8E1B1B" : "#5E3D20",
                letterSpacing: i === step ? ".08em" : undefined,
              }}
            >
              {label}
            </span>
          </span>
        </span>
      ))}
    </nav>
  );
}

const Check = ({ size = 26 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#F6E2C6"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

const TILT = ["-8deg", "6deg", "-3deg", "4deg"];

/** The crew's four check-in seals (Check in mockup). */
export function CrewSeals({ members, size = 54 }: { members: Member[]; size?: number }) {
  return (
    <section aria-label="Crew check-in" className="ch-panel" style={{ padding: "14px 12px" }}>
      <div className="grid grid-cols-4 gap-1.5 text-center">
        {members.map((m, i) => (
          <div key={m.id} className="flex flex-col items-center gap-1.5">
            {m.checked_in ? (
              <div
                className="ch-seal ch-stamp"
                style={{
                  width: size,
                  height: size,
                  ["--r" as string]: TILT[i % 4],
                  transform: `rotate(${TILT[i % 4]})`,
                }}
                aria-label={`${m.name} sealed`}
              >
                <Check size={Math.round(size * 0.48)} />
              </div>
            ) : (
              <div
                className="ch-slot font-display"
                data-me={m.me ? "" : undefined}
                style={{
                  width: size,
                  height: size,
                  fontSize: Math.round(size * 0.4),
                  opacity: m.is_active ? 1 : 0.4,
                }}
                aria-label={`${m.name} ${m.is_active ? "not sealed yet" : "inactive"}`}
              >
                {initials(m.name, 1)}
              </div>
            )}
            <div
              className="text-[15px] font-semibold"
              style={{ color: m.me && !m.checked_in ? "#8E1B1B" : undefined }}
            >
              {m.me ? "You" : m.name}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Brass compass rose (Join mockup). */
export function Compass({ size = 150 }: { size?: number }) {
  return (
    <svg
      viewBox="-100 -100 200 200"
      width={size}
      height={size}
      aria-hidden="true"
      style={{
        filter: "drop-shadow(0 14px 16px rgba(42,29,18,.45)) drop-shadow(0 2px 2px rgba(42,29,18,.35))",
      }}
    >
      <defs>
        <radialGradient id="ch-ring" cx="38%" cy="28%" r="85%">
          <stop offset="0" stopColor="#FBEAB4" />
          <stop offset=".4" stopColor="#D2A443" />
          <stop offset=".75" stopColor="#8A6414" />
          <stop offset="1" stopColor="#4E370A" />
        </radialGradient>
        <radialGradient id="ch-face" cx="42%" cy="36%" r="75%">
          <stop offset="0" stopColor="#FDF7E6" />
          <stop offset="1" stopColor="#D9C08E" />
        </radialGradient>
        <g id="ch-maj">
          <path d="M0,-72 L10,-10 L0,0Z" fill="#2A1D12" />
          <path d="M0,-72 L-10,-10 L0,0Z" fill="#F6EDD6" stroke="#2A1D12" strokeWidth=".9" />
        </g>
        <g id="ch-min">
          <path d="M0,-50 L6,-6 L0,0Z" fill="#6E4A2A" />
          <path d="M0,-50 L-6,-6 L0,0Z" fill="#F1E5C8" stroke="#6E4A2A" strokeWidth=".7" />
        </g>
      </defs>
      <circle r="97" fill="url(#ch-ring)" />
      <circle r="85" fill="#3E2C08" opacity=".55" />
      <circle r="83" fill="url(#ch-face)" />
      <circle r="76" fill="none" stroke="#6E4A2A" strokeWidth=".8" />
      <circle r="72" fill="none" stroke="#6E4A2A" strokeWidth=".6" strokeDasharray="1.2 3.2" />
      {[45, 135, 225, 315].map((r) => (
        <use key={r} href="#ch-min" transform={`rotate(${r})`} />
      ))}
      {[90, 180, 270].map((r) => (
        <use key={r} href="#ch-maj" transform={`rotate(${r})`} />
      ))}
      <path d="M0,-72 L10,-10 L0,0Z" fill="#7A1515" />
      <path d="M0,-72 L-10,-10 L0,0Z" fill="#C9493C" />
      <circle r="7" fill="url(#ch-ring)" stroke="#4E370A" strokeWidth="1" />
      <text y="-79" textAnchor="middle" fontFamily="var(--font-fell), serif" fontSize="13" fill="#F8EBC4">
        N
      </text>
    </svg>
  );
}

/** A short message over the screen (scan results, wrong answers). */
export function Toast({
  text,
  tone = "ink",
  onClose,
}: {
  text: string;
  tone?: "ink" | "wax" | "moss";
  onClose: () => void;
}) {
  const bg = { ink: "#2A1D12", wax: "#8E1B1B", moss: "#3F5F30" }[tone];
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
      <div
        role="status"
        aria-live="assertive"
        className="pointer-events-auto flex max-w-[420px] items-start gap-3 rounded-xl px-4 py-3 text-[15px] leading-snug text-[#F7E9C8]"
        style={{ background: bg, boxShadow: "0 12px 26px -10px rgba(0,0,0,.7)" }}
      >
        <span className="flex-1">{text}</span>
        <button type="button" onClick={onClose} aria-label="Dismiss" className="-m-1 p-1 text-[#F7E9C8]/80">
          ✕
        </button>
      </div>
    </div>
  );
}

export const LockIcon = ({ color = "#5E3D20", size = 20 }: { color?: string; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="1.8"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

export const ScanIcon = ({ color = "#F7E9C8", size = 24 }: { color?: string; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="1.8"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16" />
  </svg>
);

export const CaptainNote = ({ text }: { text: string }) => (
  <section
    aria-live="polite"
    className="relative rounded-[4px] py-4 pr-[18px] pl-[58px]"
    style={{
      background: "linear-gradient(180deg, #F3E7CA 0%, #E8D6AC 100%)",
      boxShadow: "0 0 0 1px rgba(110,74,42,.35), 0 10px 18px -12px rgba(42,29,18,.6)",
    }}
  >
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#8E1B1B"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="absolute top-4 left-4"
    >
      <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" />
      <path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12" />
    </svg>
    <div className="font-display text-[13px] tracking-[.18em] text-wax">FROM THE CAPTAIN</div>
    <div className="mt-0.5 text-[17px] leading-[1.4]">{text}</div>
  </section>
);

/** Clue text: `like this` parts show as code (clue sets mix in small coding twists, T-503). */
export function ClueText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, i) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
          <code key={i} className="rounded bg-[rgba(42,29,18,.1)] px-1 font-mono text-[.88em] not-italic [overflow-wrap:anywhere]">
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

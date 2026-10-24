import type { ReactNode } from "react";

type Tone = "ink" | "wax" | "moss" | "gold";

const toneClass: Record<Tone, string> = {
  ink: "text-ink",
  wax: "text-wax",
  moss: "text-moss",
  gold: "text-[#7A5A12]",
};

/**
 * The one big state word every player screen leads with ("SOLVE", "SEALED", "PENALTY"...).
 * Announced politely so screen readers hear each state change (DESIGN.md › Accessibility).
 */
export function StateWord({ children, tone = "wax" }: { children: ReactNode; tone?: Tone }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={`m-0 font-display text-base tracking-[.34em] uppercase ${toneClass[tone]}`}
    >
      {children}
    </p>
  );
}

import type { HTMLAttributes, ReactNode } from "react";

type Props = HTMLAttributes<HTMLElement> & {
  /** Names the region for screen readers (e.g. "Crew check-in"). */
  label?: string;
  children: ReactNode;
};

/** Inked panel on parchment, as in the Check in and Penalty mockups. */
export function ParchmentPanel({ label, className = "", children, ...rest }: Props) {
  return (
    <section aria-label={label} className={`ch-panel ${className}`.trim()} {...rest}>
      {children}
    </section>
  );
}

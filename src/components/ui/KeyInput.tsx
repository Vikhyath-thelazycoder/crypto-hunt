"use client";

import { useId, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { KEY_LENGTH, normalizeKey } from "@/lib/keys";

type Props = {
  /** Visible label above the boxes, e.g. "Secret key" or "Crew seal code". */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Called once all boxes are filled. */
  onComplete?: (value: string) => void;
  /** "gold" marks the crew seal code on the final mark. */
  tone?: "plain" | "gold";
  /** "sm" is the Join screen's team-code boxes. */
  size?: "md" | "sm";
  disabled?: boolean;
  describedBy?: string;
};

/** Six large boxes: auto-advance, backspace goes back, paste fills all, look-alike characters ignored. */
export function KeyInput({
  label,
  value,
  onChange,
  onComplete,
  tone = "plain",
  size = "md",
  disabled,
  describedBy,
}: Props) {
  const labelId = useId();
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const chars = value.padEnd(KEY_LENGTH, " ").slice(0, KEY_LENGTH).split("");

  const commit = (next: string) => {
    const clean = normalizeKey(next).slice(0, KEY_LENGTH);
    onChange(clean);
    if (clean.length === KEY_LENGTH) onComplete?.(clean);
    return clean;
  };

  const focus = (i: number) => boxes.current[Math.max(0, Math.min(KEY_LENGTH - 1, i))]?.focus();

  // Typing (or a phone's autofill) writes from this box onward; a box past the end writes at the end.
  const typeAt = (i: number, raw: string) => {
    const typed = normalizeKey(raw);
    if (!typed) return;
    const start = Math.min(i, value.length);
    commit(value.slice(0, start) + typed + value.slice(start + typed.length));
    focus(start + typed.length);
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const cut = value.length > i ? i : i - 1;
      if (cut < 0) return;
      commit(value.slice(0, cut));
      focus(cut);
    } else if (e.key === "ArrowLeft") {
      focus(i - 1);
    } else if (e.key === "ArrowRight") {
      focus(i + 1);
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const clean = commit(e.clipboardData.getData("text"));
    focus(clean.length);
  };

  return (
    <div>
      <div id={labelId} className="mb-2 font-display text-[15px] tracking-[.16em] text-sepia-ink uppercase">
        {label}
      </div>
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        className="flex justify-between gap-1"
      >
        {chars.map((c, i) => (
          <input
            key={i}
            ref={(el) => {
              boxes.current[i] = el;
            }}
            className="ch-kbox"
            data-tone={tone === "gold" ? "gold" : undefined}
            data-size={size === "sm" ? "sm" : undefined}
            aria-label={`${label} character ${i + 1}`}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={KEY_LENGTH}
            disabled={disabled}
            value={c.trim()}
            onChange={(e) => typeAt(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={onPaste}
            onFocus={(e) => e.target.select()}
          />
        ))}
      </div>
    </div>
  );
}

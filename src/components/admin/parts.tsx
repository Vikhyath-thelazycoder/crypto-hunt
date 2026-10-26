"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AdminError, signOutAdmin } from "@/lib/admin/api";
import { adminMessage } from "@/lib/admin/messages";

/** The brass compass of the captain's table header. */
export function Compass({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-20 -20 40 40" aria-hidden="true">
      <circle r="19" fill="#B88A1E" />
      <circle r="15" fill="#2A1A0F" />
      <path d="M0,-13 L3,0 L0,2 L-3,0Z" fill="#C9493C" />
      <path d="M0,13 L3,0 L0,-2 L-3,0Z" fill="#EADBB8" />
    </svg>
  );
}

const NAV = [
  { href: "/admin", label: "Live" },
  { href: "/admin/generator", label: "Generator" },
  { href: "/admin/locations", label: "Locations" },
  { href: "/admin/crews", label: "Crews" },
  { href: "/admin/questions", label: "Questions" },
  { href: "/admin/log", label: "Log" },
];

/** Leather header of every admin page (Generator.dc.html, MapEditor.dc.html). `bar` adds the control row. */
export function AdminHeader({ right, bar }: { right?: ReactNode; bar?: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const signOut = async () => {
    await signOutAdmin();
    router.replace("/admin/login");
    router.refresh();
  };
  return (
    <header className="ch-leather sticky top-0 z-30 flex flex-col gap-3 px-7 py-3.5">
      <div className="flex flex-wrap items-center gap-x-[22px] gap-y-3">
        <div className="flex items-center gap-3">
          <Compass />
          <div>
            <div className="font-display text-[22px] leading-none text-[#F3E6C8]">Crypto Hunt</div>
            <div className="text-[13px] text-[#BFA77F]">Captain&apos;s table</div>
          </div>
        </div>
        <nav aria-label="Admin sections" className="flex flex-wrap gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="ch-nav"
              aria-current={(n.href === "/admin" ? path === "/admin" : path?.startsWith(n.href)) ? "page" : undefined}
            >
              {n.label}
            </Link>
          ))}
          {/* The audience view (P7) in its own tab, to drag onto the projector and make full screen. */}
          <a href="/screen" target="_blank" rel="noopener" className="ch-nav" aria-label="Projector (opens in a new tab)">
            Projector ↗
          </a>
        </nav>
        <div className="flex-1" />
        {right}
        <button
          type="button"
          onClick={signOut}
          className="cursor-pointer border-0 bg-transparent p-1 text-sm font-semibold text-[#BFA77F] underline-offset-4 hover:underline"
        >
          Sign out
        </button>
      </div>
      {bar}
    </header>
  );
}

/** The page body of an admin page: chart table, header, content. */
export function AdminPage({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <div className="ch-admin">
      {header}
      <main>{children}</main>
    </div>
  );
}

export function Toggle({
  on,
  label,
  onChange,
  disabled,
}: {
  on: boolean;
  label: string;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="ch-toggle cursor-pointer border-0 p-0 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span />
    </button>
  );
}

export type Say = (text: string, tone?: "ink" | "wax" | "moss") => void;

/** A short notice in the corner (actions done, refusals in plain words). */
export function useToast() {
  const [toast, setToast] = useState<{ text: string; tone: "ink" | "wax" | "moss"; id: number } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);
  const say: Say = (text, tone = "ink") => setToast({ text, tone, id: Date.now() });
  const node = toast ? (
    <div
      key={toast.id}
      role={toast.tone === "wax" ? "alert" : "status"}
      className="fixed right-6 bottom-6 z-[70] max-w-[420px] rounded-xl px-4 py-3 text-[15px] leading-snug shadow-2xl"
      style={{
        color: toast.tone === "ink" ? "#2A1D12" : "#F7E9C8",
        background: toast.tone === "wax" ? "#7A1515" : toast.tone === "moss" ? "#3A552C" : "#EADBB8",
        boxShadow: "0 0 0 1px rgba(0,0,0,.35), 0 18px 30px -10px rgba(0,0,0,.8)",
      }}
    >
      {toast.text}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setToast(null)}
        className="ml-3 cursor-pointer border-0 bg-transparent p-0 text-current opacity-70"
      >
        ✕
      </button>
    </div>
  ) : null;
  return { say, toast: node };
}

/** Runs an admin action and turns a refusal into words. Returns true when it went through. */
export async function attempt(action: () => Promise<unknown>, say: Say, done?: string): Promise<boolean> {
  try {
    await action();
    if (done) say(done, "moss");
    return true;
  } catch (e) {
    const err = e instanceof AdminError ? e : new AdminError("SERVER");
    say(adminMessage(err.code, err.detail), "wax");
    return false;
  }
}

/** A modal on the chart table. Escape or the veil closes it. */
export function Modal({
  title,
  onClose,
  children,
  width = 460,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  // Once per opening: focus the first field, close on Escape.
  useEffect(() => {
    // A confirm opened from inside another dialog: Escape closes only the topmost one.
    const onKey = (e: KeyboardEvent) => {
      const open = document.querySelectorAll('[role="dialog"]');
      if (e.key === "Escape" && open[open.length - 1] === box.current) close.current();
    };
    document.addEventListener("keydown", onKey);
    const first = box.current?.querySelector<HTMLElement>("input, textarea, select, button");
    first?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="ch-modal-veil" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="ch-asheet w-full p-5"
        style={{ maxWidth: width }}
      >
        <h2 id={id} className="m-0 mb-3 font-display text-2xl font-normal">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

/**
 * Confirms an action (DESIGN.md › Interaction: destructive admin actions use a typed confirm). `reason` asks for
 * the audit reason (≥ 3 characters, SECURITY.md T13); `typed` asks the admin to type a word such as END.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  reason = false,
  reasonLabel = "REASON (GOES IN THE AUDIT LOG)",
  typed,
  children,
  onConfirm,
  onClose,
}: {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  reason?: boolean;
  reasonLabel?: string;
  typed?: string;
  children?: ReactNode;
  onConfirm: (reason: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [why, setWhy] = useState("");
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const reasonId = useId();
  const typedId = useId();
  const ok = (!reason || why.trim().length >= 3) && (!typed || word.trim().toUpperCase() === typed);
  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    const done = await onConfirm(why.trim());
    setBusy(false);
    if (done) onClose();
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {body && <div className="text-[15px] leading-normal text-[#4A2F18]">{body}</div>}
        {children}
        {reason && (
          <div>
            <label htmlFor={reasonId} className="ch-lbl mb-1.5">
              {reasonLabel}
            </label>
            <input
              id={reasonId}
              className="ch-inp"
              value={why}
              maxLength={200}
              onChange={(e) => setWhy(e.target.value)}
              placeholder="e.g. phone died"
            />
          </div>
        )}
        {typed && (
          <div>
            <label htmlFor={typedId} className="ch-lbl mb-1.5">
              TYPE {typed} TO CONFIRM
            </label>
            <input
              id={typedId}
              className="ch-inp font-mono"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              autoComplete="off"
            />
          </div>
        )}
        <div className="mt-1 flex gap-2.5">
          <button type="submit" className="ch-awax h-[46px] flex-1 rounded-[11px] text-base" disabled={!ok || busy}>
            {busy ? "Working…" : confirmLabel}
          </button>
          <button type="button" className="ch-plain h-[46px] rounded-[11px] px-4" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Loading / error states (DESIGN.md › Content states) on the chart table. */
export function Unrolling({ text = "Unrolling the map…" }: { text?: string }) {
  return (
    <p role="status" className="m-0 px-7 py-16 text-center font-display text-xl tracking-[.2em] text-[#BFA77F]">
      {text}
    </p>
  );
}

export function Trouble({ code, onRetry }: { code: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mx-auto my-16 max-w-[520px] px-7 text-center">
      <p className="m-0 text-lg text-[#F3E6C8]">{adminMessage(code)}</p>
      {onRetry && (
        <button type="button" className="ch-brass mt-4 h-10 rounded-[10px] px-4 text-[15px]" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function CheckIcon({ color = "#4B6B3A" }: { color?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: "none", marginTop: 1 }}
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function WarnIcon({ color = "#B88A1E" }: { color?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
      style={{ flex: "none", marginTop: 1 }}
    >
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4M12 17v.5" />
    </svg>
  );
}
